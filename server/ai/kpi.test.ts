import test from "node:test";
import assert from "node:assert/strict";
import { computeKpis, type KpiAiTrace, type KpiExecutionRow } from "./kpi";

const row = (phone: string, executedAt: string, aiTrace: KpiAiTrace | null): KpiExecutionRow => ({
  phone,
  executedAt,
  aiTrace,
});

const completed = (): KpiAiTrace => ({ sheetState: { intentId: null, stepId: null, slots: {} } });
const midFlow = (stepId: string, intentId = "1"): KpiAiTrace => ({
  sheetState: { intentId, stepId, slots: {} },
});

test("empty input yields all-zero metrics", () => {
  assert.deepEqual(computeKpis([]), {
    totalConversations: 0,
    totalAiTurns: 0,
    containmentRate: 0,
    fallbackRate: 0,
    dropOffSteps: [],
    topRejectedInputs: [],
  });
});

test("totalConversations is distinct phones and totalAiTurns is row count", () => {
  const rows = [
    row("a", "2026-11-01T10:00:00Z", completed()),
    row("a", "2026-11-01T10:01:00Z", completed()),
    row("b", "2026-11-01T10:00:00Z", completed()),
  ];
  const m = computeKpis(rows);
  assert.equal(m.totalConversations, 2);
  assert.equal(m.totalAiTurns, 3);
});

test("containment = last turn completed AND never handed over", () => {
  const rows = [
    // A: two turns, completes → contained
    row("a", "2026-11-01T10:00:00Z", midFlow("Step_1")),
    row("a", "2026-11-01T10:01:00Z", completed()),
    // B: single turn, still mid-flow → not contained (and drops off)
    row("b", "2026-11-01T10:00:00Z", midFlow("Step_2")),
    // C: completes but handed over → not contained
    row("c", "2026-11-01T10:00:00Z", midFlow("Step_1")),
    row("c", "2026-11-01T10:01:00Z", { ...completed(), nextHandle: "handover" }),
  ];
  const m = computeKpis(rows);
  assert.equal(m.totalConversations, 3);
  assert.equal(m.containmentRate, 1 / 3);
});

test("a handed-over conversation is not contained even if it completed", () => {
  const rows = [
    row("a", "2026-11-01T10:00:00Z", midFlow("Step_1")),
    row("a", "2026-11-01T10:01:00Z", { ...completed(), nextHandle: "handover" }),
  ];
  assert.equal(computeKpis(rows).containmentRate, 0);
});

test("fallbackRate is fallback turns over total turns", () => {
  const rows = [
    row("a", "2026-11-01T10:00:00Z", { ...completed(), fallbackUsed: true, fallbackReason: "x" }),
    row("a", "2026-11-01T10:01:00Z", completed()),
    row("b", "2026-11-01T10:00:00Z", completed()),
    row("c", "2026-11-01T10:00:00Z", completed()),
  ];
  assert.equal(computeKpis(rows).fallbackRate, 0.25);
});

test("fallbackRate is zero when there are no turns", () => {
  assert.equal(computeKpis([]).fallbackRate, 0);
});

test("dropOffSteps groups the last turn's stepId for incomplete conversations", () => {
  const rows = [
    // A drops off at Step_2
    row("a", "2026-11-01T10:00:00Z", midFlow("Step_1")),
    row("a", "2026-11-01T10:01:00Z", midFlow("Step_2")),
    // B drops off at Step_2 as well
    row("b", "2026-11-01T10:00:00Z", midFlow("Step_2")),
    // C drops off at Step_3
    row("c", "2026-11-01T10:00:00Z", midFlow("Step_3")),
    // D completes (not a drop-off)
    row("d", "2026-11-01T10:00:00Z", midFlow("Step_1")),
    row("d", "2026-11-01T10:01:00Z", completed()),
  ];
  const m = computeKpis(rows);
  assert.deepEqual(m.dropOffSteps, [
    { stepId: "Step_2", count: 2 },
    { stepId: "Step_3", count: 1 },
  ]);
});

test("only the LAST turn counts for drop-off, not earlier turns", () => {
  const rows = [
    row("a", "2026-11-01T10:00:00Z", midFlow("Step_1")),
    row("a", "2026-11-01T10:01:00Z", midFlow("Step_2")),
    row("a", "2026-11-01T10:02:00Z", midFlow("Step_3")),
  ];
  assert.deepEqual(computeKpis(rows).dropOffSteps, [{ stepId: "Step_3", count: 1 }]);
});

test("topRejectedInputs flattens rejectedSlots reasons and fallbackReason, top 5", () => {
  const rows = [
    row("a", "2026-11-01T10:00:00Z", {
      ...midFlow("Step_1"),
      fallbackUsed: true,
      fallbackReason: '"banana" is not one of: Manama, Hidd',
    }),
    row("b", "2026-11-01T10:00:00Z", {
      ...midFlow("Step_1"),
      rejectedSlots: [{ slot: "branch", value: "banana", reason: '"banana" is not one of: Manama, Hidd' }],
    }),
    row("c", "2026-11-01T10:00:00Z", {
      ...midFlow("Step_1"),
      rejectedSlots: [{ slot: "branch", value: "pear", reason: '"pear" is not one of: Manama, Hidd' }],
    }),
  ];
  const m = computeKpis(rows);
  assert.deepEqual(m.topRejectedInputs, [
    { reason: '"banana" is not one of: Manama, Hidd', count: 2 },
    { reason: '"pear" is not one of: Manama, Hidd', count: 1 },
  ]);
});

test("rows with a null aiTrace are ignored", () => {
  const rows = [
    row("a", "2026-11-01T10:00:00Z", null),
    row("a", "2026-11-01T10:01:00Z", completed()),
  ];
  const m = computeKpis(rows);
  assert.equal(m.totalAiTurns, 2); // still counted as a turn
  assert.equal(m.containmentRate, 1); // the last turn (completed) determines containment
});
