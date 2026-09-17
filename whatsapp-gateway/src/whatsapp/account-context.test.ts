import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 5.1/5.4 - account execution context resolver.
 *
 * These tests pin the contract that keeps multi-account operation safe:
 * an operation may only execute against the account it was addressed to
 * (or the conversation's owner), and every failure produces a stable,
 * frontend-safe error code instead of a silent cross-account fallback.
 */

const { registryGetOrCreate, legacyManager, getConversationAccount } = vi.hoisted(() => ({
  registryGetOrCreate: vi.fn(),
  legacyManager: { getSnapshot: () => ({ accountId: null, status: 'connected' }), getSocket: () => null },
  getConversationAccount: vi.fn(),
}));

vi.mock('./manager-instance', () => ({
  connectionManager: legacyManager,
  connectionRegistry: {
    getOrCreate: (...args: unknown[]) => registryGetOrCreate(...args),
  },
}));

vi.mock('./message-repository', () => ({
  MessageRepository: vi.fn().mockImplementation(function FakeMessageRepository() {
    return { getConversationAccount: (...args: unknown[]) => getConversationAccount(...args) };
  }),
}));

import {
  resolveAccountContext,
  resolveConversationAccountContext,
  AccountContextError,
} from './account-context';

function fakeManager(accountId: number, status = 'connected') {
  return {
    getSnapshot: () => ({ accountId, status }),
    getSocket: () => ({ fake: true, accountId }),
  };
}

describe('resolveAccountContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a context bound to the requested account, its manager and its socket', () => {
    const manager = fakeManager(11);
    registryGetOrCreate.mockReturnValue(manager);

    const ctx = resolveAccountContext(1, 11);

    expect(registryGetOrCreate).toHaveBeenCalledWith(1, 11);
    expect(ctx.accountId).toBe(11);
    expect(ctx.workspaceId).toBe(1);
    expect(ctx.manager).toBe(manager);
    expect(ctx.socket).toEqual({ fake: true, accountId: 11 });
  });

  it('rejects a missing/invalid accountId with ACCOUNT_ID_REQUIRED (400)', () => {
    for (const bad of [undefined, null, 0, -1, 'abc']) {
      expect(() => resolveAccountContext(1, bad)).toThrowError(AccountContextError);
      try {
        resolveAccountContext(1, bad);
      } catch (err) {
        expect((err as AccountContextError).code).toBe('ACCOUNT_ID_REQUIRED');
        expect((err as AccountContextError).httpStatus).toBe(400);
      }
    }
    expect(registryGetOrCreate).not.toHaveBeenCalled();
  });

  it('fails explicitly when the resolved manager belongs to a different account', () => {
    registryGetOrCreate.mockReturnValue(fakeManager(99));

    try {
      resolveAccountContext(1, 11);
      throw new Error('should have thrown');
    } catch (err) {
      expect((err as AccountContextError).code).toBe('ACCOUNT_NOT_FOUND');
    }
  });
});

describe('resolveConversationAccountContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getConversationAccount.mockResolvedValue({ id: 10, whatsappAccountId: null });
  });

  it('rejects an unknown conversation with CONVERSATION_NOT_FOUND (404)', async () => {
    getConversationAccount.mockResolvedValue(null);

    await expect(
      resolveConversationAccountContext({
        conversationId: 10,
        workspaceId: 1,
        requestedAccountId: null,
        operation: 'send',
      }),
    ).rejects.toMatchObject({ code: 'CONVERSATION_NOT_FOUND', httpStatus: 404 });
  });

  it('rejects caller accountId B for a conversation owned by account A (never routes through B)', async () => {
    getConversationAccount.mockResolvedValue({ id: 10, whatsappAccountId: 2 });
    registryGetOrCreate.mockReturnValue(fakeManager(2));

    await expect(
      resolveConversationAccountContext({
        conversationId: 10,
        workspaceId: 1,
        requestedAccountId: 1,
        operation: 'send',
      }),
    ).rejects.toMatchObject({ code: 'ACCOUNT_OWNERSHIP_MISMATCH', httpStatus: 409 });

    // The conflicting account's manager must never be created/touched.
    expect(registryGetOrCreate).not.toHaveBeenCalledWith(1, 1);
  });

  it('routes through the conversation owner when the caller sends no accountId', async () => {
    getConversationAccount.mockResolvedValue({ id: 10, whatsappAccountId: 2 });
    const manager = fakeManager(2);
    registryGetOrCreate.mockReturnValue(manager);

    const ctx = await resolveConversationAccountContext({
      conversationId: 10,
      workspaceId: 1,
      requestedAccountId: null,
      operation: 'send',
    });

    expect(registryGetOrCreate).toHaveBeenCalledWith(1, 2);
    expect(ctx.accountId).toBe(2);
    expect(ctx.manager).toBe(manager);
  });

  it('accepts a caller accountId that matches the conversation owner', async () => {
    getConversationAccount.mockResolvedValue({ id: 10, whatsappAccountId: 3 });
    registryGetOrCreate.mockReturnValue(fakeManager(3));

    const ctx = await resolveConversationAccountContext({
      conversationId: 10,
      workspaceId: 1,
      requestedAccountId: 3,
      operation: 'send',
    });

    expect(ctx.accountId).toBe(3);
  });

  it('legacy unowned conversation + no accountId: falls back to the legacy manager (controlled compat path)', async () => {
    const ctx = await resolveConversationAccountContext({
      conversationId: 10,
      workspaceId: 1,
      requestedAccountId: null,
      operation: 'send',
    });

    expect(registryGetOrCreate).not.toHaveBeenCalled();
    expect(ctx.manager).toBe(legacyManager);
    expect(ctx.accountId).toBeNull();
  });

  it('legacy unowned conversation + explicit accountId: uses the requested account', async () => {
    registryGetOrCreate.mockReturnValue(fakeManager(5));

    const ctx = await resolveConversationAccountContext({
      conversationId: 10,
      workspaceId: 1,
      requestedAccountId: 5,
      operation: 'send',
    });

    expect(registryGetOrCreate).toHaveBeenCalledWith(1, 5);
    expect(ctx.accountId).toBe(5);
  });

  it('requireConnected fails with ACCOUNT_NOT_CONNECTED when the owning session is offline', async () => {
    getConversationAccount.mockResolvedValue({ id: 10, whatsappAccountId: 2 });
    registryGetOrCreate.mockReturnValue(fakeManager(2, 'reconnecting'));

    await expect(
      resolveConversationAccountContext({
        conversationId: 10,
        workspaceId: 1,
        requestedAccountId: null,
        operation: 'revoke',
        requireConnected: true,
      }),
    ).rejects.toMatchObject({ code: 'ACCOUNT_NOT_CONNECTED', httpStatus: 409 });
  });

  it('requireConnected passes for a connected owning session', async () => {
    getConversationAccount.mockResolvedValue({ id: 10, whatsappAccountId: 2 });
    registryGetOrCreate.mockReturnValue(fakeManager(2, 'connected'));

    await expect(
      resolveConversationAccountContext({
        conversationId: 10,
        workspaceId: 1,
        requestedAccountId: null,
        operation: 'revoke',
        requireConnected: true,
      }),
    ).resolves.toMatchObject({ accountId: 2 });
  });
});
