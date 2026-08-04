import { describe, it, expect, vi, afterEach } from 'vitest';
import { computeBackoffDelayMs } from './backoff';

/**
 * Phase 18 gap fill: backoff.ts had zero direct test coverage before this,
 * despite being shared across the reconnect, media-download, and send-message
 * retry paths.
 */
describe('computeBackoffDelayMs', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('grows exponentially with attempt number (jitter stripped via Math.random=0)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    expect(computeBackoffDelayMs(1)).toBe(2_000);
    expect(computeBackoffDelayMs(2)).toBe(4_000);
    expect(computeBackoffDelayMs(3)).toBe(8_000);
    expect(computeBackoffDelayMs(4)).toBe(16_000);
  });

  it('never exceeds maxMs even at very high attempt numbers', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const delay = computeBackoffDelayMs(100, { maxMs: 60_000 });
    expect(delay).toBe(60_000);
  });

  it('caps exactly at the max-retry boundary (attempt where exponential first hits maxMs)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    // base 2000, doubling: 2000,4000,8000,16000,32000,64000(capped to maxMs=60000)
    const atCap = computeBackoffDelayMs(6, { baseMs: 2_000, maxMs: 60_000 });
    const justBelowCap = computeBackoffDelayMs(5, { baseMs: 2_000, maxMs: 60_000 });

    expect(atCap).toBe(60_000);
    expect(justBelowCap).toBe(32_000);
  });

  it('treats attempt <= 1 as the first attempt (no negative exponent)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    expect(computeBackoffDelayMs(0)).toBe(2_000);
    expect(computeBackoffDelayMs(-5)).toBe(2_000);
  });

  it('adds jitter within [0, jitterRatio] of the exponential value', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1); // max jitter

    const delay = computeBackoffDelayMs(1, { baseMs: 1_000, jitterRatio: 0.5 });
    // exponential = 1000, jitter = 1 * 1000 * 0.5 = 500 -> 1500
    expect(delay).toBe(1_500);
  });

  it('defaults jitterRatio to 0.2 when not provided', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);

    const delay = computeBackoffDelayMs(1, { baseMs: 1_000 });
    expect(delay).toBe(1_200);
  });
});
