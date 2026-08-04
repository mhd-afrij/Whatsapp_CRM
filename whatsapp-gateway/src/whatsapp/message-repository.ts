import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { getMysqlPool } from '../lib/mysql';

export type MessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'sticker'
  | 'location'
  | 'contact_card'
  | 'template'
  | 'system'
  | 'unsupported';

export type MessageDirection = 'inbound' | 'outbound';
export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed';

export interface NormalizedInboundMessage {
  whatsappMessageId: string;
  waJid: string;
  pushName: string | null;
  messageType: MessageType;
  body: string | null;
  repliedToWhatsappMessageId?: string | null;
  media?: {
    mimeType: string;
    fileSizeBytes: number | null;
  } | null;
  sentAt: Date;
}

export interface MessageRow extends RowDataPacket {
  id: number;
  workspace_id: number;
  conversation_id: number;
  whatsapp_message_id: string;
  direction: MessageDirection;
  message_type: MessageType;
  body: string | null;
  status: MessageStatus;
}

/** Thrown by getMysqlPool() query paths on a unique-key violation (ER_DUP_ENTRY). */
export function isDuplicateEntryError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ER_DUP_ENTRY';
}

export class MessageRepository {
  private pool(): Pool {
    return getMysqlPool();
  }

  async findOrCreateWhatsappContact(
    workspaceId: number,
    waJid: string,
    pushName: string | null,
  ): Promise<{ id: number }> {
    const pool = this.pool();
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM whatsapp_contacts WHERE workspace_id = ? AND wa_jid = ? LIMIT 1',
      [workspaceId, waJid],
    );
    if (rows.length > 0) {
      if (pushName) {
        await pool.query(
          'UPDATE whatsapp_contacts SET push_name = COALESCE(?, push_name), last_seen_at = NOW(), updated_at = NOW() WHERE id = ?',
          [pushName, rows[0].id],
        );
      }
      return { id: rows[0].id as number };
    }

    const phoneNumber = waJid.split('@')[0] ?? null;
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO whatsapp_contacts (workspace_id, wa_jid, push_name, phone_number, last_seen_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, NOW(), NOW(), NOW())`,
      [workspaceId, waJid, pushName, phoneNumber],
    );
    return { id: result.insertId };
  }

  /** Resolves the conversation for a whatsapp_contact, creating it (gateway-owned columns only) if absent. */
  async findOrCreateConversation(
    workspaceId: number,
    whatsappContactId: number,
  ): Promise<{ id: number; created: boolean }> {
    const pool = this.pool();
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM conversations WHERE workspace_id = ? AND whatsapp_contact_id = ? LIMIT 1',
      [workspaceId, whatsappContactId],
    );
    if (rows.length > 0) {
      return { id: rows[0].id as number, created: false };
    }

    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO conversations
         (workspace_id, whatsapp_contact_id, status, unread_count, created_at, updated_at)
       VALUES (?, ?, 'open', 0, NOW(), NOW())`,
      [workspaceId, whatsappContactId],
    );
    return { id: result.insertId, created: true };
  }

  /**
   * Persists an inbound message transactionally: message row + conversation
   * last-message-summary update. Duplicate whatsapp_message_id is treated as
   * an idempotent no-op (caller catches via isDuplicateEntryError or this
   * resolves to null).
   */
  async insertInboundMessage(
    workspaceId: number,
    conversationId: number,
    normalized: NormalizedInboundMessage,
  ): Promise<{ messageId: number } | null> {
    const pool = this.pool();
    const conn: PoolConnection = await pool.getConnection();
    try {
      await conn.beginTransaction();

      let repliedToId: number | null = null;
      if (normalized.repliedToWhatsappMessageId) {
        const [repliedRows] = await conn.query<RowDataPacket[]>(
          'SELECT id FROM messages WHERE workspace_id = ? AND whatsapp_message_id = ? LIMIT 1',
          [workspaceId, normalized.repliedToWhatsappMessageId],
        );
        repliedToId = repliedRows.length > 0 ? (repliedRows[0].id as number) : null;
      }

      const [result] = await conn.query<ResultSetHeader>(
        `INSERT INTO messages
           (workspace_id, conversation_id, whatsapp_message_id, direction, sender_type,
            message_type, body, status, replied_to_message_id, sent_at, created_at, updated_at)
         VALUES (?, ?, ?, 'inbound', 'contact', ?, ?, 'sent', ?, ?, NOW(), NOW())`,
        [
          workspaceId,
          conversationId,
          normalized.whatsappMessageId,
          normalized.messageType,
          normalized.body,
          repliedToId,
          normalized.sentAt,
        ],
      );

      const preview = (normalized.body ?? `[${normalized.messageType}]`).slice(0, 255);
      await conn.query(
        `UPDATE conversations
         SET last_message_at = ?, last_message_preview = ?, unread_count = unread_count + 1, updated_at = NOW()
         WHERE id = ?`,
        [normalized.sentAt, preview, conversationId],
      );

      await conn.commit();
      return { messageId: result.insertId };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /** Persists an outbound (agent-sent) message row after a successful Baileys send. */
  async insertOutboundMessage(
    workspaceId: number,
    conversationId: number,
    params: {
      whatsappMessageId: string;
      body: string;
      repliedToWhatsappMessageId?: string | null;
    },
  ): Promise<{ messageId: number } | null> {
    const pool = this.pool();
    const conn: PoolConnection = await pool.getConnection();
    try {
      await conn.beginTransaction();

      let repliedToId: number | null = null;
      if (params.repliedToWhatsappMessageId) {
        const [repliedRows] = await conn.query<RowDataPacket[]>(
          'SELECT id FROM messages WHERE workspace_id = ? AND whatsapp_message_id = ? LIMIT 1',
          [workspaceId, params.repliedToWhatsappMessageId],
        );
        repliedToId = repliedRows.length > 0 ? (repliedRows[0].id as number) : null;
      }

      const [result] = await conn.query<ResultSetHeader>(
        `INSERT INTO messages
           (workspace_id, conversation_id, whatsapp_message_id, direction, sender_type,
            message_type, body, status, replied_to_message_id, sent_at, created_at, updated_at)
         VALUES (?, ?, ?, 'outbound', 'user', 'text', ?, 'sent', ?, NOW(), NOW(), NOW())`,
        [workspaceId, conversationId, params.whatsappMessageId, params.body, repliedToId],
      );

      const preview = params.body.slice(0, 255);
      await conn.query(
        `UPDATE conversations
         SET last_message_at = NOW(), last_message_preview = ?, updated_at = NOW()
         WHERE id = ?`,
        [preview, conversationId],
      );

      await conn.commit();
      return { messageId: result.insertId };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async insertMessageMedia(
    messageId: number,
    media: {
      mimeType: string;
      fileSizeBytes: number | null;
      storagePath: string;
      checksumSha256: string | null;
    },
  ): Promise<void> {
    const pool = this.pool();
    await pool.query(
      `INSERT INTO message_media (message_id, mime_type, file_size_bytes, storage_path, checksum_sha256, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
      [messageId, media.mimeType, media.fileSizeBytes, media.storagePath, media.checksumSha256],
    );
  }

  async insertMessageStatusEvent(
    messageId: number,
    status: MessageStatus,
    rawPayload: Record<string, unknown> | null = null,
  ): Promise<void> {
    const pool = this.pool();
    await pool.query(
      `INSERT INTO message_status_events (message_id, status, occurred_at, raw_payload, created_at)
       VALUES (?, ?, NOW(), ?, NOW())`,
      [messageId, status, rawPayload ? JSON.stringify(rawPayload) : null],
    );
  }

  async updateMessageStatus(messageId: number, status: MessageStatus): Promise<void> {
    const pool = this.pool();
    await pool.query('UPDATE messages SET status = ?, updated_at = NOW() WHERE id = ?', [
      status,
      messageId,
    ]);
  }

  async findMessageByWhatsappId(
    workspaceId: number,
    whatsappMessageId: string,
  ): Promise<MessageRow | null> {
    const pool = this.pool();
    const [rows] = await pool.query<MessageRow[]>(
      'SELECT * FROM messages WHERE workspace_id = ? AND whatsapp_message_id = ? LIMIT 1',
      [workspaceId, whatsappMessageId],
    );
    return rows[0] ?? null;
  }

  async findMessageById(messageId: number): Promise<MessageRow | null> {
    const pool = this.pool();
    const [rows] = await pool.query<MessageRow[]>('SELECT * FROM messages WHERE id = ? LIMIT 1', [
      messageId,
    ]);
    return rows[0] ?? null;
  }

  async getConversationJid(conversationId: number, workspaceId: number): Promise<string | null> {
    const pool = this.pool();
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT wc.wa_jid AS wa_jid
       FROM conversations c
       JOIN whatsapp_contacts wc ON wc.id = c.whatsapp_contact_id
       WHERE c.id = ? AND c.workspace_id = ? LIMIT 1`,
      [conversationId, workspaceId],
    );
    return rows.length > 0 ? (rows[0].wa_jid as string) : null;
  }

  /** Looks up a message_media row by id, scoped to workspace via its parent message. */
  async findMessageMediaById(
    workspaceId: number,
    mediaId: number,
  ): Promise<{ id: number; message_id: number; storage_path: string; mime_type: string } | null> {
    const pool = this.pool();
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT mm.id, mm.message_id, mm.storage_path, mm.mime_type
       FROM message_media mm
       JOIN messages m ON m.id = mm.message_id
       WHERE mm.id = ? AND m.workspace_id = ? LIMIT 1`,
      [mediaId, workspaceId],
    );
    return rows.length > 0
      ? {
          id: rows[0].id as number,
          message_id: rows[0].message_id as number,
          storage_path: rows[0].storage_path as string,
          mime_type: rows[0].mime_type as string,
        }
      : null;
  }

  async recordProcessingFailure(
    workspaceId: number,
    stage: 'validation' | 'send' | 'media_download' | 'persist',
    errorMessage: string,
    context: Record<string, unknown> = {},
    opts: { dispatchQueueId?: number | null; conversationId?: number | null } = {},
  ): Promise<void> {
    const pool = this.pool();
    await pool.query(
      `INSERT INTO message_processing_failures
         (workspace_id, message_dispatch_queue_id, conversation_id, stage, error_message, error_context, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        workspaceId,
        opts.dispatchQueueId ?? null,
        opts.conversationId ?? null,
        stage,
        errorMessage,
        JSON.stringify(context),
      ],
    );
  }
}
