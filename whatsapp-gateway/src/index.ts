import type { Server as HttpServer } from 'node:http';
import { env } from './config/env';
import { logger } from './lib/logger';
import { createApp } from './app';
import { closeRedisClient } from './lib/redis';
import { closeMysqlPool } from './lib/mysql';
import { createSendMessageWorker, sendMessageQueue } from './queues/send-message.queue';
import { createMediaDownloadWorker, mediaDownloadQueue } from './queues/media-download.queue';
import { createSocketServer, closeSocketServer } from './lib/socket-server';
import { markShuttingDown } from './lib/lifecycle';
import { connectionRegistry } from './whatsapp/manager-instance';

async function main() {
  const app = createApp();

  const server: HttpServer = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'whatsapp-gateway HTTP server listening');
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logger.error(
        { port: env.PORT },
        `Port ${env.PORT} is already in use. Stop the existing whatsapp-gateway process or change PORT before starting dev again.`,
      );
      process.exit(1);
      return;
    }
    logger.error({ err }, 'HTTP server failed to start');
  });

  // BullMQ's Worker.run() only resolves when the worker is closed - awaiting it
  // here would block the rest of startup (socket server, session restore) forever.
  // Start both workers off-loop and let main() continue.
  const sendMessageWorker = createSendMessageWorker();
  void sendMessageWorker.run().catch((err) => {
    logger.error({ err }, 'Send message worker stopped unexpectedly');
  });

  const mediaDownloadWorker = createMediaDownloadWorker();
  void mediaDownloadWorker.run().catch((err) => {
    logger.error({ err }, 'Media download worker stopped unexpectedly');
  });

  createSocketServer(server);

  // Boot should come up ready to pair or reconnect automatically so the UI
  // can show the QR / live session state without a manual "Connect" click.
  connectionRegistry.restoreAllOnBoot().catch((err) => {
    logger.error({ err }, 'Failed to initialize WhatsApp sessions on boot');
  });

  let shuttingDown = false;

  /**
   * Phase 6.6 - ordered graceful shutdown. The order matters:
   *
   *  1. mark the process as draining so the internal API stops accepting NEW
   *     operations (app.ts returns 503 / GATEWAY_SHUTTING_DOWN);
   *  2. stop the BullMQ workers so no further job starts against a socket that
   *     is about to be closed (in-flight jobs finish or fail safely);
   *  3. stop each ConnectionManager - this clears per-account reconnect timers,
   *     closes that account's socket, and releases its session lock WITHOUT
   *     deleting credentials (a normal restart must not force a re-pair);
   *  4. close the Socket.IO namespace so realtime clients disconnect (otherwise
   *     `server.close()` never completes while they hold connections open);
   *  5. close the HTTP server;
   *  6. close the BullMQ queues and the Redis/MySQL clients.
   *
   * Each account is stopped independently and its failure only logs a warning,
   * so one broken session can never block the shutdown of the others.
   */
  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal }, 'Shutting down gracefully');

    const timeout = setTimeout(() => {
      logger.error('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, 15_000);

    try {
      markShuttingDown();

      const workers = [sendMessageWorker, mediaDownloadWorker];
      const managers = connectionRegistry.getAll();

      await Promise.allSettled([
        ...workers.map((worker) =>
          worker.close().catch((err) => {
            logger.warn({ err }, 'Failed to close queue worker during shutdown');
          }),
        ),
        // Release all session locks / stop reconnect timers (if held) before
        // tearing down Redis/MySQL so a peer gateway instance can take over
        // each account's session cleanly, and so credentials are preserved.
        ...managers.map((manager) =>
          manager.stop().catch((err) => {
            logger.warn({ err }, 'Failed to stop WhatsApp connection during shutdown');
          }),
        ),
      ]);

      await closeSocketServer().catch((err) => {
        logger.warn({ err }, 'Failed to close Socket.IO server during shutdown');
      });

      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });

      await Promise.allSettled([
        sendMessageQueue.close(),
        mediaDownloadQueue.close(),
        closeRedisClient(),
        closeMysqlPool(),
      ]);

      clearTimeout(timeout);
      logger.info('Shutdown complete');
      process.exit(0);
    } catch (err) {
      clearTimeout(timeout);
      logger.error({ err }, 'Error during graceful shutdown');
      process.exit(1);
    }
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error during startup');
  process.exit(1);
});
