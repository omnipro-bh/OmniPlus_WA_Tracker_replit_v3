/**
 * Phase 1 AI Agent node — one client for the whole OpenAI-compatible family.
 *
 * DeepSeek (`https://api.deepseek.com/v1`) and Groq
 * (`https://api.groq.com/openai/v1`) expose the same Chat Completions shape, so
 * they share this class and differ only by `baseURL` / key / default model
 * (locked decision: one npm package, `openai`, no per-provider SDKs).
 *
 * Retry/timeout policy (locked decision #8):
 *   - 20 s timeout per attempt, enforced with our own AbortController.
 *   - 2 retries, and ONLY on 429 / 5xx / network errors.
 *   - No retry on 4xx (bad key, bad request, unknown model) — fail fast.
 *   - A timeout is NOT retried: 3 × 20 s would stall the WhatsApp webhook.
 *
 * Hard rule: `complete()` NEVER throws. Callers get
 * `finishReason: 'error'` plus `error` so a node can route to its error handle.
 */

import OpenAI from 'openai';
import type {
  LlmClient,
  LlmCompletionRequest,
  LlmCompletionResult,
  LlmFinishReason,
  LlmProviderId,
} from '../types';

export const DEFAULT_TIMEOUT_MS = 20_000;
/** Initial attempt + 2 retries. */
export const MAX_ATTEMPTS = 3;
/** Backoff before retry 1 and retry 2 (ms). */
export const RETRY_BACKOFF_MS = [300, 900];

export interface OpenAiCompatibleOptions {
  /** `deepseek` or `groq` — the mock client lives elsewhere. */
  id: Extract<LlmProviderId, 'deepseek' | 'groq'>;
  baseURL: string;
  apiKey: string;
  defaultModel: string;
  timeoutMs?: number;
  /** Test seam: build the SDK client without touching the network. */
  clientFactory?: (options: { apiKey: string; baseURL: string; timeout: number }) => OpenAI;
  /** Test seam: skip the real backoff. */
  sleep?: (ms: number) => Promise<void>;
}

/** HTTP status of an SDK error, if it carries one. */
export function statusOf(error: any): number | null {
  const status = error?.status ?? error?.response?.status ?? error?.statusCode;
  return typeof status === 'number' ? status : null;
}

/** 429 and 5xx are transient; everything else is the caller's problem. */
export function isRetryableStatus(status: number | null): boolean {
  if (status === null) return true; // network error / timeout
  return status === 429 || status >= 500;
}

function messageOf(error: any): string {
  if (isTimeoutError(error)) {
    return 'The AI provider did not answer in time.';
  }
  return (
    error?.error?.message ||
    error?.message ||
    (typeof error === 'string' ? error : 'Unknown AI provider error')
  );
}

/** Aborts/timeouts. A timeout is not retried: 3 × 20 s would stall a webhook. */
function isTimeoutError(error: any): boolean {
  const name = String(error?.name || '');
  return name === 'AbortError' || name === 'APIUserAbortError' || name.includes('Timeout');
}

/** Assume a stop that hit the token cap is `length`, not `stop`. */
function normaliseFinishReason(reason: unknown): LlmFinishReason {
  if (reason === 'length') return 'length';
  if (reason === 'stop') return 'stop';
  return 'stop';
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class OpenAiCompatibleClient implements LlmClient {
  readonly id: LlmProviderId;
  readonly defaultModel: string;

  private readonly sdk: OpenAI;
  private readonly timeoutMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: OpenAiCompatibleOptions) {
    this.id = options.id;
    this.defaultModel = options.defaultModel;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.sleep = options.sleep ?? defaultSleep;

    const clientOptions = {
      apiKey: options.apiKey,
      baseURL: options.baseURL,
      timeout: this.timeoutMs,
    };
    // `maxRetries: 0` — this class owns the retry policy so tests and logs see
    // the real attempt count.
    this.sdk = options.clientFactory
      ? options.clientFactory(clientOptions)
      : new OpenAI({ ...clientOptions, maxRetries: 0 });
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
    const startedAt = Date.now();
    const model = request.model || this.defaultModel;
    const timeoutMs = request.timeoutMs ?? this.timeoutMs;

    let attempts = 0;
    let lastError = 'Unknown AI provider error';

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      attempts++;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const onCallerAbort = () => controller.abort();
      request.signal?.addEventListener('abort', onCallerAbort, { once: true });

      try {
        const completion = await this.sdk.chat.completions.create(
          {
            model,
            messages: request.messages.map((message) => ({
              role: message.role,
              content: message.content,
            })),
            temperature: request.temperature,
            max_tokens: request.maxTokens,
          },
          { signal: controller.signal, timeout: timeoutMs }
        );

        const choice = completion?.choices?.[0];
        const text = (choice?.message?.content ?? '').toString();
        const usage = completion?.usage;

        return {
          ok: true,
          text,
          provider: this.id,
          model: completion?.model || model,
          finishReason: normaliseFinishReason(choice?.finish_reason),
          usage: {
            promptTokens: usage?.prompt_tokens ?? 0,
            completionTokens: usage?.completion_tokens ?? 0,
            totalTokens: usage?.total_tokens ?? 0,
          },
          latencyMs: Date.now() - startedAt,
          attempts,
        };
      } catch (error: any) {
        const status = statusOf(error);
        const timedOut = isTimeoutError(error);
        lastError = timedOut
          ? `The AI provider did not answer within ${timeoutMs}ms.`
          : messageOf(error);

        const canRetry = attempt < MAX_ATTEMPTS - 1 && !timedOut && isRetryableStatus(status);
        if (!canRetry) {
          if (status !== null) lastError = `${lastError} (HTTP ${status})`;
          break;
        }

        console.warn(
          `[AI] ${this.id} attempt ${attempts} failed (${lastError}); retrying in ${RETRY_BACKOFF_MS[attempt]}ms`
        );
        await this.sleep(RETRY_BACKOFF_MS[attempt] ?? 900);
      } finally {
        clearTimeout(timer);
        request.signal?.removeEventListener('abort', onCallerAbort);
      }
    }

    return {
      ok: false,
      text: '',
      provider: this.id,
      model,
      finishReason: 'error',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      latencyMs: Date.now() - startedAt,
      attempts,
      error: lastError,
    };
  }
}
