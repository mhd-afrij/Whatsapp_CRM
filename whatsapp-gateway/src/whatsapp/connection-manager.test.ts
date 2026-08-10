import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConnectionManager } from './connection-manager';
import type { SessionRepository, SessionRow } from './session-repository';
import type { IBaileysSocket, BaileysConnectionUpdate } from './baileys-socket';

function makeFakeSession(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: 1,
    workspace_id: 1,
    status: 'initializing',
    phone_number: null,
    device_id: null,
    last_connected_at: null,
    last_disconnected_at: null,
    disconnect_reason: null,
    qr_code: null,
    qr_expires_at: null,
    ...overrides,
  } as SessionRow;
}

function makeFakeRepository(): SessionRepository {
  return {
    getOrCreateSession: vi.fn().mockResolvedValue(makeFakeSession()),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    recordConnectionEvent: vi.fn().mockResolvedValue(undefined),
    listConnectionEvents: vi.fn().mockResolvedValue([]),
    persistCredentialsFromDisk: vi.fn().mockResolvedValue(undefined),
    restoreCredentialsToDisk: vi.fn().mockResolvedValue(false),
    deleteCredentials: vi.fn().mockResolvedValue(undefined),
  } as unknown as SessionRepository;
}

interface FakeSocketHandle {
  socket: IBaileysSocket;
  triggerCredsUpdate: () => Promise<void>;
  triggerConnectionUpdate: (update: BaileysConnectionUpdate) => Promise<void>;
}

function makeFakeSocket(): FakeSocketHandle {
  let credsHandler: (() => void | Promise<void>) | null = null;
  let connectionHandler: ((update: BaileysConnectionUpdate) => void) | null = null;

  const socket: IBaileysSocket = {
    user: { id: '15551234567@s.whatsapp.net' } as never,
    ev: {
      on: vi.fn((event: string, listener: unknown) => {
        if (event === 'creds.update') credsHandler = listener as () => void | Promise<void>;
        if (event === 'connection.update')
          connectionHandler = listener as (update: BaileysConnectionUpdate) => void;
      }) as IBaileysSocket['ev']['on'],
    },
    end: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue({ key: { id: 'ABC123' } }),
    sendPresenceUpdate: vi.fn().mockResolvedValue(undefined),
  };

    return {
      socket,
      triggerCredsUpdate: async () => {
        await credsHandler?.();
      },
      triggerConnectionUpdate: async (update) => {
        connectionHandler?.(update);
        // allow the async handler chain (including QRCode.toDataURL) inside
        // ConnectionManager to flush without depending on timer advancement.
        await new Promise((resolve) => setImmediate(resolve));
      },
    };
  }

describe('ConnectionManager', () => {
  let repository: SessionRepository;
  let fakeSocket: FakeSocketHandle;
  let manager: ConnectionManager;

  beforeEach(async () => {
    repository = makeFakeRepository();
    fakeSocket = makeFakeSocket();

    manager = new ConnectionManager({
      workspaceId: 1,
      sessionDir: './sessions-test',
      repository,
      socketFactory: vi.fn().mockReturnValue(fakeSocket.socket),
      loadAuthStateFn: vi.fn().mockResolvedValue({
        state: {} as never,
        saveCreds: vi.fn().mockResolvedValue(undefined),
      }),
    });

    await manager.start();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('persists and emits on QR event', async () => {
    const listener = vi.fn();
    manager.on('connection.updated', listener);

    await fakeSocket.triggerConnectionUpdate({ qr: 'raw-qr-payload' });

    await vi.waitFor(() => {
      expect(manager.getStatus()).toBe('qr_pending');
    });
    expect(repository.updateStatus).toHaveBeenCalledWith(
      1,
      'qr_pending',
      expect.objectContaining({ qrCode: expect.stringContaining('data:image') }),
    );
    expect(repository.recordConnectionEvent).toHaveBeenCalledWith(1, 1, 'qr_generated');
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ status: 'qr_pending' }));
  });

  it('records an event when the connection opens', async () => {
    await fakeSocket.triggerConnectionUpdate({ connection: 'open' });

    expect(manager.getStatus()).toBe('connected');
    expect(repository.recordConnectionEvent).toHaveBeenCalledWith(1, 1, 'connected');
    expect(repository.updateStatus).toHaveBeenCalledWith(
      1,
      'connected',
      expect.objectContaining({ lastConnectedAt: expect.any(Date) }),
    );
    expect(repository.updateStatus).toHaveBeenCalledWith(
      1,
      'connected',
      expect.objectContaining({ phoneNumber: '15551234567' }),
    );
  });

  it('enters auth_required and clears credentials when Baileys reports loggedOut', async () => {
    await fakeSocket.triggerConnectionUpdate({
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: 401 } } },
    });

    expect(manager.getStatus()).toBe('auth_required');
    expect(repository.deleteCredentials).toHaveBeenCalledWith(1);
    expect(repository.recordConnectionEvent).toHaveBeenCalledWith(1, 1, 'logged_out', {
      statusCode: 401,
    });
  });

  it('enters auth_required and clears credentials when Baileys reports badSession', async () => {
    await fakeSocket.triggerConnectionUpdate({
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: 500 } } },
    });

    expect(manager.getStatus()).toBe('auth_required');
    expect(repository.deleteCredentials).toHaveBeenCalledWith(1);
    expect(repository.recordConnectionEvent).toHaveBeenCalledWith(1, 1, 'bad_session', {
      statusCode: 500,
    });
  });

  it('reconnects immediately with no backoff and no retry-budget cost on restartRequired', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    const updatePromise = fakeSocket.triggerConnectionUpdate({
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: 515 } } },
    });
    await vi.advanceTimersByTimeAsync(25);
    await updatePromise;

    expect(manager.getStatus()).toBe('reconnecting');
    // restartRequired reconnects directly, bypassing scheduleReconnect() - no
    // reconnect_attempt event/retry-count increment for a routine Baileys signal.
    expect(repository.recordConnectionEvent).not.toHaveBeenCalledWith(
      1,
      1,
      'reconnect_attempt',
      expect.anything(),
    );

    // The short (250ms) post-restart-required timer should fire and re-run start(),
    // which records a fresh 'connecting' event.
    await vi.advanceTimersByTimeAsync(300);
    expect(repository.recordConnectionEvent).toHaveBeenCalledWith(1, 1, 'connecting');
  });

  it('schedules a reconnect with backoff on a transient disconnect', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    const updatePromise = fakeSocket.triggerConnectionUpdate({
      connection: 'close',
      // 428 (connectionClosed) - a genuinely transient reason, distinct from
      // 401 (loggedOut) and 500 (badSession), both of which force re-auth instead.
      lastDisconnect: { error: { output: { statusCode: 428 } } },
    });
    await vi.advanceTimersByTimeAsync(25);
    await updatePromise;

    expect(manager.getStatus()).toBe('reconnecting');
    expect(repository.recordConnectionEvent).toHaveBeenCalledWith(
      1,
      1,
      'reconnect_attempt',
      expect.objectContaining({ attempt: 1 }),
    );

    // Backoff delay should be scheduled (base 2000ms +/- jitter); nothing has
    // fired yet before the timer elapses.
    expect(vi.getTimerCount()).toBeGreaterThan(0);
  });

  it('persists credentials to the database on creds.update', async () => {
    await fakeSocket.triggerCredsUpdate();

    expect(repository.persistCredentialsFromDisk).toHaveBeenCalledWith(1, expect.stringContaining('sessions-test'));
  });

  it('starts a fresh QR pairing flow by clearing old creds and stopping any active socket', async () => {
    await manager.startFreshPairing();

    expect(fakeSocket.socket.end).toHaveBeenCalledWith(undefined);
    expect(repository.deleteCredentials).toHaveBeenCalledWith(1);
    expect(repository.getOrCreateSession).toHaveBeenCalledTimes(3);
    expect(manager.getStatus()).toBe('connecting');
  });
});
