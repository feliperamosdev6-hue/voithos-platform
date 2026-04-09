#!/usr/bin/env node

import fs from 'node:fs';
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

function loadLocalConfig() {
  const rootDir = process.cwd();
  const rootEnv = loadEnvFile(path.join(rootDir, '.env'));
  const ngEnv = loadEnvFile(path.join(rootDir, 'whatsapp-engine', '.env'));
  return {
    ...rootEnv,
    ...ngEnv,
  };
}

function parseArgs(argv) {
  const localConfig = loadLocalConfig();
  const args = {
    backendBaseUrl:
      process.env.BACKEND_BASE_URL ||
      process.env.CENTRAL_BACKEND_BASE_URL ||
      localConfig.BACKEND_BASE_URL ||
      localConfig.CENTRAL_BACKEND_BASE_URL ||
      'http://127.0.0.1:4000',
    ngBaseUrl:
      process.env.NG_BASE_URL ||
      localConfig.NG_BASE_URL ||
      (localConfig.PORT ? `http://127.0.0.1:${localConfig.PORT}` : '') ||
      'http://127.0.0.1:8099',
    token:
      process.env.SERVICE_INTERNAL_API_TOKEN ||
      process.env.INTERNAL_API_TOKEN ||
      process.env.NG_INTERNAL_API_TOKEN ||
      localConfig.SERVICE_INTERNAL_API_TOKEN ||
      localConfig.INTERNAL_API_TOKEN ||
      '',
    clinicIds: [],
    strict: false,
    clinicReadinessTimeoutMs: 90000,
  };

  const defaultClinicIds = String(
    process.env.SYNTHETIC_MONITOR_CLINIC_IDS ||
    localConfig.SYNTHETIC_MONITOR_CLINIC_IDS ||
    '',
  )
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  for (const raw of argv) {
    if (raw === '--strict') {
      args.strict = true;
      continue;
    }
    if (raw.startsWith('--backendBaseUrl=')) {
      args.backendBaseUrl = raw.slice('--backendBaseUrl='.length);
      continue;
    }
    if (raw.startsWith('--ngBaseUrl=')) {
      args.ngBaseUrl = raw.slice('--ngBaseUrl='.length);
      continue;
    }
    if (raw.startsWith('--token=')) {
      args.token = raw.slice('--token='.length);
      continue;
    }
    if (raw.startsWith('--clinicId=')) {
      const clinicId = raw.slice('--clinicId='.length).trim();
      if (clinicId) args.clinicIds.push(clinicId);
      continue;
    }
    if (raw.startsWith('--clinicReadinessTimeoutMs=')) {
      const value = Number(raw.slice('--clinicReadinessTimeoutMs='.length));
      if (Number.isFinite(value) && value >= 5000) {
        args.clinicReadinessTimeoutMs = value;
      }
    }
  }

  if (!args.clinicIds.length && defaultClinicIds.length) {
    args.clinicIds = defaultClinicIds;
  }

  return args;
}

function normalizeBaseUrl(value, fallback) {
  const candidate = String(value || fallback || '').trim();
  return candidate.endsWith('/') ? candidate : `${candidate}/`;
}

function buildUrl(baseUrl, path, params) {
  const url = new URL(path.replace(/^\//, ''), normalizeBaseUrl(baseUrl));
  if (params && typeof params === 'object') {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function fetchJson(url, { headers = {}, timeoutMs = 10000 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return {
      ok: response.ok,
      status: response.status,
      data,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createCheck(name, passed, details, severity = 'error') {
  return { name, passed, details, severity };
}

function printCheck(check) {
  const prefix = check.passed ? 'OK' : check.severity === 'warning' ? 'WARN' : 'FAIL';
  process.stdout.write(`${prefix} ${check.name}: ${check.details}\n`);
}

function describeFailure(result, serviceName, fallbackStatus) {
  if (result?.error) {
    if (String(result.error).toLowerCase().includes('fetch failed')) {
      return `${serviceName} indisponivel ou nao iniciado na URL configurada.`;
    }
    if (String(result.error).toLowerCase().includes('abort')) {
      return `${serviceName} excedeu o tempo limite da verificacao.`;
    }
    return String(result.error);
  }
  return `HTTP ${fallbackStatus || result?.status || 0}`;
}

async function pollClinicReadiness({ baseUrl, clinicId, headers, timeoutMs }) {
  const startedAt = Date.now();
  let lastResult = null;

  while ((Date.now() - startedAt) < timeoutMs) {
    lastResult = await fetchJson(
      buildUrl(baseUrl, '/operations/clinic-readiness', { clinicId }),
      { headers, timeoutMs: 15000 },
    );

    const readinessData = lastResult?.data?.data || {};
    const instance = readinessData?.instance || null;
    const hasInstance = Boolean(instance?.id || readinessData.instanceId || readinessData.instanceExists);
    const smokePassed = Boolean(readinessData.smokePassed);
    const canProvision = Boolean(readinessData.canProvision);

    if ((hasInstance && smokePassed) || (!hasInstance && canProvision)) {
      return lastResult;
    }

    await sleep(5000);
  }

  return lastResult;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const checks = [];
  const internalHeaders = args.token ? { 'x-service-token': args.token } : {};

  const backendHealth = await fetchJson(buildUrl(args.backendBaseUrl, '/health'));
  if (backendHealth.ok) {
    checks.push(createCheck('central.health', true, `HTTP ${backendHealth.status}`));
  } else {
    const backendApiHealth = await fetchJson(buildUrl(args.backendBaseUrl, '/api/health'));
    checks.push(
      createCheck(
        'central.health',
        backendApiHealth.ok,
        backendApiHealth.ok
          ? `fallback /api/health HTTP ${backendApiHealth.status}`
          : describeFailure(backendHealth, 'Backend central', backendHealth.status || backendApiHealth.status),
      ),
    );
  }

  const ngHealth = await fetchJson(buildUrl(args.ngBaseUrl, '/health'));
  checks.push(
    createCheck(
      'ng.health',
      ngHealth.ok,
      ngHealth.ok ? `HTTP ${ngHealth.status}` : describeFailure(ngHealth, 'WhatsApp NG', ngHealth.status),
    ),
  );

  if (!args.token) {
    checks.push(
      createCheck(
        'ng.operations.overview',
        false,
        'Token interno ausente; informe --token ou SERVICE_INTERNAL_API_TOKEN.',
        args.strict ? 'error' : 'warning',
      ),
    );
  } else {
    const overview = await fetchJson(buildUrl(args.ngBaseUrl, '/operations/overview', { hours: 24, limit: 5 }), {
      headers: internalHeaders,
    });
    const synthetic = overview.data?.syntheticMonitor || {};
    const summary = overview.data?.summary || {};
    checks.push(
      createCheck(
        'ng.operations.overview',
        overview.ok,
        overview.ok
          ? `synthetic=${summary.syntheticStatus || synthetic.status || 'unknown'} central=${summary.centralStatus || synthetic.centralStatus || 'unknown'} alerts=${summary.activeOperationalAlerts || 0}`
          : describeFailure(overview, 'Overview operacional do NG', overview.status),
      ),
    );

    for (const clinicId of args.clinicIds) {
      const readiness = args.strict
        ? await pollClinicReadiness({
            baseUrl: args.ngBaseUrl,
            clinicId,
            headers: internalHeaders,
            timeoutMs: args.clinicReadinessTimeoutMs,
          })
        : await fetchJson(
            buildUrl(args.ngBaseUrl, '/operations/clinic-readiness', { clinicId }),
            { headers: internalHeaders },
          );
      const readinessData = readiness.data?.data || {};
      const smokePassed = Boolean(readinessData.smokePassed);
      const canProvision = Boolean(readinessData.canProvision);
      const canDeprovision = Boolean(readinessData.canDeprovision);
      const hasInstance = Boolean(readinessData.instance?.id || readinessData.instanceId || readinessData.instanceExists);
      const clinicCheckPassed = readiness.ok && (
        !args.strict
          ? (smokePassed || canProvision || canDeprovision)
          : (hasInstance ? smokePassed : canProvision)
      );
      checks.push(
        createCheck(
          `ng.clinic.${clinicId}`,
          clinicCheckPassed,
          readiness.ok
            ? `smokePassed=${smokePassed} canProvision=${canProvision} canDeprovision=${canDeprovision} hasInstance=${hasInstance}`
            : describeFailure(readiness, `Readiness da clinica ${clinicId}`, readiness.status),
          readiness.ok && !clinicCheckPassed && !args.strict ? 'warning' : 'error',
        ),
      );
    }
  }

  checks.forEach(printCheck);

  const hasFailure = checks.some((check) => !check.passed && (args.strict || check.severity !== 'warning'));
  process.exitCode = hasFailure ? 1 : 0;
}

run().catch((error) => {
  process.stderr.write(`FAIL smoke.platform: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
