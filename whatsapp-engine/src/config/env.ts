import dotenv from 'dotenv';

dotenv.config();

const isProductionEnv = String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';

const asNumber = (value: string | undefined, fallback: number): number => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const asBoolean = (value: string | undefined, fallback: boolean): boolean => {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off', 'disabled'].includes(raw)) return false;
  return fallback;
};

const normalizeBaseUrl = (value: string | undefined, fallback = ''): string => {
  const raw = String(value || fallback || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return `http://${raw}`;
};

const whatsappQueueEnabled = asBoolean(process.env.WHATSAPP_QUEUE_ENABLED, !isProductionEnv);
const whatsappRedisWorkersEnabled = asBoolean(
  process.env.WHATSAPP_REDIS_WORKERS_ENABLED,
  whatsappQueueEnabled,
);

const parseRedisConfig = (): { host: string; port: number; password: string; tls: boolean } => {
  const redisUrl = String(process.env.REDIS_URL || process.env.REDIS_CONNECTION_STRING || '').trim();
  if (redisUrl) {
    try {
      const parsed = new URL(redisUrl);
      if (!parsed.hostname) {
        throw new Error('REDIS_URL is missing hostname.');
      }
      return {
        host: parsed.hostname,
        port: asNumber(parsed.port, 6379),
        password: decodeURIComponent(parsed.password || ''),
        tls: parsed.protocol === 'rediss:',
      };
    } catch (error) {
      if (isProductionEnv && whatsappQueueEnabled) {
        const message = error instanceof Error ? error.message : 'Invalid REDIS_URL.';
        throw new Error(`Invalid REDIS_URL/REDIS_CONNECTION_STRING for production: ${message}`);
      }
      // Fall back to REDIS_HOST/REDIS_PORT/REDIS_PASSWORD in non-production environments.
    }
  }

  const host = String(process.env.REDIS_HOST || '').trim();
  if (host) {
    return {
      host,
      port: asNumber(process.env.REDIS_PORT, 6379),
      password: process.env.REDIS_PASSWORD || '',
      tls: false,
    };
  }

  if (isProductionEnv && whatsappQueueEnabled) {
    throw new Error('REDIS_URL or REDIS_CONNECTION_STRING is required in production.');
  }

  return {
    host: 'localhost',
    port: asNumber(process.env.REDIS_PORT, 6379),
    password: process.env.REDIS_PASSWORD || '',
    tls: false,
  };
};

const redisConfig = parseRedisConfig();

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: asNumber(process.env.PORT, 8099),
  logLevel: process.env.LOG_LEVEL || 'info',
  databaseUrl: process.env.DATABASE_URL || '',
  redisHost: redisConfig.host,
  redisPort: redisConfig.port,
  redisPassword: redisConfig.password,
  redisTls: redisConfig.tls,
  serviceInternalApiToken: process.env.SERVICE_INTERNAL_API_TOKEN || process.env.INTERNAL_API_TOKEN || '',
  adminPanelToken: process.env.ADMIN_PANEL_TOKEN || '',
  adminPanelReadOnlyToken: process.env.ADMIN_PANEL_READONLY_TOKEN || '',
  internalApiToken: process.env.INTERNAL_API_TOKEN || '',
  centralBackendBaseUrl: normalizeBaseUrl(process.env.CENTRAL_BACKEND_BASE_URL || ''),
  centralBackendServiceToken: process.env.CENTRAL_BACKEND_SERVICE_TOKEN || '',
  authEncryptionKeyHex: process.env.AUTH_ENCRYPTION_KEY_HEX || '',
  authEncryptionKeyBase64: process.env.AUTH_ENCRYPTION_KEY_BASE64 || '',
  adminSessionSecret: process.env.ADMIN_SESSION_SECRET || '',
  sessionsDir: process.env.SESSIONS_DIR || '.sessions',
  whatsappQueueEnabled,
  whatsappRedisWorkersEnabled,
  workerConcurrency: asNumber(process.env.WORKER_CONCURRENCY, isProductionEnv ? 1 : 4),
  workerLockDurationMs: asNumber(process.env.WORKER_LOCK_DURATION_MS, 120000),
  workerStalledIntervalMs: asNumber(process.env.WORKER_STALLED_INTERVAL_MS, isProductionEnv ? 300000 : 60000),
  workerDrainDelaySeconds: asNumber(process.env.WORKER_DRAIN_DELAY_SECONDS, isProductionEnv ? 60 : 5),
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
