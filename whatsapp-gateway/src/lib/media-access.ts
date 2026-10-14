import { getStorageClient } from './storage';

/**
 * Produces an authorized way to fetch a piece of message media that was
 * stored under a storage KEY (never a raw public URL). Callers (the
 * internal-whatsapp routes, reached only via the Laravel backend after it
 * has verified the requesting user can view the owning conversation) only
 * ever receive the raw bytes - as a local file path (local disk) or an
 * in-memory buffer (Azure Blob Storage).
 */

export interface LocalMediaFileResult {
  kind: 'local_file';
  filePath: string;
}

export interface MediaBufferResult {
  kind: 'buffer';
  buffer: Buffer;
}

export type MediaAccessResult = LocalMediaFileResult | MediaBufferResult;

/**
 * Resolves a storage key (as persisted in message_media.storage_path) to
 * bytes: an in-memory buffer read directly from Azure Blob Storage.
 * Local filesystem fallback is disabled.
 */
export async function resolveMediaAccess(storageKey: string): Promise<MediaAccessResult> {
  return { kind: 'buffer', buffer: await getStorageClient().getObject(storageKey) };
}