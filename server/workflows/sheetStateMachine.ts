/**
 * Phase 4d — deterministic Google Sheets state machine (Task 5 MVP).
 *
 * The free-form tool loop lets the LLM improvise the step sequence from its own
 * knowledge once the trimmed `history` drops the early turns. This module fixes
 * that: the ENGINE reads the current step from the sheet every turn, asks its
 * `ai_question`, and advances via `next_step_logic`. The LLM is narrowed to (at
 * most) extracting raw slot values — it never decides whether a value is valid;
 * `slotValidation.ts` does, deterministically.
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
import { buildSlotExtractionPrompt, llmJson } from '../ai/prompt';
import type { AiGoogleSheetsConfig, LlmClient, SlotExtractionResult } from '../ai/types';
import { normalizeInputType, normalizeOptions, parseOptions, validateSlotValue } from './slotValidation';
import type { RejectedSlot } from './slotValidation';

export type { RejectedSlot } from './slotValidation';

export interface SheetState {
  intentId: string | null;
  stepId: string | null;
  slots: Record<string, any>;
}

/** A fresh empty state — never reuse a shared object (slots must not leak across turns). */
function freshState(): SheetState {
  return { intentId: null, stepId: null, slots: {} };
}

/** Read the persisted sheet state, tolerating any malformed shape. */
export function readSheetState(context: Record<string, any>, nodeId: string): SheetState {
  const raw = context?.ai?.[nodeId]?.sheet;
  if (!raw || typeof raw !== 'object') return freshState();
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
  /** Slots the LLM extracted on turn 1 (Task 5b), when extraction ran. */
  extractedSlots?: Record<string, any>;
  /** The LLM's confidence for the turn-1 extraction. */
  extractionConfidence?: number;
  /** Step ids skipped on turn 1 because their slots were already filled. */
  skippedSteps?: string[];
  /** Total LLM attempts (initial + retries) used for slot extraction this turn. */
  slotExtractionAttempts?: number;
  /** Whether the fallback path was triggered (invalid slot → re-ask). */
  fallbackUsed?: boolean;
  /** Why the slot was rejected (trace only — never sent to the customer). */
  fallbackReason?: string;
  /** Turn-1 values the LLM extracted but code dropped (trace only). */
  rejectedSlots?: RejectedSlot[];
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

/** Extraction hint only — `options` never gates validity here. */
export interface SlotExtractHint {
  type?: string;
  options?: string[];
}

export type SlotExtractResult =
  | { ok: true; value: string; attempts: number }
  | { ok: false; error: string; attempts: number };

/**
 * Extract a single slot's RAW value from the customer's message via the LLM.
 *
 * Phase 4d-2 increment 2: the model no longer returns `valid`/`reason`. It is a
 * probabilistic component, so it must not own business rules — it copies the
 * customer's words and `validateSlotValue` decides. `ok: false` here means only
 * "transport/format failed" (the caller falls back).
 */
export async function extractSlot(
  client: LlmClient,
  slotName: string,
  userMessage: string,
  hint: SlotExtractHint = {}
): Promise<SlotExtractResult> {
  const type = normalizeInputType(hint.type);
  const choices = normalizeOptions(hint.options);
  const listLike = type === 'list' || type === 'buttons';

  const prompt = [
    `Extract the value for slot "${slotName}" from the customer's message.`,
    ...(listLike && choices.length > 0
      ? [`If the message names one of these choices, return that choice as written: ${choices.join(', ')}.`]
      : []),
    '',
    `Customer message: "${userMessage}"`,
    '',
    'Return strict JSON: {"value": "<the customer\'s own words for this slot, or \\"\\" if absent>"}',
    'Copy the customer\'s words. Do not judge, correct, translate or reformat. Do not explain.',
  ].join('\n');

  // llmJson is a SHAPE gate (valid JSON, string value) with corrective retries.
  // A null/absent value is a legitimate "nothing to extract" — never retried.
  const result = await llmJson<{ value: string }>(
    client,
    prompt,
    (obj) => {
      if (!obj || typeof obj !== 'object') return { ok: false, reason: 'not an object' };
      if (typeof obj.value === 'string') return { ok: true, value: { value: obj.value } };
      if (obj.value === null || obj.value === undefined) return { ok: true, value: { value: '' } };
      return { ok: false, reason: 'missing string "value"' };
    },
    { maxRetries: 2 }
  );

  return result.ok
    ? { ok: true, value: result.value.value.trim(), attempts: result.attempts }
    : { ok: false, error: result.error, attempts: result.attempts };
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

/**
 * Validate the turn-1 slot-extraction JSON SHAPE. Malformed output is rejected
 * so `llmJson` retries; values themselves are checked by `validateSlotValue`.
 * `confidence` is optional and deprecated — it is a trace signal, not a gate.
 */
function validateSlotExtraction(
  obj: any
): { ok: true; value: SlotExtractionResult } | { ok: false; reason: string } {
  if (!obj || typeof obj !== 'object') return { ok: false, reason: 'not an object' };
  if (!obj.slots || typeof obj.slots !== 'object' || Array.isArray(obj.slots)) {
    return { ok: false, reason: 'missing "slots" object' };
  }
  const confidence =
    typeof obj.confidence === 'number' && obj.confidence >= 0 && obj.confidence <= 1
      ? obj.confidence
      : undefined;
  return { ok: true, value: { slots: obj.slots, confidence } };
}

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
  reader?: RowReader,
  client?: LlmClient
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
  const optionsHeader = headerFor(sheet, stepsTab, 'options');

  const toolCalls: SheetLookupCall[] = [];
  let slotExtractionAttempts = 0;
  let fallbackUsed = false;

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
        sheet: freshState(),
        toolCalls,
      };
    }

    state.stepId = startStep && findStep(steps, stepIdHeader, startStep)
      ? startStep
      : String((firstStep(steps, stepIdHeader)?.[stepIdHeader] ?? '')).trim();

    // ── Task 5b: turn-1 LLM extraction → skip already-filled steps ──────────
    // The LLM returns raw strings only. validateSlotValue decides what is kept,
    // so an out-of-list value is dropped (never stored) instead of trusted.
    const slotMeta = new Map<string, { type: string; options?: string[] }>();
    for (const step of steps) {
      const name = String(step[slotHeader] ?? '').trim();
      if (name && !slotMeta.has(name)) {
        slotMeta.set(name, {
          type: String(step[expectedHeader] ?? 'text').trim(),
          options: parseOptions(step[optionsHeader]),
        });
      }
    }
    const hasSlot = (name: string) =>
      name !== '' && state.slots[name] !== undefined && state.slots[name] !== null && state.slots[name] !== '';

    let extracted: SlotExtractionResult | null = null;
    const rejectedSlots: RejectedSlot[] = [];
    if (client && slotMeta.size > 0) {
      const result = await llmJson<SlotExtractionResult>(
        client,
        buildSlotExtractionPrompt(
          Array.from(slotMeta, ([name, meta]) => ({ name, type: meta.type, options: meta.options })),
          userMessage
        ),
        validateSlotExtraction,
        { maxRetries: 1 }
      );
      slotExtractionAttempts += result.attempts;
      if (result.ok) extracted = result.value;
    }

    if (extracted) {
      const accepted: Record<string, string> = {};
      for (const [name, raw] of Object.entries(extracted.slots ?? {})) {
        const meta = slotMeta.get(name);
        if (!meta) continue; // ignore fields the sheet does not declare
        const validation = validateSlotValue(raw, meta.type, meta.options);
        if (validation.valid) accepted[name] = validation.value;
        else rejectedSlots.push({ slot: name, value: String(raw ?? ''), reason: validation.reason ?? 'rejected' });
      }
      Object.assign(state.slots, accepted);
      extracted = { slots: accepted, confidence: extracted.confidence };
    }

    // The first step whose slot is still empty is where we start.
    const firstUnfilled = steps.find((s) => !hasSlot(String(s[slotHeader] ?? '').trim()));
    const skippedSteps = steps
      .filter((s) => hasSlot(String(s[slotHeader] ?? '').trim()))
      .map((s) => String(s[stepIdHeader] ?? '').trim());

    if (!firstUnfilled) {
      // Every slot is already filled → complete immediately.
      const result = await complete(readRows, sheet, intentsTab, state, toolCalls, idHeader, answerHeader);
      result.slotExtractionAttempts = slotExtractionAttempts;
      result.fallbackUsed = fallbackUsed;
      if (extracted) {
        result.extractedSlots = extracted.slots;
        result.extractionConfidence = extracted.confidence;
        result.skippedSteps = skippedSteps;
      }
      if (rejectedSlots.length > 0) result.rejectedSlots = rejectedSlots;
      return result;
    }

    state.stepId = String(firstUnfilled[stepIdHeader] ?? '').trim();
    const current = findStep(steps, stepIdHeader, state.stepId) ?? firstUnfilled;
    const question = substituteSlots(String(current?.[questionHeader] ?? '').trim(), state.slots);
    return {
      text: question,
      sheet: state,
      toolCalls,
      slotExtractionAttempts,
      fallbackUsed,
      ...(extracted
        ? {
            extractedSlots: extracted.slots,
            extractionConfidence: extracted.confidence,
            skippedSteps,
          }
        : {}),
      ...(rejectedSlots.length > 0 ? { rejectedSlots } : {}),
    };
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
    const result = await complete(readRows, sheet, intentsTab, state, toolCalls, idHeader, answerHeader);
    result.slotExtractionAttempts = slotExtractionAttempts;
    result.fallbackUsed = fallbackUsed;
    return result;
  }

  // LLM extracts the raw value; CODE decides whether it is acceptable. Without a
  // client the raw message is the candidate — validation is identical either way.
  const slotName = String(current[slotHeader] ?? '').trim();
  if (slotName) {
    const expectedInput = String(current[expectedHeader] ?? 'text').trim();
    const options = parseOptions(current[optionsHeader]);

    let candidate = userMessage.trim();
    let fallbackReason: string | undefined;

    if (client) {
      const extracted = await extractSlot(client, slotName, userMessage, {
        type: expectedInput,
        options,
      });
      slotExtractionAttempts += extracted.attempts;
      if (extracted.ok) candidate = extracted.value;
      else fallbackReason = extracted.error;
    }

    const validation = fallbackReason ? null : validateSlotValue(candidate, expectedInput, options);

    if (!validation?.valid) {
      // Rejected by code (or extraction failed) → fallback, re-ask, don't advance.
      fallbackUsed = true;
      const reason = validation?.reason ?? fallbackReason ?? 'no value extracted';
      const fallback = String(current[fallbackHeader] ?? '').trim();
      const question = substituteSlots(String(current[questionHeader] ?? '').trim(), state.slots);
      return {
        text: fallback || question,
        sheet: state,
        toolCalls,
        slotExtractionAttempts,
        fallbackUsed,
        fallbackReason: reason,
      };
    }

    state.slots[slotName] = validation.value;
  }

  const transition = parseNextStepLogic(current[nextHeader]);
  if (transition.kind === 'done') {
    const result = await complete(readRows, sheet, intentsTab, state, toolCalls, idHeader, answerHeader);
    result.slotExtractionAttempts = slotExtractionAttempts;
    result.fallbackUsed = fallbackUsed;
    return result;
  }

  const nextStep = findStep(steps, stepIdHeader, transition.stepId);
  if (!nextStep) {
    // Referenced step missing — complete gracefully.
    const result = await complete(readRows, sheet, intentsTab, state, toolCalls, idHeader, answerHeader);
    result.slotExtractionAttempts = slotExtractionAttempts;
    result.fallbackUsed = fallbackUsed;
    return result;
  }

  state.stepId = transition.stepId;
  const question = substituteSlots(String(nextStep[questionHeader] ?? '').trim(), state.slots);
  return {
    text: question || String(nextStep[fallbackHeader] ?? '').trim(),
    sheet: state,
    toolCalls,
    slotExtractionAttempts,
    fallbackUsed,
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
  return { text, sheet: freshState(), toolCalls };
}
