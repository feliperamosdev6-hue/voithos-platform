ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'TRIALING';

ALTER TABLE "Subscription" ADD COLUMN "trialStartedAt" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN "trialEndsAt" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN "activatedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "PromotionOfferUsage_promotionOfferId_subscriptionId_key"
ON "PromotionOfferUsage"("promotionOfferId", "subscriptionId");
