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
}
