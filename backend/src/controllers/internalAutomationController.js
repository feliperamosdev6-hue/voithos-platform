const { appointmentReminderService } = require('../services/appointmentReminderService');

const runInternalDayBeforeReminderJob = async (req, res, next) => {
  try {
    const data = await appointmentReminderService.runAcrossClinics({
      clinicId: req.body?.clinicId,
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

module.exports = { runInternalDayBeforeReminderJob };
