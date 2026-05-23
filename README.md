# BayarLah

BayarLah is a Malaysian fintech hackathon app for recording group expenses and helping collectors remind friends to pay back through DuitNow details. It supports profile onboarding, friend management, manual expense entry, and receipt-assisted expense creation.

## Current Features

- Clerk sign-up/sign-in with protected app routes.
- Profile onboarding with full name, phone, Clerk email, optional profile photo, DuitNow ID, DuitNow QR, and WhatsApp Web linking.
- Friend management with Malaysian phone normalization toward `+60`.
- Manual expenses with equal split and custom amount modes.
- Receipt upload/camera capture on mobile using native file input.
- Browser-side image compression before OCR upload.
- OCR.space text extraction followed by Gemini Flash receipt parsing.
- Editable receipt review for items, tax, service charge, rounding, and total.
- Receipt split modes:
  - Equal split: split the whole receipt total across collector plus selected friends.
  - Custom amount: match parsed item units to collector/friends, then allocate tax/service/rounding proportionally.
- Saved receipt item history and participant allocations without permanently storing receipt photos.
- Reminder scheduling copied to every friend share for an expense.
- Vercel-safe "Send now" queueing for WhatsApp reminders.
- NovaCloud-only OpenWA worker for per-user WhatsApp Web linking and demo sends with DuitNow QR images.
- Delete saved friends and expenses.

## Stack

- Next.js 15 App Router
- React 19
- TypeScript
- Tailwind CSS v4
- Clerk authentication
- Supabase Postgres and Storage
- Prisma ORM
- OCR.space API
- Gemini API
- OpenWA worker on NovaCloud for WhatsApp demo sending

## App Routes

- `/` - landing page
- `/sign-in` - Clerk sign in
- `/sign-up` - Clerk sign up
- `/dashboard` - protected dashboard
- `/profile` - profile completion and editing
- `/friends` - saved WhatsApp contact-style friends
- `/expenses` - manual and receipt-assisted expense creation
- `/expenses/receipt` - redirects to the receipt tab on `/expenses`

## Setup

Install dependencies:

```bash
npm install --legacy-peer-deps
```

Create environment variables from the example file:

```bash
copy .env.example .env.local
```

Fill in the required values in `.env.local`.

Generate the Prisma client:

```bash
npx prisma generate
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk browser key |
| `CLERK_SECRET_KEY` | Clerk server key |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key for server uploads |
| `DATABASE_URL` | Supabase pooled Postgres URL for Prisma |
| `DIRECT_URL` | Supabase direct Postgres URL for migrations |
| `OCR_SPACE_API_KEY` | OCR.space key for receipt text extraction |
| `GEMINI_API_KEY` | Gemini key for receipt parsing |
| `GEMINI_MODEL` | Gemini model, defaults to `gemini-2.5-flash` |
| `WHATSAPP_WORKER_BASE_URL` | Private NovaCloud worker API URL used by the Vercel app |
| `WHATSAPP_WORKER_API_TOKEN` | Shared secret for Vercel-to-worker API calls |
| `WHATSAPP_WORKER_API_PORT` | NovaCloud worker API port, defaults to `3010` |
| `WHATSAPP_SESSION_DATA_PATH` | Persistent OpenWA session directory on the worker VM |
| `WHATSAPP_CHROME_PATH` | Optional Chrome/Chromium executable path for the NovaCloud worker |
| `WHATSAPP_HEADLESS` | Set to `false` to show Chrome during local WhatsApp login |
| `WHATSAPP_EZQR` | Optional OpenWA remote QR helper for first login |
| `WHATSAPP_LOG_EMPTY_POLLS` | Set to `true` to log when no due reminders are found |
| `WHATSAPP_WORKER_INTERVAL_MS` | NovaCloud worker polling interval |
| `WHATSAPP_RETRY_DELAY_MS` | Retry delay after failed WhatsApp sends |
| `WHATSAPP_MAX_PER_RUN` | Maximum due reminders per worker poll |

## Database

The Prisma schema lives in `prisma/schema.prisma`.

For Supabase SQL setup, use the scripts in `supabase/`:

- user profile fields and storage buckets
- friends
- expenses and expense shares
- receipt item history and receipt item allocations

After changing the Prisma schema, run:

```bash
npx prisma validate
npx prisma generate
```

## Receipt Flow

Receipt photos are temporary inputs only. The browser compresses the uploaded or captured image, sends it to the server action, OCR.space extracts text, and Gemini converts the OCR text into editable structured data.

When the user saves, BayarLah stores the final expense, receipt item history, and split allocations. It does not store the original receipt image.

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run whatsapp:worker
```

## WhatsApp Worker Deployment

The Next.js app can stay on Vercel. Do not install or import OpenWA in the Vercel runtime path.

On the NovaCloud VM, install the root app dependencies, generate Prisma, then install the worker package:

```bash
npm install --legacy-peer-deps
npx prisma generate
npm --prefix workers/whatsapp install
npm run whatsapp:worker
```

Run the worker with PM2 or systemd so the WhatsApp Web sessions stay alive. The worker exposes a private API for the Vercel app to start per-user sessions and fetch QR/status, then polls active due reminders from Supabase and sends the collector's DuitNow QR as an image with the reminder caption.

Set the same `WHATSAPP_WORKER_API_TOKEN` in Vercel and on NovaCloud. Point Vercel's `WHATSAPP_WORKER_BASE_URL` at the worker, for example `https://worker.example.com`.

If Puppeteer cannot find its bundled browser, point the worker at the system Chrome/Chromium binary:

```bash
# Windows PowerShell
$env:WHATSAPP_CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
npm run whatsapp:worker

# Windows PowerShell first-login helper
$env:WHATSAPP_HEADLESS="false"
$env:WHATSAPP_CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
npm run whatsapp:worker

# Ubuntu/NovaCloud example
WHATSAPP_CHROME_PATH=/usr/bin/chromium-browser npm run whatsapp:worker
```

## Roadmap

- Paid/unpaid tracking.
- Dashboard summary for receivables, recent expenses, and reminder status.
