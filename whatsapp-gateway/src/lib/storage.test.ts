import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import { env } from '../config/env';
import { createStorageClient, getStorageProviderName } from './storage';

describe('storage client selection', () => {
  it('selects the local disk client under the default provider', async () => {
    expect(getStorageProviderName()).toBe('local');

    const client = createStorageClient('local');
    const key = 'storage-test/hello.txt';
    try {
      expect(await client.putObject(key, Buffer.from('hello'), 'text/plain')).toBe(key);
      expect((await client.getObject(key)).toString()).toBe('hello');
    } finally {
      await fs.rm(`${env.MEDIA_LOCAL_STORAGE_DIR}/${key}`, { force: true });
    }
  });

  it('fails fast when azure is selected without azure configuration', () => {
    expect(env.STORAGE_PROVIDER).toBe('local');
    expect(() => createStorageClient('azure')).toThrow(/AZURE_STORAGE_CONTAINER_NAME/);
  });
});