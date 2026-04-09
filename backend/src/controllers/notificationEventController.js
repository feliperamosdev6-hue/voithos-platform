const { getAuthenticatedClinicId } = require('../utils/authContext');
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

const listNotificationEvents = async (req, res, next) => {
  try {
    const data = await notificationEventService.listByClinic({
      clinicId: getAuthenticatedClinicId(req),
      type: req.query.type,
      types: parseTypes(req.query.types),
      patientId: req.query.patientId,
      limit: req.query.limit,
      dateFrom: req.query.dateFrom ? new Date(String(req.query.dateFrom).trim()) : undefined,
      dateTo: req.query.dateTo ? new Date(String(req.query.dateTo).trim()) : undefined,
    });
    return res.status(200).json({
      ok: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { listNotificationEvents };
