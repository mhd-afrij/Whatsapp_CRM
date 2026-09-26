import { logger } from '../lib/logger';
import { emitMessageCreated } from '../lib/socket-server';
import { notifyNewMessage } from '../lib/laravel-client';
import { normalizeInboundMessage } from './message-normalizer';
import { normalizePhoneToJid } from './jid';
import { MessageRepository, isDuplicateEntryError } from './message-repository';
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
 */
function logIdentityResolution(params: {
  workspaceId: number;
  whatsappMessageId: string;
  waJid: string;
  contact: { id: number; created: boolean };
  conversation: { id: number; created: boolean };
}): void {
  const { workspaceId, whatsappMessageId, waJid, contact, conversation } = params;
  const isPhoneJid = waJid.endsWith('@s.whatsapp.net');
  const phoneReceived = isPhoneJid ? (waJid.split('@')[0] ?? null) : null;

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
      phone_received: phoneReceived,
      normalized_phone: normalizedPhone,
      contact_found: !contact.created,
      contact_id: contact.id,
      conversation_found: !conversation.created,
      conversation_id: conversation.id,
      action: conversation.created ? 'create_new_conversation' : 'reuse_existing_conversation',
      workspaceId,
      whatsappMessageId,
      waJid,
    },
    'Inbound WhatsApp identity resolution',
  );
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
    const waJid = raw.key.remoteJid;
    if (!waJid || waJid === 'status@broadcast' || waJid.endsWith('@broadcast')) {
      return { status: 'skipped' };
    }

    const result = normalizeInboundMessage(raw);

    if (!result.ok) {
      // Protocol sync signals, empty stanzas, or undecryptable tokens: skip silently
      if (result.isInternal) {
        return { status: 'skipped' };
      }
      logger.warn({ workspaceId, whatsappMessageId, reason: result.reason }, 'Recording unsupported message');
      try {
        const contact = await repository.findOrCreateWhatsappContact(workspaceId, waJid, raw.pushName ?? null);
        const conversation = await repository.findOrCreateConversation(workspaceId, contact.id, accountId);
        logIdentityResolution({ workspaceId, whatsappMessageId, waJid, contact, conversation });
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
    const contact = await repository.findOrCreateWhatsappContact(workspaceId, waJid, raw.pushName ?? null);
    const conversation = await repository.findOrCreateConversation(workspaceId, contact.id, accountId);
    logIdentityResolution({ workspaceId, whatsappMessageId, waJid, contact, conversation });

    let insertResult: { messageId: number } | null = null;
    try {
      if (isFromMe) {
        insertResult = await repository.insertOutboundMessage(workspaceId, conversation.id, {
          whatsappMessageId,
          body: result.normalized.body,
          messageType: result.normalized.messageType,
          repliedToWhatsappMessageId: result.normalized.repliedToWhatsappMessageId,
          status: 'delivered',
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
          status: isFromMe ? 'delivered' : 'sent',
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
