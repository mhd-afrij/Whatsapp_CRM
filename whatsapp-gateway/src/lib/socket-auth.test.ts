import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';

const query = vi.fn();

vi.mock('./mysql', () => ({
  query,
}));

describe('socket-auth room membership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows the workspace room and the inbox room', async () => {
    const { canJoinRoom } = await import('./socket-auth');

    expect(canJoinRoom(7, 1, 'workspace:7')).toBe(true);
    expect(canJoinRoom(7, 1, 'workspace:7:inbox')).toBe(true);
  });

  it('allows any conversation room inside the workspace', async () => {
    const { canJoinRoom } = await import('./socket-auth');
    expect(canJoinRoom(7, 1, 'workspace:7:conversation:42')).toBe(true);
    expect(canJoinRoom(7, 1, 'workspace:7:conversation:99999')).toBe(true);
  });

  it('allows only the clients own per-user room', async () => {
    const { canJoinRoom } = await import('./socket-auth');
    expect(canJoinRoom(7, 1, 'workspace:7:user:1')).toBe(true);
    expect(canJoinRoom(7, 1, 'workspace:7:user:2')).toBe(false);
  });

  it('rejects rooms from another workspace', async () => {
    const { canJoinRoom } = await import('./socket-auth');
    expect(canJoinRoom(7, 1, 'workspace:8')).toBe(false);
    expect(canJoinRoom(7, 1, 'workspace:8:inbox')).toBe(false);
    expect(canJoinRoom(7, 1, 'workspace:8:conversation:1')).toBe(false);
    expect(canJoinRoom(7, 1, 'workspace:8:user:1')).toBe(false);
  });

  it('rejects malformed and unrelated room names', async () => {
    const { canJoinRoom } = await import('./socket-auth');
    expect(canJoinRoom(7, 1, 'admin')).toBe(false);
    expect(canJoinRoom(7, 1, 'workspace7')).toBe(false);
    expect(canJoinRoom(7, 1, '')).toBe(false);
  });
});

describe('verifySocketToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null for missing, empty, or non-string tokens', async () => {
    const { verifySocketToken } = await import('./socket-auth');

    await expect(verifySocketToken(undefined)).resolves.toBeNull();
    await expect(verifySocketToken('')).resolves.toBeNull();
    await expect(verifySocketToken(12345)).resolves.toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it('queries with the sha256 hash and maps a verified token to a principal', async () => {
    const { verifySocketToken } = await import('./socket-auth');

    const plain = 'abc123|plain-secret';
    query.mockResolvedValueOnce([
      [{ user_id: 9, workspace_id: 4, user_name: 'Jane' }],
      undefined,
    ]);

    const principal = await verifySocketToken(plain);

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, values] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('personal_access_tokens');
    expect(values).toEqual([createHash('sha256').update(plain).digest('hex')]);
    expect(principal).toEqual({ userId: 9, workspaceId: 4, userName: 'Jane' });
  });

  it('returns null when the token matches nothing (expired, revoked, or unknown)', async () => {
    const { verifySocketToken } = await import('./socket-auth');
    query.mockResolvedValueOnce([[], undefined]);

    await expect(verifySocketToken('revoked-secret')).resolves.toBeNull();
  });

  it('returns null and never throws when the database query fails', async () => {
    const { verifySocketToken } = await import('./socket-auth');
    query.mockRejectedValueOnce(new Error('connection lost'));

    await expect(verifySocketToken('anything')).resolves.toBeNull();
  });
});