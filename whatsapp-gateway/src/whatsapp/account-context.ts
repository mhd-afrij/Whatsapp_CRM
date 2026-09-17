import { z } from 'zod';
import { connectionManager, connectionRegistry } from './manager-instance';
import type { ConnectionManager } from './connection-manager';
import type { IBaileysSocket } from './baileys-socket';
import { MessageRepository } from './message-repository';
import { logger } from '../lib/logger';

/**
 * Stable, frontend-safe error codes for account resolution failures
 * (see docs/EVENT_CATALOG.md / the Phase-16 error contract). The gateway
 * never leaks Baileys internals through these - only the classification
 * Laravel needs to map onto its API responses.
 */
export type AccountErrorCode =
  | 'ACCOUNT_ID_REQUIRED'
  | 'ACCOUNT_NOT_FOUND'
  | 'ACCOUNT_NOT_CONNECTED'
  | 'ACCOUNT_OWNERSHIP_MISMATCH'
  | 'CONVERSATION_NOT_FOUND';

const ACCOUNT_ERROR_HTTP_STATUS: Record<AccountErrorCode, number> = {
  ACCOUNT_ID_REQUIRED: 400,
  ACCOUNT_NOT_FOUND: 404,
  ACCOUNT_NOT_CONNECTED: 409,
  ACCOUNT_OWNERSHIP_MISMATCH: 409,
  CONVERSATION_NOT_FOUND: 404,
};

/**
 * Thrown by the account-context resolvers when an operation cannot be
 * routed safely to a specific WhatsApp account. Carries a stable `code`
 * (never a Baileys stack trace) plus the ids involved so the internal-API
 * caller can log/aggregate without parsing messages.
 */
export class AccountContextError extends Error {
  readonly code: AccountErrorCode;
  readonly httpStatus: number;
  readonly details: Record<string, unknown>;

  constructor(code: AccountErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'AccountContextError';
    this.code = code;
    this.httpStatus = ACCOUNT_ERROR_HTTP_STATUS[code];
    this.details = details;
  }
}

/**
 * The typed execution context for one WhatsApp operation. Everything
 * account-sensitive (send, media, revoke, reaction, presence, forward,
 * queue processing) resolves one of these instead of touching the
 * registry/legacy singletons directly, so an operation can never
 * accidentally execute against another workspace's or another account's
 * Baileys session.
 */
export interface WhatsAppAccountContext {
  accountId: number;
  workspaceId: number;
  /** The ConnectionManager that owns this account's Baileys session. */
  manager: ConnectionManager;
  /** The live Baileys socket, or null while the session is not connected. */
  socket: IBaileysSocket | null;
}

const accountIdSchema = z.coerce.number().int().positive();

const conversationRepository = new MessageRepository();

/**
 * Resolves the execution context for an explicitly-addressed account.
 *
 * Responsibilities (Phase 5.1):
 *  1. Validate the account id.
 *  2. Resolve (creating, without starting a socket) the account's
 *     ConnectionManager from ConnectionManagerRegistry.
 *  3. Verify the manager actually belongs to the requested account.
 *  4. Expose the live Baileys socket (null while disconnected).
 *  5. Throw a stable AccountContextError on any failure - never fall back
 *     to another account's manager.
 */
export function resolveAccountContext(workspaceId: number, accountId: unknown): WhatsAppAccountContext {
  const parsed = accountIdSchema.safeParse(accountId);
  if (!parsed.success) {
    throw new AccountContextError(
      'ACCOUNT_ID_REQUIRED',
      'A valid WhatsApp accountId is required for this operation',
      { workspaceId, requestedAccountId: accountId ?? null },
    );
  }

  const manager = connectionRegistry.getOrCreate(workspaceId, parsed.data);
  const managerAccountId = manager.getSnapshot().accountId;
  if (managerAccountId !== parsed.data) {
    // Defensive: the registry is keyed by workspace:accountId, so this can
    // only happen if a future refactor breaks keying - refuse loudly rather
    // than routing through the wrong account.
    throw new AccountContextError(
      'ACCOUNT_NOT_FOUND',
      'Resolved manager does not belong to the requested account',
      { workspaceId, accountId: parsed.data, managerAccountId },
    );
  }

  return {
    accountId: parsed.data,
    workspaceId,
    manager,
    socket: manager.getSocket(),
  };
}

/**
 * Resolves the execution context for an operation on a conversation
 * (Phase 5.4 - conversation ownership enforcement).
 *
 * The conversation row's `whatsapp_account_id` is the single source of
 * truth for which account OWNS the conversation. A caller-supplied
 * accountId is allowed only when it agrees with that owner; a conflicting
 * id is rejected instead of being routed through the wrong account.
 *
 * Legacy compatibility (Phase 5.3): conversations created before
 * multi-account support may carry a NULL owner. For those, the caller's
 * explicit accountId is honored when present, and when it is absent the
 * request falls back to the legacy workspace manager - with a structured
 * deprecation warning so the remaining compat surface stays observable.
 * New conversations always carry an owner, so this fallback cannot grow.
 */
export async function resolveConversationAccountContext(params: {
  conversationId: number;
  workspaceId: number;
  /** Caller-supplied accountId, if any (null when the caller didn't send one). */
  requestedAccountId: number | null;
  /** Short operation label used in logs (e.g. 'send', 'revoke'). */
  operation: string;
  /**
   * When true the account's Baileys session must currently be connected -
   * used by direct-socket operations (typing, revoke, reaction, forward).
   * Queue-dispatched operations leave this false and enforce connectivity
   * at send time instead.
   */
  requireConnected?: boolean;
}): Promise<WhatsAppAccountContext> {
  const { conversationId, workspaceId, requestedAccountId, operation } = params;
  const requireConnected = params.requireConnected ?? false;

  const conversation = await conversationRepository.getConversationAccount(conversationId, workspaceId);
  if (!conversation) {
    throw new AccountContextError(
      'CONVERSATION_NOT_FOUND',
      'Conversation not found in workspace',
      { workspaceId, conversationId, operation },
    );
  }

  const conversationAccountId = conversation.whatsappAccountId;

  if (conversationAccountId !== null && requestedAccountId !== null && requestedAccountId !== conversationAccountId) {
    // The conversation belongs to account A but the caller asked for B.
    // Never route it through B - reject with a stable conflict error.
    logger.warn(
      { workspaceId, conversationId, conversationAccountId, requestedAccountId, operation },
      'Rejected operation: caller accountId does not match the conversation owner',
    );
    throw new AccountContextError(
      'ACCOUNT_OWNERSHIP_MISMATCH',
      `Conversation is owned by WhatsApp account ${conversationAccountId}, not ${requestedAccountId}`,
      { workspaceId, conversationId, conversationAccountId, requestedAccountId, operation },
    );
  }

  let effectiveAccountId: number | null = conversationAccountId ?? requestedAccountId;
  let manager: ConnectionManager;

  if (effectiveAccountId !== null) {
    manager = connectionRegistry.getOrCreate(workspaceId, effectiveAccountId);
  } else {
    // Controlled legacy path: pre-multi-account conversation with no owner
    // and no explicit accountId in the request. Intentionally retained for
    // old conversations; every use is logged for deprecation tracking.
    logger.warn(
      { workspaceId, conversationId, operation, event: 'legacy_account_fallback' },
      'Conversation has no whatsapp_account_id and no accountId was supplied; routing through the legacy workspace manager (deprecated)',
    );
    manager = connectionManager;
    effectiveAccountId = null;
  }

  if (requireConnected) {
    const status = manager.getSnapshot().status;
    if (status !== 'connected') {
      throw new AccountContextError(
        'ACCOUNT_NOT_CONNECTED',
        `WhatsApp account ${effectiveAccountId ?? '(legacy)'} is not connected (status=${String(status)})`,
        { workspaceId, conversationId, accountId: effectiveAccountId, status: String(status), operation },
      );
    }
  }

  return {
    accountId: effectiveAccountId as number,
    workspaceId,
    manager,
    socket: manager.getSocket(),
  };
}
