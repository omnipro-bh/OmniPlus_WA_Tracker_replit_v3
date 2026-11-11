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
  filterRowsStructured,
  hoursColumn,
  matchDoctor,
  matchesIntentKeywords,
  noBarePlaceholders,
  resolveDay,
  runAgentHarness,
  serializeSearchResults,
  strictCellMatch,
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
  // `confirm` is a real required slot now; `department`/`location` come from placeholders.
  assert.deepEqual(checklist.required.map((s) => s.name), ['confirm', 'department', 'location']);
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
    dayOffColumn: 'Day-Off',
    timeStartColumn: 'Start_Time',
    timeEndColumn: 'End_Time',
    feesColumn: 'Consultation Fees',
  });
});

test('strictCellMatch is exact (case/qualifier-insensitive) and not fuzzy', () => {
  assert.equal(strictCellMatch('Urologist', 'urologist'), true);
  assert.equal(strictCellMatch('Specialist Orthodontist', 'Orthodontist'), true);
  assert.equal(strictCellMatch('Hamad Town', 'hamad town'), true);
  // No prefix/stem/substring fuzz: these are different specialties.
  assert.equal(strictCellMatch('Pedodontist', 'Orthodontist'), false);
  assert.equal(strictCellMatch('Cardiologist', 'Cardiology'), false);
});

test('resolveDay resolves relative and named days', () => {
  const monday = new Date('2026-11-09T12:00:00');
  assert.equal(resolveDay('tomorrow', monday), 'tuesday');
  assert.equal(resolveDay('today', monday), 'monday');
  assert.equal(resolveDay('Tue', monday), 'tuesday');
  assert.equal(resolveDay('Friday', monday), 'friday');
  assert.equal(resolveDay('whenever', monday), undefined);
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

test('buildHarnessPrompt carries the owner ai_question for every slot', () => {
  const checklist: HarnessChecklist = {
    required: [
      { name: 'department', type: 'list', options: ['Dental'], hint: 'Which department do you need?' },
      { name: 'location', type: 'text', hint: 'And which location is the closest to you?' },
    ],
    derived: [],
  };
  const prompt = buildHarnessPrompt('You are Alia.', checklist, {}, 'urologist');
  assert.match(prompt, /- location — ask EXACTLY: "And which location is the closest to you\?"/);
  assert.match(prompt, /NEVER write your own question/);
  assert.match(prompt, /Do NOT generate your own questions/);
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

test('serializeSearchResults returns full structured rows and excludes "off" rows', () => {
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
  const json = serializeSearchResults(rows, map);
  const parsed = JSON.parse(json);
  // Every column is preserved (Branch, department) so the model can read them.
  assert.equal(parsed.length, 2); // Dr. Susan (off) excluded
  assert.deepEqual(parsed[0], { Doctor: 'Dr. Arun', department: 'Specialist Endodontist', Branch: 'Muharraq' });
  assert.equal(parsed[1].Branch, 'Adliya');
  assert.equal(parsed[1].department, 'Specialist Endodontist');
});

test('buildHarnessPrompt passes structured search data and warns against hallucination', () => {
  const checklist: HarnessChecklist = { required: [], derived: [] };
  const json = JSON.stringify([{ Doctor: 'Dr. Rinkoo Jose', Branch: 'Adliya', department: 'ORTHODONTIST' }]);
  const prompt = buildHarnessPrompt('You are Alia.', checklist, {}, 'At which branch?', undefined, json);
  assert.match(prompt, /SEARCH RESULTS/);
  assert.match(prompt, /"Branch":"Adliya"/);
  assert.match(prompt, /NEVER hallucinate or guess/);
  assert.match(prompt, /read the actual column values/);
});

test('search_schedule finds doctors at a branch', async () => {
  const client = harnessClient([
    '{"updated_slots": {}, "action": "search_schedule", "next_question": "", "search": {"location": "Adliya"}}',
    '{"updated_slots": {}, "action": "ask", "next_question": "At Adliya we have Dr. Sujith (Dental Surgeon) and Dr. Bindiya (General Dentist). Would you like to book one of them?"}',
  ]);

  const turn = await runAgentHarness(sheet, {}, 'n1', 'who are the doctors at adliya?', listReader, client);

  // The list is rendered from the sheet, and the question is the owner's
  // ai_question for the next missing slot (department) — not an invented one.
  assert.match(turn.text, /At Adliya we have Dr\. Sujith/);
  assert.match(turn.text, /Which department do you need\?/);
  assert.doesNotMatch(turn.text, /Would you like to book/);
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
    '{"updated_slots": {}, "action": "search_schedule", "next_question": "", "search": {"location": "Adliya"}}',
    '{"updated_slots": {}, "action": "ask", "next_question": "We have Dr. Sujith and Dr. Bindiya at Adliya. Would you like to book one?"}',
  ]);

  // Mid-flow: the customer already picked Adliya and asks for an alternative.
  const seed = { intentId: '1', stepId: null, slots: { location: 'Adliya' } };
  const turn = await runAgentHarness(sheet, { ai: { n1: { sheet: seed } } }, 'n1', 'do you have another doctor?', listReader, client);

  // The harness queried Doctors_Schedule (via search_schedule) and returned the list.
  assert.ok(turn.toolCalls.some((t) => t.args.tab === 'Doctors_Schedule'));
  assert.match(turn.text, /Dr\. Sujith/);
  // The invented "Would you like to book one?" is replaced by the owner's
  // ai_question for the next missing slot (department).
  assert.match(turn.text, /Which department do you need\?/);
  assert.doesNotMatch(turn.text, /Would you like to book/);
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
    '{"updated_slots": {}, "action": "search_schedule", "next_question": "", "search": {"category": "SPECIALIST ENDODONTIST"}}',
    '{"updated_slots": {}, "action": "ask", "next_question": "We have Dr. Arun and Dr. Komal Sharma. Would you like to book one?"}',
  ]);
  const turn = await runAgentHarness(sheet, {}, 'n1', 'Do you have SPECIALIST ENDODONTIST?', endoReader, client);
  assert.match(turn.text, /Dr. Arun/);
  assert.match(turn.text, /Dr. Komal Sharma/);
});

test('search_schedule returns matching cardiologists', async () => {
  const client = harnessClient([
    '{"updated_slots": {}, "action": "search_schedule", "next_question": "", "search": {"category": "cardiologist"}}',
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
    '{"updated_slots": {}, "action": "search_schedule", "next_question": "", "search": {"category": "3-bedroom villa"}}',
    '{"updated_slots": {}, "action": "ask", "next_question": "We have Villa One (3-bedroom villa). Would you like to book a viewing?"}',
  ]);
  const turn = await runAgentHarness(sheet, {}, 'n1', 'Do you have a 3-bedroom villa?', propertyReader, client);
  assert.match(turn.text, /Villa One/);
});

const ORTHO_SCHEDULE = [
  { Doctor: 'Dr. Rinkoo Jose', Branch: 'Adliya', department: 'ORTHODONTIST' },
  { Doctor: 'Dr. Rajeesh Radhakrishnan', Branch: 'Hamad Town', department: 'ORTHODONTIST' },
];

// A reader where NO booking intent matches (so the harness takes the search
// fallback), but the schedule + steps exist.
const noIntentReader: RowReader = async (_sheet, tab, _filter) => {
  if (tab === 'Intents') return [];
  if (tab === 'Doctors_Schedule') return ORTHO_SCHEDULE;
  return STEPS;
};

test('a follow-up "At which branch?" reads the branch column from structured results', async () => {
  // Turn 1: search for the orthodontists (no booking intent → search fallback).
  const client1 = harnessClient([
    '{"updated_slots": {}, "action": "search_schedule", "next_question": "", "search": {"category": "ORTHODONTIST"}}',
    '{"updated_slots": {}, "action": "ask", "next_question": "We have Dr. Rinkoo Jose and Dr. Rajeesh Radhakrishnan."}',
  ]);
  const t1 = await runAgentHarness(sheet, {}, 'n1', 'You have CONSULTANT ORTHODONTIST', noIntentReader, client1);
  assert.match(t1.text, /Rinkoo/);
  // The structured rows (with Branch) are remembered for follow-ups.
  assert.ok(t1.sheet.lastSearch);
  assert.match(t1.sheet.lastSearch!, /"Branch":"Adliya"/);

  // Turn 2: "At which branch?" finds no fresh match and reuses the last results.
  const client2 = harnessClient([
    '{"updated_slots": {}, "action": "ask", "next_question": "Dr. Rinkoo Jose is at Adliya, and Dr. Rajeesh Radhakrishnan is at Hamad Town."}',
  ]);
  const t2 = await runAgentHarness(
    sheet,
    { ai: { n1: { sheet: t1.sheet } } },
    'n1',
    'At which branch?',
    noIntentReader,
    client2
  );
  assert.match(t2.text, /Adliya/);
  assert.match(t2.text, /Hamad Town/);
});

// ── deterministic structured AND-filtering ─────────────────────────────────

const RICHA_SCHEDULE = [
  { Doctor: 'Dr. Tabassum Tayab', Branch: 'Riffa', department: 'Specialist Pedodontist', Available_Times: '--' },
  { Doctor: 'Dr. Rinkoo Jose', Branch: 'Riffa', department: 'Specialist Orthodontist', Available_Times: '5 to 9:30' },
  { Doctor: 'DR. RINKOO JOSE', Branch: 'Muharraq', department: 'CONSULTANT ORTHODONTIST', Available_Times: 'SUN,SAT 01:00-09:00' },
];

const richaMap = {
  source: 'Doctors_Schedule',
  doctorColumn: 'Doctor',
  departmentColumn: 'department',
  branchColumn: 'branch',
};

test('filterRowsStructured applies AND logic (category + location)', () => {
  const rows = filterRowsStructured(
    RICHA_SCHEDULE,
    { category: 'Orthodontist', location: 'Riffa' },
    richaMap
  );
  // Only Dr. Rinkoo Jose at Riffa survives — NOT the Pedodontist at Riffa, and
  // NOT the orthodontist at Muharraq.
  assert.equal(rows.length, 1);
  assert.equal(rows[0].Doctor, 'Dr. Rinkoo Jose');
  assert.equal(rows[0].Branch, 'Riffa');
});

test('filterRowsStructured returns [] when no structured constraint is present', () => {
  // No free-text fallback: an unstructured search must not scan every cell.
  assert.deepEqual(filterRowsStructured(RICHA_SCHEDULE, {}, richaMap), []);
  assert.deepEqual(filterRowsStructured(RICHA_SCHEDULE, { category: '' }, richaMap), []);
});

test('filterRowsStructured pass 2: prefix match finds "Gastro" → "Gastroenterologist"', () => {
  const prefixSchedule = [
    { Doctor: 'Dr. A', Branch: 'Riffa', department: 'Gastroenterologist' },
    { Doctor: 'Dr. B', Branch: 'Adliya', department: 'Cardiologist' },
  ];
  const prefixMap = {
    source: 'Doctors_Schedule',
    doctorColumn: 'Doctor',
    departmentColumn: 'department',
    branchColumn: 'branch',
  };

  // Exact match fails ("Gastro" ≠ "Gastroenterologist"), but prefix match succeeds.
  const rows = filterRowsStructured(
    prefixSchedule,
    { category: 'Gastro', location: 'Riffa' },
    prefixMap
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].Doctor, 'Dr. A');
  assert.equal(rows[0].department, 'Gastroenterologist');
});

test('filterRowsStructured pass 2: prefix match is unique — ambiguous prefix returns []', () => {
  const ambiguousSchedule = [
    { Doctor: 'Dr. A', Branch: 'Riffa', department: 'Gastroenterologist' },
    { Doctor: 'Dr. B', Branch: 'Riffa', department: 'Gastroenterology' },
  ];
  const prefixMap = {
    source: 'Doctors_Schedule',
    doctorColumn: 'Doctor',
    departmentColumn: 'department',
    branchColumn: 'branch',
  };

  // "Gastro" matches both Gastroenterologist and Gastroenterology → ambiguous → [].
  const rows = filterRowsStructured(
    ambiguousSchedule,
    { category: 'Gastro' },
    prefixMap
  );
  assert.deepEqual(rows, []);
});

test('filterRowsStructured pass 2: prefix match too short (< 4 chars) returns []', () => {
  const shortSchedule = [
    { Doctor: 'Dr. A', Branch: 'Riffa', department: 'ENT Surgeon' },
  ];
  const prefixMap = {
    source: 'Doctors_Schedule',
    doctorColumn: 'Doctor',
    departmentColumn: 'department',
    branchColumn: 'branch',
  };

  // "EN" is only 2 chars, below the 4-char minimum → no match.
  const rows = filterRowsStructured(
    shortSchedule,
    { category: 'EN' },
    prefixMap
  );
  assert.deepEqual(rows, []);
});

test('serializeSearchResults dedupes by entity+branch and preserves "--" times', () => {
  const rows = [
    { Doctor: 'Dr. Rinkoo Jose', Branch: 'Riffa', department: 'Specialist Orthodontist', Available_Times: '--' },
    { Doctor: 'Dr. Rinkoo Jose', Branch: 'Riffa', department: 'Specialist Orthodontist', Available_Times: '5 to 9:30' },
  ];
  const parsed = JSON.parse(serializeSearchResults(rows, richaMap));
  assert.equal(parsed.length, 1); // collapsed to one row
  assert.equal(parsed[0].Available_Times, '--'); // "--" is preserved, not dropped
});

test('search "Orthodontist at Riffa" returns only the Riffa orthodontist', async () => {
  const client = harnessClient([
    '{"updated_slots": {}, "action": "search_schedule", "next_question": "", "search": {"category": "Orthodontist", "location": "Riffa"}}',
    '{"updated_slots": {}, "action": "ask", "next_question": "Dr. Rinkoo Jose is at Riffa, available 5 to 9:30."}',
  ]);
  const reader: RowReader = async (_sheet, tab, filter) => {
    if (tab === 'Intents') return [{ id: '1', keywords: 'book, doctor', start_step: 'Step_1', answer: 'Booked' }];
    if (tab === 'Doctors_Schedule') return RICHA_SCHEDULE;
    return STEPS.filter((s) => s.intent_id === filter?.value);
  };
  const turn = await runAgentHarness(sheet, {}, 'n1', 'Orthodontist at Riffa', reader, client);
  // The structured JSON passed to the model must NOT contain the pedodontist.
  assert.match(turn.text, /Rinkoo/);
  assert.doesNotMatch(turn.text, /Tabassum/);
});

// ── normalized schema: Day-Off / Start_Time / End_Time / fees ──────────────

const NEW_SCHEMA_SCHEDULE = [
  {
    Doctor: 'Dr. Arun Antony',
    Branch: 'Hamad Town',
    Department: 'Urologist',
    'Day-Off': '',
    Start_Time: '13:00',
    End_Time: '17:00',
    'Consultation Fees': '5 BD',
  },
  {
    Doctor: 'Dr. Rinkoo Jose',
    Branch: 'Riffa',
    Department: 'Orthodontist',
    'Day-Off': 'Tuesday',
    Start_Time: '17:00',
    End_Time: '21:30',
    'Consultation Fees': '10 BD',
  },
  {
    Doctor: 'Dr. Tabassum Tayab',
    Branch: 'Riffa',
    Department: 'Pedodontist',
    'Day-Off': '',
    Start_Time: '--',
    End_Time: '--',
    'Consultation Fees': '5 BD',
  },
];

const newSchemaMap = {
  source: 'Doctors_Schedule',
  doctorColumn: 'Doctor',
  departmentColumn: 'Department',
  branchColumn: 'Branch',
  dayOffColumn: 'Day-Off',
  timeStartColumn: 'Start_Time',
  timeEndColumn: 'End_Time',
  feesColumn: 'Consultation Fees',
};

test('"urologist at Hamad Town tomorrow" resolves tomorrow (Tuesday) and keeps the row', () => {
  // 2026-11-09 is a Monday, so "tomorrow" is Tuesday. Dr. Arun's Day-Off is
  // blank → he works every day.
  const monday = new Date('2026-11-09T12:00:00');
  const rows = filterRowsStructured(
    NEW_SCHEMA_SCHEDULE,
    { category: 'Urologist', location: 'Hamad Town', day: 'tomorrow' },
    newSchemaMap,
    monday
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].Doctor, 'Dr. Arun Antony');
  assert.equal(rows[0].Start_Time, '13:00');
  assert.equal(rows[0].End_Time, '17:00');
  assert.equal(rows[0]['Consultation Fees'], '5 BD');
});

test('Day-Off blocks the requested day (Dr. Rinkoo is off on Tuesday)', () => {
  const monday = new Date('2026-11-09T12:00:00');
  const rows = filterRowsStructured(
    NEW_SCHEMA_SCHEDULE,
    { category: 'Orthodontist', location: 'Riffa', day: 'tomorrow' },
    newSchemaMap,
    monday
  );
  assert.deepEqual(rows, []);
});

test('"orthodontist at Riffa" returns only Dr. Rinkoo (not the pedodontist / other branch)', () => {
  const rows = filterRowsStructured(
    NEW_SCHEMA_SCHEDULE,
    { category: 'Orthodontist', location: 'Riffa' },
    newSchemaMap
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].Doctor, 'Dr. Rinkoo Jose');
});

test('missing times ("--") are preserved so the reply can report the gap', () => {
  const parsed = JSON.parse(serializeSearchResults([NEW_SCHEMA_SCHEDULE[2]], newSchemaMap));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].Start_Time, '--');
  assert.equal(parsed[0].End_Time, '--');
});

// ── state commitment: a selection is a slot fill, not a new search ─────────

const UROLOGY_SCHEDULE = [
  {
    Doctor: 'Dr. Shankar Narayanappa',
    Branch: 'Riffa',
    Department: 'Urologist',
    'Day-Off': '',
    Start_Time: '09:00',
    End_Time: '13:00',
    'Consultation Fees': '5 BD',
  },
  {
    Doctor: 'Dr. Shankar Narayanappa',
    Branch: 'Adliya',
    Department: 'Urologist',
    'Day-Off': '',
    Start_Time: '10:00',
    End_Time: '14:00',
    'Consultation Fees': '5 BD',
  },
  {
    Doctor: 'Dr. Arun Antony',
    Branch: 'Riffa',
    Department: 'Urologist',
    'Day-Off': '',
    Start_Time: '13:00',
    End_Time: '17:00',
    'Consultation Fees': '5 BD',
  },
  {
    Doctor: 'Dr. Shabeena Naz',
    Branch: 'Hamad Town',
    Department: 'Urologist',
    'Day-Off': '',
    Start_Time: '09:00',
    End_Time: '13:00',
    'Consultation Fees': '5 BD',
  },
];

const urologyReader: RowReader = async (_sheet, tab, filter) => {
  if (tab === 'Intents') {
    return [{ id: '1', keywords: 'book, doctor', start_step: 'Step_1', answer: 'Booked' }];
  }
  if (tab === 'Doctors_Schedule') return UROLOGY_SCHEDULE;
  return STEPS.filter((s) => s.intent_id === filter?.value);
};

test('"urologist" → "Riffa" → "Shankar" commits the selection and asks for a time', async () => {
  // Turn 1: "urologist" → a structured search for the category.
  const client1 = harnessClient([
    '{"updated_slots": {}, "action": "search_schedule", "next_question": "", "search": {"category": "Urologist"}}',
    '{"updated_slots": {}, "action": "ask", "next_question": "We have urologists at Riffa, Adliya and Hamad Town. Which branch?"}',
  ]);
  const t1 = await runAgentHarness(sheet, {}, 'n1', 'urologist', urologyReader, client1);
  assert.equal(t1.sheet.slots.department, 'Urologist');

  // Turn 2: "Riffa" is deterministically pre-filled as the location (from the
  // location step's options), so the harness advances to the datetime question
  // without re-running the search.
  const client2 = harnessClient([
    '{"updated_slots": {}, "action": "ask", "next_question": "Sure."}',
  ]);
  const t2 = await runAgentHarness(
    sheet,
    { ai: { n1: { sheet: t1.sheet } } },
    'n1',
    'Riffa',
    urologyReader,
    client2
  );
  assert.equal(t2.sheet.slots.department, 'Urologist');
  assert.equal(t2.sheet.slots.location, 'Riffa'); // pre-filled by code, not the LLM
  assert.match(t2.text, /date and time/i); // advanced past location to datetime

  // Turn 3: "Shankar" selects a doctor from the previous results. The model tries
  // to search again (the old loop), but the harness commits the FULL name from
  // state.lastSearch and asks for the next slot instead of re-searching.
  const client3 = harnessClient([
    '{"updated_slots": {}, "action": "search_schedule", "next_question": "", "search": {"name": "Shankar"}}',
  ]);
  const t3 = await runAgentHarness(
    sheet,
    { ai: { n1: { sheet: t2.sheet } } },
    'n1',
    'Shankar',
    urologyReader,
    client3
  );
  assert.equal(t3.sheet.slots.doctor_name, 'Dr. Shankar Narayanappa');
  assert.equal(t3.sheet.slots.location, 'Riffa');
  assert.equal(t3.sheet.slots.department, 'Urologist');
  // It advanced to the time slot instead of looping back to the branch.
  assert.match(t3.text, /date and time/i);
  assert.doesNotMatch(t3.text, /which branch/i);
  // No second model round and no schedule search: the selection was committed.
  assert.equal(client3.calls, 1);
  assert.ok(!t3.toolCalls.some((call) => call.args.tab === 'Doctors_Schedule'));

  // Same selection, but the model answers "ask" with a looping "which branch?"
  // question. The committed location must win; the harness asks for the time.
  const client4 = harnessClient([
    '{"updated_slots": {"doctor_name": "Shankar"}, "action": "ask", "next_question": "Dr. Shankar is available at Adliya and Riffa. Which branch?"}',
  ]);
  const t4 = await runAgentHarness(
    sheet,
    { ai: { n1: { sheet: t2.sheet } } },
    'n1',
    'Shankar',
    urologyReader,
    client4
  );
  assert.equal(t4.sheet.slots.doctor_name, 'Dr. Shankar Narayanappa');
  assert.equal(t4.sheet.slots.location, 'Riffa');
  assert.match(t4.text, /date and time/i);
  assert.doesNotMatch(t4.text, /which branch/i);
});

// ── guided flow: the owner's ai_question is the only question ──────────────

test('"urologist" asks the owner\'s location ai_question, not an invented one', async () => {
  // The model renders the matches but invents "Which doctor would you like to
  // book with?" — the harness must replace it with the sheet's location question.
  const client = harnessClient([
    '{"updated_slots": {}, "action": "search_schedule", "next_question": "", "search": {"category": "Urologist"}}',
    '{"updated_slots": {}, "action": "ask", "next_question": "Here are the available urologists. Which doctor would you like to book with?"}',
  ]);
  const turn = await runAgentHarness(sheet, {}, 'n1', 'urologist', urologyReader, client);

  assert.equal(turn.sheet.slots.department, 'Urologist');
  // STEPS defines the location ai_question as "And which location?".
  assert.match(turn.text, /And which location\?/);
  assert.doesNotMatch(turn.text, /Which doctor/i);
  // The model's description of the matches is preserved.
  assert.match(turn.text, /available urologists/);
});

test('a plain ask uses the sheet ai_question verbatim', async () => {
  const client = harnessClient([
    '{"updated_slots": {}, "action": "ask", "next_question": "Hi! How can I help you today?"}',
  ]);
  const turn = await runAgentHarness(sheet, {}, 'n1', 'book', reader, client);

  // The invented question is dropped; the department step's ai_question wins.
  assert.match(turn.text, /Which department do you need\?/);
  assert.doesNotMatch(turn.text, /How can I help/);
});

// ── verification-first (non-booking intents) ───────────────────────────────

const FAQ_INTENTS = [
  { id: '1', type: 'Booking', keywords: 'book, doctor', start_step: 'Step_1', verification_question: '', answer: '' },
  { id: '2', type: 'FAQ', keywords: 'hours, opening, working', start_step: '', verification_question: 'Are you asking about our working hours?', answer: 'We are open 9 AM to 5 PM.' },
];

const faqReader: RowReader = async (_sheet, tab, filter) => {
  if (tab === 'Intents') {
    const col = filter?.column;
    const val = String(filter?.value ?? '');
    if (col === 'id') return FAQ_INTENTS.filter((i) => String(i.id) === val);
    return FAQ_INTENTS.filter((i) => matchesIntentKeywords(String(i.keywords), val));
  }
  if (tab === 'Doctors_Schedule') return [];
  return STEPS.filter((s) => s.intent_id === filter?.value);
};

test('a FAQ intent with a verification_question asks it before answering', async () => {
  const client = harnessClient([]);
  const turn = await runAgentHarness(sheet, {}, 'n1', 'what are your working hours?', faqReader, client);
  assert.equal(turn.text, 'Are you asking about our working hours?');
  assert.equal(turn.sheet.pendingIntentId, '2');
  assert.equal(turn.sheet.awaitingVerification, true);
  assert.equal(turn.sheet.intentId, null);
});

test('"Yes" to the verification returns the FAQ answer verbatim', async () => {
  const client = harnessClient([]);
  const seed = { intentId: null, stepId: null, slots: {}, pendingIntentId: '2', awaitingVerification: true };
  const turn = await runAgentHarness(sheet, { ai: { n1: { sheet: seed } } }, 'n1', 'Yes', faqReader, client);
  assert.equal(turn.text, 'We are open 9 AM to 5 PM.');
  assert.equal(turn.sheet.intentId, null);
  assert.equal(turn.sheet.pendingIntentId, null);
  assert.equal(turn.sheet.awaitingVerification, false);
});

test('"No" to the verification clears the pending intent', async () => {
  const client = harnessClient([]);
  const seed = { intentId: null, stepId: null, slots: {}, pendingIntentId: '2', awaitingVerification: true };
  const turn = await runAgentHarness(sheet, { ai: { n1: { sheet: seed } } }, 'n1', 'No', faqReader, client);
  assert.match(turn.text, /how can I help/i);
  assert.equal(turn.sheet.intentId, null);
  assert.equal(turn.sheet.pendingIntentId, null);
  assert.equal(turn.sheet.awaitingVerification, false);
});

test('a Booking intent is NOT gated by verification_question', async () => {
  const client = harnessClient([
    '{"updated_slots": {}, "action": "ask", "next_question": "Which department do you need?"}',
  ]);
  const turn = await runAgentHarness(sheet, {}, 'n1', 'book a doctor', faqReader, client);
  // Straight into the booking checklist (no verification question).
  assert.equal(turn.sheet.pendingIntentId, null);
  assert.equal(turn.sheet.awaitingVerification, false);
  assert.equal(turn.sheet.intentId, '1');
});

// ── confirm step is a required slot (not blacklisted) ──────────────────────

const CONFIRM_STEPS = [
  { intent_id: '1', step_id: 'Step_1', step_type: 'ask', ai_question: 'Which department?', slot_name: 'department', expected_input: 'list', options: 'Dental, ENT', lookup_source: '', lookup_filter: '', lookup_extract: '', fallback: '', validation: '' },
  { intent_id: '1', step_id: 'Step_2', step_type: 'ask', ai_question: 'Would you like to confirm the {department} doctor?', slot_name: 'confirm', expected_input: 'buttons', options: 'Yes, No', lookup_source: '', lookup_filter: '', lookup_extract: '', fallback: '', validation: '' },
  { intent_id: '1', step_id: 'Step_3', step_type: 'lookup', slot_name: 'doctor_name', lookup_source: 'Doctors_Schedule', lookup_filter: 'department={department}', lookup_extract: 'Doctor', fallback: '', validation: '' },
];

test('deriveChecklist includes the confirm step', () => {
  const checklist = deriveChecklist(CONFIRM_STEPS, HEADERS);
  assert.ok(checklist.required.some((s) => s.name === 'confirm'));
});

test('the harness asks the confirm step after department is filled', async () => {
  const confirmReader: RowReader = async (_sheet, tab, filter) => {
    if (tab === 'Intents') return [{ id: '1', type: 'Booking', keywords: 'book', start_step: 'Step_1', answer: '' }];
    if (tab === 'Doctors_Schedule') return [];
    return CONFIRM_STEPS.filter((s) => s.intent_id === filter?.value);
  };
  const client = harnessClient([
    '{"updated_slots": {"department": "Dental"}, "action": "ask", "next_question": "Would you like to confirm the Dental doctor?"}',
  ]);
  const turn = await runAgentHarness(sheet, {}, 'n1', 'book', confirmReader, client);
  // department filled → confirm is the next missing slot, asked verbatim.
  assert.match(turn.text, /Would you like to confirm the Dental doctor\?/);
  assert.equal(turn.sheet.slots.department, 'Dental');
});

test('"book" → "Dental" pre-fills department in code and asks confirm', async () => {
  const confirmReader: RowReader = async (_sheet, tab, filter) => {
    if (tab === 'Intents') return [{ id: '1', type: 'Booking', keywords: 'book', start_step: 'Step_1', answer: '' }];
    if (tab === 'Doctors_Schedule') return [];
    return CONFIRM_STEPS.filter((s) => s.intent_id === filter?.value);
  };
  // Turn 1: book → department question.
  const client1 = harnessClient([
    '{"updated_slots": {}, "action": "ask", "next_question": "Which department?"}',
  ]);
  const t1 = await runAgentHarness(sheet, {}, 'n1', 'book', confirmReader, client1);
  assert.match(t1.text, /Which department\?/);

  // Turn 2: "Dental" — the model FAILS to extract it (empty updated_slots), but
  // the deterministic pre-fill catches the list option and fills department, so
  // the harness advances to the confirm step.
  const client2 = harnessClient([
    '{"updated_slots": {}, "action": "ask", "next_question": "Which department?"}',
  ]);
  const t2 = await runAgentHarness(sheet, { ai: { n1: { sheet: t1.sheet } } }, 'n1', 'Dental', confirmReader, client2);
  assert.equal(t2.sheet.slots.department, 'Dental'); // filled by code, not the LLM
  assert.match(t2.text, /Would you like to confirm the Dental doctor\?/);
});

// ── deterministic confirmation handling ──────────────────────────────────────

const CONFIRM_READER_SLOTS = [
  { intent_id: '1', step_id: 'Step_1', step_type: 'ask', ai_question: 'Which department?', slot_name: 'department', expected_input: 'list', options: 'Dental, ENT', lookup_source: '', lookup_filter: '', lookup_extract: '', fallback: '', validation: '' },
  { intent_id: '1', step_id: 'Step_2', step_type: 'ask', ai_question: 'Would you like to confirm the {department} doctor?', slot_name: 'confirm', expected_input: 'buttons', options: 'Yes, No', lookup_source: '', lookup_filter: '', lookup_extract: '', fallback: '', validation: '' },
  { intent_id: '1', step_id: 'Step_3', step_type: 'lookup', slot_name: 'doctor_name', lookup_source: 'Doctors_Schedule', lookup_filter: 'department={department}', lookup_extract: 'Doctor', fallback: '', validation: '' },
];

const confirmSlotReader: RowReader = async (_sheet, tab, filter) => {
  if (tab === 'Intents') return [{ id: '1', type: 'Booking', keywords: 'book', start_step: 'Step_1', answer: '' }];
  if (tab === 'Doctors_Schedule') return [];
  return CONFIRM_READER_SLOTS.filter((s) => s.intent_id === filter?.value);
};

test('confirm step: "Yes" deterministically fills confirm and advances to next slot', async () => {
  // Turn 1: book → department.
  const client1 = harnessClient([
    '{"updated_slots": {}, "action": "ask", "next_question": "Which department?"}',
  ]);
  const t1 = await runAgentHarness(sheet, {}, 'n1', 'book', confirmSlotReader, client1);
  assert.match(t1.text, /Which department\?/);

  // Turn 2: "Dental" pre-fills department; next missing slot is confirm.
  const client2 = harnessClient([
    '{"updated_slots": {}, "action": "ask", "next_question": "Which department?"}',
  ]);
  const t2 = await runAgentHarness(sheet, { ai: { n1: { sheet: t1.sheet } } }, 'n1', 'Dental', confirmSlotReader, client2);
  assert.equal(t2.sheet.slots.department, 'Dental');
  assert.match(t2.text, /Would you like to confirm/);

  // Turn 3: "Yes" — deterministic confirmation handling fills confirm and
  // advances to the doctor_name lookup (next missing slot), no loop back to
  // confirm. The model is NOT consulted for this turn.
  const client3 = harnessClient([]);
  const t3 = await runAgentHarness(
    sheet,
    { ai: { n1: { sheet: t2.sheet } } },
    'n1',
    'Yes',
    confirmSlotReader,
    client3
  );
  assert.equal(t3.sheet.slots.confirm, 'Yes');
  assert.equal(t3.sheet.slots.department, 'Dental');
  // Advanced past confirm — text does not ask about confirm again.
  assert.ok(!/confirm/i.test(t3.text));
});

test('confirm step: "Sure" fills confirm (not misread as a doctor name)', async () => {
  const client1 = harnessClient([
    '{"updated_slots": {}, "action": "ask", "next_question": "Which department?"}',
  ]);
  const t1 = await runAgentHarness(sheet, {}, 'n1', 'book', confirmSlotReader, client1);
  const client2 = harnessClient([
    '{"updated_slots": {}, "action": "ask", "next_question": "Which department?"}',
  ]);
  const t2 = await runAgentHarness(sheet, { ai: { n1: { sheet: t1.sheet } } }, 'n1', 'Dental', confirmSlotReader, client2);
  assert.equal(t2.sheet.slots.department, 'Dental');

  const client3 = harnessClient([]);
  const t3 = await runAgentHarness(
    sheet,
    { ai: { n1: { sheet: t2.sheet } } },
    'n1',
    'Sure',
    confirmSlotReader,
    client3
  );
  assert.equal(t3.sheet.slots.confirm, 'Yes');
});

test('confirm step: "No" resets the intent and re-opens the conversation', async () => {
  const client1 = harnessClient([
    '{"updated_slots": {}, "action": "ask", "next_question": "Which department?"}',
  ]);
  const t1 = await runAgentHarness(sheet, {}, 'n1', 'book', confirmSlotReader, client1);
  const client2 = harnessClient([
    '{"updated_slots": {}, "action": "ask", "next_question": "Which department?"}',
  ]);
  const t2 = await runAgentHarness(sheet, { ai: { n1: { sheet: t1.sheet } } }, 'n1', 'Dental', confirmSlotReader, client2);
  assert.equal(t2.sheet.slots.department, 'Dental');

  const client3 = harnessClient([]);
  const t3 = await runAgentHarness(
    sheet,
    { ai: { n1: { sheet: t2.sheet } } },
    'n1',
    'No',
    confirmSlotReader,
    client3
  );
  assert.equal(t3.sheet.slots.confirm, 'No');
  assert.equal(t3.sheet.intentId, null);
  assert.match(t3.text, /how can I help/i);
});

// ── empty LLM response guard ────────────────────────────────────────────────

test('empty LLM response re-asks the current question instead of sending []', async () => {
  const client = harnessClient([
    '[]', // empty array response from the model
  ]);
  const turn = await runAgentHarness(sheet, {}, 'n1', 'book', confirmSlotReader, client);
  // The harness re-asks the department question instead of sending [].
  assert.match(turn.text, /Which department\?/);
  assert.notEqual(turn.text, '[]');
});

test('whitespace-only LLM response re-asks the current question', async () => {
  const client = harnessClient([
    '   ',
  ]);
  const turn = await runAgentHarness(sheet, {}, 'n1', 'book', confirmSlotReader, client);
  assert.match(turn.text, /Which department\?/);
});

// ── fallback intent (catch-all) ──────────────────────────────────────────────

const FALLBACK_INTENTS = [
  { id: '1', type: 'Booking', keywords: 'book, doctor', start_step: 'Step_1', verification_question: '', answer: '', priority: 'High' },
  { id: '2', type: 'Fallback', keywords: '', start_step: '', verification_question: 'Did you mean {department}?', answer: '', priority: 'Low' },
];

const fallbackReader: RowReader = async (_sheet, tab, filter) => {
  if (tab === 'Intents') {
    const col = String(filter?.column ?? '').toLowerCase();
    const val = String(filter?.value ?? '').toLowerCase();
    return FALLBACK_INTENTS.filter((i) => {
      if (col === 'id') return String(i.id).toLowerCase().includes(val);
      if (col === 'keywords') return String(i.keywords ?? '').toLowerCase().includes(val);
      return true;
    });
  }
  if (tab === 'Doctors_Schedule') return [];
  return STEPS.filter((s) => s.intent_id === filter?.value);
};

test('fallback intent: unknown query asks the verification question with extracted slot', async () => {
  const client = harnessClient([
    '{"updated_slots": {"department": "Gastroenterology"}, "action": "ask", "next_question": "What do you mean?"}',
  ]);
  const turn = await runAgentHarness(sheet, {}, 'n1', 'gastro', fallbackReader, client);

  // The model extracted "department: Gastroenterology", and the fallback
  // verification question is asked with slot substitution.
  assert.match(turn.text, /Did you mean Gastroenterology\?/);
  assert.equal(turn.sheet.pendingFallbackId, '2');
  assert.equal(turn.sheet.awaitingFallbackVerification, true);
  assert.equal(turn.sheet.fallbackExtractedSlots.department, 'Gastroenterology');
});

test('fallback intent: "Yes" routes to booking flow with extracted slot', async () => {
  const client1 = harnessClient([
    '{"updated_slots": {"department": "Gastroenterology"}, "action": "ask", "next_question": "What do you mean?"}',
  ]);
  const t1 = await runAgentHarness(sheet, {}, 'n1', 'gastro', fallbackReader, client1);
  assert.equal(t1.sheet.pendingFallbackId, '2');

  // Turn 2: "Yes" confirms the fallback → routes to booking with department set.
  const client2 = harnessClient([]);
  const t2 = await runAgentHarness(
    sheet,
    { ai: { n1: { sheet: t1.sheet } } },
    'n1',
    'Yes',
    fallbackReader,
    client2
  );
  assert.equal(t2.sheet.intentId, '1');
  assert.equal(t2.sheet.pendingFallbackId, null);
  assert.equal(t2.sheet.awaitingFallbackVerification, false);
  assert.equal(t2.sheet.slots.department, 'Gastroenterology');
  // Booking flow is active: asks for the next missing slot (location).
  assert.match(t2.text, /And which location\?/);
});

test('fallback intent: "No" clears the fallback and re-opens conversation', async () => {
  const client1 = harnessClient([
    '{"updated_slots": {}, "action": "ask", "next_question": ""}',
  ]);
  const t1 = await runAgentHarness(sheet, {}, 'n1', 'gastro', fallbackReader, client1);
  assert.equal(t1.sheet.pendingFallbackId, '2');

  const client2 = harnessClient([]);
  const t2 = await runAgentHarness(
    sheet,
    { ai: { n1: { sheet: t1.sheet } } },
    'n1',
    'No',
    fallbackReader,
    client2
  );
  assert.equal(t2.sheet.intentId, null);
  assert.equal(t2.sheet.pendingFallbackId, null);
  assert.equal(t2.sheet.awaitingFallbackVerification, false);
  assert.deepEqual(t2.sheet.fallbackExtractedSlots, {});
  assert.match(t2.text, /how can I help/i);
});

test('no fallback intent row: unknown query goes conversational + unanswered', async () => {
  const noFallbackReader: RowReader = async (_sheet, tab, filter) => {
    if (tab === 'Intents') {
      const kw = String(filter?.value ?? '').toLowerCase();
      return [{ id: '1', type: 'Booking', keywords: 'book', start_step: 'Step_1', answer: '' }].filter((i) =>
        String(i.keywords ?? '').toLowerCase().includes(kw)
      );
    }
    if (tab === 'Doctors_Schedule') return [];
    return STEPS.filter((s) => s.intent_id === filter?.value);
  };
  const client = harnessClient([]);
  const turn = await runAgentHarness(sheet, {}, 'n1', 'completely unknown topic xyz', noFallbackReader, client);

  assert.equal(turn.unanswered, true);
  assert.equal(turn.conversational, true);
  assert.equal(turn.sheet.pendingIntentId, null);
  assert.equal(turn.sheet.pendingFallbackId, null);
});


test('a mid-flow FAQ is answered verbatim without losing slots', async () => {
  const client1 = harnessClient([
    '{"updated_slots": {"department": "Dental"}, "action": "ask", "next_question": "Which department?"}',
  ]);
  const t1 = await runAgentHarness(sheet, {}, 'n1', 'book', faqReader, client1);
  assert.equal(t1.sheet.slots.department, 'Dental');

  // Turn 2: the customer asks an FAQ mid-booking.
  const client2 = harnessClient([]);
  const t2 = await runAgentHarness(sheet, { ai: { n1: { sheet: t1.sheet } } }, 'n1', 'what are your working hours?', faqReader, client2);
  // The FAQ answer is verbatim and the booking slot is untouched.
  assert.match(t2.text, /We are open 9 AM to 5 PM/);
  assert.equal(t2.sheet.slots.department, 'Dental');
  assert.equal(t2.sheet.intentId, '1');
  // It resumes by re-asking the next missing slot (location).
  assert.match(t2.text, /And which location\?/);
});

// ── completion + unanswered flags ──────────────────────────────────────────

test('completion sets completed + completedSlots', async () => {
  const completeReader: RowReader = async (_sheet, tab, filter) => {
    if (tab === 'Intents') return [{ id: '1', type: 'Booking', keywords: 'book', start_step: 'Step_1', answer: 'Booked!' }];
    if (tab === 'Doctors_Schedule') return [];
    return STEPS.filter((s) => s.intent_id === filter?.value);
  };
  const client = harnessClient([
    '{"updated_slots": {"department": "Dental", "location": "Riffa", "datetime": "5 PM"}, "action": "complete", "next_question": ""}',
  ]);
  const turn = await runAgentHarness(sheet, {}, 'n1', 'book', completeReader, client);
  assert.equal(turn.completed, true);
  assert.equal(turn.completedSlots.department, 'Dental');
  assert.equal(turn.completedSlots.location, 'Riffa');
});

test('a normal ask does not set unanswered', async () => {
  const client = harnessClient([
    '{"updated_slots": {}, "action": "ask", "next_question": "Which department do you need?"}',
  ]);
  const turn = await runAgentHarness(sheet, {}, 'n1', 'book', reader, client);
  assert.equal(turn.unanswered, undefined);
});

test('a no-match schedule search sets unanswered', async () => {
  const emptyScheduleReader: RowReader = async (_sheet, tab, filter) => {
    if (tab === 'Intents') return [{ id: '1', type: 'Booking', keywords: 'book', start_step: 'Step_1', answer: '' }];
    if (tab === 'Doctors_Schedule') return []; // nothing matches
    return STEPS.filter((s) => s.intent_id === filter?.value);
  };
  const client = harnessClient([
    '{"updated_slots": {}, "action": "search_schedule", "next_question": "", "search": {"category": "Cardiologist"}}',
  ]);
  const turn = await runAgentHarness(sheet, {}, 'n1', 'do you have a cardiologist?', emptyScheduleReader, client);
  assert.equal(turn.unanswered, true);
});

// ── Reasoning prompt v2 (step 2) ────────────────────────────────────────────

const REASONING_INTENTS = [
  { id: '1', type: 'Booking', keywords: 'dental, dentist, book', verification_question: 'Shall I set that up?' },
  { id: '2', type: 'FAQ', keywords: 'hours, open, timing', answer: 'We are open 8am to 8pm.' },
  { id: '3', type: 'Greeting', keywords: 'hello, hi, salam' },
];

/** Intents where "blood test" matches no keyword, so the reasoner must run. */
const reasoningReader: RowReader = async (_sheet, tab, filter) => {
  if (tab === 'Intents') {
    if (!filter) return REASONING_INTENTS;
    const column = filter.column ?? '';
    const value = filter.value ?? '';
    return REASONING_INTENTS.filter((row) => matchesIntentKeywords(String((row as any)[column] ?? ''), value));
  }
  if (tab === 'Workflow_Steps') return STEPS.filter((s) => !filter || s.intent_id === filter.value);
  return [];
};

/** Reasoning is gated on DATABASE_URL (objectives live in the DB). */
async function withDatabaseUrl<T>(run: () => Promise<T>): Promise<T> {
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = previous ?? 'postgres://test/test';
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
}

test('reasoning v2: "blood test" asks to book it and persists the real intent id', async () => {
  const client = harnessClient([
    JSON.stringify({
      reasoning: 'The customer named a service we offer, so they want to book it.',
      action: 'verify_booking',
      target_intent_id: 1,
      slots: { service: 'blood test' },
      verification_question: 'Would you like to book an appointment for a blood test?',
    }),
  ]);

  const turn = await withDatabaseUrl(() =>
    runAgentHarness(
      sheet,
      {},
      'n1',
      'blood test',
      reasoningReader,
      client,
      'You are MediAssist, the AI assistant for Alhilal Hospital.',
      ['Book an appointment']
    )
  );

  assert.equal(turn.text, 'Would you like to book an appointment for a blood test?');
  // The old 'reasoning_booking' sentinel is gone: the real row id is persisted.
  assert.equal(turn.sheet.pendingFallbackId, '1');
  assert.equal(turn.sheet.awaitingFallbackVerification, true);
  assert.deepEqual(turn.sheet.fallbackExtractedSlots, { service: 'blood test' });

  assert.equal(turn.reasoningDecision?.ok, true);
  assert.equal(turn.reasoningDecision?.action, 'verify_booking');
  assert.equal(turn.reasoningDecision?.targetIntentId, '1');
  assert.equal(turn.reasoningDecision?.hadIntentCatalogue, true);
});

test('reasoning v2: unusable output asks for a rephrase instead of fabricating a decision', async () => {
  const client = harnessClient(['{"reasoning":"The customer said blood test, which is a service. I think']);

  const turn = await withDatabaseUrl(() =>
    runAgentHarness(
      sheet,
      {},
      'n1',
      'blood test',
      reasoningReader,
      client,
      'You are MediAssist, the AI assistant for Alhilal Hospital.',
      ['Book an appointment']
    )
  );

  assert.equal(turn.text, "I'm having trouble understanding. Could you rephrase?");
  assert.equal(turn.reasoningDecision?.ok, false);
  assert.equal(turn.reasoningDecision?.errorKind, 'invalid_json');
  // Nothing was persisted and nothing was fabricated.
  assert.equal(turn.sheet.pendingFallbackId, null);
  assert.equal(turn.sheet.awaitingFallbackVerification, false);
  assert.equal(turn.conversational, undefined);
});



