# Process Architecture — AI Agent (Audit)

> Status: **investigation only, no code changed.** This documents the *truth* of how
> the AI Agent (`engine: 'agent'`) resolves intents, answers, captures leads, and
> answers availability questions today, and the exact gaps against the target
> business process.

---

## 0. The two engines

There are **two** Google-Sheets AI engines, selected by the node's `engine` config
(`server/workflows/aiAgentExecutor.ts:991`):

| Engine | Entry point | Used by |
|---|---|---|
| `agent` (the one we've been hardening) | `runAgentHarness` in `server/workflows/agentHarness.ts` | workflow 37 |
| legacy (default / no `engine`) | `runSheetStateMachine` in `server/workflows/sheetStateMachine.ts` | older nodes |

`executeAiAgentNode` runs the deterministic engine first; if it returns
`conversational: true` (no intent matched, no flow active) it falls through to a
free-form LLM call with the persona + instructions + `lookup_sheet` tool
(`aiAgentExecutor.ts:1012-1127`).

The `Intents` / `Workflow_Steps` schema is declared in
`shared/ai-defaults.ts` (`AI_SHEET_TAB_SCHEMA`). The `verification_question`
column **is** declared there (key `verification_question`, column
`verification_question`), so "Detect Headers" and the legacy prompt know about it —
but the agent harness never reads it (see §1).

---

## 1. Intent resolution — audit

### Code path (agent engine)

`runAgentHarness` turn 1 (`agentHarness.ts`, ~L1170-1250):

1. `readRows(sheet, intentsTab, { column: keywordsHeader, value: userMessage })`
   — this is a **strict substring** match on the `keywords` cell
   (`googleSheetsExecutor.ts` `projectSheetRows`: single-token = case-insensitive
   `includes`; multi-word = any-word ≥3 chars, ranked).
2. If no rows, a lenient fallback `matchesIntentKeywords(userMessage)` re-reads
   **all** intents and matches whole-word / ±s / shared-prefix (≥4 chars)
   (`agentHarness.ts:156-167`).
3. `state.intentId` is set to the first match's `id`.

### Where is `verification_question` read?

- **Schema:** `shared/ai-defaults.ts:104-108` (declared).
- **Legacy prompt only:** `server/ai/prompt.ts:96` and `:136` — the instruction
  `Ask "<verification_question>" before answering when present.` is injected into
  the system prompt for the **legacy** engine's conversational fallback.
- **Agent harness (`agentHarness.ts`):** **never read.** There is no
  `verification_question` header, no pending-intent state, and no "ask before
  answering" step. Grep for `verification_question|pending_intent|awaiting_verification`
  returns **zero** hits in `agentHarness.ts`.

So for workflow 37 (which uses `engine: 'agent'`), the verification column is
effectively dead. The legacy engine relies on the LLM to *voluntarily* ask it
(prompt only, no code enforcement).

### How FAQ vs Booking is decided

Both engines use the `type` column gate:

```ts
// agentHarness.ts (~L1355) and sheetStateMachine.ts (~L871)
const intentType = String(readCell(intent, typeHeader) ?? '').trim();
if (intentType && !/^booking$/i.test(intentType)) {
  // non-booking (FAQ / General / Greeting / …) → return `answer`
}
// empty type is treated as Booking (backward compatible)
```

There is **no explicit distinction** between `FAQ` and `General` — both are just
"not Booking". The live sheet (`workflow 37`) has exactly two intents:

| id | keywords | type | verification_question | answer |
|---|---|---|---|---|
| 1 | `ENT, dental, doctor, book` | `Booking` | *(empty)* | *(empty)* |
| 2 | `hello, hi, good morning` | `Greeting` | *(empty)* | `Welcome to AL HILAL Hospital…` |

---

## 2. The "answer" path — audit

When `type` is non-booking (or Booking-with-no-steps), the harness returns the
`answer` cell **verbatim** (only `{slot}` substitution, no LLM rephrase):

```ts
// agentHarness.ts — intent type gate
const answer = substituteSlots(String(readCell(intent, answerHeader) ?? '').trim(), state.slots);
if (answer) return { text: answer, sheet: freshHarnessState(), toolCalls };
// empty answer → conversational fallback (persona)
```

Legacy `sheetStateMachine.ts` does the same (`substituteSlots(answer, slots)` at
the type gate and in `complete(...)`).

**Verdict:** the "return the `answer` verbatim" rule is **already satisfied** —
the answer is not passed to the LLM to rephrase. The gap is *only* that there is
no verification step before returning it (and no lead capture on "No").

---

## 3. Lead capture — audit

### What exists

- **`handover` tool** (`server/ai/tools.ts`, `buildHandoverTool`): hands off to a
  human department declared in `node.data.config.handoverDepartments`
  (id + title). Terminal → `nextHandle: 'handover'`. It captures a *reason*, not a
  structured lead.
- **Booking details capture** is Step 6 of the sheet: `slot_name: "name, phone,
  email, cpr"` — the harness derives these as required slots and collects them as
  part of the booking flow (this is booking, not a generic lead).
- **No `leads` table** in `shared/schema.ts` (grep for `lead` = zero hits).

### What happens on an unmatched FAQ / "No"

- Agent harness: no intent match + no schedule → `conversational: true` → the
  executor's free-form LLM answers from persona/instructions (no record kept).
- "No" to a booking confirm: there is no confirm step in the harness at all (see
  §6) — so "No" is not handled.

### Proposal (not built)

A `capture_lead` tool + a `leads` table:

```
leads(id, user_id, workflow_id, channel, phone, name, email, question, created_at)
```

Exposed as a tool when the owner opts in (mirrors `handoverDepartments`), so the
model can call it when it cannot answer. The KPI `unansweredQuestions` (§5) can
then join on `question` / raw message.

---

## 4. "Answer only what is asked" — audit

### Code path

`executeSearch` (`agentHarness.ts:1379+`):

1. `mergeSearchWithSlots(search, slots)` — narrows a follow-up with prior slots.
2. `filterRowsStructured(rows, search, map)` — **AND** semantics on
   `category`/`location`/`name`/`day` (strict `strictCellMatch`; no full-text).
3. `serializeSearchResults(rows, map)` — drops "off/vacation" rows, then
   `dedupeRows` collapses by **entity+branch**, preserving `--` times.
4. The serialized JSON is given to the LLM, which renders the description.

### Why the live run dumped duplicate names

"urologist" produced `DR. REGHUNATH, DR. REGHUNATH, DR. ANIL, DR. SHABEENA NAZ,
DR. SHABEENA NAZ, DR. SHANKAR NARAYANAPPA, DR. SHANKAR NARAYANAPPA, …`.

Root causes (all three are real):

1. **Category-only search returns every branch.** "urologist" has no location, so
   `filterRowsStructured` returns *every* urologist at *every* hospital (the sheet
   lists the same doctor at multiple branches).
2. **Dedup key is entity+branch, not entity.** `dedupeRows` (`agentHarness.ts:742`)
   keys on `entity||branch`, so the same doctor at Riffa and at Muharraq stays as
   two rows — hence the repeated name.
3. **The guided-flow prompt told the model to "describe the matches"** and the
   model (qwen) rendered a flat name list, repeating one per row.

The harness is *capable* of narrowing (location follow-up → 2 rows), but a bare
category search currently surfaces the whole multi-branch set to the model.

---

## 5. KPI add-on — `unansweredQuestions`

### Where KPIs live

- `server/ai/kpi.ts` — pure `computeKpis(rows)` over `workflow_executions.aiTrace`.
- Route `GET /api/ai-studio/kpis` (`routes.ts:8172`) fetches rows where
  `triggerData ? 'aiTrace'` and returns `computeKpis`.
- Existing metrics: `totalConversations`, `totalAiTurns`, `containmentRate`,
  `fallbackRate`, `dropOffSteps`, `topRejectedInputs`, `slotDistribution`,
  `stepFunnel`, `timeSeries`.

### What's missing for `unansweredQuestions`

- The `aiTrace` does **not** currently carry the user message. `KpiAiTrace` has
  `sheetState`, `fallbackUsed`, `fallbackReason`, `rejectedSlots`, `nextHandle`,
  but **no `userMessage` field** and **no `unanswered` flag**.
- No single code point currently *knows* "I failed to find an answer in Intents or
  Doctors_Schedule" in a structured way:
  - No intent match → `conversational: true` (agent engine) or `conversational`
    (legacy) — a de-facto "no Intents answer".
  - Schedule search with 0 rows → deterministic
    `"I could not find anything matching that."` (`agentHarness.ts` `executeSearch`).
  - No-intent path with no schedule → conversational fallback.

### Proposal (not built)

1. Add `userMessage` (and an `unanswered?: boolean` + `unansweredSource?:
   'intent' | 'schedule'`) to the `aiTrace` produced by `executeAiAgentWorkflowNode`
   (it already slices `userMessage` for the trace at `aiAgentExecutor.ts:1613`).
2. Emit `unanswered` from the three "no answer" branches above.
3. In `computeKpis`, count `unanswered === true` turns and aggregate the raw
   `userMessage` texts (top-N) so the owner sees *what to add to the knowledge base*.
4. Optionally persist the same to `ai_usage_logs` (new nullable `user_message`
   column) for a durable, queryable record — this is a schema change, so it's
   flagged separately.

---

## 6. The verification state (the hidden blocker)

The target process puts **VERIFICATION before answering / before the booking
flow**. Two candidate sources exist and **neither is currently wired**:

### 6a. The `verification_question` column — declared, empty, unused

- In the schema (`ai-defaults.ts`) but **empty in the live sheet** (both intent
  rows have `verification_question: ""`).
- Not read by the agent harness at all.

### 6b. The owner's own Step_2 confirm — populated, but dropped

The live `Workflow_Steps` **already encodes a verification step**:

```
Step_2  ask  slot_name: confirm  options: Yes, No
        ai_question: "Sure, Would you like to confirm the availability of the
        {department} doctor for your appointment?"
```

…but the harness **skips it**. `agentHarness.ts:115` hardcodes:

```ts
const FLOW_CONTROL_SLOTS = new Set(['confirm', 'retry', 'completed', 'anything_else', 'done']);
```

`deriveChecklist` excludes every slot in that set, so the harness collects only
`department`, `location`, `datetime`, `name`, `phone`, `email`, `cpr` and drops
the owner's confirm / no-doctor-retry / completion / "anything else" steps.

This is the single biggest structural mismatch between the current code and the
desired process, and it is not visible in the chat output because the harness
silently skips those steps.

---

## 7. Current state → desired process: gap table

| # | Desired | Current state | Gap |
|---|---|---|---|
| 1 | Match message to `Intents` | Strict substring + lenient keyword match; first row wins | No `priority` tie-break, no `verification_question` read |
| 2 | Ask `verification_question` before answering | Not read by agent harness; legacy = prompt-only | **Missing** |
| 3a | "Yes" + `type=FAQ/General` → return `answer` verbatim | Non-booking type returns `answer` verbatim | ✅ aligned (no verification first) |
| 3b | "Yes" + `type=Booking` → start harness | Booking type runs harness | ✅ aligned |
| 3c | "No" → clarify or capture lead | No confirm step in harness; unmatched → persona fallback | **Missing** |
| 4 | Ask missing slots with exact `ai_question` | Guided-flow uses exact `ai_question` (recent fix) | ✅ aligned, but skips `confirm`/`retry`/`completed` steps |
| 5 | No hallucination — answer from sheet or escalate | Deterministic search, no free-text fallback; `handover` tool exists | Partially aligned — no structured lead capture |

---

## 8. Proposed flow diagram

```
USER MESSAGE
    │
    ▼
[1] INTENT MATCH (keywords → Intents row)
    │
    ├─ no match ─────────────────────────────► [5] schedule lookup?
    │                                              ├─ match → list (narrowed)
    │                                              └─ no match → CAPTURE LEAD / handover
    │
    ▼
[2] VERIFICATION
    state.awaiting_verification = true
    ask Intents.verification_question   (or Step_2 confirm)
    │
    ├─ "Yes" ──► [3] branch on Intents.type
    │               ├─ FAQ / General ──► return Intents.answer VERBATIM ─► reset state
    │               └─ Booking ────────► [4] AGENT HARNESS (Workflow_Steps)
    │
    └─ "No" ───► clarify / CAPTURE LEAD (name, phone, email, question)
                   └─ record unansweredQuestions KPI

[4] AGENT HARNESS (per turn)
    for each missing required slot, in step order:
      ask Workflow_Steps.ai_question (verbatim)
      validate expected_input / options / validation
    include the confirm / retry / completed steps (today skipped)
    lookup steps (doctor_name) fill slots deterministically
    completion → Intents.answer confirmation
```

---

## 9. Verification-state storage proposal

Extend `SheetState` (`sheetStateMachine.ts:37-43`, reused by the harness) with a
small verification phase:

```ts
export interface SheetState {
  intentId: string | null;
  stepId: string | null;
  slots: Record<string, any>;
  lastSearch?: string;
  // NEW
  pendingIntentId?: string | null;   // intent matched but not yet confirmed
  awaitingVerification?: boolean;    // we asked the verification question
}
```

Turn logic:

1. No `intentId` and no `pendingIntentId` → match intent.
   - If the intent has a non-empty `verification_question` → set
     `pendingIntentId`, `awaitingVerification = true`, ask it verbatim.
   - Else (no verification question) → proceed directly (backward compatible).
2. `awaitingVerification === true`:
   - "Yes" → promote `pendingIntentId → intentId`, clear the flag, branch on
     `type` (FAQ answer / Booking harness).
   - "No" → clear `pendingIntentId`, capture lead / ask clarifying question.
3. Booking harness also honors the owner's `confirm` step by **removing `confirm`
   from `FLOW_CONTROL_SLOTS`** (or, better, deriving verification from the sheet
   rather than a hardcoded list).

`awaitingVerification` must live in persisted context so it survives a page
refresh / WhatsApp delay — `SheetState` already persists under
`context.ai[nodeId].sheet`, so adding the fields there is sufficient.

---

## 10. Recommendation order

1. **Wiring `verification_question` + `pendingIntentId`/`awaitingVerification`**
   into the agent harness (and un-skipping the owner's `confirm` step) — this is
   the core of the requested process and currently missing.
2. **Fix the duplicate-name dump** — dedupe by entity (group branches) and/or
   force a location ask before listing a category-only search.
3. **Lead capture** — `capture_lead` tool + `leads` table.
4. **KPI `unansweredQuestions`** — add `userMessage`/`unanswered` to `aiTrace`,
   count + top-N raw messages in `computeKpis`.
