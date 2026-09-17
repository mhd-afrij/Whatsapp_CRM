import type { Server as HttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { getRedisClient } from '../lib/redis';
import { verifySocketToken, canJoinRoom, type SocketPrincipal } from './socket-auth';
import type { ConnectionUpdatedEvent } from '../whatsapp/connection-manager';

let io: SocketIOServer | null = null;

/** See docs/EVENT_CATALOG.md - every realtime event delivered to the browser is wrapped in this
 * envelope so the frontend can deduplicate by `event_id` (redundant deliveries, e.g. after a
 * reconnect) and ignore events for another workspace. */
interface EventEnvelope<T> {
  event_id: string;
  event_type: string;
  workspace_id: number;
  occurred_at: string;
  data: T;
}

function envelope<T>(eventType: string, workspaceId: number, data: T): EventEnvelope<T> {
  return {
    event_id: randomUUID(),
    event_type: eventType,
    workspace_id: workspaceId,
    occurred_at: new Date().toISOString(),
    data,
  };
}

/**
 * Sets up the /gateway Socket.IO namespace with the Redis adapter (see
 * docs/EVENT_CATALOG.md). Wired with the adapter even for a single gateway
 * instance so horizontal scaling is a config change, not a rewrite.
 *
 * Every connection is authenticated: the frontend sends its Laravel Sanctum
 * Bearer token in `handshake.auth.token` (see socket-provider.tsx) and the
 * gateway verifies it against the shared personal_access_tokens table. Only
 * the room set belonging to the verified workspace (and the client's own
 * per-user room) is joinable.
 */
export function createSocketServer(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: { origin: env.SOCKET_CORS_ORIGIN },
  });

  const pubClient = getRedisClient();
  const subClient = pubClient.duplicate();
  io.adapter(createAdapter(pubClient, subClient));

  const gatewayNamespace = io.of('/gateway');

  gatewayNamespace.use(async (socket, next) => {
    const principal = await verifySocketToken(socket.handshake.auth?.token);
    if (!principal) {
      return next(new Error('unauthorized'));
    }
    socket.data.principal = principal;
    next();
  });

  gatewayNamespace.on('connection', (socket) => {
    const principal = socket.data.principal as SocketPrincipal;
    logger.info(
      { socketId: socket.id, userId: principal.userId, workspaceId: principal.workspaceId },
      'Socket.IO client connected to /gateway',
    );

    // Auto-join the client to its own workspace room so workspace-level
    // broadcasts (connection.updated, contact.*, sync.*) reach it without the
    // client needing to issue a join first.
    void socket.join(`workspace:${principal.workspaceId}`);

    socket.on('join', (room: string) => {
      // Never leak another workspace's (or another user's) room to this client.
      if (typeof room === 'string' && canJoinRoom(principal.workspaceId, principal.userId, room)) {
        void socket.join(room);
      } else {
        logger.warn(
          { socketId: socket.id, userId: principal.userId, room },
          'Rejected Socket.IO join to a room outside the client workspace',
        );
      }
    });

    socket.on('disconnect', () => {
      logger.debug(
        { socketId: socket.id, userId: principal.userId, workspaceId: principal.workspaceId },
        'Socket.IO client disconnected from /gateway',
      );
    });
  });

  return io;
}

export function emitConnectionUpdated(workspaceId: number, payload: ConnectionUpdatedEvent): void {
  if (!io) {
    return;
  }
  io.of('/gateway')
    .to(`workspace:${workspaceId}`)
    .emit('connection.updated', envelope('connection.updated', workspaceId, payload));
}

/**
 * Emits a historical-sync lifecycle event (sync.started / sync.progress /
 * sync.completed / sync.failed - see docs/EVENT_CATALOG.md) to both the
 * workspace room (WhatsApp settings page) and the inbox room (conversation
 * list/chat panels), so an open inbox refreshes as an import progresses.
 * Payload is `{ sync: <HistorySyncSnapshot> }`.
 */
export function emitSyncEvent(
  event: 'sync.started' | 'sync.progress' | 'sync.completed' | 'sync.failed',
  workspaceId: number,
  payload: Record<string, unknown>,
): void {
  if (!io) return;
  io.of('/gateway')
    .to(`workspace:${workspaceId}`)
    .to(`workspace:${workspaceId}:inbox`)
    .emit(event, envelope(event, workspaceId, payload));
}

export function emitMessageCreated(
  workspaceId: number,
  conversationId: number,
  payload: Record<string, unknown>,
): void {
  if (!io) return;
  io.of('/gateway')
    .to(`workspace:${workspaceId}:conversation:${conversationId}`)
    .to(`workspace:${workspaceId}:inbox`)
    .emit('message.created', envelope('message.created', workspaceId, payload));
}

export function emitMessageUpdated(
  workspaceId: number,
  conversationId: number,
  payload: Record<string, unknown>,
): void {
  if (!io) return;
  io.of('/gateway')
    .to(`workspace:${workspaceId}:conversation:${conversationId}`)
    .emit('message.updated', envelope('message.updated', workspaceId, payload));
}

export function emitMessageFailed(
  workspaceId: number,
  conversationId: number,
  requestedByUserId: number | null,
  payload: Record<string, unknown>,
): void {
  if (!io) return;
  const ns = io.of('/gateway').to(`workspace:${workspaceId}:conversation:${conversationId}`);
  if (requestedByUserId) {
    ns.to(`workspace:${workspaceId}:user:${requestedByUserId}`);
  }
  ns.emit('message.failed', envelope('message.failed', workspaceId, payload));
}

export function emitConversationRead(
  workspaceId: number,
  conversationId: number,
  payload: Record<string, unknown>,
): void {
  if (!io) return;
  io.of('/gateway')
    .to(`workspace:${workspaceId}:inbox`)
    .to(`workspace:${workspaceId}:conversation:${conversationId}`)
    .emit('conversation.read', envelope('conversation.read', workspaceId, payload));
}

/**
 * Generic relay for conversation-lifecycle events that are decided on the
 * Laravel side (assign/close/reopen/create) rather than by the gateway
 * itself. Laravel calls POST /internal/whatsapp/events/emit
 * (GatewayClient::emitEvent) after committing the mutation; this fans it out
 * to the same rooms message.* events use so the inbox list/detail panels can
 * subscribe to one event name per docs/EVENT_CATALOG.md without caring which
 * process produced it.
 */
export function emitConversationEvent(
  event:
    | 'conversation.created'
    | 'conversation.updated'
    | 'conversation.assigned'
    | 'conversation.closed'
    | 'conversation.reopened'
    | 'conversation.priority_changed'
    | 'conversation.cleared'
    | 'conversation.deleted',
  workspaceId: number,
  conversationId: number | null,
  payload: Record<string, unknown>,
): void {
  if (!io) return;
  const ns = io.of('/gateway').to(`workspace:${workspaceId}:inbox`);
  if (conversationId) {
    ns.to(`workspace:${workspaceId}:conversation:${conversationId}`);
  }
  ns.emit(event, envelope(event, workspaceId, payload));
}

/**
 * Broadcasts a CRM contact lifecycle event (created/updated/deleted/restored)
 * decided on the Laravel side (ContactController) to the workspace rooms, so
 * open contact lists/details refresh without a page reload. Contacts are
 * workspace-shared (not per-agent), so the inbox room + workspace room both
 * receive it - the same rooms the contacts page's realtime hook joins.
 */
export function emitContactEvent(
  event: 'contact.created' | 'contact.updated' | 'contact.deleted',
  workspaceId: number,
  payload: Record<string, unknown>,
): void {
  if (!io) return;
  io.of('/gateway')
    .to(`workspace:${workspaceId}`)
    .to(`workspace:${workspaceId}:inbox`)
    .emit(event, envelope(event, workspaceId, payload));
}

/**
 * Delivers a backend-created `notifications` row to the one user it belongs
 * to. Reuses the already-wired `/gateway` namespace and the same
 * `workspace:{id}:user:{userId}` room convention `emitMessageFailed` already
 * joins clients into, rather than standing up a second Socket.IO namespace
 * just for this - the notification bell subscribes here the same way the
 * inbox subscribes to `workspace:{id}:inbox`.
 */
export function emitNotificationCreated(
  workspaceId: number,
  userId: number,
  payload: Record<string, unknown>,
): void {
  if (!io) return;
  io.of('/gateway')
    .to(`workspace:${workspaceId}:user:${userId}`)
    .emit('notification.created', envelope('notification.created', workspaceId, payload));
}

/**
 * Emit a message revoked event for a conversation.
 */
export function emitMessageRevoked(
  workspaceId: number,
  conversationId: number,
  payload: {
    messageId: number;
    whatsappMessageId: string;
    deletedBy?: string;
  },
): void {
  if (!io) return;
  io.of('/gateway')
    .to(`workspace:${workspaceId}:conversation:${conversationId}`)
    .to(`workspace:${workspaceId}:inbox`)
    .emit('message.revoked', envelope('message.revoked', workspaceId, payload));
}

/**
 * Emit a typing indicator event for a conversation.
 * Used for both incoming (contact typing) and outgoing (agent typing) indicators.
 */
export function emitTypingUpdated(
  workspaceId: number,
  conversationId: number,
  payload: {
    conversationId: number;
    userId?: number;
    contactId?: number;
    isTyping: boolean;
    name?: string;
  },
): void {
  if (!io) return;
  io.of('/gateway')
    .to(`workspace:${workspaceId}:conversation:${conversationId}`)
    .to(`workspace:${workspaceId}:inbox`)
    .emit('typing.updated', envelope('typing.updated', workspaceId, payload));
}

/**
 * Broadcasts that a workspace's WhatsApp chat/contact data was cleared (a
 * "reset" action originated via POST /internal/whatsapp/reset-data). The
 * inbox and workspace rooms both receive it so open conversation lists /
 * detail panels can drop their local state and refetch rather than serving
 * now-deleted rows.
 */
export function emitConversationsReset(workspaceId: number, payload: Record<string, unknown>): void {
  if (!io) return;
  io.of('/gateway')
    .to(`workspace:${workspaceId}:inbox`)
    .to(`workspace:${workspaceId}`)
    .emit('conversations.reset', envelope('conversations.reset', workspaceId, payload));
}

export function getSocketServer(): SocketIOServer | null {
  return io;
}
