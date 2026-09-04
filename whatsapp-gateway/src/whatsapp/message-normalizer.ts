import type { BaileysRawMessage } from './baileys-socket';
import type { MessageType, NormalizedInboundMessage } from './message-repository';

const MEDIA_TYPE_MAP: Record<string, MessageType> = {
  imageMessage: 'image',
  videoMessage: 'video',
  audioMessage: 'audio',
  documentMessage: 'document',
  stickerMessage: 'sticker',
};

interface MediaLikeContent {
  mimetype?: string;
  fileLength?: number | string;
  caption?: string;
}

function extractQuotedId(message: Record<string, unknown>): string | null {
  for (const key of Object.keys(message)) {
    const content = message[key] as { contextInfo?: { stanzaId?: string | null } } | undefined;
    if (content?.contextInfo?.stanzaId) {
      return content.contextInfo.stanzaId;
    }
  }
  return null;
}

function unwrapMessage(rawMessage: Record<string, unknown>): Record<string, unknown> {
  let message = rawMessage;
  for (let depth = 0; depth < 5; depth++) {
    const next =
      (message.viewOnceMessage as { message?: Record<string, unknown> } | undefined)?.message ??
      (message.viewOnceMessageV2 as { message?: Record<string, unknown> } | undefined)?.message ??
      (message.viewOnceMessageV2Extension as { message?: Record<string, unknown> } | undefined)?.message ??
      (message.ephemeralMessage as { message?: Record<string, unknown> } | undefined)?.message ??
      (message.documentWithCaptionMessage as { message?: Record<string, unknown> } | undefined)?.message ??
      (message.editedMessage as { message?: Record<string, unknown> } | undefined)?.message ??
      (message.deviceSentMessage as { message?: Record<string, unknown> } | undefined)?.message;
    if (next && typeof next === 'object') {
      message = next;
    } else {
      break;
    }
  }
  return message;
}

/**
 * Normalizes a raw Baileys message into the shape MessageRepository expects,
 * or returns `{ ok: false, isInternal: true }` for internal protocol sync events,
 * or `{ ok: false, reason: '...' }` for unhandled types.
 */
export function normalizeInboundMessage(
  raw: BaileysRawMessage,
):
  | { ok: true; normalized: NormalizedInboundMessage }
  | { ok: false; isInternal?: boolean; reason: string } {
  const whatsappMessageId = raw.key.id ?? null;
  const waJid = raw.key.remoteJid ?? null;

  if (!whatsappMessageId || !waJid) {
    return { ok: false, isInternal: true, reason: 'missing key.id or key.remoteJid' };
  }

  const rawMessage = raw.message ?? {};
  const message = unwrapMessage(rawMessage);
  const tsRaw = raw.messageTimestamp;
  const sentAt = tsRaw
    ? new Date((typeof tsRaw === 'string' ? parseInt(tsRaw, 10) : tsRaw) * 1000)
    : new Date();

  const repliedToWhatsappMessageId = extractQuotedId(message);

  if (typeof message.conversation === 'string') {
    return {
      ok: true,
      normalized: {
        whatsappMessageId,
        waJid,
        pushName: raw.pushName ?? null,
        messageType: 'text',
        body: message.conversation,
        repliedToWhatsappMessageId,
        sentAt,
      },
    };
  }

  const extendedText = message.extendedTextMessage as { text?: string } | undefined;
  if (extendedText?.text) {
    return {
      ok: true,
      normalized: {
        whatsappMessageId,
        waJid,
        pushName: raw.pushName ?? null,
        messageType: 'text',
        body: extendedText.text,
        repliedToWhatsappMessageId,
        sentAt,
      },
    };
  }

  for (const [key, messageType] of Object.entries(MEDIA_TYPE_MAP)) {
    const content = message[key] as MediaLikeContent | undefined;
    if (content) {
      const fileLength =
        content.fileLength !== undefined
          ? typeof content.fileLength === 'string'
            ? parseInt(content.fileLength, 10)
            : content.fileLength
          : null;

      return {
        ok: true,
        normalized: {
          whatsappMessageId,
          waJid,
          pushName: raw.pushName ?? null,
          messageType,
          body: content.caption ?? null,
          repliedToWhatsappMessageId,
          media: { mimeType: content.mimetype ?? 'application/octet-stream', fileSizeBytes: fileLength },
          sentAt,
        },
      };
    }
  }

  const location = message.locationMessage as
    | { degreesLatitude?: number; degreesLongitude?: number; name?: string; address?: string }
    | undefined;
  if (location && typeof location.degreesLatitude === 'number' && typeof location.degreesLongitude === 'number') {
    const label = [location.name, location.address].filter(Boolean).join(' - ');
    return {
      ok: true,
      normalized: {
        whatsappMessageId,
        waJid,
        pushName: raw.pushName ?? null,
        messageType: 'location',
        body: `${location.degreesLatitude},${location.degreesLongitude}${label ? ` (${label})` : ''}`,
        repliedToWhatsappMessageId,
        sentAt,
      },
    };
  }

  const singleContact = message.contactMessage as { displayName?: string } | undefined;
  if (singleContact) {
    return {
      ok: true,
      normalized: {
        whatsappMessageId,
        waJid,
        pushName: raw.pushName ?? null,
        messageType: 'contact_card',
        body: singleContact.displayName ?? null,
        repliedToWhatsappMessageId,
        sentAt,
      },
    };
  }

  const contactsArray = message.contactsArrayMessage as
    | { displayName?: string; contacts?: { displayName?: string }[] }
    | undefined;
  if (contactsArray) {
    const names = (contactsArray.contacts ?? []).map((c) => c.displayName).filter(Boolean);
    return {
      ok: true,
      normalized: {
        whatsappMessageId,
        waJid,
        pushName: raw.pushName ?? null,
        messageType: 'contact_card',
        body: contactsArray.displayName ?? (names.length > 0 ? names.join(', ') : null),
        repliedToWhatsappMessageId,
        sentAt,
      },
    };
  }

  const buttonsResponse = message.buttonsResponseMessage as
    | { selectedDisplayText?: string; selectedButtonId?: string }
    | undefined;
  if (buttonsResponse?.selectedDisplayText || buttonsResponse?.selectedButtonId) {
    return {
      ok: true,
      normalized: {
        whatsappMessageId,
        waJid,
        pushName: raw.pushName ?? null,
        messageType: 'text',
        body: buttonsResponse.selectedDisplayText ?? buttonsResponse.selectedButtonId ?? '',
        repliedToWhatsappMessageId,
        sentAt,
      },
    };
  }

  const listResponse = message.listResponseMessage as
    | { title?: string; singleSelectReply?: { selectedRowId?: string } }
    | undefined;
  if (listResponse?.title) {
    return {
      ok: true,
      normalized: {
        whatsappMessageId,
        waJid,
        pushName: raw.pushName ?? null,
        messageType: 'text',
        body: listResponse.title,
        repliedToWhatsappMessageId,
        sentAt,
      },
    };
  }

  if (message.reactionMessage) {
    return { ok: false, isInternal: true, reason: 'reaction_message' };
  }

  if (message.protocolMessage) {
    return { ok: false, isInternal: true, reason: 'protocol_message' };
  }

  // Internal protocol sync messages — never persist as chat messages
  if (
    message.senderKeyDistributionMessage ||
    message.keyExchangeMessage ||
    message.historySyncNotification ||
    message.appStateSyncKeyShare ||
    message.appStateFatalExceptionNotification ||
    message.enc
  ) {
    return { ok: false, isInternal: true, reason: 'protocol_message' };
  }

  if (Object.keys(message).length === 0) {
    return { ok: false, isInternal: true, reason: 'unsupported message kind: empty' };
  }

  return { ok: false, reason: `unsupported message kind: ${Object.keys(message).join(',')}` };
}
