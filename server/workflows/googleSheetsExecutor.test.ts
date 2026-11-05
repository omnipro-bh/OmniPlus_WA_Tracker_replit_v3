/**
 * Phase 4 AI Agent node — Google Sheets data-source row shaping.
 *
 * Only the pure projection is tested (no network, no credentials): the header
 * row becomes the object keys, the optional filter is a case-insensitive
 * substring match, and the result is capped at 20 rows.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { projectSheetRows } from './googleSheetsExecutor';

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

test('projectSheetRows caps the result at 20 rows even when asked for more', () => {
  const header = ['id', 'keywords'];
  const data = Array.from({ length: 50 }, (_, i) => [`id_${i}`, `kw_${i}`]);

  const { rows } = projectSheetRows([header, ...data], { limit: 100 });
  assert.equal(rows.length, 20);

  const smaller = projectSheetRows([header, ...data], { limit: 5 });
  assert.equal(smaller.rows.length, 5);
});

test('projectSheetRows tolerates empty sheets and ragged rows', () => {
  assert.deepEqual(projectSheetRows([]), { rows: [] });
  assert.deepEqual(projectSheetRows([['id', 'answer'], ['only_id']]), {
    rows: [{ id: 'only_id', answer: '' }],
  });
});
