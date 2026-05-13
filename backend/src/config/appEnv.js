const fs = require('fs');
const path = require('path');

const envPath = path.join(process.cwd(), '.env');

const parseEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return {};

  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).reduce((acc, line) => {
    const trimmed = String(line || '').trim();
    if (!trimmed || trimmed.startsWith('#')) return acc;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) return acc;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    acc[key] = value;
    return acc;
  }, {});
};

const fileEnv = parseEnvFile(envPath);

const readValue = (key, fallback = '') => {
  const fromProcess = process.env[key];
  if (typeof fromProcess === 'string' && fromProcess.trim() !== '') return fromProcess;
  const fromFile = fileEnv[key];
  if (typeof fromFile === 'string' && fromFile.trim() !== '') return fromFile;
  return fallback;
};

const parseBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(normalized);
};

const parseNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseOptionalDate = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString();
};

const normalizeBaseUrl = (value, fallback = '') => {
  const raw = String(value || fallback || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return `http://${raw}`;
};

const appEnv = {
  publicAppBaseUrl: normalizeBaseUrl(readValue('PUBLIC_APP_BASE_URL', 'http://127.0.0.1:4000')),
  whatsappNgBaseUrl: normalizeBaseUrl(readValue('WHATSAPP_NG_BASE_URL', 'http://127.0.0.1:8099')),
  whatsappNgServiceToken: String(readValue('WHATSAPP_NG_SERVICE_TOKEN', '')).trim(),
  whatsappNgRequestTimeoutMs: Math.max(15000, parseNumber(readValue('WHATSAPP_NG_REQUEST_TIMEOUT_MS', '60000'), 60000)),
  backendInternalApiToken: String(readValue('BACKEND_INTERNAL_API_TOKEN', '')).trim(),
  clinicalDocumentsStorageRoot: String(readValue('CLINICAL_DOCUMENTS_STORAGE_ROOT', '')).trim(),
  appointmentReminderSchedulerEnabled: String(readValue('APPOINTMENT_REMINDER_SCHEDULER_ENABLED', 'true')).trim().toLowerCase() !== 'false',
  appointmentReminderIntervalMinutes: Math.max(1, Number(readValue('APPOINTMENT_REMINDER_INTERVAL_MINUTES', '60')) || 60),
  appointmentReminderTimeZone: String(readValue('APPOINTMENT_REMINDER_TIMEZONE', 'America/Sao_Paulo')).trim() || 'America/Sao_Paulo',
  maintenanceSchedulerEnabled: String(readValue('MAINTENANCE_SCHEDULER_ENABLED', 'true')).trim().toLowerCase() !== 'false',
  maintenanceSchedulerIntervalMinutes: Math.max(5, Number(readValue('MAINTENANCE_SCHEDULER_INTERVAL_MINUTES', '30')) || 30),
  planMessageSchedulerEnabled: String(readValue('PLAN_MESSAGE_SCHEDULER_ENABLED', 'true')).trim().toLowerCase() !== 'false',
  planMessageSchedulerIntervalMinutes: Math.max(1, Number(readValue('PLAN_MESSAGE_SCHEDULER_INTERVAL_MINUTES', '60')) || 60),
  planMessageSchedulerLimitPerClinic: Math.max(1, Number(readValue('PLAN_MESSAGE_SCHEDULER_LIMIT_PER_CLINIC', '200')) || 200),
  planMessageDueSoonDays: Math.max(1, Number(readValue('PLAN_MESSAGE_DUE_SOON_DAYS', '3')) || 3),
  subscriptionEnforcementEnabled: parseBoolean(readValue('SUBSCRIPTION_ENFORCEMENT_ENABLED', 'false'), false),
  subscriptionCommercialActivationAt: parseOptionalDate(readValue('SUBSCRIPTION_COMMERCIAL_ACTIVATION_AT', '')),
  subscriptionLegacyEndDate: parseOptionalDate(readValue('SUBSCRIPTION_LEGACY_END_DATE', '')),
  appointmentActionLinksEnabled: String(readValue('APPOINTMENT_ACTION_LINKS_ENABLED', 'false')).trim().toLowerCase() === 'true',
  appointmentActionBaseUrl: normalizeBaseUrl(readValue('APPOINTMENT_ACTION_BASE_URL', readValue('PUBLIC_APP_BASE_URL', 'http://127.0.0.1:4000'))),
  appointmentActionTokenTtlHours: Math.max(1, Number(readValue('APPOINTMENT_ACTION_TOKEN_TTL_HOURS', '36')) || 36),
  appointmentConfirmationDedupMinutes: Math.max(1, Number(readValue('APPOINTMENT_CONFIRMATION_DEDUP_MINUTES', '10')) || 10),
  appointmentReplyContextTtlHours: Math.max(1, Number(readValue('APPOINTMENT_REPLY_CONTEXT_TTL_HOURS', '24')) || 24),
};

module.exports = { appEnv };
