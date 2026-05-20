const { appEnv } = require('../config/appEnv');
const { AppError } = require('../errors/AppError');

const REQUEST_TIMEOUT_MS = Math.max(15000, Number(appEnv.whatsappNgRequestTimeoutMs) || 60000);
const HEALTHCHECK_TIMEOUT_MS = 2500;

const buildTransportDetails = (error) => ({
  name: error?.name || null,
  message: error?.message || null,
  cause: error?.cause ? {
    name: error.cause?.name || null,
    code: error.cause?.code || null,
    errno: error.cause?.errno || null,
    syscall: error.cause?.syscall || null,
    address: error.cause?.address || null,
    port: error.cause?.port || null,
    message: error.cause?.message || null,
  } : null,
});

const probeHealth = async () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTHCHECK_TIMEOUT_MS);
  const startedAt = Date.now();
  const url = `${appEnv.whatsappNgBaseUrl}/health`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    return {
      ok: response.ok,
      status: response.status,
      durationMs: Date.now() - startedAt,
      body,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      durationMs: Date.now() - startedAt,
      error: buildTransportDetails(error),
    };
  } finally {
    clearTimeout(timeout);
  }
};

const ensureOk = async (response) => {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new AppError(
      response.status || 502,
      payload?.error?.code || 'WHATSAPP_NG_REQUEST_FAILED',
      payload?.error?.message || 'WhatsApp NG request failed.',
    );
  }
  return payload?.data || payload;
};

const normalizeHealth = (health) => {
  const data = health?.body?.data || health?.body || {};
  const ready = Boolean(health?.ok && data?.health_ready === true);
  return {
    ready,
    status: data?.status || (ready ? 'ok' : 'offline'),
    message: ready
      ? ''
      : health?.error?.message || data?.message || 'WhatsApp NG is unavailable.',
    durationMs: health?.durationMs || 0,
    bootMode: data?.boot_mode || null,
    startedAt: data?.startedAt || null,
    completedAt: data?.completedAt || null,
    runtimeRecoveryFinishedAt: data?.runtimeRecoveryFinishedAt || null,
    runtimeRecoveryFailedAt: data?.runtimeRecoveryFailedAt || null,
    timestamp: data?.timestamp || new Date().toISOString(),
  };
};

const normalizeConnection = (payload = {}, clinicId = '') => {
  const instanceId = String(payload?.instanceId || payload?.id || '').trim();
  return {
    ...payload,
    id: payload?.id || instanceId || null,
    instanceId: instanceId || null,
    clinicId: String(payload?.clinicId || clinicId || '').trim(),
    exists: Boolean(instanceId),
    status: payload?.operationalStatus || payload?.status || (instanceId ? 'CREATED' : 'NOT_CONFIGURED'),
    operationalStatus: payload?.operationalStatus || payload?.status || (instanceId ? 'CREATED' : 'NOT_CONFIGURED'),
  };
};

const request = async (pathname, options = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = Date.now();
  const url = `${appEnv.whatsappNgBaseUrl}${pathname}`;

  try {
    const health = await probeHealth();
    console.info('[WHATSAPP_NG_CLIENT] health probe', JSON.stringify({
      pathname,
      url,
      timeoutMs: REQUEST_TIMEOUT_MS,
      healthStatus: health.status,
      healthReady: Boolean(health.body?.data?.health_ready),
      bootMode: health.body?.data?.boot_mode || null,
      durationMs: health.durationMs,
    }));
    if (!health.ok || health.body?.data?.health_ready !== true) {
      throw new AppError(
        503,
        'WHATSAPP_NG_NOT_READY',
        'WhatsApp NG is not ready to accept outbound requests.',
      );
    }

    const headers = {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(appEnv.whatsappNgServiceToken ? { 'x-service-token': appEnv.whatsappNgServiceToken } : {}),
      ...(options.headers || {}),
    };

    const response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      signal: controller.signal,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    console.info('[WHATSAPP_NG_CLIENT] response received', JSON.stringify({
      pathname,
      status: response.status,
      durationMs: Date.now() - startedAt,
    }));
    return ensureOk(response);
  } catch (error) {
    const transport = buildTransportDetails(error);
    const health = await probeHealth();
    console.error('[WHATSAPP_NG_CLIENT] request failed', JSON.stringify({
      pathname,
      url,
      method: options.method || 'GET',
      timeoutMs: REQUEST_TIMEOUT_MS,
      durationMs: Date.now() - startedAt,
      transport,
      healthStatus: health.status,
      healthReady: Boolean(health.body?.data?.health_ready),
      bootMode: health.body?.data?.boot_mode || null,
      healthBody: health.body || null,
      healthError: health.error || null,
    }));
    if (error?.name === 'AbortError') {
      throw new AppError(504, 'WHATSAPP_NG_TIMEOUT', 'WhatsApp NG request timed out.');
    }
    if (error instanceof AppError) throw error;
    throw new AppError(502, 'WHATSAPP_NG_UNAVAILABLE', error?.message || 'WhatsApp NG is unavailable.');
  } finally {
    clearTimeout(timeout);
  }
};

const whatsappNgClient = {
  getHealth: async () => normalizeHealth(await probeHealth()),
  getConnectionByClinic: async ({ clinicId }) => {
    const normalizedClinicId = String(clinicId || '').trim();
    if (!normalizedClinicId) {
      throw new AppError(400, 'CLINIC_ID_REQUIRED', 'clinicId is required.');
    }
    try {
      const status = await request(`/instances/by-clinic/${encodeURIComponent(normalizedClinicId)}/status`);
      return normalizeConnection(status, normalizedClinicId);
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 404) {
        return normalizeConnection({
          clinicId: normalizedClinicId,
          status: 'NOT_CONFIGURED',
          operationalStatus: 'NOT_CONFIGURED',
        }, normalizedClinicId);
      }
      throw error;
    }
  },
  refreshConnectionByClinic: async ({ clinicId }) => {
    const connection = await whatsappNgClient.getConnectionByClinic({ clinicId });
    const status = String(connection.operationalStatus || connection.status || '').trim().toUpperCase();
    if (!connection.instanceId || status === 'CONNECTED' || status === 'READY') return connection;
    const qr = await request(`/instances/${encodeURIComponent(connection.instanceId)}/qr`);
    return normalizeConnection({ ...connection, ...qr }, clinicId);
  },
  connectClinic: async ({ clinicId }) => {
    const normalizedClinicId = String(clinicId || '').trim();
    if (!normalizedClinicId) {
      throw new AppError(400, 'CLINIC_ID_REQUIRED', 'clinicId is required.');
    }
    const created = await request('/instances', {
      method: 'POST',
      body: { clinicId: normalizedClinicId },
    });
    const connection = normalizeConnection(created, normalizedClinicId);
    if (!connection.instanceId) return connection;
    const qr = await request(`/instances/${encodeURIComponent(connection.instanceId)}/qr`);
    return normalizeConnection({ ...connection, ...qr }, normalizedClinicId);
  },
  disconnectClinic: async ({ clinicId }) => {
    const connection = await whatsappNgClient.getConnectionByClinic({ clinicId });
    if (!connection.instanceId) {
      return normalizeConnection({
        clinicId,
        status: 'NOT_CONFIGURED',
        operationalStatus: 'NOT_CONFIGURED',
        disconnected: false,
      }, clinicId);
    }
    const result = await request(`/instances/${encodeURIComponent(connection.instanceId)}/disconnect`, {
      method: 'POST',
    });
    return normalizeConnection({ ...connection, ...result, disconnected: true }, clinicId);
  },
  deleteClinicInstance: async ({ clinicId }) => {
    const connection = await whatsappNgClient.getConnectionByClinic({ clinicId });
    if (!connection.instanceId) {
      return normalizeConnection({
        clinicId,
        status: 'NOT_CONFIGURED',
        operationalStatus: 'NOT_CONFIGURED',
        deleted: false,
      }, clinicId);
    }
    const result = await request(`/instances/${encodeURIComponent(connection.instanceId)}`, {
      method: 'DELETE',
    });
    return {
      ...result,
      clinicId,
      instanceId: connection.instanceId,
      exists: false,
      status: 'NOT_CONFIGURED',
      operationalStatus: 'NOT_CONFIGURED',
      deleted: true,
    };
  },
  sendMessage: async ({ clinicId, phone, body, auditBody, appointmentId }) => request('/messages/send', {
    method: 'POST',
    body: {
      clinicId,
      toPhone: phone,
      body,
      auditBody: auditBody || body,
      appointmentId,
    },
  }),
  sendAppointmentConfirmation: async ({ clinicId, phone, body, auditBody, appointmentId }) => whatsappNgClient.sendMessage({
    clinicId,
    phone,
    body,
    auditBody,
    appointmentId,
  }),
};

module.exports = { whatsappNgClient };
