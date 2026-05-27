const { prisma } = require('../db/prisma');
const { toNullableString, toRequiredString } = require('../types/repositoryTypes');

const normalizeText = (value) => String(value || '').trim();

const subscriptionInclude = {
  lastPayment: true,
  payments: {
    orderBy: { createdAt: 'desc' },
    take: 10,
  },
};

const buildPaymentLookupWhere = ({ clinicId, paymentId, provider, externalPaymentId }) => {
  const normalizedClinicId = toRequiredString(clinicId, 'clinicId');
  const normalizedPaymentId = toNullableString(paymentId);
  const normalizedProvider = toNullableString(provider);
  const normalizedExternalPaymentId = toNullableString(externalPaymentId);

  if (normalizedPaymentId) {
    return {
      id: normalizedPaymentId,
      clinicId: normalizedClinicId,
    };
  }

  if (!normalizedProvider || !normalizedExternalPaymentId) {
    throw new Error('paymentId or provider + externalPaymentId are required.');
  }

  return {
    clinicId: normalizedClinicId,
    provider: normalizedProvider,
    externalPaymentId: normalizedExternalPaymentId,
  };
};

const createPaymentLink = (paymentId) => `/subscription/payments/${paymentId}`;
const shouldGenerateLegacyPaymentLink = (provider) => normalizeText(provider).toUpperCase() === 'MANUAL';

const toNumberOrNull = (value) => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
};

const toIsoStringOrNull = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const buildCommercialAuditSnapshot = (subscription = {}) => ({
  planType: normalizeText(subscription.planType).toUpperCase(),
  status: normalizeText(subscription.status).toUpperCase(),
  amount: toNumberOrNull(subscription.amount),
  billingAmount: toNumberOrNull(subscription.billingAmount),
  discountAmount: toNumberOrNull(subscription.discountAmount),
  customPriceEnabled: subscription.customPriceEnabled === true,
  billingCycle: normalizeText(subscription.billingCycle).toUpperCase() || null,
  commercialNotes: normalizeText(subscription.commercialNotes) || null,
  startDate: toIsoStringOrNull(subscription.startDate),
  endDate: toIsoStringOrNull(subscription.endDate),
  graceUntil: toIsoStringOrNull(subscription.graceUntil),
  trialStartedAt: toIsoStringOrNull(subscription.trialStartedAt),
  trialEndsAt: toIsoStringOrNull(subscription.trialEndsAt),
  activatedAt: toIsoStringOrNull(subscription.activatedAt),
  lastPaymentId: normalizeText(subscription.lastPaymentId) || null,
});

const subscriptionRepository = {
  findByClinicId: async ({ clinicId }) => prisma.subscription.findUnique({
    where: {
      clinicId: toRequiredString(clinicId, 'clinicId'),
    },
    include: subscriptionInclude,
  }),

  updateCommercialFieldsForClinic: async ({
    clinicId,
    data,
    action,
    actorUserId,
    actorEmail,
    metadata,
  }) => prisma.$transaction(async (tx) => {
    const subscription = await tx.subscription.findUnique({
      where: {
        clinicId: toRequiredString(clinicId, 'clinicId'),
      },
      include: subscriptionInclude,
    });

    if (!subscription) {
      return null;
    }

    const updated = await tx.subscription.update({
      where: {
        id: subscription.id,
      },
      data: data || {},
      include: subscriptionInclude,
    });

    const audit = await tx.subscriptionCommercialAudit.create({
      data: {
        subscriptionId: subscription.id,
        clinicId: subscription.clinicId,
        action: toRequiredString(action, 'action'),
        actorUserId: toNullableString(actorUserId),
        actorEmail: toNullableString(actorEmail),
        before: buildCommercialAuditSnapshot(subscription),
        after: buildCommercialAuditSnapshot(updated),
        metadata: metadata || null,
      },
    });

    return {
      subscription: updated,
      audit,
    };
  }),

  findPaymentForConfirmation: async ({ clinicId, paymentId, provider, externalPaymentId }) => prisma.subscriptionPayment.findFirst({
    where: buildPaymentLookupWhere({ clinicId, paymentId, provider, externalPaymentId }),
    include: {
      subscription: {
        include: subscriptionInclude,
      },
    },
  }),

  findPaymentByProviderAndExternalPaymentId: async ({ provider, externalPaymentId }) => prisma.subscriptionPayment.findFirst({
    where: {
      provider: toRequiredString(provider, 'provider'),
      externalPaymentId: toRequiredString(externalPaymentId, 'externalPaymentId'),
    },
    include: {
      subscription: {
        include: subscriptionInclude,
      },
    },
  }),

  createSubscriptionWithPayment: async ({
    clinicId,
    planType,
    amount,
    provider,
    externalPaymentId,
    paymentLink,
  }) => prisma.$transaction(async (tx) => {
    const subscription = await tx.subscription.create({
      data: {
        clinicId: toRequiredString(clinicId, 'clinicId'),
        planType,
        amount,
        status: 'PENDING_PAYMENT',
      },
    });

    const payment = await tx.subscriptionPayment.create({
      data: {
        subscriptionId: subscription.id,
        clinicId: subscription.clinicId,
        amount,
        status: 'PENDING',
        provider: toRequiredString(provider, 'provider'),
        externalPaymentId: toNullableString(externalPaymentId),
        paymentLink: toNullableString(paymentLink),
      },
    });

    if (!payment.paymentLink && shouldGenerateLegacyPaymentLink(provider)) {
      await tx.subscriptionPayment.update({
        where: { id: payment.id },
        data: { paymentLink: createPaymentLink(payment.id) },
      });
    }

    return tx.subscription.update({
      where: { id: subscription.id },
      data: {
        lastPaymentId: payment.id,
      },
      include: subscriptionInclude,
    });
  }),

  createRenewalPayment: async ({
    clinicId,
    planType,
    amount,
    provider,
    externalPaymentId,
    paymentLink,
    resetStatusToPending,
  }) => prisma.$transaction(async (tx) => {
    const current = await tx.subscription.findUnique({
      where: {
        clinicId: toRequiredString(clinicId, 'clinicId'),
      },
    });

    if (!current) {
      return null;
    }

    const updatedSubscription = await tx.subscription.update({
      where: { id: current.id },
      data: {
        planType,
        amount,
        status: resetStatusToPending ? 'PENDING_PAYMENT' : current.status,
      },
    });

    const payment = await tx.subscriptionPayment.create({
      data: {
        subscriptionId: updatedSubscription.id,
        clinicId: updatedSubscription.clinicId,
        amount,
        status: 'PENDING',
        provider: toRequiredString(provider, 'provider'),
        externalPaymentId: toNullableString(externalPaymentId),
        paymentLink: toNullableString(paymentLink),
      },
    });

    if (!payment.paymentLink && shouldGenerateLegacyPaymentLink(provider)) {
      await tx.subscriptionPayment.update({
        where: { id: payment.id },
        data: { paymentLink: createPaymentLink(payment.id) },
      });
    }

    return tx.subscription.update({
      where: { id: updatedSubscription.id },
      data: {
        lastPaymentId: payment.id,
      },
      include: subscriptionInclude,
    });
  }),

  updateStatus: async ({ subscriptionId, status }) => prisma.subscription.update({
    where: {
      id: toRequiredString(subscriptionId, 'subscriptionId'),
    },
    data: { status },
    include: subscriptionInclude,
  }),

  updatePaymentGatewayData: async ({
    paymentId,
    provider,
    externalPaymentId,
    paymentLink,
    amount,
  }) => prisma.$transaction(async (tx) => {
    const payment = await tx.subscriptionPayment.findUnique({
      where: {
        id: toRequiredString(paymentId, 'paymentId'),
      },
    });

    if (!payment) {
      return null;
    }

    if (normalizeText(payment.status).toUpperCase() === 'PAID') {
      throw new Error('Confirmed subscription payments cannot be changed.');
    }

    const data = {
      provider: toRequiredString(provider, 'provider'),
      externalPaymentId: toNullableString(externalPaymentId),
      paymentLink: toNullableString(paymentLink),
    };
    if (amount !== undefined) {
      data.amount = amount;
    }

    return tx.subscriptionPayment.update({
      where: {
        id: payment.id,
      },
      data,
    });
  }),

  confirmPaymentAndActivateSubscription: async ({
    clinicId,
    paymentId,
    provider,
    externalPaymentId,
    paidAt,
    startDate,
    endDate,
    graceUntil,
  }) => prisma.$transaction(async (tx) => {
    const payment = await tx.subscriptionPayment.findFirst({
      where: {
        id: toRequiredString(paymentId, 'paymentId'),
        clinicId: toRequiredString(clinicId, 'clinicId'),
      },
      include: {
        subscription: true,
      },
    });

    if (!payment) {
      return null;
    }

    await tx.subscriptionPayment.update({
      where: { id: payment.id },
      data: {
        status: 'PAID',
        provider: toRequiredString(provider, 'provider'),
        externalPaymentId: toNullableString(externalPaymentId) || payment.externalPaymentId,
        paidAt,
      },
    });

    await tx.subscriptionPayment.updateMany({
      where: {
        subscriptionId: payment.subscriptionId,
        clinicId: payment.clinicId,
        status: 'PENDING',
        id: {
          not: payment.id,
        },
      },
      data: {
        status: 'CANCELED',
      },
    });

    return tx.subscription.update({
      where: { id: payment.subscriptionId },
      data: {
        status: 'ACTIVE',
        startDate,
        endDate,
        graceUntil,
        activatedAt: paidAt,
        lastPaymentId: payment.id,
      },
      include: subscriptionInclude,
    });
  }),
};

module.exports = {
  subscriptionInclude,
  subscriptionRepository,
};
