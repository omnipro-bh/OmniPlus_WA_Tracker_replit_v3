/**
 * Phase 3 AI Agent node — pure schedule / usage / message-cap predicate tests.
 *
 * `isWithinSchedule` boundary cases rely on the fact that `Asia/Bahrain` is
 * UTC+3 with no DST, so a fixed UTC instant maps to a stable local hour.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isMessageCapReached,
  isUsageExceeded,
  isWithinSchedule,
} from './schedule';

// A fixed UTC instant: 2026-11-04T05:00:00Z === 08:00 Asia/Bahrain (UTC+3).
const WED_08_BAHRAIN = new Date('2026-11-04T05:00:00Z'); // Wednesday

function schedule(overrides: Record<string, any> = {}) {
  return {
    startHour: 9,
    endHour: 17,
    daysOfWeek: [],
    tz: 'Asia/Bahrain',
    ...overrides,
  };
}

// ── isWithinSchedule ────────────────────────────────────────────────────────

test('no schedule is always active', () => {
  assert.deepEqual(isWithinSchedule(undefined, WED_08_BAHRAIN), { allowed: true });
  assert.deepEqual(isWithinSchedule(null, WED_08_BAHRAIN), { allowed: true });
});

test('in-window hour is allowed', () => {
  // 08:00 Bahrain falls inside 9–17? No — use an in-window instant instead.
  const inWindow = new Date('2026-11-04T07:00:00Z'); // 10:00 Bahrain
  assert.deepEqual(isWithinSchedule(schedule(), inWindow), { allowed: true });
});

test('before start is rejected', () => {
  const before = new Date('2026-11-04T05:00:00Z'); // 08:00 Bahrain, before 9
  assert.deepEqual(isWithinSchedule(schedule(), before), {
    allowed: false,
    reason: 'outside_schedule',
  });
});

test('after end (end exclusive) is rejected', () => {
  const atEnd = new Date('2026-11-04T14:00:00Z'); // 17:00 Bahrain, end is exclusive
  assert.deepEqual(isWithinSchedule(schedule(), atEnd), {
    allowed: false,
    reason: 'outside_schedule',
  });
});

test('midnight-crossing window (22 → 6)', () => {
  const night = schedule({ startHour: 22, endHour: 6 });
  // 23:00 Bahrain (20:00 UTC) → in window
  assert.deepEqual(isWithinSchedule(night, new Date('2026-11-04T20:00:00Z')), {
    allowed: true,
  });
  // 02:00 Bahrain (23:00 UTC previous day) → in window
  assert.deepEqual(isWithinSchedule(night, new Date('2026-11-03T23:00:00Z')), {
    allowed: true,
  });
  // 12:00 Bahrain (09:00 UTC) → outside
  assert.deepEqual(isWithinSchedule(night, new Date('2026-11-04T09:00:00Z')), {
    allowed: false,
    reason: 'outside_schedule',
  });
});

test('day-of-week filter rejects a non-listed day', () => {
  const wednesdayInWindow = new Date('2026-11-04T07:00:00Z'); // 10:00 Bahrain, Wednesday

  // Wednesday (local day 3) is not in [1, 2] → rejected even though the hour is fine.
  const weekdays = schedule({ daysOfWeek: [1, 2] });
  assert.deepEqual(isWithinSchedule(weekdays, wednesdayInWindow), {
    allowed: false,
    reason: 'outside_schedule',
  });

  // Wednesday IS day 3 → allowed.
  assert.deepEqual(isWithinSchedule(schedule({ daysOfWeek: [3] }), wednesdayInWindow), {
    allowed: true,
  });
});

test('invalid hour range fails open (always active)', () => {
  assert.deepEqual(isWithinSchedule(schedule({ startHour: 9, endHour: 9 }), WED_08_BAHRAIN), {
    allowed: true,
  });
  assert.deepEqual(isWithinSchedule(schedule({ startHour: 'x', endHour: 5 }), WED_08_BAHRAIN), {
    allowed: true,
  });
});

test('timezone boundary: Asia/Bahrain is UTC+3', () => {
  // 05:00 UTC === 08:00 Bahrain (in 9–17? no) — use an unambiguous boundary.
  // 09:00 Bahrain === 06:00 UTC is the start of the window.
  const start = new Date('2026-11-04T06:00:00Z'); // 09:00 Bahrain
  assert.deepEqual(isWithinSchedule(schedule(), start), { allowed: true });
  // 05:59:59 UTC === 08:59:59 Bahrain, just before start.
  const justBefore = new Date('2026-11-04T05:59:59Z');
  assert.deepEqual(isWithinSchedule(schedule(), justBefore), {
    allowed: false,
    reason: 'outside_schedule',
  });
});

test('invalid timezone falls back to Asia/Bahrain', () => {
  const badTz = schedule({ tz: 'Not/AZone' });
  // 08:00 Bahrain is before 9 → rejected (proves the fallback tz is in effect,
  // not treated as always-open).
  assert.deepEqual(isWithinSchedule(badTz, WED_08_BAHRAIN), {
    allowed: false,
    reason: 'outside_schedule',
  });
});

// ── isUsageExceeded ─────────────────────────────────────────────────────────

test('usage limit: zero/negative/absent means unlimited', () => {
  assert.equal(isUsageExceeded(5, 0), false);
  assert.equal(isUsageExceeded(5, -1), false);
  assert.equal(isUsageExceeded(5, undefined), false);
  assert.equal(isUsageExceeded(5, null), false);
});

test('usage limit: reached at exactly the cap', () => {
  assert.equal(isUsageExceeded(9, 10), false);
  assert.equal(isUsageExceeded(10, 10), true);
  assert.equal(isUsageExceeded(11, 10), true);
});

test('usage limit: string limit is coerced', () => {
  assert.equal(isUsageExceeded(3, '3' as any), true);
  assert.equal(isUsageExceeded(3, 'abc' as any), false);
});

// ── isMessageCapReached ─────────────────────────────────────────────────────

test('message cap: zero/negative/absent means unlimited', () => {
  assert.equal(isMessageCapReached(3, 0), false);
  assert.equal(isMessageCapReached(3, undefined), false);
  assert.equal(isMessageCapReached(3, null), false);
});

test('message cap: reached at exactly the cap', () => {
  assert.equal(isMessageCapReached(1, 2), false);
  assert.equal(isMessageCapReached(2, 2), true);
  assert.equal(isMessageCapReached(3, 2), true);
});
