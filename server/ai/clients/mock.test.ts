/**
 * Phase 1 AI Agent node — mock provider tests.
 *
 * The mock is what the sandbox and the Test Panel use by default, so its two
 * guarantees are tested: deterministic output and zero network/SDK usage.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { MockLlmClient } from './mock';
import type { LlmCompletionRequest } from '../types';

const request: LlmCompletionRequest = {
  messages: [
    { role: 'system', content: 'You are a support assistant.' },
    { role: 'user', content: 'What are your opening hours?' },
  ],
  temperature: 0.7,
  maxTokens: 100,
};

test('mock returns queued replies in FIFO order', async () => {
  const client = new MockLlmClient({ replies: ['first reply', 'second reply'] });

  const first = await client.complete(request);
  const second = await client.complete(request);

  assert.equal(first.text, 'first reply');
  assert.equal(second.text, 'second reply');
  assert.equal(client.callCount, 2);
});

test('mock is deterministic when the queue is empty', async () => {
  const a = new MockLlmClient();
  const b = new MockLlmClient();

  const resultA = await a.complete(request);
  const resultB = await b.complete(request);

  assert.equal(resultA.text, 'Mock reply: What are your opening hours?');
  assert.equal(resultA.text, resultB.text);
});

test('mock result shape looks like a real provider response', async () => {
  const client = new MockLlmClient({ defaultModel: 'mock-model' });

  const result = await client.complete(request);

  assert.equal(result.ok, true);
  assert.equal(result.provider, 'mock');
  assert.equal(result.model, 'mock-model');
  assert.equal(result.finishReason, 'stop');
  assert.equal(result.attempts, 1);
  assert.ok(result.text.length > 0);
  assert.ok(result.usage.totalTokens >= result.usage.completionTokens);
  assert.ok(result.latencyMs >= 0);
});

test('mock honours a per-request model override', async () => {
  const client = new MockLlmClient({ defaultModel: 'mock-model' });

  const result = await client.complete({ ...request, model: 'custom-model' });

  assert.equal(result.model, 'custom-model');
});

test('mock can be scripted to fail without throwing', async () => {
  const client = new MockLlmClient({ failWith: 'provider down' });

  const result = await client.complete(request);

  assert.equal(result.ok, false);
  assert.equal(result.finishReason, 'error');
  assert.equal(result.text, '');
  assert.equal(result.error, 'provider down');
});

test('mock records every request it received', async () => {
  const client = new MockLlmClient();

  await client.complete(request);
  await client.complete(request);

  assert.equal(client.requests.length, 2);
  assert.equal(client.requests[0].messages.length, 2);
});
