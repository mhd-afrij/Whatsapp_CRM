import express from "express";
import cors from "cors";
import { createConnectionRoutes } from "./routes/connectionRoutes.js";
import { createMessageRoutes } from "./routes/messageRoutes.js";
import { createSessionRoutes } from "./routes/sessionRoutes.js";
import { logger } from "./config/logger.js";

/**
 * Create and configure the Express application.
 * @param {object} options
 * @param {object} options.env - Environment config
 * @param {object} options.wa - WhatsApp adapter
 * @param {object} options.sessionRef - Object with .current property for session state
 * @param {Function} options.persistFn - Session persist function
 * @param {boolean} options.usingMysql - Whether using MySQL persistence
 * @param {object} [options.retryQueue] - BullMQ retry queue for failed messages
 * @returns {express.Application}
 */
export function createApp({ env, wa, sessionRef, persistFn, usingMysql, retryQueue }) {
  const app = express();

  app.use(cors({ origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(",") }));
  app.use(express.json());

  // Internal secret middleware
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

  // Session refresh middleware - reload session from DB on each request
  app.use(async (_req, _res, next) => {
    // This is handled in server.js with the pool
    next();
  });

  // Mount routes
  app.use("/health", createSessionRoutes({ sessionRef, usingMysql }));
  app.use("/ready", createSessionRoutes({ sessionRef, usingMysql }));
  app.use("/internal/v1/session", createConnectionRoutes({ sessionRef, wa, persistFn }));
  app.use("/internal/v1/messages", createMessageRoutes({ wa, retryQueue }));

  // 404 handler
  app.use((req, res) => {
    logger.warn({ path: req.path }, "route not found");
    res.status(404).json({ message: "Not found" });
  });

  return app;
}
