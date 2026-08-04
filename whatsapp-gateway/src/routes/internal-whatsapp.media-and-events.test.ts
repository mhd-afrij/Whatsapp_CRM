import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';

vi.mock('../whatsapp/manager-instance', () => ({
  connectionManager: { getSnapshot: vi.fn().mockReturnValue({}) },
}));

const { findMessageMediaById } = vi.hoisted(() => ({
  findMessageMediaById: vi.fn(),
}));
vi.mock('../whatsapp/message-repository', () => ({
  MessageRepository: vi.fn().mockImplementation(function FakeMessageRepository() {
    return { findMessageMediaById: (...args: unknown[]) => findMessageMediaById(...args) };
  }),
}));

const { resolveMediaAccess } = vi.hoisted(() => ({ resolveMediaAccess: vi.fn() }));
vi.mock('../lib/media-access', () => ({
  resolveMediaAccess: (...args: unknown[]) => resolveMediaAccess(...args),
}));

const { emitConversationEvent, emitNotificationCreated } = vi.hoisted(() => ({
  emitConversationEvent: vi.fn(),
  emitNotificationCreated: vi.fn(),
}));
vi.mock('../lib/socket-server', () => ({
  emitConversationEvent: (...args: unknown[]) => emitConversationEvent(...args),
  emitNotificationCreated: (...args: unknown[]) => emitNotificationCreated(...args),
}));

import { createInternalWhatsappRouter } from './internal-whatsapp.routes';

describe('internal media/url and events/emit routes', () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    vi.clearAllMocks();
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

  const headers = { 'X-Internal-Gateway-Token': 'test-internal-gateway-token' };

  describe('GET /internal/whatsapp/media/:mediaId/url', () => {
    it('rejects requests without the internal gateway token', async () => {
      const res = await fetch(`${baseUrl}/internal/whatsapp/media/5/url?workspaceId=1`);
      expect(res.status).toBe(401);
      expect(findMessageMediaById).not.toHaveBeenCalled();
    });

    it('returns 404 when the media row does not exist for the workspace', async () => {
      findMessageMediaById.mockResolvedValueOnce(null);
      const res = await fetch(`${baseUrl}/internal/whatsapp/media/5/url?workspaceId=1`, { headers });
      expect(res.status).toBe(404);
    });

    it('returns a signed URL payload and never the raw storage_path/bucket', async () => {
      findMessageMediaById.mockResolvedValueOnce({
        id: 5,
        message_id: 99,
        storage_path: '1/99/deadbeef.jpg',
        mime_type: 'image/jpeg',
      });
      resolveMediaAccess.mockResolvedValueOnce({
        kind: 'signed_url',
        url: 'https://minio.local/signed?sig=xyz',
        expiresInSeconds: 300,
      });

      const res = await fetch(`${baseUrl}/internal/whatsapp/media/5/url?workspaceId=1`, { headers });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { kind: string; url: string } };
      expect(body.data.kind).toBe('signed_url');
      expect(body.data.url).toBe('https://minio.local/signed?sig=xyz');
      expect(JSON.stringify(body)).not.toContain('1/99/deadbeef.jpg');
      expect(resolveMediaAccess).toHaveBeenCalledWith('1/99/deadbeef.jpg');
    });
  });

  describe('POST /internal/whatsapp/events/emit', () => {
    it('rejects an unknown event name', async () => {
      const res = await fetch(`${baseUrl}/internal/whatsapp/events/emit`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'not.a.real.event', workspaceId: 1 }),
      });
      expect(res.status).toBe(400);
      expect(emitConversationEvent).not.toHaveBeenCalled();
    });

    it('relays a conversation.assigned event to the socket layer', async () => {
      const res = await fetch(`${baseUrl}/internal/whatsapp/events/emit`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'conversation.assigned',
          workspaceId: 1,
          conversationId: 42,
          payload: { assignedUserId: 7 },
        }),
      });
      expect(res.status).toBe(200);
      expect(emitConversationEvent).toHaveBeenCalledWith('conversation.assigned', 1, 42, {
        assignedUserId: 7,
      });
    });

    it('relays a notification.created event to the user room, not the inbox', async () => {
      const res = await fetch(`${baseUrl}/internal/whatsapp/events/emit`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'notification.created',
          workspaceId: 1,
          userId: 9,
          payload: { notification: { id: 1, type: 'task.assigned' } },
        }),
      });
      expect(res.status).toBe(200);
      expect(emitNotificationCreated).toHaveBeenCalledWith(1, 9, {
        notification: { id: 1, type: 'task.assigned' },
      });
      expect(emitConversationEvent).not.toHaveBeenCalled();
    });

    it('rejects notification.created without a userId', async () => {
      const res = await fetch(`${baseUrl}/internal/whatsapp/events/emit`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'notification.created', workspaceId: 1 }),
      });
      expect(res.status).toBe(400);
      expect(emitNotificationCreated).not.toHaveBeenCalled();
    });
  });
});
