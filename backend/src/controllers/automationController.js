const { getAuthenticatedClinicId } = require('../utils/authContext');
const { appointmentReminderService } = require('../services/appointmentReminderService');

const runDayBeforeReminderJob = async (req, res, next) => {
  try {
    const data = await appointmentReminderService.runDayBeforeReminderJob({
      clinicId: getAuthenticatedClinicId(req),
      targetDate: req.body?.targetDate,
      timeZone: req.body?.timeZone,
    });
    return res.status(200).json({
      ok: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { runDayBeforeReminderJob };
