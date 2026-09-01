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

const { putObjectMock } = vi.hoisted(() => ({
  putObjectMock: vi.fn().mockResolvedValue('1/outbound/abc.png'),
}));
vi.mock('../lib/storage', () => ({
  getStorageClient: () => ({ putObject: (...args: unknown[]) => putObjectMock(...args) }),
}));

const { emitConversationEvent, emitNotificationCreated, emitContactEvent } = vi.hoisted(() => ({
  emitConversationEvent: vi.fn(),
  emitNotificationCreated: vi.fn(),
  emitContactEvent: vi.fn(),
}));
vi.mock('../lib/socket-server', () => ({
  emitConversationEvent: (...args: unknown[]) => emitConversationEvent(...args),
  emitNotificationCreated: (...args: unknown[]) => emitNotificationCreated(...args),
  emitContactEvent: (...args: unknown[]) => emitContactEvent(...args),
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

  describe('POST /internal/whatsapp/media/upload', () => {
    function upload(file: Blob, extraFields: Record<string, string> = {}) {
      const form = new FormData();
      form.append('file', file, 'photo.png');
      for (const [key, value] of Object.entries(extraFields)) {
        form.append(key, value);
      }
      return fetch(`${baseUrl}/internal/whatsapp/media/upload`, {
        method: 'POST',
        headers: { 'X-Internal-Gateway-Token': 'test-internal-gateway-token' },
        body: form,
      });
    }

    it('stores an allowed file and returns only a storage key + metadata', async () => {
      const bytes = Buffer.from('fake png bytes');
      putObjectMock.mockResolvedValueOnce('1/outbound/abc.png');

      const res = await upload(new Blob([bytes], { type: 'image/png' }), { workspaceId: '1' });

      expect(res.status).toBe(201);
      const body = (await res.json()) as {
        data: { storagePath: string; mimeType: string; sizeBytes: number; checksumSha256: string; fileName: string };
      };
      expect(body.data.storagePath).toMatch(/^1\/outbound\/[0-9a-f-]+\.png$/);
      expect(body.data.mimeType).toBe('image/png');
      expect(body.data.sizeBytes).toBe(bytes.length);
      expect(body.data.checksumSha256).toHaveLength(64);
      expect(putObjectMock).toHaveBeenCalledTimes(1);
    });

    it('rejects a disallowed MIME type before storing anything', async () => {
      const res = await upload(new Blob([Buffer.from('nope')], { type: 'application/x-msdownload' }), {
        workspaceId: '1',
      });

      expect(res.status).toBe(415);
      expect(putObjectMock).not.toHaveBeenCalled();
    });

    it('requires a workspaceId field', async () => {
      const res = await upload(new Blob([Buffer.from('fake')], { type: 'image/png' }));

      expect(res.status).toBe(400);
      expect(putObjectMock).not.toHaveBeenCalled();
    });

    it('rejects requests without the internal gateway token', async () => {
      const form = new FormData();
      form.append('file', new Blob([Buffer.from('fake')], { type: 'image/png' }), 'photo.png');
      const res = await fetch(`${baseUrl}/internal/whatsapp/media/upload`, { method: 'POST', body: form });

      expect(res.status).toBe(401);
      expect(putObjectMock).not.toHaveBeenCalled();
    });
  });

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

    it('relays a contact.created event to the workspace socket rooms', async () => {
      const res = await fetch(`${baseUrl}/internal/whatsapp/events/emit`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'contact.created',
          workspaceId: 1,
          payload: { contact_id: 5 },
        }),
      });
      expect(res.status).toBe(200);
      expect(emitContactEvent).toHaveBeenCalledWith('contact.created', 1, {
        contact_id: 5,
      });
      expect(emitConversationEvent).not.toHaveBeenCalled();
    });

    it('relays a contact.updated event and ignores conversationId on contact events', async () => {
      const res = await fetch(`${baseUrl}/internal/whatsapp/events/emit`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'contact.updated',
          workspaceId: 1,
          conversationId: 42,
          payload: { contact_id: 9 },
        }),
      });
      expect(res.status).toBe(200);
      expect(emitContactEvent).toHaveBeenCalledWith('contact.updated', 1, {
        contact_id: 9,
      });
      expect(emitConversationEvent).not.toHaveBeenCalled();
    });

    it('relays a contact.deleted event to the workspace socket rooms', async () => {
      const res = await fetch(`${baseUrl}/internal/whatsapp/events/emit`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'contact.deleted',
          workspaceId: 3,
          payload: { contact_id: 11 },
        }),
      });
      expect(res.status).toBe(200);
      expect(emitContactEvent).toHaveBeenCalledWith('contact.deleted', 3, {
        contact_id: 11,
      });
    });
  });
});
