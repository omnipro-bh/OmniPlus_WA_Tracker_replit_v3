/**
 * Phase 1 AI Agent node executor for workflows.
 *
 * Same two-layer split as ./googleSheetsExecutor:
 *   - `executeAiAgentNode(config, exec)` is the pure executor: it normalizes
 *     config, builds the prompt, calls a provider and returns a result. It never
 *     throws and never touches Express or the conversation-state row.
 *   - `executeAiAgentWorkflowNode(node, ...)` is the node wrapper used by
 *     flowRunner hosts: it extracts `node.data.config`, reads/writes
 *     `context.ai[nodeId].history`, sets the response variable, logs usage and
 *     returns `{ success, nextHandle, result, stateUpdate }`.
 *
 * Why history lives in the context (locked decision #3 for Phase 1): WhatsApp
 * has no message transcript in the DB, and the sandbox never persists. History
 * is therefore capped at 12 messages / 8 KB on every write (contextBuilder.ts) —
 * `MAX_CONTEXT_BYTES` cannot trim a nested key on its own.
 *
 * Out of scope by design: tools, buttons, handover, debounce, scheduling,
 * usage-limit enforcement, PII redaction, streaming.
 */

import { resolveTemplate } from './httpExecutor';
import { MAX_CONTEXT_BYTES } from './flowControl';
import { VARIABLE_NAME_RE, RESERVED_CONTEXT_KEYS } from '@shared/workflow-validation';
import { buildChatContext, historyBytes, trimHistory, approxTokens } from '../ai/contextBuilder';
import { buildSystemPrompt } from '../ai/prompt';
import { getLlmClient, normalizeProviderId, resolveModel } from '../ai/registry';
import { DEFAULT_TIMEOUT_MS } from '../ai/clients/openaiCompatible';
import {
  AI_DEFAULT_TIMEZONE,
  isUsageExceeded,
  isWithinSchedule,
} from '../ai/schedule';
import {
  TOOL_HANDOVER,
  TOOL_LOOKUP_SHEET,
  TOOL_SEND_BUTTONS,
  TOOL_SEND_LIST,
  ToolArgumentError,
  buildToolList,
  parseHandoverArgs,
  parseLookupSheetArgs,
  parseSendButtonsArgs,
  parseSendListArgs,
  type AiButtonSlot,
  type AiDepartmentSlot,
  type AiListRowSlot,
  type LookupSheetArgs,
} from '../ai/tools';
import type {
  AiAgentSettings,
  AiForceToolChoice,
  AiGoogleSheetsConfig,
  AiSchedule,
  LlmClient,
  LlmCompletionResult,
  LlmFinishReason,
  LlmMessage,
  LlmProviderId,
  LlmToolChoice,
  LlmToolDef,
  LlmUsage,
  UsageLimits,
} from '../ai/types';
import { extractSpreadsheetId, lookupSheetRows } from './googleSheetsExecutor';
import { AI_SHEET_TAB_SCHEMA } from '@shared/ai-defaults';

const RATE_LIMIT_RE = /(rate limit|too many requests|\b429\b)/i;

/** A provider error is a transient rate limit, not a crash. */
function isRateLimitError(error: string): boolean {
  return typeof error === 'string' && RATE_LIMIT_RE.test(error);
}

// ── Limits (mirrors shared/workflow-validation.ts) ─────────────────────────

export const AI_DEFAULT_RESPONSE_VARIABLE = 'ai_response';
export const AI_DEFAULT_HISTORY_LIMIT = 12;
export const AI_DEFAULT_MAX_TOKENS = 500;
export const AI_DEFAULT_TEMPERATURE = 0.7;
export const AI_MAX_TOKENS = 8192;
export const AI_MAX_HISTORY_LIMIT = 50;

/**
 * Phase 2: max tool-calling rounds before the node gives up (prevents loops).
 * Phase 4 raised it from 3 to 4: the sheet workflow is Intents → Workflow_Steps
 * → answer, i.e. two non-terminal lookups plus a final text turn.
 */
export const AI_MAX_TOOL_ROUNDS = 4;
/** Fallback body text when the model calls `send_buttons` with no content. */
export const AI_BUTTON_TEXT_FALLBACK = 'Please choose an option:';
/** Fallback body text when the model calls `send_list` with no content. */
export const AI_LIST_TITLE_FALLBACK = 'Please choose:';

/**
 * Phase 2.5b — how long a just-sent option counts as a click. A tap arrives
 * seconds later; 5 minutes covers a slow WhatsApp delivery without letting a
 * stale title disable the option tools much later.
 */
export const OPTION_CLICK_TTL_MS = 5 * 60 * 1000;

// ── Types ──────────────────────────────────────────────────────────────────

export type AiChannel = 'whatsapp' | 'web_chat' | 'sandbox';

export interface AiAgentNodeConfig {
  provider?: LlmProviderId | string;
  model?: string;
  systemPrompt?: string;
  temperature?: number | string;
  maxTokens?: number | string;
  historyLimit?: number | string;
  responseVariable?: string;
  /** Phase 2: declared button slots the model may offer (send_buttons). */
  buttons?: AiButtonSlot[];
  /** Phase 2.5: declared list rows the model may offer (send_list). */
  listRows?: AiListRowSlot[];
  /** Phase 2: declared departments for handover. */
  handoverDepartments?: AiDepartmentSlot[];
  /** Phase 2: force the model to use a specific tool (`auto` lets it decide). */
  forceToolChoice?: AiForceToolChoice | string;
  /** Phase 3: business-hours schedule (absent = always active). */
  aiSchedule?: AiSchedule;
  /** Phase 3: daily/monthly call caps (absent = unlimited). */
  usageLimits?: UsageLimits;
  /** Phase 3: max AI calls per user per day before forced handover (absent = unlimited). */
  maxAiCallsPerDay?: number | string;
  /** Phase 4: Google Sheets data source (absent = no `lookup_sheet` tool). */
  googleSheets?: AiGoogleSheetsConfig;
}

export interface AiAgentExecutionContext {
  /** Flow node id — the key under `context.ai`. Empty for ad-hoc tests. */
  nodeId: string;
  context: Record<string, any>;
  /** The customer's latest message. */
  userMessage: string;
  channel?: AiChannel;
  /** Optional workflow name used in the system prompt. */
  businessName?: string;
  /** Test seam: bypass the registry (used by tests and the Test endpoint). */
  client?: LlmClient;
  /** Test endpoint: do not read or write `context.ai`. */
  useHistory?: boolean;
  timeoutMs?: number;
  /** Test seam: current time in ms (defaults to Date.now()). */
  now?: number;
  /** Pre-resolved workflow usage-limit block, computed by the node wrapper. */
  usageBlock?: { reason: string };
  /** Pre-resolved per-user daily cap block, computed by the node wrapper. */
  userDailyBlock?: { reason: string };
  /**
   * Test seam: bypass the real Google Sheets read for `lookup_sheet`. Returns
   * the same shape the executor serializes into the tool result.
   */
  lookupSheet?: (
    args: LookupSheetArgs
  ) => Promise<{ ok: boolean; rows?: Record<string, any>[]; error?: string }>;
}

/** The handle the node routes to after a turn. */
export type AiNextHandle = 'success' | 'buttons' | 'list' | 'handover' | 'error';

/** One tool call the model made this turn, for the execution trace. */
export interface AiToolCallTrace {
  name: string;
  args: Record<string, any>;
  /** `lookup_sheet` only: rows returned (undefined on error). */
  rows?: number;
}

/** Approximate token usage by section, for the trace (never for billing). */
export interface AiTokenBreakdown {
  systemPromptTokens: number;
  toolDefinitionsTokens: number;
  historyTokens: number;
  lookupResultTokens: number;
}

export interface AiAgentExecutionResult {
  success: boolean;
  nextHandle: AiNextHandle;
  provider: LlmProviderId;
  model: string;
  text: string;
  finishReason: LlmFinishReason;
  usage: LlmUsage;
  latencyMs: number;
  attempts: number;
  error?: string;
  /**
   * Phase 3: structured routing reason when the node was blocked or handed over
   * before calling the model — `'outside_schedule'`, `'daily_limit_reached'`,
   * `'monthly_limit_reached'`, `'daily_user_cap_reached'`. Persisted to
   * `context.ai[nodeId].reason` so a downstream `condition` node can branch.
   */
  reason?: string;
  /** History after this turn (already trimmed). */
  history: LlmMessage[];
  /** Context after this turn (history + response variable). */
  stateUpdate: Record<string, any>;
  /** Populated when the model called `send_buttons` (buttons bubble to send). */
  buttons?: { id: string; title: string }[];
  /** Body text for the buttons bubble (model content or fallback). */
  buttonText?: string;
  /** Populated when the model called `send_list` (list bubble to send). */
  listRows?: { id: string; title: string; description?: string }[];
  /** Body text for the list bubble (model content or fallback). */
  listTitle?: string;
  /** Populated when the model called `handover`. */
  handover?: { department: string; reason: string; title: string };
  /** Tool calls the model made this turn (empty when no tools were used). */
  toolCalls: AiToolCallTrace[];
  /** Token usage by section (system prompt / tools / history / lookup rows). */
  tokenBreakdown?: AiTokenBreakdown;
}

/** Node-level result — mirrors `GoogleSheetsNodeExecutionResult`. */
export interface AiAgentNodeExecutionResult {
  success: boolean;
  nextHandle: AiNextHandle;
  result: AiAgentExecutionResult;
  stateUpdate: any;
  /** Compact trace for `workflow_executions.trigger_data.aiTrace`. */
  aiTrace: AiTrace;
}

/** One AI turn's trace, stored as `trigger_data.aiTrace` for the Webhook Logs. */
export interface AiTrace {
  nodeId: string;
  /** First 500 chars of the user message. */
  userMessage: string;
  provider: string;
  model: string;
  attempts: number;
  finishReason: string;
  elapsedMs: number;
  tokensIn: number;
  tokensOut: number;
  toolCalls: AiToolCallTrace[];
  nextHandle: AiNextHandle;
  error?: string;
  reason?: string;
  /** Token usage by section, for the Webhook Logs trace. */
  tokenBreakdown: AiTokenBreakdown;
}

export interface AiAgentNodeOptions {
  channel?: AiChannel;
  workflowId?: number | null;
  /** Optional business/workflow name used in the system prompt. */
  businessName?: string;
  /** Defaults to true; the sandbox passes false to stay DB-free. */
  logUsage?: boolean;
}

// ── Normalization ──────────────────────────────────────────────────────────

function clampNumber(value: any, min: number, max: number, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

/** Resolve a valid, non-reserved response variable name. */
function normalizeResponseVariable(value: any): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name || !VARIABLE_NAME_RE.test(name) || RESERVED_CONTEXT_KEYS.includes(name)) {
    return AI_DEFAULT_RESPONSE_VARIABLE;
  }
  return name;
}

/** Resolve the owner-facing tool-choice override, defaulting to `auto`. */
function normalizeForceToolChoice(value: any): AiForceToolChoice {
  if (value === 'send_buttons' || value === 'handover') return value;
  return 'auto';
}

/** Phase 3: coerce the schedule config, returning `undefined` when unusable. */
function normalizeSchedule(value: any): AiSchedule | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const startHour = value.startHour;
  const endHour = value.endHour;
  if (
    startHour === undefined || startHour === null || startHour === '' ||
    endHour === undefined || endHour === null || endHour === ''
  ) {
    return undefined;
  }
  const daysOfWeek = Array.isArray(value.daysOfWeek)
    ? value.daysOfWeek.filter((d: any) => Number.isInteger(d) && d >= 0 && d <= 6)
    : [];
  const tz = typeof value.tz === 'string' && value.tz.trim() ? value.tz.trim() : AI_DEFAULT_TIMEZONE;
  return { startHour: Number(startHour), endHour: Number(endHour), daysOfWeek, tz };
}

/** Phase 3: coerce the usage-limit config, returning `undefined` when unusable. */
function normalizeUsageLimits(value: any): UsageLimits | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const daily = Number(value.dailyMax);
  const monthly = Number(value.monthlyMax);
  const dailyMax = Number.isInteger(daily) && daily >= 1 ? daily : undefined;
  const monthlyMax = Number.isInteger(monthly) && monthly >= 1 ? monthly : undefined;
  if (dailyMax === undefined && monthlyMax === undefined) return undefined;
  return {
    ...(dailyMax !== undefined ? { dailyMax } : {}),
    ...(monthlyMax !== undefined ? { monthlyMax } : {}),
  };
}

/** Phase 3: coerce the per-user-per-day cap (≥ 1, else `undefined`). */
function normalizeDailyUserCap(value: any): number | undefined {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return undefined;
  return n;
}

/** Phase 4: coerce the Google Sheets data source, returning `undefined` when unusable. */
function normalizeGoogleSheets(value: any): AiGoogleSheetsConfig | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const spreadsheetId = extractSpreadsheetId(value.spreadsheetId);
  if (!spreadsheetId) return undefined;
  const tabs = Array.isArray(value.tabs)
    ? value.tabs.map((t: any) => String(t ?? '').trim()).filter(Boolean)
    : [];
  if (tabs.length === 0) return undefined;

  // Optional header overrides: { tabName: { canonicalKey: header } }. Skip
  // empty strings so a cleared field falls back to the schema default.
  let columns: Record<string, Record<string, string>> | undefined;
  if (value.columns && typeof value.columns === 'object') {
    const cleaned: Record<string, Record<string, string>> = {};
    for (const tab of tabs) {
      const map = value.columns[tab];
      if (!map || typeof map !== 'object') continue;
      const entries: Record<string, string> = {};
      for (const [key, header] of Object.entries(map)) {
        const name = typeof header === 'string' ? header.trim() : '';
        if (name) entries[key] = name;
      }
      if (Object.keys(entries).length > 0) cleaned[tab] = entries;
    }
    if (Object.keys(cleaned).length > 0) columns = cleaned;
  }

  // Header rows captured by "Detect Headers" — lets the prompt know whether a
  // canonical column (e.g. start_step) really exists in the sheet.
  let detected: Record<string, string[]> | undefined;
  if (value.detected && typeof value.detected === 'object') {
    const cleaned: Record<string, string[]> = {};
    for (const tab of tabs) {
      const headers = value.detected[tab];
      if (!Array.isArray(headers)) continue;
      const names = headers.map((h: any) => String(h ?? '').trim()).filter(Boolean);
      if (names.length > 0) cleaned[tab] = names;
    }
    if (Object.keys(cleaned).length > 0) detected = cleaned;
  }

  return {
    spreadsheetId,
    tabs,
    ...(columns ? { columns } : {}),
    ...(detected ? { detected } : {}),
  };
}

/**
 * Map `forceToolChoice` to the wire `tool_choice`. A forced tool is only applied
 * when that tool was actually declared (an empty enum can't be forced); otherwise
 * we fall back to `auto` rather than sending an unreachable function object.
 */
function resolveToolChoice(force: AiForceToolChoice, tools: LlmToolDef[]): LlmToolChoice {
  if (force === 'send_buttons' || force === 'handover') {
    const name = force === 'send_buttons' ? TOOL_SEND_BUTTONS : TOOL_HANDOVER;
    if (tools.some((tool) => tool.function.name === name)) {
      return { type: 'function', function: { name } };
    }
    console.warn(`[AI Executor] forceToolChoice "${force}" ignored: no "${name}" tool declared.`);
  }
  return 'auto';
}

/**
 * Turn raw node config into validated settings. Invalid values fall back to safe
 * defaults rather than failing the node — the save-time validator in
 * shared/workflow-validation.ts is what blocks bad config at the door.
 */
export function normalizeAiConfig(config: AiAgentNodeConfig | undefined): AiAgentSettings {
  const provider = normalizeProviderId(config?.provider);

  return {
    provider,
    model: resolveModel(provider, config?.model),
    systemPrompt: typeof config?.systemPrompt === 'string' ? config.systemPrompt : '',
    temperature: clampNumber(config?.temperature, 0, 2, AI_DEFAULT_TEMPERATURE),
    maxTokens: Math.round(clampNumber(config?.maxTokens, 1, AI_MAX_TOKENS, AI_DEFAULT_MAX_TOKENS)),
    historyLimit: Math.round(
      clampNumber(config?.historyLimit, 1, AI_MAX_HISTORY_LIMIT, AI_DEFAULT_HISTORY_LIMIT)
    ),
    responseVariable: normalizeResponseVariable(config?.responseVariable),
    forceToolChoice: normalizeForceToolChoice(config?.forceToolChoice),
    aiSchedule: normalizeSchedule(config?.aiSchedule),
    usageLimits: normalizeUsageLimits(config?.usageLimits),
    maxAiCallsPerDay: normalizeDailyUserCap(config?.maxAiCallsPerDay),
    googleSheets: normalizeGoogleSheets(config?.googleSheets),
  };
}

/** Read the stored history for a node, tolerating any malformed shape. */
export function readHistory(context: Record<string, any>, nodeId: string): LlmMessage[] {
  const raw = context?.ai?.[nodeId]?.history;
  if (!Array.isArray(raw)) return [];

  return raw
    .filter(
      (message: any) =>
        message &&
        typeof message.content === 'string' &&
        (message.role === 'user' || message.role === 'assistant' || message.role === 'system')
    )
    .map((message: any) => ({ role: message.role, content: message.content }));
}

/**
 * Keep the whole context under `MAX_CONTEXT_BYTES` by dropping the oldest
 * history turns. The ceiling counts `JSON.stringify(context).length`, so the
 * check is deliberately identical to flowControl's.
 */
function fitContextCeiling(stateUpdate: Record<string, any>, nodeId: string): void {
  const history = stateUpdate?.ai?.[nodeId]?.history;
  if (!Array.isArray(history)) return;

  let guard = 0;
  while (
    history.length > 0 &&
    JSON.stringify(stateUpdate).length > MAX_CONTEXT_BYTES &&
    guard < 100
  ) {
    history.shift();
    guard++;
  }
}

// ── Pure executor ──────────────────────────────────────────────────────────

/** Normalize declared button slots from raw config, dropping malformed entries. */
function normalizeButtonSlots(raw: any): AiButtonSlot[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((b: any) => b && typeof b.id === 'string' && b.id.trim())
    .map((b: any) => ({
      id: b.id.trim(),
      title: typeof b.title === 'string' && b.title.trim() ? b.title : b.id,
    }));
}

/** Normalize declared list rows from raw config, dropping malformed entries. */
function normalizeListRows(raw: any): AiListRowSlot[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r: any) => r && typeof r.id === 'string' && r.id.trim())
    .map((r: any) => ({
      id: r.id.trim(),
      title: typeof r.title === 'string' && r.title.trim() ? r.title : r.id,
      description: typeof r.description === 'string' ? r.description.trim() : '',
    }));
}

/** A record of the option titles the AI just offered, written after a send_*. */
interface LastSentOptions {
  titles: string[];
  at: number;
}

/** Read `context.ai[nodeId].lastSentOptions`, tolerating any malformed shape. */
function readLastSentOptions(
  context: Record<string, any>,
  nodeId: string
): LastSentOptions | null {
  const raw = context?.ai?.[nodeId]?.lastSentOptions;
  if (!raw || !Array.isArray(raw.titles) || typeof raw.at !== 'number') return null;

  const titles = raw.titles.filter(
    (title: any) => typeof title === 'string' && title.trim().length > 0
  );
  if (titles.length === 0) return null;

  return { titles, at: raw.at };
}

/**
 * Phase 2.5b — did this turn come from a tap on an option we just sent?
 *
 * The customer's message is the option title ("See pricing"), so without a guard
 * the model reads it as a fresh request for options and re-sends the same menu.
 * Matching title + a recent send is the reliable signal we have (WhatsApp and
 * web chat both deliver the label as the message text).
 */
export function isRecentlySentOption(
  context: Record<string, any>,
  nodeId: string,
  userMessage: string,
  now: number = Date.now()
): boolean {
  const lastSent = readLastSentOptions(context, nodeId);
  if (!lastSent) return false;
  if (now - lastSent.at > OPTION_CLICK_TTL_MS) return false;

  const wanted = userMessage.trim().toLowerCase();
  if (!wanted) return false;

  return lastSent.titles.some((title) => title.trim().toLowerCase() === wanted);
}

/** Phase 2.5b — the tools that must not be offered on an option click. */
export function stripOptionTools(tools: LlmToolDef[]): LlmToolDef[] {
  return tools.filter(
    (tool) =>
      tool.function.name !== TOOL_SEND_BUTTONS && tool.function.name !== TOOL_SEND_LIST
  );
}

/** Normalize declared handover departments from raw config. */
function normalizeDepartmentSlots(raw: any): AiDepartmentSlot[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((d: any) => d && typeof d.id === 'string' && d.id.trim())
    .map((d: any) => ({
      id: d.id.trim(),
      title: typeof d.title === 'string' && d.title.trim() ? d.title : d.id,
    }));
}

/** Execute `send_buttons`: validate ids against declared slots, build the bubble. */
function executeSendButtons(
  args: Record<string, any>,
  declared: AiButtonSlot[],
  modelContent: string
): { buttons: { id: string; title: string }[]; buttonText: string } {
  const ids = parseSendButtonsArgs(args);
  const byId = new Map(declared.map((b) => [b.id, b]));

  const buttons: { id: string; title: string }[] = [];
  for (const id of ids) {
    const slot = byId.get(id);
    if (!slot) {
      throw new ToolArgumentError(`send_buttons: "${id}" is not a declared button id.`);
    }
    buttons.push({ id: slot.id, title: slot.title });
  }

  const buttonText = (modelContent || '').trim() || AI_BUTTON_TEXT_FALLBACK;
  return { buttons, buttonText };
}

/** Execute `send_list`: validate ids against declared rows, build the bubble. */
function executeSendList(
  args: Record<string, any>,
  declared: AiListRowSlot[],
  modelContent: string
): {
  listRows: { id: string; title: string; description?: string }[];
  listTitle: string;
} {
  const ids = parseSendListArgs(args);
  const byId = new Map(declared.map((r) => [r.id, r]));

  const listRows: { id: string; title: string; description?: string }[] = [];
  for (const id of ids) {
    const slot = byId.get(id);
    if (!slot) {
      throw new ToolArgumentError(`send_list: "${id}" is not a declared list row id.`);
    }
    listRows.push({
      id: slot.id,
      title: slot.title,
      ...(slot.description ? { description: slot.description } : {}),
    });
  }

  const listTitle = (modelContent || '').trim() || AI_LIST_TITLE_FALLBACK;
  return { listRows, listTitle };
}

/** Execute `handover`: validate department against declared slots. */
function executeHandover(
  args: Record<string, any>,
  declared: AiDepartmentSlot[]
): { department: string; reason: string; title: string } {
  const { department, reason } = parseHandoverArgs(args);
  const slot = declared.find((d) => d.id === department);
  if (!slot) {
    throw new ToolArgumentError(`handover: "${department}" is not a declared department.`);
  }
  return { department, reason, title: slot.title };
}

/**
 * Columns the AI needs to *pick* an intent / step. Trimmed out of the tool
 * result to keep the token budget down (answer / media / fallback are only
 * fetched when the AI already knows which row it wants).
 */
const LOOKUP_TRIM_COLUMNS: { intents: string[]; steps: string[] } = {
  intents: ['id', 'type', 'keywords', 'start_step', 'verification_question'],
  steps: ['intent_id', 'step_id', 'ai_question', 'expected_input', 'next_step_logic'],
};

/**
 * Drop every column except the ones in the allowlist. Rows are keyed by the
 * sheet's *actual* header, so the allowlist is resolved through the owner's
 * column mapping (falling back to the canonical header, and finally the raw
 * canonical key).
 */
export function trimLookupRows(
  tab: string,
  rows: Record<string, any>[],
  sheet?: AiGoogleSheetsConfig
): Record<string, any>[] {
  const isSteps = /step/i.test(tab);
  const keys = isSteps ? LOOKUP_TRIM_COLUMNS.steps : LOOKUP_TRIM_COLUMNS.intents;
  const schema = AI_SHEET_TAB_SCHEMA.find((t) =>
    isSteps ? /step/i.test(t.tab) : /^intents?$/i.test(t.tab)
  );

  const allowed = new Set<string>();
  for (const key of keys) {
    allowed.add(key);
    const override = sheet?.columns?.[tab]?.[key];
    if (override) allowed.add(override);
    const def = schema?.columns.find((c) => c.key === key)?.column;
    if (def) allowed.add(def);
  }

  return rows.map((row) => {
    const out: Record<string, any> = {};
    for (const [header, value] of Object.entries(row)) {
      if (allowed.has(header)) out[header] = value;
    }
    return out;
  });
}

/** Execute `lookup_sheet`: read rows from the configured Google Sheets tab. */
async function executeLookupSheetTool(
  settings: AiAgentSettings,
  args: LookupSheetArgs
): Promise<{ ok: boolean; rows?: Record<string, any>[]; error?: string }> {
  const sheet = settings.googleSheets;
  if (!sheet?.spreadsheetId) {
    return { ok: false, error: 'No Google Sheets data source configured.' };
  }
  if (!sheet.tabs.includes(args.tab)) {
    return { ok: false, error: `lookup_sheet: "${args.tab}" is not a declared tab.` };
  }
  const result = await lookupSheetRows(sheet.spreadsheetId, args.tab, {
    filterColumn: args.filterColumn,
    filterValue: args.filterValue,
    limit: args.limit,
  });
  return result.success
    ? { ok: true, rows: trimLookupRows(args.tab, result.rows, sheet) }
    : { ok: false, error: result.error };
}

function emptyResult(
  settings: AiAgentSettings,
  error: string,
  history: LlmMessage[],
  stateUpdate: Record<string, any>,
  nodeId: string,
  useHistory: boolean,
  reason?: string
): AiAgentExecutionResult {
  // Record the failure in the context too: an owner debugging a WhatsApp flow
  // sees why the node took the error handle without reading PM2 logs.
  if (useHistory) {
    stateUpdate.ai = {
      ...(stateUpdate.ai || {}),
      [nodeId]: {
        ...(stateUpdate.ai?.[nodeId] || {}),
        provider: settings.provider,
        model: settings.model,
        text: '',
        finishReason: 'error',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latencyMs: 0,
        error,
        ...(reason ? { reason } : {}),
        updatedAt: new Date().toISOString(),
        history,
      },
    };
  }

  return {
    success: false,
    nextHandle: 'error',
    provider: settings.provider,
    model: settings.model,
    text: '',
    finishReason: 'error',
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    latencyMs: 0,
    attempts: 0,
    error,
    ...(reason ? { reason } : {}),
    history,
    stateUpdate,
    toolCalls: [],
  };
}

/**
 * Phase 3 — force handover when the per-user daily cap is reached.
 *
 * No model call: the escalation is decided by the cap, not the LLM. Uses the
 * first declared department as the escalation target, and preserves the current
 * history unchanged (the conversation is leaving the AI loop).
 */
function forcedHandoverResult(
  settings: AiAgentSettings,
  department: AiDepartmentSlot,
  reason: string,
  history: LlmMessage[],
  stateUpdate: Record<string, any>,
  nodeId: string,
  useHistory: boolean
): AiAgentExecutionResult {
  const handover = { department: department.id, reason, title: department.title };

  if (useHistory) {
    stateUpdate.ai = {
      ...(stateUpdate.ai || {}),
      [nodeId]: {
        ...(stateUpdate.ai?.[nodeId] || {}),
        provider: settings.provider,
        model: settings.model,
        text: '',
        finishReason: 'stop',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latencyMs: 0,
        attempts: 0,
        reason,
        handover,
        updatedAt: new Date().toISOString(),
        history,
      },
    };
  }

  return {
    success: true,
    nextHandle: 'handover',
    provider: settings.provider,
    model: settings.model,
    text: '',
    finishReason: 'stop',
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    latencyMs: 0,
    attempts: 0,
    reason,
    handover,
    history,
    stateUpdate,
    toolCalls: [],
  };
}

/**
 * Run one AI turn. Never throws: configuration errors, provider errors and
 * timeouts all come back as `success: false` + `finishReason: 'error'`.
 */
export async function executeAiAgentNode(
  config: AiAgentNodeConfig,
  exec: AiAgentExecutionContext
): Promise<AiAgentExecutionResult> {
  const settings = normalizeAiConfig(config);
  const nodeId = exec.nodeId || 'ai';
  const context = exec.context || {};
  const useHistory = exec.useHistory !== false;

  const stateUpdate: Record<string, any> = { ...context };
  const previousHistory = useHistory ? readHistory(context, nodeId) : [];

  // The user's message is the only required input; without it there is nothing
  // to answer and calling a provider would just burn tokens.
  const userMessage = (exec.userMessage || '').trim();
  if (!userMessage) {
    return emptyResult(
      settings,
      'No incoming message text to send to the AI provider',
      previousHistory,
      stateUpdate,
      nodeId,
      useHistory
    );
  }

  // Phase 2/2.5: declared slots → tool definitions. A tool is only offered when
  // the owner declared the matching config section. Normalized up front so the
  // Phase 3 daily-cap handover below can target the first declared department.
  const declaredButtons = normalizeButtonSlots(config.buttons);
  const declaredRows = normalizeListRows(config.listRows);
  const declaredDepartments = normalizeDepartmentSlots(config.handoverDepartments);
  const allTools = buildToolList({
    buttons: declaredButtons,
    listRows: declaredRows,
    handoverDepartments: declaredDepartments,
    sheetTabs: settings.googleSheets?.tabs || [],
  });

  // ── Phase 3: production-safety gates (all run BEFORE any provider work) ───
  const now = typeof exec.now === 'number' ? exec.now : Date.now();

  // 1. Schedule — outside business hours ⇒ error, no model call.
  const scheduleDecision = isWithinSchedule(settings.aiSchedule, new Date(now));
  if (!scheduleDecision.allowed) {
    return emptyResult(
      settings,
      'The AI is outside its configured business hours.',
      previousHistory,
      stateUpdate,
      nodeId,
      useHistory,
      'outside_schedule'
    );
  }

  // 2. Per-user daily cap — force handover (or error) once the cap is reached.
  if (exec.userDailyBlock) {
    if (declaredDepartments.length > 0) {
      return forcedHandoverResult(
        settings,
        declaredDepartments[0],
        'daily_user_cap_reached',
        previousHistory,
        stateUpdate,
        nodeId,
        useHistory
      );
    }
    return emptyResult(
      settings,
      'This user has reached the daily AI reply limit.',
      previousHistory,
      stateUpdate,
      nodeId,
      useHistory,
      'daily_user_cap_reached'
    );
  }

  // 3. Usage limit — resolved by the wrapper (needs a DB read); no model call.
  if (exec.usageBlock) {
    const human =
      exec.usageBlock.reason === 'daily_limit_reached'
        ? 'The AI has reached its daily usage limit.'
        : 'The AI has reached its monthly usage limit.';
    return emptyResult(
      settings,
      human,
      previousHistory,
      stateUpdate,
      nodeId,
      useHistory,
      exec.usageBlock.reason
    );
  }

  // Resolve {{variables}} in the owner's prompt against the current context.
  const resolvedPrompt = resolveTemplate(settings.systemPrompt, context);

  // Phase 2.5b — Tool Stripping Guard. If the customer's message is the title of
  // an option we offered moments ago, this turn is a CLICK: remove send_buttons
  // and send_list so the model has to answer in text (or hand over) instead of
  // re-sending the same menu. The prompt asks for this; the guard guarantees it.
  const isOptionClick = isRecentlySentOption(context, nodeId, userMessage);
  const tools = isOptionClick ? stripOptionTools(allTools) : allTools;
  if (isOptionClick) {
    console.log(
      `[AI Executor] "${userMessage}" matches a recently sent option - send_buttons/send_list stripped for this turn.`
    );
  }

  const systemPrompt = buildSystemPrompt({
    ownerPrompt: resolvedPrompt,
    businessName: exec.businessName,
    channel: exec.channel === 'web_chat' ? 'web_chat' : 'whatsapp',
    hasOptionTools: declaredButtons.length > 0 || declaredRows.length > 0,
    googleSheets: settings.googleSheets,
  });

  const messages = buildChatContext({
    systemPrompt,
    history: previousHistory,
    userMessage,
    historyLimit: settings.historyLimit,
  });

  // Task 4: approximate token usage by section, so the trace shows where the
  // budget goes (lookup rows are added as the loop runs, below).
  const tokenBreakdown: AiTokenBreakdown = {
    systemPromptTokens: approxTokens(systemPrompt),
    toolDefinitionsTokens: tools.reduce((sum, t) => sum + approxTokens(JSON.stringify(t)), 0),
    historyTokens: previousHistory.reduce((sum, m) => sum + approxTokens(m.content), 0),
    lookupResultTokens: 0,
  };

  let client: LlmClient;
  try {
    client = exec.client ?? getLlmClient(settings.provider);
  } catch (error: any) {
    // Missing API key / unknown provider — a configuration error, not a crash.
    const message = error?.message || 'AI provider is not configured';
    console.error(`[AI Executor] ${message}`);
    return emptyResult(settings, message, previousHistory, stateUpdate, nodeId, useHistory);
  }

  const startedAt = Date.now();
  let totalUsage: LlmUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let totalAttempts = 0;
  let lastCompletion: LlmCompletionResult | null = null;
  const toolCalls: AiToolCallTrace[] = [];
  let toolOutcome:
    | { kind: 'buttons'; buttons: { id: string; title: string }[]; buttonText: string }
    | {
        kind: 'list';
        listRows: { id: string; title: string; description?: string }[];
        listTitle: string;
      }
    | { kind: 'handover'; handover: { department: string; reason: string; title: string } }
    | null = null;
  let toolError: string | null = null;

  const requestBase: Record<string, any> = {
    model: settings.model,
    temperature: settings.temperature,
    maxTokens: settings.maxTokens,
    timeoutMs: exec.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };
  if (tools.length > 0) {
    requestBase.tools = tools;
    requestBase.toolChoice = resolveToolChoice(settings.forceToolChoice, tools);
    requestBase.parallelToolCalls = false;
  }

  // Tool loop: model → (tool) → model → … up to `AI_MAX_TOOL_ROUNDS` rounds.
  // With no tools configured this is exactly one `complete()` call (Phase 1).
  for (let round = 0; round < AI_MAX_TOOL_ROUNDS; round++) {
    const completion = await client.complete({ messages, ...requestBase });
    lastCompletion = completion;

    totalUsage = {
      promptTokens: totalUsage.promptTokens + completion.usage.promptTokens,
      completionTokens: totalUsage.completionTokens + completion.usage.completionTokens,
      totalTokens: totalUsage.totalTokens + completion.usage.totalTokens,
    };
    totalAttempts += completion.attempts;

    if (!completion.ok) {
      toolError = completion.error || 'AI provider failed';
      break;
    }

    // Plain text answer → done.
    if (completion.toolCalls.length === 0) break;

    // Execute this round's tool calls. `lookup_sheet` is NON-terminal: its rows
    // go back to the model as a tool result so it can answer from them (or look
    // up the next tab). The Phase 2 tools are terminal: the first valid one ends
    // the node.
    const roundResults = new Map<string, Record<string, any>>();
    let terminal = false;

    for (const toolCall of completion.toolCalls) {
      const isOptionTool =
        toolCall.name === TOOL_SEND_BUTTONS || toolCall.name === TOOL_SEND_LIST;

      // Defence in depth: the tools were stripped from the request, so a call
      // here means the model hallucinated one. Record a "disabled" result and
      // let the retry round answer with text.
      if (isOptionTool && isOptionClick) {
        roundResults.set(toolCall.id, {
          ok: false,
          error:
            'send_buttons/send_list are disabled for this turn: the customer just selected an option. Answer with text.',
        });
        continue;
      }

      // Phase 4: Google Sheets lookup — run it, feed the rows back, keep going.
      if (toolCall.name === TOOL_LOOKUP_SHEET) {
        try {
          const args = parseLookupSheetArgs(toolCall.arguments);
          const declaredTabs = settings.googleSheets?.tabs ?? [];
          if (!declaredTabs.includes(args.tab)) {
            roundResults.set(toolCall.id, {
              ok: false,
              error: `lookup_sheet: "${args.tab}" is not a declared tab.`,
            });
            continue;
          }
          const lookup = exec.lookupSheet ?? ((a: LookupSheetArgs) => executeLookupSheetTool(settings, a));
          const outcome = await lookup(args);
          toolCalls.push({
            name: toolCall.name,
            args: toolCall.arguments,
            rows: outcome.ok ? (outcome.rows?.length ?? 0) : undefined,
          });
          if (outcome.ok && outcome.rows?.length) {
            tokenBreakdown.lookupResultTokens += approxTokens(JSON.stringify(outcome.rows));
          }
          roundResults.set(
            toolCall.id,
            outcome.ok
              ? { ok: true, tab: args.tab, rows: outcome.rows ?? [] }
              : { ok: false, tab: args.tab, error: outcome.error || 'lookup_sheet failed' }
          );
        } catch (error: any) {
          roundResults.set(toolCall.id, {
            ok: false,
            error: error?.message || 'Invalid lookup_sheet arguments',
          });
        }
        continue;
      }

      if (isOptionTool || toolCall.name === TOOL_HANDOVER) {
        try {
          if (toolCall.name === TOOL_SEND_BUTTONS) {
            const { buttons, buttonText } = executeSendButtons(
              toolCall.arguments,
              declaredButtons,
              completion.text
            );
            toolOutcome = { kind: 'buttons', buttons, buttonText };
          } else if (toolCall.name === TOOL_SEND_LIST) {
            const { listRows, listTitle } = executeSendList(
              toolCall.arguments,
              declaredRows,
              completion.text
            );
            toolOutcome = { kind: 'list', listRows, listTitle };
          } else {
            toolOutcome = { kind: 'handover', handover: executeHandover(toolCall.arguments, declaredDepartments) };
          }
          toolCalls.push({ name: toolCall.name, args: toolCall.arguments });
          terminal = true;
        } catch (error: any) {
          toolError = error?.message || 'Invalid tool arguments';
        }
        break;
      }
    }

    if (toolError) break;
    if (terminal) break;

    // No terminal tool this round: append the assistant tool_calls + a result
    // for each call, then let the model try again (also exercises the cap).
    messages.push({
      role: 'assistant',
      content: completion.text,
      tool_calls: completion.toolCalls,
    });
    for (const toolCall of completion.toolCalls) {
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        name: toolCall.name,
        content: JSON.stringify(
          roundResults.get(toolCall.id) ?? {
            ok: false,
            error: `Unknown tool "${toolCall.name}"`,
          }
        ),
      });
    }
  }

  const completion = lastCompletion as LlmCompletionResult;

  // ── Error paths ─────────────────────────────────────────────────────────
  if (!completion || toolError || !completion.ok) {
    let error = toolError || completion?.error || 'AI provider failed';
    // Bug 2C: a provider rate limit (HTTP 429) is a transient, owner-actionable
    // condition, not a crash. Surface a friendly message + `reason: 'rate_limit'`
    // instead of the raw provider error, so the trace is debuggable and the owner
    // can wire a dedicated handle.
    let reason: string | undefined;
    if (isRateLimitError(error)) {
      reason = 'rate_limit';
      error = 'I am getting a lot of requests right now. Please try again in a minute.';
    }

    const entry: Record<string, any> = {
      provider: settings.provider,
      model: settings.model,
      text: '',
      finishReason: 'error',
      usage: totalUsage,
      latencyMs: Date.now() - startedAt,
      attempts: totalAttempts,
      error,
      ...(reason ? { reason } : {}),
      updatedAt: new Date().toISOString(),
    };

    if (useHistory) {
      stateUpdate.ai = {
        ...(stateUpdate.ai || {}),
        [nodeId]: { ...(stateUpdate.ai?.[nodeId] || {}), ...entry, history: previousHistory },
      };
    }

    return {
      success: false,
      nextHandle: 'error',
      provider: settings.provider,
      model: settings.model,
      text: '',
      finishReason: 'error',
      usage: totalUsage,
      latencyMs: Date.now() - startedAt,
      attempts: totalAttempts,
      error,
      ...(reason ? { reason } : {}),
      history: previousHistory,
      stateUpdate,
      toolCalls,
      tokenBreakdown,
    };
  }

  // Model kept returning tool calls past the cap without a terminal tool or a
  // final answer (an unknown tool loop). A terminal tool is handled below.
  if (completion.toolCalls.length > 0 && !toolOutcome) {
    const message = `AI did not produce a final answer after ${AI_MAX_TOOL_ROUNDS} tool rounds`;
    console.warn(`[AI Executor] ${message}`);
    return emptyResult(settings, message, previousHistory, stateUpdate, nodeId, useHistory);
  }

  // ── Success: determine the handle and final text ─────────────────────────
  let nextHandle: AiNextHandle = 'success';
  let finalText = completion.text;
  let buttons: { id: string; title: string }[] | undefined;
  let buttonText: string | undefined;
  let listRows: { id: string; title: string; description?: string }[] | undefined;
  let listTitle: string | undefined;
  let handover: { department: string; reason: string; title: string } | undefined;

  if (toolOutcome?.kind === 'buttons') {
    nextHandle = 'buttons';
    buttons = toolOutcome.buttons;
    buttonText = toolOutcome.buttonText;
    finalText = toolOutcome.buttonText;
  } else if (toolOutcome?.kind === 'list') {
    nextHandle = 'list';
    listRows = toolOutcome.listRows;
    listTitle = toolOutcome.listTitle;
    finalText = toolOutcome.listTitle;
  } else if (toolOutcome?.kind === 'handover') {
    nextHandle = 'handover';
    handover = toolOutcome.handover;
    finalText = completion.text;
  }

  // Successful turn: append both sides so the next message sees the exchange.
  const assistantTurn: LlmMessage[] = [{ role: 'user' as const, content: userMessage }];
  if (finalText) assistantTurn.push({ role: 'assistant' as const, content: finalText });
  const history = useHistory
    ? trimHistory([...previousHistory, ...assistantTurn], { maxMessages: settings.historyLimit })
    : [];

  const entry: Record<string, any> = {
    provider: settings.provider,
    model: settings.model,
    text: finalText,
    finishReason: completion.finishReason,
    usage: totalUsage,
    latencyMs: Date.now() - startedAt,
    attempts: totalAttempts,
    updatedAt: new Date().toISOString(),
  };
  if (buttons) entry.buttons = buttons;
  if (listRows) {
    entry.listRows = listRows;
    entry.listTitle = listTitle;
  }
  if (handover) entry.handover = handover;

  // Phase 2.5b: remember what was just offered so the next message can be
  // recognised as a click. A text / handover turn builds a fresh entry without
  // this key, which clears the tracking for the following turn.
  const sentOptionTitles =
    toolOutcome?.kind === 'buttons'
      ? toolOutcome.buttons.map((button) => button.title)
      : toolOutcome?.kind === 'list'
        ? toolOutcome.listRows.map((row) => row.title)
        : null;
  if (sentOptionTitles && sentOptionTitles.length > 0) {
    entry.lastSentOptions = { titles: sentOptionTitles, at: Date.now() };
  }

  if (useHistory) {
    stateUpdate.ai = {
      ...(stateUpdate.ai || {}),
      [nodeId]: { ...entry, history },
    };
    // Downstream nodes read {{ai.<nodeId>.text}} or the response variable.
    stateUpdate[settings.responseVariable] = finalText;
    fitContextCeiling(stateUpdate, nodeId);
  }

  return {
    success: true,
    nextHandle,
    provider: settings.provider,
    model: settings.model,
    text: finalText,
    finishReason: completion.finishReason,
    usage: totalUsage,
    latencyMs: Date.now() - startedAt,
    attempts: totalAttempts,
    history,
    stateUpdate,
    ...(buttons ? { buttons, buttonText } : {}),
    ...(listRows ? { listRows, listTitle } : {}),
    ...(handover ? { handover } : {}),
    toolCalls,
    tokenBreakdown,
  };
}

// ── Node-level wrapper (mirrors executeGoogleSheetsWorkflowNode) ────────────

function buildExecutionContext(
  conversationState: any,
  incomingMessage: any,
  userMetadata: any
): Record<string, any> {
  return {
    phone: userMetadata.phone || incomingMessage.from || '',
    name: userMetadata.name || '',
    email: userMetadata.email || '',
    message: {
      text: incomingMessage.text?.body || '',
      from: incomingMessage.from || '',
      timestamp: incomingMessage.timestamp || Date.now(),
    },
    ...((conversationState.context as any) || {}),
  };
}

export async function executeAiAgentWorkflowNode(
  node: any,
  conversationState: any,
  incomingMessage: any = {},
  userMetadata: any = {},
  options: AiAgentNodeOptions = {}
): Promise<AiAgentNodeExecutionResult> {
  const nodeId = String(node?.id || 'ai');
  const rawConfig = node?.data?.config || {};
  const config: AiAgentNodeConfig = {
    provider: rawConfig.provider,
    model: rawConfig.model,
    systemPrompt: rawConfig.systemPrompt,
    temperature: rawConfig.temperature,
    maxTokens: rawConfig.maxTokens,
    historyLimit: rawConfig.historyLimit,
    responseVariable: rawConfig.responseVariable,
    buttons: rawConfig.buttons,
    listRows: rawConfig.listRows,
    handoverDepartments: rawConfig.handoverDepartments,
    forceToolChoice: rawConfig.forceToolChoice,
    aiSchedule: rawConfig.aiSchedule,
    usageLimits: rawConfig.usageLimits,
    maxAiCallsPerDay: rawConfig.maxAiCallsPerDay,
    googleSheets: rawConfig.googleSheets,
  };

  const executionContext = buildExecutionContext(conversationState, incomingMessage, userMetadata);
  const userMessage =
    incomingMessage?.text?.body || (executionContext.message as any)?.text || '';

  // Phase 3 — usage-limit check (needs a DB read, so it lives in the wrapper).
  // Fail-open: a metrics query error yields no block, never a dropped reply.
  let usageBlock: { reason: string } | undefined;
  if (options.logUsage !== false && options.workflowId != null && userMetadata?.userId) {
    const limits = normalizeUsageLimits(rawConfig.usageLimits);
    if (limits && (limits.dailyMax || limits.monthlyMax)) {
      const { countAiCallsSince, aiUsagePeriodStart } = await import('./ai-usage');
      if (limits.dailyMax) {
        const daily = await countAiCallsSince(
          userMetadata.userId,
          options.workflowId,
          aiUsagePeriodStart('day')
        );
        if (isUsageExceeded(daily, limits.dailyMax)) usageBlock = { reason: 'daily_limit_reached' };
      }
      if (!usageBlock && limits.monthlyMax) {
        const monthly = await countAiCallsSince(
          userMetadata.userId,
          options.workflowId,
          aiUsagePeriodStart('month')
        );
        if (isUsageExceeded(monthly, limits.monthlyMax)) {
          usageBlock = { reason: 'monthly_limit_reached' };
        }
      }
    }
  }

  // Phase 3 — per-user daily cap (also a DB read). Fail-open like the above:
  // a metrics query error yields no block. Counts successful calls only, so a
  // restart/back-and-forth cannot be gamed by starting a fresh conversation.
  let userDailyBlock: { reason: string } | undefined;
  if (options.logUsage !== false && options.workflowId != null && userMetadata?.userId) {
    const maxPerDay = normalizeDailyUserCap(rawConfig.maxAiCallsPerDay);
    if (maxPerDay) {
      const { countUserAiCallsToday } = await import('./ai-usage');
      const userCalls = await countUserAiCallsToday(userMetadata.userId, options.workflowId);
      if (isUsageExceeded(userCalls, maxPerDay)) {
        userDailyBlock = { reason: 'daily_user_cap_reached' };
      }
    }
  }

  const result = await executeAiAgentNode(config, {
    nodeId,
    context: executionContext,
    userMessage,
    channel: options.channel ?? 'whatsapp',
    businessName: options.businessName,
    usageBlock,
    userDailyBlock,
  });

  const nextHandle: AiNextHandle = result.nextHandle;

  // Compact execution trace for the Webhook Logs page (stored in
  // `workflow_executions.trigger_data.aiTrace` by the host). `elapsedMs` reuses
  // the executor's measured latency (0 for blocked turns, which made no call).
  const aiTrace: AiTrace = {
    nodeId,
    userMessage: userMessage.slice(0, 500),
    provider: result.provider,
    model: result.model,
    attempts: result.attempts,
    finishReason: result.finishReason,
    elapsedMs: result.latencyMs,
    tokensIn: result.usage.promptTokens,
    tokensOut: result.usage.completionTokens,
    toolCalls: result.toolCalls,
    nextHandle,
    ...(result.error ? { error: result.error } : {}),
    ...(result.reason ? { reason: result.reason } : {}),
    tokenBreakdown: result.tokenBreakdown ?? {
      systemPromptTokens: 0,
      toolDefinitionsTokens: 0,
      historyTokens: 0,
      lookupResultTokens: 0,
    },
  };

  // Phase 3: a blocked turn (a `reason` was set by a safety gate) made no LLM
  // call, so it is not logged — otherwise a forced handover would inflate the
  // per-user daily "successful calls" count.
  if (
    !result.reason &&
    options.logUsage !== false &&
    options.workflowId !== undefined &&
    userMetadata?.userId
  ) {
    const { logAiUsage } = await import('./ai-usage');
    logAiUsage({
      userId: userMetadata.userId,
      workflowId: options.workflowId ?? null,
      nodeId,
      provider: result.provider,
      model: result.model,
      channel: options.channel ?? 'whatsapp',
      conversationPhone: userMetadata.phone || incomingMessage?.from || null,
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      totalTokens: result.usage.totalTokens,
      latencyMs: result.latencyMs,
      success: result.success,
      finishReason: result.finishReason,
      errorMessage: result.error ?? null,
    });
  }

  return {
    success: result.success,
    nextHandle,
    result,
    stateUpdate: result.stateUpdate,
    aiTrace,
  };
}

/** Exposed for tests: current serialized size of a node's history. */
export function aiHistoryBytes(context: Record<string, any>, nodeId: string): number {
  return historyBytes(readHistory(context, nodeId));
}
