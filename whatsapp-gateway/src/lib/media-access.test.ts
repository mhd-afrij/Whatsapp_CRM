import { describe, it, expect, vi } from 'vitest';

vi.mock('./storage', () => ({
  getStorageClient: () => ({
    getObject: vi.fn(async (key: string) => {
      if (key === '1/42/abc123.jpg') {
        return Buffer.from('fake image bytes from azure');
      }
      throw new Error('BlobNotFound');
    }),
  }),
}));

describe('resolveMediaAccess', () => {
  it('resolves an existing storage key to a buffer from Azure storage', async () => {
    const key = '1/42/abc123.jpg';

    const { resolveMediaAccess } = await import('./media-access');
    const result = await resolveMediaAccess(key);

    expect(result.kind).toBe('buffer');
    if (result.kind === 'buffer') {
      expect(result.buffer.toString()).toBe('fake image bytes from azure');
    }
  });

  it('throws when the Azure blob does not exist (never silently returns a broken link)', async () => {
    const { resolveMediaAccess } = await import('./media-access');

    await expect(resolveMediaAccess('missing/does-not-exist.jpg')).rejects.toThrow();
  });
});
