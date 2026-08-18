import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  findMessageByWhatsappId,
  updateMessageStatus,
  insertMessageStatusEvent,
  recordProcessingFailure,
  emitMessageUpdated,
  emitConversationRead,
} = vi.hoisted(() => ({
  findMessageByWhatsappId: vi.fn().mockResolvedValue(null),
  updateMessageStatus: vi.fn().mockResolvedValue(undefined),
  insertMessageStatusEvent: vi.fn().mockResolvedValue(undefined),
  recordProcessingFailure: vi.fn().mockResolvedValue(undefined),
  emitMessageUpdated: vi.fn(),
  emitConversationRead: vi.fn(),
}));

vi.mock('./message-repository', () => ({
  MessageRepository: vi.fn().mockImplementation(function FakeMessageRepository() {
    return {
      findMessageByWhatsappId: (...args: unknown[]) => findMessageByWhatsappId(...args),
      updateMessageStatus: (...args: unknown[]) => updateMessageStatus(...args),
      insertMessageStatusEvent: (...args: unknown[]) => insertMessageStatusEvent(...args),
      recordProcessingFailure: (...args: unknown[]) => recordProcessingFailure(...args),
    };
  }),
}));

vi.mock('../lib/socket-server', () => ({
  emitMessageUpdated: (...args: unknown[]) => emitMessageUpdated(...args),
  emitConversationRead: (...args: unknown[]) => emitConversationRead(...args),
}));

import { handleMessagesUpdate } from './status-pipeline';

function outboundMessage(id = 1, overrides: Record<string, unknown> = {}) {
  return {
    id,
    workspace_id: 1,
    conversation_id: 10,
    whatsapp_message_id: 'ABC123',
    direction: 'outbound',
    message_type: 'text',
    body: 'hi',
    status: 'sent',
    delivered_at: null,
    read_at: null,
    ...overrides,
  };
}

function update(status: number, id = 'ABC123') {
  return { key: { id }, update: { status } };
}

describe('handleMessagesUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates status to delivered, stamps delivered_at, and emits the timestamp', async () => {
    findMessageByWhatsappId.mockResolvedValue(outboundMessage(1, { status: 'sent' }));

    await handleMessagesUpdate(1, [update(3)]);

    expect(updateMessageStatus).toHaveBeenCalledWith(
      1,
      'delivered',
      expect.any(Date),
    );
    expect(insertMessageStatusEvent).toHaveBeenCalledWith(1, 'delivered', expect.anything());
    expect(emitMessageUpdated).toHaveBeenCalledWith(1, 10, {
      messageId: 1,
      changes: {
        status: 'delivered',
        delivered_at: expect.any(String),
      },
    });
    expect(emitConversationRead).not.toHaveBeenCalled();
  });

  it('updates status to read, stamps read_at, and emits conversation.read', async () => {
    findMessageByWhatsappId.mockResolvedValue(outboundMessage(1, { status: 'delivered' }));

    await handleMessagesUpdate(1, [update(4)]);

    expect(updateMessageStatus).toHaveBeenCalledWith(1, 'read', expect.any(Date));
    expect(emitMessageUpdated).toHaveBeenCalledWith(1, 10, {
      messageId: 1,
      changes: {
        status: 'read',
        read_at: expect.any(String),
      },
    });
    expect(emitConversationRead).toHaveBeenCalledWith(1, 10, {
      conversationId: 10,
      readAt: expect.any(String),
    });
  });

  it('ignores a read receipt that would regress an already-read message', async () => {
    findMessageByWhatsappId.mockResolvedValue(outboundMessage(1, { status: 'read' }));

    await handleMessagesUpdate(1, [update(3)]);

    expect(updateMessageStatus).not.toHaveBeenCalled();
    expect(insertMessageStatusEvent).not.toHaveBeenCalled();
    expect(emitMessageUpdated).not.toHaveBeenCalled();
  });

  it('ignores status updates for inbound messages', async () => {
    findMessageByWhatsappId.mockResolvedValue(outboundMessage(1, { direction: 'inbound' }));

    await handleMessagesUpdate(1, [update(4)]);

    expect(updateMessageStatus).not.toHaveBeenCalled();
    expect(insertMessageStatusEvent).not.toHaveBeenCalled();
    expect(emitMessageUpdated).not.toHaveBeenCalled();
  });

  it('ignores receipts for messages it does not know about', async () => {
    findMessageByWhatsappId.mockResolvedValue(null);

    await handleMessagesUpdate(1, [update(3)]);

    expect(updateMessageStatus).not.toHaveBeenCalled();
    expect(emitMessageUpdated).not.toHaveBeenCalled();
  });

  it('ignores unknown or missing status codes', async () => {
    findMessageByWhatsappId.mockResolvedValue(outboundMessage(1));

    await handleMessagesUpdate(1, [update(1), update(5), { key: { id: 'X' }, update: {} }]);

    expect(updateMessageStatus).not.toHaveBeenCalled();
    expect(emitMessageUpdated).not.toHaveBeenCalled();
  });

  it('records a processing failure when the repository throws', async () => {
    findMessageByWhatsappId.mockRejectedValue(new Error('db down'));

    await handleMessagesUpdate(1, [update(3)]);

    expect(recordProcessingFailure).toHaveBeenCalledWith(
      1,
      'persist',
      'db down',
      expect.objectContaining({ whatsappMessageId: 'ABC123' }),
    );
  });
});
