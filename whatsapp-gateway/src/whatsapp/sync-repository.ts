import type { RowDataPacket } from 'mysql2/promise';
import { execute, query } from '../lib/mysql';

/**
 * The whatsapp_sync_checkpoints table is gateway-owned (docs/DATA_OWNERSHIP.md)
 * and carries one row per (workspace_id, checkpoint_type). The gateway's
 * history-import coordinator stores its run state - state machine position,
 * timestamps, message/chat totals and processed/failed/duplicate counters -
 * as JSON in the cursor column, keyed under `history_sync`.
 */
export const HISTORY_SYNC_CHECKPOINT_TYPE = 'history_sync';

interface CheckpointRow extends RowDataPacket {
  cursor: string | null;
  last_synced_at: string | null;
}

export class SyncRepository {
  /** Returns the stored run-state object for the workspace, or null when none exists. */
  async getSnapshot(workspaceId: number): Promise<Record<string, unknown> | null> {
    // `cursor` is a reserved word in MariaDB/MySQL, so it must be backtick-quoted
    // in raw SQL (Laravel's migrations quote it automatically, raw SQL does not).
    const [rows] = await query<CheckpointRow[]>(
      "SELECT `cursor`, last_synced_at FROM whatsapp_sync_checkpoints\n" +
        'WHERE workspace_id = ? AND checkpoint_type = ? LIMIT 1',
      [workspaceId, HISTORY_SYNC_CHECKPOINT_TYPE],
    );

    if (!rows[0]?.cursor) {
      return null;
    }

    try {
      const parsed: unknown = JSON.parse(rows[0].cursor);
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // A corrupt cursor is not worth crashing a status read over; treat it as absent.
    }
    return null;
  }

  /** Upserts the workspace's run-state JSON (idempotent; single row per workspace). */
  async saveSnapshot(workspaceId: number, snapshot: object): Promise<void> {
    await execute(
      'INSERT INTO whatsapp_sync_checkpoints\n' +
        '         (workspace_id, checkpoint_type, `cursor`, last_synced_at, created_at, updated_at)\n' +
        '       VALUES (?, ?, ?, NOW(), NOW(), NOW())\n' +
        '       ON DUPLICATE KEY UPDATE\n' +
        '         `cursor` = VALUES(`cursor`),\n' +
        '         last_synced_at = VALUES(last_synced_at),\n' +
        '         updated_at = NOW()',
      [workspaceId, HISTORY_SYNC_CHECKPOINT_TYPE, JSON.stringify(snapshot)],
    );
  }

  /** Deletes the workspace's run state (used on reset-data and fresh QR pairing). */
  async clear(workspaceId: number): Promise<void> {
    await execute(
      'DELETE FROM whatsapp_sync_checkpoints WHERE workspace_id = ? AND checkpoint_type = ?',
      [workspaceId, HISTORY_SYNC_CHECKPOINT_TYPE],
    );
  }
}
