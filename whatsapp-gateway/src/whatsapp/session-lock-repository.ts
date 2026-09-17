import type { RowDataPacket } from 'mysql2/promise';
import { query, execute } from '../lib/mysql';

/**
 * Data-access layer for `workspace_sync_assignments` - a lease-based session
 * lock, one row per (workspace, whatsapp_account) so multiple concurrent
 * Baileys sessions on the same workspace can be coordinated independently.
 *
 * A gateway instance must hold this lock before opening a Baileys socket for
 * an account so two gateway replicas never connect the same session at once
 * (Baileys auth state is not safe for concurrent writers; a second connect
 * forces a re-pair on the first). The lock is a *lease*: a crashed instance
 * stops heartbeating and its `lease_expires_at` elapses, at which point any
 * other instance may acquire. Graceful shutdown releases explicitly.
 *
 * The read-then-write acquire is not a single atomic statement; in the
 * unlikely event two instances race on an *expired* lock both may briefly
 * believe they own it. The lease + heartbeat boundary makes that window a
 * self-healing contradiction (the heartbeat `WHERE gateway_instance_id`
 * guard keeps exactly one owner renewing).
 */
export interface SessionLockRow extends RowDataPacket {
  id: number;
  workspace_id: number;
  whatsapp_account_id: number | null;
  gateway_instance_id: string;
  status: 'acquired' | 'released' | 'expired';
  acquired_at: Date;
  last_heartbeat_at: Date | null;
  lease_expires_at: Date;
}

export class SessionLockRepository {
  async getCurrent(workspaceId: number, accountId?: number | null): Promise<SessionLockRow | null> {
    if (accountId) {
      const [rows] = await query<SessionLockRow[]>(
        'SELECT * FROM workspace_sync_assignments WHERE workspace_id = ? AND whatsapp_account_id = ? LIMIT 1',
        [workspaceId, accountId],
      );
      return rows[0] ?? null;
    }
    const [rows] = await query<SessionLockRow[]>(
      'SELECT * FROM workspace_sync_assignments WHERE workspace_id = ? AND whatsapp_account_id IS NULL LIMIT 1',
      [workspaceId],
    );
    return rows[0] ?? null;
  }

  /** A lock is live only while a live lease is held by an 'acquired' row. */
  isHeld(lock: SessionLockRow, now: Date = new Date()): boolean {
    return lock.status === 'acquired' && new Date(lock.lease_expires_at).getTime() > now.getTime();
  }

  /**
   * Attempts to take ownership of an account's session lock. Returns
   * false if another gateway instance currently holds a live lease; true if
   * the lock was free/expired or already owned by this instance (in which
   * case the lease is renewed).
   */
  async acquire(
    workspaceId: number,
    gatewayInstanceId: string,
    leaseMs: number,
    accountId?: number | null,
  ): Promise<boolean> {
    const existing = await this.getCurrent(workspaceId, accountId);
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + leaseMs);

    if (existing) {
      if (this.isHeld(existing, now) && existing.gateway_instance_id !== gatewayInstanceId) {
        return false;
      }

      await execute(
        `UPDATE workspace_sync_assignments
         SET gateway_instance_id = ?, status = 'acquired', acquired_at = ?, last_heartbeat_at = ?,
             lease_expires_at = ?, updated_at = NOW()
         WHERE id = ?`,
        [gatewayInstanceId, now, now, leaseExpiresAt, existing.id],
      );
      return true;
    }

    const result = await execute(
      `INSERT INTO workspace_sync_assignments
         (workspace_id, whatsapp_account_id, gateway_instance_id, status, acquired_at, last_heartbeat_at, lease_expires_at, created_at, updated_at)
       VALUES (?, ?, ?, 'acquired', ?, ?, ?, NOW(), NOW())`,
      [workspaceId, accountId ?? null, gatewayInstanceId, now, now, leaseExpiresAt],
    );
    return result.affectedRows > 0;
  }

  /**
   * Renews this instance's lease. Returns false when the row no longer
   * belongs to this instance (released, expired, or re-acquired elsewhere),
   * which the caller should treat as lost ownership.
   */
  async heartbeat(
    workspaceId: number,
    gatewayInstanceId: string,
    leaseMs: number,
    accountId?: number | null,
  ): Promise<boolean> {
    const leaseExpiresAt = new Date(Date.now() + leaseMs);
    const result = await execute(
      `UPDATE workspace_sync_assignments
       SET last_heartbeat_at = NOW(), lease_expires_at = ?, updated_at = NOW()
       WHERE workspace_id = ? AND gateway_instance_id = ? AND status = 'acquired'
         AND whatsapp_account_id ${accountId ? '= ?' : 'IS NULL'}`,
      accountId
        ? [leaseExpiresAt, workspaceId, gatewayInstanceId, accountId]
        : [leaseExpiresAt, workspaceId, gatewayInstanceId],
    );
    return result.affectedRows > 0;
  }

  /** Explicitly releases this instance's lock (graceful shutdown / logout). */
  async release(workspaceId: number, gatewayInstanceId: string, accountId?: number | null): Promise<void> {
    await execute(
      `UPDATE workspace_sync_assignments
       SET status = 'released', lease_expires_at = NOW(), updated_at = NOW()
       WHERE workspace_id = ? AND gateway_instance_id = ?
         AND whatsapp_account_id ${accountId ? '= ?' : 'IS NULL'}`,
      accountId
        ? [workspaceId, gatewayInstanceId, accountId]
        : [workspaceId, gatewayInstanceId],
    );
  }
}