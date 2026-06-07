# BayarLah Deployment Runbook

This runbook targets a hackathon deployment with:

- `app.example.com` on Vercel
- `wa.example.com` on a NovaCloud Ubuntu 24.04 VM
- Supabase Postgres and Storage
- Clerk authentication
- OpenWA 0.1.6, the WhatsApp worker, and Caddy on Docker Compose

A 2-core VM with 7.5 GB RAM and 32 GB storage is suitable for one bot and a
small number of test WhatsApp sessions. Keep at least 8 GB of disk free for
container updates and backups.

## 1. Prepare Managed Services

Create a fresh Supabase project in Singapore or the nearest available region.
Copy `.env.example` to `.env.local`, fill in the Supabase direct and pooled
database URLs, then apply the schema:

```bash
npm ci --legacy-peer-deps
npm run db:setup
```

Confirm these Storage buckets exist:

- `profile-photos` is public
- `duitnow-qrs` is public
- `payment-proofs` is private

Create a Clerk production instance and allow:

- `https://app.example.com`
- `https://app.example.com/sign-in`
- `https://app.example.com/sign-up`

Create the OCR.space and Gemini credentials used by receipt processing.

## 2. Configure DNS

Create:

- `app.example.com` using the DNS record requested by Vercel
- `wa.example.com` as an `A` record pointing to the NovaCloud IPv4 address

Wait for `wa.example.com` to resolve before starting Caddy so certificate
issuance can complete.

## 3. Prepare NovaCloud

Use SSH keys, then install Docker Engine and the Compose plugin using the
[official Ubuntu instructions](https://docs.docker.com/engine/install/ubuntu/).
Enable Docker and verify Compose:

```bash
sudo systemctl enable --now docker
sudo docker run --rm hello-world
docker compose version
```

Ubuntu Server enables daily security updates through `unattended-upgrades` by
default. Confirm it is active:

```bash
systemctl status apt-daily-upgrade.timer
```

For extra headroom during Chromium startup, optionally create a 2 GB swap file:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Configure the firewall:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

After confirming key-based SSH works, disable password authentication. Do not
publish ports `2785` or `3099`; only Caddy should expose public ports.

Clone the repository and create the production environment:

```bash
cp .env.novacloud.example .env.novacloud
openssl rand -hex 32
chmod 600 .env.novacloud
```

Put the generated value in `OPENWA_API_KEY`. Fill in `WORKER_DOMAIN`, Supabase,
OCR.space, database, and bot settings. The same `OPENWA_API_KEY` must be added
to Vercel.

Validate and deploy:

```bash
docker compose --env-file .env.novacloud -f docker-compose.novacloud.yml config
docker compose --env-file .env.novacloud -f docker-compose.novacloud.yml pull
docker compose --env-file .env.novacloud -f docker-compose.novacloud.yml up -d --build
docker compose --env-file .env.novacloud -f docker-compose.novacloud.yml ps
```

All three services must report healthy. Inspect startup failures with:

```bash
docker compose --env-file .env.novacloud -f docker-compose.novacloud.yml logs --tail=200
```

The OpenWA entrypoint removes only stale Chromium `SingletonLock`,
`SingletonCookie`, and `SingletonSocket` files before startup. OpenWA writes
its API key to `/app/data/.api-key`; the worker reads that file through a
read-only mount of the persistent `openwa_data` volume. WhatsApp authentication
data remains in the same volume.

## 4. Configure Vercel

Connect the GitHub repository and deploy `main`. The committed `vercel.json`
places server functions in Singapore (`sin1`).

Set these production variables:

```text
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/dashboard
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL
DIRECT_URL
OCR_SPACE_API_KEY
GEMINI_API_KEY
GEMINI_MODEL
OPENWA_API_BASE_URL=https://wa.example.com/api
OPENWA_API_KEY
BAYARLAH_BOT_ADMIN_EMAILS
BAYARLAH_BOT_SESSION_NAME=bayarlah-bot
```

Incoming payment proofs are delivered to the worker-only webhook inside the
NovaCloud Docker network. No public Vercel payment-proof webhook is required.

## 5. Existing Production Database Cleanup

The application no longer uses the legacy per-user WhatsApp session columns.
Their removal is deliberately separate from deployment so an existing
production database remains compatible during observation.

First deploy the new application and worker code without running the cleanup
migration. Complete the smoke test in the next section and observe production
before changing the database.

Before the migration, create a Supabase backup or use `pg_dump` with the direct
database URL:

```bash
mkdir -p backups
pg_dump "$DIRECT_URL" --format=custom \
  --file="backups/supabase-before-legacy-cleanup-$(date +%Y%m%d-%H%M%S).dump"
```

Then run the idempotent cleanup:

```bash
npm run db:cleanup-legacy
```

This drops only the obsolete `User` WhatsApp-link fields and
`profileCompletedAt`. It does not remove users, friends, expenses, reminders,
bot sessions, or payment proofs. After this migration, an older application
deployment that still expects those columns cannot be used without restoring
the database backup.

## 6. Smoke Test

Verify infrastructure:

```bash
curl -fsS https://wa.example.com/api/health
docker compose --env-file .env.novacloud -f docker-compose.novacloud.yml exec whatsapp-worker \
  node -e "require('http').get('http://localhost:3099/health', r => { console.log(r.statusCode); process.exit(r.statusCode === 200 ? 0 : 1) })"
```

Then verify the product flow:

1. Sign up and complete a profile with profile and DuitNow images.
2. Create a friend, manual expense, and receipt-assisted expense.
3. Visit `/admin/whatsapp-bot` using a configured admin email.
4. Link the dedicated WhatsApp phone.
5. Send a reminder and confirm the DuitNow QR arrives.
6. Reply with a payment proof and confirm it is stored and matched.
7. Restart the stack and confirm the WhatsApp session remains linked.

## 7. Backup, Update, And Roll Back

Never run `docker compose down -v`.

Before each NovaCloud update, back up the OpenWA volume:

```bash
mkdir -p backups
docker run --rm \
  -v bayarlah_openwa_data:/data:ro \
  -v "$PWD/backups":/backup \
  alpine:3.21 \
  tar -czf "/backup/openwa-$(date +%Y%m%d-%H%M%S).tgz" -C /data .
```

Deploy an update:

```bash
git pull --ff-only
docker compose --env-file .env.novacloud -f docker-compose.novacloud.yml pull
docker compose --env-file .env.novacloud -f docker-compose.novacloud.yml up -d --build
docker compose --env-file .env.novacloud -f docker-compose.novacloud.yml ps
```

For NovaCloud rollback, check out the previous known-good commit and run the
same `up -d --build` command without deleting volumes. For Vercel rollback,
promote the previous production deployment in the Vercel dashboard. This is
safe before the legacy database cleanup; afterward, roll forward or restore
the matching database backup before using an older application version.

Monitor `docker compose ps`, recent logs, `free -h`, and `df -h` before the
demo. The Compose configuration rotates each container log at 10 MB and keeps
three files.

## 8. NovaCloud Command Aliases

These aliases shorten common production commands. Add them to `~/.bashrc` on
the NovaCloud VM, then run `source ~/.bashrc`. Run them from the BayarLah
repository directory because they use relative Compose and environment paths.

```bash
alias blps='docker compose --env-file .env.novacloud -f docker-compose.novacloud.yml ps'
alias blrw='docker compose --env-file .env.novacloud -f docker-compose.novacloud.yml up -d --build whatsapp-worker'
alias blra='docker compose --env-file .env.novacloud -f docker-compose.novacloud.yml up -d --build'
alias blwlogs='docker compose --env-file .env.novacloud -f docker-compose.novacloud.yml logs -f --tail=200 whatsapp-worker'
alias blowalogs='docker compose --env-file .env.novacloud -f docker-compose.novacloud.yml logs -f --tail=200 openwa-api'
alias bllogs='docker compose --env-file .env.novacloud -f docker-compose.novacloud.yml logs -f --tail=200'
alias blrestart='docker compose --env-file .env.novacloud -f docker-compose.novacloud.yml restart whatsapp-worker'
alias blup='git pull --ff-only && docker compose --env-file .env.novacloud -f docker-compose.novacloud.yml pull && docker compose --env-file .env.novacloud -f docker-compose.novacloud.yml up -d --build'
```

- `blps`: show the current status and health of all production containers.
- `blrw`: rebuild and restart only the WhatsApp worker after worker code changes.
- `blra`: rebuild and restart the full NovaCloud stack.
- `blwlogs`: follow the latest WhatsApp worker logs.
- `blowalogs`: follow the latest OpenWA API logs.
- `bllogs`: follow logs from every service.
- `blrestart`: restart the WhatsApp worker without rebuilding its image.
- `blup`: pull the latest Git commit and container images, then rebuild the
  full stack.

Database migrations are not included in these aliases. Apply
`supabase/migrations/20260607_add_whatsapp_inbound_idempotency.sql` manually
through the Supabase SQL Editor before deploying the worker version that uses
the `WhatsappInboundMessage` table.
