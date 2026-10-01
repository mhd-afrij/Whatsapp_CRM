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
import { drainWorkersAndStopManagers } from './lib/shutdown';
import { connectionRegistry } from './whatsapp/manager-instance';

async function main() {
  const app = createApp();

  // Surface the storage target at boot so a FILESYSTEM_DISK / STORAGE_PROVIDER
  // mismatch in the shared .env is visible in the logs immediately, rather than
  // discovered later when media fails to upload. Config only - no secrets.
  logger.info(
    {
      storageProvider: env.STORAGE_PROVIDER,
      storageContainer: env.STORAGE_PROVIDER === 'azure' ? env.AZURE_STORAGE_CONTAINER_NAME : env.MEDIA_LOCAL_STORAGE_DIR,
    },
    'whatsapp-gateway storage target resolved',
  );

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

      // Steps 2 and 3 delegate to drainWorkersAndStopManagers so the ordering
      // contract (drain every worker BEFORE stopping any account socket) is
      // enforced in one tested place instead of being re-implemented here. The
      // previous inline version ran both in a single Promise.allSettled, which
      // closed sockets while jobs were still draining.
      //
      // The helper reports failures rather than throwing, so a single broken
      // WhatsApp session cannot abort the rest of the sequence; this block owns
      // the exit policy and still exits 0, exactly as before.
      const { errors } = await drainWorkersAndStopManagers(
        [sendMessageWorker, mediaDownloadWorker],
        // Release all session locks / stop reconnect timers (if held) before
        // tearing down Redis/MySQL so a peer gateway instance can take over
        // each account's session cleanly, and so credentials are preserved.
        () => connectionRegistry.getAll(),
      );

      for (const { step, error } of errors) {
        logger.warn({ err: error, step }, 'Graceful shutdown step failed during shutdown');
      }
      if (errors.length) {
        logger.warn(
          { failedSteps: errors.length },
          'Graceful shutdown completed with failures; continuing teardown',
        );
      }

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
