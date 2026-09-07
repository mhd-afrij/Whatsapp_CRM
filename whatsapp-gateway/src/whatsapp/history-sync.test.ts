import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const emitSyncEvent = vi.fn();
vi.mock('../lib/socket-server', () => ({
  emitSyncEvent: (...args: unknown[]) => emitSyncEvent(...args),
}));

const processOneMessage = vi.fn().mockResolvedValue({ status: 'inserted' });
vi.mock('./inbound-pipeline', () => ({
  processOneMessage: (...args: unknown[]) => processOneMessage(...args),
}));

const handleContactsUpsert = vi.fn().mockResolvedValue(undefined);
vi.mock('./contacts-pipeline', () => ({
  handleContactsUpsert: (...args: unknown[]) => handleContactsUpsert(...args),
}));

const queryMock = vi.fn();
const executeMock = vi.fn();
vi.mock('../lib/mysql', () => ({
  query: (...args: unknown[]) => queryMock(...args),
  execute: (...args: unknown[]) => executeMock(...args),
  transaction: vi.fn(),
}));

import {
  handleMessagingHistorySet,
  getSyncSnapshot,
  clearWorkspaceRun,
} from './history-sync';
import type { BaileysMessagingHistorySet, BaileysRawMessage } from './baileys-socket';

function historyMessage(id: string): BaileysRawMessage {
  return {
    key: { id, remoteJid: '2547000000@s.whatsapp.net', fromMe: false },
    pushName: 'Jane',
    messageTimestamp: Math.floor(Date.now() / 1000),
    message: { conversation: 'hello' },
  };
}

function historyPayload(overrides: Partial<BaileysMessagingHistorySet> = {}): BaileysMessagingHistorySet {
  return {
    chats: [{ id: '2547000000@s.whatsapp.net' }],
    messages: [historyMessage('WA-1')],
    contacts: [{ id: '2547000000@s.whatsapp.net' }],
    isLatest: true,
    ...overrides,
  };
}

function emittedEvents(): Array<{ type: string; workspaceId: number; payload: Record<string, unknown> }> {
  return emitSyncEvent.mock.calls.map((call) => ({
    type: call[0] as string,
    workspaceId: call[1] as number,
    payload: call[2] as Record<string, unknown>,
  }));
}

function syncOf(event: { payload: Record<string, unknown> }): Record<string, unknown> {
  return event.payload.sync as Record<string, unknown>;
}

describe('history-sync coordinator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    processOneMessage.mockResolvedValue({ status: 'inserted' });
    handleContactsUpsert.mockResolvedValue(undefined);
    // Default: no persisted checkpoint (fresh workspace).
    queryMock.mockResolvedValue([[], []]);
    executeMock.mockResolvedValue({ affectedRows: 1 });
    // Start each test with an empty in-process run map.
    return clearWorkspaceRun(1);
  });

  afterEach(() => {
    vi.useRealTimers();
    return clearWorkspaceRun(1);
  });

  it('imports a single isLatest payload into a completed run with counters and events', async () => {
    processOneMessage
      .mockResolvedValueOnce({ status: 'inserted' })
      .mockResolvedValueOnce({ status: 'inserted' })
      .mockResolvedValueOnce({ status: 'duplicate' })
      .mockResolvedValueOnce({ status: 'skipped' })
      .mockResolvedValueOnce({ status: 'failed' });

    const fiveMessages = ['WA-1', 'WA-2', 'WA-3', 'WA-4', 'WA-5'].map(historyMessage);
    await handleMessagingHistorySet(1, historyPayload({ messages: fiveMessages }));

    expect(handleContactsUpsert).toHaveBeenCalledTimes(1);
    expect(processOneMessage).toHaveBeenCalledTimes(5);
    for (const call of processOneMessage.mock.calls) {
      expect(call[0]).toBe(1);
      expect(call[2]).toEqual({ live: false });
    }

    const events = emittedEvents();
    expect(events.map((e) => e.type)).toEqual(['sync.started', 'sync.progress', 'sync.completed']);
    expect(syncOf(events[0]).state).toBe('syncing');

    const completed = syncOf(events[2]);
    expect(completed.state).toBe('completed');
    expect(completed.totalMessages).toBe(5);
    expect(completed.totalConversations).toBe(1);
    expect(completed.processedMessages).toBe(2);
    expect(completed.duplicateMessages).toBe(1);
    expect(completed.skippedMessages).toBe(1);
    expect(completed.failedMessages).toBe(1);
    expect(completed.startedAt).toBeTruthy();
    expect(completed.completedAt).toBeTruthy();

    // Checkpoint was persisted (per-chunk + completion).
    const writes = executeMock.mock.calls.filter((call) =>
      String(call[0]).includes('INSERT INTO whatsapp_sync_checkpoints'),
    );
    expect(writes.length).toBeGreaterThanOrEqual(1);
    const lastWriteJson = JSON.parse(String(writes[writes.length - 1][1][2]));
    expect(lastWriteJson.state).toBe('completed');
    expect(lastWriteJson.failedMessages).toBe(1);
  });

  it('processes payloads larger than the chunk size in chunks with a checkpoint write each', async () => {
    const many = Array.from({ length: 250 }, (_, i) => historyMessage(`WA-${i}`));
    await handleMessagingHistorySet(1, historyPayload({ messages: many }));

    const events = emittedEvents();
    // Progress emits are throttled (~400ms min interval), so a fast import is
    // not guaranteed one emit per chunk - but at least one is always emitted
    // (the final chunk is forced) and the run completes with full counters.
    const types = events.map((e) => e.type);
    expect(types[0]).toBe('sync.started');
    expect(types.filter((t) => t === 'sync.progress').length).toBeGreaterThanOrEqual(1);
    expect(types[types.length - 1]).toBe('sync.completed');
    expect(syncOf(events[types.length - 1]).processedMessages).toBe(250);

    // 250 messages / 100-per-chunk = 3 chunk checkpoint writes + 1 completion write.
    const writes = executeMock.mock.calls.filter((call) =>
      String(call[0]).includes('INSERT INTO whatsapp_sync_checkpoints'),
    );
    expect(writes.length).toBe(4);
  });

  it('keeps a run open across non-latest payloads and completes on the isLatest one', async () => {
    await handleMessagingHistorySet(1, historyPayload({ isLatest: undefined }));

    let events = emittedEvents();
    expect(events.map((e) => e.type)).toEqual(['sync.started', 'sync.progress']);
    expect(syncOf(events[1]).state).toBe('syncing');
    expect(syncOf(events[1]).totalMessages).toBe(1);

    emitSyncEvent.mockClear();

    await handleMessagingHistorySet(1, historyPayload({ isLatest: true }));

    events = emittedEvents();
    // No second sync.started - the open run just continued and completed.
    expect(events.map((e) => e.type)).toEqual(['sync.progress', 'sync.completed']);
    const completed = syncOf(events[1]);
    expect(completed.state).toBe('completed');
    expect(completed.totalMessages).toBe(2);
    expect(completed.processedMessages).toBe(2);
  });

  it('settles an open run once no further history payload arrives', async () => {
    vi.useFakeTimers();

    const pending = handleMessagingHistorySet(1, historyPayload({ isLatest: undefined }));
    await pending;

    expect(emittedEvents().map((e) => e.type)).toEqual(['sync.started', 'sync.progress']);
    expect((await getSyncSnapshot(1))?.state).toBe('syncing');

    await vi.advanceTimersByTimeAsync(31_000);

    const events = emittedEvents();
    expect(events[events.length - 1].type).toBe('sync.completed');
    expect(syncOf(events[events.length - 1]).state).toBe('completed');
    expect((await getSyncSnapshot(1))?.state).toBe('completed');
  });

  it('marks the run failed and emits sync.failed on a catastrophic processing error', async () => {
    processOneMessage.mockRejectedValueOnce(new Error('database gone'));

    await handleMessagingHistorySet(1, historyPayload());

    const events = emittedEvents();
    expect(events[events.length - 1].type).toBe('sync.failed');
    expect(syncOf(events[events.length - 1]).state).toBe('failed');
    expect(syncOf(events[events.length - 1]).error).toBe('database gone');

    // A later event after a failed run starts a brand-new run.
    processOneMessage.mockResolvedValue({ status: 'inserted' });
    emitSyncEvent.mockClear();
    await handleMessagingHistorySet(1, historyPayload({ isLatest: true }));
    expect(emittedEvents()[0].type).toBe('sync.started');
  });

  it('resumes a persisted syncing run after a "gateway restart" without resetting counters', async () => {
    const persisted = {
      state: 'syncing',
      startedAt: '2026-01-01T00:00:00.000Z',
      totalMessages: 10,
      totalConversations: 3,
      processedMessages: 8,
      failedMessages: 0,
      duplicateMessages: 1,
      skippedMessages: 1,
      progress: 50,
    };
    queryMock.mockResolvedValueOnce([[{ cursor: JSON.stringify(persisted) }], []]);

    // Simulates a fresh process: no in-process run yet, checkpoint says syncing.
    await handleMessagingHistorySet(1, historyPayload({ isLatest: true }));

    const completed = await getSyncSnapshot(1);
    expect(completed?.state).toBe('completed');
    expect(completed?.startedAt).toBe('2026-01-01T00:00:00.000Z');
    // Counters continued from the checkpoint instead of resetting.
    expect(completed?.totalMessages).toBe(11);
    expect(completed?.processedMessages).toBe(9);
  });

  it('exposes a fresh null snapshot when no run has ever happened', async () => {
    queryMock.mockResolvedValue([[], []]);
    expect(await getSyncSnapshot(1)).toBeNull();
  });

  it('clears memory and checkpoint state via clearWorkspaceRun', async () => {
    await handleMessagingHistorySet(1, historyPayload({ isLatest: true }));
    expect(await getSyncSnapshot(1)).not.toBeNull();

    await clearWorkspaceRun(1);

    expect(await getSyncSnapshot(1)).toBeNull();
    const deletes = executeMock.mock.calls.filter((call) =>
      String(call[0]).includes('DELETE FROM whatsapp_sync_checkpoints'),
    );
    expect(deletes.length).toBeGreaterThanOrEqual(1);
  });
});
