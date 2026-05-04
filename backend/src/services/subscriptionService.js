const { AppError } = require('../errors/AppError');
const { appEnv } = require('../config/appEnv');
const { clinicRepository } = require('../repositories/clinicRepository');
const { subscriptionRepository } = require('../repositories/subscriptionRepository');
const { asaasService } = require('./payment/asaasService');

const GRACE_PERIOD_DAYS = 3;
const LEGACY_ACCESS_STATUS = 'LEGACY_ACCESS';
const ENFORCEMENT_DISABLED_STATUS = 'ENFORCEMENT_DISABLED';

const SUBSCRIPTION_PLANS = Object.freeze({
  LEGACY: Object.freeze({
    planType: 'LEGACY',
    amount: 0,
    durationDays: null,
    public: false,
  }),
  MONTHLY: Object.freeze({
    planType: 'MONTHLY',
    amount: 94.9,
    durationDays: 30,
    public: true,
  }),
  QUARTERLY: Object.freeze({
    planType: 'QUARTERLY',
    amount: 269.9,
    durationDays: 90,
    public: true,
  }),
  SEMIANNUAL: Object.freeze({
    planType: 'SEMIANNUAL',
    amount: 499.9,
    durationDays: 180,
    public: true,
  }),
  ANNUAL: Object.freeze({
    planType: 'ANNUAL',
    amount: 899.9,
    durationDays: 365,
    public: true,
  }),
});

const ACCESS_ALLOWED_STATUSES = new Set(['ACTIVE', 'GRACE_PERIOD', LEGACY_ACCESS_STATUS]);
const VALID_CONFIRM_PAYMENT_STATUSES = new Set(['PENDING', 'PAID']);

const normalizeText = (value) => String(value || '').trim();

const normalizeProvider = (value) => {
  const normalized = normalizeText(value).toUpperCase();
  return normalized || 'MANUAL';
};

const normalizePlanType = (value) => {
  const normalized = normalizeText(value).toUpperCase();
  if (!normalized || !SUBSCRIPTION_PLANS[normalized]) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `planType must be one of: ${Object.keys(SUBSCRIPTION_PLANS).filter((planType) => SUBSCRIPTION_PLANS[planType].public).join(', ')}.`
    );
  }
  return normalized;
};

const normalizeOptionalDate = (value, fieldName) => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} is invalid.`);
  }
  return parsed;
};

const parseEnvDate = (value) => {
  const raw = normalizeText(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + Number(days || 0));
  return next;
};

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

const getPlanDefinition = (planType) => SUBSCRIPTION_PLANS[normalizePlanType(planType)];
const getPublicPlanCatalog = () => Object.values(SUBSCRIPTION_PLANS).filter((plan) => plan.public === true);

const isLegacyClinicByCutoff = (clinic) => {
  const activationAt = parseEnvDate(appEnv.subscriptionCommercialActivationAt);
  if (!activationAt) return true;

  const createdAt = clinic?.createdAt ? new Date(clinic.createdAt) : null;
  if (!createdAt || Number.isNaN(createdAt.getTime())) return true;

  return createdAt.getTime() < activationAt.getTime();
};

const logLegacyAccess = (clinic, reason) => {
  console.warn('[subscription][legacy-access]', {
    clinicId: clinic?.id || '',
    clinicCreatedAt: clinic?.createdAt || null,
    commercialActivationAt: appEnv.subscriptionCommercialActivationAt || '',
    reason,
  });
};

const deriveSubscriptionStatus = (subscription, now = new Date()) => {
  if (!subscription) return LEGACY_ACCESS_STATUS;

  const currentStatus = normalizeText(subscription.status).toUpperCase();
  if (currentStatus === 'CANCELED') {
    return 'CANCELED';
  }

  if (currentStatus === 'PENDING_PAYMENT') {
    const lastPaymentStatus = normalizeText(subscription.lastPayment?.status).toUpperCase();
    if (!subscription.endDate || !subscription.graceUntil || lastPaymentStatus === 'PENDING') {
      return 'PENDING_PAYMENT';
    }
  }

  const endTime = subscription.endDate ? new Date(subscription.endDate).getTime() : 0;
  const graceTime = subscription.graceUntil ? new Date(subscription.graceUntil).getTime() : 0;
  const nowTime = now.getTime();

  if (currentStatus === 'ACTIVE' && !endTime && !graceTime) {
    return 'ACTIVE';
  }

  if (!endTime || !graceTime) {
    return currentStatus || 'PENDING_PAYMENT';
  }

  if (nowTime <= endTime) {
    return 'ACTIVE';
  }

  if (nowTime <= graceTime) {
    return 'GRACE_PERIOD';
  }

  return 'BLOCKED';
};

const buildGraceMessage = (subscription, now = new Date()) => {
  if (!subscription?.graceUntil) return '';
  const remainingMs = new Date(subscription.graceUntil).getTime() - now.getTime();
  const remainingDays = Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
  return remainingDays > 0
    ? `Assinatura em tolerancia. Restam ${remainingDays} dia(s) antes do bloqueio.`
    : 'Assinatura em tolerancia. O bloqueio pode ocorrer a qualquer momento apos o prazo.';
};

const buildOverview = (subscription, now = new Date(), options = {}) => {
  const effectiveStatus = options.effectiveStatus || deriveSubscriptionStatus(subscription, now);
  return {
    subscription,
    effectiveStatus,
    accessAllowed: typeof options.accessAllowed === 'boolean'
      ? options.accessAllowed
      : ACCESS_ALLOWED_STATUSES.has(effectiveStatus) || options.bypassed === true,
    bypassed: options.bypassed === true,
    enforcementEnabled: appEnv.subscriptionEnforcementEnabled === true,
    legacyAccess: effectiveStatus === LEGACY_ACCESS_STATUS,
    warning: options.warning || (effectiveStatus === 'GRACE_PERIOD' ? buildGraceMessage(subscription, now) : ''),
    technicalNotice: options.technicalNotice || '',
    plans: getPublicPlanCatalog(),
  };
};

const syncLifecycle = async (subscription, now = new Date()) => {
  if (!subscription) return null;

  const effectiveStatus = deriveSubscriptionStatus(subscription, now);
  if (effectiveStatus === normalizeText(subscription.status).toUpperCase()) {
    return subscription;
  }

  return subscriptionRepository.updateStatus({
    subscriptionId: subscription.id,
    status: effectiveStatus,
  });
};

const resolveRenewalStartDate = (subscription, paidAt) => {
  const endTime = subscription?.endDate ? new Date(subscription.endDate).getTime() : 0;
  if (!endTime) return paidAt;

  const currentStatus = normalizeText(subscription.status).toUpperCase();
  if (!['ACTIVE', 'GRACE_PERIOD'].includes(currentStatus)) {
    return paidAt;
  }

  if (endTime > paidAt.getTime()) {
    return new Date(subscription.endDate);
  }

  return paidAt;
};

const subscriptionService = {
  getPlanCatalog: () => getPublicPlanCatalog(),

  isEnforcementEnabled: () => appEnv.subscriptionEnforcementEnabled === true,

  getMySubscription: async ({ clinicId, role }) => {
    if (normalizeText(role).toUpperCase() === 'SUPER_ADMIN') {
      return buildOverview(null, new Date(), {
        bypassed: true,
        effectiveStatus: 'ACTIVE',
        accessAllowed: true,
      });
    }

    if (!normalizeText(clinicId)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
    }

    const now = new Date();
    const subscription = await subscriptionRepository.findByClinicId({ clinicId });

    if (!subscription) {
      const clinic = await clinicRepository.findById(clinicId);
      const reason = isLegacyClinicByCutoff(clinic) ? 'legacy_clinic_without_subscription' : 'no_subscription_record';
      logLegacyAccess(clinic || { id: clinicId }, reason);

      return buildOverview(null, now, {
        effectiveStatus: LEGACY_ACCESS_STATUS,
        accessAllowed: true,
        warning: appEnv.subscriptionEnforcementEnabled === true
          ? 'Acesso legado liberado por compatibilidade ate a ativacao comercial.'
          : 'Cobranca desativada por feature flag.',
        technicalNotice: reason,
      });
    }

    const synced = await syncLifecycle(subscription, now);
    return buildOverview(synced, now);
  },

  getAccessOverview: async ({ clinicId, role }) => {
    const overview = await subscriptionService.getMySubscription({ clinicId, role });
    if (appEnv.subscriptionEnforcementEnabled !== true) {
      return {
        ...overview,
        effectiveStatus: overview.effectiveStatus === LEGACY_ACCESS_STATUS
          ? LEGACY_ACCESS_STATUS
          : ENFORCEMENT_DISABLED_STATUS,
        accessAllowed: true,
        warning: overview.warning || 'Cobranca desativada por feature flag.',
        technicalNotice: overview.technicalNotice || 'subscription_enforcement_disabled',
      };
    }

    return overview;
  },

  createSubscription: async ({ clinicId, planType, provider, externalPaymentId, paymentLink }) => {
    if (!normalizeText(clinicId)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
    }

    const existing = await subscriptionRepository.findByClinicId({ clinicId });
    if (existing) {
      throw new AppError(409, 'SUBSCRIPTION_ALREADY_EXISTS', 'Subscription already exists for this clinic. Use renew instead.');
    }

    const plan = getPlanDefinition(planType);
    const createdSubscription = await subscriptionRepository.createSubscriptionWithPayment({
      clinicId,
      planType: plan.planType,
      amount: roundMoney(plan.amount),
      provider: normalizeProvider(provider),
      externalPaymentId: normalizeText(externalPaymentId) || null,
      paymentLink: normalizeText(paymentLink) || null,
    });

    let finalSubscription = createdSubscription;
    if (asaasService.isConfigured()) {
      try {
        const clinic = await clinicRepository.findById(clinicId);
        const customer = await asaasService.createCustomer({
          name: clinic?.nomeFantasia || clinic?.razaoSocial || 'Clinica Voithos',
          email: clinic?.email || '',
          cpfCnpj: clinic?.cnpjCpf || '',
          phone: clinic?.telefoneComercial || '',
        });
        const asaasPayment = await asaasService.createPayment({
          customerId: customer?.id,
          value: roundMoney(plan.amount),
          description: `Assinatura Voithos ${plan.planType}`,
        });

        if (createdSubscription?.lastPayment?.id) {
          await subscriptionRepository.updatePaymentGatewayData({
            paymentId: createdSubscription.lastPayment.id,
            provider: 'ASAAS',
            externalPaymentId: asaasPayment?.id || null,
            paymentLink: asaasPayment?.invoiceUrl || null,
          });
          finalSubscription = await subscriptionRepository.findByClinicId({ clinicId });
        }
      } catch (_error) {
        finalSubscription = createdSubscription;
      }
    }

    return {
      ...finalSubscription,
      paymentLink: finalSubscription?.lastPayment?.paymentLink || null,
    };
  },

  confirmPayment: async ({ clinicId, paymentId, provider, externalPaymentId, paidAt }) => {
    if (!normalizeText(clinicId)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
    }

    if (!normalizeText(paymentId) && !(normalizeText(provider) && normalizeText(externalPaymentId))) {
      throw new AppError(400, 'VALIDATION_ERROR', 'paymentId or provider + externalPaymentId are required.');
    }

    const payment = await subscriptionRepository.findPaymentForConfirmation({
      clinicId,
      paymentId: normalizeText(paymentId) || null,
      provider: normalizeProvider(provider),
      externalPaymentId: normalizeText(externalPaymentId) || null,
    });

    if (!payment) {
      throw new AppError(404, 'SUBSCRIPTION_PAYMENT_NOT_FOUND', 'Subscription payment not found.');
    }

    if (!VALID_CONFIRM_PAYMENT_STATUSES.has(normalizeText(payment.status).toUpperCase())) {
      throw new AppError(400, 'SUBSCRIPTION_PAYMENT_INVALID_STATUS', 'Subscription payment cannot be confirmed in the current status.');
    }

    if (normalizeText(payment.status).toUpperCase() === 'PAID') {
      const syncedExisting = await syncLifecycle(payment.subscription, new Date());
      return buildOverview(syncedExisting, new Date());
    }

    const confirmedAt = normalizeOptionalDate(paidAt, 'paidAt') || new Date();
    const currentSubscription = await syncLifecycle(payment.subscription, confirmedAt);
    const plan = getPlanDefinition(currentSubscription.planType);
    const startDate = resolveRenewalStartDate(currentSubscription, confirmedAt);
    const endDate = Number(plan.durationDays) > 0 ? addDays(startDate, plan.durationDays) : null;
    const graceUntil = endDate ? addDays(endDate, GRACE_PERIOD_DAYS) : null;

    const subscription = await subscriptionRepository.confirmPaymentAndActivateSubscription({
      clinicId,
      paymentId: payment.id,
      provider: normalizeProvider(provider || payment.provider),
      externalPaymentId: normalizeText(externalPaymentId) || payment.externalPaymentId || null,
      paidAt: confirmedAt,
      startDate,
      endDate,
      graceUntil,
    });

    return buildOverview(subscription, confirmedAt);
  },

  renewSubscription: async ({ clinicId, planType, provider, externalPaymentId, paymentLink }) => {
    if (!normalizeText(clinicId)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
    }

    const existing = await subscriptionRepository.findByClinicId({ clinicId });
    if (!existing) {
      throw new AppError(404, 'SUBSCRIPTION_NOT_FOUND', 'Subscription not found for this clinic.');
    }

    const synced = await syncLifecycle(existing, new Date());
    const fallbackPlanType = synced.planType === 'LEGACY' ? 'MONTHLY' : synced.planType;
    const nextPlanType = planType ? normalizePlanType(planType) : fallbackPlanType;
    const plan = getPlanDefinition(nextPlanType);
    const resetStatusToPending = !ACCESS_ALLOWED_STATUSES.has(normalizeText(synced.status).toUpperCase());

    const renewed = await subscriptionRepository.createRenewalPayment({
      clinicId,
      planType: plan.planType,
      amount: roundMoney(plan.amount),
      provider: normalizeProvider(provider),
      externalPaymentId: normalizeText(externalPaymentId) || null,
      paymentLink: normalizeText(paymentLink) || null,
      resetStatusToPending,
    });

    return buildOverview(renewed, new Date());
  },

  ensureAccess: async ({ clinicId, role }) => {
    const overview = await subscriptionService.getAccessOverview({ clinicId, role });
    if (overview.accessAllowed) {
      return overview;
    }

    const effectiveStatus = normalizeText(overview.effectiveStatus).toUpperCase();
    if (!overview.subscription) {
      throw new AppError(402, 'SUBSCRIPTION_REQUIRED', 'An active subscription is required to access this resource.');
    }

    if (effectiveStatus === 'PENDING_PAYMENT') {
      throw new AppError(402, 'SUBSCRIPTION_PAYMENT_REQUIRED', 'Subscription payment is pending confirmation.');
    }

    if (effectiveStatus === 'BLOCKED') {
      throw new AppError(403, 'SUBSCRIPTION_BLOCKED', 'Subscription is blocked because the grace period has ended.');
    }

    if (effectiveStatus === 'CANCELED') {
      throw new AppError(403, 'SUBSCRIPTION_CANCELED', 'Subscription is canceled.');
    }

    throw new AppError(403, 'SUBSCRIPTION_ACCESS_DENIED', 'Subscription does not allow access to this resource.');
  },
};

module.exports = {
  ENFORCEMENT_DISABLED_STATUS,
  GRACE_PERIOD_DAYS,
  LEGACY_ACCESS_STATUS,
  SUBSCRIPTION_PLANS,
  subscriptionService,
};
