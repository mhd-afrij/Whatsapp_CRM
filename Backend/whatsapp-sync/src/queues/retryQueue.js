import { Queue } from "bullmq";
import { logger } from "../config/logger.js";

let retryQueue = null;

/**
 * Initialize the retry queue.
 * @param {{ host: string, port: number }} redisConfig
 * @returns {Queue}
 */
export function initRetryQueue(redisConfig) {
  retryQueue = new Queue("whatsapp-retry", {
    connection: {
      host: redisConfig.host,
      port: redisConfig.port,
    },
    defaultJobOptions: {
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
    },
  });

  logger.info("retry queue initialized");
  return retryQueue;
}

/**
 * Get the retry queue instance.
 * @returns {Queue|null}
 */
export function getRetryQueue() {
  return retryQueue;
}
