import { type ConnectionOptions } from 'bullmq';
import { buildRedisOptions } from '../lib/redis';

/**
 * BullMQ requires its own IORedis-compatible connection options
 * (it manages connection lifecycle internally per Queue/Worker).
 */
export function getQueueConnectionOptions(): ConnectionOptions {
  return buildRedisOptions();
}
