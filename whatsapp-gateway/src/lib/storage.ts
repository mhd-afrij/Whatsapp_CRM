import fs from 'node:fs/promises';
import path from 'node:path';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../config/env';

/**
 * Minimal object-storage abstraction so message media can be persisted to
 * either a MinIO/S3-compatible bucket (preferred, Phase 1 infra) or local
 * disk (fallback when no S3_* env is configured, e.g. local dev). Callers
 * only ever receive/store a storage KEY - never a raw public URL - per
 * docs/04-database-design.md (message_media.storage_path).
 */
export interface StorageClient {
  /** Persists a buffer under `key` and returns the storage key (unchanged). */
  putObject(key: string, body: Buffer, contentType: string): Promise<string>;
  /** Reads back the bytes stored under `key` (used to send outbound media). */
  getObject(key: string): Promise<Buffer>;
}

class LocalDiskStorageClient implements StorageClient {
  constructor(private readonly baseDir: string) {}

  async putObject(key: string, body: Buffer): Promise<string> {
    const fullPath = path.join(this.baseDir, key);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, body);
    return key;
  }

  async getObject(key: string): Promise<Buffer> {
    return fs.readFile(path.join(this.baseDir, key));
  }
}

class S3StorageClient implements StorageClient {
  private readonly client: S3Client;

  constructor(
    private readonly bucket: string,
    clientOptions: import('@aws-sdk/client-s3').S3ClientConfig,
  ) {
    this.client = new S3Client(clientOptions);
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return key;
  }

  async getObject(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const stream = response.Body as unknown as NodeJS.ReadableStream;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
}

let client: StorageClient | null = null;

export function getStorageClient(): StorageClient {
  if (client) return client;

  if (env.S3_BUCKET) {
    client = new S3StorageClient(env.S3_BUCKET, {
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials:
        env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
          ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
          : undefined,
    });
  } else {
    client = new LocalDiskStorageClient(path.resolve(env.MEDIA_LOCAL_STORAGE_DIR));
  }

  return client;
}

/** Test/DI helper: overrides the singleton storage client. */
export function setStorageClientForTesting(override: StorageClient | null): void {
  client = override;
}
