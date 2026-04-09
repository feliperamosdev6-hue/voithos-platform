const fs = require('fs');
const path = require('path');

const DEFAULT_ENGINE_PORT = 8099;
const DEFAULT_ENGINE_BASE_URL = `http://127.0.0.1:${DEFAULT_ENGINE_PORT}`;
const DEFAULT_REQUEST_TIMEOUT_MS = 8000;
const DEFAULT_STATUS_TIMEOUT_MS = 12000;
const DEFAULT_QR_TIMEOUT_MS = 45000;
const DEFAULT_HEALTH_TIMEOUT_MS = 2500;
const ENGINE_HEALTH_CACHE_TTL_MS = 5000;
const INSTANCE_CACHE_TTL_MS = 10000;
const QR_RETRY_DELAYS_MS = [1200, 2200, 3500];

const parseEnvFile = (filePath) => {
  try {
    if (!fs.existsSync(filePath)) return {};
    const content = fs.readFileSync(filePath, 'utf8');
    return content.split(/\r?\n/).reduce((acc, line) => {
      const trimmed = String(line || '').trim();
      if (!trimmed || trimmed.startsWith('#')) return acc;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex <= 0) return acc;
      const key = trimmed.slice(0, eqIndex).trim();
      const rawValue = trimmed.slice(eqIndex + 1).trim();
      const unquoted = rawValue.replace(/^['"]|['"]$/g, '');
      acc[key] = unquoted;
      return acc;
    }, {});
  } catch (_error) {
    return {};
  }
};

const normalizeBaseUrl = (value) => String(value || '').trim().replace(/\/+$/, '');

const createTaggedError = (message, code, details = {}) => {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
};

const classifyEngineMessage = (message, baseUrl) => {
  const text = String(message || '').trim();
  const normalized = text.toLowerCase();

  if (normalized.includes('invalid internal token')) {
    return createTaggedError('Token interno do WhatsApp Engine invalido. Verifique a configuracao do ambiente.', 'ENGINE_INVALID_TOKEN', { baseUrl });
  }

  if (normalized.includes('no whatsapp instance for this clinic')) {
    return createTaggedError('Esta clinica nao possui uma instancia WhatsApp conectada no engine. Abra "Minha clinica" e conecte o WhatsApp novamente.', 'ENGINE_INSTANCE_MISSING', { baseUrl });
  }

  if (normalized.includes("can't reach database server") || normalized.includes('prismaclientinitializationerror')) {
    return createTaggedError('WhatsApp Engine sem acesso ao banco de dados. Inicie o ambiente completo do engine antes de conectar a clinica.', 'ENGINE_DATABASE_UNAVAILABLE', { baseUrl });
  }

  if (normalized.includes('connection closed') || normalized.includes('precondition required') || normalized.includes('websocket error')) {
    return createTaggedError('WhatsApp Engine esta reconectando a instancia do WhatsApp. Aguarde alguns segundos e tente novamente.', 'ENGINE_RECONNECTING', { baseUrl });
  }

  if (normalized.includes('econnrefused') || normalized.includes('fetch failed') || normalized.includes('nao foi possivel conectar')) {
    return createTaggedError(`WhatsApp Engine indisponivel em ${baseUrl}. Inicie o engine antes de conectar a clinica.`, 'ENGINE_UNAVAILABLE', { baseUrl });
  }

  return null;
};

const resolveEngineConfig = () => {
  const rootEnvPath = path.join(__dirname, '..', '.env');
  const rootEnv = parseEnvFile(rootEnvPath);
  const engineEnvPath = path.join(__dirname, '..', 'whatsapp-engine', '.env');
  const engineEnv = parseEnvFile(engineEnvPath);
  const port = Number(
    process.env.WHATSAPP_ENGINE_PORT
      || process.env.PORT
      || rootEnv.WHATSAPP_ENGINE_PORT
      || engineEnv.PORT
      || DEFAULT_ENGINE_PORT,
  );
  const baseUrl = normalizeBaseUrl(
    process.env.WHATSAPP_ENGINE_BASE_URL
      || process.env.WHATSAPP_NG_BASE_URL
      || rootEnv.WHATSAPP_ENGINE_BASE_URL
      || rootEnv.WHATSAPP_NG_BASE_URL
      || engineEnv.WHATSAPP_ENGINE_BASE_URL
      || `http://127.0.0.1:${Number.isFinite(port) ? port : DEFAULT_ENGINE_PORT}`,
  ) || DEFAULT_ENGINE_BASE_URL;
  const serviceToken = String(
    process.env.WHATSAPP_NG_SERVICE_TOKEN
      || process.env.WHATSAPP_ENGINE_SERVICE_TOKEN
      || process.env.SERVICE_INTERNAL_API_TOKEN
      || process.env.WHATSAPP_ENGINE_INTERNAL_TOKEN
      || process.env.INTERNAL_API_TOKEN
      || rootEnv.WHATSAPP_NG_SERVICE_TOKEN
      || rootEnv.WHATSAPP_ENGINE_SERVICE_TOKEN
      || rootEnv.SERVICE_INTERNAL_API_TOKEN
      || engineEnv.SERVICE_INTERNAL_API_TOKEN
      || engineEnv.INTERNAL_API_TOKEN
      || '',
  ).trim();

  return { baseUrl, serviceToken };
};

const formatEngineError = (status, payload, baseUrl) => {
  const message = payload?.error?.message || payload?.message || `Erro ${status} ao comunicar com o WhatsApp Engine.`;
  return classifyEngineMessage(message, baseUrl) || createTaggedError(message, 'ENGINE_REQUEST_FAILED', { status, baseUrl });
};

const createWhatsAppEngineService = () => {
  const instanceCache = new Map();
  let healthCache = {
    value: null,
    expiresAt: 0,
  };

  const cacheKey = (clinicId) => String(clinicId || '').trim().toLowerCase();
  const readCachedInstance = (clinicId) => {
    const key = cacheKey(clinicId);
    if (!key) return null;
    const cached = instanceCache.get(key);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
      instanceCache.delete(key);
      return null;
    }
    return cached.instance || null;
  };
  const writeCachedInstance = (clinicId, instance) => {
    const key = cacheKey(clinicId);
    if (!key || !instance?.id) return;
    instanceCache.set(key, {
      instance,
      expiresAt: Date.now() + INSTANCE_CACHE_TTL_MS,
    });
  };
  const clearCachedInstance = (clinicId) => {
    const key = cacheKey(clinicId);
    if (!key) return;
    instanceCache.delete(key);
  };
  const isNotFoundError = (error) => {
    const status = Number(error?.details?.status || error?.status || 0);
    const message = String(error?.message || '').trim().toLowerCase();
    return status === 404 || message.includes('instance not found');
  };
  const isRetriableLookupError = (error) => {
    const code = String(error?.code || '').trim().toUpperCase();
    return code === 'ENGINE_TIMEOUT'
      || code === 'ENGINE_UNAVAILABLE'
      || code === 'ENGINE_RECONNECTING';
  };
  const buildConnectionFromStatus = ({ clinicId, displayName, status = {}, engineHealth, stale = false, staleReason = '' } = {}) => ({
    available: true,
    exists: true,
    instanceId: status?.id || status?.instanceId || '',
    clinicId: status?.clinicId || clinicId,
    status: status?.operationalStatus || status?.status || 'CREATED',
    operationalStatus: status?.operationalStatus || status?.status || 'CREATED',
    persistedStatus: status?.persistedStatus || '',
    phoneNumber: status?.phoneNumber || '',
    displayName: status?.displayName || displayName || '',
    lastSeenAt: status?.lastSeenAt || null,
    connectedInRuntime: status?.connectedInRuntime === true,
    runtimeSocketState: status?.runtimeSocketState || 'MISSING',
    createdAt: status?.createdAt || null,
    updatedAt: status?.updatedAt || null,
    reconnectAttempt: Number(status?.reconnectAttempt || 0),
    reconnectScheduled: status?.reconnectScheduled === true,
    reconnectNextAttemptAt: status?.reconnectNextAttemptAt || null,
    reconnectDelayMs: Number(status?.reconnectDelayMs || 0),
    coolingDown: status?.coolingDown === true,
    qrAvailable: status?.qrAvailable === true,
    qrPending: status?.qrPending === true,
    qrUpdatedAt: status?.qrUpdatedAt || null,
    pairingCodeAvailable: status?.pairingCodeAvailable === true,
    runtimeDegraded: status?.runtimeDegraded === true,
    stale,
    staleReason: staleReason || '',
    engineHealth,
  });
  const readCachedHealth = () => {
    if (!healthCache.value || healthCache.expiresAt <= Date.now()) {
      healthCache = { value: null, expiresAt: 0 };
      return null;
    }
    return healthCache.value;
  };
  const writeCachedHealth = (value, ttlMs = ENGINE_HEALTH_CACHE_TTL_MS) => {
    healthCache = {
      value,
      expiresAt: Date.now() + Math.max(1000, Number(ttlMs) || ENGINE_HEALTH_CACHE_TTL_MS),
    };
    return value;
  };
  const buildHealthPayload = (partial = {}) => {
    const { baseUrl } = resolveEngineConfig();
    return {
      baseUrl,
      available: false,
      ready: false,
      status: 'offline',
      bootMode: null,
      startedAt: null,
      completedAt: null,
      runtimeRecoveryFinishedAt: null,
      runtimeRecoveryFailedAt: null,
      timestamp: new Date().toISOString(),
      errorCode: '',
      message: '',
      ...partial,
    };
  };
  const getEngineHealth = async ({ force = false } = {}) => {
    if (!force) {
      const cached = readCachedHealth();
      if (cached) return cached;
    }

    const { baseUrl, serviceToken } = resolveEngineConfig();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_HEALTH_TIMEOUT_MS);

    try {
      const response = await fetch(`${baseUrl}/health`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...(serviceToken ? { 'x-service-token': serviceToken } : {}),
        },
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      const data = payload?.data || {};
      const health = buildHealthPayload({
        baseUrl,
        available: response.ok,
        ready: data?.health_ready === true,
        status: String(data?.status || (response.ok ? 'ok' : 'starting')).trim().toLowerCase() || 'offline',
        bootMode: data?.boot_mode || null,
        startedAt: data?.startedAt || null,
        completedAt: data?.completedAt || null,
        runtimeRecoveryFinishedAt: data?.runtimeRecoveryFinishedAt || null,
        runtimeRecoveryFailedAt: data?.runtimeRecoveryFailedAt || null,
        timestamp: data?.timestamp || new Date().toISOString(),
        errorCode: response.ok ? '' : 'ENGINE_STARTING',
        message: response.ok
          ? 'WhatsApp Engine online e pronto.'
          : 'WhatsApp Engine iniciando. Aguarde alguns segundos para concluir a carga das instancias.',
      });
      return writeCachedHealth(health, health.ready ? ENGINE_HEALTH_CACHE_TTL_MS : 2500);
    } catch (error) {
      const detail = error?.message || String(error);
      const classified = error?.name === 'AbortError' || /aborted/i.test(detail)
        ? createTaggedError(
            `WhatsApp Engine demorou demais para responder em ${baseUrl}.`,
            'ENGINE_TIMEOUT',
            { baseUrl, timeoutMs: DEFAULT_HEALTH_TIMEOUT_MS, pathname: '/health' },
          )
        : (classifyEngineMessage(detail, baseUrl)
          || createTaggedError(`Nao foi possivel conectar ao WhatsApp Engine em ${baseUrl}. ${detail}`, 'ENGINE_UNAVAILABLE', { baseUrl }));
      return writeCachedHealth(buildHealthPayload({
        baseUrl,
        status: classified.code === 'ENGINE_TIMEOUT' ? 'timeout' : 'offline',
        errorCode: classified.code || 'ENGINE_UNAVAILABLE',
        message: classified.message,
      }), 2500);
    } finally {
      clearTimeout(timeout);
    }
  };
  const ensureEngineReady = async () => {
    const health = await getEngineHealth();
    if (health?.ready === true) return health;
    throw createTaggedError(
      health?.message || 'WhatsApp Engine indisponivel.',
      health?.errorCode || 'ENGINE_UNAVAILABLE',
      { baseUrl: health?.baseUrl, health },
    );
  };

  const request = async (pathname, options = {}) => {
    const { baseUrl, serviceToken } = resolveEngineConfig();
    const url = `${baseUrl}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
    const controller = new AbortController();
    const timeoutMs = Math.max(1000, Number(options.timeoutMs) || DEFAULT_REQUEST_TIMEOUT_MS);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const headers = {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(serviceToken ? { 'x-service-token': serviceToken } : {}),
      ...(options.headers || {}),
    };

    let response;
    try {
      response = await fetch(url, {
        method: options.method || 'GET',
        headers,
        signal: controller.signal,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    } catch (error) {
      const detail = error?.message || String(error);
      if (error?.name === 'AbortError' || /aborted/i.test(detail)) {
        throw createTaggedError(
          `WhatsApp Engine demorou demais para responder em ${baseUrl}. Tente novamente em alguns segundos para gerar o QR Code.`,
          'ENGINE_TIMEOUT',
          { baseUrl, timeoutMs, pathname },
        );
      }
      throw classifyEngineMessage(detail, baseUrl)
        || createTaggedError(`Nao foi possivel conectar ao WhatsApp Engine em ${baseUrl}. ${detail}`, 'ENGINE_UNAVAILABLE', { baseUrl });
    } finally {
      clearTimeout(timeout);
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.success === false) {
      throw formatEngineError(response.status, payload, baseUrl);
    }

    return payload?.data ?? payload;
  };

  const findInstanceByClinicId = async (clinicId, { allowStale = false } = {}) => {
    try {
      const status = await request(`/instances/by-clinic/${encodeURIComponent(String(clinicId || '').trim())}/status`, {
        timeoutMs: DEFAULT_STATUS_TIMEOUT_MS,
      });
      if (status?.clinicId && (status?.id || status?.instanceId)) {
        writeCachedInstance(clinicId, status);
      }
      return status || null;
    } catch (error) {
      if (isNotFoundError(error)) {
        clearCachedInstance(clinicId);
        return null;
      }
      if (allowStale && isRetriableLookupError(error)) {
        const cached = readCachedInstance(clinicId);
        if (cached?.id || cached?.instanceId) {
          return {
            ...cached,
            stale: true,
            staleReason: error.message || 'status lookup failed',
          };
        }
      }
      throw error;
    }
  };

  const ensureInstance = async ({ clinicId, displayName }) => {
    const existing = await findInstanceByClinicId(clinicId);
    if (existing) return existing;

    const created = await request('/instances', {
      method: 'POST',
      body: {
        clinicId,
        displayName: String(displayName || '').trim() || undefined,
      },
    });

    const instance = {
      id: created?.id,
      clinicId: created?.clinicId || clinicId,
      status: created?.status || 'CREATED',
      createdAt: created?.createdAt || null,
      updatedAt: created?.updatedAt || null,
    };
    writeCachedInstance(clinicId, instance);
    return instance;
  };

  const readQrSnapshot = async (instanceId, fallback = {}) => {
    const qr = await request(`/instances/${encodeURIComponent(instanceId)}/qr`, { timeoutMs: DEFAULT_QR_TIMEOUT_MS }).catch((error) => {
      const code = String(error?.code || '').trim().toUpperCase();
      if (code !== 'ENGINE_RECONNECTING') throw error;
      return {
        qr: null,
        qrDataUrl: null,
        pairingCode: null,
        qrUpdatedAt: null,
        status: fallback.operationalStatus || fallback.status || 'CONNECTING',
        operationalStatus: fallback.operationalStatus || fallback.status || 'CONNECTING',
        persistedStatus: fallback.persistedStatus || '',
        connectedInRuntime: false,
        runtimeSocketState: fallback.runtimeSocketState || 'CONNECTING',
        qrPending: true,
      };
    });
    return {
      qr: qr?.qr || null,
      qrDataUrl: qr?.qrDataUrl || null,
      pairingCode: qr?.pairingCode || null,
      qrUpdatedAt: qr?.qrUpdatedAt || null,
      status: qr?.operationalStatus || qr?.status || fallback.status || 'CONNECTING',
      operationalStatus: qr?.operationalStatus || qr?.status || fallback.operationalStatus || fallback.status || 'CONNECTING',
      persistedStatus: qr?.persistedStatus || fallback.persistedStatus || '',
      connectedInRuntime: qr?.connectedInRuntime === true || fallback.connectedInRuntime === true,
      runtimeSocketState: qr?.runtimeSocketState || fallback.runtimeSocketState || 'MISSING',
      qrPending: qr?.qrPending === true,
    };
  };

  const getClinicConnection = async ({ clinicId, displayName, createIfMissing = false, includeQr = false } = {}) => {
    if (!String(clinicId || '').trim()) {
      throw new Error('clinicId obrigatorio para consultar o WhatsApp da clinica.');
    }
    const engineHealth = await ensureEngineReady();

    if (createIfMissing) {
      await ensureInstance({ clinicId, displayName });
    }
    const instance = await findInstanceByClinicId(clinicId, { allowStale: true });

    if (!instance?.id && !instance?.instanceId) {
      clearCachedInstance(clinicId);
      return {
        available: true,
        exists: false,
        clinicId,
        status: 'NOT_CONFIGURED',
        connectedInRuntime: false,
        engineHealth,
      };
    }

    const connection = buildConnectionFromStatus({
      clinicId,
      displayName,
      status: instance,
      engineHealth,
      stale: instance?.stale === true,
      staleReason: String(instance?.staleReason || '').trim(),
    });
    writeCachedInstance(connection.clinicId, {
      ...instance,
      id: connection.instanceId,
      clinicId: connection.clinicId,
      status: connection.status,
      updatedAt: connection.updatedAt,
      createdAt: connection.createdAt,
    });

    const normalizedStatus = String(connection.status || '').trim().toUpperCase();
    if (!includeQr || normalizedStatus === 'CONNECTED' || connection.stale === true) {
      return connection;
    }

    const qrSnapshot = await readQrSnapshot(connection.instanceId, connection).catch(() => null);
    if (!qrSnapshot) return connection;
    return {
      ...connection,
      ...qrSnapshot,
    };
  };

  const getClinicQr = async ({ clinicId, displayName } = {}) => {
    await ensureEngineReady();
    const connection = await getClinicConnection({ clinicId, displayName, createIfMissing: true, includeQr: false });
    if (!connection?.instanceId) {
      throw new Error('Nao foi possivel preparar a instancia da clinica.');
    }

    let qr = await readQrSnapshot(connection.instanceId, connection);
    for (const delayMs of QR_RETRY_DELAYS_MS) {
      if (qr?.qrDataUrl || String(qr?.status || '').trim().toUpperCase() === 'CONNECTED') break;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      qr = await readQrSnapshot(connection.instanceId, connection).catch(() => qr);
    }
    return {
      ...connection,
      qr: qr?.qr || null,
      qrDataUrl: qr?.qrDataUrl || null,
      pairingCode: qr?.pairingCode || null,
      qrUpdatedAt: qr?.qrUpdatedAt || null,
      status: qr?.status || connection.status,
      runtimeSocketState: qr?.runtimeSocketState || connection.runtimeSocketState || 'MISSING',
      qrPending: qr?.qrPending === true,
    };
  };

  const sendClinicText = async ({ clinicId, phone, message, appointmentId } = {}) => {
    if (!String(clinicId || '').trim()) {
      throw createTaggedError('clinicId obrigatorio para enviar mensagem pelo WhatsApp Engine.', 'ENGINE_INVALID_CLINIC');
    }
    const toPhone = String(phone || '').trim();
    const body = String(message || '').trim();
    if (!toPhone) throw createTaggedError('Telefone invalido para envio.', 'ENGINE_INVALID_PHONE');
    if (!body) throw createTaggedError('Mensagem vazia.', 'ENGINE_INVALID_BODY');

    await ensureEngineReady();
    const connection = await getClinicConnection({ clinicId, createIfMissing: false });
    if (!connection?.exists) {
      throw createTaggedError('A clinica ainda nao conectou um WhatsApp no sistema.', 'ENGINE_INSTANCE_MISSING', { clinicId });
    }

    if (String(connection.status || '').trim().toUpperCase() !== 'CONNECTED') {
      throw createTaggedError('O WhatsApp da clinica ainda nao esta conectado. Gere e escaneie o QR Code antes de enviar mensagens.', 'ENGINE_INSTANCE_NOT_CONNECTED', {
        clinicId,
        instanceId: connection.instanceId,
        status: connection.status,
      });
    }

    return request('/messages/send', {
      method: 'POST',
      body: {
        clinicId,
        toPhone,
        body,
        appointmentId: String(appointmentId || '').trim() || undefined,
      },
    });
  };

  const disconnectClinicInstance = async ({ clinicId } = {}) => {
    if (!String(clinicId || '').trim()) {
      throw createTaggedError('clinicId obrigatorio para desconectar o WhatsApp da clinica.', 'ENGINE_INVALID_CLINIC');
    }

    await ensureEngineReady();
    const instance = await findInstanceByClinicId(clinicId);
    if (!instance?.id) {
      clearCachedInstance(clinicId);
      return {
        clinicId,
        exists: false,
        disconnected: false,
      };
    }

    const result = await request(`/instances/${encodeURIComponent(instance.id)}/disconnect`, {
      method: 'POST',
      timeoutMs: DEFAULT_QR_TIMEOUT_MS,
    });
    clearCachedInstance(clinicId);
    return {
      clinicId,
      instanceId: instance.id,
      disconnected: true,
      ...result,
    };
  };

  const deleteClinicInstance = async ({ clinicId } = {}) => {
    if (!String(clinicId || '').trim()) {
      throw createTaggedError('clinicId obrigatorio para excluir a instancia do WhatsApp da clinica.', 'ENGINE_INVALID_CLINIC');
    }

    await ensureEngineReady();
    const instance = await findInstanceByClinicId(clinicId);
    if (!instance?.id) {
      clearCachedInstance(clinicId);
      return {
        clinicId,
        exists: false,
        deleted: false,
      };
    }

    const result = await request(`/instances/${encodeURIComponent(instance.id)}`, {
      method: 'DELETE',
      timeoutMs: DEFAULT_QR_TIMEOUT_MS,
    });
    clearCachedInstance(clinicId);
    return {
      clinicId,
      instanceId: instance.id,
      deleted: true,
      ...result,
    };
  };

  return {
    getEngineHealth,
    getClinicConnection: (payload) => getClinicConnection({ ...payload, includeQr: true }),
    refreshClinicConnection: (payload) => getClinicConnection({ ...payload, includeQr: true }),
    getClinicQr,
    sendClinicText,
    disconnectClinicInstance,
    deleteClinicInstance,
  };
};

module.exports = { createWhatsAppEngineService };
