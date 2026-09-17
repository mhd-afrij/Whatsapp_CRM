import fs from 'node:fs/promises';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import QRCode from 'qrcode';
import { DisconnectReason, type AuthenticationState } from '@whiskeysockets/baileys';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { SessionRepository } from './session-repository';
import { SessionLockRepository } from './session-lock-repository';
import { normalizePhoneToJid } from './jid';
import { computeBackoffDelayMs } from '../lib/backoff';
import {
  createBaileysSocket,
  loadAuthState,
  type BaileysConnectionUpdate,
  type BaileysPhoneNumberShare,
  type BaileysSocketFactory,
  type IBaileysSocket,
} from './baileys-socket';

/**
 * How long the pairing-code flow waits for the Baileys socket to complete its
 * initial handshake (WS open -> validateConnection -> WS 'open' -> 'connecting'
 * status) before giving up. requestPairingCode sends an IQ over the live
 * socket and fails immediately with "Connection Closed" when called too early,
 * so the gateway-side handler waits instead of letting a race decide.
 */
const PAIRING_SOCKET_READY_TIMEOUT_MS = 15_000;

/**
 * How long a requested pairing code stays valid in memory for status polling.
 * WhatsApp's real window is ~60-90s; the gateway TTL is intentionally the
 * same order of magnitude so a stale code never lingers in the UI.
 */
const PAIRING_CODE_TTL_MS = 90_000;

export class PairingCodeError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'PairingCodeError';
    this.code = code;
  }
}

export type ConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'qr_pending'
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'auth_required'
  | 'error';

export interface ConnectionUpdatedEvent {
  workspaceId: number;
  accountId: number | null;
  status: ConnectionStatus;
  qrCode: string | null;
  qrExpiresAt: string | null;
  phoneNumber: string | null;
  /** Non-null while a real Baileys pairing code is live for this session. */
  pairingCode: string | null;
  pairingCodeExpiresAt: string | null;
  /** The E.164 digits the live pairing code was requested for, when known. */
  pairingCodePhoneNumber: string | null;
}

/**
 * Phase 6.4 - QR lifetime is configuration (`WHATSAPP_QR_TTL_MS`), not a magic
 * constant, so operators can align it with WhatsApp's own ~60s window. The TTL
 * is tracked per ConnectionManager, i.e. per account: account A's QR expiry
 * clock never advances account B's.
 */

/**
 * Phase 6.1 - the single authoritative lifecycle model for one WhatsApp
 * account. `ConnectionStatus` already existed (idle/connecting/qr_pending/
 * connected/disconnected/reconnecting/auth_required/error); this table makes
 * the permitted edges explicit so a stale async callback (e.g. a late `qr`
 * update from a socket that was already logged out, or a duplicate `open`
 * after a close) cannot silently move an account into a contradictory state.
 *
 * Every legal edge the manager actually walks is listed. A transition that is
 * NOT listed is logged with structured context and IGNORED, so state cannot be
 * corrupted by a late event - explicit operator commands (stop/logout) bypass
 * the guard via `{ force: true }` because an operator action must always win.
 */
const ALLOWED_TRANSITIONS: Record<ConnectionStatus, readonly ConnectionStatus[]> = {
  idle: ['idle', 'connecting', 'qr_pending', 'disconnected', 'auth_required', 'error'],
  connecting: [
    'connecting',
    'qr_pending',
    'connected',
    'disconnected',
    'reconnecting',
    'auth_required',
    'error',
    'idle',
  ],
  qr_pending: [
    'qr_pending',
    'connecting',
    'connected',
    'disconnected',
    'reconnecting',
    'auth_required',
    'error',
  ],
  connected: ['connected', 'disconnected', 'reconnecting', 'auth_required', 'error', 'idle'],
  disconnected: [
    'disconnected',
    'connecting',
    'connected',
    'qr_pending',
    'reconnecting',
    'auth_required',
    'error',
    'idle',
  ],
  reconnecting: [
    'reconnecting',
    'connecting',
    'qr_pending',
    'connected',
    'disconnected',
    'auth_required',
    'error',
  ],
  auth_required: ['auth_required', 'connecting', 'qr_pending', 'disconnected', 'error', 'idle'],
  error: ['error', 'connecting', 'qr_pending', 'disconnected', 'idle'],
};

/** Disconnect reasons that mean "these credentials are dead" - never retry them. */
export type DisconnectClassification = 'logged_out' | 'bad_session' | 'restart_required' | 'transient_network_error';

/**
 * Phase 6.2 - classifies a Baileys close code into one of the two families the
 * reconnect policy cares about:
 *  - credential-invalidating (logged_out / badSession): the session material is
 *    unusable, so retrying is pointless - the account parks in `auth_required`
 *    until an operator re-pairs it.
 *  - temporary (everything else, including restartRequired): retry with backoff.
 */
export function classifyDisconnectReason(statusCode: number | undefined): DisconnectClassification {
  if (statusCode === DisconnectReason.loggedOut) {
    return 'logged_out';
  }
  if (statusCode === DisconnectReason.badSession) {
    return 'bad_session';
  }
  if (statusCode === DisconnectReason.restartRequired) {
    return 'restart_required';
  }
  return 'transient_network_error';
}

/** True when the classification means the stored credentials must be discarded. */
export function isCredentialInvalidating(classification: DisconnectClassification): boolean {
  return classification === 'logged_out' || classification === 'bad_session';
}

/**
 * Operator-facing health snapshot for one WhatsApp account (Phase 6.7).
 * Deliberately excludes credentials, auth blobs and QR payloads - this is
 * the shape exposed by /whatsapp/health and the registry's health listing.
 */
export interface AccountHealthInfo {
  workspaceId: number;
  accountId: number | null;
  status: ConnectionStatus;
  connected: boolean;
  /** True when a live Baileys socket object exists (may be mid-handshake). */
  hasSocket: boolean;
  qrPending: boolean;
  /** Reconnect attempts since the last successful open. */
  reconnectAttempts: number;
  lastConnectedAt: string | null;
  lastDisconnectedAt: string | null;
  /** Classification of the most recent disconnect (e.g. '515', 'logged_out'). */
  lastErrorCode: string | null;
  lastErrorAt: string | null;
}

/**
 * Pulls the diagnostic detail Baileys attaches to a `close` update out of the
 * Boom-wrapped error so the connection event row carries the actual reason
 * (statusCode + message) instead of an empty `{}`. Previously every disconnect
 * was recorded with no detail, which made the ~30s reconnect loop (seen in
 * production) impossible to diagnose from the DB alone.
 */
function extractDisconnectDetail(
  lastDisconnect?: BaileysConnectionUpdate['lastDisconnect'],
): { statusCode?: number; message?: string; errorName?: string } {
  const error = lastDisconnect?.error;
  if (!error) {
    return {};
  }
  const boom = error as {
    output?: { statusCode?: number };
    message?: string;
    data?: unknown;
  };
  const detail: { statusCode?: number; message?: string; errorName?: string } = {};
  if (typeof boom.output?.statusCode === 'number') {
    detail.statusCode = boom.output.statusCode;
  }
  if (typeof boom.message === 'string') {
    detail.message = boom.message;
  }
  if (typeof (error as { name?: unknown }).name === 'string') {
    detail.errorName = (error as { name: string }).name;
  }
  if (!detail.message && boom.data !== undefined && boom.data !== null) {
    const serialized = JSON.stringify(boom.data);
    if (serialized && serialized !== '{}') {
      detail.message = serialized.slice(0, 500);
    }
  }
  return detail;
}

export interface ConnectionManagerOptions {
  workspaceId?: number;
  /** Required for multi-account: scopes session, credentials, and lock to this account. */
  accountId?: number;
  sessionDir?: string;
  repository?: SessionRepository;
  socketFactory?: BaileysSocketFactory;
  loadAuthStateFn?: typeof loadAuthState;
  /**
   * Session-lock coordination (workspace_sync_assignments). When provided,
   * the manager must acquire the lock before opening a Baileys socket and
   * refuses to connect if another gateway instance holds a live lease.
   * Defaults to null (locking disabled - single-instance deployments need
   * no coordination; see src/config/env.ts SESSION_LOCK_ENABLED).
   */
  lockRepository?: SessionLockRepository | null;
  /** Stable identity used to claim the session lock (defaults to env.GATEWAY_INSTANCE_ID). */
  gatewayInstanceId?: string;
  /** Lease duration in ms for the session lock (defaults to env.SESSION_LEASE_MS). */
  sessionLockLeaseMs?: number;
  /** Heartbeat interval in ms (defaults to env.SESSION_HEARTBEAT_INTERVAL_MS). */
  sessionLockHeartbeatMs?: number;
  /** Extra Baileys socket options (e.g. keepAliveIntervalMs) applied on every socket creation. */
  socketConfig?: { keepAliveIntervalMs?: number };
}

/**
 * Owns the lifecycle of a single WhatsApp Web (Baileys) session for one
 * workspace: connecting, QR generation, credential persistence, connection
 * event logging, and reconnection with backoff.
 *
 * NOT LIVE-TESTED: real Baileys calls are wired via ./baileys-socket, but
 * this has never been exercised against a real WhatsApp account/device in
 * this environment. The lifecycle logic itself (state transitions,
 * persistence, backoff, re-auth detection) is covered by unit tests using a
 * mocked IBaileysSocket - see whatsapp/__tests__/connection-manager.test.ts.
 */
export class ConnectionManager extends EventEmitter {
  private socket: IBaileysSocket | null = null;
  private status: ConnectionStatus = 'idle';
  private qrCode: string | null = null;
  private qrExpiresAt: Date | null = null;
  private phoneNumber: string | null = null;
  private sessionId: number | null = null;
  private pairingCode: string | null = null;
  private pairingCodeExpiresAt: Date | null = null;
  private pairingCodePhoneNumber: string | null = null;
  private retryCount = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private manualStop = false;

  // Process-local health tracking (surfaced via getHealthInfo, Phase 6.7).
  private lastConnectedAt: Date | null = null;
  private lastDisconnectedAt: Date | null = null;
  private lastErrorCode: string | null = null;
  private lastErrorAt: Date | null = null;

  private readonly workspaceId: number;
  private readonly accountId: number | null;
  private readonly sessionDir: string;
  private readonly repository: SessionRepository;
  private readonly socketFactory: BaileysSocketFactory;
  private readonly loadAuthStateFn: typeof loadAuthState;
  private readonly lockRepository: SessionLockRepository | null;
  private readonly gatewayInstanceId: string;
  private readonly sessionLockLeaseMs: number;
  private readonly sessionLockHeartbeatMs: number;
  private readonly socketConfig: { keepAliveIntervalMs?: number };
  private lockHeartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: ConnectionManagerOptions = {}) {
    super();
    this.workspaceId = options.workspaceId ?? env.WHATSAPP_WORKSPACE_ID;
    this.accountId = options.accountId ?? null;
    this.sessionDir = options.sessionDir ?? env.WHATSAPP_SESSION_DIR;
    this.repository = options.repository ?? new SessionRepository();
    this.socketFactory = options.socketFactory ?? createBaileysSocket;
    this.loadAuthStateFn = options.loadAuthStateFn ?? loadAuthState;
    this.lockRepository = options.lockRepository ?? null;
    this.gatewayInstanceId = options.gatewayInstanceId ?? env.GATEWAY_INSTANCE_ID;
    this.sessionLockLeaseMs = options.sessionLockLeaseMs ?? env.SESSION_LEASE_MS;
    this.sessionLockHeartbeatMs = options.sessionLockHeartbeatMs ?? env.SESSION_HEARTBEAT_INTERVAL_MS;
    this.socketConfig = options.socketConfig ?? {};
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  /**
   * Live Baileys socket for this account, or null while disconnected.
   * Used by the account-context resolver so operations execute against
   * THIS account's socket only.
   */
  getSocket(): IBaileysSocket | null {
    return this.socket;
  }

  /**
   * In-memory health snapshot for this account (Phase 6.7). Mirrors the
   * whatsapp_sessions row fields that live only in the DB (lastConnectedAt
   * etc.) with process-local reconnect tracking, without credentials.
   */
  getHealthInfo(): AccountHealthInfo {
    return {
      workspaceId: this.workspaceId,
      accountId: this.accountId,
      status: this.status,
      connected: this.status === 'connected',
      hasSocket: this.socket !== null,
      qrPending: this.status === 'qr_pending',
      reconnectAttempts: this.retryCount,
      lastConnectedAt: this.lastConnectedAt ? this.lastConnectedAt.toISOString() : null,
      lastDisconnectedAt: this.lastDisconnectedAt ? this.lastDisconnectedAt.toISOString() : null,
      lastErrorCode: this.lastErrorCode,
      lastErrorAt: this.lastErrorAt ? this.lastErrorAt.toISOString() : null,
    };
  }

  getSnapshot(): ConnectionUpdatedEvent {
    return {
      workspaceId: this.workspaceId,
      accountId: this.accountId,
      status: this.status,
      qrCode: this.qrCode,
      qrExpiresAt: this.qrExpiresAt ? this.qrExpiresAt.toISOString() : null,
      phoneNumber: this.phoneNumber,
      pairingCode: this.pairingCode,
      pairingCodeExpiresAt: this.pairingCodeExpiresAt ? this.pairingCodeExpiresAt.toISOString() : null,
      pairingCodePhoneNumber: this.pairingCodePhoneNumber,
    };
  }

  /**
   * Resolves once the Baileys socket has completed its initial noise handshake
   * and is ready to accept the pairing-code IQ. For an unregistered session
   * the first `qr` connection.update (surfaced here as status 'qr_pending')
   * only fires after validateConnection() finished, so it is the reliable
   * readiness signal; calling requestPairingCode earlier fails with
   * "Connection Closed" because the noise channel is not encrypted yet.
   */
  private waitForPairingReady(): Promise<void> {
    if (this.status === 'qr_pending') {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.off('connection.updated', onUpdate);
        reject(new PairingCodeError('WhatsApp pairing session did not become ready in time', 'SOCKET_READY_TIMEOUT'));
      }, PAIRING_SOCKET_READY_TIMEOUT_MS);

      const onUpdate = (snapshot: ConnectionUpdatedEvent): void => {
        if (snapshot.status === 'qr_pending') {
          clearTimeout(timeout);
          this.off('connection.updated', onUpdate);
          resolve();
        }
      };

      this.on('connection.updated', onUpdate);
    });
  }

  /**
   * Requests a REAL device pairing code from the live Baileys session - the
   * same mechanism WhatsApp Web's "Link with phone number" uses. Never
   * generates a code locally: the value returned by Baileys (ultimately
   * WhatsApp's servers) is passed through verbatim.
   *
   * Prerequisites verified here:
   *  - the socket is live and past its initial handshake (waitForSocketReady);
   *  - the session is still UNREGISTERED (creds.me unset). A paired session
   *    has nothing to link, so the request is refused rather than silently
   *    returning a meaningless code.
   *
   * The flow starts a fresh pairing first when the session already holds
   * credentials (startFreshPairing wipes them and reconnects), so a
   * previously-paired workspace can still switch to code linking.
   */
  async requestPairingCode(phoneNumber: string): Promise<{ pairingCode: string; expiresAt: string }> {
    // A still-registered session cannot link a new device; restart pairing
    // first so Baileys opens a fresh unregistered socket.
    if (this.status === 'connected') {
      await this.startFreshPairing();
    }

    if (!this.socket) {
      await this.start();
    }

    try {
      // Fast-path: a registered session (creds.me set) never emits a QR, so
      // waiting for pairing readiness would just time out. Detect it off the
      // live socket's own auth state - which is loaded synchronously before
      // the socket is created - and restart pairing immediately.
      const readCredsMe = (sock: IBaileysSocket | null): unknown =>
        (sock as unknown as { authState?: { creds?: { me?: unknown } } } | null)?.authState?.creds?.me ?? null;

      if (readCredsMe(this.socket)) {
        await this.startFreshPairing();
        if (readCredsMe(this.socket)) {
          throw new PairingCodeError(
            'This WhatsApp session is already linked. Log out before linking again.',
            'ALREADY_LINKED',
          );
        }
      }

      await this.waitForPairingReady();

      const socket = this.socket;
      if (!socket || !socket.requestPairingCode) {
        throw new PairingCodeError(
          'The installed Baileys version does not expose requestPairingCode',
          'PAIRING_UNSUPPORTED',
        );
      }

      const pairingCode = await socket.requestPairingCode(phoneNumber);
      if (!pairingCode) {
        throw new PairingCodeError('WhatsApp did not return a pairing code', 'NO_CODE');
      }

      this.pairingCode = pairingCode;
      this.pairingCodeExpiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS);
      this.pairingCodePhoneNumber = phoneNumber;

      if (this.sessionId) {
        await this.repository.recordConnectionEvent(this.workspaceId, this.sessionId, 'connecting', {
          method: 'pairing_code',
          phoneNumber,
        });
      }

      // The status string usually stays 'connecting' through the code window,
      // so broadcast the new snapshot explicitly: socket subscribers (UI) must
      // learn the code immediately without polling.
      this.emit('connection.updated', this.getSnapshot());

      return { pairingCode, expiresAt: this.pairingCodeExpiresAt.toISOString() };
    } catch (err) {
      if (err instanceof PairingCodeError) {
        throw err;
      }
      logger.error({ err, phoneNumber }, 'Real Baileys requestPairingCode failed');
      const message = err instanceof Error ? err.message : 'Unknown pairing failure';
      throw new PairingCodeError(message, 'PAIRING_FAILED');
    }
  }

  private clearPairingCode(): void {
    this.pairingCode = null;
    this.pairingCodeExpiresAt = null;
    this.pairingCodePhoneNumber = null;
  }

  /** Called on gateway boot: restores an existing session if possible, otherwise starts QR pairing. */
  async restoreOnBoot(): Promise<void> {
    const session = await this.repository.getOrCreateSession(this.workspaceId, this.accountId);
    this.sessionId = session.id;
    this.phoneNumber = session.phone_number;

    if (session.status === 'logged_out') {
      await this.startFreshPairing();
      return;
    }

    const restored = await this.repository.restoreCredentialsToDisk(session.id, this.authDir());
    if (restored) {
      logger.info({ workspaceId: this.workspaceId, accountId: this.accountId }, 'Restoring WhatsApp session on gateway boot');
      await this.start();
      return;
    }

    await this.startFreshPairing();
  }

  /**
   * Clears any saved WhatsApp auth material and starts a fresh QR pairing flow.
   * This is the manual path exposed by the UI's Connect button.
   */
  async startFreshPairing(): Promise<void> {
    if (this.socket) {
      this.manualStop = true;
      this.clearReconnectTimer();
      this.socket.end(undefined);
      this.socket = null;
    }

    // Any pairing code issued against the old socket is dead once pairing
    // restarts; keep the snapshot honest.
    this.clearPairingCode();

    await this.clearStoredCredentials();
    await this.start();
  }

  async start(): Promise<void> {
    if (this.socket) {
      logger.warn('ConnectionManager.start() called but a socket already exists');
      return;
    }

    this.manualStop = false;

    if (this.lockRepository) {
      const acquired = await this.acquireSessionLock();
      if (!acquired) {
        return;
      }
    }

    const session = await this.repository.getOrCreateSession(this.workspaceId, this.accountId);
    this.sessionId = session.id;

    this.setStatus('connecting');
    await this.repository.recordConnectionEvent(this.workspaceId, session.id, 'connecting', { accountId: this.accountId });

    const { state, saveCreds }: { state: AuthenticationState; saveCreds: () => Promise<void> } =
      await this.loadAuthStateFn(this.authDir());

    this.socket = this.socketFactory(state, {
      onUnexpectedError: (context, err) => this.handleUnexpectedBaileysError(context, err),
      ...(this.socketConfig.keepAliveIntervalMs !== undefined
        ? { keepAliveIntervalMs: this.socketConfig.keepAliveIntervalMs }
        : {}),
    });

    this.socket.ev.on('creds.update', async () => {
      await saveCreds();
      if (this.sessionId) {
        await this.repository.persistCredentialsFromDisk(this.sessionId, this.authDir());
      }
    });

    this.socket.ev.on('connection.update', (update) => {
      void this.handleConnectionUpdate(update);
    });

    this.socket.ev.on('messages.upsert', (payload) => {
      this.emit('messages.upsert', { workspaceId: this.workspaceId, accountId: this.accountId, payload });
    });

    this.socket.ev.on('messages.update', (payload) => {
      this.emit('messages.update', { workspaceId: this.workspaceId, accountId: this.accountId, payload });
    });

    this.socket.ev.on('contacts.upsert', (payload) => {
      this.emit('contacts.upsert', { workspaceId: this.workspaceId, accountId: this.accountId, payload });
    });

    this.socket.ev.on('messaging-history.set', (payload) => {
      this.emit('messaging-history.set', { workspaceId: this.workspaceId, accountId: this.accountId, payload });
    });

    this.socket.ev.on('chats.phoneNumberShare', (payload: BaileysPhoneNumberShare) => {
      this.emit('chats.phoneNumberShare', { workspaceId: this.workspaceId, accountId: this.accountId, payload });
    });

    this.socket.ev.on('messages.upsert', (payload) => {
      // Handle protocol messages (message revokes)
      for (const raw of payload.messages) {
        if (raw.message?.protocolMessage) {
          this.emit('message.revoked', {
            workspaceId: this.workspaceId,
            accountId: this.accountId,
            payload: {
              key: raw.key,
              protocolMessage: raw.message.protocolMessage,
            },
          });
        }
      }
    });
  }

  /**
   * Ends the live socket so the connection.update 'close' handler schedules a
   * bounded backoff reconnect. Used when a send times out against a session
   * that still reports 'connected' but is not answering queries (a zombie
   * connection) - the next send retry then runs against a fresh session.
   */
  requestConnectionRefresh(): void {
    if (this.manualStop || !this.socket) {
      return;
    }
    logger.warn('Refreshing WhatsApp connection after send failure');
    try {
      this.socket.end(undefined);
    } catch (err) {
      logger.warn({ err }, 'Failed to close socket during connection refresh');
    }
  }

  /**
   * Baileys reports "unexpected error in 'init queries'" (query timeouts) only
   * through its logger - the socket stays flagged 'connected' but stops
   * answering queries, so every send fails. React by closing the socket; the
   * normal 'close' handler then schedules the bounded backoff reconnect,
   * healing the session without manual intervention.
   */
  private handleUnexpectedBaileysError(context: string, err: unknown): void {
    if (this.manualStop) {
      return;
    }
    // Baileys surfaces transient failures here (init queries, presence updates,
    // ...) without closing the socket itself. We deliberately do NOT close:
    // tearing the socket down on any one timeout is what produced the endless
    // connect -> init-query timeout -> reconnect loop seen in production. A
    // genuinely dead query channel still surfaces via the WS ping/pong or the
    // next real query, which Baileys handles itself. Log and let the
    // connection carry on.
    logger.warn(
      { context, err },
      'Baileys reported an unexpected (non-fatal) error; keeping connection open',
    );
  }

  /** Exposes the raw socket's media downloader so the media-download queue processor can use it. */
  getMediaDownloader(): ((message: unknown) => Promise<Buffer>) | null {
    return this.socket?.downloadMediaMessage ?? null;
  }

  async stop(): Promise<void> {
    this.manualStop = true;
    this.clearReconnectTimer();
    this.stopLockHeartbeat();

    if (this.socket) {
      try {
        this.socket.end(undefined);
      } finally {
        this.socket = null;
      }
    }

    this.setStatus('disconnected', { force: true });
    this.phoneNumber = null;
    if (this.sessionId) {
      await this.repository.recordConnectionEvent(this.workspaceId, this.sessionId, 'disconnected', {
        reason: 'manual_disconnect',
      });
      await this.repository.updateStatus(this.sessionId, 'disconnected', {
        phoneNumber: null,
        lastDisconnectedAt: new Date(),
      });
    }

    await this.releaseSessionLock();
  }

  async reconnect(): Promise<void> {
    this.clearReconnectTimer();
    this.retryCount = 0;
    if (this.socket) {
      this.socket.end(undefined);
      this.socket = null;
    }
    await this.start();
  }

  /** Full re-auth: clears persisted credentials so the next start() issues a fresh QR. */
  async logout(): Promise<void> {
    if (this.socket) {
      try {
        await this.socket.logout();
      } catch (err) {
        logger.warn({ err }, 'Error during Baileys logout (continuing with local cleanup)');
      } finally {
        this.socket.end(undefined);
        this.socket = null;
      }
    }

    await this.clearStoredCredentials();
    this.stopLockHeartbeat();
    this.phoneNumber = null;

    if (this.sessionId) {
      await this.repository.recordConnectionEvent(this.workspaceId, this.sessionId, 'logged_out');
      await this.repository.updateStatus(this.sessionId, 'logged_out', {
        phoneNumber: null,
        lastDisconnectedAt: new Date(),
        disconnectReason: 'logged_out',
      });
    }

    this.setStatus('auth_required', { force: true });

    await this.releaseSessionLock();
  }

  private async handleConnectionUpdate(update: BaileysConnectionUpdate): Promise<void> {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      await this.handleQr(qr);
    }

    if (connection === 'open') {
      await this.handleOpen();
    } else if (connection === 'close') {
      await this.handleClose(lastDisconnect);
    }
  }

  /**
   * Any state change after a code was issued invalidates it: a fresh QR round
   * replaces it, a connect consumed it, a close killed it. Keeping the field
   * stale would let the UI show a code WhatsApp already stopped accepting.
   */
  private syncPairingCodeWithStatus(): void {
    if (this.pairingCode && (this.status === 'connected' || this.status === 'qr_pending' || this.status === 'disconnected' || this.status === 'auth_required' || this.status === 'error')) {
      this.clearPairingCode();
    }
  }

  private async handleQr(qr: string): Promise<void> {
    this.qrCode = await QRCode.toDataURL(qr);
    this.qrExpiresAt = new Date(Date.now() + env.WHATSAPP_QR_TTL_MS);
    this.setStatus('qr_pending');

    if (this.sessionId) {
      await this.repository.updateStatus(this.sessionId, 'qr_pending', {
        phoneNumber: this.phoneNumber,
        qrCode: this.qrCode,
        qrExpiresAt: this.qrExpiresAt,
      });
      await this.repository.recordConnectionEvent(this.workspaceId, this.sessionId, 'qr_generated');
    }
  }

  private async handleOpen(): Promise<void> {
    this.retryCount = 0;
    this.qrCode = null;
    this.qrExpiresAt = null;
    this.phoneNumber = this.resolveConnectedPhoneNumber();
    this.lastConnectedAt = new Date();
    this.lastErrorCode = null;
    this.lastErrorAt = null;
    this.setStatus('connected');

    if (this.sessionId) {
      await this.repository.updateStatus(this.sessionId, 'connected', {
        phoneNumber: this.phoneNumber,
        lastConnectedAt: new Date(),
        qrCode: null,
        qrExpiresAt: null,
      });
      await this.repository.recordConnectionEvent(this.workspaceId, this.sessionId, 'connected');
    }
  }

  private async handleClose(lastDisconnect: BaileysConnectionUpdate['lastDisconnect']): Promise<void> {
    const disconnectDetail = extractDisconnectDetail(lastDisconnect);
    const statusCode = disconnectDetail.statusCode;
    // Phase 6.2 - single source of truth for "is this a dead credential or a
    // temporary fault?". A corrupt/unrecoverable session (badSession) fails
    // identically on every retry, so reconnecting with the same on-disk creds
    // just burns the retry budget: both loggedOut and badSession park the
    // account in `auth_required` for a fresh QR pair instead of looping.
    const classification = classifyDisconnectReason(statusCode);
    const isCredentialDead = isCredentialInvalidating(classification);
    const isLoggedOut = classification === 'logged_out';
    // Baileys fires restartRequired routinely (e.g. right after pairing)
    // expecting an immediate reconnect - it is not a failure, so it must not
    // consume retry budget or wait out a backoff delay.
    const isRestartRequired = classification === 'restart_required';

    this.lastDisconnectedAt = new Date();
    this.lastErrorAt = this.lastDisconnectedAt;
    this.lastErrorCode = disconnectDetail.errorName ?? (statusCode !== undefined ? String(statusCode) : null);

    this.socket = null;

    if (isCredentialDead) {
      if (this.sessionId) {
        await this.repository.deleteCredentials(this.sessionId);
        await this.repository.recordConnectionEvent(
          this.workspaceId,
          this.sessionId,
          isLoggedOut ? 'logged_out' : 'bad_session',
          { ...disconnectDetail, accountId: this.accountId, classification },
        );
        await this.repository.updateStatus(this.sessionId, 'logged_out', {
          phoneNumber: null,
          lastDisconnectedAt: new Date(),
          disconnectReason: classification,
        });
      }
      logger.warn(
        { accountId: this.accountId, classification, ...disconnectDetail },
        'WhatsApp credentials invalidated; automatic reconnect disabled until re-pair',
      );
      this.phoneNumber = null;
      this.setStatus('auth_required');
      return;
    }

    if (this.sessionId) {
      await this.repository.recordConnectionEvent(this.workspaceId, this.sessionId, 'disconnected', {
        ...disconnectDetail,
        accountId: this.accountId,
        reason: classification,
      });
      await this.repository.updateStatus(this.sessionId, 'disconnected', {
        phoneNumber: null,
        lastDisconnectedAt: new Date(),
        disconnectReason: classification,
      });
    }

    this.phoneNumber = null;
    this.setStatus('disconnected');

    logger.warn(
      { accountId: this.accountId, classification, ...disconnectDetail, isRestartRequired },
      'WhatsApp connection closed; scheduling reconnect',
    );

    if (this.manualStop) {
      return;
    }

    if (isRestartRequired) {
      this.retryCount = 0;
      this.clearReconnectTimer();
      this.setStatus('reconnecting');
      this.reconnectTimer = setTimeout(() => {
        void this.start().catch((err) => {
          logger.error({ err, accountId: this.accountId }, 'Post-restart-required reconnect failed to start');
        });
      }, env.WHATSAPP_RESTART_REQUIRED_DELAY_MS);
      return;
    }

    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.retryCount >= env.WHATSAPP_RECONNECT_MAX_ATTEMPTS) {
      logger.error(
        { accountId: this.accountId, retryCount: this.retryCount },
        'WhatsApp reconnect retries exhausted; giving up automatic reconnection',
      );
      this.setStatus('error');
      return;
    }

    this.retryCount += 1;
    // Phase 6.3 - reconnect-storm protection: the shared exponential-backoff
    // helper adds random jitter on top of the capped exponential delay, so a
    // fleet of accounts that dropped together (WhatsApp/network outage) spread
    // their reconnects out instead of hammering the socket layer in lockstep.
    const delayMs = computeBackoffDelayMs(this.retryCount, {
      baseMs: env.WHATSAPP_RECONNECT_BASE_DELAY_MS,
      maxMs: env.WHATSAPP_RECONNECT_MAX_DELAY_MS,
      jitterRatio: env.WHATSAPP_RECONNECT_JITTER_RATIO,
    });

    this.setStatus('reconnecting');

    if (this.sessionId) {
      void this.repository.recordConnectionEvent(
        this.workspaceId,
        this.sessionId,
        'reconnect_attempt',
        { attempt: this.retryCount, delayMs, accountId: this.accountId },
      );
    }

    logger.info(
      { accountId: this.accountId, attempt: this.retryCount, delayMs },
      'Scheduling WhatsApp reconnect attempt',
    );

    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      void this.start().catch((err) => {
        logger.error({ err, accountId: this.accountId }, 'Reconnect attempt failed to start');
      });
    }, delayMs);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setStatus(status: ConnectionStatus, options: { force?: boolean } = {}): void {
    if (status !== this.status && !ALLOWED_TRANSITIONS[this.status].includes(status)) {
      if (!options.force) {
        // Phase 6.1 - an illegal edge means a stale/late async event. Ignoring
        // it keeps one account's state coherent instead of letting a late
        // callback from a previous socket generation rewrite the current one.
        logger.warn(
          {
            event: 'invalid_connection_transition',
            workspaceId: this.workspaceId,
            accountId: this.accountId,
            from: this.status,
            to: status,
          },
          'Ignored invalid WhatsApp connection state transition',
        );
        return;
      }
      logger.warn(
        {
          event: 'forced_connection_transition',
          workspaceId: this.workspaceId,
          accountId: this.accountId,
          from: this.status,
          to: status,
        },
        'Forced WhatsApp connection state transition (explicit operator command)',
      );
    }

    this.status = status;
    this.syncPairingCodeWithStatus();
    this.emit('connection.updated', this.getSnapshot());
  }

  private resolveConnectedPhoneNumber(): string | null {
    const user = this.socket?.user;
    const connectedId = user?.jid ?? user?.id ?? null;
    if (!connectedId) {
      return null;
    }

    const candidate = connectedId.includes('@') ? connectedId.split('@')[0] : connectedId;
    return candidate || null;
  }

  /** Per-account session directory: {sessionDir}/{workspaceId}/{accountId}/ */
  private authDir(): string {
    if (this.accountId) {
      return path.resolve(this.sessionDir, String(this.workspaceId), String(this.accountId));
    }
    return path.resolve(this.sessionDir);
  }

  private async clearStoredCredentials(): Promise<void> {
    const session = await this.repository.getOrCreateSession(this.workspaceId, this.accountId);
    this.sessionId = session.id;

    await this.repository.deleteCredentials(session.id);

    try {
      await fs.rm(this.authDir(), { recursive: true, force: true });
    } catch (err) {
      logger.warn({ err, workspaceId: this.workspaceId }, 'Failed to clear WhatsApp auth directory');
    }
  }

  /**
   * Claims the workspace's session lock before opening a socket. Returns
   * false (after logging and setting an in-memory 'error' status) when
   * another gateway instance holds a live lease - this process must not
   * connect in that case, or it would force a re-pair on the owner.
   */
  private async acquireSessionLock(): Promise<boolean> {
    if (!this.lockRepository) {
      return true;
    }

    const acquired = await this.lockRepository.acquire(
      this.workspaceId,
      this.gatewayInstanceId,
      this.sessionLockLeaseMs,
      this.accountId,
    );
    if (!acquired) {
      logger.error(
        { workspaceId: this.workspaceId, accountId: this.accountId, gatewayInstanceId: this.gatewayInstanceId },
        'Cannot open WhatsApp socket: session lock is held by another gateway instance',
      );
      this.setStatus('error');
      return false;
    }

    logger.info(
      { workspaceId: this.workspaceId, accountId: this.accountId, gatewayInstanceId: this.gatewayInstanceId },
      'Session lock acquired',
    );
    this.startLockHeartbeat();
    return true;
  }

  private startLockHeartbeat(): void {
    if (!this.lockRepository || this.lockHeartbeatTimer) {
      return;
    }

    this.lockHeartbeatTimer = setInterval(() => {
      void this.lockRepository
        ?.heartbeat(this.workspaceId, this.gatewayInstanceId, this.sessionLockLeaseMs, this.accountId)
        .then((owned) => {
          if (owned) {
            return;
          }
          logger.error(
            { workspaceId: this.workspaceId, accountId: this.accountId, gatewayInstanceId: this.gatewayInstanceId },
            'Session lock heartbeat lost ownership - stopping socket to avoid a concurrent session',
          );
          this.stopLockHeartbeat();
          if (this.socket) {
            try {
              this.socket.end(undefined);
            } finally {
              this.socket = null;
            }
          }
          this.setStatus('error');
        })
        .catch((err) => {
          logger.warn({ err }, 'Session lock heartbeat failed (will retry)');
        });
    }, this.sessionLockHeartbeatMs);
  }

  private stopLockHeartbeat(): void {
    if (this.lockHeartbeatTimer) {
      clearInterval(this.lockHeartbeatTimer);
      this.lockHeartbeatTimer = null;
    }
  }

  private async releaseSessionLock(): Promise<void> {
    this.stopLockHeartbeat();
    if (!this.lockRepository) {
      return;
    }
    await this.lockRepository.release(this.workspaceId, this.gatewayInstanceId, this.accountId).catch((err) => {
      logger.warn({ err, workspaceId: this.workspaceId, accountId: this.accountId }, 'Failed to release WhatsApp session lock');
    });
  }

  /**
   * Send a presence update (typing indicator) to a WhatsApp contact.
   * Baileys supports 'composing' (typing), 'recording' (voice), and 'available'/'unavailable' states.
   */
  async sendPresenceUpdate(
    presence: 'composing' | 'recording' | 'available' | 'unavailable',
    to: string,
  ): Promise<void> {
    if (!this.socket || this.status !== 'connected') {
      return;
    }
    const jid = normalizePhoneToJid(to, env.WHATSAPP_COUNTRY_CODE);
    await this.socket.sendPresenceUpdate(presence, jid);
  }

  /** Generalized send used by the outbound dispatch pipeline (text, quoted reply, media). */
  async sendContent(
    to: string,
    content: { text: string } | Record<string, unknown>,
    _replyToWhatsappMessageId?: string | null,
  ): Promise<{ id: string | null | undefined }> {
    if (!this.socket || this.status !== 'connected') {
      throw new Error(`Cannot send message: WhatsApp connection is not established (status=${this.status})`);
    }

    const jid = normalizePhoneToJid(to, env.WHATSAPP_COUNTRY_CODE);
    const result = await this.socket.sendMessage(jid, content);
    return { id: result?.key.id };
  }
}
