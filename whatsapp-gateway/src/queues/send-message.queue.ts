import { Queue, Worker, type Job } from 'bullmq';
import { getQueueConnectionOptions } from './connection';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { getStorageClient } from '../lib/storage';
import { connectionManager } from '../whatsapp/manager-instance';
import { DispatchRepository } from '../whatsapp/dispatch-repository';
import { MessageRepository, isDuplicateEntryError } from '../whatsapp/message-repository';
import {
  resolveMessageType,
  buildBaileysMediaContent,
  type OutboundMediaInfo,
} from '../whatsapp/outbound-media';
import { emitMessageCreated, emitMessageFailed } from '../lib/socket-server';

export const SEND_MESSAGE_QUEUE_NAME = 'send-message';

export interface SendMessageJobData {
  dispatchId: number;
  workspaceId: number;
  conversationId: number;
  waJid: string;
  content: string | null;
  replyToWhatsappMessageId?: string | null;
  requestedByUserId?: number | null;
  mediaRef?: string | null;
  mediaMimeType?: string | null;
  mediaFileName?: string | null;
  mediaSizeBytes?: number | null;
  mediaChecksumSha256?: string | null;
}

export const sendMessageQueue = new Queue<SendMessageJobData>(SEND_MESSAGE_QUEUE_NAME, {
  connection: getQueueConnectionOptions(),
  defaultJobOptions: {
    attempts: 4,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});

const dispatchRepository = new DispatchRepository();
const messageRepository = new MessageRepository();

/**
 * Claims a pending/failed-retry dispatch row, sends via the live Baileys
 * socket wrapper, persists the resulting message row + status, and emits
 * message.created. Transient failures are surfaced by throwing (BullMQ
 * retries with backoff); once attempts are exhausted the `failed` handler
 * below marks the dispatch row and messages row `failed` (terminal state)
 * and emits `message.failed`.
 */
export async function processSendMessage(
  job: Job<SendMessageJobData>,
): Promise<{ whatsappMessageId: string }> {
  const {
    dispatchId,
    workspaceId,
    conversationId,
    waJid,
    content,
    replyToWhatsappMessageId,
    mediaRef,
    mediaMimeType,
    mediaFileName,
    mediaSizeBytes,
    mediaChecksumSha256,
  } = job.data;

  await dispatchRepository.markProcessing(dispatchId);

  let messageType: string = 'text';
  let sendContent: { text: string } | Record<string, unknown> = { text: content ?? '' };

  if (mediaRef) {
    const mimeType = mediaMimeType ?? 'application/octet-stream';
    const resolvedType = resolveMessageType(mimeType);
    messageType = resolvedType;
    const buffer = await getStorageClient().getObject(mediaRef);

    const mediaInfo: OutboundMediaInfo = {
      storagePath: mediaRef,
      mimeType,
      fileName: mediaFileName ?? null,
      sizeBytes: mediaSizeBytes ?? null,
      checksumSha256: mediaChecksumSha256 ?? null,
    };

    sendContent = buildBaileysMediaContent(resolvedType, buffer, mediaInfo, content || null);
  }

  const result = await connectionManager.sendContent(waJid, sendContent, replyToWhatsappMessageId ?? null);
  const whatsappMessageId = result.id;
  if (!whatsappMessageId) {
    throw new Error('Baileys did not return a message id for the send');
  }

  let inserted: { messageId: number } | null;
  try {
    inserted = await messageRepository.insertOutboundMessage(workspaceId, conversationId, {
      whatsappMessageId,
      body: content,
      messageType,
      repliedToWhatsappMessageId: replyToWhatsappMessageId ?? null,
    });
  } catch (err) {
    if (isDuplicateEntryError(err)) {
      // Already recorded on a prior attempt (crash after send, before persist retry): idempotent no-op.
      await dispatchRepository.markSent(dispatchId, 0);
      return { whatsappMessageId };
    }
    throw err;
  }

  if (inserted) {
    if (mediaRef) {
      const mimeType = mediaMimeType ?? 'application/octet-stream';
      await messageRepository.insertMessageMedia(inserted.messageId, {
        mimeType,
        fileSizeBytes: mediaSizeBytes ?? null,
        storagePath: mediaRef,
        checksumSha256: mediaChecksumSha256 ?? null,
      });
    }

    await messageRepository.updateMessageStatus(inserted.messageId, 'sent');
    await dispatchRepository.markSent(dispatchId, inserted.messageId);

    const media = mediaRef
      ? await messageRepository.findMessageMediaByMessageId(inserted.messageId)
      : null;

    emitMessageCreated(workspaceId, conversationId, {
      message: {
        id: inserted.messageId,
        conversationId,
        direction: 'outbound',
        messageType,
        body: content,
        status: 'sent',
        senderType: 'user',
        sentAt: new Date().toISOString(),
        media: media
          ? {
              id: media.id,
              messageId: inserted.messageId,
              mimeType: media.mime_type,
              fileSizeBytes: media.file_size_bytes,
            }
          : null,
      },
      conversation: { id: conversationId },
    });
  }

  return { whatsappMessageId };
}

/**
 * Extracted so retry-exhaustion behavior (mark dispatch row terminally
 * failed + emit message.failed) can be unit tested without a real BullMQ
 * Worker/Job instance.
 */
export async function handleSendMessageFailure(
  job: Pick<Job<SendMessageJobData>, 'data' | 'attemptsMade'> & { opts: { attempts?: number } },
  err: Error,
): Promise<void> {
  logger.error({ jobId: job.data.dispatchId, err }, 'Send-message job failed');

  const attemptsExhausted = job.attemptsMade >= (job.opts.attempts ?? 1);
  if (attemptsExhausted) {
    await dispatchRepository.markFailed(job.data.dispatchId).catch(() => undefined);

    // Dead-letter record: BullMQ's own `removeOnFail` window (5000 jobs) isn't a durable audit
    // trail an operator can query/filter by workspace or conversation, and it doesn't survive
    // a queue flush. This does - same table/pattern already used for inbound processing
    // failures (message-repository.ts), just never wired up on the outbound side until now.
    await messageRepository
      .recordProcessingFailure(
        job.data.workspaceId,
        'send',
        err.message,
        { waJid: job.data.waJid, attemptsMade: job.attemptsMade, permanent: true },
        { dispatchQueueId: job.data.dispatchId, conversationId: job.data.conversationId },
      )
      .catch((persistErr) => {
        logger.error({ dispatchId: job.data.dispatchId, persistErr }, 'Failed to persist send dead-letter record');
      });

    emitMessageFailed(job.data.workspaceId, job.data.conversationId, job.data.requestedByUserId ?? null, {
      conversationId: job.data.conversationId,
      errorMessage: err.message,
      attempts: job.attemptsMade,
    });
  }
}

export function createSendMessageWorker(): Worker<SendMessageJobData> {
  const worker = new Worker<SendMessageJobData>(SEND_MESSAGE_QUEUE_NAME, processSendMessage, {
    connection: getQueueConnectionOptions(),
    autorun: false,
    // Throttles successful sends (distinct from the attempts/backoff above, which only
    // governs retries after a failure) - WhatsApp's anti-spam heuristics penalize numbers
    // that burst-send, e.g. draining a large enqueued backlog as fast as Redis allows.
    limiter: {
      max: env.SEND_RATE_LIMIT_MAX,
      duration: env.SEND_RATE_LIMIT_DURATION_MS,
    },
  });

  worker.on('failed', async (job, err) => {
    if (!job) return;
    await handleSendMessageFailure(job, err);
  });

  return worker;
}
