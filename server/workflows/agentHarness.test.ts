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
  bookingSummary,
  buildHarnessPrompt,
  deriveChecklist,
  deriveScheduleMap,
  formatSearchResults,
  hoursColumn,
  matchDoctor,
  matchesIntentKeywords,
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

test('matchesIntentKeywords matches inflections and shared prefixes', () => {
  const keywords = 'ENT, dental, doctor, book';
  assert.equal(matchesIntentKeywords(keywords, 'who are the doctors at adliya?'), true); // doctors → doctor
  assert.equal(matchesIntentKeywords(keywords, 'book an appointment'), true);
  assert.equal(matchesIntentKeywords(keywords, 'which dentists do you have?'), true); // dentist → dental
  assert.equal(matchesIntentKeywords(keywords, 'what are your hours?'), false);
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

// ── knowledge query: list doctors ──────────────────────────────────────────

const LIST_SCHEDULE = [
  { Doctor: 'Dr. Sujith', department: 'Dental Surgeon', Branch: 'Adliya', Available_Times: '07:00-03:00' },
  { Doctor: 'Dr. Bindiya', department: 'General Dentist', Branch: 'Adliya', Available_Times: '03:00-11:00' },
  { Doctor: 'Dr. Susan', department: 'ENT Surgeon', Branch: 'Adliya', Available_Times: 'WEELKLY OFF' },
  { Doctor: 'Dr. Goutham', department: 'Paediatrician', Branch: 'Muharraq', Available_Times: '8-12/5-9' },
];

const listReader: RowReader = async (_sheet, tab, filter) => {
  if (tab === 'Intents') {
    return [{ id: '1', keywords: 'book, doctor', start_step: 'Step_1', answer: 'Booked' }];
  }
  if (tab === 'Doctors_Schedule') return LIST_SCHEDULE;
  return STEPS.filter((s) => s.intent_id === filter?.value);
};

test('formatSearchResults formats entities with matched context and excludes "off" rows', () => {
  const map = deriveScheduleMap(STEPS, {
    stepType: 'step_type',
    source: 'lookup_source',
    filter: 'lookup_filter',
    extract: 'lookup_extract',
  })!;
  const rows = [
    { Doctor: 'Dr. Arun', department: 'Specialist Endodontist', Branch: 'Muharraq' },
    { Doctor: 'Dr. Komal Sharma', department: 'Specialist Endodontist', Branch: 'Adliya' },
    { Doctor: 'Dr. Susan', department: 'ENT Surgeon', Branch: 'Adliya', Available_Times: 'WEELKLY OFF' },
  ];
  const list = formatSearchResults(rows, map, 'endodontist');
  assert.match(list, /Dr. Arun — Specialist Endodontist/);
  assert.match(list, /Dr. Komal Sharma — Specialist Endodontist/);
  assert.doesNotMatch(list, /Dr. Susan/); // WEELKLY OFF
});

test('search_schedule finds doctors at a branch', async () => {
  const client = harnessClient([
    '{"updated_slots": {}, "action": "search_schedule", "next_question": "", "query": "Adliya"}',
    '{"updated_slots": {}, "action": "ask", "next_question": "At Adliya we have Dr. Sujith (Dental Surgeon) and Dr. Bindiya (General Dentist). Would you like to book one of them?"}',
  ]);

  const turn = await runAgentHarness(sheet, {}, 'n1', 'who are the doctors at adliya?', listReader, client);

  assert.equal(
    turn.text,
    'At Adliya we have Dr. Sujith (Dental Surgeon) and Dr. Bindiya (General Dentist). Would you like to book one of them?'
  );
  // The harness queried Doctors_Schedule before answering.
  assert.ok(turn.toolCalls.some((t) => t.args.tab === 'Doctors_Schedule'));
  assert.equal(client.calls, 2); // search round + the natural-answer round
});

// ── generic time validation ────────────────────────────────────────────────

test('hoursColumn finds the hours column generically (Available_Times / Viewing_Hours)', () => {
  assert.equal(hoursColumn({ Doctor: 'Dr. X', Available_Times: '9-5' }), 'Available_Times');
  assert.equal(hoursColumn({ Property: 'Villa', Viewing_Hours: '9-5' }), 'Viewing_Hours');
  assert.equal(hoursColumn({ Doctor: 'Dr. X', Branch: 'Riffa' }), undefined);
});

const VIEWING_SCHEDULE = [
  { Property: 'Villa One', department: 'Real Estate', Branch: 'Riffa', Viewing_Hours: '9-5' },
];

const VIEWING_STEPS = [
  {
    intent_id: '1',
    step_id: 'Step_1',
    step_type: 'ask',
    ai_question: 'What time would you like to book?',
    slot_name: 'datetime',
    expected_input: 'text',
    next_step_logic: '→ done',
  },
  {
    intent_id: '1',
    step_id: 'Step_2',
    step_type: 'lookup',
    slot_name: 'property_name',
    lookup_source: 'Property_Listings',
    lookup_filter: 'department={department} AND branch={location}',
    lookup_extract: 'Property',
  },
];

const viewingReader: RowReader = async (_sheet, tab, filter) => {
  if (tab === 'Intents') {
    return [{ id: '1', keywords: 'book', start_step: 'Step_1', answer: 'Booked' }];
  }
  if (tab === 'Property_Listings') return VIEWING_SCHEDULE;
  return VIEWING_STEPS.filter((s) => s.intent_id === filter?.value);
};

test('time validation rejects an out-of-hours time and clears the slot', async () => {
  const client = harnessClient([
    '{"updated_slots": {}, "action": "ask", "next_question": "What time would you like?"}',
  ]);
  const seed = {
    intentId: '1',
    stepId: null,
    slots: { department: 'Real Estate', location: 'Riffa', datetime: '7 PM' },
  };

  const turn = await runAgentHarness(sheet, { ai: { n1: { sheet: seed } } }, 'n1', 'book', viewingReader, client);

  assert.equal(turn.fallbackUsed, true);
  assert.equal(turn.fallbackReason, 'time_conflict');
  assert.equal(turn.sheet.slots.datetime, undefined); // cleared so the customer can re-enter
  assert.match(turn.text, /not within the available schedule/);
  assert.match(turn.text, /9-5/);
});

test('time validation accepts an in-hours time', async () => {
  const client = harnessClient([
    '{"updated_slots": {}, "action": "ask", "next_question": "Great, please provide your contact details."}',
  ]);
  const seed = {
    intentId: '1',
    stepId: null,
    slots: { department: 'Real Estate', location: 'Riffa', datetime: '2 PM' },
  };

  const turn = await runAgentHarness(sheet, { ai: { n1: { sheet: seed } } }, 'n1', 'book', viewingReader, client);

  assert.notEqual(turn.fallbackReason, 'time_conflict');
  assert.equal(turn.sheet.slots.datetime, '2 PM'); // kept
});

// ── bug fixes: "PM" datetime, list_doctors hallucination, context ──────────

test('bookingSummary summarizes the active booking', () => {
  assert.equal(
    bookingSummary({ doctor_name: 'Dr. Shankar', location: 'Adliya', department: 'Urology' }),
    'Dr. Shankar, Urology, Adliya'
  );
  assert.equal(bookingSummary({}), undefined);
  assert.equal(bookingSummary({ datetime: '5 PM' }), '5 PM');
});

test('buildHarnessPrompt includes the booking summary and the strict search_schedule rule', () => {
  const checklist: HarnessChecklist = {
    required: [{ name: 'department', type: 'list', options: ['Urology'] }],
    derived: ['doctor_name'],
  };
  const prompt = buildHarnessPrompt(
    'You are Alia.',
    checklist,
    { doctor_name: 'Dr. Shankar', department: 'Urology', location: 'Adliya' },
    'do you have another urologist?'
  );

  assert.match(prompt, /CURRENT BOOKING: Dr. Shankar, Urology, Adliya/);
  assert.match(prompt, /ALTERNATIVE/);
  assert.match(prompt, /MUST set action = "search_schedule"/);
  assert.match(prompt, /NEVER reply with "Let me check"/);
});

const TIME_ONLY_STEPS = [
  {
    intent_id: '1',
    step_id: 'Step_1',
    step_type: 'ask',
    ai_question: 'What time would you like?',
    slot_name: 'datetime',
    expected_input: 'text',
    next_step_logic: '→ done',
  },
];

const timeOnlyReader: RowReader = async (_sheet, tab, filter) =>
  tab === 'Intents'
    ? [{ id: '1', keywords: 'book', start_step: 'Step_1', answer: 'Booked' }]
    : TIME_ONLY_STEPS.filter((s) => s.intent_id === filter?.value);

test('a datetime slot rejects a value with no digits (e.g. "PM")', async () => {
  const client = harnessClient([
    '{"updated_slots": {}, "action": "ask", "next_question": "What time would you like?"}',
  ]);
  const seed = { intentId: '1', stepId: null, slots: { datetime: 'PM' } };

  const turn = await runAgentHarness(sheet, { ai: { n1: { sheet: seed } } }, 'n1', 'book', timeOnlyReader, client);

  assert.equal(turn.fallbackUsed, true);
  assert.equal(turn.fallbackReason, 'invalid_time');
  assert.equal(turn.sheet.slots.datetime, undefined); // cleared
  assert.equal(turn.text, 'Please provide a specific time (e.g., 5 PM).');
});

test('an alternative request routes through search_schedule', async () => {
  const client = harnessClient([
    '{"updated_slots": {}, "action": "search_schedule", "next_question": "", "query": "Adliya"}',
    '{"updated_slots": {}, "action": "ask", "next_question": "We have Dr. Sujith and Dr. Bindiya at Adliya. Would you like to book one?"}',
  ]);

  // Mid-flow: the customer already picked Adliya and asks for an alternative.
  const seed = { intentId: '1', stepId: null, slots: { location: 'Adliya' } };
  const turn = await runAgentHarness(sheet, { ai: { n1: { sheet: seed } } }, 'n1', 'do you have another doctor?', listReader, client);

  // The harness queried Doctors_Schedule (via search_schedule) and returned the list.
  assert.ok(turn.toolCalls.some((t) => t.args.tab === 'Doctors_Schedule'));
  assert.match(turn.text, /Would you like to book/);
});

// ── search_schedule: generic entity search ─────────────────────────────────

const ENDO_SCHEDULE = [
  { Doctor: 'Dr. Arun', department: 'Specialist Endodontist', Branch: 'Muharraq', Available_Times: '9-5' },
  { Doctor: 'Dr. Komal Sharma', department: 'Specialist Endodontist', Branch: 'Adliya', Available_Times: '9-5' },
  { Doctor: 'Dr. Santosh', department: 'Cardiologist', Branch: 'Riffa', Available_Times: '9-5' },
];

const endoReader: RowReader = async (_sheet, tab, filter) => {
  if (tab === 'Intents') return [{ id: '1', keywords: 'book, doctor', start_step: 'Step_1', answer: 'Booked' }];
  if (tab === 'Doctors_Schedule') return ENDO_SCHEDULE;
  return STEPS.filter((s) => s.intent_id === filter?.value);
};

test('search_schedule returns matching endodontists', async () => {
  const client = harnessClient([
    '{"updated_slots": {}, "action": "search_schedule", "next_question": "", "query": "SPECIALIST ENDODONTIST"}',
    '{"updated_slots": {}, "action": "ask", "next_question": "We have Dr. Arun and Dr. Komal Sharma. Would you like to book one?"}',
  ]);
  const turn = await runAgentHarness(sheet, {}, 'n1', 'Do you have SPECIALIST ENDODONTIST?', endoReader, client);
  assert.match(turn.text, /Dr. Arun/);
  assert.match(turn.text, /Dr. Komal Sharma/);
});

test('search_schedule returns matching cardiologists', async () => {
  const client = harnessClient([
    '{"updated_slots": {}, "action": "search_schedule", "next_question": "", "query": "cardiologist"}',
    '{"updated_slots": {}, "action": "ask", "next_question": "We have Dr. Santosh (Cardiologist). Would you like to book?"}',
  ]);
  const turn = await runAgentHarness(sheet, {}, 'n1', 'Do you have a cardiologist?', endoReader, client);
  assert.match(turn.text, /Santosh/);
});

const PROPERTY_SCHEDULE = [
  { Property: 'Villa One', Type: '3-bedroom villa', Location: 'Riffa', Viewing_Hours: '9-5' },
  { Property: 'Villa Two', Type: '4-bedroom villa', Location: 'Adliya', Viewing_Hours: '9-5' },
];

const propertySteps = [
  {
    intent_id: '1',
    step_id: 'Step_1',
    step_type: 'ask',
    ai_question: 'What are you looking for?',
    slot_name: 'datetime',
    expected_input: 'text',
  },
  {
    intent_id: '1',
    step_id: 'Step_2',
    step_type: 'lookup',
    slot_name: 'property_name',
    lookup_source: 'Property_Listings',
    lookup_filter: 'type={type} AND location={location}',
    lookup_extract: 'Property',
  },
];

const propertyReader: RowReader = async (_sheet, tab, filter) => {
  if (tab === 'Intents') return [{ id: '1', keywords: 'villa, property, book', start_step: 'Step_1', answer: 'Booked' }];
  if (tab === 'Property_Listings') return PROPERTY_SCHEDULE;
  return propertySteps.filter((s) => s.intent_id === filter?.value);
};

test('search_schedule returns matching properties (real estate)', async () => {
  const client = harnessClient([
    '{"updated_slots": {}, "action": "search_schedule", "next_question": "", "query": "3-bedroom villa"}',
    '{"updated_slots": {}, "action": "ask", "next_question": "We have Villa One (3-bedroom villa). Would you like to book a viewing?"}',
  ]);
  const turn = await runAgentHarness(sheet, {}, 'n1', 'Do you have a 3-bedroom villa?', propertyReader, client);
  assert.match(turn.text, /Villa One/);
});
