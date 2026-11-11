# Booking Flow Failure — Investigation Report

**Date:** 2026-11-11
**Reported failure:** `blood test` → `Yes` → `Yes` → `Riffa` → `5 PM today` → *"I could not find anything matching that."*
**Workflow:** 37 ("AI test"), node `action.ai_agent_1793717615091`, engine `agent`, provider `groq`, model `qwen/qwen3.8-27b`
**Sheet:** `1JIOdIfcvpgB51sSBAWC6YogbHZHp3QRl1NDRbrPvc0Q` (tabs `Intents`, `Workflow_Steps`, `Doctors_Schedule`)
**Production trace of the failing turn:** `workflow_executions.id = 9948` (channel `sandbox`, `executed_at 2026-11-11 09:30:11.775917`)

> This is a read-only investigation. No product code was changed, no fix was implemented, no fix is proposed for the
> booking failure itself. The only recommendation in this document is the UI one that was explicitly requested in
> task 4, and it is marked as *not implemented*.

---

## Executive summary

The slot extraction worked perfectly. The model returned `action: "ask"` with `updated_slots: { "datetime": "5 PM today" }` —
exactly the right answer. The reply was then hijacked by the **deterministic availability guard** in the harness:

| Step | What happened |
|---|---|
| 1 | Model returns `action: "ask"`, `updated_slots.datetime = "5 PM today"`, `search: {}` |
| 2 | `looksLikeAvailabilityQuery("5 PM today")` → **true** (the regex matches the word *today*) |
| 3 | Guard builds a schedule search **from the slots**: `{category: "blood test", location: "Riffa", day: "wednesday"}` |
| 4 | `Doctors_Schedule` is read (175 rows) and filtered in memory → **0 rows match** |
| 5 | `executeSearch` returns `"I could not find anything matching that."` with `unanswered: true` |
| 6 | The turn returns **before** time validation, **before** the doctor lookup, **before** the finalize/next-step block |

Two independent facts collide:

* The word *"today"* in a customer's time answer is indistinguishable, to the guard's regex, from a request for
  availability. A customer **supplying** a time is treated as a customer **asking** for availability.
* The search's `category` is the `department` slot, whose value is `"blood test"` — a free-text service that
  **does not exist** in the `Doctors_Schedule.Department` column (which holds doctor specialties:
  `CONSULTANT GASTROENTEROLOGIST`, `SPECIALIST INTERNAL MEDICINE`, `CARDIOLOGIST`, … — 68 distinct values, none of
  them "blood test"). The AND-filter therefore can never match, and the turn dies with the generic
  "not found" message instead of continuing to the next step.

The booking was never lost — `datetime: "5 PM today"` was in fact stored in the slot state — but the customer was
told nothing could be found and the flow never advanced to Step_6.

---

## 1. `Workflow_Steps` for Intent 1 (Booking)

Source of truth: the live Google Sheet, read via `lookup_sheet` (the same read the harness performs).
The `Intents` tab holds three rows: `1 | Booking | keywords "dental, dentist, book" | priority High`,
`2 | FAQ | hours, open, timing`, `3 | Greeting | hello, hi, salam`.

`Workflow_Steps` contains **9 rows**; 8 of them carry `intent_id = "1"`, one (`Step_9`) has an empty `intent_id`.

| step_id | step_type | slot_name | expected_input | options | ai_question | fallback | other |
|---|---|---|---|---|---|---|---|
| Step_1 | ask | `department` | list | Dental, ENT, Internal Medicine | Which department are you looking for today? | Sorry, please pick a department. | `→ Step_2` |
| Step_2 | ask | `confirm` | buttons | Yes, No | Sure, Would you like to confirm the availability of the {department} doctor for your appointment? | Please reply Yes or No. | `→ Step_3` |
| Step_3 | ask | `location` | list | Muharraq, Riffa, Adliya, Hamad Town | And which location is the closest to you? | Sorry, please pick a location. | `→ Step_4` |
| Step_4 | ask | `datetime` | text | (empty) | Sure, and could you confirm the preferred date and time for the appointment so we can check for you the availability of doctors? | What date and time? | `→ Step_5` |
| Step_5 | **lookup** | `doctor_name` | text | (empty) | (silent) | (empty) | `lookup_source = Doctors_Schedule`, `lookup_filter = department={department} AND branch={location}`, `lookup_extract = Doctor`, `alternate_step = Step_7`, `→ Step_6` |
| Step_6 | ask | `name, phone, email, cpr` | text | (empty) | We have {doctor_name} has availability. To confirm booking, can you provide your name, active phone number and email along with CPR number | Please provide your name, phone, email, and CPR. | `message_type = "What time?"`, `→ Step_8` |
| Step_7 | ask | `retry` | buttons | Yes, No | Sorry, we don't have a {department} doctor at {location}. Would you like to try another location? | `→ Step_3` | `alternate_step = Step_7` |
| Step_8 | ask | `completed` | text | (empty) | Thank you for your details. it's done also our booking team will call you to confirm your appointment. kindly attend our confirmation call | (empty) | `→ done` |
| Step_9 | ask | `anything_else` | text | (empty) | Is there anything else I can help you with? | (empty) | `intent_id` empty, `→ done` |

### Derived checklist (what the harness actually asked for)

`deriveChecklist()` over the 8 rows returned by the intent read produces:

* **required**: `department`, `confirm`, `location`, `datetime`, `name`, `phone`, `email`, `cpr`
  (Step_6's `slot_name` is the comma-joined string `name, phone, email, cpr` and is split into four slots;
  `retry`, `completed`, `anything_else` are dropped as flow-control artifacts.)
* **derived**: `doctor_name` (filled by the Step_5 lookup)

### Schedule column mapping derived from Step_5

`deriveScheduleMap()` returns:

```json
{
  "source": "Doctors_Schedule",
  "doctorColumn": "Doctor",
  "departmentColumn": "department",
  "branchColumn": "branch",
  "dayOffColumn": "Day-Off",
  "timeStartColumn": "Start_Time",
  "timeEndColumn": "End_Time",
  "feesColumn": "Consultation Fees"
}
```

`departmentColumn`/`branchColumn` are taken **literally from the `lookup_filter` string** (`department=…`, `branch=…`),
not from the sheet's actual headers (`Department`, `Branch`). `readCell()` resolves them case-insensitively, so the
column lookup still works — but the mapping is accidental, not declared.

### `lookup_sheet` filter semantics (relevant to `rows: 8`)

`projectSheetRows()` (`server/workflows/googleSheetsExecutor.ts:618-653`) applies the filter as a
**case-insensitive substring match**, not equality. `filter_column=intent_id`, `filter_value="1"` therefore matched
every row whose `intent_id` contains the character `1` — here that is exactly the 8 rows of Intent 1 (the 9th row has
an empty `intent_id` and was excluded). No cross-intent contamination in this sheet, but the filter is not exact.

---

## 2. The exact `HarnessDecision` for "5 PM today"

Reproduced on the VPS against the **real** sheet, the **real** persona/instructions (`ai_studio_instructions_wf_37`,
`ai_studio_persona_wf_37` = *MediAssist*), the **real** Groq client (`qwen/qwen3.8-27b`), temperature `0`,
`maxTokens 400`, `maxRetries 1` — with the exact slot state from the failing production turn:

```json
{
  "intentId": "1",
  "slots": { "department": "blood test", "confirm": "Yes", "location": "Riffa" }
}
```

**Raw model output (verbatim):**

> Transparency note: the production row stores the *derived* trace, not the raw model text, so the JSON below comes from
> the reproduction. It is faithful because every derived artifact of the reproduction is identical to production —
> same token counts (1890/74), same final text, same `unanswered` flag, same slot state, same two `toolCalls` with the
> same row counts, same `sheetState`.

```json
{
  "updated_slots": {
    "datetime": "5 PM today"
  },
  "action": "ask",
  "next_question": "We have {doctor_name} has availability. To confirm booking, can you provide your name, active phone number and email along with CPR number",
  "search": {}
}
```

**Normalised `HarnessDecision`** (after `validateHarnessDecision`, `server/workflows/agentHarness.ts:818-864`):

```json
{
  "updated_slots": { "datetime": "5 PM today" },
  "action": "ask",
  "next_question": "We have {doctor_name} has availability. To confirm booking, can you provide your name, active phone number and email along with CPR number",
  "search": {}
}
```

`search` is `{}` → `hasStructuredSearch({})` is **false**, so the *model-driven* search branch was **not** taken.

**Call metrics — identical to the production trace** (which is what confirms the reproduction is faithful):

| | production (`executions.id = 9948`) | reproduction |
|---|---|---|
| tokensIn | 1890 | 1890 |
| tokensOut | 74 | 74 |
| elapsedMs | 1937 | — |
| attempts | 0 | 1 |
| finishReason | stop | stop |
| final text | `I could not find anything matching that.` | `I could not find anything matching that.` |
| unanswered | true | true |

The model did the right thing. `datetime` was extracted, `action` was `ask`, and the `next_question` it produced is the
owner's Step_6 wording (with the unresolved `{doctor_name}` placeholder, which `noBarePlaceholders()` would have
stripped had the turn reached the finalize block).

---

## 3. The exact `toolCalls` (with row counts)

From the production trace `workflow_executions.id = 9948` (`trigger_data.aiTrace.toolCalls`), reproduced byte-identically:

```json
[
  {
    "name": "lookup_sheet",
    "args": {
      "tab": "Workflow_Steps",
      "filter_column": "intent_id",
      "filter_value": "1"
    },
    "rows": 8
  },
  {
    "name": "lookup_sheet",
    "args": {
      "tab": "Doctors_Schedule",
      "filter": "search {\"category\":\"blood test\",\"location\":\"Riffa\",\"day\":\"wednesday\"}"
    },
    "rows": 0
  }
]
```

Notes:

* **Only two lookups happened.** There is no lookup of the `Doctors_Schedule` rows by `department`/`branch` from the
  sheet's own Step_5 `lookup_filter` (`department={department} AND branch={location}`), because the turn returned
  before the Step_5 lookup block.
* The second entry's `args.filter` is **not a sheet filter**. It is the harness's own label for a *structured search*
  (`agentHarness.ts:2443-2447`). The underlying read is `readRows(sheet, 'Doctors_Schedule')` — the **whole tab,
  unfiltered** — and the AND-filtering is then done **in memory** by `filterRowsStructured()`.
* `rows: 0` is therefore the number of rows that survived the in-memory filter, not the number of rows read.
* `day: "wednesday"` is a **resolved weekday** (2026-11-11 is a Wednesday). `resolveDay()` is only called by
  `searchFromSlots()`, so this also proves the search was built by the *deterministic guard*, not by the model
  (the model's `search` object was empty, and a model-supplied day would have been the literal `"today"`).

---

## 4. The `Doctors_Schedule` rows matching the filter

**0 of 175 rows match.** The tab contains 175 rows, 32 of them at `Riffa`.

Filter used:

```json
{ "category": "blood test", "location": "Riffa", "day": "wednesday" }
```

Evaluation per row (`filterRowsStructured`, `agentHarness.ts:1114-1148`):

* Pass 1 (exact, `strictCellMatch`): `normalizeStrict('Department')` vs `normalizeStrict('blood test')` — never equal,
  and after `stripQualifiers()` (which only removes *specialist / consultant / senior / junior / general / doctor /
  dr / prof / professor*) it is still not equal. **0 exact matches.**
* Pass 2 (prefix/stem, `prefixCellMatch`): `'blood test'` is not a prefix/stem of any Department value. **0 matches.**
* Day filter: every row in the tab has `Day-Off = FRIDAY` (the only value present), so the `wednesday` constraint
  blocks nothing.

Sample of the 32 `Riffa` rows (all rejected by the category constraint):

| Doctor | Branch | Department | Day-Off | Start_Time | End_Time | Fees | matched |
|---|---|---|---|---|---|---|---|
| Dr Kurian Jacob | Riffa | Specialist Internal Medicine | FRIDAY | 13:30 | 21:30 | 5 BD | false |
| Dr Amalghosh Uthaman | Riffa | Specialist Internal Medicine | FRIDAY | 17:00 | 21:00 | 5 BD | false |
| Dr RaviRaj | Riffa | Specialist ENT Surgeon | FRIDAY | (empty) | (empty) | 5 BD | false |
| Dr Biji Rose John Rose | Riffa | Specialist ENT Surgeon | FRIDAY | 13:30 | 21:30 | 5 BD | false |
| Dr Vigil Thavasimuthu Devaraj | Riffa | Specialist General Surgeon | FRIDAY | 16:30 | 21:00 | 5 BD | false |
| Dr Sawan Gangadharan | Riffa | Specialist Radiologist | FRIDAY | 17:00 | 21:00 | 5 BD | false |

**The word "blood test" appears in zero cells of the entire sheet** (substring scan over all 175 rows: 0 hits).
The 68 distinct `Department` values are doctor specialties, e.g. `CONSULTANT GASTROENTEROLOGIST`, `CONSULTANT ENT`,
`CONSULTANT INTERNAL MEDICINE`, `CARDIOLOGIST`, `DENTAL SURGEON`, `ENDODONTIST`, `GENERAL DENTIST`,
`INTERNAL MEDICINE`, `ORTHODONTIST`, `UROLOGIST`, `SPECIALIST ENT`, …

### This is not only a "blood test" problem — the sheet's own department options also fail

Same filter, same matcher, using the values the sheet itself declares in `Step_1.options`:

| category | location | rows matched |
|---|---|---|
| `blood test` | Riffa | **0** |
| `blood test` | Adliya | **0** |
| `Dental` | Riffa | **0** |
| `Dental` | Adliya | 1 (`DR. SUJITH` — DENTAL SURGEON) |
| `ENT` | Riffa | **0** |
| `ENT` | Adliya | **0** |
| `Internal Medicine` | Riffa | 2 |
| `Internal Medicine` | Adliya | 3 |
| `Consultant Internal Medicine` | Riffa | 2 |

Why `Dental`/`ENT` fail where `Internal Medicine` succeeds:

* `Internal Medicine` matches **exactly** after `stripQualifiers()` removes `SPECIALIST`/`CONSULTANT`
  (`Specialist Internal Medicine` → `internal medicine` → equal).
* `Dental` does not equal `DENTAL SURGEON` / `GENERAL DENTIST` / `PEDIATRIC DENTIST` / `SPECIALIST DENTIST` /
  `CONSERVATIVE DENTISTRY`; the prefix pass *does* match several rows, but `filterRowsStructured` only returns prefix
  matches **when exactly one row matches** (`agentHarness.ts:1145`) — with 2 hits at Adliya's single dental row it
  passes, at Riffa it does not.
* `ENT` never matches: `CONSULTANT ENT`/`SPECIALIST ENT` exist, but not at Riffa or Adliya.

---

## 5. The exact code path that produced *"I could not find anything matching that."*

The message is emitted in **seven** places in the server. The failing turn used **one** of them — the zero-rows branch
of the structured search.

### The path, in order

| # | File:line | Code |
|---|---|---|
| 1 | `server/workflows/agentHarness.ts:2494` | `round = await askModel(client, buildHarnessPrompt(...))` → model returns `action:"ask"`, `updated_slots.datetime = "5 PM today"` |
| 2 | `server/workflows/agentHarness.ts:2514` | `mergeSlots(state.slots, decision.updated_slots, checklist)` → `datetime` is stored |
| 3 | `server/workflows/agentHarness.ts:2553-2564` | model-search branch — **skipped**, because `decision.search` is `{}` (`hasStructuredSearch({}) === false`) |
| 4 | **`server/workflows/agentHarness.ts:2570`** | `if (decision.action !== 'complete' && scheduleMap && looksLikeAvailabilityQuery(userMessage))` → **true** |
| 4a | `server/workflows/agentHarness.ts:1227-1231` | `looksLikeAvailabilityQuery('5 PM today')` → regex `/\b(availab\w*\|open\|free\|schedule\|timing\|times?\|tomorrow\|today\|tonight\|weekend\|do you have\|is there\|are there\|any)\b/i` → matches **"today"** (and "times?") |
| 5 | `server/workflows/agentHarness.ts:2571` | `const derivedSearch = searchFromSlots(state.slots, userMessage)` |
| 5a | `server/workflows/agentHarness.ts:1205-1224` | `searchFromSlots` → `category = slots.department = "blood test"`, `location = slots.location = "Riffa"`, `day = resolveDay('5 PM today') = "wednesday"` |
| 6 | `server/workflows/agentHarness.ts:2572-2574` | `hasStructuredSearch(derivedSearch)` → **true** → `return executeSearch(derivedSearch)` |
| 7 | `server/workflows/agentHarness.ts:2440` | `effectiveSearch = mergeSearchWithSlots(search, state.slots)` — unchanged (the search already has a `category`, so it is not a "narrowing" search) |
| 8 | `server/workflows/agentHarness.ts:2441` | `allRows = await readRows(sheet, 'Doctors_Schedule')` → **175 rows** (whole tab, unfiltered) |
| 9 | `server/workflows/agentHarness.ts:2442` | `rows = filterRowsStructured(allRows, effectiveSearch, scheduleMap)` → **0 rows** (see §4) |
| 10 | `server/workflows/agentHarness.ts:2443-2447` | `toolCalls.push({ name: 'lookup_sheet', args: { tab: 'Doctors_Schedule', filter: 'search {...}' }, rows: 0 })` |
| 11 | **`server/workflows/agentHarness.ts:2450-2459`** | `if (rows.length === 0) { return { text: 'I could not find anything matching that.', …, unanswered: true }; }` ← **the message** |
| 12 | `server/workflows/aiAgentExecutor.ts:1017-1027` | the executor sends `turn.text` as the reply and records the trace (`nextHandle: 'success'`) |

### What was skipped because of the early return

Everything after step 11 in the same turn never ran:

* `agentHarness.ts:2577-2589` — auto doctor lookup and the model-requested `lookup_schedule` (Step_5).
* `agentHarness.ts:2609-2664` — **generic time validation.** This matters: `parseRequestedTime('5 PM today')` returns
  **`1020` (= 17:00)**, a perfectly valid time, and no row has a Wednesday day-off, so the time would have passed
  validation and the booking would have continued.
* `agentHarness.ts:2672-2684` — the `complete` finalisation.
* `agentHarness.ts:2686-2702` — the next-missing-slot question (Step_6: *"We have {doctor_name} has availability. To
  confirm booking, can you provide your name, active phone number and email along with CPR number"*).

### The other six emitters of the same string (not involved in this failure)

* `agentHarness.ts:1180` — `summarizeRows()` when the filtered result is empty.
* `agentHarness.ts:2083` — a sheet row's `answer` cell was empty.
* `agentHarness.ts:2231` / `2238` — empty model reply / no structured search.
* `agentHarness.ts:2429` — `executeSearch` called but there is no `scheduleMap`.
* `agentHarness.ts:2489` — final text composition fallback.

### A second, independent inconsistency in the same turn

The `department` slot was set to `"blood test"` — a value that is **not** in the sheet's own `Step_1.options`
(`Dental, ENT, Internal Medicine`). The value was written by the Step-3 slot mapping (`mapSlotsToChecklist`), which
maps `service → department` without checking the declared options. So the slot carried a value the sheet never
offered and the schedule can never match, while the customer was never asked to pick from the offered list.

---

## 6. UI bug — the "View raw JSON" panel

### Root cause: a CSS/layout clipping bug, **not** string truncation

**The data is complete.** `GET /api/workflows/:id/ai-traces` (`server/routes.ts:7783-7827`) returns the whole
`trigger_data.aiTrace` object; `JSON.stringify(ai, null, 2)` in the panel is complete. Nothing is cut server-side or
in the string itself.

**The panel** — `client/src/components/ai-trace-panel.tsx:313-321`:

```tsx
<details className="group">
  <summary className="cursor-pointer select-none text-sm text-muted-foreground hover:text-foreground">
    View raw JSON
  </summary>
  <ScrollArea className="mt-2 max-h-[400px] rounded-md border">
    <pre className="p-4 text-xs">{JSON.stringify(ai, null, 2)}</pre>
  </ScrollArea>
</details>
```

**The component** — `client/src/components/ui/scroll-area.tsx`:

```tsx
<ScrollAreaPrimitive.Root className={cn("relative overflow-hidden", className)}>      {/* → relative overflow-hidden + max-h-[400px] */}
  <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">        {/* → height:100% */}
    {children}
  </ScrollAreaPrimitive.Viewport>
  <ScrollBar />
  <ScrollAreaPrimitive.Corner />
</ScrollAreaPrimitive.Root>
```

**Why it breaks:**

1. The `Root` is `max-h-[400px]` with `overflow: hidden`. Its own height is `auto` (content-driven).
2. The `Viewport` is `height: 100%`. A percentage height against an auto-height parent resolves to `auto`, so the
   viewport is exactly as tall as its content (the `<pre>`), **not** 400px.
3. Radix enables its scrollbar only when the measured content is taller than the viewport
   (`@radix-ui/react-scroll-area/dist/index.js`: `scrollbarYEnabled = contentHeight > viewportHeight`). Because the
   viewport is as tall as the content, `contentHeight === viewportHeight` → the scrollbar is **disabled** and the
   viewport gets `overflow-y: hidden`.
4. The `Root` then clips the overflowing viewport at 400px with `overflow: hidden` — and because the viewport is not a
   scroll container, **there is no way to reach the rest**.

**Measured** (faithful reconstruction of the exact rendered DOM, with the real failing-turn payload — 58 JSON lines):

```
JSON string length (chars): 1389
JSON lines: 58
content div offsetHeight (Radix measures this): 883
viewport clientHeight: 883
Radix scrollbarYEnabled (contentHeight > viewportHeight): false
viewport scrollHeight: 883
viewport scrollTop after attempting to scroll to bottom: 0
root clientHeight (visually clipped by overflow:hidden + max-h-400px): 400
root scrollHeight: 883
root overflow style: hidden
TOTAL LINES: 58
```

→ The panel shows the first ~400px (≈20 of 58 lines); the remaining ≈38 lines are **clipped and unreachable**
(`scrollTop` stays `0` after an attempted scroll to the bottom). Measured this way, the **top** of the JSON is what
remains visible; if you are seeing the *tail* of the JSON, that is the surrounding dialog that has scrolled — either
way the mechanism is the same: the content is clipped and not scrollable.

**Contrast — the other raw-JSON block in the same file works.** The Reasoning card's "Raw model output"
(`ai-trace-panel.tsx:222-231`) uses a plain element with `max-h-60 overflow-auto` — a native scroll container — so it
scrolls normally. Only the bottom "View raw JSON" panel goes through the broken `ScrollArea`.

### Fix direction (identified, **not implemented** — no code was written)

* Make the raw-JSON panel a real scroll container. Either give the `ScrollArea` a **definite** height
  (`h-[400px]` instead of `max-h-[400px]`) so the `h-full` viewport resolves to 400px and Radix enables its
  scrollbar, or drop the `ScrollArea` wrapper and use a native scroll container
  (`<pre className="… max-h-[400px] overflow-auto …">`), which is what the Reasoning card already does and is
  guaranteed to work.
* Add a **"Copy to Clipboard"** button next to the "View raw JSON" summary that copies
  `JSON.stringify(ai, null, 2)` via `navigator.clipboard.writeText(...)`, so the full payload is usable even while
  the panel is visually clipped.

---

## Appendix — how this was verified

| Evidence | Source |
|---|---|
| Failing turn, production | `workflow_executions.id = 9948` → `trigger_data.aiTrace` (full JSON in §2/§3) |
| Surrounding turns of the same session | `workflow_executions.id = 9942, 9945, 9946, 9947, 9948` (`blood test` → `Yes` → `Yes` → `Riffa` → `5 PM today`) |
| Sheet contents | live Google Sheet read via `lookupSheetRows` (read-only) |
| HarnessDecision | live Groq call (`qwen/qwen3.8-27b`) against the real sheet, persona and slot state — token counts identical to production |
| Filter behaviour | `filterRowsStructured` executed against the 175 real rows for 10 category/location combinations (§4) |
| UI clipping | DOM reconstruction of the exact Radix ScrollArea markup + inline styles, measured in Chromium (§6) |

No product code was modified; all read-only artefacts were removed from the VPS after use.
