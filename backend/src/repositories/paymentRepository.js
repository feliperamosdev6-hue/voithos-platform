const { prisma } = require('../db/prisma');

const paymentRepository = {
  createPayment: async ({ clinicId, patientId, sourceType, sourceId, amount, method, description, dueDate, metadata }) => {
    return prisma.payment.create({
      data: {
        clinicId,
        patientId: patientId || null,
        sourceType,
        sourceId: sourceId || null,
        amount,
        method,
        description,
        dueDate: dueDate || null,
        metadata: metadata || null,
        status: 'PENDING',
        gateway: 'NONE',
      },
    });
  },

  getPaymentById: async ({ clinicId, paymentId }) => {
    return prisma.payment.findFirst({
      where: {
        id: paymentId,
        clinicId,
      },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  },

  listPaymentsByClinic: async ({ clinicId, patientId, status, skip = 0, take = 50 }) => {
    const where = { clinicId };
    if (patientId) where.patientId = patientId;
    if (status) where.status = status;

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: {
          transactions: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.payment.count({ where }),
    ]);

    return { payments, total };
  },

  updatePaymentStatus: async ({ clinicId, paymentId, status, paidAt }) => {
    return prisma.payment.update({
      where: {
        id: paymentId,
      },
      data: {
        status,
        paidAt: paidAt || (status === 'PAID' ? new Date() : null),
      },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  },

  createTransaction: async ({ paymentId, status, gatewayResponse }) => {
    return prisma.paymentTransaction.create({
      data: {
        paymentId,
        status,
        gatewayResponse: gatewayResponse || null,
      },
    });
  },

  findPaymentByExternalId: async ({ clinicId, externalId }) => {
    return prisma.payment.findFirst({
      where: {
        clinicId,
        externalId,
      },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  },
};

module.exports = { paymentRepository };
