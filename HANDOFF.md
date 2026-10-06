# HANDOFF — OmniPlus WA Tracker v3

## ⚠️ TOP PRIORITY — Security

- **Rotate the Supabase DB password.** The `DATABASE_URL` (including password) was exposed in the 2026-10-06 session's tool output during a `psql` parsing error. Steps: rotate the password in the Supabase dashboard → update `DATABASE_URL` in the VPS `/opt/omniplus/.env` → `pm2 restart omniplus --update-env`. Do this in a separate session; do not interrupt the current work.

## Current state

- `origin/main` HEAD: `143a59a` (Feature 2 — Department→Service / Staff→Provider rebrand). Deployed/running on the VPS.
- Deploy target: `wt.omniplus-bh.com`
- Schema: `bookings` has `end_day_start_time` + `end_day_end_time` (nullable `varchar(5)`); `users` has `custom_fields_limit` (nullable integer) — db:push applied.

## Recent commits

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

## Deferred (own session)

- **Feature 3 — password-protected shareable booking links**: field-level read/write permissions, per-user, max 2 links, enable/disable/delete. Multi-session project. (This session closed at ~50% of the overall project.)

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
- Git remote on VPS: `git@github.com:omnipro-bh/OmniPlus_WA_Tracker_replit_v3.git` (SSH deploy key)

## Outstanding cleanup

1. ~~Delete the exposed GitHub PAT~~ — **done**. Only an unrelated Th2 token remains in GitHub (not used by this app).
