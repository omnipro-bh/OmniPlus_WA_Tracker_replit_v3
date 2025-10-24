# Cloud VPS Deployment Guide for OmniPlus WA Tracker

This guide provides complete instructions for deploying OmniPlus WA Tracker on a cloud VPS.

## 1. System Requirements

### Node.js & Package Manager
- **Node.js**: Version 18.x or 20.x (based on `@types/node: 20.16.11`)
- **npm**: Comes with Node.js (or yarn/pnpm if preferred)

### Operating System
- Linux-based system (Ubuntu 20.04/22.04, Debian 11/12, or similar)
- Minimum 2GB RAM (4GB+ recommended for production)
- 20GB+ disk space

## 2. Database Requirements

### PostgreSQL
- **PostgreSQL 14+** (required)
- Database user with full permissions
- Connection via standard PostgreSQL protocol or Neon-compatible serverless

## 3. Required Environment Variables

```bash
# Database (REQUIRED)
DATABASE_URL=postgresql://user:password@host:port/database

# Session Security (REQUIRED)
SESSION_SECRET=your-strong-random-secret-here

# PayPal Integration (REQUIRED for payments)
PAYPAL_CLIENT_ID=your-paypal-client-id
PAYPAL_CLIENT_SECRET=your-paypal-client-secret

# WHAPI Integration (REQUIRED for WhatsApp features)
WHAPI_PARTNER_TOKEN=your-whapi-partner-token
WHAPI_BASE=https://manager.whapi.cloud
WHAPI_PROJECT_ID=your-whapi-project-id

# Application Environment
NODE_ENV=production
PORT=5000  # Optional, defaults to 5000
```

## 4. Installation Steps

```bash
# 1. Clone/upload your application code
cd /path/to/your/app

# 2. Install dependencies
npm install

# 3. Push database schema
npm run db:push

# 4. Build the application
npm run build
```

## 5. Build Process

**Build Command**: `npm run build`

This executes:
1. **Frontend build**: `vite build` → Creates optimized static files in `dist/public`
2. **Backend build**: `esbuild server/index.ts` → Bundles server code into `dist/index.js`

**Output**:
- `dist/index.js` - Production server bundle
- `dist/public/` - Static frontend assets

## 6. Runtime Commands

### Production
```bash
npm run start
# Or directly:
NODE_ENV=production node dist/index.js
```

### Development (NOT for production VPS)
```bash
npm run dev
```

## 7. Network Requirements

- **Bind Address**: `0.0.0.0` (already configured)
- **Port**: 5000 (configurable via `PORT` env var)
- **Firewall**: Allow inbound TCP on port 5000
- **Reverse Proxy**: Nginx/Apache recommended for SSL/domain mapping

## 8. Process Management

Install a process manager to keep the app running:

### Option A: PM2 (Recommended)
```bash
npm install -g pm2
pm2 start dist/index.js --name "omniplus-wa-tracker"
pm2 startup  # Auto-start on system boot
pm2 save
```

### Option B: systemd Service
Create `/etc/systemd/system/omniplus.service`:
```ini
[Unit]
Description=OmniPlus WA Tracker
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/app
Environment="NODE_ENV=production"
Environment="PORT=5000"
EnvironmentFile=/path/to/.env
ExecStart=/usr/bin/node dist/index.js
Restart=always

[Install]
WantedBy=multi-user.target
```

Then enable and start:
```bash
sudo systemctl enable omniplus
sudo systemctl start omniplus
sudo systemctl status omniplus
```

## 9. Reverse Proxy Setup (Optional but Recommended)

### Nginx Configuration Example
Create `/etc/nginx/sites-available/omniplus`:
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/omniplus /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 10. SSL Certificate

Use Let's Encrypt with Certbot:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

## 11. Background Services

The application includes:
- **Cron Job Worker**: Runs automatically (node-cron)
  - **Hourly channel expiration check** - Runs every hour to detect and handle expired channels
    - Automatically logs out expired channels from WhatsApp via WHAPI
    - Changes channel status from ACTIVE to PAUSED
    - Sets authStatus to PENDING to prevent unauthorized access
    - Creates audit log entries for compliance
  - **Real-time expiration validation** - API endpoints check expiration before:
    - Displaying QR codes for authorization
    - Authorizing channels
    - Sending messages
  - Message queue processing (optional)
- **No external cron needed** - handled internally

## 12. Monitoring & Logs

### Application Logs
```bash
# With PM2
pm2 logs omniplus-wa-tracker

# With systemd
journalctl -u omniplus -f
```

### Health Checks
- Endpoint: `GET /api/me` (requires auth)
- Database: Monitor PostgreSQL connections

## 13. Security Considerations

- [ ] Set strong `SESSION_SECRET` (use: `openssl rand -base64 32`)
- [ ] Use HTTPS (SSL certificate)
- [ ] Configure firewall (ufw/iptables)
- [ ] Regular security updates
- [ ] Database backups (automated)
- [ ] Secure environment variables (use .env file with chmod 600)
- [ ] Disable root SSH login
- [ ] Configure fail2ban for brute-force protection

### Firewall Setup (UFW)
```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

## 14. Database Backup

### Automated PostgreSQL Backup
```bash
# Create backup script: /usr/local/bin/backup-db.sh
#!/bin/bash
BACKUP_DIR="/var/backups/postgresql"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR
pg_dump $DATABASE_URL > $BACKUP_DIR/omniplus_$DATE.sql
# Keep only last 7 days
find $BACKUP_DIR -name "omniplus_*.sql" -mtime +7 -delete
```

Add to crontab:
```bash
0 2 * * * /usr/local/bin/backup-db.sh
```

## 15. Quick Deployment Checklist

```bash
✓ Install Node.js 18+
✓ Install PostgreSQL 14+
✓ Create database and user
✓ Set all environment variables
✓ Run: npm install
✓ Run: npm run db:push
✓ Run: npm run build
✓ Run: npm run start (or use PM2)
✓ Configure firewall
✓ Set up reverse proxy + SSL
✓ Test application access
```

## 16. Troubleshooting

### Application won't start
```bash
# Check logs
pm2 logs omniplus-wa-tracker
# Or
journalctl -u omniplus -n 50

# Verify environment variables
printenv | grep -E "DATABASE_URL|PAYPAL|WHAPI|SESSION_SECRET"

# Test database connection
psql $DATABASE_URL -c "SELECT 1;"
```

### Port already in use
```bash
# Find process using port 5000
sudo lsof -i :5000
# Kill if necessary
sudo kill -9 <PID>
```

### Database connection errors
```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Test connection
psql -h hostname -U username -d database -c "SELECT version();"
```

## 17. Updating the Application

```bash
# 1. Pull latest code
cd /path/to/app
git pull origin main

# 2. Install new dependencies
npm install

# 3. Push database changes
npm run db:push

# 4. Rebuild
npm run build

# 5. Restart application
pm2 restart omniplus-wa-tracker
# Or
sudo systemctl restart omniplus
```

## 18. Performance Optimization

### PM2 Cluster Mode (for multi-core servers)
```bash
pm2 start dist/index.js -i max --name "omniplus-wa-tracker"
```

### Nginx Caching
Add to nginx location block:
```nginx
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

## Support & Resources

- Application logs: Check PM2 or systemd logs
- Database issues: Verify DATABASE_URL and PostgreSQL status
- WHAPI issues: Check WHAPI_PARTNER_TOKEN and project ID
- PayPal issues: Verify client credentials in PayPal dashboard

---

**Note**: This application includes real-time polling (2-second intervals) for the Outbox page to reflect database updates immediately. Ensure your VPS has sufficient bandwidth for this feature.
