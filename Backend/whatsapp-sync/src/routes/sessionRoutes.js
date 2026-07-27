import { Router } from "express";

/**
 * @param {object} options
 * @param {object} options.sessionRef - Object with .current property
 * @param {boolean} options.usingMysql
 * @returns {Router}
 */
export function createSessionRoutes({ sessionRef, usingMysql }) {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", service: "whatsapp-sync" });
  });

  router.get("/ready", (_req, res) => {
    const session = sessionRef.current;
    const status = session.state === "linked" ? "healthy" : session.state === "connecting" ? "degraded" : "unavailable";
    res.status(status === "healthy" ? 200 : 503).json({
      status: status === "healthy" ? "ready" : "degraded",
      service: "whatsapp-sync",
      session: session.state,
      persistence: usingMysql ? "mysql" : "memory",
    });
  });

  return router;
}
