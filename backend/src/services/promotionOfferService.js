const crypto = require('crypto');
const { AppError } = require('../errors/AppError');
const { prisma } = require('../db/prisma');
const { promotionOfferRepository } = require('../repositories/promotionOfferRepository');

const PLAN_DEFINITIONS = Object.freeze({
  MONTHLY: Object.freeze({ planType: 'MONTHLY', amountCents: 4770, billingCycle: 'MONTHLY' }),
  QUARTERLY: Object.freeze({ planType: 'QUARTERLY', amountCents: 26990, billingCycle: 'QUARTERLY' }),
  SEMIANNUAL: Object.freeze({ planType: 'SEMIANNUAL', amountCents: 49990, billingCycle: 'SEMIANNUAL' }),
  ANNUAL: Object.freeze({ planType: 'ANNUAL', amountCents: 54870, billingCycle: 'ANNUAL' }),
});

const VALID_SOURCES = new Set(['EVENT', 'PARTNER', 'INDIVIDUAL', 'MANUAL']);

const cleanText = (value, maxLength = 255) => String(value || '').trim().slice(0, maxLength);
const normalizeEmail = (value) => cleanText(value, 160).toLowerCase();
const normalizePhone = (value) => cleanText(value, 40).replace(/\D/g, '').slice(0, 20);

const normalizePlanType = (value) => {
  const normalized = cleanText(value, 40).toUpperCase();
  if (!PLAN_DEFINITIONS[normalized]) {
    throw new AppError(400, 'VALIDATION_ERROR', 'planType is invalid.');
  }
  return normalized;
};

const normalizeMoneyCents = (value, fieldName) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be greater than zero.`);
  }
  if (Number.isInteger(numeric) && numeric >= 1000) return Math.round(numeric);
  return Math.round(numeric * 100);
};

const normalizeOptionalDate = (value, fieldName) => {
  const raw = cleanText(value, 80);
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} is invalid.`);
  }
  return parsed;
};

const normalizeCode = (value) => cleanText(value, 80)
  .toUpperCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Z0-9-]/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 48);

const generateCode = (title = '') => {
  const prefix = normalizeCode(title).slice(0, 18) || 'VOITHOS';
  const suffix = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}-${suffix}`;
};

const moneyFromCents = (cents) => Math.round(Number(cents || 0)) / 100;

const buildPublicAppBaseUrl = () => String(process.env.PUBLIC_APP_BASE_URL || 'http://127.0.0.1:4000').trim().replace(/\/+$/, '');

const mapOffer = (row = {}) => {
  const regularPriceCents = Number(row.regularPriceCents || 0);
  const promotionalPriceCents = Number(row.promotionalPriceCents || 0);
  const code = cleanText(row.code, 80);
  return {
    id: cleanText(row.id, 80),
    code,
    title: cleanText(row.title, 160),
    description: cleanText(row.description, 500),
    planType: cleanText(row.planType, 40).toUpperCase(),
    regularPriceCents,
    regularPrice: moneyFromCents(regularPriceCents),
    promotionalPriceCents,
    promotionalPrice: moneyFromCents(promotionalPriceCents),
    billingCycle: cleanText(row.billingCycle, 40),
    maxUses: row.maxUses === null || row.maxUses === undefined ? null : Number(row.maxUses),
    usedCount: Number(row.usedCount || 0),
    validFrom: row.validFrom ? new Date(row.validFrom).toISOString() : null,
    validUntil: row.validUntil ? new Date(row.validUntil).toISOString() : null,
    active: row.active !== false,
    targetEmail: normalizeEmail(row.targetEmail || ''),
    targetPhone: normalizePhone(row.targetPhone || ''),
    source: cleanText(row.source, 40).toUpperCase() || 'MANUAL',
    notes: cleanText(row.notes, 1000),
    createdByUserId: cleanText(row.createdByUserId, 80),
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    link: code ? `${buildPublicAppBaseUrl()}/login.html?mode=signup&promo=${encodeURIComponent(code)}` : '',
  };
};

const getInvalidReason = (offer, now = new Date()) => {
  if (!offer) return 'NOT_FOUND';
  if (offer.active === false) return 'INACTIVE';
  const validFrom = offer.validFrom ? new Date(offer.validFrom).getTime() : 0;
  if (validFrom && validFrom > now.getTime()) return 'NOT_STARTED';
  const validUntil = offer.validUntil ? new Date(offer.validUntil).getTime() : 0;
  if (validUntil && validUntil < now.getTime()) return 'EXPIRED';
  if (offer.maxUses !== null && offer.maxUses !== undefined && Number(offer.usedCount || 0) >= Number(offer.maxUses)) {
    return 'MAX_USES_REACHED';
  }
  return '';
};

const assertOfferValid = (offer, options = {}) => {
  const reason = getInvalidReason(offer);
  if (reason) {
    if (options.throwOnInvalid === false) return false;
    throw new AppError(400, 'PROMOTION_OFFER_INVALID', `Promotion offer is invalid: ${reason}.`);
  }
  return true;
};

const normalizeOfferInput = (input = {}, existing = null) => {
  const planType = normalizePlanType(input.planType || existing?.planType);
  const plan = PLAN_DEFINITIONS[planType];
  const regularPriceCents = input.regularPriceCents != null || input.regularPrice != null
    ? normalizeMoneyCents(input.regularPriceCents ?? input.regularPrice, 'regularPrice')
    : Number(existing?.regularPriceCents || plan.amountCents);
  const promotionalPriceCents = input.promotionalPriceCents != null || input.promotionalPrice != null
    ? normalizeMoneyCents(input.promotionalPriceCents ?? input.promotionalPrice, 'promotionalPrice')
    : Number(existing?.promotionalPriceCents || 0);
  if (promotionalPriceCents <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'promotionalPrice must be greater than zero.');
  }
  if (promotionalPriceCents > regularPriceCents) {
    throw new AppError(400, 'VALIDATION_ERROR', 'promotionalPrice cannot be greater than regularPrice.');
  }

  const maxUses = input.maxUses === '' || input.maxUses === null || input.maxUses === undefined
    ? (existing?.maxUses ?? null)
    : Math.trunc(Number(input.maxUses));
  if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses <= 0)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'maxUses must be greater than zero.');
  }

  const source = cleanText(input.source || existing?.source || 'MANUAL', 40).toUpperCase();
  if (!VALID_SOURCES.has(source)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'source is invalid.');
  }

  const title = cleanText(input.title || existing?.title, 160);
  if (!title) {
    throw new AppError(400, 'VALIDATION_ERROR', 'title is required.');
  }

  return {
    code: normalizeCode(input.code || existing?.code || generateCode(title)),
    title,
    description: cleanText(input.description ?? existing?.description, 500) || null,
    planType,
    regularPriceCents,
    promotionalPriceCents,
    billingCycle: cleanText(input.billingCycle || existing?.billingCycle || plan.billingCycle, 40) || null,
    maxUses,
    validFrom: normalizeOptionalDate(input.validFrom ?? existing?.validFrom, 'validFrom'),
    validUntil: normalizeOptionalDate(input.validUntil ?? existing?.validUntil, 'validUntil'),
    active: input.active === undefined ? existing?.active !== false : input.active === true,
    targetEmail: normalizeEmail(input.targetEmail ?? existing?.targetEmail) || null,
    targetPhone: normalizePhone(input.targetPhone ?? existing?.targetPhone) || null,
    source,
    notes: cleanText(input.notes ?? existing?.notes, 1000) || null,
  };
};

const promotionOfferService = {
  listOffers: async () => {
    const rows = await promotionOfferRepository.list();
    return rows.map(mapOffer);
  },

  createOffer: async ({ payload = {}, actorId = '' } = {}) => {
    const data = normalizeOfferInput(payload);
    if (!data.code) data.code = generateCode(data.title);
    const duplicate = await promotionOfferRepository.findByCode(data.code).catch(() => null);
    if (duplicate) {
      throw new AppError(409, 'PROMOTION_CODE_EXISTS', 'Promotion code already exists.');
    }
    const created = await promotionOfferRepository.create({
      ...data,
      createdByUserId: cleanText(actorId, 80) || null,
    });
    return mapOffer(created);
  },

  updateOffer: async ({ id, payload = {} } = {}) => {
    const existing = await promotionOfferRepository.findById(id);
    if (!existing) throw new AppError(404, 'PROMOTION_OFFER_NOT_FOUND', 'Promotion offer not found.');
    const data = normalizeOfferInput(payload, existing);
    if (data.code !== existing.code) {
      const duplicate = await promotionOfferRepository.findByCode(data.code).catch(() => null);
      if (duplicate && duplicate.id !== existing.id) {
        throw new AppError(409, 'PROMOTION_CODE_EXISTS', 'Promotion code already exists.');
      }
    }
    const updated = await promotionOfferRepository.update({ id: existing.id, data });
    return mapOffer(updated);
  },

  setOfferActive: async ({ id, active }) => {
    const updated = await promotionOfferRepository.setActive({ id, active });
    if (!updated) throw new AppError(404, 'PROMOTION_OFFER_NOT_FOUND', 'Promotion offer not found.');
    return mapOffer(updated);
  },

  validateOfferByCode: async ({ code, targetEmail = '' } = {}) => {
    const offer = await promotionOfferRepository.findByCode(code).catch(() => null);
    assertOfferValid(offer);
    const mapped = mapOffer(offer);
    const normalizedTarget = normalizeEmail(targetEmail);
    if (mapped.targetEmail && normalizedTarget && mapped.targetEmail !== normalizedTarget) {
      throw new AppError(403, 'PROMOTION_TARGET_MISMATCH', 'Promotion offer is not available for this email.');
    }
    return mapped;
  },

  resolveOfferForCheckout: async ({ code, targetEmail = '', planType = '' } = {}) => {
    if (!cleanText(code)) return null;
    const offer = await promotionOfferService.validateOfferByCode({ code, targetEmail });
    const normalizedPlan = normalizePlanType(planType || offer.planType);
    if (normalizedPlan !== offer.planType) {
      throw new AppError(400, 'PROMOTION_PLAN_MISMATCH', 'Promotion offer does not match the selected plan.');
    }
    return offer;
  },

  incrementUsageOnce: async ({ offerId, pendingSignupId }) => {
    const normalizedOfferId = cleanText(offerId, 80);
    const normalizedPendingSignupId = cleanText(pendingSignupId, 80);
    if (!normalizedOfferId || !normalizedPendingSignupId) return false;
    const rows = await prisma.$queryRaw`
      INSERT INTO "PromotionOfferUsage" ("id", "promotionOfferId", "pendingSignupId", "usedAt")
      VALUES (${crypto.randomUUID()}, ${normalizedOfferId}, ${normalizedPendingSignupId}, NOW())
      ON CONFLICT ("promotionOfferId", "pendingSignupId") DO NOTHING
      RETURNING "id"
    `;
    if (!rows?.[0]?.id) return false;
    await prisma.$executeRaw`
      UPDATE "PromotionOffer"
      SET "usedCount" = "usedCount" + 1, "updatedAt" = NOW()
      WHERE "id" = ${normalizedOfferId}
    `;
    return true;
  },

  incrementSubscriptionUsageOnce: async ({ offerId, clinicId, subscriptionId, paymentExternalId }) => {
    const normalizedOfferId = cleanText(offerId, 80);
    const normalizedClinicId = cleanText(clinicId, 80);
    const normalizedSubscriptionId = cleanText(subscriptionId, 80);
    const normalizedPaymentExternalId = cleanText(paymentExternalId, 160);
    if (!normalizedOfferId || !normalizedSubscriptionId) return false;
    const rows = await prisma.$queryRaw`
      INSERT INTO "PromotionOfferUsage" ("id", "promotionOfferId", "clinicId", "subscriptionId", "paymentExternalId", "usedAt")
      VALUES (
        ${crypto.randomUUID()},
        ${normalizedOfferId},
        ${normalizedClinicId || null},
        ${normalizedSubscriptionId},
        ${normalizedPaymentExternalId || null},
        NOW()
      )
      ON CONFLICT ("promotionOfferId", "subscriptionId") DO NOTHING
      RETURNING "id"
    `;
    if (!rows?.[0]?.id) return false;
    await prisma.$executeRaw`
      UPDATE "PromotionOffer"
      SET "usedCount" = "usedCount" + 1, "updatedAt" = NOW()
      WHERE "id" = ${normalizedOfferId}
    `;
    return true;
  },

  mapOffer,
  PLAN_DEFINITIONS,
};

module.exports = { promotionOfferService };
