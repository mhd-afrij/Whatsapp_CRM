import { describe, it, expect } from 'vitest';
import { storageEnvSchema } from './env';

/**
 * Supabase Storage configuration drift guard.
 */
describe('storage env drift guard', () => {
  const withBaseline = (overrides: Record<string, string>) => ({
    ...process.env,
    ...overrides,
  });

  const supabaseBase = {
    STORAGE_PROVIDER: 'supabase',
    SUPABASE_URL: 'https://test-ref.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    SUPABASE_STORAGE_BUCKET: 'whatsapp-media',
  };

  it('accepts valid supabase configuration', () => {
    expect(storageEnvSchema.safeParse(withBaseline(supabaseBase)).success).toBe(true);
  });

  it('rejects supabase without url', () => {
    const result = storageEnvSchema.safeParse(
      withBaseline({
        STORAGE_PROVIDER: 'supabase',
        SUPABASE_URL: '',
        SUPABASE_SERVICE_ROLE_KEY: 'test-key',
      }),
    );
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((i) => i.path[0] === 'SUPABASE_URL')).toBe(true);
  });

  it('rejects supabase without service role key', () => {
    const result = storageEnvSchema.safeParse(
      withBaseline({
        STORAGE_PROVIDER: 'supabase',
        SUPABASE_URL: 'https://test-ref.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: '',
      }),
    );
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((i) => i.path[0] === 'SUPABASE_SERVICE_ROLE_KEY')).toBe(true);
  });

  it('rejects other storage providers as persistent storage is supabase-only', () => {
    const result = storageEnvSchema.safeParse(withBaseline({ STORAGE_PROVIDER: 'azure' }));
    expect(result.success).toBe(false);
  });
});
