import { logger } from '../lib/logger';
import { emitSyncEvent } from '../lib/socket-server';
import { processOneMessage } from './inbound-pipeline';
import { SyncRepository } from './sync-repository';
import type { BaileysMessagingHistorySet } from './baileys-socket';

/**
 * Historical message synchronization coordinator (spec §9, §11).
 *
 * Baileys delivers previously-available chats/contacts/messages as one or more
 * `messaging-history.set` events (the initial device-link bootstrap, plus any
 * later RECENT/PUSH_NAME syncs WhatsApp pushes). This module:
 *
 *  - persists a per-workspace run-state machine ('syncing' -> 'completed' |
 *    'failed', with totals + started/completed timestamps) into the
 *    gateway-owned whatsapp_sync_checkpoints table so a run survives gateway
 *    restarts and is queryable by operators (spec §9);
 *  - replays the messages through the same idempotent persistence path as
 *    live inbound messages (UNIQUE(workspace_id, whatsapp_message_id)), so
 *    re-syncs, reconnects and duplicate deliveries can never create duplicate
 *    CRM records (spec §10, §11);
 *  - counts processed/failed/duplicate/skipped messages and emits
 *    sync.started / sync.progress / sync.completed / sync.failed socket
 *    events (rooms `workspace:{id}` + `workspace:{id}:inbox`) so the UI shows
 *    a live import indicator and refreshes without a page reload;
 *  - imports history without treating it as "new": no unread-count bumps and
 *    no per-message socket fan-out (the UI refetches on the sync events), so
 *    a fresh device link cannot flood the inbox with thousands of events or
 *    mark every imported chat as unread.
 *
 * A run is completed when Baileys flags the payload as the latest chunk
 * (`isLatest`) or, when it doesn't, once no further history event arrives
 * within HISTORY_SETTLE_MS - the settle window absorbs multi-chunk syncs whose
 * segments do not carry the flag.
 */

export type HistorySyncState = 'pending' | 'syncing' | 'completed' | 'failed';

export interface HistorySyncSnapshot {
  state: HistorySyncState;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string | null;
  totalMessages: number;
  totalConversations: number;
  processedMessages: number;
  failedMessages: number;
  duplicateMessages: number;
  skippedMessages: number;
  /** WhatsApp-side history-stream progress (0-100) when Baileys reports it, else null. */
  progress: number | null;
  syncType: string | null;
  error: string | null;
}

const HISTORY_CHUNK_SIZE = 100;
const PROGRESS_EMIT_MIN_INTERVAL_MS = 400;
const HISTORY_SETTLE_MS = 30_000;

const repository = new SyncRepository();

interface RunState {
  snapshot: HistorySyncSnapshot | null;
  /** Serializes history-set payloads for one workspace so two events never interleave. */
  chain: Promise<void>;
  settleTimer: ReturnType<typeof setTimeout> | null;
  lastEmitAt: number;
}

const runs = new Map<number, RunState>();

function freshSnapshot(): HistorySyncSnapshot {
  const now = new Date().toISOString();
  return {
    state: 'pending',
    startedAt: now,
    completedAt: null,
    updatedAt: now,
    totalMessages: 0,
    totalConversations: 0,
    processedMessages: 0,
    failedMessages: 0,
    duplicateMessages: 0,
    skippedMessages: 0,
    progress: null,
    syncType: null,
    error: null,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function clearSettleTimer(run: RunState): void {
  if (run.settleTimer) {
    clearTimeout(run.settleTimer);
    run.settleTimer = null;
  }
}

function toSnapshot(persisted: Record<string, unknown> | null): HistorySyncSnapshot | null {
  if (!persisted) {
    return null;
  }
  return {
    ...freshSnapshot(),
    ...persisted,
    state: ['pending', 'syncing', 'completed', 'failed'].includes(persisted.state as string)
      ? (persisted.state as HistorySyncState)
      : 'pending',
    totalMessages: Number(persisted.totalMessages) || 0,
    totalConversations: Number(persisted.totalConversations) || 0,
    processedMessages: Number(persisted.processedMessages) || 0,
    failedMessages: Number(persisted.failedMessages) || 0,
    duplicateMessages: Number(persisted.duplicateMessages) || 0,
    skippedMessages: Number(persisted.skippedMessages) || 0,
    progress: typeof persisted.progress === 'number' ? persisted.progress : null,
  };
}

/** Loads (or lazily creates) the in-process run for a workspace, resuming a persisted 'syncing' run after a gateway restart. */
async function getRun(workspaceId: number): Promise<RunState> {
  let run = runs.get(workspaceId);
  if (run) {
    return run;
  }

  let persisted: HistorySyncSnapshot | null = null;
  try {
    persisted = toSnapshot(await repository.getSnapshot(workspaceId));
  } catch (err) {
    logger.warn({ err, workspaceId }, 'Failed to read persisted history-sync state; starting fresh');
  }

  // A 'syncing' checkpoint left by a crashed/restarted gateway is resumed so
  // counters and timestamps stay continuous; anything else starts a new run.
  const resume = persisted && persisted.state === 'syncing';
  run = {
    snapshot: resume ? persisted : null,
    chain: Promise.resolve(),
    settleTimer: null,
    lastEmitAt: 0,
  };
  runs.set(workspaceId, run);
  return run;
}

/**
 * Entry point for Baileys `messaging-history.set`. Payloads for the same
 * workspace are processed strictly one after another (chained), never
 * concurrently, and each call resolves only once its own processing - and any
 * earlier queued payload - has finished.
 */
export async function handleMessagingHistorySet(
  workspaceId: number,
  payload: BaileysMessagingHistorySet,
): Promise<void> {
  const run = await getRun(workspaceId);

  const next = run.chain.then(() => processHistoryPayload(workspaceId, run, payload));
  run.chain = next.catch((err) => {
    // Safety net: processHistoryPayload handles its own failures; this should never fire.
    logger.error({ err, workspaceId }, 'Unhandled error inside history-sync processing chain');
  });

  await run.chain;
}

async function processHistoryPayload(
  workspaceId: number,
  run: RunState,
  payload: BaileysMessagingHistorySet,
): Promise<void> {
  try {
    let snapshot = run.snapshot;

    // New run when there is none or the last one already settled.
    if (!snapshot || snapshot.state === 'completed' || snapshot.state === 'failed') {
      snapshot = freshSnapshot();
      run.snapshot = snapshot;
    }

    const isResumed = snapshot.state === 'syncing';
    snapshot.state = 'syncing';
    snapshot.updatedAt = nowIso();
    if (!isResumed) {
      // A genuinely new run resets the counters captured on the checkpoint row.
      snapshot.totalMessages = 0;
      snapshot.totalConversations = 0;
      snapshot.processedMessages = 0;
      snapshot.failedMessages = 0;
      snapshot.duplicateMessages = 0;
      snapshot.skippedMessages = 0;
      snapshot.error = null;
      snapshot.progress = null;
    }
    if (!snapshot.startedAt) {
      snapshot.startedAt = nowIso();
    }

    clearSettleTimer(run);

    if (typeof payload.progress === 'number') {
      snapshot.progress = payload.progress;
    }
    snapshot.syncType = snapshot.syncType ?? String(payload.syncType ?? '');
    snapshot.totalConversations += Array.isArray(payload.chats) ? payload.chats.length : 0;
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    snapshot.totalMessages += messages.length;

    if (!isResumed) {
      emitSyncEvent('sync.started', workspaceId, { sync: { ...snapshot } });
    }

    // Contacts first (saved names / phone numbers feed message enrichment), isolated
    // from message failures - a contacts hiccup must not abort the import.
    if (Array.isArray(payload.contacts) && payload.contacts.length > 0) {
      try {
        const { handleContactsUpsert } = await import('./contacts-pipeline');
        await handleContactsUpsert(workspaceId, payload.contacts);
      } catch (err) {
        logger.error({ err, workspaceId }, 'Error syncing contacts from history sync');
      }
    }

    for (let i = 0; i < messages.length; i += HISTORY_CHUNK_SIZE) {
      const chunk = messages.slice(i, i + HISTORY_CHUNK_SIZE);
      for (const raw of chunk) {
        const outcome = await processOneMessage(workspaceId, raw, { live: false });
        switch (outcome.status) {
          case 'inserted':
          case 'unsupported':
            snapshot.processedMessages += 1;
            break;
          case 'duplicate':
            snapshot.duplicateMessages += 1;
            break;
          case 'skipped':
            snapshot.skippedMessages += 1;
            break;
          case 'failed':
            snapshot.failedMessages += 1;
            break;
        }
      }

      snapshot.updatedAt = nowIso();
      try {
        await repository.saveSnapshot(workspaceId, snapshot);
      } catch (err) {
        logger.warn({ err, workspaceId }, 'Failed to persist history-sync checkpoint');
      }

      // Emit after every chunk so a long single-event import shows live
      // progress; throttled unless this is the final chunk of the payload.
      const isLastChunk = i + HISTORY_CHUNK_SIZE >= messages.length;
      await maybeEmitProgress(workspaceId, run, isLastChunk);
    }

    const isLatest = payload.isLatest === true;
    if (isLatest || messages.length === 0) {
      await completeRun(workspaceId, run);
      return;
    }

    // No isLatest flag: WhatsApp may still stream further chunks. If nothing
    // arrives within the settle window the run is considered complete.
    run.settleTimer = setTimeout(() => {
      run.settleTimer = null;
      if (run.snapshot && run.snapshot.state === 'syncing') {
        void completeRun(workspaceId, run).catch((err) => {
          logger.error({ err, workspaceId }, 'Failed to settle history-sync run');
        });
      }
    }, HISTORY_SETTLE_MS);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, workspaceId }, 'History sync failed');
    if (run.snapshot) {
      run.snapshot.state = 'failed';
      run.snapshot.error = message;
      run.snapshot.updatedAt = nowIso();
      await repository.saveSnapshot(workspaceId, run.snapshot).catch(() => undefined);
      emitSyncEvent('sync.failed', workspaceId, { sync: { ...run.snapshot } });
    }
  }
}

async function maybeEmitProgress(
  workspaceId: number,
  run: RunState,
  force: boolean,
): Promise<void> {
  if (!run.snapshot) {
    return;
  }
  const now = Date.now();
  if (!force && now - run.lastEmitAt < PROGRESS_EMIT_MIN_INTERVAL_MS) {
    return;
  }
  run.lastEmitAt = now;
  emitSyncEvent('sync.progress', workspaceId, { sync: { ...run.snapshot } });
}

async function completeRun(workspaceId: number, run: RunState): Promise<void> {
  clearSettleTimer(run);
  if (!run.snapshot) {
    return;
  }
  run.snapshot.state = 'completed';
  run.snapshot.completedAt = nowIso();
  run.snapshot.updatedAt = nowIso();
  run.snapshot.error = null;

  await repository.saveSnapshot(workspaceId, run.snapshot);
  emitSyncEvent('sync.completed', workspaceId, { sync: { ...run.snapshot } });
}

/**
 * Current run-state snapshot for a workspace: the live in-process run when one
 * exists, otherwise the last persisted checkpoint (survives gateway restarts).
 * Never throws - a database hiccup yields null so status reads stay resilient.
 */
export async function getSyncSnapshot(workspaceId: number): Promise<HistorySyncSnapshot | null> {
  const run = runs.get(workspaceId);
  if (run?.snapshot) {
    return { ...run.snapshot };
  }
  try {
    return toSnapshot(await repository.getSnapshot(workspaceId));
  } catch (err) {
    logger.warn({ err, workspaceId }, 'Failed to read history-sync snapshot from checkpoint');
    return null;
  }
}

/**
 * Drops the workspace's run entirely (memory + checkpoint row). Used on
 * reset-data and whenever a fresh QR pairing starts: the previous account's
 * run summary must not linger on the UI once a different number links.
 */
export async function clearWorkspaceRun(workspaceId: number): Promise<void> {
  const run = runs.get(workspaceId);
  if (run) {
    clearSettleTimer(run);
    runs.delete(workspaceId);
  }
  try {
    await repository.clear(workspaceId);
  } catch (err) {
    logger.warn({ err, workspaceId }, 'Failed to clear history-sync checkpoint');
  }
}
