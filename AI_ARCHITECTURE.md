# AI Agent Runtime Engine — Architectural Review

> Scope: the deterministic "AI Studio" Google-Sheets state machine and its
> relationship to the free-form LLM path. Written from source inspection of
> `server/workflows/`, `server/ai/`, and `shared/ai-defaults.ts` (commit `0b9fc71`).
> No code changes were made for this review.

---

## 0. Executive Summary

There are **two completely different "brains"** in the same executor, switched at
runtime:

| | **Deterministic Sheet State Machine** | **Free-form LLM (legacy) path** |
|---|---|---|
| Trigger | Sheet configured **and** `slot_name` column detected | No sheet, or no `slot_name`, or a turn the engine hands back as `conversational` |
| Who decides the next step | Code (`sheetStateMachine.ts`) | The LLM (via `lookup_sheet` tool + prompt instructions) |
| What the LLM sees | Almost nothing — only two tiny, isolated prompts (slot extraction, fallback) | The full system prompt + history + tools |
| Persona / Instructions | **NOT injected** | Injected (top of system prompt) |
| Off-topic handling | None — the message is force-fit to the current slot | The model can answer conversationally |

The recurring bugs (the AI "demanding a slot" when the user asked a question, or
misrouting intents) are direct consequences of this split: **during an active
workflow, the engine never gives the model a chance to notice that the customer
asked something else.**

---

## 1. State Machine Lifecycle (turn-by-turn)

### 1.1 Entry point (all channels converge)

WhatsApp (`routes.ts`), Web Chat (`chat-host.ts`), and Sandbox (`sandbox.ts`) all
call the same node wrapper:

```
message arrives
  → executeAiAgentWorkflowNode(node, conversationState, incomingMessage, userMetadata, options)
      → loadAiStudioConfig(workflowId)          // persona + instructions (per workflow)
      → executeAiAgentNode(config, exec)        // the pure executor
```

`executeAiAgentNode` (in `aiAgentExecutor.ts`) does, in order:

1. Normalize config; read `context.ai[nodeId].history`.
2. Reject an empty message.
3. Build tool definitions (buttons / list / handover / `lookup_sheet`).
4. Safety gates (schedule → per-user daily cap → usage limits) — all before any model call.
5. **Branch point**: if `settings.googleSheets && isSheetStateMachineEnabled(...)` →
   run `runSheetStateMachine`. Otherwise skip to the free-form LLM path (§3.3).

`isSheetStateMachineEnabled` is true only when a spreadsheet is configured **and**
the Workflow_Steps tab's detected header row contains the `slot_name` column. This
`slot_name` presence is the owner's opt-in to the deterministic engine.

### 1.2 Intent matching (turn 1 only)

The engine never uses the LLM to match an intent. On turn 1 (`state.intentId` is
empty) it calls:

```
readRows(sheet, intentsTab, { column: keywords, value: userMessage })
```

which reaches `lookupSheetRows` → `projectSheetRows`. That performs a
**case-insensitive substring match** against the `keywords` column:

- Single-word message ("hello") → rows whose `keywords` cell *contains* the word.
- Multi-word message ("dental appointment") → rows containing **any** word ≥3 chars,
  ranked by how many words match (most-specific first).

The engine takes `intents[0]` — the first matching row (sheet order, or the highest
word-count). The `priority` column exists in the schema but is **not consulted** by
the state machine. There is no semantic/LLM understanding of intent here; "ENT
doctor" matches the Booking row because "ENT" is a substring of its keywords.

Two important consequences:

- A Greeting intent (`hello, hi, good morning`) is matched purely by keyword
  substring on turn 1, which is why `type` exists: a non-Booking `type` short-circuits.
- **Intent matching runs exactly once.** After turn 1, `state.intentId` is set and
  the engine never re-matches intents (§1.6).

### 1.3 Loading `Workflow_Steps`

```
readRows(sheet, stepsTab, { column: intent_id, value: state.intentId })
```

This filters the Workflow_Steps tab down to the rows whose `intent_id` equals the
matched intent, preserving sheet row order. Steps are identified by the `step_id`
string (`Step_1`, `Step_2`, …).

### 1.4 How the "current" step is tracked

The current step is the **`state.stepId` string**, persisted in
`context.ai[nodeId].sheet.stepId`. It is **not** derived from `slot_name`.

- Turn 1: `state.stepId = intent.start_step` (if that step exists), else
  `firstStep` (lowest numeric `Step_N`).
- Turn 2+: `findStep(steps, stepIdHeader, state.stepId)` — exact `step_id` match.

**Multiple steps sharing one `slot_name`**: nothing crashes, but the behavior is
ambiguous and should be treated as a configuration smell:

- Turn-1 extraction metadata (`slotMeta`) is a `Map` keyed by slot name — the
  **first** step (row order) that declares a name wins its `type`/`options`/`validation`.
- "Is this step done" (`stepFilled`) checks that every slot *that step* declares is
  filled. Because two steps share a name, filling it marks *both* as done.
- The walk is still `stepId`-based, so the engine proceeds through both step rows.

The practical risk: a value captured for one step silently satisfies another step
that reused the same slot name.

### 1.5 Validating the user's answer (turn 2+, single slot)

For a single-slot step the sequence is:

1. `slotNames = parseSlotNames(current.slot_name)` (one name).
2. If a `validation` format gate exists, **skip the LLM** and use the raw message as
   the candidate (deterministic; the extractor must not rewrite a validated answer).
   Otherwise, if an LLM client exists, `extractSlot` asks the model to return the
   canonical value for that slot; its output (or the raw message on failure/empty)
   becomes the candidate.
3. `validateSlotValue(candidate, expectedInput, options, validationType)`:

   - `text` → non-empty after trim.
   - `number` → `Number.isFinite`.
   - `list` / `buttons` → must match an option (case-insensitive, whole-word); the
     **sheet's** spelling is returned. No usable options ⇒ accept as text.
   - `datetime` → non-empty (dayjs parsing is still a future increment).
   - On top of that, a `validation` format gate (`phone`, `email`, `number`, `date`,
     or a custom regex) must also pass.

For a **multi-slot** step (`slot_name = "name, phone, email, cpr"`), every field is
extracted (LLM) or mapped positionally from comma-separated text (no client), each
validated as `text`, and **all** must be non-empty; otherwise the whole answer is
rejected and nothing is stored.

### 1.6 Fallback decision

If validation fails, the engine re-asks and does **not** advance. Three distinct
messages, in order of specificity:

1. **Format rejection** (`validation` gate failed) → fixed deterministic wording:
   `"That doesn't look like a valid phone number. Could you please provide your phone number again?"`
   (`formatRejectionText`). No LLM.
2. **Multi-slot incomplete** → `missingSlotsText`: the step's `fallback` cell if set,
   else `"I need your name, phone, email, and CPR to complete the booking. Could you please provide them?"`.
   No LLM.
3. **Otherwise** (invalid list option, extraction transport failure) →
   `generateConversationalFallback` (an LLM call) if a real provider exists; else the
   static `fallback` column, else the step's `ai_question` again.

Note the priority: the static `fallback` column is only a last resort for cases 3.
The format/multi-slot rejections are hard-coded deterministic strings.

### 1.7 The lookup step (silent)

A `step_type: lookup` step asks nothing. It:

1. Reads `lookup_source` (e.g. `Doctors_Schedule`).
2. Substitutes `{slot}` placeholders in `lookup_filter` (`department={department} AND branch={location}`).
3. Matches rows with `looseCellMatch` (whole-word → word-prefix → shared-root/stem),
   then `rankLookupHits` (rows marked off/vacation/unavailable sort last).
4. If a `datetime` slot is present, filters to rows whose `Available_Times` cover the
   requested time; if none cover it, returns the "Dr. X is available from … choose a
   different time?" message and winds back to the datetime step.
5. On match, stores the matched row's `lookup_extract` column (e.g. `Doctor`) into
   `state.slots[slot_name]` (falling back to the extract column's normalized name),
   then follows `next_step_logic`; on no-match it follows `alternate_step`.

### 1.8 Completion

When `next_step_logic` resolves to `done`, `complete()` reads the intent's `answer`
column, substitutes captured slots, and returns it (or a generic "Done…" string). The
state is reset to a fresh state, so a later message starts intent matching again.

---

## 2. Prompt Construction (what the LLM actually sees)

There is no single prompt. The deterministic engine makes the LLM see **almost
nothing**, and only in two narrow, isolated calls:

### 2.1 Turn-1 slot extraction

`buildSlotExtractionPrompt(fields, userMessage)` — a tiny standalone prompt:

```
Extract the following fields from the customer message. Output STRICT JSON only…
Fields:
- department
- location (one of: Muharraq, Riffa, Adliya)
- …
Customer message: "…"
Return only a JSON object: {"slots": {"<field>": "<value>"}}
```

- No persona, no instructions, no history, no system prompt.
- `maxTokens` 300, temperature 0, 1 retry.
- Output is shape-validated (`validateSlotExtraction`) then value-validated by
  `validateSlotValue`; the model never decides validity.

### 2.2 Conversational re-ask fallback

`generateConversationalFallback` builds its own standalone prompt:

```
You are a helpful AI assistant collecting the "<slotName>" from the customer.
The question you asked was: "…"
The valid options are: …
The customer replied: "…"
…
```

- Again: **no persona, no instructions, no global context**.
- Returns `''` for the mock provider, so tests fall back to the static `fallback`.

### 2.3 The step questions themselves are NOT LLM output

During a workflow, the text the customer sees is the `ai_question` cell, with
`{slot}` placeholders substituted by `substituteSlots`. The model never composes or
rephrases it. This is why a workflow can "demand a slot" with no awareness of what
the customer actually said.

### 2.4 The free-form path's system prompt

Only the free-form / conversational path calls `buildSystemPrompt`. Its structure
(joined by blank lines, in order):

1. **Identity** — from the global AI Studio persona (`You are {alias}, a {title}. About the business: {description}.`), else `You are the customer support assistant for {businessName}.`
2. **Channel line** — WhatsApp vs web-chat tone/length guidance.
3. **BUSINESS INSTRUCTIONS** — the AI Studio `instructions` (workflow-scoped) if set, else the node's own `systemPrompt`, else a default. `{{variables}}` are template-resolved.
4. **CORE_DIRECTIVES** (only if sheet-backed) — the dual-mode instructions (§3).
5. **AI_TOOL_RULES** (only if the node declares buttons/list).
6. **Sheet rules** (only if sheet-backed) — `buildSheetRules`: tab names, column names, and the `lookup_sheet` usage instructions.
7. **LANGUAGE_RULES** — always last (language mirroring, brevity, no-invention, etc.).

`buildChatContext` then assembles: `[system] + trimmed history (≤12 msgs / 8 KB) + [latest user message]`.

### 2.5 Does the LLM see the entire Workflow_Steps sheet?

- **Deterministic engine:** no LLM reads the sheet at all. Code reads it and feeds
  only the current step's `ai_question` (and the two isolated prompts above).
- **Free-form path:** the model sees the sheet *schema/instructions* and fetches rows
  itself via the `lookup_sheet` tool; returned rows are trimmed to an allowlist of
  columns (`trimLookupRows`). It sees only the rows it explicitly fetches. On the
  very first turn of a sheet-backed node, `forceLookupFirstRound` forces the first
  tool call to be `lookup_sheet` so the model reads the sheet before answering.

---

## 3. The Dual-Mode Brain (Workflow vs. Conversational)

### 3.1 How the mode is chosen

The switch happens inside `runSheetStateMachine`, only on **turn 1**:

- If **no intent matches** (and no flow is active) → the engine returns
  `{ conversational: true, text: '' }`.
- `executeAiAgentNode` sees that and sets `conversationalMode = true`, then falls
  through to the free-form LLM path, which answers from persona + instructions
  (with `buildSheetRules({ conversationalMode: true })` appending an explicit
  "NO WORKFLOW INTENT MATCHED … reply conversationally NOW" instruction).

A Greeting intent (`type: Greeting`) is handled even earlier: the intent `type` gate
returns the `answer` column directly (no state machine, no LLM). Only `Booking`
(or empty `type`) runs the step sequence.

### 3.2 "hello" mid-flow does NOT break the flow

Because `state.intentId` is already set, turn 2+ **never re-runs intent matching**.
"hello" mid-flow is treated as the answer to the *current* step:

- If the current step is `buttons`/`list` and "hello" isn't an option → validation
  fails → re-ask (fallback).
- If the current step is `text` (e.g. `datetime`) → "hello" is **accepted and stored**
  as that slot's value. This is a real defect: a greeting can corrupt a text slot.

There is no mid-flow escape to conversational mode in the deterministic engine.

### 3.3 How Persona and Instructions reach Workflow mode

They **don't**. `loadAiStudioConfig` runs for every host and the persona/instructions
are passed into `executeAiAgentNode`, but the deterministic `runSheetStateMachine`
branch returns before `buildSystemPrompt` is ever called (except in the two isolated
LLM prompts, which also omit them). Persona/Instructions therefore only influence the
free-form/conversational path (turn-1 greeting, turn-1 no-intent, and — for non-sheet
or legacy nodes — every turn).

> To let the AI handle interruptions gracefully inside a workflow, the persona and
> instructions would need to be injected into an *interruption-detection* step — a
> capability that does not currently exist (see §5).

---

## 4. Data Flow

### 4.1 `Intents` + `Workflow_Steps` + `Doctors_Schedule`

```
Intents (row)              Workflow_Steps (rows, intent_id = that id)
  id ────────────────────────► intent_id
  keywords ──(substring)──►   matched on turn 1
  start_step ─────────────►   entry step_id
  type ── (Greeting ⇒ answer immediately; Booking ⇒ run steps)
  answer ◄── {slot} substituted ── step ai_question / fallback / lookup result

Doctors_Schedule (lookup_source of a `lookup` step)
  Department / Branch ◄── lookup_filter clauses
  Doctor (lookup_extract) ──► state.slots[slot_name]
  Available_Times ──► time-availability check against the `datetime` slot
```

### 4.2 How a lookup result reaches the next question

1. A `lookup` step stores the matched row's `lookup_extract` column under the step's
   `slot_name` (here `doctor_name`), falling back to the extract column's normalized
   name (`Doctor` → `doctor_name`) when `slot_name` is blank.
2. The following step's `ai_question` contains `{doctor_name}`.
3. `substituteSlots` replaces it by resolving the key: exact → case-insensitive →
   normalized (`Doctor Name` ≡ `doctor_name`).

So `"We have {doctor_name} has availability…"` becomes `"We have DR SURESH … has availability…"`.

### 4.3 Persistence

State lives in `context.ai[nodeId].sheet = { intentId, stepId, slots }`, written back
through the host's `persist` into the `conversation_states` row. History is
`context.ai[nodeId].history`, trimmed to 12 messages / 8 KB on every write.

---

## 5. Limitations (context switching & off-topic)

These are the structural gaps behind the recent edge cases.

1. **No mid-flow interruption detection.** Once `intentId` is set, the engine only
   validates the current slot. An off-topic question ("What is the time?") is either
   rejected (list/buttons) or silently stored (text). The LLM is never consulted to
   notice the pivot.

2. **`text` slots accept anything non-empty.** The most dangerous case: a customer
   question, a "yes", or a greeting lands in a `text` slot and is stored as the value,
   corrupting the flow. (Mitigations exist only where the owner added `validation` or
   split the slot — but they are opt-in per step.)

3. **Persona / Instructions are invisible during a workflow.** Step text is literal
   sheet text; the persona/instructions only apply on the conversational (non-workflow)
   path. The "AI ignoring the user to demand a slot" symptom is largely this: there is
   no in-character model involved in the step loop at all.

4. **`generateConversationalFallback` is context-free.** It re-asks from a bare prompt
   with no persona/instructions/history, so even the *rejection* is out of character.

5. **Intent matching is naive substring.** No negation handling, no priority column
   use, no LLM disambiguation. "doctor" and "gastro doctor" can both hit the Booking
   row; a message that overlaps two intents picks the first row.

6. **Turn-1 extraction is a single, blind JSON call.** It sees only field names and the
   raw message — no persona, no sheet rows — so specialty expansion ("gastro" →
   "Gastroenterology") depends entirely on the model's own knowledge (later papered
   over by fuzzy `looseCellMatch`, but the slot value is still model-produced).

7. **Duplicate `slot_name` across steps is not guarded.** A shared name makes
   turn-1 metadata and "step done" checks ambiguous.

8. **No re-intent / re-entry guard.** If the sheet is edited under a running flow
   (a step vanishes), the engine completes gracefully rather than recovering — there is
   no re-sync of `state.stepId` against the sheet.

---

## Appendix A — Single-message journey (text diagram)

```
                        ┌────────────────────────────────────────────┐
 message ──────────────►│ executeAiAgentWorkflowNode                 │
                        │   loadAiStudioConfig(workflowId)           │
                        └──────────────────────┬─────────────────────┘
                                               ▼
                        ┌────────────────────────────────────────────┐
                        │ executeAiAgentNode                          │
                        │  normalize · history · tools · safety gates │
                        └──────────────────────┬─────────────────────┘
                                               ▼
                         sheet + slot_name detected?
                         ┌───────────┴───────────┐
                        yes                      no
                         ▼                        ▼
        ┌───────────────────────────────┐   (free-form LLM path)
        │ runSheetStateMachine          │   buildSystemPrompt (persona+
        │                               │     instructions+sheet rules)
        │  turn 1? ──► match intent     │   buildChatContext
        │     │ (keywords substring)    │   tool loop ≤4 rounds
        │     ▼                         │   └─ lookup_sheet / buttons /
        │  turn 2+: current step        │       list / handover / text
        │     │                         │
        │     ├─ lookup step ──► read Doctors_Schedule, time check
        │     ├─ ask step ──► substitute {slots} → ai_question
        │     ├─ validate slot (LLM extract + validateSlotValue)
        │     ├─ invalid ──► format / missing / conversational fallback
        │     └─ advance via next_step_logic ──► done ──► intent.answer
        └───────────────────────────────┘
                         │
              conversational:true (turn-1 no intent)?
                         └───────► fall through to free-form path
                                      (persona + instructions answer)
```

## Appendix B — Key files

| File | Role |
|---|---|
| `server/workflows/aiAgentExecutor.ts` | Pure executor + node wrapper; the branch between the state machine and the free-form path |
| `server/workflows/sheetStateMachine.ts` | The deterministic engine (intent → steps → validation → lookup → complete) |
| `server/workflows/slotValidation.ts` | `validateSlotValue`, `parseValidation`, whole-word/option helpers |
| `server/workflows/timeRange.ts` | `Available_Times` + requested-time parsing |
| `server/workflows/googleSheetsExecutor.ts` | `lookupSheetRows` / `projectSheetRows` (substring + ranked keyword match), read/write |
| `server/ai/prompt.ts` | `buildSystemPrompt`, `buildSheetRules`, `CORE_DIRECTIVES`, `buildSlotExtractionPrompt`, `llmJson` |
| `server/ai/contextBuilder.ts` | `buildChatContext`, `trimHistory` (12 msgs / 8 KB) |
| `server/ai/studioConfig.ts` | `loadAiStudioConfig` (workflow-scoped persona + instructions) |
| `shared/ai-defaults.ts` | `AI_DEFAULT_SYSTEM_PROMPT`, `AI_SHEET_TAB_SCHEMA`, `AI_TOOL_RULES`, persona/instructions keys |
