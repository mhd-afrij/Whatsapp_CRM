import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';

/**
 * Phase 18 gap fill: the internal-token auth boundary (requireInternalToken in
 * internal-whatsapp.routes.ts) was previously only exercised incidentally, via
 * other route tests always sending a valid token. This file tests the gate
 * itself, across several representative routes, so a regression that weakens
 * or bypasses it would be caught directly rather than by accident.
 */

vi.mock('../whatsapp/manager-instance', () => ({
  connectionManager: {
    getSnapshot: vi.fn().mockReturnValue({ status: 'connected' }),
    start: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../whatsapp/dispatch-repository', () => ({
  DispatchRepository: vi.fn().mockImplementation(function FakeDispatchRepository() {
    return {
      findByIdempotencyKey: vi.fn().mockResolvedValue(null),
      createPending: vi.fn().mockResolvedValue({ id: 1, status: 'pending', message_id: null, bullmq_job_id: null }),
      setBullmqJobId: vi.fn().mockResolvedValue(undefined),
    };
  }),
}));

vi.mock('../whatsapp/message-repository', () => ({
  MessageRepository: vi.fn().mockImplementation(function FakeMessageRepository() {
    return {
      getConversationJid: vi.fn().mockResolvedValue('2547000000@s.whatsapp.net'),
      findMessageMediaById: vi.fn().mockResolvedValue(null),
    };
  }),
}));

vi.mock('../queues/send-message.queue', () => ({
  sendMessageQueue: { add: vi.fn().mockResolvedValue({ id: 'job-1' }) },
}));

import { createInternalWhatsappRouter } from './internal-whatsapp.routes';

describe('internal gateway API - requireInternalToken auth boundary', () => {
  let server: Server;
  let baseUrl: string;
  const validToken = 'test-internal-gateway-token';

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

  it('rejects a request to a GET route with no token header at all', async () => {
    const res = await fetch(`${baseUrl}/internal/whatsapp/status`);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(false);
  });

  it('rejects a request with an empty-string token header', async () => {
    const res = await fetch(`${baseUrl}/internal/whatsapp/status`, {
      headers: { 'X-Internal-Gateway-Token': '' },
    });
    expect(res.status).toBe(401);
  });

  it('rejects a request with a wrong (but well-formed) token', async () => {
    const res = await fetch(`${baseUrl}/internal/whatsapp/status`, {
      headers: { 'X-Internal-Gateway-Token': 'definitely-not-the-real-token' },
    });
    expect(res.status).toBe(401);
  });

  it('rejects a token that is a strict prefix of the real token (no partial-match bypass)', async () => {
    const res = await fetch(`${baseUrl}/internal/whatsapp/status`, {
      headers: { 'X-Internal-Gateway-Token': validToken.slice(0, -1) },
    });
    expect(res.status).toBe(401);
  });

  it('accepts the correct token on the GET /status route', async () => {
    const res = await fetch(`${baseUrl}/internal/whatsapp/status`, {
      headers: { 'X-Internal-Gateway-Token': validToken },
    });
    expect(res.status).toBe(200);
  });

  it('applies the same gate to a POST route (not just GET) - /connect', async () => {
    const unauthorized = await fetch(`${baseUrl}/internal/whatsapp/connect`, { method: 'POST' });
    expect(unauthorized.status).toBe(401);

    const authorized = await fetch(`${baseUrl}/internal/whatsapp/connect`, {
      method: 'POST',
      headers: { 'X-Internal-Gateway-Token': validToken },
    });
    expect(authorized.status).toBe(200);
  });

  it('applies the same gate to the messages/send route body-validated endpoint', async () => {
    const res = await fetch(`${baseUrl}/internal/whatsapp/messages/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: 1, workspaceId: 1, content: 'x', idempotencyKey: 'k' }),
    });
    // No token at all: the auth gate must reject before body validation ever runs.
    expect(res.status).toBe(401);
  });
});
