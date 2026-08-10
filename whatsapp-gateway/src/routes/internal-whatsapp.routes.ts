import { Router, type Request, type Response, type NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import crypto from 'node:crypto';
import multer from 'multer';
import { z } from 'zod';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { getStorageClient } from '../lib/storage';
import { connectionManager } from '../whatsapp/manager-instance';
import { SessionRepository } from '../whatsapp/session-repository';
import { DispatchRepository } from '../whatsapp/dispatch-repository';
import { MessageRepository } from '../whatsapp/message-repository';
import { sendMessageQueue } from '../queues/send-message.queue';
import { validateMedia } from '../queues/media-download.queue';
import { resolveMediaAccess } from '../lib/media-access';
import { emitConversationEvent, emitNotificationCreated, emitTypingUpdated, emitMessageRevoked, getSocketServer } from '../lib/socket-server';

const repository = new SessionRepository();
const dispatchRepository = new DispatchRepository();
const messageRepository = new MessageRepository();

const sendMessageBodySchema = z.object({
  conversationId: z.coerce.number().int().positive(),
  workspaceId: z.coerce.number().int().positive(),
  content: z.string().nullish(),
  mediaRef: z.string().nullish(),
  mediaMimeType: z.string().nullish(),
  mediaFileName: z.string().nullish(),
  mediaSizeBytes: z.coerce.number().int().nonnegative().nullish(),
  mediaChecksumSha256: z.string().nullish(),
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

const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MEDIA_MAX_SIZE_BYTES, files: 1 },
});

/** multer wrapper that converts upload errors into clean JSON responses instead of the default HTML 500. */
function uploadSingleFile(field: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    mediaUpload.single(field)(req, res, (err: unknown) => {
      if (!err) {
        next();
        return;
      }
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({
          success: false,
          message: `File exceeds the ${env.MEDIA_MAX_SIZE_BYTES}-byte upload limit`,
          data: null,
        });
        return;
      }
      logger.warn({ err }, 'Rejected multipart media upload');
      res.status(400).json({ success: false, message: 'Invalid multipart upload', data: null });
    });
  };
}

export function createInternalWhatsappRouter(): Router {
  const router = Router();
  router.use(requireInternalToken);

  router.get('/status', (_req: Request, res: Response) => {
    res.status(200).json({ success: true, message: 'OK', data: connectionManager.getSnapshot() });
  });

  router.post('/connect', async (_req: Request, res: Response) => {
    try {
      await connectionManager.startFreshPairing();
      res.status(200).json({ success: true, message: 'QR pairing initiated', data: connectionManager.getSnapshot() });
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

    const {
      conversationId,
      workspaceId,
      content,
      replyToWhatsappMessageId,
      idempotencyKey,
      requestedByUserId,
      mediaRef,
      mediaMimeType,
      mediaFileName,
      mediaSizeBytes,
      mediaChecksumSha256,
    } = parsed.data;

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
        {
          idempotencyKey,
          content: content ?? null,
          mediaRef: mediaRef ?? null,
          replyToWhatsappMessageId,
        },
      );

      const job = await sendMessageQueue.add('send', {
        dispatchId: dispatchRow.id,
        workspaceId,
        conversationId,
        waJid,
        content: content ?? null,
        replyToWhatsappMessageId: replyToWhatsappMessageId ?? null,
        requestedByUserId: requestedByUserId ?? null,
        mediaRef: mediaRef ?? null,
        mediaMimeType: mediaMimeType ?? null,
        mediaFileName: mediaFileName ?? null,
        mediaSizeBytes: mediaSizeBytes ?? null,
        mediaChecksumSha256: mediaChecksumSha256 ?? null,
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
   * POST /internal/whatsapp/media/upload
   * Receives a multipart `file` (plus a `workspaceId` form field), validates
   * it against the same allow-list/size cap as inbound media, stores it via
   * the shared StorageClient, and returns only a storage key + metadata -
   * never a raw bucket URL. The Laravel caller (MediaController) then passes
   * the returned key as `mediaRef` when dispatching the outbound message, and
   * the send worker reads the bytes back through StorageClient::getObject.
   */
  router.post(
    '/media/upload',
    uploadSingleFile('file'),
    async (req: Request, res: Response) => {
      const workspaceId = z.coerce.number().int().positive().safeParse(req.body?.workspaceId);
      if (!workspaceId.success) {
        res.status(400).json({ success: false, message: 'workspaceId is required', data: null });
        return;
      }

      if (!req.file) {
        res.status(400).json({ success: false, message: 'No file uploaded (expected a multipart field named "file")', data: null });
        return;
      }

      try {
        validateMedia(req.file.mimetype, req.file.size);
      } catch (err) {
        res.status(415).json({
          success: false,
          message: err instanceof Error ? err.message : 'Media validation failed',
          data: null,
        });
        return;
      }

      try {
        const checksumSha256 = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
        const extension = (req.file.mimetype.split('/')[1] ?? 'bin').replace(/[^a-z0-9]/gi, '');
        const key = `${workspaceId.data}/outbound/${crypto.randomUUID()}.${extension}`;

        const storagePath = await getStorageClient().putObject(
          key,
          req.file.buffer,
          req.file.mimetype,
        );

        res.status(201).json({
          success: true,
          message: 'Media uploaded',
          data: {
            storagePath,
            mimeType: req.file.mimetype,
            fileName: req.file.originalname || null,
            sizeBytes: req.file.size,
            checksumSha256,
          },
        });
      } catch (err) {
        logger.error({ err }, 'Failed to store outbound media upload');
        res.status(500).json({ success: false, message: 'Failed to store media', data: null });
      }
    },
  );

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

  /**
   * POST /internal/whatsapp/typing
   * Send a typing indicator to a WhatsApp contact and broadcast the event to the frontend.
   */
  const typingBodySchema = z.object({
    conversationId: z.coerce.number().int().positive(),
    workspaceId: z.coerce.number().int().positive(),
    waJid: z.string().min(1),
    isTyping: z.boolean(),
    userId: z.coerce.number().int().positive().nullish(),
    name: z.string().nullish(),
  });

  router.post('/typing', async (req: Request, res: Response) => {
    const parsed = typingBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: 'Invalid request body', data: parsed.error.issues });
      return;
    }

    const { conversationId, workspaceId, waJid, isTyping, userId, name } = parsed.data;

    try {
      // Send presence update to WhatsApp
      if (isTyping) {
        await connectionManager.sendPresenceUpdate('composing', waJid);
      } else {
        await connectionManager.sendPresenceUpdate('available', waJid);
      }

      // Broadcast typing event to frontend
      emitTypingUpdated(workspaceId, conversationId, {
        conversationId,
        userId: userId ?? undefined,
        isTyping,
        name: name ?? undefined,
      });

      res.status(200).json({ success: true, message: 'Typing indicator sent', data: null });
    } catch (err) {
      logger.error({ err }, 'Failed to send typing indicator');
      res.status(500).json({ success: false, message: 'Failed to send typing indicator', data: null });
    }
  });

  /**
   * POST /internal/whatsapp/messages/revoke
   * Revoke a message for everyone in a WhatsApp conversation.
   */
  const revokeBodySchema = z.object({
    conversationId: z.coerce.number().int().positive(),
    workspaceId: z.coerce.number().int().positive(),
    waJid: z.string().min(1),
    whatsappMessageId: z.string().min(1),
    userId: z.coerce.number().int().positive().nullish(),
  });

  router.post('/messages/revoke', async (req: Request, res: Response) => {
    const parsed = revokeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: 'Invalid request body', data: parsed.error.issues });
      return;
    }

    const { conversationId, workspaceId, waJid, whatsappMessageId, userId } = parsed.data;

    try {
      // Send revoke to WhatsApp via Baileys
      const jid = waJid.includes('@') ? waJid : `${waJid}@s.whatsapp.net`;
      await connectionManager.sendContent(jid, {
        protocolMessage: {
          type: 0, // REVOKE
          key: {
            remoteJid: jid,
            id: whatsappMessageId,
            fromMe: false,
          },
        },
      });

      // Mark message as deleted in database
      await messageRepository.markMessageAsDeleted(workspaceId, whatsappMessageId, 'user');

      // Broadcast revoke event to frontend
      emitMessageRevoked(workspaceId, conversationId, {
        messageId: 0, // Will be resolved by frontend
        whatsappMessageId,
      });

      res.status(200).json({ success: true, message: 'Message revoked', data: null });
    } catch (err) {
      logger.error({ err }, 'Failed to revoke message');
      res.status(500).json({ success: false, message: 'Failed to revoke message', data: null });
    }
  });

  /**
   * POST /internal/whatsapp/messages/reaction
   * Send a reaction to a WhatsApp message and persist it.
   */
  const reactionBodySchema = z.object({
    conversationId: z.coerce.number().int().positive(),
    workspaceId: z.coerce.number().int().positive(),
    waJid: z.string().min(1),
    whatsappMessageId: z.string().min(1),
    emoji: z.string().min(1).max(8),
    remove: z.boolean().default(false),
    userId: z.coerce.number().int().positive().nullish(),
    name: z.string().nullish(),
  });

  router.post('/messages/reaction', async (req: Request, res: Response) => {
    const parsed = reactionBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: 'Invalid request body', data: parsed.error.issues });
      return;
    }

    const { conversationId, workspaceId, waJid, whatsappMessageId, emoji, remove, userId, name } = parsed.data;

    try {
      // Send reaction to WhatsApp via Baileys
      const jid = waJid.includes('@') ? waJid : `${waJid}@s.whatsapp.net`;
      
      if (remove) {
        // Remove reaction by sending empty emoji
        await connectionManager.sendContent(jid, {
          react: {
            text: '',
            key: {
              remoteJid: jid,
              id: whatsappMessageId,
              fromMe: false,
            },
          },
        });
      } else {
        // Add reaction
        await connectionManager.sendContent(jid, {
          react: {
            text: emoji,
            key: {
              remoteJid: jid,
              id: whatsappMessageId,
              fromMe: false,
            },
          },
        });
      }

      // Persist reaction in database
      const message = await messageRepository.findMessageByWhatsappId(workspaceId, whatsappMessageId);
      if (message) {
        if (remove) {
          await messageRepository.removeReaction(message.id, userId ?? null, emoji);
        } else {
          await messageRepository.addReaction(message.id, userId ?? null, emoji);
        }
      }

      // Broadcast reaction event to frontend
      const event = remove ? 'message.reaction.removed' : 'message.reaction.created';
      getSocketServer()?.of('/gateway')
        .to(`workspace:${workspaceId}:conversation:${conversationId}`)
        .emit(event, {
          event_id: crypto.randomUUID(),
          event_type: event,
          workspace_id: workspaceId,
          occurred_at: new Date().toISOString(),
          data: {
            messageId: message?.id,
            whatsappMessageId,
            emoji,
            userId,
            name,
            remove,
          },
        });

      res.status(200).json({ success: true, message: 'Reaction sent', data: null });
    } catch (err) {
      logger.error({ err }, 'Failed to send reaction');
      res.status(500).json({ success: false, message: 'Failed to send reaction', data: null });
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
      'typing.updated',
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

    if (event === 'typing.updated') {
      if (!conversationId) {
        res.status(400).json({ success: false, message: 'conversationId is required for typing.updated', data: null });
        return;
      }
      emitTypingUpdated(workspaceId, conversationId, {
        conversationId,
        userId: userId ?? undefined,
        isTyping: (payload.isTyping as boolean) ?? false,
        name: (payload.name as string) ?? undefined,
      });
      res.status(200).json({ success: true, message: 'Event emitted', data: null });
      return;
    }

    emitConversationEvent(event, workspaceId, conversationId ?? null, payload);
    res.status(200).json({ success: true, message: 'Event emitted', data: null });
  });

  return router;
}
