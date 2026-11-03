/**
 * Phase 1 AI Agent node — usage logging.
 *
 * Fire-and-forget by design:
 *   - a failed log insert must never fail a customer conversation, and
 *   - the caller must never wait on a logging round-trip before routing.
 *
 * Phase 1 logs only. Nothing in this module reads the table, blocks a request
 * or enforces a cap — that is Phase 3. Mock calls are skipped because they cost
 * nothing and would otherwise flood the table from the sandbox.
 */

import { db } from '../db';
import { aiUsageLogs, type InsertAiUsageLog } from '@shared/schema';

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
