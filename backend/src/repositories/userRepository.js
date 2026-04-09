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
