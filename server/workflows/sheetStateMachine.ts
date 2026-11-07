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

/** One `column=value` clause parsed from a `lookup_filter` string. */
export interface LookupFilterClause {
  column: string;
  value: string;
}

/**
 * Parse a `lookup_filter` string ("branch={location} AND doctor={specialist}")
 * into AND clauses. Each clause is `column=value`; the value is taken verbatim
 * after the first `=`. Clauses without `=` match against an empty value.
 */
export function parseLookupFilter(filter: string): LookupFilterClause[] {
  return String(filter ?? '')
    .split(/\s+AND\s+/i)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const eq = part.indexOf('=');
      if (eq === -1) return { column: part, value: '' };
      return { column: part.slice(0, eq).trim(), value: part.slice(eq + 1).trim() };
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
 * probabilistic component, so it must not own business rules — `validateSlotValue`
 * still decides. For list/buttons slots the prompt asks the model to map synonyms
 * and typos to the exact canonical option (fuzzy match), so code validation
 * receives a canonical value it can accept; `ok: false` here means only
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
      ? [
          `Allowed options: ${choices.join(', ')}.`,
          `If the customer's input is a synonym, abbreviation, or contains a typo of one of these options (e.g. "dentist" → "Dental", "adliya" → "Manama"), return the EXACT string from the allowed options list.`,
          `If the input does not clearly match any option, return the customer's own words unchanged.`,
        ]
      : []),
    '',
    `Customer message: "${userMessage}"`,
    '',
    'Return strict JSON: {"value": "<the canonical option, or the customer\'s own words if none match, or \\"\\" if absent>"}',
    'Do not explain. Do not add commentary.',
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

/**
 * Increment E — generate a natural, conversational re-prompt when a slot value
 * is rejected, instead of the static sheet `fallback`. The LLM gets to
 * acknowledge the customer ("Anyone is fine") and gently guide them back, so the
 * AI behaves like an agent rather than a dumb form validator.
 *
 * Returns '' when generation fails (or the provider errors), so the caller falls
 * back to the static sheet `fallback`.
 *
 * `fallbackString` is the static sheet fallback and is intentionally NOT injected
 * into the prompt (we do not want the model to lazily echo it); it is kept on the
 * signature for call-site clarity and future use.
 */
export async function generateConversationalFallback(
  client: LlmClient,
  slotName: string,
  userMessage: string,
  currentQuestion: string,
  _fallbackString: string,
  allowedOptions?: string[]
): Promise<string> {
  // The mock provider has no real model — its "reply" is an echo of the prompt,
  // which must never leak to the customer. Skip it so mock mode and unit tests
  // keep the static sheet fallback. Every real provider (Groq, DeepSeek, …) runs.
  if (client.id === 'mock') return '';

  const optionsLine = allowedOptions && allowedOptions.length > 0
    ? allowedOptions.join(', ')
    : 'Any text';
  const prompt = [
    `You are a helpful AI assistant collecting the "${slotName}" from the customer.`,
    '',
    `The question you asked was: "${currentQuestion}"`,
    `The valid options are: ${optionsLine}`,
    `The customer replied: "${userMessage}"`,
    '',
    `The customer's reply is NOT one of the valid options. Do exactly this:`,
    '1. Acknowledge what the customer said (e.g. "I see you are looking for a dentist").',
    '2. Briefly explain it is not a valid option, then list the valid options.',
    '3. Ask them to choose one of the valid options.',
    '4. Keep it brief, natural and conversational.',
    '5. Reply in the same language as the customer.',
    '',
    'Return ONLY the text you would say to the customer. Do not use JSON.',
  ].join('\n');

  try {
    const result = await client.complete({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      maxTokens: 160,
    });
    if (!result.ok) return '';
    return result.text.trim();
  } catch {
    return '';
  }
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
    maxRows: 1000, // intents/steps are small; lookup tabs (e.g. a schedule) can be larger
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
  const stepTypeHeader = headerFor(sheet, stepsTab, 'step_type');
  const questionHeader = headerFor(sheet, stepsTab, 'ai_question');
  const slotHeader = headerFor(sheet, stepsTab, 'slot_name');
  const optionsHeader = headerFor(sheet, stepsTab, 'options');
  const lookupSourceHeader = headerFor(sheet, stepsTab, 'lookup_source');
  const lookupFilterHeader = headerFor(sheet, stepsTab, 'lookup_filter');
  const lookupExtractHeader = headerFor(sheet, stepsTab, 'lookup_extract');
  const alternateStepHeader = headerFor(sheet, stepsTab, 'alternate_step');
  const nextHeader = headerFor(sheet, stepsTab, 'next_step_logic');
  const fallbackHeader = headerFor(sheet, stepsTab, 'fallback');
  const expectedHeader = headerFor(sheet, stepsTab, 'expected_input');

  const toolCalls: SheetLookupCall[] = [];
  let slotExtractionAttempts = 0;
  let fallbackUsed = false;

  /**
   * Phase 4d-2 — advance from `startStep` through any consecutive `lookup` steps
   * and return the next thing to do: ask a question, or complete the flow.
   *
   * A `lookup` step runs SILENTLY (no question): it reads `lookup_source`,
   * resolves `lookup_filter` against the current slots, and stores the first
   * matching row's `lookup_extract` column into `slot_name`. On a match it follows
   * `next_step_logic`; on no-match it follows `alternate_step` (or completes if
   * empty). `fallbackUsed` is set on a lookup failure.
   */
  const resolveNextAsk = async (
    startStep: Record<string, any> | undefined
  ): Promise<{ kind: 'ask'; text: string } | { kind: 'done' }> => {
    let step = startStep;
    let guard = 0;
    while (step && guard++ < 100) {
      const stepType = String(step[stepTypeHeader] ?? '').trim().toLowerCase();

      if (stepType === 'lookup') {
        const source = String(step[lookupSourceHeader] ?? '').trim();
        const filterRaw = substituteSlots(String(step[lookupFilterHeader] ?? '').trim(), state.slots);
        const extractCol = String(step[lookupExtractHeader] ?? '').trim();
        const slotName = String(step[slotHeader] ?? '').trim();

        let matched = false;
        if (source) {
          const rows = await readRows(sheet, source);
          toolCalls.push({
            name: 'lookup_sheet',
            args: { tab: source, filter: filterRaw },
            rows: rows.length,
          });
          const clauses = parseLookupFilter(filterRaw);
          const hits = rows.filter((row) =>
            clauses.every((c) => {
              const cell = row[c.column];
              return cell !== undefined && cell !== null &&
                String(cell).trim().toLowerCase() === c.value.toLowerCase();
            })
          );
          if (hits.length > 0) {
            matched = true;
            if (slotName && extractCol) {
              const value = hits[0][extractCol];
              if (value !== undefined && value !== null && value !== '') {
                state.slots[slotName] = value;
              }
            }
          }
        }

        if (!matched) {
          fallbackUsed = true;
        }

        const transition = matched
          ? parseNextStepLogic(step[nextHeader])
          : (String(step[alternateStepHeader] ?? '').trim()
              ? parseNextStepLogic(step[alternateStepHeader])
              : { kind: 'done' as const });

        if (transition.kind === 'done') return { kind: 'done' };
        step = findStep(steps, stepIdHeader, transition.stepId);
        if (!step) return { kind: 'done' };
        continue;
      }

      // ask step (or missing step_type → default ask)
      state.stepId = String(step[stepIdHeader] ?? '').trim();
      const question = substituteSlots(String(step[questionHeader] ?? '').trim(), state.slots);
      return { kind: 'ask', text: question || String(step[fallbackHeader] ?? '').trim() };
    }
    return { kind: 'done' };
  };

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
    const resolved = await resolveNextAsk(findStep(steps, stepIdHeader, state.stepId) ?? firstUnfilled);
    if (resolved.kind === 'done') {
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
    return {
      text: resolved.text,
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
      if (extracted.ok) {
        // The extractor must never suppress the answer to the question we just
        // asked: if it returned nothing, the raw message is the candidate and
        // code validation decides (identical to the no-client path). Otherwise a
        // model that "helpfully" returns "" would re-trap the customer.
        candidate = extracted.value || userMessage.trim();
      } else {
        fallbackReason = extracted.error;
      }
    }

    const validation = fallbackReason ? null : validateSlotValue(candidate, expectedInput, options);

    if (!validation?.valid) {
      // Rejected by code (or extraction failed) → fallback, re-ask, don't advance.
      fallbackUsed = true;
      const reason = validation?.reason ?? fallbackReason ?? 'no value extracted';
      const fallback = String(current[fallbackHeader] ?? '').trim();
      const question = substituteSlots(String(current[questionHeader] ?? '').trim(), state.slots);

      // Increment E — conversational fallback: give the LLM a chance to respond
      // naturally (acknowledge + guide back) before defaulting to the static
      // sheet fallback. Real providers (Groq, DeepSeek, …) always run here; the
      // mock provider short-circuits inside `generateConversationalFallback`.
      let text = fallback || question;
      if (client) {
        const generated = await generateConversationalFallback(
          client,
          slotName,
          userMessage.trim(),
          question,
          fallback,
          options
        );
        if (generated) text = generated;
      }

      return {
        text,
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
  const nextStep = transition.kind === 'done' ? undefined : findStep(steps, stepIdHeader, transition.stepId);
  const resolved = await resolveNextAsk(nextStep);
  if (resolved.kind === 'done') {
    const result = await complete(readRows, sheet, intentsTab, state, toolCalls, idHeader, answerHeader);
    result.slotExtractionAttempts = slotExtractionAttempts;
    result.fallbackUsed = fallbackUsed;
    return result;
  }
  return {
    text: resolved.text,
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
