ALTER TABLE "Subscription" ADD COLUMN "billingAmount" DECIMAL(12,2);
ALTER TABLE "Subscription" ADD COLUMN "discountAmount" DECIMAL(12,2);
ALTER TABLE "Subscription" ADD COLUMN "customPriceEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Subscription" ADD COLUMN "billingCycle" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "commercialNotes" TEXT;

CREATE TABLE "SubscriptionCommercialAudit" (
  "id" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "clinicId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actorEmail" TEXT,
  "before" JSONB,
  "after" JSONB,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SubscriptionCommercialAudit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SubscriptionCommercialAudit_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "SubscriptionCommercialAudit_clinicId_createdAt_idx" ON "SubscriptionCommercialAudit"("clinicId", "createdAt");
CREATE INDEX "SubscriptionCommercialAudit_subscriptionId_createdAt_idx" ON "SubscriptionCommercialAudit"("subscriptionId", "createdAt");
CREATE INDEX "SubscriptionCommercialAudit_action_idx" ON "SubscriptionCommercialAudit"("action");
