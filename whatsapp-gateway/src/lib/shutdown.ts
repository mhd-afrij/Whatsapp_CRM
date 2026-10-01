/**
 * Ordered graceful-shutdown primitives for the gateway process.
 *
 * This module owns EXECUTION policy only: it performs every cleanup step in the
 * order the system requires and never lets one failure abort the rest. It does
 * NOT decide how the process exits, and it never calls `process.exit` — the
 * caller (src/index.ts) owns process-level policy so this helper stays reusable
 * and testable.
 *
 * Ordering contract (see src/index.ts for the full documented sequence):
 *
 *   1. Queue workers are drained first. A worker must not start a new job
 *      against a WhatsApp socket that is about to be closed.
 *   2. Only then are the account ConnectionManagers stopped, which clears
 *      reconnect timers, closes each socket, and RELEASES the session lock
 *      WITHOUT deleting credentials — a normal restart must not force a re-pair.
 *
 * Every worker and every manager is attempted even if an earlier one throws. A
 * single broken WhatsApp session must never block the shutdown of the others,
 * because the caller's fallback is to force-exit and leave session locks held.
 */

export interface ShutdownWorker {
  close(): Promise<void>;
}

export interface ShutdownManager {
  stop(): Promise<void>;
}

/** A cleanup step that failed, with the context needed to identify it. */
export interface ShutdownFailure {
  /** Dotted name of the thing that failed, e.g. `workers[0]` or `managers.send`. */
  step: string;
  error: Error;
}

/**
 * Collected outcome of a shutdown attempt. `errors` is empty on a clean run, so
 * callers can log a single summary line and decide their own exit policy.
 */
export interface ShutdownResult {
  errors: ShutdownFailure[];
}

function toError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(String(reason));
}

/**
 * Drains queue workers, then stops account managers, attempting every step even
 * when an earlier one rejects.
 *
 * Returns the collected failures instead of throwing, so the caller can finish
 * the remaining shutdown steps and then decide what to do about them.
 */
export async function drainWorkersAndStopManagers(
  workers: readonly ShutdownWorker[],
  getManagers: () => readonly ShutdownManager[],
): Promise<ShutdownResult> {
  const errors: ShutdownFailure[] = [];

  // Step 1: drain the workers before touching any socket.
  const workerResults = await Promise.allSettled(
    workers.map((worker: ShutdownWorker) => worker.close()),
  );
  for (const [index, result] of workerResults.entries()) {
    if (result.status === 'rejected') {
      errors.push({ step: `workers[${index}]`, error: toError(result.reason) });
    }
  }

  // Step 2: managers, which release session locks. `getManagers` is called after
  // the drain so a worker failure cannot stop us from reaching this step.
  const managerResults = await Promise.allSettled(
    getManagers().map((manager: ShutdownManager) => manager.stop()),
  );
  for (const [index, result] of managerResults.entries()) {
    if (result.status === 'rejected') {
      errors.push({ step: `managers[${index}]`, error: toError(result.reason) });
    }
  }

  return { errors };
}