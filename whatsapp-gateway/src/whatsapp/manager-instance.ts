import { ConnectionManagerRegistry } from './connection-manager-registry';
import { ConnectionManager, PairingCodeError } from './connection-manager';
import { logger } from '../lib/logger';
import type {
  BaileysContactsUpsert,
  BaileysMessagesUpsert,
  BaileysMessageUpdate,
  BaileysMessagingHistorySet,
  BaileysPhoneNumberShare,
} from './baileys-socket';

export { PairingCodeError };

/**
 * Process-wide singleton ConnectionManagerRegistry. Owns one
 * ConnectionManager per WhatsApp account across all workspaces this gateway
 * serves. Emits every internal connection.updated event onto the Socket.IO
 * /gateway namespace, and dispatches inbound message/status events into the
 * sync pipeline tagged with the originating account.
 *
 * Session-lock coordination (workspace_sync_assignments) is wired in only
 * when SESSION_LOCK_ENABLED=true.
 */
export const connectionRegistry = new ConnectionManagerRegistry();

/**
 * Legacy singleton-account manager, kept for backward compatibility where no
 * account is selected (health checks, single-session boot paths, tests).
 * New code should prefer connectionRegistry.getOrCreate(workspaceId, accountId).
 */
export const connectionManager = new ConnectionManager();

/**
 * When a new manager is created in the registry, wire its Baileys events to
 * the Socket.IO layer and sync pipeline. Each manager is an independent
 * EventEmitter; the listener attachment is idempotent (one per manager).
 */
connectionRegistry.on('manager:created', (manager: ConnectionManager) => {
  manager.on('connection.updated', (payload) => {
    void import('../lib/socket-server')
      .then(({ emitConnectionUpdated }) => emitConnectionUpdated(payload.workspaceId, payload))
      .catch((err) => logger.warn({ err }, 'Failed to emit connection.updated'));

    if (payload.status === 'qr_pending') {
      void import('./history-sync')
        .then(({ clearWorkspaceRun }) => clearWorkspaceRun(payload.workspaceId, payload.accountId))
        .catch((err) => logger.warn({ err }, 'Failed to clear history-sync state on QR pairing'));
    }
  });

  manager.on(
    'messages.upsert',
    ({ workspaceId, accountId, payload }: { workspaceId: number; accountId: number | null; payload: BaileysMessagesUpsert }) => {
      void import('./inbound-pipeline')
        .then(({ handleMessagesUpsert }) => handleMessagesUpsert(workspaceId, payload, accountId))
        .catch((err) => logger.error({ err }, 'Unhandled error in inbound message pipeline'));
    },
  );

  manager.on(
    'messages.update',
    ({ workspaceId, accountId, payload }: { workspaceId: number; accountId: number | null; payload: BaileysMessageUpdate[] }) => {
      void import('./status-pipeline')
        .then(({ handleMessagesUpdate }) => handleMessagesUpdate(workspaceId, payload, accountId))
        .catch((err) => logger.error({ err }, 'Unhandled error in message status pipeline'));
    },
  );

  manager.on(
    'contacts.upsert',
    ({ workspaceId, accountId, payload }: { workspaceId: number; accountId: number | null; payload: BaileysContactsUpsert }) => {
      void import('./contacts-pipeline')
        .then(({ handleContactsUpsert }) => handleContactsUpsert(workspaceId, payload, accountId))
        .catch((err) => logger.error({ err }, 'Unhandled error in contacts upsert pipeline'));
    },
  );

  manager.on(
    'chats.phoneNumberShare',
    ({ workspaceId, accountId, payload }: { workspaceId: number; accountId: number | null; payload: BaileysPhoneNumberShare }) => {
      void import('./contacts-pipeline')
        .then(({ handlePhoneNumberShare }) => handlePhoneNumberShare(workspaceId, payload, accountId))
        .catch((err) => logger.error({ err }, 'Unhandled error in phone-number-share pipeline'));
    },
  );

  manager.on(
    'messaging-history.set',
    ({ workspaceId, accountId, payload }: { workspaceId: number; accountId: number | null; payload: BaileysMessagingHistorySet }) => {
      void import('./history-sync')
        .then(({ handleMessagingHistorySet }) => handleMessagingHistorySet(workspaceId, payload, accountId))
        .catch((err) => logger.error({ err }, 'Unhandled error in messaging-history.set pipeline'));
    },
  );
});
