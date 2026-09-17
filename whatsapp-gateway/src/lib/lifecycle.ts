/**
 * Process-level lifecycle flag (Phase 6.6 - graceful shutdown).
 *
 * Both the HTTP layer (app.ts) and the bootstrap (index.ts) need to agree on
 * whether the process is draining. Keeping the flag in its own module avoids a
 * circular import between the Express app and the entrypoint, and gives the
 * internal API a single place to check "may this operation still be accepted?".
 *
 * The flag is intentionally monotonic: once the process starts shutting down it
 * never flips back, so a half-drained gateway can never resume accepting
 * account-sensitive operations.
 */
let shuttingDown = false;

/** Marks the process as draining. Called once, on SIGTERM/SIGINT. */
export function markShuttingDown(): void {
  shuttingDown = true;
}

/** True once the process has begun graceful shutdown. */
export function isShuttingDown(): boolean {
  return shuttingDown;
}

/** Test-only: resets the flag so each spec starts from a clean process state. */
export function resetShutdownStateForTests(): void {
  shuttingDown = false;
}