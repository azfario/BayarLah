# CLAUDE-STATUS.md

## Project Goal

Build a hackathon starter template: Next.js 15 (App Router, TypeScript) + Tailwind CSS + Clerk auth + Supabase (Postgres) + Prisma ORM. Minimal, clone-and-run ready.

## Current Status

**Phase:** Template complete. Ready for user to add credentials and run `prisma migrate dev`.

## Last Completed

- Scaffolded Next.js 15 with App Router, TypeScript, Tailwind v4, Turbopack
- Installed Clerk v6, Supabase JS client, Prisma v5
- Created `prisma/schema.prisma` (User model: clerkId, email) + `lib/db.ts` singleton
- Created `lib/supabase/client.ts` and `lib/supabase/server.ts`
- Configured `middleware.ts` — protects `/dashboard`, redirects unauthenticated → `/sign-in`
- Created sign-in and sign-up pages using Clerk catch-all routes
- Created `app/dashboard/page.tsx` showing logged-in user email
- Created `lib/actions/user.ts` with `ensureUserInDB()` server action (upsert on login)
- Created `.env.example` with all required keys
- Created `README.md` with setup instructions
- Build passes (`npm run build`) — all routes dynamic

## In Progress

- (nothing — waiting for user to configure env and run migration)

## Next Task

1. User copies `.env.example` → `.env.local` and fills in credentials
2. Run `npx prisma migrate dev --name init` (requires `DIRECT_URL`)
3. Run `npm run dev` and test sign-in → dashboard → upsert flow

## Deferred Problems

- `--legacy-peer-deps` used for install — Clerk v6 peer dep requires React `~19.1.4`, installed `19.1.0`. Minor patch diff, functionally identical. Revisit if Clerk v6.x ships a fix.
- Prisma v7 (installed by default) broke the `url`/`directUrl` schema fields — downgraded to v5. If upgrading to Prisma v7 later, see DECISIONS.md.

## Open Questions

- (none)
