/**
 * Phase 4A-3b-1 — shared booking state machine.
 *
 * Extracted from the WhatsApp chatbot region of `server/routes.ts`:
 *   - `routes.ts:11340-11672` — `booking.book_appointment` /
 *     `booking.check_bookings` entry (the `handleBookingNode` closure).
 *   - `routes.ts:9740-10418`  — `button_reply` step machine
 *     (`booking_dept_*` → `booking_staff_*` → `booking_slot_*` →
 *     `enter_name`/`enter_custom*` → create, plus reschedule/cancel).
 *   - `routes.ts:10563-10866` — `text` step machine (`enter_name`,
 *     `enter_custom1`, `enter_custom2`).
 *
 * This module owns the booking *decisions* and the order in which they happen.
 * It does NOT own delivery or persistence:
 *   - `effects.sendText` / `effects.sendList` deliver one bubble on the caller's
 *     channel (Whapi in production, the web-chat transcript in 4A-3b-2).
 *   - `effects.saveState` writes `conversation_states` (or the chat equivalent).
 *     `cursor` maps to `current_node_id`, `touch` to `last_message_at`, exactly as
 *     the three extracted blocks did.
 *   - `effects.canSend` is false when the caller's channel cannot deliver (no
 *     ACTIVE/AUTHORIZED Whapi channel). Production then returns *silently*
 *     without changing state; every send site below is guarded by it.
 *
 * Deliberately imports no `whapi`, no `express` and no `db`. The only I/O is
 * `storage` (already used by both callers) plus `getNextNodeByHandle`.
 *
 * Behavioural contract for 4A-3b-1: the WhatsApp path must be indistinguishable
 * from before the extraction. This includes production's current ordering
 * (send the success message, then write the state). 4A-3b-2 changes that
 * ordering for web chat only, behind a flag, if the review approves it.
 */

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import { storage } from "../storage";
import { getNextNodeByHandle } from "./httpNodeExecutor";
import type { BookingNodeResult } from "./flowRunner";

dayjs.extend(utc);
dayjs.extend(timezone);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One interactive list bubble, in the shape both channels already render. */
export interface BookingListMessage {
  body: string;
  buttonLabel: string;
  sections: Array<{
    title: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>;
}

/**
 * Everything the state machine needs from its channel. WhatsApp implements
 * this with Whapi + `conversation_states`; web chat (4A-3b-2) implements it
 * with `web_chat_messages` rows.
 */
export interface BookingEffects {
  /** false ⇒ the channel cannot deliver; sends are skipped and state is unchanged. */
  readonly canSend: boolean;
  sendText(text: string): Promise<void>;
  sendList(message: BookingListMessage): Promise<void>;
  /**
   * Persist the context. `cursor` sets `current_node_id` when provided;
   * `touch` sets `last_message_at` when true. Omitted fields are left alone,
   * which is what the three extracted blocks did.
   */
  saveState(input: { context: any; cursor?: string | null; touch?: boolean }): Promise<void>;
  /** Optional per-action audit entry (WhatsApp execution log). */
  log?(entry: Record<string, any>): void;
}

export interface BookingEngine {
  /** Owner of the workflow (`activeWorkflow.userId`). */
  userId: number;
  /** Workflow id (`activeWorkflow.id`). */
  workflowId: number;
  /** `activeWorkflow.definitionJson`, already normalised by the caller. */
  definition: { nodes?: any[]; edges: any[] };
  /** `customer_phone`: a real MSISDN on WhatsApp, `web_<uuid>` on web chat. */
  customerPhone: string;
  /**
   * true on WhatsApp (reminders can be delivered via Whapi). false on web chat:
   * there is no channel that can reach the visitor, so the reminder columns are
   * forced off at creation time.
   */
  remindersSupported: boolean;
  effects: BookingEffects;
}

export type BookingInput =
  | { type: "button"; buttonId: string }
  | { type: "text"; text: string };

export interface BookingStepResult {
  /** false ⇒ the input is not a booking step; the caller continues normally. */
  handled: boolean;
  /** Node to resume from (`booked` / `no_slots`), or null to wait / end. */
  nextNodeId: string | null;
  /** Context after the step. Equals the input context when nothing changed. */
  context: any;
}

/** Steps answered with free text. */
const TEXT_STEPS = new Set(["enter_name", "enter_custom1", "enter_custom2"]);

/** Every step the machine can be waiting on. */
const BOOKING_STEPS = new Set([
  "select_department",
  "select_staff",
  "select_slot",
  "enter_name",
  "enter_custom1",
  "enter_custom2",
  "select_reschedule",
  "select_new_slot",
  "select_cancel",
]);

/** True when the visitor is expected to type an answer for this step. */
export function isBookingTextStep(step: unknown): boolean {
  return typeof step === "string" && TEXT_STEPS.has(step);
}

/**
 * Derive `{ kind, nodeId }` from a persisted booking/check-booking state.
 *
 * Fail-graceful: a malformed state returns null so callers fall back to the
 * runner status instead of throwing. `bookingState` wins over
 * `checkBookingsState` (the same precedence the production blocks use).
 */
export function bookingAwaitingFromContext(
  context: any
): { kind: "text" | "button"; nodeId: string } | null {
  const state = context?.bookingState ?? context?.checkBookingsState;
  if (!state || typeof state !== "object") return null;

  const nodeId = typeof state.nodeId === "string" ? state.nodeId : null;
  const step = typeof state.step === "string" ? state.step : "";
  if (!nodeId || !BOOKING_STEPS.has(step)) return null;

  return { kind: TEXT_STEPS.has(step) ? "text" : "button", nodeId };
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

/**
 * Verbatim production replacement order: date, time, department, staff, then
 * name. Each is a global replace, and missing values become ''.
 */
function renderBookingMessage(
  template: string,
  values: {
    date: string;
    time: string;
    department?: string | null;
    staff?: string | null;
    name?: string | null;
  }
): string {
  return template
    .replace(/\{\{date\}\}/g, values.date)
    .replace(/\{\{time\}\}/g, values.time)
    .replace(/\{\{department\}\}/g, values.department || "")
    .replace(/\{\{staff\}\}/g, values.staff || "")
    .replace(/\{\{name\}\}/g, values.name || "");
}

// ---------------------------------------------------------------------------
// booking.book_appointment / booking.check_bookings
// (routes.ts:11340-11672, verbatim logic)
// ---------------------------------------------------------------------------

/**
 * Entry point for a booking node reached by the runner.
 *
 * Returns `null` when the machine is waiting for the visitor (state already
 * saved) or has nothing to do, or `{ nextNodeId, context }` when it advanced
 * the conversation (e.g. `my_bookings` → `booked`, no departments → `no_slots`).
 *
 * `previousCursor` is `conversation_states.current_node_id` **before** this
 * node executes; production compares it with the booking node id to decide
 * whether this is a fresh entry into the booking flow.
 */
export async function runBookingNode(
  engine: BookingEngine,
  node: any,
  nodeId: string,
  context: any,
  previousCursor: string | null
): Promise<BookingNodeResult | null> {
  const nodeType = node.data?.type || node.data?.nodeType;
  const startNodeId = nodeId;
  const ctx = context;
  const canSend = engine.effects.canSend;

  let currentNode = node;
  let currentNodeId = nodeId;

  // ── booking.book_appointment ──────────────────────────────────────────
  if (nodeType === "booking.book_appointment") {
    const config = currentNode.data?.config || {};
    const localContext = (ctx || {}) as any;

    console.log(
      `[Booking] book_appointment node: ${currentNodeId}, previous cursor: ${previousCursor}`
    );

    // Start fresh when there is no booking state, it belongs to a different
    // booking node, or we navigated here from another node (button entry).
    const existingBookingNodeId = localContext.bookingState?.nodeId;
    const isNavigatingToBookingNode = previousCursor !== currentNodeId;
    const shouldStartFresh =
      !localContext.bookingState ||
      existingBookingNodeId !== currentNodeId ||
      isNavigatingToBookingNode;

    if (shouldStartFresh) console.log(`[Booking] Starting fresh booking flow`);

    if (shouldStartFresh) {
      // Start new booking flow — send the department list.
      // Filter by serviceId if configured.
      let departments;
      if (config.serviceId) {
        console.log(`[Booking] Filtering departments by serviceId: ${config.serviceId}`);
        departments = await storage.getBookingDepartmentsForService(config.serviceId);
      } else {
        console.log(`[Booking] No serviceId configured, getting all departments for user`);
        departments = await storage.getBookingDepartmentsForUser(engine.userId);
      }

      if (departments.length === 0) {
        // No departments configured — go to the no_slots path. Production sends
        // the notice only when a channel can deliver, but always advances.
        const noSlotsMessage =
          config.noSlotsMessage || "Sorry, booking is not available at this time.";

        if (canSend) {
          await engine.effects.sendText(noSlotsMessage);
        }

        const noSlotsNodeId = getNextNodeByHandle(
          currentNodeId,
          "no_slots",
          engine.definition.edges
        );
        if (!noSlotsNodeId) return null;
        const noSlotsNode = engine.definition.nodes?.find((n: any) => n.id === noSlotsNodeId);
        if (!noSlotsNode) return null;
        return { nextNodeId: noSlotsNodeId, context: ctx };
      }

      if (canSend) {
        const promptMessage =
          config.promptMessage || "Please select a service for your appointment:";

        await engine.effects.sendList({
          body: promptMessage,
          buttonLabel: config.departmentButtonLabel || "Select Service",
          sections: [
            {
              title: "Departments",
              rows: departments.map((dept: any) => ({
                id: `booking_dept_${dept.id}`,
                title: dept.name,
                description: dept.description || "",
              })),
            },
          ],
        });

        // Save booking state.
        const bookingState = {
          step: "select_department",
          nodeId: currentNodeId,
          bookingLabel: config.bookingLabel || "appointment",
          config,
        };

        await engine.effects.saveState({
          context: { ...localContext, bookingState },
          cursor: currentNodeId,
          touch: true,
        });

        engine.effects.log?.({
          nodeId: currentNodeId,
          nodeType: "booking.book_appointment",
          step: "select_department",
          success: true,
        });

        // Wait for user input — exit the loop.
        return null;
      }
    }

    // This shouldn't happen in normal flow.
    return null;
  }

  // ── booking.check_bookings ────────────────────────────────────────────
  if (nodeType === "booking.check_bookings") {
    const config = currentNode.data?.config || {};
    const checkType = config.checkType || "my_bookings";
    const localContext = (ctx || {}) as any;

    console.log(`[Booking] Processing check_bookings node: ${currentNodeId}, type: ${checkType}`);

    // Get customer bookings by phone (web chat: by session key) with filters.
    const statusFilter = config.statusFilter || "upcoming";
    const maxBookings = config.maxBookings || 0;

    const allCustomerBookings = await storage.getBookingsForCustomer(
      engine.customerPhone,
      engine.userId
    );

    // Apply status filter.
    let customerBookings = allCustomerBookings;
    if (statusFilter === "upcoming") {
      // Upcoming = confirmed and date >= today.
      const today = new Date().toISOString().split("T")[0];
      customerBookings = allCustomerBookings.filter(
        (b: any) => b.status === "confirmed" && b.slotDate >= today
      );
    } else if (statusFilter === "confirmed") {
      customerBookings = allCustomerBookings.filter((b: any) => b.status === "confirmed");
    } else if (statusFilter === "pending") {
      customerBookings = allCustomerBookings.filter((b: any) => b.status === "pending");
    } else if (statusFilter === "completed") {
      customerBookings = allCustomerBookings.filter((b: any) => b.status === "completed");
    } else if (statusFilter === "cancelled") {
      customerBookings = allCustomerBookings.filter((b: any) => b.status === "cancelled");
    }
    // 'all' shows all statuses.

    // Apply max bookings limit (sort by date desc, take last N).
    if (maxBookings > 0 && customerBookings.length > maxBookings) {
      customerBookings = customerBookings
        .sort(
          (a: any, b: any) =>
            new Date(b.slotDate).getTime() - new Date(a.slotDate).getTime()
        )
        .slice(0, maxBookings);
    }

    // For reschedule/cancel, only show confirmed bookings.
    const activeBookings = customerBookings.filter((b: any) => b.status === "confirmed");

    if (canSend) {
      if (checkType === "my_bookings") {
        // Original behavior: show a text list of bookings.
        if (customerBookings.length === 0) {
          const noBookingsMessage =
            config.noBookingsMessage || "You don't have any upcoming appointments.";
          await engine.effects.sendText(noBookingsMessage);
        } else {
          const bookingListFormat =
            config.bookingListFormat ||
            "{{date}} at {{time}}\n{{department}} - {{staff}}\nStatus: {{status}}";

          // Batch fetch all staff and departments in parallel for speed.
          const staffIds = Array.from(new Set(customerBookings.map((b: any) => b.staffId)));
          const staffList = await Promise.all(
            staffIds.map((id) => storage.getBookingStaff(id))
          );
          const staffMap = new Map(
            staffList.filter(Boolean).map((s: any) => [s.id, s])
          );

          const deptIds = Array.from(
            new Set(staffList.filter(Boolean).map((s: any) => s.departmentId))
          );
          const deptList = await Promise.all(
            deptIds.map((id) => storage.getBookingDepartment(id))
          );
          const deptMap = new Map(
            deptList.filter(Boolean).map((d: any) => [d.id, d])
          );

          let bookingsText = "Your appointments:\n\n";
          for (const booking of customerBookings) {
            const staff = staffMap.get(booking.staffId);
            const dept = staff ? deptMap.get(staff.departmentId) : null;

            const formatted = bookingListFormat
              .replace(/\{\{date\}\}/g, booking.slotDate)
              .replace(/\{\{time\}\}/g, booking.startTime)
              .replace(/\{\{department\}\}/g, dept?.name || "")
              .replace(/\{\{staff\}\}/g, staff?.name || "")
              .replace(/\{\{status\}\}/g, booking.status);
            bookingsText += formatted + "\n\n";
          }

          await engine.effects.sendText(bookingsText.trim());
        }

        // Continue to next node.
        const nextNodeId = getNextNodeByHandle(
          currentNodeId,
          "booked",
          engine.definition.edges
        );
        if (!nextNodeId) return null;
        const nextNode = engine.definition.nodes?.find((n: any) => n.id === nextNodeId);
        if (!nextNode) return null;
        currentNode = nextNode;
        currentNodeId = nextNodeId;
      } else if (checkType === "reschedule" || checkType === "cancel_booking") {
        // Interactive mode: show a list of bookings to select.
        if (activeBookings.length === 0) {
          const noBookingsMessage =
            config.noBookingsMessage || "You don't have any upcoming appointments.";
          await engine.effects.sendText(noBookingsMessage);

          // Continue to next node (no_slots path).
          const nextNodeId = getNextNodeByHandle(
            currentNodeId,
            "no_slots",
            engine.definition.edges
          );
          if (!nextNodeId) return null;
          const nextNode = engine.definition.nodes?.find((n: any) => n.id === nextNodeId);
          if (!nextNode) return null;
          currentNode = nextNode;
          currentNodeId = nextNodeId;
        } else {
          // Build an interactive list of bookings.
          const actionType = checkType === "reschedule" ? "reschedule" : "cancel";
          const promptMessage =
            checkType === "reschedule"
              ? config.reschedulePromptMessage ||
                "Select the appointment you want to reschedule:"
              : config.cancelPromptMessage || "Select the appointment you want to cancel:";
          const buttonLabel =
            checkType === "reschedule"
              ? config.rescheduleButtonLabel || "Select Appointment"
              : config.cancelButtonLabel || "Select Appointment";

          // Batch fetch all staff and departments in parallel for speed.
          const staffIdsForAction = Array.from(
            new Set(activeBookings.map((b: any) => b.staffId))
          );
          const staffListForAction = await Promise.all(
            staffIdsForAction.map((id) => storage.getBookingStaff(id))
          );
          const staffMapForAction = new Map(
            staffListForAction.filter(Boolean).map((s: any) => [s.id, s])
          );

          const deptIdsForAction = Array.from(
            new Set(staffListForAction.filter(Boolean).map((s: any) => s.departmentId))
          );
          const deptListForAction = await Promise.all(
            deptIdsForAction.map((id) => storage.getBookingDepartment(id))
          );
          const deptMapForAction = new Map(
            deptListForAction.filter(Boolean).map((d: any) => [d.id, d])
          );

          // Build rows with booking info.
          const bookingRows = activeBookings.map((booking: any) => {
            const staff = staffMapForAction.get(booking.staffId);
            const dept = staff ? deptMapForAction.get(staff.departmentId) : null;
            return {
              id: `booking_${actionType}_${booking.id}`,
              title: `${booking.slotDate} at ${booking.startTime}`,
              description:
                `${dept?.name || ""} - ${staff?.name || ""}`.trim() || "Appointment",
            };
          });

          await engine.effects.sendList({
            body: promptMessage,
            buttonLabel,
            sections: [{ title: "Your Appointments", rows: bookingRows }],
          });

          // Save state for handling the response.
          const checkBookingsState = {
            step: `select_${actionType}`,
            nodeId: currentNodeId,
            checkType,
            config,
          };

          await engine.effects.saveState({
            context: { ...localContext, checkBookingsState },
            cursor: currentNodeId,
            touch: true,
          });

          // Don't continue — wait for the user selection.
          engine.effects.log?.({
            nodeId: currentNodeId,
            nodeType: "booking.check_bookings",
            checkType,
            bookingsCount: activeBookings.length,
            success: true,
          });
          return null;
        }
      }
    }

    engine.effects.log?.({
      nodeId: currentNodeId,
      nodeType: "booking.check_bookings",
      bookingsCount: customerBookings.length,
      success: true,
    });

    // Fall-through: the branch only advances the cursor when it found a next
    // node. Otherwise there is nothing left to do (this path looped forever
    // before 4A-2a).
    if (currentNodeId !== startNodeId) {
      return { nextNodeId: currentNodeId, context: ctx };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Step machine (button replies and text answers)
// (routes.ts:9740-10418 and 10563-10866, verbatim logic)
// ---------------------------------------------------------------------------

/**
 * Advance a waiting booking step.
 *
 * Callers must only invoke this while a booking state exists in the context
 * (`bookingAwaitingFromContext`), although a stale input safely returns
 * `{ handled: false }` so the caller can fall back to normal routing.
 */
export async function runBookingStep(
  engine: BookingEngine,
  input: BookingInput,
  context: any
): Promise<BookingStepResult> {
  const ctx = (context || {}) as any;
  const canSend = engine.effects.canSend;
  const answered = (nextContext?: any, nextNodeId: string | null = null): BookingStepResult => ({
    handled: true,
    nextNodeId,
    context: nextContext === undefined ? ctx : nextContext,
  });

  // ── Button replies ────────────────────────────────────────────────────
  if (input.type === "button") {
    const buttonId = input.buttonId;
    const bookingState = ctx.bookingState;
    const checkBookingsState = ctx.checkBookingsState;

    if (bookingState) {
      // Production resolves the channel before dispatching. With no channel it
      // returns a silent 200 without changing state.
      if (!canSend) return answered();

      // ── Department selected → staff list (retry allowed from select_staff)
      if (
        (bookingState.step === "select_department" ||
          bookingState.step === "select_staff") &&
        buttonId.startsWith("booking_dept_")
      ) {
        const deptId = parseInt(buttonId.replace("booking_dept_", ""));

        // Parallelize: verify department + get staff.
        const [department, staff] = await Promise.all([
          storage.getBookingDepartment(deptId),
          storage.getBookingStaffForDepartment(deptId),
        ]);

        if (!department || department.userId !== engine.userId) {
          console.error(
            `[Booking] Invalid department selection: ${deptId} for user ${engine.userId}`
          );
          await engine.effects.saveState({
            context: { ...ctx, bookingState: undefined },
          });
          return answered();
        }

        if (staff.length === 0) {
          await engine.effects.sendText("Sorry, no staff available for this department.");
          // Reset booking state.
          await engine.effects.saveState({
            context: { ...ctx, bookingState: undefined },
          });
          return answered();
        }

        // Send the staff selection list.
        const staffPromptMsg =
          bookingState.config?.staffPromptMessage || "Please select a provider:";

        await engine.effects.sendList({
          body: staffPromptMsg,
          buttonLabel: bookingState.config?.staffButtonLabel || "Select Provider",
          sections: [
            {
              title: "Staff",
              rows: staff.map((s: any) => ({
                id: `booking_staff_${s.id}`,
                title: s.name,
                description: s.specialty || "",
              })),
            },
          ],
        });

        // Update booking state.
        await engine.effects.saveState({
          context: {
            ...ctx,
            bookingState: { ...bookingState, step: "select_staff", departmentId: deptId },
          },
        });

        return answered();
      }

      // ── Staff selected → slot list (retry allowed from select_slot)
      if (
        (bookingState.step === "select_staff" || bookingState.step === "select_slot") &&
        buttonId.startsWith("booking_staff_")
      ) {
        const staffId = parseInt(buttonId.replace("booking_staff_", ""));

        // Parallelize: verify staff + check existing booking + get slots.
        const [staffMember, existingCountResult, staffSlots] = await Promise.all([
          storage.getBookingStaff(staffId),
          !bookingState.config?.allowMultiple
            ? storage.countActiveBookingsForCustomer(
                engine.customerPhone,
                engine.userId,
                bookingState.nodeId
              )
            : Promise.resolve(0),
          storage.getBookingStaffSlots(staffId),
        ]);

        if (!staffMember || staffMember.departmentId !== bookingState.departmentId) {
          console.error(`[Booking] Invalid staff selection: ${staffId}`);
          await engine.effects.saveState({
            context: { ...ctx, bookingState: undefined },
          });
          return answered();
        }

        // Check if the customer already has a booking.
        if (existingCountResult > 0) {
          const existingBookingMessage =
            bookingState.config?.existingBookingMessage ||
            "You already have an active appointment. Please cancel your existing booking first.";
          await engine.effects.sendText(existingBookingMessage);
          await engine.effects.saveState({
            context: { ...ctx, bookingState: undefined },
          });
          return answered();
        }

        const activeSlots = staffSlots.filter((s: any) => s.isActive);

        if (activeSlots.length === 0) {
          await engine.effects.sendText(
            bookingState.config?.noSlotsMessage || "Sorry, no available time slots."
          );
          await engine.effects.saveState({
            context: { ...ctx, bookingState: undefined },
          });
          return answered();
        }

        // Generate available date/time combinations — batch query.
        const maxSlots = bookingState.config?.maxAdvanceDays || 30;
        const startToday = bookingState.config?.startToday !== false;
        const startOffset = startToday ? 0 : 1;

        // Calculate date range for batch query — limit to a reasonable range.
        const maxDaysToCheck = Math.min(365, maxSlots * 7); // check ~7 days per slot needed
        const startDate = dayjs()
          .tz("Asia/Bahrain")
          .add(startOffset, "day")
          .format("YYYY-MM-DD");
        const endDate = dayjs()
          .tz("Asia/Bahrain")
          .add(startOffset + maxDaysToCheck, "day")
          .format("YYYY-MM-DD");

        // Get all booking counts in one query.
        const bookingCounts = await storage.getBulkBookingCounts(staffId, {
          startDate,
          endDate,
        });

        const availableDateTimes: {
          date: string;
          startTime: string;
          endTime: string;
          slotId: number;
        }[] = [];

        for (
          let i = startOffset;
          availableDateTimes.length < maxSlots && i <= startOffset + maxDaysToCheck;
          i++
        ) {
          const checkDate = dayjs().tz("Asia/Bahrain").add(i, "day");
          const dateStr = checkDate.format("YYYY-MM-DD");
          const dayOfWeek = checkDate.day();

          for (const slot of activeSlots) {
            if (slot.dayOfWeek === dayOfWeek) {
              const key = `${dateStr}_${slot.startTime}`;
              const existingCount = bookingCounts.get(key) || 0;
              if (existingCount < slot.capacity) {
                availableDateTimes.push({
                  date: dateStr,
                  startTime: slot.startTime,
                  endTime: slot.endTime,
                  slotId: slot.id,
                });
              }
            }
            if (availableDateTimes.length >= maxSlots) break;
          }
        }

        if (availableDateTimes.length === 0) {
          await engine.effects.sendText(
            bookingState.config?.noSlotsMessage || "Sorry, no available time slots."
          );
          await engine.effects.saveState({
            context: { ...ctx, bookingState: undefined },
          });
          return answered();
        }

        // Build slot rows with date-time combinations.
        const slotRows = availableDateTimes.map((slot) => ({
          id: `booking_slot_${slot.slotId}_${slot.date}`,
          title: `${slot.date} at ${slot.startTime}`,
          description: `${slot.startTime} - ${slot.endTime}`,
        }));

        const slotPromptMsg =
          bookingState.config?.slotPromptMessage ||
          "Please select an available time slot:";

        await engine.effects.sendList({
          body: slotPromptMsg,
          buttonLabel: bookingState.config?.slotButtonLabel || "Select Time",
          sections: [{ title: "Available Times", rows: slotRows }],
        });

        // Update booking state.
        await engine.effects.saveState({
          context: {
            ...ctx,
            bookingState: { ...bookingState, step: "select_slot", staffId },
          },
        });

        return answered();
      }

      // ── Slot selected → name / custom questions / create (retry from enter_name)
      if (
        (bookingState.step === "select_slot" || bookingState.step === "enter_name") &&
        buttonId.startsWith("booking_slot_")
      ) {
        // Parse id format: booking_slot_${slotId}_${date}
        const slotParts = buttonId.replace("booking_slot_", "").split("_");
        const slotId = parseInt(slotParts[0]);
        const slotDate = slotParts.slice(1).join("_"); // handle dates with underscores

        // Get slot details first to get startTime for the availability check.
        const slot = await storage.getBookingStaffSlot(slotId);

        if (!slot || slot.staffId !== bookingState.staffId) {
          await engine.effects.sendText("Sorry, this slot is no longer available.");
          await engine.effects.saveState({
            context: { ...ctx, bookingState: undefined },
          });
          return answered();
        }

        // Verify the slot is still available for this date.
        const availability = await storage.checkSlotAvailability(
          bookingState.staffId,
          slotDate,
          slot.startTime,
          slot.endTime
        );

        if (!availability.available) {
          await engine.effects.sendText(
            "Sorry, this slot is no longer available. It may have been taken."
          );
          await engine.effects.saveState({
            context: { ...ctx, bookingState: undefined },
          });
          return answered();
        }

        // If requireName is enabled, ask for the customer name first.
        if (bookingState.config?.requireName) {
          const namePrompt =
            bookingState.config?.namePromptMessage ||
            "Please enter your full name to complete the booking:";
          await engine.effects.sendText(namePrompt);

          // Update booking state to wait for the name.
          await engine.effects.saveState({
            context: {
              ...ctx,
              bookingState: {
                ...bookingState,
                step: "enter_name",
                selectedSlotId: slotId,
                selectedSlotDate: slotDate,
                selectedStartTime: slot.startTime,
                selectedEndTime: slot.endTime,
              },
            },
          });

          return answered();
        }

        // Check if custom questions are enabled (without requiring a name).
        const configCheck = bookingState.config || {};
        if (configCheck.customQuestion1Enabled && configCheck.customQuestion1Prompt) {
          await engine.effects.sendText(configCheck.customQuestion1Prompt);

          await engine.effects.saveState({
            context: {
              ...ctx,
              bookingState: {
                ...bookingState,
                step: "enter_custom1",
                customerName: "",
                selectedSlotId: slotId,
                selectedSlotDate: slotDate,
                selectedStartTime: slot.startTime,
                selectedEndTime: slot.endTime,
              },
            },
          });

          return answered();
        }

        // No name or custom questions required — create the booking immediately.
        try {
          const booking = await storage.createBooking({
            userId: engine.userId,
            staffId: bookingState.staffId,
            departmentId: bookingState.departmentId,
            customerPhone: engine.customerPhone,
            customerName: "",
            slotDate: slotDate,
            startTime: slot.startTime,
            endTime: slot.endTime,
            status: bookingState.config?.defaultBookingStatus || "confirmed",
            nodeId: bookingState.nodeId,
            bookingLabel: bookingState.bookingLabel,
            reminderEnabled: engine.remindersSupported
              ? bookingState.config?.reminderEnabled || false
              : false,
            reminderHoursBefore: bookingState.config?.reminderHoursBefore || 24,
            reminderMessage: bookingState.config?.reminderMessage || null,
            reminderSent: false,
          });

          // Get staff and department names for the success message.
          const staff = await storage.getBookingStaff(bookingState.staffId);
          const dept = await storage.getBookingDepartment(bookingState.departmentId);

          // Use the pending message if the status is pending, otherwise success.
          const bookingStatus = bookingState.config?.defaultBookingStatus || "confirmed";
          let messageToSend: string;

          if (bookingStatus === "pending") {
            messageToSend =
              bookingState.config?.pendingMessage ||
              "Your booking request has been submitted. Our team will review and confirm your appointment soon.";
          } else {
            messageToSend =
              bookingState.config?.successMessage ||
              "Your appointment has been booked for {{date}} at {{time}}.";
          }

          messageToSend = renderBookingMessage(messageToSend, {
            date: slotDate,
            time: slot.startTime,
            department: dept?.name,
            staff: staff?.name,
          });

          await engine.effects.sendText(messageToSend);

          // Clear booking state and continue on the "booked" path.
          const bookedNodeId = getNextNodeByHandle(
            bookingState.nodeId,
            "booked",
            engine.definition.edges
          );

          const nextContext = {
            ...ctx,
            bookingState: undefined,
            lastBookingId: booking.id,
          };

          await engine.effects.saveState({
            context: nextContext,
            cursor: bookedNodeId || bookingState.nodeId,
          });

          console.log(
            `[Booking] Created booking ${booking.id} for ${engine.customerPhone}`
          );

          return answered(nextContext, bookedNodeId || bookingState.nodeId);
        } catch (bookingError: any) {
          console.error(`[Booking] Failed to create booking: ${bookingError.message}`);
          await engine.effects.sendText(
            "Sorry, we could not book this slot. It may no longer be available."
          );
          await engine.effects.saveState({
            context: { ...ctx, bookingState: undefined },
          });
          return answered();
        }
      }
    }

    // ── check_bookings interactive steps (reschedule / cancel) ───────────
    if (checkBookingsState) {
      if (!canSend) return answered();

      // ── Reschedule: booking selected → new slot list
      if (
        checkBookingsState.step === "select_reschedule" &&
        buttonId.startsWith("booking_reschedule_")
      ) {
        const bookingId = parseInt(buttonId.replace("booking_reschedule_", ""));
        console.log(`[Booking] User selected booking ${bookingId} to reschedule`);

        // Get the booking to verify ownership.
        const booking = await storage.getBooking(bookingId);
        if (
          !booking ||
          booking.customerPhone !== engine.customerPhone ||
          booking.userId !== engine.userId
        ) {
          console.error(`[Booking] Invalid booking selection for reschedule: ${bookingId}`);
          await engine.effects.saveState({
            context: { ...ctx, checkBookingsState: undefined },
          });
          return answered();
        }

        // Get available slots for the same staff member.
        const staffSlots = await storage.getBookingStaffSlots(booking.staffId);

        if (staffSlots.length === 0) {
          await engine.effects.sendText(
            "Sorry, no available slots for rescheduling at this time."
          );
          await engine.effects.saveState({
            context: { ...ctx, checkBookingsState: undefined },
          });
          return answered();
        }

        // Build available date-time combinations (next 7 days).
        const availableDateTimes: {
          slotId: number;
          date: string;
          startTime: string;
          endTime: string;
        }[] = [];

        for (let i = 0; i < 7; i++) {
          const checkDate = new Date();
          checkDate.setDate(checkDate.getDate() + i);
          const dayOfWeek = checkDate.getDay();
          const dateStr = checkDate.toISOString().split("T")[0];

          // Find slots for this day.
          const daySlots = staffSlots.filter((s: any) => s.dayOfWeek === dayOfWeek);

          for (const slot of daySlots) {
            // Check availability (capacity not reached).
            const availabilityResult = await storage.checkSlotAvailability(
              booking.staffId,
              dateStr,
              slot.startTime,
              slot.endTime
            );
            if (availabilityResult.available) {
              availableDateTimes.push({
                slotId: slot.id,
                date: dateStr,
                startTime: slot.startTime,
                endTime: slot.endTime,
              });
            }
          }
        }

        if (availableDateTimes.length === 0) {
          await engine.effects.sendText(
            "Sorry, no available slots for rescheduling in the next 7 days."
          );
          await engine.effects.saveState({
            context: { ...ctx, checkBookingsState: undefined },
          });
          return answered();
        }

        // Build slot rows.
        const slotRows = availableDateTimes.slice(0, 10).map((slot) => ({
          id: `booking_newslot_${slot.slotId}_${slot.date}`,
          title: `${slot.date} at ${slot.startTime}`,
          description: `${slot.startTime} - ${slot.endTime}`,
        }));

        const slotPromptMsg =
          checkBookingsState.config?.rescheduleSlotMessage ||
          "Select a new time for your appointment:";
        const slotButtonLabel =
          checkBookingsState.config?.rescheduleSlotButtonLabel || "Select New Time";

        await engine.effects.sendList({
          body: slotPromptMsg,
          buttonLabel: slotButtonLabel,
          sections: [{ title: "Available Times", rows: slotRows }],
        });

        // Update state with the selected booking.
        await engine.effects.saveState({
          context: {
            ...ctx,
            checkBookingsState: {
              ...checkBookingsState,
              step: "select_new_slot",
              bookingId,
              staffId: booking.staffId,
            },
          },
        });

        return answered();
      }

      // ── Reschedule: new slot selected → update the booking
      if (
        checkBookingsState.step === "select_new_slot" &&
        buttonId.startsWith("booking_newslot_")
      ) {
        const slotParts = buttonId.replace("booking_newslot_", "").split("_");
        const slotId = parseInt(slotParts[0]);
        const newSlotDate = slotParts.slice(1).join("_");

        console.log(
          `[Booking] Rescheduling booking ${checkBookingsState.bookingId} to slot ${slotId} on ${newSlotDate}`
        );

        // Get slot details.
        const slot = await storage.getBookingStaffSlot(slotId);
        if (!slot || slot.staffId !== checkBookingsState.staffId) {
          await engine.effects.sendText("Sorry, this slot is no longer available.");
          await engine.effects.saveState({
            context: { ...ctx, checkBookingsState: undefined },
          });
          return answered();
        }

        // Check availability again.
        const availabilityResult = await storage.checkSlotAvailability(
          checkBookingsState.staffId,
          newSlotDate,
          slot.startTime,
          slot.endTime,
          checkBookingsState.bookingId
        );
        if (!availabilityResult.available) {
          await engine.effects.sendText(
            "Sorry, this slot is no longer available. Please try again."
          );
          await engine.effects.saveState({
            context: { ...ctx, checkBookingsState: undefined },
          });
          return answered();
        }

        // Update the booking with the new date/time.
        try {
          await storage.updateBooking(checkBookingsState.bookingId, {
            slotDate: newSlotDate,
            startTime: slot.startTime,
            endTime: slot.endTime,
          });

          // Get staff and department for the success message.
          const staff = await storage.getBookingStaff(checkBookingsState.staffId);
          const dept = staff
            ? await storage.getBookingDepartment(staff.departmentId)
            : null;

          let successMessage =
            checkBookingsState.config?.rescheduleSuccessMessage ||
            "Your appointment has been rescheduled to {{date}} at {{time}}.";
          successMessage = renderBookingMessage(successMessage, {
            date: newSlotDate,
            time: slot.startTime,
            department: dept?.name,
            staff: staff?.name,
          });

          await engine.effects.sendText(successMessage);

          // Clear state and continue to the booked path.
          const bookedNodeId = getNextNodeByHandle(
            checkBookingsState.nodeId,
            "booked",
            engine.definition.edges
          );

          const nextContext = { ...ctx, checkBookingsState: undefined };

          await engine.effects.saveState({
            context: nextContext,
            cursor: bookedNodeId || checkBookingsState.nodeId,
          });

          console.log(
            `[Booking] Rescheduled booking ${checkBookingsState.bookingId} to ${newSlotDate} at ${slot.startTime}`
          );

          return answered(nextContext, bookedNodeId || checkBookingsState.nodeId);
        } catch (updateError: any) {
          console.error(`[Booking] Failed to reschedule: ${updateError.message}`);
          await engine.effects.sendText(
            "Sorry, we could not reschedule your appointment. Please try again."
          );
          await engine.effects.saveState({
            context: { ...ctx, checkBookingsState: undefined },
          });
          return answered();
        }
      }

      // ── Cancel: booking selected → cancel it
      if (
        checkBookingsState.step === "select_cancel" &&
        buttonId.startsWith("booking_cancel_")
      ) {
        const bookingId = parseInt(buttonId.replace("booking_cancel_", ""));
        console.log(`[Booking] User selected booking ${bookingId} to cancel`);

        // Get the booking to verify ownership.
        const booking = await storage.getBooking(bookingId);
        if (
          !booking ||
          booking.customerPhone !== engine.customerPhone ||
          booking.userId !== engine.userId
        ) {
          console.error(`[Booking] Invalid booking selection for cancel: ${bookingId}`);
          await engine.effects.saveState({
            context: { ...ctx, checkBookingsState: undefined },
          });
          return answered();
        }

        // Cancel the booking (update status to cancelled).
        try {
          await storage.updateBooking(bookingId, { status: "cancelled" });

          // Get staff and department for the cancel message.
          const staff = await storage.getBookingStaff(booking.staffId);
          const dept = staff
            ? await storage.getBookingDepartment(staff.departmentId)
            : null;

          let cancelMessage =
            checkBookingsState.config?.cancelSuccessMessage ||
            "Your appointment on {{date}} at {{time}} has been cancelled.";
          cancelMessage = renderBookingMessage(cancelMessage, {
            date: booking.slotDate,
            time: booking.startTime,
            department: dept?.name,
            staff: staff?.name,
          });

          await engine.effects.sendText(cancelMessage);

          // Clear state and continue to the booked path.
          const bookedNodeId = getNextNodeByHandle(
            checkBookingsState.nodeId,
            "booked",
            engine.definition.edges
          );

          const nextContext = { ...ctx, checkBookingsState: undefined };

          await engine.effects.saveState({
            context: nextContext,
            cursor: bookedNodeId || checkBookingsState.nodeId,
          });

          console.log(`[Booking] Cancelled booking ${bookingId}`);

          return answered(nextContext, bookedNodeId || checkBookingsState.nodeId);
        } catch (cancelError: any) {
          console.error(`[Booking] Failed to cancel booking: ${cancelError.message}`);
          await engine.effects.sendText(
            "Sorry, we could not cancel your appointment. Please try again."
          );
          await engine.effects.saveState({
            context: { ...ctx, checkBookingsState: undefined },
          });
          return answered();
        }
      }
    }

    return { handled: false, nextNodeId: null, context: ctx };
  }

  // ── Text answers ──────────────────────────────────────────────────────
  const bookingState = ctx.bookingState;

  // ── enter_name ────────────────────────────────────────────────────────
  if (bookingState?.step === "enter_name") {
    if (!canSend) return answered();

    // Customer is providing their name.
    const customerName = input.text.trim();

    if (customerName.length < 2) {
      // Invalid name, ask again.
      await engine.effects.sendText("Please enter a valid name (at least 2 characters).");
      return answered();
    }

    // Store the name and check if we need to ask custom questions.
    const config = bookingState.config || {};

    // Check if custom question 1 is enabled.
    if (config.customQuestion1Enabled && config.customQuestion1Prompt) {
      await engine.effects.sendText(config.customQuestion1Prompt);

      await engine.effects.saveState({
        context: {
          ...ctx,
          bookingState: {
            ...bookingState,
            step: "enter_custom1",
            customerName: customerName,
          },
        },
      });

      return answered();
    }

    // No custom questions — create the booking with the provided name.
    try {
      const bookingStatus = bookingState.config?.defaultBookingStatus || "confirmed";
      const booking = await storage.createBooking({
        userId: engine.userId,
        staffId: bookingState.staffId,
        departmentId: bookingState.departmentId,
        customerPhone: engine.customerPhone,
        customerName: customerName,
        slotDate: bookingState.selectedSlotDate,
        startTime: bookingState.selectedStartTime,
        endTime: bookingState.selectedEndTime,
        status: bookingStatus,
        nodeId: bookingState.nodeId,
        bookingLabel: bookingState.bookingLabel,
        reminderEnabled: engine.remindersSupported
          ? bookingState.config?.reminderEnabled || false
          : false,
        reminderHoursBefore: bookingState.config?.reminderHoursBefore || 24,
        reminderMessage: bookingState.config?.reminderMessage || null,
        reminderSent: false,
      });

      // Get staff and department names in parallel for speed.
      const [staff, dept] = await Promise.all([
        storage.getBookingStaff(bookingState.staffId),
        storage.getBookingDepartment(bookingState.departmentId),
      ]);

      // Use the pending message if the status is pending, otherwise success.
      const messageToSend = renderBookingMessage(
        bookingStatus === "pending"
          ? bookingState.config?.pendingMessage ||
              "Your booking request has been submitted. Our team will review and confirm your appointment soon."
          : bookingState.config?.successMessage ||
              "Your appointment has been booked for {{date}} at {{time}}.",
        {
          date: bookingState.selectedSlotDate,
          time: bookingState.selectedStartTime,
          department: dept?.name,
          staff: staff?.name,
          name: customerName,
        }
      );

      await engine.effects.sendText(messageToSend);

      // Clear booking state and continue on the "booked" path.
      const bookedNodeId = getNextNodeByHandle(
        bookingState.nodeId,
        "booked",
        engine.definition.edges
      );

      const nextContext = {
        ...ctx,
        bookingState: undefined,
        lastBookingId: booking.id,
      };

      await engine.effects.saveState({
        context: nextContext,
        cursor: bookedNodeId || bookingState.nodeId,
      });

      console.log(
        `[Booking] Created booking ${booking.id} for ${engine.customerPhone} with name: ${customerName}`
      );

      return answered(nextContext, bookedNodeId || bookingState.nodeId);
    } catch (bookingError: any) {
      console.error(`[Booking] Failed to create booking: ${bookingError.message}`);
      await engine.effects.sendText(
        "Sorry, we could not book this slot. It may no longer be available."
      );
      await engine.effects.saveState({
        context: { ...ctx, bookingState: undefined },
      });
      return answered();
    }
  }

  // ── enter_custom1 ─────────────────────────────────────────────────────
  if (bookingState?.step === "enter_custom1") {
    if (!canSend) return answered();

    const customValue1 = input.text.trim();
    const config = bookingState.config || {};

    // Check if custom question 2 is enabled.
    if (config.customQuestion2Enabled && config.customQuestion2Prompt) {
      await engine.effects.sendText(config.customQuestion2Prompt);

      await engine.effects.saveState({
        context: {
          ...ctx,
          bookingState: {
            ...bookingState,
            step: "enter_custom2",
            customField1Value: customValue1,
            customField1Label: config.customQuestion1Label || "Question 1",
          },
        },
      });

      return answered();
    }

    // No second question — create the booking.
    try {
      const bookingStatus = config.defaultBookingStatus || "confirmed";
      const booking = await storage.createBooking({
        userId: engine.userId,
        staffId: bookingState.staffId,
        departmentId: bookingState.departmentId,
        customerPhone: engine.customerPhone,
        customerName: bookingState.customerName || "",
        slotDate: bookingState.selectedSlotDate,
        startTime: bookingState.selectedStartTime,
        endTime: bookingState.selectedEndTime,
        status: bookingStatus,
        nodeId: bookingState.nodeId,
        bookingLabel: bookingState.bookingLabel,
        customField1Label: config.customQuestion1Label || "Question 1",
        customField1Value: customValue1,
        reminderEnabled: engine.remindersSupported
          ? config.reminderEnabled || false
          : false,
        reminderHoursBefore: config.reminderHoursBefore || 24,
        reminderMessage: config.reminderMessage || null,
        reminderSent: false,
      });

      // Parallel lookups for speed.
      const [staff, dept] = await Promise.all([
        storage.getBookingStaff(bookingState.staffId),
        storage.getBookingDepartment(bookingState.departmentId),
      ]);

      // Use the pending message if the status is pending, otherwise success.
      const messageToSend = renderBookingMessage(
        bookingStatus === "pending"
          ? config.pendingMessage ||
              "Your booking request has been submitted. Our team will review and confirm your appointment soon."
          : config.successMessage ||
              "Your appointment has been booked for {{date}} at {{time}}.",
        {
          date: bookingState.selectedSlotDate,
          time: bookingState.selectedStartTime,
          department: dept?.name,
          staff: staff?.name,
          name: bookingState.customerName || "",
        }
      );

      await engine.effects.sendText(messageToSend);

      const bookedNodeId = getNextNodeByHandle(
        bookingState.nodeId,
        "booked",
        engine.definition.edges
      );

      const nextContext = {
        ...ctx,
        bookingState: undefined,
        lastBookingId: booking.id,
      };

      await engine.effects.saveState({
        context: nextContext,
        cursor: bookedNodeId || bookingState.nodeId,
      });

      return answered(nextContext, bookedNodeId || bookingState.nodeId);
    } catch (bookingError: any) {
      console.error(`[Booking] Failed to create booking: ${bookingError.message}`);
      await engine.effects.sendText(
        "Sorry, we could not book this slot. It may no longer be available."
      );
      await engine.effects.saveState({
        context: { ...ctx, bookingState: undefined },
      });
      return answered();
    }
  }

  // ── enter_custom2 ─────────────────────────────────────────────────────
  if (bookingState?.step === "enter_custom2") {
    if (!canSend) return answered();

    const customValue2 = input.text.trim();
    const config = bookingState.config || {};

    // Create the booking with both custom fields.
    try {
      const bookingStatus = config.defaultBookingStatus || "confirmed";
      const booking = await storage.createBooking({
        userId: engine.userId,
        staffId: bookingState.staffId,
        departmentId: bookingState.departmentId,
        customerPhone: engine.customerPhone,
        customerName: bookingState.customerName || "",
        slotDate: bookingState.selectedSlotDate,
        startTime: bookingState.selectedStartTime,
        endTime: bookingState.selectedEndTime,
        status: bookingStatus,
        nodeId: bookingState.nodeId,
        bookingLabel: bookingState.bookingLabel,
        customField1Label: bookingState.customField1Label || "Question 1",
        customField1Value: bookingState.customField1Value || "",
        customField2Label: config.customQuestion2Label || "Question 2",
        customField2Value: customValue2,
        reminderEnabled: engine.remindersSupported
          ? config.reminderEnabled || false
          : false,
        reminderHoursBefore: config.reminderHoursBefore || 24,
        reminderMessage: config.reminderMessage || null,
        reminderSent: false,
      });

      // Parallel lookups for speed.
      const [staff, dept] = await Promise.all([
        storage.getBookingStaff(bookingState.staffId),
        storage.getBookingDepartment(bookingState.departmentId),
      ]);

      // Use the pending message if the status is pending, otherwise success.
      const messageToSend = renderBookingMessage(
        bookingStatus === "pending"
          ? config.pendingMessage ||
              "Your booking request has been submitted. Our team will review and confirm your appointment soon."
          : config.successMessage ||
              "Your appointment has been booked for {{date}} at {{time}}.",
        {
          date: bookingState.selectedSlotDate,
          time: bookingState.selectedStartTime,
          department: dept?.name,
          staff: staff?.name,
          name: bookingState.customerName || "",
        }
      );

      await engine.effects.sendText(messageToSend);

      const bookedNodeId = getNextNodeByHandle(
        bookingState.nodeId,
        "booked",
        engine.definition.edges
      );

      const nextContext = {
        ...ctx,
        bookingState: undefined,
        lastBookingId: booking.id,
      };

      await engine.effects.saveState({
        context: nextContext,
        cursor: bookedNodeId || bookingState.nodeId,
      });

      return answered(nextContext, bookedNodeId || bookingState.nodeId);
    } catch (bookingError: any) {
      console.error(`[Booking] Failed to create booking: ${bookingError.message}`);
      await engine.effects.sendText(
        "Sorry, we could not book this slot. It may no longer be available."
      );
      await engine.effects.saveState({
        context: { ...ctx, bookingState: undefined },
      });
      return answered();
    }
  }

  return { handled: false, nextNodeId: null, context: ctx };
}
