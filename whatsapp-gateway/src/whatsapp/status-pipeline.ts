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

// Monotonic lifecycle (see docs); receipts must never regress a message
// (e.g. an out-of-order READ arriving after a late DELIVERY_ACK).
const STATUS_RANK: Record<MessageStatus, number> = {
  queued: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4,
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

    // Read receipts only apply to messages we sent; inbound rows never show a
    // tick and Baileys may still surface status changes for them.
    if (message.direction !== 'outbound') return;

    // Ignore anything that isn't a strict forward move (failed is terminal).
    if (status !== 'failed' && STATUS_RANK[status] <= STATUS_RANK[message.status]) return;

    const occurredAt = new Date();
    await repository.updateMessageStatus(message.id, status, occurredAt);
    await repository.insertMessageStatusEvent(message.id, status, update.update as Record<string, unknown>);

    const changes: Record<string, unknown> = { status };
    if (status === 'delivered') changes.delivered_at = occurredAt.toISOString();
    if (status === 'read') changes.read_at = occurredAt.toISOString();

    emitMessageUpdated(workspaceId, message.conversation_id, {
      messageId: message.id,
      changes,
    });

    if (status === 'read') {
      emitConversationRead(workspaceId, message.conversation_id, {
        conversationId: message.conversation_id,
        readAt: occurredAt.toISOString(),
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
