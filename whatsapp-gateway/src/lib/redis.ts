import Redis, { type RedisOptions } from 'ioredis';
import { env } from '../config/env';
import { logger } from './logger';

export function buildRedisOptions(): RedisOptions {
  return {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    username: env.REDIS_USERNAME,
    password: env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
  };
}

let sharedClient: Redis | null = null;

/**
 * Returns a lazily-created, process-wide ioredis client for general use
 * (health checks, caching, etc). BullMQ maintains its own dedicated
 * connection - see src/queues/connection.ts.
 */
export function getRedisClient(): Redis {
  if (!sharedClient) {
    sharedClient = new Redis(buildRedisOptions());

    sharedClient.on('error', (err) => {
      logger.error({ err }, 'Redis client error');
    });

    sharedClient.on('connect', () => {
      logger.info('Redis client connected');
    });
  }

  return sharedClient;
}

export async function closeRedisClient(): Promise<void> {
  if (sharedClient) {
    await sharedClient.quit();
    sharedClient = null;
  }
}
