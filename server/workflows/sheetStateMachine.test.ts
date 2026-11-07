/**
 * Phase 4d — deterministic sheet state machine tests (Task 5 MVP) and the
 * Phase 4d-2 slot pipeline: the LLM extracts raw values, code validates them.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractSlot,
  isSheetStateMachineEnabled,
  parseNextStepLogic,
  readSheetState,
  runSheetStateMachine,
  substituteSlots,
  type RowReader,
} from './sheetStateMachine';
import type { LlmClient, LlmCompletionRequest, LlmCompletionResult } from '../ai/types';

// ── test LLM client ─────────────────────────────────────────────────────────

/**
 * Scripted LlmClient: returns the queued response texts in order and repeats the
 * last one once the queue is exhausted. Records the number of calls.
 */
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
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        latencyMs: 0,
        attempts: 1,
        toolCalls: [],
      };
    },
  };
  return client;
}

// ── pure helpers ────────────────────────────────────────────────────────────

test('parseNextStepLogic advances on "→ Step_N" and completes otherwise', () => {
  assert.deepEqual(parseNextStepLogic('→ Step_2'), { kind: 'advance', stepId: 'Step_2' });
  assert.deepEqual(parseNextStepLogic(' →  step_3 '), { kind: 'advance', stepId: 'Step_3' });
  assert.deepEqual(parseNextStepLogic('→ done'), { kind: 'done' });
  assert.deepEqual(parseNextStepLogic('done'), { kind: 'done' });
  assert.deepEqual(parseNextStepLogic(''), { kind: 'done' });
  assert.deepEqual(parseNextStepLogic(null), { kind: 'done' });
  assert.deepEqual(parseNextStepLogic('garbage text'), { kind: 'done' });
});

test('substituteSlots replaces {slot} placeholders and leaves unknown ones', () => {
  assert.equal(
    substituteSlots('Booked {datetime} at {location}.', { datetime: 'tomorrow 3pm', location: 'riffa' }),
    'Booked tomorrow 3pm at riffa.'
  );
  assert.equal(substituteSlots('Booked {datetime}.', {}), 'Booked {datetime}.');
  assert.equal(substituteSlots('Booked {datetime}.', { datetime: '' }), 'Booked {datetime}.');
});

test('readSheetState tolerates a missing or malformed sheet object', () => {
  assert.deepEqual(readSheetState({}, 'n1'), { intentId: null, stepId: null, slots: {} });
  assert.deepEqual(readSheetState({ ai: { n1: { sheet: 'garbage' } } }, 'n1'), {
    intentId: null,
    stepId: null,
    slots: {},
  });
  assert.deepEqual(
    readSheetState({ ai: { n1: { sheet: { intentId: '1', stepId: 'Step_2', slots: { a: 1 } } } } }, 'n1'),
    { intentId: '1', stepId: 'Step_2', slots: { a: 1 } }
  );
});

// ── extractSlot: raw extraction only ────────────────────────────────────────

test('extractSlot returns the raw value and trims it', async () => {
  const client = stubClient(['{"value": "  riffa  "}']);
  const out = await extractSlot(client, 'location', 'I live in Riffa');

  assert.deepEqual(out, { ok: true, value: 'riffa', attempts: 1 });
});

test('extractSlot keeps "today at 6 PM" even when options is a placeholder', async () => {
  const client = stubClient(['{"value": "today at 6 PM"}']);
  const out = await extractSlot(client, 'datetime', 'today at 6 PM', {
    type: 'text',
    options: ['(leave empty)'],
  });

  assert.deepEqual(out, { ok: true, value: 'today at 6 PM', attempts: 1 });
});

test('extractSlot ignores a stray "valid": false from the model', async () => {
  const client = stubClient([
    '{"value": "today at 6 PM", "valid": false, "reason": "not a datetime"}',
  ]);
  const out = await extractSlot(client, 'datetime', 'today at 6 PM', { type: 'text' });

  // The model's opinion is not authority — the raw value survives.
  assert.deepEqual(out, { ok: true, value: 'today at 6 PM', attempts: 1 });
});

test('extractSlot treats a null value as empty without retrying', async () => {
  const client = stubClient(['{"value": null}']);
  const out = await extractSlot(client, 'branch', 'banana', {
    type: 'list',
    options: ['Manama', 'Hidd'],
  });

  assert.deepEqual(out, { ok: true, value: '', attempts: 1 });
  assert.equal(client.calls, 1); // not a format failure → no corrective retry
});

test('extractSlot retries malformed JSON and succeeds', async () => {
  const client = stubClient(['not json at all', '{"value": "Manama"}']);
  const out = await extractSlot(client, 'branch', 'Manama', {
    type: 'list',
    options: ['Manama', 'Hidd'],
  });

  assert.deepEqual(out, { ok: true, value: 'Manama', attempts: 2 });
  assert.equal(client.calls, 2);
});

test('extractSlot gives up after retries are exhausted', async () => {
  const client = stubClient(['nope']);
  const out = await extractSlot(client, 'branch', 'x', { type: 'text' });

  assert.equal(out.ok, false);
  assert.equal(out.attempts, 3); // initial + 2 retries
  assert.equal(client.calls, 3);
  if (!out.ok) assert.match(out.error, /Extraction failed after 3 attempts/);
});

test('isSheetStateMachineEnabled requires a detected slot_name column', () => {
  const base = { spreadsheetId: 's', tabs: ['Intents', 'Workflow_Steps'] };

  assert.equal(isSheetStateMachineEnabled(undefined), false);
  assert.equal(isSheetStateMachineEnabled({ ...base }), false); // no detected headers

  assert.equal(
    isSheetStateMachineEnabled({
      ...base,
      detected: { Workflow_Steps: ['intent_id', 'step_id', 'ai_question'] },
    }),
    false
  );

  assert.equal(
    isSheetStateMachineEnabled({
      ...base,
      detected: { Workflow_Steps: ['intent_id', 'step_id', 'ai_question', 'slot_name'] },
    }),
    true
  );
});

// ── state machine flow (injected reader) ────────────────────────────────────

const sheet = { spreadsheetId: 's', tabs: ['Intents', 'Workflow_Steps'] } as any;

const INTENTS = [
  {
    id: '1',
    keywords: 'dental, dentist, teeth',
    start_step: 'Step_1',
    answer: 'Your {service} appointment is booked for {datetime}.',
  },
];

const STEPS = [
  {
    intent_id: '1',
    step_id: 'Step_1',
    ai_question: 'Which service do you need?',
    expected_input: 'text',
    slot_name: 'service',
    next_step_logic: '→ Step_2',
    fallback: 'Please choose a service.',
  },
  {
    intent_id: '1',
    step_id: 'Step_2',
    ai_question: 'When would you like it?',
    expected_input: 'text',
    slot_name: 'datetime',
    next_step_logic: '→ done',
    fallback: 'Please provide a date and time.',
  },
];

/** Fixture reader: returns the intents / steps based on tab + filter. */
const reader: RowReader = async (_sheet, tab, filter) => {
  if (tab === 'Intents') {
    if (filter?.column === 'id') {
      return INTENTS.filter((i) => i.id === filter.value);
    }
    return INTENTS;
  }
  if (tab === 'Workflow_Steps') {
    return STEPS.filter((s) => s.intent_id === filter?.value);
  }
  return [];
};

test('first turn resolves intent and asks the first step', async () => {
  const turn = await runSheetStateMachine(sheet, {}, 'n1', 'dental appointment', reader);

  assert.equal(turn.sheet.intentId, '1');
  assert.equal(turn.sheet.stepId, 'Step_1');
  assert.deepEqual(turn.sheet.slots, {});
  assert.equal(turn.text, 'Which service do you need?');
  assert.equal(turn.toolCalls.length, 2); // Intents + Workflow_Steps
});

test('second turn captures the slot and advances via next_step_logic', async () => {
  const context = { ai: { n1: { sheet: { intentId: '1', stepId: 'Step_1', slots: {} } } } };
  const turn = await runSheetStateMachine(sheet, context, 'n1', 'cleaning', reader);

  assert.equal(turn.sheet.slots.service, 'cleaning');
  assert.equal(turn.sheet.stepId, 'Step_2');
  assert.equal(turn.text, 'When would you like it?');
});

test('third turn completes and substitutes slots into the answer', async () => {
  const context = {
    ai: { n1: { sheet: { intentId: '1', stepId: 'Step_2', slots: { service: 'cleaning' } } } },
  };
  const turn = await runSheetStateMachine(sheet, context, 'n1', 'tomorrow 3pm', reader);

  // The substituted answer proves both slots were captured and used.
  assert.equal(turn.text, 'Your cleaning appointment is booked for tomorrow 3pm.');
  // state resets after completion (fresh conversation next turn)
  assert.equal(turn.sheet.intentId, null);
  assert.equal(turn.sheet.stepId, null);
});

test('slot_name maps the user message into the captured slot', async () => {
  const reader2: RowReader = async () => [
    {
      intent_id: '1',
      step_id: 'Step_1',
      ai_question: 'Where?',
      slot_name: 'location',
      next_step_logic: '→ Step_2',
    },
    {
      intent_id: '1',
      step_id: 'Step_2',
      ai_question: 'When?',
      slot_name: 'datetime',
      next_step_logic: '→ done',
    },
  ];
  const context = { ai: { n1: { sheet: { intentId: '1', stepId: 'Step_1', slots: {} } } } };
  const turn = await runSheetStateMachine(sheet, context, 'n1', 'riffa', reader2);

  assert.equal(turn.sheet.slots.location, 'riffa');
  assert.equal(turn.sheet.stepId, 'Step_2');
});

test('no intent match returns a friendly fallback', async () => {
  const emptyReader: RowReader = async () => [];
  const turn = await runSheetStateMachine(sheet, {}, 'n1', 'gibberish', emptyReader);

  assert.match(turn.text, /could not find an answer/i);
  assert.equal(turn.sheet.intentId, null);
});

// ── Task 5b: turn-1 LLM slot extraction ─────────────────────────────────────

test('turn-1 extraction with high confidence skips filled steps', async () => {
  const client = stubClient(['{"slots": {"service": "ENT"}, "confidence": 0.9}']);

  const turn = await runSheetStateMachine(sheet, {}, 'n1', 'book ENT', reader, client);

  assert.equal(turn.sheet.stepId, 'Step_2'); // Step_1 (service) filled → skip
  assert.equal(turn.text, 'When would you like it?');
  assert.deepEqual(turn.sheet.slots, { service: 'ENT' });
  assert.deepEqual(turn.skippedSteps, ['Step_1']);
  assert.deepEqual(turn.extractedSlots, { service: 'ENT' });
  assert.equal(turn.extractionConfidence, 0.9);
  assert.equal(turn.slotExtractionAttempts, 1);
});

test('turn-1 extraction with all slots filled completes immediately', async () => {
  const client = stubClient([
    '{"slots": {"service": "ENT", "datetime": "6 PM today"}, "confidence": 0.95}',
  ]);

  const turn = await runSheetStateMachine(sheet, {}, 'n1', 'book ENT at 6pm today', reader, client);

  assert.equal(turn.text, 'Your ENT appointment is booked for 6 PM today.');
  assert.equal(turn.sheet.intentId, null); // completed → reset
  assert.equal(turn.sheet.stepId, null);
});

test('turn-1 extraction is not gated on the model confidence', async () => {
  const client = stubClient(['{"slots": {"service": "ENT"}, "confidence": 0.1}']);

  const turn = await runSheetStateMachine(sheet, {}, 'n1', 'book ENT', reader, client);

  // The value is validated by code, so the model's self-reported certainty is
  // irrelevant to whether a slot is stored.
  assert.equal(turn.sheet.stepId, 'Step_2');
  assert.deepEqual(turn.sheet.slots, { service: 'ENT' });
});

test('turn-1 extraction works without a confidence field at all', async () => {
  const client = stubClient(['{"slots": {"service": "ENT"}}']);

  const turn = await runSheetStateMachine(sheet, {}, 'n1', 'book ENT', reader, client);

  assert.equal(turn.sheet.stepId, 'Step_2');
  assert.deepEqual(turn.sheet.slots, { service: 'ENT' });
  assert.equal(turn.extractionConfidence, undefined);
});

test('turn-1 extraction that errors falls back to sequential after retrying', async () => {
  const client = stubClient(['error']);

  const turn = await runSheetStateMachine(sheet, {}, 'n1', 'book ENT', reader, client);

  assert.equal(turn.sheet.stepId, 'Step_1');
  assert.equal(turn.text, 'Which service do you need?');
  assert.equal(client.calls, 2); // initial + 1 retry (turn-1 uses maxRetries: 1)
  assert.equal(turn.slotExtractionAttempts, 2);
});

test('turn-1 extraction retries malformed JSON and then merges', async () => {
  const client = stubClient(['oops', '{"slots": {"service": "ENT"}, "confidence": 0.9}']);

  const turn = await runSheetStateMachine(sheet, {}, 'n1', 'book ENT', reader, client);

  assert.equal(turn.sheet.stepId, 'Step_2');
  assert.deepEqual(turn.sheet.slots, { service: 'ENT' });
  assert.equal(turn.slotExtractionAttempts, 2);
});

test('turn-1 extraction drops values that code validation rejects', async () => {
  const listSteps = [
    {
      intent_id: '1',
      step_id: 'Step_1',
      ai_question: 'Which department?',
      expected_input: 'list',
      slot_name: 'department',
      options: 'Dental, General',
      next_step_logic: '→ Step_2',
      fallback: 'Please pick a department.',
    },
    {
      intent_id: '1',
      step_id: 'Step_2',
      ai_question: 'When?',
      expected_input: 'text',
      slot_name: 'datetime',
      options: '(leave empty)',
      next_step_logic: '→ done',
      fallback: 'Please provide a date and time.',
    },
  ];
  const reader2: RowReader = async (_s, tab, filter) =>
    tab === 'Intents'
      ? [{ id: '1', keywords: 'book', start_step: 'Step_1', answer: 'Booked for {datetime}.' }]
      : listSteps.filter((s) => s.intent_id === filter?.value);

  const client = stubClient([
    '{"slots": {"department": "banana", "datetime": "today at 6 PM"}, "confidence": 0.3}',
  ]);
  const turn = await runSheetStateMachine(sheet, {}, 'n1', 'banana today at 6 PM', reader2, client);

  // department rejected → that step is still first-unfilled; datetime kept.
  assert.equal(turn.sheet.stepId, 'Step_1');
  assert.deepEqual(turn.sheet.slots, { datetime: 'today at 6 PM' });
  assert.equal(turn.rejectedSlots?.length, 1);
  assert.equal(turn.rejectedSlots?.[0].slot, 'department');
  assert.equal(turn.rejectedSlots?.[0].value, 'banana');
  assert.match(turn.rejectedSlots?.[0].reason ?? '', /not one of/);
});

test('turn-1 extraction ignores slots the sheet does not declare', async () => {
  const client = stubClient(['{"slots": {"service": "ENT", "invented": "x"}}']);

  const turn = await runSheetStateMachine(sheet, {}, 'n1', 'book ENT', reader, client);

  assert.deepEqual(turn.sheet.slots, { service: 'ENT' });
  assert.equal(turn.rejectedSlots, undefined);
});

test('ai_question {slot} placeholders are substituted on subsequent turns', async () => {
  const steps = [
    { intent_id: '1', step_id: 'Step_1', ai_question: 'Which service?', slot_name: 'service', next_step_logic: '→ Step_2' },
    { intent_id: '1', step_id: 'Step_2', ai_question: 'You chose {service}. Which branch?', slot_name: 'branch', next_step_logic: '→ done' },
  ];
  const reader2: RowReader = async (_s, tab, filter) => {
    if (tab === 'Intents') return [{ id: '1', keywords: 'book', start_step: 'Step_1', answer: 'Done' }];
    return steps.filter((s) => s.intent_id === filter?.value);
  };
  const context = { ai: { n1: { sheet: { intentId: '1', stepId: 'Step_1', slots: {} } } } };
  const turn = await runSheetStateMachine(sheet, context, 'n1', 'ENT', reader2);

  assert.equal(turn.text, 'You chose ENT. Which branch?');
});

// ── Phase 4d-2: turn-2+ extraction + deterministic validation ───────────────

test('turn 2+ stores the raw extracted value', async () => {
  const client = stubClient(['{"value": "Riffa"}']);
  const context = { ai: { n1: { sheet: { intentId: '1', stepId: 'Step_1', slots: {} } } } };

  const turn = await runSheetStateMachine(sheet, context, 'n1', 'I live in riffa', reader, client);

  assert.equal(turn.sheet.slots.service, 'Riffa');
  assert.equal(turn.sheet.stepId, 'Step_2');
  assert.equal(turn.slotExtractionAttempts, 1);
  assert.equal(turn.fallbackUsed, false);
});

test('turn 2+ ignores the model saying "valid": false when a value is present', async () => {
  const client = stubClient([
    '{"value": "cleaning", "valid": false, "reason": "the customer did not confirm"}',
  ]);
  const context = { ai: { n1: { sheet: { intentId: '1', stepId: 'Step_1', slots: {} } } } };

  const turn = await runSheetStateMachine(sheet, context, 'n1', 'cleaning', reader, client);

  assert.equal(turn.sheet.slots.service, 'cleaning');
  assert.equal(turn.sheet.stepId, 'Step_2');
  assert.equal(turn.fallbackUsed, false);
});

test('turn 2+ uses the raw message when the extractor returns nothing', async () => {
  const client = stubClient(['{"value": null}']);
  const context = { ai: { n1: { sheet: { intentId: '1', stepId: 'Step_1', slots: {} } } } };

  const turn = await runSheetStateMachine(sheet, context, 'n1', 'ok', reader, client);

  // The model returning "" must not suppress the customer's answer to the
  // question we just asked; code validation accepts any non-empty text.
  assert.equal(turn.sheet.slots.service, 'ok');
  assert.equal(turn.sheet.stepId, 'Step_2');
  assert.equal(turn.fallbackUsed, false);
});

test('turn 2+ raw-message fallback still rejects an out-of-list value', async () => {
  const listReader: RowReader = async (_s, tab, filter) => {
    if (tab === 'Intents') return INTENTS;
    return [
      {
        intent_id: '1',
        step_id: 'Step_1',
        ai_question: 'Which branch?',
        expected_input: 'list',
        slot_name: 'branch',
        options: 'Manama, Hidd',
        next_step_logic: '→ done',
        fallback: 'Sorry, please pick Manama or Hidd.',
      },
    ].filter((s) => s.intent_id === filter?.value);
  };
  const client = stubClient(['{"value": null}']);
  const context = { ai: { n1: { sheet: { intentId: '1', stepId: 'Step_1', slots: {} } } } };

  const turn = await runSheetStateMachine(sheet, context, 'n1', 'banana', listReader, client);

  assert.equal(turn.fallbackUsed, true);
  assert.equal(turn.sheet.stepId, 'Step_1');
  assert.deepEqual(turn.sheet.slots, {});
  assert.match(turn.fallbackReason ?? '', /not one of/); // the real reason, not "empty value"
});

test('turn 2+ rejects an out-of-list value and records the reason', async () => {
  const listReader: RowReader = async (_s, tab, filter) => {
    if (tab === 'Intents') return INTENTS;
    return [
      {
        intent_id: '1',
        step_id: 'Step_1',
        ai_question: 'Which branch?',
        expected_input: 'list',
        slot_name: 'branch',
        options: 'Manama, Hidd',
        next_step_logic: '→ done',
        fallback: 'Sorry, please pick Manama or Hidd.',
      },
    ].filter((s) => s.intent_id === filter?.value);
  };
  const client = stubClient(['{"value": "banana"}']);
  const context = { ai: { n1: { sheet: { intentId: '1', stepId: 'Step_1', slots: {} } } } };

  const turn = await runSheetStateMachine(sheet, context, 'n1', 'banana', listReader, client);

  assert.equal(turn.text, 'Sorry, please pick Manama or Hidd.');
  assert.equal(turn.sheet.stepId, 'Step_1'); // did NOT advance
  assert.deepEqual(turn.sheet.slots, {}); // nothing captured
  assert.equal(turn.fallbackUsed, true);
  assert.match(turn.fallbackReason ?? '', /not one of/);
});

test('turn 2+ valid list option is accepted case-insensitively and canonicalised', async () => {
  const listReader: RowReader = async (_s, tab) => {
    if (tab === 'Intents') return INTENTS;
    return [
      {
        intent_id: '1',
        step_id: 'Step_1',
        ai_question: 'Which branch?',
        expected_input: 'list',
        slot_name: 'branch',
        options: 'Manama, Hidd',
        next_step_logic: '→ Step_2',
      },
      {
        intent_id: '1',
        step_id: 'Step_2',
        ai_question: 'Your name?',
        expected_input: 'text',
        slot_name: 'name',
        next_step_logic: '→ done',
      },
    ];
  };
  const client = stubClient(['{"value": "manama"}']);
  const context = { ai: { n1: { sheet: { intentId: '1', stepId: 'Step_1', slots: {} } } } };

  const turn = await runSheetStateMachine(sheet, context, 'n1', 'manama', listReader, client);

  assert.equal(turn.sheet.slots.branch, 'Manama'); // the sheet's spelling
  assert.equal(turn.sheet.stepId, 'Step_2');
  assert.equal(turn.text, 'Your name?');
});

test('turn 2+ accepts "today at 6 PM" for a text slot with a placeholder options cell', async () => {
  const datetimeReader: RowReader = async (_s, tab, filter) => {
    if (tab === 'Intents')
      return [{ id: '1', keywords: 'dental', start_step: 'Step_1', answer: 'Booked for {datetime}.' }];
    return [
      {
        intent_id: '1',
        step_id: 'Step_1',
        ai_question: 'Preferred date/time?',
        expected_input: 'text',
        slot_name: 'datetime',
        options: '(leave empty)',
        next_step_logic: '→ done',
        fallback: 'What date and time?',
      },
    ].filter((s) => s.intent_id === filter?.value);
  };
  const client = stubClient(['{"value": "today at 6 PM"}']);
  const context = { ai: { n1: { sheet: { intentId: '1', stepId: 'Step_1', slots: {} } } } };

  const turn = await runSheetStateMachine(sheet, context, 'n1', 'today at 6 PM', datetimeReader, client);

  // The production regression: this used to loop on the fallback forever.
  assert.equal(turn.fallbackUsed, false);
  assert.equal(turn.text, 'Booked for today at 6 PM.');
  assert.equal(turn.sheet.stepId, null); // completed → reset
});

test('turn 2+ extraction failure after retries triggers the fallback', async () => {
  const client = stubClient(['garbage']);
  const context = { ai: { n1: { sheet: { intentId: '1', stepId: 'Step_1', slots: {} } } } };

  const turn = await runSheetStateMachine(sheet, context, 'n1', 'cleaning', reader, client);

  assert.equal(turn.text, 'Please choose a service.');
  assert.equal(turn.sheet.stepId, 'Step_1');
  assert.equal(turn.fallbackUsed, true);
  assert.equal(turn.slotExtractionAttempts, 3); // initial + 2 retries
  assert.match(turn.fallbackReason ?? '', /Extraction failed/);
});

test('turn 2+ without a client validates the raw message in code', async () => {
  const context = { ai: { n1: { sheet: { intentId: '1', stepId: 'Step_1', slots: {} } } } };

  const turn = await runSheetStateMachine(sheet, context, 'n1', '  cleaning  ', reader);

  assert.equal(turn.sheet.slots.service, 'cleaning');
  assert.equal(turn.sheet.stepId, 'Step_2');
});

test('turn 2+ without a client still rejects an out-of-list value', async () => {
  const listReader: RowReader = async (_s, tab, filter) => {
    if (tab === 'Intents') return INTENTS;
    return [
      {
        intent_id: '1',
        step_id: 'Step_1',
        ai_question: 'Which branch?',
        expected_input: 'list',
        slot_name: 'branch',
        options: 'Manama, Hidd',
        next_step_logic: '→ done',
        fallback: 'Sorry, please pick Manama or Hidd.',
      },
    ].filter((s) => s.intent_id === filter?.value);
  };
  const context = { ai: { n1: { sheet: { intentId: '1', stepId: 'Step_1', slots: {} } } } };

  const turn = await runSheetStateMachine(sheet, context, 'n1', 'banana', listReader);

  assert.equal(turn.fallbackUsed, true);
  assert.equal(turn.sheet.stepId, 'Step_1');
  assert.deepEqual(turn.sheet.slots, {});
});
