import { logger } from "../config/logger.js";

/**
 * Notify the Laravel API via internal webhook.
 * @param {object} options
 * @param {string} options.baseUrl - Laravel API base URL
 * @param {string} options.secret - Service-to-service secret
 * @param {string} options.path - Webhook path (e.g., "/internal/whatsapp/session")
 * @param {unknown} options.body - Request body
 */
export async function notifyLaravel({ baseUrl, secret, path, body }) {
  if (!secret) return;

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": secret,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      logger.warn({ path, status: response.status }, "laravel webhook call failed");
    }
  } catch (error) {
    logger.warn({ err: error, path }, "laravel webhook call errored");
  }
}
