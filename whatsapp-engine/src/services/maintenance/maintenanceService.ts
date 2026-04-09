import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { messageJobRepository } from '../../repositories/messageJobRepository';
import { messageLogRepository } from '../../repositories/messageLogRepository';
import { operationalEventRepository } from '../../repositories/operationalEventRepository';
import { operationalSettingsService } from '../settings/operationalSettingsService';

type MaintenanceSnapshot = {
  startedAt: string | null;
  lastRunAt: string | null;
  lastCompletedAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  running: boolean;
  lastPruned: {
    messageLogs: number;
    messageJobs: number;
    operationalEvents: number;
  };
};

const maintenanceState: MaintenanceSnapshot = {
  startedAt: null,
  lastRunAt: null,
  lastCompletedAt: null,
  lastErrorAt: null,
  lastErrorMessage: null,
  running: false,
  lastPruned: {
    messageLogs: 0,
    messageJobs: 0,
    operationalEvents: 0,
  },
};

let maintenanceTimer: NodeJS.Timeout | null = null;

const buildCutoff = (days: number): Date => (
  new Date(Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000)
);

const runMaintenanceCycle = async (): Promise<void> => {
  if (maintenanceState.running) return;
  maintenanceState.running = true;
  maintenanceState.lastRunAt = new Date().toISOString();

  try {
    const [messageLogs, messageJobs, operationalEvents] = await Promise.all([
      messageLogRepository.pruneBefore(buildCutoff(operationalSettingsService.getEffective().retentionMessageLogsDays)),
      messageJobRepository.pruneCompletedBefore(buildCutoff(operationalSettingsService.getEffective().retentionMessageJobsDays)),
      operationalEventRepository.pruneBefore(buildCutoff(operationalSettingsService.getEffective().retentionOperationalEventsDays)),
    ]);

    maintenanceState.lastPruned = {
      messageLogs,
      messageJobs,
      operationalEvents,
    };
    maintenanceState.lastCompletedAt = new Date().toISOString();
    maintenanceState.lastErrorAt = null;
    maintenanceState.lastErrorMessage = null;

    logger.info({
      message_logs_removed: messageLogs,
      message_jobs_removed: messageJobs,
      operational_events_removed: operationalEvents,
    }, 'maintenance_cleanup_completed');
  } catch (error) {
    maintenanceState.lastErrorAt = new Date().toISOString();
    maintenanceState.lastErrorMessage = error instanceof Error ? error.message : String(error || 'unknown maintenance error');
    logger.error({ error }, 'maintenance_cleanup_failed');
  } finally {
    maintenanceState.running = false;
  }
};

const scheduleMaintenance = (): void => {
  if (maintenanceTimer) clearInterval(maintenanceTimer);
  maintenanceTimer = setInterval(() => {
    void runMaintenanceCycle();
  }, Math.max(60000, operationalSettingsService.getEffective().maintenanceCleanupIntervalMs || env.maintenanceCleanupIntervalMs));
};

export const maintenanceService = {
  start: (): void => {
    if (maintenanceTimer) return;
    maintenanceState.startedAt = new Date().toISOString();
    scheduleMaintenance();
    void runMaintenanceCycle();
  },

  getSnapshot: (): MaintenanceSnapshot => ({
    ...maintenanceState,
    lastPruned: { ...maintenanceState.lastPruned },
  }),

  runNow: async (): Promise<void> => {
    await runMaintenanceCycle();
  },

  reloadSchedule: (): void => {
    if (!maintenanceTimer) return;
    scheduleMaintenance();
  },
};
