import { describe, it, expect, vi, beforeEach } from 'vitest';

const { executeMock } = vi.hoisted(() => ({
  executeMock: vi.fn().mockResolvedValue({ affectedRows: 1 }),
}));

vi.mock('../lib/mysql', () => ({
  query: vi.fn(),
  execute: (...args: unknown[]) => executeMock(...args),
}));

vi.mock('../lib/crypto', () => ({
  encryptCredentialValue: (v: string) => `enc(${v})`,
}));

vi.mock('node:fs/promises', () => ({
  default: {
    readdir: vi.fn(),
    readFile: vi.fn(),
  },
}));

import fs from 'node:fs/promises';
import { SessionRepository } from './session-repository';

const readdirMock = vi.mocked(fs.readdir);
const readFileMock = vi.mocked(fs.readFile);

describe('SessionRepository.persistCredentialsFromDisk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executeMock.mockClear();
  });

  it('skips a file that vanishes between readdir and readFile (Baileys pre-key rotation)', async () => {
    readdirMock.mockResolvedValue(['creds.json', 'pre-key-36.json', 'app-state-sync-key.json'] as unknown as never);
    readFileMock.mockImplementation(async (file: unknown) => {
      if (String(file).endsWith('pre-key-36.json')) {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      }
      return `content-of-${file}`;
    });

    await new SessionRepository().persistCredentialsFromDisk(1, '/sessions');

    expect(executeMock).toHaveBeenCalledTimes(2);
    const keys = executeMock.mock.calls.map((call) => call[1][1]);
    expect(keys).not.toContain('pre-key-36.json');
    expect(keys).toContain('creds.json');
    expect(keys).toContain('app-state-sync-key.json');
  });
});