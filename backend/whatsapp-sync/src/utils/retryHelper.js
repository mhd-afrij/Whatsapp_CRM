import { logger } from "../config/logger.js";

/**
 * Execute a function with retry logic.
 * @param {Function} fn - Async function to execute
 * @param {{ maxRetries?: number, delayMs?: number, label?: string }} options
 * @returns {Promise<*>}
 */
export async function withRetry(fn, { maxRetries = 3, delayMs = 1000, label = "operation" } = {}) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries) {
        const backoff = delayMs * Math.pow(2, attempt - 1);
        logger.warn({ attempt, maxRetries, err: error, label }, `retrying ${label} after ${backoff}ms`);
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }
  }

  logger.error({ maxRetries, err: lastError, label }, `${label} failed after ${maxRetries} attempts`);
  throw lastError;
}
