import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Exercises the "retry exhausted -> permanent failure" path in isolation:
 * BullMQ itself (attempts/backoff) is trusted (it's a well-tested library),
 * so this fakes the `Worker` constructor and directly invokes the `failed`
 * listener the same way BullMQ would once `job.attemptsMade` reaches the
 * configured `attempts` ceiling, then asserts a *distinct* terminal record is
 * persisted (`error_context.permanent: true`) rather than treating it the
 * same as an in-flight retry.
 */

let capturedFailedHandler: ((job: unknown, err: Error) => Promise<void> | void) | null = null;

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(function FakeQueue() {
    return { add: vi.fn(), close: vi.fn() };
  }),
  Worker: vi.fn().mockImplementation(function FakeWorker() {
    return {
      on: (event: string, handler: (job: unknown, err: Error) => Promise<void> | void) => {
        if (event === 'failed') capturedFailedHandler = handler;
      },
      run: vi.fn(),
      close: vi.fn(),
    };
  }),
}));

const { recordProcessingFailure } = vi.hoisted(() => ({
  recordProcessingFailure: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../whatsapp/message-repository', () => ({
  MessageRepository: vi.fn().mockImplementation(function FakeMessageRepository() {
    return { recordProcessingFailure: (...args: unknown[]) => recordProcessingFailure(...args) };
  }),
}));

vi.mock('../whatsapp/manager-instance', () => ({
  connectionManager: { getMediaDownloader: vi.fn().mockReturnValue(null) },
}));

describe('media download worker: retry-then-permanent-failure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedFailedHandler = null;
  });

  it('persists a distinct permanent-failure record only once retries are exhausted', async () => {
    const { createMediaDownloadWorker } = await import('./media-download.queue');
    createMediaDownloadWorker();
    expect(capturedFailedHandler).not.toBeNull();

    const baseJobData = {
      workspaceId: 1,
      messageId: 99,
      whatsappMessageId: 'wamid-1',
      mimeType: 'image/png',
    };

    // Attempt 1 of 4: not exhausted yet - no permanent-failure record.
    await capturedFailedHandler!(
      { id: 'job-1', data: baseJobData, attemptsMade: 1, opts: { attempts: 4 } },
      new Error('transient network error'),
    );
    expect(recordProcessingFailure).not.toHaveBeenCalled();

    // Attempt 4 of 4: exhausted - record a distinct permanent failure.
    await capturedFailedHandler!(
      { id: 'job-1', data: baseJobData, attemptsMade: 4, opts: { attempts: 4 } },
      new Error('transient network error'),
    );

    expect(recordProcessingFailure).toHaveBeenCalledTimes(1);
    expect(recordProcessingFailure).toHaveBeenCalledWith(
      1,
      'media_download',
      'transient network error',
      expect.objectContaining({ permanent: true, attemptsMade: 4 }),
    );
  });
});
