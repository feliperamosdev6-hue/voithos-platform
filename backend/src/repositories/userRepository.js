const { prisma } = require('../db/prisma');
const { toNullableString, toRequiredString } = require('../types/repositoryTypes');

const userRepository = {
  findById: async (id) => prisma.user.findUnique({
    where: { id: toRequiredString(id, 'id') },
  }),

  findByEmail: async (email) => {
    const normalizedEmail = toRequiredString(email, 'email');
    return prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
  },

  create: async (input) => prisma.user.create({
    data: {
      clinicId: toRequiredString(input?.clinicId, 'clinicId'),
      nome: toRequiredString(input?.nome, 'nome'),
      email: toRequiredString(input?.email, 'email'),
      passwordHash: toRequiredString(input?.passwordHash, 'passwordHash'),
      role: toRequiredString(input?.role, 'role'),
      isClinicAdmin: input?.isClinicAdmin === true,
      ativo: input?.ativo !== false,
    },
  }),

  updateByEmail: async ({ email, data }) => prisma.user.updateMany({
    where: {
      email: toRequiredString(email, 'email'),
    },
    data,
  }),

  confirmEmailVerificationByEmailAndCode: async ({
    email,
    code,
  }) => prisma.user.updateMany({
    where: {
      email: toRequiredString(email, 'email'),
      emailVerificationCode: toRequiredString(code, 'code'),
      emailVerificationExpiresAt: {
        gt: new Date(),
      },
      ativo: true,
    },
    data: {
      emailVerified: true,
      emailVerificationCode: null,
      emailVerificationExpiresAt: null,
    },
  }),

  updatePasswordResetByEmailAndCode: async ({
    email,
    code,
    passwordHash,
    now = new Date(),
  }) => prisma.user.updateMany({
    where: {
      email: toRequiredString(email, 'email'),
      passwordResetCode: toRequiredString(code, 'code'),
      passwordResetExpiresAt: {
        gt: now,
      },
      ativo: true,
    },
    data: {
      passwordHash: toRequiredString(passwordHash, 'passwordHash'),
      passwordResetCode: null,
      passwordResetExpiresAt: null,
    },
  }),

  listByClinic: async (clinicId) => prisma.user.findMany({
    where: {
      clinicId: toRequiredString(clinicId, 'clinicId'),
    },
    orderBy: {
      createdAt: 'desc',
    },
  }),

  findAdminByClinic: async (clinicId) => prisma.user.findFirst({
    where: {
      clinicId: toRequiredString(clinicId, 'clinicId'),
      OR: [{ isClinicAdmin: true }, { role: 'ADMIN' }, { role: 'admin' }],
      ativo: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  }),

  updateByIdAndClinic: async ({ id, clinicId, data }) => prisma.user.updateMany({
    where: {
      id: toRequiredString(id, 'id'),
      clinicId: toRequiredString(clinicId, 'clinicId'),
    },
    data,
  }),

  deleteByIdAndClinic: async ({ id, clinicId }) => prisma.user.deleteMany({
    where: {
      id: toRequiredString(id, 'id'),
      clinicId: toRequiredString(clinicId, 'clinicId'),
    },
  }),
};

module.exports = { userRepository };
