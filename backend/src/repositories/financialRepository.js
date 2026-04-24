const { prisma } = require('../db/prisma');

const financialRepository = {
  findPatientByIdAndClinic: async ({ clinicId, patientId }) => prisma.patient.findFirst({
    where: { clinicId, id: patientId },
  }),

  findAppointmentByIdAndClinic: async ({ clinicId, appointmentId }) => prisma.appointment.findFirst({
    where: { clinicId, id: appointmentId },
  }),

  findPatientProcedureByIdAndClinic: async ({ clinicId, patientProcedureId }) => prisma.patientProcedure.findFirst({
    where: { clinicId, id: patientProcedureId },
  }),

  findPatientProcedureByExternalId: async ({ clinicId, patientId, externalId }) => prisma.patientProcedure.findFirst({
    where: { clinicId, patientId, externalId },
  }),

  createFinancialAccount: async (data) => prisma.financialAccount.create({
    data,
    include: {
      installments: { orderBy: { sequence: 'asc' } },
      transactions: { orderBy: { createdAt: 'asc' } },
    },
  }),

  updateFinancialAccount: async ({ id, clinicId, data }) => prisma.financialAccount.update({
    where: { id },
    data,
    include: {
      installments: { orderBy: { sequence: 'asc' } },
      transactions: { orderBy: { createdAt: 'asc' } },
    },
  }),

  findFinancialAccountByIdAndClinic: async ({ clinicId, accountId }) => prisma.financialAccount.findFirst({
    where: { clinicId, id: accountId },
    include: {
      installments: { orderBy: { sequence: 'asc' } },
      transactions: { orderBy: { createdAt: 'asc' } },
    },
  }),

  findFinancialAccountByExternalReference: async ({ clinicId, externalReference }) => prisma.financialAccount.findFirst({
    where: { clinicId, externalReference },
    orderBy: [
      { updatedAt: 'desc' },
      { createdAt: 'desc' },
    ],
    include: {
      installments: { orderBy: { sequence: 'asc' } },
      transactions: { orderBy: { createdAt: 'asc' } },
    },
  }),

  findPlanFinancialAccountByPlanId: async ({ clinicId, planId }) => prisma.financialAccount.findFirst({
    where: {
      clinicId,
      externalReference: `plan:${planId}`,
    },
    include: {
      installments: { orderBy: { sequence: 'asc' } },
      transactions: { orderBy: { createdAt: 'asc' } },
      patient: true,
    },
  }),

  listPlanFinancialAccountsByClinic: async ({ clinicId }) => prisma.financialAccount.findMany({
    where: {
      clinicId,
      OR: [
        { source: { equals: 'plano', mode: 'insensitive' } },
        { category: { equals: 'planos', mode: 'insensitive' } },
        { externalReference: { startsWith: 'plan:' } },
      ],
    },
    include: {
      installments: { orderBy: { sequence: 'asc' } },
      transactions: { orderBy: { createdAt: 'asc' } },
      patient: true,
    },
    orderBy: { createdAt: 'desc' },
  }),

  listFinancialAccountsByPatient: async ({ clinicId, patientId }) => prisma.financialAccount.findMany({
    where: { clinicId, patientId },
    include: {
      installments: { orderBy: { sequence: 'asc' } },
      transactions: { orderBy: { createdAt: 'asc' } },
    },
    orderBy: { createdAt: 'desc' },
  }),

  listFinancialAccountsByClinic: async ({ clinicId }) => prisma.financialAccount.findMany({
    where: { clinicId },
    include: {
      installments: { orderBy: { sequence: 'asc' } },
      transactions: { orderBy: { createdAt: 'asc' } },
      patient: true,
    },
    orderBy: { createdAt: 'desc' },
  }),

  listFinancialAccountsAudienceBaseByClinic: async ({ clinicId }) => prisma.financialAccount.findMany({
    where: { clinicId },
    select: {
      id: true,
      patientId: true,
      status: true,
      source: true,
      category: true,
      dueDate: true,
      paymentMethod: true,
      createdAt: true,
      installments: {
        select: {
          id: true,
          dueDate: true,
          amount: true,
          status: true,
          paidAt: true,
        },
        orderBy: { sequence: 'asc' },
      },
      transactions: {
        select: {
          id: true,
          type: true,
          amount: true,
          method: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  }),

  deleteFinancialAccount: async ({ clinicId, accountId }) => prisma.financialAccount.deleteMany({
    where: { clinicId, id: accountId },
  }),

  replaceInstallments: async ({ clinicId, accountId, installments }) => prisma.$transaction(async (tx) => {
    await tx.financialInstallment.deleteMany({
      where: { clinicId, accountId },
    });

    if (!installments.length) return [];

    await tx.financialInstallment.createMany({
      data: installments.map((item) => ({
        clinicId,
        accountId,
        sequence: item.sequence,
        dueDate: item.dueDate,
        amount: item.amount,
        status: item.status,
        paidAt: item.paidAt,
      })),
    });

    return tx.financialInstallment.findMany({
      where: { clinicId, accountId },
      orderBy: { sequence: 'asc' },
    });
  }),

  findInstallmentByIdAndClinic: async ({ clinicId, installmentId }) => prisma.financialInstallment.findFirst({
    where: { clinicId, id: installmentId },
  }),

  updateInstallment: async ({ installmentId, clinicId, data }) => prisma.financialInstallment.update({
    where: { id: installmentId },
    data,
  }),

  createTransaction: async (data) => prisma.financialTransaction.create({ data }),

  listPatientPlansByPatient: async ({ clinicId, patientId }) => prisma.patientPlan.findMany({
    where: { clinicId, patientId },
    include: { patient: true },
    orderBy: { createdAt: 'desc' },
  }),

  listPatientPlansByClinic: async ({ clinicId }) => prisma.patientPlan.findMany({
    where: { clinicId },
    include: { patient: true },
    orderBy: { createdAt: 'desc' },
  }),

  findPatientPlanByIdAndClinic: async ({ clinicId, planId }) => prisma.patientPlan.findFirst({
    where: { clinicId, id: planId },
    include: { patient: true },
  }),

  createPatientPlan: async (data) => prisma.patientPlan.create({
    data,
    include: { patient: true },
  }),

  updatePatientPlan: async ({ clinicId, planId, data }) => prisma.patientPlan.updateMany({
    where: { clinicId, id: planId },
    data,
  }),

  deletePatientPlan: async ({ clinicId, planId }) => prisma.patientPlan.deleteMany({
    where: { clinicId, id: planId },
  }),

  findFinancialSnapshot: async ({ clinicId, year, month }) => prisma.financialSnapshot.findFirst({
    where: { clinicId, year, month },
  }),

  createFinancialSnapshot: async (data) => prisma.financialSnapshot.create({ data }),
};

module.exports = { financialRepository };
