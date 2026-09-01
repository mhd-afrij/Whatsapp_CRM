import { logger } from "../config/logger.js";

/**
 * Download media from a WhatsApp message.
 * @param {object} message - Baileys message with media
 * @param {string} authDir - WhatsApp auth directory
 * @returns {Promise<{buffer: Buffer, mimetype: string, filename: string}|null>}
 */
export async function downloadMedia(message, authDir) {
  // Placeholder - implement when media handling is needed
  logger.debug("media download not yet implemented");
  return null;
}

/**
 * Upload media to WhatsApp.
 * @param {Buffer} buffer - Media buffer
 * @param {string} mimetype - MIME type
 * @returns {Promise<string|null>}
 */
export async function uploadMedia(buffer, mimetype) {
  // Placeholder - implement when media sending is needed
  logger.debug("media upload not yet implemented");
  return null;
}
