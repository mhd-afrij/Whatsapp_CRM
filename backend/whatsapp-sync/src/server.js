import { createServer as createHttpServer } from "node:http";
import mysql from "mysql2/promise";
import { createApp } from "./app.js";
import { createSocketServer, emitSessionUpdate, emitIncomingMessage } from "./sockets/socketServer.js";
import { createWhatsAppAdapter } from "./services/baileysService.js";
import { createSessionRecord } from "./services/sessionService.js";
import { notifyLaravel } from "./services/webhookService.js";
import { initMessageQueue, getMessageQueue } from "./queues/messageQueue.js";
import { initMediaQueue } from "./queues/mediaQueue.js";
import { initRetryQueue } from "./queues/retryQueue.js";
import { startMessageWorker } from "./workers/messageWorker.js";
import { startMediaWorker } from "./workers/mediaWorker.js";
import { logger } from "./config/logger.js";

/**
 * Create the full server with HTTP, Socket.io, MySQL, and WhatsApp adapter.
 * @param {object} env - Environment config
 * @returns {Promise<{app: import("express").Application, httpServer: import("node:http").Server, io: import("socket.io").Server}>}
 */
export async function createServer(env) {
  const wa = await createWhatsAppAdapter({ authDir: env.WHATSAPP_AUTH_DIR, logger });

  let session = createSessionRecord(
    {
      state: "unlinked",
      deviceName: null,
      linkedAt: null,
      lastSeenAt: null,
      qrPending: false,
      qrCode: null,
      updatedAt: new Date(0).toISOString(),
    },
    {}
  );

  let usingMysql = false;
  let pool = null;

  // Try MySQL connection
  try {
    pool = mysql.createPool({
      host: env.MYSQL_HOST,
      port: env.MYSQL_PORT,
      database: env.MYSQL_DATABASE,
      user: env.MYSQL_USER,
      password: env.MYSQL_PASSWORD || undefined,
      connectionLimit: 5,
      timezone: "Z",
    });

    pool.pool.on("error", (error) => {
      logger.warn({ err: error }, "mysql pool error");
    });

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS whatsapp_sync_sessions (
        id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
        state VARCHAR(20) NOT NULL,
        device_name VARCHAR(255) NULL,
        linked_at DATETIME(3) NULL,
        last_seen_at DATETIME(3) NULL,
        qr_pending TINYINT(1) NOT NULL DEFAULT 0,
        qr_code VARCHAR(255) NULL,
        updated_at DATETIME(3) NOT NULL
      )
    `);

    // Load existing session from DB
    const [rows] = await pool.query(
      "SELECT state, device_name, linked_at, last_seen_at, qr_pending, qr_code, updated_at FROM whatsapp_sync_sessions WHERE id = 1 LIMIT 1"
    );
    const row = rows[0];
    if (row) {
      session = {
        state: row.state,
        deviceName: row.device_name,
        linkedAt: row.linked_at ? new Date(row.linked_at).toISOString() : null,
        lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null,
        qrPending: Boolean(row.qr_pending),
        qrCode: row.qr_code,
        updatedAt: new Date(row.updated_at).toISOString(),
      };
    }

    usingMysql = true;
    logger.info("mysql persistence initialized");
  } catch (error) {
    if (env.STRICT_MYSQL_ONLY || env.NODE_ENV === "production") {
      throw error;
    }
    logger.warn({ err: error }, "mysql unavailable, using in-memory sync session store");
  }

  // Initialize BullMQ queues and workers (Redis-backed)
  let messageQueue = null;
  let mediaQueue = null;
  let retryQueue = null;
  let msgWorker = null;
  let mediaW = null;

  const redisConfig = { host: env.REDIS_HOST, port: env.REDIS_PORT };

  try {
    messageQueue = initMessageQueue(redisConfig);
    mediaQueue = initMediaQueue(redisConfig);
    retryQueue = initRetryQueue(redisConfig);
    msgWorker = startMessageWorker(redisConfig, wa);
    mediaW = startMediaWorker(redisConfig);
    logger.info("bullmq queues and workers initialized");
  } catch (error) {
    logger.warn({ err: error }, "failed to initialize bullmq (redis may be unavailable), continuing without queues");
  }

  // Session ref for mutable access
  const sessionRef = { current: session };

  // Persist function
  async function persist(nextSession) {
    sessionRef.current = nextSession;
    session = nextSession;

    if (usingMysql && pool) {
      await pool.execute(
        `INSERT INTO whatsapp_sync_sessions (id, state, device_name, linked_at, last_seen_at, qr_pending, qr_code, updated_at)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           state = VALUES(state),
           device_name = VALUES(device_name),
           linked_at = VALUES(linked_at),
           last_seen_at = VALUES(last_seen_at),
           qr_pending = VALUES(qr_pending),
           qr_code = VALUES(qr_code),
           updated_at = VALUES(updated_at)`,
        [
          nextSession.state,
          nextSession.deviceName,
          nextSession.linkedAt ? new Date(nextSession.linkedAt) : null,
          nextSession.lastSeenAt ? new Date(nextSession.lastSeenAt) : null,
          nextSession.qrPending ? 1 : 0,
          nextSession.qrCode,
          new Date(nextSession.updatedAt),
        ]
      );
    }

    return nextSession;
  }

  // Create Express app
  const app = createApp({ env, wa, sessionRef, persistFn: persist, usingMysql, retryQueue });

  // Create HTTP server
  const httpServer = createHttpServer(app);

  // Create Socket.io server
  const io = createSocketServer(httpServer, env.CORS_ORIGIN);

  // WhatsApp adapter event handlers
  wa.onStateChange((snapshot) => {
    void persist(createSessionRecord(sessionRef.current, {
      state: snapshot.state,
      deviceName: snapshot.deviceName,
      linkedAt: snapshot.linkedAt,
      lastSeenAt: snapshot.lastSeenAt,
      qrPending: snapshot.state === "connecting" && Boolean(snapshot.qrCode),
      qrCode: snapshot.qrCode,
    }))
      .then((nextSession) => {
        emitSessionUpdate(io, {
          ...nextSession,
          session: nextSession.state,
          device_name: nextSession.deviceName,
          linked_at: nextSession.linkedAt,
          last_seen_at: nextSession.lastSeenAt,
          qr_pending: nextSession.qrPending,
          qr_code: nextSession.qrCode,
        });
        void notifyLaravel({
          baseUrl: env.LARAVEL_API_BASE_URL,
          secret: env.SERVICE_TO_SERVICE_SECRET,
          path: "/internal/whatsapp/session",
          body: {
            session: nextSession.state,
            device_name: nextSession.deviceName,
            linked_at: nextSession.linkedAt,
            last_seen_at: nextSession.lastSeenAt,
          },
        });
      })
      .catch((error) => logger.error({ err: error }, "failed to persist whatsapp session state"));
  });

  wa.onMessage((message) => {
    emitIncomingMessage(io, message);

    // Enqueue for async processing if queues are available
    if (messageQueue) {
      messageQueue.add("send", {
        from: message.from,
        body: message.body,
        waMessageId: message.waMessageId,
        timestamp: message.timestamp,
      }).catch((err) => logger.error({ err: err }, "failed to enqueue incoming message"));
    }

    void notifyLaravel({
      baseUrl: env.LARAVEL_API_BASE_URL,
      secret: env.SERVICE_TO_SERVICE_SECRET,
      path: "/internal/whatsapp/messages",
      body: {
        from: message.from,
        body: message.body,
        wa_message_id: message.waMessageId,
        timestamp: message.timestamp,
      },
    });
  });

  return { app, httpServer, io, messageQueue, mediaQueue, retryQueue, msgWorker, mediaW };
}
