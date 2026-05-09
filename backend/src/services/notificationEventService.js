const { notificationEventRepository } = require('../repositories/notificationEventRepository');

const DEFAULT_SUPPRESSED_NOTIFICATION_TYPES = [
  'APPOINTMENT_ACTION_LINK_USED',
  'APPOINTMENT_REMINDER_SENT',
];

const notificationEventService = {
  create: async (payload) => notificationEventRepository.create(payload),
  listByClinic: async ({ clinicId, type, types, patientId, limit, dateFrom, dateTo, markViewed, olderThanHours }) => {
    const normalizedType = String(type || '').trim();
    const normalizedTypes = Array.isArray(types)
      ? types.map((item) => String(item || '').trim()).filter(Boolean)
      : [];

    return notificationEventRepository.listByClinic({
    clinicId,
    type: normalizedType || undefined,
    types: normalizedTypes,
    excludeTypes: (!normalizedType && !normalizedTypes.length) ? DEFAULT_SUPPRESSED_NOTIFICATION_TYPES : [],
    patientId,
    limit,
    dateFrom,
    dateTo,
    markViewed,
    olderThanHours,
    });
  },
  markManyAsRead: async ({ clinicId, ids, readAt }) => notificationEventRepository.markManyAsRead({
    clinicId,
    ids,
    readAt,
  }),
};

module.exports = { DEFAULT_SUPPRESSED_NOTIFICATION_TYPES, notificationEventService };
