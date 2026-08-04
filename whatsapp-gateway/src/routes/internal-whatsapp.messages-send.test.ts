import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';

vi.mock('../whatsapp/manager-instance', () => ({
  connectionManager: {
    getSnapshot: vi.fn().mockReturnValue({}),
  },
}));

const { findByIdempotencyKey, createPending, setBullmqJobId } = vi.hoisted(() => ({
  findByIdempotencyKey: vi.fn(),
  createPending: vi.fn(),
  setBullmqJobId: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../whatsapp/dispatch-repository', () => ({
  DispatchRepository: vi.fn().mockImplementation(function FakeDispatchRepository() {
    return {
      findByIdempotencyKey: (...args: unknown[]) => findByIdempotencyKey(...args),
      createPending: (...args: unknown[]) => createPending(...args),
      setBullmqJobId,
    };
  }),
}));

const { getConversationJid } = vi.hoisted(() => ({
  getConversationJid: vi.fn().mockResolvedValue('2547000000@s.whatsapp.net'),
}));
vi.mock('../whatsapp/message-repository', () => ({
  MessageRepository: vi.fn().mockImplementation(function FakeMessageRepository() {
    return { getConversationJid: (...args: unknown[]) => getConversationJid(...args) };
  }),
}));

const { queueAdd } = vi.hoisted(() => ({ queueAdd: vi.fn().mockResolvedValue({ id: 'job-1' }) }));
vi.mock('../queues/send-message.queue', () => ({
  sendMessageQueue: { add: (...args: unknown[]) => queueAdd(...args) },
}));

import { createInternalWhatsappRouter } from './internal-whatsapp.routes';

describe('POST /internal/whatsapp/messages/send', () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    getConversationJid.mockResolvedValue('2547000000@s.whatsapp.net');
    queueAdd.mockResolvedValue({ id: 'job-1' });

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

  function post(body: unknown) {
    return fetch(`${baseUrl}/internal/whatsapp/messages/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Gateway-Token': 'test-internal-gateway-token' },
      body: JSON.stringify(body),
    });
  }

  const requestBody = {
    conversationId: 10,
    workspaceId: 1,
    content: 'hello',
    idempotencyKey: 'idem-key-123',
  };

  it('enqueues exactly one BullMQ job for two requests sharing an idempotencyKey', async () => {
    findByIdempotencyKey.mockResolvedValueOnce(null);
    createPending.mockResolvedValueOnce({ id: 42, status: 'pending', message_id: null, bullmq_job_id: null });

    const first = await post(requestBody);
    expect(first.status).toBe(202);
    const firstBody = (await first.json()) as { data: { dispatchId: number } };
    expect(firstBody.data.dispatchId).toBe(42);

    // Second request: the idempotency lookup now finds the row created above.
    findByIdempotencyKey.mockResolvedValueOnce({
      id: 42,
      status: 'pending',
      message_id: null,
      bullmq_job_id: 'job-1',
    });

    const second = await post(requestBody);
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { data: { dispatchId: number } };
    expect(secondBody.data.dispatchId).toBe(42);

    expect(queueAdd).toHaveBeenCalledTimes(1);
    expect(createPending).toHaveBeenCalledTimes(1);
  });

  it('rejects requests missing the internal gateway token', async () => {
    const res = await fetch(`${baseUrl}/internal/whatsapp/messages/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    expect(res.status).toBe(401);
  });
});
