# HANDOFF — OmniPlus WA Tracker v3

## Current state

- `origin/main` HEAD: `f32bd69` (Batch B). This HANDOFF.md is the next commit on top of it.
- Deployed/running on the VPS: `3685cc0` (Batch A) — the VPS is 1 commit behind (`f32bd69` was docs/config-only and intentionally not pulled).
- Deploy target: `wt.omniplus-bh.com`

## Recent commits

- `f32bd69` chore: project hygiene (Batch B)
- `3685cc0` fix(booking): overlap-based availability + 2 latent boolean bugs (Batch A)
- `6aa8c23` feat(booking): manual booking endpoint with custom field values (Phase 3B)
- `455a26d` feat(booking): calculation field type for custom fields
- `1cbec7f` feat(booking): custom fields foundation (Phase 3A)
- `9ad3678` fix(booking): remove 'Available' from calendar status filter

## Completed phases

- Sidebar tabs → sub-navigation (`57b123f`)
- Full calendar — backend + UI + polish + full-screen + filters (`a0aea0a` → `9ad3678`)
- Custom fields foundation — max 5/tenant, types text/number/date/boolean/select (`1cbec7f`)
- Calculation field type — field-A [op] field-B computed on read (`455a26d`)
- Manual booking endpoint — `POST /api/booking/bookings/manual`, overlap + advisory lock + custom values (`6aa8c23`)
- Batch A — `checkSlotAvailability` overlap-based + `BLOCKING_BOOKING_STATUSES`; fixed 2 latent boolean bugs (reschedule + available-slots) (`3685cc0`)
- Batch B — AGENTS.md fixed, `.gitignore`, untracked `client-dist/`/`server-dist/`, `deploy.sh` db:push removed (`f32bd69`)
- Batch C — VPS→GitHub auth migrated to SSH deploy key (VPS-only, no commit)

## Next phase

- **Phase 3C — Manual Booking Form UI (not started).**

## Known pre-existing issues (do NOT chase)

- 9 TS errors (`npm run check`): `admin.tsx:1284`, `outbox.tsx:727`, `whapi-settings.tsx:24/25/145`, `storage.ts:1004` (labelLog), `schema.ts:1250`, `vite.config.ts:14/16`
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

1. Delete the exposed GitHub PAT after the 24h safety window (SSH key is now the only auth).
2. Before the next VPS pull: run `git reset --hard origin/main` (the Batch B artifact-untracking leaves stale local modifications to `client-dist/`/`server-dist/` that will conflict with the pull).
