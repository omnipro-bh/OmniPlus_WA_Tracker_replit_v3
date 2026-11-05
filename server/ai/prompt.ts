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
  const answerCol = headerFor(intentsTab, 'answer');
  const intentIdCol = headerFor(stepsTab, 'intent_id');
  const questionCol = headerFor(stepsTab, 'ai_question');

  return [
    'GOOGLE SHEETS DATA SOURCE:',
    `You have a Google Sheet with these tabs: ${tabs.map((t) => `"${t}"`).join(', ')}.`,
    `- "${intentsTab}" columns: ${AI_SHEET_TAB_SCHEMA[0].columns
      .map((c) => headerFor(intentsTab, c.key))
      .join(', ')}.`,
    `- "${stepsTab}" columns: ${AI_SHEET_TAB_SCHEMA[1].columns
      .map((c) => headerFor(stepsTab, c.key))
      .join(', ')}.`,
    '',
    'RULES:',
    `1. When the customer asks a question, FIRST call lookup_sheet({ tab: "${intentsTab}", filter_column: "${keywordsCol}", filter_value: <keyword from their message> }) to find the matching intent.`,
    `2. Then call lookup_sheet({ tab: "${stepsTab}", filter_column: "${intentIdCol}", filter_value: <the "${headerFor(intentsTab, 'id')}" of the intent found in step 1> }) to load its steps.`,
    `3. Follow the step sequence: ask each "${questionCol}" in order, wait for the customer's reply, and verify the input before giving the final answer ("${answerCol}").`,
    '4. Use verify-before-answer for anything that needs confirmation (identity, account, order details). Never answer such questions from memory.',
    '5. Answer ONLY from the rows the sheet returned. If no row matches, say you do not have that information and offer to connect a human.',
    '6. Never invent rows, prices or policies that are not in the sheet.',
  ].join('\n');
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
