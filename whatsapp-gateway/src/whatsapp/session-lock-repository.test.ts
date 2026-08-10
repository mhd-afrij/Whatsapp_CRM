import { describe, it, expect, vi, beforeEach } from 'vitest';

const { queryMock, executeMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  executeMock: vi.fn().mockResolvedValue({ affectedRows: 1 }),
}));

vi.mock('../lib/mysql', () => ({
  query: (...args: unknown[]) => queryMock(...args),
  execute: (...args: unknown[]) => executeMock(...args),
}));

import { SessionLockRepository } from './session-lock-repository';

type LockRow = import('./session-lock-repository').SessionLockRow;

function lockRow(overrides: Partial<Omit<LockRow, 'constructor'>> = {}): LockRow {
  return {
    id: 1,
    workspace_id: 1,
    gateway_instance_id: 'gw-a',
    status: 'acquired' as const,
    acquired_at: new Date(Date.now() - 60_000),
    last_heartbeat_at: new Date(Date.now() - 30_000),
    lease_expires_at: new Date(Date.now() + 30_000),
    ...overrides,
  } as unknown as LockRow;
}

describe('SessionLockRepository', () => {
  let repository: SessionLockRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new SessionLockRepository();
  });

  describe('isHeld', () => {
    it('is held while an acquired row has a live lease', () => {
      expect(repository.isHeld(lockRow())).toBe(true);
    });

    it('is not held when the lease has expired', () => {
      expect(repository.isHeld(lockRow({ lease_expires_at: new Date(Date.now() - 1000) }))).toBe(false);
    });

    it('is not held for released/expired status even with a future lease timestamp', () => {
      expect(repository.isHeld(lockRow({ status: 'released' }))).toBe(false);
      expect(repository.isHeld(lockRow({ status: 'expired' }))).toBe(false);
    });
  });

  describe('acquire', () => {
    it('inserts a fresh lock row when none exists', async () => {
      queryMock.mockResolvedValueOnce([[]]);
      executeMock.mockResolvedValueOnce({ affectedRows: 1 });

      const acquired = await repository.acquire(1, 'gw-a', 30_000);

      expect(acquired).toBe(true);
      expect(executeMock).toHaveBeenCalledTimes(1);
      const [sql] = executeMock.mock.calls[0];
      expect(String(sql)).toContain('INSERT INTO workspace_sync_assignments');
      expect(executeMock.mock.calls[0][1]).toEqual([
        1,
        'gw-a',
        expect.any(Date),
        expect.any(Date),
        expect.any(Date),
      ]);
    });

    it('refuses to take a live lease owned by another instance', async () => {
      queryMock.mockResolvedValueOnce([[lockRow({ gateway_instance_id: 'gw-b' })]]);

      const acquired = await repository.acquire(1, 'gw-a', 30_000);

      expect(acquired).toBe(false);
      expect(executeMock).not.toHaveBeenCalled();
    });

    it('takes over an expired lease owned by another instance', async () => {
      queryMock.mockResolvedValueOnce([
        [lockRow({ gateway_instance_id: 'gw-b', lease_expires_at: new Date(Date.now() - 1000) })],
      ]);

      const acquired = await repository.acquire(1, 'gw-a', 30_000);

      expect(acquired).toBe(true);
      expect(executeMock.mock.calls[0][0]).toContain('UPDATE workspace_sync_assignments');
      expect(executeMock.mock.calls[0][1][0]).toBe('gw-a');
    });

    it('renews the lease when already owned by this instance', async () => {
      queryMock.mockResolvedValueOnce([[lockRow({ gateway_instance_id: 'gw-a' })]]);

      const acquired = await repository.acquire(1, 'gw-a', 30_000);

      expect(acquired).toBe(true);
      expect(executeMock.mock.calls[0][0]).toContain('UPDATE workspace_sync_assignments');
    });
  });

  describe('heartbeat', () => {
    it('renews the lease and reports success when this instance still owns it', async () => {
      executeMock.mockResolvedValueOnce({ affectedRows: 1 });

      const ok = await repository.heartbeat(1, 'gw-a', 30_000);

      expect(ok).toBe(true);
      const [sql, params] = executeMock.mock.calls[0];
      expect(String(sql)).toContain("status = 'acquired'");
      expect(params).toEqual([expect.any(Date), 1, 'gw-a']);
    });

    it('reports ownership lost when the row was re-acquired elsewhere', async () => {
      executeMock.mockResolvedValueOnce({ affectedRows: 0 });

      const ok = await repository.heartbeat(1, 'gw-a', 30_000);

      expect(ok).toBe(false);
    });
  });

  describe('release', () => {
    it('marks the row released for this instance only', async () => {
      await repository.release(1, 'gw-a');

      const [sql, params] = executeMock.mock.calls[0];
      expect(String(sql)).toContain("status = 'released'");
      expect(params).toEqual([1, 'gw-a']);
    });
  });
});
