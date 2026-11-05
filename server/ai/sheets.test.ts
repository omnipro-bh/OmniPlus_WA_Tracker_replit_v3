/**
 * Phase 4 AI Agent node — two-tab Google Sheets schema + header matching.
 *
 * `matchSheetHeaders` powers the config UI's "Detect Headers" button, so these
 * tests guard the fuzzy matching (`Verification Question` ≈
 * `verification_question`) and the new `start_step` column.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { AI_SHEET_TAB_SCHEMA, matchSheetHeaders } from '@shared/ai-defaults';

const intents = AI_SHEET_TAB_SCHEMA.find((t) => t.tab === 'Intents')!;
const steps = AI_SHEET_TAB_SCHEMA.find((t) => t.tab === 'Workflow_Steps')!;

test('Intents schema carries start_step, verification_question and priority', () => {
  const keys = intents.columns.map((c) => c.key);
  assert.ok(keys.includes('start_step'));
  assert.ok(keys.includes('verification_question'));
  assert.ok(keys.includes('priority'));
});

test('Workflow_Steps schema carries fallback and message_type', () => {
  const keys = steps.columns.map((c) => c.key);
  assert.ok(keys.includes('fallback'));
  assert.ok(keys.includes('message_type'));
});

test('matchSheetHeaders matches canonical snake_case headers exactly', () => {
  const headers = ['id', 'type', 'keywords', 'start_step', 'verification_question', 'answer'];
  const { mapping, missing } = matchSheetHeaders(headers, intents);

  assert.equal(mapping.keywords, 'keywords');
  assert.equal(mapping.start_step, 'start_step');
  assert.equal(mapping.verification_question, 'verification_question');
  assert.deepEqual(missing, ['media', 'priority', 'message_type']);
});

test('matchSheetHeaders matches human headers case/space/underscore-insensitively', () => {
  const headers = ['ID', 'Type', 'Keywords', 'Start Step', 'Verification Question', 'Answer'];
  const { mapping } = matchSheetHeaders(headers, intents);

  assert.equal(mapping.id, 'ID');
  assert.equal(mapping.start_step, 'Start Step');
  assert.equal(mapping.verification_question, 'Verification Question');
  assert.equal(mapping.answer, 'Answer');
});

test('matchSheetHeaders reports unmatched schema keys for a steps tab', () => {
  const headers = ['Intent ID', 'Step ID', 'AI Question', 'Fallback'];
  const { mapping, missing } = matchSheetHeaders(headers, steps);

  assert.deepEqual(mapping, {
    intent_id: 'Intent ID',
    step_id: 'Step ID',
    ai_question: 'AI Question',
    fallback: 'Fallback',
  });
  assert.deepEqual(missing, ['expected_input', 'next_step_logic', 'message_type']);
});

test('matchSheetHeaders tolerates blank headers and an empty sheet', () => {
  assert.deepEqual(matchSheetHeaders([], intents).mapping, {});
  assert.deepEqual(matchSheetHeaders(['', '  ', 'id'], intents).mapping, { id: 'id' });
});
