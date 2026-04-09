#!/usr/bin/env node

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';

function stripWrappingQuotes(value) {
  const text = String(value || '').trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const parsed = {};
  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) continue;
    const key = line.slice(0, separatorIndex).trim();
    const value = stripWrappingQuotes(line.slice(separatorIndex + 1));
    if (key) parsed[key] = value;
  }
  return parsed;
}

function loadConfig() {
  const rootDir = process.cwd();
  const rootEnvPath = path.join(rootDir, '.env');
  const ngEnvPath = path.join(rootDir, 'whatsapp-engine', '.env');
  const rootEnv = loadEnvFile(rootEnvPath);
  const ngEnv = loadEnvFile(ngEnvPath);
  return {
    rootDir,
    rootEnvPath,
    ngEnvPath,
    rootEnv,
    ngEnv,
  };
}

function asPort(value, fallback) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  return fallback;
}

function normalizeBaseUrl(value, fallback) {
  const text = String(value || fallback || '').trim();
  return text.endsWith('/') ? text.slice(0, -1) : text;
}

function createResult(name, passed, details, severity = 'error') {
  return { name, passed, details, severity };
}

function printResult(result) {
  const prefix = result.passed ? 'OK' : result.severity === 'warning' ? 'WARN' : 'FAIL';
  process.stdout.write(`${prefix} ${result.name}: ${result.details}\n`);
}

function canConnectToPort(port, host = '127.0.0.1', timeoutMs = 1200) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

async function fetchHealth(url, timeoutMs = 3000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return { ok: response.ok, status: response.status };
  } catch (error) {
    return { ok: false, status: 0, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

async function run() {
  const { rootEnvPath, ngEnvPath, rootEnv, ngEnv } = loadConfig();
  const results = [];

  const backendBaseUrl = normalizeBaseUrl(
    process.env.BACKEND_BASE_URL ||
    process.env.CENTRAL_BACKEND_BASE_URL ||
    rootEnv.CENTRAL_BACKEND_BASE_URL ||
    ngEnv.CENTRAL_BACKEND_BASE_URL,
    'http://127.0.0.1:4000',
  );
  const ngPort = asPort(process.env.NG_PORT || process.env.PORT || ngEnv.PORT, 8099);
  const ngBaseUrl = normalizeBaseUrl(
    process.env.NG_BASE_URL ||
    `http://127.0.0.1:${ngPort}`,
    `http://127.0.0.1:${ngPort}`,
  );
  const backendPort = asPort(new URL(backendBaseUrl).port || 4000, 4000);
  const postgresPort = asPort(ngEnv.POSTGRES_PORT || ngEnv.DB_PORT, 5433);
  const redisPort = asPort(ngEnv.REDIS_PORT, 6379);
  const internalToken = process.env.SERVICE_INTERNAL_API_TOKEN || process.env.INTERNAL_API_TOKEN || ngEnv.SERVICE_INTERNAL_API_TOKEN || ngEnv.INTERNAL_API_TOKEN || '';
  const centralServiceToken = process.env.CENTRAL_BACKEND_SERVICE_TOKEN || ngEnv.CENTRAL_BACKEND_SERVICE_TOKEN || rootEnv.BACKEND_INTERNAL_API_TOKEN || '';

  results.push(createResult('env.root', fs.existsSync(rootEnvPath), fs.existsSync(rootEnvPath) ? rootEnvPath : 'Arquivo .env da raiz ausente.', fs.existsSync(rootEnvPath) ? 'info' : 'warning'));
  results.push(createResult('env.ng', fs.existsSync(ngEnvPath), fs.existsSync(ngEnvPath) ? ngEnvPath : 'Arquivo whatsapp-engine/.env ausente.'));
  results.push(createResult('token.ng.internal', Boolean(internalToken), internalToken ? 'Token interno do NG configurado.' : 'SERVICE_INTERNAL_API_TOKEN/INTERNAL_API_TOKEN ausente no NG.'));
  results.push(createResult('token.central.service', Boolean(centralServiceToken), centralServiceToken ? 'Token de servico do backend central configurado.' : 'CENTRAL_BACKEND_SERVICE_TOKEN/BACKEND_INTERNAL_API_TOKEN ausente.', 'warning'));

  const postgresReady = await canConnectToPort(postgresPort);
  const redisReady = await canConnectToPort(redisPort);
  results.push(createResult('infra.postgres', postgresReady, postgresReady ? `Porta ${postgresPort} acessivel.` : `Postgres indisponivel em 127.0.0.1:${postgresPort}.`));
  results.push(createResult('infra.redis', redisReady, redisReady ? `Porta ${redisPort} acessivel.` : `Redis indisponivel em 127.0.0.1:${redisPort}.`));

  const backendPortOpen = await canConnectToPort(backendPort);
  results.push(createResult('backend.port', backendPortOpen, backendPortOpen ? `Porta ${backendPort} aberta.` : `Nenhum servico ouvindo em ${backendPort}.`, 'warning'));

  const ngPortOpen = await canConnectToPort(ngPort);
  results.push(createResult('ng.port', ngPortOpen, ngPortOpen ? `Porta ${ngPort} aberta.` : `Nenhum servico ouvindo em ${ngPort}.`, 'warning'));

  const backendHealth = await fetchHealth(`${backendBaseUrl}/health`);
  const backendApiHealth = backendHealth.ok ? null : await fetchHealth(`${backendBaseUrl}/api/health`);
  const backendHealthy = backendHealth.ok || Boolean(backendApiHealth?.ok);
  results.push(
    createResult(
      'backend.health',
      backendHealthy,
      backendHealthy
        ? backendHealth.ok
          ? `Health principal respondeu HTTP ${backendHealth.status}.`
          : `Fallback /api/health respondeu HTTP ${backendApiHealth?.status}.`
        : `Backend central indisponivel em ${backendBaseUrl}.`,
      'warning',
    ),
  );

  const ngHealth = await fetchHealth(`${ngBaseUrl}/health`);
  results.push(
    createResult(
      'ng.health',
      ngHealth.ok,
      ngHealth.ok ? `Health do NG respondeu HTTP ${ngHealth.status}.` : `WhatsApp NG indisponivel em ${ngBaseUrl}.`,
      'warning',
    ),
  );

  if (internalToken && ngHealth.ok) {
    const overview = await fetch(`${ngBaseUrl}/operations/overview?hours=24&limit=3`, {
      headers: { 'x-service-token': internalToken },
    }).then(async (response) => ({
      ok: response.ok,
      status: response.status,
      data: await response.json().catch(() => null),
    })).catch((error) => ({
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : String(error),
      data: null,
    }));

    const syntheticStatus = overview.data?.summary?.syntheticStatus || overview.data?.syntheticMonitor?.status || 'unknown';
    const centralStatus = overview.data?.summary?.centralStatus || overview.data?.syntheticMonitor?.centralStatus || 'unknown';
    results.push(
      createResult(
        'ng.overview',
        overview.ok,
        overview.ok
          ? `synthetic=${syntheticStatus} central=${centralStatus} alerts=${overview.data?.summary?.activeOperationalAlerts || 0}`
          : overview.error || `HTTP ${overview.status}`,
        'warning',
      ),
    );
  } else {
    results.push(createResult('ng.overview', false, 'Overview do NG nao verificado porque o motor ou o token interno nao estavam disponiveis.', 'warning'));
  }

  results.forEach(printResult);

  const hasFailure = results.some((result) => !result.passed && result.severity !== 'warning' && result.severity !== 'info');
  process.exitCode = hasFailure ? 1 : 0;
}

run().catch((error) => {
  process.stderr.write(`FAIL doctor.platform: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
