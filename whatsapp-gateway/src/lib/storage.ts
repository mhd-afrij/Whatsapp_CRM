import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env';

/**
 * Object-storage abstraction persisting message media to the gateway's
 * local disk (MEDIA_LOCAL_STORAGE_DIR). Callers only ever receive/store a
 * storage KEY - never a raw public URL - per docs/04-database-design.md
 * (message_media.storage_path).
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

let client: StorageClient | null = null;

/**
 * The provider label persisted alongside message media
 * (message_media.storage_provider).
 */
export function getStorageProviderName(): string {
  return 'local';
}

export function getStorageClient(): StorageClient {
  if (client) return client;

  client = new LocalDiskStorageClient(path.resolve(env.MEDIA_LOCAL_STORAGE_DIR));

  return client;
}
