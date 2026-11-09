# Architecture Master — AI Agent Reset

> Status: **investigation only, zero code changed.** This is the architectural
> recommendation for the three interconnected systems. Read `PROCESS_ARCHITECTURE.md`
> for the narrower process-flow audit; this document is the superset with memory
> and lead-capture added.

---

## Part 1 — Strict Process Flow (Verification & Answers)

### 1.1 Why `verification_question` is ignored today

Three independent reasons, all real:

1. **The agent harness never reads the column.** `runAgentHarness`
   (`server/workflows/agentHarness.ts`) resolves only `id`, `keywords`,
   `start_step`, `type`, `answer` headers. There is no
   `verification_question` header and no "ask before answering" branch. Grep for
   `verification_question|pendingIntentId|awaitingVerification` inside
   `agentHarness.ts` → **0 hits**.

2. **The only consumer is a legacy prompt instruction.** `server/ai/prompt.ts:96,136`
   injects `Ask "<verification_question>" before answering when present.` into the
   *legacy* engine's system prompt. It's a soft LLM suggestion with no code
   enforcement, and it never reaches the `agent` engine.

3. **The live sheet's `verification_question` cells are empty.** Workflow 37's
   `Intents` has two rows, both with `verification_question: ""`. The owner's
   *actual* verification is encoded as `Workflow_Steps` **Step_2**:

   ```
   Step_2  ask  slot_name: confirm  options: Yes, No
           "Sure, Would you like to confirm the availability of the {department}
            doctor for your appointment?"
   ```

### 1.2 Why the `confirm` step is dropped

`agentHarness.ts:115`:

```ts
const FLOW_CONTROL_SLOTS = new Set(['confirm', 'retry', 'completed', 'anything_else', 'done']);
```

`deriveChecklist` skips any slot in that set, so the harness collects only
`department, location, datetime, name, phone, email, cpr` and silently drops the
owner's `confirm` (Step_2), `retry` (Step_7), `completed` (Step_8), and
`anything_else` (Step_9). This is the structural root cause.

### 1.3 Fix

1. **Remove `confirm`, `retry`, `completed` from the blacklist** so they become
   real required slots. (`anything_else`/`done` can stay terminal/flow-control.)
2. **Extend `SheetState`** (`sheetStateMachine.ts:37`, reused by the harness):

   ```ts
   export interface SheetState {
     intentId: string | null;
     stepId: string | null;
     slots: Record<string, any>;
     lastSearch?: string;
     pendingIntentId?: string | null;   // NEW — matched but unconfirmed
     awaitingVerification?: boolean;    // NEW — verification question asked
   }
   ```

3. **Verification-first turn logic:**

   ```
   no intentId AND no pendingIntentId:
       match intent
       if intent.verification_question non-empty:
           pendingIntentId = id; awaitingVerification = true; ask it VERBATIM
       else: proceed (backward compatible)

   awaitingVerification:
       "Yes"  → intentId = pendingIntentId; clear flags; branch on type
       "No"   → clear pendingIntentId; clarify OR capture lead (Part 3)
   ```

4. `type` branch after confirmation: `FAQ`/`General`/any non-booking → return
   `answer` **verbatim**; `Booking` → run the harness checklist (now including the
   `confirm` step).

### 1.4 Verbatim answers — already correct

Both engines already return the `answer` cell with only `{slot}` substitution
(`substituteSlots`), never passed to the LLM:

```ts
const answer = substituteSlots(String(readCell(intent, answerHeader) ?? '').trim(), state.slots);
```

No change needed here — only the verification step is missing in front of it.

### 1.5 KPI — unanswered questions

**Current truth:** the `aiTrace` already persists what we need:

- `AiTrace.userMessage` (truncated 500 chars) — `aiAgentExecutor.ts:267,1613`.
- `AiTrace.nextHandle` and `fallbackUsed`/`fallbackReason` — same interface.
- Persisted to `workflow_executions.trigger_data.aiTrace` via `logExecution`
  (`chat-tick.ts:478-480`).

But `server/ai/kpi.ts` (`KpiAiTrace`, `computeKpis`) does **not** declare
`userMessage` and has no `unansweredQuestions` metric or message list.

**Requested definition:** `unansweredQuestions = count(traces where
nextHandle === 'handover' OR fallbackUsed === true)`.

⚠️ **Precision risk (flagging, not blocking):** `fallbackUsed === true` is also
set for *validation* rejections that are not "unanswered" — `invalid_time`,
`day_conflict`, `time_conflict`, a missing slot re-ask. Treating those as
"unanswered" will over-count. Recommendation: add an explicit
`unanswered?: boolean` (+ optional `unansweredSource: 'intent' | 'schedule'`) to
the trace, set from the three true "no answer" branches (no intent match, schedule
search 0 rows, forced handover), and count that. If you want the simple
`nextHandle === 'handover' || fallbackUsed` now, it's a one-line change but noisy.

**KPI surface to add:**

- `unansweredQuestions: number` (count).
- `topUnansweredMessages: { message: string; count: number }[]` (top 5 raw
  `userMessage` values) — this is what tells the owner *what to add to the
  knowledge base*.

---

## Part 2 — Short-Term Memory (Context Switching)

### 2.1 How `state.slots` is persisted today

`state.slots` is **already durable across messages**, not in-memory:

- `SheetState` (intentId / stepId / slots / lastSearch) lives at
  `context.ai[nodeId].sheet`.
- `context` is the AI node's `stateUpdate`, returned by `runAi`
  (`chat-host.ts:329-337`), threaded through `flowRunner.ts` and persisted by
  `host.persist(context, nodeId, 'cursor')` into **`conversation_states.context`**
  (jsonb).
- `conversation_states` (`shared/schema.ts:534`) is one row per
  `(workflowId, phone)`, with `context` jsonb + `currentNodeId`.

So the "short-term memory" is **Postgres jsonb, keyed by (workflow, phone)**,
surviving restarts, timeouts, and multi-day gaps.

### 2.2 The actual gap — no interruption handling

Persistence is fine; **resume logic is missing**. `runAgentHarness` matches
intents only on turn 1 (`if (!state.intentId)`). Once `intentId` is set, every
message is treated as a slot answer. There is no path to:

1. detect that a mid-booking message matches a *different* intent (FAQ/Greeting),
2. answer it without disturbing the in-flight `slots`, and
3. return to the same `stepId`.

Today a mid-booking "What are your hours?" is fed to the slot loop as if it were
the next booking answer — it does not get answered as an FAQ, and `slots` are not
lost only because nothing changes them.

### 2.3 Pro/Con — `Workflow_Steps_memory` table vs. JSON state

| Dimension | Dedicated `Workflow_Steps_memory` table | Reuse `conversation_states.context` JSON (current) |
|---|---|---|
| Persistence | ✅ explicit rows | ✅ already persisted (jsonb) |
| Resume fidelity | ✅ typed columns (intent_id, step_id, slots) | ✅ `SheetState` already holds intentId+stepId+slots |
| Queryability (SQL) | ✅ `WHERE status = 'in_progress'` | ⚠️ jsonb query (works, but `->>` gymnastics) |
| Schema/migration cost | ❌ new table + indexes + join | ✅ none |
| Data duplication | ❌ slots duplicated in 2 places → drift risk | ✅ single source of truth |
| Multi-tenant SaaS scale | ⚠️ rows grow per conversation | ✅ same, but one row already exists per conversation |
| Cleanup | needs its own TTL job | reuse existing purge (`chat-tick.ts` web-chat purge + WhatsApp retention) |
| Effort to reach the goal | ❌ high (new CRUD + sync) | ✅ low (add interrupt handling in the harness) |

**Recommendation: reuse the JSON state; do NOT add `Workflow_Steps_memory`.**

The resume point (`intentId`, `stepId`, `slots`) is *already* the exact
`SheetState` we persist. A dedicated table would duplicate that state and create a
second source of truth that can drift. What's missing is not storage — it's the
interruption branch in `runAgentHarness` (see Part 4). If the owner later needs
an admin dashboard to list "in-progress conversations", that's a **read** view
over `conversation_states` (or a lightweight `conversation_status` column), not a
new table.

---

## Part 3 — Lead Capture

### 3.1 Where the `capture_lead` flag should live

Three candidates:

| Location | Pro | Con |
|---|---|---|
| `workflows` table column (like `webChatBookingEnabled`) | workflow-scoped, one flag, simple, owner-visible in workflow settings | requires a schema migration; applies to *all* AI nodes in the workflow |
| AI node config (`node.data.config.captureLead`) | per-node granularity; no DB migration; rides the existing node-config editor | if a workflow has multiple AI nodes, each needs it set |
| AI Studio settings key (`settings` key/value, like `ai_studio_*`) | no schema migration | key/value is a string blob; less typed, harder to validate |

**Recommendation:** a **workflow-level boolean** on the `workflows` table
(`captureLeadEnabled boolean default false`), matching the existing
`webChatBookingEnabled` precedent and the owner's own wording ("each workflow
should have a flag"). It's surfaced in the AI Studio / workflow settings and read
by `executeAiAgentWorkflowNode` (which already receives `workflowId`).

### 3.2 Where leads are stored

**Recommendation: a new `leads` Postgres table**, not a Google Sheets tab.

Rationale:
- Queryable/relational (status, export, follow-up, dedupe by phone).
- Survives sheet deletion/renaming; the sheet is the *content* source, not the
  data store.
- Existing precedent: `bookings` is already Postgres; leads are "incomplete
  bookings" and belong beside them.
- A sheet tab would put user PII into the same doc the model reads (privacy +
  accidental-overwrite risk).

(The existing `capture_sequences`/`captured_data` tables are a *different*
button-click capture feature and are not a fit — they store button-click JSON, not
AI-collected slots.)

### 3.3 Proposed `leads` schema

```ts
export const leads = pgTable("leads", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  workflowId: integer("workflow_id").references(() => workflows.id, { onDelete: "set null" }),
  nodeId: text("node_id"),                       // which AI node produced it
  channel: text("channel").notNull().default("whatsapp"), // whatsapp | web_chat

  // Contact (dedupe key)
  phone: text("phone").notNull(),

  // Collected data — full slot snapshot, not just contact fields
  collectedSlotsJson: jsonb("collected_slots_json").notNull().default({}),
  // e.g. { department, location, datetime, name, email, cpr, doctor_name, ... }

  // Why it became a lead instead of a completed booking
  source: text("source").notNull().default("incomplete_booking"),
  // 'incomplete_booking' | 'no_answer' | 'declined_verification' | 'handover'

  // Optional free-text the customer asked that had no answer (feeds the KPI)
  question: text("question"),

  status: leadStatusEnum("status").notNull().default("new"), // new | contacted | converted | closed
  notes: text("notes"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  phoneIdx: index("leads_workflow_phone_idx").on(table.workflowId, table.phone),
  statusIdx: index("leads_status_idx").on(table.status),
}));
```

Capture rule (per the requirement):
- `captureLeadEnabled === true` AND the flow reaches completion → copy
  `state.slots` (and the `phone`/`channel` context) into `leads`.
- `captureLeadEnabled === false` → just complete (no lead row).
- Additionally, the "No" verification and "no answer" branches may write a lead
  with `source` set appropriately (this is what makes `unansweredQuestions` useful).

---

## Part 4 — Recommended Context-Switching Architecture

Goal: mid-booking FAQ must answer, then resume the exact step without losing slots.

```
                 ┌────────────────────────────────────────────┐
 inbound message │            runAgentHarness                  │
                 └────────────────────────────────────────────┘
                              │
                    read SheetState (intentId, stepId, slots, pendingIntentId, awaitingVerification)
                              │
              ┌───────────────┴───────────────────────────┐
              │ awaitingVerification?                      │  (Part 1)
              │   Yes/No → confirm / decline → branch      │
              └───────────────┬───────────────────────────┘
                              │
              ┌───────────────┴───────────────────────────┐
              │ intentId is null?                          │
              │   → INTENT MATCH                           │
              │      match → if verification_question      │
              │        → park pendingIntentId, ask         │
              │      else → set intentId, branch type      │
              └───────────────┬───────────────────────────┘
                              │  intentId IS set (mid-flow)
              ┌───────────────┴───────────────────────────┐
              │ INTERRUPTION CHECK  ← NEW                  │
              │   re-run INTENT MATCH on this message      │
              │   (against the *same* Intents sheet)       │
              │                                            │
              │   ├─ matched a FAQ/Greeting (type !=      │
              │   │   Booking) → answer its `answer`       │
              │   │   VERBATIM, DO NOT touch state.slots, │
              │   │   then re-ask the current stepId's     │
              │   │   ai_question (resume)                 │
              │   │                                        │
              │   ├─ matched the SAME booking intent       │
              │   │   → continue the checklist normally    │
              │   │                                        │
              │   └─ no match → treat as slot answer       │
              └───────────────┬───────────────────────────┘
                              │
                       BOOKING CHECKLIST (slots unchanged by the FAQ)
                              │
                     ask next missing ai_question (verbatim)
```

Key invariant: **answering an FAQ is a read-only side path.** It must not reset
`state.slots`, `state.intentId`, or `state.stepId`. The FAQ answer is returned
for that one turn; the next turn re-reads the same `SheetState` and resumes.
Because the resume point is already persisted in `conversation_states.context`,
no extra storage is required — only the interruption branch.

Edge cases to decide explicitly:
- "Yes/No" to a `confirm` step mid-flow (now that `confirm` is un-skipped) must be
  routed back into the checklist, not into intent re-matching.
- A `retry`/"No" during booking should follow the sheet's `alternate_step`/
  `fallback` (Step_7 → "try another location"), not a fresh intent match.

---

## Part 5 — Implementation order (dependencies)

1. **Verification state (Part 1.3)** — `SheetState` fields + verification-first
   turn + un-skip `confirm`/`retry`/`completed`. *No external dependency; unlocks
   Parts 4 and 3's "declined verification" path.*
2. **KPI unanswered (Part 1.5)** — add `unanswered` flag + `userMessage` to
   `computeKpis`, surface top-5. *Depends on nothing; do in parallel with 1. But
   the `unanswered` flag is most meaningful after (1) and the no-answer branches
   are defined.*
3. **Context switching (Part 4)** — interruption branch in `runAgentHarness`.
   *Depends on (1): it must not fight the verification state.*
4. **Lead capture (Part 3)** — `leads` table + `captureLeadEnabled` flag + copy
   slots on complete / decline / no-answer. *Depends on (1) for the decline path
   and on (3) for "FAQ with no answer → lead".*

Recommended sequence: **1 → 2 → 3 → 4** (1 first because everything else reads or
extends the harness state machine).

---

## Part 6 — Risks & open questions

1. **`fallbackUsed` over-counts "unanswered"** (see 1.5). Decide: simple count
   (`handover || fallbackUsed`) vs. a precise `unanswered` flag. Recommended: flag.
2. **Verification column is empty in the live sheet.** Shipping Part 1 changes the
   harness to honor a column the owner hasn't filled. The *de facto* verification
   is Step_2 `confirm` — so un-skipping `confirm` is the immediate win; the
   `verification_question` path activates the moment the owner fills the column.
   Confirm the intended semantics of having *both*.
3. **Two verification points** (Intents `verification_question` AND Step_2
   `confirm`) could double-prompt. Need a rule: if the booking flow already has a
   `confirm` step, skip the intent-level verification for Booking intents (or vice
   versa).
4. **`retry`/`completed` un-skipping changes the checklist shape** and may break
   existing `agentHarness.test.ts` assumptions (tests assert exact slot sets).
   Treat as expected churn, not a regression.
5. **Interruption re-matching cost:** re-running intent match on every mid-flow
   turn doubles Intents-sheet reads. Cheap (one sheet read), but note it; could be
   gated to "only when the message doesn't look like a slot answer."
6. **PII in leads:** `collected_slots_json` may contain name/CPR/email. Ensure the
   same redaction/access rules as `bookings` apply; never write leads back to a
   sheet the model reads.
7. **Multi-AI-node workflows:** `captureLeadEnabled` is workflow-scoped; if a
   workflow has two AI agents, both share the flag. Acceptable for now; revisit if
   per-node capture is needed.
8. **Web chat vs WhatsApp parity:** the interruption/verification/lead paths must
   work identically in `chat-host.ts` and the WhatsApp webhook; both already share
   `conversation_states`, so the harness change covers both — verify with a
   browser + WhatsApp smoke test.
9. **`KpiAiTrace` truncation:** `userMessage` is sliced to 500 chars at trace
   time; top-5 unanswered messages will be truncated. Fine for KPI; store the full
   question on the `leads.question` column if exact text matters.
10. **Migration timing:** Part 1 is code-only (no schema change); Parts 3 (leads
    table) and the `captureLeadEnabled` column are schema changes — apply via
    `npm run db:push` as a separate, explicitly-flagged step per the deploy rules.
