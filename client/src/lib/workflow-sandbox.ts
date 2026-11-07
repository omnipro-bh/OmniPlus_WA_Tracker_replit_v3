// client/src/lib/workflow-sandbox.ts
//
// Mirrors server/workflows/sandbox.ts and server/workflows/flowRunner.ts
// (types only) — the sandbox-tick contract is FROZEN at c97d3c5. Keep in sync.
// Do NOT import from server/ here (would pull zod/Buffer into the browser).

// --- enums from flowRunner.ts ---
export type RunStatus = "awaiting_input" | "done" | "stopped";
export type StopReason =
  | "no_next_node"
  | "node_not_found"
  | "step_limit"
  | "unsupported_node"
  | "error";
export type TraceOutcome =
  | "sent"
  | "evaluated"
  | "assigned"
  | "http"
  | "sheets"
  | "ai"
  | "awaiting"
  | "stopped"
  | "error";

export interface TraceEntry {
  seq: number;
  nodeId: string;
  nodeType: string;
  outcome: TraceOutcome;
  handle?: string | null;
  ms?: number;
  /** Structured extras (e.g. `{ result: true }` for a condition). Never raw captured text. */
  detail?: Record<string, any>;
}

// --- request ---
export type SandboxInputType = "start" | "button" | "text";

export interface SandboxTickInput {
  type: SandboxInputType;
  buttonId?: string;
  text?: string;
}

export interface SandboxTickParams {
  workflowId: number;
  definitionJson: { nodes: any[]; edges: any[] };
  entryNodeId?: string | null;
  cursor: string | null;
  context: Record<string, any>;
  input: SandboxTickInput;
  httpMode: "mock" | "live";
  /** AI Agent nodes: 'mock' (default) never calls a provider. */
  aiMode?: "mock" | "live";
  maxSteps?: number;
  /** Increment E — stable session key for KPI persistence. */
  sessionId?: string;
  /** Increment E — persist the AI trace so the KPI tab can read it. */
  saveExecution?: boolean;
}

// --- response ---
export type SandboxBubbleType =
  | "text"
  | "buttons"
  | "list"
  | "call_to_action_buttons"
  | "carousel"
  | "media"
  | "location";

export interface SandboxButton {
  id: string;
  title: string;
  type: string;
  phone_number?: string;
  url?: string;
  copy_code?: string;
}

export interface SandboxMessage {
  nodeId: string;
  nodeType: string;
  type: SandboxBubbleType;
  text?: string;
  headerText?: string;
  footerText?: string;
  buttons?: SandboxButton[];
  buttonLabel?: string;
  sections?: Array<{
    title: string;
    rows: Array<{ id: string; title: string; description: string }>;
  }>;
  cards?: Array<{
    id: string;
    media?: string;
    text?: string;
    buttons: SandboxButton[];
  }>;
  mediaType?: string;
  url?: string;
  caption?: string;
  lat?: number;
  lng?: number;
  name?: string;
  address?: string;
}

export interface SandboxAwaiting {
  kind: "text" | "button";
  nodeId: string;
}

export interface SandboxTickResponse {
  status: RunStatus;
  stopReason?: StopReason;
  cursor: string | null;
  context: Record<string, any>;
  messages: SandboxMessage[];
  awaiting: SandboxAwaiting | null;
  trace: TraceEntry[];
  steps: number;
  error: { message: string; nodeId: string | null } | null;
  /** Increment D — AI traces produced this tick (optional; absent for non-AI ticks). */
  aiTraces?: Record<string, any>[];
}

// --- error + transport ---
export class SandboxApiError extends Error {
  status: number;
  retryAfter?: number;
  constructor(status: number, message: string, retryAfter?: number) {
    super(message);
    this.name = "SandboxApiError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

function parseRetryAfter(res: Response): number | undefined {
  const raw = res.headers.get("Retry-After");
  if (!raw) return undefined;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export async function tick(params: SandboxTickParams): Promise<SandboxTickResponse> {
  const { workflowId, definitionJson, entryNodeId, cursor, context, input, httpMode, aiMode, maxSteps, sessionId, saveExecution } =
    params;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  let res: Response;
  try {
    res = await fetch(`/api/workflows/${workflowId}/sandbox-tick`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      signal: controller.signal,
      body: JSON.stringify({ definitionJson, entryNodeId, cursor, context, input, httpMode, aiMode, maxSteps, sessionId, saveExecution }),
    });
  } catch (e) {
    clearTimeout(timeoutId);
    if ((e as any)?.name === "AbortError") {
      // Aborted by our own 30s timeout — surface as a retryable timeout.
      throw new SandboxApiError(0, "Request timed out after 30s — the server may be slow");
    }
    // Network failure (offline / dropped connection).
    throw new SandboxApiError(0, "Network error — check your connection and retry.");
  }

  // Response headers received — clear the timer so no dangling timeout remains.
  clearTimeout(timeoutId);

  if (res.ok) return res.json(); // 200 — all flow outcomes incl. 'stopped'

  // 400 / 404 / 409 / 413 / 429 → surface the server message + (for 429) retryAfter.
  let message = `Request failed (${res.status})`;
  let retryAfter = parseRetryAfter(res);
  try {
    const body = await res.json();
    message = body?.error ?? body?.message ?? message;
    if (typeof body?.retryAfter === "number") retryAfter = body.retryAfter;
  } catch {
    /* non-JSON body */
  }
  throw new SandboxApiError(res.status, message, retryAfter);
}
