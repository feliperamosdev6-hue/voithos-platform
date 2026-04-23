const crypto = require('crypto');
const { prisma } = require('../db/prisma');
const { toRequiredString } = require('../types/repositoryTypes');

const normalizeJson = (value) => {
  if (value === null || value === undefined) return {};
  if (typeof value === 'object') return value;
  return { value };
};

const pendingSignupRepository = {
  findByEmail: async (email) => {
    const normalizedEmail = toRequiredString(email, 'email');
    const rows = await prisma.$queryRaw`
      SELECT *
      FROM "PendingSignup"
      WHERE "email" = ${normalizedEmail}
      LIMIT 1
    `;
    return rows?.[0] || null;
  },

  upsertByEmail: async ({
    email,
    passwordHash,
    signupData,
    verificationCode,
    verificationExpiresAt,
    resendAvailableAt,
    sendCount = 1,
  }) => {
    const normalizedEmail = toRequiredString(email, 'email');
    const normalizedPasswordHash = toRequiredString(passwordHash, 'passwordHash');
    const normalizedCode = toRequiredString(verificationCode, 'verificationCode');
    const normalizedVerificationExpiresAt = verificationExpiresAt instanceof Date
      ? verificationExpiresAt
      : new Date(verificationExpiresAt);
    const normalizedResendAvailableAt = resendAvailableAt
      ? (resendAvailableAt instanceof Date ? resendAvailableAt : new Date(resendAvailableAt))
      : null;
    const normalizedSendCount = Math.max(0, Number(sendCount) || 0);

    const rows = await prisma.$queryRaw`
      INSERT INTO "PendingSignup" (
        "id",
        "email",
        "passwordHash",
        "signupData",
        "verificationCode",
        "verificationExpiresAt",
        "resendAvailableAt",
        "sendCount",
        "createdAt",
        "updatedAt"
      ) VALUES (
        ${crypto.randomUUID()},
        ${normalizedEmail},
        ${normalizedPasswordHash},
        CAST(${JSON.stringify(normalizeJson(signupData))} AS jsonb),
        ${normalizedCode},
        ${normalizedVerificationExpiresAt},
        ${normalizedResendAvailableAt},
        ${normalizedSendCount},
        NOW(),
        NOW()
      )
      ON CONFLICT ("email") DO UPDATE SET
        "passwordHash" = EXCLUDED."passwordHash",
        "signupData" = EXCLUDED."signupData",
        "verificationCode" = EXCLUDED."verificationCode",
        "verificationExpiresAt" = EXCLUDED."verificationExpiresAt",
        "resendAvailableAt" = EXCLUDED."resendAvailableAt",
        "sendCount" = EXCLUDED."sendCount",
        "updatedAt" = NOW()
      RETURNING *
    `;

    return rows?.[0] || null;
  },

  deleteByEmail: async (email) => {
    const normalizedEmail = toRequiredString(email, 'email');
    await prisma.$executeRaw`
      DELETE FROM "PendingSignup"
      WHERE "email" = ${normalizedEmail}
    `;
  },
};

module.exports = { pendingSignupRepository };
