import { app } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { instanceService } from './services/instance/instanceService';
import { maintenanceService } from './services/maintenance/maintenanceService';
import { syntheticMonitorService } from './services/monitoring/syntheticMonitorService';

const bootMode = process.env.WHATSAPP_ENGINE_BOOT_MODE || 'api';
app.locals.engineBootState = {
  ...(app.locals.engineBootState || {}),
  bootMode,
  ready: false,
  startedAt: new Date().toISOString(),
  completedAt: null,
  runtimeRecoveryFinishedAt: null,
  runtimeRecoveryFailedAt: null,
};

logger.info({ port: env.port, boot_mode: bootMode }, 'engine_boot_started');

process.on('unhandledRejection', (reason) => {
  logger.error({ reason, boot_mode: bootMode }, 'engine_unhandled_rejection');
});

process.on('uncaughtExceptionMonitor', (error, origin) => {
  logger.fatal({ error, origin, boot_mode: bootMode }, 'engine_uncaught_exception_monitor');
});

const server = app.listen(env.port, () => {
  app.locals.engineBootState = {
    ...(app.locals.engineBootState || {}),
    ready: true,
    completedAt: new Date().toISOString(),
  };
  logger.info({ port: env.port, boot_mode: bootMode, health_ready: true }, 'engine_boot_completed');
  maintenanceService.start();
  syntheticMonitorService.start();
  setImmediate(() => {
    void instanceService.recoverRuntimeSessions()
      .then(() => {
        app.locals.engineBootState = {
          ...(app.locals.engineBootState || {}),
          runtimeRecoveryFinishedAt: new Date().toISOString(),
        };
        logger.info({ boot_mode: bootMode, health_ready: true }, 'runtime session recovery finished');
      })
      .catch((error) => {
        app.locals.engineBootState = {
          ...(app.locals.engineBootState || {}),
          runtimeRecoveryFailedAt: new Date().toISOString(),
        };
        logger.error({ error }, 'runtime session recovery failed');
      });
  });
});

server.on('error', (error) => {
  app.locals.engineBootState = {
    ...(app.locals.engineBootState || {}),
    ready: false,
  };
  logger.error({ error, port: env.port, boot_mode: bootMode }, 'engine_boot_failed');
});
