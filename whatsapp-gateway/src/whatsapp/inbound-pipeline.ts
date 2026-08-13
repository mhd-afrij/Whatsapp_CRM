import { logger } from '../lib/logger';
import { emitMessageCreated } from '../lib/socket-server';
import { normalizeInboundMessage } from './message-normalizer';
import { MessageRepository, isDuplicateEntryError } from './message-repository';
import { enqueueMediaDownload } from '../queues/media-download.queue';
import type { BaileysMessagesUpsert, BaileysRawMessage } from './baileys-socket';

const repository = new MessageRepository();

export async function handleMessagesUpsert(
  workspaceId: number,
  payload: BaileysMessagesUpsert,
): Promise<void> {
  if (payload.type !== 'notify' && payload.type !== 'append') return;

  for (const raw of payload.messages) {
    if (raw.key.fromMe) continue; // outbound echoes are tracked via the dispatch pipeline instead
    await processOneInboundMessage(workspaceId, raw);
  }
}

async function processOneInboundMessage(workspaceId: number, raw: BaileysRawMessage): Promise<void> {
  const whatsappMessageId = raw.key.id ?? 'unknown';

  try {
    const result = normalizeInboundMessage(raw);

    const waJid = raw.key.remoteJid;
    if (!waJid) {
      await repository.recordProcessingFailure(workspaceId, 'validation', 'Missing remoteJid on inbound message', {
        raw,
      });
      return;
    }

    const contact = await repository.findOrCreateWhatsappContact(workspaceId, waJid, raw.pushName ?? null);
    const conversation = await repository.findOrCreateConversation(workspaceId, contact.id);

    if (!result.ok) {
      // Unsupported/unknown type: still recorded, never silently dropped.
      if (result.reason === 'encrypted_message_undecryptable') {
        logger.warn(
          { workspaceId, whatsappMessageId, waJid: raw.key.remoteJid },
          'Skipping undecryptable Signal Protocol message (missing session or stale pre-key bundle)',
        );
        return;
      }
      logger.warn({ workspaceId, whatsappMessageId, reason: result.reason }, 'Unsupported inbound message type');
      try {
        const inserted = await repository.insertInboundMessage(workspaceId, conversation.id, {
          whatsappMessageId,
          waJid,
          pushName: raw.pushName ?? null,
          messageType: 'unsupported',
          body: null,
          sentAt: new Date(),
        });
        if (!inserted) {
          return; // duplicate, no-op
        }
      } catch (err) {
        if (isDuplicateEntryError(err)) return;
        throw err;
      }
      await repository.recordProcessingFailure(workspaceId, 'persist', `Unsupported message: ${result.reason}`, {
        whatsappMessageId,
      });
      return;
    }

    let insertResult;
    try {
      insertResult = await repository.insertInboundMessage(workspaceId, conversation.id, result.normalized);
    } catch (err) {
      if (isDuplicateEntryError(err)) {
        logger.info({ whatsappMessageId }, 'Duplicate inbound message ignored (idempotent no-op)');
        return;
      }
      throw err;
    }

    if (!insertResult) return;

    if (result.normalized.media) {
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
        direction: 'inbound',
        messageType: result.normalized.messageType,
        body: result.normalized.body,
        status: 'sent',
        senderType: 'contact',
        sentAt: result.normalized.sentAt.toISOString(),
      },
      conversation: {
        id: conversation.id,
        lastMessagePreview: (result.normalized.body ?? `[${result.normalized.messageType}]`).slice(0, 255),
      },
    });
  } catch (err) {
    logger.error({ err, whatsappMessageId }, 'Inbound message pipeline failure');
    try {
      await repository.recordProcessingFailure(
        workspaceId,
        'persist',
        err instanceof Error ? err.message : String(err),
        { whatsappMessageId },
      );
    } catch (recordErr) {
      logger.error({ recordErr }, 'Failed to record message_processing_failures row');
    }
  }
}
