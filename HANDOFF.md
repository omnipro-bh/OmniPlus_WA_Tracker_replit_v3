# HANDOFF — OmniPlus WA Tracker v3

## ✅ Security — Supabase DB password rotation (DONE 2026-10-06)

- **Rotated 2026-10-06.** The `DATABASE_URL` (including password) was exposed in the 2026-10-06 session's tool output during a `psql` parsing error.
- Rotated in Supabase dashboard → `DATABASE_URL` updated in VPS `/opt/omniplus/.env` (16:35) → `pm2 restart omniplus --update-env` (↺ 30) → app reconnected + re-seeded successfully.
- Deleted 7 stale `.env` backups (`.env.bak.*` + `.env.before-rotate-2026-10-06`); old password now invalid + removed from disk.
- Flushed ~4.7 GB of PM2 logs.

## Current state

- Production HEAD (deployed/running on VPS): `a77db76` (Phase 4A-1.5 — single scrollable palette + full-width builder).
- Repo HEAD: this docs-only HANDOFF commit.
- **Working tree: Phase 4A-2a code is UNCOMMITTED** — `M server/routes.ts` (+226 / −573) and `?? server/workflows/flowRunner.ts` (new, 654 lines). See "Phase 4A-2a — implemented, awaiting deploy + verification" below. **`flowRunner.ts` is untracked: it exists only in this working tree.**
- Deploy target: `wt.omniplus-bh.com`
- Schema: `bookings` has `end_day_start_time` + `end_day_end_time` (nullable `varchar(5)`); `users` has `custom_fields_limit` (nullable integer); `booking_share_links` (14 cols, unique `(user_id, slot)` index); `booking_custom_fields` has `calc_formula` (nullable `text`) — db:push applied 2026-10-09. **4A-1 and 4A-1.5 add no schema change and require no db:push.**
- **Phase 4A-1: committed `3fa2e67`, deployed, verified in-session (10/10 tests passed).**
- **Phase 4A-1.5: committed `a77db76`, deployed, browser-verified — 7/7 checks passed. COMPLETE.**
- Last session (Phase 4A-1.5 browser verification) ended at ~15% context usage.

## Phase 4A-2a — implemented, awaiting deploy + verification

**Status:** code written and reviewed in-session; **all 10 parity invariants confirmed and all 6 deliberate divergences approved**. **NOT committed, NOT pushed, NOT deployed** — working tree only.

**Files in the working tree (not in git):**

| Status | File | Size |
|---|---|---|
| M | `server/routes.ts` | +226 / −573 (13,438 → 13,091 lines) |
| ?? | `server/workflows/flowRunner.ts` | new, 654 lines |

**Backups / reference**

- Original file: `%TEMP%\opencode\4a2a-backup\routes.ts.orig`
- Patch (`routes.ts`, `-U1`): `%TEMP%\opencode\4a2a.patch`

These temp paths may not survive a machine/session — **the working-tree files are the ground truth**. Note that `flowRunner.ts` is untracked, so `git diff` will not show it; only `git status` proves it still exists. If it is missing, it was never committed and must be rebuilt from the 4A-2a review record.

**Build / check:** clean. `npm run check` reports only the 9 known pre-existing errors (0 in `routes.ts` / `flowRunner.ts`); `npm run build` succeeds and the client asset hashes are unchanged (no client change). No schema change → **no `db:push`**.

**What changed**

- **`server/workflows/flowRunner.ts` (new).** `runFlow`, `resolveButtonTarget`, `INTERACTIVE_NODE_TYPES`, `FLOW_STEP_LIMITS` (`live: 100`, `textResume: 25`, `sandbox: 25`), and the types `FlowHost`, `TraceEntry`, `PersistMode`, `SentMessage`, `HttpRunResult`, `BookingNodeResult`, `RunOptions`, `RunResult`. Pure module: no Express, drizzle or Whapi imports; every side effect is injected through `FlowHost`.
- **`server/routes.ts`.** The 195-line, 4-tier inline button→edge fallback chain is now `resolveButtonTarget(definition, buttonId)` (console.log noise removed). The `while (currentNode)` loop is replaced by `runFlow` + a closure-local `liveHost` (`errorPolicy: 'throw'`, `maxSteps: FLOW_STEP_LIMITS.live`). `resumeFlowAfterTextInput` is now a thin wrapper over `runFlow` (`errorPolicy: 'stop'`, `maxSteps: FLOW_STEP_LIMITS.textResume`), keeping its 25-transition bound and never-throw contract.
- **Booking branch** (~310 lines) moved **verbatim** into a closure-local `handleBookingNode(currentNode, currentNodeId, ctx)` that stays inline in `routes.ts`; the runner delegates to it. Only 12 control-flow lines changed — `break` → `return null`, `continue` → `return { nextNodeId, context: ctx }` — verified by line-by-line extraction and comparison (13 removed / 11 added; the two advancing booking paths keep their `currentNode/currentNodeId` assignments verbatim).
- **`afterNodeSent` hook** carries the `isCaptureStart` capture-sequence context so the post-loop capture reset and the `captured_data` writes are untouched (the persist still happens exactly once per node, inside the host).
- **`recordTrace`** mirrors only `condition` / `setVariable` into `execution_log`; message and HTTP entries are pushed by the host methods themselves, so the execution-log shapes stay byte-identical.

**Parity checklist (design §3.1) — all 10 confirmed**

1. Interactive node sends, stays on the node, awaits input.
2. `message.*` follows the single edge; no edge ⇒ done.
3. `input.text` sends the prompt, stops on it, awaits input.
4. HTTP persists the cursor **on the HTTP node** and routes `success` / `error`.
5. `condition` persists nothing.
6. `setVariable` persists context only.
7. Booking without a host handler ⇒ stopped / `unsupported_node` (log entry preserved).
8. Missing node id ⇒ stop.
9. Live errors still escape unchanged (`ERROR` row + HTTP 500).
10. `options.definition` is never mutated.

**Deliberate divergences (all approved)**

1. Live step cap **100** (previously unbounded).
2. `booking.check_bookings` no-channel fall-through now stops instead of re-entering the loop with an unchanged cursor (this was a genuine infinite loop).
3. Message-node edge resolution uses `getNextNodeBySingleEdge` (was `outgoingEdges[0]`); identical for correctly wired nodes.
4. The message-node cursor update also writes `context` (value-identical) so capture-start and the sandbox share one persist path.
5. `[Button Reply Debug]` logs removed from routing + message send (they logged full node config and raw Whapi response bodies).
6. Booking "next node not found" now reports on the next iteration (`stopReason: 'node_not_found'`) instead of a silent `break`.

### Next session — start here

1. `npm run check` + `npm run build` (expect the 9 pre-existing errors only).
2. Commit 4A-2a (`server/workflows/flowRunner.ts` + `server/routes.ts`), push.
3. Deploy per the manual workflow in `AGENTS.md` (backup → pull → `npm ci` → build → `pm2 restart`) — **no `db:push`**.
4. Run the 12-point browser regression checklist below against production.
5. **Do not start 4A-2b (sandbox endpoint) until all 12 points are green.** If a test fails: diagnose + fix before anything else.

**Context budget note:** 4A-2a itself was implemented + reviewed in one session and this is the most critical code path in the app (the WhatsApp button handler), so deploy + verification were deliberately deferred to a fresh session at ~0% budget.

### 12-point live regression checklist (design §8.1)

1. Button click → correct target; interactive node sends and stops.
2. Button click → `message.text` chain of 3 → sends all 3, ends.
3. HTTP success (2xx) follows `success`; non-2xx / timeout follows `error`.
4. `condition` true and false branches; `is_empty` with whitespace / `0` / missing.
5. `setVariable` literal + `{{template}}`; next condition / HTTP template consumes it.
6. `input.text`: prompt → valid reply captured → flow continues to next message.
7. `input.text`: too short → same `invalidMessage`, no advance, retry works.
8. `booking.book_appointment` end-to-end: department list → staff → slot → name → booking created → `booked` handle.
9. `booking.check_bookings` (my_bookings and reschedule paths) → `booked` / `no_slots` handles.
10. Capture sequence: `isCaptureStart` node sets context, subsequent clicks recorded, Save writes `captured_data` + post-loop reset.
11. Subscriber keyword branch, inactive-workflow logging, "button belongs to different workflow" guard — all unchanged.
12. Cycle graph now stops at 100 with a logged `step_limit` instead of hanging.

### Notes for 4A-2b (already prepared by 4A-2a)

- `FLOW_STEP_LIMITS.sandbox` (25) and `INTERACTIVE_NODE_TYPES` are already exported.
- Sandbox start-node resolution: `entryNodeId` → first node with no incoming edge → `nodes[0]`. **"Start from this node" is a v1.1 follow-up.**
- Sandbox host must omit `handleBookingNode` (booking nodes then stop with `unsupported_node` — the panel footnote must say "Booking nodes are not executed in the sandbox") and must never persist.
- `FlowHost.sendMessage` returns `{ ok, payload }` where `payload` is the Whapi-shaped response — 4A-2b can capture each bubble type (text/body, `buttons[]`, `rows[]`, `cards[]`) straight from it.

## Next phase — 4A-2 (live demo / test panel)

**Status:** design **approved** — all 10 open questions answered and both refinements accepted (sandbox payload carries type-discriminating fields; every preview bubble carries a "Preview" indicator). **4A-2a (runner extraction) is implemented in the working tree** — see "Phase 4A-2a — implemented, awaiting deploy + verification" above. 4A-2b and 4A-2c are blocked until 4A-2a is deployed and its 12-point regression is green.

**Goal.** A live demo / test panel inside the workflow builder: a Typebot-style preview pane on the right that runs the flow against synthetic input and shows the resulting conversation, the variable values, and an execution trace.

**Core problem.** The flow runner is **duplicated** — one loop lives inside the `button_reply` branch of `server/routes.ts`, the other inside `resumeFlowAfterTextInput`. Both must be extracted into a **single shared runner** before the sandbox can behave correctly; otherwise the sandbox would become a third divergent copy.

**Design decisions (approved 2026-10-23 — all 10 open questions answered)**

1. **Endpoint, not a flag** — `POST /api/workflows/:id/sandbox-tick` behind `requireAuth` + `getEffectiveUserId`. The webhook path gains no sandbox flag.
2. **Stateless tick** — the client sends draft + cursor + context on every tick; no server-side session map.
3. **HTTP in sandbox** — default mock, per-session live toggle; "live" is still bound by https-only + admin allowlist + no-redirect. Every HTTP trace entry is tagged `[mocked]` or `[live]`.
4. **Live step cap 100** — approved; the previous unbounded loop was a latent infinite-loop hazard.
5. **Panel** — conditional 4th `ResizablePanel` (`defaultSize 22 / min 18 / max 34`), canvas `minSize 25`, right `Sheet` fallback below `lg`, sizes key `-v2`, toggle `data-testid="button-toggle-test-panel"`.
6. **Booking nodes** — stop + `unsupported_node`; panel footnote "Booking nodes are not executed in the sandbox."
7. **Start node** — `entryNodeId` → first node with no incoming edge → `nodes[0]`; no dropdown in v1 ("Start from this node" = v1.1).
8. **Trace click selects the node** — in scope.
9. **`resolveButtonTarget` extracted** — sandbox routing must be identical to production (done in 4A-2a).
10. **Ship order** — 2a alone (verified) → 2b alone (curl-verified) → 2c. Never two at once.

**Approach (approved):**

- **Option A** — a `sandbox` mode flag that can be set per-request on the existing webhook handler, or
- **Option B** — a new endpoint (e.g. `POST /api/workflows/:id/sandbox-tick`) that drives the flow in-memory: no `conversation_states` persistence, no real Whapi sends, outbound payloads captured as JSON in the response.
- **Frontend** — a right-side panel in `WorkflowBuilder` rendering a chat UI + variables inspector + execution trace. Reuse the existing component primitives; no new tabs.

**Key design questions (all answered — see the decision list above):**

1. Which approach — sandbox flag on the existing handler, or a separate sandbox endpoint? (Trade-offs: auth surface, blast radius, how much engine code each touches.)
2. How is sandbox state held — an in-memory map keyed by sandbox session id? Lifetime, eviction, and concurrency rules?
3. How does it interact with the Save state — does the sandbox run the **in-memory draft** graph or the persisted `definitionJson`?
4. What happens on node-edit modal open / unsaved changes mid-session — restart the sandbox, hot-swap the graph, or block?
5. Variables inspector UX — layout, live updates, reserved keys, redaction of captured PII.
6. Panel geometry — how does the existing 20/60/20 `ResizablePanel` split absorb the preview pane without regressing the 4A-1.5 layout/scroll behaviour?

**Estimated effort:** ~25% context across 2–3 sub-phases — (a) extract the shared runner, (b) build the sandbox execution path, (c) build the preview UI + wire it up. No schema change expected.

## Recent commits

- docs: HANDOFF — Phase 4A-2a implemented in working tree (uncommitted); next: deploy + 12-point regression **← this commit (HEAD)**
- `2895ea8` docs: HANDOFF — 4A-1.5 browser-verified (7/7); next: Phase 4A-2 design
- docs: HANDOFF — 4A-1 + 4A-1.5 closed out; next: 4A-1.5 browser verification
- `a77db76` feat(workflow): Phase 4A-1.5 — single scrollable palette + full-width builder
- `3fa2e67` feat(workflow): Phase 4A-1 — HTTP handle fix + input.text, condition, setVariable nodes
- `2a427af` docs: HANDOFF — Phase 4A-1 implemented in working tree (uncommitted); next: review
- `e6350f1` docs: log 4A pre-design session (correct project root, no code)
- `7a96a21` docs: Phase 4A diagnostic findings + sub-phase split (4A-1/4A-2/4A-3)
- `99a0a87` docs: update HANDOFF.md (3G-7 complete; next: Phase 4A)
- `ed97b8a` feat(booking): multi-field formula for calculation custom fields (3G-7)
- `8e2291c` docs: update HANDOFF.md (Feature 3 complete; next: 3G-7)
- `629924d` feat(booking): render calc fields + add Created/Updated columns on public share page (3G-6c)
- `2018c95` fix(booking): exclude calculation fields from share-link permission list (3G-6b)
- `a40a3df` feat(booking): owner-controlled column order + sortable + mobile public page (3G-6)
- `3b7626a` feat(booking): share-link UI polish — Updated/Token since + displayOrder-driven columns (3G-5e)
- `376e413` fix(booking): preserve unmentioned custom field values on share PATCH (3G-5d)
- `9d2ded5` chore(debug): temporary diagnostic logs for share edit modal (3G-5d-diagnostic)
- `37aeecb` fix(booking): public share page — legacy fields, custom-field types, full-width table (3G-5c)
- `e4997b3` fix(booking): public share page — logout, real custom-field names, wider table, refresh (3G-5b)
- `1fe1856` feat(booking): public share page at /share/:token (Phase 3G-5)
- `e9aa29b` feat(booking): owner UI for share links in Settings (Phase 3G-4)
- `f296755` feat(booking): public share-link list + CSV + edit/cancel/confirm (Phase 3G-3)
- `b2c3fd6` feat(booking): public share-link auth + session + rate limiting (Phase 3G-2)
- `c4bc05e` feat(booking): share-link schema + owner endpoints (Phase 3G-1)
- `3f0f001` docs: mark Supabase DB password rotation done + note optional polish (2026-10-06)
- `c6fd0df` docs: update HANDOFF.md (post Feature 2 rebrand — session closure)
- `143a59a` feat(booking): rebrand Department→Service, Staff→Provider, add Service Group layer
- `057c6b0` feat(admin): per-user custom fields limit override (5-10, admin-settable)
- `50badc2` feat(booking): wire calendar actions + weekday errors + refresh + HANDOFF
- `44f8a2d` feat(booking): per-day end-time UI (Phase 3F-4-2)
- `b2ec4fe` feat(booking): per-day end-time window (Phase 3F-4-1 backend)
- `e082d63` docs: update HANDOFF.md (post Phase 3F + layout fix)
- `1bfb9a7` fix(layout): full-width for booking-scheduler pages, kill horizontal scroll
- `c4fc5e0` chore(booking): always full-width + remove diagnostic scaffolding (keep null-safety)
- `5e931cc` TEMP(diagnosis): debug boundary + null-safety fix (cbff9bc investigation)
- `cbff9bc` feat(booking): multi-day display + notification templates + full-width toggle (Phase 3F-3)
- `f82da57` feat(booking): multi-day UI + sortable columns + filter persistence (Phase 3F-2)
- `e7de4fb` feat(booking): multi-day bookings backend (Phase 3F-1)

## Completed phases

- **Phase 4A-1.5 — single scrollable palette + full-width builder** (`a77db76`, deployed 2026-10-23, **browser-verified — 7/7 checks passed**): replaced the 7-tab palette with one scrollable `NodePalette` component — section headers in an explicit `CATEGORY_ORDER` (Messages, End Messages, Triggers, Inputs, Logic, Actions, Booking), a search box filtering on label/description/id, and a "No nodes match" empty state. Added `PaletteNode` + `satisfies Record<string, PaletteNode[]>`, `PaletteCategory`, `CATEGORY_ORDER`; ACTION icon differentiated to `text-amber-500` (BOOKING stays `text-cyan-500`); both call sites (left panel + fullscreen Sheet) render the same component with independent search state; deleted ~250 lines of copy-pasted `renderNodePalette` (net −118 lines). Canvas: `fullWidth` on the `/workflows` `DashboardLayout` (removes the `max-w-7xl` cap → +384px at 1920px, no change below ~1536px); the list view was re-capped with `max-w-7xl mx-auto` so only the builder goes full-bleed. All `node-type-<id>` testids preserved; panel sizes untouched (20/60/20); no schema change; no new deps.
- **Phase 4A-1 — workflow primitives: HTTP handle fix + input.text, condition, setVariable** (`3fa2e67`, deployed + **verified in-session, 10/10 tests passed**): one-line fix to `CustomWorkflowNode.tsx:19` (`'httpRequest'` → `'action.http_request'`) so the HTTP node's success/error handles render; three new node types — `input.text` (stop-and-wait capture into `conversation_states.context`, 2000-char cap, min/max validation with re-prompt, unlimited retries), `condition` (8 operators, `true`/`false` handles, `operator || 'equals'` default), `setVariable` (literal + `{{template}}` via `resolveTemplate`, soft 64 KB context ceiling); `resumeFlowAfterTextInput` parallel runner (condition/setVariable/HTTP/message/input.text, 25-step cap, trigger-message passthrough to `executeHttpNode`); `sendNodeMessage` gained the `input.text` prompt branch; new `server/workflows/flowControl.ts` (pure helpers) and `shared/workflow-validation.ts` (client + server save validation: errors block, warnings allow); `getNestedValue` exported with a prototype-segment guard (`__proto__`/`constructor`/`prototype`, including the `name[0]` form). Full design + locked decisions in "Session 4A-1 implementation" below.
- **Phase 3G-7 — multi-field formula for calculation custom fields**: added nullable `calcFormula` TEXT to `booking_custom_fields` (no backfill; existing calc fields untouched); new `shared/calc-formula.ts` (~683 lines, no deps) with hand-rolled tokenizer + recursive-descent parser + compiler + evaluator + cycle detection (no `eval`/`new Function`); grammar `numbers`, `[Name]`/`{id}` refs, `+ - * / ( )`, functions `Round Abs Min Max Floor Ceil`; precedence `+ -` < `* /` < unary `-` < primary, left-associative; canonical storage `{id}` (rename-stable) with `[Name]` rehydrated on edit; null propagation everywhere (div-by-zero → null) matching legacy `computeCalcValue`; caps 1000 chars / 200 nodes / 50 depth; save-time DFS cycle detection + read-time memoized DAG eval (calc→calc chaining allowed; boolean/date/text/select refs rejected with "Formulas can only reference number fields"); POST/PATCH return structured `{ error, code }` (`PARSE_ERROR, UNKNOWN_FIELD, TYPE_MISMATCH, CIRCULAR_REF, SIZE_LIMIT, DEPTH_LIMIT`); `enrichBookingsForUser` pre-compiles each formula once per request and calls `resolveCalcValues`; owner UI gained Simple/Formula mode toggle, formula input + `+ Field`/`+ Function` pickers, debounced + blur validation with inline code→error mapping; 5 client call sites switched to `resolveCalcValues`; legacy 2-operand path preserved (`ed97b8a`)
- **Phase 3G-6c — calc fields render + Created/Updated columns**: reversed 3G-6b — calculation fields now render their computed values on the public page (server `enrichBookingsForUser` computes via a `computeCalcValue` mirror and inlines `{ fieldId, value: String(result) }` into `customFieldValues`, flowing to JSON list + CSV + PATCH response); added `createdAt`/`updatedAt` as standard Hidden/Read fields (ISO projectors, "Created"/"Updated" labels, date sort, `formatTimestamp` render); public PATCH rejects writes to calc fields (hoisted `calcIds` guard); client `compareBookingFields` maps `"calculation"` → `"number"`; defensive `writableControls` skip prevents legacy calc write perms rendering an input (`629924d`)
- **Phase 3G-6b — calc-field exclusion (reverted by 3G-6c)**: `visibleCustomFields = customFields.filter(fieldType !== "calculation")` removed calc fields from the Edit Share Link modal list + `emptyFieldPermissions` (misread of intent — undone in 3G-6c) (`2018c95`)
- **Phase 3G-6 — column reorder + sortable + mobile public page**: `fieldOrder: string[]` on `ShareLinkConfig` (optional, default `[]`, JSONB-only, no DB migration); owner modal → flat reorderable list (▲▼ arrows left, mirroring custom-fields-settings, reorder saved on modal Save only); `orderedVisibleFieldKeys` (server) + `orderedVisibleFields` (client) drive table/CSV/edit-modal order respecting `fieldOrder` (fallback `SHARE_FIELD_ORDER`); sortable headers (asc→desc→asc, type-aware, blank-last, client-side only); mobile card stack (`md:hidden`) + desktop table (`hidden md:block`) sharing `columns`/`sortedBookings`/`renderActions` (`a40a3df`)
- **Phase 3G-5e — Updated/Token since + displayOrder-driven custom columns**: share-link row now shows `Updated` + `Token since` (alongside Created/Accessed/Expires); `GET /bookings` + CSV endpoint build/echo `customFieldOrder` (sorted by `displayOrder ?? id`) so public-page columns, the edit modal, and the CSV all follow the owner's custom-field ordering; `orderedVisibleCustomFieldIds` (server) + updated `visibleCustomFieldIds` (client) use identical comparators (`3b7626a`)
- **Phase 3G-5d — custom-field data-wipe fix**: `setBookingCustomFieldValues` is replace-all (DELETE+INSERT), so the share PATCH (which sends only changed fields) wiped every other custom field's value. Added `mergeBookingCustomFieldValues` (read existing → upsert incoming → delete-on-empty → write back full set) used only by the share PATCH; owner-edit replace-all + chatbot untouched; reverted the 4 temporary diagnostic `console.log`s (`376e413`)
- **Phase 3G-5c — remove legacy customField1/2 + per-type custom inputs**: legacy `customField1`/`customField2` removed end-to-end (server `STANDARD_PROJECTORS`/`SHARE_FIELD_ORDER`/CSV builders/PATCH validator + owner `STANDARD_FIELDS` + client); `GET /bookings` echoes `customFieldTypes` + `customFieldOptions`; share edit modal renders per-type inputs (text/number/date/boolean/select; calculation omitted); `hasWritableField` + `visibleCustomFieldIds` exclude ghosts/stale/calculation keys; table made full-width (`max-w-7xl` dropped) (`37aeecb`)
- **Phase 3G-5b — logout + real custom-field names + wider table + refresh**: `POST /api/public/share/:token/logout` (no auth; `clearCookie` options match `res.cookie`); `GET /bookings` echoes `customFieldNames`; client "Sign out" + "Refresh" buttons; `cache: "no-store"` on the list fetch (`e4997b3`)
- **Phase 3G-5 — public page (`/share/:token`)**: `client/src/pages/public-share.tsx` (standalone page, no DashboardLayout — password gate, projected list driven by `config.fieldPermissions`, pagination, CSV download via fetch+blob+anchor, edit/cancel/confirm gated by `allowedActions`, 401→gate / 404→unavailable / 429→Retry-After countdown states); `client/src/lib/share-api.ts` (`ShareApiError` carrying `status`/`retryAfter`; fetch helpers with `credentials: "include"`); `client/src/lib/share-fields.ts` (field metadata); `client/src/components/share-edit-dialog.tsx` (writable-only edit modal); route registered in `App.tsx` (`1fe1856`)
- **Phase 3G-4 — owner UI for share links (Settings tab)**: `client/src/components/share-links-settings.tsx` (new `ShareLinksSettings` Card — list, create/edit dialog, token reveal, toggle, regenerate, delete; mirrors `custom-fields-settings.tsx` patterns; field-permission matrix grouped (Scheduling/Customer/Details/Legacy/Custom) with service/provider/status read-only; "Set all visible to Read"; token reveal modal with exact warning text, cleared on close; Delete + Regenerate via `AlertDialog`; N/2 counter); mounted after `<CustomFieldsSettings />` in the settings tab (`e9aa29b`). **Deployed at `e9aa29b`; UI confirmed rendering correctly (Share Links card visible, link rows display, create button shows N/2 counter); full 11-step interactive verification (create → reveal → copy → toggle → edit → regenerate → delete → max-2 → incognito URL test) still pending.**
- **Phase 3G-3 — public list + CSV + write actions**: `todayInBahrain()` + `visibleCustomFieldIds()` in `server/share-links.ts`; `buildCsvHeader(config, customFieldNames)` with real (csvCell-sanitized) custom-field names; `buildCsvRow` aligned to the same id order; `enrichBookingsForUser()` + `getShareBookingsForLink()` single row source (fetch 5000 → enrich → filter); 5 public endpoints behind `requireShareSession` — `GET /bookings` (paginated 50, cap 200, echoes `config` + `today`), `GET /bookings.csv` (cap 5000, BOM, `X-Truncated`/`X-Truncated-At`), `PATCH /bookings/:id` (write-perm whitelist, service/provider/status rejected, `checkBookingOverlap` with `excludeBookingId`), `POST /bookings/:id/cancel`, `POST /bookings/:id/confirm`; `resolveShareBookingInScope()` enforces ownership + link visibility on all writes; write rate limit (60/5 min) + audit logging (`third_party_edit/cancel/confirm`); projected responses; removed temporary `/ping` (`f296755`)
- **Phase 3G-2 — public auth + session + rate limiting**: derived `SHARE_SECRET` (HMAC of `SESSION_SECRET` + namespace); `signShareSession`/`verifyShareSession` (12h, payload-shape validated); `requireShareSession` middleware (fail-closed: cookie → JWT → link lookup → enabled → not-expired → `configVersion` match; 401 vs 404 split); `server/share-rate-limit.ts` (in-memory token lockout 10 fails/15 min + IP throttle 20/5 min, lazy expiry + sweep, `getClientIp` via `req.ip`); `DUMMY_PASSWORD_HASH` + `timingEqualizeCompare` (timing-equalized 404); `POST /api/public/share/:token/auth` (rate limit → lookup → timing-equalize 404 → bcrypt → 401/200 + `share_session` cookie); `GET /api/public/share/:token/ping` (temporary); `server/index.ts` path redaction (`/share/[redacted]`) (`b2c3fd6`)
- **Phase 3G-1 — share links (schema + owner endpoints)**: `booking_share_links` table (14 cols — `userId` FK cascade, `slot`, `tokenHash` SHA-256 unique, `passwordHash` bcrypt-10, `config` JSONB, `configVersion`, `isEnabled`, `expiresAt`, `lastAccessedAt`, `tokenCreatedAt`, timestamps; unique `(user_id, slot)` index for max-2 links); `server/share-links.ts` (256-bit URL-safe token shown once, `hashToken`, `serializeShareLink` strips secrets + adds masked `tokenPreview`, `assignSlot`, `projectBooking` whitelist projector, `filterBookingsByConfig`, CSV helpers with formula-injection mitigation); 6 owner endpoints behind `requireAuth` (create/list/patch/toggle/delete/regenerate) with zod validation, 404 cross-tenant, `configVersion` bump on password change (`c4bc05e`)
- **Security rotation (2026-10-06)** — Supabase DB password rotated; VPS `.env` updated (16:35) + `pm2 restart --update-env` (↺ 30); app reconnected + re-seeded; 7 stale `.env` backups deleted; ~4.7 GB PM2 logs flushed.
- Sidebar tabs → sub-navigation (`57b123f`)
- Full calendar — backend + UI + polish + full-screen + filters (`a0aea0a` → `9ad3678`)
- Custom fields foundation — max 5/tenant, types text/number/date/boolean/select (`1cbec7f`)
- Calculation field type — field-A [op] field-B computed on read (`455a26d`)
- Manual booking endpoint — `POST /api/booking/bookings/manual`, overlap + advisory lock + custom values (`6aa8c23`)
- Batch A — `checkSlotAvailability` overlap-based + `BLOCKING_BOOKING_STATUSES`; fixed 2 latent boolean bugs (`3685cc0`)
- Batch B — AGENTS.md fixed, `.gitignore`, untracked `client-dist/`/`server-dist/`, `deploy.sh` db:push removed (`f32bd69`)
- Batch C — VPS→GitHub auth migrated to SSH deploy key (VPS-only, no commit)
- Availability-endpoint fix — `/available-slots` returns windows (not slotDuration chunks), reusing `computeAvailableSlots` (`08d17a4`)
- Phase 3C — manual booking form UI: "New Booking" dialog (dept→staff→date→time cascade + dynamic custom fields + live calc) (`dc3e0da`)
- Phase 3D-1 — bookings list redesign: 8 columns + adaptive Custom Summary (custom field values + computed calc) (`20a08e2`)
- Phase 3D-2 — detail drawer (Sheet) + row click + Excel export with custom fields (`68729dc`)
- Phase 3D-3 — merged Edit+Reschedule dialog, time-slot `excludeBookingId` fix, custom-field editing, legacy-field editing, layout tightening (`5fe401c`)
- **Phase 3F-1 — multi-day backend**: `endDate` nullable varchar column; range-aware availability (`bookingDaySpanOverlaps` predicate with `COALESCE(endDate, slotDate)`), multi-day advisory locks, `checkBookingOverlap`/`checkSlotAvailability`/`getBulkBookingCounts`/`getBookingsForCalendar`/`getBookingsForUser` range-aware; manual + PUT endpoints accept `endDate` (≤31 days, per-day slot-window containment) (`e7de4fb`)
- **Phase 3F-2 — multi-day UI + list**: End Date input in Edit + New Booking dialogs; sortable headers (slotDate/customerName/status/createdAt/updatedAt) with chevrons; Created/Updated columns; sort + status-filter persisted to localStorage (`f82da57`)
- **Phase 3F-3 — multi-day display + templates**: `client/src/lib/booking-date.ts` helpers; range display in list/drawer/edit header/Excel; calendar Day+Month view multi-day rendering; `{{dateRange}}`/`{{endDate}}`/`{{endTime}}` template variables via centralized `server/booking-template.ts` `renderBookingTemplate`; full-width toggle (later removed) (`cbff9bc`)
- **Null-safety fix** — `parts()` guards null/undefined; `formatLongDate`/`formatDateRangeShort` return `—`, server `formatLongDate` returns `''` (`5e931cc`, kept in `c4fc5e0`)
- **Diagnostic scaffolding removed** — DebugBoundary + `/api/debug/client-error` reverted after the blank-page investigation concluded it was a cached-bundle/transient issue, not a code defect (`c4fc5e0`)
- **Layout fix** — `DashboardLayout` gained `fullWidth` prop; applied to the 4 booking-scheduler routes only; bookings page wrapper `py-6 space-y-6` (removed `-mx-6 lg:-mx-8` hack); stray `import { is }` removed (`1bfb9a7`)
- **Phase 3F-4-1 — per-day end-time backend**: `endDayStartTime`/`endDayEndTime` nullable `varchar(5)` columns; `occupiedWindowForDate(booking, date)` helper (last day uses its own window); `countConflicts` JS per-day conflict detection; reworked `checkSlotAvailability`/`checkBookingOverlap`/`getBulkBookingCounts`/`createManualBookingWithValues`/`computeAvailableSlots`; POST manual + PUT accept/validate the end-day fields (both-or-neither, HH:MM, ordered, requires endDate, collapse-equal-to-null; PUT clears on collapse-to-single-day) (`b2ec4fe`)
- **Phase 3F-4-2 — per-day end-time UI**: end-day "Last day time" pickers in Edit + New Booking dialogs (availability fetched for `endDate`); `END_DAY_SAME` sentinel + "Same as main window" default; collapse-equal-to-main → null on save; "Current:" header + drawer + list "Last day" line + confirm/cancel + Excel columns; calendar `DayColumn` uses `occupiedWindowForDate`; `Booking`/`CalendarBooking` types gained the two fields (`44f8a2d`)
- **Post-3F-4-2 fixes**: calendar `BookingDetailDialog` Edit/Cancel buttons wired to navigate to `/booking-scheduler/bookings?edit=<id>`/`?cancel=<id>` (deep-link handler in scheduler opens the modal); new `GET /api/booking/bookings/:id`; weekday-formatted availability errors (`formatWeekdayDate` → "…on Friday, Nov 13, 2026"); calendar Refresh button; calendar query invalidation added to all 7 booking-affecting mutations (status update, bulk delete/status/complete, edit, confirm, cancel) (`50badc2`)
- **Feature 1 — admin per-user custom-fields limit override**: `users.custom_fields_limit` (nullable integer) + shared `CUSTOM_FIELDS_DEFAULT_LIMIT=5`/`CUSTOM_FIELDS_MAX_LIMIT=10`; POST enforces `min(user.customFieldsLimit ?? 5, 10)`; admin "Custom Fields Limit" input under Per-User Overrides (1–10, rejected with 400 outside range); relaxed the active-subscription requirement for user-level overrides; client reads the effective limit via `/api/me` (through `useAuth`) (`057c6b0`)
- **Feature 2 — rebrand (Department→Service, Staff→Provider)**: all user-visible labels rebranded across UI, chatbot config field labels + defaults, notification defaults, Excel export headers, toasts, and server error messages; "Booking Service" grouping → "Service Group" (new hierarchy: Service Group → Service → Provider → Time Slots); template aliases `{{service}}`/`{{provider}}` preferred, `{{department}}`/`{{staff}}` retained as working aliases; DB columns / API paths / URL routes / TS types / data-testids / chatbot flow logic untouched (`143a59a`)

## Remaining polish (none critical)

- Custom Summary column shows "—" chips for fields without values (visual noise).

## Optional polish (later)

- Set up `pm2-logrotate` (or scheduled truncation) to prevent the ~4.7 GB log growth from recurring.

## Feature 3 — shareable booking links (COMPLETE ✅)

Password-protected public links granting field-scoped access to a subset of a user's bookings. Per-user max 2 links, enable/disable/delete.

- **3G-1** ✅ schema + owner endpoints
- **3G-2** ✅ public auth + session + rate limiting
- **3G-3** ✅ public list + CSV + edit/cancel/confirm
- **3G-4** ✅ owner UI in the Settings tab
- **3G-5** ✅ public UI page (`/share/:token`)
- **3G-5b…3G-5e** ✅ fix passes (logout/names, legacy-field removal + per-type inputs, data-wipe fix, Updated/Token since + displayOrder)
- **3G-6** ✅ column reorder + sortable columns + mobile-responsive public page
- **3G-6b / 3G-6c** ✅ calc-field fix passes (calc fields render computed values; Created/Updated columns)
- **3G-7** ✅ multi-field formula for calculation custom fields (see Completed phases)

All shipped + deployed. Feature 3 is complete. Next: **Phase 4A** (below).

## Phase 4A — Workflow Enhancement (in progress)

Working name for the phase that adds workflow primitives (Webhook/HTTP, Condition, Set Variable, Live Test Panel) plus a Web channel adapter so one flow runs on both WhatsApp and a browser widget.

### Architecture findings (from the 2026-10-23 diagnostic) — permanent reference

- **No workflow engine module exists.** The entire runtime is a ~2,400-line inline block inside `server/routes.ts` (lines 8780–11179). The execution loop is at `routes.ts:10675`, nested inside the `button_reply` branch. Text messages never reach it. Helpers are limited to `server/workflows/httpExecutor.ts` (generic HTTP client + `{{variable}}` resolution) and `server/workflows/httpNodeExecutor.ts` (`executeHttpNode` + `getNextNodeByHandle`).
- **No channel abstraction.** `sendNodeMessage` calls `whapi.*` functions directly via dynamic import (`routes.ts:11819-11844`). Whapi concerns are threaded through the whole engine: token resolution (`storage.getChannelsForUser` → `.whapiChannelToken`), WhatsApp payload shapes, `sent_messages.message_id` ownership checks, and label side-effects (`handleChatLabelAsync`).
- **State:** `conversation_states` keyed by `(workflow_id, phone)` only — no channel/user/session column. `current_node_id` is bookkeeping: routing actually resumes from the clicked button's edge (`sourceHandle`), not the stored node. All variables live in `conversation_states.context` (free-form JSONB).
- **Node types:** 13 palette entries, 3 runtime branches (`action.http_request`, `booking.*`, `message.*`/interactive). No TypeScript node interface — the graph is `any` end-to-end; `definitionJson` is JSONB with no structural validation on save (`z.record(z.any())`) and no `schemaVersion` persisted.
- **Free-text input not supported.** The `while` loop is unreachable from text messages — only booking capture + first-message-of-day text handlers exist (`routes.ts:9708/9825/9930/10013-10206`). No generic text-input node in the palette.
- **HTTP node is 80% built but broken.** `CustomWorkflowNode.tsx:19` checks `'httpRequest'`, but the palette id is `'action.http_request'`. Handles never render, so the loop breaks after execution (`routes.ts:10713-10716`). Fix is one line.
- **`action.http_request` runtime already has:** method, URL, auth (none/bearer/basic), headers, query params, templated body (`{{variable}}`), response mapping → context variables, and `success`/`error` branching (`server/workflows/httpExecutor.ts`).

### Sub-phases

- **4A-1 (DONE — `3fa2e67`, deployed, 10/10 verified):** HTTP handle fix + three new node types (`input.text`, `condition`, `setVariable`). Additive, no engine refactor. Design record in "Session 4A-1 implementation" below.
- **4A-1.5 (DONE, deployed, browser-verified 7/7 — `a77db76`):** palette consolidation (single scrollable list replacing 7 tabs) + full-width builder canvas. Pure UX; no runtime behaviour change. See "Session 4A-1.5" below.
- **4A-2 (design approved; 2a implemented, 2b/2c blocked):** Live demo / test panel. Split into three sub-phases.
  - **4A-2a (implemented, NOT committed / NOT deployed):** shared runner extraction — new `server/workflows/flowRunner.ts` (654 lines) + `server/routes.ts` rewired. See "Phase 4A-2a — implemented, awaiting deploy + verification" near the top.
  - **4A-2b (blocked):** `POST /api/workflows/:id/sandbox-tick` — stateless tick, in-memory draft graph, mock HTTP by default, no `workflow_executions` rows.
  - **4A-2c (blocked):** preview panel in the builder (conditional 4th `ResizablePanel`, `-v2` sizes key, `Sheet` fallback below `lg`).
- **4A-3 (deferred):** Web Channel Adapter. Built by synthesizing Whapi-shaped payloads from web messages — no engine refactor. Requires 4A-1 and 4A-2 to be in place.

### Constraints for 4A

- Do NOT refactor the engine into modules. Work with the inline handler by adding branches to the `while` loop.
- Do NOT touch the chatbot booking flow (`routes.ts` ~8247–8873).
- Session state uses `conversation_states.context` (free-form JSONB) for all variables.

### Follow-ups surfaced by the diagnostic (not blocking 4A-1)

- `message.text` documented "terminal" but runtime continues if an edge exists — editor/runtime disagreement.
- `firstMessageTrigger` palette node has no runtime handler (actual trigger is `workflows.entry_node_id`).
- Legacy button types (`callButton`, `urlButton`, `copyButton`) in config panel but no palette entry / no runtime.
- No `GET /api/workflows/:id` — builder seeds from list query cache. Add when 4A-2 needs it.
- No structural validation of `definitionJson` on save (`z.record(z.any())`), no `schemaVersion` persisted.
- `sent_messages` ownership check keys on Whapi's `message_id` — no equivalent for non-Whapi channels yet.
- `first_message_flags` keyed by phone only, not scoped to workflow/user.

**Next session: deploy 4A-2a + run the 12-point regression** (see "Phase 4A-2a — implemented, awaiting deploy + verification" near the top). 4A-1.5 is closed out — browser-verified 7/7.

### Session 4A pre-design (2026-10-23) — no code

- Session ended at ~17% context (fresh session).
- **Wrong cwd detected early:** the session opened in `C:\Users\HP\Desktop\app\Odoo_OmniPlus` (Odoo addons folder — no git repo, no `HANDOFF.md`). Nothing was read or modified there; **no rework needed**.
- **Correct project root:** `C:\Users\HP\Projects\OmniPlus_WA_Tracker_replit_v3` — session cwd moved to it.
- Repo state confirmed at session start: clean working tree, `main` up to date with `origin/main`, HEAD `7a96a21`.
- **Next session: Phase 4A-1 design** — the design prompt will be sent fresh. No design or implementation work begun.

### Session 4A-1 implementation (2026-10-23) — DONE: committed `3fa2e67`, deployed, verified

**Status.** Reviewed line-by-line (one follow-up fix applied during review: `incomingMessage` passed through to `executeHttpNode` inside `resumeFlowAfterTextInput`), committed as `3fa2e67`, deployed to the VPS, and verified with all 10 tests passing. `npm run build` passes (client + esbuild server bundle); `npm run check` reports zero errors in changed files — only the 9 known pre-existing errors remain. The section below is retained as the design record.

**Files changed (exact `git status` at session end):**

| Status | File | Size |
|---|---|---|
| M | `client/src/components/CustomWorkflowNode.tsx` | +87 / -8 |
| M | `client/src/components/WorkflowBuilder.tsx` | +98 |
| M | `client/src/components/WorkflowNodeConfig.tsx` | +235 |
| M | `client/src/pages/workflows.tsx` | +41 / -4 |
| M | `server/routes.ts` | +437 |
| M | `server/workflows/httpExecutor.ts` | +14 / -2 |
| ?? | `server/workflows/flowControl.ts` | new, 166 lines |
| ?? | `shared/workflow-validation.ts` | new, 228 lines |

**Patch for reference:** `C:\Users\HP\AppData\Local\Temp\opencode\phase-4a1.patch` (1,499 lines). This temp path may not survive the machine/session — **the source files above are the ground truth**; regenerate the patch with `git diff` plus `git diff --no-index -- /dev/null <newfile>` if needed.

**What was implemented**

- **HTTP handle fix (1 line):** `CustomWorkflowNode.tsx:19` now checks `nodeType === 'action.http_request'` instead of `'httpRequest'`. The already-written success/error handle block (ids `success` / `error`) now renders. No retro-wiring: existing HTTP nodes still have no edges until the owner reconnects them.
- **`input.text`:** new `INPUTS` palette category + config panel (prompt, variableName, min/max, optional invalidMessage). Capture lives in the text webhook branch **before** the booking-capture handlers; the awaiting node is derived from `conversation_states.current_node_id`. Prompt sending added to `sendNodeMessage`. Loop branch sends the prompt and breaks (stop-and-wait). After capture, `currentNodeId` is advanced before resuming, so a flow that ends cannot re-capture the next message.
- **`resumeFlowAfterTextInput` helper** (new, after `sendNodeMessage`): mirrors the non-booking subset of the button loop (condition / setVariable / HTTP / message / input.text), bounded to 25 transitions, never throws.
- **`condition`:** two source handles (`true` / `false`), config panel with 8 operators and a value input hidden for `exists` / `not_exists` / `is_empty` / `is_not_empty`. Runtime branch evaluates and follows the handle.
- **`setVariable`:** one value field; literal and `{{path}}` interpolation both go through the existing `resolveTemplate`. Runtime branch writes context (with the soft ceiling) and follows the single edge.
- **Validation:** new `shared/workflow-validation.ts`, used by the client before save and by the server in `POST /api/workflows` + `PUT /api/workflows/:id` (400 `{ error, details }` on errors). Errors block save; warnings allow save (toast client-side, `console.warn` server-side). Entry-node type is warn-only.
- **Hardening:** `getNestedValue` is exported and rejects `__proto__` / `constructor` / `prototype` path segments.

**Locked design decisions (all 9 open-question answers)**

1. Booking nodes after `input.text` → **not executed**; stop + log. Documented in the config panel hint.
2. Condition operators = **8**: `equals`, `not_equals`, `greater_than`, `less_than`, `is_empty`, `is_not_empty`, `exists`, `not_exists`. `is_empty` = undefined / null / whitespace-only string; `0` and `false` are **not** empty.
3. `input.text` prompts are **static** — no template interpolation.
4. Per-capture **2000-char hard cap**; **64 KB soft context ceiling** (truncate + `console.warn`, never throw). The HTTP node's 5 MB response storage remains a documented follow-up.
5. **Errors block save**; warnings allow. Reserved-key **writes** are errors; reserved-key **reads** in a condition are warnings. Duplicate variable writers are warnings.
6. Node names kept exactly: `input.text`, `condition`, `setVariable`.
7. Single-output handles stay **id-less** (`sourceHandle: null`); `getNextNodeBySingleEdge` accepts nullish/`'out'`.
8. **Unlimited re-prompts** on invalid `input.text` input (follow-up: attempt cap).
9. Entry nodes: **warn-only**, never blocked.

**Known limitation fixed during self-review (confirmed in review).** A freshly dropped Condition node displayed "Equals" in the panel but had no persisted `operator`, so save-time validation would have blocked it and runtime would have failed closed. Fixed and shipped in `3fa2e67`: the validator normalises `config.operator ?? 'equals'`, both runtime call sites use `config.operator || 'equals'`, and the config panel derives `config.operator || 'equals'`.

**Critical review focus**

1. `input.text` guard/insertion point in the text branch — must be before `if (nameCheckBookingState?.step === 'enter_name')`, null-safe on `currentNodeId`, and must not shadow booking capture.
2. `resumeFlowAfterTextInput` — does it faithfully mirror the button loop's condition / setVariable / HTTP / message semantics, and does the 25-step cap + `currentNodeId` advance prevent re-capture and cycles?
3. Reserved-keys guard — confirm `http`, `bookingState`, `checkBookingsState`, capture keys and `lastBookingId` cannot be overwritten by `setVariable`/`input.text` (error) and that condition reads only warn.
4. Prototype guard on `getNestedValue` — confirm `__proto__`, `constructor`, `prototype` segments are rejected, including `data[0]` parsing.
5. `operator: 'equals'` default — validator + runtime + panel must agree.

**Verification checklist after deploy (10 tests)**

1. HTTP node renders both Success and Error handles; both can be connected and survive save/reload.
2. HTTP node executes and routes down `success` (2xx).
3. HTTP error path routes down `error` (non-2xx / timeout).
4. `input.text` basic: prompt sent, reply stored in `context.<variable>`, flow advances to the next message.
5. `input.text` validation: too-short / too-long reply re-prompts with the configured/generated message and does not advance; unlimited retries.
6. `input.text` with no outgoing edge: reply captured, flow ends cleanly, next text is not re-captured by the same node.
7. `condition` true and false branches each route correctly (e.g. `context.status == confirmed`).
8. `condition is_empty`: whitespace-only → true; `0` and `false` → false; missing → true; `is_not_empty` inverse.
9. `setVariable` with a literal and with `{{template}}` (including unresolved → `''`), consumed by a following condition or HTTP template.
10. Save validation: invalid variable name / malformed path / reserved-key write blocks save (client toast + server 400); duplicate-writer and reserved-read warnings still allow save; legacy button/booking flow unaffected.

**Known limitations / follow-ups carried forward (all accepted — defer, do not fix now)**

- `input.text` reached via a `booking.*` node stalls — booking nodes must be reached by a button reply (documented limitation).
- The `isCaptureStart` capture-sequence block from the main message branch is not replicated in `resumeFlowAfterTextInput`.
- `message.text` nodes don't interpolate `{{variables}}` — not a 4A-1 regression, pre-existing.
- `enforceContextCeiling` measures UTF-16 units, not bytes (the `MAX_CONTEXT_BYTES` name is approximate).
- `getNextNodeBySingleEdge` silently picks the first edge when two id-less edges exist.
- Duplicate-writer validation pushes one warning issue per writer node (cosmetic toast noise).
- The `setVariable` config panel's reserved-key check doesn't trim, while the validator does (cosmetic mismatch).
- Dead `savedPanelSizes` state: panel sizes are persisted to `localStorage` on every layout change but never read back into `defaultSize` — pre-existing latent bug, panels always reset to 20/60/20.
- `firstMessageTrigger` palette node has no runtime handler — pre-existing (the real trigger is `workflows.entry_node_id`).
- `sent_messages` ownership keys on Whapi's `message_id`, which blocks non-Whapi channels until 4A-3.
- Also accepted: unlimited invalid-input re-prompts (no attempt cap); duplicated routing logic between `resumeFlowAfterTextInput` and the inline loop (collapse when the 4A-2 runner exists); the soft context ceiling still allows up to 5 MB per HTTP response; no idempotency / per-conversation locking for concurrent webhook deliveries (pre-existing); captured PII lives in `conversation_states.context` in plaintext (same class as existing booking data).

### Session 4A-1.5 (2026-10-23) — committed `a77db76`, deployed, browser-verified (7/7)

- Design-first session: read-only investigation of the palette and layout, then implementation after approval. Ended at ~80% context.
- **Palette.** 7 tabs at `text-[9px]` (~34px per tab in a 243px panel) replaced by a single scrollable `NodePalette` in `WorkflowBuilder.tsx`. Module-scope additions: `PaletteNode`, `nodeTypes ... satisfies Record<string, PaletteNode[]>`, `PaletteCategory`, `CATEGORY_ORDER` (explicit order + display labels + per-category icon colour + `requiresBookingAccess`). Search filters case-insensitively on label/description/id with no debounce (16 nodes — debounce deliberately skipped); empty state renders "No nodes match". `renderNodePalette` deleted (251 lines), both call sites swapped to the component. Each instance owns its own `query` state, so the fullscreen Sheet filters independently.
- **Width.** `fullWidth` on the `/workflows` route was the correct lever: `DashboardLayout`'s non-`fullWidth` branch applies `max-w-7xl` (1280px → 1216px usable), which is the entire constraint. Below ~1536px viewport the cap was never binding, so those users see no change. `App.tsx` +1/−1; the list view re-capped with `max-w-7xl mx-auto` so only the builder is full-bleed.
- **Deliberately unchanged.** Panel sizes (20/60/20), `nodeTypes` content, `WorkflowNodeConfig.tsx`, `CustomWorkflowNode.tsx`, all server files, schema.
- **Verification (build/deploy).** `npm run check` clean in changed files; `npm run build` succeeded locally and on the VPS with identical asset hashes (`index-vyHxOcNb.js`, `index-D8eGdqiY.css`), client bundle −5.04 kB. Deployed: fast-forward `3fa2e67..a77db76`, backup `omniplus-pre-deploy-2026-10-23-1307.tar.gz`, PM2 online, error log shows only the two known pre-existing entries.
- **Browser verification (2026-10-23) — 7/7 PASS:**
  1. **Single scrollable palette** — correct section order (Messages → End Messages → Triggers → Inputs → Logic → Actions → Booking), all 16 nodes, search box at top, zero tabs.
  2. **Search filter** — `text` narrowed to Inputs → Text Input + End Messages → Text Message; clearing restored all 7 sections.
  3. **Empty state** — "No nodes match 'xyz'" rendered.
  4. **Add-node paths** — palette drag-and-drop and click-to-add both place a node; `data-testid="node-type-<id>"` present on the card.
  5. **Fullscreen palette** — same single-list palette with section headers; fullscreen search filters independently of the left panel; closing the Sheet preserved the left-panel search string.
  6. **Canvas width** — visibly wider at ≥1536px viewport, no change below it, and the `/workflows` list view still capped at `max-w-7xl`.
  7. **Regression — scroll chain** — at `minSize` (15%) the palette list still scrolls and the search box stays pinned to the top.
- Verification session ended at ~15% context usage.

## Follow-ups

- **Supabase pooler CA → VPS trust store** — `db:push` currently requires `NODE_TLS_REJECT_UNAUTHORIZED=0` because the Supabase pooler (`aws-1-eu-west-1.pooler.supabase.com`) presents a self-signed cert. Investigate whether the pooler CA can be added to the VPS trust store (or via `NODE_EXTRA_CA_CERTS`) so the env-var workaround is no longer needed.
- **Formula preview (optional polish for 3G-7)** — live preview of a calculation formula's computed value inside the owner's custom-fields editor. Deliberately deferred out of 3G-7; validation-only for now.
- **nginx log redaction** — `/var/log/nginx/my-app-access.log` records the raw `/api/public/share/<token>/*` URI. Add a custom nginx `log_format` to redact `/share/<token>` → `/share/[redacted]`. (App-level redaction in `server/index.ts` already works.)
- **Add `description` to the public list response** — for a real header title.
- **CSV vs table field-visibility nuance** — server's `orderedVisibleFieldKeys` doesn't filter custom ids by `customFieldNames`; the client does. Rare edge case (deleted custom field after giving it a permission). Document with a code comment so a future maintainer doesn't "fix" it accidentally.
- ~~**computeCalcValue duplication**~~ — **resolved in 3G-7**: evaluation now lives in `shared/calc-formula.ts`; `client/src/lib/calc.ts` is a thin re-export barrel.
- **Inline editing on the public page** — UX enhancement.
- **Session-expiry UX polish** — invalidate-based transition to gate has a one-render delay.
- **3G-4 owner UI interactive verification** — the 11-step checklist has never been formally run end-to-end.

## Known pre-existing issues (do NOT chase)

- 9 TS errors (`npm run check`): `admin.tsx:1284`, `outbox.tsx:727`, `whapi-settings.tsx:24/25/145`, `storage.ts:1069` (labelLog), `schema.ts:1256`, `vite.config.ts:14/16`
- PM2 non-fatal: `EISDIR uploads/use-cases`, `[AutoExtend] Health check failed for channel 9/10`, WHAPI 524 timeouts

## Hard constraints

- Do NOT touch the chatbot booking flow (`routes.ts` ~8247–8873).
- Do NOT run `deploy.sh` / `update.sh` without approval (schema changes are manual via `npm run db:push`).
- No new dependencies.
- No commit / push / SSH without approval.
- No `db:push` on code-only deploys.

## VPS details

- SSH: `ssh watracker` (root@109.106.244.186, hostname `srv1082592`)
- App dir: `/opt/omniplus` (git checkout + build + runtime, single dir)
- PM2 process: `omniplus` (entry `/opt/omniplus/server-dist/index.js`)
- Port: 5000 (nginx 80/443 → 127.0.0.1:5000)
- Deploy (manual): `git pull` → `npm ci --include=dev` → (optional `db:push`) → `npm run build` → `pm2 restart omniplus --update-env`
- **Schema migrations (`db:push`) require `NODE_TLS_REJECT_UNAUTHORIZED=0`** — the Supabase pooler presents a self-signed cert that `pg`/drizzle-kit reject (`SELF_SIGNED_CERT_IN_CHAIN`), even with `sslmode=require`. Run: `NODE_TLS_REJECT_UNAUTHORIZED=0 npm run db:push`. Scoped to that one process; the app itself uses `@neondatabase/serverless` (WebSocket) and is unaffected. Standing step for all future schema migrations until the pooler CA is trusted (see Follow-ups).
- Git remote on VPS: `git@github.com:omnipro-bh/OmniPlus_WA_Tracker_replit_v3.git` (SSH deploy key)

## Outstanding cleanup

1. ~~Delete the exposed GitHub PAT~~ — **done**. Only an unrelated Th2 token remains in GitHub (not used by this app).
