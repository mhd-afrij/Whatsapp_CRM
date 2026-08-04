import { logger } from '../lib/logger';
import { emitMessageUpdated, emitConversationRead } from '../lib/socket-server';
import { MessageRepository, type MessageStatus } from './message-repository';
import type { BaileysMessageUpdate } from './baileys-socket';

const repository = new MessageRepository();

// Baileys WAMessageStatus: 0 ERROR, 1 PENDING, 2 SERVER_ACK ("sent"), 3 DELIVERY_ACK ("delivered"), 4 READ
const STATUS_CODE_MAP: Record<number, MessageStatus> = {
  0: 'failed',
  2: 'sent',
  3: 'delivered',
  4: 'read',
};

export async function handleMessagesUpdate(
  workspaceId: number,
  updates: BaileysMessageUpdate[],
): Promise<void> {
  for (const update of updates) {
    await processOneStatusUpdate(workspaceId, update);
  }
}

async function processOneStatusUpdate(workspaceId: number, update: BaileysMessageUpdate): Promise<void> {
  const whatsappMessageId = update.key.id;
  const statusCode = update.update.status;
  if (!whatsappMessageId || statusCode === undefined || !(statusCode in STATUS_CODE_MAP)) return;

  const status = STATUS_CODE_MAP[statusCode];

  try {
    const message = await repository.findMessageByWhatsappId(workspaceId, whatsappMessageId);
    if (!message) return;

    await repository.updateMessageStatus(message.id, status);
    await repository.insertMessageStatusEvent(message.id, status, update.update as Record<string, unknown>);

    emitMessageUpdated(workspaceId, message.conversation_id, {
      messageId: message.id,
      changes: { status },
    });

    if (status === 'read') {
      emitConversationRead(workspaceId, message.conversation_id, {
        conversationId: message.conversation_id,
        readAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    logger.error({ err, whatsappMessageId }, 'Failed to process message status update');
    await repository
      .recordProcessingFailure(workspaceId, 'persist', err instanceof Error ? err.message : String(err), {
        whatsappMessageId,
      })
      .catch(() => undefined);
  }
}
