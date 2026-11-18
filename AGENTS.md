# OmniPlus WA Tracker v3

## Environment

- Host: InstaPods container `omniplus-wa-tracker-replit-v3`
- SSH: `ssh -p 2271 instapod@137.74.204.201` (local key `~/.ssh/id_ed25519`)
- App directory: `/home/instapod/app` (git checkout, build output, and runtime — single directory)
- Process manager: **systemd**, unit `app.service` (there is no PM2)
- Entry point: `/home/instapod/app/server-dist/index.js`
- Port: **`3000`** (`PORT=3000`, `HOST=0.0.0.0` in the unit). Public site: wt.omniplus-bh.com
- App type: Node.js + TypeScript (Vite + Drizzle ORM, local PostgreSQL — `localhost:5432/instapod` via the `pg` driver)
- GitHub repo: github.com/omnipro-bh/OmniPlus_WA_Tracker_replit_v3

The former VPS (`srv1082592` / `109.106.244.186`, PM2 process `omniplus`, port 5000,
`/opt/omniplus`) is **retired** and unreachable. Do not follow old notes that reference it.

## Rules

- ONLY work on the InstaPods host above
- Push from a **local** checkout, never from the container (the container has no push credentials: no `gh`, no `~/.git-credentials`)
- NEVER reference `omnihub`, `/var/www/markhub`, or the OmniHub project
- Back up files before editing (on the container, git is the backup — the tree is clean)
- Show diff before applying

## Deploy Workflow

InstaPods deploys automatically: a push to `main` triggers pull + build + restart, usually
within a minute. Watch it with:

```bash
ssh -p 2271 instapod@137.74.204.201 "journalctl -u app.service -f"
```

1. Commit and push from local: `git push origin main`
2. Wait for the automatic rebuild + restart, and confirm the new PID started
3. Schema changes only (manual, never part of auto-deploy): `npm run db:push`

Manual rebuild/restart if auto-deploy does not fire:

```bash
ssh -p 2271 instapod@137.74.204.201 \
  "cd /home/instapod/app && git pull origin main && npm run build && sudo systemctl restart app.service"
```

## Runtime Configuration

`/home/instapod/app/.env` is the source of truth. InstaPods regenerates
`/etc/instapods/app.env` from it on every save — **never edit that file directly**.

- `UPLOADS_DIR` — absolute path for user media. Point at a mounted persistent volume so
  uploads survive redeploys (the checkout is recreated on every deploy). Unset =
  `/home/instapod/app/uploads`. A fresh volume is seeded from the committed files at boot.
- `UPLOADS_MISSING_MEDIA` — `404` (default) or `placeholder`. `placeholder` returns a
  neutral SVG with status 200 for missing images; non-images always 404.
- `CLEANUP_OLD_MEDIA` — `false` (default). `true` enables the daily 03:00 job that deletes
  uploads older than 30 days. Deleted attachments are **not** recoverable and the database
  keeps pointing at them.

## Important Paths

- systemd unit: `app.service` (`/etc/systemd/system/app.service`)
- Status: `systemctl status app.service`
- Logs: `journalctl -u app.service -n 100 --no-pager` (follow with `-f`)
- Restart: `sudo systemctl restart app.service`
- Uploads: `${UPLOADS_DIR:-/home/instapod/app/uploads}`, served under `/uploads/*`
- App DB: `localhost:5432/instapod`

## Known pre-existing issues (do NOT chase these)

TypeScript — `npm run check` reports 9 errors in unrelated files; ignore them:
- client/src/pages/admin.tsx:1284
- client/src/pages/outbox.tsx:727
- client/src/pages/whapi-settings.tsx:24, 25, 145
- server/storage.ts:1156 (labelLog insert)
- shared/schema.ts:1536
- vite.config.ts:14, 16

Runtime errors that are expected, ignore:
- `[AutoExtend] Health check failed for channel 9/10`
- WHAPI/Cloudflare 524 timeouts (external gateway, retryable)

`EISDIR uploads/use-cases` no longer occurs: the media cleanup job only unlinks regular
files, and it is opt-in via `CLEANUP_OLD_MEDIA=true`.
