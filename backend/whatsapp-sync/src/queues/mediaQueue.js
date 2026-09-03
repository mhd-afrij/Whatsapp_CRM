import { Queue } from "bullmq";
import { logger } from "../config/logger.js";

let mediaQueue = null;

/**
 * Initialize the media queue.
 * @param {{ host: string, port: number }} redisConfig
 * @returns {Queue}
 */
export function initMediaQueue(redisConfig) {
  mediaQueue = new Queue("whatsapp-media", {
    connection: {
      host: redisConfig.host,
      port: redisConfig.port,
    },
    defaultJobOptions: {
      attempts: 2,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
    },
  });

  logger.info("media queue initialized");
  return mediaQueue;
}

/**
 * Get the media queue instance.
 * @returns {Queue|null}
 */
export function getMediaQueue() {
  return mediaQueue;
}
