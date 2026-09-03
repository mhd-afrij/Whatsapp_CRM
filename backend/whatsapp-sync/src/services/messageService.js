import { extractMessageBody, extractMediaType, extractTimestamp } from "../utils/messageParser.js";

/**
 * Process an incoming Baileys message into our standard format.
 * @param {object} msg - Baileys message from messages.upsert
 * @returns {import("./baileysService.js").IncomingMessage|null}
 */
export function processIncomingMessage(msg) {
  if (msg.key?.fromMe) return null;

  const body = extractMessageBody(msg.message);
  if (!body) return null;

  return {
    from: msg.key?.remoteJid ?? "unknown",
    body,
    waMessageId: msg.key?.id ?? null,
    timestamp: extractTimestamp(msg.message),
  };
}

/**
 * Format a phone number for display.
 * @param {string} phone
 * @returns {string}
 */
export function formatPhoneForDisplay(phone) {
  return phone.startsWith("+") ? phone : `+${phone}`;
}
