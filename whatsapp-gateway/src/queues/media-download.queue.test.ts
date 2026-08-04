import { describe, it, expect, vi } from 'vitest';

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(function FakeQueue() {
    return { add: vi.fn(), close: vi.fn() };
  }),
  Worker: vi.fn().mockImplementation(function FakeWorker() {
    return { on: vi.fn(), run: vi.fn(), close: vi.fn() };
  }),
}));

import { validateMedia, MediaValidationError } from './media-download.queue';
import { env } from '../config/env';

describe('media validation', () => {
  it('accepts an allowed mime type within the size limit', () => {
    expect(() => validateMedia('image/png', 1024)).not.toThrow();
  });

  it('rejects a disallowed mime type', () => {
    expect(() => validateMedia('application/x-msdownload', 1024)).toThrow(MediaValidationError);
  });

  it('rejects a file exceeding the configured size limit', () => {
    expect(() => validateMedia('image/png', env.MEDIA_MAX_SIZE_BYTES + 1)).toThrow(MediaValidationError);
  });
});
