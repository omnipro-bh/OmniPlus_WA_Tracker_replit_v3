/**
 * Phase 4A-2a — shared workflow flow runner.
 *
 * Single implementation of the workflow execution loop. It replaces two
 * divergent copies that previously lived in server/routes.ts:
 *
 *   1. the loop nested inside the `button_reply` webhook branch, and
 *   2. `resumeFlowAfterTextInput` (resume after an `input.text` capture).
 *
 * The runner owns control flow only: it resolves the next node, evaluates
 * condition / setVariable / HTTP-handle routing, and decides when to stop.
 * Every side effect is injected through `FlowHost`, so the same code can drive
 * the live webhook (real Whapi sends + conversation_states writes) and the
 * Phase 4A-2 sandbox (captured payloads, no persistence).
 *
 * Design notes:
 * - No Express, no drizzle, no whapi imports — hosts supply all I/O.
 * - Never throws unless the host asks for it (`errorPolicy: 'throw'`), which is
 *   what the live button path has always done.
 * - `booking.*` nodes are NOT implemented here. The live caller supplies
 *   `handleBookingNode`; without it the runner stops with `unsupported_node`
 *   (this is what the text-resume path has always done).
 * - Added in 4A-2a: the live path now has a step cap (100). Before this it was
 *   unbounded, so a graph cycle could loop forever.
 */

import {
  enforceContextCeiling,
  evaluateCondition,
  getNextNodeBySingleEdge,
  MAX_CONTEXT_BYTES,
} from './flowControl';
import { getNestedValue, resolveTemplate } from './httpExecutor';
import { getNextNodeByHandle } from './httpNodeExecutor';

/** Node types that send a message and then wait for the user. */
export const INTERACTIVE_NODE_TYPES = [
  'quickReply',
  'quickReplyImage',
  'quickReplyVideo',
  'listMessage',
  'buttons',
  'carousel',
];

/** Transition caps per execution context. */
export const FLOW_STEP_LIMITS = {
  /** Live webhook button path. Was unbounded before 4A-2a. */
  live: 100,
  /** Resume after an `input.text` capture (unchanged since 4A-1). */
  textResume: 25,
  /** Phase 4A-2 sandbox ticks. */
  sandbox: 25,
} as const;

export type RunStatus = 'awaiting_input' | 'done' | 'stopped';

export type StopReason =
  | 'no_next_node'
  | 'node_not_found'
  | 'step_limit'
  | 'unsupported_node'
  | 'error';

export type TraceOutcome =
  | 'sent'
  | 'evaluated'
  | 'assigned'
  | 'http'
  | 'sheets'
  | 'ai'
  | 'awaiting'
  | 'stopped'
  | 'error';

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

/**
 * How much of the conversation state a node wants persisted.
 * - `none`    — condition nodes (they are not persisted today)
 * - `context` — setVariable (context only, no cursor move)
 * - `cursor`  — HTTP / message / input.text (lastMessageAt + cursor + context)
 */
export type PersistMode = 'none' | 'context' | 'cursor';

export interface SentMessage {
  ok: boolean;
  payload: any;
  error?: string;
}

export interface HttpRunResult {
  ok: boolean;
  /** HTTP/Sheets use `success`/`error`; the AI node adds `buttons`/`handover`. */
  nextHandle: 'success' | 'error' | 'buttons' | 'handover';
  context: any;
  detail?: Record<string, any>;
}

export interface BookingNodeResult {
  nextNodeId: string | null;
  context: any;
}

/**
 * All I/O the runner needs. The live host is built inside registerRoutes() so it
 * can close over the conversation state row, the execution log and the sender.
 */
export interface FlowHost {
  /** Send the node's outbound message. May throw — `errorPolicy` decides. */
  sendMessage(node: any, nodeId: string, context: any): Promise<SentMessage>;

  /** Execute an HTTP node and return the next handle plus the new context. */
  runHttp(node: any, nodeId: string, context: any): Promise<HttpRunResult>;

  /**
   * Execute a Google Sheets node and return the next handle plus the new
   * context. Optional: the sandbox host omits it, so a `action.google_sheets`
   * node is unsupported there (mirrors `handleBookingNode`).
   */
  runGoogleSheets?(node: any, nodeId: string, context: any): Promise<HttpRunResult>;

  /**
   * Execute an AI Agent node (`action.ai_agent`) and return the next handle plus
   * the new context. Optional: a host that omits it stops with
   * `unsupported_node` instead of silently continuing (same contract as
   * `runGoogleSheets`).
   */
  runAi?(node: any, nodeId: string, context: any): Promise<HttpRunResult>;

  /** Persist context/cursor. `mode` is chosen by the node type (see PersistMode). */
  persist(context: any, cursor: string | null, mode: PersistMode): Promise<void>;

  /**
   * Hook run after a message node is sent and before the cursor advances.
   * Returns the (possibly extended) context — e.g. the capture-sequence keys.
   * The runner persists afterwards, so the host must not persist here.
   */
  afterNodeSent?(node: any, nodeId: string, context: any): Promise<any>;

  /**
   * Booking nodes. Supplied only by the live button path; the booking body
   * itself stays in routes.ts. Return `null` to stop (state already persisted
   * by the handler) or `{ nextNodeId }` to continue from that node.
   */
  handleBookingNode?(
    node: any,
    nodeId: string,
    context: any
  ): Promise<BookingNodeResult | null>;

  /** Observe every transition. The live hosts mirror these into workflow executions. */
  recordTrace?(entry: TraceEntry): void;

  errorPolicy: 'throw' | 'stop';
  maxSteps: number;
}

export interface RunOptions {
  definition: { nodes?: any[]; edges?: any[] } | any;
  startNodeId: string | null;
  context: any;
  host: FlowHost;
}

export interface RunResult {
  context: any;
  cursor: string | null;
  steps: number;
  status: RunStatus;
  stopReason?: StopReason;
  error?: { message: string; nodeId: string | null };
  trace: TraceEntry[];
}

function nodeTypeOf(node: any): string {
  return node?.data?.type || node?.data?.nodeType || '';
}

/**
 * Resolve which edge a clicked button/list id belongs to.
 *
 * Phase 4A-2a: moved verbatim (minus the console.log noise) out of the
 * `button_reply` webhook branch so the sandbox routes simulated clicks exactly
 * like production. The four tiers are unchanged:
 *   1. `sourceHandle === buttonId`
 *   2. the source node has a button/row with this id
 *   3. carousel card buttons (handle → card id → title substring → index)
 *   4. any interactive node that owns a button with this id (handle → first edge)
 */
export function resolveButtonTarget(definition: any, buttonId: string): any | null {
  const nodes: any[] = Array.isArray(definition?.nodes) ? definition.nodes : [];
  const edges: any[] = Array.isArray(definition?.edges) ? definition.edges : [];

  // Tier 1: the handle itself carries the button id (new multi-handle workflows).
  let targetEdge =
    edges.find((edge: any) => edge.sourceHandle === buttonId) || null;

  // Tier 2: legacy workflows without sourceHandle — match the button/row config.
  if (!targetEdge) {
    targetEdge =
      edges.find((edge: any) => {
        const sourceNode = nodes.find((n: any) => n.id === edge.source);
        if (!sourceNode) return false;

        const buttons = sourceNode.data?.config?.buttons || [];
        const hasMatchingButton = buttons.some((btn: any) => btn.id === buttonId);

        const sections = sourceNode.data?.config?.sections || [];
        const hasMatchingRow = sections.some((section: any) =>
          section.rows?.some((row: any) => row.id === buttonId)
        );

        return hasMatchingButton || hasMatchingRow;
      }) || null;
  }

  // Tier 3: carousel card buttons.
  if (!targetEdge) {
    for (const node of nodes) {
      if (nodeTypeOf(node) !== 'carousel') continue;

      const cards = node.data?.config?.cards || [];
      for (const card of cards) {
        const matchingBtn = (card.buttons || []).find((btn: any) => btn.id === buttonId);
        if (!matchingBtn) continue;

        // Handle by button id, then card id, then button title substring.
        targetEdge =
          edges.find((e: any) => e.source === node.id && e.sourceHandle === buttonId) || null;

        if (!targetEdge) {
          targetEdge =
            edges.find((e: any) => e.source === node.id && e.sourceHandle === card.id) || null;
        }

        if (!targetEdge) {
          targetEdge =
            edges.find(
              (e: any) =>
                e.source === node.id && e.sourceHandle?.includes(matchingBtn.title)
            ) || null;
        }

        // Last resort: pick the carousel edge by quick-reply button index.
        if (!targetEdge) {
          const carouselEdges = edges.filter((e: any) => e.source === node.id);
          if (carouselEdges.length > 0) {
            let btnIndex = 0;
            let found = false;
            for (const c of cards) {
              for (const b of c.buttons || []) {
                if (b.id === buttonId) {
                  found = true;
                  break;
                }
                if (b.type === 'quick_reply') btnIndex++;
              }
              if (found) break;
            }
            if (found && btnIndex < carouselEdges.length) {
              targetEdge = carouselEdges[btnIndex];
            }
          }
        }

        if (targetEdge) break;
      }
      if (targetEdge) break;
    }
  }

  // Tier 4: any interactive node that owns this button id.
  if (!targetEdge) {
    const interactiveNodes = nodes.filter((n: any) =>
      ['carousel', 'quickReply', 'quickReplyImage', 'quickReplyVideo', 'listMessage', 'buttons'].includes(
        nodeTypeOf(n)
      )
    );

    for (const node of interactiveNodes) {
      const type = nodeTypeOf(node);
      const config = node.data?.config || {};
      let hasMatchingButton = false;

      if (type === 'carousel') {
        for (const card of config.cards || []) {
          if ((card.buttons || []).some((btn: any) => btn.id === buttonId)) {
            hasMatchingButton = true;
            break;
          }
        }
      }

      if (['quickReply', 'quickReplyImage', 'quickReplyVideo', 'buttons'].includes(type)) {
        if ((config.buttons || []).some((btn: any) => btn.id === buttonId)) {
          hasMatchingButton = true;
        }
      }

      if (type === 'listMessage') {
        for (const section of config.sections || []) {
          if ((section.rows || []).some((row: any) => row.id === buttonId)) {
            hasMatchingButton = true;
            break;
          }
        }
      }

      if (hasMatchingButton) {
        const nodeEdges = edges.filter((e: any) => e.source === node.id);
        targetEdge = nodeEdges.find((e: any) => e.sourceHandle === buttonId) || null;
        if (!targetEdge && nodeEdges.length > 0) {
          targetEdge = nodeEdges[0];
        }
        if (targetEdge) break;
      }
    }
  }

  return targetEdge;
}

/**
 * Run the flow from `startNodeId` until it needs user input, ends, or fails.
 *
 * Parity contract (see Phase 4A-2 design §3.1):
 *  1. interactive message node → send, stay on it, await input
 *  2. `message.*` → send, follow single edge; no edge ⇒ done
 *  3. `input.text` → send prompt, stay on it, await input
 *  4. HTTP → run, persist cursor *at the current node*, follow success/error
 *  5. `condition` → evaluate, persist nothing, follow true/false
 *  6. `setVariable` → template + ceiling, persist context only, follow single edge
 *  7. booking without a host handler ⇒ stopped/unsupported_node
 *  8. missing node id ⇒ stopped/node_not_found
 *  9. `errorPolicy: 'throw'` ⇒ first node error escapes unchanged
 * 10. `options.definition` is never mutated
 */
export async function runFlow(options: RunOptions): Promise<RunResult> {
  const definition = options.definition || {};
  const nodes: any[] = Array.isArray(definition.nodes) ? definition.nodes : [];
  const edges: any[] = Array.isArray(definition.edges) ? definition.edges : [];
  const host = options.host;

  const trace: TraceEntry[] = [];
  let seq = 0;

  const emit = (entry: Omit<TraceEntry, 'seq'>): void => {
    const full: TraceEntry = { seq: ++seq, ...entry };
    trace.push(full);
    if (host.recordTrace) {
      try {
        host.recordTrace(full);
      } catch (traceError: any) {
        console.error(`[Flow] recordTrace failed: ${traceError?.message || traceError}`);
      }
    }
  };

  let context = (options.context || {}) as any;
  let cursor: string | null = options.startNodeId;
  let steps = 0;
  let status: RunStatus = 'done';
  let stopReason: StopReason | undefined;
  let error: { message: string; nodeId: string | null } | undefined;

  while (cursor && steps < host.maxSteps) {
    steps++;
    const nodeId: string = cursor;
    const node = nodes.find((n: any) => n.id === nodeId);
    const startedAt = Date.now();

    if (!node) {
      console.warn(`[Flow] Node ${nodeId} not found - stopping`);
      emit({
        nodeId,
        nodeType: 'unknown',
        outcome: 'stopped',
        detail: { reason: 'node_not_found' },
      });
      status = 'stopped';
      stopReason = 'node_not_found';
      cursor = nodeId;
      break;
    }

    const nodeType = nodeTypeOf(node);
    const config = node.data?.config || {};

    try {
      // ── HTTP request ───────────────────────────────────────────────────
      if (nodeType === 'action.http_request') {
        const httpResult = await host.runHttp(node, nodeId, context);
        context = httpResult.context;

        // Cursor stays on the HTTP node (pre-4A-2a behaviour).
        await host.persist(context, nodeId, 'cursor');

        emit({
          nodeId,
          nodeType,
          outcome: 'http',
          handle: httpResult.nextHandle,
          ms: Date.now() - startedAt,
          detail: { success: httpResult.ok, ...(httpResult.detail || {}) },
        });

        const nextNodeId = getNextNodeByHandle(nodeId, httpResult.nextHandle, edges);
        if (!nextNodeId) {
          console.log(
            `HTTP node ${nodeId} has no ${httpResult.nextHandle} handle connected - workflow ends here`
          );
          status = 'done';
          stopReason = 'no_next_node';
          cursor = null;
          break;
        }

        cursor = nextNodeId;
        continue;
      }

      // ── Google Sheets ──────────────────────────────────────────────────
      if (nodeType === 'action.google_sheets') {
        if (!host.runGoogleSheets) {
          emit({
            nodeId,
            nodeType,
            outcome: 'stopped',
            ms: Date.now() - startedAt,
            detail: { reason: 'unsupported_node' },
          });
          console.warn(
            `[Flow] Google Sheets node "${nodeType}" (${nodeId}) is not supported here - stopping.`
          );
          status = 'stopped';
          stopReason = 'unsupported_node';
          cursor = nodeId;
          break;
        }

        const sheetsResult = await host.runGoogleSheets(node, nodeId, context);
        context = sheetsResult.context;

        // Cursor stays on the sheets node (same as the HTTP node).
        await host.persist(context, nodeId, 'cursor');

        emit({
          nodeId,
          nodeType,
          outcome: 'sheets',
          handle: sheetsResult.nextHandle,
          ms: Date.now() - startedAt,
          detail: { success: sheetsResult.ok, ...(sheetsResult.detail || {}) },
        });

        const nextNodeId = getNextNodeByHandle(nodeId, sheetsResult.nextHandle, edges);
        if (!nextNodeId) {
          console.log(
            `Google Sheets node ${nodeId} has no ${sheetsResult.nextHandle} handle connected - workflow ends here`
          );
          status = 'done';
          stopReason = 'no_next_node';
          cursor = null;
          break;
        }

        cursor = nextNodeId;
        continue;
      }

      // ── AI Agent ───────────────────────────────────────────────────────
      if (nodeType === 'action.ai_agent') {
        if (!host.runAi) {
          emit({
            nodeId,
            nodeType,
            outcome: 'stopped',
            ms: Date.now() - startedAt,
            detail: { reason: 'unsupported_node' },
          });
          console.warn(
            `[Flow] AI Agent node "${nodeType}" (${nodeId}) is not supported here - stopping.`
          );
          status = 'stopped';
          stopReason = 'unsupported_node';
          cursor = nodeId;
          break;
        }

        const aiResult = await host.runAi(node, nodeId, context);
        context = aiResult.context;

        // Cursor stays on the AI node (same as HTTP / Google Sheets).
        await host.persist(context, nodeId, 'cursor');

        emit({
          nodeId,
          nodeType,
          outcome: 'ai',
          handle: aiResult.nextHandle,
          ms: Date.now() - startedAt,
          detail: { success: aiResult.ok, ...(aiResult.detail || {}) },
        });

        // `buttons` means the AI node sent interactive buttons and must now wait
        // for the visitor's click — exactly like a quickReply node. The button
        // handle's target runs only after resolveButtonTarget routes the click
        // back here, so do NOT advance to it in this tick.
        if (aiResult.nextHandle === 'buttons') {
          status = 'awaiting_input';
          cursor = nodeId;
          break;
        }

        const nextNodeId = getNextNodeByHandle(nodeId, aiResult.nextHandle, edges);
        if (!nextNodeId) {
          console.log(
            `AI Agent node ${nodeId} has no ${aiResult.nextHandle} handle connected - workflow ends here`
          );
          status = 'done';
          stopReason = 'no_next_node';
          cursor = null;
          break;
        }

        cursor = nextNodeId;
        continue;
      }

      // ── Condition ──────────────────────────────────────────────────────
      if (nodeType === 'condition') {
        const passed = evaluateCondition(
          config.operator || 'equals',
          getNestedValue(context, config.variable),
          config.value
        );
        const handle = passed ? 'true' : 'false';

        emit({
          nodeId,
          nodeType,
          outcome: 'evaluated',
          handle,
          ms: Date.now() - startedAt,
          detail: { result: passed },
        });

        const nextNodeId = getNextNodeByHandle(nodeId, handle, edges);
        if (!nextNodeId) {
          console.log(
            `[Condition] Node ${nodeId} has no ${handle} edge connected - workflow ends here`
          );
          status = 'done';
          stopReason = 'no_next_node';
          cursor = null;
          break;
        }

        cursor = nextNodeId;
        continue;
      }

      // ── Set variable ───────────────────────────────────────────────────
      if (nodeType === 'setVariable') {
        const resolvedValue = resolveTemplate(String(config.value ?? ''), context);
        const fitted = enforceContextCeiling(context, config.variable, resolvedValue);
        if (fitted.truncated) {
          console.warn(
            `[Set Variable] Context exceeded ${MAX_CONTEXT_BYTES} bytes; truncated "${config.variable}" to ${fitted.value.length} chars`
          );
        }

        context = { ...context, [config.variable]: fitted.value };
        await host.persist(context, nodeId, 'context');

        emit({
          nodeId,
          nodeType,
          outcome: 'assigned',
          ms: Date.now() - startedAt,
          detail: { variable: config.variable },
        });

        const nextNodeId = getNextNodeBySingleEdge(nodeId, edges);
        if (!nextNodeId) {
          console.log(`[Set Variable] Node ${nodeId} has no outgoing edge - workflow ends here`);
          status = 'done';
          stopReason = 'no_next_node';
          cursor = null;
          break;
        }

        cursor = nextNodeId;
        continue;
      }

      // ── Text input (stop and wait) ─────────────────────────────────────
      if (nodeType === 'input.text') {
        const sent = await host.sendMessage(node, nodeId, context);

        await host.persist(context, nodeId, 'cursor');

        emit({
          nodeId,
          nodeType,
          outcome: 'awaiting',
          ms: Date.now() - startedAt,
          detail: {
            variable: config.variableName ?? null,
            sent: sent.ok,
          },
        });

        status = 'awaiting_input';
        cursor = nodeId;
        break;
      }

      // ── Booking nodes (delegated; body lives in routes.ts) ─────────────
      if (nodeType === 'booking.book_appointment' || nodeType === 'booking.check_bookings') {
        if (!host.handleBookingNode) {
          emit({
            nodeId,
            nodeType,
            outcome: 'stopped',
            ms: Date.now() - startedAt,
            detail: { reason: 'unsupported_node' },
          });
          console.warn(
            `[Flow] Node type "${nodeType}" (${nodeId}) is not supported here - stopping. Booking nodes must be reached via button replies.`
          );
          status = 'stopped';
          stopReason = 'unsupported_node';
          cursor = nodeId;
          break;
        }

        const bookingResult = await host.handleBookingNode(node, nodeId, context);

        if (!bookingResult) {
          // The handler sent something and is waiting for the user, or ended.
          status = 'done';
          stopReason = 'no_next_node';
          cursor = null;
          break;
        }

        context = bookingResult.context ?? context;

        if (!bookingResult.nextNodeId) {
          status = 'done';
          stopReason = 'no_next_node';
          cursor = null;
          break;
        }

        cursor = bookingResult.nextNodeId;
        continue;
      }

      // ── Message nodes ──────────────────────────────────────────────────
      if (
        nodeType &&
        (nodeType.startsWith('message.') || INTERACTIVE_NODE_TYPES.includes(nodeType))
      ) {
        const sent = await host.sendMessage(node, nodeId, context);

        if (sent.ok && host.afterNodeSent) {
          const extended = await host.afterNodeSent(node, nodeId, context);
          if (extended !== undefined && extended !== null) {
            context = extended;
          }
        }

        await host.persist(context, nodeId, 'cursor');

        emit({
          nodeId,
          nodeType,
          outcome: INTERACTIVE_NODE_TYPES.includes(nodeType) ? 'awaiting' : 'sent',
          ms: Date.now() - startedAt,
          detail: { sent: sent.ok },
        });

        if (INTERACTIVE_NODE_TYPES.includes(nodeType)) {
          // Interactive message (buttons/list/carousel) — wait for the user.
          status = 'awaiting_input';
          cursor = nodeId;
          break;
        }

        // Simple text/media/location — continue along the single edge.
        const nextNodeId = getNextNodeBySingleEdge(nodeId, edges);
        if (!nextNodeId) {
          console.log(
            `[Flow] No outgoing edge from message node ${nodeId} - workflow ends here`
          );
          status = 'done';
          stopReason = 'no_next_node';
          cursor = null;
          break;
        }

        cursor = nextNodeId;
        continue;
      }

      // ── Anything else ──────────────────────────────────────────────────
      console.warn(`[Flow] Unsupported node type "${nodeType}" (${nodeId}) - stopping`);
      emit({
        nodeId,
        nodeType: nodeType || 'unknown',
        outcome: 'stopped',
        ms: Date.now() - startedAt,
        detail: { reason: 'unsupported_node' },
      });
      status = 'stopped';
      stopReason = 'unsupported_node';
      cursor = nodeId;
      break;
    } catch (nodeError: any) {
      const message = nodeError?.message || String(nodeError);
      console.error(`[Flow] Error while executing node ${nodeId}: ${message}`);

      emit({
        nodeId,
        nodeType: nodeType || 'unknown',
        outcome: 'error',
        ms: Date.now() - startedAt,
        detail: { message },
      });

      if (host.errorPolicy === 'throw') {
        throw nodeError;
      }

      status = 'stopped';
      stopReason = 'error';
      error = { message, nodeId };
      cursor = nodeId;
      break;
    }
  }

  if (steps >= host.maxSteps && status === 'done' && cursor) {
    console.warn(
      `[Flow] Step limit (${host.maxSteps}) reached - stopping to avoid a cycle`
    );
    emit({
      nodeId: cursor,
      nodeType: 'unknown',
      outcome: 'stopped',
      detail: { reason: 'step_limit', steps },
    });
    status = 'stopped';
    stopReason = 'step_limit';
    cursor = null;
  }

  return {
    context,
    cursor,
    steps,
    status,
    stopReason,
    error,
    trace,
  };
}
