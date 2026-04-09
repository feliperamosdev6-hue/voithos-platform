import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { operationalEventRepository } from '../../repositories/operationalEventRepository';
import { operationalSettingsService } from '../settings/operationalSettingsService';

type SyntheticStatus = 'healthy' | 'warning' | 'critical';
type CentralStatus = 'healthy' | 'warning' | 'critical' | 'unconfigured';

type SyntheticSnapshot = {
  startedAt: string | null;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  running: boolean;
  status: SyntheticStatus;
  centralStatus: CentralStatus;
  checks: {
    ngHealthReady: boolean;
    centralReachable: boolean;
    activeOperationalAlerts: number;
    clinicsBelowSla: number;
    monitoredClinicsFailing: number;
  };
  monitoredClinicIds: string[];
  lastAlertAt: string | null;
  lastAlertReason: string | null;
  alertsDispatched: number;
};

const snapshot: SyntheticSnapshot = {
  startedAt: null,
  lastRunAt: null,
  lastSuccessAt: null,
  lastErrorAt: null,
  lastErrorMessage: null,
  running: false,
  status: 'healthy',
  centralStatus: 'unconfigured',
  checks: {
    ngHealthReady: false,
    centralReachable: false,
    activeOperationalAlerts: 0,
    clinicsBelowSla: 0,
    monitoredClinicsFailing: 0,
  },
  monitoredClinicIds: [],
  lastAlertAt: null,
  lastAlertReason: null,
  alertsDispatched: 0,
};

let timer: NodeJS.Timeout | null = null;

const parseClinicIds = (): string[] => (
  String(env.syntheticMonitorClinicIds || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
);

const fetchJson = async (url: string, token?: string): Promise<any> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers['x-service-token'] = token;
    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.success === false) {
      throw new Error(payload?.error?.message || `Request failed for ${url}`);
    }
    return payload?.data ?? payload;
  } finally {
    clearTimeout(timeout);
  }
};

const normalizeBaseUrl = (value: string): string => String(value || '').trim().replace(/\/+$/, '');

const buildAlertReason = (state: {
  status: SyntheticStatus;
  centralStatus: CentralStatus;
  activeOperationalAlerts: number;
  clinicsBelowSla: number;
  monitoredClinicsFailing: number;
}): string => {
  if (state.status === 'critical' && state.activeOperationalAlerts > 0) {
    return `active_operational_alerts=${state.activeOperationalAlerts}`;
  }
  if (state.status === 'critical' && state.centralStatus === 'critical') {
    return 'central_unreachable';
  }
  if (state.monitoredClinicsFailing > 0) {
    return `monitored_clinic_failures=${state.monitoredClinicsFailing}`;
  }
  if (state.clinicsBelowSla > 0) {
    return `clinics_below_sla=${state.clinicsBelowSla}`;
  }
  return 'synthetic_warning';
};

const notifyAlertWebhook = async (payload: Record<string, unknown>): Promise<void> => {
  const webhookUrl = normalizeBaseUrl(env.opsAlertWebhookUrl);
  if (!webhookUrl) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (env.opsAlertWebhookToken) {
      headers.Authorization = `Bearer ${env.opsAlertWebhookToken}`;
    }
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Webhook alert failed with status ${response.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
};

const maybeDispatchAlert = async (status: SyntheticStatus, alertReason: string, payload: Record<string, unknown>): Promise<void> => {
  if (status !== 'critical') return;
  const now = Date.now();
  const cooldownMs = Math.max(60000, operationalSettingsService.getEffective().syntheticAlertCooldownMs || env.syntheticAlertCooldownMs);
  const lastAlertAtMs = snapshot.lastAlertAt ? new Date(snapshot.lastAlertAt).getTime() : 0;
  const sameReason = snapshot.lastAlertReason === alertReason;
  if (sameReason && now - lastAlertAtMs < cooldownMs) return;

  snapshot.lastAlertAt = new Date(now).toISOString();
  snapshot.lastAlertReason = alertReason;
  snapshot.alertsDispatched += 1;

  await operationalEventRepository.append({
    eventType: 'SYNTHETIC_MONITOR_ALERT',
    status: status.toUpperCase(),
    summary: `Synthetic monitor escalated: ${alertReason}`,
    payload,
  }).catch(() => null);

  await notifyAlertWebhook({
    event: 'SYNTHETIC_MONITOR_ALERT',
    severity: status,
    reason: alertReason,
    generatedAt: new Date(now).toISOString(),
    payload,
  });
};

const runCycle = async (): Promise<void> => {
  if (snapshot.running) return;
  snapshot.running = true;
  snapshot.lastRunAt = new Date().toISOString();

  try {
    const baseUrl = `http://127.0.0.1:${env.port}`;
    const clinicIds = parseClinicIds().slice(0, 10);
    snapshot.monitoredClinicIds = clinicIds;

    const ngHealth = await fetchJson(`${baseUrl}/health`);
    const overview = await fetchJson(`${baseUrl}/operations/overview?hours=24&limit=5`, env.serviceInternalApiToken || env.internalApiToken);

    let centralStatus: CentralStatus = 'unconfigured';
    let centralReachable = false;
    const centralBaseUrl = normalizeBaseUrl(env.centralBackendBaseUrl);
    if (centralBaseUrl && !env.centralBackendServiceToken) {
      centralStatus = 'warning';
      snapshot.lastErrorMessage = 'Central backend sem token de servico configurado para smoke sintetico.';
    } else if (centralBaseUrl && env.centralBackendServiceToken) {
      try {
        await fetchJson(`${centralBaseUrl}/health`, env.centralBackendServiceToken);
        centralStatus = 'healthy';
        centralReachable = true;
      } catch (_error) {
        try {
          await fetchJson(`${centralBaseUrl}/api/health`, env.centralBackendServiceToken);
          centralStatus = 'healthy';
          centralReachable = true;
        } catch (secondaryError) {
          centralStatus = 'critical';
          centralReachable = false;
          snapshot.lastErrorMessage = secondaryError instanceof Error ? secondaryError.message : String(secondaryError || 'central health failed');
        }
      }
    }

    const clinicResults = await Promise.all(clinicIds.map(async (clinicId) => {
      try {
        const readiness = await fetchJson(`${baseUrl}/operations/clinic-readiness?clinicId=${encodeURIComponent(clinicId)}`, env.serviceInternalApiToken || env.internalApiToken);
        return {
          clinicId,
          smokePassed: Boolean(readiness?.smokePassed),
        };
      } catch (_error) {
        return {
          clinicId,
          smokePassed: false,
        };
      }
    }));

    const summary = overview?.summary || {};
    const monitoredClinicsFailing = clinicResults.filter((item) => !item.smokePassed).length;
    const activeOperationalAlerts = Number(summary.activeOperationalAlerts || 0);
    const clinicsBelowSla = Number(summary.clinicsBelowSla || 0);
    const ngHealthReady = Boolean(ngHealth?.health_ready === true || ngHealth?.status === 'ok');

    let status: SyntheticStatus = 'healthy';
    if (!ngHealthReady || centralStatus === 'critical' || activeOperationalAlerts > 0) {
      status = 'critical';
    } else if (clinicsBelowSla > 0 || monitoredClinicsFailing > 0 || centralStatus === 'warning') {
      status = 'warning';
    }

    snapshot.status = status;
    snapshot.centralStatus = centralStatus;
    snapshot.checks = {
      ngHealthReady,
      centralReachable,
      activeOperationalAlerts,
      clinicsBelowSla,
      monitoredClinicsFailing,
    };
    snapshot.lastSuccessAt = new Date().toISOString();
    snapshot.lastErrorAt = null;
    snapshot.lastErrorMessage = null;

    await operationalEventRepository.append({
      eventType: 'SYNTHETIC_MONITOR_STATUS',
      status: status.toUpperCase(),
      summary: `Synthetic monitor ${status}`,
      payload: {
        centralStatus,
        ngHealthReady,
        activeOperationalAlerts,
        clinicsBelowSla,
        monitoredClinicsFailing,
        monitoredClinicIds: clinicIds,
      },
    }).catch(() => null);

    const alertReason = buildAlertReason({
      status,
      centralStatus,
      activeOperationalAlerts,
      clinicsBelowSla,
      monitoredClinicsFailing,
    });
    await maybeDispatchAlert(status, alertReason, {
      centralStatus,
      checks: snapshot.checks,
      monitoredClinicIds: clinicIds,
    });
  } catch (error) {
    snapshot.status = 'critical';
    snapshot.lastErrorAt = new Date().toISOString();
    snapshot.lastErrorMessage = error instanceof Error ? error.message : String(error || 'synthetic monitor failed');
    logger.error({ error }, 'synthetic_monitor_failed');
    await maybeDispatchAlert('critical', 'synthetic_monitor_failed', {
      error: snapshot.lastErrorMessage,
    }).catch(() => null);
  } finally {
    snapshot.running = false;
  }
};

const scheduleMonitor = (): void => {
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    void runCycle();
  }, Math.max(60000, operationalSettingsService.getEffective().syntheticMonitorIntervalMs || env.syntheticMonitorIntervalMs));
};

export const syntheticMonitorService = {
  start: (): void => {
    if (timer) return;
    snapshot.startedAt = new Date().toISOString();
    scheduleMonitor();
    void runCycle();
  },

  getSnapshot: (): SyntheticSnapshot => ({
    ...snapshot,
    checks: { ...snapshot.checks },
    monitoredClinicIds: [...snapshot.monitoredClinicIds],
  }),

  runNow: async (): Promise<void> => {
    await runCycle();
  },

  reloadSchedule: (): void => {
    if (!timer) return;
    scheduleMonitor();
  },
};
