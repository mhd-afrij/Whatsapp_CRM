import { logger } from '../lib/logger';
import { emitMessageCreated } from '../lib/socket-server';
import { normalizeInboundMessage } from './message-normalizer';
import { MessageRepository, isDuplicateEntryError } from './message-repository';
import { enqueueMediaDownload } from '../queues/media-download.queue';
import type {
  BaileysMessagesUpsert,
  BaileysMessagingHistorySet,
  BaileysRawMessage,
} from './baileys-socket';

const repository = new MessageRepository();

/** Handles live inbound messages or batch appends. */
export async function handleMessagesUpsert(
  workspaceId: number,
  payload: BaileysMessagesUpsert,
): Promise<void> {
  if (payload.type !== 'notify' && payload.type !== 'append') return;

  for (const raw of payload.messages) {
    await processOneMessage(workspaceId, raw);
  }
}

/** Handles full/recent historical message sync from Baileys. */
export async function handleMessagingHistorySet(
  workspaceId: number,
  payload: BaileysMessagingHistorySet,
): Promise<void> {
  if (Array.isArray(payload.contacts) && payload.contacts.length > 0) {
    try {
      const { handleContactsUpsert } = await import('./contacts-pipeline');
      await handleContactsUpsert(workspaceId, payload.contacts);
    } catch (err) {
      logger.error({ err, workspaceId }, 'Error syncing contacts from history sync');
    }
  }

  if (Array.isArray(payload.messages) && payload.messages.length > 0) {
    logger.info({ workspaceId, count: payload.messages.length }, 'Processing historical WhatsApp messages');
    for (const raw of payload.messages) {
      await processOneMessage(workspaceId, raw);
    }
  }
}

async function processOneMessage(workspaceId: number, raw: BaileysRawMessage): Promise<void> {
  const whatsappMessageId = raw.key.id ?? 'unknown';

  try {
    const waJid = raw.key.remoteJid;
    if (!waJid || waJid === 'status@broadcast' || waJid.endsWith('@broadcast')) {
      return;
    }

    const result = normalizeInboundMessage(raw);

    if (!result.ok) {
      // Protocol sync signals, empty stanzas, or undecryptable tokens: skip silently
      if (result.isInternal) {
        return;
      }
      logger.warn({ workspaceId, whatsappMessageId, reason: result.reason }, 'Recording unsupported message');
      try {
        const contact = await repository.findOrCreateWhatsappContact(workspaceId, waJid, raw.pushName ?? null);
        const conversation = await repository.findOrCreateConversation(workspaceId, contact.id);
        await repository.insertInboundMessage(workspaceId, conversation.id, {
          whatsappMessageId,
          waJid,
          pushName: raw.pushName ?? null,
          messageType: 'unsupported',
          body: null,
          sentAt: new Date(),
        });
      } catch (err) {
        if (!isDuplicateEntryError(err)) {
          logger.warn({ err }, 'Failed to insert unsupported message placeholder');
        }
      }
      await repository.recordProcessingFailure(workspaceId, 'persist', `Unsupported message: ${result.reason}`, {
        whatsappMessageId,
      });
      return;
    }

    const isFromMe = Boolean(raw.key.fromMe);
    const contact = await repository.findOrCreateWhatsappContact(workspaceId, waJid, raw.pushName ?? null);
    const conversation = await repository.findOrCreateConversation(workspaceId, contact.id);

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
        });
      } else {
        insertResult = await repository.insertInboundMessage(workspaceId, conversation.id, result.normalized);
      }
    } catch (err) {
      if (isDuplicateEntryError(err)) {
        return; // Idempotent no-op
      }
      throw err;
    }

    if (!insertResult) return;

    if (result.normalized.media && !isFromMe) {
      await enqueueMediaDownload({
        workspaceId,
        messageId: insertResult.messageId,
        whatsappMessageId,
        rawMessage: raw,
        mimeType: result.normalized.media.mimeType,
        expectedSizeBytes: result.normalized.media.fileSizeBytes,
      });
    }

    emitMessageCreated(workspaceId, conversation.id, {
      message: {
        id: insertResult.messageId,
        conversationId: conversation.id,
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
  } catch (err) {
    logger.error({ err, whatsappMessageId }, 'Inbound/historical message processing failure');
  }
}
