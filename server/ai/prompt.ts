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
import type { AiGoogleSheetsConfig } from './types';

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

/**
 * Task 5b: build the turn-1 slot-extraction prompt. Asks the LLM to pull the
 * listed slot names out of the customer's message and return strict JSON.
 */
export function buildSlotExtractionPrompt(slots: string[], userMessage: string): string {
  const fields = (Array.isArray(slots) ? slots : []).map((s) => String(s).trim()).filter(Boolean);
  return [
    'Extract the following fields from the customer message. Output STRICT JSON only — no markdown, no prose.',
    '',
    `Fields: ${fields.join(', ')}`,
    '',
    `Customer message: "${userMessage}"`,
    '',
    'Return only a JSON object:',
    '{"slots": {"<field>": "<value>", ...}, "confidence": 0.9, "missing": ["<fields not found>"]}',
    'Only include fields the customer actually provided. "confidence" is your certainty from 0 to 1.',
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

/**
 * Build the full system prompt: identity + owner instructions + language rules.
 * Always returns a usable prompt, even when the owner left the field empty.
 */
export function buildSystemPrompt(options: BuildSystemPromptOptions = {}): string {
  const ownerPrompt = (options.ownerPrompt ?? '').trim();
  const businessName = (options.businessName ?? '').trim();
  const channel = options.channel ?? 'whatsapp';
  const extraRules = (options.extraRules ?? '').trim();

  const identity = businessName
    ? `You are the customer support assistant for ${businessName}.`
    : 'You are a customer support assistant.';

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
