import { PgBoss } from 'pg-boss';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env';
import { logger } from '../lib/logger';

export interface Job<T = any> {
  id: string;
  data: T;
  attemptsMade: number;
  opts: {
    attempts?: number;
  };
}

let bossInstance: PgBoss | null = null;
let bossStartingPromise: Promise<PgBoss> | null = null;

export async function getBoss(): Promise<PgBoss> {
  if (bossInstance) return bossInstance;
  if (bossStartingPromise) return bossStartingPromise;

  bossStartingPromise = (async () => {
    const host = env.DB_HOST || process.env.PGHOST || '127.0.0.1';
    const isLocal = host === '127.0.0.1' || host === 'localhost';

    const bossConfig: any = env.DATABASE_URL
      ? { connectionString: env.DATABASE_URL }
      : {
          host,
          port: env.DB_PORT || 5432,
          database: env.DB_DATABASE || 'postgres',
          user: env.DB_USERNAME || 'postgres',
          password: env.DB_PASSWORD || '',
        };

    if (!isLocal && !bossConfig.ssl && process.env.NODE_ENV !== 'test') {
      bossConfig.ssl = { rejectUnauthorized: false };
    }

    const boss = new PgBoss(bossConfig);

    boss.on('error', (err: unknown) => {
      logger.error({ err }, 'pg-boss error');
    });

    try {
      await boss.start();
      bossInstance = boss;
      logger.info('pg-boss started successfully');
      return boss;
    } catch (err) {
      logger.error({ err }, 'Failed to start pg-boss');
      throw err;
    } finally {
      bossStartingPromise = null;
    }
  })();

  return bossStartingPromise;
}

export async function stopBoss(): Promise<void> {
  if (bossInstance) {
    try {
      await bossInstance.stop();
    } catch (err) {
      logger.warn({ err }, 'Error stopping pg-boss');
    }
    bossInstance = null;
  }
}

export class Queue<T = any> {
  constructor(
    public readonly name: string,
    public readonly options?: {
      connection?: any;
      defaultJobOptions?: {
        attempts?: number;
        backoff?: { type: string; delay: number };
        removeOnComplete?: number;
        removeOnFail?: number;
      };
    },
  ) {}

  async add(_jobName: string, data: T, opts?: { attempts?: number }): Promise<{ id: string }> {
    if (process.env.NODE_ENV === 'test') {
      return { id: `test-job-${randomUUID()}` };
    }

    const boss = await getBoss();
    const attempts = opts?.attempts ?? this.options?.defaultJobOptions?.attempts ?? 4;

    const jobId = await boss.send(this.name, data as object, {
      retryLimit: attempts,
      retryBackoff: true,
      retryDelay: 3,
    });

    return { id: jobId || randomUUID() };
  }

  async close(): Promise<void> {
    // Teardown handled centrally via stopBoss()
  }
}

export class Worker<T = any> {
  private failedHandlers: Array<(job: Job<T> | null, err: Error) => Promise<void> | void> = [];
  private isRunning = false;

  constructor(
    public readonly name: string,
    private readonly processor: (job: Job<T>) => Promise<any>,
    public readonly options?: any,
  ) {}

  on(event: 'failed', handler: (job: Job<T> | null, err: Error) => Promise<void> | void): this {
    if (event === 'failed') {
      this.failedHandlers.push(handler);
    }
    return this;
  }

  async run(): Promise<void> {
    if (this.isRunning || process.env.NODE_ENV === 'test') return;
    this.isRunning = true;

    const boss = await getBoss();

    await boss.work(this.name, async (jobs: any[]) => {
      for (const job of jobs) {
        const wrappedJob: Job<T> = {
          id: job.id,
          data: job.data,
          attemptsMade: job.retrycount ?? 0,
          opts: {
            attempts: job.retrylimit ?? 4,
          },
        };

        try {
          await this.processor(wrappedJob);
        } catch (err: any) {
          for (const handler of this.failedHandlers) {
            try {
              await handler(wrappedJob, err);
            } catch (handlerErr) {
              logger.error({ handlerErr }, 'Error executing queue failed handler');
            }
          }
          throw err;
        }
      }
    });
  }

  async close(): Promise<void> {
    this.isRunning = false;
  }
}

export function getQueueConnectionOptions(): any {
  return {};
}
