/**
 * Phase 1 AI Agent node — system prompt tests.
 *
 * "Arabic in → Arabic out" is enforced by instruction, not by a detection call,
 * so these assertions are the only guard that the rule actually ships.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LANGUAGE_RULES,
  buildSystemPrompt,
  buildSlotExtractionPrompt,
  extractJsonObject,
  llmJson,
} from './prompt';
import type { LlmClient, LlmCompletionRequest, LlmCompletionResult } from './types';

/** Scripted LlmClient returning the queued texts in order (repeats the last). */
function stubClient(responses: (string | 'error')[]): LlmClient & { calls: number } {
  let index = 0;
  const client = {
    id: 'mock' as const,
    defaultModel: 'test-model',
    calls: 0,
    async complete(_request: LlmCompletionRequest): Promise<LlmCompletionResult> {
      client.calls++;
      const scripted = responses[Math.min(index, responses.length - 1)] ?? '{}';
      index++;
      if (scripted === 'error') {
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
          error: 'boom',
        };
      }
      return {
        ok: true,
        text: scripted,
        provider: 'mock',
        model: client.defaultModel,
        finishReason: 'stop',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latencyMs: 0,
        attempts: 1,
        toolCalls: [],
      };
    },
  };
  return client;
}

test('system prompt carries the language rules', () => {
  const prompt = buildSystemPrompt({ ownerPrompt: 'Answer questions about delivery.' });

  assert.ok(prompt.includes(LANGUAGE_RULES));
  assert.match(prompt, /Arabic in, Arabic out/);
  assert.match(prompt, /SAME language as the customer/);
  assert.match(prompt, /Never mix two languages/);
});

test('system prompt keeps the owner instructions and labels them', () => {
  const prompt = buildSystemPrompt({ ownerPrompt: 'We sell flowers in Manama.' });

  assert.match(prompt, /BUSINESS INSTRUCTIONS:/);
  assert.ok(prompt.includes('We sell flowers in Manama.'));
});

test('owner prompt is trimmed and empty prompts fall back to a default', () => {
  const blank = buildSystemPrompt({ ownerPrompt: '   ' });

  assert.ok(blank.includes('Assist the customer politely and helpfully'));
  assert.ok(!blank.includes('BUSINESS INSTRUCTIONS:\n\n\n'));
});

test('business name is used when provided', () => {
  const prompt = buildSystemPrompt({ ownerPrompt: 'x', businessName: 'OmniPlus' });

  assert.match(prompt, /You are the customer support assistant for OmniPlus\./);
});

test('web chat and WhatsApp get different tone guidance', () => {
  const whatsapp = buildSystemPrompt({ ownerPrompt: 'x', channel: 'whatsapp' });
  const webChat = buildSystemPrompt({ ownerPrompt: 'x', channel: 'web_chat' });

  assert.match(whatsapp, /WhatsApp/);
  assert.match(webChat, /website chat widget/);
});

test('language rules come last so they win over owner instructions', () => {
  const prompt = buildSystemPrompt({ ownerPrompt: 'Always answer in French.' });

  assert.ok(
    prompt.indexOf('Always answer in French.') < prompt.indexOf('LANGUAGE RULES'),
    'language rules must appear after the owner prompt'
  );
});

test('extra rules are inserted before the language rules', () => {
  const prompt = buildSystemPrompt({ ownerPrompt: 'x', extraRules: 'PHASE 2: tools go here' });

  assert.ok(prompt.indexOf('PHASE 2: tools go here') < prompt.indexOf('LANGUAGE RULES'));
});

test('prompt is stable for the same input', () => {
  const a = buildSystemPrompt({ ownerPrompt: 'same', businessName: 'Shop' });
  const b = buildSystemPrompt({ ownerPrompt: 'same', businessName: 'Shop' });

  assert.equal(a, b);
});

// ── Phase 4: Google Sheets lookup guidance ──────────────────────────────────

test('sheet rules are added only when a data source is configured', () => {
  const withoutSheets = buildSystemPrompt({ ownerPrompt: 'x' });
  assert.ok(!withoutSheets.includes('GOOGLE SHEETS DATA SOURCE'));

  const withSheets = buildSystemPrompt({
    ownerPrompt: 'x',
    googleSheets: { spreadsheetId: 'sheet_1', tabs: ['Intents', 'Workflow_Steps'] },
  });
  assert.match(withSheets, /GOOGLE SHEETS DATA SOURCE/);
  assert.match(withSheets, /lookup_sheet/);
  assert.ok(withSheets.indexOf('GOOGLE SHEETS DATA SOURCE') < withSheets.indexOf('LANGUAGE RULES'));
});

test('sheet rules tell the model the two-step lookup sequence', () => {
  const prompt = buildSystemPrompt({
    ownerPrompt: 'x',
    googleSheets: { spreadsheetId: 'sheet_1', tabs: ['Intents', 'Workflow_Steps'] },
  });

  assert.match(prompt, /tab: "Intents", filter_column: "keywords"/);
  assert.match(prompt, /tab: "Workflow_Steps", filter_column: "intent_id"/);
  assert.match(prompt, /Prefer the row matching MORE words/);
  assert.match(prompt, /start_step/);
  assert.match(prompt, /verification_question/);
});

test('sheet rules use start_step when detection confirms the column exists', () => {
  const prompt = buildSystemPrompt({
    ownerPrompt: 'x',
    googleSheets: {
      spreadsheetId: 'sheet_1',
      tabs: ['Intents', 'Workflow_Steps'],
      detected: {
        Intents: ['id', 'type', 'keywords', 'start_step', 'verification_question', 'answer'],
        Workflow_Steps: ['intent_id', 'step_id', 'ai_question'],
      },
    },
  });

  assert.match(prompt, /start at "start_step" if set, else the first step/);
  assert.ok(!prompt.includes('no "start_step" column'));
});

test('sheet rules fall back to the first step when start_step is absent', () => {
  const prompt = buildSystemPrompt({
    ownerPrompt: 'x',
    googleSheets: {
      spreadsheetId: 'sheet_1',
      tabs: ['Intents', 'Workflow_Steps'],
      detected: {
        Intents: ['id', 'type', 'keywords', 'answer'],
        Workflow_Steps: ['intent_id', 'step_id', 'ai_question'],
      },
    },
  });

  assert.match(prompt, /no "start_step" column/);
});

test('sheet column mapping overrides the header names in the prompt', () => {
  const prompt = buildSystemPrompt({
    ownerPrompt: 'x',
    googleSheets: {
      spreadsheetId: 'sheet_1',
      tabs: ['Intents', 'Workflow_Steps'],
      columns: {
        Intents: { keywords: 'Keywords_AR', answer: 'Reply_Text' },
        Workflow_Steps: { intent_id: 'Intent', ai_question: 'Question' },
      },
    },
  });

  assert.match(prompt, /filter_column: "Keywords_AR"/);
  assert.match(prompt, /filter_column: "Intent"/);
  assert.match(prompt, /each "Question"/);
  assert.ok(!prompt.includes('filter_column: "keywords"'));
});

// ── Task 5b: slot extraction prompt + JSON parser ───────────────────────────

test('buildSlotExtractionPrompt lists every field and the message', () => {
  const p = buildSlotExtractionPrompt(
    [{ name: 'department', type: 'list', options: ['Dental', 'General'] }, { name: 'datetime', type: 'text' }],
    'book ENT at Manama'
  );

  assert.match(p, /department/);
  assert.match(p, /datetime/);
  assert.match(p, /one of: Dental, General/);
  assert.match(p, /book ENT at Manama/);
  assert.match(p, /STRICT JSON/);
});

test('buildSlotExtractionPrompt never injects "invalid"/"valid" wording', () => {
  const p = buildSlotExtractionPrompt([{ name: 'datetime', type: 'text' }], 'today at 6 PM');

  assert.ok(!/invalid/i.test(p));
  assert.ok(!/"valid"/.test(p)); // no validity field in the JSON contract
  assert.match(p, /Do not explain/);
});

test('buildSlotExtractionPrompt hides placeholders and text-slot choices', () => {
  const p = buildSlotExtractionPrompt(
    [{ name: 'datetime', type: 'text', options: ['(leave empty)'] }],
    'today at 6 PM'
  );

  assert.ok(!p.includes('(leave empty)'));
  assert.ok(!p.includes('one of:'));
});

test('extractJsonObject parses clean, fenced and prose-wrapped JSON', () => {
  assert.deepEqual(extractJsonObject('{"a": 1}'), { a: 1 });
  assert.deepEqual(extractJsonObject('```json\n{"a": 1}\n```'), { a: 1 });
  assert.deepEqual(extractJsonObject('the result is {"a": 1} done'), { a: 1 });
});

test('extractJsonObject returns null for invalid or absent JSON', () => {
  assert.equal(extractJsonObject('no json here'), null);
  assert.equal(extractJsonObject('{invalid}'), null);
  assert.equal(extractJsonObject(''), null);
  assert.equal(extractJsonObject(undefined as any), null);
});

// ── Phase 4d-2: llmJson (strict JSON + validation + retries) ────────────────

const validateGreeting = (obj: any) =>
  typeof obj?.greeting === 'string' && obj.greeting.trim()
    ? { ok: true as const, value: obj.greeting as string }
    : { ok: false as const, reason: 'missing greeting' };

test('llmJson returns a validated value on the first attempt', async () => {
  const client = stubClient(['{"greeting": "hello"}']);
  const out = await llmJson(client, 'say hello as JSON', validateGreeting);

  assert.deepEqual(out, { ok: true, value: 'hello', attempts: 1 });
});

test('llmJson retries after invalid JSON and then succeeds', async () => {
  const client = stubClient(['nope', '{"greeting": "hi"}']);
  const out = await llmJson(client, 'say hello as JSON', validateGreeting);

  assert.deepEqual(out, { ok: true, value: 'hi', attempts: 2 });
});

test('llmJson retries when validation fails and then succeeds', async () => {
  const client = stubClient(['{"other": 1}', '{"greeting": "hey"}']);
  const out = await llmJson(client, 'say hello as JSON', validateGreeting);

  assert.deepEqual(out, { ok: true, value: 'hey', attempts: 2 });
});

test('llmJson returns an error after retries are exhausted', async () => {
  const client = stubClient(['{"other": 1}']);
  const out = await llmJson(client, 'say hello as JSON', validateGreeting, { maxRetries: 1 });

  assert.equal(out.ok, false);
  assert.equal(out.attempts, 2);
  if (!out.ok) assert.match(out.error, /Extraction failed after 2 attempts/);
  assert.equal(client.calls, 2);
});

test('llmJson retries provider errors and reports failure', async () => {
  const client = stubClient(['error']);
  const out = await llmJson(client, 'say hello as JSON', validateGreeting, { maxRetries: 0 });

  assert.equal(out.ok, false);
  assert.equal(out.attempts, 1);
});
