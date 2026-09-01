import "dotenv/config";
import { loadEnv } from "./config/env.js";
import { logger } from "./observability/logger.js";
import { createServer } from "./server.js";

async function main() {
  const env = loadEnv();
  const { httpServer } = await createServer(env);

  const server = httpServer.listen(env.SYNC_PORT, () => {
    logger.info({ port: env.SYNC_PORT }, "whatsapp-sync listening");
  });

  function shutdown(signal: string) {
    logger.info({ signal }, "shutting down whatsapp-sync");
    server.close(() => process.exit(0));
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error) => {
  logger.error({ err: error }, "whatsapp-sync failed to start");
  process.exit(1);
});
