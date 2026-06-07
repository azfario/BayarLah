-- Run only after deploying code that no longer reads these columns.
-- Back up the production database before applying this migration.

DROP INDEX IF EXISTS "User_whatsappSessionId_key";

ALTER TABLE "User"
  DROP COLUMN IF EXISTS "whatsappLinkStatus",
  DROP COLUMN IF EXISTS "whatsappSessionId",
  DROP COLUMN IF EXISTS "whatsappLinkedPhone",
  DROP COLUMN IF EXISTS "whatsappLinkedAt",
  DROP COLUMN IF EXISTS "whatsappLinkError",
  DROP COLUMN IF EXISTS "profileCompletedAt";
