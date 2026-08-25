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

export interface BaileysLoggerOptions {
  /**
   * Invoked when Baileys logs an "unexpected error in '<context>'" (e.g. init
   * queries timing out). Baileys only logs these - it does not close or flag
   * the connection - so callers can react (e.g. force a reconnect) instead of
   * leaving a zombie socket that reports 'connected' but fails every send.
   */
  onUnexpectedError?: (context: string, err: unknown) => void;
}

export function createBaileysLogger(options: BaileysLoggerOptions = {}): BaileysBaseLogger {
  return createBaileysLoggerFrom(
    logger.child({ module: 'baileys' }).child({}, { level: 'warn' }) as BaileysBaseLogger,
    options,
  );
}

export function createBaileysLoggerFrom(
  baseLogger: BaileysBaseLogger,
  options: BaileysLoggerOptions = {},
): BaileysBaseLogger {
  return {
    warn: (...args: unknown[]) => {
      if (shouldSuppressWarning(args)) {
        return;
      }
      baseLogger.warn(...args);
    },
    error: (...args: unknown[]) => {
      const message = extractMessage(args);
      if (message?.startsWith('unexpected error in')) {
        const context = message.match(/in '([^']+)'/)?.[1] ?? message;
        const err = (args[0] as { err?: unknown } | undefined)?.err ?? args[0];
        options.onUnexpectedError?.(context, err);
      }
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
    child: (...args: unknown[]) => createBaileysLoggerFrom(baseLogger.child(...args), options),
  };
}

export { SUPPRESSED_WARNINGS };
