import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { query, execute } from '../lib/mysql';

export type DispatchStatus = 'pending' | 'processing' | 'sent' | 'failed';

export interface DispatchRow extends RowDataPacket {
  id: number;
  workspace_id: number;
  conversation_id: number;
  requested_by_user_id: number | null;
  payload: string;
  bullmq_job_id: string | null;
  status: DispatchStatus;
  attempts: number;
  message_id: number | null;
}

export interface DispatchPayload {
  idempotencyKey: string;
  content: string | null;
  mediaRef?: string | null;
  replyToWhatsappMessageId?: string | null;
}

/**
 * Data-access layer for message_dispatch_queue - the real idempotency key
 * for outbound sends (docs/04-database-design.md). A UNIQUE index on
 * (workspace_id, idempotency_key) - stored inside `payload` and looked up by
 * a generated column/JSON extraction - guards against double-enqueue; here
 * we implement the lookup-then-insert pattern with a UNIQUE constraint
 * assumed on (workspace_id, JSON idempotency key) enforced at the app layer
 * via a SELECT-then-INSERT within a single connection using
 * `INSERT ... ON DUPLICATE KEY` semantics is not directly usable for JSON,
 * so we rely on a dedicated idempotency_key column.
 */
export class DispatchRepository {
  async findByIdempotencyKey(workspaceId: number, idempotencyKey: string): Promise<DispatchRow | null> {
    const [rows] = await query<DispatchRow[]>(
      `SELECT * FROM message_dispatch_queue
       WHERE workspace_id = ? AND idempotency_key = ? LIMIT 1`,
      [workspaceId, idempotencyKey],
    );
    return rows[0] ?? null;
  }

  async createPending(
    workspaceId: number,
    conversationId: number,
    requestedByUserId: number | null,
    payload: DispatchPayload,
  ): Promise<DispatchRow> {
    const [result] = await query<ResultSetHeader>(
      `INSERT INTO message_dispatch_queue
         (workspace_id, conversation_id, requested_by_user_id, idempotency_key, payload, status, attempts, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', 0, NOW(), NOW())`,
      [workspaceId, conversationId, requestedByUserId, payload.idempotencyKey, JSON.stringify(payload)],
    );

    const [rows] = await query<DispatchRow[]>(
      'SELECT * FROM message_dispatch_queue WHERE id = ? LIMIT 1',
      [result.insertId],
    );
    return rows[0];
  }

  async setBullmqJobId(id: number, bullmqJobId: string): Promise<void> {
    await execute('UPDATE message_dispatch_queue SET bullmq_job_id = ?, updated_at = NOW() WHERE id = ?', [
      bullmqJobId,
      id,
    ]);
  }

  async markProcessing(id: number): Promise<void> {
    await execute(
      'UPDATE message_dispatch_queue SET status = "processing", attempts = attempts + 1, updated_at = NOW() WHERE id = ?',
      [id],
    );
  }

  async markSent(id: number, messageId: number): Promise<void> {
    await execute(
      'UPDATE message_dispatch_queue SET status = "sent", message_id = ?, updated_at = NOW() WHERE id = ?',
      [messageId, id],
    );
  }

  async markFailed(id: number): Promise<void> {
    await execute('UPDATE message_dispatch_queue SET status = "failed", updated_at = NOW() WHERE id = ?', [
      id,
    ]);
  }

  async findById(id: number): Promise<DispatchRow | null> {
    const [rows] = await query<DispatchRow[]>(
      'SELECT * FROM message_dispatch_queue WHERE id = ? LIMIT 1',
      [id],
    );
    return rows[0] ?? null;
  }
}