DO $$
BEGIN
  CREATE TYPE "WhatsappInboundMessageStatus" AS ENUM (
    'PROCESSING',
    'PROCESSED',
    'FAILED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "WhatsappInboundMessage" (
  "senderSessionId" TEXT NOT NULL,
  "providerMessageId" TEXT NOT NULL,
  "status" "WhatsappInboundMessageStatus" NOT NULL DEFAULT 'PROCESSING',
  "source" TEXT NOT NULL,
  "outcome" TEXT,
  "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WhatsappInboundMessage_pkey" PRIMARY KEY ("senderSessionId", "providerMessageId")
);

CREATE INDEX IF NOT EXISTS "WhatsappInboundMessage_status_claimedAt_idx"
ON "WhatsappInboundMessage"("status", "claimedAt");
