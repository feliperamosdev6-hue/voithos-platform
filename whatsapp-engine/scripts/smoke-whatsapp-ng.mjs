#!/usr/bin/env node

const rawArgs = process.argv.slice(2);
const options = {
  baseUrl: process.env.WHATSAPP_ENGINE_BASE_URL || 'http://127.0.0.1:8099',
  token: process.env.SERVICE_INTERNAL_API_TOKEN || process.env.INTERNAL_API_TOKEN || '',
  clinicIds: [],
  strict: false,
};

for (const arg of rawArgs) {
  if (arg.startsWith('--baseUrl=')) options.baseUrl = arg.split('=').slice(1).join('=').trim() || options.baseUrl;
  if (arg.startsWith('--token=')) options.token = arg.split('=').slice(1).join('=').trim() || options.token;
  if (arg.startsWith('--clinicId=')) {
    const clinicId = arg.split('=').slice(1).join('=').trim();
    if (clinicId) options.clinicIds.push(clinicId);
  }
  if (arg === '--strict') options.strict = true;
}

if (!options.token) {
  console.error('Missing SERVICE_INTERNAL_API_TOKEN / INTERNAL_API_TOKEN for smoke test.');
  process.exit(1);
}

const baseUrl = String(options.baseUrl || '').replace(/\/+$/, '');

const fetchJson = async (path) => {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Accept: 'application/json',
      'x-service-token': options.token,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error?.message || `Request failed for ${path}`);
  }
  return payload?.data;
};

const lines = [];
let failed = false;

const push = (message) => lines.push(message);

try {
  const health = await fetchJson('/health');
  push(`[health] status=${health?.status || 'unknown'} ready=${String(health?.health_ready === true)}`);
  if (health?.health_ready !== true) {
    failed = true;
    push('[health] engine is not ready');
  }

  const overview = await fetchJson('/operations/overview?hours=24&limit=5');
  const summary = overview?.summary || {};
  push(`[overview] clinicsAtRisk=${summary.clinicsAtRisk || 0} queuePressure=${summary.clinicsWithQueuePressure || 0} alerts=${summary.activeOperationalAlerts || 0}`);

  const security = await fetchJson('/security/overview');
  push(`[security] serviceToken=${security?.hasServiceToken ? 'configured' : 'missing'} adminToken=${security?.hasAdminPanelToken ? 'configured' : 'missing'}`);
  if (!security?.hasServiceToken) {
    failed = true;
    push('[security] missing service token configuration');
  }

  for (const clinicId of options.clinicIds) {
    const readiness = await fetchJson(`/operations/clinic-readiness?clinicId=${encodeURIComponent(clinicId)}`);
    const clinicName = readiness?.clinic?.clinicName || clinicId;
    push(`[clinic:${clinicId}] name=${clinicName} canProvision=${String(readiness?.canProvision === true)} canDeprovision=${String(readiness?.canDeprovision === true)} smokePassed=${String(readiness?.smokePassed === true)} activeJobs=${Number(readiness?.activeJobs || 0)} recentFailures=${Number(readiness?.recentFailures || 0)}`);

    if (!readiness?.clinic) {
      failed = true;
      push(`[clinic:${clinicId}] central clinic not resolved`);
      continue;
    }

    if (options.strict && readiness?.smokePassed !== true) {
      failed = true;
      push(`[clinic:${clinicId}] strict smoke failed`);
    }
  }
} catch (error) {
  failed = true;
  push(`[fatal] ${error instanceof Error ? error.message : String(error || 'unknown error')}`);
}

for (const line of lines) console.log(line);
process.exit(failed ? 1 : 0);
