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
import { isWithinWindow, parseRequestedTime, parseTimeWindows } from './timeRange';
import { AI_SHEET_TAB_SCHEMA } from '@shared/ai-defaults';
import { buildSlotExtractionPrompt, llmJson } from '../ai/prompt';
import type { AiGoogleSheetsConfig, LlmClient, ReasoningTrace, SlotExtractionResult } from '../ai/types';
import {
  canonicalizeOption,
  matchWholeWordOption,
  normalizeInputType,
  normalizeOptions,
  parseOptions,
  parseValidation,
  validateSlotValue,
} from './slotValidation';
import type { RejectedSlot } from './slotValidation';

export type { RejectedSlot } from './slotValidation';

export interface SheetState {
  intentId: string | null;
  stepId: string | null;
  slots: Record<string, any>;
  /** Structured JSON of the most recent `search_schedule` results (Phase 5). */
  lastSearch?: string;
  /** Intent matched but not yet confirmed (verification step). */
  pendingIntentId?: string | null;
  /** True while the verification question is on screen. */
  awaitingVerification?: boolean;
  /** Fallback intent matched but not yet confirmed (catch-all flow). */
  pendingFallbackId?: string | null;
  /** True while the fallback verification question is on screen. */
  awaitingFallbackVerification?: boolean;
  /** Slots extracted from the user's message before the fallback verification question. */
  fallbackExtractedSlots?: Record<string, any>;
  /** Number of consecutive reasoning turns without progress (loop prevention). */
  reasoningAttempts?: number;
  /**
   * A booking confirmation the reasoning step asked for, awaiting "Yes"/"No".
   *
   * Kept separate from the Fallback-intent state: a reasoned confirmation has no
   * Intents row of its own, only the row the reasoner targeted. "Yes" promotes
   * that row and carries these slots into the booking flow.
   */
  pendingReasoning?: PendingReasoning | null;
  /**
   * A semantic-match suggestion awaiting "Yes"/"No": the customer asked for
   * "Ear Specialist", the sheet has "ENT Surgeon". "Yes" rewrites the slot with
   * the suggestion and the lookup runs again.
   */
  pendingMatch?: PendingMatch | null;
  /**
   * The booking the customer just completed.
   *
   * The slots are cleared when a flow completes (the flow is over), but the
   * customer keeps talking: "Which doctor did I book with?". Keeping the
   * completed booking here lets the harness answer those follow-up questions
   * instead of starting a new booking from scratch.
   */
  lastCompletedBooking?: LastCompletedBooking | null;
}

/** A booking the customer completed, remembered for a short while. */
export interface LastCompletedBooking {
  /** Every slot the flow had collected when it completed. */
  slots: Record<string, any>;
  /** The intent the booking belonged to. */
  intentId: string;
  /** Epoch milliseconds — the memory expires after BOOKING_MEMORY_TTL_MS. */
  completedAt: number;
}

/** A confirmation produced by the Chain-of-Thought reasoning step. */
export interface PendingReasoning {
  /** The question the customer was asked — re-asked verbatim when ambiguous. */
  question: string;
  /** Slots the reasoner extracted (mapped to the checklist's names on promotion). */
  slots: Record<string, any>;
  /** The Intents row the reasoning step targeted. */
  targetIntentId: string | null;
  /** Where this pending state came from. Only the conversational path sets it. */
  source: 'conversational';
  /** ISO timestamp of when the question was asked. */
  askedAt: string;
}

/** A "we have something like that" suggestion offered to the customer. */
export interface PendingMatch {
  /** The slot whose value did not match (e.g. `department`). */
  slotName: string;
  /** What the customer asked for ("Ear Specialist"). */
  requestedValue: string;
  /** The closest option the sheet actually has ("ENT Surgeon"). */
  suggestedValue: string;
  /** The question that was asked — re-asked verbatim when ambiguous. */
  question: string;
  /** Which lookup produced the empty result. */
  kind: 'search' | 'lookup';
  /** The structured search constraints (kind = `search`). */
  search?: Record<string, any>;
  /** The lookup filter (kind = `lookup`). */
  filter?: Record<string, any>;
  /** Where this pending state came from. */
  source: 'conversational';
  /** ISO timestamp of when the question was asked. */
  askedAt: string;
}

/** A fresh empty state — never reuse a shared object (slots must not leak across turns). */
function freshState(): SheetState {
  return {
    intentId: null,
    stepId: null,
    slots: {},
    pendingIntentId: null,
    awaitingVerification: false,
    pendingFallbackId: null,
    awaitingFallbackVerification: false,
    fallbackExtractedSlots: {},
    reasoningAttempts: 0,
  };
}

/** Read the persisted sheet state, tolerating any malformed shape. */
export function readSheetState(context: Record<string, any>, nodeId: string): SheetState {
  const raw = context?.ai?.[nodeId]?.sheet;
  if (!raw || typeof raw !== 'object') return freshState();
  const result: SheetState = {
    intentId: raw.intentId ?? null,
    stepId: raw.stepId ?? null,
    slots: raw.slots && typeof raw.slots === 'object' ? { ...raw.slots } : {},
    pendingIntentId: raw.pendingIntentId ?? null,
    awaitingVerification: raw.awaitingVerification === true,
    pendingFallbackId: raw.pendingFallbackId ?? null,
    awaitingFallbackVerification: raw.awaitingFallbackVerification === true,
    fallbackExtractedSlots:
      raw.fallbackExtractedSlots && typeof raw.fallbackExtractedSlots === 'object'
        ? { ...raw.fallbackExtractedSlots }
        : {},
    reasoningAttempts: typeof raw.reasoningAttempts === 'number' ? raw.reasoningAttempts : 0,
  };
  if (typeof raw.lastSearch === 'string') {
    result.lastSearch = raw.lastSearch;
  }
  return result;
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
  /**
   * Increment G — no intent matched the message and no flow is active. The
   * executor must NOT send `text`; it should answer conversationally with the
   * LLM (persona + instructions) instead of a "could not find an answer" reply.
   */
  conversational?: boolean;
  /**
   * The booking flow reached completion (all required slots filled). Signals the
   * executor to copy the collected slots into `leads` when capture-lead is on.
   */
  completed?: boolean;
  /** The final filled slots at completion (for lead capture). */
  completedSlots?: Record<string, any>;
  /**
   * No answer was found in `Intents` or `Doctors_Schedule` (never set for
   * validation rejections like `invalid_time`/`day_conflict`).
   */
  unanswered?: boolean;
  /**
   * Chain-of-Thought reasoning outcome for this turn, when the agent engine ran
   * the reasoning step. Trace-only: never sent to the customer.
   */
  reasoningDecision?: ReasoningTrace;
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
  // The arrow is optional: owners write both "→ Step_2" and "Step_2" (and the
  // odd "Step 2"). A missing arrow must never be read as "complete".
  const m = s.match(/Step[\s_]*(\d+)/i);
  if (m) return { kind: 'advance', stepId: `Step_${m[1]}` };
  return { kind: 'done' };
}

/**
 * Canonical key for slot/column matching: lowercase, every run of non-alphanumeric
 * characters collapsed to `_`. Lets `{doctor_name}` resolve a lookup result stored
 * under `Doctor Name` (and vice versa).
 */
export function normalizeSlotKey(name: string): string {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Read a row cell by header name, tolerating case differences in the header. */
export function readCell(row: Record<string, any>, column: string): any {
  if (!row || !column) return undefined;
  if (Object.prototype.hasOwnProperty.call(row, column)) return row[column];
  const lower = String(column).toLowerCase();
  const key = Object.keys(row).find((k) => k.toLowerCase() === lower);
  return key === undefined ? undefined : row[key];
}

/** The availability column header ("Available_Times") on a schedule row, if any. */
export function availabilityHeader(row: Record<string, any>): string | undefined {
  if (!row) return undefined;
  return Object.keys(row).find((k) => /available[\s_-]*times/i.test(k));
}

/**
 * The customer's requested time (minutes since midnight), read from the first
 * filled slot that looks like a time slot (`datetime`, `time`, …). `undefined`
 * when the flow never collected a time — the availability check is then skipped.
 */
function requestedTimeMinutes(slots: Record<string, any>): number | undefined {
  for (const [key, value] of Object.entries(slots ?? {})) {
    const n = normalizeSlotKey(key);
    if (n === 'datetime' || n === 'time' || n === 'appointment_time' || n === 'preferred_time') {
      const parsed = parseRequestedTime(value);
      if (parsed !== undefined) return parsed;
    }
  }
  return undefined;
}

/** "DR SURESH" stays as-is; a bare name gets a "Dr. " prefix. */
function doctorLabel(name: string): string {
  const n = String(name ?? '').trim();
  return /^dr\b/i.test(n) ? n : `Dr. ${n}`;
}

/** Case-insensitive whole-word/phrase containment in either direction. */
export function looseCellMatch(cell: any, wanted: any): boolean {
  const a = String(cell ?? '').trim().toLowerCase();
  const b = String(wanted ?? '').trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;

  const aWords = a.split(/[^a-z0-9]+/).filter(Boolean);
  const bWords = b.split(/[^a-z0-9]+/).filter(Boolean);

  // 1. whole-word containment ("ENT" ↔ "ENT SURGEON")
  if (aWords.some((w) => bWords.includes(w)) || bWords.some((w) => aWords.includes(w))) {
    return true;
  }

  // 2. word-prefix match ("gastro" → "gastroenterologist"), guarded so a short
  //    token like "ent" can't false-positive on the middle of "gastroenterologist".
  const prefixed = (longer: string, shorter: string) =>
    shorter.length >= 4 && longer.length >= shorter.length && longer.startsWith(shorter);
  if (aWords.some((aw) => bWords.some((bw) => prefixed(aw, bw) || prefixed(bw, aw)))) {
    return true;
  }

  // 3. shared root: "gastroenterology" ↔ "gastroenterologist" after stripping
  //    common medical suffixes ("-ology" / "-ologist" → "gastroenter").
  const stem = (word: string): string => {
    let s = word;
    for (const suffix of ['ologist', 'ology', 'ologic', 'ological', 'ist', 'ic', 'ical', 'surgery']) {
      if (s.endsWith(suffix) && s.length - suffix.length >= 4) {
        s = s.slice(0, -suffix.length);
        break;
      }
    }
    return s;
  };
  const aStems = aWords.map(stem);
  const bStems = bWords.map(stem);
  if (aStems.some((as) => as.length >= 5 && bStems.some((bs) => as === bs))) {
    return true;
  }

  // 4. specialty root: "urology" ↔ "urologist", "cardiology" ↔ "cardiologist".
  //    The stem step above skips short roots ("ur" is only 2 chars), so compare the
  //    bare specialty root directly.
  const specialtyRoot = (word: string): string | undefined => {
    const m = word.match(/^(.*?)(ologist|ology|ologic|ological)$/);
    return m && m[1].length >= 2 ? m[1] : undefined;
  };
  return aWords.some((aw) => {
    const ar = specialtyRoot(aw);
    return ar !== undefined && bWords.some((bw) => specialtyRoot(bw) === ar);
  });
}

/** Rows that look unavailable ("weekly off", "on vacation", "--") sort last. */
const UNAVAILABLE_RE = /\b(off|vacation|unavailable|not available|closed)\b/i;

export function rankLookupHits(rows: Record<string, any>[]): Record<string, any>[] {
  const available: Record<string, any>[] = [];
  const unavailable: Record<string, any>[] = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const text = Object.values(row ?? {})
      .map((value) => String(value ?? ''))
      .join(' ');
    (UNAVAILABLE_RE.test(text) ? unavailable : available).push(row);
  }
  return [...available, ...unavailable];
}

/**
 * Replace `{slot_name}` placeholders in an answer template with captured values.
 *
 * Resolution order: exact key → case-insensitive key → normalized key
 * (`Doctor Name` ≡ `doctor_name`). This is what lets a silent lookup store a
 * value under the sheet's `lookup_extract` column and still have `{doctor_name}`
 * substitute on the following step.
 *
 * `defaults` supplies fallback wording for a placeholder that was never filled
 * in (e.g. a doctor name when the schedule had no match). Without a default the
 * placeholder is left untouched, so the caller can strip it.
 */
export function substituteSlots(
  template: string,
  slots: Record<string, any>,
  defaults?: Record<string, string>
): string {
  const source = slots && typeof slots === 'object' ? slots : {};
  const normalized = new Map<string, any>();
  for (const [key, value] of Object.entries(source)) {
    const normalizedKey = normalizeSlotKey(key);
    if (normalizedKey && !normalized.has(normalizedKey)) normalized.set(normalizedKey, value);
  }

  const lookup = (name: string): any => {
    if (Object.prototype.hasOwnProperty.call(source, name)) return source[name];
    const lower = String(name).toLowerCase();
    const caseInsensitive = Object.keys(source).find((k) => k.toLowerCase() === lower);
    if (caseInsensitive !== undefined) return source[caseInsensitive];
    const normalizedKey = normalizeSlotKey(name);
    return normalizedKey ? normalized.get(normalizedKey) : undefined;
  };

  const fallbackFor = (name: string): string | undefined => {
    if (!defaults) return undefined;
    if (typeof defaults[name] === 'string' && defaults[name].trim()) return defaults[name];
    const normalizedKey = normalizeSlotKey(name);
    const hit = Object.keys(defaults).find((k) => normalizeSlotKey(k) === normalizedKey);
    const value = hit ? defaults[hit] : undefined;
    return typeof value === 'string' && value.trim() ? value : undefined;
  };

  return String(template ?? '').replace(/\{(\w+)\}/g, (match, name) => {
    const v = lookup(name);
    if (v !== undefined && v !== null && v !== '') return String(v);
    return fallbackFor(name) ?? match;
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

/**
 * The set of slot names referenced by `{slot}` placeholders in any step's
 * `lookup_filter`. A slot that feeds a lookup is validated as free text — the
 * schedule lookup, not a hardcoded `options` list, decides whether it is valid.
 */
export function collectLookupFedSlots(
  steps: Record<string, any>[],
  lookupFilterHeader: string
): Set<string> {
  const slots = new Set<string>();
  for (const step of Array.isArray(steps) ? steps : []) {
    const filter = String(step[lookupFilterHeader] ?? '');
    const matches = filter.match(/\{(\w+)\}/g);
    if (!matches) continue;
    for (const m of matches) slots.add(m.slice(1, -1));
  }
  return slots;
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
 *
 * Interruption mode (`context.interruption`) adds the owner's persona/instructions
 * (`context.systemPrompt`) as the assistant's identity and reframes the task as
 * "the customer went off-topic / asked a question / greeted you — answer them
 * naturally, then guide them back to the step" instead of a flat "that is not a
 * valid option".
 */
export interface ConversationalFallbackContext {
  /** The owner's system prompt (persona + instructions). Injected as the identity. */
  systemPrompt?: string;
  /** True when the customer interrupted (off-topic question, greeting, new request). */
  interruption?: boolean;
}

export async function generateConversationalFallback(
  client: LlmClient,
  slotName: string,
  userMessage: string,
  currentQuestion: string,
  _fallbackString: string,
  allowedOptions?: string[],
  context: ConversationalFallbackContext = {}
): Promise<string> {
  // The mock provider has no real model — its "reply" is an echo of the prompt,
  // which must never leak to the customer. Skip it so mock mode and unit tests
  // keep the static sheet fallback. Every real provider (Groq, DeepSeek, …) runs.
  if (client.id === 'mock') return '';

  const optionsLine = allowedOptions && allowedOptions.length > 0
    ? allowedOptions.join(', ')
    : 'Any text';
  const persona = (context.systemPrompt ?? '').trim();
  const interruption = context.interruption === true;

  const prompt = [
    persona || 'You are a helpful AI assistant.',
    '',
    `You are helping a customer complete a booking.`,
    `The step currently waiting for the customer is: "${currentQuestion}"`,
    `The valid options for the next reply are: ${optionsLine}`,
    `The customer replied: "${userMessage}"`,
    '',
    interruption
      ? `The customer's reply is off-topic or is not a valid answer for this step (for example a question, a greeting, or a new request). Do exactly this:`
      : `The customer's reply is NOT one of the valid options. Do exactly this:`,
    '1. Answer their question (or acknowledge them) naturally, in character.',
    '2. Then gently remind them of the current step and re-ask for the required information.',
    '3. Keep it brief, natural and conversational (1-3 sentences).',
    '4. Reply in the same language as the customer.',
    '',
    'Return ONLY the text you would say to the customer. Do not use JSON.',
  ].join('\n');

  try {
    const result = await client.complete({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      maxTokens: 220,
    });
    if (!result.ok) return '';
    return result.text.trim();
  } catch {
    return '';
  }
}

/**
 * A deterministic, no-LLM signal that the customer interrupted the flow with an
 * off-topic message instead of answering the current slot. Used to block text
 * slots from silently storing questions/greetings as values. Deliberately
 * conservative: it only fires on question marks, question openers, and greetings
 * so a real value (a name, a phone number, "Adliya") never trips it.
 */
export function isInterruption(message: string): boolean {
  const m = String(message ?? '').trim();
  if (!m) return false;
  const lower = m.toLowerCase();
  if (lower.includes('?')) return true;
  if (
    /^(what|whats|what's|when|where|who|whom|how|why|which|can you|could you|would you|do you|does it|does the|is it|is the|are you|did you|should i|may i|can i|is there|are there|tell me)\b/.test(lower)
  ) {
    return true;
  }
  if (/^(hi|hello|hey|yo|salam|salaam|good morning|good afternoon|good evening|assalamu|asalamu)\b/.test(lower)) {
    return true;
  }
  return false;
}

/**
 * The customer-facing message when a value fails the step's `validation` gate.
 *
 * Deterministic on purpose: the wording is part of the contract (the owner sees
 * exactly what the customer sees), and a format rejection is a form error, not
 * something to improvise. Falls back to the generic wording for a custom regex.
 */
export function formatRejectionText(validationType: string): string {
  switch (parseValidation(validationType)?.kind) {
    case 'phone':
      return "That doesn't look like a valid phone number. Could you please provide your phone number again?";
    case 'email':
      return "That doesn't look like a valid email address. Could you please provide your email address again?";
    case 'number':
      return "That doesn't look like a valid number. Could you please provide that number again?";
    case 'date':
      return "That doesn't look like a valid date. Could you please provide the date again?";
    default:
      return "That doesn't look like a valid answer. Could you please provide it again?";
  }
}

/** Is a slot already captured? (A blank slot name is never "filled".) */
function isSlotFilled(slots: Record<string, any>, name: string): boolean {
  return (
    name !== '' && slots[name] !== undefined && slots[name] !== null && slots[name] !== ''
  );
}

/**
 * Parse a step's `slot_name` cell into the slots it collects.
 *
 * One step may collect several values in a single answer ("name, phone, email,
 * cpr"): the cell is comma-separated, blanks/duplicates are dropped, and a
 * single name is just a one-element list (backward compatible).
 */
export function parseSlotNames(value: any): string[] {
  if (typeof value !== 'string') return [];
  const names: string[] = [];
  for (const part of value.split(',')) {
    const name = part.trim();
    if (!name) continue;
    if (names.some((n) => n.toLowerCase() === name.toLowerCase())) continue;
    names.push(name);
  }
  return names;
}

/** Display form of a slot name in customer-facing text ("cpr" → "CPR"). */
const SLOT_ACRONYMS = new Set(['cpr', 'id', 'dob', 'otp', 'ssn', 'nid', 'pin']);
function displaySlotName(name: string): string {
  const cleaned = String(name ?? '').trim().replace(/[_-]+/g, ' ');
  if (!cleaned) return '';
  return SLOT_ACRONYMS.has(cleaned.toLowerCase()) ? cleaned.toUpperCase() : cleaned.toLowerCase();
}

/**
 * The re-ask used when a multi-slot step did not receive every value it needs.
 *
 * The owner's `fallback` cell wins when set; otherwise the message names the
 * slots so the customer knows exactly what is missing.
 */
export function missingSlotsText(slotNames: string[], fallback?: string): string {
  const fb = String(fallback ?? '').trim();
  if (fb) return fb;
  const shown = (Array.isArray(slotNames) ? slotNames : []).map(displaySlotName).filter(Boolean);
  if (shown.length === 0) return 'Could you please provide those details again?';
  const list =
    shown.length === 1
      ? shown[0]
      : shown.length === 2
        ? `${shown[0]} and ${shown[1]}`
        : `${shown.slice(0, -1).join(', ')}, and ${shown[shown.length - 1]}`;
  return `I need your ${list} to complete the booking. Could you please provide them?`;
}

/**
 * Resolve the actual header for a canonical key, honoring the owner's mapping.
 */
export function headerFor(sheet: AiGoogleSheetsConfig, tab: string, key: string): string {
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
  client?: LlmClient,
  systemPrompt?: string
): Promise<SheetTurn> {
  const readRows = reader ?? defaultReadRows;
  const state = readSheetState(context, nodeId);
  const intentsTab = intentsTabName(sheet);
  const stepsTab = stepsTabName(sheet);

  const idHeader = headerFor(sheet, intentsTab, 'id');
  const keywordsHeader = headerFor(sheet, intentsTab, 'keywords');
  const startStepHeader = headerFor(sheet, intentsTab, 'start_step');
  const answerHeader = headerFor(sheet, intentsTab, 'answer');
  const typeHeader = headerFor(sheet, intentsTab, 'type');
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
  const validationHeader = headerFor(sheet, stepsTab, 'validation');

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
    steps: Record<string, any>[],
    startStep: Record<string, any> | undefined
  ): Promise<{ kind: 'ask'; text: string; rewindTo?: string } | { kind: 'done' }> => {
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
        let timeRejected: { doctor: string; times: string } | null = null;
        if (source) {
          const rows = await readRows(sheet, source);
          toolCalls.push({
            name: 'lookup_sheet',
            args: { tab: source, filter: filterRaw },
            rows: rows.length,
          });
          const clauses = parseLookupFilter(filterRaw);
          // Loose (whole-word / prefix / stem) matching: "department=ENT" must
          // find "ENT SURGEON", and "department=Gastroenterology" must find
          // "CONSULTANT GASTROENTEROLOGIST". Rows marked off/vacation sort last.
          let hits = rankLookupHits(
            rows.filter((row) => clauses.every((c) => looseCellMatch(readCell(row, c.column), c.value)))
          );

          // Availability check: if the customer gave a time, only keep rows whose
          // `Available_Times` cover it. Rows with no availability info pass.
          const time = requestedTimeMinutes(state.slots);
          if (time !== undefined && hits.length > 0) {
            const covered = hits.filter((row) => {
              const header = availabilityHeader(row);
              if (!header) return true;
              return isWithinWindow(time, parseTimeWindows(readCell(row, header)));
            });
            if (covered.length > 0) {
              hits = covered;
            } else {
              const doctor = String(readCell(hits[0], extractCol) ?? '').trim() || 'this doctor';
              const header = availabilityHeader(hits[0]);
              const times = header ? String(readCell(hits[0], header) ?? '').trim() : '';
              timeRejected = { doctor, times };
            }
          }

          if (!timeRejected && hits.length > 0) {
            matched = true;
            if (extractCol) {
              const value = readCell(hits[0], extractCol);
              if (value !== undefined && value !== null && value !== '') {
                // Store under the step's `slot_name`; when that is blank fall back
                // to the extracted column's normalized name so a later
                // `{doctor_name}` placeholder still resolves.
                const target = slotName || normalizeSlotKey(extractCol);
                if (target) state.slots[target] = value;
              }
            }
          }
        }

        if (timeRejected) {
          fallbackUsed = true;
          const text = timeRejected.times
            ? `${doctorLabel(timeRejected.doctor)} is available from ${timeRejected.times}. Would you like to choose a different time?`
            : `${doctorLabel(timeRejected.doctor)} is not available at that time. Would you like to choose a different time?`;
          // Re-ask the time: wind back to the step that collects `datetime` so
          // the next answer re-runs this lookup with the new time.
          const datetimeStep = steps.find((s) =>
            parseSlotNames(s[slotHeader]).some((n) => normalizeSlotKey(n) === 'datetime')
          );
          return {
            kind: 'ask',
            text,
            rewindTo: datetimeStep ? String(datetimeStep[stepIdHeader] ?? '').trim() : undefined,
          };
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

  // ── Interruption handling (Increment I) ────────────────────────────────────
  // The customer went off-topic (question / greeting / new request) or gave an
  // invalid answer. Answer them in character via the LLM (persona + instructions
  // via `systemPrompt`), then guide them back to the current step. Nothing is
  // stored and the flow stays on the same step, so the next valid answer resumes.
  const interruptionTurn = async (opts: {
    slotName: string;
    question: string;
    fallback: string;
    options?: string[];
    reason?: string;
  }): Promise<SheetTurn> => {
    fallbackUsed = true;
    let text = opts.fallback || opts.question;
    if (client) {
      const generated = await generateConversationalFallback(
        client,
        opts.slotName,
        userMessage.trim(),
        opts.question,
        opts.fallback,
        opts.options,
        { systemPrompt, interruption: true }
      );
      if (generated) text = generated;
    }
    return {
      text,
      sheet: state,
      toolCalls,
      slotExtractionAttempts,
      fallbackUsed,
      fallbackReason: opts.reason ?? 'interruption',
    };
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
      // Increment G — dual-mode brain. No intent matched and no flow is active:
      // hand the turn back to the executor so it can reply conversationally
      // (greeting / general question) instead of a static failure message.
      return {
        text: '',
        sheet: state,
        toolCalls,
        conversational: true,
      };
    }

    const intent = intents[0];
    state.intentId = String(intent[idHeader] ?? '').trim();
    const startStep = String(intent[startStepHeader] ?? '').trim();

    // ── Intent type gate ─────────────────────────────────────────────────────
    // Only `Booking` intents run the step sequence. Greeting / FAQ / any other
    // type returns the `answer` column immediately: no state machine, no LLM
    // round-trip. An empty type is treated as Booking (backward compatible).
    const intentType = String(readCell(intent, typeHeader) ?? '').trim();
    if (intentType && !/^booking$/i.test(intentType)) {
      const answer = substituteSlots(String(readCell(intent, answerHeader) ?? '').trim(), state.slots);
      if (answer) {
        return { text: answer, sheet: freshState(), toolCalls };
      }
      // Non-booking intent with no answer cell — let the executor answer from
      // the persona/instructions instead of sending an empty message.
      return { text: '', sheet: freshState(), toolCalls, conversational: true };
    }

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

    const isFilled = (name: string) => isSlotFilled(state.slots, name);

    // ── Turn-1 deterministic pre-fill (no LLM) ───────────────────────────────
    // Models are unreliable at single-word extraction, so code fills whatever it
    // can from the owner's own vocabulary first; the LLM only sees the rest.
    //  (a) list/buttons steps: the `options` cell is the vocabulary.
    for (const step of steps) {
      const input = normalizeInputType(step[expectedHeader]);
      if (input !== 'list' && input !== 'buttons') continue;
      const options = parseOptions(step[optionsHeader]);
      if (!options || options.length === 0) continue;
      const exact = options.find((o) => o.toLowerCase() === userMessage.trim().toLowerCase());
      const hit = exact ?? matchWholeWordOption(userMessage, options);
      if (!hit) continue;
      for (const name of parseSlotNames(step[slotHeader])) {
        if (!isFilled(name)) state.slots[name] = hit;
      }
    }

    //  (b) lookup-filter slots that no step declares (e.g. `{department}` in
    //      "the {department} doctor"): use the lookup source's own column values
    //      as the vocabulary ("ENT" inside "ENT SURGEON").
    const declaredSlots = new Set(steps.flatMap((s) => parseSlotNames(s[slotHeader])));
    for (const step of steps) {
      if (String(step[stepTypeHeader] ?? '').trim().toLowerCase() !== 'lookup') continue;
      const source = String(step[lookupSourceHeader] ?? '').trim();
      const filter = String(step[lookupFilterHeader] ?? '').trim();
      if (!source || !filter) continue;

      const pending = parseLookupFilter(filter).filter((clause) => {
        const m = clause.value.match(/^\{(\w+)\}$/);
        return Boolean(m) && !declaredSlots.has(m![1]) && !isFilled(m![1]);
      });
      if (pending.length === 0) continue;

      const rows = await readRows(sheet, source);
      toolCalls.push({ name: 'lookup_sheet', args: { tab: source, filter: 'prefill' }, rows: rows.length });

      for (const clause of pending) {
        const slot = clause.value.slice(1, -1);
        const vocabulary = new Set<string>();
        for (const row of rows) {
          const cell = String(readCell(row, clause.column) ?? '').trim();
          if (!cell) continue;
          vocabulary.add(cell);
          for (const word of cell.split(/[^A-Za-z0-9&]+/)) {
            if (word.length >= 3) vocabulary.add(word);
          }
        }
        // Longest first so a full "ENT SURGEON" wins over the bare word "ENT".
        const candidates = Array.from(vocabulary).sort((a, b) => b.length - a.length);
        const hit = matchWholeWordOption(userMessage, candidates);
        if (hit && !isFilled(slot)) state.slots[slot] = hit;
      }
    }

    // ── Task 5b: LLM extraction for whatever code could not pre-fill ────────
    // The LLM returns raw strings only. validateSlotValue decides what is kept,
    // so an out-of-list value is dropped (never stored) instead of trusted.
    // A slot that feeds a `lookup_filter` is treated as free text: the schedule
    // lookup — not a hardcoded `options` list — decides whether it is valid.
    const lookupFedSlots = collectLookupFedSlots(steps, lookupFilterHeader);
    const slotMeta = new Map<
      string,
      { type: string; options?: string[]; lookupFed?: boolean; validation?: string }
    >();
    for (const step of steps) {
      for (const name of parseSlotNames(step[slotHeader])) {
        if (slotMeta.has(name)) continue;
        const isLookupFed = lookupFedSlots.has(name);
        slotMeta.set(name, {
          type: isLookupFed ? 'text' : String(step[expectedHeader] ?? 'text').trim(),
          // Options stay attached even for lookup-fed slots: they are an
          // extraction hint and a canonicalisation source, never a validity gate.
          options: parseOptions(step[optionsHeader]),
          lookupFed: isLookupFed,
          validation: String(step[validationHeader] ?? '').trim() || undefined,
        });
      }
    }
    // Safety net: placeholders used in a question/filter but declared by no step
    // (e.g. `{department}`) — let the model try when code could not fill them.
    const placeholders = new Set<string>();
    for (const step of steps) {
      for (const text of [step[questionHeader], step[lookupFilterHeader], step[fallbackHeader]]) {
        for (const m of String(text ?? '').match(/\{(\w+)\}/g) ?? []) placeholders.add(m.slice(1, -1));
      }
    }
    for (const name of Array.from(placeholders)) {
      if (!slotMeta.has(name)) slotMeta.set(name, { type: 'text' });
    }

    const fields = Array.from(slotMeta, ([name, meta]) => ({
      name,
      type: meta.type,
      options: meta.options,
    })).filter((field) => !isFilled(field.name));

    let extracted: SlotExtractionResult | null = null;
    const rejectedSlots: RejectedSlot[] = [];
    if (client && fields.length > 0) {
      const result = await llmJson<SlotExtractionResult>(
        client,
        buildSlotExtractionPrompt(fields, userMessage),
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
        if (isFilled(name)) continue; // never overwrite a deterministic pre-fill
        const validation = validateSlotValue(raw, meta.type, meta.options, meta.validation);
        if (validation.valid) {
          accepted[name] = meta.lookupFed
            ? canonicalizeOption(validation.value, meta.options)
            : validation.value;
        } else rejectedSlots.push({ slot: name, value: String(raw ?? ''), reason: validation.reason ?? 'rejected' });
      }
      Object.assign(state.slots, accepted);
      extracted = { slots: accepted, confidence: extracted.confidence };
    }

    // The first step that still needs a value is where we start. A step with
    // several slots is only "done" when every one of them is filled.
    const stepNames = (step: Record<string, any>) => parseSlotNames(step[slotHeader]);
    const stepFilled = (step: Record<string, any>) => {
      const names = stepNames(step);
      return names.length > 0 && names.every((name) => isFilled(name));
    };
    const firstUnfilled = steps.find((s) => !stepFilled(s));
    const skippedSteps = steps
      .filter((s) => stepFilled(s))
      .map((s) => String(s[stepIdHeader] ?? '').trim());

    if (!firstUnfilled) {
      // Every slot is already filled → complete immediately.
      const result = await complete(readRows, sheet, intentsTab, state, toolCalls, idHeader, answerHeader);
      result.slotExtractionAttempts = slotExtractionAttempts;
      result.fallbackUsed = fallbackUsed;
      if (extracted) {
        result.extractedSlots = extracted.slots;
        result.extractionConfidence = extracted.confidence;
      }
      if (skippedSteps.length > 0) result.skippedSteps = skippedSteps;
      if (rejectedSlots.length > 0) result.rejectedSlots = rejectedSlots;
      return result;
    }

    state.stepId = String(firstUnfilled[stepIdHeader] ?? '').trim();
    const resolved = await resolveNextAsk(steps, findStep(steps, stepIdHeader, state.stepId) ?? firstUnfilled);
    if (resolved.kind === 'done') {      const result = await complete(readRows, sheet, intentsTab, state, toolCalls, idHeader, answerHeader);
      result.slotExtractionAttempts = slotExtractionAttempts;
      result.fallbackUsed = fallbackUsed;
      if (extracted) {
        result.extractedSlots = extracted.slots;
        result.extractionConfidence = extracted.confidence;
      }
      if (skippedSteps.length > 0) result.skippedSteps = skippedSteps;
      if (rejectedSlots.length > 0) result.rejectedSlots = rejectedSlots;
      return result;
    }
    if (resolved.kind === 'ask' && resolved.rewindTo) {
      state.stepId = resolved.rewindTo;
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
          }
        : {}),
      ...(skippedSteps.length > 0 ? { skippedSteps } : {}),
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
  // A slot that feeds a `lookup_filter` is free text: the schedule lookup decides.
  const slotNames = parseSlotNames(current[slotHeader]);

  // ── Multi-slot step: one answer must supply several values ────────────────
  // `slot_name` = "name, phone, email, cpr": the step is complete only when ALL
  // of them are captured. "yes" extracts nothing, so the flow re-asks instead of
  // booking with a meaningless value.
  if (slotNames.length > 1) {
    const question = substituteSlots(String(current[questionHeader] ?? '').trim(), state.slots);
    const fallback = String(current[fallbackHeader] ?? '').trim();

    // A question/greeting must not be stored as the customer's name/phone/etc.
    if (isInterruption(userMessage)) {
      return await interruptionTurn({
        slotName: slotNames.join(', '),
        question,
        fallback,
        reason: 'interruption',
      });
    }

    const missing = slotNames.filter((name) => !isSlotFilled(state.slots, name));
    const values: Record<string, string> = {};

    if (missing.length > 0) {
      const fields = missing.map((name) => ({ name, type: 'text' }));
      let raw: Record<string, any> = {};

      if (client) {
        const result = await llmJson<SlotExtractionResult>(
          client,
          buildSlotExtractionPrompt(fields, userMessage),
          validateSlotExtraction,
          { maxRetries: 1 }
        );
        slotExtractionAttempts += result.attempts;
        if (result.ok) raw = result.value.slots ?? {};
      } else {
        // No model available (tests/sandbox): a comma-separated answer maps to
        // the declared slots in order. Anything else leaves the slots empty.
        const parts = userMessage
          .split(/[,;\n]+/)
          .map((part) => part.trim())
          .filter(Boolean);
        if (parts.length === missing.length) {
          missing.forEach((name, i) => {
            raw[name] = parts[i];
          });
        } else if (parts.length === slotNames.length) {
          slotNames.forEach((name, i) => {
            raw[name] = parts[i];
          });
        }
      }

      for (const name of missing) {
        // Every field of a multi-slot answer is free text; the step's own
        // `validation` cell applies to single-slot steps only.
        const validation = validateSlotValue(raw[name], 'text');
        if (validation.valid) values[name] = validation.value;
      }
    }

    const stillMissing = slotNames.filter(
      (name) => !isSlotFilled(state.slots, name) && values[name] === undefined
    );

    if (stillMissing.length > 0) {
      fallbackUsed = true;
      return {
        text: missingSlotsText(slotNames, String(current[fallbackHeader] ?? '')),
        sheet: state,
        toolCalls,
        slotExtractionAttempts,
        fallbackUsed,
        fallbackReason: `missing: ${stillMissing.join(', ')}`,
      };
    }

    Object.assign(state.slots, values);
  } else if (slotNames.length === 1) {
    const slotName = slotNames[0];
    const lookupFedSlots = collectLookupFedSlots(steps, lookupFilterHeader);
    const isLookupFed = lookupFedSlots.has(slotName);
    const expectedInput = isLookupFed ? 'text' : String(current[expectedHeader] ?? 'text').trim();
    const options = parseOptions(current[optionsHeader]);
    // Owner-declared format gate (`validation` column). Undefined = no gate.
    const validationRule = String(current[validationHeader] ?? '').trim();
    const formatSpec = parseValidation(validationRule);

    let candidate = userMessage.trim();
    let fallbackReason: string | undefined;

    // A format-gated slot stores exactly what the customer typed: the extractor
    // must not "helpfully" reduce "Ali, 39001234, ali@x.com, CPR 1" to the phone
    // number alone (the booking team needs every detail), and a format answer
    // needs no model at all.
    if (client && !formatSpec) {
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

    const question = substituteSlots(String(current[questionHeader] ?? '').trim(), state.slots);
    const fallback = String(current[fallbackHeader] ?? '').trim();

    const validation = fallbackReason
      ? null
      : validateSlotValue(candidate, expectedInput, options, validationRule);

    // Increment I — an off-topic question / greeting must not be stored as the
    // slot's value (a text slot would otherwise swallow "what time is it?" as a
    // name). Answer it in character, then guide the customer back to the step.
    if (isInterruption(userMessage) && !fallbackReason) {
      return await interruptionTurn({ slotName, question, fallback, options, reason: 'interruption' });
    }

    if (!validation?.valid) {
      // Rejected by code (or extraction failed) → fallback, re-ask, don't advance.
      fallbackUsed = true;
      const reason = validation?.reason ?? fallbackReason ?? 'no value extracted';

      // A format rejection ("yes" in a phone slot) is a form error: answer with
      // the fixed wording instead of asking a model to improvise.
      if (formatSpec && reason === `Invalid format for ${formatSpec.raw}`) {
        return {
          text: formatRejectionText(validationRule),
          sheet: state,
          toolCalls,
          slotExtractionAttempts,
          fallbackUsed,
          fallbackReason: reason,
        };
      }

      // Interruption / invalid answer → persona-aware conversational fallback.
      return await interruptionTurn({ slotName, question, fallback, options, reason });
    }

    state.slots[slotName] = isLookupFed
      ? canonicalizeOption(validation.value, options)
      : validation.value;
  }

  const transition = parseNextStepLogic(current[nextHeader]);
  const nextStep = transition.kind === 'done' ? undefined : findStep(steps, stepIdHeader, transition.stepId);
  const resolved = await resolveNextAsk(steps, nextStep);
  if (resolved.kind === 'done') {
    const result = await complete(readRows, sheet, intentsTab, state, toolCalls, idHeader, answerHeader);
    result.slotExtractionAttempts = slotExtractionAttempts;
    result.fallbackUsed = fallbackUsed;
    return result;
  }
  if (resolved.rewindTo) {
    state.stepId = resolved.rewindTo;
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
