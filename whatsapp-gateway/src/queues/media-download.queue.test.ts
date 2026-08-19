import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(function FakeQueue() {
    return { add: vi.fn(), close: vi.fn() };
  }),
  Worker: vi.fn().mockImplementation(function FakeWorker() {
    return { on: vi.fn(), run: vi.fn(), close: vi.fn() };
  }),
}));

import { validateMedia, MediaValidationError, waitForMediaDownloader } from './media-download.queue';
import { connectionManager } from '../whatsapp/manager-instance';
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
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('waits for the socket to come back instead of failing fast on a disconnect', async () => {
    vi.useFakeTimers();
    const downloader = vi.fn().mockResolvedValue(Buffer.from('media'));
    vi.spyOn(connectionManager, 'getMediaDownloader')
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null)
      .mockReturnValue(downloader as never);

    const promise = waitForMediaDownloader(60_000);
    // Two polls return null (each sleeping 2s), the third finds the socket.
    await vi.advanceTimersByTimeAsync(4_100);
    await expect(promise).resolves.toBe(downloader);
  });

  it('returns null once the timeout elapses with no socket', async () => {
    vi.useFakeTimers();
    vi.spyOn(connectionManager, 'getMediaDownloader').mockReturnValue(null);

    const promise = waitForMediaDownloader(2_000);
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(promise).resolves.toBeNull();
  });
});
