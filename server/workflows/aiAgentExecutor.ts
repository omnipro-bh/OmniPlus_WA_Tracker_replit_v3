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
import { buildChatContext, historyBytes, trimHistory } from '../ai/contextBuilder';
import { buildSystemPrompt } from '../ai/prompt';
import { getLlmClient, normalizeProviderId, resolveModel } from '../ai/registry';
import { DEFAULT_TIMEOUT_MS } from '../ai/clients/openaiCompatible';
import type {
  AiAgentSettings,
  LlmClient,
  LlmFinishReason,
  LlmMessage,
  LlmProviderId,
  LlmUsage,
} from '../ai/types';

// ── Limits (mirrors shared/workflow-validation.ts) ─────────────────────────

export const AI_DEFAULT_RESPONSE_VARIABLE = 'ai_response';
export const AI_DEFAULT_HISTORY_LIMIT = 12;
export const AI_DEFAULT_MAX_TOKENS = 500;
export const AI_DEFAULT_TEMPERATURE = 0.7;
export const AI_MAX_TOKENS = 8192;
export const AI_MAX_HISTORY_LIMIT = 50;

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
}

export interface AiAgentExecutionResult {
  success: boolean;
  provider: LlmProviderId;
  model: string;
  text: string;
  finishReason: LlmFinishReason;
  usage: LlmUsage;
  latencyMs: number;
  attempts: number;
  error?: string;
  /** History after this turn (already trimmed). */
  history: LlmMessage[];
  /** Context after this turn (history + response variable). */
  stateUpdate: Record<string, any>;
}

/** Node-level result — mirrors `GoogleSheetsNodeExecutionResult`. */
export interface AiAgentNodeExecutionResult {
  success: boolean;
  nextHandle: 'success' | 'error';
  result: AiAgentExecutionResult;
  stateUpdate: any;
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

function emptyResult(
  settings: AiAgentSettings,
  error: string,
  history: LlmMessage[],
  stateUpdate: Record<string, any>,
  nodeId: string,
  useHistory: boolean
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
        updatedAt: new Date().toISOString(),
        history,
      },
    };
  }

  return {
    success: false,
    provider: settings.provider,
    model: settings.model,
    text: '',
    finishReason: 'error',
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    latencyMs: 0,
    attempts: 0,
    error,
    history,
    stateUpdate,
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

  // Resolve {{variables}} in the owner's prompt against the current context.
  const resolvedPrompt = resolveTemplate(settings.systemPrompt, context);

  const messages = buildChatContext({
    systemPrompt: buildSystemPrompt({
      ownerPrompt: resolvedPrompt,
      businessName: exec.businessName,
      channel: exec.channel === 'web_chat' ? 'web_chat' : 'whatsapp',
    }),
    history: previousHistory,
    userMessage,
    historyLimit: settings.historyLimit,
  });

  let client: LlmClient;
  try {
    client = exec.client ?? getLlmClient(settings.provider);
  } catch (error: any) {
    // Missing API key / unknown provider — a configuration error, not a crash.
    const message = error?.message || 'AI provider is not configured';
    console.error(`[AI Executor] ${message}`);
    return emptyResult(settings, message, previousHistory, stateUpdate, nodeId, useHistory);
  }

  const completion = await client.complete({
    messages,
    model: settings.model,
    temperature: settings.temperature,
    maxTokens: settings.maxTokens,
    timeoutMs: exec.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  });

  const entry: Record<string, any> = {
    provider: completion.provider,
    model: completion.model,
    text: completion.text,
    finishReason: completion.finishReason,
    usage: completion.usage,
    latencyMs: completion.latencyMs,
    attempts: completion.attempts,
    updatedAt: new Date().toISOString(),
  };

  if (!completion.ok) {
    entry.error = completion.error || 'AI provider failed';
    if (useHistory) {
      stateUpdate.ai = {
        ...(stateUpdate.ai || {}),
        [nodeId]: { ...(stateUpdate.ai?.[nodeId] || {}), ...entry, history: previousHistory },
      };
    }

    return {
      success: false,
      provider: completion.provider,
      model: completion.model,
      text: '',
      finishReason: 'error',
      usage: completion.usage,
      latencyMs: completion.latencyMs,
      attempts: completion.attempts,
      error: entry.error,
      history: previousHistory,
      stateUpdate,
    };
  }

  // Successful turn: append both sides so the next message sees the exchange.
  const history = useHistory
    ? trimHistory(
        [
          ...previousHistory,
          { role: 'user' as const, content: userMessage },
          { role: 'assistant' as const, content: completion.text },
        ],
        { maxMessages: settings.historyLimit }
      )
    : [];

  if (useHistory) {
    stateUpdate.ai = {
      ...(stateUpdate.ai || {}),
      [nodeId]: { ...entry, history },
    };
    // Downstream nodes read {{ai.<nodeId>.text}} or the response variable.
    stateUpdate[settings.responseVariable] = completion.text;
    fitContextCeiling(stateUpdate, nodeId);
  }

  return {
    success: true,
    provider: completion.provider,
    model: completion.model,
    text: completion.text,
    finishReason: completion.finishReason,
    usage: completion.usage,
    latencyMs: completion.latencyMs,
    attempts: completion.attempts,
    history,
    stateUpdate,
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
  };

  const executionContext = buildExecutionContext(conversationState, incomingMessage, userMetadata);
  const userMessage =
    incomingMessage?.text?.body || (executionContext.message as any)?.text || '';

  const result = await executeAiAgentNode(config, {
    nodeId,
    context: executionContext,
    userMessage,
    channel: options.channel ?? 'whatsapp',
    businessName: options.businessName,
  });

  const nextHandle: 'success' | 'error' = result.success ? 'success' : 'error';

  if (options.logUsage !== false && options.workflowId !== undefined && userMetadata?.userId) {
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
  };
}

/** Exposed for tests: current serialized size of a node's history. */
export function aiHistoryBytes(context: Record<string, any>, nodeId: string): number {
  return historyBytes(readHistory(context, nodeId));
}
