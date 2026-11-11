/**
 * Step 2 — reasoning prompt v2 contract.
 *
 * These pin the three things that broke the "blood test" turn:
 *   1. the persona reaches the reasoner (system message), not just the task;
 *   2. the intent catalogue + `target_intent_id` contract;
 *   3. unusable output is reported as a failure — never fabricated as
 *      `ask_clarification`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { reasoningStep, REASONING_PROMPT_VERSION, type ReasoningIntent } from './agentHarness';
import type { LlmClient, LlmCompletionRequest, LlmCompletionResult } from '../ai/types';

const INTENTS: ReasoningIntent[] = [
  { id: '1', type: 'Booking', keywords: 'dental, dentist, book' },
  { id: '2', type: 'FAQ', keywords: 'hours, open, timing', answer: 'We are open 8am to 8pm.' },
  { id: '3', type: 'Greeting', keywords: 'hello, hi, salam' },
];

const OBJECTIVES = ['Book an appointment', 'Capture leads', 'Answer FAQs'];
const PERSONA = 'You are MediAssist, the AI assistant for Alhilal Hospital.';

/**
 * Scripted client: returns the queued outputs in order (repeating the last) and
 * records every request so the prompt itself can be asserted.
 */
function scriptedClient(responses: (string | { error: string })[]) {
  const requests: LlmCompletionRequest[] = [];
  let index = 0;
  const client: LlmClient = {
    id: 'mock',
    defaultModel: 'test-model',
    async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
      requests.push(request);
      const scripted = responses[Math.min(index, responses.length - 1)] ?? '{}';
      index++;

      if (typeof scripted !== 'string') {
        return {
          ok: false,
          text: '',
          provider: 'mock',
          model: client.defaultModel,
          finishReason: 'error',
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          latencyMs: 0,
          attempts: 1,
          toolCalls: [],
          error: scripted.error,
        };
      }

      return {
        ok: true,
        text: scripted,
        provider: 'mock',
        model: client.defaultModel,
        finishReason: 'stop',
        usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
        latencyMs: 1,
        attempts: 1,
        toolCalls: [],
      };
    },
  };
  return { client, requests };
}

test('"blood test" routes to verify_booking with the Booking intent id', async () => {
  const { client, requests } = scriptedClient([
    JSON.stringify({
      reasoning: 'The customer named a service this hospital offers, so they want to book it.',
      action: 'verify_booking',
      target_intent_id: 1,
      slots: { service: 'blood test' },
      verification_question: 'Would you like to book an appointment for a blood test?',
    }),
  ]);

  const result = await reasoningStep(client, PERSONA, OBJECTIVES, 'blood test', {}, { intents: INTENTS });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.decision.action, 'verify_booking');
  // A numeric id from the model is normalised to the sheet's string id.
  assert.equal(result.decision.target_intent_id, '1');
  assert.deepEqual(result.decision.slots, { service: 'blood test' });
  assert.match(result.decision.verification_question ?? '', /blood test/i);

  // The persona and the catalogue both reach the model.
  assert.equal(requests.length, 1);
  const messages = requests[0].messages;
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, 'system');
  assert.match(messages[0].content, /MediAssist/);
  assert.equal(messages[1].role, 'user');
  assert.match(messages[1].content, /- id: 1, type: Booking, keywords: dental, dentist, book/);
  assert.match(messages[1].content, /A bare service, test, department, doctor, or date/);
  assert.match(messages[1].content, /map it to the "department" slot/);
  assert.match(messages[1].content, /Always choose "verify_booking"/);

  // CoT + JSON needs far more room than the old 500 tokens.
  assert.equal(requests[0].maxTokens, 1500);

  assert.equal(result.trace.promptVersion, REASONING_PROMPT_VERSION);
  assert.equal(result.trace.hadIntentCatalogue, true);
  assert.equal(result.trace.targetIntentId, '1');
  assert.equal(result.trace.ok, true);
});

test('an unknown target_intent_id is retried with the valid ids, then fails loudly', async () => {
  const bad = JSON.stringify({
    reasoning: 'Booking.',
    action: 'verify_booking',
    target_intent_id: 7,
    slots: {},
    verification_question: 'Book it?',
  });
  const { client, requests } = scriptedClient([bad]);

  const result = await reasoningStep(client, PERSONA, OBJECTIVES, 'blood test', {}, { intents: INTENTS });

  assert.equal(result.ok, false);
  assert.equal(result.trace.errorKind, 'schema');
  // Never a fabricated decision.
  assert.equal(result.trace.action, 'none');
  assert.equal(result.trace.targetIntentId, null);
  assert.equal(requests.length, 2);
  const retry = requests[1].messages[requests[1].messages.length - 1];
  assert.match(retry.content, /valid ids: 1, 2, 3/);
});

test('verify_booking without target_intent_id fails loudly', async () => {
  const bad = JSON.stringify({
    reasoning: 'Booking.',
    action: 'verify_booking',
    slots: {},
    verification_question: 'Book it?',
  });
  const { client } = scriptedClient([bad]);

  const result = await reasoningStep(client, PERSONA, OBJECTIVES, 'blood test', {}, { intents: INTENTS });

  assert.equal(result.ok, false);
  assert.equal(result.trace.errorKind, 'schema');
  assert.equal(result.trace.action, 'none');
});

test('truncated output degrades to ok:false/invalid_json, never ask_clarification', async () => {
  const { client } = scriptedClient([
    '{"reasoning":"The customer said blood test, which is a service. I think the best action is to',
  ]);

  const result = await reasoningStep(client, PERSONA, OBJECTIVES, 'blood test', {}, { intents: INTENTS });

  assert.equal(result.ok, false);
  assert.equal(result.trace.errorKind, 'invalid_json');
  assert.equal(result.trace.action, 'none');
  assert.equal(result.trace.targetIntentId, null);
  assert.ok(result.trace.rawText?.includes('I think the best action is to'));
});

test('a provider rate limit is reported as rate_limit, not a decision', async () => {
  const { client } = scriptedClient([{ error: 'Rate limit reached for model (HTTP 429)' }]);

  const result = await reasoningStep(client, PERSONA, OBJECTIVES, 'blood test', {}, { intents: INTENTS });

  assert.equal(result.ok, false);
  assert.equal(result.trace.errorKind, 'rate_limit');
  assert.equal(result.trace.action, 'none');
});

test('ask_clarification drops any target_intent_id it was given', async () => {
  const { client } = scriptedClient([
    JSON.stringify({ reasoning: 'Unclear.', action: 'ask_clarification', target_intent_id: 2, slots: {} }),
  ]);

  const result = await reasoningStep(client, PERSONA, OBJECTIVES, 'hmm', {}, { intents: INTENTS });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.decision.action, 'ask_clarification');
  assert.equal(result.decision.target_intent_id, null);
});

test('the traced chain-of-thought is capped at 240 characters', async () => {
  const long = 'x'.repeat(600);
  const { client } = scriptedClient([
    JSON.stringify({ reasoning: long, action: 'ask_clarification', slots: {} }),
  ]);

  const result = await reasoningStep(client, PERSONA, OBJECTIVES, 'hmm', {}, { intents: INTENTS });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.trace.reasoning.length, 241); // 240 + the ellipsis
  assert.ok(result.trace.reasoning.endsWith('…'));
});

test('without a catalogue the prompt says so and the flag is false', async () => {
  const { client, requests } = scriptedClient([
    JSON.stringify({ reasoning: 'Nothing to match.', action: 'ask_clarification', slots: {} }),
  ]);

  const result = await reasoningStep(client, PERSONA, OBJECTIVES, 'hello there', {});

  assert.equal(result.ok, true);
  assert.match(requests[0].messages[1].content, /None defined\./);
  assert.equal(result.trace.hadIntentCatalogue, false);
});
