import { logger } from "../config/logger.js";
import { processIncomingMessage } from "../services/messageService.js";

/**
 * Handle incoming Baileys messages.
 * @param {object} payload - Baileys messages.upsert payload
 * @param {Function} onMessage - Callback for each valid incoming message
 * @param {object} state - Mutable state for updating lastSeenAt
 * @param {Function} emitStateChange - Function to emit state changes
 */
export function handleMessagesUpsert(payload, onMessage, state, emitStateChange) {
  if (payload?.type !== "notify") return;

  for (const msg of payload.messages ?? []) {
    const incoming = processIncomingMessage(msg);
    if (incoming) {
      state.lastSeenAt = new Date().toISOString();
      onMessage(incoming);
    }
  }

  emitStateChange();
}
