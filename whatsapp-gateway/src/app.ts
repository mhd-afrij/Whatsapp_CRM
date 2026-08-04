import express, { type Request, type Response, type NextFunction } from 'express';
import { getRedisClient } from './lib/redis';
import { getMysqlPool } from './lib/mysql';
import { logger } from './lib/logger';
import { createInternalWhatsappRouter } from './routes/internal-whatsapp.routes';

export function createApp() {
  const app = express();

  app.use(express.json());

  // Basic security headers (helmet-equivalent, kept dependency-free)
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.removeHeader('X-Powered-By');
    next();
  });

  // Liveness: process is up and able to respond. No external dependency checks.
  app.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  // Readiness: process is up AND able to serve traffic (Redis + MySQL reachable).
  app.get('/readyz', async (_req: Request, res: Response) => {
    const checks: Record<string, 'ok' | 'error'> = { redis: 'error', mysql: 'error' };

    try {
      const pong = await getRedisClient().ping();
      checks.redis = pong === 'PONG' ? 'ok' : 'error';
    } catch (err) {
      logger.error({ err }, 'Readiness check: Redis ping failed');
    }

    try {
      const pool = getMysqlPool();
      await pool.query('SELECT 1');
      checks.mysql = 'ok';
    } catch (err) {
      logger.error({ err }, 'Readiness check: MySQL query failed');
    }

    const isReady = Object.values(checks).every((v) => v === 'ok');
    res.status(isReady ? 200 : 503).json({ status: isReady ? 'ok' : 'unavailable', checks });
  });

  app.use('/internal/whatsapp', createInternalWhatsappRouter());

  // Fallback error handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err }, 'Unhandled request error');
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  });

  return app;
}
