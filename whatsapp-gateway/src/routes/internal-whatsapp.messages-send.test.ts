import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';

vi.mock('../whatsapp/manager-instance', () => ({
  connectionManager: {
    getSnapshot: vi.fn().mockReturnValue({}),
    getSocket: vi.fn().mockReturnValue(null),
  },
  connectionRegistry: {
    getOrCreate: vi.fn().mockReturnValue({ getSnapshot: () => ({ accountId: 5, status: 'connected' }), getSocket: () => null }),
  },
}));

const { findByIdempotencyKey, createPending, setBullmqJobId, markFailed } = vi.hoisted(() => ({
  findByIdempotencyKey: vi.fn(),
  createPending: vi.fn(),
  setBullmqJobId: vi.fn().mockResolvedValue(undefined),
  markFailed: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../whatsapp/dispatch-repository', () => ({
  DispatchRepository: vi.fn().mockImplementation(function FakeDispatchRepository() {
    return {
      findByIdempotencyKey: (...args: unknown[]) => findByIdempotencyKey(...args),
      createPending: (...args: unknown[]) => createPending(...args),
      setBullmqJobId,
      markFailed,
    };
  }),
}));

const { getConversationJid, getConversationAccount } = vi.hoisted(() => ({
  getConversationJid: vi.fn().mockResolvedValue('2547000000@s.whatsapp.net'),
  getConversationAccount: vi.fn(),
}));
vi.mock('../whatsapp/message-repository', () => ({
  MessageRepository: vi.fn().mockImplementation(function FakeMessageRepository() {
    return {
      getConversationJid: (...args: unknown[]) => getConversationJid(...args),
      getConversationAccount: (...args: unknown[]) => getConversationAccount(...args),
    };
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
    // Default: the conversation is a legacy row with no owning account, so
    // the idempotency/media/queue tests below exercise the pre-multi-account
    // behavior. Ownership tests override this per case.
    getConversationAccount.mockResolvedValue({ id: 10, whatsappAccountId: null });
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

  it('forwards outbound media metadata from the request into the BullMQ job', async () => {
    findByIdempotencyKey.mockResolvedValueOnce(null);
    createPending.mockResolvedValueOnce({ id: 43, status: 'pending', message_id: null, bullmq_job_id: null });

    const res = await post({
      conversationId: 10,
      workspaceId: 1,
      content: 'see photo',
      mediaRef: '1/outbound/abc.jpg',
      mediaMimeType: 'image/jpeg',
      mediaFileName: 'photo.jpg',
      mediaSizeBytes: 2048,
      mediaChecksumSha256: 'cafebabe',
      idempotencyKey: 'idem-media-1',
    });

    expect(res.status).toBe(202);
    expect(queueAdd).toHaveBeenCalledTimes(1);
    const jobData = queueAdd.mock.calls[0][1] as Record<string, unknown>;
    expect(jobData.mediaRef).toBe('1/outbound/abc.jpg');
    expect(jobData.mediaMimeType).toBe('image/jpeg');
    expect(jobData.mediaFileName).toBe('photo.jpg');
    expect(jobData.mediaSizeBytes).toBe(2048);
    expect(jobData.mediaChecksumSha256).toBe('cafebabe');

    const createPendingPayload = createPending.mock.calls[0][3] as { mediaRef: string | null };
    expect(createPendingPayload.mediaRef).toBe('1/outbound/abc.jpg');
  });

  it('marks the dispatch failed and returns the queue error when BullMQ cannot enqueue', async () => {
    findByIdempotencyKey.mockResolvedValueOnce(null);
    createPending.mockResolvedValueOnce({ id: 44, status: 'pending', message_id: null, bullmq_job_id: null });
    queueAdd.mockRejectedValueOnce(new Error('Redis version needs to be greater or equal than 5.0.0'));

    const res = await post({ ...requestBody, idempotencyKey: 'idem-queue-failure' });
    const body = (await res.json()) as { message: string };

    expect(res.status).toBe(500);
    expect(body.message).toContain('Redis version needs to be greater or equal than 5.0.0');
    expect(markFailed).toHaveBeenCalledWith(44);
  });

  // ------------------------------------------------------------------
  // Phase 5.4 - conversation ownership enforcement on /messages/send
  // ------------------------------------------------------------------

  it('enqueues the job with the conversation-owning account when the caller sends none', async () => {
    getConversationAccount.mockResolvedValue({ id: 10, whatsappAccountId: 2 });
    findByIdempotencyKey.mockResolvedValueOnce(null);
    createPending.mockResolvedValueOnce({ id: 45, status: 'pending', message_id: null, bullmq_job_id: null });

    const res = await post({ ...requestBody, idempotencyKey: 'idem-owner-1' });
    expect(res.status).toBe(202);

    const jobData = queueAdd.mock.calls[0][1] as { accountId: number | null };
    expect(jobData.accountId).toBe(2);
  });

  it('rejects with ACCOUNT_OWNERSHIP_MISMATCH when the caller accountId conflicts with the conversation owner', async () => {
    // Conversation belongs to account 2, request claims account 1.
    getConversationAccount.mockResolvedValue({ id: 10, whatsappAccountId: 2 });
    findByIdempotencyKey.mockResolvedValueOnce(null);

    const res = await post({ ...requestBody, accountId: 1, idempotencyKey: 'idem-conflict-1' });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { data: { code: string } };
    expect(body.data.code).toBe('ACCOUNT_OWNERSHIP_MISMATCH');
    // The message must never be enqueued through the wrong account.
    expect(queueAdd).not.toHaveBeenCalled();
    expect(createPending).not.toHaveBeenCalled();
  });

  it('accepts the caller accountId when it matches the conversation owner', async () => {
    getConversationAccount.mockResolvedValue({ id: 10, whatsappAccountId: 3 });
    findByIdempotencyKey.mockResolvedValueOnce(null);
    createPending.mockResolvedValueOnce({ id: 46, status: 'pending', message_id: null, bullmq_job_id: null });

    const res = await post({ ...requestBody, accountId: 3, idempotencyKey: 'idem-match-1' });
    expect(res.status).toBe(202);
    const jobData = queueAdd.mock.calls[0][1] as { accountId: number | null };
    expect(jobData.accountId).toBe(3);
  });

  it('returns 404 with a stable code when the conversation does not exist in the workspace', async () => {
    getConversationAccount.mockResolvedValue(null);
    findByIdempotencyKey.mockResolvedValueOnce(null);

    const res = await post({ ...requestBody, idempotencyKey: 'idem-missing-conv' });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { data: { code: string } };
    expect(body.data.code).toBe('CONVERSATION_NOT_FOUND');
    expect(queueAdd).not.toHaveBeenCalled();
  });
});
