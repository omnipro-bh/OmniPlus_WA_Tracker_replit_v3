/**
 * Phase 1 AI Agent node — history trimming and prompt assembly.
 *
 * Why this file exists (investigation finding #1): `MAX_CONTEXT_BYTES` is
 * 65,536 and is measured as `JSON.stringify(context).length`, but
 * `enforceContextCeiling` can only truncate ONE top-level key. A conversation
 * history stored in `context.ai[nodeId].history` is therefore invisible to it,
 * and letting it grow silently breaks the conversation state after ~8-12
 * messages. Phase 1 caps history at 8 KB / 12 messages here, on every write.
 *
 * Phase 2 replaces this with an `ai_messages` table; the trimming rules below
 * are intentionally boring so the migration is mechanical.
 *
 * No I/O, no SDK imports — pure functions, unit-tested directly.
 */

import type { LlmMessage } from './types';

/** Newest N messages kept in `context.ai[nodeId].history`. */
export const MAX_HISTORY_MESSAGES = 12;

/** Soft byte budget for the whole history array (serialized UTF-8 bytes). */
export const MAX_HISTORY_BYTES = 8 * 1024;

/** Arabic block + presentation forms. These tokenize ~2x denser than Latin. */
function isArabicCodePoint(code: number): boolean {
  return (
    (code >= 0x0600 && code <= 0x06ff) || // Arabic
    (code >= 0x0750 && code <= 0x077f) || // Arabic Supplement
    (code >= 0x08a0 && code <= 0x08ff) || // Arabic Extended-A
    (code >= 0xfb50 && code <= 0xfdff) || // Arabic Presentation Forms-A
    (code >= 0xfe70 && code <= 0xfeff) // Arabic Presentation Forms-B
  );
}

/**
 * Rough token estimate, no tokenizer dependency.
 *
 * Latin/Cyrillic/Digits space: ~4 chars per token.
 * Arabic: ~2 chars per token (diacritics and joining forms split more).
 *
 * Used for logging and prompt budgets only — never for billing.
 */
export function approxTokens(text: string): number {
  if (!text) return 0;

  let arabic = 0;
  let other = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (isArabicCodePoint(code)) arabic++;
    else other++;
  }

  return Math.ceil(arabic / 2 + other / 4);
}

/** Serialized UTF-8 byte size of a message array. */
export function historyBytes(messages: LlmMessage[]): number {
  try {
    return Buffer.byteLength(JSON.stringify(messages ?? []), 'utf8');
  } catch {
    return 0;
  }
}

function isValidMessage(message: any): message is LlmMessage {
  return (
    !!message &&
    typeof message.content === 'string' &&
    message.content.length > 0 &&
    (message.role === 'user' || message.role === 'assistant' || message.role === 'system')
  );
}

export interface TrimHistoryOptions {
  /** Defaults to MAX_HISTORY_MESSAGES. */
  maxMessages?: number;
  /** Defaults to MAX_HISTORY_BYTES. */
  maxBytes?: number;
}

/**
 * Keep the newest messages that fit both limits.
 *
 * - Messages are dropped oldest-first; the newest turn is always kept.
 * - If a single message alone exceeds `maxBytes`, its content is truncated
 *   (keeping the tail) rather than dropped, so the model still sees the last
 *   thing the customer said.
 * - Never throws; malformed entries are filtered out.
 */
export function trimHistory(
  history: LlmMessage[],
  options: TrimHistoryOptions = {}
): LlmMessage[] {
  const maxMessages = Math.max(1, options.maxMessages ?? MAX_HISTORY_MESSAGES);
  const maxBytes = Math.max(0, options.maxBytes ?? MAX_HISTORY_BYTES);

  const clean = (Array.isArray(history) ? history : []).filter(isValidMessage);

  // Newest wins when there are too many messages.
  const trimmed = clean.slice(-maxMessages);

  while (trimmed.length > 1 && historyBytes(trimmed) > maxBytes) {
    trimmed.shift();
  }

  if (trimmed.length === 1 && historyBytes(trimmed) > maxBytes) {
    const only = trimmed[0];
    // Binary-search-free: keep the tail, then shrink until it fits. The JSON
    // wrapper costs a few bytes, hence the small safety margin.
    const budget = Math.max(0, maxBytes - 64);
    let keep = Math.min(only.content.length, budget);
    let candidate: LlmMessage = { role: only.role, content: only.content.slice(-keep) };
    while (keep > 0 && historyBytes([candidate]) > maxBytes) {
      keep = Math.floor(keep * 0.8);
      candidate = { role: only.role, content: only.content.slice(-keep) };
    }
    return [candidate];
  }

  return trimmed;
}

export interface BuildChatContextOptions {
  systemPrompt?: string;
  history?: LlmMessage[];
  /** The customer's latest message (already template-resolved). */
  userMessage?: string;
  /** Defaults to MAX_HISTORY_MESSAGES. */
  historyLimit?: number;
  /** Defaults to MAX_HISTORY_BYTES. */
  maxHistoryBytes?: number;
}

/**
 * Assemble the request payload: system prompt, trimmed history, latest user
 * message — in that order. Empty parts are omitted so a provider never sees a
 * zero-length message.
 */
export function buildChatContext(options: BuildChatContextOptions): LlmMessage[] {
  const messages: LlmMessage[] = [];

  const system = (options.systemPrompt ?? '').trim();
  if (system) messages.push({ role: 'system', content: system });

  messages.push(
    ...trimHistory(options.history ?? [], {
      maxMessages: options.historyLimit,
      maxBytes: options.maxHistoryBytes,
    })
  );

  const user = (options.userMessage ?? '').trim();
  if (user) messages.push({ role: 'user', content: user });

  return messages;
}

/** Total approximate prompt tokens (system + history + user). */
export function estimatePromptTokens(messages: LlmMessage[]): number {
  return (messages ?? []).reduce((sum, message) => sum + approxTokens(message.content), 0);
}
