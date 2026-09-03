import Redis from "ioredis";
import { logger } from "./logger.js";

/**
 * @param {{ host: string, port: number, password: string }} config
 * @returns {Redis}
 */
export function createRedisConnection({ host, port, password }) {
  const client = new Redis({
    host,
    port,
    password: password || undefined,
    maxRetriesPerRequest: null,
  });

  client.on("error", (error) => {
    logger.warn({ err: error }, "redis connection error");
  });

  client.on("connect", () => {
    logger.info({ host, port }, "redis connected");
  });

  return client;
}
