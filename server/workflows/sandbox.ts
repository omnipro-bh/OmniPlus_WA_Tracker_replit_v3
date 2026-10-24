/**
 * Phase 4A-2b — sandbox tick endpoint support.
 *
 * Stateless execution path for the 4A-2c live demo panel. The endpoint sends
 * the in-memory draft graph + cursor + context on every tick; this module
 * builds the `FlowHost` that drives `runFlow` with zero persistence and no
 * Whapi sends, and assembles the panel-facing response.
 *
 * Design notes:
 * - No Express, drizzle, whapi or storage imports. The host is pure; the only
 *   I/O is `executeHttpNode` for `httpMode: 'live'`, which reuses the exact
 *   https-only + admin allowlist + no-redirect rules of production.
 * - `persist` is a no-op; the runner returns its working context/cursor in
 *   `RunResult` and the sandbox must never write conversation_states.
 * - `handleBookingNode` is a MOCK (4A-2d): it walks the booking sub-flow with
 *   synthetic fixtures via ./sandbox-booking, never touching the DB or Whapi.
 *   The trace it produces is exposed through `drainBookingTrace()` and merged
 *   into the response by the assembler.
 * - `recordTrace` is omitted; the response trace comes straight from
 *   `RunResult.trace` (the runner always accumulates it internally).
 * - `sendMessage` builds a normalized, panel-friendly bubble (a discriminated
 *   union keyed on `type`), NOT the raw Whapi wire ack.
 */

import { z } from "zod";
import { enforceContextCeiling, getNextNodeBySingleEdge, MAX_CAPTURE_LENGTH } from "./flowControl";
import { executeHttpNode } from "./httpNodeExecutor";
import {
  FLOW_STEP_LIMITS,
  type FlowHost,
  type RunResult,
  type RunStatus,
  type StopReason,
  type TraceEntry,
} from "./flowRunner";
import { VARIABLE_NAME_RE } from "@shared/workflow-validation";
import {
  deriveBookingAwaiting,
  runMockBookingNode,
  type MockBookingTraceEntry,
} from "./sandbox-booking";

/** Sandbox-only cap on a live HTTP response body echoed back to the panel. */
const SANDBOX_HTTP_DATA_CAP_BYTES = 64 * 1024;

// ---------------------------------------------------------------------------
// Request / response types
// ---------------------------------------------------------------------------

export type SandboxInputType = "start" | "button" | "text";

export interface SandboxTickInput {
  type: SandboxInputType;
  buttonId?: string;
  text?: string;
}

export interface SandboxTickRequest {
  definitionJson: Record<string, any>;
  entryNodeId?: string | null;
  cursor?: string | null;
  context: Record<string, any>;
  input: SandboxTickInput;
  httpMode: "mock" | "live";
  maxSteps?: number;
}

export type SandboxBubbleType =
  | "text"
  | "buttons"
  | "list"
  | "call_to_action_buttons"
  | "carousel"
  | "media"
  | "location";

export interface SandboxMessage {
  /** Flow node id this bubble came from. */
  nodeId: string;
  /** Flow node type (e.g. 'quickReply', 'input.text'). */
  nodeType: string;
  /** Bubble discriminator for the panel. */
  type: SandboxBubbleType;

  // text / buttons / list / call_to_action_buttons / carousel
  text?: string;
  headerText?: string;
  footerText?: string;
  buttons?: Array<{
    id: string;
    title: string;
    type: string;
    phone_number?: string;
    url?: string;
    copy_code?: string;
  }>;
  buttonLabel?: string;
  sections?: Array<{
    title: string;
    rows: Array<{ id: string; title: string; description: string }>;
  }>;
  cards?: Array<{
    id: string;
    media?: string;
    text?: string;
    buttons: Array<{ id: string; title: string; type: string; url?: string }>;
  }>;

  // media
  mediaType?: string;
  url?: string;
  caption?: string;

  // location
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
}

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

/**
 * Strict: `maxSteps` outside 1-50 is a 400, not silently clamped. `input` is
 * required (a body without it is a 400). `definitionJson` / `context` default
 * to `{}` via `.catch` so a null/missing body field normalizes to an empty
 * graph / empty context rather than crashing the runner.
 */
export const sandboxTickSchema = z.object({
  definitionJson: z.record(z.any()).catch({}),
  entryNodeId: z.string().optional().nullable(),
  cursor: z.string().nullable().optional(),
  context: z.record(z.any()).catch({}),
  input: z.object({
    type: z.enum(["start", "button", "text"]),
    buttonId: z.string().optional(),
    text: z.string().optional(),
  }),
  httpMode: z.enum(["mock", "live"]).optional().default("mock"),
  maxSteps: z.number().int().min(1).max(50).optional(),
});

// ---------------------------------------------------------------------------
// Message payload builder
// ---------------------------------------------------------------------------

/**
 * Build the normalized bubble for a node. Config fields mirror the exact names
 * read by `sendNodeMessage` in routes.ts (the production sender), so the
 * sandbox preview shows what production would render.
 */
export function buildSandboxMessage(node: any, nodeId: string): SandboxMessage {
  const nodeType = node?.data?.type || node?.data?.nodeType || "";
  const c = node?.data?.config || {};
  const base = { nodeId, nodeType };

  switch (nodeType) {
    case "message.text":
      return { ...base, type: "text", text: c.text || "No message" };

    case "input.text":
      return { ...base, type: "text", text: c.prompt || "Please type your response." };

    case "message.media":
      return {
        ...base,
        type: "media",
        mediaType: c.mediaType || "Document",
        url: c.mediaUrl || "",
        caption: c.caption,
      };

    case "message.location":
      return {
        ...base,
        type: "location",
        lat: parseFloat(c.latitude) || 0,
        lng: parseFloat(c.longitude) || 0,
        name: c.name,
        address: c.address,
      };

    case "quickReply":
    case "quickReplyImage":
    case "quickReplyVideo":
      return {
        ...base,
        type: "buttons",
        text: c.bodyText || "No message",
        headerText: c.headerText,
        footerText: c.footerText,
        buttons: (c.buttons || [])
          .filter((b: any) => b.title && b.id)
          .map((b: any) => ({ id: b.id, title: b.title, type: "quick_reply" })),
      };

    case "listMessage":
      return {
        ...base,
        type: "list",
        text: c.bodyText || "No message",
        headerText: c.headerText,
        footerText: c.footerText,
        buttonLabel: c.buttonLabel || "Choose option",
        sections: (c.sections || []).map((s: any) => ({
          title: s.title || "Options",
          rows: (s.rows || [])
            .filter((r: any) => r.title && r.id)
            .map((r: any) => ({ id: r.id, title: r.title, description: r.description || "" })),
        })),
      };

    case "buttons":
      return {
        ...base,
        type: "call_to_action_buttons",
        text: c.bodyText || "No message",
        headerText: c.headerText,
        footerText: c.footerText,
        buttons: (c.buttons || [])
          .filter((b: any) => b.title && b.id)
          .map((b: any) => {
            const t = (b.type || b.kind) === "phone_number" ? "call" : (b.type || b.kind);
            const out: any = { id: b.id, title: b.title, type: t };
            if (t === "call") out.phone_number = b.phone_number || b.value;
            else if (t === "url") out.url = b.url || b.value;
            else if (t === "copy") out.copy_code = b.copy_code || b.value;
            return out;
          }),
      };

    case "carousel":
      return {
        ...base,
        type: "carousel",
        text: c.bodyText || "Check out our offerings!",
        cards: (c.cards || []).map((card: any) => ({
          id: card.id,
          media: card.media,
          text: card.text,
          buttons: (card.buttons || []).map((b: any) =>
            b.type === "url"
              ? { id: b.id, title: b.title, type: "url", url: b.url }
              : { id: b.id, title: b.title, type: "quick_reply" }
          ),
        })),
      };

    default:
      // Legacy callButton / urlButton / copyButton (no palette entry) and any
      // unknown type: render an empty buttons bubble rather than crash.
      return { ...base, type: "buttons", text: c.bodyText || "No message", buttons: [] };
  }
}

// ---------------------------------------------------------------------------
// Host builder
// ---------------------------------------------------------------------------

export interface SandboxHostBundle {
  host: FlowHost;
  /** Exposed so the endpoint can prepend the invalid-text re-prompt bubble. */
  messages: SandboxMessage[];
  /**
   * Mock-booking trace entries produced by `handleBookingNode` during this
   * request. Drain before assembling the response (4A-2d).
   */
  drainBookingTrace: () => MockBookingTraceEntry[];
}

export function buildSandboxHost(opts: {
  httpMode: "mock" | "live";
  userId: number;
  maxSteps?: number;
  /** Draft graph — only the edges are used, for the `booked` / `no_slots` lookups. */
  definition?: { nodes?: any[]; edges?: any[] };
}): SandboxHostBundle {
  const messages: SandboxMessage[] = [];
  const bookingTrace: MockBookingTraceEntry[] = [];
  const edges = Array.isArray(opts.definition?.edges) ? (opts.definition!.edges as any[]) : [];

  const host: FlowHost = {
    errorPolicy: "stop",
    maxSteps: opts.maxSteps ?? FLOW_STEP_LIMITS.sandbox,

    sendMessage: async (node, nodeId) => {
      const msg = buildSandboxMessage(node, nodeId);
      messages.push(msg);
      return { ok: true, payload: msg };
    },

    runHttp: async (node, nodeId, ctx) => {
      if (opts.httpMode === "mock") {
        const next: any = {
          ...(ctx as any),
          http: {
            ...((ctx as any)?.http || {}),
            [nodeId]: {
              status: 200,
              statusText: "OK",
              data: { mock: true },
              mappedVariables: {},
              error: null,
              mocked: true,
              executedAt: new Date().toISOString(),
            },
          },
        };
        return { ok: true, nextHandle: "success", context: next, detail: { mocked: true } };
      }

      const httpResult = await executeHttpNode(
        node,
        { context: ctx } as any,
        {},
        { phone: "sandbox", userId: opts.userId }
      );

      const next: any = httpResult.stateUpdate;
      if (next?.http?.[nodeId]) {
        next.http[nodeId].mocked = false;

        // Sandbox-only truncation of a live HTTP response body so a single tick
        // never echoes megabytes back to the panel. Production executeHttpNode is
        // untouched (it still stores the full response in conversation state).
        const entry = next.http[nodeId];
        if (entry && entry.data !== undefined && entry.data !== null) {
          const serialized =
            typeof entry.data === "string" ? entry.data : JSON.stringify(entry.data);
          if (serialized && Buffer.byteLength(serialized) > SANDBOX_HTTP_DATA_CAP_BYTES) {
            entry.data = {
              truncated: true,
              originalBytes: Buffer.byteLength(serialized),
              preview: serialized.slice(0, SANDBOX_HTTP_DATA_CAP_BYTES),
            };
          }
        }
      }

      return {
        ok: httpResult.success,
        nextHandle: httpResult.nextHandle,
        context: next,
        detail: { mocked: false, status: httpResult.result?.status },
      };
    },

    persist: async () => {
      // No-op: the sandbox never writes conversation_states. The runner returns
      // its working context/cursor in RunResult.
    },

    afterNodeSent: async (node, nodeId, ctx) => {
      // Replicate the live capture-start keys so a downstream condition /
      // setVariable reading captureActive behaves identically to production.
      const c = node?.data?.config || {};
      if (c.isCaptureStart && c.captureSequenceName) {
        return {
          ...(ctx as any),
          captureActive: true,
          captureSequenceName: c.captureSequenceName,
          captureStartNodeId: nodeId,
          capturedClicks: [],
        };
      }
      return ctx;
    },

    // Phase 4A-2d: mock booking. Synthetic services/providers/slots only —
    // this module cannot read or write production booking data.
    handleBookingNode: async (node, nodeId, ctx) =>
      runMockBookingNode(node, nodeId, ctx, { edges, messages, trace: bookingTrace }),

    // recordTrace: intentionally absent → response.trace comes from RunResult.trace.
  };

  return {
    host,
    messages,
    drainBookingTrace: () => {
      const drained = [...bookingTrace];
      bookingTrace.length = 0;
      return drained;
    },
  };
}

// ---------------------------------------------------------------------------
// Start-node resolution
// ---------------------------------------------------------------------------

/**
 * entryNodeId (if present in the graph) → first node with no incoming edge →
 * nodes[0] → null. Matches the approved 4A-2b start-node resolution order.
 */
export function resolveSandboxStartNode(
  definition: { nodes?: any[]; edges?: any[] },
  entryNodeId?: string | null
): string | null {
  const nodes = Array.isArray(definition?.nodes) ? definition.nodes : [];
  const edges = Array.isArray(definition?.edges) ? definition.edges : [];
  if (nodes.length === 0) return null;

  if (entryNodeId && nodes.some((n: any) => n?.id === entryNodeId)) {
    return entryNodeId;
  }

  const hasIncoming = new Set<string>();
  for (const e of edges) {
    if (e?.target) hasIncoming.add(e.target);
  }

  const first = nodes.find((n: any) => n?.id && !hasIncoming.has(n.id));
  if (first?.id) return first.id;

  return nodes[0]?.id ?? null;
}

// ---------------------------------------------------------------------------
// input.text capture (mirror of the live text branch)
// ---------------------------------------------------------------------------

export type TextCaptureResult =
  | { kind: "invalid"; invalidMessage: string }
  | { kind: "advance"; nextContext: Record<string, any>; nextNodeId: string | null };

/**
 * Full mirror of the live `input.text` capture in routes.ts: trim, minLength /
 * maxLength (capped at MAX_CAPTURE_LENGTH), generated invalidMessage,
 * enforceContextCeiling, then advance via getNextNodeBySingleEdge.
 */
export function captureSandboxText(
  node: any,
  text: string,
  context: Record<string, any>,
  edges: any[]
): TextCaptureResult {
  const inputConfig = node?.data?.config || {};
  const variableName =
    typeof inputConfig.variableName === "string" ? inputConfig.variableName.trim() : "";

  if (!VARIABLE_NAME_RE.test(variableName)) {
    return {
      kind: "invalid",
      invalidMessage: "This field cannot capture a reply (invalid variable name).",
    };
  }

  const rawText = (text || "").trim();
  const minLength = Math.max(0, Number(inputConfig.minLength) || 0);
  const maxLength = Math.min(
    MAX_CAPTURE_LENGTH,
    Math.max(minLength, Number(inputConfig.maxLength) || MAX_CAPTURE_LENGTH)
  );

  if (rawText.length < minLength || rawText.length > maxLength) {
    const invalidMessage =
      typeof inputConfig.invalidMessage === "string" && inputConfig.invalidMessage.trim()
        ? inputConfig.invalidMessage.trim()
        : minLength && maxLength
          ? `Please enter between ${minLength} and ${maxLength} characters.`
          : minLength
            ? `Please enter at least ${minLength} characters.`
            : `Please enter no more than ${maxLength} characters.`;
    return { kind: "invalid", invalidMessage };
  }

  const capturedValue = rawText.slice(0, MAX_CAPTURE_LENGTH);
  const fitted = enforceContextCeiling(context, variableName, capturedValue);
  if (fitted.truncated) {
    console.warn(
      `[Sandbox] Context ceiling reached; truncated "${variableName}" to ${fitted.value.length} chars`
    );
  }

  const nextContext: Record<string, any> = { ...context, [variableName]: fitted.value };
  const nextNodeId = getNextNodeBySingleEdge(node.id, edges);
  return { kind: "advance", nextContext, nextNodeId };
}

// ---------------------------------------------------------------------------
// Response assembly
// ---------------------------------------------------------------------------

export function assembleSandboxResponse(
  result: RunResult,
  definition: { nodes: any[]; edges: any[] },
  messages: SandboxMessage[],
  extraTrace: MockBookingTraceEntry[] = []
): SandboxTickResponse {
  // Mock-booking trace entries have no runner sequence number — append and
  // renumber them after `result.trace` (4A-2d).
  const trace: TraceEntry[] = [
    ...result.trace,
    ...extraTrace.map((entry, index) => ({
      ...entry,
      seq: result.trace.length + index + 1,
    })),
  ];

  const cursorNode = result.cursor
    ? definition.nodes.find((n: any) => n?.id === result.cursor)
    : undefined;
  const cursorType = cursorNode?.data?.type || cursorNode?.data?.nodeType;

  let status: RunStatus = result.status;
  let cursor: string | null = result.cursor;
  let stopReason: StopReason | undefined =
    result.stopReason ?? (result.status === "done" ? "no_next_node" : undefined);

  let awaiting: SandboxAwaiting | null = null;
  if (result.status === "awaiting_input" && result.cursor) {
    awaiting =
      cursorType === "input.text"
        ? { kind: "text", nodeId: result.cursor }
        : { kind: "button", nodeId: result.cursor };
  }

  // A booking prompt returns `{ nextNodeId: null }` from the host, which the
  // runner reports as `done` (the frozen contract cannot express "awaiting at a
  // booking node"). Re-derive it here. Fail-graceful: a malformed mock state
  // yields null and the raw `done` status flows through untouched.
  if (status === "done") {
    const pending =
      deriveBookingAwaiting(result.context?.bookingState) ??
      deriveBookingAwaiting(result.context?.checkBookingsState);
    if (pending) {
      status = "awaiting_input";
      cursor = pending.nodeId;
      stopReason = undefined;
      awaiting = pending;
    }
  }

  return {
    status,
    stopReason,
    cursor,
    context: result.context,
    messages,
    awaiting,
    trace,
    steps: result.steps,
    error: result.error ?? null,
  };
}
