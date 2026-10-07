import type { Request } from "express";

// ---------------------------------------------------------------------------
// Feature 3 — in-memory rate limiting for the public share-link auth endpoint.
// Token-level lockout (brute force) + IP-level throttle (distributed attempts).
// State is per-process and resets on restart (acceptable for a single-instance
// fork-mode deployment).
// ---------------------------------------------------------------------------

const MAX_FAILS = 10;
const LOCKOUT_MS = 15 * 60 * 1000;
const IP_MAX = 20;
const IP_WINDOW_MS = 5 * 60 * 1000;

interface TokenState {
  failCount: number;
  lockedUntil: number | null;
}
const tokenStates = new Map<string, TokenState>();

interface IpState {
  count: number;
  windowStart: number;
}
const ipStates = new Map<string, IpState>();

// nginx sets X-Forwarded-For; Express (`trust proxy = 1`) already honors it.
export function getClientIp(req: Request): string {
  return req.ip || "unknown";
}

export function checkTokenLocked(tokenHash: string): { locked: boolean; retryAfter?: number } {
  const s = tokenStates.get(tokenHash);
  if (!s || s.lockedUntil === null) return { locked: false };
  const now = Date.now();
  if (now >= s.lockedUntil) {
    tokenStates.delete(tokenHash); // lazy expiry
    return { locked: false };
  }
  return { locked: true, retryAfter: Math.ceil((s.lockedUntil - now) / 1000) };
}

export function recordTokenFailure(tokenHash: string): void {
  const s = tokenStates.get(tokenHash) ?? { failCount: 0, lockedUntil: null };
  s.failCount += 1;
  if (s.failCount >= MAX_FAILS) {
    s.lockedUntil = Date.now() + LOCKOUT_MS;
    s.failCount = 0;
  }
  tokenStates.set(tokenHash, s);
}

export function recordTokenSuccess(tokenHash: string): void {
  tokenStates.delete(tokenHash);
}

export function checkIpThrottled(ip: string): { throttled: boolean; retryAfter?: number } {
  const s = ipStates.get(ip);
  if (!s) return { throttled: false };
  const now = Date.now();
  if (now - s.windowStart >= IP_WINDOW_MS) {
    ipStates.delete(ip); // lazy expiry
    return { throttled: false };
  }
  if (s.count >= IP_MAX) {
    return { throttled: true, retryAfter: Math.ceil((s.windowStart + IP_WINDOW_MS - now) / 1000) };
  }
  return { throttled: false };
}

export function recordIpAttempt(ip: string): void {
  const now = Date.now();
  const s = ipStates.get(ip);
  if (!s || now - s.windowStart >= IP_WINDOW_MS) {
    ipStates.set(ip, { count: 1, windowStart: now });
  } else {
    s.count += 1;
  }
}

// Periodic sweep to keep the maps bounded (lazy expiry on access covers the hot path).
setInterval(() => {
  const now = Date.now();
  tokenStates.forEach((v, k) => {
    if (v.lockedUntil !== null && now >= v.lockedUntil) tokenStates.delete(k);
  });
  ipStates.forEach((v, k) => {
    if (now - v.windowStart >= IP_WINDOW_MS) ipStates.delete(k);
  });
}, 10 * 60 * 1000).unref();
