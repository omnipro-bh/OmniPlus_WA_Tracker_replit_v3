/**
 * Phase 3 AI Agent node — pure schedule / usage / message-cap predicates.
 *
 * Everything here is a pure function (no I/O, no SDK, no process env reads) so
 * it can be unit-tested directly and reused by the executor in `aiAgentExecutor.ts`.
 *
 * The executor is the only caller of `isWithinSchedule` today; the two cap
 * predicates are kept as named helpers so the enforcement site reads clearly and
 * the semantics can diverge later (e.g. dollar-based limits).
 *
 * Timezone handling uses `dayjs` + the timezone plugin (already a project
 * dependency). The default is `Asia/Bahrain` (UTC+3, no DST) — matching
 * `worker.ts`, `share-links.ts` and `routes.ts`.
 */

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import type { AiSchedule } from './types';

dayjs.extend(utc);
dayjs.extend(timezone);

/** Default timezone when a schedule omits one or supplies an invalid name. */
export const AI_DEFAULT_TIMEZONE = 'Asia/Bahrain';

/** Return a known IANA timezone, falling back to the default for invalid input. */
function validTimezone(tz: unknown): string {
  if (typeof tz === 'string' && tz.trim()) {
    const candidate = tz.trim();
    try {
      // An unknown IANA name makes the timezone plugin throw a RangeError.
      dayjs().tz(candidate);
      return candidate;
    } catch {
      // fall through to the default
    }
  }
  return AI_DEFAULT_TIMEZONE;
}

/** Coerce an hour (0–23) to an integer, or `NaN` when invalid. */
function normalizeHour(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 23) return NaN;
  return n;
}

export type ScheduleDecision = { allowed: boolean; reason?: string };

/**
 * Is the AI active at `now`?
 *
 * Returns `{ allowed: false, reason: 'outside_schedule' }` when the schedule is
 * configured and `now` falls outside it. A missing or malformed schedule is
 * treated as always-active (fail-open): the save-time validator is what blocks
 * bad config, and a runtime surprise must never block a customer.
 */
export function isWithinSchedule(
  schedule: AiSchedule | null | undefined,
  now: Date = new Date()
): ScheduleDecision {
  if (!schedule) return { allowed: true };

  const tz = validTimezone(schedule.tz);
  const local = dayjs(now).tz(tz);

  const days = Array.isArray(schedule.daysOfWeek) ? schedule.daysOfWeek : [];
  if (days.length > 0 && !days.includes(local.day())) {
    return { allowed: false, reason: 'outside_schedule' };
  }

  const start = normalizeHour(schedule.startHour);
  const end = normalizeHour(schedule.endHour);
  if (Number.isNaN(start) || Number.isNaN(end) || start === end) {
    // Malformed — the validator rejects it at save; fail open at runtime.
    return { allowed: true };
  }

  const hour = local.hour();

  if (start < end) {
    return hour >= start && hour < end
      ? { allowed: true }
      : { allowed: false, reason: 'outside_schedule' };
  }

  // Midnight-crossing window (e.g. 22 → 6): active in [start, 24) ∪ [0, end).
  return hour >= start || hour < end
    ? { allowed: true }
    : { allowed: false, reason: 'outside_schedule' };
}

/**
 * Has a call count reached its cap? `limit <= 0` means unlimited. Used for both
 * the per-workflow usage caps and the per-user-per-day cap; `count` is the
 * relevant `ai_usage_logs` row count for the current period.
 */
export function isUsageExceeded(count: number, limit: number | null | undefined): boolean {
  const cap = typeof limit === 'number' && Number.isFinite(limit) ? limit : Number(limit);
  if (!Number.isFinite(cap) || cap <= 0) return false;
  return count >= cap;
}
