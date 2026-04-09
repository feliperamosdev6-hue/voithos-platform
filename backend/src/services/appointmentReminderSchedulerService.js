const { appEnv } = require('../config/appEnv');
const { appointmentReminderService } = require('./appointmentReminderService');

let schedulerTimer = null;
let running = false;

const runSchedulerIteration = async () => {
  if (running) return;
  running = true;
  try {
    const result = await appointmentReminderService.runAcrossClinics({
      timeZone: appEnv.appointmentReminderTimeZone,
    });
    console.info('[REMINDER] scheduler run completed', JSON.stringify({
      clinics: result.length,
      timeZone: appEnv.appointmentReminderTimeZone,
    }));
  } catch (error) {
    console.error('[REMINDER] scheduler run failed', error?.message || error);
  } finally {
    running = false;
  }
};

const startAppointmentReminderScheduler = () => {
  if (!appEnv.appointmentReminderSchedulerEnabled) {
    return { started: false, reason: 'disabled_by_env' };
  }

  const intervalMs = appEnv.appointmentReminderIntervalMinutes * 60 * 1000;
  if (schedulerTimer) clearInterval(schedulerTimer);

  schedulerTimer = setInterval(runSchedulerIteration, intervalMs);
  setTimeout(runSchedulerIteration, 5 * 1000);

  return {
    started: true,
    intervalMs,
    timeZone: appEnv.appointmentReminderTimeZone,
  };
};

const stopAppointmentReminderScheduler = () => {
  if (schedulerTimer) clearInterval(schedulerTimer);
  schedulerTimer = null;
  running = false;
};

module.exports = {
  startAppointmentReminderScheduler,
  stopAppointmentReminderScheduler,
};
