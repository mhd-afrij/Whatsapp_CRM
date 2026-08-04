import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'bullmq';

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(function FakeQueue() {
    return { add: vi.fn(), close: vi.fn() };
  }),
  Worker: vi.fn().mockImplementation(function FakeWorker() {
    return { on: vi.fn(), run: vi.fn(), close: vi.fn() };
  }),
}));

const {
  sendContent,
  markProcessing,
  markSent,
  markFailed,
  insertOutboundMessage,
  updateMessageStatus,
  recordProcessingFailure,
} = vi.hoisted(() => ({
  sendContent: vi.fn(),
  markProcessing: vi.fn().mockResolvedValue(undefined),
  markSent: vi.fn().mockResolvedValue(undefined),
  markFailed: vi.fn().mockResolvedValue(undefined),
  insertOutboundMessage: vi.fn(),
  updateMessageStatus: vi.fn().mockResolvedValue(undefined),
  recordProcessingFailure: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../whatsapp/manager-instance', () => ({
  connectionManager: { sendContent: (...args: unknown[]) => sendContent(...args) },
}));

vi.mock('../whatsapp/dispatch-repository', () => ({
  DispatchRepository: vi.fn().mockImplementation(function FakeDispatchRepository() {
    return { markProcessing, markSent, markFailed };
  }),
}));

vi.mock('../whatsapp/message-repository', async () => {
  const actual = await vi.importActual<typeof import('../whatsapp/message-repository')>(
    '../whatsapp/message-repository',
  );
  return {
    ...actual,
    MessageRepository: vi.fn().mockImplementation(function FakeMessageRepository() {
      return {
        insertOutboundMessage: (...args: unknown[]) => insertOutboundMessage(...args),
        updateMessageStatus,
        recordProcessingFailure: (...args: unknown[]) => recordProcessingFailure(...args),
      };
    }),
  };
});

const emitMessageCreated = vi.fn();
const emitMessageFailed = vi.fn();
vi.mock('../lib/socket-server', () => ({
  emitMessageCreated: (...args: unknown[]) => emitMessageCreated(...args),
  emitMessageFailed: (...args: unknown[]) => emitMessageFailed(...args),
}));

import { processSendMessage, handleSendMessageFailure, type SendMessageJobData } from './send-message.queue';

function makeJob(data: SendMessageJobData): Job<SendMessageJobData> {
  return { data } as Job<SendMessageJobData>;
}

describe('send-message queue processor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseData: SendMessageJobData = {
    dispatchId: 1,
    workspaceId: 1,
    conversationId: 10,
    waJid: '2547000000@s.whatsapp.net',
    content: 'hi',
  };

  it('sends successfully and marks the dispatch row sent', async () => {
    sendContent.mockResolvedValue({ id: 'WA-1' });
    insertOutboundMessage.mockResolvedValue({ messageId: 55 });

    const result = await processSendMessage(makeJob(baseData));

    expect(result).toEqual({ whatsappMessageId: 'WA-1' });
    expect(markProcessing).toHaveBeenCalledWith(1);
    expect(markSent).toHaveBeenCalledWith(1, 55);
    expect(emitMessageCreated).toHaveBeenCalledTimes(1);
  });

  it('retry-then-succeed: a transient send failure throws so BullMQ retries, and a later attempt succeeds', async () => {
    sendContent.mockRejectedValueOnce(new Error('transient network error'));
    await expect(processSendMessage(makeJob(baseData))).rejects.toThrow('transient network error');
    expect(markSent).not.toHaveBeenCalled();

    sendContent.mockResolvedValueOnce({ id: 'WA-2' });
    insertOutboundMessage.mockResolvedValueOnce({ messageId: 56 });
    const result = await processSendMessage(makeJob(baseData));

    expect(result).toEqual({ whatsappMessageId: 'WA-2' });
    expect(markSent).toHaveBeenCalledWith(1, 56);
  });

  it('retry-exhausted: marks the dispatch row permanently failed and emits message.failed', async () => {
    const job = { data: baseData, attemptsMade: 4, opts: { attempts: 4 } };

    await handleSendMessageFailure(job, new Error('number not on WhatsApp'));

    expect(markFailed).toHaveBeenCalledWith(1);
    expect(emitMessageFailed).toHaveBeenCalledWith(
      1,
      10,
      null,
      expect.objectContaining({ errorMessage: 'number not on WhatsApp', attempts: 4 }),
    );
  });

  it('retry-exhausted: writes a durable dead-letter record to message_processing_failures', async () => {
    const job = { data: baseData, attemptsMade: 4, opts: { attempts: 4 } };

    await handleSendMessageFailure(job, new Error('number not on WhatsApp'));

    expect(recordProcessingFailure).toHaveBeenCalledWith(
      1,
      'send',
      'number not on WhatsApp',
      expect.objectContaining({ waJid: baseData.waJid, attemptsMade: 4, permanent: true }),
      { dispatchQueueId: 1, conversationId: 10 },
    );
  });

  it('a dead-letter persistence failure does not prevent markFailed/emitMessageFailed from completing', async () => {
    recordProcessingFailure.mockRejectedValueOnce(new Error('db unavailable'));
    const job = { data: baseData, attemptsMade: 4, opts: { attempts: 4 } };

    await expect(handleSendMessageFailure(job, new Error('number not on WhatsApp'))).resolves.toBeUndefined();

    expect(markFailed).toHaveBeenCalledWith(1);
    expect(emitMessageFailed).toHaveBeenCalledTimes(1);
  });

  it('does not mark permanently failed while retries remain', async () => {
    const job = { data: baseData, attemptsMade: 2, opts: { attempts: 4 } };

    await handleSendMessageFailure(job, new Error('transient'));

    expect(markFailed).not.toHaveBeenCalled();
    expect(emitMessageFailed).not.toHaveBeenCalled();
    expect(recordProcessingFailure).not.toHaveBeenCalled();
  });
});
