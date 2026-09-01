import { Worker } from "bullmq";
import { logger } from "../config/logger.js";

/**
 * Start the media worker.
 * @param {{ host: string, port: number }} redisConfig
 * @returns {Worker|null}
 */
export function startMediaWorker(redisConfig) {
  const worker = new Worker(
    "whatsapp-media",
    async (job) => {
      const { messageId, type } = job.data;
      logger.info({ jobId: job.id, messageId, type }, "processing media job");

      // Placeholder - implement media processing logic
      return { status: "processed" };
    },
    {
      connection: {
        host: redisConfig.host,
        port: redisConfig.port,
      },
    }
  );

  worker.on("completed", (job) => {
    logger.debug({ jobId: job.id }, "media job completed");
  });

  worker.on("failed", (job, error) => {
    logger.error({ jobId: job?.id, err: error }, "media job failed");
  });

  logger.info("media worker started");
  return worker;
}
