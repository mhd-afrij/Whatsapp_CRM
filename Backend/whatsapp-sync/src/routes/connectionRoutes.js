import { Router } from "express";
import {
  getSessionStatus,
  generateQr,
  unlinkSession,
  heartbeat,
} from "../controllers/connectionController.js";

/**
 * @param {object} options
 * @param {object} options.sessionRef - Object with .current property for session state
 * @param {object} options.wa - WhatsApp adapter
 * @param {Function} options.persistFn - Persist function
 * @returns {Router}
 */
export function createConnectionRoutes({ sessionRef, wa, persistFn }) {
  const router = Router();

  router.get("/status", (_req, res) => {
    res.status(200).json(getSessionStatus({ session: sessionRef.current, wa }));
  });

  router.post("/qr", async (_req, res) => {
    try {
      const result = await generateQr({ session: sessionRef.current, wa, persist: persistFn });
      sessionRef.current = result.data;
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  router.post("/unlink", async (_req, res) => {
    try {
      const result = await unlinkSession({ session: sessionRef.current, wa, persist: persistFn });
      sessionRef.current = result.data;
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  router.post("/heartbeat", async (_req, res) => {
    try {
      const result = await heartbeat({ session: sessionRef.current, wa, persist: persistFn });
      sessionRef.current = result.data;
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  return router;
}
