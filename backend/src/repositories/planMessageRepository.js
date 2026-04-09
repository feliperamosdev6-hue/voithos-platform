const { prisma } = require('../db/prisma');
const { toNullableString, toOptionalDate, toRequiredString } = require('../types/repositoryTypes');

const planMessageRepository = {
  create: async (input) => prisma.planMessageEvent.create({
    data: {
      id: toRequiredString(input?.id, 'id'),
      clinicId: toRequiredString(input?.clinicId, 'clinicId'),
      patientId: toRequiredString(input?.patientId, 'patientId'),
      planId: toRequiredString(input?.planId, 'planId'),
      financialAccountId: toRequiredString(input?.financialAccountId, 'financialAccountId'),
      installmentId: toNullableString(input?.installmentId),
      installmentSequence: Math.max(0, Number(input?.installmentSequence) || 0),
      eventType: toRequiredString(input?.eventType, 'eventType'),
      status: toRequiredString(input?.status, 'status'),
      templateKey: toRequiredString(input?.templateKey, 'templateKey'),
      templateVersion: Math.max(1, Number(input?.templateVersion) || 1),
      dueDate: toOptionalDate(input?.dueDate),
      amount: Number(input?.amount || 0),
      paymentMethod: toNullableString(input?.paymentMethod),
      externalBillingReference: toNullableString(input?.externalBillingReference),
      paymentUrl: toNullableString(input?.paymentUrl),
      barcode: toNullableString(input?.barcode),
      latestBatchId: toNullableString(input?.latestBatchId),
      latestDispatchId: toNullableString(input?.latestDispatchId),
      idempotencyKey: toRequiredString(input?.idempotencyKey, 'idempotencyKey'),
      attemptCount: Math.max(0, Number(input?.attemptCount) || 0),
      manualResendCount: Math.max(0, Number(input?.manualResendCount) || 0),
      lastAttemptAt: toOptionalDate(input?.lastAttemptAt),
      sentAt: toOptionalDate(input?.sentAt),
      failedAt: toOptionalDate(input?.failedAt),
      blockedAt: toOptionalDate(input?.blockedAt),
      lastError: toNullableString(input?.lastError),
      payload: input?.payload ?? null,
    },
  }),

  findByIdAndClinic: async ({ clinicId, planMessageId }) => prisma.planMessageEvent.findFirst({
    where: {
      clinicId: toRequiredString(clinicId, 'clinicId'),
      id: toRequiredString(planMessageId, 'planMessageId'),
    },
  }),

  findByIdempotencyKey: async ({ clinicId, idempotencyKey }) => prisma.planMessageEvent.findFirst({
    where: {
      clinicId: toRequiredString(clinicId, 'clinicId'),
      idempotencyKey: toRequiredString(idempotencyKey, 'idempotencyKey'),
    },
  }),

  listByPlan: async ({ clinicId, planId }) => prisma.planMessageEvent.findMany({
    where: {
      clinicId: toRequiredString(clinicId, 'clinicId'),
      planId: toRequiredString(planId, 'planId'),
    },
    orderBy: [
      { dueDate: 'asc' },
      { createdAt: 'desc' },
    ],
  }),

  update: async ({ clinicId, planMessageId, data }) => {
    await prisma.planMessageEvent.updateMany({
      where: {
        clinicId: toRequiredString(clinicId, 'clinicId'),
        id: toRequiredString(planMessageId, 'planMessageId'),
      },
      data,
    });
    return planMessageRepository.findByIdAndClinic({ clinicId, planMessageId });
  },
};

module.exports = { planMessageRepository };
