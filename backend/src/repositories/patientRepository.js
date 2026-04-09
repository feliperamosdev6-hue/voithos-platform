const { prisma } = require('../db/prisma');
const {
  toNullableString,
  toOptionalDate,
  toRequiredString,
} = require('../types/repositoryTypes');

const patientRepository = {
  findById: async (id) => prisma.patient.findUnique({
    where: { id: toRequiredString(id, 'id') },
  }),

  findByIdAndClinic: async (id, clinicId) => prisma.patient.findFirst({
    where: {
      id: toRequiredString(id, 'id'),
      clinicId: toRequiredString(clinicId, 'clinicId'),
    },
  }),

  create: async (input) => prisma.patient.create({
    data: {
      clinicId: toRequiredString(input?.clinicId, 'clinicId'),
      nome: toRequiredString(input?.nome, 'nome'),
      cpf: toNullableString(input?.cpf),
      rg: toNullableString(input?.rg),
      dataNascimento: toOptionalDate(input?.dataNascimento),
      telefone: toNullableString(input?.telefone),
      email: toNullableString(input?.email),
      endereco: toNullableString(input?.endereco),
      allowsMessages: input?.allowsMessages !== undefined ? input.allowsMessages !== false : true,
      lastBirthdayMessageAt: toOptionalDate(input?.lastBirthdayMessageAt),
      birthdayMessageYear: Number.isFinite(Number(input?.birthdayMessageYear))
        ? Math.trunc(Number(input.birthdayMessageYear))
        : null,
    },
  }),

  update: async ({ id, clinicId, data }) => prisma.patient.updateMany({
    where: {
      id: toRequiredString(id, 'id'),
      clinicId: toRequiredString(clinicId, 'clinicId'),
    },
    data: {
      nome: toRequiredString(data?.nome, 'nome'),
      cpf: toNullableString(data?.cpf),
      rg: toNullableString(data?.rg),
      dataNascimento: toOptionalDate(data?.dataNascimento),
      telefone: toNullableString(data?.telefone),
      email: toNullableString(data?.email),
      endereco: toNullableString(data?.endereco),
      allowsMessages: data?.allowsMessages !== undefined ? data.allowsMessages !== false : true,
      lastBirthdayMessageAt: toOptionalDate(data?.lastBirthdayMessageAt),
      birthdayMessageYear: Number.isFinite(Number(data?.birthdayMessageYear))
        ? Math.trunc(Number(data.birthdayMessageYear))
        : null,
    },
  }),

  delete: async ({ id, clinicId }) => prisma.patient.deleteMany({
    where: {
      id: toRequiredString(id, 'id'),
      clinicId: toRequiredString(clinicId, 'clinicId'),
    },
  }),

  listByClinic: async (clinicId) => prisma.patient.findMany({
    where: {
      clinicId: toRequiredString(clinicId, 'clinicId'),
    },
    orderBy: {
      createdAt: 'desc',
    },
  }),

  listAudienceBaseByClinic: async (clinicId) => prisma.patient.findMany({
    where: {
      clinicId: toRequiredString(clinicId, 'clinicId'),
    },
    select: {
      id: true,
      nome: true,
      telefone: true,
      dataNascimento: true,
      allowsMessages: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  }),
};

module.exports = { patientRepository };
