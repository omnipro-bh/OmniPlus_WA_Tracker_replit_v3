/**
 * Phase 4A-3b-2 — web chat adapter for the shared booking engine.
 *
 * The engine (./booking-engine) owns the booking state machine. This module owns
 * the web-chat side effects, exactly as `buildWhatsAppBookingEngine` (routes.ts)
 * owns the Whapi ones:
 *
 *   sendText / sendList → a `web_chat_messages` row (the browser polls it back)
 *   saveState           → the session's `conversation_states` row
 *   canSend             → always true: a transcript row is always deliverable
 *
 * Differences from WhatsApp, all deliberate (HANDOFF 4A-3b decisions 2–4):
 *   - `customerPhone` is the session key, which is already `web_<uuid>`
 *     (schema.ts:1265). That is what makes gate #10b (`customer_phone LIKE
 *     'web_%'`) meaningful and what keeps the reminder worker away from these
 *     rows.
 *   - `remindersSupported: false` forces `reminder_enabled = false` at creation:
 *     there is no channel that could reach the visitor.
 *   - `allowMutations: false` gates off the `reschedule` / `cancel_booking`
 *     check modes and every `booking_reschedule_* / booking_newslot_* /
 *     booking_cancel_*` button. An anonymous visitor holds only an opaque
 *     session key; letting one cancel another's appointment would be a real
 *     authorization hole. Read-only `my_bookings` stays available.
 *   - `bookingWorkflowId` is set, so a web-chat booking can be traced back to
 *     the workflow (WhatsApp keeps `bookings.workflow_id` NULL).
 *
 * This module never imports `routes.ts`, `whapi` or `sendNodeMessage`. No
 * WhatsApp traffic can originate here.
 */

import { eq } from "drizzle-orm";
import { db } from "../db";
import { conversationStates } from "@shared/schema";
import type { WebChatSession, Workflow } from "@shared/schema";
import { storage } from "../storage";
import { toBubblePayload, toPublicMessage, type PublicMessage } from "./chat-host";
import {
  runBookingNode,
  runBookingStep,
  type BookingEngine,
  type BookingInput,
  type BookingListMessage,
  type BookingStepResult,
} from "./booking-engine";
import type { BookingNodeResult, FlowHost } from "./flowRunner";
import type { SandboxBubbleType } from "./sandbox";

/** A `web_<uuid>` session key is 40 chars — comfortably inside varchar(50). */
function asDefinition(workflow: Workflow): { nodes: any[]; edges: any[] } {
  const raw = (workflow.definitionJson || {}) as any;
  return {
    nodes: Array.isArray(raw.nodes) ? raw.nodes : [],
    edges: Array.isArray(raw.edges) ? raw.edges : [],
  };
}

/**
 * Per-tick booking handle. One instance per `handleChatMessage` /
 * `bootstrapSession` call, so `lastContext` and `messages` are scoped to a
 * single visitor message.
 */
export interface ChatBookingSession {
  session: WebChatSession;
  workflow: Workflow;
  /** The visitor's `conversation_states` row. */
  conversationStateId: number;
  /** `current_node_id` before this tick's node executes (engine parity argument). */
  previousCursor: string | null;
  /**
   * Shared bubble sink. Must be the SAME array `buildChatHost` returns, so a
   * booking bubble and a message-node bubble keep their true transcript order.
   */
  messages: PublicMessage[];
  /**
   * Newest context the engine persisted during this tick. The engine writes
   * `conversation_states` directly, so `RunResult.context` can be stale; this
   * is what the awaiting-state derivation must read.
   */
  lastContext?: any;
  onLog?: (entry: Record<string, any>) => void;
}

/**
 * Insert one bot bubble and mirror it into the shared sink.
 *
 * `sanitizeBubblePayload` runs inside `toBubblePayload`, so a compromised flow
 * cannot smuggle a `javascript:` URL into a booking bubble either.
 */
async function emitBubble(
  deps: ChatBookingSession,
  kind: SandboxBubbleType,
  payload: Record<string, any>,
  nodeId: string | null
): Promise<void> {
  const row = await storage.createWebChatMessage({
    sessionId: deps.session.id,
    workflowId: deps.session.workflowId,
    role: "bot",
    kind,
    nodeId,
    payload: toBubblePayload({ type: kind, ...payload } as any),
  });
  deps.messages.push(toPublicMessage(row));
}

/**
 * Build the `BookingEngine` for one web-chat tick.
 *
 * `canSend` is hard `true`: unlike WhatsApp there is no channel to authorize,
 * and a transcript write is the delivery mechanism.
 */
export function buildChatBookingEngine(deps: ChatBookingSession): BookingEngine {
  return {
    userId: deps.workflow.userId,
    workflowId: deps.workflow.id,
    definition: asDefinition(deps.workflow),
    customerPhone: deps.session.sessionKey, // "web_<uuid>"
    remindersSupported: false,
    allowMutations: false,
    bookingWorkflowId: deps.workflow.id,
    effects: {
      canSend: true,
      sendText: async (body) => {
        await emitBubble(deps, "text", { text: body }, null);
      },
      sendList: async (message: BookingListMessage) => {
        await emitBubble(
          deps,
          "list",
          {
            text: message.body,
            buttonLabel: message.buttonLabel,
            sections: message.sections,
          },
          null
        );
      },
      saveState: async ({ context, cursor, touch }) => {
        // Same three patch shapes as the WhatsApp adapter.
        const patch: any = { context, updatedAt: new Date() };
        if (touch) patch.lastMessageAt = new Date();
        if (cursor !== undefined) patch.currentNodeId = cursor;
        await db
          .update(conversationStates)
          .set(patch)
          .where(eq(conversationStates.id, deps.conversationStateId));
        deps.lastContext = context;
      },
      log: deps.onLog,
    },
  };
}

/**
 * Attach the booking handler to a host built by `buildChatHost`.
 *
 * Called ONLY when `workflow.web_chat_booking_enabled` is true, which is what
 * keeps the 4A-3a-2 safety gate intact for every other workflow: with the
 * handler absent, `flowRunner.ts:505` still stops a booking node as
 * `unsupported_node`.
 */
export function attachChatBooking(host: FlowHost, deps: ChatBookingSession): void {
  host.handleBookingNode = async (
    node: any,
    nodeId: string,
    context: any
  ): Promise<BookingNodeResult | null> =>
    runBookingNode(
      buildChatBookingEngine(deps),
      node,
      nodeId,
      context,
      deps.previousCursor
    );
}

/** Advance a waiting booking step (department/staff/slot/name/custom/…). */
export async function runChatBookingStep(
  deps: ChatBookingSession,
  input: BookingInput,
  context: any
): Promise<BookingStepResult> {
  return runBookingStep(buildChatBookingEngine(deps), input, context);
}

/**
 * True when this button id belongs to the booking machine. Every row/button the
 * engine emits is prefixed `booking_`; a definition button never is. Used to
 * decide whether an inbound button is a booking answer rather than a flow edge.
 */
export function isBookingButtonId(buttonId: unknown): boolean {
  return typeof buttonId === "string" && buttonId.startsWith("booking_");
}
