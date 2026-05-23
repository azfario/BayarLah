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
- NovaCloud OpenWA Gateway integration for per-user WhatsApp Web linking and demo sends with DuitNow QR images.
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
- OpenWA Gateway plus a lightweight reminder poller on NovaCloud for WhatsApp demo sending

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

For the local WhatsApp reminder demo, use the one-command launcher instead:

```bash
npm run dev:demo
```

This loads `.env.local`, starts the Next.js app, starts the OpenWA Gateway plus reminder poller through Docker Compose, applies local demo defaults, and stops the processes on `Ctrl+C`.

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
| `OPENWA_API_BASE_URL` | OpenWA Gateway API URL used by the app and reminder poller |
| `OPENWA_API_KEY` | Shared secret for BayarLah-to-OpenWA API calls |
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
npm run dev:demo
npm run docker:demo
npm run docker:worker
npm run docker:novacloud
npm run build
npm run lint
npm run whatsapp:worker
```

Use `npm run dev:demo` when testing the full reminder flow locally:

1. Open [http://localhost:3000](http://localhost:3000).
2. Complete profile onboarding and click **Start WhatsApp link**.
3. Scan the WhatsApp QR code from your phone.
4. Create an expense with a real recipient phone.
5. Click **Send now** and confirm the worker logs a `SENT` attempt.

Use Docker for the most reliable local WhatsApp test, especially on Windows:

```bash
docker compose -f docker-compose.demo.yml up --build
```

or through npm:

```bash
npm run docker:demo
```

This starts the app at [http://localhost:3000](http://localhost:3000), OpenWA Gateway at [http://localhost:2785/api](http://localhost:2785/api), and the reminder poller. WhatsApp Web session files persist in the `openwa_data` Docker volume.

Local demo Compose runs OpenWA in development mode, where its API key is `dev-admin-key`.

## WhatsApp Worker Deployment

The Next.js app can stay on Vercel. Do not run browser automation in Vercel; keep the long-lived OpenWA Gateway on NovaCloud.

The Next.js app stays Vercel-native in production. Docker is for the NovaCloud OpenWA Gateway, its persistent session data, and the lightweight reminder poller.

For local Docker worker-only testing:

```bash
docker compose -f docker-compose.worker.yml up --build
npm run dev
```

For NovaCloud deployment, copy `.env.novacloud.example` to `.env.novacloud`, set `WORKER_DOMAIN` and database URLs, then run:

```bash
docker compose -f docker-compose.novacloud.yml up -d --build
```

The NovaCloud compose setup runs OpenWA Gateway on the private Docker network, builds the BayarLah reminder poller, exposes only Caddy on ports `80/443`, and stores WhatsApp Web sessions in the persistent `openwa_data` volume.

On first boot, OpenWA creates its API key in the `openwa_data` volume at `/app/data/.api-key`. Copy that generated value into Vercel as `OPENWA_API_KEY`; the NovaCloud poller reads it from the shared volume.

Set these Vercel environment variables to connect the app to NovaCloud:

```bash
OPENWA_API_BASE_URL=https://your-worker-domain/api
OPENWA_API_KEY=generated-openwa-key
```

For a non-Docker VM setup, install the root app dependencies, generate Prisma, then install the worker package:

```bash
npm install --legacy-peer-deps
npx prisma generate
npm --prefix workers/whatsapp install
npm run whatsapp:worker
```

Run the poller with PM2 or systemd only if you are not using Docker Compose. OpenWA Gateway must remain long-lived with persistent `/app/data` storage so WhatsApp Web sessions survive restarts.

## Roadmap

- Paid/unpaid tracking.
- Dashboard summary for receivables, recent expenses, and reminder status.
