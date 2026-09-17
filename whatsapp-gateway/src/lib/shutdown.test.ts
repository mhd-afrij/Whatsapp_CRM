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

  it('does not stop accounts if draining a worker fails', async () => {
    const failure = new Error('Worker could not drain');
    const workers = [
      { close: vi.fn(async () => { throw failure; }) },
      { close: vi.fn(async () => {}) },
    ];
    const getManagers = vi.fn(() => [{ stop: vi.fn(async () => {}) }]);

    await expect(drainWorkersAndStopManagers(workers, getManagers)).rejects.toThrow(AggregateError);
    expect(workers[1].close).toHaveBeenCalledOnce();
    expect(getManagers).not.toHaveBeenCalled();
  });

  it('attempts every account stop and reports failures rather than claiming success', async () => {
    const managers = [
      { stop: vi.fn(async () => { throw new Error('Account A failed to stop'); }) },
      { stop: vi.fn(async () => {}) },
    ];

    await expect(drainWorkersAndStopManagers([], () => managers)).rejects.toThrow(AggregateError);
    expect(managers[0].stop).toHaveBeenCalledOnce();
    expect(managers[1].stop).toHaveBeenCalledOnce();
  });

  it('handles an empty registry and no workers', async () => {
    await expect(drainWorkersAndStopManagers([], () => [])).resolves.toBeUndefined();
  });
});
