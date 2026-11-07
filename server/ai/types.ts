/**
 * Phase 1 AI Agent node — shared LLM types.
 *
 * Provider-agnostic surface only. Nothing here imports an SDK: the concrete
 * clients (`clients/openaiCompatible.ts`, `clients/mock.ts`) implement
 * `LlmClient`, and `registry.ts` decides which one a node gets.
 *
 * Design rules (locked in the Phase 1 plan):
 *   - `complete()` NEVER throws. Every failure is a result with
 *     `finishReason: 'error'` so a node can route to its `error` handle.
 *   - No tools, no streaming, no multi-turn storage here. Phase 2.
 */

/** Providers shipped in Phase 1. OpenAI is deferred to Phase 2. */
export type LlmProviderId = 'deepseek' | 'groq' | 'mock';

export type LlmRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * One function the model may call, in the OpenAI `tools` JSON-schema form.
 * Phase 2: `send_buttons` and `handover` are built from node config by
 * `server/ai/tools.ts`.
 */
export interface LlmToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

/** One parsed tool-call request returned by the model. */
export interface LlmToolCall {
  /** Provider call id — echoed back on the matching `tool` message. */
  id: string;
  name: string;
  /** Parsed JSON arguments (`{}` when absent or malformed). */
  arguments: Record<string, any>;
}

export interface LlmMessage {
  role: LlmRole;
  content: string;
  /** Assistant messages that requested tools carry these (Phase 2). */
  tool_calls?: LlmToolCall[];
  /** `tool` result messages echo the call id they answer (Phase 2). */
  tool_call_id?: string;
  /** `tool` result messages carry the called function's name (Phase 2). */
  name?: string;
}

/** Why the model stopped. `'error'` means the call itself failed. */
export type LlmFinishReason = 'stop' | 'length' | 'tool_calls' | 'error';

/** Token accounting as reported by the provider (0 when unknown). */
export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * The wire value for the OpenAI `tool_choice` param. A specific function object
 * forces the model to call exactly that tool; `auto`/`required`/`none` are the
 * standard string forms.
 */
export type LlmToolChoice =
  | 'auto'
  | 'none'
  | 'required'
  | { type: 'function'; function: { name: string } };

/** Owner-facing tool-choice override for an AI node (Phase 2). */
export type AiForceToolChoice = 'auto' | 'send_buttons' | 'handover';

export interface LlmCompletionRequest {
  messages: LlmMessage[];
  /** Defaults to the client's `defaultModel` when omitted. */
  model?: string;
  /** 0 – 2. Providers clamp further; the executor validates the range. */
  temperature?: number;
  /** Upper bound on generated tokens. */
  maxTokens?: number;
  /** Per-attempt timeout. Defaults to 20 s (Phase 1). */
  timeoutMs?: number;
  /** Caller-owned cancellation (also fired by the timeout controller). */
  signal?: AbortSignal;
  /** Tool definitions offered to the model (Phase 2). Omit for plain chat. */
  tools?: LlmToolDef[];
  /** How the model may use tools. Defaults to `auto` when `tools` is set. */
  toolChoice?: LlmToolChoice;
  /** Disable parallel tool calls (one tool call per turn). */
  parallelToolCalls?: boolean;
}

export interface LlmCompletionResult {
  /** `false` whenever `finishReason === 'error'`. */
  ok: boolean;
  text: string;
  provider: LlmProviderId;
  model: string;
  finishReason: LlmFinishReason;
  usage: LlmUsage;
  /** Wall-clock time of the whole call, including retries. */
  latencyMs: number;
  /** Network/HTTP attempts performed (mock = 1). */
  attempts: number;
  /** Tool-call requests in this turn (`[]` when the model answered with text). */
  toolCalls: LlmToolCall[];
  error?: string;
}

export interface LlmClient {
  readonly id: LlmProviderId;
  /** Model used when a request does not specify one. */
  readonly defaultModel: string;
  complete(request: LlmCompletionRequest): Promise<LlmCompletionResult>;
}

/**
 * Phase 3 — business-hours schedule for an AI node.
 *
 * A single window across the selected days. `startHour`/`endHour` are 0–23 in
 * `tz`; `endHour` may be less than `startHour` to express a window that crosses
 * midnight (e.g. 22 → 6). `daysOfWeek` is 0 (Sunday) – 6 (Saturday); an empty
 * array means every day. Absent schedule ⇒ always active.
 */
export interface AiSchedule {
  startHour: number;
  endHour: number;
  daysOfWeek: number[];
  tz: string;
}

/**
 * Phase 3 — daily/monthly call caps for an AI node. Counted per workflow (the
 * `ai_usage_logs.workflow_id` bucket), declared per node. Absent ⇒ unlimited.
 */
export interface UsageLimits {
  dailyMax?: number;
  monthlyMax?: number;
}

/**
 * Result of the turn-1 LLM slot extraction (Task 5b). Values are RAW: code
 * validation (`slotValidation.ts`) decides what is stored.
 */
export interface SlotExtractionResult {
  slots: Record<string, any>;
  /** @deprecated Trace signal only — never a gate (Phase 4d-2 increment 2). */
  confidence?: number;
}

/**
 * Phase 4 — Google Sheets data source for an AI node. The `lookup_sheet` tool
 * reads whole tabs from this spreadsheet. Absent ⇒ no `lookup_sheet` tool.
 */
export interface AiGoogleSheetsConfig {
  spreadsheetId: string;
  /** Tab names (e.g. "Intents", "Workflow_Steps") — also the tool's `tab` enum. */
  tabs: string[];
  /**
   * Optional per-tab header overrides: `tabName -> canonicalColumn -> header`.
   * Missing entries fall back to `AI_SHEET_TAB_SCHEMA`.
   */
  columns?: Record<string, Record<string, string>>;
  /**
   * Header rows captured by the config UI's "Detect Headers" button:
   * `tabName -> headers`. Lets the prompt know whether a column really exists
   * (e.g. `start_step`) instead of guessing.
   */
  detected?: Record<string, string[]>;
}

/**
 * One node's AI settings, after normalization by the executor.
 * Mirrors the keys read from `node.data.config` by the client config panel.
 */
export interface AiAgentSettings {
  provider: LlmProviderId;
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  /** Max messages kept in `context.ai[nodeId].history` (newest win). */
  historyLimit: number;
  /** Context root variable that receives the reply (default `ai_response`). */
  responseVariable: string;
  /** Force the model to use a specific tool (`auto` lets it decide). */
  forceToolChoice: AiForceToolChoice;
  /** Phase 3: business-hours schedule (absent = always active). */
  aiSchedule?: AiSchedule;
  /** Phase 3: daily/monthly call caps (absent = unlimited). */
  usageLimits?: UsageLimits;
  /** Phase 3: max AI calls per user per day before forced handover (absent = unlimited). */
  maxAiCallsPerDay?: number;
  /** Phase 4: Google Sheets data source (absent = no `lookup_sheet` tool). */
  googleSheets?: AiGoogleSheetsConfig;
}
