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
 * The model never owns business rules: `validateSlotValue`, `strictCellMatch`,
 * `filterRowsStructured`, `substituteSlots` and the bounded loop are all code.
 */

import { lookupSheetRows } from './googleSheetsExecutor';
import { AI_SHEET_TAB_SCHEMA } from '@shared/ai-defaults';
import { llmJson } from '../ai/prompt';
import type { AiGoogleSheetsConfig, LlmClient, ReasoningTrace } from '../ai/types';
import {
  availabilityHeader,
  headerFor,
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
import { canonicalizeOption, matchWholeWordOption, normalizeInputType, parseOptions, validateSlotValue } from './slotValidation';
import { isWithinWindow, parseRequestedTime, parseTimeWindows } from './timeRange';

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
  /** `ask` to collect a slot, `complete` to book, `search_schedule` for a search. */
  action: 'ask' | 'complete' | 'search_schedule';
  next_question: string;
  /** Structured constraints for action "search_schedule" (the code filters on these). */
  search?: ScheduleSearch;
  tool_call?: 'lookup_schedule';
  /** Filter for `lookup_schedule` (location = branch). */
  lookup?: { doctor?: string; department?: string; location?: string };
}

/**
 * Structured search constraints. Every field is optional; the code applies them
 * with AND semantics. There is deliberately no free-text `query` field — if the
 * model cannot produce a structured constraint it must ask the customer instead
 * of guessing.
 */
export interface ScheduleSearch {
  /** Specialty / category — matches the Department (or equivalent) column. */
  category?: string;
  /** Branch / location — matches the Branch (or equivalent) column. */
  location?: string;
  /** Entity name — matches the Doctor/Property (or equivalent) column. */
  name?: string;
  /** Weekday or relative day ("Tuesday", "tomorrow") — checked against Day-Off. */
  day?: string;
}

/** Column mapping of the schedule tab, derived from a `lookup` step + schema. */
export interface ScheduleMap {
  source: string;
  /** Entity column (Doctor / Property / …). */
  doctorColumn: string;
  /** Category column (Department / Type / …). */
  departmentColumn: string;
  /** Location column (Branch / Location / …). */
  branchColumn: string;
  /** Weekday(s) the entity does NOT work (blank = works every day). */
  dayOffColumn?: string;
  /** Start of the availability window (e.g. 13:00). */
  timeStartColumn?: string;
  /** End of the availability window (e.g. 17:00). */
  timeEndColumn?: string;
  /** Consultation fee / price column, rendered verbatim. */
  feesColumn?: string;
}

/**
 * Slot names that are flow-control artifacts of the old linear sheet, not
 * customer data. `confirm` is deliberately NOT here — it is the owner's
 * verification step and must be asked as a required slot. `retry`, `completed`
 * and `anything_else` remain terminal/branching steps (the checklist model does
 * not evaluate `alternate_step`/`next_step_logic`, so linearising `retry` would
 * ask "sorry, no doctor at that location" even on a successful booking).
 */
const FLOW_CONTROL_SLOTS = new Set(['retry', 'completed', 'anything_else', 'done']);

/** The strict JSON the Chain-of-Thought reasoning step returns. */
export interface ReasoningDecision {
  /** Chain-of-thought explanation of why this action was chosen. */
  reasoning: string;
  /** The action to take. */
  action: 'verify_booking' | 'capture_lead' | 'answer_faq' | 'ask_clarification';
  /**
   * The Intents row this action targets. Required for `verify_booking` and
   * `answer_faq`; sheet ids are strings, but models emit numbers too.
   */
  target_intent_id?: string | null;
  /** Slots extracted from the user message. */
  slots: Record<string, string>;
  /** Verification question to ask the customer (only for verify_booking). */
  verification_question?: string;
}

/** One row of the intent catalogue handed to the reasoner. */
export interface ReasoningIntent {
  id: string;
  type: string;
  keywords: string;
  answer?: string;
  verificationQuestion?: string;
}

/** Maximum number of reasoning turns without progress before escalating to handover. */
const MAX_REASONING_ATTEMPTS = 3;

/** Version tag for the reasoning prompt contract — surfaced in every trace. */
export const REASONING_PROMPT_VERSION = 'reasoning-v2';

/** Cap on the raw model output kept in the trace (cost + PII bound). */
const RAW_TEXT_LIMIT = 2000;

/** Cap on the chain-of-thought kept in the trace. The prompt asks for 2 sentences. */
const REASONING_TEXT_LIMIT = 240;

/** Bound on how many intents reach the prompt. */
const MAX_CATALOGUE_INTENTS = 20;

/** Keywords are clipped so one long row cannot bloat the prompt. */
const MAX_KEYWORDS_CHARS = 80;

/**
 * One reasoning step's outcome. `ok: false` means the step could not produce a
 * usable decision — the caller must NOT read that as `ask_clarification`.
 */
export type ReasoningResult =
  | { ok: true; decision: ReasoningDecision; trace: ReasoningTrace }
  | { ok: false; trace: ReasoningTrace };

function clip(text: string, limit: number): string {
  const trimmed = (text ?? '').trim();
  return trimmed.length > limit ? `${trimmed.slice(0, limit)}…` : trimmed;
}

/** Flatten a decision into the trace fields. */
function reasoningTraceFields(decision: ReasoningDecision) {
  const target = decision.target_intent_id;
  return {
    action: decision.action,
    targetIntentId: target === null || target === undefined || target === '' ? null : String(target),
    slots: decision.slots ?? {},
    ...(decision.verification_question ? { verificationQuestion: decision.verification_question } : {}),
    reasoning: clip(decision.reasoning, REASONING_TEXT_LIMIT),
  };
}

function truncateRawText(text: string | undefined): string | undefined {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return undefined;
  return trimmed.length > RAW_TEXT_LIMIT ? `${trimmed.slice(0, RAW_TEXT_LIMIT)}…` : trimmed;
}

/** Render the catalogue shown to the model, bounded so a large sheet is safe. */
function buildIntentCatalogue(intents: ReasoningIntent[]): { text: string; ids: string[] } {
  const rows = intents.filter((i) => i.id !== '').slice(0, MAX_CATALOGUE_INTENTS);
  if (rows.length === 0) return { text: 'None defined.', ids: [] };
  const text = rows
    .map((i) => {
      const type = i.type || 'Unknown';
      const keywords = clip(i.keywords, MAX_KEYWORDS_CHARS) || 'none';
      const answer = i.answer ? ` | answer: ${clip(i.answer, 160)}` : '';
      return `- id: ${i.id}, type: ${type}, keywords: ${keywords}${answer}`;
    })
    .join('\n');
  return { text, ids: rows.map((i) => i.id) };
}

/**
 * Chain-of-Thought reasoning step. Called when no intent keyword matches the
 * user's message. The LLM reasons about the customer's intent based on the
 * owner's objectives and the intent catalogue, then picks exactly one action.
 *
 * The persona/instructions arrive as a system message and the task as the user
 * message, so the reasoner reasons *as* the business, not as a generic router.
 */
export async function reasoningStep(
  client: LlmClient | undefined,
  systemPrompt: string,
  objectives: string[],
  userMessage: string,
  slots: Record<string, any>,
  options: { intents?: ReasoningIntent[] } = {}
): Promise<ReasoningResult> {
  const startedAt = Date.now();
  const catalogue = buildIntentCatalogue(options.intents ?? []);
  const hadIntentCatalogue = catalogue.ids.length > 0;

  if (!client) {
    return {
      ok: false,
      trace: {
        promptVersion: REASONING_PROMPT_VERSION,
        promptChars: 0,
        hadIntentCatalogue,
        action: 'none',
        targetIntentId: null,
        slots: {},
        reasoning: 'No LLM client available; cannot reason.',
        ok: false,
        errorKind: 'no_client',
        attempts: 0,
        httpAttempts: 0,
        tokensIn: 0,
        tokensOut: 0,
        elapsedMs: Date.now() - startedAt,
      },
    };
  }

  const objectivesText = objectives.length > 0 ? objectives.map((o, i) => `${i + 1}. ${o}`).join('\n') : 'None defined.';

  const prompt = `You are the intent router for this business. Decide what the customer wants, then pick exactly one action. You are not writing the customer's reply — the workflow engine will do that.

YOUR OBJECTIVES, in priority order:
${objectivesText}

AVAILABLE WORKFLOW INTENTS (choose target_intent_id from this list only):
${catalogue.text}

The customer said: "${userMessage}"
Slots already collected: ${JSON.stringify(slots)}

ACTIONS — pick exactly one:

1. "verify_booking"
   The customer wants to book, reschedule or cancel an appointment, OR their message names any service, test, department, package, doctor or date/time this business provides — even as a bare noun with no verb. "blood test", "dental", "tomorrow", "Dr Ahmed", "how much is a checkup" all belong here.
   A bare service, test, department, doctor, or date means the user wants to book that service. Always choose "verify_booking" in this case.
   target_intent_id: the Booking intent's id from the list above. Required.
   slots: every value you can extract. If the user mentions a service, test or treatment, map it to the "department" slot. If they mention a branch, map it to the "location" slot. Use "doctor_name" for a named doctor.
   verification_question: required. One sentence that names what you understood and offers to proceed. Do not invent prices, times or doctor names.

2. "capture_lead"
   The customer gave (or offered to give) contact details, or asked to be contacted later.
   slots: name, phone, email where present.

3. "answer_faq"
   The message matches an intent of type FAQ above.
   target_intent_id: that FAQ intent's id from the list above. Required.
   verification_question: omit.

4. "ask_clarification"
   ONLY when no intent in the list is a plausible target and the message cannot be mapped to an objective. This is the last resort, not the default.

RULES:
- If you are torn between "verify_booking" and "ask_clarification", choose "verify_booking".
- Never invent a price, a doctor, a time slot or a policy.
- "reasoning" must be at most 2 sentences (240 characters). Do not repeat the message.

Return ONLY this JSON object, no prose and no code fences:
{
  "reasoning": "<max 2 sentences>",
  "action": "verify_booking" | "capture_lead" | "answer_faq" | "ask_clarification",
  "target_intent_id": "<id from the list above, or null>",
  "slots": { "slotName": "value" },
  "verification_question": "<required for verify_booking>"
}`;

  const base = {
    promptVersion: REASONING_PROMPT_VERSION,
    promptChars: prompt.length + (systemPrompt ?? '').trim().length,
    hadIntentCatalogue,
  };

  // Meter this call only. `llmJson` discards usage and the executor drops
  // `extractionUsage` on the conversational path, so without this the cost of
  // the reasoning step is invisible in every trace.
  let tokensIn = 0;
  let tokensOut = 0;
  let httpAttempts = 0;
  let rawText = '';
  const metered: LlmClient = {
    id: client.id,
    defaultModel: client.defaultModel,
    complete: async (request) => {
      const res = await client.complete(request);
      tokensIn += res.usage.promptTokens;
      tokensOut += res.usage.completionTokens;
      httpAttempts += res.attempts;
      if (res.text) rawText = res.text;
      return res;
    },
  };

  const validIds = catalogue.ids;
  const round = await llmJson<ReasoningDecision>(
    metered,
    prompt,
    (obj: any): { ok: true; value: ReasoningDecision } | { ok: false; reason: string } => {
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        return { ok: false, reason: 'not an object' };
      }
      const action = obj.action;
      if (
        action !== 'verify_booking' &&
        action !== 'capture_lead' &&
        action !== 'answer_faq' &&
        action !== 'ask_clarification'
      ) {
        return { ok: false, reason: 'action must be verify_booking|capture_lead|answer_faq|ask_clarification' };
      }
      if (typeof obj.reasoning !== 'string' || obj.reasoning.trim().length === 0) {
        return { ok: false, reason: 'reasoning must be a non-empty string' };
      }
      if (typeof obj.slots !== 'object' || obj.slots === null || Array.isArray(obj.slots)) {
        return { ok: false, reason: 'slots must be an object' };
      }
      const vq = obj.verification_question;
      if (action === 'verify_booking' && (typeof vq !== 'string' || vq.trim().length === 0)) {
        return { ok: false, reason: 'verification_question required for verify_booking' };
      }

      // Sheet ids are strings; models emit `1` as often as `"1"`.
      const rawTarget = obj.target_intent_id;
      const target =
        rawTarget === null || rawTarget === undefined || rawTarget === ''
          ? ''
          : String(rawTarget).trim();

      if (action === 'verify_booking' || action === 'answer_faq') {
        if (!target) {
          return { ok: false, reason: `target_intent_id required for ${action}` };
        }
        if (validIds.length > 0 && !validIds.includes(target)) {
          return {
            ok: false,
            reason: `unknown target_intent_id "${target}"; valid ids: ${validIds.join(', ')}`,
          };
        }
      }

      return {
        ok: true,
        value: {
          ...obj,
          // Only the actions that target an intent keep one.
          target_intent_id:
            action === 'verify_booking' || action === 'answer_faq' ? target : null,
        } as ReasoningDecision,
      };
    },
    { maxRetries: 1, maxTokens: 1500, temperature: 0, systemPrompt }
  );

  if (!round.ok) {
    // Do NOT fabricate a decision here. A truncated or unparseable output is an
    // infrastructure/output failure, not a semantic "ask_clarification".
    const raw = truncateRawText(rawText);
    return {
      ok: false,
      trace: {
        ...base,
        action: 'none',
        targetIntentId: null,
        slots: {},
        reasoning: clip(`Reasoning failed: ${round.error}`, REASONING_TEXT_LIMIT),
        ok: false,
        errorKind: round.errorKind,
        error: round.error,
        ...(raw ? { rawText: raw } : {}),
        attempts: round.attempts,
        httpAttempts,
        tokensIn,
        tokensOut,
        elapsedMs: Date.now() - startedAt,
      },
    };
  }

  const raw = truncateRawText(rawText);
  return {
    ok: true,
    decision: round.value,
    trace: {
      ...base,
      ...reasoningTraceFields(round.value),
      ok: true,
      ...(raw ? { rawText: raw } : {}),
      attempts: round.attempts,
      httpAttempts,
      tokensIn,
      tokensOut,
      elapsedMs: Date.now() - startedAt,
    },
  };
}

// ── State ───────────────────────────────────────────────────────────────────

function freshHarnessState(): SheetState {
  return { intentId: null, stepId: null, slots: {}, pendingIntentId: null, awaitingVerification: false, pendingFallbackId: null, awaitingFallbackVerification: false, fallbackExtractedSlots: {}, reasoningAttempts: 0, pendingReasoning: null, pendingMatch: null };
}

function isFilled(slots: Record<string, any>, name: string): boolean {
  const v = slots[name];
  return v !== undefined && v !== null && String(v).trim() !== '';
}

/**
 * The reasoner/extractor speaks a different vocabulary than the sheet: it
 * extracts `service`, while `Workflow_Steps` asks for `department`. Each alias
 * lists the checklist slots it may fill, most specific first. Applied only when
 * the target slot exists, so a sheet that really asks for `service` keeps it.
 */
const SLOT_ALIASES: Record<string, string[]> = {
  service: ['department', 'service', 'specialty', 'treatment'],
  test: ['department', 'service'],
  specialty: ['department'],
  treatment: ['department'],
  procedure: ['department'],
  branch: ['location', 'branch'],
  clinic: ['location'],
  area: ['location'],
  doctor: ['doctor_name', 'doctor'],
  date: ['date', 'datetime'],
  time: ['time', 'datetime'],
};

/**
 * Map extracted slot names onto the checklist's own names.
 *
 * The reasoning step extracts what the customer said (`service: "blood test"`)
 * while the booking flow collects what the sheet declares (`department`).
 * Without this, a confirmed "blood test" is invisible to the checklist and the
 * customer is asked for the department again. Never overwrites a filled slot.
 */
export function mapSlotsToChecklist(
  extracted: Record<string, any> | null | undefined,
  checklist: HarnessChecklist,
  existing: Record<string, any> = {}
): Record<string, any> {
  const out: Record<string, any> = { ...(extracted ?? {}) };

  // normalized name → the checklist's actual spelling
  const actual = new Map<string, string>();
  for (const name of [...checklist.required.map((s) => s.name), ...checklist.derived]) {
    actual.set(normalizeSlotKey(name), name);
  }
  const filled = (key: string) => {
    const name = actual.get(key) ?? key;
    return isFilled(existing, name) || isFilled(out, name);
  };

  for (const [rawName, value] of Object.entries(extracted ?? {})) {
    if (value === undefined || value === null || String(value).trim() === '') continue;
    const key = normalizeSlotKey(rawName);
    if (actual.has(key)) continue; // already a checklist slot
    const target = (SLOT_ALIASES[key] ?? []).find((candidate) => actual.has(candidate) && !filled(candidate));
    if (target) out[actual.get(target)!] = value;
  }

  return out;
}

function intentsTabName(sheet: AiGoogleSheetsConfig): string {
  return sheet.tabs.find((t) => /^intents?$/i.test(t)) ?? sheet.tabs[0];
}

function stepsTabName(sheet: AiGoogleSheetsConfig): string {
  return sheet.tabs.find((t) => /step/i.test(t)) ?? sheet.tabs[1] ?? sheet.tabs[0];
}

function tokenize(s: string): string[] {
  return String(s ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
}

function commonPrefixLen(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/**
 * Lenient intent-keyword match. The strict `lookupSheetRows` substring match
 * misses simple inflections: "doctors" does not contain the keyword "doctor"
 * the way it expects. This matches exact tokens, ±s plurals, and a shared prefix
 * of ≥4 chars ("dentist" ↔ "dental"), so a knowledge query like "who are the
 * doctors at adliya?" still routes into the booking intent.
 */
export function matchesIntentKeywords(keywords: string, message: string): boolean {
  const kw = tokenize(keywords);
  const msg = tokenize(message);
  for (const m of msg) {
    for (const k of kw) {
      if (m === k) return true;
      if (m.length >= 4 && (m === `${k}s` || k === `${m}s`)) return true;
      if (m.length >= 4 && k.length >= 4 && commonPrefixLen(m, k) >= 4) return true;
    }
  }
  return false;
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

/** Normalize a header for case/space/underscore-insensitive matching. */
function normalizeHeader(value: any): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * Resolve the canonical schedule columns for a tab, in priority order:
 *   1. the declared schema (`AI_SHEET_TAB_SCHEMA`),
 *   2. the owner's column mapping (`sheet.columns[tab]`),
 *   3. the actual headers detected in the sheet (`sheet.detected[tab]`).
 * This is the `ScheduleSchema`: the code knows which column is the entity, the
 * category, the location, the day off, and the time window — no guessing.
 */
function schemaColumnsFor(
  tab: string,
  sheet?: AiGoogleSheetsConfig
): Record<string, string> {
  const out: Record<string, string> = {};
  const schema = AI_SHEET_TAB_SCHEMA.find((t) => t.tab === tab);
  if (schema) {
    for (const col of schema.columns) out[col.key] = col.column;
  }

  const overrides = sheet?.columns?.[tab];
  if (overrides && typeof overrides === 'object') {
    for (const [key, value] of Object.entries(overrides)) {
      if (typeof value === 'string' && value.trim()) out[key] = value.trim();
    }
  }

  const detected = sheet?.detected?.[tab];
  if (Array.isArray(detected) && detected.length > 0) {
    const byNormalized = new Map<string, string>();
    for (const header of detected) {
      const normalized = normalizeHeader(header);
      if (normalized && !byNormalized.has(normalized)) byNormalized.set(normalized, String(header).trim());
    }
    for (const [key, column] of Object.entries(out)) {
      const hit =
        byNormalized.get(normalizeHeader(key)) ?? byNormalized.get(normalizeHeader(column));
      if (hit) out[key] = hit;
    }
  }

  return out;
}

/**
 * Derive the schedule column mapping from the intent's `lookup` step(s) plus the
 * declared schema. The lookup step's `lookup_extract` / `lookup_filter` still win
 * for the entity/category/location columns (owner intent), while the schema fills
 * in the day-off, start/end time and fee columns.
 */
export function deriveScheduleMap(
  steps: Record<string, any>[],
  headers: {
    stepType: string;
    source: string;
    filter: string;
    extract: string;
  },
  sheet?: AiGoogleSheetsConfig
): ScheduleMap | undefined {
  for (const step of Array.isArray(steps) ? steps : []) {
    if (String(step[headers.stepType] ?? '').trim().toLowerCase() !== 'lookup') continue;
    const source = String(step[headers.source] ?? '').trim();
    const extract = String(step[headers.extract] ?? '').trim();
    if (!source || !extract) continue;

    const cols = schemaColumnsFor(source, sheet);
    let departmentColumn = cols.department ?? 'department';
    let branchColumn = cols.branch ?? 'branch';
    for (const clause of parseLookupFilter(String(step[headers.filter] ?? ''))) {
      // Generic aliases: the category slot may be called department/specialty/
      // type/category, and the location slot branch/location.
      if (['{department}', '{specialty}', '{type}', '{category}'].includes(clause.value)) {
        departmentColumn = clause.column;
      } else if (['{location}', '{branch}'].includes(clause.value)) {
        branchColumn = clause.column;
      }
    }

    const map: ScheduleMap = {
      source,
      doctorColumn: extract || cols.doctor || 'Doctor',
      departmentColumn,
      branchColumn,
    };
    if (cols.day_off) map.dayOffColumn = cols.day_off;
    if (cols.start_time) map.timeStartColumn = cols.start_time;
    if (cols.end_time) map.timeEndColumn = cols.end_time;
    if (cols.consultation_fees) map.feesColumn = cols.consultation_fees;
    return map;
  }
  return undefined;
}

// ── Prompt ──────────────────────────────────────────────────────────────────

/**
 * A concise, natural-language summary of the booking in progress, injected into
 * the prompt so the model retains context across interruptions ("Currently
 * booking: Dr. Shankar, Urology, Adliya, 5 PM"). Empty until the customer has
 * provided at least one identifying slot.
 */
export function bookingSummary(slots: Record<string, any>): string | undefined {
  const pick = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = slots?.[k];
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
    }
    return undefined;
  };
  const doctor = pick('doctor_name', 'doctor', 'property_name');
  const department = pick('department', 'specialty');
  const location = pick('location', 'branch');
  const datetime = pick('datetime', 'time', 'preferred_time', 'booking_time');
  const parts = [doctor, department, location, datetime].filter((p): p is string => Boolean(p));
  return parts.length > 0 ? parts.join(', ') : undefined;
}

export function buildHarnessPrompt(
  systemPrompt: string,
  checklist: HarnessChecklist,
  slots: Record<string, any>,
  userMessage: string,
  lookupResult?: string,
  searchResults?: string
): string {
  const requiredLines = checklist.required.map((slot) => {
    const opts = slot.options?.length ? ` (options: ${slot.options.join(', ')})` : '';
    const ask = slot.hint ? ` — ask EXACTLY: "${slot.hint}"` : '';
    return `- ${slot.name}${opts}${ask}`;
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

  const summary = bookingSummary(slots);

  return [
    (systemPrompt ?? '').trim() || 'You are a helpful assistant.',
    '',
    'TASK: You are a booking agent. Collect the REQUIRED SLOTS from the customer.',
    ...(summary ? ['', `CURRENT BOOKING: ${summary}`] : []),
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
    ...(searchResults
      ? [
          '',
          `SEARCH RESULTS (structured data — read the actual column values to answer accurately, NEVER hallucinate or guess a value that is not in the JSON):`,
          searchResults,
        ]
      : []),
    '',
    'INSTRUCTIONS:',
    '1. Extract any new slot values from the USER MESSAGE into updated_slots.',
    '2. If the customer named a doctor, put it in doctor_name (do NOT guess their department or location).',
    '3. If the user asks whether something exists, asks for a list, an ALTERNATIVE, or AVAILABILITY (e.g. "Do you have [X]?", "Who is the [X]?", "another urologist?", "a 3-bedroom villa?", "availability tomorrow at Hamad Town"), you MUST set action = "search_schedule" and put the constraints in "search" as SEPARATE fields: search.category (the specialty/type/Department), search.location (the branch/location), search.name (the doctor/property name), search.day (the weekday or "today"/"tomorrow"). Do NOT merge them into one string. Examples: "Orthodontist at Riffa" → {"search":{"category":"Orthodontist","location":"Riffa"}}; "urologist at Hamad Town tomorrow" → {"search":{"category":"Urologist","location":"Hamad Town","day":"tomorrow"}}. NEVER reply with "Let me check" without returning action = "search_schedule". Do NOT guess names. If you cannot identify any structured field, ask the customer to clarify instead of searching.',
    '4. If all REQUIRED SLOTS are filled, set action = "complete".',
    '5. Otherwise set action = "ask". "next_question" is ONLY a short ACKNOWLEDGMENT (at most one short sentence, e.g. "Got it."). NEVER write the question itself — the harness asks the owner\'s ai_question for the first missing required slot.',
    '6. NEVER write your own question. The "ask EXACTLY" text on each required slot is the owner\'s wording from Workflow_Steps — the harness asks it, you do not.',
    '7. If the message is off-topic or a greeting, you may acknowledge it briefly, but the question must still be the ai_question of the first missing slot.',
    '8. When SEARCH RESULTS are provided above, describe the matches using ONLY the values in that JSON (read Doctor, Branch, Department, Day-Off, Start_Time, End_Time and Consultation Fees). Do NOT ask a question in this reply — the harness appends the ai_question of the next missing slot. Render Start_Time–End_Time as the available times.',
    '9. Reply in the same language as the customer.',
    '10. If a SEARCH RESULTS row has empty or "--" start/end times, tell the customer that this doctor/property has no available times listed at that branch — NEVER pull times from another branch or another row.',
    '11. If the customer SELECTS an item from the previous SEARCH RESULTS (e.g. "Shankar", "the second one", "the villa"), you MUST copy the FULL value from that row into updated_slots (e.g. doctor_name: "Dr. Shankar Narayanappa") plus its location/branch, set action = "ask", and ask for the next missing required slot. Do NOT run another search for an item the customer already selected.',
    '12. Do NOT generate your own questions. The harness asks the ai_question of the matched Workflow_Steps row for the missing slot — you only acknowledge.',
    '',
    'Return ONLY strict JSON matching: {"updated_slots": {slot: value, ...}, "action": "ask"|"complete"|"search_schedule", "next_question": "<a short acknowledgment, never the question>", "search": {"category": "...", "location": "...", "name": "...", "day": "..."}}',
  ].join('\n');
}

function validateHarnessDecision(
  obj: any
): { ok: true; value: HarnessDecision } | { ok: false; reason: string } {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, reason: 'not an object' };
  if (obj.action !== 'ask' && obj.action !== 'complete' && obj.action !== 'search_schedule') {
    return { ok: false, reason: 'action must be ask|complete|search_schedule' };
  }
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

  const rawSearch = obj.search && typeof obj.search === 'object' ? obj.search : {};
  // Accept the older `specialty`/`branch` names as aliases, but never accept a
  // free-text `query`: an unstructured search must ask for clarification.
  const category = rawSearch.category ?? rawSearch.specialty;
  const location = rawSearch.location ?? rawSearch.branch;
  const search = Object.keys(rawSearch).length > 0
    ? {
        ...(typeof category === 'string' && category.trim() ? { category: category.trim() } : {}),
        ...(typeof location === 'string' && location.trim() ? { location: location.trim() } : {}),
        ...(typeof rawSearch.name === 'string' && rawSearch.name.trim() ? { name: rawSearch.name.trim() } : {}),
        ...(typeof rawSearch.day === 'string' && rawSearch.day.trim() ? { day: rawSearch.day.trim() } : {}),
      }
    : undefined;

  return {
    ok: true,
    value: {
      updated_slots,
      action: obj.action,
      next_question,
      ...(search ? { search } : {}),
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

/**
 * Strict, deterministic cell match for constraint columns (category/location).
 *
 * Case-insensitive, punctuation/whitespace-normalized **equality**. Generic
 * qualifiers ("specialist", "consultant", "senior", …) are ignored on both sides
 * so "Specialist Orthodontist" ≡ "Orthodontist". There is deliberately **no**
 * prefix/stem/substring fuzziness — that is what `looseCellMatch` did and why
 * unrelated rows leaked into search results.
 */
const GENERIC_QUALIFIERS = new Set([
  'specialist',
  'consultant',
  'senior',
  'junior',
  'general',
  'doctor',
  'dr',
  'prof',
  'professor',
]);

function normalizeStrict(value: any): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function stripQualifiers(value: string): string {
  return value
    .split(' ')
    .filter((token) => token && !GENERIC_QUALIFIERS.has(token))
    .join(' ');
}

export function strictCellMatch(cell: any, wanted: any): boolean {
  const a = normalizeStrict(cell);
  const b = normalizeStrict(wanted);
  if (!a || !b) return false;
  if (a === b) return true;
  const strippedA = stripQualifiers(a);
  const strippedB = stripQualifiers(b);
  return strippedA !== '' && strippedA === strippedB;
}

// ── Day-of-week helpers ─────────────────────────────────────────────────────

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const DAY_ALIASES: Record<string, string> = {
  sun: 'sunday',
  mon: 'monday',
  tue: 'tuesday',
  tues: 'tuesday',
  wed: 'wednesday',
  thu: 'thursday',
  thur: 'thursday',
  thurs: 'thursday',
  fri: 'friday',
  sat: 'saturday',
};

/**
 * Resolve a weekday from free text — "Tuesday", "Tue", "today", "tomorrow".
 * Relative days are resolved against `now` (injectable for tests).
 */
export function resolveDay(value: any, now: Date = new Date()): string | undefined {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return undefined;
  if (/\bday\s+after\s+tomorrow\b/.test(raw)) return DAY_NAMES[(now.getDay() + 2) % 7];
  if (/\btomorrow\b/.test(raw)) return DAY_NAMES[(now.getDay() + 1) % 7];
  if (/\btoday\b/.test(raw)) return DAY_NAMES[now.getDay()];
  for (const [alias, full] of Object.entries(DAY_ALIASES)) {
    if (new RegExp(`\\b${alias}\\b`, 'i').test(raw)) return full;
  }
  for (const full of DAY_NAMES) {
    if (new RegExp(`\\b${full}\\b`, 'i').test(raw)) return full;
  }
  return undefined;
}

/**
 * Does the row's `Day-Off` cell block the requested day? Blank means the entity
 * works every day. A listed day blocks only that day.
 */
export function dayOffBlocks(row: Record<string, any>, day: string, map: ScheduleMap): boolean {
  if (!map.dayOffColumn) return false;
  const value = String(readCell(row, map.dayOffColumn) ?? '').trim();
  if (!value) return false;
  if (/^(none|no|n\/?a|--?|—)$/i.test(value)) return false;

  const requested = resolveDay(day);
  if (!requested) return false;

  const normalized = value.toLowerCase();
  if (/\bweekend\b/.test(normalized) && (requested === 'friday' || requested === 'saturday')) {
    return true;
  }
  const alias = Object.entries(DAY_ALIASES).find(([, full]) => full === requested)?.[0];
  const pattern = alias
    ? new RegExp(`\\b(${requested}|${alias})\\b`, 'i')
    : new RegExp(`\\b${requested}\\b`, 'i');
  return pattern.test(normalized);
}

/** Is at least one structured constraint present? (No free-text fallback.) */
export function hasStructuredSearch(search?: ScheduleSearch): boolean {
  const s = search ?? {};
  return Boolean(
    (s.category && String(s.category).trim()) ||
      (s.location && String(s.location).trim()) ||
      (s.name && String(s.name).trim()) ||
      (s.day && String(s.day).trim())
  );
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
      if (filter.department && !strictCellMatch(readCell(row, map.departmentColumn), filter.department)) return false;
      if (filter.location && !strictCellMatch(readCell(row, map.branchColumn), filter.location)) return false;
      return true;
    })
  );
}

/** Render a row's availability window (structured Start/End or a legacy column). */
function formatTimes(row: Record<string, any>, map: ScheduleMap): string {
  if (map.timeStartColumn || map.timeEndColumn) {
    const start = map.timeStartColumn ? String(readCell(row, map.timeStartColumn) ?? '').trim() : '';
    const end = map.timeEndColumn ? String(readCell(row, map.timeEndColumn) ?? '').trim() : '';
    if (start || end) return [start || '?', end || '?'].join(' - ');
  }
  const header = availabilityHeader(row) ?? hoursColumn(row);
  return header ? String(readCell(row, header) ?? '').trim() : '';
}

function formatScheduleRow(row: Record<string, any>, map: ScheduleMap): string {
  const doctor = String(readCell(row, map.doctorColumn) ?? '').trim() || 'a doctor';
  const department = String(readCell(row, map.departmentColumn) ?? '').trim();
  const branch = String(readCell(row, map.branchColumn) ?? '').trim();
  const times = formatTimes(row, map);
  const fees = map.feesColumn ? String(readCell(row, map.feesColumn) ?? '').trim() : '';
  const dayOff = map.dayOffColumn ? String(readCell(row, map.dayOffColumn) ?? '').trim() : '';
  return `${doctor} is ${department ? `a ${department}` : 'available'}${branch ? ` at ${branch}` : ''}${times ? ` (available ${times})` : ''}${fees ? `, consultation fee ${fees}` : ''}${dayOff ? `, off ${dayOff}` : ''}.`;
}

/**
 * Is a schedule row genuinely unavailable ("off", "vacation", "closed")? A bare
 * "--" or empty time is NOT treated as off — the row is kept so the model can
 * honestly report "no available times" instead of borrowing another branch's.
 */
function isDoctorOff(row: Record<string, any>, map?: ScheduleMap): boolean {
  const legacy = availabilityHeader(row);
  if (legacy) {
    const value = String(readCell(row, legacy) ?? '').trim();
    if (/\b(off|vacation|unavailable|not available|closed)\b/i.test(value)) return true;
  }
  for (const column of [map?.timeStartColumn, map?.timeEndColumn]) {
    if (!column) continue;
    const value = String(readCell(row, column) ?? '').trim();
    if (/\b(off|vacation|unavailable|not available|closed)\b/i.test(value)) return true;
  }
  if (map?.dayOffColumn) {
    const value = String(readCell(row, map.dayOffColumn) ?? '').trim();
    if (/^(all|every\s*day|always)$/i.test(value)) return true;
  }
  return false;
}

/**
 * Deterministic AND-filter for `search_schedule`. The CODE is the sole filter:
 * every present structured constraint must match (category AND location AND name
 * AND day). There is no free-text fallback — an unstructured search returns `[]`
 * so the caller can ask the customer to clarify.
 */
const MIN_PREFIX_LEN = 4;

/**
 * Prefix/stem cell match: returns true if one normalized value starts with the
 * other, and the shared prefix is at least MIN_PREFIX_LEN chars. Used as a
 * second pass when exact (`strictCellMatch`) finds no rows, so "Gastro" can
 * match "Gastroenterologist" without the over-matching of substring search.
 */
function prefixCellMatch(cell: any, wanted: any): boolean {
  const a = normalizeStrict(cell);
  const b = normalizeStrict(wanted);
  if (!a || !b) return false;
  if (a === b) return true;
  const strippedA = stripQualifiers(a);
  const strippedB = stripQualifiers(b);
  const minLen = Math.min(strippedA.length, strippedB.length);
  if (minLen < MIN_PREFIX_LEN) return false;
  return strippedA.startsWith(strippedB) || strippedB.startsWith(strippedA);
}

export function filterRowsStructured(
  rows: Record<string, any>[],
  search: ScheduleSearch | undefined,
  map: ScheduleMap,
  now?: Date
): Record<string, any>[] {
  const s = search ?? {};
  if (!hasStructuredSearch(s)) return [];

  const day = s.day ? resolveDay(s.day, now) : undefined;
  const allRows = Array.isArray(rows) ? rows : [];

  // Pass 1: Exact match (strictCellMatch — case-insensitive, qualifier-insensitive equality).
  const exactMatches = allRows.filter((row) => {
    if (s.category && !strictCellMatch(readCell(row, map.departmentColumn), s.category)) return false;
    if (s.location && !strictCellMatch(readCell(row, map.branchColumn), s.location)) return false;
    if (s.name && !matchDoctor(readCell(row, map.doctorColumn), s.name)) return false;
    if (day && dayOffBlocks(row, day, map)) return false;
    return true;
  });
  if (exactMatches.length > 0) return exactMatches;

  // Pass 2: Prefix/Stem match — only for category and location, only when exact
  // found nothing, and only when the result is unique (avoid ambiguous matches).
  const prefixMatches = allRows.filter((row) => {
    if (s.category && !prefixCellMatch(readCell(row, map.departmentColumn), s.category)) return false;
    if (s.location && !prefixCellMatch(readCell(row, map.branchColumn), s.location)) return false;
    if (s.name && !matchDoctor(readCell(row, map.doctorColumn), s.name)) return false;
    if (day && dayOffBlocks(row, day, map)) return false;
    return true;
  });
  if (prefixMatches.length === 1) return prefixMatches;

  return [];
}

/** Collapse rows sharing the same entity + branch so the model never merges rows. */
function dedupeRows(rows: Record<string, any>[], map: ScheduleMap): Record<string, any>[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const entity = String(readCell(row, map.doctorColumn) ?? '').trim().toLowerCase();
    const branch = String(readCell(row, map.branchColumn) ?? '').trim().toLowerCase();
    const key = `${entity}||${branch}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Serialize the matched schedule rows as structured JSON — every column intact —
 * so the model can answer follow-up questions (e.g. "at which branch?") from the
 * real data instead of hallucinating. Rows marked off/vacation are excluded;
 * empty/"--" times are preserved.
 */
export function serializeSearchResults(rows: Record<string, any>[], map: ScheduleMap): string {
  const available = (Array.isArray(rows) ? rows : []).filter((row) => !isDoctorOff(row, map));
  return JSON.stringify(dedupeRows(available, map));
}

/** A human-readable fallback when the model fails to produce a natural reply. */
function summarizeRows(rows: Record<string, any>[], map: ScheduleMap): string {
  const entities = (Array.isArray(rows) ? rows : [])
    .filter((row) => !isDoctorOff(row, map))
    .map((row) => String(readCell(row, map.doctorColumn) ?? '').trim())
    .filter(Boolean);
  if (entities.length === 0) return 'I could not find anything matching that.';
  return `${entities.join(', ')}. Would you like to book one of them?`;
}

/** Render a row's hours as a value `parseTimeWindows` can read. */
function scheduleHoursValue(row: Record<string, any> | undefined, map: ScheduleMap): string {
  if (!row) return '';
  const legacy = hoursColumn(row);
  if (legacy) {
    const value = String(readCell(row, legacy) ?? '').trim();
    if (value) return value;
  }
  if (map.timeStartColumn && map.timeEndColumn) {
    const start = String(readCell(row, map.timeStartColumn) ?? '').trim();
    const end = String(readCell(row, map.timeEndColumn) ?? '').trim();
    if (start || end) return [start, end].filter(Boolean).join('-');
  }
  return '';
}

/**
 * Derive a structured search from slots the customer already provided. Used as a
 * deterministic guard so an availability question ("tomorrow at Hamad Town") is
 * never answered without a real lookup, even if the model forgets to ask for one.
 */
function searchFromSlots(slots: Record<string, any>, userMessage: string): ScheduleSearch {
  const pick = (...keys: string[]): string | undefined => {
    for (const key of keys) {
      if (isFilled(slots, key)) return String(slots[key]).trim();
    }
    return undefined;
  };

  const search: ScheduleSearch = {};
  const category = pick('department', 'specialty', 'type', 'category');
  const location = pick('location', 'branch');
  const name = pick('doctor_name', 'doctor', 'property_name', 'name');
  if (category) search.category = category;
  if (location) search.location = location;
  if (name) search.name = name;

  const day = resolveDay(pick('datetime', 'time', 'preferred_time', 'booking_time') ?? userMessage);
  if (day) search.day = day;
  return search;
}

/** Does the message ask about availability / a day? */
function looksLikeAvailabilityQuery(message: string): boolean {
  return /\b(availab\w*|open|free|schedule|timing|times?|tomorrow|today|tonight|weekend|do you have|is there|are there|any)\b/i.test(
    String(message ?? '')
  );
}

/**
 * The `alternate_step` of the intent's lookup step — the owner's own "we don't
 * have it" question (e.g. "Would you like to try another location?"). Returns
 * undefined when the sheet declares no alternate step.
 */
function lookupAlternateQuestion(
  steps: Record<string, any>[],
  headers: { stepType: string; stepId: string; alternate: string; question: string },
  slots: Record<string, any>
): string | undefined {
  const lookupStep = (steps ?? []).find(
    (s) => String(s[headers.stepType] ?? '').trim().toLowerCase() === 'lookup'
  );
  if (!lookupStep) return undefined;
  const alternate = String(lookupStep[headers.alternate] ?? '').trim();
  if (!alternate) return undefined;
  const altStep = (steps ?? []).find((s) => String(s[headers.stepId] ?? '').trim() === alternate);
  if (!altStep) return undefined;
  const question = String(altStep[headers.question] ?? '').trim();
  if (!question || /^\(silent\)$/i.test(question)) return undefined;
  return noBarePlaceholders(substituteSlots(question, slots), slots) || undefined;
}

/**
 * Is the customer's message a QUESTION about the catalogue ("do you have a
 * dentist?", "what time are you open?", "who is available today?") rather than
 * an ANSWER to the slot the harness just asked for ("5 PM today", "Riffa",
 * "Dr Ahmed")?
 *
 * Universal: interrogative grammar only, no business vocabulary — the same rule
 * serves a clinic, a real-estate agency or a store.
 */
export function isQuestionMessage(message: string): boolean {
  const text = String(message ?? '').trim();
  if (!text) return false;
  // A question mark is the strongest signal.
  if (/\?\s*$/.test(text)) return true;
  return /\b(do you have|do we have|is there|are there|is it|are they|can i|can we|could i|could we|who is|who's|who are|what time|what are|what is|what's|when is|when are|when do|where is|where are|which|how much|how many|how long|how early|how late)\b/i.test(
    text
  );
}

// ── Semantic matching ────────────────────────────────────────────────────────

/** How many options the model may be shown (the prompt stays bounded). */
const MAX_SEMANTIC_OPTIONS = 80;

/**
 * The distinct values of a lookup column — the options the customer can pick
 * ("ENT Surgeon", "DENTAL SURGEON", …). `column` is the schedule map's category
 * column (Department, Type, Specialty, …), so this is business-agnostic.
 */
export function uniqueLookupValues(rows: Record<string, any>[], column: string): string[] {
  const values = new Set<string>();
  for (const row of Array.isArray(rows) ? rows : []) {
    const value = String(readCell(row, column) ?? '').trim();
    if (value) values.add(value);
  }
  return Array.from(values).sort();
}

/**
 * The options the customer could have meant: the values of the category column
 * among the rows that match the OTHER constraints (the branch they named).
 *
 * Narrowing by branch is what makes the suggestion resolvable — offering
 * "SPECIALIST ENT" to a customer in Riffa would only fail again.
 */
export function semanticOptions(
  rows: Record<string, any>[],
  map: ScheduleMap,
  constraints: { location?: string }
): string[] {
  const all = Array.isArray(rows) ? rows : [];
  const narrowed = constraints.location
    ? all.filter((row) => strictCellMatch(readCell(row, map.branchColumn), constraints.location!))
    : all;
  const source = narrowed.length > 0 ? narrowed : all;
  return uniqueLookupValues(source, map.departmentColumn).slice(0, MAX_SEMANTIC_OPTIONS);
}

/** The question the model answers when the customer's wording is not in the sheet. */
export function semanticMatchPrompt(requested: string, options: string[]): string {
  return `The user asked for '${requested}'. The available options are: ${options.join(
    ', '
  )}. Which one is the closest match? Return only the exact option, or 'NONE' if no match exists.`;
}

/**
 * Ask the model which of the sheet's options is closest to what the customer
 * asked for. Returns the option's exact spelling, or `null` when the model says
 * NONE (or answers with something that is not one of the options).
 *
 * Universal: the model does the matching, so no synonym list is ever hardcoded.
 */
export async function findSemanticMatch(
  client: LlmClient | undefined,
  requested: string,
  options: string[]
): Promise<string | null> {
  if (!client || !String(requested ?? '').trim() || options.length === 0) return null;
  const prompt = semanticMatchPrompt(requested, options);
  for (let attempt = 0; attempt < 2; attempt++) {
    let text = '';
    try {
      const res = await client.complete({
        messages: [
          {
            role: 'user',
            content:
              attempt === 0
                ? prompt
                : `${prompt}\n\nAnswer with exactly one option from the list, or NONE.`,
          },
        ],
        temperature: 0,
        maxTokens: 60,
      });
      if (!res.ok) continue;
      text = String(res.text ?? '').trim();
    } catch {
      continue;
    }
    const answer = text.replace(/^["'`]+|["'`]+$/g, '').trim();
    if (!answer) continue;
    if (/^none$/i.test(answer)) return null;
    // The exact option (case-insensitive) is the contract.
    const exact = options.find((o) => o.toLowerCase() === answer.toLowerCase());
    if (exact) return exact;
    // Tolerate a slightly longer answer ("ENT Surgeon (ENT)") — the longest
    // option wins so "ENT Surgeon" is never shortened to "ENT".
    const byLength = [...options].sort((a, b) => b.length - a.length);
    const loose = byLength.find((o) => answer.toLowerCase().includes(o.toLowerCase()));
    if (loose) return loose;
  }
  return null;
}

/**
 * The question that offers the suggestion to the customer. `entity` is the
 * sheet's own entity column ("Doctor", "Property", "Product"), so the sentence
 * fits the business without hardcoding anything.
 */
export function semanticMatchQuestion(entity: string, requested: string, suggested: string): string {
  return `I don't have a ${entity} listed as '${requested}'. We have '${suggested}'. Would you like me to check for ${suggested}?`;
}

// ── State commitment (search selections are slot fills) ────────────────────

/** Generic aliases for the slots that hold a search constraint. */
const LOCATION_SLOTS = ['location', 'branch'];
const CATEGORY_SLOTS = ['department', 'specialty', 'category', 'type'];
const ENTITY_SLOTS = ['doctor_name', 'doctor', 'property_name', 'entity_name'];

/** First filled alias value, e.g. location or branch. */
function filledFrom(slots: Record<string, any>, names: string[]): string | undefined {
  for (const name of names) {
    if (isFilled(slots, name)) return String(slots[name]).trim();
  }
  return undefined;
}

/** Fill the first alias slot when none of the aliases is filled yet. */
function setFirstEmpty(slots: Record<string, any>, names: string[], value: string): void {
  const trimmed = String(value ?? '').trim();
  if (!trimmed || names.length === 0) return;
  if (names.some((name) => isFilled(slots, name))) return; // already set under another alias
  slots[names[0]] = trimmed;
}

/** Parse the stored structured search results, tolerating malformed state. */
function parseLastSearchRows(lastSearch?: string): Record<string, any>[] {
  if (!lastSearch) return [];
  try {
    const parsed = JSON.parse(lastSearch);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Commit the model's structured search constraints to the booking slots, so a
 * follow-up ("Riffa") is remembered as the customer's selection and the next
 * turn does not lose it. Only fills slots that are empty and relevant.
 */
function commitSearchConstraints(
  state: SheetState,
  search: ScheduleSearch | undefined,
  checklist?: HarnessChecklist
): void {
  if (!search) return;

  const relevant = (name: string): boolean =>
    !checklist ||
    checklist.required.some((slot) => slot.name === name) ||
    checklist.derived.includes(name);

  const set = (names: string[], value?: string): void => {
    setFirstEmpty(
      state.slots,
      names.filter((name) => relevant(name)),
      String(value ?? '')
    );
  };

  set(CATEGORY_SLOTS, search.category);
  set(LOCATION_SLOTS, search.location);
}

const SELECTION_STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'ok', 'okay', 'fine', 'yes', 'yeah', 'please', 'thanks',
  'thank', 'you', 'i', 'ill', 'will', 'take', 'choose', 'select', 'prefer', 'want', 'would',
  'like', 'book', 'booking', 'appointment', 'with', 'doctor', 'dr', 'for', 'at', 'on', 'to',
  'of', 'and', 'that', 'this', 'him', 'her', 'go', 'lets', 'let',
  // Confirmation words must never be mistaken for a doctor/entity name
  // ("Sure" must not prefix-match "DR SURESH DAIVASIKHAMANI").
  'sure', 'yep', 'yup', 'confirm', 'correct', 'right', 'no', 'nope', 'nah', 'cancel', 'not',
]);

/** Words treated as a deterministic "Yes" to a confirm/verification question. */
const CONFIRM_YES = new Set([
  'yes', 'y', 'sure', 'ok', 'okay', 'confirm', 'correct', 'right', 'yeah', 'yep', 'yup', 'ya', 'aye',
]);

/** Words treated as a deterministic "No". */
const CONFIRM_NO = new Set(['no', 'n', 'nope', 'nah', 'cancel', 'wrong', 'not']);

/**
 * Deterministically classify a message as a confirmation ("yes") or a decline
 * ("no"), or `undefined` when it is neither. Used by the harness to fill the
 * `confirm` slot in code instead of trusting the model (which misreads "Sure"
 * as a doctor name).
 */
function confirmIntent(message: string): 'yes' | 'no' | undefined {
  const words = String(message ?? '').toLowerCase().split(/[^a-z]+/).filter(Boolean);
  if (words.length === 0) return undefined;
  const yes = words.some((w) => CONFIRM_YES.has(w));
  const no = words.some((w) => CONFIRM_NO.has(w));
  if (no && !yes) return 'no';
  if (yes) return 'yes';
  return undefined;
}

/** Is `confirm` a required slot that is still unfilled? */
function confirmSlotPending(checklist: HarnessChecklist, slots: Record<string, any>): boolean {
  return checklist.required.some((s) => s.name === 'confirm') && !isFilled(slots, 'confirm');
}

const ORDINALS: Record<string, number> = {
  first: 0, '1st': 0, one: 0,
  second: 1, '2nd': 1, two: 1,
  third: 2, '3rd': 2, three: 2,
  fourth: 3, '4th': 3, four: 3,
  fifth: 4, '5th': 4, five: 4,
};

function messageTokens(message: string): string[] {
  return String(message ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !SELECTION_STOPWORDS.has(token));
}

function parseOrdinal(message: string): number | undefined {
  for (const token of String(message ?? '').toLowerCase().split(/[^a-z0-9]+/)) {
    if (token && Object.prototype.hasOwnProperty.call(ORDINALS, token)) return ORDINALS[token];
  }
  return undefined;
}

/** A statement that names/selects something — not a question. */
function looksLikeSelection(message: string): boolean {
  const m = String(message ?? '').trim();
  if (!m) return false;
  if (/\?/.test(m)) return false;
  return !/\b(do you|is there|are there|who|which|what|any|another|different|other|alternative)\b/i.test(m);
}

/**
 * If the customer's message names an entity from the previous search results,
 * commit the FULL name (and its branch/department) to the slots. This is the
 * State Commitment step: a selection is a slot fill, not a new search.
 */
function commitEntitySelection(
  state: SheetState,
  userMessage: string,
  map: ScheduleMap,
  entitySlot = 'doctor_name'
): boolean {
  if (!looksLikeSelection(userMessage)) return false;
  const rows = parseLastSearchRows(state.lastSearch);
  if (rows.length === 0) return false;

  const selectedLocation = filledFrom(state.slots, LOCATION_SLOTS) ?? '';
  const pool = selectedLocation
    ? rows.filter((row) => strictCellMatch(readCell(row, map.branchColumn), selectedLocation))
    : rows;
  const candidates = pool.length > 0 ? pool : rows;

  const commitRow = (row: Record<string, any>): boolean => {
    const entity = String(readCell(row, map.doctorColumn) ?? '').trim();
    const location = String(readCell(row, map.branchColumn) ?? '').trim();
    const department = String(readCell(row, map.departmentColumn) ?? '').trim();
    if (entity) state.slots[entitySlot] = entity;
    if (location) setFirstEmpty(state.slots, LOCATION_SLOTS, location);
    if (department) setFirstEmpty(state.slots, CATEGORY_SLOTS, department);
    return Boolean(entity);
  };

  // Ordinal selection: "the second one", "2nd", "two".
  const ordinal = parseOrdinal(userMessage);
  if (ordinal !== undefined) {
    const row = candidates[ordinal];
    return row ? commitRow(row) : false;
  }

  const words = messageTokens(userMessage);
  if (words.length === 0) return false;

  const matches = candidates.filter((row) => {
    const entity = normalizeStrict(readCell(row, map.doctorColumn));
    if (!entity) return false;
    const entityTokens = entity.split(' ');
    return words.some((word) =>
      entityTokens.some((token) => token === word || (word.length >= 4 && token.startsWith(word)))
    );
  });
  if (matches.length === 0) return false;

  // Only commit when the matches refer to a single distinct entity; otherwise
  // the selection is ambiguous and the model should ask.
  const distinct = new Set(matches.map((row) => normalizeStrict(readCell(row, map.doctorColumn))));
  if (distinct.size > 1) return false;

  return commitRow(matches[0]);
}

/**
 * If the customer's message names a branch/location from the previous search
 * results ("Riffa"), commit it. This is deterministic: the model often answers
 * "Let me check…" without searching, which loses the branch the customer gave.
 */
function commitLocationSelection(
  state: SheetState,
  userMessage: string,
  map: ScheduleMap
): boolean {
  if (!looksLikeSelection(userMessage)) return false;
  const rows = parseLastSearchRows(state.lastSearch);
  if (rows.length === 0) return false;

  // Distinct branch values present in the previous results.
  const branches = new Map<string, string>();
  for (const row of rows) {
    const branch = String(readCell(row, map.branchColumn) ?? '').trim();
    if (branch) branches.set(normalizeStrict(branch), branch);
  }
  if (branches.size === 0) return false;

  const words = messageTokens(userMessage);
  if (words.length === 0) return false;

  const matches = Array.from(branches.entries()).filter(([normalized]) => {
    const tokens = normalized.split(' ');
    return words.some((word) =>
      tokens.some((token) => token === word || (word.length >= 4 && token.startsWith(word)))
    );
  });
  if (matches.length !== 1) return false;

  const branch = matches[0][1];
  const existing = filledFrom(state.slots, LOCATION_SLOTS);
  if (existing && strictCellMatch(existing, branch)) return false; // already committed

  // The customer's explicit branch wins over an auto-derived one.
  const target = LOCATION_SLOTS.find((name) => isFilled(state.slots, name)) ?? LOCATION_SLOTS[0];
  state.slots[target] = branch;
  return true;
}

/**
 * Merge a search with the slots already committed. A location/day-only follow-up
 * ("Riffa") narrows the previous search, so its category/entity is preserved
 * (urologist + Riffa, not every doctor at Riffa).
 */
function mergeSearchWithSlots(search: ScheduleSearch, slots: Record<string, any>): ScheduleSearch {
  const merged = { ...search };
  const narrowing = !search.category && !search.name;
  if (narrowing) {
    if (!merged.location) merged.location = filledFrom(slots, LOCATION_SLOTS);
    if (!merged.category) merged.category = filledFrom(slots, CATEGORY_SLOTS);
    if (!merged.name) merged.name = filledFrom(slots, ENTITY_SLOTS);
  }
  return merged;
}

/**
 * Slot names that hold the customer's requested time. The harness validates a
 * time only when one of these is filled.
 */
const TIME_SLOT_KEYS = new Set(['datetime', 'time', 'preferred_time', 'booking_time', 'appointment_time', 'booking_datetime']);

function findTimeSlot(slots: Record<string, any>): string | undefined {
  for (const key of Object.keys(slots ?? {})) {
    if (TIME_SLOT_KEYS.has(normalizeSlotKey(key)) && isFilled(slots, key)) return key;
  }
  return undefined;
}

/**
 * A bare time token — "PM", "5 PM", "evening", "morning" — that the customer typed
 * as an answer to a time question. Used to force a model-ignored token into the
 * time slot so the deterministic validation can accept or reject it.
 */
function looksLikeTimeToken(message: string): boolean {
  const m = String(message ?? '').trim().toLowerCase();
  if (!m) return false;
  return /^(am|pm|evening|morning|afternoon|noon|midnight|\d{1,2}(\s*(am|pm))?)$/.test(m);
}

/**
 * A free-form "does this exist / who is this" question — "Do you have X?",
 * "Who is the X?", "Which X …?" — that should search the schedule even when no
 * booking intent matched.
 */
function looksLikeSearchQuery(message: string): boolean {
  return /\b(have|who|which|what|do you|is there|are there|any|list|show|available|find|looking for)\b/i.test(
    String(message ?? '')
  );
}

/**
 * Find the schedule row's "hours" column generically. Clinics use
 * `Available_Times`, real estate uses `Viewing_Hours`, restaurants use
 * `Reservation_Hours` — any column whose name ends in "time(s)", "hour(s)", or
 * "availability" is treated as the hours column.
 */
export function hoursColumn(row: Record<string, any>): string | undefined {
  if (!row) return undefined;
  return Object.keys(row).find((k) => /(times?|hours?|availability)$/i.test(String(k).trim()));
}

// ── Guards ──────────────────────────────────────────────────────────────────

/**
 * Fallback wording for a placeholder the customer never filled in — e.g. a
 * doctor name when the schedule had no match. Without it the owner's sentence
 * reads "We have has availability.". The words are generic so the harness never
 * assumes a vertical, and a placeholder without a default still gets a
 * readable phrase instead of a blank gap.
 */
export const PLACEHOLDER_DEFAULTS: Record<string, string> = {
  // The thing being booked.
  doctor: 'a specialist',
  doctor_name: 'a specialist',
  specialist: 'a specialist',
  employee: 'a specialist',
  staff: 'a specialist',
  property: 'a property',
  property_name: 'a property',
  product: 'a product',
  item: 'an item',
  room: 'a room',
  service: 'a service',
  // The category and the branch.
  department: 'the selected department',
  specialty: 'the selected specialty',
  category: 'the selected category',
  location: 'the selected location',
  branch: 'the selected branch',
  city: 'the selected city',
  // Anything else the owner names.
  '*': 'the selected option',
};

/** The wording used for a placeholder with no more specific default. */
export const DEFAULT_PLACEHOLDER_TEXT = 'the selected option';

/** The default wording for one slot. */
export function placeholderDefault(slotName: string): string {
  const key = normalizeSlotKey(slotName);
  return (
    PLACEHOLDER_DEFAULTS[slotName] ??
    PLACEHOLDER_DEFAULTS[key] ??
    PLACEHOLDER_DEFAULTS['*'] ??
    DEFAULT_PLACEHOLDER_TEXT
  );
}

/**
 * Replace `{slot}` with values, then fill any token that still has no value
 * with a readable default (never a blank gap, never a literal `{slot}`).
 */
export function noBarePlaceholders(
  text: string,
  slots: Record<string, any>,
  defaults: Record<string, string> = PLACEHOLDER_DEFAULTS
): string {
  const substituted = substituteSlots(text, slots, defaults);
  return substituted
    .replace(/\{([^{}]*)\}/g, (_match, name: string) => placeholderDefault(name))
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

/** The owner's `ai_question` for a slot, with `{slot}` placeholders substituted. */
function guidedQuestion(slot: HarnessSlot | undefined, slots: Record<string, any>): string {
  if (!slot?.hint) return '';
  return noBarePlaceholders(slot.hint, slots);
}

/**
 * Drop trailing question sentences. The owner's `ai_question` is the only
 * question allowed, so any question the model invented is removed.
 */
function stripTrailingQuestions(text: string): string {
  const parts = String(text ?? '').trim().split(/(?<=[.!?])\s+/);
  while (parts.length > 0 && parts[parts.length - 1].trim().endsWith('?')) parts.pop();
  return parts.join(' ').trim();
}

/** The words that carry the meaning of a sentence (stop-words dropped). */
function contentTokens(text: string): string[] {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((word) => word.length >= 3);
}

/**
 * Did the model already ask the owner's question?
 *
 * The model may repeat the question ("Can you provide your name, phone and
 * email?") instead of only acknowledging. Comparing the distinctive words of
 * both texts answers this without hardcoding anything: if the model's text
 * already contains the question's content words ("name", "phone", "email",
 * …) the question must not be added a second time.
 */
export function alreadyAsksTheQuestion(modelText: string, guided: string): boolean {
  const question = contentTokens(guided);
  if (question.length === 0) return false;
  const model = new Set(contentTokens(modelText));
  const shared = question.filter((word) => model.has(word)).length;
  return shared / question.length >= 0.6;
}

/**
 * The final customer message: the model's acknowledgement + the owner's
 * question, each exactly once.
 *
 * The LLM decides the ACTION and may add a short acknowledgement; the HARNESS
 * owns the question. When the model repeated the question anyway, it is kept
 * once instead of being appended a second time.
 */
export function composeCustomerMessage(modelText: string, guided: string): string {
  const question = String(guided ?? '').trim();
  const model = String(modelText ?? '').trim();
  if (!question) return model;
  if (!model) return question;
  if (alreadyAsksTheQuestion(model, question)) return model;
  // The model may have written a question after all — only the acknowledgement
  // part of it belongs in front of the owner's question.
  const acknowledgment = stripTrailingQuestions(model).trim();
  if (!acknowledgment) return question;
  if (alreadyAsksTheQuestion(acknowledgment, question)) return acknowledgment;
  return `${acknowledgment} ${question}`;
}

// ── Deterministic slot pre-fill (list / buttons) ────────────────────────────

/**
 * Ported from the legacy state machine: models are unreliable at single-token
 * extraction, so the code fills whatever it can from the owner's own vocabulary
 * BEFORE the LLM runs. For every `list`/`buttons` step, if the customer's
 * message matches one of the step's `options` (exact case-insensitive, then
 * whole-word), fill that slot. "Dental" → department, "Yes" → confirm.
 */
function prefillOptionsSlots(
  steps: Record<string, any>[],
  userMessage: string,
  slots: Record<string, any>,
  headers: { slot: string; expected: string; options: string }
): void {
  const message = String(userMessage ?? '').trim();
  for (const step of steps) {
    const input = normalizeInputType(step[headers.expected]);
    if (input !== 'list' && input !== 'buttons') continue;
    const options = parseOptions(step[headers.options]);
    if (!options || options.length === 0) continue;
    const exact = options.find((o) => o.toLowerCase() === message.toLowerCase());
    const hit = exact ?? matchWholeWordOption(message, options);
    if (!hit) continue;
    for (const name of parseSlotNames(step[headers.slot])) {
      if (FLOW_CONTROL_SLOTS.has(name)) continue; // never pre-fill flow-control slots
      if (!isFilled(slots, name)) slots[name] = hit;
    }
  }
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
  systemPrompt?: string,
  objectives?: string[]
): Promise<SheetTurn> {
  const readRows = reader ?? defaultReadRows;
  const rawState = context?.ai?.[nodeId]?.sheet;
  const state: SheetState = {
    intentId: rawState?.intentId ?? null,
    stepId: null,
    slots: rawState?.slots && typeof rawState.slots === 'object' ? { ...rawState.slots } : {},
    lastSearch: typeof rawState?.lastSearch === 'string' ? rawState.lastSearch : undefined,
    pendingIntentId: rawState?.pendingIntentId ?? null,
    awaitingVerification: rawState?.awaitingVerification === true,
    pendingFallbackId: rawState?.pendingFallbackId ?? null,
    awaitingFallbackVerification: rawState?.awaitingFallbackVerification === true,
    fallbackExtractedSlots:
      rawState?.fallbackExtractedSlots && typeof rawState.fallbackExtractedSlots === 'object'
        ? { ...rawState.fallbackExtractedSlots }
        : {},
    reasoningAttempts: typeof rawState?.reasoningAttempts === 'number' ? rawState.reasoningAttempts : 0,
    pendingReasoning:
      rawState?.pendingReasoning && typeof rawState.pendingReasoning === 'object'
        ? {
            ...rawState.pendingReasoning,
            slots:
              rawState.pendingReasoning.slots && typeof rawState.pendingReasoning.slots === 'object'
                ? { ...rawState.pendingReasoning.slots }
                : {},
          }
        : null,
    pendingMatch:
      rawState?.pendingMatch && typeof rawState.pendingMatch === 'object'
        ? { ...rawState.pendingMatch }
        : null,
  };

  // Was a flow already in progress when this message arrived? Used to tell
  // "wrong answer to the question we asked" from "the flow starts now".
  const intentWasActive = Boolean(rawState?.intentId);

  const intentsTab = intentsTabName(sheet);
  const stepsTab = stepsTabName(sheet);

  const idHeader = headerFor(sheet, intentsTab, 'id');
  const keywordsHeader = headerFor(sheet, intentsTab, 'keywords');
  const answerHeader = headerFor(sheet, intentsTab, 'answer');
  const typeHeader = headerFor(sheet, intentsTab, 'type');
  const verificationHeader = headerFor(sheet, intentsTab, 'verification_question');
  const intentIdHeader = headerFor(sheet, stepsTab, 'intent_id');
  const stepIdHeader = headerFor(sheet, stepsTab, 'step_id');
  const alternateStepHeader = headerFor(sheet, stepsTab, 'alternate_step');
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

  // ── Verification: a pending non-booking intent awaiting "Yes/No" ────────────
  if (state.awaitingVerification && state.pendingIntentId) {
    const pending = await readRows(sheet, intentsTab, { column: idHeader, value: state.pendingIntentId });
    toolCalls.push({
      name: 'lookup_sheet',
      args: { tab: intentsTab, filter_column: idHeader, filter_value: state.pendingIntentId },
      rows: pending.length,
    });
    const pendingIntent = pending[0];
    const verification = pendingIntent
      ? String(readCell(pendingIntent, verificationHeader) ?? '').trim()
      : '';

    const yes = /\b(yes|yeah|yep|sure|ok|okay|correct|confirm|right)\b/i.test(userMessage);
    const no = /\b(no|nope|nah|not really|cancel|never mind|wrong)\b/i.test(userMessage);

    if (yes) {
      // Confirm: promote the pending intent and branch on its type.
      state.intentId = state.pendingIntentId;
      state.pendingIntentId = null;
      state.awaitingVerification = false;
      const intentType = String(readCell(pendingIntent, typeHeader) ?? '').trim();
      if (intentType && !/^booking$/i.test(intentType)) {
        const answer = substituteSlots(String(readCell(pendingIntent, answerHeader) ?? '').trim(), state.slots);
        return {
          text: answer || '',
          sheet: freshHarnessState(),
          toolCalls,
          slotExtractionAttempts,
          fallbackUsed,
          ...(answer ? {} : { conversational: true, unanswered: true }),
        };
      }
      // Booking intent → fall through to the checklist below.
    } else if (no) {
      // Decline: forget the pending intent and re-open the conversation.
      state.intentId = null;
      state.pendingIntentId = null;
      state.awaitingVerification = false;
      return {
        text: 'No problem — how can I help you?',
        sheet: state,
        toolCalls,
        slotExtractionAttempts,
        fallbackUsed,
      };
    } else {
      // Ambiguous → re-ask the verification question verbatim.
      return {
        text: verification || 'Could you confirm?',
        sheet: state,
        toolCalls,
        slotExtractionAttempts,
        fallbackUsed,
      };
    }
  }

  // ── Reasoning confirmation: a reasoned booking awaiting "Yes"/"No" ─────────
  // Separate from the Fallback-intent flow: the confirmation has no Intents row
  // of its own, only the row the reasoner targeted. "Yes" promotes that row and
  // carries the reasoned slots in, so the flow resumes at the NEXT slot.
  if (state.pendingReasoning) {
    const pending = state.pendingReasoning;
    const confirmation = confirmIntent(userMessage);

    if (confirmation === 'yes') {
      // Resolve the Booking intent: the reasoner's target when it is a Booking
      // row, else the first Booking intent in the sheet.
      const allIntents = await readRows(sheet, intentsTab);
      toolCalls.push({
        name: 'lookup_sheet',
        args: { tab: intentsTab, filter: 'reasoning-promotion' },
        rows: allIntents.length,
      });
      const targetId = String(pending.targetIntentId ?? '').trim();
      const isBooking = (row: Record<string, any>) =>
        /^booking$/i.test(String(readCell(row, typeHeader) ?? '').trim());
      const byId = targetId
        ? allIntents.find((i) => String(readCell(i, idHeader) ?? '').trim() === targetId)
        : undefined;
      const bookingIntent = byId && isBooking(byId) ? byId : allIntents.find(isBooking);

      // Fall back to the reasoned row when the sheet has no row typed "Booking":
      // the reasoner already validated that id against the catalogue.
      state.intentId = bookingIntent
        ? String(readCell(bookingIntent, idHeader) ?? '').trim() || null
        : targetId || null;
      state.pendingReasoning = null;

      if (!state.intentId) {
        // No Booking intent configured — nothing to promote into.
        return {
          text: 'No problem — how can I help you?',
          sheet: state,
          toolCalls,
          slotExtractionAttempts,
          fallbackUsed,
        };
      }

      // The booking flow's own vocabulary decides which slot "service" fills.
      const bookingSteps = await readRows(sheet, stepsTab, {
        column: intentIdHeader,
        value: state.intentId,
      });
      toolCalls.push({
        name: 'lookup_sheet',
        args: { tab: stepsTab, filter_column: intentIdHeader, filter_value: state.intentId },
        rows: bookingSteps.length,
      });
      const bookingChecklist = deriveChecklist(bookingSteps, {
        slot: slotHeader, expected: expectedHeader, options: optionsHeader,
        validation: validationHeader, question: questionHeader, filter: filterHeader,
        stepType: stepTypeHeader, fallback: fallbackHeader,
      });

      const mapped = mapSlotsToChecklist(pending.slots, bookingChecklist, state.slots);
      for (const [name, value] of Object.entries(mapped)) {
        if (!isFilled(state.slots, name)) state.slots[name] = value;
      }

      // The reasoned slots already answer a step ("blood test" fills department),
      // so ask for the NEXT missing slot instead of restarting the flow.
      const missing = firstMissing(state.slots, bookingChecklist);
      const guided = guidedQuestion(missing, state.slots);
      return {
        text: guided ? noBarePlaceholders(guided, state.slots) : '',
        sheet: state,
        toolCalls,
        slotExtractionAttempts,
        fallbackUsed,
      };
    }

    if (confirmation === 'no') {
      state.intentId = null;
      state.pendingReasoning = null;
      return {
        text: 'No problem — how can I help you?',
        sheet: state,
        toolCalls,
        slotExtractionAttempts,
        fallbackUsed,
      };
    }

    // Neither yes nor no → re-ask the question we actually asked, verbatim.
    return {
      text: pending.question || 'Could you confirm?',
      sheet: state,
      toolCalls,
      slotExtractionAttempts,
      fallbackUsed,
    };
  }

  // ── Fallback Verification: a pending catch-all intent awaiting "Yes/No" ────
  if (state.awaitingFallbackVerification && state.pendingFallbackId) {
    const fallback = await readRows(sheet, intentsTab, { column: idHeader, value: state.pendingFallbackId });
    toolCalls.push({
      name: 'lookup_sheet',
      args: { tab: intentsTab, filter_column: idHeader, filter_value: state.pendingFallbackId },
      rows: fallback.length,
    });
    const fallbackIntent = fallback[0];
    const verification = fallbackIntent
      ? String(readCell(fallbackIntent, verificationHeader) ?? '').trim()
      : '';

    const yes = /\b(yes|yeah|yep|sure|ok|okay|correct|confirm|right)\b/i.test(userMessage);
    const no = /\b(no|nope|nah|not really|cancel|never mind|wrong)\b/i.test(userMessage);

    if (yes) {
      // Confirm: route to the Booking flow using the extracted slots.
      // Find the Booking intent to use its steps for the checklist.
      const allIntentsForFallback = await readRows(sheet, intentsTab);
      const bookingIntent = allIntentsForFallback.find(
        (i) => String(readCell(i, typeHeader) ?? '').trim().toLowerCase() === 'booking'
      );
      const bookingIntentId = bookingIntent
        ? String(readCell(bookingIntent, idHeader) ?? '')
        : state.pendingFallbackId;

      state.intentId = bookingIntentId;
      state.pendingFallbackId = null;
      state.awaitingFallbackVerification = false;

      // Load the Booking intent's steps first: they define which slot a reasoned
      // "service" belongs to (department vs service).
      const bookingSteps = await readRows(sheet, stepsTab, {
        column: intentIdHeader,
        value: state.intentId,
      });
      const bookingChecklist = deriveChecklist(bookingSteps, {
        slot: slotHeader, expected: expectedHeader, options: optionsHeader,
        validation: validationHeader, question: questionHeader, filter: filterHeader,
        stepType: stepTypeHeader, fallback: fallbackHeader,
      });

      // Merge the extracted slots, mapped onto the booking vocabulary, so
      // "blood test" fills department instead of leaving it blank.
      const mapped = mapSlotsToChecklist(state.fallbackExtractedSlots, bookingChecklist, state.slots);
      for (const [name, value] of Object.entries(mapped)) {
        if (!isFilled(state.slots, name)) state.slots[name] = value;
      }
      state.fallbackExtractedSlots = {};

      const missing = firstMissing(state.slots, bookingChecklist);
      const guided = guidedQuestion(missing, state.slots);
      const text = guided ? noBarePlaceholders(guided, state.slots) : '';
      return {
        text,
        sheet: { ...state, intentId: state.intentId },
        toolCalls,
        slotExtractionAttempts,
        fallbackUsed,
      };
    } else if (no) {
      // Decline: forget the fallback and re-open the conversation.
      state.intentId = null;
      state.pendingFallbackId = null;
      state.awaitingFallbackVerification = false;
      state.fallbackExtractedSlots = {};
      return {
        text: 'No problem — how can I help you?',
        sheet: state,
        toolCalls,
        slotExtractionAttempts,
        fallbackUsed,
      };
    } else {
      // Ambiguous → re-ask the fallback verification question verbatim.
      return {
        text: verification || 'Could you confirm?',
        sheet: state,
        toolCalls,
        slotExtractionAttempts,
        fallbackUsed,
      };
    }
  }

  // ── Turn 1: match the intent ───────────────────────────────────────────────
  if (!state.intentId) {
    let intents = await readRows(sheet, intentsTab, { column: keywordsHeader, value: userMessage });
    toolCalls.push({
      name: 'lookup_sheet',
      args: { tab: intentsTab, filter_column: keywordsHeader, filter_value: userMessage },
      rows: intents.length,
    });

    // The full Intents table is needed by the lenient match and, when that also
    // fails, by the reasoning catalogue. Read it at most once per turn.
    let intentsTable: Record<string, any>[] | null = null;

    // Lenient fallback: the strict substring match misses inflections ("doctors"
    // vs "doctor"), which would otherwise drop a knowledge query into the free
    // form path instead of the harness.
    if (intents.length === 0) {
      intentsTable = await readRows(sheet, intentsTab);
      intents = intentsTable.filter((i) => matchesIntentKeywords(readCell(i, keywordsHeader), userMessage));
      toolCalls.push({
        name: 'lookup_sheet',
        args: { tab: intentsTab, filter: 'lenient-keywords' },
        rows: intents.length,
      });
    }

    if (intents.length === 0) {
      // No intent matched. Run Chain-of-Thought reasoning to decide what to do.
      // Reasoning requires a database (for objectives); skip in test/dev environments.
      const catalogue: ReasoningIntent[] = (intentsTable ?? []).map((row) => ({
        id: String(readCell(row, idHeader) ?? '').trim(),
        type: String(readCell(row, typeHeader) ?? '').trim(),
        keywords: String(readCell(row, keywordsHeader) ?? '').trim(),
        answer: String(readCell(row, answerHeader) ?? '').trim() || undefined,
        verificationQuestion: String(readCell(row, verificationHeader) ?? '').trim() || undefined,
      }));

      let reasoning: ReasoningDecision | null = null;
      // The trace travels back to the executor for the Webhook Logs.
      let reasoningTrace: ReasoningTrace | undefined;
      // True when the step ran but produced no usable decision. That is a
      // failure, not an `ask_clarification` — it must never be fabricated.
      let reasoningDegraded = false;
      if (process.env.DATABASE_URL && objectives && objectives.length > 0) {
        try {
          const outcome = await reasoningStep(client, systemPrompt ?? '', objectives, userMessage, state.slots, {
            intents: catalogue,
          });
          reasoningTrace = outcome.trace;
          if (outcome.ok) reasoning = outcome.decision;
          else reasoningDegraded = true;
        } catch {
          // Reasoning threw — fall through to deterministic fallback below.
        }
      }

      if (reasoningDegraded) {
        // The model produced unusable output (truncated JSON, provider outage).
        // Say so plainly and keep the conversation open; do not confirm a
        // booking we could not understand, and do not fall into the free-form
        // path, which would invent an answer instead of asking for a rephrase.
        // (Deliberately does not touch `reasoningAttempts`: that counter is the
        // loop guard for real decisions, and a transient provider blip must not
        // push a healthy conversation towards handover.)
        return {
          text: "I'm having trouble understanding. Could you rephrase?",
          sheet: state,
          toolCalls,
          slotExtractionAttempts,
          fallbackUsed,
          ...(reasoningTrace ? { reasoningDecision: reasoningTrace } : {}),
        };
      }

      if (reasoning) {
        // Increment reasoning attempt counter for loop prevention.
        state.reasoningAttempts = (state.reasoningAttempts || 0) + 1;

        // Loop prevention: if we've been reasoning without progress too many times,
        // escalate to handover instead of spinning.
        if (state.reasoningAttempts > MAX_REASONING_ATTEMPTS) {
          return {
            text: 'I am not able to help with that. Let me connect you with a human agent.',
            sheet: state,
            toolCalls,
            slotExtractionAttempts,
            fallbackUsed,
            conversational: true,
            unanswered: true,
            ...(reasoningTrace ? { reasoningDecision: reasoningTrace } : {}),
          };
        }

        if (reasoning.action === 'verify_booking') {
          // Ask the verification question with extracted slots substituted.
          const text = reasoning.verification_question || 'Could you confirm?';
          // Persist a dedicated pending state so "Yes" promotes the booking with
          // the reasoned slots instead of restarting the flow at step 1.
          state.pendingReasoning = {
            question: text,
            slots: { ...(reasoning.slots ?? {}) },
            targetIntentId: reasoning.target_intent_id ?? null,
            source: 'conversational',
            askedAt: new Date().toISOString(),
          };
          state.pendingFallbackId = null;
          state.awaitingFallbackVerification = false;
          state.fallbackExtractedSlots = {};
          return {
            text,
            sheet: state,
            toolCalls,
            slotExtractionAttempts,
            fallbackUsed,
            ...(reasoningTrace ? { reasoningDecision: reasoningTrace } : {}),
          };
        }

        if (reasoning.action === 'capture_lead') {
          state.pendingFallbackId = 'reasoning_lead';
          state.awaitingFallbackVerification = false;
          state.fallbackExtractedSlots = reasoning.slots;
          return {
            text: reasoning.reasoning || 'Got it. Could you please share your name, phone, and email so we can follow up?',
            sheet: state,
            toolCalls,
            slotExtractionAttempts,
            fallbackUsed,
            ...(reasoningTrace ? { reasoningDecision: reasoningTrace } : {}),
          };
        }

        if (reasoning.action === 'answer_faq') {
          // Prefer the intent the reasoner named; fall back to a keyword match
          // for older prompts that did not supply `target_intent_id`.
          const allIntents = intentsTable ?? (await readRows(sheet, intentsTab));
          const targetId = reasoning.target_intent_id ?? '';
          const targetRow = targetId
            ? allIntents.find((i) => String(readCell(i, idHeader) ?? '').trim() === targetId)
            : undefined;
          const faqIntent =
            (targetRow && String(readCell(targetRow, answerHeader) ?? '').trim() ? targetRow : undefined) ??
            allIntents.find((i) => {
              const kw = String(readCell(i, keywordsHeader) ?? '');
              const type = String(readCell(i, typeHeader) ?? '').trim().toLowerCase();
              return type && type !== 'booking' && matchesIntentKeywords(kw, userMessage);
            });
          const answer = faqIntent ? String(readCell(faqIntent, answerHeader) ?? '').trim() : '';
          return {
            text: answer || 'I could not find anything matching that.',
            sheet: state,
            toolCalls,
            slotExtractionAttempts,
            fallbackUsed,
            ...(reasoningTrace ? { reasoningDecision: reasoningTrace } : {}),
            ...(answer ? {} : { conversational: true, unanswered: true }),
          };
        }
      }

      // action === 'ask_clarification' or reasoning unavailable → fall through to
      // deterministic fallback logic below (check for Fallback intent, then schedule search).

      // ── Deterministic fallback: check for a Fallback (catch-all) intent ──
      const allIntentsForFallback = intentsTable ?? (await readRows(sheet, intentsTab));
      const fallbackIntent = allIntentsForFallback.find(
        (i) => String(readCell(i, typeHeader) ?? '').trim().toLowerCase() === 'fallback'
      );

      if (fallbackIntent) {
        // Extract slots from the user's message via the LLM.
        const emptyChecklist: HarnessChecklist = { required: [], derived: [] };
        const round1 = await askModel(
          client,
          buildHarnessPrompt(systemPrompt ?? '', emptyChecklist, state.slots, userMessage)
        );
        slotExtractionAttempts += round1.attempts;
        const extractedSlots = round1.decision.updated_slots ?? {};

        // Merge extracted slots into state for the verification question.
        const mergedSlots = { ...state.slots, ...extractedSlots };

        // Ask the fallback verification question with slot substitution.
        const verification = String(readCell(fallbackIntent, verificationHeader) ?? '').trim();
        const text = substituteSlots(verification, mergedSlots) || verification || 'Could you confirm?';

        state.pendingFallbackId = String(readCell(fallbackIntent, idHeader) ?? '');
        state.awaitingFallbackVerification = true;
        state.fallbackExtractedSlots = extractedSlots;

        return {
          text,
          sheet: state,
          toolCalls,
          slotExtractionAttempts,
          fallbackUsed,
          ...(reasoningTrace ? { reasoningDecision: reasoningTrace } : {}),
        };
      }

      // No fallback intent. If a schedule exists, ask the model to extract
      // structured constraints; the CODE filters, the model never scans cells.
      const allSteps = await readRows(sheet, stepsTab);
      const fallbackMap = deriveScheduleMap(
        allSteps,
        {
          stepType: stepTypeHeader,
          source: sourceHeader,
          filter: filterHeader,
          extract: extractHeader,
        },
        sheet
      );

      if (fallbackMap) {
        const emptyChecklist: HarnessChecklist = { required: [], derived: [] };
        // Round 1: ask the model to extract structured search constraints.
        const round1 = await askModel(
          client,
          buildHarnessPrompt(systemPrompt ?? '', emptyChecklist, state.slots, userMessage)
        );
        slotExtractionAttempts += round1.attempts;

        // When the reasoning step couldn't decide (ask_clarification), use the
        // slots it extracted as structured search constraints.
        const searchFromReasoning: ScheduleSearch = {};
        if (reasoning?.slots.department) searchFromReasoning.category = reasoning.slots.department;
        if (reasoning?.slots.location) searchFromReasoning.location = reasoning.slots.location;
        if (reasoning?.slots.doctor_name) searchFromReasoning.name = reasoning.slots.doctor_name;

        const search =
          round1.decision.action === 'search_schedule'
            ? round1.decision.search
            : searchFromReasoning;

        // Persist the constraints and any entity selection before searching.
        commitSearchConstraints(state, search);
        // The sheet's own booking checklist, used to ask the next slot.
        const fallbackChecklist = deriveChecklist(allSteps, {
          slot: slotHeader,
          expected: expectedHeader,
          options: optionsHeader,
          validation: validationHeader,
          question: questionHeader,
          filter: filterHeader,
          fallback: fallbackHeader,
          stepType: stepTypeHeader,
        });
        const selected = commitEntitySelection(
          state,
          userMessage,
          fallbackMap,
          fallbackChecklist.derived[0] ?? ENTITY_SLOTS[0]
        );
        const locationSelected = commitLocationSelection(state, userMessage, fallbackMap);
        if (selected && round1.decision.action !== 'complete') {
          // The customer already picked an entity from the last results — do NOT
          // search again. Ask for the next slot using the sheet's own question.
          const nextSlot = firstMissing(state.slots, fallbackChecklist);
          if (nextSlot) {
            const question = noBarePlaceholders(defaultQuestion(nextSlot), state.slots);
            const entity = filledFrom(
              state.slots,
              fallbackChecklist.derived.length ? fallbackChecklist.derived : ENTITY_SLOTS
            );
            const text = [entity ? `Got it — ${entity}.` : 'Got it.', question].filter(Boolean).join(' ');
            return { text, sheet: state, toolCalls, slotExtractionAttempts, fallbackUsed, ...(reasoningTrace ? { reasoningDecision: reasoningTrace } : {}) };
          }
        }

        // A branch follow-up narrows the previous search even when the model only
        // answered "Let me check…" without returning a structured search.
        const effectiveSearch = mergeSearchWithSlots(search ?? {}, state.slots);
        if (locationSelected || hasStructuredSearch(search)) {
          const rows = await readRows(sheet, fallbackMap.source);
          const matched = filterRowsStructured(rows, effectiveSearch, fallbackMap);
          toolCalls.push({
            name: 'lookup_sheet',
            args: { tab: fallbackMap.source, filter: `search ${JSON.stringify(effectiveSearch)}` },
            rows: matched.length,
          });
          const results = serializeSearchResults(matched, fallbackMap);
          if (matched.length > 0) {
            state.lastSearch = results;
            const round2 = await askModel(
              client,
              buildHarnessPrompt(systemPrompt ?? '', emptyChecklist, state.slots, userMessage, undefined, results)
            );
            slotExtractionAttempts += round2.attempts;
            const rawReply = round2.decision.next_question?.trim() || summarizeRows(matched, fallbackMap);
            const guided = guidedQuestion(firstMissing(state.slots, fallbackChecklist), state.slots);
            const body = guided
              ? stripTrailingQuestions(noBarePlaceholders(rawReply, state.slots))
              : noBarePlaceholders(rawReply, state.slots);
            const text =
              guided && !body.includes(guided)
                ? [body, guided].filter(Boolean).join('\n\n')
                : body || guided || 'I could not find anything matching that.';
            return { text, sheet: state, toolCalls, slotExtractionAttempts, fallbackUsed, ...(reasoningTrace ? { reasoningDecision: reasoningTrace } : {}) };
          }

          // Structured search with no matches: report the gap, do not reuse an
          // unrelated previous result.
          return {
            text: 'I could not find anything matching that.',
            sheet: state,
            toolCalls,
            slotExtractionAttempts,
            fallbackUsed,
            unanswered: true,
            ...(reasoningTrace ? { reasoningDecision: reasoningTrace } : {}),
          };
        }

        // No structured constraint. A follow-up about the previous search
        // ("At which branch?") reuses it; anything else goes to the free-form path.
        if (state.lastSearch) {
          const round2 = await askModel(
            client,
            buildHarnessPrompt(systemPrompt ?? '', emptyChecklist, state.slots, userMessage, undefined, state.lastSearch)
          );
          slotExtractionAttempts += round2.attempts;
          const text = noBarePlaceholders(round2.decision.next_question?.trim() || state.lastSearch, state.slots);
          return { text, sheet: state, toolCalls, slotExtractionAttempts, fallbackUsed, ...(reasoningTrace ? { reasoningDecision: reasoningTrace } : {}) };
        }

        // The model tried to search but produced no usable constraint. Ask for
        // clarification rather than guessing — but only when this really looks
        // like a search/availability request.
        if (
          round1.decision.action === 'search_schedule' &&
          (looksLikeSearchQuery(userMessage) || looksLikeAvailabilityQuery(userMessage))
        ) {
          return {
            text: 'Could you tell me the specialty, branch, or doctor you are looking for?',
            sheet: state,
            toolCalls,
            slotExtractionAttempts,
            fallbackUsed,
            ...(reasoningTrace ? { reasoningDecision: reasoningTrace } : {}),
          };
        }
      }

      return { text: '', sheet: state, toolCalls, slotExtractionAttempts, fallbackUsed, conversational: true, unanswered: true, ...(reasoningTrace ? { reasoningDecision: reasoningTrace } : {}) };
    }

    const intent = intents[0];
    state.intentId = String(intent[idHeader] ?? '').trim();

    // Intent type gate: a non-Booking intent answers directly (no checklist).
    const intentType = String(readCell(intent, typeHeader) ?? '').trim();
    if (intentType && !/^booking$/i.test(intentType)) {
      // Verification-first (non-booking only): ask the owner's verification
      // question before returning the answer.
      const verification = String(readCell(intent, verificationHeader) ?? '').trim();
      if (verification) {
        state.pendingIntentId = state.intentId;
        state.intentId = null;
        state.awaitingVerification = true;
        return {
          text: verification,
          sheet: state,
          toolCalls,
          slotExtractionAttempts,
          fallbackUsed,
        };
      }
      const answer = substituteSlots(String(readCell(intent, answerHeader) ?? '').trim(), state.slots);
      return {
        text: answer || '',
        sheet: freshHarnessState(),
        toolCalls,
        slotExtractionAttempts,
        fallbackUsed,
        ...(answer ? {} : { conversational: true, unanswered: true }),
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

  const scheduleMap = deriveScheduleMap(
    steps,
    {
      stepType: stepTypeHeader,
      source: sourceHeader,
      filter: filterHeader,
      extract: extractHeader,
    },
    sheet
  );

  // Snapshot the question this turn is about to ask, BEFORE the confirm/prefill
  // blocks can fill anything. The final ask compares against it to tell "the
  // customer answered a different question" from "the flow starts now".
  const askedSlot = firstMissing(state.slots, checklist);
  const slotsBeforeTurn = { ...state.slots };

  /**
   * A lookup came back with no rows. Never answer "I could not find anything
   * matching that." — route to the `alternate_step` the owner declared for that
   * lookup (e.g. "Would you like to try another location?"), and when the sheet
   * declares none, ask for a different value. Universal: a doctor, a property
   * or a product behave the same way.
   */
  const emptyLookupTurn = (): SheetTurn => {
    const alternate = lookupAlternateQuestion(
      steps,
      {
        stepType: stepTypeHeader,
        stepId: stepIdHeader,
        alternate: alternateStepHeader,
        question: questionHeader,
      },
      state.slots
    );
    return {
      text: alternate ?? "I couldn't find a match. Could you try a different value?",
      sheet: state,
      toolCalls,
      slotExtractionAttempts,
      fallbackUsed: true,
      unanswered: true,
      fallbackReason: 'lookup_empty',
    };
  };

  /**
   * The customer's wording is simply not in the sheet ("Ear Specialist" vs
   * "ENT Surgeon"). Ask the model which of the sheet's options is closest and,
   * when it is confident, offer that option to the customer instead of giving
   * up on the lookup. No synonym list is hardcoded — the model does the
   * matching, so the rule works for any business.
   */
  const suggestSemanticMatch = async (params: {
    requested: string;
    options: string[];
    slotName: string;
    kind: 'search' | 'lookup';
    search?: Record<string, any>;
    filter?: Record<string, any>;
  }): Promise<SheetTurn | null> => {
    const requested = String(params.requested ?? '').trim();
    if (!requested || params.options.length === 0) return null;
    const suggested = await findSemanticMatch(client, requested, params.options);
    if (!suggested) return null;
    // A suggestion that is what the customer already said is no suggestion —
    // it would only loop. Fall through to the owner's alternate step.
    if (suggested.toLowerCase() === requested.toLowerCase()) return null;

    // The sheet's own entity column names the noun ("Doctor", "Property").
    const entity = String(scheduleMap?.doctorColumn ?? 'specialist').toLowerCase();
    const question = semanticMatchQuestion(entity, requested, suggested);

    state.pendingMatch = {
      slotName: params.slotName,
      requestedValue: requested,
      suggestedValue: suggested,
      question,
      kind: params.kind,
      ...(params.search ? { search: params.search } : {}),
      ...(params.filter ? { filter: params.filter } : {}),
      source: 'conversational',
      askedAt: new Date().toISOString(),
    };

    return {
      text: question,
      sheet: state,
      toolCalls,
      slotExtractionAttempts,
      fallbackUsed,
    };
  };

  // A lookup the customer approved by answering "Yes" to our suggestion: it
  // runs again with the option the sheet actually has.
  let forcedLookup: { filter: Record<string, any> } | null = null;
  let forcedSearch: Record<string, any> | null = null;

  // ── Semantic match accepted ("Yes") ────────────────────────────────────────
  if (state.pendingMatch) {
    const pending = state.pendingMatch;
    const confirmation = confirmIntent(userMessage);
    if (confirmation === 'yes') {
      // Rewrite the slot with the option the sheet has, then let the turn
      // continue: the lookup runs again with the corrected value.
      state.pendingMatch = null;
      state.slots[pending.slotName] = pending.suggestedValue;
      if (pending.kind === 'search') {
        forcedSearch = { ...(pending.search ?? {}), category: pending.suggestedValue };
      } else {
        forcedLookup = {
          filter: { ...(pending.filter ?? {}), department: pending.suggestedValue },
        };
      }
    } else if (confirmation === 'no') {
      // The customer does not want the suggestion → the owner's alternate step.
      state.pendingMatch = null;
      return emptyLookupTurn();
    } else {
      // Not a clear answer → ask the same question again.
      return {
        text: pending.question,
        sheet: state,
        toolCalls,
        slotExtractionAttempts,
        fallbackUsed,
      };
    }
  }

  // ── Deterministic confirmation (the confirm step's Yes/No) ──────────────────
  // Handled in code, never by the LLM. "Yes"/"Sure"/"Yeah" → confirm = "Yes" and
  // advance to the next slot; "No"/"Cancel" → reset. This prevents both the
  // confirm loop and the model misreading "Sure" as a doctor name.
  if (confirmSlotPending(checklist, state.slots)) {
    const confirmation = confirmIntent(userMessage);
    if (confirmation === 'yes') {
      state.slots.confirm = 'Yes';
      return {
        text: noBarePlaceholders(defaultQuestion(firstMissing(state.slots, checklist)), state.slots),
        sheet: state,
        toolCalls,
        slotExtractionAttempts,
        fallbackUsed,
      };
    }
    if (confirmation === 'no') {
      state.slots.confirm = 'No';
      state.intentId = null;
      state.pendingIntentId = null;
      state.awaitingVerification = false;
      return {
        text: 'No problem — how can I help you?',
        sheet: state,
        toolCalls,
        slotExtractionAttempts,
        fallbackUsed,
      };
    }
  }

  // ── Deterministic option pre-fill (list / buttons) ─────────────────────────
  // "Dental" → department, "Riffa" → location, "Yes" → confirm — filled in code
  // from the owner's `options` vocabulary, before the (unreliable) LLM extract.
  prefillOptionsSlots(steps, userMessage, state.slots, {
    slot: slotHeader,
    expected: expectedHeader,
    options: optionsHeader,
  });

  // ── Context switch: a mid-booking FAQ / general question ───────────────────
  // The customer is mid-flow (intentId set) but this message matches a DIFFERENT
  // non-booking intent. Answer it verbatim WITHOUT touching state.slots, then
  // re-ask the current step's ai_question.
  {
    const strict = await readRows(sheet, intentsTab, { column: keywordsHeader, value: userMessage });
    let faq = strict.find((i) => {
      const t = String(readCell(i, typeHeader) ?? '').trim();
      return t && !/^booking$/i.test(t);
    });
    if (!faq) {
      const allIntents = await readRows(sheet, intentsTab);
      faq = allIntents.find((i) => {
        const t = String(readCell(i, typeHeader) ?? '').trim();
        return t && !/^booking$/i.test(t) && matchesIntentKeywords(readCell(i, keywordsHeader), userMessage);
      });
    }
    if (faq) {
      const answer = substituteSlots(String(readCell(faq, answerHeader) ?? '').trim(), state.slots);
      if (answer) {
        const resume = noBarePlaceholders(defaultQuestion(firstMissing(state.slots, checklist)), state.slots);
        return {
          text: [answer, resume].filter(Boolean).join('\n\n'),
          sheet: state,
          toolCalls,
          slotExtractionAttempts,
          fallbackUsed,
        };
      }
    }
  }

  /**
   * Run a structured search end-to-end: the CODE filters, the model only renders.
   * Never passes un-filtered rows to the LLM.
   */
  const executeSearch = async (search: ScheduleSearch): Promise<SheetTurn> => {
    if (!scheduleMap) {
      return {
        text: "I couldn't find a match. Could you try a different value?",
        sheet: state,
        toolCalls,
        slotExtractionAttempts,
        fallbackUsed: true,
        unanswered: true,
        fallbackReason: 'lookup_empty',
      };
    }

    // A location/day-only follow-up narrows the previous search (urologist +
    // Riffa), instead of widening it to every doctor at that branch.
    const effectiveSearch = mergeSearchWithSlots(search, state.slots);
    const allRows = await readRows(sheet, scheduleMap.source);
    const rows = filterRowsStructured(allRows, effectiveSearch, scheduleMap);
    toolCalls.push({
      name: 'lookup_sheet',
      args: { tab: scheduleMap.source, filter: `search ${JSON.stringify(effectiveSearch)}` },
      rows: rows.length,
    });
    // No matches: answer deterministically. Never hand an empty/irrelevant result
    // set to the model, which could invent a doctor or availability. The owner's
    // alternate step decides what the customer hears next — unless the customer
    // simply used another wording for something we DO have.
    if (rows.length === 0) {
      const requested = String(effectiveSearch.category ?? '').trim();
      if (requested) {
        const slotName = CATEGORY_SLOTS.find((s) => isFilled(state.slots, s)) ?? 'department';
        const suggestion = await suggestSemanticMatch({
          requested,
          options: semanticOptions(allRows, scheduleMap, {
            location: effectiveSearch.location,
          }),
          slotName,
          kind: 'search',
          search: { ...effectiveSearch },
        });
        if (suggestion) return suggestion;
      }
      return emptyLookupTurn();
    }

    const searchResults = serializeSearchResults(rows, scheduleMap);
    state.lastSearch = searchResults;

    const searchRound = await askModel(
      client,
      buildHarnessPrompt(systemPrompt ?? '', checklist, state.slots, userMessage, undefined, searchResults)
    );
    slotExtractionAttempts += searchRound.attempts;

    // If the model hallucinated ("Let me check…") without listing a result, fall
    // back to a deterministic summary so the customer still gets the matches.
    const naturalReply = searchRound.decision.next_question?.trim() ?? '';
    const hallucinated =
      /\b(check|checking|look into|looking|searching|one moment|one sec|moment)\b/i.test(naturalReply) &&
      !/\b(?:dr|villa|property|room|apartment|office|unit|specialist|consultant)\b/i.test(naturalReply);
    const rawBody =
      naturalReply && !hallucinated ? naturalReply : summarizeRows(rows, scheduleMap);

    // The owner's ai_question for the next missing slot is the only question the
    // customer may see — drop any question the model invented and append it.
    const nextSlot = firstMissing(state.slots, checklist);
    const guided = guidedQuestion(nextSlot, state.slots);
    const body = guided
      ? stripTrailingQuestions(noBarePlaceholders(rawBody, state.slots))
      : noBarePlaceholders(rawBody, state.slots);
    const text =
      guided && !body.includes(guided)
        ? [body, guided].filter(Boolean).join('\n\n')
        : body || guided || 'I could not find anything matching that.';
    return { text, sheet: state, toolCalls, slotExtractionAttempts, fallbackUsed };
  };

  // ── Round 1: the model extracts + decides ────────────────────────────────
  let round = await askModel(client, buildHarnessPrompt(systemPrompt ?? '', checklist, state.slots, userMessage));
  let decision = round.decision;
  slotExtractionAttempts += round.attempts;

  // If the customer typed a bare time token ("PM", "5 PM", "evening") while a time
  // slot is still missing and the model did not extract it (treating it as a
  // greeting instead), force it into the time slot so the deterministic time
  // validation below can accept or reject it.
  const pendingTimeSlot = checklist.required.find(
    (s) => TIME_SLOT_KEYS.has(normalizeSlotKey(s.name)) && !isFilled(state.slots, s.name)
  );
  if (pendingTimeSlot && looksLikeTimeToken(userMessage)) {
    const hasTimeExtract = Object.keys(decision.updated_slots ?? {}).some((k) =>
      TIME_SLOT_KEYS.has(normalizeSlotKey(k))
    );
    if (!hasTimeExtract) {
      decision.updated_slots = { ...(decision.updated_slots ?? {}), [pendingTimeSlot.name]: userMessage };
    }
  }

  mergeSlots(state.slots, decision.updated_slots, checklist);

  // ── State commitment: selections are slot fills, not new searches ──────────
  // Persist the model's structured constraints (e.g. "Riffa") and, if the
  // customer names an entity from the previous results (e.g. "Shankar"), save
  // the FULL name + branch. A selected entity must never trigger another search.
  commitSearchConstraints(state, decision.search, checklist);
  const selectedFromSearch = scheduleMap
    ? commitEntitySelection(state, userMessage, scheduleMap, checklist.derived[0] ?? ENTITY_SLOTS[0])
    : false;
  const locationFromSearch = scheduleMap
    ? commitLocationSelection(state, userMessage, scheduleMap)
    : false;

  if (selectedFromSearch && decision.action !== 'complete') {
    // Advance to the next missing slot instead of looping on a filled one.
    const missing = firstMissing(state.slots, checklist);
    if (missing) {
      return {
        text: noBarePlaceholders(defaultQuestion(missing), state.slots),
        sheet: state,
        toolCalls,
        slotExtractionAttempts,
        fallbackUsed,
      };
    }
  }

  // The customer named a branch from the previous results but the model did not
  // search ("Let me check…"). Run the narrowed search deterministically instead
  // of answering with a promise and losing the branch.
  if (locationFromSearch && decision.action !== 'complete') {
    return executeSearch({});
  }

  // A search the customer approved by answering "Yes" to our suggestion runs
  // first, with the option the sheet actually has.
  if (forcedSearch) {
    return executeSearch(forcedSearch as ScheduleSearch);
  }

  // ── Knowledge / availability query: structured search ──────────────────────
  // The model returns structured constraints; the CODE does the AND-filtering.
  // There is no full-text fallback: without a structured constraint we ask the
  // customer to clarify instead of guessing.
  if (decision.action === 'search_schedule' || hasStructuredSearch(decision.search)) {
    if (!hasStructuredSearch(decision.search)) {
      return {
        text: 'Could you tell me the specialty, branch, or doctor you are looking for?',
        sheet: state,
        toolCalls,
        slotExtractionAttempts,
        fallbackUsed,
      };
    }
    return executeSearch(decision.search!);
  }

  // Deterministic availability guard: the model sometimes answers "may I have
  // your name?" without checking the schedule. If the customer asked a QUESTION
  // and we already know a category/location/day, search anyway — never let the
  // LLM invent availability.
  //
  // It must never hijack an ANSWER to the slot we just asked for. "5 PM today"
  // is the customer filling `datetime`, not a request for availability, and
  // "today" must not be read as one. The model's own structural signal decides:
  // if it extracted a slot value, trust it (validateSlotValue will reject a bad
  // value and the flow re-asks that slot); only a question that produced no slot
  // value reaches the schedule search.
  const extractedThisTurn = Object.keys(decision.updated_slots ?? {});
  if (
    decision.action !== 'complete' &&
    scheduleMap &&
    extractedThisTurn.length === 0 &&
    isQuestionMessage(userMessage)
  ) {
    const derivedSearch = searchFromSlots(state.slots, userMessage);
    if (hasStructuredSearch(derivedSearch)) {
      return executeSearch(derivedSearch);
    }
  }

  // ── Auto doctor lookup: deduce department + location ──────────────────────
  // (deterministic — the harness does not trust the model to remember to look it up)
  let lookupText: string | undefined;
  const doctorName = isFilled(state.slots, 'doctor_name') ? String(state.slots.doctor_name) : '';
  const needsDoctorLookup =
    doctorName !== '' && (!isFilled(state.slots, 'department') || !isFilled(state.slots, 'location'));

  if (needsDoctorLookup && scheduleMap) {
    const rows = await scheduleLookup(readRows, sheet, scheduleMap, { doctor: doctorName });
    toolCalls.push({ name: 'lookup_sheet', args: { tab: scheduleMap.source, filter: `doctor=${doctorName}` }, rows: rows.length });
    // The named doctor is not in the schedule → the owner's alternate step.
    if (rows.length === 0) return emptyLookupTurn();
    const row = rows[0];
    if (!isFilled(state.slots, 'department')) state.slots.department = readCell(row, scheduleMap.departmentColumn);
    if (!isFilled(state.slots, 'location')) state.slots.location = readCell(row, scheduleMap.branchColumn);
    lookupText = formatScheduleRow(row, scheduleMap);
  }

  // ── Model-requested lookup (availability / no doctor known) ───────────────
  if (!lookupText && (decision.tool_call === 'lookup_schedule' || forcedLookup) && scheduleMap) {
    const filter = forcedLookup ? forcedLookup.filter : (decision.lookup ?? {});
    const rows = await scheduleLookup(readRows, sheet, scheduleMap, filter);
    toolCalls.push({ name: 'lookup_sheet', args: { tab: scheduleMap.source, filter: JSON.stringify(filter) }, rows: rows.length });
    if (rows.length === 0) {
      // The customer's wording may be another way of saying something we DO
      // have ("Ear Specialist" → "ENT Surgeon"). Offer the closest option
      // before falling back to the owner's alternate step.
      const requested = String(filter.department ?? (filter as Record<string, any>).category ?? '').trim();
      if (requested) {
        const allRows = await readRows(sheet, scheduleMap.source);
        const slotName = CATEGORY_SLOTS.find((s) => isFilled(state.slots, s)) ?? 'department';
        const suggestion = await suggestSemanticMatch({
          requested,
          options: semanticOptions(allRows, scheduleMap, {
            location: filter.location,
          }),
          slotName,
          kind: 'lookup',
          filter: { ...filter },
        });
        if (suggestion) return suggestion;
      }
      // The Workflow_Steps lookup found nothing → the owner's alternate step
      // ("try another location") decides what happens next.
      return emptyLookupTurn();
    }
    lookupText = formatScheduleRow(rows[0], scheduleMap);
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

  // ── Generic time validation ────────────────────────────────────────────────
  // Two layers, both business-agnostic:
  //   1. a filled time slot must contain a parseable time (a digit) — reject "PM",
  //      "today" or "tomorrow" with no specific time;
  //   2. when a `lookup` step exists, the time must fall within the matched
  //      schedule row's hours column (Available_Times / Viewing_Hours / …).
  const timeSlot = findTimeSlot(state.slots);
  if (timeSlot) {
    const timeText = String(state.slots[timeSlot]);
    const requested = parseRequestedTime(timeText);
    if (requested === undefined) {
      fallbackUsed = true;
      delete state.slots[timeSlot];
      return {
        text: 'Please provide a specific time (e.g., 5 PM).',
        sheet: state,
        toolCalls,
        slotExtractionAttempts,
        fallbackUsed,
        fallbackReason: 'invalid_time',
      };
    }

    if (scheduleMap) {
      const timeFilter = {
        department: isFilled(state.slots, 'department') ? String(state.slots.department) : undefined,
        location: isFilled(state.slots, 'location') ? String(state.slots.location) : undefined,
        doctor: isFilled(state.slots, 'doctor_name') ? String(state.slots.doctor_name) : undefined,
      };
      const rows = await scheduleLookup(readRows, sheet, scheduleMap, timeFilter);
      const row = rows[0];

      // The lookup found nothing for the customer's own wording. It may simply
      // be another way of saying something we DO have ("Ear Specialist" →
      // "ENT Surgeon") — offer the closest option instead of failing silently.
      if (rows.length === 0) {
        const requestedCategory = String(timeFilter.department ?? '').trim();
        if (requestedCategory) {
          const allRows = await readRows(sheet, scheduleMap.source);
          const slotName = CATEGORY_SLOTS.find((s) => isFilled(state.slots, s)) ?? 'department';
          const suggestion = await suggestSemanticMatch({
            requested: requestedCategory,
            options: semanticOptions(allRows, scheduleMap, { location: timeFilter.location }),
            slotName,
            kind: 'lookup',
            filter: { department: requestedCategory, location: timeFilter.location },
          });
          if (suggestion) return suggestion;
        }
      }

      // Day-off check: the requested weekday must not be the entity's day off.
      const requestedDay = resolveDay(timeText);
      if (row && requestedDay && dayOffBlocks(row, requestedDay, scheduleMap)) {
        fallbackUsed = true;
        delete state.slots[timeSlot];
        return {
          text: `The requested day (${requestedDay}) is not available for that booking. Could you please choose another day?`,
          sheet: state,
          toolCalls,
          slotExtractionAttempts,
          fallbackUsed,
          fallbackReason: 'day_conflict',
        };
      }

      const hoursValue = scheduleHoursValue(row, scheduleMap);
      const windows = hoursValue ? parseTimeWindows(hoursValue) : [];
      if (windows.length > 0 && !isWithinWindow(requested, windows)) {
        fallbackUsed = true;
        delete state.slots[timeSlot];
        return {
          text: `The requested time (${timeText}) is not within the available schedule (${hoursValue}). Could you please choose a time within those hours?`,
          sheet: state,
          toolCalls,
          slotExtractionAttempts,
          fallbackUsed,
          fallbackReason: 'time_conflict',
        };
      }
    }
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
    return {
      text,
      sheet: freshHarnessState(),
      completed: true,
      completedSlots: { ...state.slots },
      toolCalls,
      slotExtractionAttempts,
      fallbackUsed,
    };
  }

  const missing = firstMissing(state.slots, checklist);
  const guided = guidedQuestion(missing, state.slots);
  const modelText = noBarePlaceholders(decision.next_question || defaultQuestion(missing), state.slots);
  // The owner\'s ai_question is the only question allowed, and the harness owns
  // it: the model may only add a short acknowledgement in front of it. When
  // the model repeated the question anyway, it appears exactly once.
  let text = composeCustomerMessage(modelText, guided);

  // Empty LLM response guard: never send `[]`, `{}`, or whitespace to the user.
  // Re-ask the current step's question instead.
  if (!text || /^\s*(?:\[|\{|\[|\{\s*)\s*$/.test(text) || /^\s*\[\s*\]\s*$/.test(text)) {
    text = guided || defaultQuestion(missing);
    text = noBarePlaceholders(text, state.slots) || `Could you please provide your ${missing?.name ?? 'the required information'}.`;
  }

  // Nonsense mid-flow guard: the customer was already mid-booking, we asked for a
  // slot with a fixed list of options, and their reply matched none of them.
  // Re-asking the identical question is a loop; say so once, helpfully.
  const filledThisTurn = Object.keys(state.slots).some(
    (name) => !isFilled(slotsBeforeTurn, name) && isFilled(state.slots, name)
  );
  if (
    intentWasActive &&
    askedSlot?.options?.length &&
    missing?.name === askedSlot.name &&
    !filledThisTurn &&
    !matchWholeWordOption(userMessage, askedSlot.options) &&
    !String(userMessage ?? '').includes('?')
  ) {
    return {
      text: "I didn't understand that. Could you please choose from the available options?",
      sheet: state,
      toolCalls,
      slotExtractionAttempts,
      fallbackUsed: true,
      fallbackReason: 'invalid_option',
    };
  }

  return { text, sheet: state, toolCalls, slotExtractionAttempts, fallbackUsed };
}
