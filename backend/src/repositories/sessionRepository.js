const { prisma } = require('../db/prisma');
const { toOptionalDate, toRequiredString } = require('../types/repositoryTypes');

const sessionRepository = {
  findByToken: async (token) => prisma.session.findUnique({
    where: { token: toRequiredString(token, 'token') },
  }),

  create: async (input) => prisma.session.create({
    data: {
      userId: toRequiredString(input?.userId, 'userId'),
      token: toRequiredString(input?.token, 'token'),
      expiresAt: toOptionalDate(input?.expiresAt) || new Date(),
    },
  }),

  deleteExpired: async (referenceDate = new Date()) => prisma.session.deleteMany({
    where: {
      expiresAt: {
        lt: toOptionalDate(referenceDate) || new Date(),
      },
    },
  }),

  deleteByToken: async (token) => prisma.session.deleteMany({
    where: {
      token: toRequiredString(token, 'token'),
    },
  }),
};

module.exports = { sessionRepository };
