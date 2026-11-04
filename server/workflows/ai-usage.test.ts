/**
 * Phase 3 AI Agent node — usage-boundary helpers.
 *
 * `aiUsagePeriodStart` is pure (dayjs only) but lives in a module that also
 * imports `db`, which throws at load time without `DATABASE_URL`. We set the env
 * var before the *dynamic* import, so `db` loads cleanly (no connection is ever
 * made — these tests only exercise the pure boundary math).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/omniplus_db';

test('per-user daily boundary is midnight Asia/Bahrain (UTC+3)', async () => {
  const { aiUsagePeriodStart } = await import('./ai-usage');

  // 2026-11-04 15:00 Bahrain == 12:00 UTC.
  const now = new Date('2026-11-04T12:00:00Z');
  const start = aiUsagePeriodStart('day', 'Asia/Bahrain', now);
  assert.equal(start.toISOString(), '2026-11-03T21:00:00.000Z');

  // A call logged just before Bahrain midnight is yesterday's bucket (excluded,
  // so a cap reached yesterday does NOT block today).
  const yesterdayLate = new Date('2026-11-03T20:59:59Z'); // 23:59:59 Bahrain on 11-03
  assert.ok(yesterdayLate.getTime() < start.getTime());

  // A call logged at Bahrain midnight is today's bucket (included).
  const todayMidnight = new Date('2026-11-03T21:00:00Z'); // 00:00 Bahrain on 11-04
  assert.ok(todayMidnight.getTime() >= start.getTime());
});

test('monthly boundary is the first of the month at Bahrain midnight', async () => {
  const { aiUsagePeriodStart } = await import('./ai-usage');

  const now = new Date('2026-11-15T12:00:00Z');
  const start = aiUsagePeriodStart('month', 'Asia/Bahrain', now);
  assert.equal(start.toISOString(), '2026-10-31T21:00:00.000Z');
});
