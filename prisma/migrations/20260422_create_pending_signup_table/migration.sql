-- CreateTable
CREATE TABLE IF NOT EXISTS "PendingSignup" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "signupData" JSONB NOT NULL,
  "verificationCode" TEXT NOT NULL,
  "verificationExpiresAt" TIMESTAMP(3) NOT NULL,
  "resendAvailableAt" TIMESTAMP(3),
  "sendCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PendingSignup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PendingSignup_email_key" ON "PendingSignup"("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PendingSignup_verificationExpiresAt_idx" ON "PendingSignup"("verificationExpiresAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PendingSignup_resendAvailableAt_idx" ON "PendingSignup"("resendAvailableAt");
