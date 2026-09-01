import type { PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { query, execute, transaction } from '../lib/mysql';

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
  delivered_at: string | null;
  read_at: string | null;
}

/** Thrown by getMysqlPool() query paths on a unique-key violation (ER_DUP_ENTRY). */
export function isDuplicateEntryError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ER_DUP_ENTRY';
}

export class MessageRepository {
  /**
   * Finds (or creates) the whatsapp_contact for an inbound/outbound jid.
   *
   * WhatsApp LID (Linked ID) jids are the privacy-preserving identity used by
   * contacts whose phone-number privacy is on: the inbound `remoteJid` is an
   * opaque `@lid` value (e.g. "176974261706752@lid") whose numeric part is NOT
   * the contact's real phone number. Two critical consequences:
   *   - looking the row up by wa_jid alone splits one person into two rows
   *     (PN row created when the business messaged them, LID row created when
   *     they replied) and the backend then fabricates a duplicate CRM contact
   *     from the fake "phone" number;
   *   - a LID value must never be stored as `phone_number`.
   *
   * So LID jids are resolved through the `lid_jid` alias column (populated by
   * setLidJid() from Baileys' contacts.upsert / chats.phoneNumberShare) to the
   * canonical PN row. When no mapping is known yet the LID row is kept as its
   * own identity (with a NULL phone_number) so the message is still persisted;
   * the backend's ContactAutoLinker refuses to create CRM contacts from @lid
   * rows, so no junk contact is produced.
   */
  async findOrCreateWhatsappContact(
    workspaceId: number,
    waJid: string,
    pushName: string | null,
  ): Promise<{ id: number }> {
    const isLidJid = waJid.endsWith('@lid');

    if (isLidJid) {
      // Resolve the privacy alias to the canonical PN row. The mapping lives on
      // the PN row (lid_jid set by setLidJid from contacts.upsert /
      // chats.phoneNumberShare) - LID rows never carry a self-referencing
      // lid_jid, so this query only ever matches a real phone-number row.
      const [lidRows] = await query<RowDataPacket[]>(
        'SELECT id, wa_jid FROM whatsapp_contacts WHERE workspace_id = ? AND lid_jid = ? LIMIT 1',
        [workspaceId, waJid],
      );
      if (lidRows.length > 0) {
        const canonicalWaJid = (lidRows[0].wa_jid as string | null) ?? null;
        if (canonicalWaJid && !canonicalWaJid.endsWith('@lid') && canonicalWaJid !== waJid) {
          // Route to the canonical PN row (recursion terminates because the
          // canonical jid is not a @lid).
          return this.findOrCreateWhatsappContact(workspaceId, canonicalWaJid, pushName);
        }
      }
    }

    const [rows] = await query<RowDataPacket[]>(
      'SELECT id FROM whatsapp_contacts WHERE workspace_id = ? AND wa_jid = ? LIMIT 1',
      [workspaceId, waJid],
    );
    if (rows.length > 0) {
      if (pushName) {
        await execute(
          'UPDATE whatsapp_contacts SET push_name = COALESCE(?, push_name), last_seen_at = NOW(), updated_at = NOW() WHERE id = ?',
          [pushName, rows[0].id],
        );
      }
      return { id: rows[0].id as number };
    }

    const phoneNumber = isLidJid ? null : waJid.split('@')[0] ?? null;

    // Phone-number fallback: the exact wa_jid didn't match, but the phone
    // number is the real-world identity. A row may already exist for this
    // person under a different jid (legacy rows, format drift) - reusing it
    // (and healing the jid to the canonical form) keeps one person in one
    // whatsapp_contact/conversation instead of splitting them into two. The
    // backend's ContactAutoLinker matches CRM contacts by the same normalized
    // phone, so this is the gateway side of the same dedup rule.
    const isGroupJid = waJid.endsWith('@g.us');
    // Group chats have no real phone number (the jid digits are a group id) -
    // never run or match the phone fallback for them.
    if (!isLidJid && !isGroupJid && phoneNumber) {
      const [phoneRows] = await query<RowDataPacket[]>(
        `SELECT id, wa_jid FROM whatsapp_contacts
         WHERE workspace_id = ? AND phone_number = ? AND wa_jid != ? AND wa_jid NOT LIKE '%@lid' AND wa_jid NOT LIKE '%@g.us'
         LIMIT 1`,
        [workspaceId, phoneNumber, waJid],
      );
      if (phoneRows.length > 0) {
        await execute(
          `UPDATE whatsapp_contacts
           SET wa_jid = ?, push_name = COALESCE(?, push_name), last_seen_at = NOW(), updated_at = NOW()
           WHERE id = ?`,
          [waJid, pushName, phoneRows[0].id],
        );
        return { id: phoneRows[0].id as number };
      }
    }

    // Never persist a LID number as a phone number - it is not dialable and
    // would poison the backend's phone-based dedup matching. LID rows are
    // kept as their own identity (NULL phone, NULL lid_jid) until WhatsApp
    // shares the lid -> phone mapping; the backend's ContactAutoLinker
    // refuses to create CRM contacts from @lid rows, so no junk contact is
    // produced in the meantime.
    const result = await execute(
      `INSERT INTO whatsapp_contacts (workspace_id, wa_jid, push_name, phone_number, lid_jid, last_seen_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, NOW(), NOW(), NOW())`,
      [workspaceId, waJid, pushName, phoneNumber],
    );
    return { id: result.insertId };
  }

  /**
   * Persists the WhatsApp LID (Linked ID) -> phone-number jid mapping, sourced
   * from Baileys' `contacts.upsert` (Contact.jid/lid) and `chats.phoneNumberShare`
   * ({ lid, jid }). Keeps the canonical PN row keyed by wa_jid with lid_jid
   * set, and re-keys conversations that were stranded on a LID-only row onto
   * the PN row so replies to a business-initiated thread land in the same chat.
   * The stale LID row is left in place (contacts/message_reactions FK rows make
   * a delete unsafe here) - cleanup of orphan rows is handled out-of-band.
   */
  async setLidJid(workspaceId: number, waJid: string, lidJid: string): Promise<void> {
    if (!lidJid.endsWith('@lid')) {
      return;
    }

    const [lidRows] = await query<RowDataPacket[]>(
      'SELECT id FROM whatsapp_contacts WHERE workspace_id = ? AND wa_jid = ? LIMIT 1',
      [workspaceId, lidJid],
    );

    const [pnRows] = await query<RowDataPacket[]>(
      'SELECT id FROM whatsapp_contacts WHERE workspace_id = ? AND wa_jid = ? LIMIT 1',
      [workspaceId, waJid],
    );
    let pnId: number;
    if (pnRows.length > 0) {
      pnId = pnRows[0].id as number;
      await execute(
        'UPDATE whatsapp_contacts SET lid_jid = ?, updated_at = NOW() WHERE id = ?',
        [lidJid, pnId],
      );
    } else {
      const phoneNumber = waJid.split('@')[0] ?? null;
      const result = await execute(
        `INSERT INTO whatsapp_contacts (workspace_id, wa_jid, lid_jid, phone_number, created_at, updated_at)
         VALUES (?, ?, ?, ?, NOW(), NOW())`,
        [workspaceId, waJid, lidJid, phoneNumber],
      );
      pnId = result.insertId;
    }

    // Re-key conversations stranded on a LID-only row onto the canonical PN
    // row so the thread is unified; skip when the alias row is the same row.
    if (lidRows.length === 0 || lidRows[0].id === pnId) {
      return;
    }
    const lidId = lidRows[0].id as number;

    const [pnConvs] = await query<RowDataPacket[]>(
      'SELECT id FROM conversations WHERE workspace_id = ? AND whatsapp_contact_id = ? LIMIT 1',
      [workspaceId, pnId],
    );
    const [lidConvs] = await query<RowDataPacket[]>(
      'SELECT id FROM conversations WHERE workspace_id = ? AND whatsapp_contact_id = ?',
      [workspaceId, lidId],
    );

    if (pnConvs.length === 0) {
      // No thread on the PN row yet - move the whole conversation over.
      await execute(
        'UPDATE conversations SET whatsapp_contact_id = ?, updated_at = NOW() WHERE workspace_id = ? AND whatsapp_contact_id = ?',
        [pnId, workspaceId, lidId],
      );
      return;
    }

    // A thread already exists on the PN row (typical when the business messaged
    // the number first and the reply came back through the LID) - fold the
    // stranded conversation's messages into it instead of leaving a duplicate
    // thread. Both messages and conversations are gateway-owned, so this stays
    // within the ownership boundary; the CRM-owned columns (contact_id, status,
    // ...) of the orphaned row are discarded with it (the PN conversation keeps
    // its own, which the backend links to the saved contact).
    const targetId = pnConvs[0].id as number;
    for (const conv of lidConvs) {
      const sourceId = conv.id as number;
      await execute('UPDATE messages SET conversation_id = ?, updated_at = NOW() WHERE conversation_id = ?', [
        targetId,
        sourceId,
      ]);
      await execute(
        `UPDATE conversations
         SET last_message_at = GREATEST(COALESCE(last_message_at, '1970-01-01'), COALESCE((SELECT MAX(sent_at) FROM messages WHERE conversation_id = ?), last_message_at)),
             last_message_preview = COALESCE((SELECT body FROM messages WHERE conversation_id = ? ORDER BY sent_at DESC LIMIT 1), last_message_preview),
             unread_count = unread_count + (SELECT COUNT(*) FROM messages WHERE conversation_id = ? AND direction = 'inbound' AND status = 'sent'),
             updated_at = NOW()
         WHERE id = ?`,
        [targetId, targetId, targetId, targetId],
      );
      await execute('DELETE FROM conversations WHERE id = ?', [sourceId]);
    }
  }

  /**
   * Persists the saved (address-book) display name for a contact from Baileys'
   * `contacts.upsert` events into `whatsapp_contacts.contact_name`, upserting by
   * the (workspace_id, wa_jid) unique key. The saved name is the one the user
   * gave the number in their phone book - preferred over the push/profile name.
   */
  async upsertContactName(workspaceId: number, waJid: string, contactName: string): Promise<void> {
    const phoneNumber = waJid.split('@')[0] ?? null;
    await execute(
      `INSERT INTO whatsapp_contacts (workspace_id, wa_jid, contact_name, phone_number, created_at, updated_at)
       VALUES (?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE contact_name = VALUES(contact_name), updated_at = NOW()`,
      [workspaceId, waJid, contactName, phoneNumber],
    );
  }

  /** Resolves the conversation for a whatsapp_contact, creating it (gateway-owned columns only) if absent. */
  async findOrCreateConversation(
    workspaceId: number,
    whatsappContactId: number,
  ): Promise<{ id: number; created: boolean }> {
    const [rows] = await query<RowDataPacket[]>(
      'SELECT id FROM conversations WHERE workspace_id = ? AND whatsapp_contact_id = ? LIMIT 1',
      [workspaceId, whatsappContactId],
    );
    if (rows.length > 0) {
      return { id: rows[0].id as number, created: false };
    }

    const result = await execute(
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
    return transaction(async (conn: PoolConnection) => {
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

      return { messageId: result.insertId };
    });
  }

  /**
   * Persists an outbound (agent-sent) message row. Defaults to `sent` (the
   * original post-send path) but the send worker now inserts with `queued`
   * BEFORE the Baileys send, so a message against a flaky session is still
   * saved and visible; the row is later flipped to `sent`/`failed`.
   */
  async insertOutboundMessage(
    workspaceId: number,
    conversationId: number,
    params: {
      whatsappMessageId: string;
      body: string | null;
      messageType?: string;
      repliedToWhatsappMessageId?: string | null;
      status?: MessageStatus;
    },
  ): Promise<{ messageId: number } | null> {
    return transaction(async (conn: PoolConnection) => {
      let repliedToId: number | null = null;
      if (params.repliedToWhatsappMessageId) {
        const [repliedRows] = await conn.query<RowDataPacket[]>(
          'SELECT id FROM messages WHERE workspace_id = ? AND whatsapp_message_id = ? LIMIT 1',
          [workspaceId, params.repliedToWhatsappMessageId],
        );
        repliedToId = repliedRows.length > 0 ? (repliedRows[0].id as number) : null;
      }

      const messageType = params.messageType ?? 'text';
      const status = params.status ?? 'sent';
      const [result] = await conn.query<ResultSetHeader>(
        `INSERT INTO messages
           (workspace_id, conversation_id, whatsapp_message_id, direction, sender_type,
            message_type, body, status, replied_to_message_id, sent_at, created_at, updated_at)
        VALUES (?, ?, ?, 'outbound', 'user', ?, ?, ?, ?, NOW(), NOW(), NOW())`,
        [
          workspaceId,
          conversationId,
          params.whatsappMessageId,
          messageType,
          params.body,
          status,
          repliedToId,
        ],
      );

      const preview = (params.body ?? '').slice(0, 255);
      await conn.query(
        `UPDATE conversations
         SET last_message_at = NOW(), last_message_preview = ?, updated_at = NOW()
         WHERE id = ?`,
        [preview, conversationId],
      );

      return { messageId: result.insertId };
    });
  }

  /** Swaps the deterministic `queued:{dispatchId}` placeholder for the real Baileys message id once the send completes. */
  async setOutboundWhatsappId(messageId: number, whatsappMessageId: string): Promise<void> {
    await execute('UPDATE messages SET whatsapp_message_id = ?, updated_at = NOW() WHERE id = ?', [
      whatsappMessageId,
      messageId,
    ]);
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
    await execute(
      `INSERT INTO message_media (
         message_id,
         mime_type,
         file_size_bytes,
         file_size,
         storage_path,
         blob_name,
         media_url,
         storage_provider,
         checksum_sha256,
         created_at,
         updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        messageId,
        media.mimeType,
        media.fileSizeBytes,
        media.fileSize ?? media.fileSizeBytes,
        media.storagePath,
        media.blobName ?? media.storagePath,
        media.mediaUrl ?? null,
        media.storageProvider ?? 'azure_blob',
        media.checksumSha256,
      ],
    );
  }

  async insertMessageStatusEvent(
    messageId: number,
    status: MessageStatus,
    rawPayload: Record<string, unknown> | null = null,
  ): Promise<void> {
    await execute(
      `INSERT INTO message_status_events (message_id, status, occurred_at, raw_payload, created_at)
       VALUES (?, ?, NOW(), ?, NOW())`,
      [messageId, status, rawPayload ? JSON.stringify(rawPayload) : null],
    );
  }

  /**
   * Moves a message forward in the status lifecycle, stamping delivered_at/
   * read_at the first time the corresponding receipt is observed. The
   * `occurredAt` (defaults to DB NOW()) is stored as-is on the receipt columns
   * so the socket emit and the DB agree on the exact transition time.
   */
  async updateMessageStatus(
    messageId: number,
    status: MessageStatus,
    occurredAt: Date | null = null,
  ): Promise<void> {
    await execute(
      `UPDATE messages
       SET status = ?,
           delivered_at = COALESCE(delivered_at, ?),
           read_at = COALESCE(read_at, ?),
           updated_at = NOW()
       WHERE id = ?`,
      [
        status,
        status === 'delivered' ? (occurredAt ?? new Date()) : null,
        status === 'read' ? (occurredAt ?? new Date()) : null,
        messageId,
      ],
    );
  }

  async findMessageByWhatsappId(
    workspaceId: number,
    whatsappMessageId: string,
  ): Promise<MessageRow | null> {
    const [rows] = await query<MessageRow[]>(
      'SELECT * FROM messages WHERE workspace_id = ? AND whatsapp_message_id = ? LIMIT 1',
      [workspaceId, whatsappMessageId],
    );
    return rows[0] ?? null;
  }

  async findMessageById(messageId: number): Promise<MessageRow | null> {
    const [rows] = await query<MessageRow[]>('SELECT * FROM messages WHERE id = ? LIMIT 1', [
      messageId,
    ]);
    return rows[0] ?? null;
  }

  /**
   * Resolves the JID an outbound action (send/forward) should target for a
   * conversation's contact.
   *
   * Prefers the contact's LID (`lid_jid`) when one is known: every contact in
   * a modern workspace is assigned a WhatsApp LID, and privacy-shielded users
   * (phone-number privacy on - the contacts whose inbound remoteJids arrive
   * as `@lid`) must be addressed by LID. Sending to the plain phone-number JID
   * of a migrated LID user is accepted by Baileys (a real message id comes
   * back, so the row is marked 'sent') but WhatsApp's server can fail to
   * translate the PN-addressed message to the user's LID identity - the
   * recipient's device then shows the pending "Waiting for this message..."
   * placeholder and no delivery receipt ever returns. The LID mapping comes
   * from Baileys' contacts.upsert / chats.phoneNumberShare (see setLidJid),
   * so it is authoritative when present; fall back to wa_jid otherwise.
   */
  async getConversationJid(conversationId: number, workspaceId: number): Promise<string | null> {
    const [rows] = await query<RowDataPacket[]>(
      `SELECT wc.wa_jid AS wa_jid, wc.lid_jid AS lid_jid
       FROM conversations c
       JOIN whatsapp_contacts wc ON wc.id = c.whatsapp_contact_id
       WHERE c.id = ? AND c.workspace_id = ? LIMIT 1`,
      [conversationId, workspaceId],
    );
    if (rows.length === 0) {
      return null;
    }
    const lidJid = rows[0].lid_jid as string | null;
    const waJid = rows[0].wa_jid as string | null;
    // Prefer the LID when known. A LID-only row (an unmapped @lid inbound that
    // has not been linked to its phone-number row yet) already carries the LID
    // as wa_jid, so `lidJid ?? waJid` also returns the right target there.
    return lidJid ?? waJid;
  }

  /** Looks up a message_media row by id, scoped to workspace via its parent message. */
  async findMessageMediaById(
    workspaceId: number,
    mediaId: number,
  ): Promise<{ id: number; message_id: number; storage_path: string; mime_type: string } | null> {
    const [rows] = await query<RowDataPacket[]>(
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

  /**
   * Returns the single message_media row for a message (media is 1:1 per
   * message). Includes storage_path/checksum so a forwarded message can
   * re-read the bytes from object storage.
   */
  async findMessageMediaByMessageId(messageId: number): Promise<{
    id: number;
    mime_type: string;
    file_size_bytes: number | null;
    storage_path: string;
    checksum_sha256: string | null;
  } | null> {
    const [rows] = await query<RowDataPacket[]>(
      `SELECT id, mime_type, file_size_bytes, storage_path, checksum_sha256 FROM message_media WHERE message_id = ? LIMIT 1`,
      [messageId],
    );
    return rows.length > 0
      ? {
          id: rows[0].id as number,
          mime_type: rows[0].mime_type as string,
          file_size_bytes: rows[0].file_size_bytes as number | null,
          storage_path: rows[0].storage_path as string,
          checksum_sha256: rows[0].checksum_sha256 as string | null,
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
    await execute(
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

  async addReaction(messageId: number, userId: number | null, emoji: string): Promise<void> {
    await execute(
      `INSERT INTO message_reactions (message_id, user_id, emoji, reacted_at, created_at, updated_at)
       VALUES (?, ?, ?, NOW(), NOW(), NOW())
       ON DUPLICATE KEY UPDATE emoji = VALUES(emoji), reacted_at = NOW(), updated_at = NOW()`,
      [messageId, userId, emoji],
    );
  }

  async removeReaction(messageId: number, userId: number | null, emoji: string): Promise<void> {
    await execute(
      'DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?',
      [messageId, userId, emoji],
    );
  }

  async markMessageAsDeleted(
    workspaceId: number,
    whatsappMessageId: string,
    deletedBy: string | null = null,
  ): Promise<boolean> {
    const result = await execute(
      `UPDATE messages
       SET is_deleted_for_everyone = 1, deleted_at = NOW(), deleted_by_type = ?, updated_at = NOW()
       WHERE workspace_id = ? AND whatsapp_message_id = ?`,
      [deletedBy, workspaceId, whatsappMessageId],
    );
    return (result as { affectedRows: number }).affectedRows > 0;
  }

  /**
   * Bumps a conversation's gateway-owned unread counter to at least 1 (the
   * "Mark as unread" action). Returns the new counter value, or null when the
   * conversation doesn't belong to the workspace.
   */
  async markConversationUnread(
    conversationId: number,
    workspaceId: number,
  ): Promise<{ unreadCount: number } | null> {
    const affected = await execute(
      `UPDATE conversations
       SET unread_count = GREATEST(unread_count, 1), updated_at = NOW()
       WHERE id = ? AND workspace_id = ?`,
      [conversationId, workspaceId],
    );
    if (affected.affectedRows === 0) {
      return null;
    }
    const [rows] = await query<RowDataPacket[]>(
      'SELECT unread_count FROM conversations WHERE id = ? AND workspace_id = ? LIMIT 1',
      [conversationId, workspaceId],
    );
    return rows.length > 0 ? { unreadCount: rows[0].unread_count as number } : null;
  }

  /**
   * Resets a conversation's gateway-owned unread counter to 0 (agent read the
   * thread). Returns the new counter value, or null when the conversation
   * doesn't belong to the workspace.
   */
  async resetConversationUnread(
    conversationId: number,
    workspaceId: number,
  ): Promise<{ unreadCount: number } | null> {
    const affected = await execute(
      'UPDATE conversations SET unread_count = 0, updated_at = NOW() WHERE id = ? AND workspace_id = ?',
      [conversationId, workspaceId],
    );
    if (affected.affectedRows === 0) {
      return null;
    }
    const [rows] = await query<RowDataPacket[]>(
      'SELECT unread_count FROM conversations WHERE id = ? AND workspace_id = ? LIMIT 1',
      [conversationId, workspaceId],
    );
    return rows.length > 0 ? { unreadCount: rows[0].unread_count as number } : null;
  }

  /**
   * Stars or unstars a message (gateway-owned `starred_at` column, mirrored
   * from WhatsApp's starred-message concept). Returns the new starred state,
   * or null when the message isn't found in the workspace.
   */
  async setMessageStarred(
    messageId: number,
    workspaceId: number,
    starred: boolean,
  ): Promise<{ starredAt: string | null } | null> {
    const affected = await execute(
      `UPDATE messages SET starred_at = ?, updated_at = NOW() WHERE id = ? AND workspace_id = ?`,
      [starred ? new Date() : null, messageId, workspaceId],
    );
    if (affected.affectedRows === 0) {
      return null;
    }
    return { starredAt: starred ? new Date().toISOString() : null };
  }

  /**
   * WhatsApp-style "Delete for me": stamps `deleted_for_me_at` so the message
   * is hidden from the workspace's inbox (the contact's copy is untouched and
   * no revoke is sent to WhatsApp). Returns the stamp, or null when the
   * message isn't found in the workspace.
   */
  async markMessageDeletedForMe(
    messageId: number,
    workspaceId: number,
  ): Promise<{ deletedForMeAt: string } | null> {
    const affected = await execute(
      `UPDATE messages SET deleted_for_me_at = NOW(), updated_at = NOW() WHERE id = ? AND workspace_id = ?`,
      [messageId, workspaceId],
    );
    if (affected.affectedRows === 0) {
      return null;
    }
    return { deletedForMeAt: new Date().toISOString() };
  }
}