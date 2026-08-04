import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const { send, getSignedUrlMock } = vi.hoisted(() => ({
  send: vi.fn(),
  getSignedUrlMock: vi.fn().mockResolvedValue('https://minio.local/signed?sig=abc'),
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(function FakeS3Client() {
    return { send };
  }),
  GetObjectCommand: vi.fn().mockImplementation(function FakeGetObjectCommand(input: unknown) {
    return { input };
  }),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => getSignedUrlMock(...args),
}));

describe('resolveMediaAccess', () => {
  const originalBucket = process.env.S3_BUCKET;
  let tmpDir: string;

  beforeEach(async () => {
    vi.resetModules();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'media-access-test-'));
  });

  afterEach(async () => {
    if (originalBucket === undefined) delete process.env.S3_BUCKET;
    else process.env.S3_BUCKET = originalBucket;
    await fs.rm(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('returns a signed URL (never the raw storage key/bucket) when S3_BUCKET is configured', async () => {
    process.env.S3_BUCKET = 'crm-media';
    process.env.S3_ENDPOINT = 'http://minio:9000';
    const { resolveMediaAccess } = await import('./media-access');

    const result = await resolveMediaAccess('1/42/abc123.jpg');

    expect(result.kind).toBe('signed_url');
    if (result.kind === 'signed_url') {
      expect(result.url).toBe('https://minio.local/signed?sig=abc');
      expect(result.expiresInSeconds).toBeGreaterThan(0);
    }
    expect(getSignedUrlMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to a local file path when no S3_BUCKET is configured', async () => {
    delete process.env.S3_BUCKET;
    process.env.MEDIA_LOCAL_STORAGE_DIR = tmpDir;
    const key = '1/42/abc123.jpg';
    await fs.mkdir(path.join(tmpDir, '1', '42'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, key), Buffer.from('fake image bytes'));

    const { resolveMediaAccess } = await import('./media-access');
    const result = await resolveMediaAccess(key);

    expect(result.kind).toBe('local_file');
    if (result.kind === 'local_file') {
      expect(result.filePath).toBe(path.join(path.resolve(tmpDir), key));
    }
    expect(getSignedUrlMock).not.toHaveBeenCalled();
  });

  it('throws when the local file does not exist (never silently returns a broken link)', async () => {
    delete process.env.S3_BUCKET;
    process.env.MEDIA_LOCAL_STORAGE_DIR = tmpDir;
    const { resolveMediaAccess } = await import('./media-access');

    await expect(resolveMediaAccess('missing/does-not-exist.jpg')).rejects.toThrow();
  });
});
