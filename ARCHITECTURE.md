# ARCHITECTURE.md

## Overview

Hackathon starter template. Auth via Clerk, data in Supabase Postgres via Prisma ORM, UI with Next.js 15 App Router + Tailwind CSS.

All DB access goes through Prisma — Supabase client exists as a helper for storage/realtime only. Clerk owns the auth session; Prisma `User` table mirrors Clerk user data for app-side queries.

## Key Components

### Auth Layer (Clerk)
- `middleware.ts` — route protection. `/dashboard(.*)` requires auth, everything else public.
- `app/sign-in/[[...sign-in]]/page.tsx` — Clerk `<SignIn />` component. Catch-all for OAuth callbacks.
- `app/sign-up/[[...sign-up]]/page.tsx` — Clerk `<SignUp />` component. Same catch-all pattern.
- `app/layout.tsx` — `<ClerkProvider>` wraps entire app at root.

### Data Layer (Prisma + Supabase)
- `prisma/schema.prisma` — User model (clerkId, email). Single table to start.
- `lib/db.ts` — Prisma client singleton (globalThis pattern for hot-reload safety).
- `lib/supabase/client.ts` — Browser-side Supabase client (anon key). `[ASSUMPTION]` Only needed if using Supabase storage or realtime later.
- `lib/supabase/server.ts` — Server-side Supabase client (service role key). `[ASSUMPTION]` Bypasses RLS intentionally since Prisma handles all DB queries.

### Server Actions
- `lib/actions/user.ts` — `ensureUserInDB()`. Upserts Clerk user into Prisma `User` table. Called on dashboard load.

### Pages
- `app/page.tsx` — Landing page. Shows sign-in link or dashboard link based on auth state.
- `app/dashboard/page.tsx` — Protected. Shows logged-in user email. Triggers user upsert.

## Data Flow

```
User visits /dashboard
    → middleware.ts checks auth (Clerk)
    → if unauthenticated → redirect to /sign-in
    → if authenticated → render dashboard server component
        → currentUser() fetches Clerk session
        → ensureUserInDB() upserts to Prisma User table
        → display email from Clerk session
```

```
Prisma ←→ Supabase Postgres (via DATABASE_URL, pooled)
Prisma migrations ←→ Supabase Postgres (via DIRECT_URL, direct connection)
```

## Modularity Goals

- Auth is fully Clerk-owned. Swapping auth = replace Clerk components + middleware. Prisma User model stays.
- DB access is fully Prisma-owned. Swapping DB = change `DATABASE_URL` + `schema.prisma` provider. No Supabase client coupling.
- `[ASSUMPTION]` Supabase client helpers are optional in v1. Included for hackathon teams that want storage/realtime without extra setup.
- `[ASSUMPTION]` No API routes needed yet — server actions + server components handle all data fetching.

## What Is Out of Scope

- Clerk ↔ Supabase JWT integration (RLS-aware queries)
- Supabase Auth (Clerk replaces this entirely)
- API routes / tRPC
- Testing setup
- CI/CD
- Deployment config (Vercel/other)
- Additional Prisma models beyond User
- UI component library (shadcn, etc.)
