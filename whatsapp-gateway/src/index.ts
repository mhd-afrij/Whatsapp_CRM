import type { Server as HttpServer } from 'node:http';
import { env } from './config/env';
import { logger } from './lib/logger';
import { createApp } from './app';
import { closeRedisClient } from './lib/redis';
import { closeMysqlPool } from './lib/mysql';
import { createSendMessageWorker, sendMessageQueue } from './queues/send-message.queue';
import { createMediaDownloadWorker, mediaDownloadQueue } from './queues/media-download.queue';
import { createSocketServer } from './lib/socket-server';
import { connectionManager } from './whatsapp/manager-instance';

async function main() {
  const app = createApp();

  const server: HttpServer = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'whatsapp-gateway HTTP server listening');
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
  connectionManager.restoreOnBoot().catch((err) => {
    logger.error({ err }, 'Failed to initialize WhatsApp session on boot');
  });

  let shuttingDown = false;

  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal }, 'Shutting down gracefully');

    const timeout = setTimeout(() => {
      logger.error('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, 15_000);

    try {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });

      // Release the session lock (if held) before tearing down Redis/MySQL so
      // a peer gateway instance can take over the workspace's session cleanly.
      await connectionManager.stop().catch((err) => {
        logger.warn({ err }, 'Failed to stop WhatsApp connection during shutdown');
      });

      await sendMessageWorker.close();
      await sendMessageQueue.close();
      await mediaDownloadWorker.close();
      await mediaDownloadQueue.close();
      await closeRedisClient();
      await closeMysqlPool();

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
