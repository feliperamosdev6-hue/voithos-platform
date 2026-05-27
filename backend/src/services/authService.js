const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { AppError } = require('../errors/AppError');
const { prisma } = require('../db/prisma');
const { clinicRepository } = require('../repositories/clinicRepository');
const { pendingSignupRepository } = require('../repositories/pendingSignupRepository');
const { sessionRepository } = require('../repositories/sessionRepository');
const { userRepository } = require('../repositories/userRepository');
const { emailService } = require('./emailService');
const { asaasService } = require('./payment/asaasService');
const { promotionOfferService } = require('./promotionOfferService');
const {
  getPlanDefinition: getCatalogPlanDefinition,
  getPublicPlanCatalog: getCatalogPublicPlanCatalog,
  normalizePlanType: normalizeCatalogPlanType,
} = require('../../../shared/billing/plan-catalog');

const SESSION_TTL_DAYS = 7;
const PASSWORD_RESET_CODE_TTL_MINUTES = 10;
const SIGNUP_RESEND_WAIT_MINUTES = 2;
const SIGNUP_RESEND_LIMIT = 3;
const SIGNUP_RESEND_BLOCK_MINUTES = 15;
const PENDING_CHECKOUT_TTL_HOURS = 12;
const TRIAL_DURATION_DAYS = 7;
const ASAAS_CHECKOUT_PROVIDER = 'ASAAS_CHECKOUT';
const PENDING_CHECKOUT_INVALID_STATUSES = new Set(['FAILED', 'CANCELED', 'CANCELLED', 'EXPIRED', 'OVERDUE']);
const isProductionEnv = String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
const SUPER_ADMIN_EMAIL = String(
  process.env.VOITHOS_SUPERADMIN_EMAIL || (isProductionEnv ? '' : 'superadmin@voithos.local')
).trim().toLowerCase();
const SUPER_ADMIN_PASSWORD = String(
  process.env.VOITHOS_SUPERADMIN_PASSWORD || (isProductionEnv ? '' : 'voithos@2026')
).trim();
const SUPER_ADMIN_CLINIC_EMAIL = String(
  process.env.VOITHOS_SUPERADMIN_CLINIC_EMAIL || (isProductionEnv ? '' : 'superadmin-clinic@voithos.local')
).trim().toLowerCase();
const SUPER_ADMIN_CLINIC_NAME = String(process.env.VOITHOS_SUPERADMIN_CLINIC_NAME || 'Voithos Platform').trim();

const isMissingTableError = (error) => error && error.code === 'P2021';

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + Number(days || 0));
  return next;
};

const addMinutes = (date, minutes) => {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + Number(minutes || 0));
  return next;
};

const getSignupResendAvailableAt = (sendCount = 1) => addMinutes(
  new Date(),
  Number(sendCount) >= SIGNUP_RESEND_LIMIT
    ? SIGNUP_RESEND_BLOCK_MINUTES
    : SIGNUP_RESEND_WAIT_MINUTES
);

const formatSignupResendWait = (targetAt) => {
  const targetTime = new Date(targetAt).getTime();
  if (!Number.isFinite(targetTime)) return 'alguns minutos';
  const totalSeconds = Math.max(0, Math.ceil((targetTime - Date.now()) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}m ${seconds}s`;
};

const generateSixDigitCode = () => crypto.randomInt(0, 1000000).toString().padStart(6, '0');

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const normalizeCode = (value) => String(value || '').trim().replace(/\D/g, '').slice(0, 6);

const maskEmail = (email) => {
  const normalized = normalizeEmail(email);
  const [localPart = '', domain = ''] = normalized.split('@');
  if (!localPart || !domain) return 'seu e-mail';
  const localMask = localPart.length <= 2
    ? `${localPart[0] || '*'}*`
    : `${localPart.slice(0, 2)}***`;
  return `${localMask}@${domain}`;
};

const normalizeSelectedPlan = (value) => {
  const planType = normalizeCatalogPlanType(value);
  const plan = getCatalogPlanDefinition(planType);
  return plan?.public === true ? plan.planType : '';
};

const PUBLIC_SUBSCRIPTION_PLANS = Object.freeze(
  getCatalogPublicPlanCatalog().reduce((acc, plan) => {
    acc[plan.planType] = Object.freeze({
      planType: plan.planType,
      amount: plan.amount,
      durationDays: plan.durationDays,
      billingCycle: plan.billingCycle,
      trialDays: plan.trialDays,
    });
    return acc;
  }, {})
);

const normalizePaymentMethod = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'PIX') return 'PIX';
  if (normalized === 'INSTALLMENT') return 'INSTALLMENT';
  return 'CREDIT_CARD';
};

const normalizeInstallmentCount = (value) => {
  const count = Number(value || 0);
  return Number.isInteger(count) ? count : 0;
};

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

const getValidTime = (value) => {
  if (!value) return 0;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? 0 : time;
};

const normalizeCheckoutName = (value, fallback = 'Clinica Voithos') => {
  const raw = String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  return (raw || fallback).slice(0, 80);
};

const resolveCheckoutCallbackBaseUrl = () => String(process.env.PUBLIC_APP_BASE_URL || 'http://127.0.0.1:4000').trim().replace(/\/+$/, '');

const buildCheckoutCallback = () => {
  const returnUrl = `${resolveCheckoutCallbackBaseUrl()}/payment-return.html`;
  return {
    successUrl: `${returnUrl}?payment=success`,
    cancelUrl: `${returnUrl}?payment=cancelled`,
    expiredUrl: `${returnUrl}?payment=expired`,
  };
};

const normalizeAddressPart = (value, maxLength = 160) => String(value || '').trim().slice(0, maxLength);

const normalizePendingSignupAddress = (value = {}) => {
  const raw = value && typeof value === 'object' ? value : {};
  return {
    cep: normalizeAddressPart(raw.cep, 16),
    rua: normalizeAddressPart(raw.rua || raw.logradouro, 160),
    numero: normalizeAddressPart(raw.numero || raw.addressNumber, 40),
    complemento: normalizeAddressPart(raw.complemento, 120),
    bairro: normalizeAddressPart(raw.bairro, 120),
    cidade: normalizeAddressPart(raw.cidade, 120),
    uf: normalizeAddressPart(raw.uf || raw.estado, 2).toUpperCase(),
  };
};

const buildClinicAddressLine = (address = {}) => {
  const parts = [
    String(address?.rua || '').trim(),
    String(address?.numero || '').trim(),
    String(address?.bairro || '').trim(),
  ].filter(Boolean);
  return parts.join(', ') || null;
};

const buildPendingCheckoutCustomerData = (signupData) => {
  const address = normalizePendingSignupAddress(signupData?.clinicAddress);
  const customerData = {
    name: normalizeCheckoutName(signupData?.nomeFantasia || 'Clinica Voithos'),
    cpfCnpj: String(signupData?.documentNumber || '').replace(/\D/g, '') || undefined,
    email: normalizeEmail(signupData?.clinicEmail || signupData?.adminEmail || ''),
    phone: String(signupData?.clinicPhone || '').replace(/\D/g, '') || undefined,
    address: address.rua || undefined,
    addressNumber: address.numero || undefined,
    complement: address.complemento || undefined,
    postalCode: String(address.cep || '').replace(/\D/g, '') || undefined,
    province: address.bairro || undefined,
  };
  Object.keys(customerData).forEach((key) => {
    if (!customerData[key]) delete customerData[key];
  });
  return customerData;
};

const buildPendingCheckoutPayload = ({ signupData, paymentMethod, installmentCount, promotionOffer = null }) => {
  const planType = normalizeSelectedPlan(signupData?.selectedPlan);
  const basePlan = PUBLIC_SUBSCRIPTION_PLANS[planType];
  if (!basePlan) {
    throw new AppError(400, 'VALIDATION_ERROR', 'selectedPlan is invalid.');
  }
  const plan = promotionOffer
    ? {
        ...basePlan,
        planType: promotionOffer.planType,
        amount: roundMoney(Number(promotionOffer.promotionalPriceCents || 0) / 100),
      }
    : basePlan;

  const normalizedPaymentMethod = normalizePaymentMethod(paymentMethod);
  const normalizedInstallmentCount = normalizeInstallmentCount(installmentCount);
  if (normalizedPaymentMethod === 'INSTALLMENT' && planType !== 'ANNUAL') {
    throw new AppError(400, 'VALIDATION_ERROR', 'Installments are only available for annual plan.');
  }
  if (normalizedPaymentMethod === 'INSTALLMENT' && (normalizedInstallmentCount < 2 || normalizedInstallmentCount > 12)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'installmentCount must be between 2 and 12.');
  }

  const customerData = buildPendingCheckoutCustomerData(signupData);
  if (!customerData.address) {
    throw new AppError(400, 'CHECKOUT_ADDRESS_REQUIRED', 'Complete o endereco da clinica antes de gerar o checkout.');
  }

  const payload = {
    billingTypes: normalizedPaymentMethod === 'PIX' ? ['PIX'] : ['CREDIT_CARD'],
    chargeTypes: normalizedPaymentMethod === 'INSTALLMENT' ? ['DETACHED', 'INSTALLMENT'] : ['DETACHED'],
    minutesToExpire: PENDING_CHECKOUT_TTL_HOURS * 60,
    callback: buildCheckoutCallback(),
    customerData,
    items: [
      {
        name: normalizeCheckoutName(`Plano ${plan.planType}`, 'Plano Voithos'),
        description: promotionOffer?.code
          ? `Assinatura Voithos ${plan.planType} - oferta ${promotionOffer.code}`
          : `Assinatura Voithos ${plan.planType}`,
        quantity: 1,
        value: roundMoney(plan.amount),
      },
    ],
  };

  if (normalizedPaymentMethod === 'INSTALLMENT') {
    payload.installment = {
      maxInstallmentCount: normalizedInstallmentCount,
    };
  }

  return {
    payload,
    plan,
    paymentMethod: normalizedPaymentMethod,
    installmentCount: normalizedPaymentMethod === 'INSTALLMENT' ? normalizedInstallmentCount : null,
    promotionOffer,
  };
};

const evaluatePendingSignupCheckoutReuse = ({ checkout, checkoutContext, selectedPlan, now = new Date() }) => {
  if (!checkout || typeof checkout !== 'object') {
    return { action: 'CREATE', reason: 'no_checkout' };
  }

  const status = String(checkout.status || 'PENDING').trim().toUpperCase();
  if (status === 'PAID') {
    return { action: 'PAID', checkout };
  }
  if (PENDING_CHECKOUT_INVALID_STATUSES.has(status)) {
    return { action: 'REPLACE', checkout, reason: `local_status_${status.toLowerCase()}` };
  }

  const paymentLink = String(checkout.paymentLink || '').trim();
  const externalPaymentId = String(checkout.externalPaymentId || '').trim();
  if (!paymentLink) return { action: 'REPLACE', checkout, reason: 'missing_payment_link' };
  if (!externalPaymentId) return { action: 'REPLACE', checkout, reason: 'missing_external_payment_id' };

  const expiresAtTime = getValidTime(checkout.expiresAt);
  if (expiresAtTime && expiresAtTime <= now.getTime()) {
    return { action: 'REPLACE', checkout, reason: 'checkout_expired' };
  }

  const checkoutPlanType = normalizeSelectedPlan(checkout.planType || selectedPlan);
  if (checkoutPlanType && checkoutPlanType !== selectedPlan) {
    return { action: 'REPLACE', checkout, reason: 'plan_changed' };
  }

  const checkoutMethod = normalizePaymentMethod(checkout.paymentMethod);
  if (checkoutMethod !== checkoutContext.paymentMethod) {
    return { action: 'REPLACE', checkout, reason: 'payment_method_changed' };
  }

  const checkoutInstallments = checkoutMethod === 'INSTALLMENT'
    ? normalizeInstallmentCount(checkout.installmentCount)
    : null;
  if (checkoutInstallments !== checkoutContext.installmentCount) {
    return { action: 'REPLACE', checkout, reason: 'installment_count_changed' };
  }

  if (roundMoney(checkout.amount) !== roundMoney(checkoutContext.plan.amount)) {
    return { action: 'REPLACE', checkout, reason: 'amount_changed' };
  }

  return { action: 'REUSE', checkout };
};

const isPendingSignupCheckoutExpired = (checkout) => {
  const expiresAtTime = getValidTime(checkout?.expiresAt);
  return Boolean(expiresAtTime && expiresAtTime <= Date.now());
};

const logPasswordReset = (stage, details = {}) => {
  console.info('[password-reset][auth-service]', {
    stage,
    endpoint: details.endpoint || '',
    email: details.email ? maskEmail(details.email) : '',
    status: details.status || '',
    userFound: details.userFound,
    active: details.active,
    updateCount: details.updateCount,
    resendEmailId: details.resendEmailId || '',
    fallback: false,
    error: details.error || '',
    resendError: details.resendError || null,
  });
};

const logAuthDiagnostic = (stage, details = {}) => {
  console.info('[auth][auth-service]', {
    stage,
    endpoint: details.endpoint || '',
    email: details.email ? maskEmail(details.email) : '',
    status: details.status || '',
    error: details.error || '',
  });
};

const sanitizeUser = (user) => {
  if (!user) return null;
  const emailVerificationPending = user.emailVerified !== true && Boolean(user.emailVerificationCode);
  return {
    id: user.id,
    nome: user.nome,
    email: user.email,
    emailVerified: user.emailVerified === true,
    emailVerificationPending,
    role: String(user.role || '').trim().toUpperCase(),
    clinicId: user.clinicId,
    isClinicAdmin: user.isClinicAdmin === true || ['ADMIN', 'SUPER_ADMIN'].includes(String(user.role || '').trim().toUpperCase()),
  };
};

const isSuperAdminUser = (user = {}) => {
  const role = String(user?.role || '').trim().toUpperCase();
  const email = normalizeEmail(user?.email || '');
  return role === 'SUPER_ADMIN' || role === 'SUPERADMIN' || email === SUPER_ADMIN_EMAIL;
};

const assertClinicAccessAllowed = async (user = {}) => {
  if (!user || isSuperAdminUser(user)) return;
  const clinicId = String(user?.clinicId || '').trim();
  if (!clinicId) return;

  let clinic;
  try {
    clinic = await clinicRepository.findById(clinicId);
  } catch (error) {
    if (isMissingTableError(error)) {
      throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
    }
    throw error;
  }
  if (clinic?.accessBlocked === true) {
    throw new AppError(
      403,
      'CLINIC_ACCESS_BLOCKED',
      'Acesso temporariamente bloqueado. Entre em contato com o suporte da Voithos.'
    );
  }
};

const hashPassword = async (password) => {
  const raw = String(password || '');
  if (!raw.trim()) {
    throw new AppError(400, 'VALIDATION_ERROR', 'password is required.');
  }
  return bcrypt.hash(raw, 10);
};

const verifyPassword = async (password, hash) => {
  const rawPassword = String(password || '');
  const rawHash = String(hash || '');
  if (!rawPassword || !rawHash) return false;
  return bcrypt.compare(rawPassword, rawHash);
};

const requestPasswordReset = async ({ email }) => {
  const normalizedEmail = normalizeEmail(email);
  let deliveryConfirmed = false;
  logPasswordReset('request_started', {
    endpoint: '/auth/password-reset/request',
    email: normalizedEmail,
    status: 'started',
  });
  if (!normalizedEmail) {
    logPasswordReset('request_validation_failed', {
      endpoint: '/auth/password-reset/request',
      status: 'missing_email',
    });
    throw new AppError(400, 'VALIDATION_ERROR', 'email is required.');
  }

  const resetCode = generateSixDigitCode();
  const expiresAt = addMinutes(new Date(), PASSWORD_RESET_CODE_TTL_MINUTES);
  logPasswordReset('code_generated', {
    endpoint: '/auth/password-reset/request',
    email: normalizedEmail,
    status: 'generated',
  });

  logPasswordReset('user_lookup_started', {
    endpoint: '/auth/password-reset/request',
    email: normalizedEmail,
    status: 'started',
  });
  const user = await userRepository.findByEmail(normalizedEmail);
  logPasswordReset('user_lookup_completed', {
    endpoint: '/auth/password-reset/request',
    email: normalizedEmail,
    status: user ? 'found' : 'not_found',
    userFound: Boolean(user),
    active: user?.ativo !== false,
  });
  const updateResult = user && user.ativo !== false
    ? await userRepository.updateByEmail({
      email: normalizedEmail,
      data: {
        passwordResetCode: resetCode,
        passwordResetExpiresAt: expiresAt,
      },
    })
    : { count: 0 };

  if (!user || user.ativo === false) {
    logPasswordReset('non_active_account', {
      endpoint: '/auth/password-reset/request',
      email: normalizedEmail,
      status: user ? 'inactive' : 'not_found',
      userFound: Boolean(user),
      active: user?.ativo !== false,
    });
  }

  if (updateResult?.count > 0) {
    logPasswordReset('code_persisted', {
      endpoint: '/auth/password-reset/request',
      email: normalizedEmail,
      status: 'persisted',
      updateCount: updateResult.count,
    });
    try {
      logPasswordReset('email_send_started', {
        endpoint: '/auth/password-reset/request',
        email: normalizedEmail,
        status: 'started',
      });
      const emailResult = await emailService.sendPasswordResetEmail(normalizedEmail, resetCode);
      deliveryConfirmed = emailResult?.success === true;
      if (deliveryConfirmed) {
        logPasswordReset('email_send_accepted', {
          endpoint: '/auth/password-reset/request',
          email: normalizedEmail,
          status: 'accepted',
          resendEmailId: emailResult?.resendEmailId || emailResult?.data?.id || '',
        });
      } else {
        logPasswordReset('email_send_failed', {
          endpoint: '/auth/password-reset/request',
          email: normalizedEmail,
          status: 'failed',
          error: emailResult?.error || 'Email send failed.',
          resendError: emailResult?.resendError || null,
        });
      }
    } catch (emailError) {
      logPasswordReset('email_send_failed', {
        endpoint: '/auth/password-reset/request',
        email: normalizedEmail,
        status: 'failed',
        error: emailError?.message || emailError,
        resendError: emailError?.resendError || null,
      });
      deliveryConfirmed = false;
    }
  }

  logPasswordReset('request_completed', {
    endpoint: '/auth/password-reset/request',
    email: normalizedEmail,
    status: 'completed',
    updateCount: updateResult?.count || 0,
  });

  return {
    requested: true,
    deliveryConfirmed,
  };
};

const extractPendingSignupData = (pendingSignup) => {
  const rawData = pendingSignup?.signupData && typeof pendingSignup.signupData === 'object'
    ? pendingSignup.signupData
    : {};
  return {
    documentType: String(rawData.documentType || '').trim().toUpperCase(),
    documentNumber: String(rawData.documentNumber || '').trim().replace(/\D/g, ''),
    nomeFantasia: String(rawData.nomeFantasia || '').trim(),
    adminNome: String(rawData.adminNome || '').trim(),
    adminEmail: normalizeEmail(rawData.adminEmail || pendingSignup?.email || ''),
    clinicEmail: normalizeEmail(rawData.clinicEmail || rawData.adminEmail || pendingSignup?.email || ''),
    clinicPhone: String(rawData.clinicPhone || '').trim(),
    clinicAddress: normalizePendingSignupAddress(rawData.clinicAddress),
    selectedPlan: normalizeSelectedPlan(rawData.selectedPlan || rawData.planType || rawData.plan),
    promotion: rawData.promotion && typeof rawData.promotion === 'object' ? rawData.promotion : null,
  };
};

const finalizePendingSignup = async (pendingSignup, paymentContext = {}) => {
  const signupData = extractPendingSignupData(pendingSignup);
  const passwordHash = String(pendingSignup?.passwordHash || '').trim();
  if (!signupData.nomeFantasia || !signupData.adminNome || !signupData.adminEmail || !signupData.documentNumber) {
    throw new AppError(400, 'PENDING_SIGNUP_INVALID', 'Pending signup data is invalid.');
  }
  if (!passwordHash) {
    throw new AppError(400, 'PENDING_SIGNUP_INVALID', 'Pending signup password hash is missing.');
  }

  const duplicateClinic = await clinicRepository.findByDocument(signupData.documentNumber);
  if (duplicateClinic) {
    throw new AppError(409, 'CLINIC_DOCUMENT_EXISTS', 'CPF/CNPJ already exists.');
  }

  const duplicateUser = await userRepository.findByEmail(signupData.adminEmail);
  if (duplicateUser) {
    throw new AppError(409, 'USER_EMAIL_EXISTS', 'Admin email already exists.');
  }

  const plan = PUBLIC_SUBSCRIPTION_PLANS[signupData.selectedPlan];
  if (!plan) {
    throw new AppError(400, 'PENDING_SIGNUP_INVALID', 'Pending signup plan is invalid.');
  }
  let contractedAmount = roundMoney(plan.amount);
  let promotionForActivation = null;
  if (signupData.promotion?.code) {
    promotionForActivation = await promotionOfferService.resolveOfferForCheckout({
      code: signupData.promotion.code,
      targetEmail: signupData.adminEmail,
      planType: signupData.selectedPlan,
    });
    contractedAmount = roundMoney(Number(promotionForActivation.promotionalPriceCents || 0) / 100);
  }

  const created = await prisma.$transaction(async (tx) => {
    const paidAt = paymentContext?.paidAt instanceof Date ? paymentContext.paidAt : new Date(paymentContext?.paidAt || Date.now());
    const startDate = paidAt;
    const endDate = addDays(startDate, plan.durationDays);
    const graceUntil = addDays(endDate, 3);
    const clinicAddressLine = buildClinicAddressLine(signupData.clinicAddress);
    const clinic = await tx.clinic.create({
      data: {
        nomeFantasia: signupData.nomeFantasia,
        razaoSocial: signupData.nomeFantasia,
        cnpjCpf: signupData.documentNumber,
        email: signupData.clinicEmail || signupData.adminEmail || null,
        telefoneComercial: signupData.clinicPhone || null,
        endereco: clinicAddressLine,
        operationalSettings: {
          onboarding: {
            selectedPlan: signupData.selectedPlan,
            operationType: '',
            acquisitionSource: promotionForActivation ? 'promotion' : 'landing',
            promotion: promotionForActivation ? {
              promotionOfferId: promotionForActivation.id,
              promotionCode: promotionForActivation.code,
              promotionalPriceCents: promotionForActivation.promotionalPriceCents,
              regularPriceCents: promotionForActivation.regularPriceCents,
              source: promotionForActivation.source,
            } : null,
            startedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            completedAt: '',
          },
          clinicProfile: {
            whatsapp: '',
            cro: '',
            responsavelTecnico: '',
            logoDataUrlCache: '',
            logoVersion: '',
            endereco: {
              ...signupData.clinicAddress,
            },
          },
        },
      },
    });

    const subscription = await tx.subscription.create({
      data: {
        clinicId: clinic.id,
        planType: plan.planType,
        amount: contractedAmount,
        status: 'ACTIVE',
        startDate,
        endDate,
        graceUntil,
        activatedAt: paidAt,
      },
    });

    const subscriptionPayment = await tx.subscriptionPayment.create({
      data: {
        subscriptionId: subscription.id,
        clinicId: clinic.id,
        amount: contractedAmount,
        status: 'PAID',
        provider: String(paymentContext?.provider || ASAAS_CHECKOUT_PROVIDER).trim() || ASAAS_CHECKOUT_PROVIDER,
        externalPaymentId: String(paymentContext?.externalPaymentId || signupData?.paymentCheckout?.externalPaymentId || '').trim() || null,
        paymentLink: String(paymentContext?.paymentLink || signupData?.paymentCheckout?.paymentLink || '').trim() || null,
        paidAt,
      },
    });

    await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        lastPaymentId: subscriptionPayment.id,
      },
    });

    if (promotionForActivation?.id) {
      const usageRows = await tx.$queryRaw`
        INSERT INTO "PromotionOfferUsage" ("id", "promotionOfferId", "pendingSignupId", "clinicId", "subscriptionId", "paymentExternalId", "usedAt")
        VALUES (
          ${crypto.randomUUID()},
          ${promotionForActivation.id},
          ${pendingSignup.id},
          ${clinic.id},
          ${subscription.id},
          ${String(paymentContext?.externalPaymentId || signupData?.paymentCheckout?.externalPaymentId || '').trim() || null},
          NOW()
        )
        ON CONFLICT ("promotionOfferId", "pendingSignupId") DO NOTHING
        RETURNING "id"
      `;
      if (usageRows?.[0]?.id) {
        await tx.$executeRaw`
          UPDATE "PromotionOffer"
          SET "usedCount" = "usedCount" + 1, "updatedAt" = NOW()
          WHERE "id" = ${promotionForActivation.id}
        `;
      }
    }

    const user = await tx.user.create({
      data: {
        clinicId: clinic.id,
        nome: signupData.adminNome,
        email: signupData.adminEmail,
        passwordHash,
        role: 'ADMIN',
        isClinicAdmin: true,
        ativo: true,
        emailVerified: true,
        emailVerificationCode: null,
        emailVerificationExpiresAt: null,
      },
    });

    await tx.$executeRaw`
      DELETE FROM "PendingSignup"
      WHERE "email" = ${signupData.adminEmail}
    `;

    const token = crypto.randomUUID();
    const expiresAt = addDays(new Date(), SESSION_TTL_DAYS);
    const session = await tx.session.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });

    return {
      token: session.token,
      clinic,
      user,
    };
  });

  return {
    verified: true,
    token: created.token,
    clinic: {
      ...created.clinic,
      clinicId: created.clinic.id,
    },
    user: sanitizeUser(created.user),
  };
};

const finalizePendingSignupTrial = async (pendingSignup) => {
  const signupData = extractPendingSignupData(pendingSignup);
  const passwordHash = String(pendingSignup?.passwordHash || '').trim();
  if (!signupData.nomeFantasia || !signupData.adminNome || !signupData.adminEmail || !signupData.documentNumber) {
    throw new AppError(400, 'PENDING_SIGNUP_INVALID', 'Pending signup data is invalid.');
  }
  if (!passwordHash) {
    throw new AppError(400, 'PENDING_SIGNUP_INVALID', 'Pending signup password hash is missing.');
  }

  const duplicateClinic = await clinicRepository.findByDocument(signupData.documentNumber);
  if (duplicateClinic) {
    throw new AppError(409, 'CLINIC_DOCUMENT_EXISTS', 'CPF/CNPJ already exists.');
  }

  const duplicateUser = await userRepository.findByEmail(signupData.adminEmail);
  if (duplicateUser) {
    throw new AppError(409, 'USER_EMAIL_EXISTS', 'Admin email already exists.');
  }

  const selectedPlan = signupData.selectedPlan || 'MONTHLY';
  const plan = PUBLIC_SUBSCRIPTION_PLANS[selectedPlan];
  if (!plan) {
    throw new AppError(400, 'PENDING_SIGNUP_INVALID', 'Pending signup plan is invalid.');
  }

  let contractedAmount = roundMoney(plan.amount);
  let promotionForActivation = null;
  if (signupData.promotion?.code) {
    promotionForActivation = await promotionOfferService.resolveOfferForCheckout({
      code: signupData.promotion.code,
      targetEmail: signupData.adminEmail,
      planType: selectedPlan,
    });
    contractedAmount = roundMoney(Number(promotionForActivation.promotionalPriceCents || 0) / 100);
  }

  const created = await prisma.$transaction(async (tx) => {
    const trialStartedAt = new Date();
    const trialEndsAt = addDays(trialStartedAt, TRIAL_DURATION_DAYS);
    const clinicAddressLine = buildClinicAddressLine(signupData.clinicAddress);
    const clinic = await tx.clinic.create({
      data: {
        nomeFantasia: signupData.nomeFantasia,
        razaoSocial: signupData.nomeFantasia,
        cnpjCpf: signupData.documentNumber,
        email: signupData.clinicEmail || signupData.adminEmail || null,
        telefoneComercial: signupData.clinicPhone || null,
        endereco: clinicAddressLine,
        operationalSettings: {
          onboarding: {
            selectedPlan,
            operationType: '',
            acquisitionSource: promotionForActivation ? 'promotion' : 'landing',
            promotion: promotionForActivation ? {
              promotionOfferId: promotionForActivation.id,
              promotionCode: promotionForActivation.code,
              promotionalPriceCents: promotionForActivation.promotionalPriceCents,
              regularPriceCents: promotionForActivation.regularPriceCents,
              source: promotionForActivation.source,
            } : null,
            startedAt: trialStartedAt.toISOString(),
            updatedAt: trialStartedAt.toISOString(),
            completedAt: '',
          },
          clinicProfile: {
            whatsapp: '',
            cro: '',
            responsavelTecnico: '',
            logoDataUrlCache: '',
            logoVersion: '',
            endereco: {
              ...signupData.clinicAddress,
            },
          },
        },
      },
    });

    const subscription = await tx.subscription.create({
      data: {
        clinicId: clinic.id,
        planType: plan.planType,
        amount: contractedAmount,
        status: 'TRIALING',
        trialStartedAt,
        trialEndsAt,
      },
    });

    const pendingCheckoutExternalId = String(signupData?.paymentCheckout?.externalPaymentId || '').trim();
    const pendingCheckoutPaymentLink = String(signupData?.paymentCheckout?.paymentLink || '').trim();
    if (pendingCheckoutExternalId || pendingCheckoutPaymentLink) {
      const subscriptionPayment = await tx.subscriptionPayment.create({
        data: {
          subscriptionId: subscription.id,
          clinicId: clinic.id,
          amount: contractedAmount,
          status: 'PENDING',
          provider: ASAAS_CHECKOUT_PROVIDER,
          externalPaymentId: pendingCheckoutExternalId || null,
          paymentLink: pendingCheckoutPaymentLink || null,
        },
      });

      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          lastPaymentId: subscriptionPayment.id,
        },
      });
    }

    const user = await tx.user.create({
      data: {
        clinicId: clinic.id,
        nome: signupData.adminNome,
        email: signupData.adminEmail,
        passwordHash,
        role: 'ADMIN',
        isClinicAdmin: true,
        ativo: true,
        emailVerified: true,
        emailVerificationCode: null,
        emailVerificationExpiresAt: null,
      },
    });

    await tx.$executeRaw`
      DELETE FROM "PendingSignup"
      WHERE "email" = ${signupData.adminEmail}
    `;

    const token = crypto.randomUUID();
    const expiresAt = addDays(new Date(), SESSION_TTL_DAYS);
    const session = await tx.session.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });

    return {
      token: session.token,
      clinic,
      user,
      subscription,
    };
  });

  return {
    verified: true,
    pendingCheckout: false,
    token: created.token,
    clinic: {
      ...created.clinic,
      clinicId: created.clinic.id,
    },
    user: sanitizeUser(created.user),
    subscription: {
      ...created.subscription,
      effectiveStatus: 'TRIALING',
    },
    trialStartedAt: created.subscription.trialStartedAt,
    trialEndsAt: created.subscription.trialEndsAt,
  };
};

const confirmEmailVerification = async ({ email, code }) => {
  const normalizedEmail = normalizeEmail(email);
  const normalizedCode = normalizeCode(code);
  logAuthDiagnostic('email_verification_started', {
    endpoint: '/auth/email-verification/confirm',
    email: normalizedEmail,
    status: 'started',
  });

  if (!normalizedEmail) {
    logAuthDiagnostic('email_verification_validation_failed', {
      endpoint: '/auth/email-verification/confirm',
      email: normalizedEmail,
      status: 'missing_email',
    });
    throw new AppError(400, 'VALIDATION_ERROR', 'email is required.');
  }

  if (!/^\d{6}$/.test(normalizedCode)) {
    logAuthDiagnostic('email_verification_validation_failed', {
      endpoint: '/auth/email-verification/confirm',
      email: normalizedEmail,
      status: 'invalid_code_format',
    });
    throw new AppError(400, 'VALIDATION_ERROR', 'verification code must contain 6 digits.');
  }

  const pendingSignup = await pendingSignupRepository.findByEmail(normalizedEmail);
  logAuthDiagnostic('email_verification_pending_signup_lookup', {
    endpoint: '/auth/email-verification/confirm',
    email: normalizedEmail,
    status: pendingSignup ? 'found' : 'not_found',
  });
  const pendingExpiresAt = pendingSignup?.verificationExpiresAt ? new Date(pendingSignup.verificationExpiresAt).getTime() : 0;
  if (pendingSignup) {
    if (String(pendingSignup.verificationCode || '') !== normalizedCode || !pendingExpiresAt || pendingExpiresAt <= Date.now()) {
      logAuthDiagnostic('email_verification_pending_signup_invalid', {
        endpoint: '/auth/email-verification/confirm',
        email: normalizedEmail,
        status: 'invalid_or_expired',
      });
      throw new AppError(400, 'INVALID_VERIFICATION_CODE', 'Invalid or expired verification code.');
    }
    const result = await finalizePendingSignupTrial(pendingSignup);
    logAuthDiagnostic('email_verification_pending_signup_verified', {
      endpoint: '/auth/email-verification/confirm',
      email: normalizedEmail,
      status: 'success',
    });
    return result;
  }

  logAuthDiagnostic('email_verification_fallback_user_lookup', {
    endpoint: '/auth/email-verification/confirm',
    email: normalizedEmail,
    status: 'started',
  });
  const updateResult = await userRepository.confirmEmailVerificationByEmailAndCode({
    email: normalizedEmail,
    code: normalizedCode,
  });

  if (!updateResult || updateResult.count === 0) {
    logAuthDiagnostic('email_verification_fallback_invalid', {
      endpoint: '/auth/email-verification/confirm',
      email: normalizedEmail,
      status: 'invalid_or_expired',
    });
    throw new AppError(400, 'INVALID_VERIFICATION_CODE', 'Invalid or expired verification code.');
  }

  logAuthDiagnostic('email_verification_fallback_completed', {
    endpoint: '/auth/email-verification/confirm',
    email: normalizedEmail,
    status: 'success',
  });
  return {
    verified: true,
  };
};

const resendEmailVerification = async ({ email }) => {
  const normalizedEmail = normalizeEmail(email);
  logAuthDiagnostic('email_verification_resend_started', {
    endpoint: '/auth/email-verification/resend',
    email: normalizedEmail,
    status: 'started',
  });

  if (!normalizedEmail) {
    logAuthDiagnostic('email_verification_resend_validation_failed', {
      endpoint: '/auth/email-verification/resend',
      email: normalizedEmail,
      status: 'missing_email',
    });
    throw new AppError(400, 'VALIDATION_ERROR', 'email is required.');
  }

  const pendingSignup = await pendingSignupRepository.findByEmail(normalizedEmail);
  if (!pendingSignup) {
    logAuthDiagnostic('email_verification_resend_not_found', {
      endpoint: '/auth/email-verification/resend',
      email: normalizedEmail,
      status: 'not_found',
    });
    throw new AppError(404, 'PENDING_SIGNUP_NOT_FOUND', 'Pending signup not found.');
  }

  const pendingExpiresAt = pendingSignup.verificationExpiresAt
    ? new Date(pendingSignup.verificationExpiresAt).getTime()
    : 0;
  if (!pendingExpiresAt || pendingExpiresAt <= Date.now()) {
    logAuthDiagnostic('email_verification_resend_expired', {
      endpoint: '/auth/email-verification/resend',
      email: normalizedEmail,
      status: 'expired',
    });
    throw new AppError(400, 'PENDING_SIGNUP_EXPIRED', 'Verification code expired.');
  }

  const currentSendCount = Math.max(0, Number(pendingSignup.sendCount) || 0);
  const currentResendAt = pendingSignup.resendAvailableAt
    ? new Date(pendingSignup.resendAvailableAt).getTime()
    : 0;
  const now = Date.now();

  if (currentResendAt && currentResendAt > now) {
    const remaining = formatSignupResendWait(currentResendAt);
    const resendBlocked = currentSendCount >= SIGNUP_RESEND_LIMIT;
    logAuthDiagnostic('email_verification_resend_blocked', {
      endpoint: '/auth/email-verification/resend',
      email: normalizedEmail,
      status: resendBlocked ? 'limit_blocked' : 'cooldown_blocked',
    });
    return {
      resent: false,
      blocked: true,
      reason: resendBlocked ? 'limit' : 'cooldown',
      message: resendBlocked
        ? `Limite de 3 envios atingido. Aguarde ${remaining} para tentar novamente.`
        : `Aguarde ${remaining} para reenviar o codigo.`,
      resendAvailableAt: new Date(currentResendAt).toISOString(),
      verificationExpiresAt: pendingSignup.verificationExpiresAt || null,
      sendCount: currentSendCount,
      deliveryConfirmed: false,
      pendingVerification: true,
    };
  }

  const nextSendCount = currentSendCount >= SIGNUP_RESEND_LIMIT ? 1 : Math.max(1, currentSendCount + 1);
  const nextResendAvailableAt = getSignupResendAvailableAt(nextSendCount);
  const verificationCode = generateSixDigitCode();
  const verificationExpiresAt = addMinutes(new Date(), PASSWORD_RESET_CODE_TTL_MINUTES);

  const updatedPendingSignup = await pendingSignupRepository.upsertByEmail({
    email: normalizedEmail,
    passwordHash: pendingSignup.passwordHash,
    signupData: pendingSignup.signupData,
    verificationCode,
    verificationExpiresAt,
    resendAvailableAt: nextResendAvailableAt,
    sendCount: nextSendCount,
  });

  logAuthDiagnostic('email_verification_resend_code_persisted', {
    endpoint: '/auth/email-verification/resend',
    email: normalizedEmail,
    status: 'persisted',
    sendCount: nextSendCount,
  });

  try {
    logAuthDiagnostic('email_verification_resend_email_started', {
      endpoint: '/auth/email-verification/resend',
      email: normalizedEmail,
      status: 'started',
    });
    const emailResult = await emailService.sendVerificationEmail(normalizedEmail, verificationCode);
    const deliveryConfirmed = emailResult?.success === true;
    if (deliveryConfirmed) {
      logAuthDiagnostic('email_verification_resend_email_accepted', {
        endpoint: '/auth/email-verification/resend',
        email: normalizedEmail,
        status: 'success',
      });
      return {
        resent: true,
        blocked: false,
        reason: '',
        message: 'Novo codigo enviado com sucesso.',
        resendAvailableAt: updatedPendingSignup?.resendAvailableAt || nextResendAvailableAt,
        verificationExpiresAt: updatedPendingSignup?.verificationExpiresAt || verificationExpiresAt,
        sendCount: nextSendCount,
        deliveryConfirmed: true,
        pendingVerification: true,
      };
    }

    logAuthDiagnostic('email_verification_resend_email_failed', {
      endpoint: '/auth/email-verification/resend',
      email: normalizedEmail,
      status: 'failed',
      error: emailResult?.error || 'Email send failed.',
      resendError: emailResult?.resendError || null,
    });
    return {
      resent: false,
      blocked: false,
      reason: 'delivery_failed',
      message: 'Nao foi possivel enviar o codigo de confirmacao agora.',
      resendAvailableAt: updatedPendingSignup?.resendAvailableAt || nextResendAvailableAt,
      verificationExpiresAt: updatedPendingSignup?.verificationExpiresAt || verificationExpiresAt,
      sendCount: nextSendCount,
      deliveryConfirmed: false,
      pendingVerification: true,
    };
  } catch (emailError) {
    logAuthDiagnostic('email_verification_resend_email_failed', {
      endpoint: '/auth/email-verification/resend',
      email: normalizedEmail,
      status: 'failed',
      error: emailError?.message || String(emailError || ''),
      resendError: emailError?.resendError || null,
    });
    return {
      resent: false,
      blocked: false,
      reason: 'delivery_failed',
      message: 'Nao foi possivel enviar o codigo de confirmacao agora.',
      resendAvailableAt: updatedPendingSignup?.resendAvailableAt || nextResendAvailableAt,
      verificationExpiresAt: updatedPendingSignup?.verificationExpiresAt || verificationExpiresAt,
      sendCount: nextSendCount,
      deliveryConfirmed: false,
      pendingVerification: true,
    };
  }
};

const validatePasswordResetCode = async ({ email, code }) => {
  const normalizedEmail = normalizeEmail(email);
  const normalizedCode = normalizeCode(code);

  if (!normalizedEmail) {
    throw new AppError(400, 'VALIDATION_ERROR', 'email is required.');
  }

  if (!/^\d{6}$/.test(normalizedCode)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'reset code must contain 6 digits.');
  }

  const user = await userRepository.findByEmail(normalizedEmail);
  const now = Date.now();
  const expiresAt = user?.passwordResetExpiresAt ? new Date(user.passwordResetExpiresAt).getTime() : 0;

  if (
    !user
    || user.ativo === false
    || String(user.passwordResetCode || '') !== normalizedCode
    || !expiresAt
    || expiresAt <= now
  ) {
    throw new AppError(400, 'INVALID_RESET_CODE', 'Invalid or expired reset code.');
  }

  return {
    valid: true,
  };
};

const saveNewPassword = async ({
  email,
  code,
  newPassword,
  confirmPassword,
}) => {
  const normalizedEmail = normalizeEmail(email);
  const normalizedCode = normalizeCode(code);
  const rawNewPassword = String(newPassword || '').trim();
  const rawConfirmPassword = String(confirmPassword || '').trim();

  if (!normalizedEmail) {
    throw new AppError(400, 'VALIDATION_ERROR', 'email is required.');
  }

  if (!/^\d{6}$/.test(normalizedCode)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'reset code must contain 6 digits.');
  }

  if (!rawNewPassword || !rawConfirmPassword) {
    throw new AppError(400, 'VALIDATION_ERROR', 'newPassword and confirmPassword are required.');
  }

  if (rawNewPassword !== rawConfirmPassword) {
    throw new AppError(400, 'PASSWORD_CONFIRMATION_MISMATCH', 'Password confirmation does not match.');
  }

  const passwordHash = await hashPassword(rawNewPassword);
  const updateResult = await userRepository.updatePasswordResetByEmailAndCode({
    email: normalizedEmail,
    code: normalizedCode,
    passwordHash,
  });

  if (!updateResult || updateResult.count === 0) {
    throw new AppError(400, 'INVALID_RESET_CODE', 'Invalid or expired reset code.');
  }

  return {
    reset: true,
  };
};

const ensureSuperAdminUser = async () => {
  if (!SUPER_ADMIN_EMAIL || !SUPER_ADMIN_PASSWORD) return null;

  const existing = await userRepository.findByEmail(SUPER_ADMIN_EMAIL);
  let clinic = await clinicRepository.findByEmail(SUPER_ADMIN_CLINIC_EMAIL);
  if (!clinic) {
    clinic = await clinicRepository.create({
      nomeFantasia: SUPER_ADMIN_CLINIC_NAME,
      razaoSocial: SUPER_ADMIN_CLINIC_NAME,
      email: SUPER_ADMIN_CLINIC_EMAIL,
      telefoneComercial: '',
      endereco: '',
      cnpjCpf: '',
    });
  }

  const passwordHash = await hashPassword(SUPER_ADMIN_PASSWORD);
  if (!existing) {
    return userRepository.create({
      clinicId: clinic.id,
      nome: 'Super Admin Voithos',
      email: SUPER_ADMIN_EMAIL,
      passwordHash,
      role: 'SUPER_ADMIN',
      isClinicAdmin: true,
      ativo: true,
    });
  }

  await userRepository.updateByEmail({
    email: SUPER_ADMIN_EMAIL,
    data: {
      clinicId: clinic.id,
      nome: 'Super Admin Voithos',
      passwordHash,
      role: 'SUPER_ADMIN',
      isClinicAdmin: true,
      ativo: true,
      emailVerified: true,
      emailVerificationCode: null,
      emailVerificationExpiresAt: null,
    },
  });

  return userRepository.findByEmail(SUPER_ADMIN_EMAIL);
};

const createSession = async (userId) => {
  const token = crypto.randomUUID();
  const expiresAt = addDays(new Date(), SESSION_TTL_DAYS);

  try {
    const session = await sessionRepository.create({
      userId,
      token,
      expiresAt,
    });
    return session;
  } catch (error) {
    if (isMissingTableError(error)) {
      throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
    }
    throw error;
  }
};

const getSessionByToken = async (token) => {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) return null;

  try {
    const session = await sessionRepository.findByToken(normalizedToken);
    if (!session) return null;
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      await sessionRepository.deleteByToken(normalizedToken);
      return null;
    }
    return session;
  } catch (error) {
    if (isMissingTableError(error)) {
      throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
    }
    throw error;
  }
};

const getCurrentUser = async (token) => {
  const session = await getSessionByToken(token);
  if (!session) return null;

  try {
    const user = await userRepository.findById(session.userId);
    if (!user || user.ativo === false) return null;
    await assertClinicAccessAllowed(user);
    return sanitizeUser(user);
  } catch (error) {
    if (isMissingTableError(error)) {
      throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
    }
    throw error;
  }
};

const login = async ({ email, password }) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const rawPassword = String(password || '');

  if (!normalizedEmail) {
    throw new AppError(400, 'VALIDATION_ERROR', 'email is required.');
  }

  if (!rawPassword) {
    throw new AppError(400, 'VALIDATION_ERROR', 'password is required.');
  }

  let user;
  try {
    if (normalizedEmail === SUPER_ADMIN_EMAIL) {
      await ensureSuperAdminUser();
    }
    user = await userRepository.findByEmail(normalizedEmail);
  } catch (error) {
    if (isMissingTableError(error)) {
      throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
    }
    throw error;
  }

  if (!user) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid credentials.');
  }

  if (user.ativo === false) {
    throw new AppError(403, 'USER_INACTIVE', 'User is inactive.');
  }

  const passwordOk = await verifyPassword(rawPassword, user.passwordHash);
  if (!passwordOk) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid credentials.');
  }

  await assertClinicAccessAllowed(user);

  const session = await createSession(user.id);
  return {
    token: session.token,
    user: sanitizeUser(user),
  };
};

const getPendingSignupForCheckout = async ({ email, pendingSignupToken }) => {
  const normalizedEmail = normalizeEmail(email);
  const normalizedToken = String(pendingSignupToken || '').trim();
  if (!normalizedEmail || !normalizedToken) {
    throw new AppError(400, 'VALIDATION_ERROR', 'email and pendingSignupToken are required.');
  }

  const pendingSignup = await pendingSignupRepository.findByEmail(normalizedEmail);
  if (!pendingSignup) {
    throw new AppError(404, 'PENDING_SIGNUP_NOT_FOUND', 'Pending signup not found.');
  }

  const signupData = pendingSignup.signupData && typeof pendingSignup.signupData === 'object'
    ? pendingSignup.signupData
    : {};
  if (String(signupData.checkoutToken || '').trim() !== normalizedToken) {
    throw new AppError(401, 'PENDING_SIGNUP_INVALID_TOKEN', 'Pending signup token is invalid.');
  }
  if (!signupData.emailVerifiedAt) {
    throw new AppError(403, 'PENDING_SIGNUP_EMAIL_NOT_VERIFIED', 'Email verification is required before payment.');
  }

  return {
    pendingSignup,
    signupData,
  };
};

const updatePendingSignupOnboarding = async ({ email, pendingSignupToken, selectedPlan, operationType }) => {
  const { pendingSignup, signupData } = await getPendingSignupForCheckout({ email, pendingSignupToken });
  const normalizedPlan = selectedPlan ? normalizeSelectedPlan(selectedPlan) : normalizeSelectedPlan(signupData.selectedPlan);
  if (selectedPlan && !PUBLIC_SUBSCRIPTION_PLANS[normalizedPlan]) {
    throw new AppError(400, 'VALIDATION_ERROR', 'selectedPlan is invalid.');
  }
  const nextSignupData = {
    ...signupData,
    selectedPlan: normalizedPlan || signupData.selectedPlan,
    operationType: String(operationType || signupData.operationType || '').trim().toUpperCase(),
    promotion: selectedPlan && normalizedPlan !== normalizeSelectedPlan(signupData.selectedPlan)
      ? null
      : signupData.promotion,
    paymentCheckout: selectedPlan && normalizedPlan !== normalizeSelectedPlan(signupData.selectedPlan)
      ? null
      : signupData.paymentCheckout,
  };

  const updated = await pendingSignupRepository.updateSignupDataByEmail({
    email: pendingSignup.email,
    signupData: nextSignupData,
  });
  const reusableCheckout = !isPendingSignupCheckoutExpired(nextSignupData.paymentCheckout);

  return {
    selectedPlan: normalizeSelectedPlan(nextSignupData.selectedPlan),
    operationType: nextSignupData.operationType || '',
    paymentLink: reusableCheckout ? (nextSignupData.paymentCheckout?.paymentLink || null) : null,
    paymentExpiresAt: reusableCheckout ? (nextSignupData.paymentCheckout?.expiresAt || null) : null,
    pendingCheckout: true,
    pendingSignupId: updated?.id || pendingSignup.id,
  };
};

const createPendingSignupCheckout = async ({ email, pendingSignupToken, planType, paymentMethod, installmentCount }) => {
  if (!asaasService.isConfigured()) {
    throw new AppError(503, 'ASAAS_NOT_CONFIGURED', 'Asaas checkout is not configured.');
  }

  const { pendingSignup, signupData } = await getPendingSignupForCheckout({ email, pendingSignupToken });
  const selectedPlan = normalizeSelectedPlan(planType || signupData.selectedPlan);
  if (!PUBLIC_SUBSCRIPTION_PLANS[selectedPlan]) {
    throw new AppError(400, 'VALIDATION_ERROR', 'selectedPlan is invalid.');
  }
  const promotionOffer = signupData.promotion?.code
    ? await promotionOfferService.resolveOfferForCheckout({
        code: signupData.promotion.code,
        targetEmail: pendingSignup.email,
        planType: selectedPlan,
      })
    : null;

  const checkoutContext = buildPendingCheckoutPayload({
    signupData: {
      ...signupData,
      selectedPlan,
    },
    paymentMethod,
    installmentCount,
    promotionOffer,
  });
  const checkoutDecision = evaluatePendingSignupCheckoutReuse({
    checkout: signupData.paymentCheckout,
    checkoutContext,
    selectedPlan,
    now: new Date(),
  });

  if (checkoutDecision.action === 'REUSE') {
    return {
      checkoutId: String(checkoutDecision.checkout.externalPaymentId || '').trim(),
      paymentLink: String(checkoutDecision.checkout.paymentLink || '').trim(),
      paymentMethod: checkoutContext.paymentMethod,
      installmentCount: checkoutContext.installmentCount,
      planType: selectedPlan,
      amount: roundMoney(checkoutContext.plan.amount),
      promotion: checkoutDecision.checkout.promotion || promotionOffer,
      expiresAt: checkoutDecision.checkout.expiresAt || null,
      pendingCheckout: true,
      reusedExistingCheckout: true,
      createdNewCheckout: false,
      replacedExpiredCheckout: false,
    };
  }

  if (checkoutDecision.action === 'PAID') {
    return {
      checkoutId: String(checkoutDecision.checkout.externalPaymentId || '').trim(),
      paymentLink: null,
      paymentMethod: checkoutContext.paymentMethod,
      installmentCount: checkoutContext.installmentCount,
      planType: selectedPlan,
      amount: roundMoney(checkoutContext.plan.amount),
      promotion: checkoutDecision.checkout.promotion || promotionOffer,
      expiresAt: checkoutDecision.checkout.expiresAt || null,
      pendingCheckout: true,
      alreadyPaid: true,
      pendingWebhookSync: true,
    };
  }

  let checkout = null;
  try {
    checkout = await asaasService.createCheckout(checkoutContext.payload);
  } catch (error) {
    throw new AppError(502, 'ASAAS_CHECKOUT_FAILED', `Nao foi possivel gerar o checkout do Asaas: ${String(error?.message || error || 'erro desconhecido')}`);
  }

  const checkoutId = String(checkout?.id || '').trim();
  const checkoutUrl = String(checkout?.url || checkout?.invoiceUrl || checkout?.paymentLink || checkout?.checkoutUrl || '').trim()
    || asaasService.buildCheckoutUrl(checkoutId);
  if (!checkoutId) {
    throw new AppError(502, 'ASAAS_CHECKOUT_FAILED', 'Asaas checkout did not return an id.');
  }
  const expiresAt = addMinutes(new Date(), PENDING_CHECKOUT_TTL_HOURS * 60).toISOString();
  const nextSignupData = {
    ...signupData,
    selectedPlan,
    paymentCheckout: {
      provider: ASAAS_CHECKOUT_PROVIDER,
      externalPaymentId: checkoutId,
      paymentLink: checkoutUrl,
      paymentMethod: checkoutContext.paymentMethod,
      installmentCount: checkoutContext.installmentCount,
      planType: selectedPlan,
      amount: roundMoney(checkoutContext.plan.amount),
      promotion: promotionOffer ? {
        promotionOfferId: promotionOffer.id,
        promotionCode: promotionOffer.code,
        promotionalPriceCents: promotionOffer.promotionalPriceCents,
        regularPriceCents: promotionOffer.regularPriceCents,
        source: promotionOffer.source,
      } : null,
      expiresAt,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    },
  };

  await pendingSignupRepository.updateSignupDataByEmail({
    email: pendingSignup.email,
    signupData: nextSignupData,
  });

  return {
    checkoutId,
    paymentLink: checkoutUrl,
    paymentMethod: checkoutContext.paymentMethod,
    installmentCount: checkoutContext.installmentCount,
    planType: selectedPlan,
    amount: roundMoney(checkoutContext.plan.amount),
    promotion: promotionOffer,
    expiresAt,
    pendingCheckout: true,
    reusedExistingCheckout: false,
    createdNewCheckout: true,
    replacedExpiredCheckout: checkoutDecision.action === 'REPLACE',
  };
};

const refreshPendingSignupPaymentStatus = async ({ email, pendingSignupToken }) => {
  const { signupData } = await getPendingSignupForCheckout({ email, pendingSignupToken });
  const checkoutId = String(signupData.paymentCheckout?.externalPaymentId || '').trim();
  if (!checkoutId) {
    return {
      pendingCheckout: true,
      paymentLink: null,
      effectiveStatus: 'PENDING_PAYMENT',
    };
  }
  const checkoutExpired = isPendingSignupCheckoutExpired(signupData.paymentCheckout);

  return {
    pendingCheckout: true,
    paymentLink: checkoutExpired ? null : (signupData.paymentCheckout?.paymentLink || null),
    effectiveStatus: 'PENDING_PAYMENT',
    checkoutExpired,
  };
};

const finalizePendingSignupPaymentByExternalPaymentId = async ({ externalPaymentId, paidAt }) => {
  const pendingSignup = await pendingSignupRepository.findByCheckoutExternalPaymentId(externalPaymentId);
  if (!pendingSignup) {
    return { handled: false };
  }

  const signupData = pendingSignup.signupData && typeof pendingSignup.signupData === 'object'
    ? pendingSignup.signupData
    : {};
  const currentCheckoutId = String(signupData.paymentCheckout?.externalPaymentId || '').trim();
  const currentCheckoutStatus = String(signupData.paymentCheckout?.status || 'PENDING').trim().toUpperCase();
  if (
    currentCheckoutId !== String(externalPaymentId || '').trim()
    || PENDING_CHECKOUT_INVALID_STATUSES.has(currentCheckoutStatus)
    || isPendingSignupCheckoutExpired(signupData.paymentCheckout)
  ) {
    return { handled: true, stalePayment: true };
  }

  const duplicateUser = await userRepository.findByEmail(normalizeEmail(signupData.adminEmail || pendingSignup.email || ''));
  if (duplicateUser) {
    await pendingSignupRepository.deleteByEmail(pendingSignup.email);
    return { handled: true, alreadyFinalized: true };
  }

  const result = await finalizePendingSignup(pendingSignup, {
    provider: ASAAS_CHECKOUT_PROVIDER,
    externalPaymentId,
    paymentLink: signupData.paymentCheckout?.paymentLink || null,
    paidAt: paidAt || new Date(),
  });

  return {
    handled: true,
    clinicId: result?.clinic?.id || result?.clinic?.clinicId || '',
  };
};

const logout = async (token) => {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication token is required.');
  }

  try {
    await sessionRepository.deleteByToken(normalizedToken);
    return { loggedOut: true };
  } catch (error) {
    if (isMissingTableError(error)) {
      throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
    }
    throw error;
  }
};

const changePassword = async ({ token, currentPassword, newPassword }) => {
  const normalizedToken = String(token || '').trim();
  const rawCurrentPassword = String(currentPassword || '').trim();
  const rawNewPassword = String(newPassword || '').trim();

  if (!normalizedToken) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication token is required.');
  }

  if (!rawCurrentPassword || !rawNewPassword) {
    throw new AppError(400, 'VALIDATION_ERROR', 'currentPassword and newPassword are required.');
  }

  const session = await getSessionByToken(normalizedToken);
  if (!session) {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired session.');
  }

  const user = await userRepository.findById(session.userId);
  if (!user || user.ativo === false) {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired session.');
  }

  const passwordOk = await verifyPassword(rawCurrentPassword, user.passwordHash);
  if (!passwordOk) {
    throw new AppError(400, 'INVALID_CURRENT_PASSWORD', 'Current password is invalid.');
  }

  const passwordHash = await hashPassword(rawNewPassword);
  await userRepository.updateByIdAndClinic({
    id: user.id,
    clinicId: user.clinicId,
    data: { passwordHash },
  });

  return { changed: true };
};

const impersonateClinicAdmin = async (clinicId) => {
  const normalizedClinicId = String(clinicId || '').trim();
  if (!normalizedClinicId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
  }

  const admin = await userRepository.findAdminByClinic(normalizedClinicId);
  if (!admin) {
    throw new AppError(404, 'CLINIC_ADMIN_NOT_FOUND', 'No admin user found for this clinic.');
  }

  const session = await createSession(admin.id);
  return {
    token: session.token,
    user: sanitizeUser(admin),
  };
};

const getPublicPlanCatalog = () => getCatalogPublicPlanCatalog();

module.exports = {
  SESSION_TTL_DAYS,
  authService: {
    hashPassword,
    verifyPassword,
    login,
    createSession,
    getSessionByToken,
    getCurrentUser,
    logout,
    changePassword,
    requestPasswordReset,
    confirmEmailVerification,
    resendEmailVerification,
    updatePendingSignupOnboarding,
    createPendingSignupCheckout,
    refreshPendingSignupPaymentStatus,
    finalizePendingSignupPaymentByExternalPaymentId,
    validatePasswordResetCode,
    saveNewPassword,
    impersonateClinicAdmin,
    getPublicPlanCatalog,
  },
};
