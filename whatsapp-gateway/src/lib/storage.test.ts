import { describe, it, expect } from 'vitest';
import { env } from '../config/env';
import { createStorageClient, getStorageProviderName } from './storage';

describe('storage client selection', () => {
  it('identifies supabase as the exclusive storage provider', () => {
    expect(getStorageProviderName()).toBe('supabase');
  });

  it('rejects creation of unsupported storage client', () => {
    expect(() => createStorageClient('azure')).toThrow(/not supported/);
    expect(() => createStorageClient('local')).toThrow(/not supported/);
  });

  it('fails fast when supabase is selected without required configuration', () => {
    const originalKey = env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      (env as { SUPABASE_SERVICE_ROLE_KEY: string }).SUPABASE_SERVICE_ROLE_KEY = '';
      expect(() => createStorageClient('supabase')).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
    } finally {
      (env as { SUPABASE_SERVICE_ROLE_KEY: string }).SUPABASE_SERVICE_ROLE_KEY = originalKey;
    }
  });
});