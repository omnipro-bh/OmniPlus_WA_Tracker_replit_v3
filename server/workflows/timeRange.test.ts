/**
 * Time-window parsing tests — the Doctors_Schedule `Available_Times` column is
 * free-form 12-hour text; these are the contract for the availability check.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { isWithinWindow, parseRequestedTime, parseTimeWindows } from './timeRange';

// ── requested time ─────────────────────────────────────────────────────────

test('parseRequestedTime handles "7 PM", "19:00", "7:30pm" and "11 PM"', () => {
  assert.equal(parseRequestedTime('today at 7 PM'), 19 * 60);
  assert.equal(parseRequestedTime('19:00'), 19 * 60);
  assert.equal(parseRequestedTime('7:30pm'), 19 * 60 + 30);
  assert.equal(parseRequestedTime('11 PM'), 23 * 60);
  assert.equal(parseRequestedTime('09:30'), 9 * 60 + 30);
});

test('parseRequestedTime returns undefined when there is no time', () => {
  assert.equal(parseRequestedTime('tomorrow'), undefined);
  assert.equal(parseRequestedTime(''), undefined);
});

// ── available times ────────────────────────────────────────────────────────

test('parseTimeWindows parses "09:30-12:30/04:30-09:30" as morning + evening', () => {
  const windows = parseTimeWindows('09:30-12:30/04:30-09:30');
  assert.deepEqual(windows, [
    { start: 9 * 60 + 30, end: 12 * 60 + 30 },
    { start: 16 * 60 + 30, end: 21 * 60 + 30 },
  ]);
});

test('parseTimeWindows parses "9-1/5-9" and "5 to 9"', () => {
  assert.deepEqual(parseTimeWindows('9-1/5-9'), [
    { start: 9 * 60, end: 13 * 60 },
    { start: 17 * 60, end: 21 * 60 },
  ]);
  assert.deepEqual(parseTimeWindows('5 to 9'), [{ start: 17 * 60, end: 21 * 60 }]);
});

test('parseTimeWindows honours explicit AM/PM markers', () => {
  assert.deepEqual(parseTimeWindows('7AM -3PM'), [{ start: 7 * 60, end: 15 * 60 }]);
  assert.deepEqual(parseTimeWindows('10 AM TO 6 PM'), [{ start: 10 * 60, end: 18 * 60 }]);
});

test('parseTimeWindows returns [] for a day off / rota text', () => {
  assert.deepEqual(parseTimeWindows('WEELKLY OFF'), []);
  assert.deepEqual(parseTimeWindows('AS PER GP ROA'), []);
  assert.deepEqual(parseTimeWindows('--'), []);
});

// ── containment ────────────────────────────────────────────────────────────

test('"7 PM" is within "09:30-12:30/04:30-09:30"', () => {
  assert.equal(isWithinWindow(parseRequestedTime('7 PM')!, parseTimeWindows('09:30-12:30/04:30-09:30')), true);
});

test('"11 PM" is outside "09:30-12:30/04:30-09:30"', () => {
  assert.equal(isWithinWindow(parseRequestedTime('11 PM')!, parseTimeWindows('09:30-12:30/04:30-09:30')), false);
});

test('"6 PM" is within the Adliya ENT surgeon evening window', () => {
  assert.equal(isWithinWindow(parseRequestedTime('today at 6 PM')!, parseTimeWindows('09:30-12:30&04:30-09:30')), true);
});
