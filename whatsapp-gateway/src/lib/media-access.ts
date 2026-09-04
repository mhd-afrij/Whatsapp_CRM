import fs from 'node:fs/promises';
import path from 'node:path';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';

/**
 * Produces a short-lived, authorized way to fetch a piece of message media
 * that was stored under a storage KEY (never a raw public URL) by
 * src/queues/media-download.queue.ts. Callers (the internal-whatsapp routes,
 * reached only via the Laravel backend after it has verified the requesting
 * user can view the owning conversation) never receive the bucket/base path
 * directly - only a pre-signed, time-boxed URL (S3/MinIO mode) or the raw
 * bytes plus a content type (local-disk fallback, for dev environments with
 * no S3_BUCKET configured).
 */

const SIGNED_URL_TTL_SECONDS = 300;

export interface SignedMediaUrlResult {
  kind: 'signed_url';
  url: string;
  expiresInSeconds: number;
}

export interface LocalMediaFileResult {
  kind: 'local_file';
  filePath: string;
}

export type MediaAccessResult = SignedMediaUrlResult | LocalMediaFileResult;

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (s3Client) return s3Client;
  s3Client = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials:
      env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
        ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
        : undefined,
  });
  return s3Client;
}

/**
 * Resolves a storage key (as persisted in message_media.storage_path) to a
 * temporary, authorized access method. Does NOT perform any authorization
 * itself - the caller (internal-whatsapp.routes.ts) is only reachable via the
 * internal gateway token, and the Laravel-side controller is responsible for
 * confirming the requesting user can view the owning conversation before it
 * ever calls this endpoint.
 */
export async function resolveMediaAccess(storageKey: string): Promise<MediaAccessResult> {
  if (env.S3_BUCKET) {
    const client = getS3Client();
    const command = new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: storageKey });
    const url = await getSignedUrl(client, command, { expiresIn: SIGNED_URL_TTL_SECONDS });
    return { kind: 'signed_url', url, expiresInSeconds: SIGNED_URL_TTL_SECONDS };
  }

  const filePath = path.join(path.resolve(env.MEDIA_LOCAL_STORAGE_DIR), storageKey);
  await fs.access(filePath);
  return { kind: 'local_file', filePath };
}
