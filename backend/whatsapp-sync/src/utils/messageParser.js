/**
 * Extract text body from a Baileys message object.
 * @param {object} message - Baileys message
 * @returns {string|null}
 */
export function extractMessageBody(message) {
  if (!message) return null;

  return (
    message.conversation ??
    message.extendedTextMessage?.text ??
    message.imageMessage?.caption ??
    message.videoMessage?.caption ??
    message.documentMessage?.caption ??
    null
  );
}

/**
 * Extract media type from a Baileys message object.
 * @param {object} message - Baileys message
 * @returns {string|null}
 */
export function extractMediaType(message) {
  if (!message) return null;

  if (message.imageMessage) return "image";
  if (message.videoMessage) return "video";
  if (message.audioMessage) return "audio";
  if (message.documentMessage) return "document";
  if (message.stickerMessage) return "sticker";

  return null;
}

/**
 * Get timestamp from a Baileys message.
 * @param {object} message - Baileys message
 * @returns {string} ISO timestamp
 */
export function extractTimestamp(message) {
  const ts = Number(message.messageTimestamp) || Date.now() / 1000;
  return new Date(ts * 1000).toISOString();
}
