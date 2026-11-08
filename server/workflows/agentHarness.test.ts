/**
 * Phase 5 — Agent Harness tests.
 *
 * The harness treats Workflow_Steps as a goal checklist, not a path. These tests
 * verify (a) checklist/schedule derivation, (b) the placeholder guard, and (c) the
 * two behaviours from the spec: "book" asks for the department, and "book with
 * Dr. Goutham" auto-looks up the doctor and only asks for the datetime.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildHarnessPrompt,
  deriveChecklist,
  deriveScheduleMap,
  matchDoctor,
  noBarePlaceholders,
  runAgentHarness,
  type HarnessChecklist,
} from './agentHarness';
import type { RowReader } from './sheetStateMachine';
import type { LlmClient, LlmCompletionRequest, LlmCompletionResult } from '../ai/types';

const sheet = {
  spreadsheetId: 'https://docs.google.com/spreadsheets/d/test/edit',
  tabs: ['Intents', 'Workflow_Steps'],
  columns: { Intents: {}, Workflow_Steps: {} },
  detected: {
    Intents: ['id', 'keywords', 'start_step', 'type', 'answer'],
    Workflow_Steps: ['intent_id', 'step_id', 'step_type', 'ai_question', 'slot_name', 'expected_input', 'options', 'lookup_source', 'lookup_filter', 'lookup_extract'],
  },
} as any;

const HEADERS = {
  slot: 'slot_name',
  expected: 'expected_input',
  options: 'options',
  validation: 'validation',
  question: 'ai_question',
  filter: 'lookup_filter',
  fallback: 'fallback',
  stepType: 'step_type',
};

/** A scripted LLM client: returns queued JSON responses, repeating the last. */
function harnessClient(responses: string[]): LlmClient & { calls: number } {
  let index = 0;
  const client = {
    id: 'mock' as const,
    defaultModel: 'test-model',
    calls: 0,
    async complete(_req: LlmCompletionRequest): Promise<LlmCompletionResult> {
      client.calls++;
      const text = responses[Math.min(index, responses.length - 1)] ?? '{}';
      index++;
      return {
        ok: true,
        text,
        provider: 'mock',
        model: 'test-model',
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

const STEPS = [
  {
    intent_id: '1',
    step_id: 'Step_1',
    step_type: 'ask',
    ai_question: 'Which department do you need?',
    slot_name: 'department',
    expected_input: 'list',
    options: 'Dental, Dermatology, ENT',
  },
  {
    intent_id: '1',
    step_id: 'Step_2',
    step_type: 'ask',
    ai_question: 'And which location?',
    slot_name: 'location',
    expected_input: 'list',
    options: 'Riffa, Muharraq, Adliya',
  },
  {
    intent_id: '1',
    step_id: 'Step_3',
    step_type: 'ask',
    ai_question: 'What date and time works for you?',
    slot_name: 'datetime',
    expected_input: 'text',
  },
  {
    intent_id: '1',
    step_id: 'Step_4',
    step_type: 'lookup',
    slot_name: 'doctor_name',
    lookup_source: 'Doctors_Schedule',
    lookup_filter: 'department={department} AND branch={location}',
    lookup_extract: 'Doctor',
  },
];

const SCHEDULE = [
  { Doctor: 'Dr. Goutham', department: 'Dentist', Branch: 'Riffa', Available_Times: '8-12/5-9' },
];

const reader: RowReader = async (_sheet, tab, filter) => {
  if (tab === 'Intents') {
    return [{ id: '1', keywords: 'book, doctor', start_step: 'Step_1', answer: 'Booked' }];
  }
  if (tab === 'Doctors_Schedule') return SCHEDULE;
  return STEPS.filter((s) => s.intent_id === filter?.value);
};

// ── derivation ─────────────────────────────────────────────────────────────

test('deriveChecklist collects required slots and excludes derived/flow-control', () => {
  const checklist = deriveChecklist(STEPS, HEADERS);

  assert.deepEqual(
    checklist.required.map((s) => s.name),
    ['department', 'location', 'datetime']
  );
  assert.deepEqual(checklist.derived, ['doctor_name']);
  assert.equal(checklist.required[0].type, 'list');
  assert.deepEqual(checklist.required[0].options, ['Dental', 'Dermatology', 'ENT']);
});

test('deriveChecklist adds an undeclared placeholder slot (e.g. department)', () => {
  const steps = [
    {
      intent_id: '1',
      step_id: 'Step_1',
      step_type: 'ask',
      ai_question: 'Would you like to confirm the availability of the {department} doctor?',
      slot_name: 'confirm',
      expected_input: 'buttons',
      options: 'Yes, No',
    },
    {
      intent_id: '1',
      step_id: 'Step_4',
      step_type: 'lookup',
      slot_name: 'doctor_name',
      lookup_source: 'Doctors_Schedule',
      lookup_filter: 'department={department} AND branch={location}',
      lookup_extract: 'Doctor',
    },
  ];
  const checklist = deriveChecklist(steps, HEADERS);
  // `confirm` is flow-control; `department`/`location` come from placeholders.
  assert.deepEqual(checklist.required.map((s) => s.name), ['department', 'location']);
  assert.deepEqual(checklist.derived, ['doctor_name']);
});

test('deriveScheduleMap reads the lookup source + column mapping', () => {
  const map = deriveScheduleMap(STEPS, {
    stepType: 'step_type',
    source: 'lookup_source',
    filter: 'lookup_filter',
    extract: 'lookup_extract',
  });
  assert.deepEqual(map, {
    source: 'Doctors_Schedule',
    doctorColumn: 'Doctor',
    departmentColumn: 'department',
    branchColumn: 'branch',
  });
});

test('matchDoctor matches the named doctor but not a shared "DR" title', () => {
  assert.equal(matchDoctor('DR GOUTHAM', 'Dr. Goutham'), true);
  assert.equal(matchDoctor('DR. MUHAMMED AHSAN', 'Muhammed Ahsan'), true);
  // The generic looseCellMatch would match every "DR …" row via the "dr" token.
  assert.equal(matchDoctor('DR SURESH DAIVASIKHAMANI', 'Dr. Goutham'), false);
  assert.equal(matchDoctor('DR GOUTHAM', 'Suresh'), false);
});

test('noBarePlaceholders substitutes filled slots and strips the rest', () => {  assert.equal(
    noBarePlaceholders('We have {doctor_name} at {location}.', { doctor_name: 'Dr. Goutham', location: 'Riffa' }),
    'We have Dr. Goutham at Riffa.'
  );
  // A still-missing slot is removed, never leaked as a literal token.
  assert.equal(
    noBarePlaceholders('Confirm {department}?', { location: 'Riffa' }),
    'Confirm ?'
  );
});

test('buildHarnessPrompt names the checklist and current state', () => {
  const checklist: HarnessChecklist = {
    required: [
      { name: 'department', type: 'list', options: ['Dental', 'ENT'] },
      { name: 'datetime', type: 'text' },
    ],
    derived: ['doctor_name'],
  };
  const prompt = buildHarnessPrompt('You are Alia.', checklist, { department: 'Dental' }, 'book');
  assert.match(prompt, /REQUIRED SLOTS/);
  assert.match(prompt, /- department \(options: Dental, ENT\)/);
  assert.match(prompt, /department: "Dental"/);
  assert.match(prompt, /datetime: \(missing\)/);
  assert.match(prompt, /doctor_name/);
});

// ── the loop ───────────────────────────────────────────────────────────────

test('"book" asks for the department (first missing required slot)', async () => {
  const client = harnessClient([
    '{"updated_slots": {}, "action": "ask", "next_question": "Which department do you need?"}',
  ]);

  const turn = await runAgentHarness(sheet, {}, 'n1', 'book', reader, client);

  assert.equal(turn.text, 'Which department do you need?');
  assert.deepEqual(turn.sheet.slots, {});
  assert.equal(turn.sheet.intentId, '1');
});

test('"book with Dr. Goutham" auto-looks up the doctor and only asks for datetime', async () => {
  const client = harnessClient([
    '{"updated_slots": {"doctor_name": "Dr. Goutham"}, "action": "ask", "next_question": "Which department?"}',
    '{"updated_slots": {}, "action": "ask", "next_question": "What date and time works for you?"}',
  ]);

  const turn = await runAgentHarness(sheet, {}, 'n1', 'book with Dr. Goutham', reader, client);

  // The harness deduced department + location from the schedule, and the model
  // (round 2) asked only for the still-missing datetime.
  assert.equal(turn.sheet.slots.doctor_name, 'Dr. Goutham');
  assert.equal(turn.sheet.slots.department, 'Dentist');
  assert.equal(turn.sheet.slots.location, 'Riffa');
  assert.equal(turn.sheet.slots.datetime, undefined);
  assert.equal(turn.text, 'What date and time works for you?');
  assert.equal(client.calls, 2); // extraction round + the post-lookup round
});
