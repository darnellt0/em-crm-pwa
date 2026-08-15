-- Allow household members and other distinct contacts to share a phone number.
DROP INDEX IF EXISTS "Contact_phoneNormalized_key";

-- Stable identity from the canonical master list. PostgreSQL unique indexes
-- permit multiple NULL values, so contacts created outside the master remain valid.
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "canonicalId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Contact_canonicalId_key" ON "Contact"("canonicalId");
