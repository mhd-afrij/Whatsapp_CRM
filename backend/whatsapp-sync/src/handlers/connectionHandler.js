import { logger } from "../config/logger.js";

/**
 * Handle Baileys connection state updates.
 * @param {object} update - Baileys connection.update payload
 * @param {object} state - Mutable state object
 * @param {Function} emitStateChange - Function to emit state changes
 * @returns {object|null} Action to take (e.g., { action: "reconnect" })
 */
export function handleConnectionUpdate(update, state, emitStateChange) {
  if (update.qr) {
    state.state = "connecting";
    state.qrCode = update.qr;
    emitStateChange();
  }

  if (update.connection === "open") {
    state.state = "linked";
    state.deviceName = state.deviceName || "WhatsApp Web";
    state.linkedAt ??= new Date().toISOString();
    state.lastSeenAt = new Date().toISOString();
    state.qrCode = null;
    emitStateChange();
    logger.info("whatsapp connection opened");
  }

  if (update.connection === "close") {
    const error = update.lastDisconnect?.error;
    const code =
      error && typeof error === "object" && "output" in error
        ? error.output?.statusCode
        : undefined;

    if (code === 8) {
      // loggedOut
      state.state = "unlinked";
      state.deviceName = null;
      state.qrCode = null;
      state.linkedAt = null;
      state.lastSeenAt = null;
      emitStateChange();
      logger.info("whatsapp session logged out");
    } else {
      state.state = "connecting";
      emitStateChange();
      logger.warn({ code }, "whatsapp socket disconnected, reconnecting");
      return { action: "reconnect" };
    }
  }

  return null;
}
