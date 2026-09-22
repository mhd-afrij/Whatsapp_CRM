import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env';

/**
 * Produces an authorized way to fetch a piece of message media that was
 * stored under a storage KEY (never a raw public URL). Callers (the
 * internal-whatsapp routes, reached only via the Laravel backend after it
 * has verified the requesting user can view the owning conversation) only
 * ever receive the raw bytes' file path - there is no object-storage mode.
 */

export interface LocalMediaFileResult {
  kind: 'local_file';
  filePath: string;
}

export type MediaAccessResult = LocalMediaFileResult;

/**
 * Resolves a storage key (as persisted in message_media.storage_path) to a
 * file path on the gateway's local disk. Does NOT perform any authorization
 * itself - the caller (internal-whatsapp.routes.ts) is only reachable via the
 * internal gateway token, and the Laravel-side controller is responsible for
 * confirming the requesting user can view the owning conversation before it
 * ever calls this endpoint.
 */
export async function resolveMediaAccess(storageKey: string): Promise<MediaAccessResult> {
  const filePath = path.join(path.resolve(env.MEDIA_LOCAL_STORAGE_DIR), storageKey);
  await fs.access(filePath);
  return { kind: 'local_file', filePath };
}
