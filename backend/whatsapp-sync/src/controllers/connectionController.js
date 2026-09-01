import { createSessionRecord } from "../services/sessionService.js";
import { logger } from "../config/logger.js";

/**
 * Get the current session status.
 * @param {object} options
 * @param {object} options.session - Current session record
 * @param {object} options.wa - WhatsApp adapter
 * @returns {object} Session status response
 */
export function getSessionStatus({ session, wa }) {
  const snapshot = wa.snapshot();
  return {
    status: snapshot.state === "linked" ? "healthy" : snapshot.state === "connecting" ? "degraded" : "unavailable",
    service: "whatsapp-sync",
    session: snapshot.state,
    state: snapshot.state,
    device_name: snapshot.deviceName,
    linked_at: snapshot.linkedAt,
    last_seen_at: snapshot.lastSeenAt,
    qr_pending: snapshot.state === "connecting" && Boolean(snapshot.qrCode),
    qr_code: snapshot.qrCode,
    persistence: "mysql",
  };
}

/**
 * Generate QR code for pairing.
 * @param {object} options
 * @param {object} options.session - Current session record
 * @param {object} options.wa - WhatsApp adapter
 * @param {Function} options.persist - Persist session function
 * @returns {Promise<object>} QR response
 */
export async function generateQr({ session, wa, persist }) {
  const snapshot = await wa.connect();
  const nextSession = createSessionRecord(session, {
    state: snapshot.state,
    deviceName: snapshot.deviceName,
    linkedAt: snapshot.linkedAt,
    lastSeenAt: snapshot.lastSeenAt,
    qrPending: snapshot.state === "connecting" && Boolean(snapshot.qrCode),
    qrCode: snapshot.qrCode,
  });
  await persist(nextSession);
  return {
    data: sessionPayload(nextSession),
    message: nextSession.qrCode
      ? "QR code ready."
      : "Pairing started. The QR code will follow shortly over the session:update event.",
  };
}

/**
 * Unlink WhatsApp session.
 * @param {object} options
 * @param {object} options.session - Current session record
 * @param {object} options.wa - WhatsApp adapter
 * @param {Function} options.persist - Persist session function
 * @returns {Promise<object>} Unlink response
 */
export async function unlinkSession({ session, wa, persist }) {
  await wa.logout();
  const snapshot = wa.snapshot();
  const nextSession = createSessionRecord(session, {
    state: snapshot.state,
    deviceName: snapshot.deviceName,
    linkedAt: snapshot.linkedAt,
    lastSeenAt: snapshot.lastSeenAt,
    qrPending: false,
    qrCode: null,
  });
  await persist(nextSession);
  return { data: sessionPayload(nextSession), message: "Session unlinked." };
}

/**
 * Record heartbeat.
 * @param {object} options
 * @param {object} options.session - Current session record
 * @param {object} options.wa - WhatsApp adapter
 * @param {Function} options.persist - Persist session function
 * @returns {Promise<object>} Heartbeat response
 */
export async function heartbeat({ session, wa, persist }) {
  wa.heartbeat();
  const nextSession = createSessionRecord(session, {
    lastSeenAt: new Date().toISOString(),
  });
  await persist(nextSession);
  return { data: sessionPayload(nextSession), message: "Heartbeat recorded." };
}

/**
 * Format session record for API response.
 * @param {object} session
 * @returns {object}
 */
export function sessionPayload(session) {
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
