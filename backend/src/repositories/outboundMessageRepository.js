const { prisma } = require('../db/prisma');
const { appEnv } = require('../config/appEnv');
const { toNullableString, toRequiredString } = require('../types/repositoryTypes');

const ACTIVE_REPLY_CONTEXT_TYPES = ['APPOINTMENT_CONFIRMATION', 'APPOINTMENT_REMINDER'];
const ACTIVE_REPLY_CONTEXT_STATUSES = ['PENDING', 'QUEUED', 'SENT'];

const getReplyContextCutoff = () => {
  const ttlHours = Math.max(1, Number(appEnv?.appointmentReplyContextTtlHours) || 24);
  return new Date(Date.now() - (ttlHours * 60 * 60 * 1000));
};

const outboundMessageRepository = {
  create: async (input) => prisma.outboundMessage.create({
    data: {
      clinicId: toRequiredString(input?.clinicId, 'clinicId'),
      patientId: toNullableString(input?.patientId),
      appointmentId: toNullableString(input?.appointmentId),
      channel: toRequiredString(input?.channel, 'channel'),
      type: toRequiredString(input?.type, 'type'),
      phone: toRequiredString(input?.phone, 'phone'),
      body: toRequiredString(input?.body, 'body'),
      status: toRequiredString(input?.status, 'status'),
      provider: toRequiredString(input?.provider, 'provider'),
      providerMessageId: toNullableString(input?.providerMessageId),
      lastError: toNullableString(input?.lastError),
    },
  }),

  findById: async (id) => prisma.outboundMessage.findUnique({
    where: { id: toRequiredString(id, 'id') },
  }),

  findByIdAndClinic: async ({ id, clinicId }) => prisma.outboundMessage.findFirst({
    where: {
      id: toRequiredString(id, 'id'),
      clinicId: toRequiredString(clinicId, 'clinicId'),
    },
  }),

  listByClinic: async ({ clinicId, limit = 50 }) => prisma.outboundMessage.findMany({
    where: {
      clinicId: toRequiredString(clinicId, 'clinicId'),
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: Math.min(Math.max(Number(limit) || 50, 1), 100),
  }),

  listReminderMessagesForAppointmentDay: async ({ clinicId, appointmentId, start, end }) => prisma.outboundMessage.findMany({
    where: {
      clinicId: toRequiredString(clinicId, 'clinicId'),
      appointmentId: toRequiredString(appointmentId, 'appointmentId'),
      type: 'APPOINTMENT_REMINDER',
      createdAt: {
        gte: start,
        lt: end,
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  }),

  findLatestActiveConfirmationByAppointment: async ({ clinicId, appointmentId }) => prisma.outboundMessage.findFirst({
    where: {
      clinicId: toRequiredString(clinicId, 'clinicId'),
      appointmentId: toRequiredString(appointmentId, 'appointmentId'),
      type: 'APPOINTMENT_CONFIRMATION',
      status: {
        in: ACTIVE_REPLY_CONTEXT_STATUSES,
      },
      createdAt: {
        gte: getReplyContextCutoff(),
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  }),

  listActiveConfirmationsByAppointmentIds: async ({ clinicId, appointmentIds = [] }) => {
    const normalizedAppointmentIds = Array.from(new Set(
      (Array.isArray(appointmentIds) ? appointmentIds : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    ));

    if (!normalizedAppointmentIds.length) return [];

    return prisma.outboundMessage.findMany({
      where: {
        clinicId: toRequiredString(clinicId, 'clinicId'),
        appointmentId: {
          in: normalizedAppointmentIds,
        },
        type: 'APPOINTMENT_CONFIRMATION',
        status: {
          in: ACTIVE_REPLY_CONTEXT_STATUSES,
        },
        createdAt: {
          gte: getReplyContextCutoff(),
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  },

  findLatestReplyEnabledByClinicAndPhone: async ({ clinicId, phone }) => prisma.outboundMessage.findFirst({
    where: {
      clinicId: toRequiredString(clinicId, 'clinicId'),
      phone: toRequiredString(phone, 'phone'),
      appointmentId: {
        not: null,
      },
      type: {
        in: ACTIVE_REPLY_CONTEXT_TYPES,
      },
      status: {
        in: ACTIVE_REPLY_CONTEXT_STATUSES,
      },
      createdAt: {
        gte: getReplyContextCutoff(),
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  }),

  findActiveReplyContextByClinicAndProviderMessageId: async ({ clinicId, providerMessageId }) => prisma.outboundMessage.findFirst({
    where: {
      clinicId: toRequiredString(clinicId, 'clinicId'),
      providerMessageId: toRequiredString(providerMessageId, 'providerMessageId'),
      appointmentId: {
        not: null,
      },
      type: {
        in: ACTIVE_REPLY_CONTEXT_TYPES,
      },
      status: {
        in: ACTIVE_REPLY_CONTEXT_STATUSES,
      },
      createdAt: {
        gte: getReplyContextCutoff(),
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  }),

  updateStatus: async ({ id, clinicId, status, providerMessageId, lastError }) => prisma.outboundMessage.updateMany({
    where: {
      id: toRequiredString(id, 'id'),
      clinicId: toRequiredString(clinicId, 'clinicId'),
    },
    data: {
      status: toRequiredString(status, 'status'),
      providerMessageId: providerMessageId === undefined ? undefined : toNullableString(providerMessageId),
      lastError: lastError === undefined ? undefined : toNullableString(lastError),
    },
  }),

  updateBody: async ({ id, clinicId, body }) => prisma.outboundMessage.updateMany({
    where: {
      id: toRequiredString(id, 'id'),
      clinicId: toRequiredString(clinicId, 'clinicId'),
    },
    data: {
      body: toRequiredString(body, 'body'),
    },
  }),

  closeActiveConfirmationContextsByAppointment: async ({ clinicId, appointmentId, lastError }) => prisma.outboundMessage.updateMany({
    where: {
      clinicId: toRequiredString(clinicId, 'clinicId'),
      appointmentId: toRequiredString(appointmentId, 'appointmentId'),
      channel: 'WHATSAPP',
      type: 'APPOINTMENT_CONFIRMATION',
      status: {
        in: ACTIVE_REPLY_CONTEXT_STATUSES,
      },
    },
    data: {
      status: 'FAILED',
      lastError: toNullableString(lastError) || 'Stale appointment confirmation context closed before resend.',
    },
  }),

  failActiveWhatsappReplyContextsByClinic: async ({ clinicId, lastError }) => prisma.outboundMessage.updateMany({
    where: {
      clinicId: toRequiredString(clinicId, 'clinicId'),
      channel: 'WHATSAPP',
      type: {
        in: ACTIVE_REPLY_CONTEXT_TYPES,
      },
      status: {
        in: ACTIVE_REPLY_CONTEXT_STATUSES,
      },
    },
    data: {
      status: 'FAILED',
      lastError: toNullableString(lastError) || 'WhatsApp clinic context reset by operator.',
    },
  }),

  closeActiveReplyContexts: async ({ clinicId, appointmentId, phone, lastError }) => prisma.outboundMessage.updateMany({
    where: {
      clinicId: toRequiredString(clinicId, 'clinicId'),
      appointmentId: appointmentId ? toRequiredString(appointmentId, 'appointmentId') : undefined,
      phone: phone ? toRequiredString(phone, 'phone') : undefined,
      channel: 'WHATSAPP',
      type: {
        in: ACTIVE_REPLY_CONTEXT_TYPES,
      },
      status: {
        in: ACTIVE_REPLY_CONTEXT_STATUSES,
      },
    },
    data: {
      status: 'FAILED',
      lastError: toNullableString(lastError) || 'WhatsApp reply context closed.',
    },
  }),
};

module.exports = { outboundMessageRepository };
