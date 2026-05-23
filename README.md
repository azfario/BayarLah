# BayarLah

BayarLah is a Malaysian fintech hackathon app for recording group expenses and helping collectors remind friends to pay back through DuitNow details. It supports profile onboarding, friend management, manual expense entry, and receipt-assisted expense creation.

## Current Features

- Clerk sign-up/sign-in with protected app routes.
- Profile onboarding with full name, phone, Clerk email, optional profile photo, DuitNow ID, and DuitNow QR.
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
```

## Roadmap

- Reminder scheduling for unpaid debts.
- WhatsApp/OpenWA notification sending.
- Paid/unpaid tracking.
- Dashboard summary for receivables, recent expenses, and reminder status.
