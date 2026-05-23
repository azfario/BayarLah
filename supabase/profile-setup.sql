-- BayarLah user profile, friends, expenses, and public image buckets.
-- Paste this into the Supabase SQL editor if you are managing the schema manually.

DO $$
BEGIN
  CREATE TYPE "DuitNowIdType" AS ENUM (
    'PHONE',
    'NRIC',
    'PASSPORT',
    'BUSINESS_REGISTRATION',
    'ARMY_POLICE'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ExpenseSplitMode" AS ENUM (
    'EQUAL_SPLIT',
    'CUSTOM_AMOUNT'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ReceiptAllocationParticipantType" AS ENUM (
    'COLLECTOR',
    'FRIEND'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ReminderFrequencyUnit" AS ENUM (
    'HOURS',
    'DAYS'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ReminderStatus" AS ENUM (
    'NOT_SCHEDULED',
    'ACTIVE',
    'PAUSED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "WhatsappReminderAttemptStatus" AS ENUM (
    'PENDING',
    'SENT',
    'FAILED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "WhatsappLinkStatus" AS ENUM (
    'NOT_LINKED',
    'LINKING',
    'LINKED',
    'FAILED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT NOT NULL,
  "clerkId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "fullName" TEXT,
  "phone" TEXT,
  "profilePhotoUrl" TEXT,
  "duitNowIdType" "DuitNowIdType",
  "duitNowIdValue" TEXT,
  "duitNowQrUrl" TEXT,
  "whatsappLinkStatus" "WhatsappLinkStatus" NOT NULL DEFAULT 'NOT_LINKED',
  "whatsappSessionId" TEXT,
  "whatsappLinkedPhone" TEXT,
  "whatsappLinkedAt" TIMESTAMP(3),
  "whatsappLinkError" TEXT,
  "profileCompletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "User_clerkId_key" ON "User"("clerkId");

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "fullName" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "profilePhotoUrl" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "duitNowIdType" "DuitNowIdType";
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "duitNowIdValue" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "duitNowQrUrl" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "whatsappLinkStatus" "WhatsappLinkStatus" NOT NULL DEFAULT 'NOT_LINKED';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "whatsappSessionId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "whatsappLinkedPhone" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "whatsappLinkedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "whatsappLinkError" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "profileCompletedAt" TIMESTAMP(3);
ALTER TABLE "User" ALTER COLUMN "whatsappLinkStatus" SET DEFAULT 'NOT_LINKED';
UPDATE "User"
SET "whatsappLinkStatus" = 'NOT_LINKED'
WHERE "whatsappLinkStatus" IS NULL;
ALTER TABLE "User" ALTER COLUMN "whatsappLinkStatus" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "User_whatsappSessionId_key" ON "User"("whatsappSessionId");

CREATE TABLE IF NOT EXISTS "Friend" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Friend_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Friend_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Friend_ownerId_phone_key" ON "Friend"("ownerId", "phone");
CREATE INDEX IF NOT EXISTS "Friend_ownerId_idx" ON "Friend"("ownerId");

CREATE TABLE IF NOT EXISTS "Expense" (
  "id" TEXT NOT NULL,
  "collectorId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "totalAmount" DECIMAL(10,2) NOT NULL,
  "splitMode" "ExpenseSplitMode" NOT NULL,
  "collectorAmount" DECIMAL(10,2),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Expense_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Expense_collectorId_fkey" FOREIGN KEY ("collectorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Expense_collectorId_idx" ON "Expense"("collectorId");

ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "receiptMerchantName" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "receiptDate" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "receiptSubtotal" DECIMAL(10,2);
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "receiptTax" DECIMAL(10,2);
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "receiptServiceCharge" DECIMAL(10,2);
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "receiptRounding" DECIMAL(10,2);
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "receiptParsedTotal" DECIMAL(10,2);

CREATE TABLE IF NOT EXISTS "ExpenseShare" (
  "id" TEXT NOT NULL,
  "expenseId" TEXT NOT NULL,
  "friendId" TEXT NOT NULL,
  "owedAmount" DECIMAL(10,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ExpenseShare_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExpenseShare_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ExpenseShare_friendId_fkey" FOREIGN KEY ("friendId") REFERENCES "Friend"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ExpenseShare_expenseId_friendId_key" ON "ExpenseShare"("expenseId", "friendId");
CREATE INDEX IF NOT EXISTS "ExpenseShare_friendId_idx" ON "ExpenseShare"("friendId");

ALTER TABLE "ExpenseShare" ADD COLUMN IF NOT EXISTS "reminderFrequencyValue" INTEGER;
ALTER TABLE "ExpenseShare" ADD COLUMN IF NOT EXISTS "reminderFrequencyUnit" "ReminderFrequencyUnit";
ALTER TABLE "ExpenseShare" ADD COLUMN IF NOT EXISTS "reminderStatus" "ReminderStatus" NOT NULL DEFAULT 'NOT_SCHEDULED';
ALTER TABLE "ExpenseShare" ADD COLUMN IF NOT EXISTS "nextReminderAt" TIMESTAMP(3);
ALTER TABLE "ExpenseShare" ADD COLUMN IF NOT EXISTS "lastReminderAt" TIMESTAMP(3);
ALTER TABLE "ExpenseShare" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);
ALTER TABLE "ExpenseShare" ALTER COLUMN "reminderStatus" SET DEFAULT 'NOT_SCHEDULED';
UPDATE "ExpenseShare"
SET "reminderStatus" = 'NOT_SCHEDULED'
WHERE "reminderStatus" IS NULL;
CREATE INDEX IF NOT EXISTS "ExpenseShare_reminderStatus_nextReminderAt_idx" ON "ExpenseShare"("reminderStatus", "nextReminderAt");

CREATE TABLE IF NOT EXISTS "WhatsappReminderAttempt" (
  "id" TEXT NOT NULL,
  "expenseShareId" TEXT NOT NULL,
  "status" "WhatsappReminderAttemptStatus" NOT NULL DEFAULT 'PENDING',
  "recipientPhone" TEXT NOT NULL,
  "messageText" TEXT NOT NULL,
  "duitNowQrUrl" TEXT NOT NULL,
  "providerMessageId" TEXT,
  "sentAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WhatsappReminderAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WhatsappReminderAttempt_expenseShareId_fkey" FOREIGN KEY ("expenseShareId") REFERENCES "ExpenseShare"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "WhatsappReminderAttempt_expenseShareId_idx" ON "WhatsappReminderAttempt"("expenseShareId");
CREATE INDEX IF NOT EXISTS "WhatsappReminderAttempt_status_createdAt_idx" ON "WhatsappReminderAttempt"("status", "createdAt");

CREATE TABLE IF NOT EXISTS "ReceiptItem" (
  "id" TEXT NOT NULL,
  "expenseId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ReceiptItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReceiptItem_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ReceiptItem_expenseId_idx" ON "ReceiptItem"("expenseId");

CREATE TABLE IF NOT EXISTS "ReceiptItemAllocation" (
  "id" TEXT NOT NULL,
  "receiptItemId" TEXT NOT NULL,
  "participantType" "ReceiptAllocationParticipantType" NOT NULL,
  "friendId" TEXT,
  "amount" DECIMAL(10,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ReceiptItemAllocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReceiptItemAllocation_receiptItemId_fkey" FOREIGN KEY ("receiptItemId") REFERENCES "ReceiptItem"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReceiptItemAllocation_friendId_fkey" FOREIGN KEY ("friendId") REFERENCES "Friend"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ReceiptItemAllocation_receiptItemId_idx" ON "ReceiptItemAllocation"("receiptItemId");
CREATE INDEX IF NOT EXISTS "ReceiptItemAllocation_friendId_idx" ON "ReceiptItemAllocation"("friendId");

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES
  (
    'profile-photos',
    'profile-photos',
    true,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']::text[]
  ),
  (
    'duitnow-qrs',
    'duitnow-qrs',
    true,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']::text[]
  )
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
