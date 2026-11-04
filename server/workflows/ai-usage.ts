/**
 * Phase 1 AI Agent node — usage logging.
 *
 * Fire-and-forget by design:
 *   - a failed log insert must never fail a customer conversation, and
 *   - the caller must never wait on a logging round-trip before routing.
 *
 * Phase 1 logs only; Phase 3 adds the enforcement-side reads below. Nothing
 * here blocks a request on a failed metrics query (fail-open by design). Mock
 * calls are skipped because they cost nothing and would otherwise flood the
 * table from the sandbox.
 */

import { and, eq, gte, sql } from 'drizzle-orm';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { db } from '../db';
import { aiUsageLogs, type InsertAiUsageLog } from '@shared/schema';

dayjs.extend(utc);
dayjs.extend(timezone);

/** Platform timezone used for daily/monthly usage-reset boundaries. */
const USAGE_TIMEZONE = 'Asia/Bahrain';

export function logAiUsage(entry: InsertAiUsageLog): void {
  if (!entry?.userId) return;
  if (entry.provider === 'mock') return;

  void (async () => {
    try {
      await db.insert(aiUsageLogs).values({
        ...entry,
        createdAt: entry.createdAt ?? new Date(),
      });
    } catch (error: any) {
      console.warn(`[AI] usage log insert failed: ${error?.message ?? error}`);
    }
  })();
}

/**
 * Start of the current day/month in the platform timezone, as a UTC `Date` for
 * a `created_at >= since` comparison. The DB stores timestamps without a
 * timezone, so the boundary is computed here and passed as a UTC instant.
 */
export function aiUsagePeriodStart(period: 'day' | 'month', tz: string = USAGE_TIMEZONE): Date {
  const local = dayjs().tz(tz);
  return (period === 'month' ? local.startOf('month') : local.startOf('day')).toDate();
}

/**
 * Count AI calls for a workflow since `since`. Fail-open: a metrics read error
 * returns 0 so it can never block a customer conversation.
 */
export async function countAiCallsSince(
  userId: number,
  workflowId: number,
  since: Date
): Promise<number> {
  try {
    const rows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(aiUsageLogs)
      .where(
        and(
          eq(aiUsageLogs.userId, userId),
          eq(aiUsageLogs.workflowId, workflowId),
          gte(aiUsageLogs.createdAt, since)
        )
      );
    return rows[0]?.count ?? 0;
  } catch (error: any) {
    console.warn(`[AI] usage count query failed: ${error?.message ?? error}`);
    return 0;
  }
}
