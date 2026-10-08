# HANDOFF — OmniPlus WA Tracker v3

## ✅ Security — Supabase DB password rotation (DONE 2026-10-06)

- **Rotated 2026-10-06.** The `DATABASE_URL` (including password) was exposed in the 2026-10-06 session's tool output during a `psql` parsing error.
- Rotated in Supabase dashboard → `DATABASE_URL` updated in VPS `/opt/omniplus/.env` (16:35) → `pm2 restart omniplus --update-env` (↺ 30) → app reconnected + re-seeded successfully.
- Deleted 7 stale `.env` backups (`.env.bak.*` + `.env.before-rotate-2026-10-06`); old password now invalid + removed from disk.
- Flushed ~4.7 GB of PM2 logs.

## Current state

- Production HEAD (deployed/running on VPS): `3b7626a` (Feature 3G-5e — share-link UI polish).
- Repo HEAD: `3b7626a` (+ this commit: docs-only HANDOFF update).
- Deploy target: `wt.omniplus-bh.com`
- Schema: `bookings` has `end_day_start_time` + `end_day_end_time` (nullable `varchar(5)`); `users` has `custom_fields_limit` (nullable integer); `booking_share_links` (14 cols, unique `(user_id, slot)` index) — db:push applied.

## Recent commits

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
- **3G-4** ✅ owner UI in the Settings tab (deployed + render-verified)
- **3G-5** ✅ public UI page (`/share/:token`)
- **3G-5b…3G-5e** ✅ fix passes (logout/names, legacy-field removal + per-type inputs, data-wipe fix, Updated/Token since + displayOrder)

All shipped + deployed. One enhancement remains: **3G-6** (below).

## Next phase — 3G-6 (share-link column control + public-page enhancements)

Estimated ~20-25% across a fresh session.

### A. Reorder all columns per link (owner UI + config + public page + CSV)
- Add up/down arrow buttons (stacked, left side — mirroring the Custom Fields settings pattern) to every row in the Edit Share Link modal's field-permission list.
- Remove the group headers (Scheduling / Customer / Details / Custom) — show one flat reorderable list.
- Reorder saves only on modal Save (Cancel discards).
- Store the order in `config.fieldOrder: string[]` — array of field keys (standard keys + `custom:<id>`).
- Server + client both respect `fieldOrder` when rendering: public-page table columns, CSV export columns (must match table order), edit-modal control order.
- Fallback: if `fieldOrder` is empty (existing links), use the current fixed `SHARE_FIELD_ORDER`.
- **Risk to handle**: the `ShareLinkConfig` zod schema — add `fieldOrder` as optional with default `[]` so existing links don't fail validation. Check the schema definition (`shared/schema.ts` ~1157) before implementing.

### B. Sortable columns on the public page
- Click a column header → sort the current page's rows (asc/desc).
- Visual indicator on active sort column (▲/▼).
- Sort by type: date = chronological, number = numeric, text = alphabetical.
- Client-side only (sort the 50 rows already fetched per page) — no server change.

### C. Mobile-responsive public page
- The current horizontal-scroll table is technically usable but cramped on phones.
- Design options: card-stack on mobile (one card per booking) vs improved table (sticky first column, condensed layout).
- Decide in the 3G-6 design phase.

## Follow-ups

- **nginx log redaction** — `/var/log/nginx/my-app-access.log` records the raw `/api/public/share/<token>/*` URI (nginx logs the request before Express can redact). Add a custom nginx `log_format` to redact `/share/<token>` → `/share/[redacted]`. Note: app-log redaction (`server/index.ts`) already works.
- **Add `description` to the public list response** — for a real header title on the public page (currently a generic "Shared bookings" header).
- **Owner UI: prune stale `fieldPermissions` keys** — existing links may carry `custom:<id>` or legacy `customField1/2` keys that no longer render; a save-time prune (drop keys not in the current STANDARD_FIELDS + custom fields) would clean the JSONB.
- **CSV vs table field-visibility nuance** — confirm CSV columns exactly match the table columns (both driven by the same field order + visibility); note the server-side `visibleCustomFieldIds` doesn't filter calculation/ghost ids (relies on the projected `customFieldValues`).
- **Inline editing on the public page** — potential 3G-7.
- **Session-expiry UX polish** — the 12h `share_session` TTL returns the visitor to the password gate mid-use; consider a friendlier "session expired, re-enter password" toast vs. the bare gate.
- **3G-4 owner UI interactive verification** — the 11-step create→reveal→copy→toggle→edit→regenerate→delete→max-2→incognito flow was render-verified but never interactively exercised; worth a manual pass.
- ~~Remove `GET /api/public/share/:token/ping`~~ — **done** (removed in 3G-3).
- **Minor (non-blocking)**: `/confirm` allows confirming an already-cancelled booking (no `status === "cancelled"` guard) — business rule, not a security issue. Also `parseInt` on `page`/`pageSize` is lenient (`"1abc"` → 1), already clamped by `Math.max`/`Math.min`.

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
