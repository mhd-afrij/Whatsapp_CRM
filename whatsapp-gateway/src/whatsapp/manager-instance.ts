import { ConnectionManager } from './connection-manager';
import { SessionLockRepository } from './session-lock-repository';
import { env } from '../config/env';
import { emitConnectionUpdated } from '../lib/socket-server';
import { logger } from '../lib/logger';
import type { BaileysContactsUpsert, BaileysMessagesUpsert, BaileysMessageUpdate } from './baileys-socket';

/**
 * Process-wide singleton ConnectionManager. Emits every internal
 * connection.updated event onto the Socket.IO /gateway namespace, and
 * dispatches inbound message/status events into the Phase 5 sync pipeline.
 *
 * Session-lock coordination (workspace_sync_assignments) is wired in only
 * when SESSION_LOCK_ENABLED=true - a single-instance deployment needs no
 * coordination and gets zero extra DB work (see src/config/env.ts).
 */
export const connectionManager = new ConnectionManager(
  env.SESSION_LOCK_ENABLED
    ? {
        lockRepository: new SessionLockRepository(),
        gatewayInstanceId: env.GATEWAY_INSTANCE_ID,
        sessionLockLeaseMs: env.SESSION_LEASE_MS,
        sessionLockHeartbeatMs: env.SESSION_HEARTBEAT_INTERVAL_MS,
        socketConfig: {
          ...(env.WHATSAPP_KEEPALIVE_INTERVAL_MS !== undefined
            ? { keepAliveIntervalMs: env.WHATSAPP_KEEPALIVE_INTERVAL_MS }
            : {}),
        },
      }
    : {
        socketConfig: {
          ...(env.WHATSAPP_KEEPALIVE_INTERVAL_MS !== undefined
            ? { keepAliveIntervalMs: env.WHATSAPP_KEEPALIVE_INTERVAL_MS }
            : {}),
        },
      },
      }
    : {},
);

connectionManager.on('connection.updated', (payload) => {
  emitConnectionUpdated(payload.workspaceId, payload);
});

connectionManager.on(
  'messages.upsert',
  ({ workspaceId, payload }: { workspaceId: number; payload: BaileysMessagesUpsert }) => {
    void import('./inbound-pipeline')
      .then(({ handleMessagesUpsert }) => handleMessagesUpsert(workspaceId, payload))
      .catch((err) => logger.error({ err }, 'Unhandled error in inbound message pipeline'));
  },
);

connectionManager.on(
  'messages.update',
  ({ workspaceId, payload }: { workspaceId: number; payload: BaileysMessageUpdate[] }) => {
    void import('./status-pipeline')
      .then(({ handleMessagesUpdate }) => handleMessagesUpdate(workspaceId, payload))
      .catch((err) => logger.error({ err }, 'Unhandled error in message status pipeline'));
  },
);

connectionManager.on(
  'contacts.upsert',
  ({ workspaceId, payload }: { workspaceId: number; payload: BaileysContactsUpsert }) => {
    void import('./contacts-pipeline')
      .then(({ handleContactsUpsert }) => handleContactsUpsert(workspaceId, payload))
      .catch((err) => logger.error({ err }, 'Unhandled error in contacts upsert pipeline'));
  },
);
