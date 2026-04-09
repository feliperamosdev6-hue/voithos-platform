const fs = require('fs');
const path = require('path');

const projectEnvPath = path.join(__dirname, '..', '..', '.env');

const parseEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return {};

  const content = fs.readFileSync(filePath, 'utf8');
  const entries = {};

  content.split(/\r?\n/).forEach((line) => {
    const trimmed = String(line || '').trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const idx = trimmed.indexOf('=');
    if (idx < 0) return;

    const key = trimmed.slice(0, idx).trim();
    const rawValue = trimmed.slice(idx + 1).trim();
    if (!key) return;

    entries[key] = rawValue.replace(/^['"]|['"]$/g, '');
  });

  return entries;
};

const parseBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;

  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return fallback;

  return ['1', 'true', 'yes', 'on'].includes(normalized);
};

const fileEnv = parseEnvFile(projectEnvPath);

const getConfigValue = (key, fallback) => {
  const processValue = process.env[key];
  if (typeof processValue === 'string' && processValue.trim() !== '') return processValue;

  const fileValue = fileEnv[key];
  if (typeof fileValue === 'string' && fileValue.trim() !== '') return fileValue;

  return fallback;
};

const getCentralBackendConfig = () => ({
  enabled: parseBoolean(getConfigValue('USE_CENTRAL_BACKEND', 'false'), false),
  baseUrl: String(getConfigValue('CENTRAL_BACKEND_BASE_URL', 'http://127.0.0.1:4000')).trim(),
  technicalEmail: String(getConfigValue('CENTRAL_BACKEND_EMAIL', 'admin@voithos.local')).trim(),
  technicalPassword: String(getConfigValue('CENTRAL_BACKEND_PASSWORD', '123456')).trim(),
  internalServiceToken: String(getConfigValue('BACKEND_INTERNAL_API_TOKEN', '')).trim(),
  timeoutMs: Number.parseInt(getConfigValue('CENTRAL_BACKEND_TIMEOUT_MS', '12000'), 10) || 12000,
});

module.exports = { getCentralBackendConfig };
