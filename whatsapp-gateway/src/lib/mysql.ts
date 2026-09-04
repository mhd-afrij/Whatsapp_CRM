import mysql, { type Pool, type PoolConnection, type QueryOptions, type ResultSetHeader, type FieldPacket, type ExecuteValues } from 'mysql2/promise';
import { env } from '../config/env';
import { logger } from './logger';
import { computeBackoffDelayMs } from './backoff';

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
    logger.warn({ failures: circuitBreaker.failures }, 'MySQL circuit breaker opened');
  }
}

function recordSuccess(): void {
  if (circuitBreaker.state === 'half-open') {
    circuitBreaker.state = 'closed';
    circuitBreaker.failures = 0;
    logger.info('MySQL circuit breaker closed');
  } else if (circuitBreaker.state === 'closed') {
    circuitBreaker.failures = 0;
  }
}

function checkCircuitBreaker(): boolean {
  if (circuitBreaker.state === 'open') {
    const timeSinceLastFailure = Date.now() - circuitBreaker.lastFailure;
    if (timeSinceLastFailure >= CIRCUIT_BREAKER_RESET_TIMEOUT_MS) {
      circuitBreaker.state = 'half-open';
      logger.info('MySQL circuit breaker half-open, allowing test query');
      return true;
    }
    return false;
  }
  return true;
}

async function createPool(): Promise<Pool> {
  const newPool = mysql.createPool({
    host: env.MYSQL_HOST,
    port: env.MYSQL_PORT,
    database: env.MYSQL_DATABASE,
    user: env.MYSQL_USER,
    password: env.MYSQL_PASSWORD,
    waitForConnections: true,
    connectionLimit: 10,
    maxIdle: 10,
    idleTimeout: 60_000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
    charset: 'utf8mb4',
  });

  // mysql2's Pool event typing only exposes the handful of pool lifecycle
  // events; 'error' (an uncaught pool error) is typed via the base emitter.
  const poolEvents = newPool as unknown as import('node:events').EventEmitter;
  poolEvents.on('error', (err) => {
    logger.error({ err, code: (err as { code?: string }).code }, 'MySQL pool error');
    if ((err as { code?: string }).code === 'PROTOCOL_CONNECTION_LOST' ||
        (err as { code?: string }).code === 'ECONNRESET' ||
        (err as { code?: string }).code === 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR' ||
        (err as { code?: string }).code === 'PROTOCOL_ENQUEUE_AFTER_QUIT') {
      recordFailure();
      schedulePoolRecreation();
    }
  });

  newPool.on('connection', () => {
    logger.debug('MySQL new connection established');
  });

  newPool.on('acquire', () => {
    logger.debug('MySQL connection acquired');
  });

  newPool.on('release', () => {
    logger.debug('MySQL connection released');
  });

  return newPool;
}

let recreationScheduled = false;
let recreationPromise: Promise<void> | null = null;

function schedulePoolRecreation(): void {
  if (recreationScheduled) return;
  recreationScheduled = true;

  recreationPromise = (async () => {
    let attempt = 0;
    let recreated = false;
    while (!recreated) {
      attempt += 1;
      if (!checkCircuitBreaker()) {
        const waitMs = CIRCUIT_BREAKER_RESET_TIMEOUT_MS - (Date.now() - circuitBreaker.lastFailure);
        logger.warn({ waitMs }, 'Circuit breaker open, waiting before pool recreation');
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }

      try {
        logger.info({ attempt }, 'Attempting to recreate MySQL pool');
        await closeMysqlPoolInternal();
        const newPool = await createPool();
        await newPool.query('SELECT 1');
        pool = newPool;
        recordSuccess();
        logger.info('MySQL pool recreated successfully');
        recreated = true;
      } catch (err) {
        recordFailure();
        const delay = computeBackoffDelayMs(attempt, { baseMs: 2000, maxMs: 60_000 });
        logger.warn({ err, attempt, delay }, 'Failed to recreate MySQL pool, retrying');
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    recreationScheduled = false;
    recreationPromise = null;
  })();
}

async function closeMysqlPoolInternal(): Promise<void> {
  if (pool) {
    try {
      await pool.end();
    } catch (err) {
      logger.warn({ err }, 'Error closing MySQL pool');
    }
    pool = null;
  }
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
      logger.info('MySQL pool initialized');
      return pool;
    } catch (err) {
      recordFailure();
      logger.error({ err }, 'Failed to initialize MySQL pool');
      throw err;
    } finally {
      isInitializing = false;
      initializationPromise = null;
    }
  })();

  return initializationPromise;
}

export async function closeMysqlPool(): Promise<void> {
  await closeMysqlPoolInternal();
  if (recreationPromise) {
    await recreationPromise;
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
  retryableCodes: ['PROTOCOL_CONNECTION_LOST', 'ECONNRESET', 'ETIMEDOUT', 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR', 'PROTOCOL_ENQUEUE_AFTER_QUIT', 'ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'],
};

function isRetryableError(err: unknown, retryableCodes: string[]): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: string }).code;
  const errno = (err as { errno?: number }).errno;
  if (code && retryableCodes.includes(code)) return true;
  if (errno && (errno === 1213 || errno === 1205)) return true;
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
        throw new Error('MySQL circuit breaker is open');
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
        logger.warn({ err, attempt, delay }, 'MySQL query failed, retrying');
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      recordFailure();
      throw err;
    }
  }

  throw lastError;
}

export async function query<T extends import('mysql2/promise').QueryResult>(
  sql: string,
  values?: QueryOptions['values']
): Promise<[T, FieldPacket[]]> {
  const pool = await getMysqlPool();
  return executeWithRetry(() => pool.query<T>(sql, values));
}

export async function execute(sql: string, values?: ExecuteValues): Promise<ResultSetHeader> {
  const pool = await getMysqlPool();
  return executeWithRetry(() => pool.execute<ResultSetHeader>(sql, values).then(([header]) => header));
}

export async function getConnection(): Promise<PoolConnection> {
  const pool = await getMysqlPool();
  return executeWithRetry(() => pool.getConnection());
}

export async function transaction<T>(
  callback: (conn: PoolConnection) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const result = await executeWithRetry(
      () => callback(conn),
      options
    );
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback().catch(() => undefined);
    throw err;
  } finally {
    conn.release();
  }
}

export function isHealthy(): boolean {
  return circuitBreaker.state !== 'open' && pool !== null;
}