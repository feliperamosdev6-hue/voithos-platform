const { notificationEventService } = require('../services/notificationEventService');

const parseTypes = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const listInternalNotificationEvents = async (req, res, next) => {
  try {
    const data = await notificationEventService.listByClinic({
      clinicId: String(req.query?.clinicId || '').trim(),
      type: String(req.query?.type || '').trim(),
      types: parseTypes(req.query?.types),
      patientId: String(req.query?.patientId || '').trim(),
      limit: req.query?.limit,
      dateFrom: req.query?.dateFrom ? new Date(String(req.query.dateFrom).trim()) : undefined,
      dateTo: req.query?.dateTo ? new Date(String(req.query.dateTo).trim()) : undefined,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const createInternalNotificationEvent = async (req, res, next) => {
  try {
    const data = await notificationEventService.create({
      clinicId: String(req.body?.clinicId || '').trim(),
      appointmentId: String(req.body?.appointmentId || '').trim() || null,
      patientId: String(req.body?.patientId || '').trim() || null,
      phone: String(req.body?.phone || '').trim() || null,
      type: String(req.body?.type || '').trim(),
      payload: req.body?.payload ?? null,
    });
    return res.status(201).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listInternalNotificationEvents,
  createInternalNotificationEvent,
};
