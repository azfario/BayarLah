# BayarLah

BayarLah is a group expense tracker that helps collectors send DuitNow payment reminders through a WhatsApp bot. Users can add friends, split expenses manually or from a scanned receipt, schedule reminders, and track payment proofs — all from a web dashboard.

## Technologies Used

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router, Turbopack) |
| Language | TypeScript (strict mode) |
| UI | React 19, Tailwind CSS v4 |
| Auth | Clerk |
| Database | PostgreSQL via Supabase (Prisma ORM) |
| File Storage | Supabase Storage |
| WhatsApp Gateway | OpenWA (self-hosted Docker) |
| Receipt OCR | OCR.space API |
| Receipt Parsing | Google Gemini API (`gemini-2.5-flash`) |
| Worker Runtime | Node.js + tsx (separate Docker container) |
| Deployment | Vercel (app) + NovaCloud VPS (worker + OpenWA) |

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser  →  Next.js App (Vercel)                           │
│               ├── app/          Next.js App Router pages    │
│               ├── components/   Shared UI components        │
│               ├── lib/actions/  Server actions (DB + APIs)  │
│               └── middleware.ts Clerk auth guard            │
└──────────────────────────┬──────────────────────────────────┘
                           │ Prisma (pooled via Supabase PgBouncer)
                    ┌──────▼──────┐
                    │  PostgreSQL  │
                    │  (Supabase)  │
                    └──────┬──────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  WhatsApp Worker  (NovaCloud VPS / Docker)                   │
│   workers/whatsapp/worker.ts                                 │
│    ├── Polls due reminders → sends via OpenWA               │
│    ├── Webhook server receives inbound messages              │
│    └── Payment proof images → OCR + Gemini → matched        │
└──────────────────────────┬──────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │   OpenWA    │
                    │  (Docker)   │
                    └─────────────┘
```

Key data flows:
- **Expense creation** — manual entry or receipt upload → OCR.space extracts text → Gemini parses line items → user allocates items to friends
- **Reminders** — user schedules reminder frequency per expense → worker polls every minute → sends WhatsApp message with DuitNow QR via OpenWA
- **Payment proof** — payer sends receipt image to WhatsApp bot → OpenWA webhook → worker extracts amount + reference via Gemini → matched against open expense shares → marked paid

## Setup

### Prerequisites

- Node.js ≥ 20
- A [Supabase](https://supabase.com) project (PostgreSQL + Storage)
- A [Clerk](https://clerk.com) application
- An [OCR.space](https://ocr.space) API key
- A [Google AI Studio](https://aistudio.google.com) API key (Gemini)
- Docker (for the OpenWA gateway)

### 1. Install dependencies

```bash
npm ci --legacy-peer-deps
npm --prefix workers/whatsapp ci
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Fill in all values in `.env.local`. Required keys:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | Clerk auth |
| `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Supabase storage |
| `DATABASE_URL` / `DIRECT_URL` | Prisma (pooled + direct) |
| `OCR_SPACE_API_KEY` | Receipt OCR |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | Receipt parsing + payment proof matching |
| `OPENWA_API_BASE_URL` / `OPENWA_API_KEY` | WhatsApp gateway |

### 3. Set up the database

```bash
npm run db:setup
```

This runs Prisma migrations against `DIRECT_URL`.

### 4. Start development

App only:

```bash
npm run dev
```

App + OpenWA gateway + worker together (requires Docker):

```bash
npm run dev:demo
```

Open [http://localhost:3000](http://localhost:3000).

## Verification

Run lint, typecheck, tests, and build in one pass:

```bash
npm run verify
```

Run tests only:

```bash
npm test
```

## Deployment

See [deploy/README.md](deploy/README.md) for the full Vercel + Supabase + Clerk + NovaCloud runbook.

> **Note:** Database cleanup migrations (`npm run db:cleanup-legacy`) are intentionally separate from normal setup. Do not run them against production without following the backup and staged rollout steps in the deployment runbook.

## AI Tools Used

| Tool | How it was used |
|---|---|
| **Google Gemini** (`gemini-2.5-flash`) | Parses raw OCR text from receipts into structured line items; extracts amount and reference number from inbound payment proof images |
| **OCR.space** | Converts receipt image uploads to raw text before Gemini parsing |
| **Claude (Anthropic)** | Used as a coding assistant throughout development — code writing, debugging, and writing tests, every architectural decision & design is owned by us |
