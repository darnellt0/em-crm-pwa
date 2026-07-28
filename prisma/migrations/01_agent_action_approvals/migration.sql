-- CreateTable
CREATE TABLE "AgentActionRequest" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL DEFAULT 'openclaw:nia',
    "actionType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payload" JSONB NOT NULL,
    "rationale" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "contactId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "result" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentActionRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentActionRequest_agentId_idempotencyKey_key"
ON "AgentActionRequest"("agentId", "idempotencyKey");
CREATE INDEX "AgentActionRequest_status_createdAt_idx"
ON "AgentActionRequest"("status", "createdAt");
CREATE INDEX "AgentActionRequest_contactId_idx" ON "AgentActionRequest"("contactId");
CREATE INDEX "AgentActionRequest_expiresAt_idx" ON "AgentActionRequest"("expiresAt");
CREATE INDEX "AgentActionRequest_reviewedByUserId_idx"
ON "AgentActionRequest"("reviewedByUserId");

ALTER TABLE "AgentActionRequest"
ADD CONSTRAINT "AgentActionRequest_contactId_fkey"
FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AgentActionRequest"
ADD CONSTRAINT "AgentActionRequest_reviewedByUserId_fkey"
FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
