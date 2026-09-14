import { createHash } from 'node:crypto';
import { query } from './mysql';
import type { RowDataPacket } from 'mysql2/promise';

/**
 * Verified identity of a Socket.IO client on /gateway, resolved from the
 * Bearer token the frontend sends in `socket.handshake.auth.token`
 * (frontend/src/providers/socket-provider.tsx).
 *
 * The token is a Laravel Sanctum personal access token: the database stores
 * `hash('sha256', plaintext)`, so the gateway needs the plaintext to recompute
 * the hash before it can look anything up. Whoever holds a valid token for a
 * user is that user - exactly the same trust model the backend REST API uses.
 */
export interface SocketPrincipal {
  userId: number;
  workspaceId: number;
  userName: string | null;
}

interface TokenRow extends RowDataPacket {
  user_id: number;
  workspace_id: number;
  user_name: string | null;
}

/**
 * Resolves a `socket.handshake.auth.token` value to a verified user/workspace,
 * or null when the token is missing/invalid/expired. Rejects tokens belonging
 * to deleted or deactivated users. Never throws - every failure is a null so
 * the socket layer can respond uniformly.
 */
export async function verifySocketToken(token: unknown): Promise<SocketPrincipal | null> {
  if (typeof token !== 'string' || token.length === 0 || token.length > 1024) {
    return null;
  }

  const tokenHash = createHash('sha256').update(token).digest('hex');

  try {
    const [rows] = await query<RowDataPacket[]>(
      `SELECT u.id AS user_id, u.workspace_id, u.name AS user_name
         FROM personal_access_tokens pat
         JOIN users u
           ON u.id = pat.tokenable_id
          AND pat.tokenable_type = 'App\\\\Models\\\\User'
        WHERE pat.token = ?
          AND (pat.expires_at IS NULL OR pat.expires_at > NOW())
          AND u.is_active = 1
          AND u.deleted_at IS NULL
        LIMIT 1`,
      [tokenHash],
    );

    const row = rows[0] as TokenRow | undefined;
    if (!row || row.workspace_id == null) {
      return null;
    }

    return {
      userId: Number(row.user_id),
      workspaceId: Number(row.workspace_id),
      userName: row.user_name,
    };
  } catch {
    // A DB outage must not crash the server; refuse the connection rather
    // than silently allowing an unauthenticated socket through.
    return null;
  }
}

/**
 * Room-membership rule for the /gateway namespace. A client may only join
 * rooms that belong to its own verified workspace, and the per-user room is
 * additionally pinned to its own user id (so the notification channel for
 * another agent is never joinable).
 */
export function canJoinRoom(workspaceId: number, userId: number, room: string): boolean {
  if (room === `workspace:${workspaceId}` || room === `workspace:${workspaceId}:inbox`) {
    return true;
  }

  if (room.startsWith(`workspace:${workspaceId}:conversation:`)) {
    return true;
  }

  if (room === `workspace:${workspaceId}:user:${userId}`) {
    return true;
  }

  return false;
}