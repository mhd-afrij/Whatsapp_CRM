import { Pool, type PoolClient, type QueryResult as PgQueryResult } from 'pg';
import { env } from '../config/env';
import { logger } from './logger';
import { computeBackoffDelayMs } from './backoff';

export interface RowDataPacket {
  [key: string]: any;
}

export interface ResultSetHeader {
  affectedRows: number;
  insertId: number;
}

export interface PoolConnection {
  query<T = any>(sql: string, values?: any[]): Promise<[T, any[]]>;
  execute<T = ResultSetHeader>(sql: string, values?: any[]): Promise<[T]>;
  release(): void;
}

interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  state: 'closed' | 'open' | 'half-open';
}

const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_RESET_TIMEOUT_MS = 30_000;

let pool: Pool | null = null;
let isInitializing = false;
let initializationPromise: Promise<Pool> | null = null;

const circuitBreaker: CircuitBreakerState = {
  failures: 0,
  lastFailure: 0,
  state: 'closed',
};

function recordFailure(): void {
  circuitBreaker.failures += 1;
  circuitBreaker.lastFailure = Date.now();

  if (circuitBreaker.failures >= CIRCUIT_BREAKER_THRESHOLD && circuitBreaker.state === 'closed') {
    circuitBreaker.state = 'open';
    logger.warn({ failures: circuitBreaker.failures }, 'PostgreSQL circuit breaker opened');
  }
}

function recordSuccess(): void {
  if (circuitBreaker.state === 'half-open') {
    circuitBreaker.state = 'closed';
    circuitBreaker.failures = 0;
    logger.info('PostgreSQL circuit breaker closed');
  } else if (circuitBreaker.state === 'closed') {
    circuitBreaker.failures = 0;
  }
}

function checkCircuitBreaker(): boolean {
  if (circuitBreaker.state === 'open') {
    const timeSinceLastFailure = Date.now() - circuitBreaker.lastFailure;
    if (timeSinceLastFailure >= CIRCUIT_BREAKER_RESET_TIMEOUT_MS) {
      circuitBreaker.state = 'half-open';
      logger.info('PostgreSQL circuit breaker half-open, allowing test query');
      return true;
    }
    return false;
  }
  return true;
}

export function convertPlaceholders(sql: string): string {
  let paramIndex = 1;
  return sql.replace(/\?/g, () => `$${paramIndex++}`);
}

async function createPool(): Promise<Pool> {
  const host = env.DB_HOST || process.env.PGHOST || '127.0.0.1';
  const isLocal = host === '127.0.0.1' || host === 'localhost';

  const config: any = env.DATABASE_URL
    ? { connectionString: env.DATABASE_URL }
    : {
        host,
        port: env.DB_PORT || 5432,
        database: env.DB_DATABASE || 'postgres',
        user: env.DB_USERNAME || 'postgres',
        password: env.DB_PASSWORD || '',
      };

  if (!isLocal && !config.ssl && process.env.NODE_ENV !== 'test') {
    config.ssl = { rejectUnauthorized: false };
  }

  config.max = 10;
  config.idleTimeoutMillis = 60_000;
  config.connectionTimeoutMillis = 10_000;

  const newPool = new Pool(config);

  newPool.on('error', (err: any) => {
    logger.error({ err, code: err?.code }, 'PostgreSQL pool error');
    if (err?.code === 'ECONNRESET' || err?.code === '57P01' || err?.code === 'ETIMEDOUT') {
      recordFailure();
    }
  });

  return newPool;
}

export async function getMysqlPool(): Promise<Pool> {
  if (pool) return pool;

  if (isInitializing && initializationPromise) {
    return initializationPromise;
  }

  isInitializing = true;
  initializationPromise = (async () => {
    try {
      const newPool = await createPool();
      await newPool.query('SELECT 1');
      pool = newPool;
      recordSuccess();
      logger.info('PostgreSQL pool initialized');
      return pool;
    } catch (err) {
      recordFailure();
      logger.error({ err }, 'Failed to initialize PostgreSQL pool');
      throw err;
    } finally {
      isInitializing = false;
      initializationPromise = null;
    }
  })();

  return initializationPromise;
}

export async function closeMysqlPool(): Promise<void> {
  if (pool) {
    try {
      await pool.end();
    } catch (err) {
      logger.warn({ err }, 'Error closing PostgreSQL pool');
    }
    pool = null;
  }
}

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryableCodes?: string[];
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10_000,
  retryableCodes: ['ECONNRESET', 'ETIMEDOUT', '57P01', '40001', '40P01', 'ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'],
};

function isRetryableError(err: unknown, retryableCodes: string[]): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: string }).code;
  if (code && retryableCodes.includes(code)) return true;
  return false;
}

async function executeWithRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      if (!checkCircuitBreaker()) {
        throw new Error('PostgreSQL circuit breaker is open');
      }
      const result = await operation();
      recordSuccess();
      return result;
    } catch (err) {
      lastError = err;
      if (attempt < opts.maxAttempts && isRetryableError(err, opts.retryableCodes)) {
        recordFailure();
        const delay = Math.min(
          computeBackoffDelayMs(attempt, { baseMs: opts.baseDelayMs, maxMs: opts.maxDelayMs }),
          opts.maxDelayMs
        );
        logger.warn({ err, attempt, delay }, 'PostgreSQL query failed, retrying');
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      recordFailure();
      throw err;
    }
  }

  throw lastError;
}

export async function query<T = any>(
  sql: string,
  values?: any[]
): Promise<[T, any[]]> {
  const p = await getMysqlPool();
  const convertedSql = convertPlaceholders(sql);
  const result = await executeWithRetry(() => p.query(convertedSql, values));
  return [result.rows as unknown as T, []];
}

export async function execute(sql: string, values?: any[]): Promise<ResultSetHeader> {
  const p = await getMysqlPool();
  let convertedSql = convertPlaceholders(sql);

  // If INSERT statement and does not have RETURNING clause, add RETURNING id to capture insertId
  const isInsert = /^\s*INSERT\s+INTO/i.test(convertedSql);
  if (isInsert && !/RETURNING/i.test(convertedSql)) {
    convertedSql += ' RETURNING id';
  }

  const result = await executeWithRetry(async () => {
    try {
      return await p.query(convertedSql, values);
    } catch (err: any) {
      // If RETURNING id failed because column 'id' doesn't exist, retry without it
      if (isInsert && err?.code === '42703' && convertedSql.endsWith(' RETURNING id')) {
        const fallbackSql = convertedSql.slice(0, -' RETURNING id'.length);
        return await p.query(fallbackSql, values);
      }
      throw err;
    }
  });

  const insertId = result.rows && result.rows[0]?.id ? Number(result.rows[0].id) : 0;
  return {
    affectedRows: result.rowCount ?? 0,
    insertId,
  };
}

export async function getConnection(): Promise<PoolConnection> {
  const p = await getMysqlPool();
  const client: PoolClient = await executeWithRetry(() => p.connect());

  return {
    async query<T = any>(sql: string, values?: any[]): Promise<[T, any[]]> {
      const convertedSql = convertPlaceholders(sql);
      const res = await client.query(convertedSql, values);
      return [res.rows as unknown as T, []];
    },
    async execute<T = ResultSetHeader>(sql: string, values?: any[]): Promise<[T]> {
      let convertedSql = convertPlaceholders(sql);
      const isInsert = /^\s*INSERT\s+INTO/i.test(convertedSql);
      if (isInsert && !/RETURNING/i.test(convertedSql)) {
        convertedSql += ' RETURNING id';
      }
      let res: PgQueryResult;
      try {
        res = await client.query(convertedSql, values);
      } catch (err: any) {
        if (isInsert && err?.code === '42703' && convertedSql.endsWith(' RETURNING id')) {
          const fallbackSql = convertedSql.slice(0, -' RETURNING id'.length);
          res = await client.query(fallbackSql, values);
        } else {
          throw err;
        }
      }
      const header: ResultSetHeader = {
        affectedRows: res.rowCount ?? 0,
        insertId: res.rows && res.rows[0]?.id ? Number(res.rows[0].id) : 0,
      };
      return [header as unknown as T];
    },
    release(): void {
      client.release();
    },
  };
}

export async function transaction<T>(
  callback: (conn: PoolConnection) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const conn = await getConnection();
  try {
    await (conn as any).query('BEGIN');
    const result = await executeWithRetry(() => callback(conn), options);
    await (conn as any).query('COMMIT');
    return result;
  } catch (err) {
    await (conn as any).query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    conn.release();
  }
}

export function isHealthy(): boolean {
  return circuitBreaker.state !== 'open' && pool !== null;
}