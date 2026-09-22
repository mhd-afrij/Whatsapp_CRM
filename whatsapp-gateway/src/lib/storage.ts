import { BlobServiceClient, StorageSharedKeyCredential } from '@azure/storage-blob';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env';

/**
 * Object-storage abstraction persisting message media to either the
 * gateway's local disk (MEDIA_LOCAL_STORAGE_DIR) or Azure Blob Storage
 * (STORAGE_PROVIDER=azure), selected via env. Callers only ever receive/
 * store a storage KEY - never a raw public URL - per docs/04-database-design.md
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

class AzureBlobStorageClient implements StorageClient {
  private readonly container;

  constructor(config: {
    connectionString?: string;
    accountName?: string;
    accountKey?: string;
    containerName: string;
    baseUrl?: string;
  }) {
    const client = config.connectionString
      ? BlobServiceClient.fromConnectionString(config.connectionString)
      : new BlobServiceClient(
          config.baseUrl!,
          new StorageSharedKeyCredential(config.accountName!, config.accountKey!),
        );
    this.container = client.getContainerClient(config.containerName);
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<string> {
    await this.container.getBlockBlobClient(key).upload(body, body.length, {
      blobHTTPHeaders: { blobContentType: contentType },
    });
    return key;
  }

  async getObject(key: string): Promise<Buffer> {
    return await this.container.getBlockBlobClient(key).downloadToBuffer();
  }
}

/** Provider-pure client creation (no network on construction). */
export function createStorageClient(provider: string): StorageClient {
  if (provider === 'azure') {
    const {
      AZURE_STORAGE_CONNECTION_STRING,
      AZURE_STORAGE_ACCOUNT_NAME,
      AZURE_STORAGE_ACCOUNT_KEY,
      AZURE_STORAGE_CONTAINER_NAME,
      AZURE_STORAGE_URL,
    } = env;
    if (!AZURE_STORAGE_CONTAINER_NAME) {
      throw new Error('STORAGE_PROVIDER=azure requires AZURE_STORAGE_CONTAINER_NAME');
    }
    if (!AZURE_STORAGE_CONNECTION_STRING && (!AZURE_STORAGE_ACCOUNT_NAME || !AZURE_STORAGE_ACCOUNT_KEY || !AZURE_STORAGE_URL)) {
      throw new Error(
        'STORAGE_PROVIDER=azure requires AZURE_STORAGE_CONNECTION_STRING, or AZURE_STORAGE_ACCOUNT_NAME + AZURE_STORAGE_ACCOUNT_KEY + AZURE_STORAGE_URL',
      );
    }
    return new AzureBlobStorageClient({
      connectionString: AZURE_STORAGE_CONNECTION_STRING || undefined,
      accountName: AZURE_STORAGE_ACCOUNT_NAME || undefined,
      accountKey: AZURE_STORAGE_ACCOUNT_KEY || undefined,
      containerName: AZURE_STORAGE_CONTAINER_NAME,
      baseUrl: AZURE_STORAGE_URL || undefined,
    });
  }

  return new LocalDiskStorageClient(path.resolve(env.MEDIA_LOCAL_STORAGE_DIR));
}

let client: StorageClient | null = null;

/**
 * The provider label persisted alongside message media
 * (message_media.storage_provider).
 */
export function getStorageProviderName(): string {
  return env.STORAGE_PROVIDER;
}

export function getStorageClient(): StorageClient {
  if (client) return client;

  client = createStorageClient(env.STORAGE_PROVIDER);

  return client;
}