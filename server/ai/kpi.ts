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

export interface KpiMetrics {
  totalConversations: number;
  totalAiTurns: number;
  /** 0..1 */
  containmentRate: number;
  /** 0..1 */
  fallbackRate: number;
  dropOffSteps: KpiStepCount[];
  topRejectedInputs: KpiReasonCount[];
}

function timestampOf(v: string | Date): number {
  return v instanceof Date ? v.getTime() : new Date(v).getTime();
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
  }

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
  };
}
