# SAAS Audit — AI Studio & AI Agent Node Architecture

> **Status:** Investigation only. Zero code changed. This document is the master
> audit of the fragmented AI configuration surface and the engine gaps that must
> be closed before the system can be a SaaS platform where the **UI is the sole
> source of truth** and the **backend is a generic engine**.

---

## Executive Summary

Today the AI configuration surface is split across two disjoint layers:

| Layer | What it owns | Problem |
|---|---|---|
| **AI Agent Node Config** (`WorkflowNodeConfig.tsx`) | Per-node prompts, tools, provider, model, Google Sheets tabs/columns, engine toggle | System Prompt here clashes with AI Studio Instructions; hardcoded tab names omit `Doctors_Schedule`; no fallback intent; no lead-capture toggle at node level |
| **AI Studio** (`ai-studio.tsx` + 7 tabs) | Workflow-level Instructions, Persona, Knowledge (sheets), Scenarios, Live Chat, KPIs, Traces | Instructions and Node Config System Prompt are redundant; Scenarios tab does not yet model fallback intent or verification questions; capture_lead toggle was retrofitted onto the Instructions tab instead of Scenarios |

The backend reads both layers and merges them in `aiAgentExecutor.ts`, producing
unpredictable precedence (node System Prompt wins over studio Instructions, or
vice versa depending on code path). The fix is to make AI Studio the **single
source of truth** and reduce the Node Config to pure connection/plumbing
settings.

---

## Part 1 — The UI Gap

### 1.1 WorkflowNodeConfig.tsx — AI Agent Node Configuration

Per-node configuration elements currently available (grouped by section):

| Section | Fields / Controls | Stored as |
|---|---|---|
| Provider | DeepSeek / Groq / Mock selector | `config.provider` |
| Model | Free text input | `config.model` |
| System Prompt | Large textarea (default: `AI_DEFAULT_SYSTEM_PROMPT`) | `config.systemPrompt` |
| Temperature | Slider 0–2 | `config.temperature` |
| Max Tokens | Number input 1–8192 | `config.maxTokens` |
| History Messages | Number input 1–50 | `config.historyLimit` |
| Response Variable | Text input | `config.responseVariable` |
| Force Tool Choice | Select: Auto / send_buttons / handover | `config.forceToolChoice` |
| AI Buttons | Add/remove up to 3 buttons (title, id) | `config.buttons` |
| AI List Rows | Add/remove up to 10 rows (title, description, id) | `config.listRows` |
| Handover Departments | Add/remove departments (title, id) | `config.handoverDepartments` |
| Schedule | Start hour, end hour, days of week checkboxes, timezone | `config.aiSchedule` |
| Usage Limits | Daily cap, monthly cap | `config.usageLimits` |
| Max AI Calls Per User Per Day | Number input | `config.maxAiCallsPerDay` |
| Google Sheets | Connect/Remove, Spreadsheet ID, Tab names (comma-separated), Column mapping per tab, Detect Headers button | `config.googleSheets` ({spreadsheetId, tabs, columns, detected}) |
| Engine | Select: Legacy / Agent | `config.engine` |
| Test Message | Text input + Test AI Reply button | (runtime only) |

**Key observation:** The AI Agent node config contains **business logic** (system prompt, rules, verification behaviour, fallback handling) that belongs at the workflow level, plus per-node operational settings (provider, model, temperature) that are legitimately node-scoped.

### 1.2 AI Studio — All 7 Tabs

| Tab | Purpose | Functional elements |
|---|---|---|
| **Traces** | View AI execution history per workflow | Refresh button, trace list, trace detail panel (AiTracePanel) |
| **Instructions** | System prompt + lead capture toggle | Instructions textarea, Save button, **Capture Leads** Switch |
| **Persona** | AI identity (alias, title, description) | 3 input fields, Save button |
| **Knowledge** | Google Sheets connection & header detection | Spreadsheet ID display, Sync headers button, per-tab column mapping, Detect Headers per tab |
| **Scenarios** | Flow / step configuration | `ScenariosTab` (sheet-backed Workflow_Steps visual builder) |
| **Live Chat** | Real-time chat testing | `LiveChatTab` |
| **KPIs** | AI metrics dashboard | Time window selector, stat cards (Conversations, Containment, Fallback, Turns, **Unanswered**), Step Funnel, Slot Distribution, Drop-off, Top Rejected Inputs, Top Unanswered Questions, Time Series |

### 1.3 Redundancies (same concept in two places)

| Concept | Node Config | AI Studio | Problem |
|---|---|---|---|
| System Prompt / Instructions | `systemPrompt` textarea | `Instructions` tab (workflow-scoped `instructions` setting) | Two places to write the same thing; unclear which wins at runtime |
| Lead Capture | Not in node config | **Capture Leads** Switch on Instructions tab | Retrofitted onto the wrong tab; should be in Scenarios or a dedicated Workflow Settings |
| Google Sheets tabs | Node config `googleSheets.tabs` | Knowledge tab shows connected sheet | Same config surfaced in two places (node config + Knowledge tab) |
| Persona | Not in node config | Persona tab | Persona is workflow-level only; node config has no equivalent (consistent, good) |

### 1.4 Missing UI (hardcoded backend logic the UI should control)

| What is hardcoded | Where | Why the UI should control it |
|---|---|---|
| **Fallback Intent** — catch-all response when no keyword intent matches | `agentHarness.ts` lines 1347–1348: no intent → conversational fallback with generic message | Owner should define a named "Fallback Intent" with its own answer and optional slots |
| **Verification Question** — only read from `Intents` sheet; ignored if empty | `agentHarness.ts` line 1490: asks `verification_question` only when non-empty | No UI to set a default verification question for all FAQs; no UI to skip verification per-intent type |
| **Lead Capture toggle** | Was retrofitted onto Instructions tab (not Scenarios) | Should be a first-class workflow setting, ideally in Scenarios or Workflow Settings |
| **Dynamic Tab selection** | `ai-sheets-tabs` input is comma-separated free text; `Doctors_Schedule` is not in `AI_SHEET_TAB_SCHEMA` | Should be a multi-select checkbox of detected tabs, with `Doctors_Schedule` as a first-class option |
| **Keyword→Intent matching threshold** | Hardcoded `commonPrefixLen ≥ 4` in `matchesIntentKeywords` | Owner should be able to tune matching strictness per workflow |
| **Two-pass category matching** | `strictCellMatch` requires exact equality after qualifier stripping; "Gastro" ≠ "Gastroenterologist" | Owner should be able to enable prefix/stem matching per schedule column |

### 1.5 Cleanup Plan

| Action | Detail |
|---|---|
| **Remove from Node Config** | `systemPrompt` (move to AI Studio Instructions), `forceToolChoice` (move to Scenarios / tool rules), `aiSchedule` / `usageLimits` / `maxAiCallsPerDay` (move to workflow settings), `engine` (move to workflow settings) |
| **Keep in Node Config** | `provider`, `model`, `temperature`, `maxTokens`, `historyLimit`, `responseVariable`, `buttons`/`listRows` (tool declarations), `handoverDepartments` (tool declarations), `googleSheets` (spreadsheetId + tab selection + column mapping) |
| **Move to AI Studio** | System Prompt → Instructions (single source), Fallback Intent → Scenarios tab, Verification Question defaults → Scenarios tab, capture_lead → Scenarios or dedicated Workflow Settings tab |
| **New UI elements needed** | Fallback Intent editor (catch-all answer + slots), Verification Question defaults, Multi-select tab checkbox (with `Doctors_Schedule` visible), Matching strictness slider (exact vs prefix vs stem), Lead Capture toggle promotion |

---

## Part 2 — The Engine Gap (Intent & Fallback)

### 2.1 Current behaviour: no matching intent

The intent resolution path in `runAgentHarness` (`agentHarness.ts`, turn 1):

1. **Strict match:** `readRows(intentsTab, { column: keywordsHeader, value: userMessage })` — this is a **case-insensitive substring** match on the `keywords` cell. Single token: `includes()`. Multi-word: any-word ≥3 chars, ranked by match count.
2. **Lenient fallback:** If strict returns 0 rows, `matchesIntentKeywords()` re-reads **all** intents and matches whole-word tokens, ±s plurals ("dentist" ↔ "dental"), and shared prefix ≥4 chars.
3. **No intent matched → conversational:** Returns `{ conversational: true }` with `unanswered: true`. The executor falls through to the normal LLM path with persona + instructions. The owner's sheet is never consulted for an answer.

**Example failure:** User says "Gastro". The `keywords` cell might contain `"gastroenterologist, stomach"`. Strict substring: "gastro" is not a substring of "gastroenterologist" as a standalone keyword? Actually `"gastro"` IS a substring of `"gastroenterologist"`, so it might match. But if keywords are `"GI, digestive, stomach"`, "Gastro" matches nothing. The user gets a generic conversational reply, not the FAQ answer they expected.

### 2.2 Proposed "Fallback Intent" architecture

**Concept:** A workflow-level catch-all intent that fires when no specific intent keyword matches.

**UI design (in AI Studio → Scenarios):**
- A toggle "Enable Fallback Intent" per workflow.
- Fallback answer field (verbatim text, like the Intents `answer` column).
- Optional fallback slots (e.g. if the fallback intent is "general inquiry", slots could be `topic`, `contact_preference`).
- Optional handover department for fallbacks the AI cannot answer.

**Engine behaviour:**
1. Run specific intent matching (strict + lenient).
2. If **no intent matched** AND fallback intent is enabled:
   - Set `state.fallbackIntentId` = the fallback intent row id.
   - Return the fallback answer **verbatim** (no LLM rephrase).
   - If fallback slots are declared, enter a mini-checklist to collect them.
3. If **no intent matched** AND fallback intent is disabled → current conversational behaviour (persona + instructions).

**Extracted slots on fallback:** If the owner declares slots on the fallback intent (e.g. `{topic}`), the LLM extracts them into `state.slots` before rendering the fallback answer, so the owner can see what topics customers are asking about (feeds the Unanswered KPI).

---

## Part 3 — The Matching Gap

### 3.1 Current matching: "Gastro" fails against "Gastroenterologist"

Two matchers exist:

**A. Intent keyword matching** (`matchesIntentKeywords`, `agentHarness.ts:163`):
- Tokenizes both keywords and message (≥3 chars).
- Exact token match, ±s plurals, or **shared prefix ≥4 chars**.
- "gastro" (6 chars) vs "gastroenterologist": common prefix = "gastro" (6 chars) ≥ 4 → **would match**.
- BUT only if "gastroenterologist" appears in the `keywords` cell. If the owner wrote `"GI, stomach, digestive"`, "Gastro" matches nothing.

**B. Category lookup matching** (`strictCellMatch`, `agentHarness.ts:580`):
- Case-insensitive, punctuation/whitespace-normalized **equality**.
- Generic qualifiers stripped ("specialist", "consultant", "dr", …).
- **No prefix/stem/substring fuzz.**
- "Gastro" vs "Gastroenterologist": `normalizeStrict` → "gastro" vs "gastroenterologist". Not equal. `stripQualifiers` → "gastro" vs "gastroenterologist" (no qualifiers to strip). Still not equal → **no match**.

**Root cause:** `strictCellMatch` is deliberately strict (to prevent unrelated rows leaking), but this means partial category names fail. The owner cannot configure matching strictness.

### 3.2 Proposed two-pass matching strategy (generic for any business)

**Pass 1 — Exact Match** (current `strictCellMatch`):
- Normalize both sides (lowercase, strip qualifiers, collapse whitespace).
- Exact equality only.

**Pass 2 — Prefix/Stem Match** (new, opt-in per column):
- If Pass 1 yields 0 rows, try prefix match: `cell.startsWith(wanted)` OR `wanted.startsWith(cell)` on normalized values.
- Require a **minimum prefix length** (configurable, default 4) to avoid "car" matching "cardiologist".
- Require **unique result**: if multiple rows match the prefix, do not auto-select; return ambiguous and let the owner/UI disambiguate.

**Configuration (UI-controlled, per workflow):**
- `matching.strategy`: `"exact"` (default, current) or `"prefix"` or `"stem"`.
- `matching.minPrefixLength`: number (default 4).
- Applied to: intent keyword matching AND schedule category/location lookups.

**Why prefix not substring:** Substring ("car" in "cardiologist") creates false positives. Prefix ("gastro" in "gastroenterologist") is predictable and explainable to the owner.

---

## Part 2 — SaaS Architecture Plan

### 2.1 The Node Config (connection settings only)

After refactor, `WorkflowNodeConfig.tsx` for `action.ai_agent` contains **only**:

| Setting | Rationale |
|---|---|
| Provider / Model | Node-level provider choice (different nodes can use different models) |
| Temperature / Max Tokens / History Limit | Per-node inference tuning |
| Response Variable | Node-level variable naming |
| Buttons / List Rows | Tool declarations (what the node *can* offer) |
| Handover Departments | Tool declarations (escalation targets) |
| Google Sheets | Spreadsheet ID, **dynamic tab checkboxes** (Intents, Workflow_Steps, Doctors_Schedule, …), column mapping overrides |
| Test Message | Runtime test affordance |

**Removed:** `systemPrompt`, `engine`, `aiSchedule`, `usageLimits`, `maxAiCallsPerDay`, `forceToolChoice`.

### 2.2 The AI Studio Instructions (single source of truth for system prompt)

The `Instructions` tab becomes the **only** place to write the system prompt. The node config `systemPrompt` field is removed; the backend merges studio Instructions + persona + language rules + tool rules automatically. No per-node override.

### 2.3 The AI Studio Scenarios (single source of truth for flow)

The Scenarios tab becomes the visual owner of:
- **Intents** (keywords → type → start_step → verification_question → answer → priority)
- **Workflow_Steps** (step_id → step_type → ai_question → slot_name → options → lookup_source → lookup_filter → lookup_extract → alternate_step → next_step_logic → fallback)
- **Fallback Intent** (catch-all: enabled toggle, answer, optional slots)
- **Verification defaults** (require verification for FAQs? skip for Booking? default verification question text)
- **Lead Capture** (toggle + destination)
- **Matching strategy** (exact / prefix / stem + min prefix length)

### 2.4 Recommended Flow Diagram (text-based)

```
USER MESSAGE
    │
    ▼
[1] INTENT MATCH (keywords → Intents row, two-pass: strict then lenient)
    │
    ├─ no match ───────────────────────────────────────────────────────────┐
    │   ├─ Fallback Intent enabled?                                        │
    │   │   ├─ Yes → Return fallback answer VERBATIM                       │
    │   │   │       Collect fallback slots if declared                     │
    │   │   │       Log as unanswered (KPI)                                │
    │   │   └─ No  → Conversational LLM reply (persona + instructions)     │
    │   │           Log as unanswered (KPI)                                │
    │   └─ End                                                             │
    │                                                                      │
    ├─ matched intent ───────────────────────────────────────────────────┐
    │   ├─ Has verification_question? (and not Booking with confirm step) │
    │   │   ├─ Yes → Ask verification question verbatim                    │
    │   │   │       Await "Yes"/"No"                                       │
    │   │   │       "Yes" → proceed to type branch below                   │
    │   │   │       "No" → clear intent, re-open conversation              │
    │   │   └─ No  → proceed to type branch below                          │
    │   │                                                                  │
    │   ├─ type = FAQ / General / Greeting (non-Booking) ───────────────┐
    │   │   → Return Intents.answer VERBATIM (no LLM rephrase)            │
    │   │   → Reset state                                                 │
    │   │                                                                 │
    │   └─ type = Booking ────────────────────────────────────────────┐
    │       → AGENT HARNESS (Workflow_Steps checklist)                  │
    │         • Deterministic pre-fill from options (list/buttons)      │
    │         • Deterministic confirm (Yes/No) handling                 │
    │         • Ask missing slots with exact ai_question                │
    │         • Context switch: mid-flow FAQ answered verbatim, resume  │
    │         • Completion → capture lead if capture_lead enabled       │
    │                                                                   │
    ▼                                                                   ▼
```

---

## Part 5 — Implementation Order

| Order | Component | Depends On |
|---|---|---|
| 1 | Remove `systemPrompt` from Node Config; backend merges studio Instructions | None (code refactor) |
| 2 | Add Fallback Intent to Scenarios tab + `fallbackIntentId` to SheetState | None |
| 3 | Two-pass matching strategy (exact → prefix/stem) with UI toggle | None |
| 4 | Move `capture_lead` toggle from Instructions tab to Scenarios / Workflow Settings | None |
| 5 | Dynamic tab checkboxes (include `Doctors_Schedule`) replacing comma-separated text | None |
| 6 | Remove `engine`, `aiSchedule`, `usageLimits`, `maxAiCallsPerDay`, `forceToolChoice` from Node Config; move to workflow settings | Steps 1–4 |
| 7 | Fallback Intent engine wiring (verbatim answer + optional slots) | Step 2 |
| 8 | Verification defaults UI (skip for Booking, default question text) | Step 4 |

---

## Part 6 — Risks & Open Questions

1. **Precedence during migration:** While both `systemPrompt` (node config) and `instructions` (AI Studio) exist, which wins? Recommendation: node config `systemPrompt` is ignored if studio `instructions` is non-empty; otherwise fall back to node config for backward compatibility. Deprecate node config `systemPrompt` in a later release.

2. **Fallback Intent slot extraction:** If fallback slots are declared, who extracts them — code (deterministic from options) or LLM? Recommendation: deterministic pre-fill from options for list/buttons slots; LLM for text slots. Consistent with the booking flow.

3. **Two-pass matching uniqueness:** If prefix match returns multiple rows, the engine must not auto-pick. Return ambiguous → ask owner/UI to disambiguate. This adds a turn; acceptable for correctness.

4. **`Doctors_Schedule` in tab schema:** Currently `AI_SHEET_TAB_SCHEMA` includes `Doctors_Schedule` but the node config tab UI implies only Intents + Workflow_Steps. The dynamic tab checkbox must explicitly offer `Doctors_Schedule` as a selectable tab.

5. **Existing workflows with node-level `systemPrompt`:** Need a one-time migration to copy node `systemPrompt` into studio `instructions` if the latter is empty. Otherwise those prompts are silently dropped.

6. **KPI `unanswered` definition:** Currently counts `nextHandle === 'handover' OR fallbackUsed === true`. With Fallback Intent, fallback answers should **not** count as unanswered (the owner deliberately provided an answer). Only true "no match, no fallback" turns count. The KPI logic must be updated to check a dedicated `unanswered` flag rather than inferring from `fallbackUsed`.
