const { prisma } = require('../db/prisma');

const appointmentActionTokenRepository = {
  create: async (data) => prisma.appointmentActionToken.create({ data }),

  findByTokenHash: async (tokenHash) => prisma.appointmentActionToken.findUnique({
    where: { tokenHash: String(tokenHash || '').trim() },
  }),

  listByOutboundMessageId: async ({ outboundMessageId, actionType }) => prisma.appointmentActionToken.findMany({
    where: {
      outboundMessageId: String(outboundMessageId || '').trim(),
      ...(actionType ? { actionType: String(actionType).trim() } : {}),
    },
    orderBy: {
      createdAt: 'asc',
    },
  }),

  updateById: async ({ id, data }) => prisma.appointmentActionToken.update({
    where: { id: String(id || '').trim() },
    data,
  }),

  expireActiveForAppointment: async ({ clinicId, appointmentId, actionType }) => prisma.appointmentActionToken.updateMany({
    where: {
      clinicId: String(clinicId || '').trim(),
      appointmentId: String(appointmentId || '').trim(),
      actionType: String(actionType || '').trim(),
      status: 'ACTIVE',
      usedAt: null,
    },
    data: {
      status: 'CANCELLED',
    },
  }),
};

module.exports = { appointmentActionTokenRepository };
