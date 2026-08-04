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

/**
 * Normalizes a raw Baileys message into the shape MessageRepository expects,
 * or returns `{ unsupported: true }` for message kinds we don't model yet
 * (never silently dropped - the caller records it as an 'unsupported' typed
 * row / processing failure instead).
 */
export function normalizeInboundMessage(
  raw: BaileysRawMessage,
): { ok: true; normalized: NormalizedInboundMessage } | { ok: false; reason: string } {
  const whatsappMessageId = raw.key.id ?? null;
  const waJid = raw.key.remoteJid ?? null;

  if (!whatsappMessageId || !waJid) {
    return { ok: false, reason: 'missing key.id or key.remoteJid' };
  }

  // View-once photos/videos wrap the real content one level deep and won't match
  // MEDIA_TYPE_MAP as-is - unwrap before the rest of this function inspects keys.
  const rawMessage = raw.message ?? {};
  const viewOnceWrapper =
    (rawMessage.viewOnceMessage as { message?: Record<string, unknown> } | undefined) ??
    (rawMessage.viewOnceMessageV2 as { message?: Record<string, unknown> } | undefined) ??
    (rawMessage.viewOnceMessageV2Extension as { message?: Record<string, unknown> } | undefined);
  const message = viewOnceWrapper?.message ?? rawMessage;
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

  if (message.reactionMessage) {
    // Reactions are handled separately (message_reactions), not as a message row.
    return { ok: false, reason: 'reaction_message' };
  }

  if (message.protocolMessage) {
    // Delete-for-everyone / revoke notifications - not modeled as their own message row
    // (see is_deleted_for_everyone on the existing message instead).
    return { ok: false, reason: 'protocol_message' };
  }

  return { ok: false, reason: `unsupported message kind: ${Object.keys(message).join(',') || 'empty'}` };
}
