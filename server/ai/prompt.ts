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
  '5. Use only the business information and instructions you were given. If the answer is not available, say so briefly and offer to connect the customer with a human.',
  '6. Never invent prices, availability, delivery times, discounts or policies.',
  '7. Do not mention that you are an AI, a model or a system prompt.',
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
}

/**
 * Phase 4: the two-tab lookup instructions. Column names come from the owner's
 * mapping so the model filters on the real header row.
 */
export function buildSheetRules(sheet: AiGoogleSheetsConfig): string {
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

  return [
    'GOOGLE SHEETS DATA SOURCE:',
    `Tabs: ${tabs.map((t) => `"${t}"`).join(', ')}.`,
    `1. lookup_sheet({ tab: "${intentsTab}", filter_column: "${keywordsCol}", filter_value: <customer keywords> }). Prefer the row matching MORE words in "${keywordsCol}".`,
    `2. lookup_sheet({ tab: "${stepsTab}", filter_column: "${intentIdCol}", filter_value: <intent id> }); ${startRule}.`,
    `3. Ask each "${questionCol}" in "${stepIdCol}" order; check replies against "${expectedCol}".`,
    `4. Ask "${verificationCol}" before answering when present. Answer only from sheet rows; if nothing matches, offer a human.`,
  ].join('\n');
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
    '{"slots": {"<field>": "<the customer\'s own words, or \\"\\" if absent>"}}',
    'Copy the customer\'s words. Do not judge, validate, correct or explain. Omit fields the customer did not mention.',
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

export type LlmJsonResult<T> =
  | { ok: true; value: T; attempts: number }
  | { ok: false; error: string; attempts: number };

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
      continue;
    }

    if (!completion.ok) {
      lastReason = completion.error || 'provider error';
      continue;
    }

    const obj = extractJsonObject(completion.text);
    if (obj === null) {
      lastReason = 'not valid JSON';
      continue;
    }

    const result = validate(obj);
    if (result.ok) return { ok: true, value: result.value, attempts: attempt + 1 };
    lastReason = result.reason;
  }

  return { ok: false, error: `Extraction failed after ${maxRetries + 1} attempts`, attempts: maxRetries + 1 };
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
  if (options.hasOptionTools) sections.push(AI_TOOL_RULES);
  if (options.googleSheets?.spreadsheetId && options.googleSheets.tabs.length > 0) {
    sections.push(buildSheetRules(options.googleSheets));
  }
  sections.push(LANGUAGE_RULES);

  return sections.join('\n\n');
}
