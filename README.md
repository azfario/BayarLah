# BayarLah
BayarLah is a Malaysian fintech hackathon app for recording group expenses and helping collectors remind friends to pay back through DuitNow details. It supports profile onboarding, friend management, manual expense entry, receipt-assisted expense creation, and WhatsApp reminder demos.

## How to Run

Install dependencies:

```bash
npm install --legacy-peer-deps
```

Create environment variables from the example file:

```bash
cp .env.example .env.local
```

Fill in the required values in `.env.local`, then generate the Prisma client:

```bash
npx prisma generate
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

For the local WhatsApp reminder demo, use:

```bash
npm run dev:demo
```

## Project Status

In development. Current functionality includes authentication, profile onboarding, friend management, manual and receipt-assisted expenses, receipt parsing, split allocation, and WhatsApp reminder demo support.
