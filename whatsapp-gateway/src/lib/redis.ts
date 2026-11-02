import { logger } from './logger';

export interface DummyRedis {
  ping(): Promise<string>;
  quit(): Promise<void>;
  duplicate(): DummyRedis;
  on(event: string, cb: (...args: any[]) => void): void;
}

const dummyClient: DummyRedis = {
  async ping() {
    return 'PONG';
  },
  async quit() {
    // no-op
  },
  duplicate() {
    return dummyClient;
  },
  on(_event: string, _cb: (...args: any[]) => void) {
    // no-op
  },
};

export function buildRedisOptions(): any {
  return {};
}

export function getRedisClient(): DummyRedis {
  return dummyClient;
}

export async function closeRedisClient(): Promise<void> {
  // no-op
}
