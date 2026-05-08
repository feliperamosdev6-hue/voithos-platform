const { prisma } = require('../db/prisma');

const procedureFinancialInclude = {
  financialAccounts: {
    orderBy: { createdAt: 'desc' },
    include: {
      installments: { orderBy: { sequence: 'asc' } },
      transactions: { orderBy: { createdAt: 'asc' } },
    },
  },
};

const patientClinicalRepository = {
  ensureClinicalRecord: async ({ clinicId, patientId }) => prisma.patientClinicalRecord.upsert({
    where: { patientId },
    update: { clinicId },
    create: { clinicId, patientId },
  }),

  getClinicalRecord: async ({ clinicId, patientId }) => prisma.patientClinicalRecord.findFirst({
    where: { clinicId, patientId },
    include: {
      anamneses: {
        orderBy: { createdAt: 'desc' },
      },
      clinicalNotes: {
        orderBy: { createdAt: 'desc' },
      },
      patientProcedures: {
        orderBy: { createdAt: 'desc' },
      },
      patientDocuments: {
        orderBy: { createdAt: 'desc' },
      },
    },
  }),

  listProcedures: async ({ clinicId, patientId }) => prisma.patientProcedure.findMany({
    where: { clinicId, patientId },
    include: procedureFinancialInclude,
    orderBy: { createdAt: 'desc' },
  }),

  listProcedureAudienceBaseByClinic: async ({ clinicId }) => prisma.patientProcedure.findMany({
    where: { clinicId },
    select: {
      patientId: true,
      name: true,
      procedureCode: true,
      dentistId: true,
      dentistName: true,
      createdAt: true,
      performedAt: true,
    },
    orderBy: { createdAt: 'desc' },
  }),

  findProcedureByExternalId: async ({ clinicId, patientId, externalId }) => prisma.patientProcedure.findFirst({
    where: { clinicId, patientId, externalId },
    include: procedureFinancialInclude,
  }),

  createProcedure: async (data) => prisma.patientProcedure.create({ data }),

  updateProcedure: async ({ id, clinicId, patientId, data }) => prisma.patientProcedure.updateMany({
    where: { id, clinicId, patientId },
    data,
  }),

  deleteProcedure: async ({ clinicId, patientId, externalId }) => prisma.patientProcedure.deleteMany({
    where: { clinicId, patientId, externalId },
  }),

  listDocuments: async ({ clinicId, patientId, includeArchived = false }) => prisma.patientDocumentMetadata.findMany({
    where: {
      clinicId,
      patientId,
      archived: includeArchived ? undefined : false,
    },
    orderBy: { createdAt: 'desc' },
  }),

  listDocumentSummariesByClinic: async ({ clinicId, includeArchived = false }) => prisma.patientDocumentMetadata.findMany({
    where: {
      clinicId,
      archived: includeArchived ? undefined : false,
    },
    select: {
      patientId: true,
      type: true,
      category: true,
      originalName: true,
      storedName: true,
      extension: true,
    },
  }),

  findDocumentByExternalId: async ({ clinicId, patientId, externalDocumentId }) => prisma.patientDocumentMetadata.findFirst({
    where: { clinicId, patientId, externalDocumentId },
  }),

  createDocument: async (data) => prisma.patientDocumentMetadata.create({ data }),

  updateDocument: async ({ id, clinicId, patientId, data }) => prisma.patientDocumentMetadata.updateMany({
    where: { id, clinicId, patientId },
    data,
  }),

  listAnamneses: async ({ clinicId, patientId }) => prisma.anamnesis.findMany({
    where: { clinicId, patientId },
    orderBy: { createdAt: 'desc' },
  }),

  createAnamnesis: async (data) => prisma.anamnesis.create({ data }),

  listClinicalNotes: async ({ clinicId, patientId, noteType }) => prisma.clinicalNote.findMany({
    where: {
      clinicId,
      patientId,
      noteType: noteType || undefined,
    },
    orderBy: { createdAt: 'desc' },
  }),

  findClinicalNoteBySourceDocumentId: async ({ clinicId, patientId, sourceDocumentId }) => prisma.clinicalNote.findFirst({
    where: { clinicId, patientId, sourceDocumentId },
  }),

  findClinicalNoteById: async ({ id, clinicId, patientId }) => prisma.clinicalNote.findFirst({
    where: { id, clinicId, patientId },
  }),

  createClinicalNote: async (data) => prisma.clinicalNote.create({ data }),

  updateClinicalNote: async ({ id, clinicId, patientId, data }) => prisma.clinicalNote.updateMany({
    where: { id, clinicId, patientId },
    data,
  }),
};

module.exports = { patientClinicalRepository };
