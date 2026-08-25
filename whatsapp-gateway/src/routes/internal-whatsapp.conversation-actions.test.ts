import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';

vi.mock('../lib/mysql', () => ({
  execute: vi.fn(),
  query: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('../lib/storage', () => ({
  getStorageClient: vi.fn().mockReturnValue({
    putObject: vi.fn(),
    getObject: vi.fn().mockResolvedValue(Buffer.from('bytes')),
  }),
}));

const manager = vi.hoisted(() => ({
  sendContent: vi.fn().mockResolvedValue({ id: 'forwarded-wa-id-1' }),
}));
vi.mock('../whatsapp/manager-instance', () => ({
  connectionManager: {
    getSnapshot: vi.fn().mockReturnValue({}),
    sendContent: manager.sendContent,
  },
}));

vi.mock('../queues/send-message.queue', () => ({
  sendMessageQueue: { add: vi.fn() },
}));

const socket = vi.hoisted(() => ({
  emitConversationEvent: vi.fn(),
  emitMessageCreated: vi.fn(),
  emitMessageUpdated: vi.fn(),
  emitConversationsReset: vi.fn(),
  emitNotificationCreated: vi.fn(),
  emitTypingUpdated: vi.fn(),
  emitMessageRevoked: vi.fn(),
  getSocketServer: vi.fn().mockReturnValue(null),
}));
vi.mock('../lib/socket-server', () => socket);

const repo = vi.hoisted(() => ({
  markConversationUnread: vi.fn(),
  resetConversationUnread: vi.fn(),
  findMessageById: vi.fn(),
  setMessageStarred: vi.fn(),
  markMessageDeletedForMe: vi.fn(),
  getConversationJid: vi.fn(),
  findMessageMediaByMessageId: vi.fn(),
  insertOutboundMessage: vi.fn(),
  insertMessageMedia: vi.fn(),
}));
vi.mock('../whatsapp/message-repository', () => ({
  MessageRepository: vi.fn().mockImplementation(function FakeMessageRepository() {
    return repo;
  }),
}));

vi.mock('../whatsapp/session-repository', () => ({
  SessionRepository: vi.fn().mockImplementation(function FakeSessionRepository() {
    return {};
  }),
}));
vi.mock('../whatsapp/dispatch-repository', () => ({
  DispatchRepository: vi.fn().mockImplementation(function FakeDispatchRepository() {
    return {};
  }),
}));

import { createInternalWhatsappRouter } from './internal-whatsapp.routes';

describe('conversation actions (mark-unread, read, star, forward)', () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    repo.getConversationJid.mockResolvedValue('2547000000@s.whatsapp.net');
    repo.insertOutboundMessage.mockResolvedValue({ messageId: 77 });

    const app = express();
    app.use(express.json());
    app.use('/internal/whatsapp', createInternalWhatsappRouter());

    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function call(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Response> {
    return fetch(`${baseUrl}/internal/whatsapp${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Internal-Gateway-Token': 'test-internal-gateway-token' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  describe('POST /conversations/:id/mark-unread', () => {
    it('bumps unread_count and emits conversation.updated', async () => {
      repo.markConversationUnread.mockResolvedValueOnce({ unreadCount: 3 });

      const res = await call('POST', '/conversations/10/mark-unread', { workspaceId: 1 });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { conversationId: number; unreadCount: number } };
      expect(body.data).toEqual({ conversationId: 10, unreadCount: 3 });
      expect(repo.markConversationUnread).toHaveBeenCalledWith(10, 1);
      expect(socket.emitConversationEvent).toHaveBeenCalledWith('conversation.updated', 1, 10, { unreadCount: 3 });
    });

    it('404s when the conversation is not in the workspace', async () => {
      repo.markConversationUnread.mockResolvedValueOnce(null);
      const res = await call('POST', '/conversations/10/mark-unread', { workspaceId: 1 });
      expect(res.status).toBe(404);
    });

    it('rejects a missing workspaceId', async () => {
      const res = await call('POST', '/conversations/10/mark-unread', {});
      expect(res.status).toBe(400);
    });
  });

  describe('POST /conversations/:id/read', () => {
    it('resets unread_count to 0 and emits conversation.updated', async () => {
      repo.resetConversationUnread.mockResolvedValueOnce({ unreadCount: 0 });

      const res = await call('POST', '/conversations/10/read', { workspaceId: 1 });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { unreadCount: number } };
      expect(body.data.unreadCount).toBe(0);
      expect(socket.emitConversationEvent).toHaveBeenCalledWith('conversation.updated', 1, 10, { unreadCount: 0 });
    });

    it('404s when the conversation is not in the workspace', async () => {
      repo.resetConversationUnread.mockResolvedValueOnce(null);
      const res = await call('POST', '/conversations/10/read', { workspaceId: 1 });
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /conversations/:id/messages/:messageId/star', () => {
    const message = {
      id: 5,
      workspace_id: 1,
      conversation_id: 10,
      whatsapp_message_id: 'WA_1',
      direction: 'inbound' as const,
      message_type: 'text' as const,
      body: 'hi',
      status: 'sent' as const,
      delivered_at: null,
      read_at: null,
    };

    it('stars a message and emits message.updated', async () => {
      repo.findMessageById.mockResolvedValueOnce(message);
      repo.setMessageStarred.mockResolvedValueOnce({ starredAt: '2026-08-13T10:00:00.000Z' });

      const res = await call('PATCH', '/conversations/10/messages/5/star', { workspaceId: 1, starred: true });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { messageId: number; starredAt: string } };
      expect(body.data.messageId).toBe(5);
      expect(repo.setMessageStarred).toHaveBeenCalledWith(5, 1, true);
      expect(socket.emitMessageUpdated).toHaveBeenCalledWith(1, 10, {
        messageId: 5,
        changes: { starredAt: '2026-08-13T10:00:00.000Z' },
      });
    });

    it('404s when the message belongs to a different conversation', async () => {
      repo.findMessageById.mockResolvedValueOnce({ ...message, conversation_id: 99 });
      const res = await call('PATCH', '/conversations/10/messages/5/star', { workspaceId: 1, starred: true });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /conversations/:id/messages/:messageId/delete-for-me', () => {
    const message = {
      id: 5,
      workspace_id: 1,
      conversation_id: 10,
      whatsapp_message_id: 'WA_1',
      direction: 'inbound' as const,
      message_type: 'text' as const,
      body: 'hi',
      status: 'sent' as const,
      delivered_at: null,
      read_at: null,
    };

    it('stamps deleted_for_me_at and emits message.updated', async () => {
      repo.findMessageById.mockResolvedValueOnce(message);
      repo.markMessageDeletedForMe.mockResolvedValueOnce({ deletedForMeAt: '2026-08-13T10:00:00.000Z' });

      const res = await call('DELETE', '/conversations/10/messages/5/delete-for-me?workspaceId=1', {});
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { messageId: number; deletedForMeAt: string } };
      expect(body.data).toEqual({ messageId: 5, deletedForMeAt: '2026-08-13T10:00:00.000Z' });
      expect(repo.markMessageDeletedForMe).toHaveBeenCalledWith(5, 1);
      expect(socket.emitMessageUpdated).toHaveBeenCalledWith(1, 10, {
        messageId: 5,
        changes: { deletedForMeAt: '2026-08-13T10:00:00.000Z' },
      });
    });

    it('404s when the message belongs to a different conversation', async () => {
      repo.findMessageById.mockResolvedValueOnce({ ...message, conversation_id: 99 });
      const res = await call('DELETE', '/conversations/10/messages/5/delete-for-me?workspaceId=1', {});
      expect(res.status).toBe(404);
      expect(repo.markMessageDeletedForMe).not.toHaveBeenCalled();
    });

    it('rejects a missing workspaceId', async () => {
      const res = await call('DELETE', '/conversations/10/messages/5/delete-for-me', {});
      expect(res.status).toBe(400);
    });
  });

  describe('POST /conversations/:id/messages/forward', () => {
    const sourceMessage = {
      id: 5,
      workspace_id: 1,
      conversation_id: 3,
      whatsapp_message_id: 'WA_SRC',
      direction: 'inbound' as const,
      message_type: 'text' as const,
      body: 'forward me',
      status: 'sent' as const,
      delivered_at: null,
      read_at: null,
    };

    it('forwards a text message with isForwarded contextInfo and persists the row', async () => {
      repo.findMessageById.mockResolvedValueOnce(sourceMessage);
      repo.findMessageMediaByMessageId.mockResolvedValueOnce(null);

      const res = await call('POST', '/conversations/10/messages/forward', {
        workspaceId: 1,
        sourceMessageId: 5,
        requestedByUserId: 2,
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { data: { messageId: number; whatsappMessageId: string } };
      expect(body.data).toEqual({ messageId: 77, whatsappMessageId: 'forwarded-wa-id-1', requestedByUserId: 2 });

      expect(manager.sendContent).toHaveBeenCalledWith('2547000000@s.whatsapp.net', {
        text: 'forward me',
        contextInfo: { isForwarded: true, forwardingScore: 1 },
      });
      expect(repo.insertOutboundMessage).toHaveBeenCalledWith(1, 10, {
        whatsappMessageId: 'forwarded-wa-id-1',
        body: 'forward me',
        messageType: 'text',
        status: 'sent',
      });
      expect(repo.insertMessageMedia).not.toHaveBeenCalled();
      expect(socket.emitMessageCreated).toHaveBeenCalledTimes(1);
    });

    it('forwards a media message by re-reading stored bytes', async () => {
      const { getStorageClient } = await import('../lib/storage');
      repo.findMessageById.mockResolvedValueOnce({ ...sourceMessage, message_type: 'image', body: 'caption' });
      repo.findMessageMediaByMessageId.mockResolvedValueOnce({
        id: 9,
        mime_type: 'image/jpeg',
        file_size_bytes: 1024,
        storage_path: '1/inbound/abc.jpg',
        checksum_sha256: 'cafe',
      });

      const res = await call('POST', '/conversations/10/messages/forward', {
        workspaceId: 1,
        sourceMessageId: 5,
      });
      expect(res.status).toBe(201);
      expect(getStorageClient().getObject).toHaveBeenCalledWith('1/inbound/abc.jpg');
      expect(manager.sendContent).toHaveBeenCalledTimes(1);
      const content = manager.sendContent.mock.calls[0][1] as Record<string, unknown>;
      expect(content.contextInfo).toEqual({ isForwarded: true, forwardingScore: 1 });
      expect(repo.insertMessageMedia).toHaveBeenCalledWith(77, {
        mimeType: 'image/jpeg',
        fileSizeBytes: 1024,
        storagePath: '1/inbound/abc.jpg',
        checksumSha256: 'cafe',
      });
    });

    it('404s when the source message is in another workspace', async () => {
      repo.findMessageById.mockResolvedValueOnce({ ...sourceMessage, workspace_id: 99 });
      const res = await call('POST', '/conversations/10/messages/forward', {
        workspaceId: 1,
        sourceMessageId: 5,
      });
      expect(res.status).toBe(404);
    });

    it('422s when the message has no forwardable content', async () => {
      repo.findMessageById.mockResolvedValueOnce({ ...sourceMessage, body: null });
      repo.findMessageMediaByMessageId.mockResolvedValueOnce(null);
      const res = await call('POST', '/conversations/10/messages/forward', {
        workspaceId: 1,
        sourceMessageId: 5,
      });
      expect(res.status).toBe(422);
    });
  });

  it('rejects requests without the internal gateway token', async () => {
    const res = await fetch(`${baseUrl}/internal/whatsapp/conversations/10/mark-unread`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId: 1 }),
    });
    expect(res.status).toBe(401);
  });
});
