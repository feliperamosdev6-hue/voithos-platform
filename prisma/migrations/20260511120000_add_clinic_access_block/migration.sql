ALTER TABLE "Clinic" ADD COLUMN "accessBlocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Clinic" ADD COLUMN "accessBlockedAt" TIMESTAMP(3);
ALTER TABLE "Clinic" ADD COLUMN "accessBlockedReason" TEXT;
ALTER TABLE "Clinic" ADD COLUMN "accessBlockedByUserId" TEXT;
ALTER TABLE "Clinic" ADD COLUMN "accessUnblockedAt" TIMESTAMP(3);
ALTER TABLE "Clinic" ADD COLUMN "accessUnblockedByUserId" TEXT;

CREATE INDEX "Clinic_accessBlocked_updatedAt_idx" ON "Clinic"("accessBlocked", "updatedAt");
