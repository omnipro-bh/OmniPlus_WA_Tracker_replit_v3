/**
 * Phase 4A-2d — mock booking engine for the sandbox (test panel).
 *
 * Lets the live-demo panel walk the full booking sub-flow with synthetic data:
 * service → provider → time slot → [name] → [custom Q1] → [custom Q2] → booked,
 * plus the `booking.check_bookings` variants (my_bookings / reschedule / cancel).
 *
 * This module MUST NOT import storage, whapi, db, or any write-capable module.
 * It is a pure description of the booking conversation: it only builds panel
 * bubbles, mutates the in-memory context and reports trace entries. There is
 * no code path that can create, update or delete a row — the synthetic booking
 * returned by `mockCreateBooking` is a plain object that is never persisted.
 *
 * Verify with:
 *   grep -E 'storage\\.|whapi\\.|drizzle|createBooking\\(' server/workflows/sandbox-booking.ts
 * → should return 0 matches outside comments.
 *
 * Production `handleBookingNode` (routes.ts:10782) and the real sub-flow in the
 * webhook branches (routes.ts:9196-9571 / 10005-10310) are untouched. This is a
 * deliberate parallel implementation: the production machine is ~600 route-level
 * lines wired to db/whapi and cannot be dependency-injected surgically.
 *
 * Known divergences from production (approved for 4A-2d):
 *  - Sandbox continues into the `booked` branch in the same tick; production
 *    sets currentNodeId and returns, so its booked branch runs on the next
 *    inbound message.
 *  - A booking node reached after `input.text` is executed here; production
 *    stops with "booking nodes must be reached via button replies".
 *  - `booking.book_appointment` can never produce `no_slots` with fixtures
 *    (services are never empty). `check_bookings` reaches `no_slots` naturally
 *    when `statusFilter` excludes the (confirmed) mock booking.
 */

import { getNextNodeByHandle } from "./httpNodeExecutor";
import type { BookingNodeResult, TraceEntry } from "./flowRunner";
import type {
  SandboxAwaiting,
  SandboxInputType,
  SandboxMessage,
  SandboxTickResponse,
} from "./sandbox";

/** Trace entry without the runner-assigned sequence number. */
export type MockBookingTraceEntry = Omit<TraceEntry, "seq">;

// ---------------------------------------------------------------------------
// Fixtures — disjoint from real ids by construction (9xxx / demo_booking_*)
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const DEMO_PHONE = "+973 0000 0000";

/** UTC date `days` from now. Fixtures always look forward (min +1 day). */
function dayOffset(days: number): string {
  return new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10);
}

export const MOCK_SERVICES = [
  { id: 9001, name: "Demo Service A", description: "60 min · demo data" },
  { id: 9002, name: "Demo Service B", description: "30 min · demo data" },
  { id: 9003, name: "Demo Service C", description: "45 min · demo data" },
];

export const MOCK_PROVIDERS: Record<
  number,
  Array<{ id: number; name: string; specialty: string; departmentId: number }>
> = {
  9001: [
    { id: 9101, name: "Demo Provider 1", specialty: "Senior Specialist", departmentId: 9001 },
    { id: 9102, name: "Demo Provider 2", specialty: "Specialist", departmentId: 9001 },
  ],
  9002: [{ id: 9111, name: "Demo Provider 3", specialty: "Consultant", departmentId: 9002 }],
  9003: [{ id: 9121, name: "Demo Provider 4", specialty: "Consultant", departmentId: 9003 }],
};

/** Stable slot ids (mirrors production `booking_slot_<slotId>_<date>` ids). */
const MOCK_SLOT_TIMES = [
  { slotId: 9401, startTime: "10:00", endTime: "10:30" },
  { slotId: 9402, startTime: "11:00", endTime: "11:30" },
  { slotId: 9403, startTime: "14:00", endTime: "14:30" },
];

/** Slot dates shown by the mock: tomorrow, +2, +3. */
const MOCK_SLOT_OFFSETS = [1, 2, 3];

function mockSlotFor(slotId: number) {
  return MOCK_SLOT_TIMES.find((s) => s.slotId === slotId) || null;
}

function mockSlotRows() {
  const rows: Array<{ id: string; title: string; description: string }> = [];
  for (const offset of MOCK_SLOT_OFFSETS) {
    const date = dayOffset(offset);
    for (const slot of MOCK_SLOT_TIMES) {
      rows.push({
        id: `booking_slot_${slot.slotId}_${date}`,
        title: `${date} at ${slot.startTime}`,
        description: `${slot.startTime} - ${slot.endTime}`,
      });
    }
  }
  return rows;
}

export interface MockBookingFixture {
  id: string;
  slotDate: string;
  startTime: string;
  endTime: string;
  serviceName: string;
  providerName: string;
  staffId: number;
  departmentId: number;
  status: string;
}

/** The single synthetic "existing booking" used by check_bookings demos. */
export function mockBookings(): MockBookingFixture[] {
  return [
    {
      id: "demo_booking_1",
      slotDate: dayOffset(2),
      startTime: "10:00",
      endTime: "10:30",
      serviceName: "Demo Service A",
      providerName: "Demo Provider 1",
      staffId: 9101,
      departmentId: 9001,
      status: "confirmed",
    },
  ];
}

// ---------------------------------------------------------------------------
// Prompt / message defaults (byte-identical to production defaults)
// ---------------------------------------------------------------------------

const DEFAULT_PROMPT = "Please select a service for your appointment:";
const DEFAULT_DEPARTMENT_LABEL = "Select Service";
const DEFAULT_STAFF_PROMPT = "Please select a provider:";
const DEFAULT_STAFF_LABEL = "Select Provider";
const DEFAULT_SLOT_PROMPT = "Please select an available time slot:";
const DEFAULT_SLOT_LABEL = "Select Time";
const DEFAULT_NAME_PROMPT = "Please enter your full name to complete the booking:";
const DEFAULT_NO_SLOTS = "Sorry, no available time slots.";
const DEFAULT_SUCCESS = "Your appointment has been booked for {{date}} at {{time}}.";
const DEFAULT_PENDING =
  "Your booking request has been submitted. Our team will review and confirm your appointment soon.";
const DEFAULT_BOOKING_LIST_FORMAT =
  "{{date}} at {{time}}\n{{department}} - {{staff}}\nStatus: {{status}}";
const DEFAULT_NO_BOOKINGS = "You don't have any upcoming appointments.";
const DEFAULT_RESCHEDULE_PROMPT = "Select the appointment you want to reschedule:";
const DEFAULT_RESCHEDULE_LABEL = "Select Appointment";
const DEFAULT_RESCHEDULE_SLOT_PROMPT = "Select a new time for your appointment:";
const DEFAULT_RESCHEDULE_SLOT_LABEL = "Select New Time";
const DEFAULT_RESCHEDULE_SUCCESS =
  "Your appointment has been rescheduled to {{date}} at {{time}}.";
const DEFAULT_CANCEL_PROMPT = "Select the appointment you want to cancel:";
const DEFAULT_CANCEL_LABEL = "Select Appointment";
const DEFAULT_CANCEL_SUCCESS = "Your appointment on {{date}} at {{time}} has been cancelled.";

// ---------------------------------------------------------------------------
// Step vocabulary
// ---------------------------------------------------------------------------

/** Steps answered with free text in the sandbox panel. */
const TEXT_STEPS = new Set(["enter_name", "enter_custom1", "enter_custom2"]);

/** Every step the mock can be waiting on (used by the awaiting normaliser). */
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

/**
 * Derive the panel's `awaiting` descriptor from a mock booking state blob.
 *
 * Fail-graceful by design (approved refinement): a malformed / unexpected state
 * returns `null` so the caller falls back to the raw runner status instead of
 * throwing a 500. Accepts both `context.bookingState` and
 * `context.checkBookingsState` (same shape, different step vocabulary).
 */
export function deriveBookingAwaiting(bookingState: any): SandboxAwaiting | null {
  if (!bookingState || typeof bookingState !== "object") return null;
  if (bookingState.mock !== true) return null;

  const nodeId = typeof bookingState.nodeId === "string" ? bookingState.nodeId : null;
  if (!nodeId) return null;

  const step = typeof bookingState.step === "string" ? bookingState.step : "";
  if (!BOOKING_STEPS.has(step)) return null;

  return { kind: TEXT_STEPS.has(step) ? "text" : "button", nodeId };
}

// ---------------------------------------------------------------------------
// Message helpers
// ---------------------------------------------------------------------------

function renderTemplate(
  template: string,
  values: Record<string, string | undefined>
): string {
  let out = template;
  for (const [key, value] of Object.entries(values)) {
    out = out.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value || "");
  }
  return out;
}

function pushText(
  messages: SandboxMessage[],
  nodeId: string,
  nodeType: string,
  text: string
): void {
  messages.push({ nodeId, nodeType, type: "text", text });
}

function pushList(
  messages: SandboxMessage[],
  nodeId: string,
  nodeType: string,
  opts: {
    text: string;
    buttonLabel: string;
    sectionTitle: string;
    rows: Array<{ id: string; title: string; description: string }>;
  }
): void {
  messages.push({
    nodeId,
    nodeType,
    type: "list",
    text: opts.text,
    buttonLabel: opts.buttonLabel,
    sections: [{ title: opts.sectionTitle, rows: opts.rows }],
  });
}

function traceAwaiting(
  trace: MockBookingTraceEntry[],
  nodeId: string,
  nodeType: string,
  bookingStep: string,
  detail: Record<string, any> = {}
): void {
  trace.push({
    nodeId,
    nodeType,
    outcome: "awaiting",
    detail: { mock: true, bookingStep, ...detail },
  });
}

function traceSent(
  trace: MockBookingTraceEntry[],
  nodeId: string,
  nodeType: string,
  bookingStep: string,
  detail: Record<string, any> = {}
): void {
  trace.push({
    nodeId,
    nodeType,
    outcome: "sent",
    detail: { mock: true, bookingStep, ...detail },
  });
}

// ---------------------------------------------------------------------------
// Synthetic booking (never persisted)
// ---------------------------------------------------------------------------

export interface MockSyntheticBooking {
  id: string;
  staffId: number;
  departmentId: number;
  customerName: string;
  customerPhone: string;
  slotDate: string;
  startTime: string;
  endTime: string;
  status: string;
  bookingLabel: string;
  customField1Value?: string;
  customField2Value?: string;
  mock: true;
}

/** Plain object literal — there is nothing here to insert into a database. */
export function mockCreateBooking(state: any): MockSyntheticBooking {
  const config = state?.config || {};
  return {
    id: `demo_booking_${Date.now().toString(36)}`,
    staffId: state?.staffId,
    departmentId: state?.departmentId,
    customerName: state?.customerName || "",
    customerPhone: DEMO_PHONE,
    slotDate: state?.selectedSlotDate,
    startTime: state?.selectedStartTime,
    endTime: state?.selectedEndTime,
    status: config?.defaultBookingStatus || "confirmed",
    bookingLabel: state?.bookingLabel || "appointment",
    customField1Value: state?.customField1Value,
    customField2Value: state?.customField2Value,
    mock: true,
  };
}

/** Provider lookup across all services (used by the check_bookings flows). */
function providerById(staffId: number) {
  for (const providers of Object.values(MOCK_PROVIDERS)) {
    const match = providers.find((p) => p.id === staffId);
    if (match) return match;
  }
  return null;
}

function namesFor(departmentId: number, staffId: number) {
  const service = MOCK_SERVICES.find((s) => s.id === departmentId);
  const provider = providerById(staffId);
  return { serviceName: service?.name || "", providerName: provider?.name || "" };
}

// ---------------------------------------------------------------------------
// Sub-flow: book_appointment
// ---------------------------------------------------------------------------

type StepOutcome =
  | { kind: "awaiting"; context: Record<string, any>; trace: MockBookingTraceEntry[] }
  | { kind: "resume"; context: Record<string, any>; trace: MockBookingTraceEntry[]; nextNodeId: string | null }
  | { kind: "stop"; context: Record<string, any>; trace: MockBookingTraceEntry[] };

/** Complete the booking sub-flow: synthetic booking + success bubble + `booked` route. */
function completeAppointment(
  state: any,
  edges: any[],
  messages: SandboxMessage[],
  trace: MockBookingTraceEntry[]
): StepOutcome {
  const nodeId = state.nodeId;
  const nodeType = "booking.book_appointment";
  const config = state.config || {};

  const booking = mockCreateBooking(state);
  const { serviceName, providerName } = namesFor(state.departmentId, state.staffId);

  const template = booking.status === "pending"
    ? config.pendingMessage || DEFAULT_PENDING
    : config.successMessage || DEFAULT_SUCCESS;

  pushText(
    messages,
    nodeId,
    nodeType,
    renderTemplate(template, {
      date: state.selectedSlotDate,
      time: state.selectedStartTime,
      department: serviceName,
      staff: providerName,
      name: state.customerName,
    })
  );

  const nextNodeId = getNextNodeByHandle(nodeId, "booked", edges);
  traceSent(trace, nodeId, nodeType, "booked", {
    bookingId: booking.id,
    handle: "booked",
    hasNextNode: Boolean(nextNodeId),
  });

  const nextContext = {
    ...state.__context,
    bookingState: undefined,
    bookingMock: true,
    lastBookingId: booking.id,
  };

  return { kind: "resume", context: nextContext, trace, nextNodeId };
}

/** Advance the appointment sub-flow by one user action. */
function advanceAppointment(
  state: any,
  input: { type: SandboxInputType; buttonId?: string; text?: string },
  edges: any[],
  messages: SandboxMessage[]
): StepOutcome | null {
  const trace: MockBookingTraceEntry[] = [];
  const nodeId = state.nodeId;
  const nodeType = "booking.book_appointment";
  const config = state.config || {};
  const base = { ...state, __context: undefined };
  const context = state.__context;

  const deptIdFrom = (id: string) => Number(id.slice("booking_dept_".length));
  const staffIdFrom = (id: string) => Number(id.slice("booking_staff_".length));

  // ── service → provider list ────────────────────────────────────────────
  if (input.type === "button" && (input.buttonId || "").startsWith("booking_dept_")) {
    if (state.step !== "select_department" && state.step !== "select_staff") return null;
    const serviceId = deptIdFrom(input.buttonId || "");
    const providers = MOCK_PROVIDERS[serviceId];

    if (!providers || providers.length === 0) {
      pushText(messages, nodeId, nodeType, "Sorry, no staff available for this department.");
      traceSent(trace, nodeId, nodeType, "no_slots", { reason: "no_providers" });
      return {
        kind: "stop",
        context: { ...context, bookingMock: true, bookingState: undefined },
        trace,
      };
    }

    pushList(messages, nodeId, nodeType, {
      text: config.staffPromptMessage || DEFAULT_STAFF_PROMPT,
      buttonLabel: config.staffButtonLabel || DEFAULT_STAFF_LABEL,
      sectionTitle: "Providers",
      rows: providers.map((p) => ({
        id: `booking_staff_${p.id}`,
        title: p.name,
        description: p.specialty || "",
      })),
    });
    traceAwaiting(trace, nodeId, nodeType, "select_staff", {
      departmentId: serviceId,
      providers: providers.length,
    });

    return {
      kind: "awaiting",
      context: {
        ...context,
        bookingMock: true,
        bookingState: { ...base, step: "select_staff", departmentId: serviceId },
      },
      trace,
    };
  }

  // ── provider → slot list ───────────────────────────────────────────────
  if (input.type === "button" && (input.buttonId || "").startsWith("booking_staff_")) {
    if (state.step !== "select_staff" && state.step !== "select_slot") return null;
    const staffId = staffIdFrom(input.buttonId || "");
    const providers = MOCK_PROVIDERS[state.departmentId] || [];
    const provider = providers.find((p) => p.id === staffId);

    if (!provider) {
      pushText(messages, nodeId, nodeType, "Sorry, this provider is no longer available.");
      traceSent(trace, nodeId, nodeType, "no_slots", { reason: "provider_not_found" });
      return {
        kind: "stop",
        context: { ...context, bookingMock: true, bookingState: undefined },
        trace,
      };
    }

    const rows = mockSlotRows();
    pushList(messages, nodeId, nodeType, {
      text: config.slotPromptMessage || DEFAULT_SLOT_PROMPT,
      buttonLabel: config.slotButtonLabel || DEFAULT_SLOT_LABEL,
      sectionTitle: "Available Times",
      rows,
    });
    traceAwaiting(trace, nodeId, nodeType, "select_slot", {
      staffId,
      slots: rows.length,
    });

    return {
      kind: "awaiting",
      context: {
        ...context,
        bookingMock: true,
        bookingState: { ...base, step: "select_slot", staffId },
      },
      trace,
    };
  }

  // ── slot → name prompt / custom question / complete ────────────────────
  if (input.type === "button" && (input.buttonId || "").startsWith("booking_slot_")) {
    if (state.step !== "select_slot" && state.step !== "enter_name") return null;

    const raw = (input.buttonId || "").slice("booking_slot_".length);
    const sep = raw.indexOf("_");
    const slotId = Number(sep > 0 ? raw.slice(0, sep) : raw);
    const slotDate = sep > 0 ? raw.slice(sep + 1) : "";
    const slot = mockSlotFor(slotId);

    if (!slot || !slotDate) {
      pushText(messages, nodeId, nodeType, "Sorry, this slot is no longer available.");
      traceSent(trace, nodeId, nodeType, "no_slots", { reason: "slot_not_found" });
      return {
        kind: "stop",
        context: { ...context, bookingMock: true, bookingState: undefined },
        trace,
      };
    }

    const selected = {
      ...base,
      step: "select_slot" as string,
      selectedSlotId: slotId,
      selectedSlotDate: slotDate,
      selectedStartTime: slot.startTime,
      selectedEndTime: slot.endTime,
    };

    if (config.requireName) {
      pushText(messages, nodeId, nodeType, config.namePromptMessage || DEFAULT_NAME_PROMPT);
      traceAwaiting(trace, nodeId, nodeType, "enter_name", {
        slotDate,
        startTime: slot.startTime,
      });
      return {
        kind: "awaiting",
        context: {
          ...context,
          bookingMock: true,
          bookingState: { ...selected, step: "enter_name" },
        },
        trace,
      };
    }

    if (config.customQuestion1Enabled && config.customQuestion1Prompt) {
      pushText(messages, nodeId, nodeType, config.customQuestion1Prompt);
      traceAwaiting(trace, nodeId, nodeType, "enter_custom1", {
        slotDate,
        startTime: slot.startTime,
      });
      return {
        kind: "awaiting",
        context: {
          ...context,
          bookingMock: true,
          bookingState: { ...selected, step: "enter_custom1", customerName: "" },
        },
        trace,
      };
    }

    return completeAppointment(
      { ...selected, __context: context },
      edges,
      messages,
      trace
    );
  }

  // ── text steps ─────────────────────────────────────────────────────────
  if (input.type === "text") {
    const text = (input.text || "").trim();

    if (state.step === "enter_name") {
      if (text.length < 2) {
        pushText(
          messages,
          nodeId,
          nodeType,
          "Please enter a valid name (at least 2 characters)."
        );
        traceAwaiting(trace, nodeId, nodeType, "enter_name", { invalid: true });
        return { kind: "awaiting", context, trace };
      }

      if (config.customQuestion1Enabled && config.customQuestion1Prompt) {
        pushText(messages, nodeId, nodeType, config.customQuestion1Prompt);
        traceAwaiting(trace, nodeId, nodeType, "enter_custom1", { nameCaptured: true });
        return {
          kind: "awaiting",
          context: {
            ...context,
            bookingMock: true,
            bookingState: { ...base, step: "enter_custom1", customerName: text },
          },
          trace,
        };
      }

      return completeAppointment(
        { ...base, customerName: text, __context: context },
        edges,
        messages,
        trace
      );
    }

    if (state.step === "enter_custom1") {
      if (config.customQuestion2Enabled && config.customQuestion2Prompt) {
        pushText(messages, nodeId, nodeType, config.customQuestion2Prompt);
        traceAwaiting(trace, nodeId, nodeType, "enter_custom2", { answer1Captured: true });
        return {
          kind: "awaiting",
          context: {
            ...context,
            bookingMock: true,
            bookingState: { ...base, step: "enter_custom2", customField1Value: text },
          },
          trace,
        };
      }

      return completeAppointment(
        { ...base, customField1Value: text, __context: context },
        edges,
        messages,
        trace
      );
    }

    if (state.step === "enter_custom2") {
      return completeAppointment(
        { ...base, customField2Value: text, __context: context },
        edges,
        messages,
        trace
      );
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Sub-flow: check_bookings
// ---------------------------------------------------------------------------

/** Mirror of production's status filter + "confirmed only" action filter. */
function filterMockBookings(statusFilter: string): MockBookingFixture[] {
  const all = mockBookings();
  const today = new Date().toISOString().slice(0, 10);

  switch (statusFilter) {
    case "all":
      return all;
    case "confirmed":
      return all.filter((b) => b.status === "confirmed");
    case "pending":
      return all.filter((b) => b.status === "pending");
    case "completed":
      return all.filter((b) => b.status === "completed");
    case "cancelled":
      return all.filter((b) => b.status === "cancelled");
    case "upcoming":
    default:
      return all.filter((b) => b.status === "confirmed" && b.slotDate >= today);
  }
}

function advanceCheckBookings(
  state: any,
  input: { type: SandboxInputType; buttonId?: string; text?: string },
  edges: any[],
  messages: SandboxMessage[]
): StepOutcome | null {
  const trace: MockBookingTraceEntry[] = [];
  const nodeId = state.nodeId;
  const nodeType = "booking.check_bookings";
  const config = state.config || {};
  const context = state.__context;

  if (input.type !== "button") return null;
  const buttonId = input.buttonId || "";

  // ── pick an appointment to reschedule ─────────────────────────────────
  if (buttonId.startsWith("booking_reschedule_") && state.step === "select_reschedule") {
    const bookingId = buttonId.slice("booking_reschedule_".length);
    const booking = mockBookings().find((b) => b.id === bookingId);

    if (!booking) {
      pushText(messages, nodeId, nodeType, "Sorry, this appointment is no longer available.");
      traceSent(trace, nodeId, nodeType, "no_slots", { reason: "booking_not_found" });
      return {
        kind: "stop",
        context: { ...context, bookingMock: true, checkBookingsState: undefined },
        trace,
      };
    }

    const rows = mockSlotRows().map((row) => ({ ...row }));
    pushList(messages, nodeId, nodeType, {
      text: config.rescheduleSlotMessage || DEFAULT_RESCHEDULE_SLOT_PROMPT,
      buttonLabel: config.rescheduleSlotButtonLabel || DEFAULT_RESCHEDULE_SLOT_LABEL,
      sectionTitle: "Available Times",
      rows: rows.map((row) => ({
        ...row,
        id: row.id.replace("booking_slot_", "booking_newslot_"),
      })),
    });
    traceAwaiting(trace, nodeId, nodeType, "select_new_slot", {
      bookingId,
      staffId: booking.staffId,
      slots: rows.length,
    });

    return {
      kind: "awaiting",
      context: {
        ...context,
        bookingMock: true,
        checkBookingsState: {
          ...state,
          __context: undefined,
          step: "select_new_slot",
          bookingId,
          staffId: booking.staffId,
        },
      },
      trace,
    };
  }

  // ── new slot chosen → rescheduled ──────────────────────────────────────
  if (buttonId.startsWith("booking_newslot_") && state.step === "select_new_slot") {
    const raw = buttonId.slice("booking_newslot_".length);
    const sep = raw.indexOf("_");
    const slotId = Number(sep > 0 ? raw.slice(0, sep) : raw);
    const slotDate = sep > 0 ? raw.slice(sep + 1) : "";
    const slot = mockSlotFor(slotId);

    if (!slot || !slotDate) {
      pushText(messages, nodeId, nodeType, "Sorry, this slot is no longer available.");
      traceSent(trace, nodeId, nodeType, "no_slots", { reason: "slot_not_found" });
      return {
        kind: "stop",
        context: { ...context, bookingMock: true, checkBookingsState: undefined },
        trace,
      };
    }

    const { providerName } = namesFor(0, state.staffId);
    const template = config.rescheduleSuccessMessage || DEFAULT_RESCHEDULE_SUCCESS;
    pushText(
      messages,
      nodeId,
      nodeType,
      renderTemplate(template, {
        date: slotDate,
        time: slot.startTime,
        department: "",
        staff: providerName,
      })
    );

    const nextNodeId = getNextNodeByHandle(nodeId, "booked", edges);
    traceSent(trace, nodeId, nodeType, "booked", {
      bookingId: state.bookingId,
      handle: "booked",
      action: "reschedule",
      hasNextNode: Boolean(nextNodeId),
    });

    return {
      kind: "resume",
      context: { ...context, bookingMock: true, checkBookingsState: undefined },
      trace,
      nextNodeId,
    };
  }

  // ── pick an appointment to cancel ──────────────────────────────────────
  if (buttonId.startsWith("booking_cancel_") && state.step === "select_cancel") {
    const bookingId = buttonId.slice("booking_cancel_".length);
    const booking = mockBookings().find((b) => b.id === bookingId);

    if (!booking) {
      pushText(messages, nodeId, nodeType, "Sorry, this appointment is no longer available.");
      traceSent(trace, nodeId, nodeType, "no_slots", { reason: "booking_not_found" });
      return {
        kind: "stop",
        context: { ...context, bookingMock: true, checkBookingsState: undefined },
        trace,
      };
    }

    const template = config.cancelSuccessMessage || DEFAULT_CANCEL_SUCCESS;
    pushText(
      messages,
      nodeId,
      nodeType,
      renderTemplate(template, {
        date: booking.slotDate,
        time: booking.startTime,
        department: booking.serviceName,
        staff: booking.providerName,
      })
    );

    const nextNodeId = getNextNodeByHandle(nodeId, "booked", edges);
    traceSent(trace, nodeId, nodeType, "booked", {
      bookingId,
      handle: "booked",
      action: "cancel",
      hasNextNode: Boolean(nextNodeId),
    });

    return {
      kind: "resume",
      context: { ...context, bookingMock: true, checkBookingsState: undefined },
      trace,
      nextNodeId,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Host entry — FlowHost.handleBookingNode
// ---------------------------------------------------------------------------

export interface MockBookingNodeOptions {
  /** Graph edges, used for the `booked` / `no_slots` handle lookups. */
  edges: any[];
  /** Panel bubble sink (shared with the sandbox host). */
  messages: SandboxMessage[];
  /** Mock trace sink (drained by the endpoint). */
  trace: MockBookingTraceEntry[];
}

/**
 * Mock implementation of `FlowHost.handleBookingNode`. Called when the runner
 * reaches a `booking.*` node. Sends the first prompt (or the my-bookings
 * message) and returns the new context; returning `{ nextNodeId: null }` keeps
 * the context so the assembler can turn the `done` status into `awaiting`.
 */
export async function runMockBookingNode(
  node: any,
  nodeId: string,
  context: any,
  opts: MockBookingNodeOptions
): Promise<BookingNodeResult | null> {
  const nodeType = node?.data?.type || node?.data?.nodeType || "";
  const config = node?.data?.config || {};
  const ctx = (context || {}) as Record<string, any>;

  if (nodeType === "booking.book_appointment") {
    // Same "start fresh?" test as production, minus state.currentNodeId: a state
    // for this same node means we are already mid-flow (nothing to re-send).
    const existing = ctx.bookingState;
    const inFlow = existing && existing.mock === true && existing.nodeId === nodeId;
    if (inFlow) {
      // Defensive: if we somehow re-enter the same booking node mid-flow, don't
      // resend the service list. The awaiting state is carried by bookingState.
      // Emit a silent trace so the panel can render "waiting for action" without
      // a duplicate bubble.
      traceAwaiting(opts.trace, nodeId, nodeType, existing.step, { resumed: true });
      return { nextNodeId: null, context: ctx };
    }

    pushList(opts.messages, nodeId, nodeType, {
      text: config.promptMessage || DEFAULT_PROMPT,
      buttonLabel: config.departmentButtonLabel || DEFAULT_DEPARTMENT_LABEL,
      sectionTitle: "Services",
      rows: MOCK_SERVICES.map((s) => ({
        id: `booking_dept_${s.id}`,
        title: s.name,
        description: s.description,
      })),
    });
    traceAwaiting(opts.trace, nodeId, nodeType, "select_department", {
      services: MOCK_SERVICES.length,
    });

    return {
      nextNodeId: null,
      context: {
        ...ctx,
        bookingMock: true,
        bookingState: {
          step: "select_department",
          nodeId,
          bookingLabel: config.bookingLabel || "appointment",
          config,
          mock: true,
        },
      },
    };
  }

  if (nodeType === "booking.check_bookings") {
    const checkType = config.checkType || "my_bookings";
    const bookings = filterMockBookings(config.statusFilter || "upcoming");
    const active = bookings.filter((b) => b.status === "confirmed");

    if (checkType === "my_bookings") {
      if (bookings.length === 0) {
        pushText(
          opts.messages,
          nodeId,
          nodeType,
          config.noBookingsMessage || DEFAULT_NO_BOOKINGS
        );
      } else {
        const format = config.bookingListFormat || DEFAULT_BOOKING_LIST_FORMAT;
        const lines = bookings.map((booking) =>
          renderTemplate(format, {
            date: booking.slotDate,
            time: booking.startTime,
            // Production only substitutes these five tokens in this branch.
            department: booking.serviceName,
            staff: booking.providerName,
            status: booking.status,
          })
        );
        pushText(
          opts.messages,
          nodeId,
          nodeType,
          `Your appointments:\n\n${lines.join("\n\n")}`.trim()
        );
      }

      const nextNodeId = getNextNodeByHandle(nodeId, "booked", opts.edges);
      traceSent(opts.trace, nodeId, nodeType, "booked", {
        checkType,
        bookingsCount: bookings.length,
        handle: "booked",
        hasNextNode: Boolean(nextNodeId),
      });
      return { nextNodeId, context: { ...ctx, bookingMock: true } };
    }

    // reschedule / cancel_booking
    if (active.length === 0) {
      pushText(
        opts.messages,
        nodeId,
        nodeType,
        config.noBookingsMessage || DEFAULT_NO_BOOKINGS
      );
      const nextNodeId = getNextNodeByHandle(nodeId, "no_slots", opts.edges);
      traceSent(opts.trace, nodeId, nodeType, "no_slots", {
        checkType,
        handle: "no_slots",
        hasNextNode: Boolean(nextNodeId),
      });
      return { nextNodeId, context: { ...ctx, bookingMock: true } };
    }

    const actionType = checkType === "reschedule" ? "reschedule" : "cancel";
    const promptMessage = checkType === "reschedule"
      ? config.reschedulePromptMessage || DEFAULT_RESCHEDULE_PROMPT
      : config.cancelPromptMessage || DEFAULT_CANCEL_PROMPT;
    const buttonLabel = checkType === "reschedule"
      ? config.rescheduleButtonLabel || DEFAULT_RESCHEDULE_LABEL
      : config.cancelButtonLabel || DEFAULT_CANCEL_LABEL;

    pushList(opts.messages, nodeId, nodeType, {
      text: promptMessage,
      buttonLabel,
      sectionTitle: "Your Appointments",
      rows: active.map((booking) => ({
        id: `booking_${actionType}_${booking.id}`,
        title: `${booking.slotDate} at ${booking.startTime}`,
        description: `${booking.serviceName} - ${booking.providerName}`.trim(),
      })),
    });
    traceAwaiting(opts.trace, nodeId, nodeType, `select_${actionType}`, {
      checkType,
      bookingsCount: active.length,
    });

    return {
      nextNodeId: null,
      context: {
        ...ctx,
        bookingMock: true,
        checkBookingsState: {
          step: `select_${actionType}`,
          nodeId,
          checkType,
          config,
          mock: true,
        },
      },
    };
  }

  // Unknown booking.* type — explain and stop (never crash the tick).
  pushText(
    opts.messages,
    nodeId,
    nodeType || "booking",
    `Unsupported booking node type in the sandbox: "${nodeType || "unknown"}".`
  );
  opts.trace.push({
    nodeId,
    nodeType: nodeType || "booking",
    outcome: "stopped",
    detail: { mock: true, reason: "unsupported_booking_type" },
  });
  return { nextNodeId: null, context: { ...ctx, bookingMock: true } };
}

// ---------------------------------------------------------------------------
// Sub-flow ticks — called by the endpoint before normal button/text dispatch
// ---------------------------------------------------------------------------

export type SandboxBookingDispatch =
  | { handled: false }
  | { handled: true; response: SandboxTickResponse }
  | {
      handled: true;
      resumeFrom: string;
      context: Record<string, any>;
      trace: MockBookingTraceEntry[];
    };

export interface SandboxBookingTickArgs {
  definition: { nodes?: any[]; edges?: any[] };
  context: Record<string, any>;
  cursor: string | null;
  input: { type: SandboxInputType; buttonId?: string; text?: string };
  messages: SandboxMessage[];
}

// Note: pre-dispatch responses (button/text direct returns) never go through
// assembleSandboxResponse — they use this seq directly. The assembler path
// (via runFlow) renumbers starting at result.trace.length + 1. Do not route
// direct returns through the assembler without removing this renumbering.
function withSeq(trace: MockBookingTraceEntry[]): TraceEntry[] {
  return trace.map((entry, index) => ({ ...entry, seq: index + 1 }));
}

function awaitingResponse(
  context: Record<string, any>,
  awaiting: SandboxAwaiting,
  messages: SandboxMessage[],
  trace: MockBookingTraceEntry[]
): SandboxTickResponse {
  return {
    status: "awaiting_input",
    cursor: awaiting.nodeId,
    context,
    messages,
    awaiting,
    trace: withSeq(trace),
    steps: 0,
    error: null,
  };
}

function doneResponse(
  context: Record<string, any>,
  messages: SandboxMessage[],
  trace: MockBookingTraceEntry[]
): SandboxTickResponse {
  return {
    status: "done",
    stopReason: "no_next_node",
    cursor: null,
    context,
    messages,
    awaiting: null,
    trace: withSeq(trace),
    steps: 0,
    error: null,
  };
}

/**
 * Pre-dispatch hook for the sandbox endpoint. Returns `{ handled: false }` for
 * every tick that is not part of a mock booking sub-flow, so existing button /
 * text behavior (including its 400 / 409 responses) is preserved exactly.
 */
export function dispatchSandboxBookingTick(
  args: SandboxBookingTickArgs
): SandboxBookingDispatch {
  const { definition, context, input, messages } = args;
  if (!input || (input.type !== "button" && input.type !== "text")) {
    return { handled: false };
  }

  const ctx = (context || {}) as Record<string, any>;
  const isAppointment =
    ctx.bookingState && ctx.bookingState.mock === true && typeof ctx.bookingState.nodeId === "string";
  const isCheckBookings =
    ctx.checkBookingsState &&
    ctx.checkBookingsState.mock === true &&
    typeof ctx.checkBookingsState.nodeId === "string";

  if (!isAppointment && !isCheckBookings) return { handled: false };

  const state = (isAppointment ? ctx.bookingState : ctx.checkBookingsState) as any;
  const nodes = Array.isArray(definition?.nodes) ? definition.nodes : [];
  if (!nodes.some((n: any) => n?.id === state.nodeId)) return { handled: false };

  const edges = Array.isArray(definition?.edges) ? definition.edges : [];
  const stateWithContext = { ...state, __context: ctx };

  const outcome = isAppointment
    ? advanceAppointment(stateWithContext, input, edges, messages)
    : advanceCheckBookings(stateWithContext, input, edges, messages);

  if (!outcome) return { handled: false };

  if (outcome.kind === "stop") {
    return { handled: true, response: doneResponse(outcome.context, messages, outcome.trace) };
  }

  if (outcome.kind === "resume") {
    if (outcome.nextNodeId) {
      return {
        handled: true,
        resumeFrom: outcome.nextNodeId,
        context: outcome.context,
        trace: outcome.trace,
      };
    }
    // No `booked` edge — production stops here too.
    return { handled: true, response: doneResponse(outcome.context, messages, outcome.trace) };
  }

  const awaiting = deriveBookingAwaiting(outcome.context.bookingState) ||
    deriveBookingAwaiting(outcome.context.checkBookingsState);
  if (!awaiting) {
    // Fail-graceful: a malformed state must not crash the tick.
    return { handled: true, response: doneResponse(outcome.context, messages, outcome.trace) };
  }

  return {
    handled: true,
    response: awaitingResponse(outcome.context, awaiting, messages, outcome.trace),
  };
}
