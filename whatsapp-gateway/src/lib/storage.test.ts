import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import { env } from '../config/env';
import { createStorageClient, getStorageProviderName } from './storage';

describe('storage client selection', () => {
  it('identifies azure as the exclusive storage provider', () => {
    expect(getStorageProviderName()).toBe('azure');
  });

  it('rejects creation of local storage client', () => {
    expect(() => createStorageClient('local')).toThrow(/not supported/);
  });

  it('fails fast when azure is selected without azure configuration', () => {
    const originalContainer = env.AZURE_STORAGE_CONTAINER_NAME;
    try {
      (env as { AZURE_STORAGE_CONTAINER_NAME: string }).AZURE_STORAGE_CONTAINER_NAME = '';
      expect(() => createStorageClient('azure')).toThrow(/AZURE_STORAGE_CONTAINER_NAME/);
    } finally {
      (env as { AZURE_STORAGE_CONTAINER_NAME: string }).AZURE_STORAGE_CONTAINER_NAME = originalContainer;
    }
  });
});