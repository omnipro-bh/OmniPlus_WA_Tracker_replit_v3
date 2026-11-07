/**
 * AI Studio — KPI aggregation (pure, unit-testable).
 *
 * Takes `workflow_executions` rows (already filtered to those that ran the AI
 * node) and computes business metrics from their `aiTrace` payloads. No I/O, no
 * DB: the route fetches rows, this module only does the math.
 *
 * Definitions (locked):
 *  - totalConversations  = COUNT(DISTINCT phone)
 *  - totalAiTurns        = COUNT(*)
 *  - containment         = a conversation whose LAST turn is "completed"
 *                          (`sheetState.intentId == null`) AND never handed over
 *  - fallback rate       = turns with `fallbackUsed === true` / totalAiTurns
 *  - drop-off steps      = last-turn `sheetState.stepId`, for conversations that
 *                          did NOT complete (intentId still set)
 *  - top rejected inputs = reasons from `rejectedSlots[].reason` + `fallbackReason`
 */

export interface KpiRejectedSlot {
  slot?: string;
  value?: string;
  reason?: string;
}

export interface KpiAiTrace {
  sheetState?: {
    intentId?: string | null;
    stepId?: string | null;
    slots?: Record<string, any>;
  };
  fallbackUsed?: boolean;
  fallbackReason?: string;
  rejectedSlots?: KpiRejectedSlot[];
  nextHandle?: string;
}

export interface KpiExecutionRow {
  phone: string;
  executedAt: string | Date;
  aiTrace: KpiAiTrace | null;
}

export interface KpiStepCount {
  stepId: string;
  count: number;
}

export interface KpiReasonCount {
  reason: string;
  count: number;
}

export interface KpiTimePoint {
  /** YYYY-MM-DD (UTC). */
  date: string;
  conversations: number;
}

export interface KpiMetrics {
  totalConversations: number;
  totalAiTurns: number;
  /** 0..1 */
  containmentRate: number;
  /** 0..1 */
  fallbackRate: number;
  dropOffSteps: KpiStepCount[];
  topRejectedInputs: KpiReasonCount[];
  /** slot name → value → count of conversations that chose that value. */
  slotDistribution: Record<string, Record<string, number>>;
  /** Number of distinct conversations that reached each step (ordered Step_1 → N). */
  stepFunnel: KpiStepCount[];
  /** Conversations per day (days with activity only). */
  timeSeries: KpiTimePoint[];
}

function timestampOf(v: string | Date): number {
  return v instanceof Date ? v.getTime() : new Date(v).getTime();
}

function dayKey(v: string | Date): string {
  const d = v instanceof Date ? v : new Date(v);
  return d.toISOString().slice(0, 10);
}

/** Numeric sort key for a `Step_N` id (non-numeric ids sort last). */
function stepOrder(stepId: string): number {
  const n = Number(String(stepId).replace(/\D/g, ""));
  return Number.isNaN(n) ? Infinity : n;
}

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function topN(map: Map<string, number>, n: number): Array<[string, number]> {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

/** A conversation "completed" when its last turn's sheet state reset (intentId null). */
function isCompleted(trace: KpiAiTrace | null | undefined): boolean {
  // `== null` covers both `null` (machine completed) and `undefined` (free-form /
  // no sheet → single-shot, nothing to drop off from).
  return trace?.sheetState?.intentId == null;
}

/**
 * Aggregate `workflow_executions` rows into KPI metrics. Tolerates malformed rows
 * (missing `aiTrace`, missing `phone`) so a bad row never throws.
 */
export function computeKpis(rows: KpiExecutionRow[]): KpiMetrics {
  const list = Array.isArray(rows) ? rows : [];
  const totalAiTurns = list.length;

  // Group by phone, preserving order for the "last turn" logic.
  const byPhone = new Map<string, KpiExecutionRow[]>();
  for (const row of list) {
    const phone = typeof row.phone === "string" && row.phone.trim() ? row.phone.trim() : "";
    if (!phone) continue;
    const arr = byPhone.get(phone) ?? [];
    arr.push(row);
    byPhone.set(phone, arr);
  }
  const totalConversations = byPhone.size;

  let contained = 0;
  let fallbackTurns = 0;
  const dropOff = new Map<string, number>();
  const reasons = new Map<string, number>();
  const slotValues = new Map<string, Map<string, number>>();
  const stepReach = new Map<string, Set<string>>();
  const dayPhones = new Map<string, Set<string>>();

  for (const row of list) {
    const trace = row.aiTrace;
    if (!trace) continue;

    if (trace.fallbackUsed === true) fallbackTurns += 1;

    for (const r of trace.rejectedSlots ?? []) {
      const reason = r?.reason?.trim();
      if (reason) bump(reasons, reason);
    }
    if (trace.fallbackUsed && trace.fallbackReason?.trim()) {
      bump(reasons, trace.fallbackReason.trim());
    }
  }

  for (const rowsForPhone of Array.from(byPhone.values())) {
    const phone = rowsForPhone[0]?.phone;
    const sorted = [...rowsForPhone].sort(
      (a, b) => timestampOf(a.executedAt) - timestampOf(b.executedAt)
    );
    const last = sorted[sorted.length - 1];
    const completed = isCompleted(last?.aiTrace);
    const everHandedOver = sorted.some((r) => r.aiTrace?.nextHandle === "handover");

    if (completed && !everHandedOver) contained += 1;

    if (!completed && last?.aiTrace?.sheetState?.stepId) {
      bump(dropOff, last.aiTrace.sheetState.stepId);
    }

    // Per-conversation accumulation (only for conversations with a phone).
    if (!phone) continue;

    // Slots are cumulative across a conversation, so merge every turn's snapshot;
    // the last non-empty value wins. This survives the reset to `{}` on completion.
    const mergedSlots = new Map<string, unknown>();
    const reachedSteps = new Set<string>();
    const activeDays = new Set<string>();
    for (const r of sorted) {
      const slots = r.aiTrace?.sheetState?.slots ?? {};
      for (const [name, value] of Object.entries(slots)) {
        if (value !== undefined && value !== null && value !== "") mergedSlots.set(name, value);
      }
      const stepId = r.aiTrace?.sheetState?.stepId;
      if (stepId) reachedSteps.add(stepId);
      activeDays.add(dayKey(r.executedAt));
    }

    for (const [name, value] of Array.from(mergedSlots)) {
      let byValue = slotValues.get(name);
      if (!byValue) {
        byValue = new Map();
        slotValues.set(name, byValue);
      }
      bump(byValue, String(value));
    }

    for (const stepId of Array.from(reachedSteps)) {
      let phones = stepReach.get(stepId);
      if (!phones) {
        phones = new Set();
        stepReach.set(stepId, phones);
      }
      phones.add(phone);
    }

    for (const day of Array.from(activeDays)) {
      let phones = dayPhones.get(day);
      if (!phones) {
        phones = new Set();
        dayPhones.set(day, phones);
      }
      phones.add(phone);
    }
  }

  // slot name → value → count, values sorted by count descending.
  const slotDistribution: Record<string, Record<string, number>> = {};
  for (const [slot, byValue] of Array.from(slotValues.entries())) {
    const inner: Record<string, number> = {};
    for (const [value, count] of Array.from(byValue.entries()).sort((a, b) => b[1] - a[1])) {
      inner[value] = count;
    }
    slotDistribution[slot] = inner;
  }

  // Step funnel ordered Step_1 → Step_N.
  const stepFunnel: KpiStepCount[] = Array.from(stepReach.entries())
    .map(([stepId, phones]) => ({ stepId, count: phones.size }))
    .sort((a, b) => stepOrder(a.stepId) - stepOrder(b.stepId));

  // Conversations per day, ascending.
  const timeSeries: KpiTimePoint[] = Array.from(dayPhones.entries())
    .map(([date, phones]) => ({ date, conversations: phones.size }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalConversations,
    totalAiTurns,
    containmentRate: totalConversations > 0 ? contained / totalConversations : 0,
    fallbackRate: totalAiTurns > 0 ? fallbackTurns / totalAiTurns : 0,
    dropOffSteps: topN(dropOff, Number.POSITIVE_INFINITY).map(([stepId, count]) => ({
      stepId,
      count,
    })),
    topRejectedInputs: topN(reasons, 5).map(([reason, count]) => ({ reason, count })),
    slotDistribution,
    stepFunnel,
    timeSeries,
  };
}
