import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env';

/**
 * Object-storage abstraction persisting message media to Supabase Storage
 * (bucket: whatsapp-media), selected via env. Callers only ever receive/
 * store a storage KEY - never a raw public URL - per docs/04-database-design.md
 * (message_media.storage_path).
 */
export interface StorageClient {
  /** Persists a buffer under `key` and returns the storage key (unchanged). */
  putObject(key: string, body: Buffer, contentType: string): Promise<string>;
  /** Reads back the bytes stored under `key` (used to send outbound media). */
  getObject(key: string): Promise<Buffer>;
}

export class SupabaseStorageClient implements StorageClient {
  private readonly supabase: SupabaseClient;
  private readonly bucket: string;

  constructor(config: { url: string; key: string; bucket: string }) {
    this.supabase = createClient(config.url, config.key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    this.bucket = config.bucket;
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<string> {
    const { error } = await this.supabase.storage
      .from(this.bucket)
      .upload(key, body, {
        contentType,
        upsert: true,
      });

    if (error) {
      throw error;
    }

    return key;
  }

  async getObject(key: string): Promise<Buffer> {
    const { data, error } = await this.supabase.storage
      .from(this.bucket)
      .download(key);

    if (error || !data) {
      throw error || new Error(`Failed to download object: ${key}`);
    }

    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}

/** Provider-pure client creation (no network on construction). */
export function createStorageClient(provider: string = 'supabase'): StorageClient {
  if (provider !== 'supabase') {
    throw new Error(
      `Storage provider '${provider}' is not supported. Supabase Storage is the exclusive persistent storage backend.`,
    );
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_STORAGE_BUCKET } = env;

  if (!SUPABASE_URL) {
    throw new Error('STORAGE_PROVIDER=supabase requires SUPABASE_URL');
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('STORAGE_PROVIDER=supabase requires SUPABASE_SERVICE_ROLE_KEY');
  }

  return new SupabaseStorageClient({
    url: SUPABASE_URL,
    key: SUPABASE_SERVICE_ROLE_KEY,
    bucket: SUPABASE_STORAGE_BUCKET || 'whatsapp-media',
  });
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