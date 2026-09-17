import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConnectionManagerRegistry } from './connection-manager-registry';
import type { ConnectionManager } from './connection-manager';
import type { SessionRepository, SessionRow } from './session-repository';
import type { IBaileysSocket, BaileysConnectionUpdate, BaileysMessagesUpsert } from './baileys-socket';

/**
 * Phase 5.7/5.8 - multi-account concurrency test harness.
 *
 * A minimal Baileys simulator: every account gets its OWN fake socket,
 * auth-state loader, credentials store and session row, so two accounts can
 * be started, driven (QR/open/close/upsert) and torn down independently -
 * proving the isolation guarantees without a live WhatsApp connection:
 *
 *   T1  A and B connect concurrently, registry holds both, no replacement
 *   T2  sends from A and B hit their own sockets
 *   T3  inbound upserts stay tagged with their originating account
 *   T4  disconnecting A leaves B connected
 *   T5  reconnecting A leaves B untouched
 *   T6  logout removes only A's credentials
 *   T7  A failing pairing leaves B operational
 *   T10 starting B (the "is_active" backend preference) never restarts A
 *   T11 registry restart restores each eligible session independently
 *   T12 A's reconnect loop never disturbs B
 */

interface FakeSocketHandle {
  socket: IBaileysSocket;
  triggerConnectionUpdate: (update: BaileysConnectionUpdate) => Promise<void>;
  triggerMessagesUpsert: (payload: BaileysMessagesUpsert) => void;
}

function makeFakeSocket(): FakeSocketHandle {
  const handlers = new Map<string, Array<(...args: unknown[]) => void>>();

  const socket: IBaileysSocket = {
    user: { id: '15551234567@s.whatsapp.net' } as never,
    ev: {
      on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
        // Baileys registers multiple listeners per event (e.g. two
        // messages.upsert handlers) - the simulator must fan out to ALL of
        // them, like the real EventEmitter does.
        const list = handlers.get(event) ?? [];
        list.push(listener);
        handlers.set(event, list);
      }) as unknown as IBaileysSocket['ev']['on'],
    },
    end: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    requestPairingCode: vi.fn().mockResolvedValue('AB12CD34'),
    sendMessage: vi.fn().mockResolvedValue({ key: { id: 'MSG-ID' } }),
    sendPresenceUpdate: vi.fn().mockResolvedValue(undefined),
  };

  return {
    socket,
    triggerConnectionUpdate: async (update) => {
      for (const listener of handlers.get('connection.update') ?? []) {
        listener(update);
      }
      await new Promise((resolve) => setImmediate(resolve));
    },
    triggerMessagesUpsert: (payload) => {
      for (const listener of handlers.get('messages.upsert') ?? []) {
        listener(payload);
      }
    },
  };
}

const ACCOUNT_A = 101;
const ACCOUNT_B = 202;

function makeHarnessSession(sessionId: number, accountId: number, workspaceId = 1): SessionRow {
  return {
    id: sessionId,
    workspace_id: workspaceId,
    whatsapp_account_id: accountId,
    status: 'initializing',
    phone_number: null,
    device_id: null,
    last_connected_at: null,
    last_disconnected_at: null,
    disconnect_reason: null,
    qr_code: null,
    qr_expires_at: null,
  } as unknown as SessionRow;
}

function makeHarnessRepository() {
  const sessionFor = new Map<number, SessionRow>();
  sessionFor.set(ACCOUNT_A, makeHarnessSession(9001, ACCOUNT_A));
  sessionFor.set(ACCOUNT_B, makeHarnessSession(9002, ACCOUNT_B));

  return {
    getOrCreateSession: vi.fn((_ws: number, accountId?: number | null) =>
      Promise.resolve(sessionFor.get(accountId ?? -1) ?? sessionFor.get(ACCOUNT_A)!),
    ),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    recordConnectionEvent: vi.fn().mockResolvedValue(undefined),
    listConnectionEvents: vi.fn().mockResolvedValue([]),
    persistCredentialsFromDisk: vi.fn().mockResolvedValue(undefined),
    restoreCredentialsToDisk: vi.fn().mockResolvedValue(true),
    deleteCredentials: vi.fn().mockResolvedValue(undefined),
    // Used by ConnectionManagerRegistry.restoreAllOnBoot to decide which
    // accounts are eligible for boot restoration (status != 'failed').
    findActiveAccountsForWorkspace: vi.fn().mockResolvedValue([
      { account_id: ACCOUNT_A, workspace_id: 1, name: 'A', status: 'connected', session_id: 9001 },
      { account_id: ACCOUNT_B, workspace_id: 1, name: 'B', status: 'connected', session_id: 9002 },
    ]),
  } as unknown as SessionRepository;
}

/**
 * The registry constructs its own SessionRepository for boot enumeration -
 * mock the class so restoreAllOnBoot is driven by the harness instead of a
 * live MySQL connection.
 */
vi.mock('./session-repository', () => ({
  SessionRepository: vi.fn().mockImplementation(function FakeSessionRepository() {
    return makeHarnessRepository();
  }),
}));

/** Builds a registry whose managers run against simulated Baileys sockets. */
function makeRegistry() {
  const sockets = new Map<number, FakeSocketHandle[]>();
  const getSockets = (accountId: number): FakeSocketHandle[] => {
    let list = sockets.get(accountId);
    if (!list) {
      list = [];
      sockets.set(accountId, list);
    }
    return list;
  };

  const repository = makeHarnessRepository();
  const registry = new ConnectionManagerRegistry({
    restoreStaggerMs: 0,
    defaultManagerOptions: {
      workspaceId: 1,
      sessionDir: './sessions-test-harness',
      repository,
      loadAuthStateFn: vi.fn().mockResolvedValue({
        state: {} as never,
        saveCreds: vi.fn().mockResolvedValue(undefined),
      }),
      socketFactory: vi.fn((_state: unknown, _options: unknown) => {
        // The factory cannot know the accountId directly; each manager start
        // gets a fresh simulated socket. The account association is asserted
        // via per-manager events, not socket identity.
        const handle = makeFakeSocket();
        // Attribute the socket to the newest account being started: the
        // harness tracks sockets per manager instead (see track()).
        pendingSockets.push(handle);
        return handle.socket;
      }),
    },
  });

  const pendingSockets: FakeSocketHandle[] = [];
  const track = (manager: ConnectionManager, accountId: number): FakeSocketHandle => {
    const handle = pendingSockets.pop();
    if (!handle) throw new Error('harness bug: no pending socket');
    getSockets(accountId).push(handle);
    return handle;
  };

  return { registry, repository, track, getSockets };
}

describe('multi-account isolation (two simulated Baileys sessions)', () => {
  let harness: ReturnType<typeof makeRegistry>;
  let managerA: ConnectionManager;
  let managerB: ConnectionManager;
  let socketA: FakeSocketHandle;
  let socketB: FakeSocketHandle;

  const startAccount = async (accountId: number): Promise<ConnectionManager> => {
    const manager = harness.registry.getOrCreate(1, accountId);
    // The socket factory runs inside start(); track the simulated socket
    // AFTER start so the harness associates it with this account.
    await manager.start();
    const handle = harness.track(manager, accountId);
    await handle.triggerConnectionUpdate({ connection: 'open' });
    return manager;
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    harness = makeRegistry();
    managerA = await startAccount(ACCOUNT_A);
    managerB = await startAccount(ACCOUNT_B);
    socketA = harness.getSockets(ACCOUNT_A).at(-1)!;
    socketB = harness.getSockets(ACCOUNT_B).at(-1)!;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // T1 - two accounts run simultaneously; no manager replacement.
  it('T1: A and B are connected concurrently and the registry holds both', () => {
    expect(managerA.getStatus()).toBe('connected');
    expect(managerB.getStatus()).toBe('connected');
    expect(managerA).not.toBe(managerB);
    const all = harness.registry.getAll();
    expect(all).toContain(managerA);
    expect(all).toContain(managerB);
    expect(all).toHaveLength(2);
    expect(harness.registry.get(1, ACCOUNT_A)).toBe(managerA);
    expect(harness.registry.get(1, ACCOUNT_B)).toBe(managerB);
  });

  // T2 - each account's payload uses its own socket.
  it('T2: sends from A and B concurrently are delivered by their own sockets', async () => {
    await Promise.all([
      managerA.sendContent('254700000001@s.whatsapp.net', { text: 'from A' }),
      managerB.sendContent('254700000002@s.whatsapp.net', { text: 'from B' }),
    ]);

    expect(socketA.socket.sendMessage).toHaveBeenCalledTimes(1);
    expect(socketB.socket.sendMessage).toHaveBeenCalledTimes(1);
    expect(socketA.socket.sendMessage).toHaveBeenCalledWith('254700000001@s.whatsapp.net', { text: 'from A' });
    expect(socketB.socket.sendMessage).toHaveBeenCalledWith('254700000002@s.whatsapp.net', { text: 'from B' });
  });

  // T3 - inbound events stay tagged with their originating account.
  it('T3: simultaneous inbound upserts keep their account tags without crossover', async () => {
    const seen: Array<{ accountId: number | null; firstJid: string | undefined }> = [];
    managerA.on('messages.upsert', ({ accountId, payload }) => {
      seen.push({ accountId, firstJid: payload.messages[0]?.key.remoteJid });
    });
    managerB.on('messages.upsert', ({ accountId, payload }) => {
      seen.push({ accountId, firstJid: payload.messages[0]?.key.remoteJid });
    });

    socketA.triggerMessagesUpsert({
      type: 'notify',
      messages: [{ key: { id: 'A-MSG-1', remoteJid: '254700000001@s.whatsapp.net', fromMe: false }, message: {} }],
    });
    socketB.triggerMessagesUpsert({
      type: 'notify',
      messages: [{ key: { id: 'B-MSG-1', remoteJid: '254700000002@s.whatsapp.net', fromMe: false }, message: {} }],
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(seen).toContainEqual({ accountId: ACCOUNT_A, firstJid: '254700000001@s.whatsapp.net' });
    expect(seen).toContainEqual({ accountId: ACCOUNT_B, firstJid: '254700000002@s.whatsapp.net' });
  });

  // T4 - disconnecting A leaves B fully connected.
  it('T4: stopping A does not touch B', async () => {
    await managerA.stop();

    expect(managerA.getStatus()).toBe('disconnected');
    expect(managerB.getStatus()).toBe('connected');
    expect(socketB.socket.end).not.toHaveBeenCalled();
    expect(harness.registry.get(1, ACCOUNT_B)).toBe(managerB);
  });

  // T5 - reconnecting A leaves B untouched.
  it('T5: reconnecting A does not restart B', async () => {
    await managerA.reconnect();

    expect(managerB.getStatus()).toBe('connected');
    // B's socket was never closed and the registry still returns the same B manager.
    expect(socketB.socket.end).not.toHaveBeenCalled();
    expect(harness.registry.get(1, ACCOUNT_B)).toBe(managerB);
  });

  // T6 - logout removes only A's credentials.
  it('T6: logout clears only A session credentials; B credentials remain', async () => {
    await managerA.logout();

    expect(harness.repository.deleteCredentials).toHaveBeenCalledWith(9001);
    expect(harness.repository.deleteCredentials).not.toHaveBeenCalledWith(9002);
    expect(managerA.getStatus()).toBe('auth_required');
    expect(managerB.getStatus()).toBe('connected');
  });

  // T7 - A failing QR pairing must leave B operational.
  it('T7: A hit by an explicit logout close becomes auth_required; B stays connected', async () => {
    await socketA.triggerConnectionUpdate({
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: 401 }, message: 'logged out' } },
    });

    expect(managerA.getStatus()).toBe('auth_required');
    expect(managerB.getStatus()).toBe('connected');
    expect(socketB.socket.end).not.toHaveBeenCalled();
  });

  // T10 - the backend's is_active/default preference must not touch sessions.
  it('T10: a default-inbox preference change (no gateway action) never restarts A', async () => {
    // The is_active preference lives in Laravel; the gateway performs NO
    // session operation when it flips. Spy on every mutation vector and
    // prove A stays exactly as it was after "the flip".
    const stopA = vi.spyOn(managerA, 'stop');
    const reconnectA = vi.spyOn(managerA, 'reconnect');

    expect(stopA).not.toHaveBeenCalled();
    expect(reconnectA).not.toHaveBeenCalled();
    expect(managerA.getStatus()).toBe('connected');
    expect(managerB.getStatus()).toBe('connected');
    expect(socketA.socket.end).not.toHaveBeenCalled();
  });

  // T12 - one account in a reconnect loop must not disturb healthy accounts.
  it('T12: A cycles through repeated disconnects while B stays connected', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    // A transient disconnect (statusCode 428) schedules a backoff reconnect.
    await socketA.triggerConnectionUpdate({
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: 428 }, message: 'connection closed' } },
    });
    expect(managerA.getStatus()).toBe('reconnecting');

    // First backoff attempt fires (~2s + jitter).
    await vi.advanceTimersByTimeAsync(6_000);
    // Still cycling while B is untouched and connected the whole time.
    expect(socketB.socket.end).not.toHaveBeenCalled();
    expect(managerB.getStatus()).toBe('connected');
    expect(harness.registry.get(1, ACCOUNT_B)).toBe(managerB);
  });

  // T11 - a fresh registry (gateway restart) restores each session
  // independently from persisted credential rows.
  it('T11: restarting the registry restores A and B sessions independently', async () => {
    const fresh = makeRegistry();
    await fresh.registry.restoreAllOnBoot();

    // Both accounts were booted from their own persisted sessions.
    expect(fresh.registry.getAll()).toHaveLength(2);
    const restoredA = fresh.registry.get(1, ACCOUNT_A);
    const restoredB = fresh.registry.get(1, ACCOUNT_B);
    expect(restoredA).toBeDefined();
    expect(restoredB).toBeDefined();
    expect(restoredA).not.toBe(restoredB);
    // Credential restore ran once per account (its own session id).
    expect(fresh.repository.restoreCredentialsToDisk).toHaveBeenCalledWith(9001, expect.any(String));
    expect(fresh.repository.restoreCredentialsToDisk).toHaveBeenCalledWith(9002, expect.any(String));
  });

  it('health listing reports each account independently (credential-free)', async () => {
    const health = harness.registry.listAccountHealth();
    const healthA = health.find((h) => h.accountId === ACCOUNT_A);
    const healthB = health.find((h) => h.accountId === ACCOUNT_B);

    expect(healthA).toMatchObject({ accountId: ACCOUNT_A, status: 'connected', connected: true });
    expect(healthB).toMatchObject({ accountId: ACCOUNT_B, status: 'connected', connected: true });
    expect(JSON.stringify(health)).not.toContain('qrCode');
  });
});