// client/src/lib/chat-api.ts
//
// Phase 4A-3a-3 — public web chat API client.
//
// Mirrors server/workflows/chat-host.ts (PublicMessage) and server/workflows/
// chat-tick.ts (ChatState, ChatAwaiting). Do NOT import from server/ here — that
// would pull zod/Buffer into the browser (same rule as workflow-sandbox.ts).
//
// Deliberately does NOT use the shared `apiRequest` helper from queryClient.ts:
// that helper throws without exposing the HTTP status code, and this page must
// distinguish 401 (expired) / 404 (link gone) / 409 (busy | not_awaiting_text) /
// 410 (ended) / 429 (rate limit). Same reason share-api.ts hand-rolls its fetches.
//
// Six endpoints, all under /api/public/chat:
//   POST /:token/session   → 201 create | 200 replay | 404 | 429 | 503
//   GET  /session          → session + last 200 messages            (401 for ended!)
//   POST /session/message  → { messages, status, awaiting }          (410 when ended)
//   GET  /session/messages → { messages, nextSinceId, status, ... }  (410 when ended)
//   POST /session/restart  → { messages, status, awaiting }          (410 when ended)
//   POST /session/end      → { ok: true } — always 200, idempotent
//
// Only the poll returns `nextSinceId`. Every other response must be advanced with
// `maxMessageId(...)`, otherwise the poll cursor would replay the visitor's own row.

import type { SandboxBubbleType } from "@/lib/workflow-sandbox";

// ---------------------------------------------------------------------------
// Types (public projection — see server/workflows/chat-host.ts:64-70)
// ---------------------------------------------------------------------------

export type ChatRole = "visitor" | "bot" | "system";

/** Derived server-side from the current cursor; never stored on the session row. */
export type ChatStatus = "awaiting_input" | "done" | "stopped";

/** `kind` is the render discriminator; `payload` is a flattened bubble. */
export interface ChatAwaiting {
  kind: "text" | "button";
}

export interface ChatMessage {
  id: number;
  role: ChatRole;
  kind: SandboxBubbleType;
  /** Flattened SandboxMessage: text/headerText/footerText/buttons/sections/cards/media… */
  payload: Record<string, any>;
  createdAt: string;
}

/** Safe public metadata for the instructional panel (workflow/link identity). */
export interface ChatPageMeta {
  workflowName: string | null;
  linkLabel: string | null;
}

export interface ChatSessionResponse {
  sessionId: number;
  startedAt: string;
  expiresAt: string | null;
  messages: ChatMessage[];
  status: ChatStatus;
  awaiting: ChatAwaiting | null;
  /** GET /session only. */
  canRestart?: boolean;
  meta?: ChatPageMeta;
  serverTime: string;
}

export interface ChatMessagesResponse {
  messages: ChatMessage[];
  nextSinceId: number;
  status: ChatStatus;
  awaiting: ChatAwaiting | null;
  serverTime: string;
}

/** POST /session/message and POST /session/restart share this shape. */
export interface ChatActionResponse {
  messages: ChatMessage[];
  status: ChatStatus;
  awaiting: ChatAwaiting | null;
  serverTime: string;
}

export type ChatSendInput =
  | { type: "text"; text: string }
  | { type: "button"; buttonId: string };

export type ChatSendPayload = ChatSendInput & { clientMsgId: string };

export const CHAT_TEXT_MAX = 2000;

// ---------------------------------------------------------------------------
// Errors + transport
// ---------------------------------------------------------------------------

export class ChatApiError extends Error {
  /** 0 = network failure or our own timeout (no HTTP status was received). */
  status: number;
  /** Seconds, from the Retry-After header (present on 429, and 1 on 409 busy). */
  retryAfter?: number;
  body?: unknown;

  constructor(status: number, message: string, retryAfter?: number, body?: unknown) {
    super(message);
    this.name = "ChatApiError";
    this.status = status;
    this.retryAfter = retryAfter;
    this.body = body;
  }
}

const BASE = "/api/public/chat";
const REQUEST_TIMEOUT_MS = 15_000;

/** Parse the Retry-After header as integer seconds (undefined if absent/invalid). */
export function parseRetryAfter(res: Response): number | undefined {
  const raw = res.headers.get("Retry-After");
  if (!raw) return undefined;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

async function toChatApiError(res: Response): Promise<ChatApiError> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = { error: res.statusText };
  }
  const obj = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const msg = obj.error ?? obj.message ?? res.statusText ?? `Request failed (${res.status})`;
  return new ChatApiError(res.status, String(msg), parseRetryAfter(res), body);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers as Record<string, string> | undefined),
      },
    });
  } catch (e) {
    if ((e as any)?.name === "AbortError") {
      throw new ChatApiError(0, "Request timed out — check your connection and try again.");
    }
    throw new ChatApiError(0, "Network error — check your connection and try again.");
  } finally {
    clearTimeout(timeoutId);
  }

  if (res.ok) return (await res.json()) as T;
  throw await toChatApiError(res);
}

// ---------------------------------------------------------------------------
// The six endpoints
// ---------------------------------------------------------------------------

/** 201 = new session, 200 = existing cookie replayed with its transcript. */
export function bootstrapChat(token: string): Promise<ChatSessionResponse> {
  return request(`/${encodeURIComponent(token)}/session`, { method: "POST" });
}

/** Reload: session metadata + last 200 messages. Returns 401 (not 410) when ended. */
export function fetchChatSession(): Promise<ChatSessionResponse> {
  return request("/session");
}

/** Poll: the only endpoint that returns `nextSinceId`. */
export function fetchChatMessages(sinceId: number, limit = 50): Promise<ChatMessagesResponse> {
  const since = Math.max(0, Math.floor(Number.isFinite(sinceId) ? sinceId : 0));
  const size = Math.min(200, Math.max(1, Math.floor(limit)));
  return request(`/session/messages?sinceId=${since}&limit=${size}`);
}

export function sendChatMessage(input: ChatSendPayload): Promise<ChatActionResponse> {
  return request("/session/message", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Preserves the transcript: the response contains only the NEW entry-node rows. */
export function restartChat(): Promise<ChatActionResponse> {
  return request("/session/restart", { method: "POST" });
}

/**
 * Always 200 server-side, even on a double-end or end-after-expiry (AC #12).
 * A transport failure is swallowed: the visitor asked to leave, so the UI must
 * show the ended screen either way.
 */
export async function endChat(): Promise<{ ok: true }> {
  try {
    return await request<{ ok: true }>("/session/end", { method: "POST" });
  } catch {
    return { ok: true };
  }
}

// ---------------------------------------------------------------------------
// Busy retry (per-session mutex → 409 + Retry-After: 1)
// ---------------------------------------------------------------------------

const BUSY_RETRY_DELAYS_MS = [700, 1500, 3000];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isBusyError(e: unknown): boolean {
  return e instanceof ChatApiError && e.status === 409 && e.message === "busy";
}

/**
 * A click while the previous run is still executing returns `409 busy`. This is
 * not an error the visitor caused, so retry silently — with the SAME clientMsgId,
 * which makes the server replay the stored rows instead of running the flow twice.
 */
async function withBusyRetry<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run();
    } catch (e) {
      if (!isBusyError(e) || attempt >= BUSY_RETRY_DELAYS_MS.length) throw e;
      await delay(BUSY_RETRY_DELAYS_MS[attempt]);
    }
  }
}

export function sendWithBusyRetry(input: ChatSendPayload): Promise<ChatActionResponse> {
  return withBusyRetry(() => sendChatMessage(input));
}

export function restartWithBusyRetry(): Promise<ChatActionResponse> {
  return withBusyRetry(() => restartChat());
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** 36 chars (UUID v4) — the server accepts 8..64. Stable across retries. */
export function newClientMsgId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Highest id in a batch, never below `fallback` (ids are monotonic per session). */
export function maxMessageId(messages: ChatMessage[] | undefined, fallback = 0): number {
  let max = fallback;
  for (const m of messages ?? []) {
    if (m && Number.isFinite(m.id) && m.id > max) max = m.id;
  }
  return max;
}

/**
 * Id-keyed merge, ascending. A poll that overlaps a send can return rows the POST
 * response already appended; last write wins, so the transcript never duplicates.
 */
export function mergeMessages(prev: ChatMessage[], batch: ChatMessage[] | undefined): ChatMessage[] {
  if (!batch || batch.length === 0) return prev;
  if (prev.length === 0) return [...batch].sort((a, b) => a.id - b.id);

  const byId = new Map<number, ChatMessage>();
  for (const m of prev) byId.set(m.id, m);
  for (const m of batch) byId.set(m.id, m);
  return Array.from(byId.values()).sort((a, b) => a.id - b.id);
}

/** Retry-After in seconds, clamped to a sane fallback when the header is absent. */
export function retryAfterSeconds(e: ChatApiError, fallback = 60): number {
  const n = e?.retryAfter;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : fallback;
}
