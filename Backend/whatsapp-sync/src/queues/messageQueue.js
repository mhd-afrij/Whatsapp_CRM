import { Queue } from "bullmq";
import { logger } from "../config/logger.js";

let messageQueue = null;

/**
 * Initialize the message queue.
 * @param {{ host: string, port: number }} redisConfig
 * @returns {Queue}
 */
export function initMessageQueue(redisConfig) {
  messageQueue = new Queue("whatsapp-messages", {
    connection: {
      host: redisConfig.host,
      port: redisConfig.port,
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
    },
  });

  logger.info("message queue initialized");
  return messageQueue;
}

/**
 * Get the message queue instance.
 * @returns {Queue|null}
 */
export function getMessageQueue() {
  return messageQueue;
}
