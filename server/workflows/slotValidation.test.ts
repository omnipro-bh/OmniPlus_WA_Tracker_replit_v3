/**
 * Phase 4d-2 increment 2 — deterministic slot validation tests.
 *
 * These are the contract: the LLM extracts raw strings, these functions decide.
 * The "today at 6 PM" cases are the production regression (Step_4, a `text`
 * slot whose options cell says "(leave empty)").
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isPlaceholderOption,
  matchWholeWordOption,
  normalizeInputType,
  normalizeOptions,
  parseOptions,
  validateSlotValue,
} from './slotValidation';

// ── options parsing ─────────────────────────────────────────────────────────

test('parseOptions splits a comma-separated cell and trims entries', () => {
  assert.deepEqual(parseOptions('Manama, Muharraq , Hidd'), ['Manama', 'Muharraq', 'Hidd']);
  assert.equal(parseOptions('   '), undefined);
  assert.equal(parseOptions(undefined), undefined);
  assert.equal(parseOptions(42), undefined);
});

test('normalizeOptions drops blanks and owner placeholders', () => {
  assert.deepEqual(
    normalizeOptions([' (leave empty) ', '(empty)', '(optional)', '(n/a)', 'n/a', '-', '—', 'Dental']),
    ['Dental']
  );
  assert.deepEqual(normalizeOptions(undefined), []);
  assert.deepEqual(normalizeOptions(null), []);
});

test('normalizeOptions keeps "none" because it can be a real option', () => {
  assert.deepEqual(normalizeOptions(['none', 'Dental']), ['none', 'Dental']);
});

test('isPlaceholderOption only matches documentation tokens', () => {
  assert.equal(isPlaceholderOption('(leave empty)'), true);
  assert.equal(isPlaceholderOption('(LEAVE EMPTY)'), true);
  assert.equal(isPlaceholderOption(''), true);
  assert.equal(isPlaceholderOption('N/A'), true);
  assert.equal(isPlaceholderOption('none'), false);
  assert.equal(isPlaceholderOption('Dental'), false);
});

test('normalizeInputType lowercases and defaults blanks to text', () => {
  assert.equal(normalizeInputType(' LIST '), 'list');
  assert.equal(normalizeInputType(''), 'text');
  assert.equal(normalizeInputType(null), 'text');
  assert.equal(normalizeInputType(undefined), 'text');
});

// ── text slots (the production regression) ─────────────────────────────────

test('text accepts "today at 6 PM" even when options says "(leave empty)"', () => {
  const out = validateSlotValue('today at 6 PM', 'text', ['(leave empty)']);
  assert.deepEqual(out, { valid: true, value: 'today at 6 PM' });
});

test('text trims surrounding whitespace', () => {
  assert.deepEqual(validateSlotValue('  riffa  ', 'text'), { valid: true, value: 'riffa' });
});

test('text rejects an empty string', () => {
  const out = validateSlotValue('', 'text');
  assert.equal(out.valid, false);
  assert.equal(out.reason, 'empty value');
});

test('text rejects a whitespace-only string', () => {
  assert.equal(validateSlotValue('   ', 'text').valid, false);
});

test('text rejects null and undefined', () => {
  assert.equal(validateSlotValue(null, 'text').valid, false);
  assert.equal(validateSlotValue(undefined, 'text').valid, false);
});

test('a blank expected_input falls back to text', () => {
  assert.deepEqual(validateSlotValue('anytime', '', ['(leave empty)']), { valid: true, value: 'anytime' });
});

// ── list / buttons ─────────────────────────────────────────────────────────

test('list accepts an exact option', () => {
  assert.deepEqual(validateSlotValue('Manama', 'list', ['Manama', 'Hidd']), {
    valid: true,
    value: 'Manama',
  });
});

test('list accepts a whole-word option inside a longer phrase', () => {
  // "ENT doctor" on turn 1 must fill the `department` slot with "ENT".
  assert.deepEqual(validateSlotValue('ENT doctor', 'list', ['ENT', 'Dental']), {
    valid: true,
    value: 'ENT',
  });
  assert.deepEqual(validateSlotValue('I need a dental appointment', 'list', ['ENT', 'Dental']), {
    valid: true,
    value: 'Dental',
  });
});

test('whole-word matching never matches inside another word', () => {
  assert.equal(matchWholeWordOption('not sure', ['Yes', 'No']), undefined);
  assert.equal(matchWholeWordOption('yesterday', ['Yes', 'No']), undefined);
  assert.equal(matchWholeWordOption('yep, yes please', ['Yes', 'No']), 'Yes');
});

test('list accepts a lowercase option and canonicalises to the sheet spelling', () => {
  assert.deepEqual(validateSlotValue('manama', 'list', ['Manama', 'Hidd']), {
    valid: true,
    value: 'Manama',
  });
});

test('list is case-insensitive and trims the value', () => {
  assert.deepEqual(validateSlotValue('  MANAMA ', 'list', ['Manama', 'Hidd']), {
    valid: true,
    value: 'Manama',
  });
});

test('list rejects a value that is not an option', () => {
  const out = validateSlotValue('banana', 'list', ['Manama', 'Hidd']);
  assert.equal(out.valid, false);
  assert.match(out.reason ?? '', /not one of/);
});

test('list with no usable options accepts free text instead of trapping the user', () => {
  assert.deepEqual(validateSlotValue('somewhere', 'list', undefined), { valid: true, value: 'somewhere' });
});

test('list whose options are only placeholders accepts free text', () => {
  assert.deepEqual(validateSlotValue('somewhere', 'list', ['(leave empty)']), {
    valid: true,
    value: 'somewhere',
  });
});

test('buttons accepts an exact option', () => {
  assert.deepEqual(validateSlotValue('Yes', 'buttons', ['Yes', 'No']), { valid: true, value: 'Yes' });
});

test('buttons rejects a non-option', () => {
  assert.equal(validateSlotValue('maybe', 'buttons', ['Yes', 'No']).valid, false);
});

test('buttons canonicalises lowercase input', () => {
  assert.deepEqual(validateSlotValue('no', 'buttons', ['Yes', 'No']), { valid: true, value: 'No' });
});

// ── datetime ───────────────────────────────────────────────────────────────

test('datetime accepts "today at 6 PM"', () => {
  assert.deepEqual(validateSlotValue('today at 6 PM', 'datetime'), {
    valid: true,
    value: 'today at 6 PM',
  });
});

test('datetime accepts free text like "anytime" for now', () => {
  assert.deepEqual(validateSlotValue('anytime', 'datetime'), { valid: true, value: 'anytime' });
});

test('datetime rejects an empty value', () => {
  assert.equal(validateSlotValue('  ', 'datetime').valid, false);
});

// ── number ─────────────────────────────────────────────────────────────────

test('number accepts integers, decimals and negatives', () => {
  assert.deepEqual(validateSlotValue('42', 'number'), { valid: true, value: '42' });
  assert.deepEqual(validateSlotValue('3.5', 'number'), { valid: true, value: '3.5' });
  assert.deepEqual(validateSlotValue('-2', 'number'), { valid: true, value: '-2' });
});

test('number keeps the raw text (no canonicalisation)', () => {
  assert.deepEqual(validateSlotValue(' 06 ', 'number'), { valid: true, value: '06' });
});

test('number rejects non-numeric text', () => {
  assert.equal(validateSlotValue('abc', 'number').valid, false);
  assert.equal(validateSlotValue('12abc', 'number').valid, false);
});

test('number rejects an empty value', () => {
  assert.equal(validateSlotValue('', 'number').valid, false);
});

// ── unknown types ──────────────────────────────────────────────────────────

test('an unknown expected_input behaves like text', () => {
  assert.deepEqual(validateSlotValue('a@b.co', 'email'), { valid: true, value: 'a@b.co' });
  assert.equal(validateSlotValue('   ', 'email').valid, false);
});

test('options with messy whitespace are matched after normalisation', () => {
  assert.deepEqual(validateSlotValue('dental', 'list', ['  Dental ', ' (leave empty) ']), {
    valid: true,
    value: 'Dental',
  });
});
