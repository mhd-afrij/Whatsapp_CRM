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
import { emitMessageCreated, emitMessageFailed, emitMessageUpdated } from '../lib/socket-server';
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
 * True when the failure indicates the WhatsApp connection itself is broken
 * (query timed out / socket closed / replaced) rather than a per-message
 * rejection. Baileys' query() throws Boom(408, 'Timed Out') against an
 * unresponsive session - the exact zombie-connection case this recovers from.
 */
function isConnectionFailure(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const boom = err as { output?: { statusCode?: number }; message?: string };
  const statusCode = boom.output?.statusCode;
  return (
    statusCode === 408 ||
    statusCode === 428 ||
    statusCode === 440 ||
    (typeof boom.message === 'string' && /timed out|connection closed/i.test(boom.message))
  );
}

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

  // Persist the outbound row as 'queued' BEFORE the Baileys send so the
  // message survives send failures - the reported bug was that sends against
  // an unstable session never saved anything. A deterministic placeholder
  // whatsapp id keeps re-insertion on BullMQ retries idempotent via the
  // (workspace_id, whatsapp_message_id) unique key.
  const placeholderWhatsappId = `queued:${dispatchId}`;
  let messageId: number;
  let alreadyCompletedWhatsappId: string | null = null;
  try {
    const inserted = await messageRepository.insertOutboundMessage(workspaceId, conversationId, {
      whatsappMessageId: placeholderWhatsappId,
      body: content,
      messageType,
      repliedToWhatsappMessageId: replyToWhatsappMessageId ?? null,
      status: 'queued',
    });
    if (!inserted) {
      throw new Error('Failed to persist queued outbound message row');
    }
    messageId = inserted.messageId;
  } catch (err) {
    if (isDuplicateEntryError(err)) {
      const existing = await messageRepository.findMessageByWhatsappId(workspaceId, placeholderWhatsappId);
      if (!existing) {
        throw err;
      }
      messageId = existing.id;
      // A prior attempt already sent the message (crash between send and
      // dispatch finalization): don't re-send, just finalize the dispatch row.
      if (existing.status === 'sent' && existing.whatsapp_message_id !== placeholderWhatsappId) {
        alreadyCompletedWhatsappId = existing.whatsapp_message_id;
      }
    } else {
      throw err;
    }
  }

  if (alreadyCompletedWhatsappId) {
    await dispatchRepository.markSent(dispatchId, messageId);
    return { whatsappMessageId: alreadyCompletedWhatsappId };
  }

  if (mediaRef) {
    const mimeType = mediaMimeType ?? 'application/octet-stream';
    // Guarded so a retry after a crash (media already inserted) doesn't add a duplicate row.
    const existingMedia = await messageRepository.findMessageMediaByMessageId(messageId);
    if (!existingMedia) {
      await messageRepository.insertMessageMedia(messageId, {
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

  // Surface the queued bubble to the open chat immediately; later retries
  // re-emit it, and the terminal-failure path flips it to `failed`.
  emitMessageCreated(workspaceId, conversationId, {
    message: {
      id: messageId,
      conversationId,
      direction: 'outbound',
      messageType,
      body: content,
      status: 'queued',
      senderType: 'user',
      sentAt: new Date().toISOString(),
    },
    conversation: { id: conversationId },
  });

  let result: { id: string | null | undefined };
  try {
    result = await connectionManager.sendContent(waJid, sendContent, replyToWhatsappMessageId ?? null);
  } catch (err) {
    // A session that reports 'connected' but times out queries is a zombie - refresh
    // it now so the BullMQ retry (next attempt) runs against a live connection.
    if (isConnectionFailure(err)) {
      logger.warn({ err, waJid }, 'Send failed with a connection error; refreshing WhatsApp connection');
      connectionManager.requestConnectionRefresh();
    }
    throw err;
  }
  const whatsappMessageId = result.id;
  if (!whatsappMessageId) {
    throw new Error('Baileys did not return a message id for the send');
  }

  await messageRepository.setOutboundWhatsappId(messageId, whatsappMessageId);
  await messageRepository.updateMessageStatus(messageId, 'sent');
  await dispatchRepository.markSent(dispatchId, messageId);

  const media = mediaRef
    ? await messageRepository.findMessageMediaByMessageId(messageId)
    : null;

  emitMessageUpdated(workspaceId, conversationId, {
    messageId,
    changes: {
      status: 'sent',
      whatsapp_message_id: whatsappMessageId,
      media: media
        ? {
            id: media.id,
            messageId,
            mimeType: media.mime_type,
            fileSizeBytes: media.file_size_bytes,
          }
        : null,
    },
  });

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

    // The queued row was persisted before the first send attempt - reflect the
    // terminal failure on it so the chat surface shows a failed bubble (with a
    // Retry action) instead of a permanently "sending" message.
    await messageRepository
      .findMessageByWhatsappId(job.data.workspaceId, `queued:${job.data.dispatchId}`)
      .then(async (row) => {
        if (!row || row.status === 'failed') {
          return;
        }
        await messageRepository.updateMessageStatus(row.id, 'failed');
        emitMessageUpdated(job.data.workspaceId, job.data.conversationId, {
          messageId: row.id,
          changes: { status: 'failed' },
        });
      })
      .catch((updateErr) => {
        logger.warn(
          { dispatchId: job.data.dispatchId, updateErr },
          'Failed to mark queued outbound message failed',
        );
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
