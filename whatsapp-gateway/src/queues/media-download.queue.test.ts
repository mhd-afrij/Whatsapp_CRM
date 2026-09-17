import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(function FakeQueue() {
    return { add: vi.fn(), close: vi.fn() };
  }),
  Worker: vi.fn().mockImplementation(function FakeWorker() {
    return { on: vi.fn(), run: vi.fn(), close: vi.fn() };
  }),
}));

// Both mocks are hoisted so the module factory below can reference the *same*
// function instances the tests assert on. Declaring the legacy downloader as a
// single stable vi.fn() (instead of vi.spyOn-ing an inline mock) keeps call
// history deterministic: beforeEach clears every mock, so a leaked count from
// an earlier test can never masquerade as an account-routing regression.
const { registryGet, legacyGetMediaDownloader } = vi.hoisted(() => ({
  registryGet: vi.fn(),
  legacyGetMediaDownloader: vi.fn(),
}));

vi.mock('../whatsapp/manager-instance', () => ({
  connectionManager: {
    getMediaDownloader: legacyGetMediaDownloader,
  },
  connectionRegistry: {
    get: (...args: unknown[]) => registryGet(...args),
  },
}));

import { validateMedia, MediaValidationError, waitForMediaDownloader } from './media-download.queue';
import { env } from '../config/env';

describe('media validation', () => {
  it('accepts an allowed mime type within the size limit', () => {
    expect(() => validateMedia('image/png', 1024)).not.toThrow();
  });

  it('rejects a disallowed mime type', () => {
    expect(() => validateMedia('application/x-msdownload', 1024)).toThrow(MediaValidationError);
  });

  it('rejects a file exceeding the configured size limit', () => {
    expect(() => validateMedia('image/png', env.MEDIA_MAX_SIZE_BYTES + 1)).toThrow(MediaValidationError);
  });
});

describe('waitForMediaDownloader', () => {
  beforeEach(() => {
    // resetAllMocks (not clearAllMocks) also drops implementations set by an
    // earlier test, so `mockReturnValue` from one case cannot leak into the
    // next one.
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits for the socket to come back instead of failing fast on a disconnect', async () => {
    vi.useFakeTimers();
    const downloader = vi.fn().mockResolvedValue(Buffer.from('media'));
    legacyGetMediaDownloader
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null)
      .mockReturnValue(downloader as never);

    // No accountId: the controlled legacy compatibility path.
    const promise = waitForMediaDownloader(60_000);
    // Two polls return null (each sleeping 2s), the third finds the socket.
    await vi.advanceTimersByTimeAsync(4_100);
    await expect(promise).resolves.toBe(downloader);
    // A legacy call must be traceable - it emits the deprecation warning.
    expect(legacyGetMediaDownloader).toHaveBeenCalled();
  });

  it('returns null once the timeout elapses with no socket', async () => {
    vi.useFakeTimers();
    legacyGetMediaDownloader.mockReturnValue(null);

    const promise = waitForMediaDownloader(2_000);
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(promise).resolves.toBeNull();
  });

  // ------------------------------------------------------------------
  // Phase 5.5 - account-scoped media download isolation
  // ------------------------------------------------------------------

  it('resolves the downloader ONLY from the job account manager in the job workspace', async () => {
    vi.useFakeTimers();
    const downloader = vi.fn().mockResolvedValue(Buffer.from('media'));
    registryGet.mockReturnValue({ getMediaDownloader: () => downloader });

    const promise = waitForMediaDownloader(60_000, 5, 7);

    await expect(promise).resolves.toBe(downloader);
    // Must look up (workspaceId=7, accountId=5) - the job's own routing
    // data, not the default workspace and not another account.
    expect(registryGet).toHaveBeenCalledWith(7, 5);
    // Must never touch the legacy singleton for an account-scoped job.
    expect(legacyGetMediaDownloader).not.toHaveBeenCalled();
  });

  it('keeps waiting (never falls back to another socket) while the account session is absent', async () => {
    vi.useFakeTimers();
    registryGet.mockReturnValue(undefined);

    const promise = waitForMediaDownloader(4_000, 5, 1);
    await vi.advanceTimersByTimeAsync(4_000);

    await expect(promise).resolves.toBeNull();
    // The account's session really was polled (registry, job workspace).
    expect(registryGet).toHaveBeenCalledWith(1, 5);
    // The legacy singleton must stay untouched even after the timeout.
    expect(legacyGetMediaDownloader).not.toHaveBeenCalled();
  });
});
