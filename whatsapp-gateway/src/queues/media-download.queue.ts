import crypto from 'node:crypto';
import { Queue, Worker, type Job } from 'bullmq';
import { getQueueConnectionOptions } from './connection';
import { logger } from '../lib/logger';
import { env } from '../config/env';
import { getStorageClient } from '../lib/storage';
import { MessageRepository } from '../whatsapp/message-repository';
import { connectionManager } from '../whatsapp/manager-instance';
import type { BaileysRawMessage } from '../whatsapp/baileys-socket';

export const MEDIA_DOWNLOAD_QUEUE_NAME = 'media-download';

export interface MediaDownloadJobData {
  workspaceId: number;
  messageId: number;
  whatsappMessageId: string;
  rawMessage: BaileysRawMessage;
  mimeType: string;
  expectedSizeBytes: number | null;
}

export const mediaDownloadQueue = new Queue<MediaDownloadJobData>(MEDIA_DOWNLOAD_QUEUE_NAME, {
  connection: getQueueConnectionOptions(),
  defaultJobOptions: {
    attempts: 4,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});

export async function enqueueMediaDownload(data: MediaDownloadJobData): Promise<void> {
  await mediaDownloadQueue.add('download', data);
}

export class MediaValidationError extends Error {}

function getAllowedMimeTypes(): Set<string> {
  return new Set(env.MEDIA_ALLOWED_MIME_TYPES.split(',').map((s) => s.trim()));
}

export function validateMedia(mimeType: string, sizeBytes: number): void {
  const allowed = getAllowedMimeTypes();
  if (!allowed.has(mimeType)) {
    throw new MediaValidationError(`MIME type not allowed: ${mimeType}`);
  }
  if (sizeBytes > env.MEDIA_MAX_SIZE_BYTES) {
    throw new MediaValidationError(
      `Media exceeds max size: ${sizeBytes} > ${env.MEDIA_MAX_SIZE_BYTES}`,
    );
  }
}

const repository = new MessageRepository();

async function processMediaDownload(job: Job<MediaDownloadJobData>): Promise<void> {
  const { workspaceId, messageId, whatsappMessageId, rawMessage, mimeType } = job.data;

  const downloader = connectionManager.getMediaDownloader();
  if (!downloader) {
    throw new Error('No active WhatsApp socket to download media from');
  }

  const buffer = await downloader(rawMessage);

  try {
    validateMedia(mimeType, buffer.length);
  } catch (err) {
    await repository.recordProcessingFailure(
      workspaceId,
      'media_download',
      err instanceof Error ? err.message : String(err),
      { whatsappMessageId, mimeType, sizeBytes: buffer.length },
    );
    throw err; // let BullMQ retry/exhaust; final failure state tracked via message_processing_failures
  }

  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
  const extension = mimeType.split('/')[1] ?? 'bin';
  const key = `${workspaceId}/${messageId}/${checksum}.${extension}`;

  const storage = getStorageClient();
  const storagePath = await storage.putObject(key, buffer, mimeType);

  await repository.insertMessageMedia(messageId, {
    mimeType,
    fileSizeBytes: buffer.length,
    storagePath,
    checksumSha256: checksum,
  });
}

export function createMediaDownloadWorker(): Worker<MediaDownloadJobData> {
  const worker = new Worker<MediaDownloadJobData>(MEDIA_DOWNLOAD_QUEUE_NAME, processMediaDownload, {
    connection: getQueueConnectionOptions(),
    autorun: false,
  });

  worker.on('failed', async (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Media download job failed');
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      // Retries exhausted: this is a *distinct* terminal state from a
      // transient in-flight retry - record it explicitly (error_context.permanent
      // = true) so operators/UI can tell "still retrying" apart from
      // "gave up after N attempts" rather than inferring it from BullMQ internals.
      try {
        await repository.recordProcessingFailure(
          job.data.workspaceId,
          'media_download',
          err instanceof Error ? err.message : String(err),
          {
            whatsappMessageId: job.data.whatsappMessageId,
            mimeType: job.data.mimeType,
            attemptsMade: job.attemptsMade,
            permanent: true,
          },
        );
      } catch (persistErr) {
        logger.error({ jobId: job.id, persistErr }, 'Failed to persist permanent media-download failure');
      }
      logger.error({ jobId: job.id }, 'Media download permanently failed after exhausting retries');
    }
  });

  return worker;
}
