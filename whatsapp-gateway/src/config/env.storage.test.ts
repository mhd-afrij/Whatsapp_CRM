import { describe, it, expect } from 'vitest';
import { storageEnvSchema } from './env';

/**
 * Storage configuration drift guard.
 *
 * A gateway booted with STORAGE_PROVIDER=azure but no credentials used to look
 * perfectly healthy: createStorageClient() only refuses when the first media
 * operation runs. The schema now rejects that combination at boot.
 */
describe('storage env drift guard', () => {
  // vitest.setup.ts pins every other required variable; merge it so these
  // cases isolate the storage guard instead of failing on unrelated fields.
  const withBaseline = (overrides: Record<string, string>) => ({
    ...process.env,
    ...overrides,
  });

  const azureBase = {
    STORAGE_PROVIDER: 'azure',
    AZURE_STORAGE_CONNECTION_STRING: 'DefaultEndpointsProtocol=https;AccountName=acct',
    AZURE_STORAGE_ACCOUNT_NAME: 'acct',
    AZURE_STORAGE_CONTAINER_NAME: 'whatsapp-media',
    AZURE_STORAGE_URL: 'https://acct.blob.core.windows.net',
  };

  it('accepts azure with a connection string', () => {
    expect(storageEnvSchema.safeParse(withBaseline(azureBase)).success).toBe(true);
  });

  it('accepts azure with a shared key instead of a connection string', () => {
    const result = storageEnvSchema.safeParse(
      withBaseline({
        STORAGE_PROVIDER: 'azure',
        AZURE_STORAGE_ACCOUNT_NAME: 'acct',
        AZURE_STORAGE_ACCOUNT_KEY: 'key',
        AZURE_STORAGE_CONTAINER_NAME: 'whatsapp-media',
        AZURE_STORAGE_URL: 'https://acct.blob.core.windows.net',
      }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects azure with no credential at all', () => {
    const result = storageEnvSchema.safeParse(
      withBaseline({
        STORAGE_PROVIDER: 'azure',
        AZURE_STORAGE_CONNECTION_STRING: '',
        AZURE_STORAGE_ACCOUNT_NAME: '',
        AZURE_STORAGE_ACCOUNT_KEY: '',
        AZURE_STORAGE_CONTAINER_NAME: 'whatsapp-media',
      }),
    );
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/AZURE_STORAGE_CONNECTION_STRING/);
  });

  it('rejects azure with an incomplete shared key', () => {
    const result = storageEnvSchema.safeParse(
      withBaseline({
        STORAGE_PROVIDER: 'azure',
        AZURE_STORAGE_CONNECTION_STRING: '',
        AZURE_STORAGE_ACCOUNT_NAME: 'acct',
        AZURE_STORAGE_ACCOUNT_KEY: '',
        AZURE_STORAGE_CONTAINER_NAME: 'whatsapp-media',
      }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects azure without a container', () => {
    const result = storageEnvSchema.safeParse(
      withBaseline({
        STORAGE_PROVIDER: 'azure',
        AZURE_STORAGE_CONNECTION_STRING: 'DefaultEndpointsProtocol=https;AccountName=acct',
        AZURE_STORAGE_CONTAINER_NAME: '',
      }),
    );
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((i) => i.path[0] === 'AZURE_STORAGE_CONTAINER_NAME')).toBe(true);
  });

  it('does not require azure variables for the local provider', () => {
    expect(storageEnvSchema.safeParse(withBaseline({ STORAGE_PROVIDER: 'local' })).success).toBe(true);
  });

  it('rejects an account name and endpoint that drift apart', () => {
    const result = storageEnvSchema.safeParse(
      withBaseline({
        ...azureBase,
        AZURE_STORAGE_ACCOUNT_NAME: 'other-account',
      }),
    );
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((i) => i.path[0] === 'AZURE_STORAGE_URL')).toBe(true);
  });

  it('rejects a connection string for a different account', () => {
    const result = storageEnvSchema.safeParse(
      withBaseline({
        ...azureBase,
        AZURE_STORAGE_CONNECTION_STRING: 'DefaultEndpointsProtocol=https;AccountName=other-account',
      }),
    );
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((i) => i.path[0] === 'AZURE_STORAGE_CONNECTION_STRING')).toBe(true);
  });
});
