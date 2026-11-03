/**
 * Deterministic mock LLM provider.
 *
 * Used by the sandbox (default `aiMode: 'mock'`), the Test Panel and unit
 * tests. It performs no network I/O, needs no API key and cannot spend money.
 *
 * Deliberately contains NO `openai` import: the mock must keep working when
 * provider keys are unset, which is exactly when the sandbox is used.
 *
 * Replies are served FIFO from an optional queue; when the queue is empty the
 * last user message is echoed back. Same input + same queue ⇒ same output.
 */

import type {
  LlmClient,
  LlmCompletionRequest,
  LlmCompletionResult,
  LlmMessage,
  LlmProviderId,
} from '../types';
import { approxTokens } from '../contextBuilder';

export interface MockClientOptions {
  /** Replies returned in order, one per call. */
  replies?: string[];
  defaultModel?: string;
  /**
   * When set, `complete()` returns `finishReason: 'error'` instead of a reply.
   * Lets tests exercise the node's error handle without a network.
   */
  failWith?: string;
}

function lastUserContent(messages: LlmMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') return messages[i].content ?? '';
  }
  return '';
}

export class MockLlmClient implements LlmClient {
  readonly id: LlmProviderId = 'mock';
  readonly defaultModel: string;

  private queue: string[];
  private readonly failWith?: string;

  /** Every request received, in order. Tests assert against this. */
  readonly requests: LlmCompletionRequest[] = [];

  constructor(options: MockClientOptions = {}) {
    this.queue = [...(options.replies ?? [])];
    this.defaultModel = options.defaultModel ?? 'mock-model';
    this.failWith = options.failWith;
  }

  /** Append replies to the queue (used by the Test Panel for a scripted demo). */
  enqueue(...replies: string[]): void {
    this.queue.push(...replies);
  }

  /** Number of completed calls so far. */
  get callCount(): number {
    return this.requests.length;
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
    const startedAt = Date.now();
    this.requests.push(request);

    const model = request.model || this.defaultModel;

    if (this.failWith) {
      return {
        ok: false,
        text: '',
        provider: this.id,
        model,
        finishReason: 'error',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latencyMs: Date.now() - startedAt,
        attempts: 1,
        error: this.failWith,
      };
    }

    const text = this.queue.length > 0 ? (this.queue.shift() as string) : `Mock reply: ${lastUserContent(request.messages)}`;
    const promptTokens = request.messages.reduce((sum, m) => sum + approxTokens(m.content), 0);
    const completionTokens = approxTokens(text);

    return {
      ok: true,
      text,
      provider: this.id,
      model,
      finishReason: 'stop',
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
      latencyMs: Date.now() - startedAt,
      attempts: 1,
    };
  }
}
