CREATE TABLE "CampaignSyncReceipt" (
    "id" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "contactId" TEXT,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignSyncReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CampaignSyncReceipt_externalEventId_key"
ON "CampaignSyncReceipt"("externalEventId");

CREATE INDEX "CampaignSyncReceipt_contactId_receivedAt_idx"
ON "CampaignSyncReceipt"("contactId", "receivedAt");

CREATE INDEX "CampaignSyncReceipt_eventType_receivedAt_idx"
ON "CampaignSyncReceipt"("eventType", "receivedAt");

ALTER TABLE "CampaignSyncReceipt"
ADD CONSTRAINT "CampaignSyncReceipt_contactId_fkey"
FOREIGN KEY ("contactId") REFERENCES "Contact"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
