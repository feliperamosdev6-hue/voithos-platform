const { prisma } = require('../db/prisma');

const getClient = (tx) => tx || prisma;

const stockRepository = {
  listByClinic: async ({ clinicId, includeInactive = false } = {}, tx) => getClient(tx).stockItem.findMany({
    where: {
      clinicId,
      ...(includeInactive ? {} : { active: true }),
    },
    orderBy: [
      { active: 'desc' },
      { updatedAt: 'desc' },
      { createdAt: 'desc' },
    ],
  }),

  findByIdAndClinic: async ({ clinicId, itemId } = {}, tx) => getClient(tx).stockItem.findFirst({
    where: {
      clinicId,
      id: itemId,
    },
  }),

  create: async (data, tx) => getClient(tx).stockItem.create({ data }),

  update: async ({ itemId, data } = {}, tx) => getClient(tx).stockItem.update({
    where: { id: itemId },
    data,
  }),

  createMovement: async (data, tx) => getClient(tx).stockMovement.create({ data }),

  listMovementsByClinicAndItem: async ({ clinicId, itemId, limit = 20 } = {}, tx) => getClient(tx).stockMovement.findMany({
    where: {
      clinicId,
      stockItemId: itemId,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: Number.isFinite(Number(limit)) ? Math.max(1, Math.min(100, Math.trunc(Number(limit)))) : 20,
  }),
};

module.exports = { stockRepository };
