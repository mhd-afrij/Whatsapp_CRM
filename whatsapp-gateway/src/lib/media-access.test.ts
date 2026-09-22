import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

describe('resolveMediaAccess', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'media-access-test-'));
    process.env.MEDIA_LOCAL_STORAGE_DIR = tmpDir;
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('resolves an existing storage key to a local file path', async () => {
    const key = '1/42/abc123.jpg';
    await fs.mkdir(path.join(tmpDir, '1', '42'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, key), Buffer.from('fake image bytes'));

    const { resolveMediaAccess } = await import('./media-access');
    const result = await resolveMediaAccess(key);

    expect(result.kind).toBe('local_file');
    if (result.kind === 'local_file') {
      expect(result.filePath).toBe(path.join(path.resolve(tmpDir), key));
    }
  });

  it('throws when the local file does not exist (never silently returns a broken link)', async () => {
    const { resolveMediaAccess } = await import('./media-access');

    await expect(resolveMediaAccess('missing/does-not-exist.jpg')).rejects.toThrow();
  });
});
