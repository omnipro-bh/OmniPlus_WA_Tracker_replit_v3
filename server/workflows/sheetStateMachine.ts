/**
 * Phase 4d — deterministic Google Sheets state machine (Task 5 MVP).
 *
 * The free-form tool loop lets the LLM improvise the step sequence from its own
 * knowledge once the trimmed `history` drops the early turns. This module fixes
 * that: the ENGINE reads the current step from the sheet every turn, asks its
 * `ai_question`, and advances via `next_step_logic`. The LLM is narrowed to (at
 * most) slot extraction.
 *
 * State is persisted in `context.ai[nodeId].sheet`:
 *   { intentId, stepId, slots: { slotName: value } }
 *
 * Opt-in: the machine is only active when the Workflow_Steps tab has a
 * `slot_name` column (detected by the config UI's "Detect Headers"). Sheets
 * without `slot_name` keep the legacy free-form behaviour.
 */

import { lookupSheetRows } from './googleSheetsExecutor';
import { AI_SHEET_TAB_SCHEMA } from '@shared/ai-defaults';
import type { AiGoogleSheetsConfig } from '../ai/types';

export interface SheetState {
  intentId: string | null;
  stepId: string | null;
  slots: Record<string, any>;
}

const EMPTY_STATE: SheetState = { intentId: null, stepId: null, slots: {} };

/** Read the persisted sheet state, tolerating any malformed shape. */
export function readSheetState(context: Record<string, any>, nodeId: string): SheetState {
  const raw = context?.ai?.[nodeId]?.sheet;
  if (!raw || typeof raw !== 'object') return { ...EMPTY_STATE };
  return {
    intentId: raw.intentId ?? null,
    stepId: raw.stepId ?? null,
    slots: raw.slots && typeof raw.slots === 'object' ? { ...raw.slots } : {},
  };
}

/** A lookup the machine performed this turn, for the trace. */
export interface SheetLookupCall {
  name: string;
  args: Record<string, any>;
  rows?: number;
}

/** The result of one deterministic turn. */
export interface SheetTurn {
  /** Text to send (a step question, the fallback, or the final answer). */
  text: string;
  /** Updated state to persist. */
  sheet: SheetState;
  /** Lookups made this turn (Intents + Workflow_Steps). */
  toolCalls: SheetLookupCall[];
  /** Set when a sheet read failed — the executor maps this to `error`. */
  error?: string;
}

export type StepTransition = { kind: 'advance'; stepId: string } | { kind: 'done' };

/**
 * Parse `next_step_logic` strictly. Accepted values:
 *   - `→ Step_N` (case-insensitive arrow/space) → advance
 *   - `→ done` / `done` → complete
 *   - empty / null → complete
 * Anything else → complete at runtime (save-time validation warns).
 */
export function parseNextStepLogic(value: any): StepTransition {
  const s = typeof value === 'string' ? value.trim() : '';
  if (!s) return { kind: 'done' };
  if (/^(→\s*)?done$/i.test(s)) return { kind: 'done' };
  const m = s.match(/→\s*Step_(\d+)/i);
  if (m) return { kind: 'advance', stepId: `Step_${m[1]}` };
  return { kind: 'done' };
}

/** Replace `{slot_name}` placeholders in an answer template with captured values. */
export function substituteSlots(template: string, slots: Record<string, any>): string {
  return String(template ?? '').replace(/\{(\w+)\}/g, (match, name) => {
    const v = slots[name];
    return v === undefined || v === null || v === '' ? match : String(v);
  });
}

export interface SlotExtraction {
  value: any;
  valid: boolean;
}

/**
 * Extract a slot value from the user's message (Task 5 MVP).
 *
 * MVP returns the raw trimmed message as the value and always marks it valid —
 * structured extraction and `expected_input` validation (and LLM-based parsing
 * like "I live in Riffa" → "Riffa") are follow-up work. Keeping this as a named
 * async helper preserves the seam for that future upgrade.
 */
export async function extractSlot(
  userMessage: string,
  _slotName: string,
  _expectedInput: any,
  _slots: Record<string, any>
): Promise<SlotExtraction> {
  return { value: userMessage.trim(), valid: true };
}

/** Resolve the actual header for a canonical key, honoring the owner's mapping. */
function headerFor(sheet: AiGoogleSheetsConfig, tab: string, key: string): string {
  const override = sheet.columns?.[tab]?.[key];
  if (typeof override === 'string' && override.trim()) return override.trim();
  const schema = AI_SHEET_TAB_SCHEMA.find((t) => t.tab === tab);
  return schema?.columns.find((c) => c.key === key)?.column ?? key;
}

function intentsTabName(sheet: AiGoogleSheetsConfig): string {
  return sheet.tabs.find((t) => /^intents?$/i.test(t)) ?? sheet.tabs[0];
}

function stepsTabName(sheet: AiGoogleSheetsConfig): string {
  return sheet.tabs.find((t) => /step/i.test(t)) ?? sheet.tabs[1] ?? sheet.tabs[0];
}

/**
 * Is the deterministic state machine active? Active when a sheet is configured
 * AND the Workflow_Steps tab's detected header row contains the `slot_name`
 * column (the owner's opt-in). Without detection data we stay on the legacy
 * free-form path.
 */
export function isSheetStateMachineEnabled(sheet?: AiGoogleSheetsConfig): boolean {
  if (!sheet?.spreadsheetId) return false;
  const stepsTab = stepsTabName(sheet);
  const slotHeader = headerFor(sheet, stepsTab, 'slot_name');
  const detected = sheet.detected?.[stepsTab];
  if (Array.isArray(detected) && detected.length > 0) {
    return detected.some((h) => String(h).trim().toLowerCase() === slotHeader.toLowerCase());
  }
  return false;
}

/** Read a tab's rows (all columns, up to `maxRows`) with an optional filter. */
async function defaultReadRows(
  sheet: AiGoogleSheetsConfig,
  tab: string,
  filter?: { column?: string; value?: string }
): Promise<Record<string, any>[]> {
  const result = await lookupSheetRows(sheet.spreadsheetId, tab, {
    filterColumn: filter?.column,
    filterValue: filter?.value,
    maxRows: 200, // steps/intents tables are small; read fully for the machine
  });
  return result.rows ?? [];
}

/** Injected row reader (test seam); defaults to the real Google Sheets read. */
export type RowReader = (
  sheet: AiGoogleSheetsConfig,
  tab: string,
  filter?: { column?: string; value?: string }
) => Promise<Record<string, any>[]>;

/** Find a step row by its `step_id`. */
function findStep(
  steps: Record<string, any>[],
  stepIdHeader: string,
  stepId: string
): Record<string, any> | undefined {
  return steps.find((s) => String(s[stepIdHeader] ?? '').trim() === stepId);
}

/** The step with the lowest numeric `Step_N` id (fallback "first step"). */
function firstStep(steps: Record<string, any>[], stepIdHeader: string): Record<string, any> | undefined {
  return [...steps].sort((a, b) => {
    const na = Number(String(a[stepIdHeader] ?? '').replace(/\D/g, ''));
    const nb = Number(String(b[stepIdHeader] ?? '').replace(/\D/g, ''));
    return (Number.isNaN(na) ? Infinity : na) - (Number.isNaN(nb) ? Infinity : nb);
  })[0];
}

/**
 * Run one deterministic turn: resolve the intent on the first turn, otherwise
 * advance the step sequence and eventually complete. Never throws — sheet read
 * failures surface as `{ error }`.
 */
export async function runSheetStateMachine(
  sheet: AiGoogleSheetsConfig,
  context: Record<string, any>,
  nodeId: string,
  userMessage: string,
  reader?: RowReader
): Promise<SheetTurn> {
  const readRows = reader ?? defaultReadRows;
  const state = readSheetState(context, nodeId);
  const intentsTab = intentsTabName(sheet);
  const stepsTab = stepsTabName(sheet);

  const idHeader = headerFor(sheet, intentsTab, 'id');
  const keywordsHeader = headerFor(sheet, intentsTab, 'keywords');
  const startStepHeader = headerFor(sheet, intentsTab, 'start_step');
  const answerHeader = headerFor(sheet, intentsTab, 'answer');
  const intentIdHeader = headerFor(sheet, stepsTab, 'intent_id');
  const stepIdHeader = headerFor(sheet, stepsTab, 'step_id');
  const questionHeader = headerFor(sheet, stepsTab, 'ai_question');
  const slotHeader = headerFor(sheet, stepsTab, 'slot_name');
  const nextHeader = headerFor(sheet, stepsTab, 'next_step_logic');
  const fallbackHeader = headerFor(sheet, stepsTab, 'fallback');
  const expectedHeader = headerFor(sheet, stepsTab, 'expected_input');

  const toolCalls: SheetLookupCall[] = [];

  // ── Turn 1: resolve the intent ─────────────────────────────────────────────
  if (!state.intentId) {
    const intents = await readRows(sheet, intentsTab, { column: keywordsHeader, value: userMessage });
    toolCalls.push({
      name: 'lookup_sheet',
      args: { tab: intentsTab, filter_column: keywordsHeader, filter_value: userMessage },
      rows: intents.length,
    });

    if (intents.length === 0) {
      return {
        text: 'I could not find an answer for that. Would you like to talk to a human?',
        sheet: state,
        toolCalls,
      };
    }

    const intent = intents[0];
    state.intentId = String(intent[idHeader] ?? '').trim();
    const startStep = String(intent[startStepHeader] ?? '').trim();

    const steps = await readRows(sheet, stepsTab, { column: intentIdHeader, value: state.intentId });
    toolCalls.push({
      name: 'lookup_sheet',
      args: { tab: stepsTab, filter_column: intentIdHeader, filter_value: state.intentId },
      rows: steps.length,
    });

    if (steps.length === 0) {
      // Simple FAQ intent (no steps) — answer directly.
      const answer = String(intent[answerHeader] ?? '').trim();
      return {
        text: answer || 'I have found the answer but it is empty.',
        sheet: { ...EMPTY_STATE },
        toolCalls,
      };
    }

    state.stepId = startStep && findStep(steps, stepIdHeader, startStep)
      ? startStep
      : String((firstStep(steps, stepIdHeader)?.[stepIdHeader] ?? '')).trim();

    const current = findStep(steps, stepIdHeader, state.stepId!) ?? firstStep(steps, stepIdHeader);
    const question = String(current?.[questionHeader] ?? '').trim();
    return { text: question, sheet: state, toolCalls };
  }

  // ── Turn 2+: advance or complete ───────────────────────────────────────────
  const steps = await readRows(sheet, stepsTab, { column: intentIdHeader, value: state.intentId });
  toolCalls.push({
    name: 'lookup_sheet',
    args: { tab: stepsTab, filter_column: intentIdHeader, filter_value: state.intentId },
    rows: steps.length,
  });

  const current = findStep(steps, stepIdHeader, state.stepId ?? '');
  if (!current) {
    // Current step vanished (sheet edited) — complete gracefully.
    return complete(readRows, sheet, intentsTab, state, toolCalls, idHeader, answerHeader);
  }

  // Capture the slot (raw text for the MVP; validation comes later).
  const slotName = String(current[slotHeader] ?? '').trim();
  if (slotName) {
    const extracted = await extractSlot(userMessage, slotName, current[expectedHeader], state.slots);
    if (extracted.valid) state.slots[slotName] = extracted.value;
  }

  const transition = parseNextStepLogic(current[nextHeader]);
  if (transition.kind === 'done') {
    return complete(readRows, sheet, intentsTab, state, toolCalls, idHeader, answerHeader);
  }

  const nextStep = findStep(steps, stepIdHeader, transition.stepId);
  if (!nextStep) {
    // Referenced step missing — complete gracefully.
    return complete(readRows, sheet, intentsTab, state, toolCalls, idHeader, answerHeader);
  }

  state.stepId = transition.stepId;
  const question = String(nextStep[questionHeader] ?? '').trim();
  return {
    text: question || String(nextStep[fallbackHeader] ?? '').trim(),
    sheet: state,
    toolCalls,
  };
}

/** Read the intent's answer, substitute captured slots, and end the flow. */
async function complete(
  readRows: RowReader,
  sheet: AiGoogleSheetsConfig,
  intentsTab: string,
  state: SheetState,
  toolCalls: SheetLookupCall[],
  idHeader: string,
  answerHeader: string
): Promise<SheetTurn> {
  const intents = await readRows(sheet, intentsTab, { column: idHeader, value: state.intentId ?? '' });
  toolCalls.push({
    name: 'lookup_sheet',
    args: { tab: intentsTab, filter_column: idHeader, filter_value: state.intentId ?? '' },
    rows: intents.length,
  });
  const intent = intents[0];
  const answer = String(intent?.[answerHeader] ?? '').trim();
  const text = substituteSlots(answer, state.slots) || 'Done — is there anything else I can help with?';
  return { text, sheet: { ...EMPTY_STATE }, toolCalls };
}
