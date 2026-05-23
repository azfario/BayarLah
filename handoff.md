# BayarLah Handoff For Claude Code On Linux

This handoff is for continuing BayarLah on a Linux machine. The project is a Malaysian shared-expense hackathon app with a split deployment target:

- Vercel hosts the Next.js app.
- Supabase hosts Postgres and public storage.
- IP ServerOne NovaCloud runs a long-lived Dockerized OpenWA Gateway plus a lightweight BayarLah reminder poller.

The most important rule: keep browser automation and worker-only runtime concerns out of the Vercel app runtime. Vercel should talk to OpenWA Gateway only through server-side REST calls.

## Current Product Flow

1. User signs in with Clerk.
2. User completes profile details, uploads a DuitNow QR image, and links WhatsApp Web.
3. User saves friends with Malaysian phone numbers.
4. User creates manual or receipt-assisted shared expenses.
5. User picks one reminder cadence for the whole expense.
6. The app stores active reminder schedules on each friend share.
7. The app can queue a demo reminder with "Send now".
8. The NovaCloud worker sends due reminders from the collector's linked WhatsApp session.

## What Is Already Built

- Clerk authentication and protected app routes.
- Profile onboarding/editing with:
  - full name, phone, email, optional profile photo
  - required DuitNow ID and DuitNow QR
  - required WhatsApp Web linking status
- Per-user WhatsApp linking:
  - `WhatsappLinkStatus`: `NOT_LINKED`, `LINKING`, `LINKED`, `FAILED`
  - server action creates and starts a per-user OpenWA Gateway session
  - app polls session status through a Vercel-safe route
  - changing profile phone resets WhatsApp linking
- Friend management:
  - add/delete friends
  - Malaysian phone normalization
  - duplicate phone blocking per user
- Manual expenses:
  - equal split and custom amount split
  - inline friend creation
  - saved friend picker/search
  - reminder picker before save
- Receipt-assisted expenses:
  - camera/file upload
  - browser-side image compression
  - OCR.space extraction
  - Gemini parsing
  - editable receipt items and allocations
  - equal and custom receipt split modes
  - reminder picker before save
- Reminder scheduling:
  - one cadence per expense
  - copied to every generated `ExpenseShare`
  - hours range `1-24`, days range `1-30`
  - `nextReminderAt = server now + selected interval`
- WhatsApp notification path:
  - `WhatsappReminderAttempt` logging
  - "Send now" server action queues selected shares
  - worker polls due `ExpenseShare` rows
  - worker sends reminder text and collector DuitNow QR
  - success advances `lastReminderAt` and `nextReminderAt`
  - failure logs error and delays retry
- Docker:
  - full local demo compose: app plus OpenWA Gateway plus reminder poller
  - worker-only compose for local/NovaCloud-style OpenWA and poller runs
  - NovaCloud compose with Caddy HTTPS edge

## Important Files

- `prisma/schema.prisma`
  - Source of truth for current Prisma models and enums.
- `supabase/profile-setup.sql`
  - Idempotent Supabase setup SQL matching the current schema.
- `lib/reminders.ts`
  - Reminder range validation, parsing, display, and next-date helpers.
- `lib/whatsapp.ts`
  - Phone/chat ID helper and reminder message helper.
- `lib/openwa.ts`
  - Vercel-safe HTTP client for OpenWA Gateway.
- `lib/actions/profile.ts`
  - Profile save and WhatsApp linking server actions.
- `lib/actions/expenses.ts`
  - Expense create/delete/send-now actions.
- `components/ReminderFrequencyPicker.tsx`
  - Reusable two-column wheel-style reminder picker.
- `components/WhatsAppLinkPanel.tsx`
  - Client UI for start-link and QR/status polling.
- `app/api/whatsapp-link/status/route.ts`
  - Browser-safe polling route that proxies worker status.
- `app/profile/page.tsx`
  - Profile onboarding/editing page.
- `app/expenses/page.tsx`
  - Recent expenses, reminder status, and "Send now" control.
- `workers/whatsapp/worker.ts`
  - Lightweight reminder polling loop and OpenWA Gateway sender.
- `workers/whatsapp/Dockerfile`
  - Linux reminder poller image with Node 20.
- `docker-compose.demo.yml`
  - Full local Docker demo.
- `docker-compose.worker.yml`
  - Worker-only local Docker run.
- `docker-compose.novacloud.yml`
  - NovaCloud worker plus Caddy reverse proxy.
- `deploy/Caddyfile`
  - Caddy reverse proxy to OpenWA Gateway.

## Linux Setup

Use Node 20 LTS for BayarLah. OpenWA Gateway runs in its own Docker image on NovaCloud with persistent `/app/data` storage.

Recommended first commands:

```bash
git status --short
node --version
npm --version
docker --version
docker compose version
npm ci --legacy-peer-deps
npm --prefix workers/whatsapp ci --legacy-peer-deps
npx prisma generate
```

Create `.env.local` from `.env.example` and fill real values. Do not commit real env files.

Required app values:

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
DIRECT_URL=
OCR_SPACE_API_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
OPENWA_API_BASE_URL=http://localhost:2785/api
OPENWA_API_KEY=dev-admin-key
```

Required worker values:

```bash
DATABASE_URL=
DIRECT_URL=
OPENWA_API_BASE_URL=http://openwa-api:2785/api
OPENWA_API_KEY=dev-admin-key
WHATSAPP_WORKER_INTERVAL_MS=5000
WHATSAPP_RETRY_DELAY_MS=60000
WHATSAPP_MAX_PER_RUN=20
```

For NovaCloud, copy `.env.novacloud.example` to `.env.novacloud` on the VM and set:

```bash
WORKER_DOMAIN=your-worker-domain.example.com
DATABASE_URL=
DIRECT_URL=
```

Vercel must use OpenWA's generated API key and the public HTTPS gateway URL:

```bash
OPENWA_API_BASE_URL=https://your-worker-domain.example.com/api
OPENWA_API_KEY=generated-openwa-key
```

## Verification Commands

Run these from the repo root on Linux:

```bash
npx prisma validate
npx prisma generate
npm run lint
npm run build
node --check scripts/dev-demo.mjs
docker compose -f docker-compose.demo.yml config
docker compose -f docker-compose.worker.yml config
cp .env.novacloud.example .env.novacloud
docker compose -f docker-compose.novacloud.yml config
rm .env.novacloud
```

Known status from the Windows session before this Linux handoff:

- Prisma validate passed.
- Prisma generate passed.
- Lint passed with existing Next.js `<img>` optimization warnings.
- Build passed with the same image warnings and a Node deprecation warning.
- `node --check scripts/dev-demo.mjs` passed.
- Docker compose config passed for demo, worker, and NovaCloud files.
- Docker image build was not completed in that Windows session because Docker Desktop daemon/permissions were not ready after install. Linux should re-run the Docker build.

## Local Demo Options

Best Linux path for end-to-end testing:

```bash
docker compose -f docker-compose.demo.yml up --build
```

Then open:

```text
http://localhost:3000
```

This starts:

- Next.js app on port `3000`
- OpenWA Gateway on port `2785`
- reminder poller on the private Docker network
- persistent OpenWA `/app/data` volume

Worker-only local test:

```bash
docker compose -f docker-compose.worker.yml up --build
npm run dev
```

For host app plus Docker OpenWA mode, `.env.local` should include:

```bash
OPENWA_API_BASE_URL=http://localhost:2785/api
OPENWA_API_KEY=dev-admin-key
```

Non-Docker local demo still exists:

```bash
npm run dev:demo
```

Prefer Docker for WhatsApp testing because it avoids native Windows/OpenWA issues and matches the NovaCloud deployment better.

## Manual WhatsApp Send Test

1. Start the full Docker demo.
2. Open `http://localhost:3000`.
3. Sign in or sign up through Clerk.
4. Complete the profile with:
   - phone number
   - DuitNow details
   - DuitNow QR image
5. Click "Start WhatsApp link".
6. Scan the QR with WhatsApp mobile.
7. Wait for the profile UI to show linked status.
8. Add a friend with a real WhatsApp phone number.
9. Create a manual or receipt expense with an active reminder cadence.
10. In recent expenses, click "Send now" for that friend share.
11. Confirm the recipient receives the WhatsApp reminder and QR image.
12. Confirm `WhatsappReminderAttempt.status = SENT` in Supabase/Prisma.
13. Confirm `lastReminderAt` is set and `nextReminderAt` advances.

Useful worker logs:

```bash
docker compose -f docker-compose.demo.yml logs -f whatsapp-worker
docker compose -f docker-compose.worker.yml logs -f whatsapp-worker
docker compose -f docker-compose.novacloud.yml logs -f whatsapp-worker
```

## NovaCloud Deployment Shape

Production target remains split:

- Vercel:
  - Next.js app
  - Clerk auth
  - server actions
  - Prisma through Supabase pooled `DATABASE_URL`
  - no OpenWA imports
- NovaCloud:
  - Docker OpenWA Gateway container
  - Docker reminder poller container
  - Caddy reverse proxy
  - persistent OpenWA `/app/data` volume
  - OpenWA API protected by `X-API-Key`
  - poller can read the generated OpenWA key from `/openwa-data/.api-key`
- Supabase:
  - Postgres
  - public storage buckets for profile images and DuitNow QR images

NovaCloud command:

```bash
docker compose -f docker-compose.novacloud.yml up -d --build
```

Only expose ports `80` and `443` publicly. OpenWA's container port `2785` should remain internal behind Caddy.

Health check:

```bash
curl -H "X-API-Key: $OPENWA_API_KEY" \
  https://your-worker-domain.example.com/api/health
```

## OpenWA Gateway API

The Vercel app and reminder poller talk to OpenWA Gateway through `lib/openwa.ts`.

Main endpoints used:

- `POST /api/sessions`
- `POST /api/sessions/:sessionId/start`
- `GET /api/sessions/:sessionId`
- `GET /api/sessions/:sessionId/qr`
- `POST /api/sessions/:sessionId/messages/send-image`

All requests require:

```text
X-API-Key: OPENWA_API_KEY
```

Never expose this token to browser code.

## Database Notes

Current Prisma models include:

- `User.whatsappLinkStatus`
- `User.whatsappSessionId`
- `User.whatsappLinkedPhone`
- `User.whatsappLinkedAt`
- `User.whatsappLinkError`
- `ExpenseShare.reminderFrequencyValue`
- `ExpenseShare.reminderFrequencyUnit`
- `ExpenseShare.reminderStatus`
- `ExpenseShare.nextReminderAt`
- `ExpenseShare.lastReminderAt`
- `WhatsappReminderAttempt`

If schema changes are made, update both:

- `prisma/schema.prisma`
- `supabase/profile-setup.sql`

Then run:

```bash
npx prisma validate
npx prisma generate
```

## Known Caveats

- OpenWA is a hackathon/demo sender. It may break if WhatsApp Web changes.
- Official WhatsApp Business Cloud API is the later production migration path.
- The browser must never receive the OpenWA API key.
- Supabase storage buckets for profile photos and DuitNow QR images must exist and be public for the current demo flow.
- Receipt photos should remain temporary and should not be persisted.
- The local Docker demo relies on real Clerk/Supabase/OCR/Gemini values in `.env.local`; Postgres is not containerized.
- Existing lint/build warnings are mostly Next.js `<img>` optimization warnings.

## Suggested Next Work

Immediate Linux continuation:

1. Run Docker compose validation and full Docker demo build.
2. Complete the WhatsApp QR link flow through OpenWA Gateway.
3. Test "Send now" end to end with a real phone number.
4. Confirm attempt logging and reminder date advancement in Supabase.
5. Deploy the NovaCloud compose stack and point Vercel env vars to the Caddy HTTPS URL.

Product milestones still open:

- Paid/unpaid tracking for each share.
- Dashboard polish:
  - outstanding receivables
  - settled vs unpaid totals
  - recent expenses
  - clearer reminder status
  - mobile-first hackathon demo flow

## Claude Code Working Rules

- Start with `git status --short`.
- Preserve existing user changes.
- Keep edits scoped.
- Prefer existing project patterns.
- Do not add browser automation imports to the Vercel app runtime.
- Use Docker for worker verification on Linux.
- Run the verification commands after code changes.
- Ask before changing deployment assumptions, schema semantics, or notification provider choices.
