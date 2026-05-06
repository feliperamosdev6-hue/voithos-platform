const { AppError } = require('../errors/AppError');
const { appEnv } = require('../config/appEnv');
const { clinicRepository } = require('../repositories/clinicRepository');
const { subscriptionRepository } = require('../repositories/subscriptionRepository');
const { authService } = require('./authService');
const { asaasService } = require('./payment/asaasService');

const GRACE_PERIOD_DAYS = 3;
const LEGACY_ACCESS_STATUS = 'LEGACY_ACCESS';
const ENFORCEMENT_DISABLED_STATUS = 'ENFORCEMENT_DISABLED';
const ASAAS_CHECKOUT_PROVIDER = 'ASAAS_CHECKOUT';
const CHECKOUT_PAYMENT_METHODS = Object.freeze({
  CREDIT_CARD: 'CREDIT_CARD',
  INSTALLMENT: 'INSTALLMENT',
});

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
const resolveTodayIsoDate = () => new Date().toISOString().slice(0, 10);

const normalizeCheckoutName = (value, fallback = 'Voithos') => {
  const raw = String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!raw) return fallback;
  return raw.slice(0, 80);
};

const normalizeCheckoutPaymentMethod = (value) => {
  const normalized = normalizeText(value).toUpperCase();
  if (!Object.prototype.hasOwnProperty.call(CHECKOUT_PAYMENT_METHODS, normalized)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'paymentMethod must be one of: CREDIT_CARD, INSTALLMENT.');
  }
  return normalized;
};

const normalizeInstallmentCount = (value) => {
  const count = Number(value || 0);
  if (!Number.isInteger(count)) return 0;
  return count;
};

const resolveCheckoutCallbackBaseUrl = () => normalizeText(appEnv.publicAppBaseUrl || process.env.PUBLIC_APP_BASE_URL || 'http://127.0.0.1:4000');

const buildCheckoutCallback = () => {
  const baseUrl = resolveCheckoutCallbackBaseUrl().replace(/\/+$/, '');
  const loginUrl = `${baseUrl}/login.html`;
  return {
    successUrl: `${loginUrl}?resume=true&payment=success`,
    cancelUrl: `${loginUrl}?resume=true&payment=cancelled`,
    expiredUrl: `${loginUrl}?resume=true&payment=expired`,
  };
};

const buildCheckoutCustomerData = (clinic) => {
  const clinicProfile = clinic?.operationalSettings?.clinicProfile || {};
  const clinicAddress = clinicProfile?.endereco || {};
  const customerData = {
    name: normalizeCheckoutName(clinic?.nomeFantasia || clinic?.razaoSocial || 'Clinica Voithos'),
    cpfCnpj: normalizeText(clinic?.cnpjCpf || '').replace(/\D/g, '') || undefined,
    email: normalizeText(clinic?.email || '') || undefined,
    phone: normalizeText(clinic?.telefoneComercial || '').replace(/\D/g, '') || undefined,
  };

  const address = normalizeText(clinicAddress?.rua || clinicAddress?.logradouro || clinic?.endereco || '');
  const addressNumber = normalizeText(clinicAddress?.numero || '');
  const complement = normalizeText(clinicAddress?.complemento || '');
  const postalCode = normalizeText(clinicAddress?.cep || '').replace(/\D/g, '');
  const province = normalizeText(clinicAddress?.bairro || '');

  if (address) customerData.address = address;
  if (addressNumber) customerData.addressNumber = addressNumber;
  if (complement) customerData.complement = complement;
  if (postalCode) customerData.postalCode = postalCode;
  if (province) customerData.province = province;

  return customerData;
};

const validateCheckoutCustomerData = (customerData = {}) => {
  if (normalizeText(customerData.address)) {
    return;
  }

  throw new AppError(
    400,
    'CHECKOUT_ADDRESS_REQUIRED',
    'Complete o endereco da clinica antes de gerar o checkout. Informe pelo menos a rua/endereco no cadastro da clinica.'
  );
};

const buildCheckoutCustomerContext = ({ clinic }) => {
  const customerData = buildCheckoutCustomerData(clinic);
  validateCheckoutCustomerData(customerData);
  return { customerData };
};

const buildCheckoutPayload = ({ paymentMethod, installmentCount, plan, customerContext = {} }) => {
  const billingTypes = ['CREDIT_CARD'];
  const chargeTypes = paymentMethod === CHECKOUT_PAYMENT_METHODS.INSTALLMENT
    ? ['DETACHED', 'INSTALLMENT']
    : ['DETACHED'];
  const payload = {
    billingTypes,
    chargeTypes,
    minutesToExpire: 120,
    callback: buildCheckoutCallback(),
    items: [
      {
        name: normalizeCheckoutName(`Plano ${plan.planType}`, 'Plano Voithos'),
        description: `Assinatura Voithos ${plan.planType}`,
        quantity: 1,
        value: roundMoney(plan.amount),
      },
    ],
    ...customerContext,
  };

  if (paymentMethod === CHECKOUT_PAYMENT_METHODS.INSTALLMENT) {
    payload.installment = {
      maxInstallmentCount: installmentCount,
    };
  }

  return payload;
};

const isCheckoutPaymentPaid = (payment) => {
  const status = normalizeText(payment?.status).toUpperCase();
  return ['PAID', 'RECEIVED', 'CONFIRMED'].includes(status);
};

const resolvePaidAtFromAsaasPayment = (payment) => {
  const candidates = [
    payment?.paymentDate,
    payment?.clientPaymentDate,
    payment?.confirmedDate,
    payment?.dateCreated,
  ];
  const match = candidates.find((value) => normalizeText(value));
  return match || new Date().toISOString();
};

const resolveWebhookPaymentExternalId = (payment = {}) => {
  const candidates = [
    payment?.checkoutSession?.id,
    payment?.checkoutSessionId,
    payment?.checkoutSession,
    payment?.paymentLink?.id,
    payment?.paymentLinkId,
    payment?.paymentLink,
    payment?.subscription?.id,
    payment?.subscriptionId,
    payment?.id,
  ];

  const match = candidates.find((value) => normalizeText(value));
  return normalizeText(match);
};

const isWebhookPaymentConfirmationEvent = (eventType) => {
  const normalized = normalizeText(eventType).toUpperCase();
  return ['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'CHECKOUT_PAID'].includes(normalized);
};

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
    paymentLink: subscription?.lastPayment?.paymentLink || '',
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

  createSubscription: async ({ clinicId, planType, provider, externalPaymentId, paymentLink, gatewayMode }) => {
    if (!normalizeText(clinicId)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
    }

    const existing = await subscriptionRepository.findByClinicId({ clinicId });
    if (existing) {
      throw new AppError(409, 'SUBSCRIPTION_ALREADY_EXISTS', 'Subscription already exists for this clinic. Use renew instead.');
    }

    const plan = getPlanDefinition(planType);
    const isCheckoutGateway = normalizeText(gatewayMode).toUpperCase() === 'CHECKOUT';
    const normalizedProvider = isCheckoutGateway ? ASAAS_CHECKOUT_PROVIDER : normalizeProvider(provider);
    const createdSubscription = await subscriptionRepository.createSubscriptionWithPayment({
      clinicId,
      planType: plan.planType,
      amount: roundMoney(plan.amount),
      provider: normalizedProvider,
      externalPaymentId: normalizeText(externalPaymentId) || null,
      paymentLink: normalizeText(paymentLink) || null,
    });

    let finalSubscription = createdSubscription;
    if (normalizeText(gatewayMode).toUpperCase() !== 'CHECKOUT' && asaasService.isConfigured()) {
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

  createCheckoutSession: async ({ clinicId, planType, paymentMethod, installmentCount }) => {
    if (!normalizeText(clinicId)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
    }
    if (!asaasService.isConfigured()) {
      throw new AppError(503, 'ASAAS_NOT_CONFIGURED', 'Asaas checkout is not configured.');
    }

    const normalizedPlanType = normalizePlanType(planType);
    const normalizedPaymentMethod = normalizeCheckoutPaymentMethod(paymentMethod);
    const normalizedInstallmentCount = normalizeInstallmentCount(installmentCount);
    if (normalizedPaymentMethod === CHECKOUT_PAYMENT_METHODS.INSTALLMENT && normalizedPlanType !== 'ANNUAL') {
      throw new AppError(400, 'VALIDATION_ERROR', 'Installments are only available for annual plan.');
    }
    if (normalizedPaymentMethod === CHECKOUT_PAYMENT_METHODS.INSTALLMENT && (normalizedInstallmentCount < 2 || normalizedInstallmentCount > 12)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'installmentCount must be between 2 and 12.');
    }

    const subscription = await subscriptionRepository.findByClinicId({ clinicId });
    if (!subscription) {
      throw new AppError(404, 'SUBSCRIPTION_NOT_FOUND', 'Subscription not found for this clinic.');
    }

    const plan = getPlanDefinition(subscription.planType || normalizedPlanType);
    const clinic = await clinicRepository.findProfileById(clinicId);
    if (!clinic) {
      throw new AppError(404, 'CLINIC_NOT_FOUND', 'Clinic not found.');
    }
    const customerContext = buildCheckoutCustomerContext({
      clinic,
    });
    const checkoutPayload = buildCheckoutPayload({
      paymentMethod: normalizedPaymentMethod,
      installmentCount: normalizedInstallmentCount,
      plan,
      customerContext,
    });
    let checkout = null;
    try {
      checkout = await asaasService.createCheckout(checkoutPayload);
    } catch (error) {
      throw new AppError(
        502,
        'ASAAS_CHECKOUT_FAILED',
        error instanceof AppError
          ? error.message
          : `Nao foi possivel gerar o checkout do Asaas: ${String(error?.message || error || 'erro desconhecido')}`
      );
    }

    const checkoutId = normalizeText(checkout?.id);
    if (!checkoutId) {
      throw new AppError(502, 'ASAAS_CHECKOUT_FAILED', 'Asaas checkout did not return an id.');
    }
    const checkoutUrl = asaasService.buildCheckoutUrl(checkoutId);
    if (!checkoutUrl) {
      throw new AppError(502, 'ASAAS_CHECKOUT_FAILED', 'Asaas checkout link could not be generated.');
    }

    if (subscription?.lastPayment?.id) {
      await subscriptionRepository.updatePaymentGatewayData({
        paymentId: subscription.lastPayment.id,
        provider: ASAAS_CHECKOUT_PROVIDER,
        externalPaymentId: checkoutId,
        paymentLink: checkoutUrl || null,
      });
    }

    return {
      checkoutId,
      paymentLink: checkoutUrl || null,
      paymentMethod: normalizedPaymentMethod,
      installmentCount: normalizedPaymentMethod === CHECKOUT_PAYMENT_METHODS.INSTALLMENT ? normalizedInstallmentCount : null,
      nextDueDate: resolveTodayIsoDate(),
      planType: plan.planType,
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

  refreshPaymentStatus: async ({ clinicId, role }) => {
    const overview = await subscriptionService.getMySubscription({ clinicId, role });
    const subscription = overview?.subscription || null;
    const lastPayment = subscription?.lastPayment || null;
    if (!subscription || !lastPayment) {
      return overview;
    }

    const effectiveStatus = normalizeText(overview.effectiveStatus).toUpperCase();
    if (['ACTIVE', 'GRACE_PERIOD'].includes(effectiveStatus)) {
      return overview;
    }

    if (!asaasService.isConfigured()) {
      return overview;
    }

    if (normalizeText(lastPayment.provider).toUpperCase() !== ASAAS_CHECKOUT_PROVIDER || !normalizeText(lastPayment.externalPaymentId)) {
      return overview;
    }

    try {
      const result = await asaasService.listPaymentsByCheckoutSession(lastPayment.externalPaymentId);
      const paymentRows = Array.isArray(result?.data) ? result.data : [];
      const paidPayment = paymentRows.find((payment) => isCheckoutPaymentPaid(payment));
      if (!paidPayment) {
        return overview;
      }

      return subscriptionService.confirmPayment({
        clinicId,
        paymentId: lastPayment.id,
        provider: ASAAS_CHECKOUT_PROVIDER,
        externalPaymentId: paidPayment.id || lastPayment.externalPaymentId,
        paidAt: resolvePaidAtFromAsaasPayment(paidPayment),
      });
    } catch (_error) {
      return overview;
    }
  },

  handleAsaasWebhookEvent: async ({ eventType, payment }) => {
    if (!isWebhookPaymentConfirmationEvent(eventType)) {
      return { handled: false };
    }

    const externalPaymentId = resolveWebhookPaymentExternalId(payment);
    if (!externalPaymentId) {
      return { handled: false };
    }

    const paymentStatus = normalizeText(payment?.status).toUpperCase();
    if (paymentStatus && !['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAID', 'RECEIVED', 'CONFIRMED'].includes(paymentStatus)) {
      return { handled: false };
    }

    const paymentRecord = await subscriptionRepository.findPaymentByProviderAndExternalPaymentId({
      provider: ASAAS_CHECKOUT_PROVIDER,
      externalPaymentId,
    }).catch(() => null);

    if (!paymentRecord) {
      return authService.finalizePendingSignupPaymentByExternalPaymentId({
        externalPaymentId,
        paidAt: resolvePaidAtFromAsaasPayment(payment),
      });
    }

    const paidAt = resolvePaidAtFromAsaasPayment(payment);
    const currentStatus = normalizeText(paymentRecord?.subscription?.status).toUpperCase();
    if (currentStatus === 'ACTIVE') {
      return { handled: true, alreadyActive: true };
    }

    await subscriptionService.confirmPayment({
      clinicId: paymentRecord.clinicId,
      paymentId: paymentRecord.id,
      provider: ASAAS_CHECKOUT_PROVIDER,
      externalPaymentId,
      paidAt,
    });

    return { handled: true };
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
