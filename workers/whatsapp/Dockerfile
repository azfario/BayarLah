FROM node:20-bookworm-slim

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    WHATSAPP_CHROME_PATH=/usr/bin/chromium \
    WHATSAPP_HEADLESS=true \
    WHATSAPP_WORKER_API_PORT=3010 \
    WHATSAPP_SESSION_DATA_PATH=/app/workers/whatsapp/sessions

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    chromium \
    fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

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

EXPOSE 3010

CMD ["npm", "run", "whatsapp:worker"]
