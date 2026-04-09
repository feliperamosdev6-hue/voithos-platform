const { prisma } = require('../db/prisma');
const { toNullableString, toRequiredString } = require('../types/repositoryTypes');

const inboundMessageRepository = {
  create: async (input) => prisma.inboundMessage.create({
    data: {
      clinicId: toRequiredString(input?.clinicId, 'clinicId'),
      patientId: toNullableString(input?.patientId),
      appointmentId: toNullableString(input?.appointmentId),
      outboundMessageId: toNullableString(input?.outboundMessageId),
      channel: toRequiredString(input?.channel, 'channel'),
      fromPhone: toRequiredString(input?.fromPhone, 'fromPhone'),
      body: toRequiredString(input?.body, 'body'),
      normalizedBody: toRequiredString(input?.normalizedBody, 'normalizedBody'),
      status: toRequiredString(input?.status, 'status'),
      intent: toRequiredString(input?.intent, 'intent'),
      providerMessageId: toNullableString(input?.providerMessageId),
      processingNotes: toNullableString(input?.processingNotes),
      rawPayload: input?.rawPayload ?? null,
    },
  }),

  updateProcessing: async ({ id, clinicId, patientId, appointmentId, outboundMessageId, status, intent, processingNotes }) => prisma.inboundMessage.updateMany({
    where: {
      id: toRequiredString(id, 'id'),
      clinicId: toRequiredString(clinicId, 'clinicId'),
    },
    data: {
      patientId: patientId === undefined ? undefined : toNullableString(patientId),
      appointmentId: appointmentId === undefined ? undefined : toNullableString(appointmentId),
      outboundMessageId: outboundMessageId === undefined ? undefined : toNullableString(outboundMessageId),
      status: status === undefined ? undefined : toRequiredString(status, 'status'),
      intent: intent === undefined ? undefined : toRequiredString(intent, 'intent'),
      processingNotes: processingNotes === undefined ? undefined : toNullableString(processingNotes),
    },
  }),

  findById: async (id) => prisma.inboundMessage.findUnique({
    where: { id: toRequiredString(id, 'id') },
  }),

  findByClinicAndProviderMessageId: async ({ clinicId, providerMessageId }) => prisma.inboundMessage.findFirst({
    where: {
      clinicId: toRequiredString(clinicId, 'clinicId'),
      providerMessageId: toRequiredString(providerMessageId, 'providerMessageId'),
    },
  }),

  listRecent: async ({ clinicId, status, intent, limit = 50 }) => prisma.inboundMessage.findMany({
    where: {
      clinicId: clinicId ? toRequiredString(clinicId, 'clinicId') : undefined,
      status: status ? toRequiredString(status, 'status') : undefined,
      intent: intent ? toRequiredString(intent, 'intent') : undefined,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: Math.min(Math.max(Number(limit) || 50, 1), 100),
  }),
};

module.exports = { inboundMessageRepository };
