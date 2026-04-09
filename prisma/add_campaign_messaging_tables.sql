DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CampaignChannel') THEN
    CREATE TYPE "CampaignChannel" AS ENUM ('WHATSAPP');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CampaignStatus') THEN
    CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SCHEDULED', 'PAUSED', 'COMPLETED', 'INACTIVE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CampaignBatchStatus') THEN
    CREATE TYPE "CampaignBatchStatus" AS ENUM ('CREATED', 'PROCESSING', 'COMPLETED', 'FAILED', 'BLOCKED', 'CANCELLED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CampaignDispatchStatus') THEN
    CREATE TYPE "CampaignDispatchStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'BLOCKED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "Campaign" (
  "id" TEXT PRIMARY KEY,
  "clinicId" TEXT NOT NULL REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "period" TEXT,
  "color" TEXT,
  "startAt" TIMESTAMP(3),
  "endAt" TIMESTAMP(3),
  "channel" "CampaignChannel" NOT NULL DEFAULT 'WHATSAPP',
  "status" "CampaignStatus" NOT NULL DEFAULT 'ACTIVE',
  "audienceSegmentKey" TEXT,
  "audienceFilters" JSONB,
  "sourceType" TEXT,
  "originType" TEXT,
  "eventType" TEXT,
  "entityType" TEXT,
  "entityId" TEXT,
  "metadata" JSONB,
  "createdByUserId" TEXT,
  "createdByName" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "CampaignAudienceSnapshot" (
  "id" TEXT PRIMARY KEY,
  "clinicId" TEXT NOT NULL REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "campaignId" TEXT REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "segmentKey" TEXT NOT NULL,
  "filters" JSONB,
  "totalRecipients" INTEGER NOT NULL DEFAULT 0,
  "includedRecipients" INTEGER NOT NULL DEFAULT 0,
  "blockedRecipients" INTEGER NOT NULL DEFAULT 0,
  "source" TEXT,
  "summary" JSONB,
  "createdByUserId" TEXT,
  "createdByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "CampaignAudienceSnapshotMember" (
  "id" TEXT PRIMARY KEY,
  "clinicId" TEXT NOT NULL REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "snapshotId" TEXT NOT NULL REFERENCES "CampaignAudienceSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "patientId" TEXT NOT NULL,
  "patientName" TEXT,
  "phone" TEXT,
  "allowsMessages" BOOLEAN NOT NULL DEFAULT TRUE,
  "included" BOOLEAN NOT NULL DEFAULT TRUE,
  "status" TEXT,
  "reasonCode" TEXT,
  "reasonLabel" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignAudienceSnapshotMember_snapshotId_patientId_key" UNIQUE ("snapshotId", "patientId")
);

CREATE TABLE IF NOT EXISTS "CampaignBatch" (
  "id" TEXT PRIMARY KEY,
  "clinicId" TEXT NOT NULL REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "campaignId" TEXT NOT NULL REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "audienceSnapshotId" TEXT NOT NULL REFERENCES "CampaignAudienceSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "channel" "CampaignChannel" NOT NULL DEFAULT 'WHATSAPP',
  "status" "CampaignBatchStatus" NOT NULL DEFAULT 'CREATED',
  "sourceType" TEXT,
  "originType" TEXT,
  "eventType" TEXT,
  "entityType" TEXT,
  "entityId" TEXT,
  "totalRecipients" INTEGER NOT NULL DEFAULT 0,
  "processedCount" INTEGER NOT NULL DEFAULT 0,
  "successCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "blockedCount" INTEGER NOT NULL DEFAULT 0,
  "pendingCount" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "createdByUserId" TEXT,
  "createdByName" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "CampaignDispatch" (
  "id" TEXT PRIMARY KEY,
  "clinicId" TEXT NOT NULL REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "campaignId" TEXT NOT NULL REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "batchId" TEXT NOT NULL REFERENCES "CampaignBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "audienceSnapshotId" TEXT NOT NULL REFERENCES "CampaignAudienceSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "audienceMemberId" TEXT NOT NULL REFERENCES "CampaignAudienceSnapshotMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "channel" "CampaignChannel" NOT NULL DEFAULT 'WHATSAPP',
  "status" "CampaignDispatchStatus" NOT NULL DEFAULT 'PENDING',
  "dispatchType" TEXT NOT NULL,
  "sourceType" TEXT,
  "originType" TEXT,
  "eventType" TEXT,
  "entityType" TEXT,
  "entityId" TEXT,
  "patientId" TEXT NOT NULL,
  "patientName" TEXT,
  "phone" TEXT,
  "body" TEXT NOT NULL,
  "bodyRedacted" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "blockedAt" TIMESTAMP(3),
  "provider" TEXT,
  "providerMessageId" TEXT,
  "lastError" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignDispatch_clinicId_idempotencyKey_key" UNIQUE ("clinicId", "idempotencyKey"),
  CONSTRAINT "CampaignDispatch_batchId_audienceMemberId_key" UNIQUE ("batchId", "audienceMemberId")
);

CREATE INDEX IF NOT EXISTS "Campaign_clinicId_createdAt_idx" ON "Campaign" ("clinicId", "createdAt");
CREATE INDEX IF NOT EXISTS "Campaign_clinicId_status_createdAt_idx" ON "Campaign" ("clinicId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "Campaign_deletedAt_idx" ON "Campaign" ("deletedAt");
CREATE INDEX IF NOT EXISTS "CampaignAudienceSnapshot_clinicId_createdAt_idx" ON "CampaignAudienceSnapshot" ("clinicId", "createdAt");
CREATE INDEX IF NOT EXISTS "CampaignAudienceSnapshot_campaignId_idx" ON "CampaignAudienceSnapshot" ("campaignId");
CREATE INDEX IF NOT EXISTS "CampaignAudienceSnapshotMember_clinicId_snapshotId_idx" ON "CampaignAudienceSnapshotMember" ("clinicId", "snapshotId");
CREATE INDEX IF NOT EXISTS "CampaignAudienceSnapshotMember_patientId_idx" ON "CampaignAudienceSnapshotMember" ("patientId");
CREATE INDEX IF NOT EXISTS "CampaignBatch_clinicId_createdAt_idx" ON "CampaignBatch" ("clinicId", "createdAt");
CREATE INDEX IF NOT EXISTS "CampaignBatch_campaignId_idx" ON "CampaignBatch" ("campaignId");
CREATE INDEX IF NOT EXISTS "CampaignBatch_status_idx" ON "CampaignBatch" ("status");
CREATE INDEX IF NOT EXISTS "CampaignBatch_audienceSnapshotId_idx" ON "CampaignBatch" ("audienceSnapshotId");
CREATE INDEX IF NOT EXISTS "CampaignDispatch_clinicId_campaignId_createdAt_idx" ON "CampaignDispatch" ("clinicId", "campaignId", "createdAt");
CREATE INDEX IF NOT EXISTS "CampaignDispatch_batchId_idx" ON "CampaignDispatch" ("batchId");
CREATE INDEX IF NOT EXISTS "CampaignDispatch_status_idx" ON "CampaignDispatch" ("status");
CREATE INDEX IF NOT EXISTS "CampaignDispatch_patientId_idx" ON "CampaignDispatch" ("patientId");
CREATE INDEX IF NOT EXISTS "CampaignDispatch_audienceSnapshotId_idx" ON "CampaignDispatch" ("audienceSnapshotId");
