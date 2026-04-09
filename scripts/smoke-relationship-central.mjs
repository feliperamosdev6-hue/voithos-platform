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

function loadLocalConfig(rootDir) {
  return {
    ...loadEnvFile(path.join(rootDir, '.env')),
    ...loadEnvFile(path.join(rootDir, 'whatsapp-engine', '.env')),
  };
}

function normalizeBaseUrl(value, fallback) {
  const candidate = String(value || fallback || '').trim();
  return candidate.endsWith('/') ? candidate : `${candidate}/`;
}

function buildUrl(baseUrl, route, params) {
  const url = new URL(route.replace(/^\//, ''), normalizeBaseUrl(baseUrl));
  if (params && typeof params === 'object') {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function requestJson(url, {
  method = 'GET',
  headers = {},
  timeoutMs = 15000,
  body,
} = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
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

function parseArgs(argv, rootDir) {
  const localConfig = loadLocalConfig(rootDir);
  const args = {
    backendBaseUrl:
      process.env.BACKEND_BASE_URL ||
      process.env.CENTRAL_BACKEND_BASE_URL ||
      localConfig.BACKEND_BASE_URL ||
      localConfig.CENTRAL_BACKEND_BASE_URL ||
      'http://127.0.0.1:4000',
    token:
      process.env.BACKEND_INTERNAL_API_TOKEN ||
      localConfig.BACKEND_INTERNAL_API_TOKEN ||
      '',
    clinicIds: [],
    dueSoonDays: 3,
    date: '',
  };

  for (const raw of argv) {
    if (raw.startsWith('--backendBaseUrl=')) {
      args.backendBaseUrl = raw.slice('--backendBaseUrl='.length).trim();
      continue;
    }
    if (raw.startsWith('--token=')) {
      args.token = raw.slice('--token='.length).trim();
      continue;
    }
    if (raw.startsWith('--clinicId=')) {
      const clinicId = raw.slice('--clinicId='.length).trim();
      if (clinicId) args.clinicIds.push(clinicId);
      continue;
    }
    if (raw.startsWith('--dueSoonDays=')) {
      const value = Number(raw.slice('--dueSoonDays='.length).trim());
      if (Number.isFinite(value) && value >= 1) args.dueSoonDays = Math.max(1, Math.round(value));
      continue;
    }
    if (raw.startsWith('--date=')) {
      args.date = raw.slice('--date='.length).trim();
    }
  }

  return args;
}

async function main() {
  const rootDir = process.cwd();
  const args = parseArgs(process.argv.slice(2), rootDir);

  if (!args.token) {
    process.stderr.write('[smoke:relationship] BACKEND_INTERNAL_API_TOKEN ausente.\n');
    process.exit(1);
  }
  if (!args.clinicIds.length) {
    process.stderr.write('[smoke:relationship] Informe ao menos um --clinicId=<id>.\n');
    process.exit(1);
  }

  const results = [];
  for (const clinicId of args.clinicIds) {
    const result = await requestJson(buildUrl(args.backendBaseUrl, '/internal/relationships/overview', {
      clinicId,
      date: args.date,
      dueSoonDays: args.dueSoonDays,
    }), {
      headers: { 'x-service-token': args.token },
      timeoutMs: 30000,
    });

    if (!result.ok) {
      process.stderr.write(`[smoke:relationship] FAIL clinicId=${clinicId} status=${result.status || 0} error=${result.error || JSON.stringify(result.data)}\n`);
      process.exit(1);
    }

    const data = result?.data?.data || {};
    results.push(data);
    process.stdout.write(
      `[smoke:relationship] clinicId=${clinicId} birthdays=${Number(data?.birthdays?.total || 0)} campaignsSentToday=${Number(data?.campaigns?.dashboard?.sentToday || 0)} planAttention=${Number(data?.plans?.counts?.totalAttention || 0)} faltas=${Number(data?.agendaRecovery?.faltasCount || 0)} desmarcados=${Number(data?.agendaRecovery?.desmarcadosCount || 0)}\n`,
    );
  }

  process.stdout.write(`${JSON.stringify({ clinics: results.length, results }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`[smoke:relationship] fatal=${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
