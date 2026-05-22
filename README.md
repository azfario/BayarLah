# Hackathon Starter

Clone-and-build template. Auth, database, and ORM wired up out of the box.

## Stack

- **Next.js 15** — App Router, TypeScript, Turbopack
- **Tailwind CSS v4**
- **Clerk v6** — authentication (sign-in, sign-up, session)
- **Supabase** — Postgres database, storage/realtime helpers
- **Prisma v5** — ORM, migrations

## Prerequisites

- Node.js 20+
- A [Clerk](https://clerk.com) account and application
- A [Supabase](https://supabase.com) project

## Setup

```bash
# 1. Clone
git clone <your-repo-url>
cd hackathon-starter

# 2. Install dependencies
npm install --legacy-peer-deps

# 3. Configure environment
cp .env.example .env.local
# Fill in all values in .env.local

# 4. Generate Prisma client
npx prisma generate

# 5. Run migrations (requires DIRECT_URL set in .env.local)
npx prisma migrate dev --name init

# 6. Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

See `.env.example` for all required keys.

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk dashboard → API Keys |
| `CLERK_SECRET_KEY` | Clerk dashboard → API Keys |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase dashboard → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase dashboard → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → Project Settings → API |
| `DATABASE_URL` | Supabase → Project Settings → Database → Connection Pooling (port 6543) |
| `DIRECT_URL` | Supabase → Project Settings → Database → Direct connection (port 5432) |

## Folder Structure

```
app/
  page.tsx                      # Landing page
  layout.tsx                    # Root layout with ClerkProvider
  sign-in/[[...sign-in]]/       # Clerk sign-in page
  sign-up/[[...sign-up]]/       # Clerk sign-up page
  dashboard/                    # Protected route
components/                     # UI components (empty, add yours here)
lib/
  db.ts                         # Prisma client singleton
  actions/user.ts               # Server action: upsert user on login
  supabase/
    client.ts                   # Browser Supabase client
    server.ts                   # Server Supabase client (service role)
prisma/
  schema.prisma                 # Database schema
middleware.ts                   # Clerk route protection
```

## How Auth Works

1. `middleware.ts` intercepts all requests to `/dashboard` — unauthenticated users are redirected to `/sign-in`
2. On dashboard load, `ensureUserInDB()` upserts the Clerk user into the Prisma `User` table (idempotent — safe to call every render)
3. Supabase client helpers are available for storage/realtime; all DB queries use Prisma
