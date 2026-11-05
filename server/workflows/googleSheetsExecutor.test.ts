/**
 * Phase 4 AI Agent node — Google Sheets data-source row shaping.
 *
 * Only the pure projection is tested (no network, no credentials): the header
 * row becomes the object keys, the optional filter is a case-insensitive
 * substring match, and the result is capped at 20 rows.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { projectSheetRows, headersFromRows, extractSpreadsheetId } from './googleSheetsExecutor';

const RAW = [
  ['id', 'keywords', 'answer'],
  ['pricing', 'pricing, cost', 'Plans start at 10 BHD'],
  ['refund', 'refund, money back', 'Refunds take 5 days'],
  ['hours', 'hours, open', 'Open 9-5'],
];

test('projectSheetRows maps the header row to object keys', () => {
  const { rows, error } = projectSheetRows(RAW);

  assert.equal(error, undefined);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], {
    id: 'pricing',
    keywords: 'pricing, cost',
    answer: 'Plans start at 10 BHD',
  });
});

test('projectSheetRows filters by a header with a case-insensitive substring match', () => {
  const { rows } = projectSheetRows(RAW, { filterColumn: 'Keywords', filterValue: 'REFUND' });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'refund');
});

test('projectSheetRows filters by intent_id for the steps tab', () => {
  const raw = [
    ['intent_id', 'step_id', 'ai_question'],
    ['refund', '1', 'What is your order number?'],
    ['refund', '2', 'When did you buy it?'],
    ['pricing', '1', 'Which plan?'],
  ];

  const { rows } = projectSheetRows(raw, { filterColumn: 'intent_id', filterValue: 'refund' });
  assert.deepEqual(
    rows.map((r) => r.step_id),
    ['1', '2']
  );
});

test('projectSheetRows reports an unknown filter column instead of returning everything', () => {
  const { rows, error } = projectSheetRows(RAW, { filterColumn: 'nope', filterValue: 'x' });

  assert.deepEqual(rows, []);
  assert.match(String(error), /not found/i);
});

test('projectSheetRows caps the result at MAX_LOOKUP_ROWS even when asked for more', () => {
  const header = ['id', 'keywords'];
  const data = Array.from({ length: 50 }, (_, i) => [`id_${i}`, `kw_${i}`]);

  const { rows } = projectSheetRows([header, ...data], { limit: 100 });
  assert.equal(rows.length, 5);

  const smaller = projectSheetRows([header, ...data], { limit: 3 });
  assert.equal(smaller.rows.length, 3);
});

test('projectSheetRows matches multi-word filters by ANY word, ranked by match count', () => {
  const raw = [
    ['id', 'keywords'],
    ['dental', 'dental, dentist, teeth'],
    ['booking', 'appointment, booking, schedule'],
    ['general', 'help, support'],
  ];

  // "dental appointment" -> both "dental" and "appointment" match a row.
  const { rows } = projectSheetRows(raw, {
    filterColumn: 'keywords',
    filterValue: 'dental appointment',
  });

  assert.equal(rows.length, 2);
  assert.equal(rows[0].id, 'dental'); // dental sorts first (specific word)
  assert.equal(rows[1].id, 'booking');
});

test('projectSheetRows ranks rows that match MORE words above single-word matches', () => {
  const raw = [
    ['id', 'keywords'],
    ['a', 'dental'],
    ['b', 'dental appointment'],
    ['c', 'appointment'],
  ];

  const { rows } = projectSheetRows(raw, {
    filterColumn: 'keywords',
    filterValue: 'dental appointment',
  });

  assert.deepEqual(rows.map((r) => r.id), ['b', 'a', 'c']);
});

test('projectSheetRows tolerates empty sheets and ragged rows', () => {
  assert.deepEqual(projectSheetRows([]), { rows: [] });
  assert.deepEqual(projectSheetRows([['id', 'answer'], ['only_id']]), {
    rows: [{ id: 'only_id', answer: '' }],
  });
});

// ── Phase 4b: header detection (config UI "Detect Headers") ─────────────────

test('headersFromRows returns the header row, data count and a sample', () => {
  const result = headersFromRows(RAW, 2);

  assert.deepEqual(result.headers, ['id', 'keywords', 'answer']);
  assert.equal(result.rowCount, 3);
  assert.equal(result.sample.length, 2);
  assert.deepEqual(result.sample[0], {
    id: 'pricing',
    keywords: 'pricing, cost',
    answer: 'Plans start at 10 BHD',
  });
});

test('headersFromRows trims headers and drops blanks', () => {
  const result = headersFromRows([[' id ', '', ' answer '], ['a', 'b', 'c']]);

  assert.deepEqual(result.headers, ['id', 'answer']);
  assert.equal(result.rowCount, 1);
});

test('headersFromRows caps the sample size and tolerates an empty sheet', () => {
  const raw = [
    ['id', 'answer'],
    ...Array.from({ length: 30 }, (_, i) => [`id_${i}`, `a_${i}`]),
  ];

  assert.equal(headersFromRows(raw, 50).sample.length, 10);
  assert.deepEqual(headersFromRows([]), { headers: [], rowCount: 0, sample: [] });
});

test('extractSpreadsheetId accepts a bare id or a full sheet URL', () => {
  const id = '1AbC-2dEf_3GhI';
  assert.equal(extractSpreadsheetId(id), id);
  assert.equal(extractSpreadsheetId(`  ${id}  `), id);
  assert.equal(
    extractSpreadsheetId(`https://docs.google.com/spreadsheets/d/${id}/edit#gid=0`),
    id
  );
  assert.equal(extractSpreadsheetId(''), '');
  assert.equal(extractSpreadsheetId(undefined), '');
});
