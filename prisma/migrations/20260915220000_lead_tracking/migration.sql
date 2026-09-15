ALTER TABLE "Contact"
  ADD COLUMN "leadStatus" TEXT NOT NULL DEFAULT 'unreviewed',
  ADD COLUMN "leadNextAction" TEXT,
  ADD COLUMN "leadReviewedAt" TIMESTAMP(3);

CREATE INDEX "Contact_leadStatus_nextFollowUpAt_idx" ON "Contact"("leadStatus", "nextFollowUpAt");
