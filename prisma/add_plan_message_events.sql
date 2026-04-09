ALTER TYPE "NotificationEventType" ADD VALUE IF NOT EXISTS 'PLAN_MESSAGE_EVENT_CREATED';
ALTER TYPE "NotificationEventType" ADD VALUE IF NOT EXISTS 'PLAN_MESSAGE_DISPATCH_STARTED';
ALTER TYPE "NotificationEventType" ADD VALUE IF NOT EXISTS 'PLAN_MESSAGE_DISPATCH_COMPLETED';
ALTER TYPE "NotificationEventType" ADD VALUE IF NOT EXISTS 'PLAN_MESSAGE_DISPATCH_FAILED';
ALTER TYPE "NotificationEventType" ADD VALUE IF NOT EXISTS 'PLAN_MESSAGE_DISPATCH_BLOCKED';
ALTER TYPE "NotificationEventType" ADD VALUE IF NOT EXISTS 'PLAN_MESSAGE_RESEND_REQUESTED';
ALTER TYPE "NotificationEventType" ADD VALUE IF NOT EXISTS 'PLAN_MESSAGE_HISTORY_LOADED';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PlanMessageEventType') THEN
    CREATE TYPE "PlanMessageEventType" AS ENUM (
      'PLAN_INSTALLMENT_DUE_SOON',
      'PLAN_INSTALLMENT_DUE_TODAY',
      'PLAN_INSTALLMENT_OVERDUE',
      'PLAN_PAYMENT_CONFIRMED'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PlanMessageStatus') THEN
    CREATE TYPE "PlanMessageStatus" AS ENUM (
      'CREATED',
      'PENDING',
      'SENT',
      'FAILED',
      'BLOCKED'
    );
  END IF;
END $$;

ALTER TABLE "CampaignBatch"
  ALTER COLUMN "campaignId" DROP NOT NULL;

ALTER TABLE "CampaignDispatch"
  ALTER COLUMN "campaignId" DROP NOT NULL;

CREATE TABLE IF NOT EXISTS "PlanMessageEvent" (
  "id" TEXT NOT NULL,
  "clinicId" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "financialAccountId" TEXT NOT NULL,
  "installmentId" TEXT,
  "installmentSequence" INTEGER NOT NULL,
  "eventType" "PlanMessageEventType" NOT NULL,
  "status" "PlanMessageStatus" NOT NULL DEFAULT 'CREATED',
  "templateKey" TEXT NOT NULL,
  "templateVersion" INTEGER NOT NULL DEFAULT 1,
  "dueDate" TIMESTAMP(3),
  "amount" DECIMAL(12, 2) NOT NULL,
  "paymentMethod" "FinancialTransactionMethod",
  "externalBillingReference" TEXT,
  "paymentUrl" TEXT,
  "barcode" TEXT,
  "latestBatchId" TEXT,
  "latestDispatchId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "manualResendCount" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "blockedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PlanMessageEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlanMessageEvent_clinicId_idempotencyKey_key"
  ON "PlanMessageEvent"("clinicId", "idempotencyKey");

CREATE INDEX IF NOT EXISTS "PlanMessageEvent_clinicId_planId_createdAt_idx"
  ON "PlanMessageEvent"("clinicId", "planId", "createdAt");

CREATE INDEX IF NOT EXISTS "PlanMessageEvent_clinicId_financialAccountId_eventType_idx"
  ON "PlanMessageEvent"("clinicId", "financialAccountId", "eventType");

CREATE INDEX IF NOT EXISTS "PlanMessageEvent_clinicId_patientId_createdAt_idx"
  ON "PlanMessageEvent"("clinicId", "patientId", "createdAt");

CREATE INDEX IF NOT EXISTS "PlanMessageEvent_clinicId_status_createdAt_idx"
  ON "PlanMessageEvent"("clinicId", "status", "createdAt");
