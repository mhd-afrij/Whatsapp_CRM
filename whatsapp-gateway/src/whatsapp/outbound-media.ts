import { Readable } from 'node:stream';

/**
 * Pure helpers for sending media outbound via Baileys. Kept outside the
 * send-message worker so the mime->message-type mapping and the Baileys
 * content-object shape can be unit tested without a live socket.
 */

export type OutboundMediaType = 'image' | 'video' | 'audio' | 'document';

export interface OutboundMediaInfo {
  storagePath: string;
  mimeType: string;
  fileName: string | null;
  sizeBytes: number | null;
  checksumSha256: string | null;
}

/** Maps a MIME type to the WhatsApp message_type used by the `messages` table. */
export function resolveMessageType(mimeType: string): OutboundMediaType {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'document';
}

/**
 * Builds the Baileys `AnyMessageContent` for an outbound media send from the
 * already-downloaded bytes. Uses `stream` (not `url`) so the gateway never
 * depends on the storage backend being reachable from the WhatsApp socket's
 * network namespace, and passes `mimetype` explicitly so Baileys does not
 * sniff the buffer itself.
 */
export function buildBaileysMediaContent(
  mediaType: OutboundMediaType,
  buffer: Buffer,
  info: OutboundMediaInfo,
  caption: string | null,
): Record<string, unknown> {
  const stream = Readable.from(buffer);
  const captionField = caption ? { caption } : {};

  switch (mediaType) {
    case 'image':
      return { image: { stream }, mimetype: info.mimeType, ...captionField };
    case 'video':
      return { video: { stream }, mimetype: info.mimeType, ...captionField };
    case 'audio':
      return { audio: { stream }, mimetype: info.mimeType, ptt: false };
    case 'document':
    default:
      return {
        document: { stream },
        mimetype: info.mimeType,
        fileName: info.fileName || 'document',
        ...captionField,
      };
  }
}
