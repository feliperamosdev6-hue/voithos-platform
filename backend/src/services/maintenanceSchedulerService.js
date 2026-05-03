const { appEnv } = require('../config/appEnv');
const { pendingSignupRepository } = require('../repositories/pendingSignupRepository');
const { sessionRepository } = require('../repositories/sessionRepository');

let schedulerTimer = null;
let running = false;

const runMaintenanceIteration = async () => {
  if (running) return;
  running = true;

  try {
    const referenceDate = new Date();
    const [expiredPendingSignups, expiredSessions] = await Promise.all([
      pendingSignupRepository.deleteExpired(referenceDate),
      sessionRepository.deleteExpired(referenceDate),
    ]);

    console.info('[MAINTENANCE]', JSON.stringify({
      action: 'maintenance_scheduler_iteration_completed',
      expiredPendingSignups: Number(expiredPendingSignups?.count || 0),
      expiredSessions: Number(expiredSessions?.count || 0),
      intervalMinutes: appEnv.maintenanceSchedulerIntervalMinutes,
    }));
  } catch (error) {
    console.error('[MAINTENANCE]', JSON.stringify({
      action: 'maintenance_scheduler_iteration_failed',
      message: error?.message || String(error || ''),
      intervalMinutes: appEnv.maintenanceSchedulerIntervalMinutes,
    }));
  } finally {
    running = false;
  }
};

const startMaintenanceScheduler = () => {
  if (!appEnv.maintenanceSchedulerEnabled) {
    return { started: false, reason: 'disabled_by_env' };
  }

  const intervalMs = appEnv.maintenanceSchedulerIntervalMinutes * 60 * 1000;
  if (schedulerTimer) clearInterval(schedulerTimer);
  schedulerTimer = setInterval(runMaintenanceIteration, intervalMs);
  setTimeout(runMaintenanceIteration, 15 * 1000);

  return {
    started: true,
    intervalMs,
  };
};

const stopMaintenanceScheduler = () => {
  if (schedulerTimer) clearInterval(schedulerTimer);
  schedulerTimer = null;
  running = false;
};

module.exports = {
  startMaintenanceScheduler,
  stopMaintenanceScheduler,
};
