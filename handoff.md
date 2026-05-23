# BayarLah Handoff

## Project Overview

BayarLah is a Malaysian fintech hackathon app for recording shared expenses and helping collectors remind friends to pay back through DuitNow details.

The current product flow is:

1. User signs up with Clerk.
2. User completes a BayarLah profile with DuitNow details and links WhatsApp Web.
3. User saves friends as WhatsApp-style Malaysian contacts.
4. User creates manual or receipt-assisted expenses.
5. The Vercel app can queue due WhatsApp reminders; a NovaCloud worker sends them through the collector's linked OpenWA session with the collector's DuitNow details.

## Current Completed Features

- Clerk authentication with protected app routes.
- Profile onboarding and editing:
  - full name
  - phone number
  - Clerk email
  - optional profile photo
  - mandatory DuitNow ID type/value
  - mandatory DuitNow QR image
  - mandatory WhatsApp Web link through the NovaCloud worker QR API
- Friend management:
  - add friends by name and phone
  - normalize Malaysian phone numbers toward `+60`
  - block duplicate phones per user
  - delete saved friends
- Manual expense creation:
  - equal split across collector plus selected friends
  - custom owed amount per friend
  - collector's own portion tracked
  - custom mismatch warning does not block save
  - inline friend creation
  - saved friend search/dropdown
  - delete saved expenses
- Receipt-assisted expense creation inside `/expenses`:
  - mobile camera capture using native file input
  - desktop file upload
  - browser-side image compression before upload
  - temporary OCR input only; receipt images are not stored
  - OCR.space image-to-text extraction
  - Gemini Flash parsing from OCR text into structured receipt data
  - editable receipt items, quantity, price, tax, service charge, rounding, and total
  - receipt equal split mode for whole-receipt equal splitting
  - receipt custom mode for matching parsed item units to collector/friends
  - proportional allocation of tax/service/rounding for custom receipt splits
  - saved receipt item history and participant allocations
- Reminder scheduling:
  - one reminder cadence per manual or receipt expense
  - cadence copied to every friend share
  - active reminder state with next reminder date
- WhatsApp notification demo path:
  - one-command local reminder demo via `npm run dev:demo`
  - full local Docker demo via `docker compose -f docker-compose.demo.yml up --build`
  - Vercel-safe "Send now" queueing on recent expense shares
  - NovaCloud-only OpenWA worker command
  - Dockerized NovaCloud worker option with persistent session volumes and Caddy HTTPS
  - per-user WhatsApp Web session linking during profile onboarding
  - reminder attempt logging with sent/failed state
  - worker sends the collector's DuitNow QR image with the reminder message

## Architecture

- Framework: Next.js 15 App Router with React 19 and TypeScript.
- Styling: Tailwind CSS v4.
- Auth: Clerk.
- Database: Supabase Postgres through Prisma.
- Storage: Supabase Storage for profile photos and DuitNow QR images.
- Receipt OCR: OCR.space.
- Receipt parsing: Gemini API, default model `gemini-2.5-flash`.

Main routes:

- `/` - landing page
- `/sign-in` - Clerk sign in
- `/sign-up` - Clerk sign up
- `/dashboard` - protected dashboard
- `/profile` - profile completion and editing
- `/friends` - saved friends
- `/expenses` - manual expenses and receipt upload tab
- `/expenses/receipt` - redirects to `/expenses?mode=receipt`

Main data models:

- `User`
- `Friend`
- `Expense`
- `ExpenseShare`
- `ReceiptItem`
- `ReceiptItemAllocation`

## Environment And Config

Required environment variables are documented in `.env.example` and `README.md`.

Important variables:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- `DIRECT_URL`
- `OCR_SPACE_API_KEY`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `WHATSAPP_WORKER_BASE_URL`
- `WHATSAPP_WORKER_API_TOKEN`
- `WHATSAPP_WORKER_API_PORT`
- `WHATSAPP_SESSION_DATA_PATH`
- `WHATSAPP_CHROME_PATH`
- `WORKER_DOMAIN` for NovaCloud Caddy only

Notes:

- Do not commit actual `.env` or `.env.local` values.
- Do not commit `.env.novacloud`; use `.env.novacloud.example` as the VM template.
- Receipt photos are temporary and should not be persisted.
- Profile photos and DuitNow QR images are stored in public Supabase Storage buckets.
- Use `npm run dev:demo` for local end-to-end reminder testing. It starts the app and worker together from `.env.local`.
- Use `docker compose -f docker-compose.demo.yml up --build` for the most reliable local WhatsApp test on Windows because OpenWA then runs on Linux/Node 20/Chromium.
- The app is intended for Vercel deployment and mobile-first use.
- Docker is intended for the NovaCloud OpenWA worker and optional local full-demo testing, not for Vercel production.

## Verification Commands

Run these from `C:\Users\User\Desktop\hazkathon\BayarLah`:

```powershell
npx.cmd prisma validate
npx.cmd prisma generate
npm.cmd run lint
npm.cmd run build
node --check scripts/dev-demo.mjs
docker compose -f docker-compose.demo.yml config
docker compose -f docker-compose.worker.yml config
```

Known verification status from the current build:

- Prisma validation passed.
- Prisma generate passed.
- `node --check scripts/dev-demo.mjs` passed.
- Lint passed with existing Next.js image optimization warnings for `<img>`.
- Build passed with the same image warnings and a Node deprecation warning.
- Docker could not be built in the local environment because Docker was not installed or on PATH.

## Known Notes

- On Windows, a running Next.js dev server can lock Prisma client files. Stop Node processes before running `npx.cmd prisma generate` if generation fails because files are locked.
- Plain `git` is not available on PATH in this environment. Use:

```powershell
& 'C:\Program Files\Git\cmd\git.exe' status
```

- The repository root is `C:\Users\User\Desktop\hazkathon\BayarLah`.

## Next Recommended Milestones

- Paid/unpaid tracking:
  - mark shares as paid
  - show outstanding vs settled amounts
- Dashboard polish:
  - show receivables
  - show recent expenses
  - show reminder status
  - keep mobile-first demo flow fast and clear

## Working Assumptions

- The next agent should preserve the current simple hackathon scope.
- Do not add speculative features beyond the next milestone being requested.
- Keep changes surgical and verify with the commands above.
- Ask the user before changing schema behavior, notification provider choices, or deployment assumptions.
- Keep OpenWA imports out of the Vercel app runtime. The worker lives under `workers/whatsapp`, exposes the private QR/status API, and should run on NovaCloud.
