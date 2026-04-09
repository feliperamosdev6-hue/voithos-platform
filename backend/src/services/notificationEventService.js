const { notificationEventRepository } = require('../repositories/notificationEventRepository');

const notificationEventService = {
  create: async (payload) => notificationEventRepository.create(payload),
  listByClinic: async ({ clinicId, type, types, patientId, limit, dateFrom, dateTo }) => notificationEventRepository.listByClinic({
    clinicId,
    type,
    types,
    patientId,
    limit,
    dateFrom,
    dateTo,
  }),
};

module.exports = { notificationEventService };
