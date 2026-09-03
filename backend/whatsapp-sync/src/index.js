import "dotenv/config";
import { loadEnv } from "./config/env.js";
import { logger } from "./config/logger.js";
import { createServer } from "./server.js";

async function main() {
  const env = loadEnv();
  const { httpServer, messageQueue, mediaQueue, retryQueue, msgWorker, mediaW } = await createServer(env);

  const server = httpServer.listen(env.SYNC_PORT, () => {
    logger.info({ port: env.SYNC_PORT }, "whatsapp-sync listening");
  });

  async function shutdown(signal) {
    logger.info({ signal }, "shutting down whatsapp-sync");

    // Close BullMQ workers and queues gracefully
    const shutdowns = [];
    if (msgWorker) shutdowns.push(msgWorker.close());
    if (mediaW) shutdowns.push(mediaW.close());
    if (messageQueue) shutdowns.push(messageQueue.close());
    if (mediaQueue) shutdowns.push(mediaQueue.close());
    if (retryQueue) shutdowns.push(retryQueue.close());

    await Promise.allSettled(shutdowns);
    logger.info("queues and workers closed");

    server.close(() => process.exit(0));

    // Force exit after 10s if server.close hangs
    setTimeout(() => process.exit(1), 10000);
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error) => {
  logger.error({ err: error }, "whatsapp-sync failed to start");
  process.exit(1);
});
