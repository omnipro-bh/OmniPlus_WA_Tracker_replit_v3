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
  LlmToolCall,
} from '../types';
import { approxTokens } from '../contextBuilder';

/** A scripted tool-call the mock should emit for a given turn. */
export interface MockToolCall {
  name: string;
  arguments?: Record<string, any>;
}

export interface MockClientOptions {
  /** Replies returned in order, one per call. */
  replies?: string[];
  /**
   * Per-call tool-call script. Each entry is the `toolCalls` to return for that
   * call, or `null` for a plain text reply. A call that consumes a non-empty
   * entry returns `finishReason: 'tool_calls'` and empty text.
   */
  toolCalls?: (MockToolCall[] | null)[];
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
  private readonly toolCallQueue: (MockToolCall[] | null)[];
  private readonly failWith?: string;

  /** Every request received, in order. Tests assert against this. */
  readonly requests: LlmCompletionRequest[] = [];

  constructor(options: MockClientOptions = {}) {
    this.queue = [...(options.replies ?? [])];
    this.toolCallQueue = [...(options.toolCalls ?? [])];
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
    const promptTokens = request.messages.reduce((sum, m) => sum + approxTokens(m.content), 0);

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
        toolCalls: [],
        error: this.failWith,
      };
    }

    // A scripted tool-call turn takes priority over the text queue. A `null`
    // entry means "answer with text this turn" (fall through to the reply).
    if (this.toolCallQueue.length > 0) {
      const scripted = this.toolCallQueue.shift();
      const calls = Array.isArray(scripted) ? scripted : null;

      if (calls && calls.length > 0) {
        const toolCalls: LlmToolCall[] = calls.map((call, index) => ({
          id: `call_${call.name}_${index}`,
          name: call.name,
          arguments: call.arguments ?? {},
        }));

        return {
          ok: true,
          text: '',
          provider: this.id,
          model,
          finishReason: 'tool_calls',
          usage: { promptTokens, completionTokens: 0, totalTokens: promptTokens },
          latencyMs: Date.now() - startedAt,
          attempts: 1,
          toolCalls,
        };
      }
    }

    const text = this.queue.length > 0 ? (this.queue.shift() as string) : `Mock reply: ${lastUserContent(request.messages)}`;
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
      toolCalls: [],
    };
  }
}
