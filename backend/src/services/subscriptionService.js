const { AppError } = require('../errors/AppError');
const { appEnv } = require('../config/appEnv');
const { clinicRepository } = require('../repositories/clinicRepository');
const { subscriptionRepository } = require('../repositories/subscriptionRepository');
const { authService } = require('./authService');
const { asaasService } = require('./payment/asaasService');
const { promotionOfferService } = require('./promotionOfferService');
const {
  PLAN_CATALOG,
  getPlanDefinition: getCatalogPlanDefinition,
  getPublicPlanCatalog: getCatalogPublicPlanCatalog,
  getValidPublicPlanTypes,
  normalizePlanType: normalizeCatalogPlanType,
} = require('../../../shared/billing/plan-catalog');

const GRACE_PERIOD_DAYS = 3;
const LEGACY_ACCESS_STATUS = 'LEGACY_ACCESS';
const ENFORCEMENT_DISABLED_STATUS = 'ENFORCEMENT_DISABLED';
const TRIAL_EXPIRED_STATUS = 'TRIAL_EXPIRED';
const SUBSCRIPTION_READ_ONLY_CODE = 'SUBSCRIPTION_READ_ONLY';
const SUBSCRIPTION_READ_ONLY_MESSAGE = 'Seu período de teste expirou. Ative sua assinatura para continuar editando dados.';
const ACCESS_MODES = Object.freeze({
  FULL: 'FULL',
  READ_ONLY: 'READ_ONLY',
  DENIED: 'DENIED',
});
const ASAAS_CHECKOUT_PROVIDER = 'ASAAS_CHECKOUT';
const SUBSCRIPTION_CHECKOUT_TTL_MINUTES = 120;
const CHECKOUT_PAYMENT_METHODS = Object.freeze({
  PIX: 'PIX',
  CREDIT_CARD: 'CREDIT_CARD',
  INSTALLMENT: 'INSTALLMENT',
});
const LOCAL_INVALID_PAYMENT_STATUSES = new Set(['FAILED', 'CANCELED', 'CANCELLED', 'EXPIRED', 'OVERDUE']);
const ASAAS_CONFIRMED_PAYMENT_STATUSES = new Set(['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAID', 'RECEIVED', 'CONFIRMED']);
const ASAAS_INVALID_PAYMENT_STATUSES = new Set([
  'CANCELED',
  'CANCELLED',
  'DELETED',
  'REMOVED',
  'FAILED',
  'EXPIRED',
  'OVERDUE',
  'REFUNDED',
  'REFUND_REQUESTED',
  'CHARGEBACK',
  'CHARGEBACK_REQUESTED',
]);
const checkoutSessionLocks = new Map();

const SUBSCRIPTION_PLANS = PLAN_CATALOG;

const ACCESS_ALLOWED_STATUSES = new Set(['TRIALING', 'ACTIVE', 'GRACE_PERIOD', LEGACY_ACCESS_STATUS]);
const PERSISTABLE_SUBSCRIPTION_STATUSES = new Set(['PENDING_PAYMENT', 'ACTIVE', 'GRACE_PERIOD', 'BLOCKED', 'CANCELED', 'TRIALING']);
const VALID_CONFIRM_PAYMENT_STATUSES = new Set(['PENDING', 'PAID']);
const VALID_BILLING_CYCLES = new Set(getValidPublicPlanTypes());
const COMMERCIAL_NOTE_MAX_LENGTH = 2000;

const normalizeText = (value) => String(value || '').trim();

const normalizeProvider = (value) => {
  const normalized = normalizeText(value).toUpperCase();
  return normalized || 'MANUAL';
};

const normalizePlanType = (value) => {
  const normalized = normalizeCatalogPlanType(value);
  if (!normalized || !SUBSCRIPTION_PLANS[normalized]) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `planType must be one of: ${getValidPublicPlanTypes().join(', ')}.`
    );
  }
  return normalized;
};

const normalizeBillingCycle = (value) => {
  const normalized = normalizeText(value).toUpperCase();
  if (!VALID_BILLING_CYCLES.has(normalized)) {
    throw new AppError(400, 'VALIDATION_ERROR', `billingCycle must be one of: ${Array.from(VALID_BILLING_CYCLES).join(', ')}.`);
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
const normalizeMoneyInput = (value, fieldName, options = {}) => {
  if ((value === null || value === undefined || value === '') && options.optional === true) {
    return null;
  }
  const parsed = Number(value);
  const min = options.allowZero === true ? 0 : 0.01;
  if (!Number.isFinite(parsed) || parsed < min) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be a valid amount greater than ${options.allowZero === true ? 'or equal to ' : ''}0.`);
  }
  if (parsed > 999999.99) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} is too high.`);
  }
  return roundMoney(parsed);
};

const resolveSubscriptionBillingCycle = (subscription, fallbackPlanType) => {
  const storedCycle = normalizeText(subscription?.billingCycle).toUpperCase();
  if (storedCycle && VALID_BILLING_CYCLES.has(storedCycle)) {
    return storedCycle;
  }

  const storedPlanType = normalizeText(subscription?.planType).toUpperCase();
  if (VALID_BILLING_CYCLES.has(storedPlanType)) {
    return storedPlanType;
  }

  const fallback = normalizeText(fallbackPlanType).toUpperCase();
  return VALID_BILLING_CYCLES.has(fallback) ? fallback : 'MONTHLY';
};

const resolveSubscriptionAmount = (subscription, fallbackAmount) => {
  const customAmount = Number(subscription?.billingAmount || 0);
  if (subscription?.customPriceEnabled === true && customAmount > 0) {
    return roundMoney(customAmount);
  }

  const storedCycle = normalizeText(subscription?.billingCycle).toUpperCase();
  const storedPlanType = normalizeText(subscription?.planType).toUpperCase();
  if (storedCycle && storedCycle !== storedPlanType) {
    return roundMoney(fallbackAmount);
  }

  const storedAmount = Number(subscription?.amount || 0);
  return roundMoney(storedAmount > 0 ? storedAmount : fallbackAmount);
};

const resolveSubscriptionBillingPlan = (subscription, fallbackPlanType) => {
  const billingCycle = resolveSubscriptionBillingCycle(subscription, fallbackPlanType);
  const basePlan = SUBSCRIPTION_PLANS[billingCycle];
  return {
    ...basePlan,
    amount: resolveSubscriptionAmount(subscription, basePlan.amount),
    billingCycle,
  };
};

const resolveCommercialBaseAmount = (subscription) => {
  const billingCycle = resolveSubscriptionBillingCycle(subscription, subscription?.planType);
  const plan = SUBSCRIPTION_PLANS[billingCycle];
  const storedCycle = normalizeText(subscription?.billingCycle).toUpperCase();
  const storedPlanType = normalizeText(subscription?.planType).toUpperCase();
  const storedAmount = Number(subscription?.amount || 0);
  if (storedAmount > 0 && (!storedCycle || storedCycle === storedPlanType)) {
    return roundMoney(storedAmount);
  }
  return roundMoney(plan.amount);
};

const normalizeCommercialNotes = (value) => {
  const normalized = normalizeText(value).replace(/\s+/g, ' ').slice(0, COMMERCIAL_NOTE_MAX_LENGTH);
  return normalized || null;
};

const toIsoStringOrNull = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const sanitizePaymentForClient = (payment) => {
  if (!payment) return null;
  const provider = normalizeProvider(payment.provider);
  const providerLabel = provider.includes('ASAAS')
    ? 'ASAAS'
    : provider === 'MANUAL'
      ? 'MANUAL'
      : 'OTHER';
  return {
    id: normalizeText(payment.id),
    amount: roundMoney(payment.amount),
    status: normalizeText(payment.status).toUpperCase(),
    provider: providerLabel,
    paymentLink: normalizeText(payment.paymentLink),
    paidAt: toIsoStringOrNull(payment.paidAt),
    createdAt: toIsoStringOrNull(payment.createdAt),
    updatedAt: toIsoStringOrNull(payment.updatedAt),
  };
};

const sanitizeSubscriptionForClient = (subscription, options = {}) => {
  if (!subscription) return null;
  const payments = Array.isArray(subscription.payments)
    ? subscription.payments.map(sanitizePaymentForClient).filter(Boolean)
    : [];
  const data = {
    id: normalizeText(subscription.id),
    planType: normalizeText(subscription.planType).toUpperCase(),
    status: normalizeText(subscription.status).toUpperCase(),
    amount: roundMoney(subscription.amount),
    billingAmount: subscription.billingAmount == null ? null : roundMoney(subscription.billingAmount),
    discountAmount: subscription.discountAmount == null ? null : roundMoney(subscription.discountAmount),
    customPriceEnabled: subscription.customPriceEnabled === true,
    billingCycle: normalizeText(subscription.billingCycle).toUpperCase() || null,
    startDate: toIsoStringOrNull(subscription.startDate),
    endDate: toIsoStringOrNull(subscription.endDate),
    graceUntil: toIsoStringOrNull(subscription.graceUntil),
    trialStartedAt: toIsoStringOrNull(subscription.trialStartedAt),
    trialEndsAt: toIsoStringOrNull(subscription.trialEndsAt),
    activatedAt: toIsoStringOrNull(subscription.activatedAt),
    lastPayment: sanitizePaymentForClient(subscription.lastPayment),
    payments,
    createdAt: toIsoStringOrNull(subscription.createdAt),
    updatedAt: toIsoStringOrNull(subscription.updatedAt),
  };
  if (options.includeCommercialNotes === true) {
    data.commercialNotes = normalizeText(subscription.commercialNotes) || null;
  }
  return data;
};

const normalizeCheckoutName = (value, fallback = 'Voithos') => {
  const raw = String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!raw) return fallback;
  return raw.slice(0, 80);
};

const normalizeCheckoutPaymentMethod = (value) => {
  const normalized = normalizeText(value).toUpperCase();
  if (!Object.prototype.hasOwnProperty.call(CHECKOUT_PAYMENT_METHODS, normalized)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'paymentMethod must be one of: PIX, CREDIT_CARD, INSTALLMENT.');
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
  const returnUrl = `${baseUrl}/payment-return.html`;
  return {
    successUrl: `${returnUrl}?payment=success`,
    cancelUrl: `${returnUrl}?payment=cancelled`,
    expiredUrl: `${returnUrl}?payment=expired`,
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
  const billingTypes = paymentMethod === CHECKOUT_PAYMENT_METHODS.PIX ? ['PIX'] : ['CREDIT_CARD'];
  const chargeTypes = paymentMethod === CHECKOUT_PAYMENT_METHODS.INSTALLMENT
    ? ['DETACHED', 'INSTALLMENT']
    : ['DETACHED'];
  const payload = {
    billingTypes,
    chargeTypes,
    minutesToExpire: SUBSCRIPTION_CHECKOUT_TTL_MINUTES,
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

const runWithCheckoutSessionLock = async (clinicId, task) => {
  const key = normalizeText(clinicId);
  if (!key) return task();

  const previous = checkoutSessionLocks.get(key) || Promise.resolve();
  let releaseCurrent = () => {};
  const current = new Promise((resolve) => {
    releaseCurrent = resolve;
  });
  const queued = previous.catch(() => undefined).then(() => current);
  checkoutSessionLocks.set(key, queued);

  await previous.catch(() => undefined);
  try {
    return await task();
  } finally {
    releaseCurrent();
    if (checkoutSessionLocks.get(key) === queued) {
      checkoutSessionLocks.delete(key);
    }
  }
};

const parseAsaasPaymentList = (response) => {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.payments)) return response.payments;
  if (Array.isArray(response?.items)) return response.items;
  return [];
};

const maskExternalId = (value) => {
  const normalized = normalizeText(value);
  if (!normalized) return '';
  return normalized.length <= 8 ? normalized : `${normalized.slice(0, 6)}...${normalized.slice(-2)}`;
};

const inspectAsaasCheckoutPaymentState = async (checkoutId) => {
  const normalizedCheckoutId = normalizeText(checkoutId);
  if (!normalizedCheckoutId || typeof asaasService.listPaymentsByCheckoutSession !== 'function') {
    return { state: 'UNKNOWN', status: '' };
  }

  try {
    const response = await asaasService.listPaymentsByCheckoutSession(normalizedCheckoutId);
    const payments = parseAsaasPaymentList(response);
    const statuses = payments.map((item) => normalizeText(item?.status).toUpperCase()).filter(Boolean);
    const paidStatus = statuses.find((status) => ASAAS_CONFIRMED_PAYMENT_STATUSES.has(status));
    if (paidStatus) return { state: 'PAID', status: paidStatus };
    const invalidStatus = statuses.find((status) => ASAAS_INVALID_PAYMENT_STATUSES.has(status));
    if (invalidStatus) return { state: 'INVALID', status: invalidStatus };
    return { state: 'PENDING', status: statuses[0] || '' };
  } catch (error) {
    console.warn('[subscription][checkout-status-lookup-failed]', {
      checkoutId: maskExternalId(normalizedCheckoutId),
      error: normalizeText(error?.message || error),
    });
    return { state: 'UNKNOWN', status: '' };
  }
};

const getCheckoutExpiresAt = (payment) => {
  const createdAtTime = getValidDateTime(payment?.createdAt);
  if (!createdAtTime) return null;
  const expiresAt = new Date(createdAtTime + (SUBSCRIPTION_CHECKOUT_TTL_MINUTES * 60 * 1000));
  return Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < createdAtTime
    ? null
    : expiresAt;
};

const evaluateCheckoutPaymentReuse = (payment, now = new Date(), plan = null) => {
  if (!payment) {
    return { action: 'CREATE', reason: 'no_pending_payment' };
  }

  const status = normalizeText(payment.status).toUpperCase() || 'PENDING';
  if (status === 'PAID') {
    return { action: 'PAID', payment };
  }
  if (LOCAL_INVALID_PAYMENT_STATUSES.has(status)) {
    return { action: 'REPLACE', payment, reason: `local_status_${status.toLowerCase()}` };
  }
  if (status !== 'PENDING') {
    return { action: 'REPLACE', payment, reason: `local_status_${status.toLowerCase()}` };
  }
  if (!normalizeText(payment.paymentLink)) {
    return { action: 'REPLACE', payment, reason: 'missing_payment_link' };
  }
  if (!normalizeText(payment.externalPaymentId)) {
    return { action: 'REPLACE', payment, reason: 'missing_external_payment_id' };
  }
  if (plan && roundMoney(payment.amount) !== roundMoney(plan.amount)) {
    return { action: 'REPLACE', payment, reason: 'amount_changed' };
  }

  const expiresAt = getCheckoutExpiresAt(payment);
  if (expiresAt && expiresAt.getTime() <= now.getTime()) {
    return { action: 'REPLACE', payment, reason: 'checkout_expired', expiresAt };
  }

  return { action: 'REUSE', payment, expiresAt };
};

const resolveCheckoutDecision = async ({ subscription, now, plan }) => {
  const effectiveStatus = deriveSubscriptionStatus(subscription, now);
  if (effectiveStatus === 'ACTIVE') {
    return { action: 'ACTIVE', effectiveStatus };
  }

  const localDecision = evaluateCheckoutPaymentReuse(subscription?.lastPayment, now, plan);
  if (localDecision.action === 'PAID') {
    return { ...localDecision, effectiveStatus };
  }

  if (localDecision.action === 'REUSE') {
    const gatewayState = await inspectAsaasCheckoutPaymentState(localDecision.payment.externalPaymentId);
    if (gatewayState.state === 'PAID') {
      return {
        action: 'PAID',
        payment: localDecision.payment,
        effectiveStatus,
        gatewayStatus: gatewayState.status,
        pendingWebhookSync: true,
      };
    }
    if (gatewayState.state === 'INVALID') {
      return {
        action: 'REPLACE',
        payment: localDecision.payment,
        effectiveStatus,
        reason: `asaas_status_${normalizeText(gatewayState.status).toLowerCase() || 'invalid'}`,
        expiresAt: localDecision.expiresAt,
      };
    }
  }

  return {
    ...localDecision,
    effectiveStatus,
  };
};

const buildCheckoutSessionResponse = ({
  checkoutId = '',
  paymentLink = null,
  paymentMethod,
  installmentCount,
  plan,
  subscription,
  effectiveStatus,
  flags = {},
  checkoutExpiresAt = null,
}) => ({
  checkoutId: normalizeText(checkoutId) || null,
  paymentLink: normalizeText(paymentLink) || null,
  paymentMethod,
  installmentCount: paymentMethod === CHECKOUT_PAYMENT_METHODS.INSTALLMENT ? installmentCount : null,
  nextDueDate: resolveTodayIsoDate(),
  planType: plan.planType,
  amount: roundMoney(plan.amount),
  customPriceEnabled: subscription?.customPriceEnabled === true,
  billingCycle: plan.billingCycle,
  checkoutExpiresAt: checkoutExpiresAt ? checkoutExpiresAt.toISOString() : null,
  effectiveStatus: effectiveStatus || deriveSubscriptionStatus(subscription, new Date()),
  reusedExistingCheckout: flags.reusedExistingCheckout === true,
  createdNewCheckout: flags.createdNewCheckout === true,
  replacedExpiredCheckout: flags.replacedExpiredCheckout === true,
  alreadyActive: flags.alreadyActive === true,
  alreadyPaid: flags.alreadyPaid === true,
  pendingWebhookSync: flags.pendingWebhookSync === true,
});

const getPlanDefinition = (planType) => getCatalogPlanDefinition(normalizePlanType(planType));
const getPublicPlanCatalog = () => getCatalogPublicPlanCatalog();

const getValidDateTime = (value) => {
  if (!value) return 0;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? 0 : time;
};

const isTrialExpired = (subscription, now = new Date()) => {
  const status = normalizeText(subscription?.status).toUpperCase();
  if (status !== 'TRIALING') return false;
  const trialEndsTime = getValidDateTime(subscription?.trialEndsAt);
  if (!trialEndsTime) return false;
  return now.getTime() >= trialEndsTime;
};

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

  if (currentStatus === 'TRIALING') {
    return isTrialExpired(subscription, now) ? TRIAL_EXPIRED_STATUS : 'TRIALING';
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

const resolveAccessMode = ({ effectiveStatus, subscription, bypassed = false, now = new Date() }) => {
  if (bypassed === true) return ACCESS_MODES.FULL;

  const normalizedStatus = normalizeText(effectiveStatus).toUpperCase();
  if (
    normalizedStatus === 'ACTIVE'
    || normalizedStatus === 'GRACE_PERIOD'
    || normalizedStatus === 'TRIALING'
    || normalizedStatus === LEGACY_ACCESS_STATUS
    || normalizedStatus === ENFORCEMENT_DISABLED_STATUS
  ) {
    return ACCESS_MODES.FULL;
  }

  if (normalizedStatus === TRIAL_EXPIRED_STATUS || isTrialExpired(subscription, now)) {
    return ACCESS_MODES.READ_ONLY;
  }

  return ACCESS_MODES.DENIED;
};

const buildOverview = (subscription, now = new Date(), options = {}) => {
  const effectiveStatus = options.effectiveStatus || deriveSubscriptionStatus(subscription, now);
  const accessMode = options.accessMode || resolveAccessMode({
    effectiveStatus,
    subscription,
    bypassed: options.bypassed === true,
    now,
  });
  return {
    subscription: sanitizeSubscriptionForClient(subscription),
    paymentLink: subscription?.lastPayment?.paymentLink || '',
    effectiveStatus,
    accessAllowed: typeof options.accessAllowed === 'boolean'
      ? options.accessAllowed
      : accessMode !== ACCESS_MODES.DENIED,
    accessMode,
    readOnly: accessMode === ACCESS_MODES.READ_ONLY,
    bypassed: options.bypassed === true,
    enforcementEnabled: appEnv.subscriptionEnforcementEnabled === true,
    legacyAccess: effectiveStatus === LEGACY_ACCESS_STATUS,
    warning: options.warning
      || (effectiveStatus === TRIAL_EXPIRED_STATUS ? SUBSCRIPTION_READ_ONLY_MESSAGE : '')
      || (effectiveStatus === 'GRACE_PERIOD' ? buildGraceMessage(subscription, now) : ''),
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

  if (!PERSISTABLE_SUBSCRIPTION_STATUSES.has(effectiveStatus)) {
    return subscription;
  }

  return subscriptionRepository.updateStatus({
    subscriptionId: subscription.id,
    status: effectiveStatus,
  });
};

const recordPromotionUsageForActivatedSubscription = async ({ clinicId, subscription, externalPaymentId }) => {
  try {
    const clinic = await clinicRepository.findById(clinicId);
    const onboarding = clinic?.operationalSettings?.onboarding || {};
    const promotion = onboarding?.promotion || {};
    const promotionOfferId = normalizeText(promotion?.promotionOfferId);
    if (!promotionOfferId || !subscription?.id) return false;
    return promotionOfferService.incrementSubscriptionUsageOnce({
      offerId: promotionOfferId,
      clinicId,
      subscriptionId: subscription.id,
      paymentExternalId: externalPaymentId,
    });
  } catch (error) {
    console.warn('[subscription][promotion-usage] failed to record promotion usage', {
      clinicId,
      subscriptionId: subscription?.id || '',
      error: error?.message || String(error || ''),
    });
    return false;
  }
};

const getStoredSubscriptionOverview = async ({ clinicId, role }) => {
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

  return buildOverview(subscription, now, {
    technicalNotice: 'payment_status_read_only',
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

const buildCommercialUpdateResponse = ({ subscription, audit }) => {
  const effectivePlan = resolveSubscriptionBillingPlan(subscription, subscription?.planType);
  return {
    subscription: {
      ...sanitizeSubscriptionForClient(subscription, { includeCommercialNotes: true }),
      effectiveBillingAmount: roundMoney(effectivePlan.amount),
      effectiveBillingCycle: effectivePlan.billingCycle,
    },
    audit: audit ? {
      id: normalizeText(audit.id),
      action: normalizeText(audit.action).toUpperCase(),
      createdAt: toIsoStringOrNull(audit.createdAt),
    } : null,
  };
};

const maskEmailForClient = (value) => {
  const normalized = normalizeText(value).toLowerCase();
  const [localPart = '', domain = ''] = normalized.split('@');
  if (!localPart || !domain) return '';
  const visible = localPart.length <= 2 ? localPart.slice(0, 1) : localPart.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(1, Math.min(4, localPart.length - visible.length)))}@${domain}`;
};

const maskReferenceForClient = (value) => {
  const normalized = normalizeText(value);
  if (!normalized) return '';
  if (normalized.length <= 8) return `${normalized.slice(0, 2)}***`;
  return `${normalized.slice(0, 6)}...${normalized.slice(-2)}`;
};

const sanitizeTimelineText = (value, maxLength = 500) => normalizeText(value)
  .replace(/\s+/g, ' ')
  .slice(0, maxLength);

const getProviderLabel = (value) => {
  const provider = normalizeProvider(value);
  if (provider.includes('ASAAS')) return 'ASAAS';
  if (provider === 'MANUAL') return 'MANUAL';
  return 'OUTRO';
};

const getTimelineActor = (audit = {}) => {
  const email = maskEmailForClient(audit.actorEmail);
  const userId = maskReferenceForClient(audit.actorUserId);
  if (!email && !userId) return null;
  return {
    email: email || null,
    userId: userId || null,
  };
};

const createTimelineEvent = ({
  id,
  type,
  title,
  occurredAt,
  source,
  actor = null,
  description = '',
  metadata = {},
}) => {
  const iso = toIsoStringOrNull(occurredAt);
  if (!iso) return null;
  return {
    id: normalizeText(id) || `${type}-${iso}`,
    type: normalizeText(type).toUpperCase(),
    title: sanitizeTimelineText(title, 120),
    occurredAt: iso,
    source: normalizeText(source).toUpperCase() || 'SYSTEM',
    actor,
    description: sanitizeTimelineText(description, 500),
    metadata: Object.fromEntries(
      Object.entries(metadata || {})
        .filter(([, value]) => value !== null && value !== undefined && value !== '')
        .map(([key, value]) => [key, value])
    ),
  };
};

const resolveAuditChangeLabel = (field) => ({
  amount: 'Valor base',
  billingAmount: 'Valor de cobranca',
  discountAmount: 'Desconto',
  customPriceEnabled: 'Preco customizado',
  billingCycle: 'Ciclo',
  commercialNotes: 'Nota comercial',
  status: 'Status',
  trialEndsAt: 'Fim do trial',
  trialStartedAt: 'Inicio do trial',
}[field] || field);

const formatAuditValueForTimeline = (value) => {
  if (value === null || value === undefined || value === '') return 'vazio';
  if (typeof value === 'boolean') return value ? 'sim' : 'nao';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    if (value.length > 80) return `${value.slice(0, 77)}...`;
    return value;
  }
  return '[valor estruturado]';
};

const buildAuditChanges = (audit = {}) => {
  const before = audit.before && typeof audit.before === 'object' ? audit.before : {};
  const after = audit.after && typeof audit.after === 'object' ? audit.after : {};
  const allowedFields = [
    'amount',
    'billingAmount',
    'discountAmount',
    'customPriceEnabled',
    'billingCycle',
    'commercialNotes',
    'status',
    'trialStartedAt',
    'trialEndsAt',
  ];
  return allowedFields
    .filter((field) => JSON.stringify(before[field] ?? null) !== JSON.stringify(after[field] ?? null))
    .map((field) => ({
      field,
      label: resolveAuditChangeLabel(field),
      before: field === 'commercialNotes'
        ? (normalizeText(before[field]) ? 'preenchida' : 'vazia')
        : formatAuditValueForTimeline(before[field]),
      after: field === 'commercialNotes'
        ? (normalizeText(after[field]) ? 'preenchida' : 'vazia')
        : formatAuditValueForTimeline(after[field]),
    }));
};

const buildCommercialAuditEvent = (audit = {}) => {
  const action = normalizeText(audit.action).toUpperCase();
  const metadata = audit.metadata && typeof audit.metadata === 'object' ? audit.metadata : {};
  const changes = buildAuditChanges(audit);
  const safeMetadata = {
    reason: sanitizeTimelineText(metadata.reason || '', 300),
    billingAmount: metadata.billingAmount ?? null,
    baseAmount: metadata.baseAmount ?? null,
    discountAmount: metadata.discountAmount ?? null,
    billingCycle: normalizeText(metadata.billingCycle).toUpperCase() || null,
    days: metadata.days ?? null,
    trialEndsAt: metadata.trialEndsAt || null,
    hasNotes: typeof metadata.hasNotes === 'boolean' ? metadata.hasNotes : null,
    changes,
  };
  const actionConfig = {
    PRICE_UPDATED: {
      type: 'PRICE_UPDATED',
      title: 'Preco alterado',
      description: 'Condicao comercial de preco atualizada.',
    },
    PRICE_CUSTOMIZATION_DISABLED: {
      type: 'PRICE_UPDATED',
      title: 'Preco customizado desativado',
      description: 'Assinatura voltou para a regra comercial padrao.',
    },
    DISCOUNT_APPLIED: {
      type: 'DISCOUNT_APPLIED',
      title: 'Desconto aplicado',
      description: 'Desconto comercial aplicado na assinatura.',
    },
    TRIAL_EXTENDED: {
      type: 'TRIAL_EXTENDED',
      title: 'Trial extendido',
      description: 'Periodo de trial foi prorrogado.',
    },
    BILLING_CYCLE_UPDATED: {
      type: 'BILLING_CYCLE_UPDATED',
      title: 'Ciclo alterado',
      description: 'Ciclo de cobranca foi atualizado.',
    },
    COMMERCIAL_NOTES_UPDATED: {
      type: 'COMMERCIAL_NOTES_UPDATED',
      title: 'Nota comercial alterada',
      description: 'Nota comercial interna foi atualizada.',
    },
  };
  const config = actionConfig[action];
  if (!config) return null;
  return createTimelineEvent({
    id: `audit-${audit.id}`,
    type: config.type,
    title: config.title,
    occurredAt: audit.createdAt,
    source: 'commercial_audit',
    actor: getTimelineActor(audit),
    description: config.description,
    metadata: safeMetadata,
  });
};

const buildPaymentTimelineEvents = (payment = {}) => {
  const status = normalizeText(payment.status).toUpperCase();
  const baseMetadata = {
    amount: roundMoney(payment.amount),
    provider: getProviderLabel(payment.provider),
    paymentRef: maskReferenceForClient(payment.externalPaymentId),
  };
  const events = [
    createTimelineEvent({
      id: `checkout-created-${payment.id}`,
      type: 'CHECKOUT_CREATED',
      title: 'Checkout criado',
      occurredAt: payment.createdAt,
      source: 'subscription_payment',
      description: 'Checkout de cobranca criado para a assinatura.',
      metadata: {
        ...baseMetadata,
        status,
        expiresAt: toIsoStringOrNull(getCheckoutExpiresAt(payment)),
      },
    }),
  ];

  if (status === 'CANCELED') {
    events.push(createTimelineEvent({
      id: `checkout-replaced-${payment.id}`,
      type: 'CHECKOUT_REPLACED_OR_EXPIRED',
      title: 'Checkout expirado/substituido',
      occurredAt: payment.updatedAt || payment.createdAt,
      source: 'subscription_payment',
      description: 'Checkout pendente foi cancelado, expirado ou substituido por outro checkout.',
      metadata: baseMetadata,
    }));
  }

  if (status === 'PAID') {
    events.push(createTimelineEvent({
      id: `payment-approved-${payment.id}`,
      type: 'PAYMENT_APPROVED',
      title: 'Pagamento aprovado',
      occurredAt: payment.paidAt || payment.updatedAt,
      source: 'subscription_payment',
      description: 'Pagamento da assinatura confirmado pelo fluxo de cobranca.',
      metadata: baseMetadata,
    }));
  }

  return events.filter(Boolean);
};

const buildSubscriptionTimeline = (clinic = {}) => {
  const subscription = clinic.subscription || null;
  const events = [];

  if (subscription?.trialStartedAt) {
    events.push(createTimelineEvent({
      id: `trial-started-${subscription.id}`,
      type: 'TRIAL_STARTED',
      title: 'Trial iniciado',
      occurredAt: subscription.trialStartedAt,
      source: 'subscription',
      description: 'Periodo de teste iniciado para a clinica.',
      metadata: {
        planType: normalizeText(subscription.planType).toUpperCase(),
        trialEndsAt: toIsoStringOrNull(subscription.trialEndsAt),
      },
    }));
  }

  (subscription?.payments || []).forEach((payment) => {
    events.push(...buildPaymentTimelineEvents(payment));
  });

  if (subscription?.activatedAt) {
    events.push(createTimelineEvent({
      id: `subscription-activated-${subscription.id}`,
      type: 'SUBSCRIPTION_ACTIVATED',
      title: 'Assinatura ativada',
      occurredAt: subscription.activatedAt,
      source: 'subscription',
      description: 'Assinatura passou para status ativo apos confirmacao comercial.',
      metadata: {
        planType: normalizeText(subscription.planType).toUpperCase(),
        endDate: toIsoStringOrNull(subscription.endDate),
        graceUntil: toIsoStringOrNull(subscription.graceUntil),
      },
    }));
  }

  (subscription?.commercialAudits || []).forEach((audit) => {
    const event = buildCommercialAuditEvent(audit);
    if (event) events.push(event);
  });

  if (clinic.accessBlockedAt) {
    events.push(createTimelineEvent({
      id: `manual-block-${clinic.id}-${toIsoStringOrNull(clinic.accessBlockedAt)}`,
      type: 'MANUAL_ACCESS_BLOCKED',
      title: 'Bloqueio manual',
      occurredAt: clinic.accessBlockedAt,
      source: 'clinic_access',
      actor: {
        userId: maskReferenceForClient(clinic.accessBlockedByUserId),
      },
      description: sanitizeTimelineText(clinic.accessBlockedReason || 'Acesso da clinica bloqueado manualmente.', 500),
      metadata: {},
    }));
  }

  if (clinic.accessUnblockedAt) {
    events.push(createTimelineEvent({
      id: `manual-unblock-${clinic.id}-${toIsoStringOrNull(clinic.accessUnblockedAt)}`,
      type: 'MANUAL_ACCESS_UNBLOCKED',
      title: 'Desbloqueio manual',
      occurredAt: clinic.accessUnblockedAt,
      source: 'clinic_access',
      actor: {
        userId: maskReferenceForClient(clinic.accessUnblockedByUserId),
      },
      description: 'Acesso da clinica desbloqueado manualmente.',
      metadata: {},
    }));
  }

  return events
    .filter(Boolean)
    .sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));
};

const runCommercialSubscriptionUpdate = async ({
  clinicId,
  action,
  data,
  actorId,
  actorEmail,
  metadata,
}) => {
  const normalizedClinicId = normalizeText(clinicId);
  if (!normalizedClinicId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
  }

  const result = await subscriptionRepository.updateCommercialFieldsForClinic({
    clinicId: normalizedClinicId,
    data,
    action,
    actorUserId: normalizeText(actorId) || null,
    actorEmail: normalizeText(actorEmail).toLowerCase() || null,
    metadata: metadata || null,
  });

  if (!result?.subscription) {
    throw new AppError(404, 'SUBSCRIPTION_NOT_FOUND', 'Subscription not found for this clinic.');
  }

  console.info('[super-admin][subscription-commercial]', {
    action,
    actorId: normalizeText(actorId),
    actorEmail: normalizeText(actorEmail).toLowerCase(),
    clinicId: normalizedClinicId,
    subscriptionId: result.subscription.id,
    auditId: result.audit?.id || '',
  });

  return buildCommercialUpdateResponse(result);
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
        accessMode: ACCESS_MODES.FULL,
        readOnly: false,
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

    return runWithCheckoutSessionLock(clinicId, async () => {
      const foundSubscription = await subscriptionRepository.findByClinicId({ clinicId });
      if (!foundSubscription) {
        throw new AppError(404, 'SUBSCRIPTION_NOT_FOUND', 'Subscription not found for this clinic.');
      }

      const now = new Date();
      const subscription = await syncLifecycle(foundSubscription, now) || foundSubscription;
      const plan = resolveSubscriptionBillingPlan(subscription, normalizedPlanType);
      const decision = await resolveCheckoutDecision({ subscription, now, plan });

      if (decision.action === 'ACTIVE') {
        return buildCheckoutSessionResponse({
          paymentMethod: normalizedPaymentMethod,
          installmentCount: normalizedInstallmentCount,
          plan,
          subscription,
          effectiveStatus: decision.effectiveStatus,
          flags: { alreadyActive: true },
        });
      }

      if (decision.action === 'PAID') {
        return buildCheckoutSessionResponse({
          checkoutId: decision.payment?.externalPaymentId,
          paymentMethod: normalizedPaymentMethod,
          installmentCount: normalizedInstallmentCount,
          plan,
          subscription,
          effectiveStatus: decision.effectiveStatus,
          checkoutExpiresAt: getCheckoutExpiresAt(decision.payment, now),
          flags: {
            alreadyPaid: true,
            pendingWebhookSync: decision.pendingWebhookSync === true,
          },
        });
      }

      if (decision.action === 'REUSE') {
        return buildCheckoutSessionResponse({
          checkoutId: decision.payment.externalPaymentId,
          paymentLink: decision.payment.paymentLink,
          paymentMethod: normalizedPaymentMethod,
          installmentCount: normalizedInstallmentCount,
          plan,
          subscription,
          effectiveStatus: decision.effectiveStatus,
          checkoutExpiresAt: decision.expiresAt || getCheckoutExpiresAt(decision.payment, now),
          flags: { reusedExistingCheckout: true },
        });
      }

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
      const checkoutUrl = normalizeText(checkout?.url || checkout?.invoiceUrl || checkout?.paymentLink || checkout?.checkoutUrl)
        || asaasService.buildCheckoutUrl(checkoutId);
      if (!checkoutId) {
        throw new AppError(502, 'ASAAS_CHECKOUT_FAILED', 'Asaas checkout did not return an id.');
      }
      if (!checkoutUrl) {
        throw new AppError(502, 'ASAAS_CHECKOUT_FAILED', 'Asaas checkout link could not be generated.');
      }

      const replacedPaymentId = decision.action === 'REPLACE' ? normalizeText(decision.payment?.id) : '';
      const updatedSubscription = await subscriptionRepository.createCheckoutPaymentReplacingPending({
        clinicId,
        planType: plan.planType,
        amount: roundMoney(plan.amount),
        provider: ASAAS_CHECKOUT_PROVIDER,
        externalPaymentId: checkoutId,
        paymentLink: checkoutUrl || null,
        replacePaymentId: replacedPaymentId || null,
        resetStatusToPending: false,
      });

      return buildCheckoutSessionResponse({
        checkoutId,
        paymentLink: checkoutUrl,
        paymentMethod: normalizedPaymentMethod,
        installmentCount: normalizedInstallmentCount,
        plan,
        subscription: updatedSubscription || subscription,
        effectiveStatus: deriveSubscriptionStatus(updatedSubscription || subscription, now),
        checkoutExpiresAt: new Date(now.getTime() + (SUBSCRIPTION_CHECKOUT_TTL_MINUTES * 60 * 1000)),
        flags: {
          createdNewCheckout: true,
          replacedExpiredCheckout: Boolean(replacedPaymentId),
        },
      });
    });
  },

  confirmPayment: async ({ clinicId, paymentId, provider, externalPaymentId, paidAt, source }) => {
    if (normalizeText(source).toUpperCase() !== 'ASAAS_WEBHOOK') {
      throw new AppError(403, 'WEBHOOK_ONLY_PAYMENT_CONFIRMATION', 'Payment confirmation is only allowed from the Asaas webhook.');
    }

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

    const currentLastPaymentId = normalizeText(payment?.subscription?.lastPaymentId);
    if (currentLastPaymentId && normalizeText(payment.id) !== currentLastPaymentId) {
      throw new AppError(409, 'STALE_SUBSCRIPTION_PAYMENT', 'Subscription payment is no longer the current checkout.');
    }

    const confirmedAt = normalizeOptionalDate(paidAt, 'paidAt') || new Date();
    const currentSubscription = await syncLifecycle(payment.subscription, confirmedAt);
    const plan = resolveSubscriptionBillingPlan(currentSubscription, currentSubscription.planType);
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

    await recordPromotionUsageForActivatedSubscription({
      clinicId,
      subscription,
      externalPaymentId: normalizeText(externalPaymentId) || payment.externalPaymentId || null,
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
    const plan = resolveSubscriptionBillingPlan({
      ...synced,
      planType: nextPlanType,
      billingCycle: synced.billingCycle || nextPlanType,
    }, nextPlanType);
    const resetStatusToPending = !ACCESS_ALLOWED_STATUSES.has(normalizeText(synced.status).toUpperCase());

    const renewed = await subscriptionRepository.createRenewalPayment({
      clinicId,
      planType: nextPlanType,
      amount: roundMoney(plan.amount),
      provider: normalizeProvider(provider),
      externalPaymentId: normalizeText(externalPaymentId) || null,
      paymentLink: normalizeText(paymentLink) || null,
      resetStatusToPending,
    });

    return buildOverview(renewed, new Date());
  },

  updateCommercialPrice: async ({ clinicId, billingAmount, amount, customPriceEnabled, actorId, actorEmail, reason }) => {
    if (customPriceEnabled === false) {
      return runCommercialSubscriptionUpdate({
        clinicId,
        action: 'PRICE_CUSTOMIZATION_DISABLED',
        actorId,
        actorEmail,
        data: {
          billingAmount: null,
          discountAmount: null,
          customPriceEnabled: false,
        },
        metadata: {
          reason: normalizeCommercialNotes(reason),
        },
      });
    }

    const normalizedAmount = normalizeMoneyInput(
      billingAmount !== undefined ? billingAmount : amount,
      'billingAmount'
    );

    return runCommercialSubscriptionUpdate({
      clinicId,
      action: 'PRICE_UPDATED',
      actorId,
      actorEmail,
      data: {
        billingAmount: normalizedAmount,
        discountAmount: null,
        customPriceEnabled: true,
      },
      metadata: {
        reason: normalizeCommercialNotes(reason),
        billingAmount: normalizedAmount,
      },
    });
  },

  applyCommercialDiscount: async ({ clinicId, discountAmount, baseAmount, actorId, actorEmail, reason }) => {
    const normalizedClinicId = normalizeText(clinicId);
    if (!normalizedClinicId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
    }

    const subscription = await subscriptionRepository.findByClinicId({ clinicId: normalizedClinicId });
    if (!subscription) {
      throw new AppError(404, 'SUBSCRIPTION_NOT_FOUND', 'Subscription not found for this clinic.');
    }

    const normalizedDiscount = normalizeMoneyInput(discountAmount, 'discountAmount', { allowZero: true });
    const normalizedBaseAmount = normalizeMoneyInput(baseAmount, 'baseAmount', { optional: true });
    const commercialBaseAmount = normalizedBaseAmount || resolveCommercialBaseAmount(subscription);
    if (normalizedDiscount >= commercialBaseAmount) {
      throw new AppError(400, 'VALIDATION_ERROR', 'discountAmount must be lower than the commercial base amount.');
    }

    const nextBillingAmount = roundMoney(commercialBaseAmount - normalizedDiscount);
    return runCommercialSubscriptionUpdate({
      clinicId: normalizedClinicId,
      action: 'DISCOUNT_APPLIED',
      actorId,
      actorEmail,
      data: {
        billingAmount: nextBillingAmount,
        discountAmount: normalizedDiscount,
        customPriceEnabled: true,
      },
      metadata: {
        reason: normalizeCommercialNotes(reason),
        baseAmount: commercialBaseAmount,
        discountAmount: normalizedDiscount,
        billingAmount: nextBillingAmount,
      },
    });
  },

  extendTrial: async ({ clinicId, days, extendDays, trialEndsAt, actorId, actorEmail, reason }) => {
    const normalizedClinicId = normalizeText(clinicId);
    if (!normalizedClinicId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
    }

    const subscription = await subscriptionRepository.findByClinicId({ clinicId: normalizedClinicId });
    if (!subscription) {
      throw new AppError(404, 'SUBSCRIPTION_NOT_FOUND', 'Subscription not found for this clinic.');
    }

    const currentStatus = normalizeText(subscription.status).toUpperCase();
    if (currentStatus !== 'TRIALING') {
      throw new AppError(409, 'TRIAL_EXTENSION_NOT_ALLOWED', 'Only trialing subscriptions can have trial extended.');
    }

    const explicitTrialEndsAt = normalizeOptionalDate(trialEndsAt, 'trialEndsAt');
    const dayCount = Number(days !== undefined ? days : extendDays);
    let nextTrialEndsAt = explicitTrialEndsAt;
    if (!nextTrialEndsAt) {
      if (!Number.isInteger(dayCount) || dayCount < 1 || dayCount > 365) {
        throw new AppError(400, 'VALIDATION_ERROR', 'days must be an integer between 1 and 365.');
      }
      const now = new Date();
      const currentTrialEndTime = subscription.trialEndsAt ? new Date(subscription.trialEndsAt).getTime() : 0;
      const baseTime = Math.max(now.getTime(), Number.isNaN(currentTrialEndTime) ? 0 : currentTrialEndTime);
      nextTrialEndsAt = addDays(new Date(baseTime), dayCount);
    }

    if (nextTrialEndsAt.getTime() <= Date.now()) {
      throw new AppError(400, 'VALIDATION_ERROR', 'trialEndsAt must be in the future.');
    }

    return runCommercialSubscriptionUpdate({
      clinicId: normalizedClinicId,
      action: 'TRIAL_EXTENDED',
      actorId,
      actorEmail,
      data: {
        status: 'TRIALING',
        trialStartedAt: subscription.trialStartedAt || new Date(),
        trialEndsAt: nextTrialEndsAt,
      },
      metadata: {
        reason: normalizeCommercialNotes(reason),
        days: Number.isInteger(dayCount) ? dayCount : null,
        trialEndsAt: nextTrialEndsAt.toISOString(),
      },
    });
  },

  updateBillingCycle: async ({ clinicId, billingCycle, actorId, actorEmail, reason }) => {
    const normalizedClinicId = normalizeText(clinicId);
    if (!normalizedClinicId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
    }
    const normalizedBillingCycle = normalizeBillingCycle(billingCycle);
    const subscription = await subscriptionRepository.findByClinicId({ clinicId: normalizedClinicId });
    if (!subscription) {
      throw new AppError(404, 'SUBSCRIPTION_NOT_FOUND', 'Subscription not found for this clinic.');
    }

    const data = {
      billingCycle: normalizedBillingCycle,
    };
    if (subscription.customPriceEnabled !== true) {
      data.billingAmount = null;
      data.discountAmount = null;
    }

    return runCommercialSubscriptionUpdate({
      clinicId: normalizedClinicId,
      action: 'BILLING_CYCLE_UPDATED',
      actorId,
      actorEmail,
      data,
      metadata: {
        reason: normalizeCommercialNotes(reason),
        billingCycle: normalizedBillingCycle,
      },
    });
  },

  updateCommercialNotes: async ({ clinicId, commercialNotes, notes, actorId, actorEmail }) => {
    const normalizedNotes = normalizeCommercialNotes(commercialNotes !== undefined ? commercialNotes : notes);
    return runCommercialSubscriptionUpdate({
      clinicId,
      action: 'COMMERCIAL_NOTES_UPDATED',
      actorId,
      actorEmail,
      data: {
        commercialNotes: normalizedNotes,
      },
      metadata: {
        hasNotes: Boolean(normalizedNotes),
      },
    });
  },

  getCommercialTimeline: async ({ clinicId } = {}) => {
    const normalizedClinicId = normalizeText(clinicId);
    if (!normalizedClinicId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
    }

    const clinic = await subscriptionRepository.findCommercialTimelineByClinicId({
      clinicId: normalizedClinicId,
    });
    if (!clinic) {
      throw new AppError(404, 'CLINIC_NOT_FOUND', 'Clinic not found.');
    }

    const subscription = clinic.subscription || null;
    const primaryAdmin = (clinic.users || []).find((user) => user.isClinicAdmin === true)
      || (clinic.users || [])[0]
      || null;

    return {
      clinic: {
        clinicId: clinic.id,
        name: normalizeText(clinic.nomeFantasia || clinic.razaoSocial) || clinic.id,
        emailMasked: maskEmailForClient(clinic.email || primaryAdmin?.email || ''),
      },
      subscription: subscription ? {
        id: subscription.id,
        planType: normalizeText(subscription.planType).toUpperCase(),
        status: normalizeText(subscription.status).toUpperCase(),
        billingCycle: normalizeText(subscription.billingCycle).toUpperCase() || null,
        amount: roundMoney(subscription.amount),
        billingAmount: subscription.billingAmount == null ? null : roundMoney(subscription.billingAmount),
        discountAmount: subscription.discountAmount == null ? null : roundMoney(subscription.discountAmount),
        customPriceEnabled: subscription.customPriceEnabled === true,
        trialStartedAt: toIsoStringOrNull(subscription.trialStartedAt),
        trialEndsAt: toIsoStringOrNull(subscription.trialEndsAt),
        activatedAt: toIsoStringOrNull(subscription.activatedAt),
        startDate: toIsoStringOrNull(subscription.startDate),
        endDate: toIsoStringOrNull(subscription.endDate),
      } : null,
      events: buildSubscriptionTimeline(clinic),
    };
  },

  refreshPaymentStatus: async ({ clinicId, role }) => {
    return getStoredSubscriptionOverview({ clinicId, role });
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
    if (paymentStatus && !ASAAS_CONFIRMED_PAYMENT_STATUSES.has(paymentStatus)) {
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
    const paymentRecordStatus = normalizeText(paymentRecord?.status).toUpperCase();
    if (currentStatus === 'ACTIVE' && paymentRecordStatus === 'PAID') {
      return { handled: true, alreadyActive: true };
    }
    const currentLastPaymentId = normalizeText(paymentRecord?.subscription?.lastPaymentId);
    if (currentLastPaymentId && normalizeText(paymentRecord.id) !== currentLastPaymentId && paymentRecordStatus !== 'PAID') {
      return { handled: true, stalePayment: true };
    }
    if (LOCAL_INVALID_PAYMENT_STATUSES.has(paymentRecordStatus)) {
      return { handled: true, ignoredInvalidPayment: true };
    }

    await subscriptionService.confirmPayment({
      clinicId: paymentRecord.clinicId,
      paymentId: paymentRecord.id,
      provider: ASAAS_CHECKOUT_PROVIDER,
      externalPaymentId,
      paidAt,
      source: 'ASAAS_WEBHOOK',
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

  ensureAccessMode: async ({ clinicId, role, mode = 'READ' }) => {
    const overview = await subscriptionService.getAccessOverview({ clinicId, role });
    const requestedMode = normalizeText(mode).toUpperCase() === 'WRITE' ? 'WRITE' : 'READ';

    if (overview.accessMode === ACCESS_MODES.FULL) {
      return overview;
    }

    if (overview.accessMode === ACCESS_MODES.READ_ONLY) {
      if (requestedMode === 'READ') {
        return overview;
      }
      throw new AppError(403, SUBSCRIPTION_READ_ONLY_CODE, SUBSCRIPTION_READ_ONLY_MESSAGE);
    }

    await subscriptionService.ensureAccess({ clinicId, role });
    return overview;
  },
};

module.exports = {
  ACCESS_MODES,
  ENFORCEMENT_DISABLED_STATUS,
  GRACE_PERIOD_DAYS,
  LEGACY_ACCESS_STATUS,
  SUBSCRIPTION_READ_ONLY_CODE,
  SUBSCRIPTION_READ_ONLY_MESSAGE,
  SUBSCRIPTION_PLANS,
  TRIAL_EXPIRED_STATUS,
  subscriptionService,
};
