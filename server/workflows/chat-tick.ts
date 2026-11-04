/**
 * Phase 4A-3a-2 — public web chat orchestration: bootstrap, message handling,
 * polling, restart, end, and retention.
 *
 * This module owns everything the public endpoints need that is *not* the graph
 * itself: session lifecycle, the per-session mutex, `clientMsgId` idempotency,
 * transcript projection, `conversation_states` binding, and the daily purge.
 *
 * Design invariants (load-bearing):
 *   - The mutex is keyed on `sessionKey` (the `conversation_states.phone` value)
 *     and is always released in a `finally`. Contention returns `busy` → 409,
 *     with no wait-and-retry (the client backs off).
 *   - The visitor message row is inserted BEFORE execution. The unique index on
 *     (session_id, client_msg_id) is the authoritative duplicate guard; a retry
 *     with the same key replays the stored rows and never re-executes the flow.
 *     Trade-off accepted: a crash mid-flow leaves an input with no reply, which
 *     is self-healing (the cursor did not move, so the next message re-routes).
 *   - `status` / `awaiting` are NOT persisted on the session row. They are derived
 *     from `conversation_states.current_node_id` + the node type, so no schema
 *     change is required.
 *   - Restart preserves the transcript, resets context/cursor, and re-runs the
 *     entry flow, so the visitor sees the greeting again and the audit trail
 *     stays truthful.
 *   - A `done` conversation is re-enterable: the next text/button message resets
 *     context and re-runs the flow from the entry node (WhatsApp parity), so a
 *     finished conversation never returns `not_awaiting_text` forever.
 *
 * Pre-existing behaviours deliberately inherited (not regressions, see HANDOFF):
 *   - `message.text` bodies do not substitute `{{variables}}` (4A-2a).
 *   - `buildExecutionContext` spreads the conversation context last, so a visitor
 *     variable named `phone` / `message` shadows the built-in fields (4A-2a).
 */

import crypto from "crypto";
import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  conversationStates,
  webChatMessages,
  webChatSessions,
  workflowExecutions,
} from "@shared/schema";
import type {
  WebChatLink,
  WebChatMessage,
  WebChatSession,
  Workflow,
} from "@shared/schema";
import { storage } from "../storage";
import { resolveWebChatLinkByToken } from "../chat-links";
import { captureSandboxText, resolveSandboxStartNode } from "./sandbox";
import {
  INTERACTIVE_NODE_TYPES,
  findButtonTitle,
  resolveButtonRoute,
  runFlow,
  type RunResult,
} from "./flowRunner";
import { buildChatHost, toPublicMessage, type PublicMessage } from "./chat-host";
import { bookingAwaitingFromContext } from "./booking-engine";
import {
  attachChatBooking,
  isBookingButtonId,
  runChatBookingStep,
  type ChatBookingSession,
} from "./chat-booking";

export type { PublicMessage } from "./chat-host";

// ---------------------------------------------------------------------------
// PII hashing
// ---------------------------------------------------------------------------

/**
 * `CHAT_SECRET` is module-private in auth.ts (a 4A-3a-1 file we must not touch).
 * Derive an equivalent, *domain-separated* secret here: same construction as
 * SHARE_SECRET / CHAT_SECRET (HMAC of JWT_SECRET with a distinct label), so a
 * compromise of one purpose label cannot forge another, and no new env var is
 * required. Values are sha256 hex — exactly what varchar(64) expects.
 */
const PII_SECRET = crypto
  .createHmac("sha256", process.env.JWT_SECRET || "")
  .update("omniplus:chat-pii")
  .digest("hex");

function hashPii(value: string): string {
  return crypto.createHmac("sha256", PII_SECRET).update(value || "").digest("hex");
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatAwaiting {
  /** Node id is deliberately NOT exposed to the visitor. */
  kind: "text" | "button";
}

export interface ChatState {
  status: "awaiting_input" | "done" | "stopped";
  awaiting: ChatAwaiting | null;
}

export type ChatFailureReason =
  | "not_found"
  | "workflow_inactive"
  | "busy"
  | "not_ready"
  | "not_awaiting_text"
  | "button_not_routed";

export interface BootstrapResult {
  ok: true;
  /** true ⇒ 201 (new session), false ⇒ 200 (cookie replay). */
  created: boolean;
  session: WebChatSession;
  link: WebChatLink;
  workflow: Workflow;
  initialMessages: PublicMessage[];
  state: ChatState;
}

export interface ChatMessageResult {
  ok: true;
  messages: PublicMessage[];
  state: ChatState;
}

// ---------------------------------------------------------------------------
// Mutex (per process; single PM2 fork instance)
// ---------------------------------------------------------------------------

const sessionLocks = new Map<string, boolean>();

function tryAcquire(sessionKey: string): boolean {
  if (sessionLocks.get(sessionKey)) return false;
  sessionLocks.set(sessionKey, true);
  return true;
}

function release(sessionKey: string): void {
  sessionLocks.delete(sessionKey);
}

// ---------------------------------------------------------------------------
// Definition helpers
// ---------------------------------------------------------------------------

function nodeTypeOf(node: any): string {
  return node?.data?.type || node?.data?.nodeType || "";
}

function asDefinition(workflow: Workflow): { nodes: any[]; edges: any[] } {
  const raw = (workflow.definitionJson || {}) as any;
  return {
    nodes: Array.isArray(raw.nodes) ? raw.nodes : [],
    edges: Array.isArray(raw.edges) ? raw.edges : [],
  };
}

/**
 * Entry node for a fresh conversation: the first node with no incoming edge,
 * falling back to `nodes[0]`, then null. Mirrors `resolveSandboxStartNode`
 * without its optional `entryNodeId` override (that override is a sandbox-only
 * affordance; a visitor conversation always starts at the real entry).
 */
function resolveEntryNodeId(definition: { nodes: any[]; edges: any[] }): string | null {
  const nodes = definition.nodes;
  if (nodes.length === 0) return null;

  const hasIncoming = new Set<string>();
  for (const edge of definition.edges) {
    if (edge?.target) hasIncoming.add(edge.target);
  }

  const first = nodes.find((n: any) => n?.id && !hasIncoming.has(n.id));
  if (first?.id) return first.id;

  return nodes[0]?.id ?? null;
}

// ---------------------------------------------------------------------------
// conversation_states binding
// ---------------------------------------------------------------------------

/**
 * The session's conversation_states row. There is no storage method for this
 * table (routes.ts queries it directly in production paths too), so it is done
 * here. The unique index (workflow_id, phone) makes a concurrent insert a 23505
 * that we resolve by re-selecting.
 */
async function ensureConversationState(session: WebChatSession) {
  const existing = await db
    .select()
    .from(conversationStates)
    .where(
      and(
        eq(conversationStates.workflowId, session.workflowId),
        eq(conversationStates.phone, session.sessionKey)
      )
    )
    .limit(1);

  if (existing.length) return existing[0];

  try {
    const [row] = await db
      .insert(conversationStates)
      .values({
        workflowId: session.workflowId,
        phone: session.sessionKey,
        currentNodeId: null,
        context: {},
      })
      .returning();
    return row;
  } catch (error: any) {
    if (error?.code === "23505") {
      const [row] = await db
        .select()
        .from(conversationStates)
        .where(
          and(
            eq(conversationStates.workflowId, session.workflowId),
            eq(conversationStates.phone, session.sessionKey)
          )
        )
        .limit(1);
      if (row) return row;
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// State derivation (status / awaiting are derived, never stored)
// ---------------------------------------------------------------------------

function stateFromCursor(
  definition: { nodes: any[] },
  cursorId: string | null
): ChatState {
  if (!cursorId) return { status: "done", awaiting: null };

  const node = definition.nodes.find((n: any) => n?.id === cursorId);
  const type = nodeTypeOf(node);

  if (type === "input.text") return { status: "awaiting_input", awaiting: { kind: "text" } };
  if (type && (INTERACTIVE_NODE_TYPES.includes(type) || type === "action.ai_agent")) {
    return { status: "awaiting_input", awaiting: { kind: "button" } };
  }
  return { status: "done", awaiting: null };
}

/**
 * Phase 4A-3b-2. A waiting booking step lives in the CONTEXT, never in the
 * cursor: the engine persists `bookingState` itself and `flowRunner.ts:524`
 * sets `cursor = null` (or leaves it on the booking node, whose type is neither
 * `input.text` nor interactive). Either way the cursor-based derivation below
 * would answer `done` and disable the visitor's buttons.
 *
 * Returns null when no booking step is pending, so callers fall back to the
 * cursor/status derivation unchanged.
 */
function pendingBookingState(context: any, bookingEnabled: boolean): ChatState | null {
  if (!bookingEnabled) return null;
  const awaiting = bookingAwaitingFromContext(context);
  if (!awaiting) return null;
  return { status: "awaiting_input", awaiting: { kind: awaiting.kind } };
}

/**
 * Follow-up #4 (2026-10-25) — the `stopped` state must be sticky.
 *
 * `flowRunner.ts:504-520` sets `status = 'stopped'` and `cursor = nodeId` in
 * memory but deliberately does NOT call `host.persist` on that branch (the
 * runner is shared with WhatsApp, where the node is simply unsupported). So the
 * stop only ever existed in the POST response; the next poll re-derived
 * `awaiting_input` from the still-persisted pre-stop cursor, and the visitor's
 * click was silently swallowed in an endless loop.
 *
 * Web chat therefore records an explicit, namespaced marker in the persisted
 * `conversation_states.context` (see `finishTick`). `__flowStop` cannot collide
 * with a workflow variable or a booking key.
 */
const STOP_KEY = "__flowStop";

interface FlowStopMarker {
  /** The node the runner stopped on (`RunResult.cursor`). */
  nodeId: string | null;
  /** `RunResult.stopReason`, e.g. `unsupported_node`. */
  reason: string | null;
}

function stoppedMarkerState(context: any): ChatState | null {
  if (!context?.[STOP_KEY]) return null;
  return { status: "stopped", awaiting: null };
}

/** Drop a stale stop marker before seeding a run (it must not be re-persisted). */
function stripStopMarker(context: any): any {
  const source = (context ?? {}) as any;
  if (!(STOP_KEY in source)) return source;
  const { [STOP_KEY]: _stopped, ...seed } = source;
  return seed;
}

/** Cursor-derived state, with the pending booking step taking precedence. */
function stateFromContext(args: {
  definition: { nodes: any[] };
  cursorId: string | null;
  context: any;
  bookingEnabled: boolean;
}): ChatState {
  // Order is load-bearing:
  //   1. pendingBookingState — the booking engine legitimately persists
  //      `cursor = booking node` while it waits (`booking-engine.ts:315-317`),
  //      so a live booking step must win over the stop marker.
  //   2. stoppedMarkerState — an explicit stop survives until the next seeded
  //      run clears it.
  //   3. stateFromCursor — the plain cursor/type derivation.
  return (
    pendingBookingState(args.context, args.bookingEnabled) ??
    stoppedMarkerState(args.context) ??
    stateFromCursor(args.definition, args.cursorId)
  );
}

async function stateForSession(
  session: WebChatSession,
  workflow: Workflow
): Promise<ChatState> {
  const conv = await ensureConversationState(session);
  return stateFromContext({
    definition: asDefinition(workflow),
    cursorId: conv.currentNodeId ?? null,
    context: conv.context,
    bookingEnabled: workflow.webChatBookingEnabled === true,
  });
}

function stateFromRunResult(
  definition: { nodes: any[] },
  result: { status: string; cursor: string | null; stopReason?: string }
): ChatState {
  if (result.status === "awaiting_input") return stateFromCursor(definition, result.cursor);
  if (result.status === "stopped") return { status: "stopped", awaiting: null };
  return { status: "done", awaiting: null };
}

/**
 * Phase 4A-3b-2. A waiting booking step lives in the CONTEXT, not the cursor:
 * `flowRunner.ts:524` sets `cursor = null` when the booking handler returns null
 * (the engine already persisted its own state). So with booking enabled the
 * context wins, and the cursor-based derivation is only the fallback.
 */
function chatStateFrom(args: {
  definition: { nodes: any[] };
  result: { status: string; cursor: string | null; stopReason?: string };
  context: any;
  bookingEnabled: boolean;
}): ChatState {
  return (
    pendingBookingState(args.context, args.bookingEnabled) ??
    stateFromRunResult(args.definition, args.result)
  );
}

/**
 * Persist the run outcome, then derive the state the visitor's client sees.
 *
 * Every web-chat `runFlow` site funnels through here so the non-sticky `stopped`
 * bug cannot come back through a new call site: when the runner stops, the
 * stop marker described above is written to `conversation_states` (context +
 * cursor) before the response is returned. All other statuses keep the previous
 * behaviour — the runner's own `host.persist` calls already wrote them.
 */
async function finishTick(
  conv: { id: number },
  result: RunResult,
  definition: { nodes: any[]; edges: any[] },
  bookingEnabled: boolean,
  booking?: { lastContext?: any } | null
): Promise<ChatState> {
  const finalContext = booking?.lastContext ?? result.context;

  if (result.status === "stopped") {
    const marker: FlowStopMarker = {
      nodeId: result.cursor,
      reason: result.stopReason ?? null,
    };
    await db
      .update(conversationStates)
      .set({
        context: { ...((finalContext ?? {}) as any), [STOP_KEY]: marker },
        currentNodeId: result.cursor,
        updatedAt: new Date(),
      })
      .where(eq(conversationStates.id, conv.id));
  }

  return chatStateFrom({ definition, result, context: finalContext, bookingEnabled });
}

/**
 * Build the tick's host. When `web_chat_booking_enabled` is true the booking
 * handler is attached, which is the ONLY thing that lets a booking node run in
 * web chat; when it is false the host is byte-identical to 4A-3a-2 and a booking
 * node still stops as `unsupported_node`.
 *
 * The booking session shares the host's `messages` array so booking bubbles and
 * message-node bubbles keep their true transcript order.
 */
function buildHostForTick(args: {
  session: WebChatSession;
  workflow: Workflow;
  linkUserId: number;
  conversationStateId: number;
  previousCursor: string | null;
  lastVisitorText?: string;
  bookingEnabled: boolean;
}): { host: ReturnType<typeof buildChatHost>["host"]; messages: PublicMessage[]; booking: ChatBookingSession | null } {
  const { host, messages } = buildChatHost({
    session: args.session,
    linkUserId: args.linkUserId,
    conversationStateId: args.conversationStateId,
    lastVisitorText: args.lastVisitorText,
  });

  if (!args.bookingEnabled) return { host, messages, booking: null };

  const booking: ChatBookingSession = {
    session: args.session,
    workflow: args.workflow,
    conversationStateId: args.conversationStateId,
    previousCursor: args.previousCursor,
    messages,
  };
  attachChatBooking(host, booking);
  return { host, messages, booking };
}

// ---------------------------------------------------------------------------
// Execution logging (Q10: one row per message; transcript is the source of truth)
// ---------------------------------------------------------------------------

async function logExecution(input: {
  workflowId: number;
  sessionKey: string;
  messageType: "text" | "button_reply";
  errorMessage?: string | null;
}): Promise<void> {
  try {
    await db.insert(workflowExecutions).values({
      workflowId: input.workflowId,
      phone: input.sessionKey,
      channel: "web_chat",
      messageType: input.messageType,
      triggerData: { channel: "web_chat" },
      responsesSent: [],
      status: input.errorMessage ? "ERROR" : "SUCCESS",
      errorMessage: input.errorMessage ?? null,
    });
  } catch (error: any) {
    // Never let an audit write break the visitor's request.
    console.error("[WebChat] Failed to write workflow_executions row:", error?.message || error);
  }
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

/**
 * Resolve the capability token, then replay or create a visitor session.
 *
 * `existing` is the verified cookie payload (if any). A cookie for a DIFFERENT
 * link is never adopted — that would be session fixation across links — so the
 * visitor gets a fresh session and the cookie is replaced.
 */
export async function bootstrapSession(
  token: string,
  ip: string,
  userAgent: string,
  existing?: { sessionId: number; linkId: number; workflowId: number } | null
): Promise<BootstrapResult | { ok: false; reason: Extract<ChatFailureReason, "not_found" | "workflow_inactive"> }> {
  const resolved = await resolveWebChatLinkByToken(token);
  // Missing / disabled / expired / orphaned link are indistinguishable (404).
  if (!resolved) return { ok: false, reason: "not_found" };

  const { link, workflow } = resolved;

  // resolveWebChatLinkByToken deliberately omits this check: a deactivated
  // workflow is a service-availability state (503), not a capability failure.
  if (!workflow.isActive) return { ok: false, reason: "workflow_inactive" };

  // ── replay ─────────────────────────────────────────────────────────────
  if (existing && existing.linkId === link.id) {
    const session = await storage.getWebChatSession(existing.sessionId);
    if (
      session &&
      session.status === "active" &&
      session.endedAt == null &&
      session.workflowId === workflow.id
    ) {
      const rows = await storage.getWebChatMessagesForSession(session.id, 200);
      const conv = await ensureConversationState(session);
      return {
        ok: true,
        created: false,
        session,
        link,
        workflow,
        initialMessages: rows.map(toPublicMessage),
        state: stateFromContext({
          definition: asDefinition(workflow),
          cursorId: conv.currentNodeId ?? null,
          context: conv.context,
          bookingEnabled: workflow.webChatBookingEnabled === true,
        }),
      };
    }
  }

  // ── create ─────────────────────────────────────────────────────────────
  const sessionKey = `web_${crypto.randomUUID()}`;
  const session = await storage.createWebChatSession({
    workflowId: workflow.id,
    linkId: link.id,
    sessionKey,
    ipHash: hashPii(ip),
    userAgentHash: hashPii(userAgent),
  });

  // lastUsedAt is touched at most once an hour (share-link precedent), and only
  // after the isEnabled/expiry checks inside resolveWebChatLinkByToken passed.
  const lastUsed = link.lastUsedAt ? new Date(link.lastUsedAt).getTime() : 0;
  if (Date.now() - lastUsed > 60 * 60 * 1000) {
    try {
      await storage.updateWebChatLink(link.id, { lastUsedAt: new Date() });
    } catch (error: any) {
      console.error("[WebChat] lastUsedAt touch failed:", error?.message || error);
    }
  }

  const conv = await ensureConversationState(session);
  const definition = asDefinition(workflow);
  const startNodeId = resolveSandboxStartNode(definition, null);

  if (!startNodeId) {
    return {
      ok: true,
      created: true,
      session,
      link,
      workflow,
      initialMessages: [],
      state: { status: "done", awaiting: null },
    };
  }

  const bookingEnabled = workflow.webChatBookingEnabled === true;
  const { host, messages, booking } = buildHostForTick({
    session,
    workflow,
    linkUserId: link.userId,
    conversationStateId: conv.id,
    previousCursor: conv.currentNodeId ?? null,
    bookingEnabled,
  });

  const result = await runFlow({
    definition,
    startNodeId,
    context: (conv.context || {}) as any,
    host,
  });

  return {
    ok: true,
    created: true,
    session,
    link,
    workflow,
    initialMessages: messages,
    state: await finishTick(conv, result, definition, bookingEnabled, booking),
  };
}

// ---------------------------------------------------------------------------
// Message handling
// ---------------------------------------------------------------------------

/**
 * Phase 4A-3b-2 — answer one waiting booking step.
 *
 * Reached only when `web_chat_booking_enabled` is true AND the persisted
 * context is waiting on the same input kind the visitor just sent. Mirrors the
 * WhatsApp webhook's booking branch: the visitor row is written first, the step
 * runs against the shared engine, and a `nextNodeId` continues the flow in-tick
 * (WhatsApp just returns 200 and lets the next message re-enter).
 */
async function answerBookingStep(args: {
  session: WebChatSession;
  link: WebChatLink;
  workflow: Workflow;
  conv: { id: number; currentNodeId: string | null; context: any };
  definition: { nodes: any[]; edges: any[] };
  input: { type: "text" | "button"; text?: string; buttonId?: string; clientMsgId: string };
}): Promise<ChatMessageResult> {
  const { session, link, workflow, conv, definition, input } = args;

  const visitorText =
    input.type === "text"
      ? input.text ?? ""
      : findButtonTitle(definition, input.buttonId!) ?? input.buttonId!;

  // Durable BEFORE execution, same ordering as every other path.
  const visitorRow = await storage.createWebChatMessage({
    sessionId: session.id,
    workflowId: session.workflowId,
    role: "visitor",
    kind: "text",
    payload: { type: "text", text: visitorText },
    clientMsgId: input.clientMsgId,
  });

  const { host, messages, booking } = buildHostForTick({
    session,
    workflow,
    linkUserId: link.userId,
    conversationStateId: conv.id,
    previousCursor: conv.currentNodeId ?? null,
    lastVisitorText: input.type === "text" ? visitorText : "",
    bookingEnabled: true,
  });

  const step = await runChatBookingStep(
    booking!,
    input.type === "text"
      ? { type: "text", text: input.text ?? "" }
      : { type: "button", buttonId: input.buttonId! },
    stripStopMarker(conv.context)
  );

  const messageType = input.type === "text" ? "text" : "button_reply";

  // Advanced the machine (`booked` / `no_slots`) — keep going in this tick.
  if (step.handled && step.nextNodeId) {
    const result = await runFlow({
      definition,
      startNodeId: step.nextNodeId,
      context: step.context,
      host,
    });

    await logExecution({
      workflowId: session.workflowId,
      sessionKey: session.sessionKey,
      messageType,
      errorMessage: result.error?.message ?? null,
    });

    return {
      ok: true,
      messages: [toPublicMessage(visitorRow), ...messages],
      state: await finishTick(conv, result, definition, true, booking),
    };
  }

  await logExecution({
    workflowId: session.workflowId,
    sessionKey: session.sessionKey,
    messageType,
  });

  // Still waiting on the next step (or the step cleared the state).
  const nextAwaiting = bookingAwaitingFromContext(booking?.lastContext ?? step.context);
  return {
    ok: true,
    messages: [toPublicMessage(visitorRow), ...messages],
    state: nextAwaiting
      ? { status: "awaiting_input", awaiting: { kind: nextAwaiting.kind } }
      : { status: "done", awaiting: null },
  };
}

export async function handleChatMessage(
  session: WebChatSession,
  link: WebChatLink,
  workflow: Workflow,
  input: { type: "text" | "button"; text?: string; buttonId?: string; clientMsgId: string }
): Promise<ChatMessageResult | { ok: false; reason: ChatFailureReason }> {
  if (!tryAcquire(session.sessionKey)) return { ok: false, reason: "busy" };

  try {
    const definition = asDefinition(workflow);

    // ── idempotency ──────────────────────────────────────────────────────
    // A retry with a seen clientMsgId replays the stored rows (inclusive of the
    // visitor row) instead of executing the flow a second time.
    const seen = await storage.getWebChatMessageByClientMsgId(session.id, input.clientMsgId);
    if (seen) {
      const rows = await storage.getWebChatMessagesSince(session.id, seen.id - 1, 200);
      const conv = await ensureConversationState(session);
      return {
        ok: true,
        messages: rows.map(toPublicMessage),
        state: stateFromContext({
          definition,
          cursorId: conv.currentNodeId ?? null,
          context: conv.context,
          bookingEnabled: workflow.webChatBookingEnabled === true,
        }),
      };
    }

    const conv = await ensureConversationState(session);
    const cursorId = conv.currentNodeId ?? null;
    const cursorNode = cursorId
      ? definition.nodes.find((n: any) => n?.id === cursorId)
      : undefined;
    const cursorType = nodeTypeOf(cursorNode);

    // ── booking answers (4A-3b-2) ────────────────────────────────────────
    // Runs BEFORE the post-done re-entry block. While the machine waits, the
    // runner returns `cursor = null` (flowRunner.ts:524) because the engine
    // persists its own state; without this interception the visitor's next
    // answer would look like the start of a brand-new conversation and the
    // booking context would be wiped.
    const bookingEnabled = workflow.webChatBookingEnabled === true;
    if (bookingEnabled) {
      const awaiting = bookingAwaitingFromContext(conv.context);
      const isBookingAnswer =
        awaiting !== null &&
        (input.type === "text"
          ? awaiting.kind === "text"
          : awaiting.kind === "button" && isBookingButtonId(input.buttonId));

      if (isBookingAnswer) {
        return answerBookingStep({ session, link, workflow, conv, definition, input });
      }
    }

    // ── post-done re-entry ───────────────────────────────────────────────
    // A finished conversation is not terminal. In production WhatsApp the next
    // inbound message starts a NEW conversation from the entry node; web chat
    // must match, otherwise `not_awaiting_text` would 409 forever after `done`.
    // This returns before the text guard, so that guard only fires for a real
    // cursor node that is not `input.text`.
    if (cursorId === null && (input.type === "text" || input.type === "button")) {
      if (input.type === "button" && (!input.buttonId || !resolveButtonRoute(definition, input.buttonId))) {
        return { ok: false, reason: "button_not_routed" };
      }

      const entryNodeId = resolveEntryNodeId(definition);
      if (!entryNodeId) {
        return { ok: true, messages: [], state: { status: "done", awaiting: null } };
      }

      // Fresh conversation: the finished flow's context must not leak into it.
      await db
        .update(conversationStates)
        .set({
          context: {},
          currentNodeId: null,
          lastMessageAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(conversationStates.id, conv.id));

      const text = input.type === "text" ? input.text ?? "" : findButtonTitle(definition, input.buttonId!) ?? input.buttonId!;

      // Durable BEFORE execution (same ordering as the normal path): the
      // visitor's message is the first message of the new conversation.
      const visitorRow = await storage.createWebChatMessage({
        sessionId: session.id,
        workflowId: session.workflowId,
        role: "visitor",
        kind: "text",
        payload: { type: "text", text },
        clientMsgId: input.clientMsgId,
      });

      const { host, messages, booking } = buildHostForTick({
        session,
        workflow,
        linkUserId: link.userId,
        conversationStateId: conv.id,
        previousCursor: null,
        lastVisitorText: input.type === "text" ? text : "",
        bookingEnabled,
      });

      const result = await runFlow({
        definition,
        startNodeId: entryNodeId,
        context: {},
        host,
        userMessage: input.type === "button" ? text : undefined,
      });

      await logExecution({
        workflowId: session.workflowId,
        sessionKey: session.sessionKey,
        messageType: input.type === "text" ? "text" : "button_reply",
        errorMessage: result.error?.message ?? null,
      });

      return {
        ok: true,
        messages: [toPublicMessage(visitorRow), ...messages],
        state: await finishTick(conv, result, definition, bookingEnabled, booking),
      };
    }

    // ── text ─────────────────────────────────────────────────────────────
    if (input.type === "text") {
      if (!cursorNode || cursorType !== "input.text") {
        return { ok: false, reason: "not_awaiting_text" };
      }

      const text = input.text ?? "";

      // Durable BEFORE execution — the unique index is the duplicate guard.
      const visitorRow = await storage.createWebChatMessage({
        sessionId: session.id,
        workflowId: session.workflowId,
        role: "visitor",
        kind: "text",
        payload: { type: "text", text },
        clientMsgId: input.clientMsgId,
      });

      // A stale stop marker must never travel into the next run's context.
      const capture = captureSandboxText(cursorNode, text, stripStopMarker(conv.context), definition.edges);

      // Invalid text: persist the re-prompt, leave the cursor where it is.
      if (capture.kind === "invalid") {
        const promptRow = await storage.createWebChatMessage({
          sessionId: session.id,
          workflowId: session.workflowId,
          role: "bot",
          kind: "text",
          nodeId: cursorId,
          payload: { type: "text", text: capture.invalidMessage },
        });

        await logExecution({
          workflowId: session.workflowId,
          sessionKey: session.sessionKey,
          messageType: "text",
        });

        return {
          ok: true,
          messages: [toPublicMessage(visitorRow), toPublicMessage(promptRow)],
          state: { status: "awaiting_input", awaiting: { kind: "text" } },
        };
      }

      // Persist the captured variable before the run, so a flow that ends on a
      // condition/setVariable edge case cannot lose it (persist 'none').
      await db
        .update(conversationStates)
        .set({ context: capture.nextContext, updatedAt: new Date() })
        .where(eq(conversationStates.id, conv.id));

      if (!capture.nextNodeId) {
        await db
          .update(conversationStates)
          .set({ currentNodeId: null, updatedAt: new Date() })
          .where(eq(conversationStates.id, conv.id));

        await logExecution({
          workflowId: session.workflowId,
          sessionKey: session.sessionKey,
          messageType: "text",
        });

        return {
          ok: true,
          messages: [toPublicMessage(visitorRow)],
          state: { status: "done", awaiting: null },
        };
      }

      const { host, messages, booking } = buildHostForTick({
        session,
        workflow,
        linkUserId: link.userId,
        conversationStateId: conv.id,
        previousCursor: cursorId,
        lastVisitorText: text,
        bookingEnabled,
      });

      const result = await runFlow({
        definition,
        startNodeId: capture.nextNodeId,
        context: capture.nextContext,
        host,
      });

      await logExecution({
        workflowId: session.workflowId,
        sessionKey: session.sessionKey,
        messageType: "text",
        errorMessage: result.error?.message ?? null,
      });

      return {
        ok: true,
        messages: [toPublicMessage(visitorRow), ...messages],
        state: await finishTick(conv, result, definition, bookingEnabled, booking),
      };
    }

    // ── button ───────────────────────────────────────────────────────────
    if (!input.buttonId) return { ok: false, reason: "button_not_routed" };

    // Phase 2.5: an option declared by an AI node is consumed by that node — the
    // click becomes the visitor's next turn instead of jumping to the edge target.
    // Legacy quickReply/list/carousel nodes keep edge routing.
    const route = resolveButtonRoute(definition, input.buttonId, cursorId ?? undefined);
    if (!route) return { ok: false, reason: "button_not_routed" };

    const optionTitle = findButtonTitle(definition, input.buttonId) ?? input.buttonId;

    const visitorRow = await storage.createWebChatMessage({
      sessionId: session.id,
      workflowId: session.workflowId,
      role: "visitor",
      kind: "text",
      payload: {
        type: "text",
        text: optionTitle,
      },
      clientMsgId: input.clientMsgId,
    });

    const { host, messages, booking } = buildHostForTick({
      session,
      workflow,
      linkUserId: link.userId,
      conversationStateId: conv.id,
      previousCursor: cursorId,
      lastVisitorText: "",
      bookingEnabled,
    });

    const result = await runFlow({
      definition,
      startNodeId: route.nodeId,
      context: stripStopMarker(conv.context),
      host,
      userMessage: route.kind === "ai" ? route.title : undefined,
    });

    await logExecution({
      workflowId: session.workflowId,
      sessionKey: session.sessionKey,
      messageType: "button_reply",
      errorMessage: result.error?.message ?? null,
    });

    return {
      ok: true,
      messages: [toPublicMessage(visitorRow), ...messages],
      state: await finishTick(conv, result, definition, bookingEnabled, booking),
    };
  } finally {
    release(session.sessionKey);
  }
}

// ---------------------------------------------------------------------------
// Polling
// ---------------------------------------------------------------------------

export async function getChatMessages(
  session: WebChatSession,
  workflow: Workflow,
  sinceId: number,
  limit: number
): Promise<{ messages: PublicMessage[]; nextSinceId: number; state: ChatState }> {
  const rows = await storage.getWebChatMessagesSince(session.id, sinceId, limit);

  // Never regress: an empty poll keeps the caller's cursor.
  const nextSinceId = rows.length ? rows[rows.length - 1].id : sinceId;

  return {
    messages: rows.map(toPublicMessage),
    nextSinceId,
    state: await stateForSession(session, workflow),
  };
}

/**
 * Last-N transcript for a reload (`GET /session`). Oldest-first, like the poll.
 */
export async function getRecentMessages(
  session: WebChatSession,
  workflow: Workflow,
  limit = 200
): Promise<{ messages: PublicMessage[]; state: ChatState }> {
  const rows = await storage.getWebChatMessagesForSession(session.id, limit);
  return {
    messages: rows.map(toPublicMessage),
    state: await stateForSession(session, workflow),
  };
}

// ---------------------------------------------------------------------------
// Restart (Option A: preserve transcript, reset context/cursor, re-run entry)
// ---------------------------------------------------------------------------

export async function restartChatSession(
  session: WebChatSession,
  link: WebChatLink,
  workflow: Workflow
): Promise<ChatMessageResult | { ok: false; reason: ChatFailureReason }> {
  if (!tryAcquire(session.sessionKey)) return { ok: false, reason: "busy" };

  try {
    const conv = await ensureConversationState(session);

    await db
      .update(conversationStates)
      .set({
        context: {},
        currentNodeId: null,
        lastMessageAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(conversationStates.id, conv.id));

    const definition = asDefinition(workflow);
    const startNodeId = resolveSandboxStartNode(definition, null);

    if (!startNodeId) {
      return { ok: true, messages: [], state: { status: "done", awaiting: null } };
    }

    const bookingEnabled = workflow.webChatBookingEnabled === true;
    const { host, messages, booking } = buildHostForTick({
      session,
      workflow,
      linkUserId: link.userId,
      conversationStateId: conv.id,
      previousCursor: null,
      bookingEnabled,
    });

    const result = await runFlow({
      definition,
      startNodeId,
      context: {},
      host,
    });

    return {
      ok: true,
      messages,
      state: await finishTick(conv, result, definition, bookingEnabled, booking),
    };
  } finally {
    release(session.sessionKey);
  }
}

// ---------------------------------------------------------------------------
// End
// ---------------------------------------------------------------------------

export async function endChatSession(session: WebChatSession): Promise<void> {
  // Idempotent: ending an already-ended session just rewrites the timestamps.
  await storage.endWebChatSession(session.id);
}

// ---------------------------------------------------------------------------
// Retention — purgeWebChat
// ---------------------------------------------------------------------------

export interface PurgeResult {
  dryRun: boolean;
  sessions: number;
  messages: number;
  conversationStates: number;
}

const PURGE_CHUNK_SIZE = 500;
const PURGE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Delete sessions that are ended OR idle beyond 30 days, their messages (FK
 * cascade), and the matching `conversation_states` rows (no FK — deleted
 * explicitly). `session_key` is globally unique, so matching on it cannot
 * collide with a real WhatsApp phone number.
 *
 * Dry-run: `WEB_CHAT_PURGE_DRY_RUN=1` (env, not a flag — cron cannot pass argv).
 * In dry-run the same three counts are computed and logged, and nothing is
 * deleted.
 */
export async function purgeWebChat(opts?: { dryRun?: boolean }): Promise<PurgeResult> {
  const dryRun = opts?.dryRun ?? process.env.WEB_CHAT_PURGE_DRY_RUN === "1";
  const cutoff = new Date(Date.now() - PURGE_RETENTION_MS);

  const candidates = await db
    .select({ id: webChatSessions.id, sessionKey: webChatSessions.sessionKey })
    .from(webChatSessions)
    .where(or(eq(webChatSessions.status, "ended"), lt(webChatSessions.lastSeenAt, cutoff)));

  const result: PurgeResult = {
    dryRun,
    sessions: candidates.length,
    messages: 0,
    conversationStates: 0,
  };

  if (candidates.length === 0) {
    if (dryRun) {
      console.log("[WebChatPurge] DRY RUN: 0 sessions, 0 messages, 0 conversation_states");
    }
    return result;
  }

  const sessionIds = candidates.map((c) => c.id);
  const sessionKeys = candidates.map((c) => c.sessionKey);

  for (const slice of chunk(sessionIds, PURGE_CHUNK_SIZE)) {
    const [messageAgg] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(webChatMessages)
      .where(inArray(webChatMessages.sessionId, slice));
    result.messages += messageAgg?.count ?? 0;
  }

  for (const slice of chunk(sessionKeys, PURGE_CHUNK_SIZE)) {
    const [stateAgg] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(conversationStates)
      .where(inArray(conversationStates.phone, slice));
    result.conversationStates += stateAgg?.count ?? 0;
  }

  if (dryRun) {
    console.log(
      `[WebChatPurge] DRY RUN: would delete ${result.sessions} sessions, ` +
        `${result.messages} messages (cascade), ${result.conversationStates} conversation_states`
    );
    return result;
  }

  // conversation_states first: no FK ties it to the session row.
  for (const slice of chunk(sessionKeys, PURGE_CHUNK_SIZE)) {
    await db.delete(conversationStates).where(inArray(conversationStates.phone, slice));
  }

  // Messages cascade at the DB level (all 6 web-chat FKs are ON DELETE CASCADE).
  for (const slice of chunk(sessionIds, PURGE_CHUNK_SIZE)) {
    await db.delete(webChatSessions).where(inArray(webChatSessions.id, slice));
  }

  console.log(
    `[WebChatPurge] Deleted ${result.sessions} sessions, ${result.messages} messages, ` +
      `${result.conversationStates} conversation_states`
  );
  return result;
}
