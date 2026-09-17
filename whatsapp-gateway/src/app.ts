import express, { type Request, type Response, type NextFunction } from 'express';
import { getRedisClient } from './lib/redis';
import { getMysqlPool, isHealthy } from './lib/mysql';
import { logger } from './lib/logger';
import { createInternalWhatsappRouter } from './routes/internal-whatsapp.routes';
import { connectionManager, connectionRegistry } from './whatsapp/manager-instance';
import { isShuttingDown } from './lib/lifecycle';

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

  // Phase 6.6 step 1 - once graceful shutdown starts, no NEW internal WhatsApp
  // operation is accepted: the Baileys managers are about to be torn down, so
  // admitting a send/media/reaction here would fail halfway and could persist a
  // half-applied state. Liveness stays 200 (the process is alive and finishing
  // work) while readiness flips to 503 so load balancers drain this instance.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!isShuttingDown()) {
      next();
      return;
    }

    res.setHeader('Connection', 'close');

    if (req.path === '/healthz') {
      res.status(200).json({ status: 'shutting_down' });
      return;
    }

    res.status(503).json({
      success: false,
      message: 'Gateway is shutting down and is not accepting new operations',
      data: { code: 'GATEWAY_SHUTTING_DOWN' },
      status: 'unavailable',
    });
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
      if (isHealthy()) {
        const pool = await getMysqlPool();
        await pool.query('SELECT 1');
        checks.mysql = 'ok';
      } else {
        logger.warn('Readiness check: MySQL circuit breaker open');
      }
    } catch (err) {
      logger.error({ err }, 'Readiness check: MySQL query failed');
    }

    const isReady = Object.values(checks).every((v) => v === 'ok');
    res.status(isReady ? 200 : 503).json({ status: isReady ? 'ok' : 'unavailable', checks });
  });

  // WhatsApp connection health (Phase 6.8): reports the process-level
  // WhatsApp connection snapshot PLUS one health entry per account this
  // process owns. Process health and individual WhatsApp account health are
  // deliberately separate: the process can be perfectly healthy while one
  // account is disconnected/reconnecting. This endpoint reflects whether
  // THIS process is up and healthy - NOT external dependencies. Redis/MySQL
  // readiness is the job of /readyz, so a temporary Redis blip never makes
  // the gateway look "down" here (the CRM's own health probe treats a 502
  // from this endpoint as gateway-down).
  app.get('/whatsapp/health', (_req: Request, res: Response) => {
    const snapshot = connectionManager.getSnapshot();
    // Per-account entries come from the registry (credential-free). Empty
    // when the process has not created any account manager yet.
    const accounts = connectionRegistry.listAccountHealth();

    res.status(200).json({
      status: 'ok',
      whatsapp: {
        status: snapshot.status,
        phoneNumber: snapshot.phoneNumber,
        qrPending: snapshot.status === 'qr_pending',
      },
      accounts,
    });
  });

  app.use('/internal/whatsapp', createInternalWhatsappRouter());

  // Fallback error handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err }, 'Unhandled request error');
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  });

  return app;
}
