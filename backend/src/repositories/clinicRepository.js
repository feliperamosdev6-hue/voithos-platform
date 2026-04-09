const { prisma } = require('../db/prisma');
const { toNullableString, toRequiredString } = require('../types/repositoryTypes');

const normalizeDocument = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits || null;
};

const clinicPublicSelect = {
  id: true,
  nomeFantasia: true,
  razaoSocial: true,
  cnpjCpf: true,
  email: true,
  telefoneComercial: true,
  endereco: true,
  createdAt: true,
  updatedAt: true,
};

const clinicRepository = {
  findById: async (id) => prisma.clinic.findUnique({
    where: { id: toRequiredString(id, 'id') },
  }),

  findProfileById: async (clinicId) => prisma.clinic.findUnique({
    where: { id: toRequiredString(clinicId, 'clinicId') },
    select: {
      id: true,
      nomeFantasia: true,
      razaoSocial: true,
      cnpjCpf: true,
      email: true,
      telefoneComercial: true,
      endereco: true,
      operationalSettings: true,
    },
  }),

  findByEmail: async (email) => {
    const normalizedEmail = toNullableString(email);
    if (!normalizedEmail) return null;

    return prisma.clinic.findFirst({
      where: { email: normalizedEmail },
    });
  },

  findByDocument: async (document) => {
    const normalizedDocument = normalizeDocument(document);
    if (!normalizedDocument) return null;

    return prisma.clinic.findFirst({
      where: { cnpjCpf: normalizedDocument },
    });
  },

  create: async (input) => prisma.clinic.create({
    data: {
      nomeFantasia: toRequiredString(input?.nomeFantasia, 'nomeFantasia'),
      razaoSocial: toNullableString(input?.razaoSocial),
      cnpjCpf: normalizeDocument(input?.cnpjCpf),
      email: toNullableString(input?.email),
      telefoneComercial: toNullableString(input?.telefoneComercial),
      endereco: toNullableString(input?.endereco),
    },
  }),

  list: async () => prisma.clinic.findMany({
    select: clinicPublicSelect,
    orderBy: {
      createdAt: 'desc',
    },
  }),

  getOperationalSettings: async (clinicId) => {
    const normalizedClinicId = toRequiredString(clinicId, 'clinicId');
    const rows = await prisma.$queryRawUnsafe(
      'SELECT "operationalSettings" FROM "Clinic" WHERE "id" = $1 LIMIT 1',
      normalizedClinicId
    );
    return rows?.[0]?.operationalSettings || null;
  },

  updateOperationalSettings: async (clinicId, operationalSettings) => {
    const normalizedClinicId = toRequiredString(clinicId, 'clinicId');
    const serialized = JSON.stringify(operationalSettings || null);
    const rows = await prisma.$queryRawUnsafe(
      'UPDATE "Clinic" SET "operationalSettings" = CAST($2 AS jsonb), "updatedAt" = NOW() WHERE "id" = $1 RETURNING "operationalSettings"',
      normalizedClinicId,
      serialized
    );
    return rows?.[0]?.operationalSettings || null;
  },

  updateProfile: async (clinicId, input = {}) => prisma.clinic.update({
    where: { id: toRequiredString(clinicId, 'clinicId') },
    data: {
      nomeFantasia: toRequiredString(input?.nomeFantasia, 'nomeFantasia'),
      razaoSocial: toNullableString(input?.razaoSocial),
      cnpjCpf: normalizeDocument(input?.cnpjCpf),
      email: toNullableString(input?.email),
      telefoneComercial: toNullableString(input?.telefoneComercial),
      endereco: toNullableString(input?.endereco),
      operationalSettings: input?.operationalSettings || null,
    },
    select: {
      id: true,
      nomeFantasia: true,
      razaoSocial: true,
      cnpjCpf: true,
      email: true,
      telefoneComercial: true,
      endereco: true,
      operationalSettings: true,
    },
  }),
};

module.exports = { clinicRepository };
