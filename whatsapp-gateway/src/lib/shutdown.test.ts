import { describe, expect, it, vi } from 'vitest';
import { drainWorkersAndStopManagers } from './shutdown';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('queue drain before account shutdown', () => {
  it('keeps account sockets open until every active worker finishes', async () => {
    const send = deferred();
    const media = deferred();
    const workers = [
      { close: vi.fn(() => send.promise) },
      { close: vi.fn(() => media.promise) },
    ];
    const managers = [{ stop: vi.fn(async () => {}) }, { stop: vi.fn(async () => {}) }];
    const getManagers = vi.fn(() => managers);
    const shutdown = drainWorkersAndStopManagers(workers, getManagers);

    try {
      expect(workers[0].close).toHaveBeenCalledOnce();
      expect(workers[1].close).toHaveBeenCalledOnce();
      expect(getManagers).not.toHaveBeenCalled();
      send.resolve();
      await send.promise;
      expect(managers[0].stop).not.toHaveBeenCalled();
      expect(managers[1].stop).not.toHaveBeenCalled();
    } finally {
      send.resolve();
      media.resolve();
      await shutdown;
    }
    expect(getManagers).toHaveBeenCalledOnce();
    expect(managers[0].stop).toHaveBeenCalledOnce();
    expect(managers[1].stop).toHaveBeenCalledOnce();
  });

  it('still stops accounts when a worker fails to drain', async () => {
    const failure = new Error('Worker could not drain');
    const workers = [
      { close: vi.fn(async () => { throw failure; }) },
      { close: vi.fn(async () => {}) },
    ];
    const manager = { stop: vi.fn(async () => {}) };
    const getManagers = vi.fn(() => [manager]);

    // A failed drain must not abort shutdown: the remaining accounts still need
    // their sockets closed and their session locks released.
    const result = await drainWorkersAndStopManagers(workers, getManagers);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ step: 'workers[0]' });
    expect(result.errors[0].error).toBe(failure);
    expect(workers[1].close).toHaveBeenCalledOnce();
    expect(getManagers).toHaveBeenCalledOnce();
    expect(manager.stop).toHaveBeenCalledOnce();
  });

  it('attempts every account stop and reports failures rather than claiming success', async () => {
    const failureA = new Error('Account A failed to stop');
    const managers = [
      { stop: vi.fn(async () => { throw failureA; }) },
      { stop: vi.fn(async () => {}) },
    ];

    const result = await drainWorkersAndStopManagers([], () => managers);

    expect(managers[0].stop).toHaveBeenCalledOnce();
    expect(managers[1].stop).toHaveBeenCalledOnce();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ step: 'managers[0]' });
    expect(result.errors[0].error).toBe(failureA);
  });

  it('collects worker and account failures into one result without throwing', async () => {
    const workers = [{ close: vi.fn(async () => { throw new Error('drain'); }) }];
    const managers = [{ stop: vi.fn(async () => { throw new Error('stop'); }) }];

    const result = await drainWorkersAndStopManagers(workers, () => managers);

    expect(result.errors.map((entry) => entry.step)).toEqual(['workers[0]', 'managers[0]']);
  });

  it('wraps a non-Error rejection so callers can always log an Error', async () => {
    const workers = [{ close: vi.fn(async () => { throw 'string failure'; }) }];

    const result = await drainWorkersAndStopManagers(workers, () => []);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toBeInstanceOf(Error);
    expect(result.errors[0].error.message).toBe('string failure');
  });

  it('handles an empty registry and no workers', async () => {
    await expect(drainWorkersAndStopManagers([], () => [])).resolves.toEqual({ errors: [] });
  });
});