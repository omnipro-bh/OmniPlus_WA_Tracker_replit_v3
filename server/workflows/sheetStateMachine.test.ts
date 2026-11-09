/**
 * Phase 4d — deterministic sheet state machine tests (Task 5 MVP) and the
 * Phase 4d-2 slot pipeline: the LLM extracts raw values, code validates them.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  collectLookupFedSlots,
  extractSlot,
  formatRejectionText,
  generateConversationalFallback,
  isInterruption,
  isSheetStateMachineEnabled,
  looseCellMatch,
  missingSlotsText,
  parseLookupFilter,
  parseNextStepLogic,
  parseSlotNames,
  rankLookupHits,
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
  // The arrow is optional — owners also type "Step_5" / "Step 5".
  assert.deepEqual(parseNextStepLogic('Step_5'), { kind: 'advance', stepId: 'Step_5' });
  assert.deepEqual(parseNextStepLogic('Step 7'), { kind: 'advance', stepId: 'Step_7' });
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
  assert.deepEqual(readSheetState({}, 'n1'), { intentId: null, stepId: null, slots: {}, pendingIntentId: null, awaitingVerification: false });
  assert.deepEqual(readSheetState({ ai: { n1: { sheet: 'garbage' } } }, 'n1'), {
    intentId: null,
    stepId: null,
    slots: {},
    pendingIntentId: null,
    awaitingVerification: false,
  });
  assert.deepEqual(
    readSheetState({ ai: { n1: { sheet: { intentId: '1', stepId: 'Step_2', slots: { a: 1 } } } } }, 'n1'),
    { intentId: '1', stepId: 'Step_2', slots: { a: 1 }, pendingIntentId: null, awaitingVerification: false }
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

test('no intent match hands the turn back for a conversational reply', async () => {
  const emptyReader: RowReader = async () => [];
  const turn = await runSheetStateMachine(sheet, {}, 'n1', 'gibberish', emptyReader);

  // Increment G: no static failure text — the executor answers with the LLM.
  assert.equal(turn.conversational, true);
  assert.equal(turn.text, '');
  assert.equal(turn.sheet.intentId, null);
  assert.equal(turn.sheet.stepId, null);
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

// ── Increment E: conversational fallback (mock vs real provider) ─────────────

test('generateConversationalFallback skips the mock client (no model call, no echo)', async () => {
  const client = stubClient(['whatever']);
  const out = await generateConversationalFallback(
    client,
    'department',
    'dentist',
    'Which department do you need?',
    'Please pick a department.',
    ['Dental', 'ENT']
  );

  assert.equal(out, '');
  assert.equal(client.calls, 0); // the mock never made a call
});

test('generateConversationalFallback returns the model text for a real provider', async () => {
  const real: LlmClient = {
    id: 'groq',
    defaultModel: 'test-model',
    async complete(_req: LlmCompletionRequest): Promise<LlmCompletionResult> {
      return {
        ok: true,
        text: 'I see you are looking for a dentist. Our departments are Dental and ENT — which would you like?',
        provider: 'groq',
        model: 'test-model',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
        latencyMs: 1,
        attempts: 1,
        toolCalls: [],
      };
    },
  };

  const out = await generateConversationalFallback(
    real,
    'department',
    'dentist',
    'Which department do you need?',
    '',
    ['Dental', 'ENT']
  );

  assert.match(out, /dentist/i);
  assert.match(out, /Dental/);
  assert.match(out, /ENT/);
});

// ── Phase 4d-2: dynamic lookups ─────────────────────────────────────────────

test('parseLookupFilter splits AND clauses into column=value', () => {
  assert.deepEqual(parseLookupFilter('branch={location} AND doctor={specialist}'), [
    { column: 'branch', value: '{location}' },
    { column: 'doctor', value: '{specialist}' },
  ]);
  assert.deepEqual(parseLookupFilter(''), []);
  assert.deepEqual(parseLookupFilter('doctor=Dr. Ahmed'), [{ column: 'doctor', value: 'Dr. Ahmed' }]);
  assert.deepEqual(parseLookupFilter('  branch=Riffa  and doctor=Dr. A '), [
    { column: 'branch', value: 'Riffa' },
    { column: 'doctor', value: 'Dr. A' },
  ]);
});

test('lookup step runs silently, stores the extracted value, and completes', async () => {
  const reader: RowReader = async (_s, tab, filter) => {
    if (tab === 'Intents') {
      return [
        { id: '1', keywords: 'book', start_step: 'Step_1', answer: 'Your {specialist} appointment is available at {available_times}.' },
      ];
    }
    if (tab === 'Doctors_Schedule') {
      return [{ specialist: 'Dr. Ahmed', available_times: '5 PM' }];
    }
    return [
      { intent_id: '1', step_id: 'Step_1', step_type: 'ask', ai_question: 'Which specialist?', slot_name: 'specialist', next_step_logic: '→ Step_2' },
      { intent_id: '1', step_id: 'Step_2', step_type: 'lookup', lookup_source: 'Doctors_Schedule', lookup_filter: 'specialist={specialist}', lookup_extract: 'available_times', slot_name: 'available_times', next_step_logic: '→ done' },
    ].filter((s) => s.intent_id === filter?.value);
  };

  // Turn 1 asks the first step.
  const t1 = await runSheetStateMachine(sheet, {}, 'n1', 'book a doctor', reader);
  assert.equal(t1.text, 'Which specialist?');
  assert.equal(t1.sheet.stepId, 'Step_1');

  // Turn 2 captures the specialist, runs the lookup silently, and completes.
  const context = { ai: { n1: { sheet: { intentId: '1', stepId: 'Step_1', slots: {} } } } };
  const t2 = await runSheetStateMachine(sheet, context, 'n1', 'Dr. Ahmed', reader);
  assert.equal(t2.text, 'Your Dr. Ahmed appointment is available at 5 PM.');
  assert.equal(t2.sheet.intentId, null); // completed → reset
  assert.equal(t2.fallbackUsed, false);
});

test('lookup failure advances to alternate_step and records fallback', async () => {
  const reader: RowReader = async (_s, tab, filter) => {
    if (tab === 'Intents') {
      return [{ id: '1', keywords: 'book', start_step: 'Step_1', answer: 'Done' }];
    }
    if (tab === 'Doctors_Schedule') {
      return []; // no matching rows
    }
    return [
      { intent_id: '1', step_id: 'Step_1', step_type: 'ask', ai_question: 'Which specialist?', slot_name: 'specialist', next_step_logic: '→ Step_2' },
      { intent_id: '1', step_id: 'Step_2', step_type: 'lookup', lookup_source: 'Doctors_Schedule', lookup_filter: 'specialist={specialist}', lookup_extract: 'available_times', slot_name: 'available_times', next_step_logic: '→ done', alternate_step: '→ Step_3' },
      { intent_id: '1', step_id: 'Step_3', step_type: 'ask', ai_question: 'No availability. Try another time?', slot_name: 'fallback_time', next_step_logic: '→ done' },
    ].filter((s) => s.intent_id === filter?.value);
  };

  const context = { ai: { n1: { sheet: { intentId: '1', stepId: 'Step_1', slots: {} } } } };
  const t2 = await runSheetStateMachine(sheet, context, 'n1', 'Dr. Ahmed', reader);

  assert.equal(t2.text, 'No availability. Try another time?');
  assert.equal(t2.sheet.stepId, 'Step_3');
  assert.equal(t2.fallbackUsed, true); // the lookup failed
});

test('collectLookupFedSlots extracts slot names referenced in lookup_filter', () => {
  const steps = [
    { step_id: 'Step_2', lookup_filter: 'specialist={specialist} AND branch={location}' },
    { step_id: 'Step_3', lookup_filter: 'doctor={doctor}' },
  ];
  const slots = collectLookupFedSlots(steps, 'lookup_filter');
  assert.deepEqual(Array.from(slots).sort(), ['doctor', 'location', 'specialist']);
});

test('a slot referenced in a lookup_filter accepts any non-empty string', async () => {
  const reader: RowReader = async (_s, tab, filter) => {
    if (tab === 'Intents') {
      return [
        { id: '1', keywords: 'book', start_step: 'Step_1', answer: 'Your {specialist} appointment is available at {available_times}.' },
      ];
    }
    if (tab === 'Doctors_Schedule') {
      return [{ specialist: 'Dr. Bindiya Sajan', available_times: '5 PM' }];
    }
    return [
      { intent_id: '1', step_id: 'Step_1', step_type: 'ask', ai_question: 'Which specialist?', expected_input: 'list', options: 'Dr. Ahmed, Dr. Ali', slot_name: 'specialist', next_step_logic: '→ Step_2' },
      { intent_id: '1', step_id: 'Step_2', step_type: 'lookup', lookup_source: 'Doctors_Schedule', lookup_filter: 'specialist={specialist}', lookup_extract: 'available_times', slot_name: 'available_times', next_step_logic: '→ done' },
    ].filter((s) => s.intent_id === filter?.value);
  };

  const context = { ai: { n1: { sheet: { intentId: '1', stepId: 'Step_1', slots: {} } } } };
  const t2 = await runSheetStateMachine(sheet, context, 'n1', 'Dr. Bindiya Sajan', reader);

  // "Dr. Bindiya Sajan" is not in the hardcoded options list, but because
  // `specialist` feeds a lookup_filter it is accepted as free text, the schedule
  // lookup matches, and the flow completes.
  assert.equal(t2.text, 'Your Dr. Bindiya Sajan appointment is available at 5 PM.');
  assert.equal(t2.sheet.intentId, null); // completed
  assert.equal(t2.fallbackUsed, false);
});

test('turn-1 extraction of department, specialist and location skips to datetime', async () => {
  const reader: RowReader = async (_s, tab, filter) => {
    if (tab === 'Intents') {
      return [{ id: '1', keywords: 'book', start_step: 'Step_1', answer: 'Done' }];
    }
    return [
      { intent_id: '1', step_id: 'Step_1', ai_question: 'Which department?', slot_name: 'department', next_step_logic: '→ Step_2' },
      { intent_id: '1', step_id: 'Step_2', ai_question: 'Which specialist?', slot_name: 'specialist', next_step_logic: '→ Step_3' },
      { intent_id: '1', step_id: 'Step_3', ai_question: 'Which location?', slot_name: 'location', next_step_logic: '→ Step_4' },
      { intent_id: '1', step_id: 'Step_4', ai_question: 'When would you like it?', slot_name: 'datetime', next_step_logic: '→ done' },
    ].filter((s) => s.intent_id === filter?.value);
  };

  const client = stubClient([
    '{"slots": {"department": "Dental", "specialist": "Dr. X", "location": "Manama"}}',
  ]);

  const turn = await runSheetStateMachine(sheet, {}, 'n1', 'Dental with Dr. X at Manama', reader, client);

  assert.equal(turn.text, 'When would you like it?');
  assert.equal(turn.sheet.stepId, 'Step_4');
  assert.deepEqual(turn.sheet.slots, { department: 'Dental', specialist: 'Dr. X', location: 'Manama' });
  assert.deepEqual(turn.skippedSteps, ['Step_1', 'Step_2', 'Step_3']);
});

test('turn-1 skip-ahead runs an intermediate lookup then asks the remaining step', async () => {
  const reader: RowReader = async (_s, tab, filter) => {
    if (tab === 'Intents') {
      return [{ id: '1', keywords: 'book', start_step: 'Step_1', answer: 'Booked with {specialist} at {available_times}.' }];
    }
    if (tab === 'Doctors_Schedule') {
      return [{ specialist: 'Dr. X', available_times: '5 PM' }];
    }
    return [
      { intent_id: '1', step_id: 'Step_1', step_type: 'ask', ai_question: 'Which specialist?', slot_name: 'specialist', next_step_logic: '→ Step_2' },
      { intent_id: '1', step_id: 'Step_2', step_type: 'lookup', lookup_source: 'Doctors_Schedule', lookup_filter: 'specialist={specialist}', lookup_extract: 'available_times', slot_name: 'available_times', next_step_logic: '→ Step_3' },
      { intent_id: '1', step_id: 'Step_3', step_type: 'ask', ai_question: 'When?', slot_name: 'datetime', next_step_logic: '→ done' },
    ].filter((s) => s.intent_id === filter?.value);
  };

  const client = stubClient(['{"slots": {"specialist": "Dr. X"}}']);
  const turn = await runSheetStateMachine(sheet, {}, 'n1', 'book Dr. X', reader, client);

  // specialist filled on turn 1 → skip Step_1, run the Step_2 lookup silently, ask Step_3.
  assert.equal(turn.text, 'When?');
  assert.equal(turn.sheet.stepId, 'Step_3');
  assert.deepEqual(turn.sheet.slots, { specialist: 'Dr. X', available_times: '5 PM' });
});

// ── Intent type gate: Greeting / FAQ return the answer, Booking runs steps ───

test('a Greeting intent returns the answer column immediately (no state machine)', async () => {
  const calls: string[] = [];
  const greetingReader: RowReader = async (_s, tab) => {
    calls.push(tab);
    if (tab === 'Intents') {
      return [
        {
          id: 'greet',
          type: 'Greeting',
          keywords: 'hello, hi',
          answer: 'Hello! Welcome to Smile Clinic.',
        },
      ];
    }
    return STEPS;
  };

  const turn = await runSheetStateMachine(sheet, {}, 'n1', 'hello', greetingReader);

  assert.equal(turn.text, 'Hello! Welcome to Smile Clinic.');
  assert.deepEqual(turn.sheet, { intentId: null, stepId: null, slots: {}, pendingIntentId: null, awaitingVerification: false });
  assert.equal(turn.conversational, undefined);
  // Only the Intents tab is read — Workflow_Steps is never touched.
  assert.deepEqual(calls, ['Intents']);
  assert.equal(turn.toolCalls.length, 1);
});

test('an FAQ intent matches any casing and substitutes known slots', async () => {
  const faqReader: RowReader = async (_s, tab) =>
    tab === 'Intents'
      ? [{ id: 'faq', type: 'faq', keywords: 'hours', answer: 'We are open {hours}.' }]
      : [];

  const context = {
    ai: { n1: { sheet: { intentId: null, stepId: null, slots: { hours: '9 to 5' } } } },
  };
  const turn = await runSheetStateMachine(sheet, context, 'n1', 'hours', faqReader);

  assert.equal(turn.text, 'We are open 9 to 5.');
  assert.equal(turn.sheet.intentId, null);
});

test('a Booking intent type still runs the step sequence', async () => {
  const bookingReader: RowReader = async (_s, tab, filter) =>
    tab === 'Intents'
      ? [{ id: '1', type: 'Booking', keywords: 'book', start_step: 'Step_1', answer: 'Done' }]
      : STEPS.filter((s) => s.intent_id === filter?.value);

  const turn = await runSheetStateMachine(sheet, {}, 'n1', 'book', bookingReader);

  assert.equal(turn.sheet.intentId, '1');
  assert.equal(turn.sheet.stepId, 'Step_1');
  assert.equal(turn.text, 'Which service do you need?');
});

// ── Slot substitution hardening (case-insensitive + normalized keys) ────────

test('substituteSlots resolves case-insensitive and normalized slot keys', () => {
  assert.equal(substituteSlots('Dr {doctor_name}', { 'Doctor Name': 'Dr. Ahmed' }), 'Dr Dr. Ahmed');
  assert.equal(substituteSlots('Dr {Doctor_Name}', { doctor_name: 'Dr. A' }), 'Dr Dr. A');
  assert.equal(substituteSlots('Dr {doctor_name}', { Doctor_Name: 'Dr. B' }), 'Dr Dr. B');
});

test('a lookup with a blank slot_name stores under the normalized lookup_extract', async () => {
  const lookupReader: RowReader = async (_s, tab, filter) => {
    if (tab === 'Intents') {
      return [{ id: '1', type: 'Booking', keywords: 'book', start_step: 'Step_1', answer: 'Done' }];
    }
    if (tab === 'Doctors_Schedule') {
      return [{ specialist: 'Dr. X', 'Doctor Name': 'Dr. Muhammed Ahsan' }];
    }
    return [
      {
        intent_id: '1',
        step_id: 'Step_1',
        ai_question: 'Which specialist?',
        slot_name: 'specialist',
        next_step_logic: '→ Step_2',
      },
      {
        intent_id: '1',
        step_id: 'Step_2',
        step_type: 'lookup',
        lookup_source: 'Doctors_Schedule',
        lookup_filter: 'specialist={specialist}',
        lookup_extract: 'Doctor Name',
        next_step_logic: '→ Step_3',
      },
      {
        intent_id: '1',
        step_id: 'Step_3',
        ai_question: 'We have {doctor_name}. Your name?',
        slot_name: 'patient_name',
        next_step_logic: '→ done',
      },
    ].filter((s) => s.intent_id === filter?.value);
  };

  const context = { ai: { n1: { sheet: { intentId: '1', stepId: 'Step_1', slots: {} } } } };
  const turn = await runSheetStateMachine(sheet, context, 'n1', 'Dr. X', lookupReader);

  assert.equal(turn.sheet.slots.doctor_name, 'Dr. Muhammed Ahsan');
  assert.equal(turn.text, 'We have Dr. Muhammed Ahsan. Your name?');
});

// ── Real-world booking flow (Greeting → Dept → Confirm → Location → Time →
//    Doctor lookup → Collect details) ────────────────────────────────────────

test('the booking flow: "ENT doctor" → confirm → location → time → doctor lookup', async () => {
  const bookingReader: RowReader = async (_s, tab, filter) => {
    if (tab === 'Intents') {
      return [
        {
          id: 'book',
          type: 'Booking',
          keywords: 'book, appointment, doctor',
          start_step: 'Step_1',
          answer: 'Booked.',
        },
      ];
    }
    if (tab === 'Doctors_Schedule') {
      return [
        {
          department: 'ENT',
          location: 'Adliya',
          datetime: 'today at 6 PM',
          doctor_name: 'Dr. Muhammed Ahsan',
        },
      ];
    }
    return [
      {
        intent_id: 'book',
        step_id: 'Step_1',
        step_type: 'ask',
        ai_question: 'Which department do you need?',
        expected_input: 'list',
        options: 'ENT, Dental',
        slot_name: 'department',
        next_step_logic: '→ Step_2',
      },
      {
        intent_id: 'book',
        step_id: 'Step_2',
        step_type: 'ask',
        ai_question: 'Sure, Would you like to confirm the availability of the {department} doctor?',
        next_step_logic: '→ Step_3',
      },
      {
        intent_id: 'book',
        step_id: 'Step_3',
        step_type: 'ask',
        ai_question: 'And which location would you prefer?',
        slot_name: 'location',
        next_step_logic: '→ Step_4',
      },
      {
        intent_id: 'book',
        step_id: 'Step_4',
        step_type: 'ask',
        ai_question: 'Sure, and could you confirm the preferred date and time?',
        slot_name: 'datetime',
        next_step_logic: '→ Step_5',
      },
      {
        intent_id: 'book',
        step_id: 'Step_5',
        step_type: 'lookup',
        lookup_source: 'Doctors_Schedule',
        lookup_filter: 'department={department} AND location={location} AND datetime={datetime}',
        lookup_extract: 'doctor_name',
        slot_name: 'doctor_name',
        next_step_logic: '→ Step_6',
      },
      {
        intent_id: 'book',
        step_id: 'Step_6',
        step_type: 'ask',
        ai_question:
          'We have {doctor_name} has availability. To confirm booking, can you provide your name?',
        slot_name: 'patient_name',
        next_step_logic: '→ done',
      },
    ].filter((s) => s.intent_id === filter?.value);
  };

  const client = stubClient([
    '{"slots": {"department": "ENT doctor"}}',
    '{"value": "Adliya"}',
    '{"value": "today at 6 PM"}',
  ]);

  // 1. "ENT doctor" → department extracted (whole-word match) → confirm question.
  const t1 = await runSheetStateMachine(sheet, {}, 'n1', 'ENT doctor', bookingReader, client);
  assert.equal(t1.sheet.slots.department, 'ENT');
  assert.equal(t1.text, 'Sure, Would you like to confirm the availability of the ENT doctor?');

  // 2. "Yes" → the confirm step has no slot → location question.
  const t2 = await runSheetStateMachine(
    sheet,
    { ai: { n1: { sheet: t1.sheet } } },
    'n1',
    'Yes',
    bookingReader,
    client
  );
  assert.equal(t2.text, 'And which location would you prefer?');

  // 3. "Adliya" → time question.
  const t3 = await runSheetStateMachine(
    sheet,
    { ai: { n1: { sheet: t2.sheet } } },
    'n1',
    'Adliya',
    bookingReader,
    client
  );
  assert.equal(t3.text, 'Sure, and could you confirm the preferred date and time?');

  // 4. "today at 6 PM" → silent doctor lookup → name substituted into Step_6.
  const t4 = await runSheetStateMachine(
    sheet,
    { ai: { n1: { sheet: t3.sheet } } },
    'n1',
    'today at 6 PM',
    bookingReader,
    client
  );
  assert.equal(t4.sheet.stepId, 'Step_6');
  assert.equal(t4.sheet.slots.doctor_name, 'Dr. Muhammed Ahsan');
  assert.equal(
    t4.text,
    'We have Dr. Muhammed Ahsan has availability. To confirm booking, can you provide your name?'
  );
});

// ── Turn-1 deterministic pre-fill + loose lookup matching (production sheet) ─

test('looseCellMatch matches whole words/phrases in either direction', () => {
  assert.equal(looseCellMatch('ENT SURGEON', 'ENT'), true);
  assert.equal(looseCellMatch('ENT', 'ENT SURGEON'), true);
  assert.equal(looseCellMatch('SPECIALIST ENT', 'ent'), true);
  assert.equal(looseCellMatch('GASTROENTEROLOGIST', 'ENT'), false);
  assert.equal(looseCellMatch('Adliya', 'adliya'), true);
  assert.equal(looseCellMatch('Muharraq', 'Adliya'), false);
  assert.equal(looseCellMatch('', 'ENT'), false);
});

test('looseCellMatch maps a specialty to its schedule spelling', () => {
  // The production failure: "Gastroenterology" must match "CONSULTANT
  // GASTROENTEROLOGIST" (shared root after stripping -ology / -ologist).
  assert.equal(looseCellMatch('CONSULTANT GASTROENTEROLOGIST', 'Gastroenterology'), true);
  // A shorthand prefix also matches.
  assert.equal(looseCellMatch('CONSULTANT GASTROENTEROLOGIST', 'gastro'), true);
  // "ENT" must NOT false-positive on "gastroenterologist" (the "ent" substring).
  assert.equal(looseCellMatch('CONSULTANT GASTROENTEROLOGIST', 'ENT'), false);
  // Short specialty roots: "urology" ↔ "urologist" (the stem step skips "ur").
  assert.equal(looseCellMatch('SPECIALIST UROLOGIST', 'UROLOGY'), true);
  assert.equal(looseCellMatch('CONSULTANT CARDIOLOGIST', 'Cardiology'), true);
});

test('rankLookupHits moves rows marked off/vacation to the end', () => {
  const rows = [
    { Doctor: 'DR. SUSAN', Available_Times: 'WEELKLY OFF' },
    { Doctor: 'DR. MUHAMMED AHSAN', Available_Times: '09:30-12:30&04:30-09:30' },
    { Doctor: 'DR. X', Available_Times: 'ON VACATION UNTIL 17-11-2026' },
  ];
  assert.deepEqual(
    rankLookupHits(rows).map((r) => r.Doctor),
    ['DR. MUHAMMED AHSAN', 'DR. SUSAN', 'DR. X']
  );
});

test('turn-1 pre-fill matches list options without the LLM', async () => {
  const prefillReader: RowReader = async (_s, tab, filter) =>
    tab === 'Intents'
      ? [{ id: '1', keywords: 'book', start_step: 'Step_1', answer: 'Done' }]
      : [
          {
            intent_id: '1',
            step_id: 'Step_1',
            ai_question: 'Which location?',
            expected_input: 'list',
            options: 'Muharraq, Riffa, Adliya',
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
        ].filter((s) => s.intent_id === filter?.value);

  // No client: only the deterministic pre-fill can fill `location`.
  const turn = await runSheetStateMachine(sheet, {}, 'n1', 'book at Adliya please', prefillReader);

  assert.equal(turn.sheet.slots.location, 'Adliya');
  assert.equal(turn.text, 'When?');
  assert.deepEqual(turn.skippedSteps, ['Step_1']);
});

// Mirrors the production rows: Step_1 asks for confirmation with `{department}`,
// but no step declares a `department` slot — it must come from the schedule's
// own vocabulary ("ENT" inside "ENT SURGEON").
const PRODUCTION_STEPS = [
  {
    intent_id: '1',
    step_id: 'Step_1',
    step_type: 'ask',
    ai_question:
      'Sure, Would you like to confirm the availability of the {department} doctor for your appointment?',
    expected_input: 'buttons',
    slot_name: 'confirm',
    options: 'Yes, No',
    next_step_logic: '→ Step_2',
    fallback: 'Please reply with Yes or No.',
  },
  {
    intent_id: '1',
    step_id: 'Step_2',
    step_type: 'ask',
    ai_question: 'And which location is the closest to you?',
    expected_input: 'list',
    slot_name: 'location',
    options: 'Muharraq, Riffa, Adliya, Hamad Town',
    next_step_logic: '→ Step_3',
    fallback: 'Sorry, please pick a location from the list.',
  },
  {
    intent_id: '1',
    step_id: 'Step_3',
    step_type: 'ask',
    ai_question: 'Sure, and could you confirm the preferred date and time for the appointment?',
    expected_input: 'text',
    slot_name: 'datetime',
    next_step_logic: '→ Step_4',
    fallback: 'What date and time?',
  },
  {
    intent_id: '1',
    step_id: 'Step_4',
    step_type: 'lookup',
    ai_question: '(silent)',
    slot_name: 'doctor_name',
    lookup_source: 'Doctors_Schedule',
    lookup_filter: 'department={department} AND branch={location}',
    lookup_extract: 'Doctor',
    alternate_step: 'Step_6',
    next_step_logic: '→ Step_5',
  },
  {
    intent_id: '1',
    step_id: 'Step_5',
    step_type: 'ask',
    ai_question:
      'We have {doctor_name} has availability. To confirm booking, can you provide your name, active phone number and email along with CPR number',
    slot_name: 'customer_details',
    next_step_logic: '→ Step_7',
  },
  {
    intent_id: '1',
    step_id: 'Step_6',
    step_type: 'ask',
    ai_question:
      "Sorry, we don't have a {department} doctor at {location}. Would you like to try another location?",
    expected_input: 'buttons',
    slot_name: 'retry',
    options: 'Yes, No',
    next_step_logic: '',
  },
  {
    intent_id: '1',
    step_id: 'Step_7',
    step_type: 'ask',
    ai_question: 'Thank you for your details. Our booking team will call you to confirm.',
    slot_name: 'completed',
    next_step_logic: '→ done',
  },
];

const PRODUCTION_SCHEDULE = [
  { Doctor: 'DR. SUSAN', Branch: 'Adliya', Available_Times: 'WEELKLY OFF', department: 'ENT SURGEON' },
  {
    Doctor: 'DR. MUHAMMED AHSAN',
    Branch: 'Adliya',
    Available_Times: '09:30-12:30&04:30-09:30',
    department: 'ENT SURGEON',
  },
  { Doctor: 'DR. PRASANTH', Branch: 'Muharraq', Available_Times: '9-1/5-9', department: 'SPECIALIST ENT' },
];

const productionReader: RowReader = async (_s, tab, filter) => {
  if (tab === 'Intents') {
    return [
      {
        id: '1',
        keywords: 'ENT, dental, doctor, book',
        start_step: 'Step_1',
        type: 'Booking',
        answer: '',
        priority: 'High',
      },
    ];
  }
  if (tab === 'Doctors_Schedule') return PRODUCTION_SCHEDULE;
  return PRODUCTION_STEPS.filter((s) => s.intent_id === filter?.value);
};

test('production flow: "ENT doctor" pre-fills {department} from the schedule vocabulary', async () => {
  const t1 = await runSheetStateMachine(sheet, {}, 'n1', 'ENT doctor', productionReader);

  assert.equal(t1.sheet.slots.department, 'ENT');
  assert.equal(t1.sheet.stepId, 'Step_1');
  assert.equal(
    t1.text,
    'Sure, Would you like to confirm the availability of the ENT doctor for your appointment?'
  );
});

test('production flow: confirm → location → time → doctor lookup → details', async () => {
  const t1 = await runSheetStateMachine(sheet, {}, 'n1', 'ENT doctor', productionReader);
  const t2 = await runSheetStateMachine(sheet, { ai: { n1: { sheet: t1.sheet } } }, 'n1', 'Yes', productionReader);
  assert.equal(t2.text, 'And which location is the closest to you?');
  assert.equal(t2.sheet.slots.confirm, 'Yes');

  const t3 = await runSheetStateMachine(
    sheet,
    { ai: { n1: { sheet: t2.sheet } } },
    'n1',
    'Adliya',
    productionReader
  );
  assert.equal(t3.text, 'Sure, and could you confirm the preferred date and time for the appointment?');
  assert.equal(t3.sheet.slots.location, 'Adliya');

  const t4 = await runSheetStateMachine(
    sheet,
    { ai: { n1: { sheet: t3.sheet } } },
    'n1',
    'today at 6 PM',
    productionReader
  );
  // The lookup ran, matched "ENT" inside "ENT SURGEON" + Adliya, and skipped the
  // doctor marked "WEELKLY OFF".
  assert.equal(t4.sheet.stepId, 'Step_5');
  assert.equal(t4.sheet.slots.doctor_name, 'DR. MUHAMMED AHSAN');
  assert.equal(
    t4.text,
    'We have DR. MUHAMMED AHSAN has availability. To confirm booking, can you provide your name, active phone number and email along with CPR number'
  );
});

test('production flow: a lookup miss follows the arrow-less alternate_step', async () => {
  const noMatchReader: RowReader = async (_s, tab, filter) => {
    if (tab === 'Doctors_Schedule') {
      // ENT exists in the vocabulary (so {department} pre-fills) but not at Adliya.
      return [{ Doctor: 'DR. PRASANTH', Branch: 'Muharraq', Available_Times: '9-1/5-9', department: 'SPECIALIST ENT' }];
    }
    return productionReader(_s, tab, filter);
  };

  const t1 = await runSheetStateMachine(sheet, {}, 'n1', 'ENT doctor', noMatchReader);
  const t2 = await runSheetStateMachine(sheet, { ai: { n1: { sheet: t1.sheet } } }, 'n1', 'Yes', noMatchReader);
  const t3 = await runSheetStateMachine(
    sheet,
    { ai: { n1: { sheet: t2.sheet } } },
    'n1',
    'Adliya',
    noMatchReader
  );
  const t4 = await runSheetStateMachine(
    sheet,
    { ai: { n1: { sheet: t3.sheet } } },
    'n1',
    'today at 6 PM',
    noMatchReader
  );

  // alternate_step "Step_6" (no arrow) must advance, not complete.
  assert.equal(t4.sheet.stepId, 'Step_6');
  assert.equal(t4.text, "Sorry, we don't have a ENT doctor at Adliya. Would you like to try another location?");
});

// ── `validation` column: owner-declared format gates ───────────────────────

test('formatRejectionText names the expected format', () => {
  assert.equal(
    formatRejectionText('phone'),
    "That doesn't look like a valid phone number. Could you please provide your phone number again?"
  );
  assert.match(formatRejectionText('email'), /valid email address/);
  assert.match(formatRejectionText('number'), /valid number/);
  assert.match(formatRejectionText('date'), /valid date/);
  assert.match(formatRejectionText('^\\d{8}$'), /valid answer/);
});

test('a phone-validated step rejects "yes" and re-asks without advancing', async () => {
  const validationSteps = [
    {
      intent_id: '1',
      step_id: 'Step_1',
      ai_question: 'Please provide your name, active phone number and email.',
      slot_name: 'customer_details',
      expected_input: 'text',
      validation: 'phone',
      next_step_logic: '→ Step_2',
    },
    {
      intent_id: '1',
      step_id: 'Step_2',
      ai_question: 'Thank you, our booking team will call you.',
      slot_name: 'completed',
      next_step_logic: '→ done',
    },
  ];
  const reader: RowReader = async (_s, tab, filter) => {
    if (tab === 'Intents') {
      return [{ id: '1', keywords: 'book', start_step: 'Step_1', answer: 'Booked' }];
    }
    return validationSteps.filter((s) => s.intent_id === filter?.value);
  };

  const t1 = await runSheetStateMachine(sheet, {}, 'n1', 'book', reader);
  assert.equal(t1.sheet.stepId, 'Step_1');

  // The production bug: "yes" used to be stored as the customer's details.
  const t2 = await runSheetStateMachine(sheet, { ai: { n1: { sheet: t1.sheet } } }, 'n1', 'yes', reader);
  assert.equal(
    t2.text,
    "That doesn't look like a valid phone number. Could you please provide your phone number again?"
  );
  assert.equal(t2.fallbackUsed, true);
  assert.equal(t2.fallbackReason, 'Invalid format for phone');
  assert.equal(t2.sheet.stepId, 'Step_1');
  assert.equal(t2.sheet.slots.customer_details, undefined);

  // A real answer (multi-field, contains a phone) is accepted verbatim.
  const details = 'Ali Hassan, 39001234, ali@example.com, CPR 880011223';
  const t3 = await runSheetStateMachine(sheet, { ai: { n1: { sheet: t2.sheet } } }, 'n1', details, reader);
  assert.equal(t3.sheet.slots.customer_details, details);
  assert.equal(t3.sheet.stepId, 'Step_2');
  assert.equal(t3.text, 'Thank you, our booking team will call you.');
});

test('a step without a validation cell still accepts any non-empty answer', async () => {  const plainSteps = [
    {
      intent_id: '1',
      step_id: 'Step_1',
      ai_question: 'Any notes?',
      slot_name: 'notes',
      expected_input: 'text',
      validation: '',
      next_step_logic: '→ Step_2',
    },
    {
      intent_id: '1',
      step_id: 'Step_2',
      ai_question: 'Thanks!',
      slot_name: 'completed',
      next_step_logic: '→ done',
    },
  ];
  const reader: RowReader = async (_s, tab, filter) =>
    tab === 'Intents'
      ? [{ id: '1', keywords: 'book', start_step: 'Step_1', answer: 'Thanks!' }]
      : plainSteps.filter((s) => s.intent_id === filter?.value);

  const t1 = await runSheetStateMachine(sheet, {}, 'n1', 'book', reader);
  const t2 = await runSheetStateMachine(sheet, { ai: { n1: { sheet: t1.sheet } } }, 'n1', 'yes', reader);
  assert.equal(t2.sheet.slots.notes, 'yes');
  assert.equal(t2.text, 'Thanks!');
});

// ── multi-slot steps (`slot_name` = "name, phone, email, cpr") ─────────────

test('parseSlotNames splits a comma-separated slot_name cell', () => {
  assert.deepEqual(parseSlotNames('name, phone,email , cpr'), ['name', 'phone', 'email', 'cpr']);
  assert.deepEqual(parseSlotNames('name'), ['name']);
  assert.deepEqual(parseSlotNames(' name , name '), ['name']);
  assert.deepEqual(parseSlotNames('  '), []);
  assert.deepEqual(parseSlotNames(undefined), []);
});

test('missingSlotsText names every required slot', () => {
  assert.equal(
    missingSlotsText(['name', 'phone', 'email', 'cpr']),
    'I need your name, phone, email, and CPR to complete the booking. Could you please provide them?'
  );
  assert.equal(
    missingSlotsText(['name', 'phone']),
    'I need your name and phone to complete the booking. Could you please provide them?'
  );
  // The owner's `fallback` cell wins when set.
  assert.equal(missingSlotsText(['name'], 'Please send your name.'), 'Please send your name.');
});

function multiSlotReader(steps: Record<string, any>[]): RowReader {
  return async (_s, tab, filter) =>
    tab === 'Intents'
      ? [{ id: '1', keywords: 'book', start_step: 'Step_1', answer: 'Booked' }]
      : steps.filter((s) => s.intent_id === filter?.value);
}

test('a step with slots "name, phone" rejects "yes" and accepts "Ali, 39001234"', async () => {
  const steps = [
    {
      intent_id: '1',
      step_id: 'Step_1',
      ai_question: 'Please provide your name and phone number.',
      slot_name: 'name, phone',
      expected_input: 'text',
      next_step_logic: '→ Step_2',
    },
    {
      intent_id: '1',
      step_id: 'Step_2',
      ai_question: 'Thanks!',
      slot_name: 'completed',
      next_step_logic: '→ done',
    },
  ];
  const reader = multiSlotReader(steps);

  const t1 = await runSheetStateMachine(sheet, {}, 'n1', 'book', reader);
  assert.equal(t1.sheet.stepId, 'Step_1');

  const t2 = await runSheetStateMachine(sheet, { ai: { n1: { sheet: t1.sheet } } }, 'n1', 'yes', reader);
  assert.equal(t2.sheet.stepId, 'Step_1');
  assert.equal(t2.fallbackUsed, true);
  assert.equal(t2.fallbackReason, 'missing: name, phone');
  assert.equal(
    t2.text,
    'I need your name and phone to complete the booking. Could you please provide them?'
  );
  // Nothing partial is stored: "yes" must never become the customer's name.
  assert.deepEqual(t2.sheet.slots, {});

  const t3 = await runSheetStateMachine(
    sheet,
    { ai: { n1: { sheet: t2.sheet } } },
    'n1',
    'Ali, 39001234',
    reader
  );
  assert.equal(t3.sheet.slots.name, 'Ali');
  assert.equal(t3.sheet.slots.phone, '39001234');
  assert.equal(t3.sheet.stepId, 'Step_2');
  assert.equal(t3.text, 'Thanks!');
});

test('the Step_5 shape: "yes" is rejected, all four details advance', async () => {
  const steps = [
    {
      intent_id: '1',
      step_id: 'Step_5',
      ai_question:
        'We have {doctor_name} has availability. To confirm booking, can you provide your name, active phone number and email along with CPR number',
      slot_name: 'name, phone, email, cpr',
      expected_input: 'text',
      next_step_logic: '→ Step_7',
    },
    {
      intent_id: '1',
      step_id: 'Step_7',
      ai_question: 'Thank you for your details.',
      slot_name: 'completed',
      next_step_logic: '→ done',
    },
  ];
  const reader = multiSlotReader(steps);
  const start = { intentId: '1', stepId: 'Step_5', slots: {} };

  const rejected = await runSheetStateMachine(sheet, { ai: { n1: { sheet: start } } }, 'n1', 'yes', reader);
  assert.equal(rejected.sheet.stepId, 'Step_5');
  assert.equal(rejected.fallbackUsed, true);
  assert.equal(
    rejected.text,
    'I need your name, phone, email, and CPR to complete the booking. Could you please provide them?'
  );

  // Incomplete answers never advance either.
  const partial = await runSheetStateMachine(
    sheet,
    { ai: { n1: { sheet: rejected.sheet } } },
    'n1',
    'Ali, 39001234',
    reader
  );
  assert.equal(partial.sheet.stepId, 'Step_5');
  assert.deepEqual(partial.sheet.slots, {});

  const accepted = await runSheetStateMachine(
    sheet,
    { ai: { n1: { sheet: partial.sheet } } },
    'n1',
    'Ali, 39001234, ali@example.com, 880011223',
    reader
  );
  assert.deepEqual(
    {
      name: accepted.sheet.slots.name,
      phone: accepted.sheet.slots.phone,
      email: accepted.sheet.slots.email,
      cpr: accepted.sheet.slots.cpr,
    },
    { name: 'Ali', phone: '39001234', email: 'ali@example.com', cpr: '880011223' }
  );
  assert.equal(accepted.sheet.stepId, 'Step_7');
  assert.equal(accepted.text, 'Thank you for your details.');
});

// ── fuzzy specialty lookup + time availability ─────────────────────────────

test('gastro: 7 PM is accepted, 11 PM is rejected', async () => {
  const steps = [
    {
      intent_id: '1',
      step_id: 'Step_2',
      ai_question: 'And which location is the closest to you?',
      expected_input: 'list',
      slot_name: 'location',
      options: 'Muharraq, Riffa, Adliya',
      next_step_logic: '→ Step_3',
    },
    {
      intent_id: '1',
      step_id: 'Step_3',
      ai_question: 'Sure, and could you confirm the preferred date and time?',
      expected_input: 'text',
      slot_name: 'datetime',
      next_step_logic: '→ Step_4',
    },
    {
      intent_id: '1',
      step_id: 'Step_4',
      step_type: 'lookup',
      slot_name: 'doctor_name',
      lookup_source: 'Doctors_Schedule',
      lookup_filter: 'department={department} AND branch={location}',
      lookup_extract: 'Doctor',
      alternate_step: 'Step_6',
      next_step_logic: '→ Step_5',
    },
    {
      intent_id: '1',
      step_id: 'Step_5',
      ai_question: 'We have {doctor_name} has availability. To confirm booking, can you provide your name?',
      slot_name: 'customer_details',
      next_step_logic: '→ Step_7',
    },
    {
      intent_id: '1',
      step_id: 'Step_6',
      ai_question: "Sorry, we don't have that at this location. Would you like to try another?",
      slot_name: 'retry',
      next_step_logic: '',
    },
    {
      intent_id: '1',
      step_id: 'Step_7',
      ai_question: 'Thank you, our booking team will call you.',
      slot_name: 'completed',
      next_step_logic: '→ done',
    },
  ];
  const schedule = [
    {
      Doctor: 'DR SURESH DAIVASIKHAMANI',
      Branch: 'Muharraq',
      Available_Times: '09:30-12:30/04:30-09:30',
      department: 'CONSULTANT GASTROENTEROLOGIST',
    },
  ];
  const reader: RowReader = async (_s, tab, filter) => {
    if (tab === 'Intents') {
      return [{ id: '1', keywords: 'gastro, doctor, book', start_step: 'Step_1', answer: '' }];
    }
    if (tab === 'Doctors_Schedule') return schedule;
    return steps.filter((s) => s.intent_id === filter?.value);
  };

  // The LLM's turn-1 output: "gastro doctor" → department "Gastroenterology".
  const seed = { intentId: '1', stepId: 'Step_2', slots: { department: 'Gastroenterology', confirm: 'Yes' } };

  const t2 = await runSheetStateMachine(sheet, { ai: { n1: { sheet: seed } } }, 'n1', 'Muharraq', reader);
  assert.equal(t2.sheet.slots.location, 'Muharraq');
  assert.equal(t2.sheet.stepId, 'Step_3');

  // 7 PM is inside the evening window → lookup succeeds.
  const t3 = await runSheetStateMachine(sheet, { ai: { n1: { sheet: t2.sheet } } }, 'n1', 'today at 7 PM', reader);
  assert.equal(t3.sheet.slots.doctor_name, 'DR SURESH DAIVASIKHAMANI');
  assert.match(t3.text, /DR SURESH DAIVASIKHAMANI has availability/);

  // 11 PM is outside → the flow re-asks the time and does not store a doctor.
  const t3b = await runSheetStateMachine(
    sheet,
    { ai: { n1: { sheet: t2.sheet } } },
    'n1',
    'today at 11 PM',
    reader
  );
  assert.equal(t3b.fallbackUsed, true);
  assert.match(t3b.text, /available from 09:30-12:30\/04:30-09:30/);
  assert.match(t3b.text, /Would you like to choose a different time\?/);
  assert.equal(t3b.sheet.stepId, 'Step_3');
  assert.equal(t3b.sheet.slots.doctor_name, undefined);
});

// ── interruption handling (Increment I) ────────────────────────────────────

test('isInterruption flags questions and greetings, but not real values', () => {
  assert.equal(isInterruption('what time is it?'), true);
  assert.equal(isInterruption('What are your hours?'), true);
  assert.equal(isInterruption('where are you located'), true);
  assert.equal(isInterruption('can you help me?'), true);
  assert.equal(isInterruption('hello'), true);
  assert.equal(isInterruption('Hi there'), true);
  assert.equal(isInterruption('good morning'), true);
  // Real slot values must never trip the detector.
  assert.equal(isInterruption('Ali Hassan'), false);
  assert.equal(isInterruption('39001234'), false);
  assert.equal(isInterruption('Muharraq'), false);
  assert.equal(isInterruption('today at 6 PM'), false);
  assert.equal(isInterruption('May'), false); // "May" is a name, not "may I…"
  assert.equal(isInterruption(''), false);
});

test('generateConversationalFallback injects the persona and the interruption instruction', async () => {
  let captured: string | undefined;
  const real: LlmClient = {
    id: 'groq',
    defaultModel: 'test-model',
    async complete(req: LlmCompletionRequest): Promise<LlmCompletionResult> {
      captured = (req.messages[0] as { content: string }).content;
      return {
        ok: true,
        text: 'Of course! I am Alia from Al Hilal. What time would you like to book?',
        provider: 'groq',
        model: 'test-model',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
        latencyMs: 1,
        attempts: 1,
        toolCalls: [],
      };
    },
  };

  const systemPrompt = 'You are Alia, a receptionist. About the business: Al Hilal hospital.';
  const out = await generateConversationalFallback(
    real,
    'name',
    'what time is it?',
    'May I have your name?',
    '',
    undefined,
    { systemPrompt, interruption: true }
  );

  assert.match(out, /Alia/);
  assert.ok(captured);
  assert.match(captured!, /Alia/);            // persona injected
  assert.match(captured!, /off-topic/);       // interruption framing
  assert.match(captured!, /May I have your name/); // current step re-shown
});

test('a text slot does not store an off-topic question as the value', async () => {
  const steps = [
    {
      intent_id: '1',
      step_id: 'Step_1',
      ai_question: 'May I have your name?',
      slot_name: 'name',
      expected_input: 'text',
      fallback: 'I am happy to help with that, but first may I have your name?',
      next_step_logic: '→ Step_2',
    },
    {
      intent_id: '1',
      step_id: 'Step_2',
      ai_question: 'Thanks, and your phone number?',
      slot_name: 'phone',
      expected_input: 'text',
      next_step_logic: '→ done',
    },
  ];
  const reader: RowReader = async (_s, tab, filter) =>
    tab === 'Intents'
      ? [{ id: '1', keywords: 'book', start_step: 'Step_1', answer: 'Booked' }]
      : steps.filter((s) => s.intent_id === filter?.value);

  const t1 = await runSheetStateMachine(sheet, {}, 'n1', 'book', reader);
  assert.equal(t1.sheet.stepId, 'Step_1');

  const t2 = await runSheetStateMachine(
    sheet,
    { ai: { n1: { sheet: t1.sheet } } },
    'n1',
    'what time is it?',
    reader
  );
  // NOT stored, did not advance, and the fallback acknowledges the interruption.
  assert.equal(t2.sheet.slots.name, undefined);
  assert.equal(t2.sheet.stepId, 'Step_1');
  assert.equal(t2.fallbackUsed, true);
  assert.equal(t2.fallbackReason, 'interruption');
  assert.equal(t2.text, 'I am happy to help with that, but first may I have your name?');

  // A real answer is still stored normally.
  const t3 = await runSheetStateMachine(
    sheet,
    { ai: { n1: { sheet: t2.sheet } } },
    'n1',
    'Ali Hassan',
    reader
  );
  assert.equal(t3.sheet.slots.name, 'Ali Hassan');
  assert.equal(t3.sheet.stepId, 'Step_2');
});

test('a greeting mid-flow is treated as an interruption, not a value', async () => {
  const steps = [
    {
      intent_id: '1',
      step_id: 'Step_2',
      ai_question: 'And which location is the closest to you?',
      slot_name: 'location',
      expected_input: 'list',
      options: 'Muharraq, Riffa, Adliya',
      fallback: 'Please choose a location.',
      next_step_logic: '→ done',
    },
  ];
  const reader: RowReader = async (_s, tab, filter) =>
    tab === 'Intents'
      ? [{ id: '1', keywords: 'book', start_step: 'Step_2', answer: 'Booked' }]
      : steps.filter((s) => s.intent_id === filter?.value);

  const seed = { intentId: '1', stepId: 'Step_2', slots: {} };
  const t = await runSheetStateMachine(
    sheet,
    { ai: { n1: { sheet: seed } } },
    'n1',
    'hello',
    reader
  );
  assert.equal(t.sheet.slots.location, undefined);
  assert.equal(t.sheet.stepId, 'Step_2');
  assert.equal(t.fallbackUsed, true);
  assert.equal(t.fallbackReason, 'interruption');
});
