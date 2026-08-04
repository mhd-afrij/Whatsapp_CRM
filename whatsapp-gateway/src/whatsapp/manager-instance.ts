import { ConnectionManager } from './connection-manager';
import { emitConnectionUpdated } from '../lib/socket-server';
import { logger } from '../lib/logger';
import type { BaileysMessagesUpsert, BaileysMessageUpdate } from './baileys-socket';

/**
 * Process-wide singleton ConnectionManager. Emits every internal
 * connection.updated event onto the Socket.IO /gateway namespace, and
 * dispatches inbound message/status events into the Phase 5 sync pipeline.
 */
export const connectionManager = new ConnectionManager();

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
