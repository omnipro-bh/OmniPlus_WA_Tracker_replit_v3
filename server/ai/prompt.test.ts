/**
 * Phase 1 AI Agent node — system prompt tests.
 *
 * "Arabic in → Arabic out" is enforced by instruction, not by a detection call,
 * so these assertions are the only guard that the rule actually ships.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { LANGUAGE_RULES, buildSystemPrompt, buildSlotExtractionPrompt, extractJsonObject } from './prompt';

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

test('buildSlotExtractionPrompt lists every slot name and the message', () => {
  const p = buildSlotExtractionPrompt(['department', 'branch'], 'book ENT at Manama');

  assert.match(p, /department/);
  assert.match(p, /branch/);
  assert.match(p, /book ENT at Manama/);
  assert.match(p, /STRICT JSON/);
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
