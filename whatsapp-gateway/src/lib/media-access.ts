import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env';
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
 * bytes: a file path on the gateway's local disk for STORAGE_PROVIDER=local,
 * or an in-memory buffer read from Azure for STORAGE_PROVIDER=azure. Does NOT
 * perform any authorization itself - the caller (internal-whatsapp.routes.ts)
 * is only reachable via the internal gateway token, and the Laravel-side
 * controller is responsible for confirming the requesting user can view the
 * owning conversation before it ever calls this endpoint.
 */
export async function resolveMediaAccess(storageKey: string): Promise<MediaAccessResult> {
  if (env.STORAGE_PROVIDER === 'azure') {
    return { kind: 'buffer', buffer: await getStorageClient().getObject(storageKey) };
  }

  const filePath = path.join(path.resolve(env.MEDIA_LOCAL_STORAGE_DIR), storageKey);
  await fs.access(filePath);
  return { kind: 'local_file', filePath };
}