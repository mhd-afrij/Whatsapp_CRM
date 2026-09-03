import { Router } from "express";
import { sendMessage } from "../controllers/messageController.js";

/**
 * @param {object} options
 * @param {object} options.wa - WhatsApp adapter
 * @param {object} [options.retryQueue] - BullMQ retry queue for failed messages
 * @returns {Router}
 */
export function createMessageRoutes({ wa, retryQueue }) {
  const router = Router();

  router.post("/send", async (req, res) => {
    const to = typeof req.body?.to === "string" ? req.body.to.trim() : "";
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";

    if (!to || !text) {
      res.status(422).json({ message: "'to' and 'text' are required." });
      return;
    }

    try {
      const result = await sendMessage({ to, text, wa });
      res.status(200).json(result);
    } catch (error) {
      // If send fails and retry queue is available, enqueue for retry
      if (retryQueue) {
        await retryQueue.add("retry-send", { to, text }, { delay: 5000 }).catch(() => {});
      }
      res.status(409).json({ message: error instanceof Error ? error.message : "Failed to send message." });
    }
  });

  return router;
}
