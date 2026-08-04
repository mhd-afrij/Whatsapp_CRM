/**
 * Shared exponential-backoff-with-jitter calculator. Extracted from the
 * Phase-4 ConnectionManager reconnect logic so BullMQ processors (media
 * download, message send) can reuse the same formula instead of duplicating
 * it.
 */
export interface BackoffOptions {
  baseMs?: number;
  maxMs?: number;
  jitterRatio?: number;
}

export function computeBackoffDelayMs(attempt: number, options: BackoffOptions = {}): number {
  const baseMs = options.baseMs ?? 2_000;
  const maxMs = options.maxMs ?? 5 * 60_000;
  const jitterRatio = options.jitterRatio ?? 0.2;

  const exponential = Math.min(baseMs * 2 ** Math.max(attempt - 1, 0), maxMs);
  const jitter = Math.random() * exponential * jitterRatio;
  return Math.round(exponential + jitter);
}
