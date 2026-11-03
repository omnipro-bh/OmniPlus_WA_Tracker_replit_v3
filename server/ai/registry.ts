/**
 * Phase 1 AI Agent node — provider registry.
 *
 * Maps a node's `provider` value to a ready `LlmClient`. Adding a provider in
 * Phase 2 (OpenAI, Mistral, GLM…) is one entry in `LLM_PROVIDERS`; only a
 * provider with a different wire format needs a new client class.
 *
 * Keys are read from the process environment at call time (never persisted, never
 * echoed to the client). A missing key is a configuration error and throws —
 * the executor catches it and routes the node to its `error` handle.
 */

import { OpenAiCompatibleClient } from './clients/openaiCompatible';
import { MockLlmClient } from './clients/mock';
import type { LlmClient, LlmProviderId } from './types';

export interface LlmProviderDefinition {
  id: LlmProviderId;
  /** Shown in the node config dropdown. */
  label: string;
  /** Env var holding the API key (`null` for mock). */
  envKey: string | null;
  /** OpenAI-compatible base URL (`null` for mock). */
  baseURL: string | null;
  defaultModel: string;
  /** Models offered in the config UI (free text is still allowed). */
  suggestedModels: string[];
}

export const LLM_PROVIDERS: Record<LlmProviderId, LlmProviderDefinition> = {
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    envKey: 'DEEPSEEK_API_KEY',
    baseURL: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-flash',
    suggestedModels: ['deepseek-flash', 'deepseek-v4-pro'],
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    envKey: 'GROQ_API_KEY',
    baseURL: 'https://api.groq.com/openai/v1',
    defaultModel: 'qwen/qwen3.8-27b',
    suggestedModels: ['qwen/qwen3.8-27b', 'openai/gpt-oss-120b'],
  },
  mock: {
    id: 'mock',
    label: 'Mock (no API call)',
    envKey: null,
    baseURL: null,
    defaultModel: 'mock-model',
    suggestedModels: ['mock-model'],
  },
};

/** Provider used when a node does not specify one. */
export const DEFAULT_PROVIDER: LlmProviderId = 'deepseek';

export function isLlmProviderId(value: unknown): value is LlmProviderId {
  return typeof value === 'string' && value in LLM_PROVIDERS;
}

export function listLlmProviders(): LlmProviderDefinition[] {
  return Object.values(LLM_PROVIDERS);
}

/** Provider id, falling back to the default for unknown/missing values. */
export function normalizeProviderId(value: unknown): LlmProviderId {
  return isLlmProviderId(value) ? value : DEFAULT_PROVIDER;
}

/** The configured model, or the provider default when blank. */
export function resolveModel(provider: LlmProviderId, model?: string | null): string {
  const trimmed = typeof model === 'string' ? model.trim() : '';
  return trimmed || LLM_PROVIDERS[provider].defaultModel;
}

/** API key from the environment, or null when unset/blank. */
export function resolveApiKey(provider: LlmProviderId): string | null {
  const envKey = LLM_PROVIDERS[provider].envKey;
  if (!envKey) return null;
  const value = process.env[envKey];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

const clientCache = new Map<LlmProviderId, LlmClient>();

/**
 * Build (or reuse) the client for a provider.
 *
 * Throws when the provider needs a key and the env var is missing. Never throws
 * for `mock`, which is what keeps the sandbox and Test Panel free of any
 * provider configuration.
 */
export function getLlmClient(provider: LlmProviderId): LlmClient {
  const definition = LLM_PROVIDERS[provider];
  if (!definition) {
    throw new Error(`[AI] Unknown provider "${provider}"`);
  }

  const cached = clientCache.get(provider);
  if (cached) return cached;

  let client: LlmClient;

  if (provider === 'mock') {
    client = new MockLlmClient({ defaultModel: definition.defaultModel });
  } else {
    const apiKey = resolveApiKey(provider);
    if (!apiKey) {
      throw new Error(
        `[AI] ${definition.label} is not configured: ${definition.envKey} is missing`
      );
    }
    client = new OpenAiCompatibleClient({
      id: provider,
      baseURL: definition.baseURL as string,
      apiKey,
      defaultModel: definition.defaultModel,
    });
  }

  clientCache.set(provider, client);
  return client;
}

/** Test/ops helper: drop cached clients (e.g. after an env change). */
export function clearLlmClientCache(): void {
  clientCache.clear();
}
