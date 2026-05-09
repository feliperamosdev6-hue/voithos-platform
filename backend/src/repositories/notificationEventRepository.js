const { prisma } = require('../db/prisma');
const { toNullableString, toRequiredString } = require('../types/repositoryTypes');

const normalizePayload = (payload) => (
  payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}
);

const mergeReadAt = (payload, readAt) => ({
  ...normalizePayload(payload),
  readAt: String(readAt || new Date().toISOString()).trim(),
});

const isUnreadNotification = (event = {}) => !String(event?.payload?.readAt || '').trim();

const notificationEventRepository = {
  create: async (input) => prisma.notificationEvent.create({
    data: {
      clinicId: toRequiredString(input?.clinicId, 'clinicId'),
      appointmentId: toNullableString(input?.appointmentId),
      patientId: toNullableString(input?.patientId),
      phone: toNullableString(input?.phone),
      type: toRequiredString(input?.type, 'type'),
      payload: input?.payload ?? null,
    },
  }),

  pruneOlderThan: async ({ clinicId, olderThan = new Date(Date.now() - (24 * 60 * 60 * 1000)) } = {}) => prisma.notificationEvent.deleteMany({
    where: {
      clinicId: toRequiredString(clinicId, 'clinicId'),
      createdAt: {
        lt: olderThan,
      },
    },
  }),

  markManyAsRead: async ({ clinicId, ids = [], readAt = new Date().toISOString() } = {}) => {
    const normalizedClinicId = toRequiredString(clinicId, 'clinicId');
    const normalizedIds = Array.from(new Set(
      (Array.isArray(ids) ? ids : [])
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    ));
    if (!normalizedIds.length) return { count: 0 };

    const rows = await prisma.notificationEvent.findMany({
      where: {
        clinicId: normalizedClinicId,
        id: { in: normalizedIds },
      },
      select: {
        id: true,
        payload: true,
      },
    });

    let count = 0;
    for (const row of rows) {
      if (!isUnreadNotification(row)) continue;
      await prisma.notificationEvent.update({
        where: { id: row.id },
        data: {
          payload: mergeReadAt(row.payload, readAt),
        },
      });
      count += 1;
    }

    return { count };
  },

  listByClinic: async ({ clinicId, type, types, excludeTypes, patientId, limit = 50, dateFrom, dateTo, markViewed = false, olderThanHours = 24 }) => {
    const normalizedClinicId = toRequiredString(clinicId, 'clinicId');
    const normalizedTypes = Array.from(new Set(
      (Array.isArray(types) ? types : [])
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    ));
    const normalizedExcludeTypes = Array.from(new Set(
      (Array.isArray(excludeTypes) ? excludeTypes : [])
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    ));
    const olderThan = new Date(Date.now() - (Math.max(Number(olderThanHours) || 24, 1) * 60 * 60 * 1000));
    await prisma.notificationEvent.deleteMany({
      where: {
        clinicId: normalizedClinicId,
        createdAt: {
          lt: olderThan,
        },
      },
    });

    const events = await prisma.notificationEvent.findMany({
      where: {
        clinicId: normalizedClinicId,
        type: type
          ? toRequiredString(type, 'type')
          : (normalizedTypes.length
            ? {
                in: normalizedTypes,
              }
            : (normalizedExcludeTypes.length
              ? {
                  notIn: normalizedExcludeTypes,
                }
              : undefined)),
        patientId: patientId ? toNullableString(patientId) : undefined,
        createdAt: dateFrom || dateTo
          ? {
              gte: dateFrom || undefined,
              lte: dateTo || undefined,
            }
          : undefined,
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        patient: {
          select: {
            id: true,
            nome: true,
          },
        },
      },
      take: Math.min(Math.max(Number(limit) || 50, 1), 100),
    });

    const unreadIds = markViewed
      ? events.filter((event) => isUnreadNotification(event)).map((event) => event.id)
      : [];

    if (unreadIds.length) {
      const readAt = new Date().toISOString();
      await Promise.all(unreadIds.map((id) => prisma.notificationEvent.update({
        where: { id },
        data: {
          payload: mergeReadAt(events.find((event) => event.id === id)?.payload, readAt),
        },
      })));
      events.forEach((event) => {
        if (unreadIds.includes(event.id)) {
          event.payload = mergeReadAt(event.payload, readAt);
        }
      });
    }

    return events.map((event) => ({
      ...event,
      payload: normalizePayload(event.payload),
      patientName: String(event?.patient?.nome || event?.payload?.patientName || '').trim(),
      readAt: String(event?.payload?.readAt || '').trim() || null,
    }));
  },
};

module.exports = { notificationEventRepository };
