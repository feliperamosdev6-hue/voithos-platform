import dotenv from 'dotenv';

dotenv.config();

const asNumber = (value: string | undefined, fallback: number): number => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: asNumber(process.env.PORT, 8099),
  logLevel: process.env.LOG_LEVEL || 'info',
  databaseUrl: process.env.DATABASE_URL || '',
  redisHost: process.env.REDIS_HOST || 'localhost',
  redisPort: asNumber(process.env.REDIS_PORT, 6379),
  redisPassword: process.env.REDIS_PASSWORD || '',
  serviceInternalApiToken: process.env.SERVICE_INTERNAL_API_TOKEN || process.env.INTERNAL_API_TOKEN || '',
  adminPanelToken: process.env.ADMIN_PANEL_TOKEN || '',
  adminPanelReadOnlyToken: process.env.ADMIN_PANEL_READONLY_TOKEN || '',
  internalApiToken: process.env.INTERNAL_API_TOKEN || '',
  centralBackendBaseUrl: process.env.CENTRAL_BACKEND_BASE_URL || '',
  centralBackendServiceToken: process.env.CENTRAL_BACKEND_SERVICE_TOKEN || '',
  authEncryptionKeyHex: process.env.AUTH_ENCRYPTION_KEY_HEX || '',
  authEncryptionKeyBase64: process.env.AUTH_ENCRYPTION_KEY_BASE64 || '',
  adminSessionSecret: process.env.ADMIN_SESSION_SECRET || '',
  sessionsDir: process.env.SESSIONS_DIR || '.sessions',
  workerConcurrency: asNumber(process.env.WORKER_CONCURRENCY, 4),
  workerLockDurationMs: asNumber(process.env.WORKER_LOCK_DURATION_MS, 120000),
  workerStalledIntervalMs: asNumber(process.env.WORKER_STALLED_INTERVAL_MS, 60000),
  messageMaxAttempts: asNumber(process.env.MESSAGE_MAX_ATTEMPTS, 3),
  messageBackoffMs: asNumber(process.env.MESSAGE_BACKOFF_MS, 4000),
  serverMaxActiveJobsGlobal: asNumber(process.env.SERVER_MAX_ACTIVE_JOBS_GLOBAL, 5000),
  serverMaxActiveJobsPerClinic: asNumber(process.env.SERVER_MAX_ACTIVE_JOBS_PER_CLINIC, 250),
  maintenanceCleanupIntervalMs: asNumber(process.env.MAINTENANCE_CLEANUP_INTERVAL_MS, 3600000),
  retentionMessageJobsDays: asNumber(process.env.RETENTION_MESSAGE_JOBS_DAYS, 14),
  retentionMessageLogsDays: asNumber(process.env.RETENTION_MESSAGE_LOGS_DAYS, 14),
  retentionOperationalEventsDays: asNumber(process.env.RETENTION_OPERATIONAL_EVENTS_DAYS, 14),
  clinicSlaWarningRatePct: asNumber(process.env.CLINIC_SLA_WARNING_RATE_PCT, 98),
  clinicSlaCriticalRatePct: asNumber(process.env.CLINIC_SLA_CRITICAL_RATE_PCT, 90),
  syntheticMonitorIntervalMs: asNumber(process.env.SYNTHETIC_MONITOR_INTERVAL_MS, 120000),
  syntheticAlertCooldownMs: asNumber(process.env.SYNTHETIC_ALERT_COOLDOWN_MS, 900000),
  syntheticMonitorClinicIds: String(process.env.SYNTHETIC_MONITOR_CLINIC_IDS || '').trim(),
  opsAlertWebhookUrl: process.env.OPS_ALERT_WEBHOOK_URL || '',
  opsAlertWebhookToken: process.env.OPS_ALERT_WEBHOOK_TOKEN || '',
  instanceSendCooldownBaseMs: asNumber(process.env.INSTANCE_SEND_COOLDOWN_BASE_MS, 10000),
  instanceSendCooldownMaxMs: asNumber(process.env.INSTANCE_SEND_COOLDOWN_MAX_MS, 90000),
  instanceCircuitBreakerThreshold: asNumber(process.env.INSTANCE_CIRCUIT_BREAKER_THRESHOLD, 4),
  instanceCircuitBreakerWindowMs: asNumber(process.env.INSTANCE_CIRCUIT_BREAKER_WINDOW_MS, 180000),
  instanceCircuitBreakerOpenMs: asNumber(process.env.INSTANCE_CIRCUIT_BREAKER_OPEN_MS, 300000),
  runtimeRecoveryConcurrency: asNumber(process.env.RUNTIME_RECOVERY_CONCURRENCY, 4),
  runtimeRecoveryDelayMs: asNumber(process.env.RUNTIME_RECOVERY_DELAY_MS, 250),
  reconnectBaseDelayMs: asNumber(process.env.RECONNECT_BASE_DELAY_MS, 3000),
  reconnectMaxDelayMs: asNumber(process.env.RECONNECT_MAX_DELAY_MS, 45000),
};

if (!env.databaseUrl) {
  throw new Error('DATABASE_URL is required.');
}
