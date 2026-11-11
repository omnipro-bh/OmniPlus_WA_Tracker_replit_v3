/**
 * Phase 1 AI Agent node — system prompt construction.
 *
 * The owner writes the business part; these language rules are always appended
 * and cannot be overridden by the node config. Detection is deliberately NOT a
 * separate model call: "Arabic in → Arabic out" is enforced by instruction, and
 * the trimmed history (contextBuilder.ts) already carries the customer's own
 * language as an example.
 *
 * Phase 2 adds tool/button instructions and PII redaction here.
 *
 * Phase 2.5: the option-tool rules (`AI_TOOL_RULES`) are appended whenever the
 * node declares buttons or list rows. They tell the model not to re-send a menu
 * after a click; the executor's tool-stripping guard enforces it in code.
 */

import { AI_SHEET_TAB_SCHEMA, AI_TOOL_RULES } from '@shared/ai-defaults';
import type { AiStudioPersona } from '@shared/ai-defaults';
import { normalizeInputType, normalizeOptions } from '../workflows/slotValidation';
import type { AiGoogleSheetsConfig, LlmClient, LlmCompletionResult } from './types';

/** Always appended after the owner's prompt. Order matters: last wins. */
export const LANGUAGE_RULES = [
  'LANGUAGE RULES (always follow):',
  '1. Reply in the SAME language as the customer\'s most recent message. Arabic in, Arabic out. English in, English out.',
  '2. If the customer writes in Arabic, reply in Modern Standard Arabic unless they used a clear local dialect, in which case match that dialect.',
  '3. Never mix two languages in one reply, except for brand names, product names and URLs.',
  '4. Keep replies short and conversational, the way a person types on WhatsApp: 1-3 sentences, no markdown, no bullet lists, no headings.',
  '5. Use only the business information and instructions you were given. If a specific business fact is genuinely unknown, say so briefly and offer to connect the customer with a human — but never answer a greeting or small talk with a failure message.',
  '6. Never invent prices, availability, delivery times, discounts or policies.',
  '7. Do not mention that you are an AI, a model or a system prompt.',
].join('\n');

/**
 * Dual-mode brain (Increment G). Appended for every sheet-backed AI node so the
 * model knows the difference between "this message starts/continues a workflow"
 * and "this message is small talk / a general question".
 */
export const CORE_DIRECTIVES = [
  '### Core Directives:',
  '1. **Workflow Logic:** If the customer\'s message matches a workflow intent (for example booking an appointment), you MUST follow the step-by-step sequence defined in the system. Do not deviate from the required slots.',
  '2. **Conversational Fallback:** If the message is a greeting ("Hi", "Hello", "Good afternoon"), a general question ("What are your hours?"), or does not match any workflow intent, do NOT say "I could not find an answer." Instead respond naturally in character from your persona and instructions, be helpful and friendly, then gently guide the conversation back to how you can help (for example booking an appointment).',
].join('\n');

export interface BuildSystemPromptOptions {
  /** The owner's free-text instructions for this node. */
  ownerPrompt?: string;
  /** Optional workflow/business name used as context. */
  businessName?: string;
  /**
   * Increment B — global AI Studio persona. When any field is set, it becomes the
   * assistant's identity (overriding the businessName-derived identity).
   */
  persona?: AiStudioPersona | null;
  /** Where the conversation happens — influences tone/length guidance. */
  channel?: 'whatsapp' | 'web_chat';
  /** Extra instructions appended last (Phase 2 tools, handover, etc.). */
  extraRules?: string;
  /**
   * Phase 2.5: the node declares buttons / list rows, so append the
   * send_buttons / send_list / handover rules (and the "don't re-send a menu
   * after a click" rule).
   */
  hasOptionTools?: boolean;
  /** Phase 4: Google Sheets data source — enables the `lookup_sheet` guidance. */
  googleSheets?: AiGoogleSheetsConfig;
  /**
   * Increment G: no workflow intent matched this message and no flow is active,
   * so the model must reply conversationally (greet / answer from persona) and
   * then guide the customer back — never a "could not find an answer" failure.
   */
  conversationalMode?: boolean;
}

/**
 * Phase 4: the two-tab lookup instructions. Column names come from the owner's
 * mapping so the model filters on the real header row.
 */
export function buildSheetRules(
  sheet: AiGoogleSheetsConfig,
  options: { conversationalMode?: boolean } = {}
): string {
  const headerFor = (tab: string, key: string): string => {
    const override = sheet.columns?.[tab]?.[key];
    if (typeof override === 'string' && override.trim()) return override.trim();
    const schema = AI_SHEET_TAB_SCHEMA.find((t) => t.tab === tab);
    return schema?.columns.find((c) => c.key === key)?.column ?? key;
  };

  const tabs = sheet.tabs.length > 0 ? sheet.tabs : AI_SHEET_TAB_SCHEMA.map((t) => t.tab);
  const intentsTab = tabs.find((t) => /^intents?$/i.test(t)) ?? tabs[0];
  const stepsTab = tabs.find((t) => /step/i.test(t)) ?? tabs[1] ?? tabs[0];

  const keywordsCol = headerFor(intentsTab, 'keywords');
  const startStepCol = headerFor(intentsTab, 'start_step');
  const verificationCol = headerFor(intentsTab, 'verification_question');
  const intentIdCol = headerFor(stepsTab, 'intent_id');
  const stepIdCol = headerFor(stepsTab, 'step_id');
  const questionCol = headerFor(stepsTab, 'ai_question');
  const expectedCol = headerFor(stepsTab, 'expected_input');

  // "Detect Headers" records the real header row, so we only promise a start_step
  // column when the sheet actually has one.
  const headersForIntents = sheet.detected?.[intentsTab];
  const hasStartStep =
    Array.isArray(headersForIntents) && headersForIntents.length > 0
      ? headersForIntents.some((h) => String(h).trim().toLowerCase() === startStepCol.toLowerCase())
      : undefined;

  const startRule =
    hasStartStep === false
      ? `start at the first step (no "${startStepCol}" column)`
      : `start at "${startStepCol}" if set, else the first step`;

  const conversational = options.conversationalMode === true;

  const lines = [
    'GOOGLE SHEETS DATA SOURCE:',
    `Tabs: ${tabs.map((t) => `"${t}"`).join(', ')}.`,
  ];

  if (conversational) {
    // Increment G — the deterministic engine already found no matching intent
    // for this message and no flow is active. Say so explicitly so the model
    // does not fall back to a "could not find an answer" reply.
    lines.push(
      `NO WORKFLOW INTENT MATCHED the customer's last message in "${intentsTab}".`,
      'Reply conversationally NOW: greet the customer or answer their general question from your persona and instructions, then gently guide them back to what you can do (for example booking an appointment). Do not mention intents, steps, tabs or sheets, and never reply that you could not find an answer.'
    );
  }

  lines.push(
    `1. lookup_sheet({ tab: "${intentsTab}", filter_column: "${keywordsCol}", filter_value: <customer keywords> }). Prefer the row matching MORE words in "${keywordsCol}".`,
    `2. lookup_sheet({ tab: "${stepsTab}", filter_column: "${intentIdCol}", filter_value: <intent id> }); ${startRule}.`,
    `3. Ask each "${questionCol}" in "${stepIdCol}" order; check replies against "${expectedCol}".`,
    `4. Ask "${verificationCol}" before answering when present. Answer workflow questions only from sheet rows.`,
    `5. If the message matches no intent row, switch to conversational mode (greet / answer from the persona and instructions) and then guide the customer back. Never invent an answer and never say you could not find one.`
  );

  return lines.join('\n');
}

/** One field to extract on turn 1. `type`/`options` are extraction hints only. */
export interface SlotExtractionField {
  name: string;
  /** Step's `expected_input`; used to decide whether choices are worth listing. */
  type?: string;
  /** Step's `options` cell. NEVER a validity gate — see slotValidation.ts. */
  options?: string[];
}

/**
 * Task 5b: build the turn-1 slot-extraction prompt. The model only copies the
 * customer's own words into strict JSON; code decides what is acceptable. List
 * choices are included as extraction hints so "I need dental" yields "Dental",
 * but the model is told not to judge the value.
 */
export function buildSlotExtractionPrompt(
  fields: SlotExtractionField[],
  userMessage: string
): string {
  const lines = (Array.isArray(fields) ? fields : [])
    .filter((field) => field && String(field.name).trim())
    .map((field) => {
      const name = String(field.name).trim();
      const type = normalizeInputType(field.type);
      const choices = normalizeOptions(field.options);
      const hint = (type === 'list' || type === 'buttons') && choices.length > 0
        ? ` (one of: ${choices.join(', ')})`
        : '';
      return `- ${name}${hint}`;
    });

  return [
    'Extract the following fields from the customer message. Output STRICT JSON only — no markdown, no prose.',
    '',
    'Fields:',
    ...lines,
    '',
    `Customer message: "${userMessage}"`,
    '',
    'Return only a JSON object:',
    '{"slots": {"<field>": "<value>"}}',
    'Rules:',
    '- For each field, return the customer\'s own words.',
    '- If a field lists allowed options and the customer\'s input is a synonym, abbreviation, or typo of one of those options (e.g. "dentist" → "Dental", "adliya" → "Manama"), return the EXACT string from the allowed options list.',
    '- Omit fields the customer did not mention. Do not explain.',
  ].join('\n');
}

/**
 * Tolerant JSON-object extractor: strips code fences, slices from the first `{`
 * to the last `}`, and parses. Returns `null` on any failure so callers can fall
 * back gracefully.
 */
export function extractJsonObject(text: string): any | null {
  if (typeof text !== 'string') return null;
  let s = text.trim();
  s = s.replace(/```(?:json)?/gi, '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

export type LlmJsonErrorKind = 'rate_limit' | 'invalid_json' | 'schema' | 'provider';

export type LlmJsonResult<T> =
  | { ok: true; value: T; attempts: number }
  | { ok: false; error: string; attempts: number; errorKind: LlmJsonErrorKind };

/**
 * A provider 429 / throttling response, as surfaced by the OpenAI-compatible
 * client (`"<message> (HTTP 429)"`). Used to separate an infrastructure failure
 * from a model-output failure — the two must never be conflated.
 */
const RATE_LIMIT_RE = /(rate limit|too many requests|\b429\b)/i;

export function isRateLimitMessage(text: unknown): boolean {
  return typeof text === 'string' && RATE_LIMIT_RE.test(text);
}

/**
 * Ask the LLM for strict JSON and validate it, retrying with a corrective prompt
 * on malformed/invalid output. The validator returns `{ ok: false, reason }` to
 * trigger a retry (bad JSON or missing fields); a business-level "invalid value"
 * should instead be encoded as `{ ok: true, value: ... }` and handled by the
 * caller so it is NOT retried.
 */
export async function llmJson<T>(
  client: LlmClient,
  prompt: string,
  validate: (obj: any) => { ok: true; value: T } | { ok: false; reason: string },
  options: { maxRetries?: number; temperature?: number; maxTokens?: number } = {}
): Promise<LlmJsonResult<T>> {
  const maxRetries = options.maxRetries ?? 2;
  const temperature = options.temperature ?? 0;
  const maxTokens = options.maxTokens ?? 300;
  let lastReason = 'not valid JSON';
  let lastKind: LlmJsonErrorKind = 'invalid_json';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const message =
      attempt === 0
        ? prompt
        : `${prompt}\n\nYour previous response was invalid: ${lastReason}. Return valid JSON only.`;

    let completion: LlmCompletionResult;
    try {
      completion = await client.complete({
        messages: [{ role: 'user', content: message }],
        temperature,
        maxTokens,
      });
    } catch (error: any) {
      lastReason = error?.message || 'provider error';
      lastKind = isRateLimitMessage(lastReason) ? 'rate_limit' : 'provider';
      continue;
    }

    if (!completion.ok) {
      lastReason = completion.error || 'provider error';
      lastKind = isRateLimitMessage(lastReason) ? 'rate_limit' : 'provider';
      continue;
    }

    const obj = extractJsonObject(completion.text);
    if (obj === null) {
      lastReason = 'not valid JSON';
      lastKind = 'invalid_json';
      continue;
    }

    const result = validate(obj);
    if (result.ok) return { ok: true, value: result.value, attempts: attempt + 1 };
    lastReason = result.reason;
    lastKind = 'schema';
  }

  return {
    ok: false,
    error: `Extraction failed after ${maxRetries + 1} attempts`,
    attempts: maxRetries + 1,
    errorKind: lastKind,
  };
}

/**
 * Build the assistant's identity line. A global AI Studio persona (any field set)
 * wins over the business-name default, matching the Increment B prompt shape:
 * `You are {alias}, a {positionTitle}. About the business: {shortDescription}.`
 */
function buildIdentity(persona: AiStudioPersona | null | undefined, businessName: string): string {
  const alias = (persona?.alias ?? '').trim();
  const title = (persona?.title ?? '').trim();
  const description = (persona?.description ?? '').trim();

  if (alias || title || description) {
    let identity = alias ? `You are ${alias}` : 'You are a customer support assistant';
    if (title) identity += `, a ${title}`;
    identity += description ? `. About the business: ${description}` : '.';
    return identity;
  }

  return businessName
    ? `You are the customer support assistant for ${businessName}.`
    : 'You are a customer support assistant.';
}

/**
 * Build the full system prompt: identity + owner instructions + language rules.
 * Always returns a usable prompt, even when the owner left the field empty.
 */
export function buildSystemPrompt(options: BuildSystemPromptOptions = {}): string {
  const ownerPrompt = (options.ownerPrompt ?? '').trim();
  const businessName = (options.businessName ?? '').trim();
  const channel = options.channel ?? 'whatsapp';
  const extraRules = (options.extraRules ?? '').trim();

  const identity = buildIdentity(options.persona, businessName);

  const channelLine =
    channel === 'web_chat'
      ? 'You are replying inside a website chat widget.'
      : 'You are replying on WhatsApp, so keep every reply short and easy to read on a phone.';

  const sections = [identity, channelLine];

  sections.push(
    ownerPrompt
      ? `BUSINESS INSTRUCTIONS:\n${ownerPrompt}`
      : 'BUSINESS INSTRUCTIONS:\nAssist the customer politely and helpfully with their questions.'
  );

  if (extraRules) sections.push(extraRules);

  // Dual-mode brain: only meaningful for a sheet-backed node, where the engine
  // can hand the turn back for a conversational reply.
  const sheetBacked = Boolean(options.googleSheets?.spreadsheetId && options.googleSheets.tabs.length > 0);
  if (sheetBacked) sections.push(CORE_DIRECTIVES);

  if (options.hasOptionTools) sections.push(AI_TOOL_RULES);
  if (sheetBacked) {
    sections.push(
      buildSheetRules(options.googleSheets!, { conversationalMode: options.conversationalMode })
    );
  }
  sections.push(LANGUAGE_RULES);

  return sections.join('\n\n');
}
