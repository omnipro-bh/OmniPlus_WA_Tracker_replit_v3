/**
 * Phase 4A-3a-2 — the real `FlowHost` for the public web chat channel.
 *
 * Same runner (`runFlow`), same graph, same node semantics as WhatsApp — but the
 * outbound side effect is a transcript write instead of a Whapi send. This is the
 * difference between the 4A-2 sandbox host (which captures bubbles in memory and
 * never persists) and production: every bubble here becomes a `web_chat_messages`
 * row so a browser can poll it back.
 *
 * Structural safety properties (load-bearing — do not "improve" these):
 *   - `handleBookingNode` is still ABSENT **in this module**. Since 4A-3b-2 it is
 *     attached from the outside (`chat-tick.buildHostForTick` → `chat-booking`)
 *     and ONLY when `workflows.web_chat_booking_enabled` is true. For every other
 *     workflow `flowRunner.ts:504-520` still takes the `!host.handleBookingNode`
 *     branch: a booking node stops the run with `status: 'stopped'`,
 *     `stopReason: 'unsupported_node'` and the cursor pinned to that node. This
 *     module itself contains no code path that can create a booking row.
 *   - This module never imports `routes.ts`, `whapi`, `sendNodeMessage` or
 *     `sandbox-booking`. No WhatsApp traffic can originate here.
 *   - `errorPolicy: 'stop'` — a public endpoint must never 500 with a stack.
 *
 * Deliberately NOT fixed here (pre-existing 4A-2a behaviour, identical in
 * production WhatsApp — see HANDOFF "Known limitations / deferred items"):
 *   - `buildExecutionContext` spreads `conversationState.context` last, so a
 *     visitor variable named `phone` / `message` / `name` shadows the built-ins.
 *
 * `sendMessage` reuses `buildSandboxMessage` from ./sandbox for the node→bubble
 * projection so web chat and the sandbox panel can never drift. sandbox.ts is
 * imported read-only and is not modified.
 */

import { eq } from "drizzle-orm";
import { db } from "../db";
import { conversationStates } from "@shared/schema";
import type { WebChatMessage, WebChatSession } from "@shared/schema";
import { storage } from "../storage";
import { executeHttpNode } from "./httpNodeExecutor";
import { executeGoogleSheetsWorkflowNode } from "./googleSheetsExecutor";
import { executeAiAgentWorkflowNode } from "./aiAgentExecutor";
import type { FlowHost, TraceEntry } from "./flowRunner";
import {
  buildSandboxMessage,
  type SandboxBubbleType,
  type SandboxMessage,
} from "./sandbox";

/**
 * Local step cap. FLOW_STEP_LIMITS lives in the frozen flowRunner.ts and has no
 * `webChat` key; adding one would modify that file. 25 matches the sandbox and
 * text-resume ceilings — a web tick is bounded the same way.
 */
const CHAT_MAX_STEPS = 25;

/** Cap on a live HTTP response body echoed into conversation state (mirrors sandbox.ts). */
const SANDBOX_HTTP_DATA_CAP_BYTES = 64 * 1024;

// ---------------------------------------------------------------------------
// Public projection
// ---------------------------------------------------------------------------

/**
 * A transcript row as the browser sees it. `nodeId` is server-only (schema.ts
 * documents this) and `clientMsgId` is the visitor's own key — neither is echoed.
 */
export interface PublicMessage {
  id: number;
  role: "visitor" | "bot" | "system";
  kind: SandboxBubbleType;
  payload: Record<string, any>;
  createdAt: string;
}

/** Only absolute https URLs survive projection. Anything else is dropped. */
function httpsUrlOrUndefined(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  try {
    return new URL(value).protocol === "https:" ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Defense-in-depth against a compromised owner account: a `javascript:` URL in a
 * flow's button config must never reach a rendered anchor. Runs on write (so the
 * transcript is clean at rest) and again on read (so a schema change cannot leak
 * by spread).
 */
export function sanitizeBubblePayload(payload: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { ...payload };

  if ("url" in out) {
    const safe = httpsUrlOrUndefined(out.url);
    if (safe === undefined) delete out.url;
    else out.url = safe;
  }

  if (Array.isArray(out.buttons)) {
    out.buttons = out.buttons.map((button: any) => {
      if (!button || typeof button !== "object") return button;
      const next = { ...button };
      if ("url" in next) {
        const safe = httpsUrlOrUndefined(next.url);
        if (safe === undefined) delete next.url;
        else next.url = safe;
      }
      return next;
    });
  }

  if (Array.isArray(out.cards)) {
    out.cards = out.cards.map((card: any) => {
      if (!card || typeof card !== "object") return card;
      const next = { ...card };
      if ("url" in next) {
        const safe = httpsUrlOrUndefined(next.url);
        if (safe === undefined) delete next.url;
        else next.url = safe;
      }
      if (Array.isArray(next.buttons)) {
        next.buttons = next.buttons.map((button: any) => {
          if (!button || typeof button !== "object") return button;
          const btn = { ...button };
          if ("url" in btn) {
            const safe = httpsUrlOrUndefined(btn.url);
            if (safe === undefined) delete btn.url;
            else btn.url = safe;
          }
          return btn;
        });
      }
      return next;
    });
  }

  return out;
}

/**
 * Strip the server-only fields from a bubble before it is stored/returned.
 * `type` is kept because it is the render discriminator the client switches on.
 */
export function toBubblePayload(bubble: SandboxMessage): Record<string, any> {
  const { nodeId: _nodeId, nodeType: _nodeType, ...rest } = bubble;
  return sanitizeBubblePayload(rest as Record<string, any>);
}

/** Row → public message. Safe on rows that already went through toBubblePayload. */
export function toPublicMessage(row: WebChatMessage): PublicMessage {
  return {
    id: row.id,
    role: row.role as PublicMessage["role"],
    kind: row.kind as SandboxBubbleType,
    payload: sanitizeBubblePayload((row.payload || {}) as Record<string, any>),
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : new Date(row.createdAt as any).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Whapi-shaped incoming message (design §3)
// ---------------------------------------------------------------------------

/**
 * `buildExecutionContext` (httpNodeExecutor.ts:24-47) reads `incomingMessage.text
 * .body`, `.from` and `.timestamp`. Web chat has no Whapi payload, so synthesize
 * the same shape from the session key. `phone` in the HTTP execution context
 * resolves from `userMetadata.phone` first, so `from` is only a fallback.
 */
export function toWhapiShapedMessage(
  sessionKey: string,
  text: string,
  timestamp: number = Date.now()
): { from: string; text: { body: string }; timestamp: number } {
  return { from: sessionKey, text: { body: text || "" }, timestamp };
}

/**
 * Truncate a live HTTP response body stored under `context.http[nodeId].data` so a
 * single tick can never echo megabytes into conversation state. Identical shape to
 * sandbox.ts:344-356 (the production executor keeps the full body).
 */
function capHttpEcho(stateUpdate: any, nodeId: string): void {
  const entry = stateUpdate?.http?.[nodeId];
  if (!entry || entry.data === undefined || entry.data === null) return;

  const serialized =
    typeof entry.data === "string" ? entry.data : JSON.stringify(entry.data);
  if (!serialized) return;

  const bytes = Buffer.byteLength(serialized);
  if (bytes > SANDBOX_HTTP_DATA_CAP_BYTES) {
    entry.data = {
      truncated: true,
      originalBytes: bytes,
      preview: serialized.slice(0, SANDBOX_HTTP_DATA_CAP_BYTES),
    };
  }
}

// ---------------------------------------------------------------------------
// Host builder
// ---------------------------------------------------------------------------

export interface ChatTraceEvent {
  kind: "condition" | "setVariable" | "unsupported";
  nodeId: string;
  nodeType: string;
  result?: boolean;
  handle?: string | null;
  variable?: string;
}

export interface ChatHttpEvent {
  nodeId: string;
  ok: boolean;
  handle: string;
  status?: number;
}

export interface ChatHostBundle {
  host: FlowHost;
  /** Bubbles emitted during this tick, oldest first (already persisted). */
  messages: PublicMessage[];
  /** The raw rows inserted during this tick (for workflow_executions mirroring if ever needed). */
  inserted: WebChatMessage[];
}

export function buildChatHost(opts: {
  session: WebChatSession;
  /** Owner of the workflow — passed to executeHttpNode as `userId`. */
  linkUserId: number;
  /** The visitor's `conversation_states` row that `persist` writes to. */
  conversationStateId: number;
  /** Text of the visitor message that triggered this tick (for HTTP `message.text`). */
  lastVisitorText?: string;
  onTrace?: (event: ChatTraceEvent) => void;
  onHttp?: (event: ChatHttpEvent) => void;
}): ChatHostBundle {
  const messages: PublicMessage[] = [];
  const inserted: WebChatMessage[] = [];
  const sessionKey = opts.session.sessionKey;

  const host: FlowHost = {
    errorPolicy: "stop",
    maxSteps: CHAT_MAX_STEPS,

    sendMessage: async (node, nodeId, context) => {
      const bubble = buildSandboxMessage(node, nodeId, context);
      const payload = toBubblePayload(bubble);

      // Throws ⇒ the runner catches it and stops with `stopReason: 'error'`,
      // which the endpoint renders as a fixed `stopped` status (never a 500).
      const row = await storage.createWebChatMessage({
        sessionId: opts.session.id,
        workflowId: opts.session.workflowId,
        role: "bot",
        kind: bubble.type,
        nodeId,
        payload,
      });

      inserted.push(row);
      const publicMessage = toPublicMessage(row);
      messages.push(publicMessage);
      return { ok: true, payload: publicMessage };
    },

    runHttp: async (node, nodeId, context) => {
      const httpResult = await executeHttpNode(
        node,
        { context } as any,
        toWhapiShapedMessage(sessionKey, opts.lastVisitorText ?? ""),
        { phone: sessionKey, userId: opts.linkUserId }
      );

      const next: any = httpResult.stateUpdate;
      if (next?.http?.[nodeId]) next.http[nodeId].mocked = false;
      capHttpEcho(next, nodeId);

      opts.onHttp?.({
        nodeId,
        ok: httpResult.success,
        handle: httpResult.nextHandle,
        status: httpResult.result?.status,
      });

      return {
        ok: httpResult.success,
        nextHandle: httpResult.nextHandle,
        context: next,
      };
    },

    runGoogleSheets: async (node, nodeId, context) => {
      // Mirrors sandbox.ts runGoogleSheets. Google Sheets has no mock mode: it
      // always hits the real Sheets API via the shared service account.
      const sheetsResult = await executeGoogleSheetsWorkflowNode(
        node,
        { context } as any,
        {},
        { phone: sessionKey, userId: opts.linkUserId }
      );

      return {
        ok: sheetsResult.success,
        nextHandle: sheetsResult.nextHandle,
        context: sheetsResult.stateUpdate,
        detail: {
          operation: sheetsResult.result?.operation,
          found: sheetsResult.result?.found,
        },
      };
    },

    runAi: async (node, nodeId, context) => {
      // Same executor as WhatsApp: the visitor's latest message is the user
      // turn, history lives in this session's conversation_states.context.
      const aiResult = await executeAiAgentWorkflowNode(
        node,
        { context } as any,
        toWhapiShapedMessage(sessionKey, opts.lastVisitorText ?? ""),
        { phone: sessionKey, userId: opts.linkUserId },
        { channel: "web_chat", workflowId: opts.session.workflowId }
      );

      return {
        ok: aiResult.success,
        nextHandle: aiResult.nextHandle,
        context: aiResult.stateUpdate,
        detail: {
          provider: aiResult.result?.provider,
          model: aiResult.result?.model,
          finishReason: aiResult.result?.finishReason,
        },
      };
    },

    // Verbatim liveHost.persist (routes.ts:12573-12593), retargeted at the
    // session's conversation_states row by id.
    persist: async (context, cursor, mode) => {
      if (mode === "none") return;

      if (mode === "context") {
        await db
          .update(conversationStates)
          .set({ context, updatedAt: new Date() })
          .where(eq(conversationStates.id, opts.conversationStateId));
        return;
      }

      await db
        .update(conversationStates)
        .set({
          lastMessageAt: new Date(),
          currentNodeId: cursor,
          context,
          updatedAt: new Date(),
        })
        .where(eq(conversationStates.id, opts.conversationStateId));
    },

    // Verbatim capture-start keys so a downstream condition/setVariable reading
    // captureActive behaves exactly as in production.
    afterNodeSent: async (node, nodeId, context) => {
      const config = node?.data?.config || {};
      if (config.isCaptureStart && config.captureSequenceName) {
        return {
          ...(context as any),
          captureActive: true,
          captureSequenceName: config.captureSequenceName,
          captureStartNodeId: nodeId,
          capturedClicks: [],
        };
      }
      return context;
    },

    recordTrace: (entry: TraceEntry) => {
      if (entry.nodeType === "condition") {
        opts.onTrace?.({
          kind: "condition",
          nodeId: entry.nodeId,
          nodeType: entry.nodeType,
          result: (entry.detail as any)?.result,
          handle: entry.handle,
        });
      } else if (entry.nodeType === "setVariable") {
        opts.onTrace?.({
          kind: "setVariable",
          nodeId: entry.nodeId,
          nodeType: entry.nodeType,
          variable: (entry.detail as any)?.variable,
        });
      } else if (
        entry.outcome === "stopped" &&
        (entry.detail as any)?.reason === "unsupported_node"
      ) {
        opts.onTrace?.({
          kind: "unsupported",
          nodeId: entry.nodeId,
          nodeType: entry.nodeType,
        });
      }
    },

    // handleBookingNode: not implemented here — `chat-tick.buildHostForTick`
    // attaches it from `chat-booking` only when the workflow flag is on.
  };

  return { host, messages, inserted };
}
