import express from "express";
import cors from "cors";
import { createServer as createHttpServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import mysql from "mysql2/promise";
import type { Env } from "./config/env.js";
import { logger } from "./observability/logger.js";
import { createSessionRecord, type SyncSessionRecord } from "./session-store.js";
import { createWhatsAppAdapter, type WhatsAppConnectionSnapshot } from "./whatsapp-adapter.js";

function statusFromSession(session: SyncSessionRecord) {
  return session.state === "linked" ? "healthy" : session.state === "connecting" ? "degraded" : "unavailable";
}

interface SessionRow extends mysql.RowDataPacket {
  state: SyncSessionRecord["state"];
  device_name: string | null;
  linked_at: Date | string | null;
  last_seen_at: Date | string | null;
  qr_pending: number | boolean;
  qr_code: string | null;
  updated_at: Date | string;
}

function sessionPayload(session: SyncSessionRecord) {
  return {
    ...session,
    session: session.state,
    device_name: session.deviceName,
    linked_at: session.linkedAt,
    last_seen_at: session.lastSeenAt,
    qr_pending: session.qrPending,
    qr_code: session.qrCode,
  };
}

const fallbackSessionKey = Symbol.for("whatsapp-sync.fallback-session");
const fallbackSession = globalThis as typeof globalThis & {
  [fallbackSessionKey]?: SyncSessionRecord;
};

export async function createServer(env: Env) {
  const app = express();
  const wa = await createWhatsAppAdapter({ authDir: env.WHATSAPP_AUTH_DIR, logger });
  let session = createSessionRecord(
    fallbackSession[fallbackSessionKey] ?? {
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
  let pool: mysql.Pool | null = null;

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
    const [rows] = await pool.query<SessionRow[]>(
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
  } catch (error) {
    if (env.STRICT_MYSQL_ONLY || env.NODE_ENV === "production") {
      throw error;
    }

    logger.warn({ err: error }, "mysql unavailable, using in-memory sync session store");
    fallbackSession[fallbackSessionKey] = session;
  }

  app.use(cors({ origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(",") }));
  app.use(express.json());

  if (!env.SERVICE_TO_SERVICE_SECRET && env.NODE_ENV === "production") {
    throw new Error("SERVICE_TO_SERVICE_SECRET must be set in production");
  }

  app.use("/internal", (req, res, next) => {
    const secret = env.SERVICE_TO_SERVICE_SECRET;
    if (!secret) {
      logger.warn({ path: req.path }, "internal route accessed without SERVICE_TO_SERVICE_SECRET configured");
      next();
      return;
    }
    const provided = req.get("x-internal-secret");
    if (provided !== secret) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    next();
  });

  app.use(async (_req, _res, next) => {
    if (usingMysql && pool) {
      const [rows] = await pool.query<SessionRow[]>(
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
    }
    next();
  });

  async function persist(nextSession: SyncSessionRecord) {
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
    } else {
      fallbackSession[fallbackSessionKey] = nextSession;
    }
    return nextSession;
  }

  function fromSnapshot(snapshot: WhatsAppConnectionSnapshot): Partial<SyncSessionRecord> {
    return {
      state: snapshot.state,
      deviceName: snapshot.deviceName,
      linkedAt: snapshot.linkedAt,
      lastSeenAt: snapshot.lastSeenAt,
      qrPending: snapshot.state === "connecting" && Boolean(snapshot.qrCode),
      qrCode: snapshot.qrCode,
    };
  }

  const httpServer = createHttpServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: { origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(",") },
  });

  async function notifyLaravel(path: string, body: unknown) {
    if (!env.SERVICE_TO_SERVICE_SECRET) return;
    try {
      const response = await fetch(`${env.LARAVEL_API_BASE_URL}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": env.SERVICE_TO_SERVICE_SECRET,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        logger.warn({ path, status: response.status }, "laravel webhook call failed");
      }
    } catch (error) {
      logger.warn({ err: error, path }, "laravel webhook call errored");
    }
  }

  wa.onStateChange((snapshot) => {
    void persist(createSessionRecord(session, fromSnapshot(snapshot)))
      .then((nextSession) => {
        io.emit("session:update", sessionPayload(nextSession));
        void notifyLaravel("/internal/whatsapp/session", {
          session: nextSession.state,
          device_name: nextSession.deviceName,
          linked_at: nextSession.linkedAt,
          last_seen_at: nextSession.lastSeenAt,
        });
      })
      .catch((error) => logger.error({ err: error }, "failed to persist whatsapp session state"));
  });

  wa.onMessage((message) => {
    io.emit("message:incoming", message);
    void notifyLaravel("/internal/whatsapp/messages", {
      from: message.from,
      body: message.body,
      wa_message_id: message.waMessageId,
      timestamp: message.timestamp,
    });
  });

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", service: "whatsapp-sync" });
  });

  app.get("/ready", (_req, res) => {
    const status = statusFromSession(session);
    res.status(status === "healthy" ? 200 : 503).json({
      status: status === "healthy" ? "ready" : "degraded",
      service: "whatsapp-sync",
      session: session.state,
      persistence: usingMysql ? "mysql" : "memory",
    });
  });

  app.get("/internal/v1/session/status", (_req, res) => {
    res.status(200).json({
      status: statusFromSession(session),
      service: "whatsapp-sync",
      session: session.state,
      state: session.state,
      device_name: session.deviceName,
      linked_at: session.linkedAt,
      last_seen_at: session.lastSeenAt,
      qr_pending: session.qrPending,
      qr_code: session.qrCode,
      persistence: usingMysql ? "mysql" : "memory",
    });
  });

  app.post("/internal/v1/session/qr", async (_req, res) => {
    const snapshot = await wa.connect();
    const nextSession = createSessionRecord(session, fromSnapshot(snapshot));
    await persist(nextSession);
    res.status(200).json({
      data: sessionPayload(nextSession),
      message: nextSession.qrCode
        ? "QR code ready."
        : "Pairing started. The QR code will follow shortly over the session:update event.",
    });
  });

  app.post("/internal/v1/session/unlink", async (_req, res) => {
    await wa.logout();
    const nextSession = createSessionRecord(session, fromSnapshot(wa.snapshot()));
    await persist(nextSession);
    res.status(200).json({ data: sessionPayload(nextSession), message: "Session unlinked." });
  });

  app.post("/internal/v1/session/heartbeat", async (_req, res) => {
    wa.heartbeat();
    const nextSession = createSessionRecord(session, {
      lastSeenAt: new Date().toISOString(),
    });
    await persist(nextSession);
    res.status(200).json({ data: sessionPayload(nextSession), message: "Heartbeat recorded." });
  });

  app.post("/internal/v1/messages/send", async (req, res) => {
    const to = typeof req.body?.to === "string" ? req.body.to.trim() : "";
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";

    if (!to || !text) {
      res.status(422).json({ message: "'to' and 'text' are required." });
      return;
    }

    const jid = to.includes("@") ? to : `${to.replace(/[^0-9]/g, "")}@s.whatsapp.net`;

    try {
      const sent = await wa.sendMessage(jid, text);
      res.status(200).json({ data: { id: sent.id, to: jid, text }, message: "Message sent." });
    } catch (error) {
      logger.warn({ err: error, jid }, "failed to send whatsapp message");
      res.status(409).json({ message: error instanceof Error ? error.message : "Failed to send message." });
    }
  });

  app.use((req, res) => {
    logger.warn({ path: req.path }, "route not found");
    res.status(404).json({ message: "Not found" });
  });

  return { app, httpServer, io };
}
