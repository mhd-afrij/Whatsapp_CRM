import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';

vi.mock('../whatsapp/manager-instance', () => ({
  connectionManager: {
    logout: vi.fn().mockResolvedValue(undefined),
    getSnapshot: vi.fn().mockReturnValue({ status: 'auth_required', phoneNumber: null }),
  },
}));

const { transactionMock } = vi.hoisted(() => ({ transactionMock: vi.fn() }));
vi.mock('../lib/mysql', () => ({
  transaction: (...args: unknown[]) => transactionMock(...args),
  execute: vi.fn().mockResolvedValue({ affectedRows: 0 }),
}));

const { emitConversationsReset } = vi.hoisted(() => ({ emitConversationsReset: vi.fn() }));
vi.mock('../lib/socket-server', () => ({
  emitConversationsReset: (...args: unknown[]) => emitConversationsReset(...args),
}));

vi.mock('../queues/send-message.queue', () => ({
  sendMessageQueue: { add: vi.fn().mockResolvedValue({ id: 'job-1' }) },
}));

vi.mock('../whatsapp/message-repository', () => ({
  MessageRepository: vi.fn().mockImplementation(function FakeMessageRepository() {
    return { getConversationJid: vi.fn().mockResolvedValue('2547000000@s.whatsapp.net') };
  }),
}));

import { createInternalWhatsappRouter } from './internal-whatsapp.routes';

describe('internal gateway API - POST /internal/whatsapp/reset-data', () => {
  let server: Server;
  let baseUrl: string;

  const headers = {
    'X-Internal-Gateway-Token': 'test-internal-gateway-token',
    'Content-Type': 'application/json',
  };

  function fakeConn() {
    return {
      query: vi.fn().mockResolvedValue([[{ conversations: 3, messages: 40 }], []]),
      execute: vi
        .fn()
        .mockResolvedValueOnce([{ affectedRows: 1 }, []]) // message_dispatch_queue
        .mockResolvedValueOnce([{ affectedRows: 2 }, []]) // message_processing_failures
        .mockResolvedValueOnce([{ affectedRows: 5 }, []]) // whatsapp_contacts
        .mockResolvedValueOnce([{ affectedRows: 4 }, []]), // whatsapp_sync_checkpoints
    };
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    transactionMock.mockReset();
    emitConversationsReset.mockReset();
    transactionMock.mockImplementation(async (cb: (conn: unknown) => Promise<unknown>) =>
      cb(fakeConn()),
    );

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

  it('rejects a missing token with 401', async () => {
    const res = await fetch(`${baseUrl}/internal/whatsapp/reset-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId: 1 }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects a missing workspaceId with 400', async () => {
    const res = await fetch(`${baseUrl}/internal/whatsapp/reset-data`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('logs out, purges gateway-owned rows, emits reset event, and returns counts', async () => {
    const res = await fetch(`${baseUrl}/internal/whatsapp/reset-data`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ workspaceId: 7 }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: { conversations: number; messages: number; whatsappContacts: number };
    };
    expect(body.success).toBe(true);
    expect(body.data).toEqual({
      conversations: 3,
      messages: 40,
      whatsappContacts: 5,
      dispatches: 1,
      processingFailures: 2,
      checkpoints: 4,
      session: { status: 'auth_required', phoneNumber: null },
    });

    const { connectionManager } = await import('../whatsapp/manager-instance');
    expect(connectionManager.logout).toHaveBeenCalledTimes(1);

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(emitConversationsReset).toHaveBeenCalledWith(7, expect.objectContaining({ conversations: 3 }));
  });

  it('returns 500 when the gateway logout fails', async () => {
    const { connectionManager } = await import('../whatsapp/manager-instance');
    (connectionManager.logout as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('baileys gone'));

    const res = await fetch(`${baseUrl}/internal/whatsapp/reset-data`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ workspaceId: 7 }),
    });

    expect(res.status).toBe(500);
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
