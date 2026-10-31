# OmniPlus WA Tracker v3

## Environment

- SSH host: `watracker`
- VPS IP: 109.106.244.186
- VPS hostname: srv1082592
- App directory on VPS: `/opt/omniplus` (git checkout, build output, and runtime — single directory)
- Process manager: PM2 (process name: `omniplus`, ID: 0)
- Entry point: `/opt/omniplus/server-dist/index.js`
- Port: `5000` (nginx at wt.omniplus-bh.com proxies 80/443 → 127.0.0.1:5000)
- App type: Node.js + TypeScript (Vite + Drizzle ORM, local PostgreSQL — `localhost:5432/omniplus_db` via the `pg` driver)
- GitHub repo: github.com/omnipro-bh/OmniPlus_WA_Tracker_replit_v3

## Rules

- ONLY work on the `watracker` host
- NEVER reference `omnihub`, `/var/www/markhub`, or the OmniHub project
- Back up files before editing
- Show diff before applying

## Deploy Workflow (manual)

1. Pull: `ssh watracker "cd /opt/omniplus && git pull origin main"`
2. Install: `ssh watracker "cd /opt/omniplus && NODE_ENV=development npm ci --include=dev"`
3. Schema changes only (manual, never in the deploy script): `ssh watracker "cd /opt/omniplus && npm run db:push"`
4. Build: `ssh watracker "cd /opt/omniplus && npm run build"`
5. Restart: `ssh watracker "pm2 restart omniplus --update-env"`
6. Verify: `ssh watracker "pm2 status omniplus && pm2 logs omniplus --lines 20"`

## Backup (run before each deploy)

ssh watracker 'tar -czf /root/omniplus-pre-deploy-$(date +%F-%H%M).tar.gz -C /opt --exclude=omniplus/node_modules --exclude=omniplus/uploads omniplus && ls -lh /root/omniplus-pre-deploy-*.tar.gz | tail -2'

## Important Paths

- PM2 process name: `omniplus`
- PM2 out log: `/root/.pm2/logs/omniplus-out.log`
- PM2 error log: `/root/.pm2/logs/omniplus-error.log`
- PM2 status: `pm2 list`

## Known pre-existing issues (do NOT chase these)

TypeScript — `npm run check` reports 9 errors in unrelated files; ignore them:
- client/src/pages/admin.tsx:1284
- client/src/pages/outbox.tsx:727
- client/src/pages/whapi-settings.tsx:24, 25, 145
- server/storage.ts:1004 (labelLog insert)
- shared/schema.ts:1250
- vite.config.ts:14, 16

PM2 non-fatal runtime errors (expected, ignore):
- `EISDIR uploads/use-cases`
- `[AutoExtend] Health check failed for channel 9/10`
- WHAPI/Cloudflare 524 timeouts (external gateway, retryable)
