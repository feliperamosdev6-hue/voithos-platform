const fs = require('fs');
const path = require('path');
const { getCentralBackendConfig } = require('../config/central-backend-config');
const { SOURCE, withSource } = require('../utils/hybrid-source-utils');

const LEGACY_TO_CENTRAL_STATUS = {
  em_aberto: 'AGENDADO',
  confirmado: 'CONFIRMADO',
  realizado: 'CONCLUIDO',
  nao_compareceu: 'NAO_COMPARECEU',
  cancelado: 'CANCELADO',
  remarcar: 'REMARCAR',
};

const LEGACY_TO_CENTRAL_ATTENDANCE = {
  compareceu: 'ATTENDED',
  nao_compareceu: 'NO_SHOW',
  pendente: '',
};

const CENTRAL_TO_LEGACY_STATUS = {
  AGENDADO: 'em_aberto',
  CONFIRMADO: 'confirmado',
  CONCLUIDO: 'realizado',
  NAO_COMPARECEU: 'nao_compareceu',
  CANCELADO: 'cancelado',
  REMARCAR: 'remarcar',
};

const CENTRAL_TO_LEGACY_ATTENDANCE = {
  ATTENDED: 'compareceu',
  NO_SHOW: 'nao_compareceu',
};

const normalizeDigits = (value) => String(value || '').replace(/\D/g, '');
const cleanText = (value) => String(value || '').trim();
const createLocalId = (prefix = 'id') => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const maskEmail = (email) => {
  const [localPart = '', domain = ''] = String(email || '').trim().toLowerCase().split('@');
  if (!localPart || !domain) return '';
  const localMask = localPart.length <= 2
    ? `${localPart[0] || '*'}*`
    : `${localPart.slice(0, 2)}***`;
  return `${localMask}@${domain}`;
};

const logPasswordReset = (stage, payload = {}, extra = {}) => {
  console.info('[password-reset][central-adapter]', JSON.stringify({
    stage,
    endpoint: extra.endpoint || '',
    baseUrl: extra.baseUrl || '',
    email: maskEmail(payload?.email || payload?.login || payload?.adminEmail || ''),
    status: extra.status || '',
    httpStatus: extra.httpStatus || '',
    fallback: extra.fallback === true,
    error: extra.error || '',
  }));
};

const normalizeDateOnly = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const normalizeTimeOnly = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(11, 16);
};

const normalizeRangeBoundary = (value, endOfDay = false) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return `${raw}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`;
  }
  return raw;
};

const combineDateTime = (dateValue, timeValue) => {
  const date = String(dateValue || '').trim();
  const time = String(timeValue || '').trim();
  if (!date || !time) return null;
  const iso = new Date(`${date}T${time}:00.000Z`);
  if (Number.isNaN(iso.getTime())) return null;
  return iso.toISOString();
};

const ensureOk = async (response) => {
  if (response.ok) return response;

  let details = null;
  try {
    details = await response.json();
  } catch (_) {
    details = null;
  }

  const message = details?.error?.message || `Central backend request failed with status ${response.status}.`;
  const error = new Error(message);
  error.status = response.status;
  error.code = details?.error?.code || 'CENTRAL_BACKEND_ERROR';
  throw error;
};

const createCentralBackendAdapter = (options = {}) => {
  const config = {
    ...getCentralBackendConfig(),
    ...(options.config || {}),
  };

  let sessionToken = '';
  let tokenExpiresAt = 0;
  let userSessionToken = '';
  let userSessionExpiresAt = 0;

  const isEnabled = () => config.enabled === true;

  const withTimeout = async (url, requestOptions = {}) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      return await fetch(url, {
        ...requestOptions,
        signal: controller.signal,
      });
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      const networkError = new Error(`Central backend is unavailable at ${config.baseUrl}.`);
      networkError.code = 'CENTRAL_BACKEND_UNAVAILABLE';
      networkError.cause = error;
      throw networkError;
    } finally {
      clearTimeout(timeout);
    }
  };

  const login = async () => {
    const response = await withTimeout(`${config.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: config.technicalEmail,
        password: config.technicalPassword,
      }),
    });

    await ensureOk(response);
    const payload = await response.json();
    const token = String(payload?.data?.token || '').trim();

    if (!token) {
      throw new Error('Central backend did not return an auth token.');
    }

    sessionToken = token;
    tokenExpiresAt = Date.now() + (6 * 24 * 60 * 60 * 1000);
    return token;
  };

  const getToken = async (forceRefresh = false) => {
    if (!forceRefresh && sessionToken && tokenExpiresAt > Date.now()) return sessionToken;
    return login();
  };

  const setUserSession = (token) => {
    const normalized = String(token || '').trim();
    userSessionToken = normalized;
    userSessionExpiresAt = normalized ? Date.now() + (12 * 60 * 60 * 1000) : 0;
    return normalized;
  };

  const getUserSessionToken = () => {
    if (!userSessionToken || userSessionExpiresAt <= Date.now()) return '';
    return userSessionToken;
  };

  const requestJson = async (pathname, requestOptions = {}, retry = true) => {
    const token = await getToken();
    const headers = {
      Accept: 'application/json',
      ...(requestOptions.body ? { 'Content-Type': 'application/json' } : {}),
      ...(requestOptions.headers || {}),
      Authorization: `Bearer ${token}`,
    };

    try {
      const response = await withTimeout(`${config.baseUrl}${pathname}`, {
        ...requestOptions,
        headers,
      });

      if (response.status === 401 && retry) {
        await getToken(true);
        return requestJson(pathname, requestOptions, false);
      }

      await ensureOk(response);
      return response.json();
    } catch (error) {
      if (error?.name === 'AbortError') {
        const timeoutError = new Error('Central backend request timed out.');
        timeoutError.code = 'CENTRAL_BACKEND_TIMEOUT';
        throw timeoutError;
      }

      throw error;
    }
  };

  const requestInternalJson = async (pathname, requestOptions = {}) => {
    const headers = {
      Accept: 'application/json',
      ...(requestOptions.body ? { 'Content-Type': 'application/json' } : {}),
      ...(config.internalServiceToken ? { 'x-service-token': config.internalServiceToken } : {}),
      ...(requestOptions.headers || {}),
    };

    try {
      const response = await withTimeout(`${config.baseUrl}${pathname}`, {
        ...requestOptions,
        headers,
      });

      await ensureOk(response);
      return response.json();
    } catch (error) {
      if (error?.name === 'AbortError') {
        const timeoutError = new Error('Central backend internal request timed out.');
        timeoutError.code = 'CENTRAL_BACKEND_TIMEOUT';
        throw timeoutError;
      }

      throw error;
    }
  };

  const requestInternalBuffer = async (pathname, requestOptions = {}) => {
    const headers = {
      Accept: '*/*',
      ...(config.internalServiceToken ? { 'x-service-token': config.internalServiceToken } : {}),
      ...(requestOptions.headers || {}),
    };

    try {
      const response = await withTimeout(`${config.baseUrl}${pathname}`, {
        ...requestOptions,
        headers,
      });

      await ensureOk(response);
      const arrayBuffer = await response.arrayBuffer();
      return {
        buffer: Buffer.from(arrayBuffer),
        headers: response.headers,
      };
    } catch (error) {
      if (error?.name === 'AbortError') {
        const timeoutError = new Error('Central backend internal request timed out.');
        timeoutError.code = 'CENTRAL_BACKEND_TIMEOUT';
        throw timeoutError;
      }

      throw error;
    }
  };

  const requestJsonWithUserToken = async (pathname, userToken, requestOptions = {}) => {
    const normalizedToken = String(userToken || '').trim();
    if (!normalizedToken) {
      const error = new Error('Authenticated session token is required.');
      error.code = 'CENTRAL_AUTH_REQUIRED';
      throw error;
    }

    const headers = {
      Accept: 'application/json',
      ...(requestOptions.body ? { 'Content-Type': 'application/json' } : {}),
      ...(requestOptions.headers || {}),
      Authorization: `Bearer ${normalizedToken}`,
    };

    try {
      const response = await withTimeout(`${config.baseUrl}${pathname}`, {
        ...requestOptions,
        headers,
      });
      await ensureOk(response);
      return response.json();
    } catch (error) {
      if (error?.name === 'AbortError') {
        const timeoutError = new Error('Central backend authenticated request timed out.');
        timeoutError.code = 'CENTRAL_BACKEND_TIMEOUT';
        throw timeoutError;
      }
      throw error;
    }
  };

  const authLogin = async ({ email, login, senha, password } = {}) => {
    const response = await withTimeout(`${config.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email || login || '',
        password: password || senha || '',
      }),
    });
    await ensureOk(response);
    const payload = await response.json();
    if (payload?.data?.token) setUserSession(payload.data.token);
    return payload?.data || null;
  };

  const authConfirmEmailVerification = async ({ email, login, adminEmail, code, verificationCode, codigo } = {}) => {
    const response = await withTimeout(`${config.baseUrl}/auth/email-verification/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email || login || adminEmail || '',
        code: code || verificationCode || codigo || '',
      }),
    });
    await ensureOk(response);
    const payload = await response.json();
    const data = payload?.data || {};
    if (data?.token) setUserSession(data.token);
    return {
      success: data?.verified === true || payload?.ok === true,
      token: data?.token || '',
      user: data?.user || null,
      clinic: data?.clinic || null,
      pendingCheckout: data?.pendingCheckout === true,
      pendingSignupToken: data?.pendingSignupToken || '',
      selectedPlan: data?.selectedPlan || '',
      operationType: data?.operationType || '',
      paymentLink: data?.paymentLink || '',
      paymentExpiresAt: data?.paymentExpiresAt || null,
    };
  };

  const authResendEmailVerification = async ({ email, login, adminEmail } = {}) => {
    const response = await withTimeout(`${config.baseUrl}/auth/email-verification/resend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email || login || adminEmail || '',
      }),
    });
    await ensureOk(response);
    const payload = await response.json();
    const data = payload?.data || {};
    if (data?.token) setUserSession(data.token);
    return {
      success: data?.deliveryConfirmed === true || data?.resent === true || payload?.ok === true,
      resent: data?.resent === true,
      blocked: data?.blocked === true,
      reason: data?.reason || '',
      message: data?.message || '',
      resendAvailableAt: data?.resendAvailableAt || '',
      verificationExpiresAt: data?.verificationExpiresAt || '',
      sendCount: Number(data?.sendCount || 0),
      deliveryConfirmed: data?.deliveryConfirmed === true,
      pendingVerification: data?.pendingVerification === true,
    };
  };

  const authSignup = async ({
    documentType,
    documentNumber,
    nomeClinica,
    nomeConta,
    responsavelNome,
    adminEmail,
    clinicEmail,
    telefone,
    cep,
    rua,
    numero,
    complemento,
    bairro,
    cidade,
    uf,
    password,
    senha,
    passwordConfirmation,
    confirmarSenha,
  } = {}) => {
    const response = await withTimeout(`${config.baseUrl}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentType: documentType || '',
        documentNumber: documentNumber || '',
        nomeClinica: nomeClinica || nomeConta || '',
        responsavelNome: responsavelNome || '',
        adminEmail: adminEmail || '',
        clinicEmail: clinicEmail || adminEmail || '',
        telefone: telefone || '',
        cep: cep || '',
        rua: rua || '',
        numero: numero || '',
        complemento: complemento || '',
        bairro: bairro || '',
        cidade: cidade || '',
        uf: uf || '',
        password: password || senha || '',
        passwordConfirmation: passwordConfirmation || confirmarSenha || '',
      }),
    });
    await ensureOk(response);
    const payload = await response.json();
    if (payload?.data?.token) setUserSession(payload.data.token);
    return payload?.data || null;
  };

  const authRequestPasswordReset = async ({ email, login, adminEmail } = {}) => {
    const payloadInput = { email, login, adminEmail };
    logPasswordReset('request_call', payloadInput, {
      endpoint: '/auth/password-reset/request',
      baseUrl: config.baseUrl,
      status: 'started',
    });
    const response = await withTimeout(`${config.baseUrl}/auth/password-reset/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email || login || adminEmail || '',
      }),
    });
    logPasswordReset('request_response', payloadInput, {
      endpoint: '/auth/password-reset/request',
      baseUrl: config.baseUrl,
      httpStatus: response.status,
      status: response.ok ? 'http_ok' : 'http_error',
    });
    await ensureOk(response);
    const payload = await response.json();
    const data = payload?.data || {};
    logPasswordReset('request_completed', payloadInput, {
      endpoint: '/auth/password-reset/request',
      baseUrl: config.baseUrl,
      status: data?.requested === true || payload?.ok === true ? 'success' : 'failed',
    });
    return { success: data?.requested === true || payload?.ok === true };
  };

  const authValidatePasswordResetCode = async ({ email, login, adminEmail, code, resetCode, codigo } = {}) => {
    const payloadInput = { email, login, adminEmail };
    logPasswordReset('validate_call', payloadInput, {
      endpoint: '/auth/password-reset/validate',
      baseUrl: config.baseUrl,
      status: 'started',
    });
    const response = await withTimeout(`${config.baseUrl}/auth/password-reset/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email || login || adminEmail || '',
        code: code || resetCode || codigo || '',
      }),
    });
    logPasswordReset('validate_response', payloadInput, {
      endpoint: '/auth/password-reset/validate',
      baseUrl: config.baseUrl,
      httpStatus: response.status,
      status: response.ok ? 'http_ok' : 'http_error',
    });
    await ensureOk(response);
    const payload = await response.json();
    const data = payload?.data || {};
    logPasswordReset('validate_completed', payloadInput, {
      endpoint: '/auth/password-reset/validate',
      baseUrl: config.baseUrl,
      status: data?.valid === true || payload?.ok === true ? 'success' : 'failed',
    });
    return { success: data?.valid === true || payload?.ok === true };
  };

  const authConfirmPasswordReset = async ({
    email,
    login,
    adminEmail,
    code,
    resetCode,
    codigo,
    newPassword,
    confirmPassword,
    senhaNova,
    senha,
    confirmarSenha,
    passwordConfirmation,
  } = {}) => {
    const payloadInput = { email, login, adminEmail };
    logPasswordReset('confirm_call', payloadInput, {
      endpoint: '/auth/password-reset/confirm',
      baseUrl: config.baseUrl,
      status: 'started',
    });
    const response = await withTimeout(`${config.baseUrl}/auth/password-reset/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email || login || adminEmail || '',
        code: code || resetCode || codigo || '',
        newPassword: newPassword || senhaNova || senha || '',
        confirmPassword: confirmPassword || confirmarSenha || passwordConfirmation || '',
      }),
    });
    logPasswordReset('confirm_response', payloadInput, {
      endpoint: '/auth/password-reset/confirm',
      baseUrl: config.baseUrl,
      httpStatus: response.status,
      status: response.ok ? 'http_ok' : 'http_error',
    });
    await ensureOk(response);
    const payload = await response.json();
    const data = payload?.data || {};
    logPasswordReset('confirm_completed', payloadInput, {
      endpoint: '/auth/password-reset/confirm',
      baseUrl: config.baseUrl,
      status: data?.reset === true || payload?.ok === true ? 'success' : 'failed',
    });
    return { success: data?.reset === true || payload?.ok === true };
  };

  const authMe = async (userToken) => {
    const payload = await requestJsonWithUserToken('/auth/me', userToken, { method: 'GET' });
    return payload?.data || null;
  };

  const authLogout = async (userToken) => {
    const payload = await requestJsonWithUserToken('/auth/logout', userToken, { method: 'POST' });
    return payload?.data || { loggedOut: true };
  };

  const authChangePassword = async (userToken, { senhaAtual, currentPassword, novaSenha, newPassword } = {}) => {
    const payload = await requestJsonWithUserToken('/auth/change-password', userToken, {
      method: 'POST',
      body: JSON.stringify({
        currentPassword: currentPassword || senhaAtual || '',
        newPassword: newPassword || novaSenha || '',
      }),
    });
    return payload?.data || { changed: true };
  };

  const listUsersWithToken = async (userToken) => {
    const payload = await requestJsonWithUserToken('/users', userToken, { method: 'GET' });
    return payload?.data || [];
  };

  const listNotificationEventsWithToken = async (userToken, options = {}) => {
    const params = new URLSearchParams();
    if (options?.type) params.set('type', String(options.type).trim());
    if (options?.types) {
      const list = Array.isArray(options.types) ? options.types : String(options.types || '').split(',');
      const normalized = list.map((item) => String(item || '').trim()).filter(Boolean);
      if (normalized.length) params.set('types', normalized.join(','));
    }
    if (options?.patientId) params.set('patientId', String(options.patientId).trim());
    if (options?.dateFrom) params.set('dateFrom', String(options.dateFrom).trim());
    if (options?.dateTo) params.set('dateTo', String(options.dateTo).trim());
    if (options?.limit) params.set('limit', String(options.limit).trim());
    if (options?.markViewed) params.set('markViewed', 'true');
    if (options?.olderThanHours) params.set('olderThanHours', String(options.olderThanHours).trim());
    const query = params.toString();
    const payload = await requestJsonWithUserToken(`/notifications${query ? `?${query}` : ''}`, userToken, {
      method: 'GET',
    });
    return payload?.data || [];
  };

  const listNotificationEvents = async (options = {}) => {
    const params = new URLSearchParams();
    if (options?.clinicId) params.set('clinicId', String(options.clinicId).trim());
    if (options?.type) params.set('type', String(options.type).trim());
    if (options?.types) {
      const list = Array.isArray(options.types) ? options.types : String(options.types || '').split(',');
      const normalized = list.map((item) => String(item || '').trim()).filter(Boolean);
      if (normalized.length) params.set('types', normalized.join(','));
    }
    if (options?.patientId) params.set('patientId', String(options.patientId).trim());
    if (options?.dateFrom) params.set('dateFrom', String(options.dateFrom).trim());
    if (options?.dateTo) params.set('dateTo', String(options.dateTo).trim());
    if (options?.limit) params.set('limit', String(options.limit).trim());
    if (options?.markViewed) params.set('markViewed', 'true');
    if (options?.olderThanHours) params.set('olderThanHours', String(options.olderThanHours).trim());
    const query = params.toString();
    const payload = await requestInternalJson(`/internal/notifications${query ? `?${query}` : ''}`);
    return payload?.data || [];
  };

  const createNotificationEvent = async (payloadInput = {}) => {
    const payload = await requestInternalJson('/internal/notifications', {
      method: 'POST',
      body: JSON.stringify(payloadInput || {}),
    });
    return payload?.data || null;
  };

  const getClinicOperationalSettingsWithToken = async (userToken) => {
    const payload = await requestJsonWithUserToken('/clinics/me/operational-settings', userToken, {
      method: 'GET',
    });
    return payload?.data || null;
  };

  const updateClinicOperationalSettingsWithToken = async (userToken, patch = {}) => {
    const payload = await requestJsonWithUserToken('/clinics/me/operational-settings', userToken, {
      method: 'PATCH',
      body: JSON.stringify(patch || {}),
    });
    return payload?.data || null;
  };

  const getClinicOperationalSettings = async (clinicId) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const query = normalizedClinicId ? `?clinicId=${encodeURIComponent(normalizedClinicId)}` : '';
    const payload = await requestInternalJson(`/internal/clinics/operational-settings${query}`);
    return payload?.data || null;
  };

  const updateClinicOperationalSettings = async (clinicId, patch = {}) => {
    const payload = await requestInternalJson('/internal/clinics/operational-settings', {
      method: 'PATCH',
      body: JSON.stringify({
        clinicId: String(clinicId || '').trim(),
        patch: patch || {},
      }),
    });
    return payload?.data || null;
  };

  const getRelationshipOverview = async ({ clinicId, date, dueSoonDays } = {}) => {
    const params = new URLSearchParams();
    if (clinicId) params.set('clinicId', String(clinicId).trim());
    if (date) params.set('date', String(date).trim());
    if (dueSoonDays !== undefined && dueSoonDays !== null && String(dueSoonDays).trim() !== '') {
      params.set('dueSoonDays', String(dueSoonDays).trim());
    }
    const query = params.toString();
    const payload = await requestInternalJson(`/internal/relationships/overview${query ? `?${query}` : ''}`);
    return payload?.data || null;
  };

  const getClinicProfileWithToken = async (userToken) => {
    const payload = await requestJsonWithUserToken('/clinics/me/profile', userToken, {
      method: 'GET',
    });
    return payload?.data || null;
  };

  const updateClinicProfileWithToken = async (userToken, patch = {}) => {
    const payload = await requestJsonWithUserToken('/clinics/me/profile', userToken, {
      method: 'PATCH',
      body: JSON.stringify(patch || {}),
    });
    return payload?.data || null;
  };

  const listClinicCampaignsWithToken = async (userToken) => {
    const payload = await requestJsonWithUserToken('/campaigns', userToken, {
      method: 'GET',
    });
    return payload?.data || [];
  };

  const listCampaignTemplatesWithToken = async (userToken) => {
    const payload = await requestJsonWithUserToken('/campaigns/templates', userToken, {
      method: 'GET',
    });
    return payload?.data || null;
  };

  const replaceClinicCampaignsWithToken = async (userToken, campaigns = []) => {
    const payload = await requestJsonWithUserToken('/campaigns', userToken, {
      method: 'PUT',
      body: JSON.stringify({ campaigns: Array.isArray(campaigns) ? campaigns : [] }),
    });
    return payload?.data || [];
  };

  const createClinicCampaignWithToken = async (userToken, campaign = {}) => {
    const payload = await requestJsonWithUserToken('/campaigns', userToken, {
      method: 'POST',
      body: JSON.stringify(campaign || {}),
    });
    return payload?.data || null;
  };

  const updateClinicCampaignWithToken = async (userToken, id, changes = {}) => {
    const normalizedId = String(id || '').trim();
    const payload = await requestJsonWithUserToken(`/campaigns/${encodeURIComponent(normalizedId)}`, userToken, {
      method: 'PATCH',
      body: JSON.stringify(changes || {}),
    });
    return payload?.data || null;
  };

  const deleteClinicCampaignWithToken = async (userToken, id) => {
    const normalizedId = String(id || '').trim();
    const payload = await requestJsonWithUserToken(`/campaigns/${encodeURIComponent(normalizedId)}`, userToken, {
      method: 'DELETE',
    });
    return payload?.data || { success: true };
  };

  const getCampaignDashboardWithToken = async (userToken) => {
    const payload = await requestJsonWithUserToken('/campaigns/dashboard', userToken, {
      method: 'GET',
    });
    return payload?.data || null;
  };

  const resolveCampaignAudienceWithToken = async (userToken, payloadInput = {}) => {
    const payload = await requestJsonWithUserToken('/campaigns/resolve-audience', userToken, {
      method: 'POST',
      body: JSON.stringify(payloadInput || {}),
    });
    return payload?.data || null;
  };

  const createCampaignBatchWithToken = async (userToken, campaignId, payloadInput = {}) => {
    const normalizedId = String(campaignId || '').trim();
    const payload = await requestJsonWithUserToken(`/campaigns/${encodeURIComponent(normalizedId)}/batches`, userToken, {
      method: 'POST',
      body: JSON.stringify(payloadInput || {}),
    });
    return payload?.data || null;
  };

  const updateCampaignDispatchWithToken = async (userToken, dispatchId, payloadInput = {}) => {
    const normalizedId = String(dispatchId || '').trim();
    const payload = await requestJsonWithUserToken(`/campaigns/dispatches/${encodeURIComponent(normalizedId)}`, userToken, {
      method: 'PATCH',
      body: JSON.stringify(payloadInput || {}),
    });
    return payload?.data || null;
  };

  const listCampaignDispatchLogsWithToken = async (userToken, options = {}) => {
    const params = new URLSearchParams();
    Object.entries(options || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      params.set(key, String(value));
    });
    const query = params.toString();
    const payload = await requestJsonWithUserToken(`/campaigns/logs${query ? `?${query}` : ''}`, userToken, {
      method: 'GET',
    });
    return payload?.data || { items: [], total: 0, page: 1, limit: 50, hasMore: false };
  };

  const getCampaignResultWithToken = async (userToken, campaignId, options = {}) => {
    const normalizedId = String(campaignId || '').trim();
    const params = new URLSearchParams();
    Object.entries(options || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      params.set(key, String(value));
    });
    const query = params.toString();
    const payload = await requestJsonWithUserToken(`/campaigns/${encodeURIComponent(normalizedId)}/result${query ? `?${query}` : ''}`, userToken, {
      method: 'GET',
    });
    return payload?.data || null;
  };

  const createUserWithToken = async (userToken, userData = {}) => {
    const payload = await requestJsonWithUserToken('/users', userToken, {
      method: 'POST',
      body: JSON.stringify({
        nome: userData.nome || '',
        email: userData.email || userData.login || '',
        password: userData.password || userData.senha || '',
        role: userData.role || '',
        clinicId: String(userData.clinicId || '').trim(),
        isClinicAdmin: userData.isClinicAdmin === true,
        ativo: userData.isActive !== false,
      }),
    });
    return payload?.data || null;
  };

  const updateUserWithToken = async (userToken, userData = {}) => {
    const normalizedId = String(userData?.id || userData?.userId || '').trim();
    const payload = await requestJsonWithUserToken(`/users/${encodeURIComponent(normalizedId)}`, userToken, {
      method: 'PATCH',
      body: JSON.stringify({
        nome: userData.nome || '',
        email: userData.email || userData.login || '',
        role: userData.role || '',
        clinicId: String(userData.clinicId || '').trim(),
        isClinicAdmin: userData.isClinicAdmin === true,
        ativo: userData.isActive !== false,
      }),
    });
    return payload?.data || null;
  };

  const resetUserPasswordWithToken = async (userToken, { id, novaSenha, password } = {}) => {
    const normalizedId = String(id || '').trim();
    const payload = await requestJsonWithUserToken(`/users/${encodeURIComponent(normalizedId)}/reset-password`, userToken, {
      method: 'POST',
      body: JSON.stringify({
        password: password || novaSenha || '',
      }),
    });
    return payload?.data || { success: true };
  };

  const deleteUserWithToken = async (userToken, id) => {
    const normalizedId = String(id || '').trim();
    const payload = await requestJsonWithUserToken(`/users/${encodeURIComponent(normalizedId)}`, userToken, {
      method: 'DELETE',
    });
    return payload?.data || { success: true };
  };

  const listClinicsPublic = async () => {
    const response = await withTimeout(`${config.baseUrl}/clinics`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(config.internalServiceToken ? { 'x-service-token': config.internalServiceToken } : {}),
      },
    });
    await ensureOk(response);
    const payload = await response.json();
    return (payload?.data || []).map((clinic) => ({
      ...clinic,
      clinicId: clinic.id,
      cnpjOuCpf: clinic.cnpjCpf || '',
      emailClinica: clinic.email || '',
      telefone: clinic.telefoneComercial || '',
    }));
  };

  const createClinicBootstrap = async (payload = {}) => {
    const response = await requestInternalJson('/internal/identity/clinics/bootstrap', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
    return response?.data || null;
  };

  const impersonateClinicAdmin = async (clinicId) => {
    const response = await requestInternalJson('/internal/identity/auth/impersonate-clinic-admin', {
      method: 'POST',
      body: JSON.stringify({
        clinicId: String(clinicId || '').trim(),
      }),
    });
    return response?.data || null;
  };

  const mapCentralPatientToLegacy = (patient = {}) => ({
    ...withSource({}, SOURCE.CENTRAL),
    ...patient,
    id: patient.id,
    prontuario: patient.id,
    nome: patient.nome || '',
    fullName: patient.nome || '',
    phone: patient.telefone || '',
    address: patient.endereco || '',
    notes: patient.notes || patient.observacoes || '',
    dentistaId: patient.dentistaId || '',
    dentistaNome: patient.dentistaNome || '',
    birthDate: patient.dataNascimento ? normalizeDateOnly(patient.dataNascimento) : '',
    dataNascimento: patient.dataNascimento ? normalizeDateOnly(patient.dataNascimento) : '',
    allowsMessages: patient.allowsMessages !== false,
    lastBirthdayMessageAt: patient.lastBirthdayMessageAt || '',
    birthdayMessageYear: Number.isFinite(Number(patient.birthdayMessageYear))
      ? Math.trunc(Number(patient.birthdayMessageYear))
      : 0,
    selfiePath: patient.selfiePath || patient.profilePhotoPath || '',
    selfieFileName: patient.selfieFileName || '',
    selfieMime: patient.selfieMime || patient.profilePhotoMime || '',
    selfieUpdatedAt: patient.selfieUpdatedAt || patient.profilePhotoUpdatedAt || '',
    selfieSize: Number(patient.selfieSize || 0) || 0,
  });

  const hasOwn = (payload, key) => Object.prototype.hasOwnProperty.call(payload || {}, key);
  const pickPatientPayloadValue = (payload = {}, keys = [], fallback = '') => {
    for (const key of keys) {
      if (hasOwn(payload, key) && payload[key] !== undefined) return payload[key];
    }
    return fallback;
  };

  const normalizeLegacyPatientPayload = (payload = {}) => ({
    nome: pickPatientPayloadValue(payload, ['fullName', 'name', 'nome'], ''),
    cpf: pickPatientPayloadValue(payload, ['cpf', 'document', 'cpfCnpj'], ''),
    rg: pickPatientPayloadValue(payload, ['rg'], ''),
    dataNascimento: pickPatientPayloadValue(payload, ['dataNascimento', 'birthDate', 'nascimento'], null),
    telefone: pickPatientPayloadValue(payload, ['phone', 'telefone', 'celular', 'whatsapp'], ''),
    email: pickPatientPayloadValue(payload, ['email'], ''),
    endereco: pickPatientPayloadValue(payload, ['address', 'endereco'], ''),
    notes: pickPatientPayloadValue(payload, ['notes', 'observacoes'], ''),
    observacoes: pickPatientPayloadValue(payload, ['observacoes', 'notes'], ''),
    dentistaId: pickPatientPayloadValue(payload, ['dentistaId'], ''),
    dentistaNome: pickPatientPayloadValue(payload, ['dentistaNome'], ''),
    allowsMessages: payload.allowsMessages !== undefined ? payload.allowsMessages !== false : true,
    lastBirthdayMessageAt: pickPatientPayloadValue(payload, ['lastBirthdayMessageAt'], null),
    birthdayMessageYear: Number.isFinite(Number(payload.birthdayMessageYear))
      ? Math.trunc(Number(payload.birthdayMessageYear))
      : null,
  });

  const buildPatientMap = (patients = []) => {
    const map = new Map();
    (patients || []).forEach((patient) => {
      [
        patient?.id,
        patient?.prontuario,
        patient?.cpf,
      ]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .forEach((key) => map.set(key, patient));
    });
    return map;
  };

  const hasPatientContactDiff = (centralPatient = {}, localPatient = {}) => {
    const centralPhone = normalizeDigits(
      centralPatient?.telefone || centralPatient?.phone || centralPatient?.celular || centralPatient?.whatsapp || ''
    );
    const localPhone = normalizeDigits(
      localPatient?.telefone || localPatient?.phone || localPatient?.celular || localPatient?.whatsapp || ''
    );
    const centralEmail = String(centralPatient?.email || '').trim().toLowerCase();
    const localEmail = String(localPatient?.email || '').trim().toLowerCase();
    const centralAddress = String(centralPatient?.endereco || centralPatient?.address || '').trim().toLowerCase();
    const localAddress = String(localPatient?.endereco || localPatient?.address || '').trim().toLowerCase();

    return (!!localPhone && centralPhone !== localPhone)
      || (!!localEmail && centralEmail !== localEmail)
      || (!!localAddress && centralAddress !== localAddress);
  };

  const mapCentralAppointmentToLegacy = (appointment = {}, patientMap = new Map()) => {
    const patient = patientMap.get(String(appointment.patientId || '').trim()) || appointment.patient || {};
    const centralStatus = String(appointment.status || '').trim().toUpperCase();
    const derivedAttendanceStatus = CENTRAL_TO_LEGACY_ATTENDANCE[String(appointment.attendanceStatus || '').trim().toUpperCase()]
      || (centralStatus === 'CONCLUIDO' ? 'compareceu' : '')
      || (centralStatus === 'NAO_COMPARECEU' ? 'nao_compareceu' : '');
    const legacyStatus = ['CONCLUIDO', 'NAO_COMPARECEU'].includes(centralStatus)
      ? (appointment.confirmado === true ? 'confirmado' : 'em_aberto')
      : (CENTRAL_TO_LEGACY_STATUS[centralStatus] || 'em_aberto');

    return {
      ...withSource({}, SOURCE.CENTRAL),
      id: appointment.id,
      clinicId: appointment.clinicId,
      pacienteId: appointment.patientId,
      patientId: appointment.patientId,
      prontuario: appointment.patientId,
      pacienteNome: patient?.nome || '',
      paciente: patient?.nome || '',
      telefone: patient?.telefone || '',
      dentistaId: appointment.profissionalId || '',
      dentistaNome: appointment.profissionalNome || '',
      data: normalizeDateOnly(appointment.dataHora),
      horaInicio: normalizeTimeOnly(appointment.dataHora),
      horaFim: appointment.horaFim ? normalizeTimeOnly(appointment.horaFim) : normalizeTimeOnly(appointment.dataHora),
      tipo: appointment.tipo || 'procedimento',
      status: legacyStatus,
      attendanceStatus: derivedAttendanceStatus,
      observacoes: appointment.observacoes || '',
      marcadorId: appointment.marcadorId || '',
      marcadorNome: appointment.marcadorNome || '',
      marcadorCor: appointment.marcadorCor || '',
      confirmado: appointment.confirmado === true,
      confirmationPending: appointment.confirmationPending === true,
      lastConfirmationSentAt: appointment.lastConfirmationSentAt || '',
      lastConfirmationOutboundId: appointment.lastConfirmationOutboundId || '',
    };
  };

  const getScopedClinicId = (input = {}) => String(
    input?.clinicId
    || input?.appointment?.clinicId
    || input?.patient?.clinicId
    || ''
  ).trim();

  const resolveExistingCentralPatient = async ({ clinicId, patient = {}, appointment = {} } = {}) => {
    const scopedClinicId = String(clinicId || appointment?.clinicId || patient?.clinicId || '').trim();
    const candidateIds = [
      patient?.id,
      patient?.prontuario,
      patient?._id,
      appointment?.patientId,
      appointment?.pacienteId,
      appointment?.prontuario,
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean);

    for (const candidateId of candidateIds) {
      try {
        const found = await getPatientById(candidateId, { clinicId: scopedClinicId });
        if (found) return found;
      } catch (_) {
        // Ignore lookup miss and continue.
      }
    }

    return null;
  };

  const getPatients = async (input = {}) => {
    const clinicId = getScopedClinicId(input);
    const payload = clinicId
      ? await requestInternalJson(`/internal/patients?clinicId=${encodeURIComponent(clinicId)}`)
      : await requestJson('/patients');
    return (payload?.data || []).map(mapCentralPatientToLegacy);
  };

  const getPatientById = async (id, clinicInput = {}) => {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) return null;

    const clinicId = getScopedClinicId(typeof clinicInput === 'string' ? { clinicId: clinicInput } : clinicInput);
    const payload = clinicId
      ? await requestInternalJson(`/internal/patients/${encodeURIComponent(normalizedId)}?clinicId=${encodeURIComponent(clinicId)}`)
      : await requestJson(`/patients/${encodeURIComponent(normalizedId)}`);
    return mapCentralPatientToLegacy(payload?.data || {});
  };

  const searchPatients = async (query, clinicInput = {}) => {
    const patients = await getPatients(clinicInput);
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];

    return patients.filter((patient) => {
      const haystack = [
        patient?.nome,
        patient?.fullName,
        patient?.cpf,
        patient?.telefone,
        patient?.email,
        patient?.prontuario,
      ]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');
      return haystack.includes(q);
    });
  };

  const createPatient = async (patientData = {}, clinicInput = {}) => {
    const clinicId = getScopedClinicId({ ...patientData, ...clinicInput });
    const payload = clinicId
      ? await requestInternalJson('/internal/patients', {
        method: 'POST',
        body: JSON.stringify({
          clinicId,
          ...normalizeLegacyPatientPayload(patientData),
        }),
      })
      : await requestJson('/patients', {
        method: 'POST',
        body: JSON.stringify(normalizeLegacyPatientPayload(patientData)),
      });

    return mapCentralPatientToLegacy(payload?.data || {});
  };

  const updatePatient = async (id, patientData = {}, clinicInput = {}) => {
    const normalizedId = String(id || patientData?.id || patientData?.prontuario || '').trim();
    const clinicId = getScopedClinicId({ ...patientData, ...clinicInput });
    const payload = clinicId
      ? await requestInternalJson(`/internal/patients/${encodeURIComponent(normalizedId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          clinicId,
          ...normalizeLegacyPatientPayload(patientData),
        }),
      })
      : await requestJson(`/patients/${encodeURIComponent(normalizedId)}`, {
        method: 'PATCH',
        body: JSON.stringify(normalizeLegacyPatientPayload(patientData)),
      });

    return mapCentralPatientToLegacy(payload?.data || {});
  };

  const deletePatient = async (id, clinicInput = {}) => {
    const normalizedId = String(id || '').trim();
    const clinicId = getScopedClinicId(typeof clinicInput === 'string' ? { clinicId: clinicInput } : clinicInput);
    const payload = clinicId
      ? await requestInternalJson(`/internal/patients/${encodeURIComponent(normalizedId)}?clinicId=${encodeURIComponent(clinicId)}`, {
        method: 'DELETE',
      })
      : await requestJson(`/patients/${encodeURIComponent(normalizedId)}`, {
        method: 'DELETE',
      });
    return payload?.data || { success: true };
  };

  const getAppointments = async ({ clinicId, start, end, date, patientId } = {}) => {
    let from = normalizeRangeBoundary(start, false);
    let to = normalizeRangeBoundary(end, true);

    if (date && !from && !to) {
      from = combineDateTime(date, '00:00');
      to = combineDateTime(date, '23:59');
    }

    const params = new URLSearchParams();
    if (clinicId) params.set('clinicId', String(clinicId).trim());
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (patientId) params.set('patientId', String(patientId).trim());

    const suffix = params.toString() ? `?${params.toString()}` : '';
    const [appointmentsPayload, patients] = await Promise.all([
      clinicId ? requestInternalJson(`/internal/appointments${suffix}`) : requestJson(`/appointments${suffix}`),
      patientId
        ? getPatientById(patientId, { clinicId }).then((patient) => (patient ? [patient] : [])).catch(() => [])
        : getPatients({ clinicId }),
    ]);

    const patientMap = buildPatientMap(patients);
    return (appointmentsPayload?.data || []).map((appointment) => mapCentralAppointmentToLegacy(appointment, patientMap));
  };

  const createAppointment = async (appointmentData = {}) => {
    const patientId = String(
      appointmentData.patientId || appointmentData.pacienteId || appointmentData.prontuario || ''
    ).trim();
    const clinicId = getScopedClinicId(appointmentData);
    const requestBody = {
      patientId,
      profissionalId: appointmentData.dentistaId || '',
      profissionalNome: appointmentData.dentistaNome || '',
      dataHora: combineDateTime(appointmentData.data, appointmentData.horaInicio),
      horaFim: combineDateTime(appointmentData.data, appointmentData.horaFim),
      tipo: appointmentData.tipo || '',
      observacoes: appointmentData.observacoes || '',
      marcadorId: appointmentData.marcadorId || '',
      marcadorNome: appointmentData.marcadorNome || '',
      marcadorCor: appointmentData.marcadorCor || '',
      attendanceStatus: LEGACY_TO_CENTRAL_ATTENDANCE[String(appointmentData.attendanceStatus || '').trim().toLowerCase()] || null,
    };

    const payload = clinicId
      ? await requestInternalJson('/internal/appointments', {
        method: 'POST',
        body: JSON.stringify({
          clinicId,
          ...requestBody,
        }),
      })
      : await requestJson('/appointments', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

    const patient = await getPatientById(patientId, { clinicId }).catch(() => null);
    const patientMap = buildPatientMap(patient ? [patient] : []);
    return mapCentralAppointmentToLegacy(payload?.data || {}, patientMap);
  };

  const getAppointmentById = async (id, clinicInput = {}) => {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) return null;
    const clinicId = getScopedClinicId(typeof clinicInput === 'string' ? { clinicId: clinicInput } : clinicInput);
    const payload = clinicId
      ? await requestInternalJson(`/internal/appointments/${encodeURIComponent(normalizedId)}?clinicId=${encodeURIComponent(clinicId)}`)
      : await requestJson(`/appointments/${encodeURIComponent(normalizedId)}`);
    const patient = await getPatientById(payload?.data?.patientId, { clinicId }).catch(() => null);
    const patientMap = buildPatientMap(patient ? [patient] : []);
    return mapCentralAppointmentToLegacy(payload?.data || {}, patientMap);
  };

  const ensureCentralPatient = async ({ patient = {}, appointment = {} } = {}) => {
    const found = await resolveExistingCentralPatient({
      clinicId: appointment?.clinicId || patient?.clinicId || '',
      patient,
      appointment,
    });

    if (found) {
      if (hasPatientContactDiff(found, patient)) {
        return updatePatient(found.id, {
          ...patient,
          id: found.id,
        }, { clinicId: appointment?.clinicId || patient?.clinicId || '' });
      }
      return found;
    }

    if (!patient || typeof patient !== 'object') {
      const error = new Error('Patient is required to sync appointment to central backend.');
      error.code = 'PATIENT_SYNC_REQUIRED';
      throw error;
    }

    return createPatient(patient, { clinicId: appointment?.clinicId || patient?.clinicId || '' });
  };

  const resolveClinicalPatientContext = async ({ clinicId, patient = {}, appointment = {}, allowCreate = false } = {}) => {
    const scopedClinicId = String(clinicId || appointment?.clinicId || patient?.clinicId || '').trim();
    if (!scopedClinicId) {
      const error = new Error('clinicId obrigatorio para prontuario no backend central.');
      error.code = 'CLINICAL_CLINIC_REQUIRED';
      throw error;
    }

    const existing = await resolveExistingCentralPatient({
      clinicId: scopedClinicId,
      patient,
      appointment,
    });

    if (existing) {
      return { clinicId: scopedClinicId, patient: existing };
    }

    if (!allowCreate) {
      const error = new Error('Patient not found for this clinic.');
      error.code = 'PATIENT_NOT_FOUND';
      throw error;
    }

    const created = await ensureCentralPatient({
      patient: { ...patient, clinicId: scopedClinicId },
      appointment: { ...appointment, clinicId: scopedClinicId },
    });
    return { clinicId: scopedClinicId, patient: created };
  };

  const ensureAppointmentTransportId = async ({ clinicId, appointment = {}, patient = {} } = {}) => {
    try {
      return await resolveAppointmentTransportId({ clinicId, appointment, patient });
    } catch (error) {
      if (error?.code !== 'APPOINTMENT_NOT_FOUND') throw error;
    }

    const centralPatient = await ensureCentralPatient({ patient, appointment });
    const syncedAppointment = {
      ...appointment,
      patientId: centralPatient.id,
    };

    try {
      return await resolveAppointmentTransportId({
        clinicId,
        appointment: syncedAppointment,
        patient: {
          ...patient,
          id: centralPatient.id,
          prontuario: centralPatient.id,
        },
      });
    } catch (error) {
      if (error?.code !== 'APPOINTMENT_NOT_FOUND') throw error;
    }

    const created = await createAppointment({
      ...syncedAppointment,
      patientId: centralPatient.id,
      pacienteId: centralPatient.id,
    });
    return String(created?.id || '').trim();
  };

  const sendAppointmentReminder = async (input) => {
    const normalizedId = String(typeof input === 'object' ? input?.id : input || '').trim();
    const clinicId = String(typeof input === 'object' ? input?.clinicId : '').trim();
    let resolvedId = normalizedId;
    if (clinicId && typeof input === 'object') {
      resolvedId = await ensureAppointmentTransportId({
        clinicId,
        appointment: input?.appointment || input,
        patient: input?.patient || {},
      });
    }
    const payload = clinicId
      ? await requestInternalJson(`/internal/appointments/${encodeURIComponent(resolvedId)}/send-reminder`, {
        method: 'POST',
        body: JSON.stringify({ clinicId }),
      })
      : await requestJson(`/appointments/${encodeURIComponent(resolvedId)}/send-reminder`, {
        method: 'POST',
      });
    return payload?.data || null;
  };

  const sendAppointmentConfirmation = async (input) => {
    const normalizedId = String(typeof input === 'object' ? input?.id : input || '').trim();
    const clinicId = String(typeof input === 'object' ? input?.clinicId : '').trim();
    let resolvedId = normalizedId;
    if (clinicId && typeof input === 'object') {
      resolvedId = await ensureAppointmentTransportId({
        clinicId,
        appointment: input?.appointment || input,
        patient: input?.patient || {},
      });
    }
    const payload = clinicId
      ? await requestInternalJson(`/internal/appointments/${encodeURIComponent(resolvedId)}/send-confirmation`, {
        method: 'POST',
        body: JSON.stringify({ clinicId }),
      })
      : await requestJson(`/appointments/${encodeURIComponent(resolvedId)}/send-confirmation`, {
        method: 'POST',
      });
    return payload?.data || null;
  };

  const resetClinicWhatsappReplyContexts = async ({ clinicId, reason } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    if (!normalizedClinicId) {
      throw new Error('clinicId obrigatorio para resetar o contexto WhatsApp da clinica.');
    }
    const payload = await requestInternalJson('/internal/whatsapp/reset-clinic-context', {
      method: 'POST',
      body: JSON.stringify({
        clinicId: normalizedClinicId,
        reason: String(reason || '').trim() || 'WhatsApp clinic context reset by operator.',
      }),
    });
    return payload?.data || null;
  };

  const resolveAppointmentTransportId = async ({ clinicId, appointment = {}, patient = {} } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    if (!normalizedClinicId) {
      throw new Error('clinicId obrigatorio para resolver appointment no backend central.');
    }

    const payload = await requestInternalJson('/internal/appointments/resolve', {
      method: 'POST',
      body: JSON.stringify({
        clinicId: normalizedClinicId,
        appointment,
        patient,
      }),
    });

    const resolvedId = String(payload?.data?.id || '').trim();
    if (!resolvedId) {
      const error = new Error('Appointment not found for this clinic.');
      error.code = 'APPOINTMENT_NOT_FOUND';
      throw error;
    }

    return resolvedId;
  };

  const supportsAppointmentStatus = (legacyStatus) =>
    Object.prototype.hasOwnProperty.call(
      LEGACY_TO_CENTRAL_STATUS,
      String(legacyStatus || '').trim().toLowerCase()
    );

  const updateAppointmentStatus = async (id, legacyStatus, clinicInput = {}) => {
    const statusKey = String(legacyStatus || '').trim().toLowerCase();
    const centralStatus = LEGACY_TO_CENTRAL_STATUS[statusKey];

    if (!centralStatus) {
      const error = new Error('Appointment status is not supported by central backend.');
      error.code = 'CENTRAL_STATUS_UNSUPPORTED';
      throw error;
    }

    const clinicId = getScopedClinicId(typeof clinicInput === 'string' ? { clinicId: clinicInput } : clinicInput);
    const payload = clinicId
      ? await requestInternalJson(`/internal/appointments/${encodeURIComponent(id)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ clinicId, status: centralStatus }),
      })
      : await requestJson(`/appointments/${encodeURIComponent(id)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: centralStatus }),
      });

    const patient = await getPatientById(payload?.data?.patientId, { clinicId }).catch(() => null);
    const patientMap = buildPatientMap(patient ? [patient] : []);
    return mapCentralAppointmentToLegacy(payload?.data || {}, patientMap);
  };

  const updateAppointmentAttendance = async (id, legacyAttendanceStatus, clinicInput = {}) => {
    const attendanceKey = String(legacyAttendanceStatus || '').trim().toLowerCase();
    if (attendanceKey && !Object.prototype.hasOwnProperty.call(LEGACY_TO_CENTRAL_ATTENDANCE, attendanceKey)) {
      const error = new Error('Appointment attendance status is not supported by central backend.');
      error.code = 'CENTRAL_ATTENDANCE_UNSUPPORTED';
      throw error;
    }

    const clinicId = getScopedClinicId(typeof clinicInput === 'string' ? { clinicId: clinicInput } : clinicInput);
    const attendanceStatus = Object.prototype.hasOwnProperty.call(LEGACY_TO_CENTRAL_ATTENDANCE, attendanceKey)
      ? (LEGACY_TO_CENTRAL_ATTENDANCE[attendanceKey] || null)
      : null;
    const payload = clinicId
      ? await requestInternalJson(`/internal/appointments/${encodeURIComponent(id)}/attendance`, {
        method: 'PATCH',
        body: JSON.stringify({ clinicId, attendanceStatus }),
      })
      : await requestJson(`/appointments/${encodeURIComponent(id)}/attendance`, {
        method: 'PATCH',
        body: JSON.stringify({ attendanceStatus }),
      });

    const patient = await getPatientById(payload?.data?.patientId, { clinicId }).catch(() => null);
    const patientMap = buildPatientMap(patient ? [patient] : []);
    return mapCentralAppointmentToLegacy(payload?.data || {}, patientMap);
  };

  const updateAppointment = async (id, appointmentData = {}) => {
    const normalizedId = String(id || appointmentData?.id || '').trim();
    const patientId = String(
      appointmentData.patientId || appointmentData.pacienteId || appointmentData.prontuario || ''
    ).trim();
    const legacyStatus = String(appointmentData.status || 'em_aberto').trim().toLowerCase();
    const clinicId = getScopedClinicId(appointmentData);
    const requestBody = {
      patientId,
      profissionalId: appointmentData.dentistaId || '',
      profissionalNome: appointmentData.dentistaNome || '',
      dataHora: combineDateTime(appointmentData.data, appointmentData.horaInicio),
      horaFim: combineDateTime(appointmentData.data, appointmentData.horaFim),
      tipo: appointmentData.tipo || '',
      observacoes: appointmentData.observacoes || '',
      marcadorId: appointmentData.marcadorId || '',
      marcadorNome: appointmentData.marcadorNome || '',
      marcadorCor: appointmentData.marcadorCor || '',
      status: LEGACY_TO_CENTRAL_STATUS[legacyStatus] || 'AGENDADO',
      attendanceStatus: LEGACY_TO_CENTRAL_ATTENDANCE[String(appointmentData.attendanceStatus || '').trim().toLowerCase()] || null,
    };
    const payload = clinicId
      ? await requestInternalJson(`/internal/appointments/${encodeURIComponent(normalizedId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ clinicId, ...requestBody }),
      })
      : await requestJson(`/appointments/${encodeURIComponent(normalizedId)}`, {
        method: 'PATCH',
        body: JSON.stringify(requestBody),
      });

    const patient = await getPatientById(payload?.data?.patientId, { clinicId }).catch(() => null);
    const patientMap = buildPatientMap(patient ? [patient] : []);
    return mapCentralAppointmentToLegacy(payload?.data || {}, patientMap);
  };

  const deleteAppointment = async (input) => {
    const normalizedId = String(typeof input === 'object' ? input?.id : input || '').trim();
    const clinicId = getScopedClinicId(typeof input === 'object' ? input : {});
    let resolvedId = normalizedId;
    if (clinicId && typeof input === 'object' && input?.appointment) {
      try {
        resolvedId = await resolveAppointmentTransportId({
          clinicId,
          appointment: input.appointment,
          patient: input.patient || {},
        });
      } catch (error) {
        if (error?.code !== 'APPOINTMENT_NOT_FOUND') throw error;
      }
    }
    const payload = clinicId
      ? await requestInternalJson(`/internal/appointments/${encodeURIComponent(resolvedId)}?clinicId=${encodeURIComponent(clinicId)}`, {
        method: 'DELETE',
      })
      : await requestJson(`/appointments/${encodeURIComponent(resolvedId)}`, {
        method: 'DELETE',
      });
    return payload?.data || { success: true };
  };

  const getPatientClinicalRecord = async ({ clinicId, patient = {}, appointment = {} } = {}) => {
    const context = await resolveClinicalPatientContext({ clinicId, patient, appointment, allowCreate: false });
    const payload = await requestInternalJson(
      `/internal/clinical/patients/${encodeURIComponent(context.patient.id)}/clinical-record?clinicId=${encodeURIComponent(context.clinicId)}`
    );
    return payload?.data || null;
  };

  const listPatientProcedures = async ({ clinicId, patient = {}, appointment = {} } = {}) => {
    const context = await resolveClinicalPatientContext({ clinicId, patient, appointment, allowCreate: false });
    const payload = await requestInternalJson(
      `/internal/clinical/patients/${encodeURIComponent(context.patient.id)}/procedures?clinicId=${encodeURIComponent(context.clinicId)}`
    );
    return payload?.data || [];
  };

  const normalizeProcedureMutationResult = (data = {}) => {
    const service = data?.service || data?.procedure || data || null;
    return {
      service,
      financeId: cleanText(
        data?.financeId
        || service?.financeiroId
        || service?.financeiro?.financeEntryId
        || service?.financeiro?.accountId
      ),
      financeWarning: cleanText(data?.financeWarning || service?.financeiro?.warning || ''),
      financeAction: cleanText(data?.financeAction || ''),
      success: data?.success !== false,
    };
  };

  const upsertPatientProcedure = async ({ clinicId, patient = {}, appointment = {}, procedure = {} } = {}) => {
    const context = await resolveClinicalPatientContext({ clinicId, patient, appointment, allowCreate: true });
    const normalizedProcedure = {
      ...procedure,
      id: cleanText(procedure?.id || procedure?.externalId || createLocalId('proc')),
    };
    const payload = await requestInternalJson(
      `/internal/clinical/patients/${encodeURIComponent(context.patient.id)}/procedures`,
      {
        method: 'POST',
        body: JSON.stringify({
          clinicId: context.clinicId,
          procedure: normalizedProcedure,
        }),
      }
    );
    return normalizeProcedureMutationResult(payload?.data || {});
  };

  const deletePatientProcedure = async ({ clinicId, patient = {}, appointment = {}, externalId } = {}) => {
    const context = await resolveClinicalPatientContext({ clinicId, patient, appointment, allowCreate: false });
    const normalizedExternalId = String(externalId || '').trim();
    const payload = await requestInternalJson(
      `/internal/clinical/patients/${encodeURIComponent(context.patient.id)}/procedures/${encodeURIComponent(normalizedExternalId)}?clinicId=${encodeURIComponent(context.clinicId)}`,
      { method: 'DELETE' }
    );
    return payload?.data || { success: true };
  };

  const listPatientDocuments = async ({ clinicId, patient = {}, appointment = {}, includeArchived = false } = {}) => {
    const context = await resolveClinicalPatientContext({ clinicId, patient, appointment, allowCreate: false });
    const payload = await requestInternalJson(
      `/internal/clinical/patients/${encodeURIComponent(context.patient.id)}/documents?clinicId=${encodeURIComponent(context.clinicId)}&includeArchived=${includeArchived ? 'true' : 'false'}`
    );
    return payload?.data || [];
  };

  const upsertPatientDocumentMetadata = async ({ clinicId, patient = {}, appointment = {}, document = {} } = {}) => {
    const context = await resolveClinicalPatientContext({ clinicId, patient, appointment, allowCreate: true });
    const payload = await requestInternalJson(
      `/internal/clinical/patients/${encodeURIComponent(context.patient.id)}/documents`,
      {
        method: 'POST',
        body: JSON.stringify({
          clinicId: context.clinicId,
          document,
        }),
      }
    );
    return payload?.data || null;
  };

  const uploadPatientDocumentFile = async ({
    clinicId,
    patient = {},
    appointment = {},
    documentId,
    filePath,
    role = 'primary',
    fileName = '',
  } = {}) => {
    const context = await resolveClinicalPatientContext({ clinicId, patient, appointment, allowCreate: false });
    const normalizedDocumentId = String(documentId || '').trim();
    const normalizedFilePath = String(filePath || '').trim();
    if (!normalizedDocumentId || !normalizedFilePath) {
      const error = new Error('documentId and filePath are required.');
      error.code = 'CENTRAL_DOCUMENT_FILE_REQUIRED';
      throw error;
    }

    const buffer = await fs.promises.readFile(normalizedFilePath);
    const normalizedRole = String(role || 'primary').trim().toLowerCase() || 'primary';
    const normalizedFileName = path.basename(String(fileName || normalizedFilePath).trim());
    const payload = await requestInternalJson(
      `/internal/clinical/patients/${encodeURIComponent(context.patient.id)}/documents/${encodeURIComponent(normalizedDocumentId)}/file?clinicId=${encodeURIComponent(context.clinicId)}&role=${encodeURIComponent(normalizedRole)}`,
      {
        method: 'PUT',
        body: buffer,
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-file-name': encodeURIComponent(normalizedFileName),
        },
      }
    );
    return payload?.data || null;
  };

  const downloadPatientDocumentFile = async ({
    clinicId,
    patient = {},
    appointment = {},
    documentId,
    role = 'primary',
  } = {}) => {
    const context = await resolveClinicalPatientContext({ clinicId, patient, appointment, allowCreate: false });
    const normalizedDocumentId = String(documentId || '').trim();
    if (!normalizedDocumentId) {
      const error = new Error('documentId is required.');
      error.code = 'CENTRAL_DOCUMENT_FILE_REQUIRED';
      throw error;
    }
    const normalizedRole = String(role || 'primary').trim().toLowerCase() || 'primary';
    const response = await requestInternalBuffer(
      `/internal/clinical/patients/${encodeURIComponent(context.patient.id)}/documents/${encodeURIComponent(normalizedDocumentId)}/file?clinicId=${encodeURIComponent(context.clinicId)}&role=${encodeURIComponent(normalizedRole)}`,
      {
        method: 'GET',
      }
    );
    return {
      buffer: response.buffer,
      fileName: decodeURIComponent(String(response.headers.get('x-file-name') || '').trim() || ''),
      contentType: String(response.headers.get('content-type') || 'application/octet-stream').trim(),
      size: Number(response.headers.get('content-length') || response.buffer.length || 0),
    };
  };

  const listPatientAnamneses = async ({ clinicId, patient = {}, appointment = {} } = {}) => {
    const context = await resolveClinicalPatientContext({ clinicId, patient, appointment, allowCreate: false });
    const payload = await requestInternalJson(
      `/internal/clinical/patients/${encodeURIComponent(context.patient.id)}/anamneses?clinicId=${encodeURIComponent(context.clinicId)}`
    );
    return payload?.data || [];
  };

  const createPatientAnamnesis = async ({ clinicId, patient = {}, appointment = {}, data = {}, document = null } = {}) => {
    const context = await resolveClinicalPatientContext({ clinicId, patient, appointment, allowCreate: true });
    const payload = await requestInternalJson(
      `/internal/clinical/patients/${encodeURIComponent(context.patient.id)}/anamneses`,
      {
        method: 'POST',
        body: JSON.stringify({
          clinicId: context.clinicId,
          data,
          document,
        }),
      }
    );
    return payload?.data || null;
  };

  const createPatientClinicalNote = async ({ clinicId, patient = {}, appointment = {}, noteType = 'EVOLUCAO', content = {}, document = null } = {}) => {
    const context = await resolveClinicalPatientContext({ clinicId, patient, appointment, allowCreate: true });
    const payload = await requestInternalJson(
      `/internal/clinical/patients/${encodeURIComponent(context.patient.id)}/clinical-notes`,
      {
        method: 'POST',
        body: JSON.stringify({
          clinicId: context.clinicId,
          noteType,
          content,
          document,
        }),
      }
    );
    return payload?.data || null;
  };

  const updatePatientClinicalNote = async ({ clinicId, patient = {}, appointment = {}, sourceDocumentId, content = {}, document = null } = {}) => {
    const context = await resolveClinicalPatientContext({ clinicId, patient, appointment, allowCreate: true });
    const normalizedSourceDocumentId = String(sourceDocumentId || '').trim();
    const payload = await requestInternalJson(
      `/internal/clinical/patients/${encodeURIComponent(context.patient.id)}/clinical-notes/${encodeURIComponent(normalizedSourceDocumentId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          clinicId: context.clinicId,
          content,
          document,
        }),
      }
    );
    return payload?.data || null;
  };

  const listFinancialAccounts = async ({ clinicId, patient = {}, patientId = '' } = {}) => {
    const normalizedClinicId = String(clinicId || patient?.clinicId || '').trim();
    const normalizedPatientId = String(patientId || patient?.id || patient?.prontuario || '').trim();
    const context = normalizedPatientId
      ? { clinicId: normalizedClinicId, patient: { id: normalizedPatientId } }
      : { clinicId: normalizedClinicId, patient: null };
    const query = [
      `clinicId=${encodeURIComponent(context.clinicId)}`,
      context.patient?.id ? `patientId=${encodeURIComponent(context.patient.id)}` : '',
    ].filter(Boolean).join('&');
    const payload = await requestInternalJson(`/internal/financial/accounts?${query}`);
    return payload?.data || [];
  };

  const createFinancialAccount = async ({ clinicId, patient = {}, appointment = {}, account = {} } = {}) => {
    const normalizedClinicId = String(clinicId || appointment?.clinicId || patient?.clinicId || account?.clinicId || '').trim();
    const normalizedPatientId = String(account?.patientId || patient?.id || patient?.prontuario || '').trim();
    const paymentMethodDetail = String(
      account?.paymentMethodDetail
      || account?.paymentMethod
      || account?.method
      || account?.metodoPagamento
      || ''
    ).trim();
    const context = normalizedPatientId
      ? await resolveClinicalPatientContext({ clinicId: normalizedClinicId, patient, appointment, allowCreate: true })
      : { clinicId: normalizedClinicId, patient: null };
    const payload = await requestInternalJson('/internal/financial/accounts', {
      method: 'POST',
      body: JSON.stringify({
        clinicId: context.clinicId,
        patientId: context.patient?.id || '',
        appointmentId: cleanText(appointment?.id || appointment?.appointmentId || account?.appointmentId),
        ...account,
        paymentMethodDetail,
      }),
    });
    return payload?.data || null;
  };

  const updateFinancialAccount = async ({ clinicId, accountId, account = {} } = {}) => {
    const normalizedClinicId = String(clinicId || account?.clinicId || '').trim();
    const normalizedAccountId = String(accountId || account?.id || '').trim();
    const paymentMethodDetail = String(
      account?.paymentMethodDetail
      || account?.paymentMethod
      || account?.method
      || account?.metodoPagamento
      || ''
    ).trim();
    const payload = await requestInternalJson(`/internal/financial/accounts/${encodeURIComponent(normalizedAccountId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        clinicId: normalizedClinicId,
        ...account,
        paymentMethodDetail,
      }),
    });
    return payload?.data || null;
  };

  const deleteFinancialAccount = async ({ clinicId, accountId } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const normalizedAccountId = String(accountId || '').trim();
    const payload = await requestInternalJson(
      `/internal/financial/accounts/${encodeURIComponent(normalizedAccountId)}?clinicId=${encodeURIComponent(normalizedClinicId)}`,
      { method: 'DELETE' }
    );
    return payload?.data || { success: true };
  };

  const registerFinancialPayment = async ({ clinicId, accountId, installmentId = '', amount, method, paymentMethodDetail = '', paidAt, metadata = {} } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const normalizedAccountId = String(accountId || '').trim();
    const normalizedPaymentMethodDetail = String(paymentMethodDetail || method || '').trim();
    const payload = await requestInternalJson(`/internal/financial/accounts/${encodeURIComponent(normalizedAccountId)}/payments`, {
      method: 'POST',
      body: JSON.stringify({
        clinicId: normalizedClinicId,
        installmentId,
        amount,
        method,
        paymentMethodDetail: normalizedPaymentMethodDetail,
        paidAt,
        metadata,
      }),
    });
    return payload?.data || null;
  };

  const applyPatientFinancialPayment = async ({ clinicId, patientId, amount, method, paymentMethodDetail = '', paidAt, description = '', metadata = {} } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const normalizedPatientId = String(patientId || '').trim();
    const normalizedPaymentMethodDetail = String(paymentMethodDetail || method || '').trim();
    const payload = await requestInternalJson(`/internal/financial/patients/${encodeURIComponent(normalizedPatientId)}/payments`, {
      method: 'POST',
      body: JSON.stringify({
        clinicId: normalizedClinicId,
        amount,
        method,
        paymentMethod: method,
        paymentMethodDetail: normalizedPaymentMethodDetail,
        paidAt,
        description,
        metadata,
      }),
    });
    return payload?.data || null;
  };

  const getPatientFinancialSummary = async ({ clinicId, patient = {}, patientId = '' } = {}) => {
    const context = patientId
      ? { clinicId: String(clinicId || '').trim(), patient: { id: String(patientId || '').trim() } }
      : await resolveClinicalPatientContext({ clinicId, patient, allowCreate: false });
    const payload = await requestInternalJson(
      `/internal/financial/patients/${encodeURIComponent(context.patient.id)}/summary?clinicId=${encodeURIComponent(context.clinicId)}`
    );
    return payload?.data || null;
  };

  const getFinancialDashboard = async ({ clinicId } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const payload = await requestInternalJson(`/internal/financial/dashboard?clinicId=${encodeURIComponent(normalizedClinicId)}`);
    return payload?.data || null;
  };

  const getFinancialReport = async ({ clinicId, month, year } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const payload = await requestInternalJson(
      `/internal/financial/report?clinicId=${encodeURIComponent(normalizedClinicId)}&month=${encodeURIComponent(String(month || ''))}&year=${encodeURIComponent(String(year || ''))}`
    );
    return payload?.data || null;
  };

  const getMonthlyFinancialSummary = async ({ clinicId, month, year } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const payload = await requestInternalJson(
      `/internal/financial/summary?clinicId=${encodeURIComponent(normalizedClinicId)}&month=${encodeURIComponent(String(month || ''))}&year=${encodeURIComponent(String(year || ''))}`
    );
    return payload?.data || null;
  };

  const getCashFlowProjection = async ({ clinicId } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const payload = await requestInternalJson(`/internal/financial/projection?clinicId=${encodeURIComponent(normalizedClinicId)}`);
    return payload?.data || [];
  };

  const getOverdueFinancialAccounts = async ({ clinicId } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const payload = await requestInternalJson(`/internal/financial/overdue?clinicId=${encodeURIComponent(normalizedClinicId)}`);
    return payload?.data || [];
  };

  const getFinancialReminders = async ({ clinicId } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const payload = await requestInternalJson(`/internal/financial/reminders?clinicId=${encodeURIComponent(normalizedClinicId)}`);
    return payload?.data || null;
  };

  const closeFinancialMonth = async ({ clinicId, month, year } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const payload = await requestInternalJson('/internal/financial/snapshots/close', {
      method: 'POST',
      body: JSON.stringify({
        clinicId: normalizedClinicId,
        month,
        year,
      }),
    });
    return payload?.data || null;
  };

  const createLaboratoryOrder = async ({ clinicId, patient = {}, appointment = {}, order = {} } = {}) => {
    const context = await resolveClinicalPatientContext({ clinicId, patient, appointment, allowCreate: true });
    const payload = await requestInternalJson('/internal/laboratory/orders', {
      method: 'POST',
      body: JSON.stringify({
        clinicId: context.clinicId,
        patientId: context.patient.id,
        appointmentId: cleanText(appointment?.id || appointment?.appointmentId || order?.appointmentId),
        ...order,
      }),
    });
    return payload?.data || null;
  };

  const updateLaboratoryOrder = async ({ clinicId, orderId, order = {} } = {}) => {
    const normalizedClinicId = String(clinicId || order?.clinicId || '').trim();
    const normalizedOrderId = String(orderId || order?.id || '').trim();
    const payload = await requestInternalJson(`/internal/laboratory/orders/${encodeURIComponent(normalizedOrderId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        clinicId: normalizedClinicId,
        ...order,
      }),
    });
    return payload?.data || null;
  };

  const getLaboratoryOrderById = async ({ clinicId, orderId } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const normalizedOrderId = String(orderId || '').trim();
    const payload = await requestInternalJson(
      `/internal/laboratory/orders/${encodeURIComponent(normalizedOrderId)}?clinicId=${encodeURIComponent(normalizedClinicId)}`
    );
    return payload?.data || null;
  };

  const listLaboratoryOrdersByPatient = async ({ clinicId, patient = {}, patientId = '' } = {}) => {
    const context = patientId
      ? { clinicId: String(clinicId || '').trim(), patient: { id: String(patientId || '').trim() } }
      : await resolveClinicalPatientContext({ clinicId, patient, allowCreate: false });
    const payload = await requestInternalJson(
      `/internal/laboratory/orders?clinicId=${encodeURIComponent(context.clinicId)}&patientId=${encodeURIComponent(context.patient.id)}`
    );
    return payload?.data || [];
  };

  const listLaboratoryOrdersByClinic = async ({ clinicId } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const payload = await requestInternalJson(`/internal/laboratory/orders?clinicId=${encodeURIComponent(normalizedClinicId)}`);
    return payload?.data || [];
  };

  const updateLaboratoryOrderStatus = async ({ clinicId, orderId, status, notes = '' } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const normalizedOrderId = String(orderId || '').trim();
    const payload = await requestInternalJson(`/internal/laboratory/orders/${encodeURIComponent(normalizedOrderId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({
        clinicId: normalizedClinicId,
        status,
        notes,
      }),
    });
    return payload?.data || null;
  };

  const cancelLaboratoryOrder = async ({ clinicId, orderId, notes = '' } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const normalizedOrderId = String(orderId || '').trim();
    const payload = await requestInternalJson(`/internal/laboratory/orders/${encodeURIComponent(normalizedOrderId)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({
        clinicId: normalizedClinicId,
        notes,
      }),
    });
    return payload?.data || null;
  };

  const deleteLaboratoryOrder = async ({ clinicId, orderId } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const normalizedOrderId = String(orderId || '').trim();
    const payload = await requestInternalJson(
      `/internal/laboratory/orders/${encodeURIComponent(normalizedOrderId)}?clinicId=${encodeURIComponent(normalizedClinicId)}`,
      { method: 'DELETE' }
    );
    return payload?.data || { success: true };
  };

  const addLaboratoryOrderItem = async ({ clinicId, orderId, item = {} } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const normalizedOrderId = String(orderId || '').trim();
    const payload = await requestInternalJson(`/internal/laboratory/orders/${encodeURIComponent(normalizedOrderId)}/items`, {
      method: 'POST',
      body: JSON.stringify({
        clinicId: normalizedClinicId,
        item,
      }),
    });
    return payload?.data || null;
  };

  const updateLaboratoryOrderItem = async ({ clinicId, orderId, itemId, item = {} } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const normalizedOrderId = String(orderId || '').trim();
    const normalizedItemId = String(itemId || item?.id || '').trim();
    const payload = await requestInternalJson(
      `/internal/laboratory/orders/${encodeURIComponent(normalizedOrderId)}/items/${encodeURIComponent(normalizedItemId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          clinicId: normalizedClinicId,
          item,
        }),
      }
    );
    return payload?.data || null;
  };

  const deleteLaboratoryOrderItem = async ({ clinicId, orderId, itemId } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const normalizedOrderId = String(orderId || '').trim();
    const normalizedItemId = String(itemId || '').trim();
    const payload = await requestInternalJson(
      `/internal/laboratory/orders/${encodeURIComponent(normalizedOrderId)}/items/${encodeURIComponent(normalizedItemId)}?clinicId=${encodeURIComponent(normalizedClinicId)}`,
      { method: 'DELETE' }
    );
    return payload?.data || { success: true };
  };

  const ensureUserSessionToken = () => {
    const token = getUserSessionToken();
    if (!token) {
      throw new Error('Authenticated session token is required.');
    }
    return token;
  };

  const listStockItems = async ({ clinicId, includeInactive = false } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const query = new URLSearchParams();
    if (normalizedClinicId) query.set('clinicId', normalizedClinicId);
    if (includeInactive === true) query.set('includeInactive', 'true');
    const token = ensureUserSessionToken();
    const payload = await requestJsonWithUserToken(`/stock/items${query.toString() ? `?${query.toString()}` : ''}`, token, {
      method: 'GET',
    });
    return payload?.data || [];
  };

  const createStockItem = async ({ clinicId, item = {} } = {}) => {
    const token = ensureUserSessionToken();
    const payload = await requestJsonWithUserToken('/stock/items', token, {
      method: 'POST',
      body: JSON.stringify({
        clinicId: String(clinicId || item?.clinicId || '').trim(),
        ...item,
      }),
    });
    return payload?.data || null;
  };

  const updateStockItem = async ({ clinicId, itemId, item = {} } = {}) => {
    const normalizedItemId = String(itemId || item?.id || '').trim();
    const token = ensureUserSessionToken();
    const payload = await requestJsonWithUserToken(`/stock/items/${encodeURIComponent(normalizedItemId)}`, token, {
      method: 'PATCH',
      body: JSON.stringify({
        clinicId: String(clinicId || item?.clinicId || '').trim(),
        ...item,
      }),
    });
    return payload?.data || null;
  };

  const listStockMovements = async ({ clinicId, itemId, limit = 20 } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const normalizedItemId = String(itemId || '').trim();
    const query = new URLSearchParams();
    if (normalizedClinicId) query.set('clinicId', normalizedClinicId);
    if (limit !== undefined && limit !== null && limit !== '') query.set('limit', String(limit));
    const token = ensureUserSessionToken();
    const payload = await requestJsonWithUserToken(`/stock/items/${encodeURIComponent(normalizedItemId)}/movements${query.toString() ? `?${query.toString()}` : ''}`, token, {
      method: 'GET',
    });
    return payload?.data || [];
  };

  const createStockMovement = async ({ clinicId, itemId, type, quantity, reason = '' } = {}) => {
    const normalizedItemId = String(itemId || '').trim();
    const token = ensureUserSessionToken();
    const payload = await requestJsonWithUserToken(`/stock/items/${encodeURIComponent(normalizedItemId)}/movements`, token, {
      method: 'POST',
      body: JSON.stringify({
        clinicId: String(clinicId || '').trim(),
        type,
        quantity,
        reason,
      }),
    });
    return payload?.data || null;
  };

  const adjustStockQuantity = async ({ clinicId, itemId, currentQuantity, notes = '' } = {}) => createStockMovement({
    clinicId,
    itemId,
    type: 'ajuste',
    quantity: currentQuantity,
    reason: notes,
  });

  const deactivateStockItem = async ({ clinicId, itemId } = {}) => {
    const normalizedItemId = String(itemId || '').trim();
    const token = ensureUserSessionToken();
    const payload = await requestJsonWithUserToken(`/stock/items/${encodeURIComponent(normalizedItemId)}`, token, {
      method: 'DELETE',
      body: JSON.stringify({
        clinicId: String(clinicId || '').trim(),
      }),
    });
    return payload?.data || null;
  };

  const getLaboratoryDashboardSummary = async ({ clinicId } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const payload = await requestInternalJson(`/internal/laboratory/dashboard?clinicId=${encodeURIComponent(normalizedClinicId)}`);
    return payload?.data || null;
  };

  const listFaturamento = async ({ clinicId, period = 'mes' } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const payload = await requestInternalJson(
      `/internal/financial/faturamento?clinicId=${encodeURIComponent(normalizedClinicId)}&period=${encodeURIComponent(String(period || 'mes').trim())}`
    );
    return payload?.data || [];
  };

  const listPatientPlans = async ({ clinicId, patient = {}, patientId = '' } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const normalizedPatientId = String(patientId || patient?.id || patient?.patientId || patient?.prontuario || '').trim();
    if (!normalizedClinicId) {
      throw new Error('clinicId is required.');
    }
    const query = new URLSearchParams({ clinicId: normalizedClinicId });
    if (normalizedPatientId) {
      query.set('patientId', normalizedPatientId);
    }
    const payload = await requestInternalJson(`/internal/financial/plans?${query.toString()}`);
    return payload?.data || [];
  };

  const getPatientPlansDashboard = async ({ clinicId } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    if (!normalizedClinicId) {
      throw new Error('clinicId is required.');
    }
    const payload = await requestInternalJson(
      `/internal/financial/plans/dashboard?clinicId=${encodeURIComponent(normalizedClinicId)}`
    );
    return payload?.data || {};
  };

  const createPatientPlan = async ({ clinicId, patient = {}, appointment = {}, plan = {} } = {}) => {
    const context = await resolveClinicalPatientContext({ clinicId, patient, appointment, allowCreate: true });
    const payload = await requestInternalJson('/internal/financial/plans', {
      method: 'POST',
      body: JSON.stringify({
        clinicId: context.clinicId,
        patientId: context.patient.id,
        ...plan,
      }),
    });
    return payload?.data || null;
  };

  const getPatientPlanById = async ({ clinicId, planId } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const normalizedPlanId = String(planId || '').trim();
    const payload = await requestInternalJson(
      `/internal/financial/plans/${encodeURIComponent(normalizedPlanId)}?clinicId=${encodeURIComponent(normalizedClinicId)}`
    );
    return payload?.data || null;
  };

  const updatePatientPlan = async ({ clinicId, planId, plan = {} } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const normalizedPlanId = String(planId || '').trim();
    const payload = await requestInternalJson(`/internal/financial/plans/${encodeURIComponent(normalizedPlanId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        clinicId: normalizedClinicId,
        ...plan,
      }),
    });
    return payload?.data || null;
  };

  const deletePatientPlan = async ({ clinicId, planId } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const normalizedPlanId = String(planId || '').trim();
    const payload = await requestInternalJson(
      `/internal/financial/plans/${encodeURIComponent(normalizedPlanId)}?clinicId=${encodeURIComponent(normalizedClinicId)}`,
      { method: 'DELETE' }
    );
    return payload?.data || { success: true };
  };

  const listPlanMessageHistory = async ({ clinicId, planId } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const normalizedPlanId = String(planId || '').trim();
    const payload = await requestInternalJson(
      `/internal/financial/plans/${encodeURIComponent(normalizedPlanId)}/messages?clinicId=${encodeURIComponent(normalizedClinicId)}`
    );
    return payload?.data || { items: [] };
  };

  const listPlanMessageSuggestions = async ({ clinicId, planId, dueSoonDays } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const normalizedPlanId = String(planId || '').trim();
    const query = dueSoonDays
      ? `?clinicId=${encodeURIComponent(normalizedClinicId)}&dueSoonDays=${encodeURIComponent(String(dueSoonDays).trim())}`
      : `?clinicId=${encodeURIComponent(normalizedClinicId)}`;
    const payload = await requestInternalJson(
      `/internal/financial/plans/${encodeURIComponent(normalizedPlanId)}/messages/suggestions${query}`
    );
    return payload?.data || { items: [] };
  };

  const sendPlanMessage = async ({ clinicId, planId, installmentId, eventType, manualResend = false, approvedByDentist = false } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const normalizedPlanId = String(planId || '').trim();
    const payload = await requestInternalJson(`/internal/financial/plans/${encodeURIComponent(normalizedPlanId)}/messages/send`, {
      method: 'POST',
      body: JSON.stringify({
        clinicId: normalizedClinicId,
        installmentId: String(installmentId || '').trim(),
        eventType: String(eventType || '').trim(),
        manualResend: manualResend === true,
        approvedByDentist: approvedByDentist === true,
      }),
    });
    return payload?.data || null;
  };

  const resendPlanMessage = async ({ clinicId, planMessageId } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const normalizedPlanMessageId = String(planMessageId || '').trim();
    const payload = await requestInternalJson(`/internal/financial/plan-messages/${encodeURIComponent(normalizedPlanMessageId)}/resend`, {
      method: 'POST',
      body: JSON.stringify({
        clinicId: normalizedClinicId,
      }),
    });
    return payload?.data || null;
  };

  return {
    config,
    isEnabled,
    login,
    authLogin,
    authSignup,
    authConfirmEmailVerification,
    authResendEmailVerification,
    authRequestPasswordReset,
    authValidatePasswordResetCode,
    authConfirmPasswordReset,
    authMe,
    authLogout,
    authChangePassword,
    listUsersWithToken,
    listNotificationEventsWithToken,
    listNotificationEvents,
    createNotificationEvent,
    getClinicOperationalSettingsWithToken,
    updateClinicOperationalSettingsWithToken,
    getClinicOperationalSettings,
    updateClinicOperationalSettings,
    getRelationshipOverview,
    getClinicProfileWithToken,
    updateClinicProfileWithToken,
    listClinicCampaignsWithToken,
    listCampaignTemplatesWithToken,
    replaceClinicCampaignsWithToken,
    createClinicCampaignWithToken,
    updateClinicCampaignWithToken,
    deleteClinicCampaignWithToken,
    getCampaignDashboardWithToken,
    resolveCampaignAudienceWithToken,
    createCampaignBatchWithToken,
    updateCampaignDispatchWithToken,
    listCampaignDispatchLogsWithToken,
    getCampaignResultWithToken,
    createUserWithToken,
    updateUserWithToken,
    resetUserPasswordWithToken,
    deleteUserWithToken,
    listClinicsPublic,
    createClinicBootstrap,
    impersonateClinicAdmin,
    getPatients,
    getPatientById,
    searchPatients,
    createPatient,
    updatePatient,
    deletePatient,
    getAppointments,
    createAppointment,
    getAppointmentById,
    ensureCentralPatient,
    ensureAppointmentTransportId,
    resolveAppointmentTransportId,
    sendAppointmentConfirmation,
    resetClinicWhatsappReplyContexts,
    sendAppointmentReminder,
    updateAppointmentStatus,
    updateAppointmentAttendance,
    updateAppointment,
    deleteAppointment,
    getPatientClinicalRecord,
    listPatientProcedures,
    upsertPatientProcedure,
    deletePatientProcedure,
    listPatientDocuments,
    upsertPatientDocumentMetadata,
    uploadPatientDocumentFile,
    downloadPatientDocumentFile,
    listPatientAnamneses,
    createPatientAnamnesis,
    createPatientClinicalNote,
    updatePatientClinicalNote,
    listFinancialAccounts,
    createFinancialAccount,
    updateFinancialAccount,
    deleteFinancialAccount,
    registerFinancialPayment,
    applyPatientFinancialPayment,
    getPatientFinancialSummary,
    getFinancialDashboard,
    getFinancialReport,
    getMonthlyFinancialSummary,
    getCashFlowProjection,
    getOverdueFinancialAccounts,
    getFinancialReminders,
    closeFinancialMonth,
    createLaboratoryOrder,
    updateLaboratoryOrder,
    getLaboratoryOrderById,
    listLaboratoryOrdersByPatient,
    listLaboratoryOrdersByClinic,
    updateLaboratoryOrderStatus,
    cancelLaboratoryOrder,
    deleteLaboratoryOrder,
    addLaboratoryOrderItem,
    updateLaboratoryOrderItem,
    deleteLaboratoryOrderItem,
    getLaboratoryDashboardSummary,
    listStockItems,
    listStockMovements,
    createStockItem,
    updateStockItem,
    createStockMovement,
    adjustStockQuantity,
    deactivateStockItem,
    listFaturamento,
    listPatientPlans,
    getPatientPlansDashboard,
    createPatientPlan,
    getPatientPlanById,
    updatePatientPlan,
    deletePatientPlan,
    listPlanMessageHistory,
    listPlanMessageSuggestions,
    sendPlanMessage,
    resendPlanMessage,
    supportsAppointmentStatus,
  };
};

module.exports = { createCentralBackendAdapter };
