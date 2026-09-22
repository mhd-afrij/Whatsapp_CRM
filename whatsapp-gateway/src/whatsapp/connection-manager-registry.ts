import { EventEmitter } from 'node:events';
import { ConnectionManager, type ConnectionManagerOptions, type AccountHealthInfo } from './connection-manager';
import { SessionRepository } from './session-repository';
import { SessionLockRepository } from './session-lock-repository';
import { env } from '../config/env';
import { logger } from '../lib/logger';

/**
 * Owns the set of ConnectionManager instances for all WhatsApp accounts
 * connected to this gateway process. Keyed by `workspaceId:accountId`.
 *
 * Replaces the old process-wide singleton (one manager, one workspace): the
 * registry creates one ConnectionManager per whatsapp account, each with its
 * own session directory, encrypted credential store, and session-lock lease,
 * so a workspace can run multiple concurrent Baileys sessions.
 */
export class ConnectionManagerRegistry extends EventEmitter {
  private readonly managers = new Map<string, ConnectionManager>();
  private readonly repository = new SessionRepository();
  private readonly lockRepository: SessionLockRepository | null;
  /**
   * Options merged into every manager this registry creates. Production
   * leaves this empty; the multi-account test harness injects a mocked
   * socket factory / session repository so two accounts can be exercised
   * without a live Baileys connection.
   */
  private readonly defaultManagerOptions: Partial<ConnectionManagerOptions>;
  /** Milliseconds staggered between boot-restore starts (thundering-herd damper). */
  private readonly restoreStaggerMs: number;

  constructor(
    options: {
      defaultManagerOptions?: Partial<ConnectionManagerOptions>;
      restoreStaggerMs?: number;
    } = {},
  ) {
    super();
    this.lockRepository = env.SESSION_LOCK_ENABLED ? new SessionLockRepository() : null;
    this.defaultManagerOptions = options.defaultManagerOptions ?? {};
    this.restoreStaggerMs = options.restoreStaggerMs ?? 250;
  }

  private key(workspaceId: number, accountId: number): string {
    return `${workspaceId}:${accountId}`;
  }

  get(workspaceId: number, accountId: number): ConnectionManager | undefined {
    return this.managers.get(this.key(workspaceId, accountId));
  }

  /**
   * Returns the manager for an account, creating one (but NOT starting a
   * socket) if absent. Emits 'manager:created' so wiring listeners can attach
   * pipeline handlers.
   */
  getOrCreate(workspaceId: number, accountId: number): ConnectionManager {
    const existing = this.managers.get(this.key(workspaceId, accountId));
    if (existing) {
      return existing;
    }

    const options: ConnectionManagerOptions = {
      workspaceId,
      accountId,
      repository: this.repository,
      ...(this.lockRepository
        ? {
            lockRepository: this.lockRepository,
            gatewayInstanceId: env.GATEWAY_INSTANCE_ID,
            sessionLockLeaseMs: env.SESSION_LEASE_MS,
            sessionLockHeartbeatMs: env.SESSION_HEARTBEAT_INTERVAL_MS,
          }
        : {}),
      socketConfig: {
        ...(env.WHATSAPP_KEEPALIVE_INTERVAL_MS !== undefined
          ? { keepAliveIntervalMs: env.WHATSAPP_KEEPALIVE_INTERVAL_MS }
          : {}),
      },
      // Injectable per-test overrides (mock socket factory / repositories).
      // Injected options win so the harness can stub everything out.
      ...this.defaultManagerOptions,
    } as ConnectionManagerOptions;

    const manager = new ConnectionManager(options);
    this.managers.set(this.key(workspaceId, accountId), manager);
    this.emit('manager:created', manager);
    return manager;
  }

  getAll(): ConnectionManager[] {
    return [...this.managers.values()];
  }

  getForWorkspace(workspaceId: number): ConnectionManager[] {
    return this.getAll().filter((m) => m.getSnapshot().workspaceId === workspaceId);
  }

  async stopManager(workspaceId: number, accountId: number): Promise<void> {
    const manager = this.managers.get(this.key(workspaceId, accountId));
    if (!manager) {
      return;
    }
    await manager.stop();
    this.managers.delete(this.key(workspaceId, accountId));
  }

  /**
   * Starts a fresh QR pairing for an account's manager, creating the manager
   * if needed.
   */
  async startPairing(workspaceId: number, accountId: number): Promise<ConnectionManager> {
    const manager = this.getOrCreate(workspaceId, accountId);
    await manager.startFreshPairing();
    return manager;
  }

  /**
   * Restores every active whatsapp connection in every workspace this gateway
   * is responsible for. Iterates the whatsapp_connections rows (status !=
   * 'failed') and boots a ConnectionManager for each.
   *
   * Phase 6.5 - startup restoration:
   *  - bounded concurrency (`STARTUP_RESTORE_CONCURRENCY`, default 3) so N
   *    accounts restore in controlled batches instead of one thundering herd
   *    of simultaneous WebSocket connects + credential restores;
   *  - small intra-batch stagger between starts;
   *  - each account restores independently - one corrupted session is logged
   *    and skipped, never blocking the remaining accounts.
   */
  async restoreAllOnBoot(): Promise<void> {
    // Gatewise boot is workspace-scoped in single-instance deployments; the
    // registry owns the per-account iteration.
    const sessions = await this.repository.findActiveAccountsForWorkspace(env.WHATSAPP_WORKSPACE_ID);

    // Single-account deployment: no whatsapp_connections rows means the whole
    // workspace runs on the legacy (workspace-level) manager. Restore it so
    // the session reconnects on boot instead of waiting for an operator/Laravel
    // /reconnect poke. Skipped whenever at least one account row exists.
    if (sessions.length === 0) {
      const { connectionManager } = await import('./manager-instance');
      await connectionManager.restoreOnBoot().catch((err) => {
        logger.warn({ err }, 'Failed to restore legacy WhatsApp session on boot');
      });
      return;
    }

    const concurrency = Math.max(1, env.STARTUP_RESTORE_CONCURRENCY);

    for (let offset = 0; offset < sessions.length; offset += concurrency) {
      const batch = sessions.slice(offset, offset + concurrency);
      await Promise.all(
        batch.map(async (row, indexInBatch) => {
          const accountId = row.account_id as number;
          const manager = this.getOrCreate(env.WHATSAPP_WORKSPACE_ID, accountId);
          // Stagger the starts inside a batch so concurrent restorations do
          // not open all their WebSocket handshakes in the same tick.
          if (indexInBatch > 0 && this.restoreStaggerMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, indexInBatch * this.restoreStaggerMs));
          }
          await manager.restoreOnBoot().catch((err) => {
            logger.warn({ err, accountId }, 'Failed to restore WhatsApp session on boot');
          });
        }),
      );
    }
  }

  /**
   * Per-account health snapshots for every manager this process owns
   * (Phase 6.7/6.8). Never contains credentials or QR payloads. The process
   * can be healthy while individual accounts are disconnected - callers
   * must read these entries per account instead of collapsing them.
   */
  listAccountHealth(): AccountHealthInfo[] {
    return this.getAll().map((manager) => manager.getHealthInfo());
  }
}