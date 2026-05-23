FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma

ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres \
    DIRECT_URL=postgresql://postgres:postgres@localhost:5432/postgres

RUN npm ci --legacy-peer-deps \
  && npx prisma generate

COPY workers/whatsapp/package.json workers/whatsapp/package-lock.json ./workers/whatsapp/
RUN npm --prefix workers/whatsapp ci --legacy-peer-deps

COPY lib ./lib
COPY workers/whatsapp/worker.ts ./workers/whatsapp/worker.ts

CMD ["npm", "run", "whatsapp:worker"]
