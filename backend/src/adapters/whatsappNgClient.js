const { appEnv } = require('../config/appEnv');
const { AppError } = require('../errors/AppError');

const REQUEST_TIMEOUT_MS = 12000;
const HEALTHCHECK_TIMEOUT_MS = 2500;

const buildTransportDetails = (error) => ({
  name: error?.name || null,
  message: error?.message || null,
  stack: error?.stack || null,
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
