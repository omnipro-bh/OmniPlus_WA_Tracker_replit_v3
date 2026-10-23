# HANDOFF — OmniPlus WA Tracker v3

## ✅ Security — Supabase DB password rotation (DONE 2026-10-06)

- **Rotated 2026-10-06.** The `DATABASE_URL` (including password) was exposed in the 2026-10-06 session's tool output during a `psql` parsing error.
- Rotated in Supabase dashboard → `DATABASE_URL` updated in VPS `/opt/omniplus/.env` (16:35) → `pm2 restart omniplus --update-env` (↺ 30) → app reconnected + re-seeded successfully.
- Deleted 7 stale `.env` backups (`.env.bak.*` + `.env.before-rotate-2026-10-06`); old password now invalid + removed from disk.
- Flushed ~4.7 GB of PM2 logs.

## Current state

- Production HEAD (deployed/running on VPS): `ed97b8a` (Feature 3G-7 — multi-field formula for calculation custom fields).
- Repo HEAD: this docs-only HANDOFF commit. **The entire Phase 4A-1 implementation is uncommitted in the working tree** — 6 modified files + 2 new files (see "Session 4A-1 implementation" below).
- Deploy target: `wt.omniplus-bh.com`
- Schema: `bookings` has `end_day_start_time` + `end_day_end_time` (nullable `varchar(5)`); `users` has `custom_fields_limit` (nullable integer); `booking_share_links` (14 cols, unique `(user_id, slot)` index); `booking_custom_fields` has `calc_formula` (nullable `text`) — db:push applied 2026-10-09. **4A-1 adds no schema change and requires no db:push.**
- Last session (Phase 4A-1 implementation) ended at ~85% context usage.

## Recent commits

- docs: HANDOFF — Phase 4A-1 implemented in working tree (uncommitted); next: review **← this commit (HEAD)**
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

- **4A-1 (implemented, uncommitted, awaiting review):** Fix the HTTP node handle bug + add three new node types (`input.text`, `condition`, `setVariable`). Small, surgical, additive. No engine refactor. See "Session 4A-1 implementation" below.
- **4A-2 (deferred):** Live Test Panel. Requires a `sandbox` mode in the webhook handler + a chat UI on the frontend.
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

**Next session: review the 4A-1 diff, then commit/deploy/verify.** See "Session 4A-1 implementation" below.

### Session 4A pre-design (2026-10-23) — no code

- Session ended at ~17% context (fresh session).
- **Wrong cwd detected early:** the session opened in `C:\Users\HP\Desktop\app\Odoo_OmniPlus` (Odoo addons folder — no git repo, no `HANDOFF.md`). Nothing was read or modified there; **no rework needed**.
- **Correct project root:** `C:\Users\HP\Projects\OmniPlus_WA_Tracker_replit_v3` — session cwd moved to it.
- Repo state confirmed at session start: clean working tree, `main` up to date with `origin/main`, HEAD `7a96a21`.
- **Next session: Phase 4A-1 design** — the design prompt will be sent fresh. No design or implementation work begun.

### Session 4A-1 implementation (2026-10-23) — code written, NOT reviewed / NOT committed / NOT deployed

**Status.** The full 4A-1 implementation exists in the working tree only. Nothing has been human-reviewed, committed, pushed, deployed, or db-pushed. `npm run build` passes (client + esbuild server bundle); `npm run check` reports **zero errors in changed files** — only the 9 known pre-existing errors remain. Session ended at ~85% context usage.

**First task next session (do this before anything else):** paste the diff of all 8 files inline, review line-by-line, then commit → push → deploy (code-only) → run the 10 verification tests below → close the HANDOFF. Do **not** re-investigate the engine; the design + findings below are enough.

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

**Known limitation fixed during self-review (verify in review).** A freshly dropped Condition node displayed "Equals" in the panel but had no persisted `operator`, so save-time validation would have blocked it and runtime would have failed closed. Fixed in the uncommitted tree: validator normalises `config.operator ?? 'equals'`; both runtime call sites use `config.operator || 'equals'`. Confirm the fix is present in the working tree.

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

**Known limitations / follow-ups (all accepted for 4A-1)**

- Booking nodes cannot be reached directly after text capture — must be via a button reply.
- Unlimited invalid-input re-prompts (no attempt cap).
- Duplicate routing logic: `resumeFlowAfterTextInput` mirrors part of the inline loop; collapse when the 4A-2 runner exists.
- Context ceiling is soft; the HTTP node can still store up to 5 MB per response.
- No idempotency / per-conversation locking for concurrent webhook deliveries (pre-existing).
- Captured PII now lives in `conversation_states.context` in plaintext (same class as existing booking data).

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
