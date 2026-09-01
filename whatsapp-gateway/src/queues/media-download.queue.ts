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

/**
 * A WhatsApp disconnect is usually transient: ConnectionManager reconnects with
 * exponential backoff that can reach minutes (MAX_BACKOFF_MS = 5m). A media
 * download must run against a live socket, so instead of burning the queue's
 * short retry budget (4 attempts, ~40s total) on the first "no socket" check,
 * wait for the connection to come back within this window and download then.
 * Only if the socket never returns (e.g. logged out and never re-paired) do we
 * throw and let BullMQ exhaust retries into a permanent failure record.
 */
export const WAIT_FOR_SOCKET_MS = 10 * 60_000;
const SOCKET_POLL_INTERVAL_MS = 2_000;

/**
 * Polls for a live media downloader (i.e. a connected Baileys socket) up to
 * `timeoutMs`, returning null if the connection never comes back. Polling
 * beats subscribing to connection.updated events here: the socket may already
 * be mid-reconnect when the job starts, and the poll cannot miss an event.
 */
export async function waitForMediaDownloader(
  timeoutMs: number = WAIT_FOR_SOCKET_MS,
): Promise<((message: unknown) => Promise<Buffer>) | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const downloader = connectionManager.getMediaDownloader();
    if (downloader) {
      return downloader;
    }
    await new Promise((resolve) => setTimeout(resolve, SOCKET_POLL_INTERVAL_MS));
  }
  return null;
}

async function processMediaDownload(job: Job<MediaDownloadJobData>): Promise<void> {
  const { workspaceId, messageId, whatsappMessageId, rawMessage, mimeType } = job.data;

  const downloader = await waitForMediaDownloader();
  if (!downloader) {
    throw new Error(
      `No active WhatsApp socket to download media from (waited ${WAIT_FOR_SOCKET_MS / 60_000} minutes for a reconnect)`,
    );
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
    fileSize: buffer.length,
    storagePath,
    blobName: storagePath,
    mediaUrl: null,
    storageProvider: 'azure_blob',
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
