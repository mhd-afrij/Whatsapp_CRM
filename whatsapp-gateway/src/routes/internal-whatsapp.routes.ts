import { Router, type Request, type Response, type NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { connectionManager } from '../whatsapp/manager-instance';
import { SessionRepository } from '../whatsapp/session-repository';
import { DispatchRepository } from '../whatsapp/dispatch-repository';
import { MessageRepository } from '../whatsapp/message-repository';
import { sendMessageQueue } from '../queues/send-message.queue';
import { resolveMediaAccess } from '../lib/media-access';
import { emitConversationEvent, emitNotificationCreated } from '../lib/socket-server';

const repository = new SessionRepository();
const dispatchRepository = new DispatchRepository();
const messageRepository = new MessageRepository();

const sendMessageBodySchema = z.object({
  conversationId: z.coerce.number().int().positive(),
  workspaceId: z.coerce.number().int().positive(),
  content: z.string().min(1),
  mediaRef: z.string().nullish(),
  replyToWhatsappMessageId: z.string().nullish(),
  idempotencyKey: z.string().min(1),
  requestedByUserId: z.coerce.number().int().positive().nullish(),
});

const tokenHeaderSchema = z.string().min(1);

function tokensMatch(provided: string, expected: string): boolean {
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) {
    return false;
  }
  return timingSafeEqual(providedBuf, expectedBuf);
}

function requireInternalToken(req: Request, res: Response, next: NextFunction): void {
  const parsed = tokenHeaderSchema.safeParse(req.header('X-Internal-Gateway-Token'));

  if (!parsed.success || !tokensMatch(parsed.data, env.INTERNAL_GATEWAY_TOKEN)) {
    res.status(401).json({ success: false, message: 'Invalid or missing internal gateway token', data: null });
    return;
  }

  next();
}

export function createInternalWhatsappRouter(): Router {
  const router = Router();
  router.use(requireInternalToken);

  router.get('/status', (_req: Request, res: Response) => {
    res.status(200).json({ success: true, message: 'OK', data: connectionManager.getSnapshot() });
  });

  router.post('/connect', async (_req: Request, res: Response) => {
    try {
      await connectionManager.start();
      res.status(200).json({ success: true, message: 'Connection initiated', data: connectionManager.getSnapshot() });
    } catch (err) {
      logger.error({ err }, 'Failed to start WhatsApp connection');
      res.status(500).json({ success: false, message: 'Failed to start connection', data: null });
    }
  });

  router.post('/disconnect', async (_req: Request, res: Response) => {
    try {
      await connectionManager.stop();
      res.status(200).json({ success: true, message: 'Disconnected', data: connectionManager.getSnapshot() });
    } catch (err) {
      logger.error({ err }, 'Failed to disconnect WhatsApp session');
      res.status(500).json({ success: false, message: 'Failed to disconnect', data: null });
    }
  });

  router.post('/reconnect', async (_req: Request, res: Response) => {
    try {
      await connectionManager.reconnect();
      res.status(200).json({ success: true, message: 'Reconnection initiated', data: connectionManager.getSnapshot() });
    } catch (err) {
      logger.error({ err }, 'Failed to reconnect WhatsApp session');
      res.status(500).json({ success: false, message: 'Failed to reconnect', data: null });
    }
  });

  router.post('/logout', async (_req: Request, res: Response) => {
    try {
      await connectionManager.logout();
      res.status(200).json({ success: true, message: 'Logged out; re-authentication required', data: connectionManager.getSnapshot() });
    } catch (err) {
      logger.error({ err }, 'Failed to log out WhatsApp session');
      res.status(500).json({ success: false, message: 'Failed to log out', data: null });
    }
  });

  router.get('/events', async (req: Request, res: Response) => {
    const limitQuery = z.coerce.number().int().positive().max(200).default(50).safeParse(req.query.limit);
    const limit = limitQuery.success ? limitQuery.data : 50;

    try {
      const session = await repository.getOrCreateSession(env.WHATSAPP_WORKSPACE_ID);
      const events = await repository.listConnectionEvents(session.id, limit);
      res.status(200).json({ success: true, message: 'OK', data: events });
    } catch (err) {
      logger.error({ err }, 'Failed to fetch WhatsApp connection events');
      res.status(500).json({ success: false, message: 'Failed to fetch events', data: null });
    }
  });

  router.post('/messages/send', async (req: Request, res: Response) => {
    const parsed = sendMessageBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: 'Invalid request body', data: parsed.error.issues });
      return;
    }

    const { conversationId, workspaceId, content, replyToWhatsappMessageId, idempotencyKey, requestedByUserId } =
      parsed.data;

    try {
      const existing = await dispatchRepository.findByIdempotencyKey(workspaceId, idempotencyKey);
      if (existing) {
        res.status(200).json({
          success: true,
          message: 'Already enqueued (idempotent replay)',
          data: {
            dispatchId: existing.id,
            status: existing.status,
            messageId: existing.message_id,
            bullmqJobId: existing.bullmq_job_id,
          },
        });
        return;
      }

      const waJid = await messageRepository.getConversationJid(conversationId, workspaceId);
      if (!waJid) {
        res.status(404).json({ success: false, message: 'Conversation not found', data: null });
        return;
      }

      const dispatchRow = await dispatchRepository.createPending(
        workspaceId,
        conversationId,
        requestedByUserId ?? null,
        { idempotencyKey, content, mediaRef: parsed.data.mediaRef ?? null, replyToWhatsappMessageId },
      );

      const job = await sendMessageQueue.add('send', {
        dispatchId: dispatchRow.id,
        workspaceId,
        conversationId,
        waJid,
        content,
        replyToWhatsappMessageId: replyToWhatsappMessageId ?? null,
        requestedByUserId: requestedByUserId ?? null,
      });

      if (job.id) {
        await dispatchRepository.setBullmqJobId(dispatchRow.id, job.id);
      }

      res.status(202).json({
        success: true,
        message: 'Message enqueued for delivery',
        data: { dispatchId: dispatchRow.id, status: 'pending', bullmqJobId: job.id ?? null },
      });
    } catch (err) {
      logger.error({ err }, 'Failed to enqueue outbound WhatsApp message');
      res.status(500).json({ success: false, message: 'Failed to enqueue message', data: null });
    }
  });

  /**
   * GET /internal/whatsapp/media/:mediaId/url?workspaceId=
   * Returns a short-lived signed URL (or, in local-disk dev mode, a
   * server-side file path the caller streams itself) for a message_media
   * row - never the raw bucket URL. Authorization (does this user have
   * access to the owning conversation's workspace) is the Laravel caller's
   * responsibility; this endpoint is only reachable via the shared internal
   * gateway token, never directly by the frontend.
   */
  router.get('/media/:mediaId/url', async (req: Request, res: Response) => {
    const mediaId = z.coerce.number().int().positive().safeParse(req.params.mediaId);
    const workspaceId = z.coerce.number().int().positive().safeParse(req.query.workspaceId);

    if (!mediaId.success || !workspaceId.success) {
      res.status(400).json({ success: false, message: 'Invalid mediaId or workspaceId', data: null });
      return;
    }

    try {
      const media = await messageRepository.findMessageMediaById(workspaceId.data, mediaId.data);
      if (!media) {
        res.status(404).json({ success: false, message: 'Media not found', data: null });
        return;
      }

      const access = await resolveMediaAccess(media.storage_path);
      res.status(200).json({
        success: true,
        message: 'OK',
        data: {
          mimeType: media.mime_type,
          ...(access.kind === 'signed_url'
            ? { kind: 'signed_url', url: access.url, expiresInSeconds: access.expiresInSeconds }
            : { kind: 'local_file', filePath: access.filePath }),
        },
      });
    } catch (err) {
      logger.error({ err, mediaId: mediaId.data }, 'Failed to resolve media access');
      res.status(500).json({ success: false, message: 'Failed to resolve media access', data: null });
    }
  });

  const emitEventBodySchema = z.object({
    event: z.enum([
      'conversation.created',
      'conversation.updated',
      'conversation.assigned',
      'conversation.closed',
      'conversation.reopened',
      'conversation.priority_changed',
      'notification.created',
    ]),
    workspaceId: z.coerce.number().int().positive(),
    conversationId: z.coerce.number().int().positive().nullish(),
    userId: z.coerce.number().int().positive().nullish(),
    payload: z.record(z.unknown()).default({}),
  });

  /**
   * POST /internal/whatsapp/events/emit
   * Relay for events decided by the Laravel backend (conversation
   * assign/close/reopen, and - added in Phase 12 - `notification.created`)
   * so the gateway's already-wired Socket.IO connections
   * (docs/EVENT_CATALOG.md) fan them out without Laravel needing its own
   * Socket.IO server. `notification.created` requires `userId` and is
   * delivered only to that user's room, not broadcast to the inbox.
   */
  router.post('/events/emit', (req: Request, res: Response) => {
    const parsed = emitEventBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: 'Invalid request body', data: parsed.error.issues });
      return;
    }

    const { event, workspaceId, conversationId, userId, payload } = parsed.data;

    if (event === 'notification.created') {
      if (!userId) {
        res.status(400).json({ success: false, message: 'userId is required for notification.created', data: null });
        return;
      }
      emitNotificationCreated(workspaceId, userId, payload);
      res.status(200).json({ success: true, message: 'Event emitted', data: null });
      return;
    }

    emitConversationEvent(event, workspaceId, conversationId ?? null, payload);
    res.status(200).json({ success: true, message: 'Event emitted', data: null });
  });

  return router;
}
