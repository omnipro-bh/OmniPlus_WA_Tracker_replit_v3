/**
 * Phase 5 — the Agent Harness (Model + Harness).
 *
 * Replaces the rigid, linear `sheetStateMachine` walk with a goal-oriented loop:
 * the `Workflow_Steps` tab is read as a **checklist of required slots**, not a
 * path. Each turn the harness:
 *
 *   1. derives the required slots (union of `slot_name` + `{placeholder}` tokens),
 *   2. asks the LLM — with the persona + instructions and the checklist — to
 *      extract any newly-mentioned values and decide "ask" vs "complete",
 *   3. auto-runs a `Doctors_Schedule` lookup whenever a `doctor_name` is known so
 *      the doctor's `department` + `location` are deduced (not guessed),
 *   4. validates every model-produced value with `validateSlotValue`,
 *   5. sends a natural question for the first still-missing slot, guarding against
 *      a literal `{slot}` ever reaching the customer.
 *
 * The model never owns business rules: `validateSlotValue`, `looseCellMatch`,
 * `substituteSlots` and the bounded loop are all code.
 */

import { lookupSheetRows } from './googleSheetsExecutor';
import { AI_SHEET_TAB_SCHEMA } from '@shared/ai-defaults';
import { llmJson } from '../ai/prompt';
import type { AiGoogleSheetsConfig, LlmClient } from '../ai/types';
import {
  availabilityHeader,
  headerFor,
  looseCellMatch,
  normalizeSlotKey,
  parseLookupFilter,
  parseSlotNames,
  rankLookupHits,
  readCell,
  substituteSlots,
  type RowReader,
  type SheetLookupCall,
  type SheetState,
  type SheetTurn,
} from './sheetStateMachine';
import { canonicalizeOption, normalizeInputType, parseOptions, validateSlotValue } from './slotValidation';

// ── Types ───────────────────────────────────────────────────────────────────

/** One checklist item — a required slot the customer must eventually provide. */
export interface HarnessSlot {
  /** Canonical slot name (e.g. `department`, `location`, `datetime`). */
  name: string;
  /** `text` | `list` | `buttons` | `datetime` — drives validation + phrasing. */
  type: string;
  /** Canonical choices for list/buttons slots. */
  options?: string[];
  /** Owner-declared format gate (`validation` column). */
  validation?: string;
  /** The step's `ai_question` — a *phrasing hint*, not a fixed string. */
  hint?: string;
}

export interface HarnessChecklist {
  /** Slots the customer must provide. */
  required: HarnessSlot[];
  /** Slots filled by a schedule lookup instead of by the customer (e.g. `doctor_name`). */
  derived: string[];
}

/** The strict JSON the LLM returns each round. */
export interface HarnessDecision {
  updated_slots: Record<string, string>;
  action: 'ask' | 'complete';
  next_question: string;
  tool_call?: 'lookup_schedule';
  lookup?: { doctor?: string; department?: string; location?: string };
}

/** Column mapping of the schedule tab, derived from a `lookup` step. */
export interface ScheduleMap {
  source: string;
  doctorColumn: string;
  departmentColumn: string;
  branchColumn: string;
}

/** Slot names that are flow-control artifacts of the old linear sheet, not customer data. */
const FLOW_CONTROL_SLOTS = new Set(['confirm', 'retry', 'completed', 'anything_else', 'done']);

// ── State ───────────────────────────────────────────────────────────────────

function freshHarnessState(): SheetState {
  return { intentId: null, stepId: null, slots: {} };
}

function isFilled(slots: Record<string, any>, name: string): boolean {
  const v = slots[name];
  return v !== undefined && v !== null && String(v).trim() !== '';
}

function intentsTabName(sheet: AiGoogleSheetsConfig): string {
  return sheet.tabs.find((t) => /^intents?$/i.test(t)) ?? sheet.tabs[0];
}

function stepsTabName(sheet: AiGoogleSheetsConfig): string {
  return sheet.tabs.find((t) => /step/i.test(t)) ?? sheet.tabs[1] ?? sheet.tabs[0];
}

async function defaultReadRows(
  sheet: AiGoogleSheetsConfig,
  tab: string,
  filter?: { column?: string; value?: string }
): Promise<Record<string, any>[]> {
  const result = await lookupSheetRows(sheet.spreadsheetId, tab, {
    filterColumn: filter?.column,
    filterValue: filter?.value,
    maxRows: 1000,
  });
  return result.rows ?? [];
}

// ── Checklist derivation ────────────────────────────────────────────────────

function slotType(step: Record<string, any>, expectedHeader: string): string {
  return normalizeInputType(step[expectedHeader]) || 'text';
}

/**
 * Build the goal checklist from the intent's `Workflow_Steps`.
 *
 *   - `required` = every declared `slot_name` (non-lookup steps, minus the
 *     flow-control artifacts) unioned with every `{placeholder}` token used in a
 *     question / filter / fallback (e.g. `department` is only ever a placeholder).
 *   - `derived` = the slot a `lookup` step stores into (e.g. `doctor_name`).
 */
export function deriveChecklist(
  steps: Record<string, any>[],
  headers: {
    slot: string;
    expected: string;
    options: string;
    validation: string;
    question: string;
    filter: string;
    fallback: string;
    stepType: string;
  }
): HarnessChecklist {
  const requiredByName = new Map<string, HarnessSlot>();
  const derived = new Set<string>();
  const placeholders = new Set<string>();

  for (const step of Array.isArray(steps) ? steps : []) {
    const stepType = String(step[headers.stepType] ?? '').trim().toLowerCase();

    // Placeholder tokens (undeclared slots like `department`) can appear in any
    // step's question/filter/fallback — including a `lookup` step's filter.
    for (const text of [step[headers.question], step[headers.filter], step[headers.fallback]]) {
      for (const m of String(text ?? '').match(/\{(\w+)\}/g) ?? []) placeholders.add(m.slice(1, -1));
    }

    if (stepType === 'lookup') {
      for (const name of parseSlotNames(step[headers.slot])) derived.add(name);
      continue;
    }

    // Declared askable slots.
    for (const name of parseSlotNames(step[headers.slot])) {
      if (FLOW_CONTROL_SLOTS.has(normalizeSlotKey(name))) continue;
      if (requiredByName.has(name)) continue;
      requiredByName.set(name, {
        name,
        type: slotType(step, headers.expected),
        options: parseOptions(step[headers.options]),
        validation: String(step[headers.validation] ?? '').trim() || undefined,
        hint: String(step[headers.question] ?? '').trim() || undefined,
      });
    }
  }

  for (const name of Array.from(placeholders)) {
    if (FLOW_CONTROL_SLOTS.has(normalizeSlotKey(name))) continue;
    if (derived.has(name)) continue;
    if (requiredByName.has(name)) continue;
    requiredByName.set(name, { name, type: 'text' });
  }

  return { required: Array.from(requiredByName.values()), derived: Array.from(derived) };
}

/** Derive the schedule column mapping from the intent's `lookup` step(s). */
export function deriveScheduleMap(
  steps: Record<string, any>[],
  headers: {
    stepType: string;
    source: string;
    filter: string;
    extract: string;
  }
): ScheduleMap | undefined {
  for (const step of Array.isArray(steps) ? steps : []) {
    if (String(step[headers.stepType] ?? '').trim().toLowerCase() !== 'lookup') continue;
    const source = String(step[headers.source] ?? '').trim();
    const extract = String(step[headers.extract] ?? '').trim();
    if (!source || !extract) continue;
    let departmentColumn = 'department';
    let branchColumn = 'branch';
    for (const clause of parseLookupFilter(String(step[headers.filter] ?? ''))) {
      if (clause.value === '{department}') departmentColumn = clause.column;
      else if (clause.value === '{location}') branchColumn = clause.column;
    }
    return { source, doctorColumn: extract, departmentColumn, branchColumn };
  }
  return undefined;
}

// ── Prompt ──────────────────────────────────────────────────────────────────

export function buildHarnessPrompt(
  systemPrompt: string,
  checklist: HarnessChecklist,
  slots: Record<string, any>,
  userMessage: string,
  lookupResult?: string
): string {
  const requiredLines = checklist.required.map((slot) => {
    const opts = slot.options?.length ? ` (options: ${slot.options.join(', ')})` : '';
    return `- ${slot.name}${opts}`;
  });

  const derivedLine =
    checklist.derived.length > 0
      ? `\nDERIVED (do not ask for these): ${checklist.derived.join(', ')} — if the customer names one, set it in updated_slots.`
      : '';

  const stateLines = checklist.required.map((slot) => {
    const value = slots[slot.name];
    return `- ${slot.name}: ${isFilled(slots, slot.name) ? JSON.stringify(value) : '(missing)'}`;
  });

  const knownDerived = checklist.derived
    .map((name) => `- ${name}: ${isFilled(slots, name) ? JSON.stringify(slots[name]) : '(missing)'}`)
    .join('\n');

  return [
    (systemPrompt ?? '').trim() || 'You are a helpful assistant.',
    '',
    'TASK: You are a booking agent. Collect the REQUIRED SLOTS from the customer.',
    '',
    'REQUIRED SLOTS (a checklist, not a sequence):',
    ...requiredLines,
    ...(derivedLine ? [derivedLine] : []),
    '',
    'CURRENT STATE:',
    ...stateLines,
    ...(knownDerived ? ['', knownDerived] : []),
    '',
    `USER MESSAGE: "${userMessage}"`,
    ...(lookupResult ? ['', `LOOKUP RESULT: ${lookupResult}`] : []),
    '',
    'INSTRUCTIONS:',
    '1. Extract any new slot values from the USER MESSAGE into updated_slots.',
    '2. If the customer named a doctor, put it in doctor_name (do NOT guess their department or location).',
    '3. If all REQUIRED SLOTS are filled, set action = "complete".',
    '4. Otherwise set action = "ask" and write ONE natural, brief question for the FIRST missing required slot. Never ask for a slot you already have.',
    '5. Rephrase in character using your persona, but keep the core intent of the question.',
    '6. If the message is off-topic or a greeting, answer it naturally and still set action = "ask" with a question that guides back to a missing slot.',
    '7. Reply in the same language as the customer.',
    '',
    'Return ONLY strict JSON matching: {"updated_slots": {slot: value, ...}, "action": "ask"|"complete", "next_question": "..."}',
  ].join('\n');
}

function validateHarnessDecision(
  obj: any
): { ok: true; value: HarnessDecision } | { ok: false; reason: string } {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, reason: 'not an object' };
  if (obj.action !== 'ask' && obj.action !== 'complete') return { ok: false, reason: 'action must be ask|complete' };
  if (obj.updated_slots === undefined || obj.updated_slots === null || typeof obj.updated_slots !== 'object') {
    return { ok: false, reason: 'updated_slots must be an object' };
  }
  const next_question = typeof obj.next_question === 'string' ? obj.next_question.trim() : '';
  if (obj.action === 'ask' && !next_question) return { ok: false, reason: 'next_question is required for ask' };

  const updated_slots: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj.updated_slots)) {
    updated_slots[key] = typeof value === 'string' ? value : String(value ?? '');
  }

  const tool_call = obj.tool_call === 'lookup_schedule' ? ('lookup_schedule' as const) : undefined;
  const lookup = obj.lookup && typeof obj.lookup === 'object' ? obj.lookup : undefined;

  return {
    ok: true,
    value: {
      updated_slots,
      action: obj.action,
      next_question,
      ...(tool_call ? { tool_call } : {}),
      ...(lookup ? { lookup } : {}),
    },
  };
}

// ── Model IO ────────────────────────────────────────────────────────────────

async function askModel(
  client: LlmClient | undefined,
  prompt: string
): Promise<{ decision: HarnessDecision; attempts: number }> {
  if (!client) return { decision: { updated_slots: {}, action: 'ask', next_question: '' }, attempts: 0 };
  const result = await llmJson<HarnessDecision>(client, prompt, validateHarnessDecision, {
    maxRetries: 1,
    maxTokens: 400,
  });
  return result.ok
    ? { decision: result.value, attempts: result.attempts }
    : { decision: { updated_slots: {}, action: 'ask', next_question: '' }, attempts: result.attempts };
}

// ── Schedule lookup ─────────────────────────────────────────────────────────

/**
 * A doctor-name match that is stricter than `looseCellMatch`. The generic matcher
 * whole-word-matches the shared title token "DR", which would let "Dr. Goutham"
 * match every "DR …" row. Here the title is stripped and every remaining token of
 * the wanted name must equal (or prefix) a token of the schedule name.
 */
export function matchDoctor(cell: any, wanted: any): boolean {
  const strip = (s: string) =>
    String(s ?? '')
      .replace(/\b(doctor|prof)\b\.?/gi, ' ')
      .replace(/\bdr\b\.?/gi, ' ')
      .replace(/[^a-z0-9]+/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  const a = strip(cell);
  const b = strip(wanted);
  if (!a || !b) return false;
  if (a === b) return true;
  const aTokens = a.split(' ');
  const bTokens = b.split(' ').filter((t) => t.length >= 2);
  if (bTokens.length === 0) return false;
  return bTokens.every((t) => aTokens.some((aw) => aw === t || aw.startsWith(t)));
}

async function scheduleLookup(
  readRows: RowReader,
  sheet: AiGoogleSheetsConfig,
  map: ScheduleMap | undefined,
  filter: { doctor?: string; department?: string; location?: string }
): Promise<Record<string, any>[]> {
  if (!map) return [];
  const rows = await readRows(sheet, map.source);
  return rankLookupHits(
    rows.filter((row) => {
      if (filter.doctor && !matchDoctor(readCell(row, map.doctorColumn), filter.doctor)) return false;
      if (filter.department && !looseCellMatch(readCell(row, map.departmentColumn), filter.department)) return false;
      if (filter.location && !looseCellMatch(readCell(row, map.branchColumn), filter.location)) return false;
      return true;
    })
  );
}

function formatScheduleRow(row: Record<string, any>, map: ScheduleMap): string {
  const doctor = String(readCell(row, map.doctorColumn) ?? '').trim() || 'a doctor';
  const department = String(readCell(row, map.departmentColumn) ?? '').trim();
  const branch = String(readCell(row, map.branchColumn) ?? '').trim();
  const timesHeader = availabilityHeader(row);
  const times = timesHeader ? String(readCell(row, timesHeader) ?? '').trim() : '';
  return `${doctor} is ${department ? `a ${department}` : 'available'}${branch ? ` at ${branch}` : ''}${times ? ` (available ${times})` : ''}.`;
}

// ── Guards ──────────────────────────────────────────────────────────────────

/** Replace `{slot}` with values, then strip any token that still has no value. */
export function noBarePlaceholders(text: string, slots: Record<string, any>): string {
  const substituted = substituteSlots(text, slots);
  return substituted
    .replace(/\{[^{}]*\}/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function firstMissing(slots: Record<string, any>, checklist: HarnessChecklist): HarnessSlot | undefined {
  return checklist.required.find((slot) => !isFilled(slots, slot.name));
}

function defaultQuestion(slot: HarnessSlot | undefined): string {
  if (slot?.hint) return slot.hint;
  const label = slot?.name?.replace(/[_-]+/g, ' ') ?? 'the required information';
  return `Could you please provide your ${label}?`;
}

// ── Validation + merge ──────────────────────────────────────────────────────

function mergeSlots(
  slots: Record<string, any>,
  updated: Record<string, string> | undefined,
  checklist: HarnessChecklist
): void {
  if (!updated) return;
  for (const [name, raw] of Object.entries(updated)) {
    if (isFilled(slots, name)) continue; // never overwrite an already-filled slot
    const declared = checklist.required.find((slot) => slot.name === name);
    const type = declared?.type ?? 'text';
    const validation = validateSlotValue(raw, type, declared?.options, declared?.validation);
    if (validation.valid) {
      slots[name] = type === 'list' || type === 'buttons'
        ? canonicalizeOption(validation.value, declared?.options)
        : validation.value;
    }
  }
}

// ── The harness turn ────────────────────────────────────────────────────────

/**
 * Run one harness turn: match the intent (turn 1), derive the checklist, and loop
 * "ask model → (auto) lookup → re-ask" until the model says `ask` or `complete`.
 * Never throws — sheet/model failures surface as a fallback question or `error`.
 */
export async function runAgentHarness(
  sheet: AiGoogleSheetsConfig,
  context: Record<string, any>,
  nodeId: string,
  userMessage: string,
  reader?: RowReader,
  client?: LlmClient,
  systemPrompt?: string
): Promise<SheetTurn> {
  const readRows = reader ?? defaultReadRows;
  const rawState = context?.ai?.[nodeId]?.sheet;
  const state: SheetState = {
    intentId: rawState?.intentId ?? null,
    stepId: null,
    slots: rawState?.slots && typeof rawState.slots === 'object' ? { ...rawState.slots } : {},
  };

  const intentsTab = intentsTabName(sheet);
  const stepsTab = stepsTabName(sheet);

  const idHeader = headerFor(sheet, intentsTab, 'id');
  const keywordsHeader = headerFor(sheet, intentsTab, 'keywords');
  const answerHeader = headerFor(sheet, intentsTab, 'answer');
  const typeHeader = headerFor(sheet, intentsTab, 'type');
  const intentIdHeader = headerFor(sheet, stepsTab, 'intent_id');
  const stepTypeHeader = headerFor(sheet, stepsTab, 'step_type');
  const slotHeader = headerFor(sheet, stepsTab, 'slot_name');
  const expectedHeader = headerFor(sheet, stepsTab, 'expected_input');
  const optionsHeader = headerFor(sheet, stepsTab, 'options');
  const validationHeader = headerFor(sheet, stepsTab, 'validation');
  const questionHeader = headerFor(sheet, stepsTab, 'ai_question');
  const filterHeader = headerFor(sheet, stepsTab, 'lookup_filter');
  const fallbackHeader = headerFor(sheet, stepsTab, 'fallback');
  const sourceHeader = headerFor(sheet, stepsTab, 'lookup_source');
  const extractHeader = headerFor(sheet, stepsTab, 'lookup_extract');

  const toolCalls: SheetLookupCall[] = [];
  let slotExtractionAttempts = 0;
  let fallbackUsed = false;

  // ── Turn 1: match the intent (keyword substring — same as the state machine) ──
  if (!state.intentId) {
    const intents = await readRows(sheet, intentsTab, { column: keywordsHeader, value: userMessage });
    toolCalls.push({
      name: 'lookup_sheet',
      args: { tab: intentsTab, filter_column: keywordsHeader, filter_value: userMessage },
      rows: intents.length,
    });

    if (intents.length === 0) {
      return { text: '', sheet: state, toolCalls, slotExtractionAttempts, fallbackUsed, conversational: true };
    }

    const intent = intents[0];
    state.intentId = String(intent[idHeader] ?? '').trim();

    // Intent type gate: a non-Booking intent answers directly (no checklist).
    const intentType = String(readCell(intent, typeHeader) ?? '').trim();
    if (intentType && !/^booking$/i.test(intentType)) {
      const answer = substituteSlots(String(readCell(intent, answerHeader) ?? '').trim(), state.slots);
      return {
        text: answer || '',
        sheet: freshHarnessState(),
        toolCalls,
        slotExtractionAttempts,
        fallbackUsed,
        ...(answer ? {} : { conversational: true }),
      };
    }
  }

  // ── Load the goal checklist for this intent ───────────────────────────────
  const steps = await readRows(sheet, stepsTab, { column: intentIdHeader, value: state.intentId });
  toolCalls.push({
    name: 'lookup_sheet',
    args: { tab: stepsTab, filter_column: intentIdHeader, filter_value: state.intentId },
    rows: steps.length,
  });

  const checklist = deriveChecklist(steps, {
    slot: slotHeader,
    expected: expectedHeader,
    options: optionsHeader,
    validation: validationHeader,
    question: questionHeader,
    filter: filterHeader,
    stepType: stepTypeHeader,
    fallback: fallbackHeader,
  });

  const scheduleMap = deriveScheduleMap(steps, {
    stepType: stepTypeHeader,
    source: sourceHeader,
    filter: filterHeader,
    extract: extractHeader,
  });

  // ── Round 1: the model extracts + decides ────────────────────────────────
  let round = await askModel(client, buildHarnessPrompt(systemPrompt ?? '', checklist, state.slots, userMessage));
  let decision = round.decision;
  slotExtractionAttempts += round.attempts;
  mergeSlots(state.slots, decision.updated_slots, checklist);

  // ── Auto doctor lookup: deduce department + location ──────────────────────
  // (deterministic — the harness does not trust the model to remember to look it up)
  let lookupText: string | undefined;
  const doctorName = isFilled(state.slots, 'doctor_name') ? String(state.slots.doctor_name) : '';
  const needsDoctorLookup =
    doctorName !== '' && (!isFilled(state.slots, 'department') || !isFilled(state.slots, 'location'));

  if (needsDoctorLookup && scheduleMap) {
    const rows = await scheduleLookup(readRows, sheet, scheduleMap, { doctor: doctorName });
    toolCalls.push({ name: 'lookup_sheet', args: { tab: scheduleMap.source, filter: `doctor=${doctorName}` }, rows: rows.length });
    if (rows.length > 0) {
      const row = rows[0];
      if (!isFilled(state.slots, 'department')) state.slots.department = readCell(row, scheduleMap.departmentColumn);
      if (!isFilled(state.slots, 'location')) state.slots.location = readCell(row, scheduleMap.branchColumn);
      lookupText = formatScheduleRow(row, scheduleMap);
    }
  }

  // ── Model-requested lookup (availability / no doctor known) ───────────────
  if (!lookupText && decision.tool_call === 'lookup_schedule' && scheduleMap) {
    const rows = await scheduleLookup(readRows, sheet, scheduleMap, decision.lookup ?? {});
    toolCalls.push({ name: 'lookup_sheet', args: { tab: scheduleMap.source, filter: JSON.stringify(decision.lookup ?? {}) }, rows: rows.length });
    if (rows.length > 0) lookupText = formatScheduleRow(rows[0], scheduleMap);
  }

  // ── Round 2: re-invoke with the lookup result so the model re-asks correctly ──
  if (lookupText) {
    round = await askModel(
      client,
      buildHarnessPrompt(systemPrompt ?? '', checklist, state.slots, userMessage, lookupText)
    );
    decision = round.decision;
    slotExtractionAttempts += round.attempts;
    mergeSlots(state.slots, decision.updated_slots, checklist);
  }

  // ── Finalize ──────────────────────────────────────────────────────────────
  if (decision.action === 'complete') {
    // Read the intent's `answer` for the confirmation text.
    const intents = await readRows(sheet, intentsTab, { column: idHeader, value: state.intentId ?? '' });
    const answerText = intents.length ? String(readCell(intents[0], answerHeader) ?? '').trim() : '';
    const text = noBarePlaceholders(
      substituteSlots(answerText, state.slots) || 'Your booking is confirmed. Our team will contact you shortly.',
      state.slots
    );
    return { text, sheet: freshHarnessState(), toolCalls, slotExtractionAttempts, fallbackUsed };
  }

  const missing = firstMissing(state.slots, checklist);
  const text = noBarePlaceholders(decision.next_question || defaultQuestion(missing), state.slots);
  return { text, sheet: state, toolCalls, slotExtractionAttempts, fallbackUsed };
}
