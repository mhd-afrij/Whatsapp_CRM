import { logger } from '../lib/logger';
import { emitMessageCreated } from '../lib/socket-server';
import { notifyNewMessage } from '../lib/laravel-client';
import { normalizeInboundMessage } from './message-normalizer';
import { normalizePhoneToJid, phoneFromJid, resolveCanonicalJid } from './jid';
import { MessageRepository, isDuplicateEntryError, type MessageStatus } from './message-repository';
import { enqueueMediaDownload } from '../queues/media-download.queue';
import type { BaileysMessagesUpsert, BaileysRawMessage } from './baileys-socket';

const repository = new MessageRepository();

/**
 * Result of persisting one raw Baileys message. The live `messages.upsert`
 * handler ignores these, but the history-import coordinator (history-sync.ts)
 * consumes them to track sync progress (inserted/duplicate/skipped/failed).
 */
export type MessageProcessOutcome =
  | { status: 'inserted' }
  | { status: 'duplicate' }
  | { status: 'skipped' }
  | { status: 'unsupported' }
  | { status: 'failed'; error?: string };

export interface ProcessOneMessageOptions {
  /**
   * Whether this message is a live realtime message (`messages.upsert`) or a
   * batch import (messaging-history.set). History imports are not "new":
   * they must not bump conversation unread counters and do not fan a
   * `message.created` socket event out per row - the open inbox sees imported
   * chats via sync.progress/sync.completed-triggered refetches instead of a
   * thousands-of-events flood. Defaults to true (live).
   */
  live?: boolean;
}

/**
 * Spec §7 debugging log: one structured line per inbound message documenting
 * how the phone-number identity resolved (contact found? conversation reused?).
 * The pushName/profile name is deliberately ABSENT as a matching key - the
 * normalized phone number is the only identity (spec §1).
 *
 * Carries every field needed to audit identity resolution end to end: the raw
 * jid WhatsApp sent, the canonical jid/normalized phone it resolved to, the
 * workspace + account, and the contact/conversation/message ids the row landed
 * on. Verifying "every message for one WhatsApp identity resolves to the same
 * contact_id and conversation_id" is a grep over these lines.
 */
function logIdentityResolution(params: {
  workspaceId: number;
  accountId: number | null;
  whatsappMessageId: string;
  rawJid: string;
  canonicalJid: string;
  contact: { id: number; created: boolean };
  conversation: { id: number; created: boolean };
  messageId: number | null;
  direction: 'inbound' | 'outbound';
}): void {
  const { workspaceId, accountId, whatsappMessageId, rawJid, canonicalJid, contact, conversation, messageId, direction } =
    params;
  // The canonical phone the identity actually keyed on (raw_jid keeps the digits
  // exactly as WhatsApp sent them).
  const phoneReceived = phoneFromJid(canonicalJid);

  let normalizedPhone: string | null = null;
  if (phoneReceived) {
    try {
      normalizedPhone = normalizePhoneToJid(phoneReceived).split('@')[0] ?? null;
    } catch {
      normalizedPhone = null;
    }
  }

  logger.info(
    {
      raw_jid: rawJid,
      canonical_jid: canonicalJid,
      phone_received: phoneReceived,
      normalized_phone: normalizedPhone,
      contact_found: !contact.created,
      resolved_contact_id: contact.id,
      conversation_found: !conversation.created,
      resolved_conversation_id: conversation.id,
      message_id: messageId,
      direction,
      workspace_id: workspaceId,
      whatsapp_account_id: accountId,
      action: conversation.created ? 'create_new_conversation' : 'reuse_existing_conversation',
      workspaceId,
      whatsappMessageId,
      waJid: canonicalJid,
    },
    'Inbound WhatsApp identity resolution',
  );
}

/**
 * Resolves the whatsapp_contact for one message's canonical jid, first
 * persisting any newly-learned `@lid` -> phone alias.
 *
 * Persisting the alias (rather than only using senderPn for this one message)
 * is what makes the identity durable: a later message from the same person may
 * carry no senderPn, and without the alias it would fall back to the `@lid`
 * remoteJid and strand a second row/conversation all over again. setLidJid
 * also folds any conversation already stranded on the LID row, so a thread that
 * was split before this fix is reunited on the next message.
 *
 * Best-effort: a failure to persist the alias must not drop the message, so the
 * contact lookup proceeds either way.
 */
async function resolveContact(
  workspaceId: number,
  canonicalJid: string,
  lidJid: string | null,
  pushName: string | null,
): Promise<{ id: number; created: boolean }> {
  if (lidJid) {
    try {
      await repository.setLidJid(workspaceId, canonicalJid, lidJid);
    } catch (err) {
      logger.warn({ err, workspaceId, canonicalJid, lidJid }, 'Failed to persist LID alias; continuing with senderPn identity');
    }
  }
  return repository.findOrCreateWhatsappContact(workspaceId, canonicalJid, pushName);
}

/**
 * Normalizes and persists a single inbound/historical WhatsApp message. Never
 * throws for one bad message: per-message failures are logged (and recorded in
 * message_processing_failures where applicable) and reported via the returned
 * outcome so batch callers can count them.
 */
export async function processOneMessage(
  workspaceId: number,
  raw: BaileysRawMessage,
  options: ProcessOneMessageOptions = {},
  accountId: number | null = null,
): Promise<MessageProcessOutcome> {
  const live = options.live ?? true;
  const whatsappMessageId = raw.key.id ?? 'unknown';

  try {
    const rawJid = raw.key.remoteJid;
    if (!rawJid || rawJid === 'status@broadcast' || rawJid.endsWith('@broadcast')) {
      return { status: 'skipped' };
    }

    // Identity first, before anything reads the jid: the canonical jid is the
    // sender's real phone jid (key.senderPn) when available, falling back to
    // remoteJid. An @lid alias never becomes an identity of its own.
    const { jid: waJid, lidJid } = resolveCanonicalJid(raw);

    const result = normalizeInboundMessage(raw);

    if (!result.ok) {
      // Protocol sync signals, empty stanzas, or undecryptable tokens: skip silently
      if (result.isInternal) {
        return { status: 'skipped' };
      }
      logger.warn({ workspaceId, whatsappMessageId, reason: result.reason }, 'Recording unsupported message');
      try {
        const contact = await resolveContact(workspaceId, waJid, lidJid, raw.pushName ?? null);
        const conversation = await repository.findOrCreateConversation(workspaceId, contact.id, accountId);
        const inserted = await repository.insertInboundMessage(
          workspaceId,
          conversation.id,
          {
            whatsappMessageId,
            waJid,
            pushName: raw.pushName ?? null,
            messageType: 'unsupported',
            body: null,
            sentAt: new Date(),
          },
          { incrementUnread: live },
        );
        logIdentityResolution({
          workspaceId,
          accountId,
          whatsappMessageId,
          rawJid,
          canonicalJid: waJid,
          contact,
          conversation,
          messageId: inserted?.messageId ?? null,
          direction: 'inbound',
        });
        if (!inserted) {
          return { status: 'duplicate' };
        }
      } catch (err) {
        if (isDuplicateEntryError(err)) {
          return { status: 'duplicate' };
        }
        logger.warn({ err }, 'Failed to insert unsupported message placeholder');
        return { status: 'failed', error: err instanceof Error ? err.message : String(err) };
      }
      await repository.recordProcessingFailure(workspaceId, 'persist', `Unsupported message: ${result.reason}`, {
        whatsappMessageId,
      });
      return { status: 'unsupported' };
    }

    const isFromMe = Boolean(raw.key.fromMe);
    const contact = await resolveContact(workspaceId, waJid, lidJid, raw.pushName ?? null);
    const conversation = await repository.findOrCreateConversation(workspaceId, contact.id, accountId);

    let insertResult: { messageId: number; status: MessageStatus } | null = null;
    try {
      if (isFromMe) {
        // No status is asserted here. A message echoed back through
        // messages.upsert (sent from another linked device, or pulled by
        // history sync) carries no receipt in the upsert payload, so the row
        // stays 'queued' until a real Baileys messages.update advances it.
        insertResult = await repository.insertOutboundMessage(workspaceId, conversation.id, {
          whatsappMessageId,
          body: result.normalized.body,
          messageType: result.normalized.messageType,
          repliedToWhatsappMessageId: result.normalized.repliedToWhatsappMessageId,
          sentAt: result.normalized.sentAt,
        }, accountId);
      } else {
        insertResult = await repository.insertInboundMessage(
          workspaceId,
          conversation.id,
          result.normalized,
          { incrementUnread: live },
          accountId,
        );
      }
    } catch (err) {
      if (isDuplicateEntryError(err)) {
        return { status: 'duplicate' }; // Idempotent no-op
      }
      throw err;
    }

    if (!insertResult) return { status: 'duplicate' };

    logIdentityResolution({
      workspaceId,
      accountId,
      whatsappMessageId,
      rawJid,
      canonicalJid: waJid,
      contact,
      conversation,
      messageId: insertResult.messageId,
      direction: isFromMe ? 'outbound' : 'inbound',
    });

    if (result.normalized.media && !isFromMe) {
      await enqueueMediaDownload({
        workspaceId,
        accountId,
        messageId: insertResult.messageId,
        whatsappMessageId,
        rawMessage: raw,
        mimeType: result.normalized.media.mimeType,
        expectedSizeBytes: result.normalized.media.fileSizeBytes,
      });
    }

    if (live) {
      emitMessageCreated(workspaceId, conversation.id, {
        message: {
          id: insertResult.messageId,
          conversationId: conversation.id,
          accountId,
          direction: isFromMe ? 'outbound' : 'inbound',
          messageType: result.normalized.messageType,
          body: result.normalized.body,
          status: insertResult.status,
          senderType: isFromMe ? 'user' : 'contact',
          sentAt: result.normalized.sentAt.toISOString(),
        },
        conversation: {
          id: conversation.id,
          lastMessagePreview: (result.normalized.body ?? `[${result.normalized.messageType}]`).slice(0, 255),
        },
      });

      // Realtime bell notification (best-effort, fire-and-forget): only for
      // live inbound messages, never for outbound sends (the requesting agent
      // doesn't need a "new message" bell about their own actions) and never
      // for history imports (those aren't "new" - see ProcessOneMessageOptions).
      if (!isFromMe) {
        void notifyNewMessage({
          workspaceId,
          conversationId: conversation.id,
          messageId: insertResult.messageId,
          messageType: result.normalized.messageType,
          preview: (result.normalized.body ?? `[${result.normalized.messageType}]`).slice(0, 255),
        });
      }
    }

    return { status: 'inserted' };
  } catch (err) {
    logger.error({ err, whatsappMessageId }, 'Inbound/historical message processing failure');
    return { status: 'failed', error: err instanceof Error ? err.message : String(err) };
  }
}

/** Handles live inbound messages or batch appends from Baileys. */
export async function handleMessagesUpsert(
  workspaceId: number,
  payload: BaileysMessagesUpsert,
  accountId: number | null = null,
): Promise<void> {
  if (payload.type !== 'notify' && payload.type !== 'append') return;

  for (const raw of payload.messages) {
    await processOneMessage(workspaceId, raw, { live: true }, accountId);
  }
}
