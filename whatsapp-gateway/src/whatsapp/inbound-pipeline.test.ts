import { describe, it, expect, vi, beforeEach } from 'vitest';

const emitMessageCreated = vi.fn();
vi.mock('../lib/socket-server', () => ({
  emitMessageCreated: (...args: unknown[]) => emitMessageCreated(...args),
}));

const enqueueMediaDownload = vi.fn().mockResolvedValue(undefined);
vi.mock('../queues/media-download.queue', () => ({
  enqueueMediaDownload: (...args: unknown[]) => enqueueMediaDownload(...args),
}));

const notifyNewMessage = vi.fn().mockResolvedValue(true);
vi.mock('../lib/laravel-client', () => ({
  notifyNewMessage: (...args: unknown[]) => notifyNewMessage(...args),
}));

interface FakeConn {
  query: ReturnType<typeof vi.fn>;
  beginTransaction: ReturnType<typeof vi.fn>;
  commit: ReturnType<typeof vi.fn>;
  rollback: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
}

let insertMessageBehavior: 'succeed' | 'duplicate' = 'succeed';
let messageInsertCount = 0;

function makeFakeConn(): FakeConn {
  return {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
    query: vi.fn(async (sql: string) => {
      if (sql.includes('SELECT id FROM messages WHERE workspace_id')) {
        return [[]];
      }
      if (sql.includes('INSERT INTO messages')) {
        messageInsertCount += 1;
        if (insertMessageBehavior === 'duplicate' && messageInsertCount > 1) {
          const err = new Error('Duplicate entry') as Error & { code: string };
          err.code = 'ER_DUP_ENTRY';
          throw err;
        }
        return [{ insertId: 100 + messageInsertCount }];
      }
      if (sql.includes('UPDATE conversations')) {
        return [{}];
      }
      throw new Error(`Unexpected conn query: ${sql}`);
    }),
  };
}

const recordProcessingFailure = vi.fn().mockResolvedValue(undefined);

function makeFakePool() {
  return {
    query: vi.fn(async (sql: string) => {
      if (sql.includes('SELECT id FROM whatsapp_contacts')) return [[{ id: 1 }]];
      if (sql.includes('UPDATE whatsapp_contacts')) return [{}];
      if (sql.includes('SELECT id FROM conversations')) return [[{ id: 10 }]];
      if (sql.includes('INSERT INTO message_processing_failures')) {
        await recordProcessingFailure();
        return [{ insertId: 1 }];
      }
      throw new Error(`Unexpected pool query: ${sql}`);
    }),
    getConnection: vi.fn(async () => makeFakeConn()),
  };
}

vi.mock('../lib/mysql', () => ({
  query: (...args: unknown[]) => makeFakePool().query(args[0] as string),
  execute: (...args: unknown[]) => makeFakePool().query(args[0] as string),
  transaction: (callback: (conn: FakeConn) => Promise<unknown>) =>
    makeFakePool().getConnection().then((conn: FakeConn) => callback(conn)),
}));

import { handleMessagesUpsert, processOneMessage } from './inbound-pipeline';
import type { BaileysMessagesUpsert } from './baileys-socket';

function textMessage(id: string): BaileysMessagesUpsert {
  return {
    type: 'notify',
    messages: [
      {
        key: { id, remoteJid: '2547000000@s.whatsapp.net', fromMe: false },
        pushName: 'Jane',
        messageTimestamp: Math.floor(Date.now() / 1000),
        message: { conversation: 'hello there' },
      },
    ],
  };
}

function outboundTextMessage(id: string): BaileysMessagesUpsert {
  return {
    type: 'notify',
    messages: [
      {
        key: { id, remoteJid: '2547000000@s.whatsapp.net', fromMe: true },
        pushName: 'Jane',
        messageTimestamp: Math.floor(Date.now() / 1000),
        message: { conversation: 'bye' },
      },
    ],
  };
}

describe('inbound pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertMessageBehavior = 'succeed';
    messageInsertCount = 0;
  });

  it('persists a text message and emits message.created', async () => {
    await handleMessagesUpsert(1, textMessage('MSG-1'));

    expect(emitMessageCreated).toHaveBeenCalledTimes(1);
    expect(emitMessageCreated).toHaveBeenCalledWith(
      1,
      10,
      expect.objectContaining({ message: expect.objectContaining({ body: 'hello there' }) }),
    );
  });

  it('notifies Laravel of a live inbound message once', async () => {
    await handleMessagesUpsert(1, textMessage('MSG-1'));

    expect(notifyNewMessage).toHaveBeenCalledTimes(1);
    expect(notifyNewMessage).toHaveBeenCalledWith({
      workspaceId: 1,
      conversationId: 10,
      messageId: 101,
      messageType: 'text',
      preview: 'hello there',
    });
  });

  it('never notifies Laravel for outbound messages', async () => {
    await handleMessagesUpsert(1, outboundTextMessage('MSG-OUT'));

    expect(notifyNewMessage).not.toHaveBeenCalled();
  });

  it('never notifies Laravel during a history import (live=false)', async () => {
    const raw = textMessage('MSG-HIST').messages[0];
    await processOneMessage(1, raw, { live: false });

    expect(emitMessageCreated).not.toHaveBeenCalled();
    expect(notifyNewMessage).not.toHaveBeenCalled();
  });

  it('treats a duplicate whatsapp_message_id as an idempotent no-op, not a crash', async () => {
    insertMessageBehavior = 'duplicate';

    await handleMessagesUpsert(1, textMessage('MSG-DUP'));
    emitMessageCreated.mockClear();
    await expect(handleMessagesUpsert(1, textMessage('MSG-DUP'))).resolves.not.toThrow();

    // second call hit the duplicate path and did not emit again
    expect(emitMessageCreated).not.toHaveBeenCalled();
  });

  it('safely records an unsupported/unknown message type instead of dropping it', async () => {
    const payload: BaileysMessagesUpsert = {
      type: 'notify',
      messages: [
        {
          key: { id: 'MSG-WEIRD', remoteJid: '2547000000@s.whatsapp.net', fromMe: false },
          pushName: 'Jane',
          messageTimestamp: Math.floor(Date.now() / 1000),
          message: { someFutureMessageKind: { foo: 'bar' } } as unknown as Record<string, unknown>,
        },
      ],
    };

    await handleMessagesUpsert(1, payload);

    // recorded as a message row typed 'unsupported' AND a processing failure was logged
    expect(recordProcessingFailure).toHaveBeenCalled();
  });
});
