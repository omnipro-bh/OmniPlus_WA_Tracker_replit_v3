/**
 * Phase 4A-3a-2 — in-memory rate limiting for the public web chat endpoints.
 *
 * Five logical buckets (six maps — the message bucket is evaluated against a
 * sustained window *and* a short burst window, per the approved design §6):
 *
 *   messages  30 / 60s  +  5 / 5s burst   per session   (and 300 / 5min per workflow)
 *   polls     120 / 60s                   per session
 *   sessions  10 / hour                   per IP
 *   restarts  5 / hour                    per session
 *
 * Mirrors server/share-rate-limit.ts: separate Maps per scope, lazy expiry on
 * access, one unref'd sweep. State is per-process and resets on restart — the
 * app runs as a single PM2 fork instance, so this is documented and accepted
 * (same limitation as share-rate-limit.ts and sandbox-rate-limit.ts).
 *
 * Polls deliberately do NOT consume the message budget: a 2s poll cadence is
 * 30 req/min on its own, which would exhaust a shared bucket instantly.
 */

const MSG_MAX = 30;
const MSG_WINDOW_MS = 60 * 1000;

const MSG_BURST_MAX = 5;
const MSG_BURST_WINDOW_MS = 5 * 1000;

const POLL_MAX = 120;
const POLL_WINDOW_MS = 60 * 1000;

const IP_MAX = 10;
const IP_WINDOW_MS = 60 * 60 * 1000;

const WF_MAX = 300;
const WF_WINDOW_MS = 5 * 60 * 1000;

const RESTART_MAX = 5;
const RESTART_WINDOW_MS = 60 * 60 * 1000;

interface BucketState {
  count: number;
  windowStart: number;
}

export type ChatRateLimitBucket = "messages" | "burst" | "workflow" | "polls" | "sessions" | "restarts";

export interface ThrottleVerdict {
  throttled: boolean;
  /** Seconds until the window resets — for the Retry-After header. */
  retryAfter?: number;
  bucket?: ChatRateLimitBucket;
}

const msgStates = new Map<number, BucketState>(); // sessionId
const msgBurst = new Map<number, BucketState>(); // sessionId
const pollStates = new Map<number, BucketState>(); // sessionId
const ipStates = new Map<string, BucketState>(); // ip
const wfStates = new Map<number, BucketState>(); // workflowId
const restartStates = new Map<number, BucketState>(); // sessionId

const OPEN: ThrottleVerdict = { throttled: false };

/** Window is over → drop the entry (lazy expiry) and report not-throttled. */
function windowExpired(state: BucketState | undefined, windowMs: number, now: number): boolean {
  return !state || now - state.windowStart >= windowMs;
}

function evaluate(
  state: BucketState | undefined,
  max: number,
  windowMs: number,
  bucket: ChatRateLimitBucket,
  now: number
): ThrottleVerdict {
  if (windowExpired(state, windowMs, now)) return OPEN;
  if (state!.count < max) return OPEN;
  return {
    throttled: true,
    retryAfter: Math.max(1, Math.ceil((state!.windowStart + windowMs - now) / 1000)),
    bucket,
  };
}

/** Pick the verdict with the longest wait, so Retry-After reflects the binding limit. */
function worst(a: ThrottleVerdict, b: ThrottleVerdict): ThrottleVerdict {
  if (!a.throttled) return b;
  if (!b.throttled) return a;
  return (b.retryAfter ?? 0) > (a.retryAfter ?? 0) ? b : a;
}

function bump<K>(map: Map<K, BucketState>, key: K, windowMs: number, now: number): void {
  const state = map.get(key);
  if (!state || now - state.windowStart >= windowMs) {
    map.set(key, { count: 1, windowStart: now });
  } else {
    state.count += 1;
  }
}

// ---------------------------------------------------------------------------
// messages — per session (sustained + burst) and per workflow
// ---------------------------------------------------------------------------

export function checkMessageThrottled(sessionId: number, workflowId: number): ThrottleVerdict {
  const now = Date.now();
  return [
    evaluate(msgStates.get(sessionId), MSG_MAX, MSG_WINDOW_MS, "messages", now),
    evaluate(msgBurst.get(sessionId), MSG_BURST_MAX, MSG_BURST_WINDOW_MS, "burst", now),
    evaluate(wfStates.get(workflowId), WF_MAX, WF_WINDOW_MS, "workflow", now),
  ].reduce(worst, OPEN);
}

export function recordMessage(sessionId: number, workflowId: number): void {
  const now = Date.now();
  bump(msgStates, sessionId, MSG_WINDOW_MS, now);
  bump(msgBurst, sessionId, MSG_BURST_WINDOW_MS, now);
  bump(wfStates, workflowId, WF_WINDOW_MS, now);
}

// ---------------------------------------------------------------------------
// polls — per session
// ---------------------------------------------------------------------------

export function checkPollThrottled(sessionId: number): ThrottleVerdict {
  const now = Date.now();
  // Opportunistic cleanup so a hot session never retains a stale window.
  if (windowExpired(pollStates.get(sessionId), POLL_WINDOW_MS, now)) pollStates.delete(sessionId);
  return evaluate(pollStates.get(sessionId), POLL_MAX, POLL_WINDOW_MS, "polls", now);
}

export function recordPoll(sessionId: number): void {
  bump(pollStates, sessionId, POLL_WINDOW_MS, Date.now());
}

// ---------------------------------------------------------------------------
// new sessions — per IP
// ---------------------------------------------------------------------------

export function checkIpSessionThrottled(ip: string): ThrottleVerdict {
  const now = Date.now();
  if (windowExpired(ipStates.get(ip), IP_WINDOW_MS, now)) ipStates.delete(ip);
  return evaluate(ipStates.get(ip), IP_MAX, IP_WINDOW_MS, "sessions", now);
}

export function recordIpSession(ip: string): void {
  bump(ipStates, ip, IP_WINDOW_MS, Date.now());
}

// ---------------------------------------------------------------------------
// restarts — per session
// ---------------------------------------------------------------------------

export function checkRestartThrottled(sessionId: number): ThrottleVerdict {
  const now = Date.now();
  if (windowExpired(restartStates.get(sessionId), RESTART_WINDOW_MS, now)) {
    restartStates.delete(sessionId);
  }
  return evaluate(restartStates.get(sessionId), RESTART_MAX, RESTART_WINDOW_MS, "restarts", now);
}

export function recordRestart(sessionId: number): void {
  bump(restartStates, sessionId, RESTART_WINDOW_MS, Date.now());
}

// ---------------------------------------------------------------------------
// Periodic sweep to keep the maps bounded (lazy expiry covers the hot path).
// ---------------------------------------------------------------------------

setInterval(() => {
  const now = Date.now();

  const sweepNumberMap = (map: Map<number, BucketState>, windowMs: number) => {
    map.forEach((v, k) => {
      if (now - v.windowStart >= windowMs) map.delete(k);
    });
  };

  sweepNumberMap(msgStates, MSG_WINDOW_MS);
  sweepNumberMap(msgBurst, MSG_BURST_WINDOW_MS);
  sweepNumberMap(pollStates, POLL_WINDOW_MS);
  sweepNumberMap(wfStates, WF_WINDOW_MS);
  sweepNumberMap(restartStates, RESTART_WINDOW_MS);

  ipStates.forEach((v, k) => {
    if (now - v.windowStart >= IP_WINDOW_MS) ipStates.delete(k);
  });
}, 10 * 60 * 1000).unref();
