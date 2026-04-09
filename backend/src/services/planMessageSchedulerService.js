const { appEnv } = require('../config/appEnv');
const { planMessageService } = require('./planMessageService');

let schedulerTimer = null;
let running = false;

const runSchedulerIteration = async () => {
  if (running) return;
  running = true;
  try {
    const result = await planMessageService.runAutomationsAcrossClinics({
      dueSoonDays: appEnv.planMessageDueSoonDays,
      actorName: 'plan_message_scheduler',
      dryRun: false,
      limitPerClinic: appEnv.planMessageSchedulerLimitPerClinic,
    });
    console.info('[PLAN_MESSAGE]', JSON.stringify({
      action: 'plan_message_scheduler_iteration_completed',
      clinics: Number(result?.clinics || 0),
      sentCount: Number(result?.sentCount || 0),
      blockedCount: Number(result?.blockedCount || 0),
      failedCount: Number(result?.failedCount || 0),
      dueSoonDays: appEnv.planMessageDueSoonDays,
      intervalMinutes: appEnv.planMessageSchedulerIntervalMinutes,
      plan_message_source: 'central',
    }));
  } catch (error) {
    console.error('[PLAN_MESSAGE]', JSON.stringify({
      action: 'plan_message_scheduler_iteration_failed',
      message: error?.message || String(error || ''),
      dueSoonDays: appEnv.planMessageDueSoonDays,
      intervalMinutes: appEnv.planMessageSchedulerIntervalMinutes,
      plan_message_source: 'central',
    }));
  } finally {
    running = false;
  }
};

const startPlanMessageScheduler = () => {
  if (!appEnv.planMessageSchedulerEnabled) {
    return { started: false, reason: 'disabled_by_env' };
  }

  const intervalMs = appEnv.planMessageSchedulerIntervalMinutes * 60 * 1000;
  if (schedulerTimer) clearInterval(schedulerTimer);
  schedulerTimer = setInterval(runSchedulerIteration, intervalMs);
  setTimeout(runSchedulerIteration, 10 * 1000);

  return {
    started: true,
    intervalMs,
    dueSoonDays: appEnv.planMessageDueSoonDays,
    limitPerClinic: appEnv.planMessageSchedulerLimitPerClinic,
  };
};

const stopPlanMessageScheduler = () => {
  if (schedulerTimer) clearInterval(schedulerTimer);
  schedulerTimer = null;
  running = false;
};

module.exports = {
  startPlanMessageScheduler,
  stopPlanMessageScheduler,
};
