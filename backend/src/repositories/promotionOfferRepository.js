const crypto = require('crypto');
const { prisma } = require('../db/prisma');
const { toRequiredString } = require('../types/repositoryTypes');

const normalizeRow = (row = {}) => ({
  ...row,
  regularPriceCents: Number(row.regularPriceCents || 0),
  promotionalPriceCents: Number(row.promotionalPriceCents || 0),
  usedCount: Number(row.usedCount || 0),
  maxUses: row.maxUses === null || row.maxUses === undefined ? null : Number(row.maxUses),
});

const promotionOfferRepository = {
  list: async () => {
    const rows = await prisma.$queryRaw`
      SELECT *
      FROM "PromotionOffer"
      ORDER BY "createdAt" DESC
      LIMIT 250
    `;
    return (rows || []).map(normalizeRow);
  },

  findById: async (id) => {
    const normalizedId = toRequiredString(id, 'id');
    const rows = await prisma.$queryRaw`
      SELECT *
      FROM "PromotionOffer"
      WHERE "id" = ${normalizedId}
      LIMIT 1
    `;
    return rows?.[0] ? normalizeRow(rows[0]) : null;
  },

  findByCode: async (code) => {
    const normalizedCode = toRequiredString(code, 'code').toUpperCase();
    const rows = await prisma.$queryRaw`
      SELECT *
      FROM "PromotionOffer"
      WHERE UPPER("code") = ${normalizedCode}
      LIMIT 1
    `;
    return rows?.[0] ? normalizeRow(rows[0]) : null;
  },

  create: async (data = {}) => {
    const id = crypto.randomUUID();
    const rows = await prisma.$queryRaw`
      INSERT INTO "PromotionOffer" (
        "id",
        "code",
        "title",
        "description",
        "planType",
        "regularPriceCents",
        "promotionalPriceCents",
        "billingCycle",
        "maxUses",
        "validFrom",
        "validUntil",
        "active",
        "targetEmail",
        "targetPhone",
        "source",
        "notes",
        "createdByUserId",
        "createdAt",
        "updatedAt"
      ) VALUES (
        ${id},
        ${data.code},
        ${data.title},
        ${data.description || null},
        CAST(${data.planType} AS "SubscriptionPlanType"),
        ${data.regularPriceCents},
        ${data.promotionalPriceCents},
        ${data.billingCycle || null},
        ${data.maxUses ?? null},
        ${data.validFrom || null},
        ${data.validUntil || null},
        ${data.active !== false},
        ${data.targetEmail || null},
        ${data.targetPhone || null},
        ${data.source || null},
        ${data.notes || null},
        ${data.createdByUserId || null},
        NOW(),
        NOW()
      )
      RETURNING *
    `;
    return normalizeRow(rows?.[0] || {});
  },

  update: async ({ id, data = {} }) => {
    const normalizedId = toRequiredString(id, 'id');
    const rows = await prisma.$queryRaw`
      UPDATE "PromotionOffer"
      SET
        "title" = COALESCE(${data.title ?? null}, "title"),
        "description" = ${data.description === undefined ? null : data.description},
        "planType" = CAST(COALESCE(${data.planType ?? null}, "planType"::text) AS "SubscriptionPlanType"),
        "regularPriceCents" = COALESCE(${data.regularPriceCents ?? null}, "regularPriceCents"),
        "promotionalPriceCents" = COALESCE(${data.promotionalPriceCents ?? null}, "promotionalPriceCents"),
        "billingCycle" = ${data.billingCycle === undefined ? null : data.billingCycle},
        "maxUses" = ${data.maxUses === undefined ? null : data.maxUses},
        "validFrom" = ${data.validFrom === undefined ? null : data.validFrom},
        "validUntil" = ${data.validUntil === undefined ? null : data.validUntil},
        "active" = COALESCE(${data.active ?? null}, "active"),
        "targetEmail" = ${data.targetEmail === undefined ? null : data.targetEmail},
        "targetPhone" = ${data.targetPhone === undefined ? null : data.targetPhone},
        "source" = ${data.source === undefined ? null : data.source},
        "notes" = ${data.notes === undefined ? null : data.notes},
        "updatedAt" = NOW()
      WHERE "id" = ${normalizedId}
      RETURNING *
    `;
    return rows?.[0] ? normalizeRow(rows[0]) : null;
  },

  setActive: async ({ id, active }) => {
    const normalizedId = toRequiredString(id, 'id');
    const rows = await prisma.$queryRaw`
      UPDATE "PromotionOffer"
      SET "active" = ${active === true}, "updatedAt" = NOW()
      WHERE "id" = ${normalizedId}
      RETURNING *
    `;
    return rows?.[0] ? normalizeRow(rows[0]) : null;
  },
};

module.exports = { promotionOfferRepository };
