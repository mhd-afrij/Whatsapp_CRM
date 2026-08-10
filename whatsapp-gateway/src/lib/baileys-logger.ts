import { logger } from './logger';

const SUPPRESSED_WARNINGS = new Set([
  'Invalid mex newsletter notification',
  'Invalid mex newsletter notification content',
]);

type LogMethod = (...args: unknown[]) => void;

interface BaileysBaseLogger {
  warn: LogMethod;
  error: LogMethod;
  info: LogMethod;
  debug: LogMethod;
  trace: LogMethod;
  child: (...args: unknown[]) => BaileysBaseLogger;
}

function extractMessage(args: unknown[]): string | null {
  for (const value of args) {
    if (typeof value === 'string') {
      return value;
    }
  }
  return null;
}

function shouldSuppressWarning(args: unknown[]): boolean {
  const message = extractMessage(args);
  return message ? SUPPRESSED_WARNINGS.has(message) : false;
}

export function createBaileysLogger(): BaileysBaseLogger {
  return createBaileysLoggerFrom(logger.child({ module: 'baileys' }).child({}, { level: 'warn' }) as BaileysBaseLogger);
}

export function createBaileysLoggerFrom(baseLogger: BaileysBaseLogger): BaileysBaseLogger {
  return {
    warn: (...args: unknown[]) => {
      if (shouldSuppressWarning(args)) {
        return;
      }
      baseLogger.warn(...args);
    },
    error: (...args: unknown[]) => {
      baseLogger.error(...args);
    },
    info: (...args: unknown[]) => {
      baseLogger.info(...args);
    },
    debug: (...args: unknown[]) => {
      baseLogger.debug(...args);
    },
    trace: (...args: unknown[]) => {
      baseLogger.trace(...args);
    },
    child: (...args: unknown[]) => createBaileysLoggerFrom(baseLogger.child(...args)),
  };
}

export { SUPPRESSED_WARNINGS };
