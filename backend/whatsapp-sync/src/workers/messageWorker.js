import { Worker } from "bullmq";
import { logger } from "../config/logger.js";

/**
 * Start the message worker.
 * @param {{ host: string, port: number }} redisConfig
 * @param {object} wa - WhatsApp adapter
 * @returns {Worker|null}
 */
export function startMessageWorker(redisConfig, wa) {
  const worker = new Worker(
    "whatsapp-messages",
    async (job) => {
      const { to, text } = job.data;
      logger.info({ jobId: job.id, to }, "processing message job");

      try {
        const result = await wa.sendMessage(to, text);
        return result;
      } catch (error) {
        logger.error({ jobId: job.id, err: error }, "message job failed");
        throw error;
      }
    },
    {
      connection: {
        host: redisConfig.host,
        port: redisConfig.port,
      },
    }
  );

  worker.on("completed", (job) => {
    logger.debug({ jobId: job.id }, "message job completed");
  });

  worker.on("failed", (job, error) => {
    logger.error({ jobId: job?.id, err: error }, "message job failed");
  });

  logger.info("message worker started");
  return worker;
}
