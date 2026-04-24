const { notificationEventRepository } = require('../repositories/notificationEventRepository');

const notificationEventService = {
  create: async (payload) => notificationEventRepository.create(payload),
  listByClinic: async ({ clinicId, type, types, patientId, limit, dateFrom, dateTo, markViewed, olderThanHours }) => notificationEventRepository.listByClinic({
    clinicId,
    type,
    types,
    patientId,
    limit,
    dateFrom,
    dateTo,
    markViewed,
    olderThanHours,
  }),
  markManyAsRead: async ({ clinicId, ids, readAt }) => notificationEventRepository.markManyAsRead({
    clinicId,
    ids,
    readAt,
  }),
};

module.exports = { notificationEventService };
