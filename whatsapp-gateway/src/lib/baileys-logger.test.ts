import { describe, expect, it, vi } from 'vitest';
import { createBaileysLoggerFrom, SUPPRESSED_WARNINGS } from './baileys-logger';

function makeBaseLogger() {
  return {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
  };
}

describe('Baileys logger filter', () => {
  it('suppresses the known newsletter warnings', () => {
    const baseLogger = makeBaseLogger();
    const logger = createBaileysLoggerFrom(baseLogger);

    logger.warn({ node: {} }, 'Invalid mex newsletter notification');
    logger.warn({ data: {} }, 'Invalid mex newsletter notification content');

    expect(baseLogger.warn).not.toHaveBeenCalled();
    expect(SUPPRESSED_WARNINGS.has('Invalid mex newsletter notification')).toBe(true);
  });

  it('forwards unrelated warnings and child loggers', () => {
    const baseLogger = makeBaseLogger();
    const childLogger = makeBaseLogger();
    baseLogger.child.mockReturnValue(childLogger);

    const logger = createBaileysLoggerFrom(baseLogger);
    logger.warn({ node: {} }, 'Something else');
    logger.child({ module: 'nested' }).info('hello');

    expect(baseLogger.warn).toHaveBeenCalledWith({ node: {} }, 'Something else');
    expect(baseLogger.child).toHaveBeenCalledWith({ module: 'nested' });
    expect(childLogger.info).toHaveBeenCalledWith('hello');
  });
});
