const { prisma } = require('../db/prisma');

const stockRepository = {
  listByClinic: async ({ clinicId, includeInactive = false } = {}) => prisma.stockItem.findMany({
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

  findByIdAndClinic: async ({ clinicId, itemId }) => prisma.stockItem.findFirst({
    where: {
      clinicId,
      id: itemId,
    },
  }),

  create: async (data) => prisma.stockItem.create({ data }),

  update: async ({ itemId, data }) => prisma.stockItem.update({
    where: { id: itemId },
    data,
  }),

  createMovement: async (data) => prisma.stockMovement.create({ data }),
};

module.exports = { stockRepository };
