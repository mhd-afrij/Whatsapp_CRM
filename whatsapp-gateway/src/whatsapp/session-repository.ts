import fs from 'node:fs/promises';
import path from 'node:path';
import type { RowDataPacket } from 'mysql2/promise';
import { query, execute } from '../lib/mysql';
import { encryptCredentialValue, decryptCredentialValue } from '../lib/crypto';
import { logger } from '../lib/logger';

export type SessionStatus =
  | 'initializing'
  | 'qr_pending'
  | 'connected'
  | 'disconnected'
  | 'logged_out';

export type ConnectionEventType =
  | 'qr_generated'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'reconnect_attempt'
  | 'logged_out'
  | 'bad_session'
  | 'error';

export interface SessionRow extends RowDataPacket {
  id: number;
  workspace_id: number;
  status: SessionStatus;
  phone_number: string | null;
  device_id: string | null;
  last_connected_at: string | null;
  last_disconnected_at: string | null;
  disconnect_reason: string | null;
  qr_code: string | null;
  qr_expires_at: string | null;
}

/**
 * Data-access layer for the whatsapp_sessions / whatsapp_session_credentials /
 * whatsapp_connection_events tables (see docs/04-database-design.md). Kept as
 * a thin, mockable module so ConnectionManager tests can stub it out without
 * a real MySQL connection.
 */
export class SessionRepository {
  async getOrCreateSession(workspaceId: number): Promise<SessionRow> {
    const [rows] = await query<SessionRow[]>(
      'SELECT * FROM whatsapp_sessions WHERE workspace_id = ? LIMIT 1',
      [workspaceId],
    );

    if (rows.length > 0) {
      return rows[0];
    }

    const result = await execute(
      `INSERT INTO whatsapp_sessions (workspace_id, status, created_at, updated_at)
       VALUES (?, 'initializing', NOW(), NOW())`,
      [workspaceId],
    );

    const [created] = await query<SessionRow[]>(
      'SELECT * FROM whatsapp_sessions WHERE id = ? LIMIT 1',
      [result.insertId],
    );

    return created[0];
  }

  async updateStatus(
    sessionId: number,
    status: SessionStatus,
    fields: Partial<{
      phoneNumber: string | null;
      deviceId: string | null;
      lastConnectedAt: Date;
      lastDisconnectedAt: Date;
      disconnectReason: string | null;
      qrCode: string | null;
      qrExpiresAt: Date | null;
    }> = {},
  ): Promise<void> {
    await execute(
      `UPDATE whatsapp_sessions SET
         status = ?,
         phone_number = COALESCE(?, phone_number),
         device_id = COALESCE(?, device_id),
         last_connected_at = COALESCE(?, last_connected_at),
         last_disconnected_at = COALESCE(?, last_disconnected_at),
         disconnect_reason = ?,
         qr_code = ?,
         qr_expires_at = ?,
         updated_at = NOW()
       WHERE id = ?`,
      [
        status,
        fields.phoneNumber ?? null,
        fields.deviceId ?? null,
        fields.lastConnectedAt ?? null,
        fields.lastDisconnectedAt ?? null,
        fields.disconnectReason ?? null,
        fields.qrCode ?? null,
        fields.qrExpiresAt ?? null,
        sessionId,
      ],
    );
  }

  async recordConnectionEvent(
    workspaceId: number,
    sessionId: number,
    eventType: ConnectionEventType,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    await execute(
      `INSERT INTO whatsapp_connection_events
         (workspace_id, whatsapp_session_id, event_type, metadata, occurred_at, created_at)
       VALUES (?, ?, ?, ?, NOW(), NOW())`,
      [workspaceId, sessionId, eventType, JSON.stringify(metadata)],
    );
  }

  async listConnectionEvents(sessionId: number, limit = 50): Promise<RowDataPacket[]> {
    const [rows] = await query<RowDataPacket[]>(
      `SELECT id, event_type, metadata, occurred_at
       FROM whatsapp_connection_events
       WHERE whatsapp_session_id = ?
       ORDER BY occurred_at DESC
       LIMIT ?`,
      [sessionId, limit],
    );
    return rows;
  }

  /**
   * Persists an encrypted copy of every auth-state file currently on disk
   * for this session into whatsapp_session_credentials, keyed by filename.
   * Called after every `creds.update` from Baileys.
   */
  async persistCredentialsFromDisk(sessionId: number, authDir: string): Promise<void> {
    let files: string[];
    try {
      files = await fs.readdir(authDir);
    } catch {
      return;
    }

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const fullPath = path.join(authDir, file);
      const content = await fs.readFile(fullPath, 'utf8');
      const encrypted = encryptCredentialValue(content);

      await execute(
        `INSERT INTO whatsapp_session_credentials (whatsapp_session_id, key_name, value, created_at, updated_at)
         VALUES (?, ?, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = NOW()`,
        [sessionId, file, encrypted],
      );
    }
  }

  /**
   * Restores previously-persisted encrypted credentials to disk so
   * useMultiFileAuthState can pick them up on gateway restart.
   */
  async restoreCredentialsToDisk(sessionId: number, authDir: string): Promise<boolean> {
    const [rows] = await query<RowDataPacket[]>(
      'SELECT key_name, value FROM whatsapp_session_credentials WHERE whatsapp_session_id = ?',
      [sessionId],
    );

    if (rows.length === 0) {
      return false;
    }

    await fs.mkdir(authDir, { recursive: true });

    for (const row of rows) {
      const plaintext = decryptCredentialValue(row.value as string);
      await fs.writeFile(path.join(authDir, row.key_name as string), plaintext, 'utf8');
    }

    logger.info({ sessionId, count: rows.length }, 'Restored WhatsApp credentials from database');
    return true;
  }

  async deleteCredentials(sessionId: number): Promise<void> {
    await execute('DELETE FROM whatsapp_session_credentials WHERE whatsapp_session_id = ?', [
      sessionId,
    ]);
  }
}