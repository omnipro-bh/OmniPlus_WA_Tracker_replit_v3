/**
 * Phase 4d — deterministic sheet state machine tests (Task 5 MVP).
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

test('extractSlot returns the raw trimmed message for the MVP', async () => {
  const out = await extractSlot('  riffa  ', 'location', 'text', {});
  assert.deepEqual(out, { value: 'riffa', valid: true });
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
