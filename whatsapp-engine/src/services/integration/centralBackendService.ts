import { env } from '../../config/env';
import { logger } from '../../config/logger';

const REQUEST_TIMEOUT_MS = 8000;

const ensureConfigured = (): void => {
  if (!env.centralBackendBaseUrl) {
    throw new Error('CENTRAL_BACKEND_BASE_URL is required for inbound integration.');
  }
  if (!env.centralBackendServiceToken) {
    throw new Error('CENTRAL_BACKEND_SERVICE_TOKEN is required for inbound integration.');
  }
};

export const centralBackendService = {
  getClinicById: async (clinicId: string) => {
    const normalizedClinicId = String(clinicId || '').trim();
    if (!normalizedClinicId) return null;
    const clinics = await centralBackendService.listClinics();
    return clinics.find((clinic: any) => String(clinic?.id || clinic?.clinicId || '').trim() === normalizedClinicId) || null;
  },

  listClinics: async () => {
    ensureConfigured();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const baseUrl = String(env.centralBackendBaseUrl || '').trim().replace(/\/+$/, '');

    try {
      const response = await fetch(`${baseUrl}/clinics`, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(env.centralBackendServiceToken ? { 'x-service-token': env.centralBackendServiceToken } : {}),
        },
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.ok === false) {
        throw new Error(result?.error?.message || 'Central backend clinic list request failed.');
      }

      return Array.isArray(result?.data) ? result.data : [];
    } catch (error) {
      logger.error({ error }, 'failed to read clinics from central backend');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  },

  listRecentInboundWhatsapp: async (payload: {
    clinicId?: string;
    status?: string;
    intent?: string;
    limit?: number;
  } = {}) => {
    ensureConfigured();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const baseUrl = String(env.centralBackendBaseUrl || '').trim().replace(/\/+$/, '');
    const params = new URLSearchParams();
    if (payload.clinicId) params.set('clinicId', payload.clinicId);
    if (payload.status) params.set('status', payload.status);
    if (payload.intent) params.set('intent', payload.intent);
    if (payload.limit) params.set('limit', String(payload.limit));

    try {
      const response = await fetch(`${baseUrl}/internal/whatsapp/inbound?${params.toString()}`, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'x-service-token': env.centralBackendServiceToken,
        },
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.ok === false) {
        throw new Error(result?.error?.message || 'Central backend inbound history request failed.');
      }

      return Array.isArray(result?.data) ? result.data : [];
    } catch (error) {
      logger.error({ error }, 'failed to read inbound whatsapp history from central backend');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  },

  postInboundWhatsapp: async (payload: {
    clinicId: string;
    fromPhone: string;
    body: string;
    providerMessageId?: string | null;
    rawPayload?: unknown;
  }) => {
    ensureConfigured();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const baseUrl = String(env.centralBackendBaseUrl || '').trim().replace(/\/+$/, '');

    try {
      const response = await fetch(`${baseUrl}/internal/whatsapp/inbound`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'x-service-token': env.centralBackendServiceToken,
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.ok === false) {
        throw new Error(result?.error?.message || 'Central backend inbound request failed.');
      }

      return result?.data || result;
    } catch (error) {
      logger.error({
        error,
        clinicId: payload.clinicId,
        fromPhone: payload.fromPhone,
      }, 'failed to forward inbound whatsapp message to central backend');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  },
};
