/**
 * Health check response.
 * @returns {object}
 */
export function healthCheck() {
  return { status: "ok", service: "whatsapp-sync" };
}

/**
 * Readiness check response.
 * @param {object} session - Current session record
 * @param {boolean} usingMysql - Whether using MySQL persistence
 * @returns {object} Readiness response
 */
export function readinessCheck(session, usingMysql) {
  const status = session.state === "linked" ? "healthy" : session.state === "connecting" ? "degraded" : "unavailable";
  return {
    status: status === "healthy" ? "ready" : "degraded",
    service: "whatsapp-sync",
    session: session.state,
    persistence: usingMysql ? "mysql" : "memory",
  };
}
