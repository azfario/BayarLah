# BayarLah

BayarLah records group expenses and helps collectors send DuitNow payment
reminders through a dedicated WhatsApp bot. It includes profile onboarding,
friend management, manual and receipt-assisted expense entry, reminder
scheduling, and payment-proof matching.

## How to Run

Install the app and worker dependencies:

```bash
npm ci --legacy-peer-deps
npm --prefix workers/whatsapp ci
```

Create environment variables from the example file:

```bash
cp .env.example .env.local
```

Fill in the required values, set up the database, and start the app:

```bash
npm run db:setup
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

For the local app, OpenWA gateway, and worker together:

```bash
npm run dev:demo
```

For the production Vercel, Supabase, Clerk, and NovaCloud rollout, follow
[the deployment runbook](deploy/README.md).

## Verification

Run the same source checks used by CI:

```bash
npm run verify
```

Database cleanup migrations are intentionally separate from normal setup. Do
not run `npm run db:cleanup-legacy` against production without following the
backup and staged rollout steps in the deployment runbook.
