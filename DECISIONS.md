# DECISIONS.md

> **This file is append-only.** Do not edit or remove past entries. New decisions go at the bottom.

---

## 2026-05-01 — Next.js 15 instead of Next.js 14

**Why:** Clerk v7 dropped Next.js 14 support entirely. Clerk v6 (latest stable, well-documented) supports both 14 and 15. Using Next.js 15 avoids version ceiling issues and gives access to latest App Router improvements.

**Alternatives Considered:**
- Next.js 14 + Clerk v6 — works but pins to an older framework version for no benefit
- Next.js 15 + Clerk v7 — bleeding edge, less documentation, API surface changed

**Trade-offs:** Next.js 15 may have minor breaking changes from 14 (e.g., `fetch` caching defaults changed). Acceptable for a new project with no legacy code.

---

## 2026-05-01 — Clerk v6 over Clerk v7

**Why:** Clerk v6 has the most tutorials, community answers, and stable middleware API (`clerkMiddleware` + `createRouteMatcher`). v7 changed the middleware API and is newer with less ecosystem coverage.

**Alternatives Considered:**
- Clerk v7 — latest but middleware API differs, fewer resources available

**Trade-offs:** Will need to migrate to v7 eventually. For a hackathon starter, stability and documentation quality matter more than latest version.

---

## 2026-05-01 — Prisma as sole DB access layer, Supabase client as optional helper

**Why:** Keeps data access consistent through one ORM. Supabase client included only for storage/realtime use cases that Prisma can't handle. Avoids dual query patterns.

**Alternatives Considered:**
- Supabase client as primary DB access (with RLS) — requires Clerk JWT integration, more complex setup
- Drizzle ORM — lighter weight but less ecosystem support and docs than Prisma

**Trade-offs:** Supabase RLS is bypassed. If RLS is needed later, must add Clerk ↔ Supabase JWT config. Acceptable for hackathon scope.

---

## 2026-05-01 — Upsert user on dashboard load via server action

**Why:** Simplest approach. No webhook setup required. Idempotent — safe on every page load. Keeps email synced if user changes it in Clerk.

**Alternatives Considered:**
- Clerk webhook (`user.created`) — more "correct" but requires webhook endpoint, ngrok for local dev, and error handling for missed events
- Clerk `afterAuth` callback — deprecated in newer Clerk versions

**Trade-offs:** Slight overhead on every dashboard render (one upsert query). Negligible for hackathon scale. Webhook approach better for production apps with high traffic.

---

## 2026-05-01 — Dual DATABASE_URL / DIRECT_URL for Supabase

**Why:** Supabase uses PgBouncer for connection pooling (port 6543). Prisma migrations need direct Postgres connection (port 5432) because PgBouncer doesn't support DDL transactions. Prisma's `directUrl` field handles this split automatically.

**Alternatives Considered:**
- Single URL (direct only) — works but no connection pooling at runtime, will hit connection limits under load
- Single URL (pooled only) — migrations fail

**Trade-offs:** Two URLs to manage in env. Small config overhead for correct behavior.

---

## 2026-05-01 — Prisma v5 over Prisma v7 (latest)

**Why:** Prisma v7 removed `url` and `directUrl` from the datasource block in `schema.prisma`. Connection config moved to a new `prisma.config.ts` file with an adapter-based API. This is a significant API surface change with sparse documentation at time of build. Prisma v5 uses the stable, widely-documented schema format.

**Alternatives Considered:**
- Prisma v7 with new `prisma.config.ts` — correct long-term direction, but requires adapter setup and adds complexity for no hackathon benefit

**Trade-offs:** Will need migration to v7 eventually. `npx prisma migrate dev` semantics are unchanged in v5.

---

## 2026-05-01 — export const dynamic = "force-dynamic" on all Clerk pages

**Why:** Next.js 15 tries to statically prerender pages at build time. Pages using Clerk's `auth()` or `currentUser()` fail prerender without real credentials. Marking them dynamic skips static generation and renders on demand.

**Alternatives Considered:**
- Providing stub env vars during build — fragile, leaks into CI
- Removing `auth()` from landing page — limits the sign-in/dashboard redirect logic

**Trade-offs:** All routes are server-rendered on demand (no static optimization). Acceptable for a hackathon app at this scale.
