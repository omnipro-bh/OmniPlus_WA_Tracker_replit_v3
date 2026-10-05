# HANDOFF — OmniPlus WA Tracker v3

## Current state

- `origin/main` HEAD: `5fe401c` (Phase 3D-3). Deployed/running on the VPS.
- Deploy target: `wt.omniplus-bh.com`

## Recent commits

- `5fe401c` feat(booking): merge Edit+Reschedule, fix time slot, custom field editing (Phase 3D-3)
- `68729dc` feat(booking): detail drawer + row click + export with custom fields (Phase 3D-2)
- `20a08e2` feat(booking): list shows custom field values + redesigned columns (Phase 3D-1)
- `08d17a4` fix(booking): availability endpoints return windows, not slotDuration chunks
- `dc3e0da` feat(booking): manual booking form UI (Phase 3C)
- `3685cc0` fix(booking): overlap-based availability + 2 latent boolean bugs (Batch A)

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

## Next phase

- **Phase 3F — multi-day bookings.**

## Phase 3F plan (multi-day bookings)

- Add `endDate` column to `bookings` (nullable; defaults to `slotDate` for existing rows).
- Extend availability logic everywhere (calendar + `/staff/:id/available-slots` + manual + PUT endpoints).
- Add "End Date" input to merged Edit dialog + manual booking dialog.
- Calendar renders multi-day bookings across all days in range.
- Excel export + drawer + list show the range.
- Chatbot unaffected (single-day, `endDate === slotDate`).
- Estimated ~5 hours, split into 3F-1 (backend) → 3F-2 (create/edit UI) → 3F-3 (calendar/display).

## Remaining polish (not started)

- Custom Summary column shows "—" chips for fields without values (visual noise).
- VPS: SSH deploy keys in use; **the exposed GitHub PAT should be deleted — overdue.**

## Known pre-existing issues (do NOT chase)

- 9 TS errors (`npm run check`): `admin.tsx:1284`, `outbox.tsx:727`, `whapi-settings.tsx:24/25/145`, `storage.ts:1005` (labelLog), `schema.ts:1250`, `vite.config.ts:14/16`
- PM2 non-fatal: `EISDIR uploads/use-cases`, `[AutoExtend] Health check failed for channel 9/10`, WHAPI 524 timeouts

## Hard constraints

- Do NOT touch the chatbot booking flow (`routes.ts` ~8247–8873) or the manual booking endpoint.
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

1. Delete the exposed GitHub PAT from GitHub — **overdue** (SSH deploy key is now the only auth).
