import { formatJid } from "../utils/jidFormatter.js";
import { logger } from "../config/logger.js";

/**
 * Send a WhatsApp message.
 * @param {object} options
 * @param {string} options.to - Recipient phone/JID
 * @param {string} options.text - Message text
 * @param {object} options.wa - WhatsApp adapter
 * @returns {Promise<object>} Send response
 */
export async function sendMessage({ to, text, wa }) {
  const jid = to.includes("@") ? to : formatJid(to);

  try {
    const sent = await wa.sendMessage(jid, text);
    return { data: { id: sent.id, to: jid, text }, message: "Message sent." };
  } catch (error) {
    logger.warn({ err: error, jid }, "failed to send whatsapp message");
    throw error;
  }
}
