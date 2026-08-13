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
import {
  createBaileysSocket,
  loadAuthState,
  type BaileysConnectionUpdate,
  type BaileysSocketFactory,
  type IBaileysSocket,
} from './baileys-socket';

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
  status: ConnectionStatus;
  qrCode: string | null;
  qrExpiresAt: string | null;
  phoneNumber: string | null;
}

const QR_TTL_MS = 60_000;
const BASE_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 5 * 60_000;
const MAX_RETRIES = 10;

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
  private retryCount = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private manualStop = false;

  private readonly workspaceId: number;
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

  /** Whether session-lock coordination is active for this manager. */
  isLockingEnabled(): boolean {
    return this.lockRepository !== null;
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  getSnapshot(): ConnectionUpdatedEvent {
    return {
      workspaceId: this.workspaceId,
      status: this.status,
      qrCode: this.qrCode,
      qrExpiresAt: this.qrExpiresAt ? this.qrExpiresAt.toISOString() : null,
      phoneNumber: this.phoneNumber,
    };
  }

  /** Called on gateway boot: restores an existing session if possible, otherwise starts QR pairing. */
  async restoreOnBoot(): Promise<void> {
    const session = await this.repository.getOrCreateSession(this.workspaceId);
    this.sessionId = session.id;
    this.phoneNumber = session.phone_number;

    if (session.status === 'logged_out') {
      await this.startFreshPairing();
      return;
    }

    const restored = await this.repository.restoreCredentialsToDisk(session.id, this.authDir());
    if (restored) {
      logger.info({ workspaceId: this.workspaceId }, 'Restoring WhatsApp session on gateway boot');
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

    const session = await this.repository.getOrCreateSession(this.workspaceId);
    this.sessionId = session.id;

    this.setStatus('connecting');
    await this.repository.recordConnectionEvent(this.workspaceId, session.id, 'connecting');

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
      this.emit('messages.upsert', { workspaceId: this.workspaceId, payload });
    });

    this.socket.ev.on('messages.update', (payload) => {
      this.emit('messages.update', { workspaceId: this.workspaceId, payload });
    });

    this.socket.ev.on('contacts.upsert', (payload) => {
      this.emit('contacts.upsert', { workspaceId: this.workspaceId, payload });
    });

    this.socket.ev.on('messages.upsert', (payload) => {
      // Handle protocol messages (message revokes)
      for (const raw of payload.messages) {
        if (raw.message?.protocolMessage) {
          this.emit('message.revoked', {
            workspaceId: this.workspaceId,
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

    this.setStatus('disconnected');
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

    this.setStatus('auth_required');

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

  private async handleQr(qr: string): Promise<void> {
    this.qrCode = await QRCode.toDataURL(qr);
    this.qrExpiresAt = new Date(Date.now() + QR_TTL_MS);
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
    const isLoggedOut = statusCode === DisconnectReason.loggedOut;
    // A corrupt/unrecoverable session (500) will fail identically on every retry - reconnecting
    // with the same on-disk creds just burns the retry budget. Force a fresh QR pairing instead,
    // same as an explicit logout.
    const isBadSession = statusCode === DisconnectReason.badSession;
    // Baileys fires this routinely (e.g. right after pairing) expecting an immediate reconnect -
    // it isn't a failure, so it shouldn't consume retry budget or wait out a backoff delay.
    const isRestartRequired = statusCode === DisconnectReason.restartRequired;

    this.socket = null;

    if (isLoggedOut || isBadSession) {
      if (this.sessionId) {
        await this.repository.deleteCredentials(this.sessionId);
        await this.repository.recordConnectionEvent(
          this.workspaceId,
          this.sessionId,
          isLoggedOut ? 'logged_out' : 'bad_session',
          disconnectDetail,
        );
        await this.repository.updateStatus(this.sessionId, 'logged_out', {
          phoneNumber: null,
          lastDisconnectedAt: new Date(),
          disconnectReason: isLoggedOut ? 'logged_out' : 'bad_session',
        });
      }
      this.phoneNumber = null;
      this.setStatus('auth_required');
      return;
    }

    if (this.sessionId) {
      await this.repository.recordConnectionEvent(this.workspaceId, this.sessionId, 'disconnected', {
        ...disconnectDetail,
        reason: isRestartRequired ? 'restart_required' : 'transient_network_error',
      });
      await this.repository.updateStatus(this.sessionId, 'disconnected', {
        phoneNumber: null,
        lastDisconnectedAt: new Date(),
        disconnectReason: isRestartRequired ? 'restart_required' : 'transient_network_error',
      });
    }

    this.phoneNumber = null;
    this.setStatus('disconnected');

    logger.warn(
      { ...disconnectDetail, isRestartRequired },
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
          logger.error({ err }, 'Post-restart-required reconnect failed to start');
        });
      }, 250);
      return;
    }

    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.retryCount >= MAX_RETRIES) {
      logger.error(
        { retryCount: this.retryCount },
        'WhatsApp reconnect retries exhausted; giving up automatic reconnection',
      );
      this.setStatus('error');
      return;
    }

    this.retryCount += 1;
    const exponential = Math.min(BASE_BACKOFF_MS * 2 ** (this.retryCount - 1), MAX_BACKOFF_MS);
    const jitter = Math.random() * exponential * 0.2;
    const delayMs = Math.round(exponential + jitter);

    this.setStatus('reconnecting');

    if (this.sessionId) {
      void this.repository.recordConnectionEvent(
        this.workspaceId,
        this.sessionId,
        'reconnect_attempt',
        { attempt: this.retryCount, delayMs },
      );
    }

    logger.info({ attempt: this.retryCount, delayMs }, 'Scheduling WhatsApp reconnect attempt');

    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      void this.start().catch((err) => {
        logger.error({ err }, 'Reconnect attempt failed to start');
      });
    }, delayMs);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
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

  private authDir(): string {
    return path.resolve(this.sessionDir);
  }

  private async clearStoredCredentials(): Promise<void> {
    const session = await this.repository.getOrCreateSession(this.workspaceId);
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
    );
    if (!acquired) {
      logger.error(
        { workspaceId: this.workspaceId, gatewayInstanceId: this.gatewayInstanceId },
        'Cannot open WhatsApp socket: session lock is held by another gateway instance',
      );
      this.setStatus('error');
      return false;
    }

    logger.info(
      { workspaceId: this.workspaceId, gatewayInstanceId: this.gatewayInstanceId },
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
        ?.heartbeat(this.workspaceId, this.gatewayInstanceId, this.sessionLockLeaseMs)
        .then((owned) => {
          if (owned) {
            return;
          }
          logger.error(
            { workspaceId: this.workspaceId, gatewayInstanceId: this.gatewayInstanceId },
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
    await this.lockRepository.release(this.workspaceId, this.gatewayInstanceId).catch((err) => {
      logger.warn({ err, workspaceId: this.workspaceId }, 'Failed to release WhatsApp session lock');
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

  async sendMessage(to: string, text: string): Promise<{ id: string | null | undefined }> {
    if (!this.socket || this.status !== 'connected') {
      throw new Error(`Cannot send message: WhatsApp connection is not established (status=${this.status})`);
    }

    const jid = normalizePhoneToJid(to, env.WHATSAPP_COUNTRY_CODE);
    const result = await this.socket.sendMessage(jid, { text });

    return { id: result?.key.id };
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
