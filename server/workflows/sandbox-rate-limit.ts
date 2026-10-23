/**
 * Phase 4A-2b — in-memory rate limiting for the sandbox tick endpoint.
 *
 * Keyed by userId (unlike share-rate-limit.ts, which keys on token hash / IP /
 * link id). 60 ticks / 5 minutes per user. State is per-process and resets on
 * restart (acceptable for a single-instance fork-mode deployment).
 */

const TICK_MAX = 60;
const TICK_WINDOW_MS = 5 * 60 * 1000;

interface TickState {
  count: number;
  windowStart: number;
}
const tickStates = new Map<number, TickState>();

export function checkSandboxThrottled(
  userId: number
): { throttled: boolean; retryAfter?: number } {
  const s = tickStates.get(userId);
  if (!s) return { throttled: false };

  const now = Date.now();
  if (now - s.windowStart >= TICK_WINDOW_MS) {
    tickStates.delete(userId); // lazy expiry
    return { throttled: false };
  }

  if (s.count >= TICK_MAX) {
    return {
      throttled: true,
      retryAfter: Math.ceil((s.windowStart + TICK_WINDOW_MS - now) / 1000),
    };
  }

  return { throttled: false };
}

export function recordSandboxTick(userId: number): void {
  const now = Date.now();
  const s = tickStates.get(userId);
  if (!s || now - s.windowStart >= TICK_WINDOW_MS) {
    tickStates.set(userId, { count: 1, windowStart: now });
  } else {
    s.count += 1;
  }
}

// Periodic sweep to keep the map bounded (lazy expiry on access covers the hot path).
setInterval(() => {
  const now = Date.now();
  tickStates.forEach((v, k) => {
    if (now - v.windowStart >= TICK_WINDOW_MS) tickStates.delete(k);
  });
}, 10 * 60 * 1000).unref();
