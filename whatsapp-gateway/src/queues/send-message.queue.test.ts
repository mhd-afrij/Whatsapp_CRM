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
  findMessageByWhatsappId,
  setOutboundWhatsappId,
  findMessageMediaByMessageId,
  insertMessageMedia,
} = vi.hoisted(() => ({
  sendContent: vi.fn(),
  markProcessing: vi.fn().mockResolvedValue(undefined),
  markSent: vi.fn().mockResolvedValue(undefined),
  markFailed: vi.fn().mockResolvedValue(undefined),
  insertOutboundMessage: vi.fn(),
  updateMessageStatus: vi.fn().mockResolvedValue(undefined),
  recordProcessingFailure: vi.fn().mockResolvedValue(undefined),
  findMessageByWhatsappId: vi.fn().mockResolvedValue(null),
  setOutboundWhatsappId: vi.fn().mockResolvedValue(undefined),
  findMessageMediaByMessageId: vi.fn().mockResolvedValue(null),
  insertMessageMedia: vi.fn().mockResolvedValue(undefined),
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
        findMessageByWhatsappId,
        setOutboundWhatsappId,
        findMessageMediaByMessageId,
        insertMessageMedia,
      };
    }),
  };
});

const emitMessageCreated = vi.fn();
const emitMessageFailed = vi.fn();
const emitMessageUpdated = vi.fn();
vi.mock('../lib/socket-server', () => ({
  emitMessageCreated: (...args: unknown[]) => emitMessageCreated(...args),
  emitMessageFailed: (...args: unknown[]) => emitMessageFailed(...args),
  emitMessageUpdated: (...args: unknown[]) => emitMessageUpdated(...args),
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

  it('persists the queued row before the send, then flips it to sent', async () => {
    sendContent.mockResolvedValue({ id: 'WA-1' });
    insertOutboundMessage.mockResolvedValue({ messageId: 55 });

    const result = await processSendMessage(makeJob(baseData));

    expect(result).toEqual({ whatsappMessageId: 'WA-1' });
    expect(markProcessing).toHaveBeenCalledWith(1);
    expect(insertOutboundMessage).toHaveBeenCalledWith(
      1,
      10,
      expect.objectContaining({ status: 'queued', whatsappMessageId: 'queued:1' }),
    );
    expect(setOutboundWhatsappId).toHaveBeenCalledWith(55, 'WA-1');
    expect(updateMessageStatus).toHaveBeenCalledWith(55, 'sent');
    expect(markSent).toHaveBeenCalledWith(1, 55);
    expect(emitMessageCreated).toHaveBeenCalledTimes(1);
    expect(emitMessageUpdated).toHaveBeenCalledWith(
      1,
      10,
      expect.objectContaining({
        messageId: 55,
        changes: expect.objectContaining({ status: 'sent' }),
      }),
    );
  });

  it('retry-then-succeed: a transient send failure throws so BullMQ retries, and a later attempt succeeds', async () => {
    sendContent.mockRejectedValueOnce(new Error('transient network error'));
    await expect(processSendMessage(makeJob(baseData))).rejects.toThrow('transient network error');
    expect(markSent).not.toHaveBeenCalled();
    expect(setOutboundWhatsappId).not.toHaveBeenCalled();
    expect(insertOutboundMessage).toHaveBeenCalledTimes(1);

    sendContent.mockResolvedValueOnce({ id: 'WA-2' });
    insertOutboundMessage.mockResolvedValueOnce({ messageId: 56 });
    const result = await processSendMessage(makeJob(baseData));

    expect(result).toEqual({ whatsappMessageId: 'WA-2' });
    expect(markSent).toHaveBeenCalledWith(1, 56);
  });

  it('a retry where the queued row already exists reuses it instead of inserting a duplicate', async () => {
    insertOutboundMessage.mockRejectedValueOnce(Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' }));
    findMessageByWhatsappId.mockResolvedValueOnce({
      id: 55,
      workspace_id: 1,
      conversation_id: 10,
      whatsapp_message_id: 'queued:1',
      direction: 'outbound',
      message_type: 'text',
      body: 'hi',
      status: 'queued',
    });
    sendContent.mockResolvedValue({ id: 'WA-3' });

    const result = await processSendMessage(makeJob(baseData));

    expect(result).toEqual({ whatsappMessageId: 'WA-3' });
    expect(markSent).toHaveBeenCalledWith(1, 55);
    expect(updateMessageStatus).toHaveBeenCalledWith(55, 'sent');
  });

  it('a retry where a prior attempt already sent finalizes the dispatch without sending again', async () => {
    insertOutboundMessage.mockRejectedValueOnce(Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' }));
    findMessageByWhatsappId.mockResolvedValueOnce({
      id: 55,
      workspace_id: 1,
      conversation_id: 10,
      whatsapp_message_id: 'WA-9',
      direction: 'outbound',
      message_type: 'text',
      body: 'hi',
      status: 'sent',
    });

    const result = await processSendMessage(makeJob(baseData));

    expect(result).toEqual({ whatsappMessageId: 'WA-9' });
    expect(markSent).toHaveBeenCalledWith(1, 55);
    expect(sendContent).not.toHaveBeenCalled();
    expect(setOutboundWhatsappId).not.toHaveBeenCalled();
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

  it('retry-exhausted: flips the persisted queued message row to failed', async () => {
    findMessageByWhatsappId.mockResolvedValueOnce({
      id: 55,
      workspace_id: 1,
      conversation_id: 10,
      whatsapp_message_id: 'queued:1',
      direction: 'outbound',
      message_type: 'text',
      body: 'hi',
      status: 'queued',
    });
    const job = { data: baseData, attemptsMade: 4, opts: { attempts: 4 } };

    await handleSendMessageFailure(job, new Error('number not on WhatsApp'));

    expect(updateMessageStatus).toHaveBeenCalledWith(55, 'failed');
    expect(emitMessageUpdated).toHaveBeenCalledWith(
      1,
      10,
      expect.objectContaining({
        messageId: 55,
        changes: expect.objectContaining({ status: 'failed' }),
      }),
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
