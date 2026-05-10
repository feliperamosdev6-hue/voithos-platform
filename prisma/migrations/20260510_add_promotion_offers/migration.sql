CREATE TABLE "PromotionOffer" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "planType" "SubscriptionPlanType" NOT NULL,
  "regularPriceCents" INTEGER NOT NULL,
  "promotionalPriceCents" INTEGER NOT NULL,
  "billingCycle" TEXT,
  "maxUses" INTEGER,
  "usedCount" INTEGER NOT NULL DEFAULT 0,
  "validFrom" TIMESTAMP(3),
  "validUntil" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "targetEmail" TEXT,
  "targetPhone" TEXT,
  "source" TEXT,
  "notes" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PromotionOffer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PromotionOffer_code_key" ON "PromotionOffer"("code");
CREATE INDEX "PromotionOffer_active_validUntil_idx" ON "PromotionOffer"("active", "validUntil");
CREATE INDEX "PromotionOffer_planType_idx" ON "PromotionOffer"("planType");
CREATE INDEX "PromotionOffer_source_idx" ON "PromotionOffer"("source");

CREATE TABLE "PromotionOfferUsage" (
  "id" TEXT NOT NULL,
  "promotionOfferId" TEXT NOT NULL,
  "pendingSignupId" TEXT,
  "clinicId" TEXT,
  "subscriptionId" TEXT,
  "paymentExternalId" TEXT,
  "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PromotionOfferUsage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PromotionOfferUsage_promotionOfferId_fkey" FOREIGN KEY ("promotionOfferId") REFERENCES "PromotionOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PromotionOfferUsage_promotionOfferId_pendingSignupId_key" ON "PromotionOfferUsage"("promotionOfferId", "pendingSignupId");
CREATE INDEX "PromotionOfferUsage_promotionOfferId_usedAt_idx" ON "PromotionOfferUsage"("promotionOfferId", "usedAt");
CREATE INDEX "PromotionOfferUsage_clinicId_idx" ON "PromotionOfferUsage"("clinicId");
