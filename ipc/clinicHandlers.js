const path = require('path');
const { encryptSecret, decryptSecret } = require('../services/utils/secretsCrypto');

const DEFAULT_CLINIC_ID = 'defaultClinic';

const getDefaultClinic = () => ({
  cnpjCpf: '',
  razaoSocial: '',
  nomeClinica: '',
  telefone: '',
  email: '',
  cro: '',
  responsavelTecnico: '',
  cep: '',
  rua: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  estado: '',
  receituario: {
    cabecalho: '',
    rodape: '',
    assinaturaNome: '',
    assinaturaRegistro: '',
    assinaturaImagemFile: '',
    textoPadrao: '',
    observacoesPadrao: '',
    itensFavoritos: [],
  },
  messaging: {
    birthday: {
      enabled: false,
      draftMode: true,
      sendTime: '09:00',
      dailyLimit: 200,
      throttleMs: 1000,
      template: 'Ola, {nome}! A equipe da {clinicaNome} deseja um feliz aniversario! Conte com a gente para cuidar do seu sorriso.',
      lastRunDate: '',
    },
    whatsapp: {
      enabled: false,
      provider: 'whatsapp_engine',
      apiUrl: '',
      token: '',
      instanceId: '',
      clientToken: '',
      phoneNumber: '',
      countryCode: '55',
    },
  },
  logoFile: '',
  updatedAt: '',
});

const normalizeWhatsAppConfig = (raw = {}) => ({
  enabled: parseBool(raw?.enabled, getDefaultClinic().messaging.whatsapp.enabled),
  provider: String(raw?.provider || 'whatsapp_engine').trim().toLowerCase().slice(0, 30) || 'whatsapp_engine',
  apiUrl: String(raw?.apiUrl || raw?.baseUrl || raw?.url || '').trim().slice(0, 500),
  token: String(raw?.token || raw?.accessToken || '').trim().slice(0, 500),
  instanceId: String(raw?.instanceId || raw?.instance || raw?.instance_id || '').trim().slice(0, 120),
  clientToken: String(raw?.clientToken || raw?.client_token || '').trim().slice(0, 500),
  phoneNumber: String(raw?.phoneNumber || raw?.senderPhone || raw?.numeroWhatsapp || '').trim().slice(0, 40),
  countryCode: String(raw?.countryCode || '55').replace(/\D/g, '').slice(0, 4) || '55',
});

const maskSecret = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.length <= 6) return '*'.repeat(raw.length);
  return `${raw.slice(0, 2)}${'*'.repeat(Math.max(0, raw.length - 4))}${raw.slice(-2)}`;
};

const parseBool = (value, fallback) => {
  if (value === undefined || value === null) return fallback;
  return !!value;
};

const resolveSecretValue = (incoming, previous = '') => {
  const raw = String(incoming || '').trim();
  if (!raw) return '';
  if (raw.includes('*')) return String(previous || '');
  return raw;
};

const normalizeTime = (value) => {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!match) return '09:00';
  const hh = Math.max(0, Math.min(23, Number(match[1] || 9)));
  const mm = Math.max(0, Math.min(59, Number(match[2] || 0)));
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};

const sanitizeClinic = (payload = {}) => ({
  receituario: {
    cabecalho: String(payload?.receituario?.cabecalho || '').trim().slice(0, 500),
    rodape: String(payload?.receituario?.rodape || '').trim().slice(0, 500),
    assinaturaNome: String(payload?.receituario?.assinaturaNome || '').trim().slice(0, 160),
    assinaturaRegistro: String(payload?.receituario?.assinaturaRegistro || '').trim().slice(0, 160),
    assinaturaImagemFile: String(payload?.receituario?.assinaturaImagemFile || '').trim().slice(0, 120),
    textoPadrao: String(payload?.receituario?.textoPadrao || '').trim().slice(0, 4000),
    observacoesPadrao: String(payload?.receituario?.observacoesPadrao || '').trim().slice(0, 3000),
    itensFavoritos: (Array.isArray(payload?.receituario?.itensFavoritos) ? payload.receituario.itensFavoritos : [])
      .map((item) => ({
        nome: String(item?.nome || '').trim().slice(0, 200),
        posologia: String(item?.posologia || '').trim().slice(0, 300),
        quantidade: String(item?.quantidade || '').trim().slice(0, 120),
      }))
      .filter((item) => item.nome)
      .slice(0, 80),
  },
  cnpjCpf: String(payload.cnpjCpf || '').trim(),
  razaoSocial: String(payload.razaoSocial || '').trim(),
  nomeClinica: String(payload.nomeClinica || '').trim(),
  telefone: String(payload.telefone || '').trim(),
  email: String(payload.email || '').trim(),
  cro: String(payload.cro || '').trim().slice(0, 160),
  responsavelTecnico: String(payload.responsavelTecnico || '').trim().slice(0, 160),
  cep: String(payload.cep || '').trim(),
  rua: String(payload.rua || '').trim(),
  numero: String(payload.numero || '').trim(),
  complemento: String(payload.complemento || '').trim(),
  bairro: String(payload.bairro || '').trim(),
  cidade: String(payload.cidade || '').trim(),
  estado: String(payload.estado || '').trim(),
  messaging: {
    birthday: {
      enabled: parseBool(payload?.messaging?.birthday?.enabled, getDefaultClinic().messaging.birthday.enabled),
      draftMode: parseBool(payload?.messaging?.birthday?.draftMode, getDefaultClinic().messaging.birthday.draftMode),
      sendTime: normalizeTime(payload?.messaging?.birthday?.sendTime || '09:00'),
      dailyLimit: Math.max(1, Math.min(1000, Number(payload?.messaging?.birthday?.dailyLimit || 200))),
      throttleMs: Math.max(0, Math.min(60000, Number(payload?.messaging?.birthday?.throttleMs || 1000))),
      template: String(payload?.messaging?.birthday?.template || '').trim().slice(0, 2000),
      lastRunDate: String(payload?.messaging?.birthday?.lastRunDate || '').trim().slice(0, 20),
    },
    whatsapp: {
      ...normalizeWhatsAppConfig(payload?.messaging?.whatsapp || {}),
    },
  },
});

const registerClinicHandlers = ({
  ipcMain,
  requireAccess,
  ensureDir,
  pathExists,
  readJsonFile,
  writeJsonFile,
  fsPromises,
  clinicPath,
  clinicFile,
  getClinicProfile,
  updateClinicProfile,
  getClinicLogoDataUrl,
  listClinics,
  centralBackendAdapter,
  buildAccessContext,
  currentUserRef,
  sendWhatsAppMessage,
  whatsappEngineService,
  whatsappPendingQueueService,
}) => {
  const normalizeClinicId = (value) => {
    const raw = String(value || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID;
    return raw.replace(/[^a-zA-Z0-9_-]/g, '_');
  };

  const getCurrentUser = () => (typeof currentUserRef === 'function' ? currentUserRef() : null);
  const getCurrentAccessContext = () => {
    const user = getCurrentUser();
    if (typeof buildAccessContext === 'function') {
      return buildAccessContext(user);
    }
    return {
      tenantScope: user?.tipo === 'super_admin' ? 'global' : 'clinic',
      clinicId: String(user?.clinicId || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID,
      isImpersonatedSession: user?.isImpersonatedSession === true,
      canAccessWhatsAppGlobal: user?.tipo === 'super_admin',
    };
  };
  const requireClinicContext = () => {
    const context = getCurrentAccessContext();
    if (context.tenantScope !== 'clinic' || !context.clinicId) {
      throw new Error('Selecione uma clinica valida antes de acessar este modulo.');
    }
    return normalizeClinicId(context.clinicId);
  };
  const isZapiManagerUser = (user) => {
    const tipo = String(user?.tipo || '').trim();
    return tipo === 'super_admin' || user?.isImpersonatedSession === true;
  };

  const scopedRoot = path.join(clinicPath, 'by-clinic');
  const getScopedDir = (clinicId) => path.join(scopedRoot, normalizeClinicId(clinicId));
  const getScopedClinicFile = (clinicId) => path.join(getScopedDir(clinicId), 'clinica.json');
  const messagingLogsDir = path.join(clinicPath, 'logs');

  const decryptWhatsAppConfig = (raw = {}) => {
    const normalized = normalizeWhatsAppConfig(raw);
    return {
      ...normalized,
      token: decryptSecret(normalized.token),
      clientToken: decryptSecret(normalized.clientToken),
    };
  };

  const appendMessagingLog = async (clinicId, entry = {}) => {
    await ensureDir(messagingLogsDir);
    const filePath = path.join(messagingLogsDir, `messaging-${normalizeClinicId(clinicId)}.json`);
    let current = { logs: [] };
    if (await pathExists(filePath)) {
      current = await readJsonFile(filePath).catch(() => ({ logs: [] }));
    }
    const logs = Array.isArray(current.logs) ? current.logs : [];
    logs.push({
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      ...entry,
    });
    while (logs.length > 5000) logs.shift();
    await writeJsonFile(filePath, { logs });
  };

  const readMessagingLogs = async (clinicId, limit = 30) => {
    await ensureDir(messagingLogsDir);
    const filePath = path.join(messagingLogsDir, `messaging-${normalizeClinicId(clinicId)}.json`);
    if (!(await pathExists(filePath))) return [];
    const data = await readJsonFile(filePath).catch(() => ({ logs: [] }));
    const logs = Array.isArray(data?.logs) ? data.logs : [];
    return logs
      .slice()
      .sort((a, b) => String(b?.createdAt || '').localeCompare(String(a?.createdAt || '')))
      .slice(0, Math.max(1, Math.min(300, Number(limit) || 30)));
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
  const queueByClinic = new Map();
  const queueProcessing = new Set();
  const whatsAppDiagnosticStateByClinic = new Map();

  const buildWhatsAppDiagnosticSignature = (payload = {}) => JSON.stringify({
    source: String(payload?.source || '').trim(),
    errorCode: String(payload?.error?.code || '').trim(),
    errorMessage: String(payload?.error?.message || '').trim(),
    healthStatus: String(payload?.engineHealth?.status || '').trim(),
    healthReady: payload?.engineHealth?.ready === true,
    instanceId: String(payload?.connection?.instanceId || '').trim(),
    connectionStatus: String(payload?.connection?.status || '').trim(),
    operationalStatus: String(payload?.connection?.operationalStatus || '').trim(),
    runtimeSocketState: String(payload?.connection?.runtimeSocketState || '').trim(),
    connectedInRuntime: payload?.connection?.connectedInRuntime === true,
    exists: payload?.connection?.exists === true,
  });

  const maybeAppendWhatsAppDiagnostic = async (clinicId, payload = {}) => {
    const signature = buildWhatsAppDiagnosticSignature(payload);
    if (whatsAppDiagnosticStateByClinic.get(clinicId) === signature) return;
    whatsAppDiagnosticStateByClinic.set(clinicId, signature);

    const health = payload?.engineHealth || payload?.connection?.engineHealth || null;
    const connection = payload?.connection || {};
    const error = payload?.error || null;
    const status = error
      ? 'error'
      : health?.ready === true
        ? 'success'
        : String(health?.status || '').trim().toLowerCase() === 'starting'
          ? 'warning'
          : 'error';
    const summary = error
      ? String(error?.message || 'Falha ao consultar o WhatsApp da clinica.')
      : health?.ready !== true
        ? String(health?.message || 'Motor NG indisponivel para esta clinica.')
        : connection?.exists !== true
          ? 'WhatsApp da clinica ainda nao configurado.'
          : `Instancia ${String(connection?.instanceId || '').trim() || 'sem id'} em ${String(connection?.operationalStatus || connection?.status || 'DESCONHECIDO').trim() || 'DESCONHECIDO'}.`;

    await appendMessagingLog(clinicId, {
      clinicId,
      channel: 'whatsapp',
      type: 'engine_health',
      status,
      provider: 'whatsapp_engine',
      instanceId: String(connection?.instanceId || '').trim(),
      clinicSenderPhone: String(connection?.phoneNumber || '').trim(),
      message: summary,
      meta: {
        source: String(payload?.source || '').trim() || 'unknown',
        engineStatus: String(health?.status || '').trim(),
        engineReady: health?.ready === true,
        connectionStatus: String(connection?.status || '').trim(),
        operationalStatus: String(connection?.operationalStatus || '').trim(),
        runtimeSocketState: String(connection?.runtimeSocketState || '').trim(),
        connectedInRuntime: connection?.connectedInRuntime === true,
        exists: connection?.exists === true,
        errorCode: String(error?.code || '').trim(),
      },
    }).catch(() => null);
  };

  const processClinicQueue = async (clinicId) => {
    if (queueProcessing.has(clinicId)) return;
    queueProcessing.add(clinicId);
    try {
      const queue = queueByClinic.get(clinicId) || [];
      while (queue.length) {
        const job = queue[0];
        const clinicConfig = await readClinicScopedRecord(clinicId);
        const whatsapp = decryptWhatsAppConfig(clinicConfig?.messaging?.whatsapp || {});
        if (!whatsapp.enabled) throw new Error('WhatsApp desabilitado para esta clinica.');

        try {
          const response = await sendWhatsAppMessage({
            clinicConfig: {
              ...clinicConfig,
              messaging: { ...(clinicConfig?.messaging || {}), whatsapp },
            },
            to: job.phone,
            text: job.message,
          });

          await appendMessagingLog(clinicId, {
            clinicId,
            channel: 'whatsapp',
            type: job.type || 'queue',
            status: 'success',
            to: job.phone,
            provider: whatsapp.provider || 'whatsapp_engine',
            instanceId: String(whatsapp.instanceId || '').trim(),
            clinicSenderPhone: String(whatsapp.phoneNumber || '').trim(),
            meta: job.meta || {},
          });
          job.resolve({ success: true, response });
          queue.shift();
        } catch (err) {
          job.attempts += 1;
          const maxAttempts = Math.max(1, Number(job.maxAttempts || 2));
          if (job.attempts >= maxAttempts) {
            await appendMessagingLog(clinicId, {
              clinicId,
              channel: 'whatsapp',
              type: job.type || 'queue',
              status: 'error',
              to: job.phone,
              provider: whatsapp.provider || 'whatsapp_engine',
              instanceId: String(whatsapp.instanceId || '').trim(),
              clinicSenderPhone: String(whatsapp.phoneNumber || '').trim(),
              error: err?.message || String(err),
              meta: job.meta || {},
            });
            job.reject(err);
            queue.shift();
          } else {
            await sleep(Number(job.retryDelayMs || 1500));
          }
        }

        await sleep(Number(job.throttleMs || 1000));
      }
    } finally {
      queueProcessing.delete(clinicId);
    }
  };

  const enqueueClinicWhatsApp = async (clinicId, payload = {}) => {
    const phone = String(payload.phone || '').trim();
    if (!phone) throw new Error('Telefone obrigatorio para fila de envio.');
    const message = String(payload.message || '').trim();
    if (!message) throw new Error('Mensagem obrigatoria para fila de envio.');

    const queue = queueByClinic.get(clinicId) || [];
    queueByClinic.set(clinicId, queue);
    const promise = new Promise((resolve, reject) => {
      queue.push({
        phone,
        message,
        type: String(payload.type || 'queue').trim() || 'queue',
        meta: payload.meta || {},
        attempts: 0,
        maxAttempts: Number(payload.maxAttempts || 2),
        retryDelayMs: Number(payload.retryDelayMs || 1500),
        throttleMs: Number(payload.throttleMs || 1000),
        resolve,
        reject,
      });
    });
    processClinicQueue(clinicId);
    return promise;
  };

  const readClinicScopedRecord = async (clinicId) => {
    const cid = normalizeClinicId(clinicId);
    await ensureDir(scopedRoot);
    await ensureDir(getScopedDir(cid));
    const scopedFile = getScopedClinicFile(cid);

    if (!(await pathExists(scopedFile))) {
      if (cid === DEFAULT_CLINIC_ID && (await pathExists(clinicFile))) {
        const legacy = await readJsonFile(clinicFile).catch(() => null);
        await writeJsonFile(scopedFile, { ...getDefaultClinic(), ...(legacy || {}) });
      } else {
        await writeJsonFile(scopedFile, getDefaultClinic());
      }
    }

    return readJsonFile(scopedFile).catch(() => getDefaultClinic());
  };

  const writeClinicScopedRecord = async (clinicId, record = {}) => {
    const cid = normalizeClinicId(clinicId);
    await ensureDir(scopedRoot);
    await ensureDir(getScopedDir(cid));
    const scopedFile = getScopedClinicFile(cid);
    await writeJsonFile(scopedFile, record);

    if (cid === DEFAULT_CLINIC_ID) {
      await writeJsonFile(clinicFile, record);
    }
  };

  const loadRegistryClinicSeed = async (clinicId) => {
    let clinics = [];
    if (centralBackendAdapter?.isEnabled?.() === true && centralBackendAdapter?.listClinicsPublic) {
      clinics = await centralBackendAdapter.listClinicsPublic().catch(() => []);
    }
    if (!Array.isArray(clinics) || !clinics.length) {
      if (typeof listClinics !== 'function') return null;
      clinics = await listClinics().catch(() => []);
    }
    const source = (Array.isArray(clinics) ? clinics : []).find(
      (item) => normalizeClinicId(item?.clinicId || '') === normalizeClinicId(clinicId),
    );
    if (!source) return null;

    return {
      profilePatch: {
        nomeFantasia: String(source.nomeFantasia || '').trim(),
        razaoSocial: String(source.razaoSocial || '').trim(),
        cnpj: String(source.cnpjOuCpf || '').trim(),
        telefone: String(source.telefone || '').trim(),
        whatsapp: String(source.whatsapp || '').trim(),
        email: String(source.emailClinica || '').trim(),
        endereco: {
          rua: String(source?.endereco?.rua || '').trim(),
          numero: String(source?.endereco?.numero || '').trim(),
          bairro: String(source?.endereco?.bairro || '').trim(),
          cidade: String(source?.endereco?.cidade || '').trim(),
          uf: String(source?.endereco?.uf || '').trim(),
          cep: String(source?.endereco?.cep || '').trim(),
        },
      },
      scopedPatch: {
        cnpjCpf: String(source.cnpjOuCpf || '').trim(),
        razaoSocial: String(source.razaoSocial || '').trim(),
        nomeClinica: String(source.nomeFantasia || '').trim(),
        telefone: String(source.telefone || '').trim(),
        email: String(source.emailClinica || '').trim(),
        rua: String(source?.endereco?.rua || '').trim(),
        numero: String(source?.endereco?.numero || '').trim(),
        bairro: String(source?.endereco?.bairro || '').trim(),
        cidade: String(source?.endereco?.cidade || '').trim(),
        estado: String(source?.endereco?.uf || '').trim(),
        cep: String(source?.endereco?.cep || '').trim(),
      },
    };
  };

  const resolveClinicDisplayName = async (clinicId) => {
    const clinicConfig = await readClinicScopedRecord(clinicId).catch(() => getDefaultClinic());
    const clinicProfile = await getClinicProfile(clinicId).catch(() => null);
    return String(
      clinicProfile?.nomeFantasia
        || clinicConfig?.nomeClinica
        || clinicConfig?.razaoSocial
      || clinicId,
    ).trim();
  };

  const canUseCentralBirthdayMessaging = () => (
    centralBackendAdapter?.isEnabled?.() === true
    && typeof centralBackendAdapter?.getClinicOperationalSettings === 'function'
    && typeof centralBackendAdapter?.updateClinicOperationalSettings === 'function'
  );

  const normalizeBirthdayMessagingRecord = (value = {}) => ({
    ...getDefaultClinic().messaging.birthday,
    ...(value || {}),
    sendTime: normalizeTime(value?.sendTime || '09:00'),
    dailyLimit: Math.max(1, Math.min(1000, Number(value?.dailyLimit || 200))),
    throttleMs: Math.max(0, Math.min(60000, Number(value?.throttleMs || 1000))),
    template: String(value?.template || getDefaultClinic().messaging.birthday.template || '').trim().slice(0, 2000),
    lastRunDate: String(value?.lastRunDate || '').trim().slice(0, 20),
    updatedAt: String(value?.updatedAt || '').trim(),
  });

  const readCentralBirthdayMessaging = async (clinicId) => {
    if (!canUseCentralBirthdayMessaging()) return null;
    try {
      const remote = await centralBackendAdapter.getClinicOperationalSettings(clinicId);
      return normalizeBirthdayMessagingRecord(remote?.birthdayMessaging || {});
    } catch (error) {
      console.warn('[CLINICA] Falha ao ler birthdayMessaging central:', error?.message || error);
      return null;
    }
  };

  const writeCentralBirthdayMessaging = async (clinicId, record = {}) => {
    if (!canUseCentralBirthdayMessaging()) return null;
    try {
      const remote = await centralBackendAdapter.updateClinicOperationalSettings(clinicId, {
        birthdayMessaging: normalizeBirthdayMessagingRecord(record),
      });
      return normalizeBirthdayMessagingRecord(remote?.birthdayMessaging || record);
    } catch (error) {
      console.warn('[CLINICA] Falha ao salvar birthdayMessaging central:', error?.message || error);
      return null;
    }
  };

  const persistWhatsAppEngineState = async (clinicId, connection = {}) => {
    const record = await readClinicScopedRecord(clinicId).catch(() => getDefaultClinic());
    const previousWhatsapp = normalizeWhatsAppConfig(record?.messaging?.whatsapp || {});
    const nextWhatsapp = {
      ...previousWhatsapp,
      enabled: true,
      provider: 'whatsapp_engine',
      instanceId: String(connection?.instanceId || previousWhatsapp.instanceId || '').trim(),
      phoneNumber: String(connection?.phoneNumber || previousWhatsapp.phoneNumber || '').trim(),
      apiUrl: String(previousWhatsapp.apiUrl || '').trim(),
    };

    await writeClinicScopedRecord(clinicId, {
      ...record,
      messaging: {
        ...getDefaultClinic().messaging,
        ...(record?.messaging || {}),
        birthday: {
          ...getDefaultClinic().messaging.birthday,
          ...(record?.messaging?.birthday || {}),
        },
        whatsapp: nextWhatsapp,
      },
      updatedAt: new Date().toISOString(),
    });

    console.info('[CLINICA] whatsapp_runtime_status_synced', JSON.stringify({
      clinicId,
      instanceId: String(connection?.instanceId || '').trim(),
      displayedStatus: String(connection?.status || '').trim(),
      operationalStatus: String(connection?.operationalStatus || connection?.status || '').trim(),
      persistedStatus: String(connection?.persistedStatus || '').trim(),
      connectedInRuntime: connection?.connectedInRuntime === true,
      runtimeSocketState: String(connection?.runtimeSocketState || '').trim(),
      divergence: String(connection?.persistedStatus || '').trim() === 'CONNECTED'
        && connection?.connectedInRuntime !== true,
      syncedAt: new Date().toISOString(),
    }));

    return nextWhatsapp;
  };

  const clearWhatsAppEngineState = async (clinicId) => {
    const record = await readClinicScopedRecord(clinicId).catch(() => getDefaultClinic());
    const previousWhatsapp = normalizeWhatsAppConfig(record?.messaging?.whatsapp || {});
    const nextWhatsapp = {
      ...previousWhatsapp,
      enabled: false,
      provider: 'whatsapp_engine',
      instanceId: '',
      phoneNumber: '',
    };

    await writeClinicScopedRecord(clinicId, {
      ...record,
      messaging: {
        ...getDefaultClinic().messaging,
        ...(record?.messaging || {}),
        birthday: {
          ...getDefaultClinic().messaging.birthday,
          ...(record?.messaging?.birthday || {}),
        },
        whatsapp: nextWhatsapp,
      },
      updatedAt: new Date().toISOString(),
    });

    return nextWhatsapp;
  };

  ipcMain.handle('clinic-profile-get', async () => {
    requireAccess({ roles: ['admin', 'recepcionista', 'dentista'], perms: ['clinic.manage'] });
    const clinicId = requireClinicContext();
    return getClinicProfile(clinicId);
  });

  ipcMain.handle('clinic-profile-update', async (_event, payload = {}) => {
    requireAccess({ roles: ['admin'], perms: ['clinic.manage'] });
    const clinicId = requireClinicContext();
    return updateClinicProfile(clinicId, payload.patch || payload);
  });

  ipcMain.handle('clinic-profile-logo-data-url', async () => {
    requireAccess({ roles: ['admin', 'recepcionista', 'dentista'], perms: ['clinic.manage'] });
    const clinicId = requireClinicContext();
    return getClinicLogoDataUrl(clinicId);
  });

  ipcMain.handle('clinic-whatsapp-connection-get', async () => {
    requireAccess({ roles: ['admin', 'recepcionista', 'dentista'], perms: ['clinic.manage'] });
    if (!whatsappEngineService?.getClinicConnection) {
      throw new Error('WhatsApp Engine indisponivel neste ambiente.');
    }

    const clinicId = requireClinicContext();
    const displayName = await resolveClinicDisplayName(clinicId);
    try {
      const connection = await whatsappEngineService.getClinicConnection({ clinicId, displayName });
      if (connection?.exists) {
        await persistWhatsAppEngineState(clinicId, connection).catch((error) => {
          console.warn('[CLINICA] Falha ao persistir estado do WhatsApp Engine:', error?.message || error);
        });
      } else {
        await clearWhatsAppEngineState(clinicId).catch((error) => {
          console.warn('[CLINICA] Falha ao limpar estado local do WhatsApp Engine:', error?.message || error);
        });
      }
      await maybeAppendWhatsAppDiagnostic(clinicId, { source: 'connection_get', connection, engineHealth: connection?.engineHealth });
      return connection;
    } catch (error) {
      await maybeAppendWhatsAppDiagnostic(clinicId, { source: 'connection_get', error });
      throw error;
    }
  });

  ipcMain.handle('clinic-whatsapp-engine-health', async () => {
    requireAccess({ roles: ['admin', 'recepcionista', 'dentista'], perms: ['clinic.manage'] });
    if (!whatsappEngineService?.getEngineHealth) {
      throw new Error('WhatsApp Engine indisponivel neste ambiente.');
    }
    const clinicId = requireClinicContext();
    try {
      const health = await whatsappEngineService.getEngineHealth();
      await maybeAppendWhatsAppDiagnostic(clinicId, { source: 'engine_health', engineHealth: health });
      return health;
    } catch (error) {
      await maybeAppendWhatsAppDiagnostic(clinicId, { source: 'engine_health', error });
      throw error;
    }
  });

  ipcMain.handle('clinic-whatsapp-connection-refresh', async () => {
    requireAccess({ roles: ['admin', 'recepcionista', 'dentista'], perms: ['clinic.manage'] });
    if (!whatsappEngineService?.refreshClinicConnection) {
      throw new Error('WhatsApp Engine indisponivel neste ambiente.');
    }

    const clinicId = requireClinicContext();
    const displayName = await resolveClinicDisplayName(clinicId);
    try {
      const connection = await whatsappEngineService.refreshClinicConnection({ clinicId, displayName });
      if (connection?.exists) {
        await persistWhatsAppEngineState(clinicId, connection).catch((error) => {
          console.warn('[CLINICA] Falha ao persistir refresh do WhatsApp Engine:', error?.message || error);
        });
      } else {
        await clearWhatsAppEngineState(clinicId).catch((error) => {
          console.warn('[CLINICA] Falha ao limpar estado local do WhatsApp Engine apos refresh:', error?.message || error);
        });
      }
      await maybeAppendWhatsAppDiagnostic(clinicId, { source: 'connection_refresh', connection, engineHealth: connection?.engineHealth });
      return connection;
    } catch (error) {
      await maybeAppendWhatsAppDiagnostic(clinicId, { source: 'connection_refresh', error });
      throw error;
    }
  });

  ipcMain.handle('clinic-whatsapp-connection-connect', async () => {
    requireAccess({ roles: ['admin', 'recepcionista', 'dentista'], perms: ['clinic.manage'] });
    if (!whatsappEngineService?.getClinicQr) {
      throw new Error('WhatsApp Engine indisponivel neste ambiente.');
    }

    const clinicId = requireClinicContext();
    const displayName = await resolveClinicDisplayName(clinicId);
    try {
      const connection = await whatsappEngineService.getClinicQr({ clinicId, displayName });
      await persistWhatsAppEngineState(clinicId, connection).catch((error) => {
        console.warn('[CLINICA] Falha ao persistir conexao do WhatsApp Engine:', error?.message || error);
      });
      await maybeAppendWhatsAppDiagnostic(clinicId, { source: 'connection_connect', connection, engineHealth: connection?.engineHealth });
      return connection;
    } catch (error) {
      await maybeAppendWhatsAppDiagnostic(clinicId, { source: 'connection_connect', error });
      throw error;
    }
  });

  ipcMain.handle('clinic-whatsapp-connection-disconnect', async () => {
    requireAccess({ roles: ['admin', 'recepcionista', 'dentista'], perms: ['clinic.manage'] });
    if (!whatsappEngineService?.disconnectClinicInstance) {
      throw new Error('WhatsApp Engine indisponivel neste ambiente.');
    }

    const clinicId = requireClinicContext();
    try {
      const result = await whatsappEngineService.disconnectClinicInstance({ clinicId });
      await clearWhatsAppEngineState(clinicId).catch((error) => {
        console.warn('[CLINICA] Falha ao limpar estado local do WhatsApp Engine:', error?.message || error);
      });
      await maybeAppendWhatsAppDiagnostic(clinicId, {
        source: 'connection_disconnect',
        connection: {
          clinicId,
          instanceId: result?.instanceId || '',
          exists: false,
          status: 'CREATED',
          operationalStatus: 'CREATED',
          connectedInRuntime: false,
          runtimeSocketState: 'CLOSED',
        },
      });
      return result;
    } catch (error) {
      await maybeAppendWhatsAppDiagnostic(clinicId, { source: 'connection_disconnect', error });
      throw error;
    }
  });

  ipcMain.handle('clinic-whatsapp-connection-delete', async () => {
    requireAccess({ roles: ['admin', 'recepcionista', 'dentista'], perms: ['clinic.manage'] });
    if (!whatsappEngineService?.deleteClinicInstance) {
      throw new Error('WhatsApp Engine indisponivel neste ambiente.');
    }

    const clinicId = requireClinicContext();
    try {
      const result = await whatsappEngineService.deleteClinicInstance({ clinicId });
      if (centralBackendAdapter?.isEnabled?.() === true && typeof centralBackendAdapter?.resetClinicWhatsappReplyContexts === 'function') {
        await centralBackendAdapter.resetClinicWhatsappReplyContexts({
          clinicId,
          reason: 'Clinic WhatsApp instance deleted by operator. Pending confirmation contexts were cleared before reconnect.',
        }).catch((error) => {
          console.warn('[CLINICA] Falha ao resetar contexto WhatsApp no backend central apos exclusao:', error?.message || error);
        });
      }
      await clearWhatsAppEngineState(clinicId).catch((error) => {
        console.warn('[CLINICA] Falha ao limpar estado local do WhatsApp Engine apos exclusao:', error?.message || error);
      });
      await maybeAppendWhatsAppDiagnostic(clinicId, {
        source: 'connection_delete',
        connection: {
          clinicId,
          instanceId: result?.instanceId || '',
          exists: false,
          status: 'NOT_CONFIGURED',
          operationalStatus: 'NOT_CONFIGURED',
          connectedInRuntime: false,
          runtimeSocketState: 'MISSING',
        },
      });
      return result;
    } catch (error) {
      await maybeAppendWhatsAppDiagnostic(clinicId, { source: 'connection_delete', error });
      throw error;
    }
  });

  ipcMain.handle('clinic-get', async () => {
    requireAccess({ roles: ['admin', 'recepcionista', 'dentista'], perms: ['clinic.manage'] });
    const clinicId = requireClinicContext();
    const currentUser = getCurrentUser();
    const canViewSecrets = isZapiManagerUser(currentUser);

    try {
      let data = await readClinicScopedRecord(clinicId);
      let clinicProfile = await getClinicProfile(clinicId);
      const registrySeed = await loadRegistryClinicSeed(clinicId);

      const missingIdentity = !String(data?.cnpjCpf || '').trim()
        && !String(clinicProfile?.cnpj || '').trim()
        && !String(clinicProfile?.nomeFantasia || clinicProfile?.razaoSocial || '').trim();
      if (missingIdentity) {
        const seed = registrySeed;
        if (seed) {
          clinicProfile = await updateClinicProfile(clinicId, seed.profilePatch);
          data = {
            ...getDefaultClinic(),
            ...(data || {}),
            ...seed.scopedPatch,
            updatedAt: new Date().toISOString(),
          };
          await writeClinicScopedRecord(clinicId, data);
        }
      }

      const logoData = await getClinicLogoDataUrl(clinicId);
      const assinaturaFile = data?.receituario?.assinaturaImagemFile || '';
      let assinaturaImagemData = '';
      if (assinaturaFile) {
        try {
          const scopedDir = getScopedDir(clinicId);
          const filePath = path.isAbsolute(assinaturaFile)
            ? assinaturaFile
            : path.join(scopedDir, assinaturaFile);
          if (await pathExists(filePath)) {
            const buffer = await fsPromises.readFile(filePath);
            const ext = path.extname(filePath).replace('.', '') || 'png';
            assinaturaImagemData = `data:image/${ext};base64,${buffer.toString('base64')}`;
          }
        } catch (_) {
          assinaturaImagemData = '';
        }
      }

      const localBirthdayMessaging = normalizeBirthdayMessagingRecord(data?.messaging?.birthday || {});
      let effectiveBirthdayMessaging = localBirthdayMessaging;
      const remoteBirthdayMessaging = await readCentralBirthdayMessaging(clinicId);
      if (remoteBirthdayMessaging) {
        const shouldSeedCentral = !String(remoteBirthdayMessaging.updatedAt || '').trim()
          && String(localBirthdayMessaging.updatedAt || '').trim();
        effectiveBirthdayMessaging = shouldSeedCentral
          ? (await writeCentralBirthdayMessaging(clinicId, localBirthdayMessaging) || localBirthdayMessaging)
          : remoteBirthdayMessaging;
      }

      return {
        ...getDefaultClinic(),
        ...(data || {}),
        cnpjCpf: registrySeed?.profilePatch?.cnpj || clinicProfile?.cnpj || data?.cnpjCpf || '',
        nomeClinica: registrySeed?.profilePatch?.nomeFantasia || clinicProfile?.nomeFantasia || data?.nomeClinica || '',
        razaoSocial: registrySeed?.profilePatch?.razaoSocial || clinicProfile?.razaoSocial || data?.razaoSocial || '',
        telefone: registrySeed?.profilePatch?.telefone || clinicProfile?.telefone || data?.telefone || '',
        email: registrySeed?.profilePatch?.email || clinicProfile?.email || data?.email || '',
        rua: registrySeed?.profilePatch?.endereco?.rua || clinicProfile?.endereco?.rua || data?.rua || '',
        numero: registrySeed?.profilePatch?.endereco?.numero || clinicProfile?.endereco?.numero || data?.numero || '',
        bairro: registrySeed?.profilePatch?.endereco?.bairro || clinicProfile?.endereco?.bairro || data?.bairro || '',
        cidade: registrySeed?.profilePatch?.endereco?.cidade || clinicProfile?.endereco?.cidade || data?.cidade || '',
        estado: registrySeed?.profilePatch?.endereco?.uf || clinicProfile?.endereco?.uf || data?.estado || '',
        cep: registrySeed?.profilePatch?.endereco?.cep || clinicProfile?.endereco?.cep || data?.cep || '',
        cro: clinicProfile?.cro || data?.cro || '',
        responsavelTecnico: clinicProfile?.responsavelTecnico || data?.responsavelTecnico || '',
        logoPath: clinicProfile?.logoPath || data?.logoPath || '',
        logoFile: clinicProfile?.logoPath ? path.basename(clinicProfile.logoPath) : (data?.logoFile || ''),
        clinicProfile: clinicProfile || null,
        clinicProfileIncomplete: !!clinicProfile?.isIncomplete,
        receituario: {
          ...getDefaultClinic().receituario,
          ...(data?.receituario || {}),
          assinaturaNome: String(data?.receituario?.assinaturaNome || clinicProfile?.responsavelTecnico || '').trim(),
          assinaturaRegistro: String(data?.receituario?.assinaturaRegistro || clinicProfile?.cro || data?.cro || '').trim(),
          assinaturaImagemData,
        },
        messaging: {
          ...getDefaultClinic().messaging,
        ...(data?.messaging || {}),
        birthday: {
          ...effectiveBirthdayMessaging,
        },
        whatsapp: {
          ...getDefaultClinic().messaging.whatsapp,
          ...decryptWhatsAppConfig(data?.messaging?.whatsapp || {}),
            token: canViewSecrets
              ? decryptWhatsAppConfig(data?.messaging?.whatsapp || {}).token
              : maskSecret(decryptWhatsAppConfig(data?.messaging?.whatsapp || {}).token),
            clientToken: canViewSecrets
              ? decryptWhatsAppConfig(data?.messaging?.whatsapp || {}).clientToken
              : maskSecret(decryptWhatsAppConfig(data?.messaging?.whatsapp || {}).clientToken),
        },
      },
      logoData,
    };
    } catch (err) {
      console.warn('[CLINICA] Falha ao ler dados da clinica', err);
      return getDefaultClinic();
    }
  });

  ipcMain.handle('clinic-save', async (_event, payload = {}) => {
    requireAccess({ roles: ['admin'], perms: ['clinic.manage'] });

    const clinicId = requireClinicContext();
    const data = sanitizeClinic(payload);
    const previous = await readClinicScopedRecord(clinicId);
    const previousWhatsapp = normalizeWhatsAppConfig(previous?.messaging?.whatsapp || {});
    const incomingWhatsapp = normalizeWhatsAppConfig(data?.messaging?.whatsapp || {});
    const sanitizedIncomingWhatsapp = {
      ...previousWhatsapp,
      enabled: previousWhatsapp.enabled,
      provider: String(previousWhatsapp.provider || 'whatsapp_engine').trim().toLowerCase() || 'whatsapp_engine',
      phoneNumber: String(incomingWhatsapp.phoneNumber || '').trim(),
      countryCode: String(incomingWhatsapp.countryCode || previousWhatsapp.countryCode || '55').replace(/\D/g, '').slice(0, 4) || '55',
    };

    const previousBirthdayMessaging = await readCentralBirthdayMessaging(clinicId)
      || normalizeBirthdayMessagingRecord(previous?.messaging?.birthday || {});
    if (!data?.messaging?.birthday?.lastRunDate && previousBirthdayMessaging?.lastRunDate) {
      data.messaging.birthday.lastRunDate = String(previousBirthdayMessaging.lastRunDate || '');
    }
    const nextBirthdayMessaging = normalizeBirthdayMessagingRecord({
      ...(data?.messaging?.birthday || {}),
      updatedAt: new Date().toISOString(),
    });
    const effectiveBirthdayMessaging = await writeCentralBirthdayMessaging(clinicId, nextBirthdayMessaging)
      || nextBirthdayMessaging;

    const updatedProfile = await updateClinicProfile(clinicId, {
      nomeFantasia: String(payload.nomeFantasia || data.nomeClinica || '').trim(),
      razaoSocial: String(payload.razaoSocial || data.razaoSocial || '').trim(),
      cnpj: String(payload.cnpj || payload.cnpjCpf || data.cnpjCpf || '').trim(),
      telefone: String(payload.telefone || data.telefone || '').trim(),
      whatsapp: String(payload.whatsapp || '').trim(),
      email: String(payload.email || data.email || '').trim(),
      cro: String(payload.cro || '').trim(),
      responsavelTecnico: String(payload.responsavelTecnico || '').trim(),
      endereco: {
        rua: String(payload.rua || data.rua || '').trim(),
        numero: String(payload.numero || data.numero || '').trim(),
        bairro: String(payload.bairro || data.bairro || '').trim(),
        cidade: String(payload.cidade || data.cidade || '').trim(),
        uf: String(payload.estado || data.estado || '').trim(),
        cep: String(payload.cep || data.cep || '').trim(),
      },
      logoData: String(payload.logoData || '').trim(),
      logoRemove: payload.logoRemove === true,
      logoPath: String(payload.logoPath || '').trim(),
    });

    const logoFile = updatedProfile?.logoPath ? path.basename(updatedProfile.logoPath) : '';
    let assinaturaImagemFile = String(data?.receituario?.assinaturaImagemFile || '').trim();
    const scopedDir = getScopedDir(clinicId);

    if (payload?.receituario?.assinaturaImagemRemove) {
      if (assinaturaImagemFile) {
        try {
          const fileToRemove = path.join(scopedDir, assinaturaImagemFile);
          await fsPromises.unlink(fileToRemove);
        } catch (_) {
        }
      }
      assinaturaImagemFile = '';
    }

    const assinaturaImagemData = String(payload?.receituario?.assinaturaImagemData || '').trim();
    if (assinaturaImagemData.startsWith('data:')) {
      const match = assinaturaImagemData.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/i);
      if (match) {
        const ext = match[1] === 'jpeg' ? 'jpg' : match[1].toLowerCase();
        const base64 = match[2];
        const fileName = `assinatura-receita.${ext}`;
        const filePath = path.join(scopedDir, fileName);
        await ensureDir(scopedDir);
        await fsPromises.writeFile(filePath, Buffer.from(base64, 'base64'));
        assinaturaImagemFile = fileName;
      }
    }

    const nextWhatsapp = {
      ...sanitizedIncomingWhatsapp,
      token: String(previous?.messaging?.whatsapp?.token || ''),
      clientToken: String(previous?.messaging?.whatsapp?.clientToken || ''),
      instanceId: String(previousWhatsapp.instanceId || '').trim(),
      apiUrl: String(previousWhatsapp.apiUrl || '').trim(),
      enabled: previousWhatsapp.enabled,
    };

    const record = {
      ...getDefaultClinic(),
      ...data,
      cnpjCpf: updatedProfile?.cnpj || data.cnpjCpf || '',
      nomeClinica: updatedProfile?.nomeFantasia || data.nomeClinica || '',
      razaoSocial: updatedProfile?.razaoSocial || data.razaoSocial || '',
      telefone: updatedProfile?.telefone || data.telefone || '',
      email: updatedProfile?.email || data.email || '',
      rua: updatedProfile?.endereco?.rua || data.rua || '',
      numero: updatedProfile?.endereco?.numero || data.numero || '',
      bairro: updatedProfile?.endereco?.bairro || data.bairro || '',
      cidade: updatedProfile?.endereco?.cidade || data.cidade || '',
      estado: updatedProfile?.endereco?.uf || data.estado || '',
      cep: updatedProfile?.endereco?.cep || data.cep || '',
      cro: updatedProfile?.cro || '',
      responsavelTecnico: updatedProfile?.responsavelTecnico || '',
      receituario: {
        ...getDefaultClinic().receituario,
        ...(data.receituario || {}),
        assinaturaNome: String(data?.receituario?.assinaturaNome || updatedProfile?.responsavelTecnico || '').trim(),
        assinaturaRegistro: String(data?.receituario?.assinaturaRegistro || updatedProfile?.cro || data?.cro || '').trim(),
        assinaturaImagemFile,
      },
      messaging: {
        ...getDefaultClinic().messaging,
        ...(data.messaging || {}),
        birthday: {
          ...effectiveBirthdayMessaging,
        },
        whatsapp: nextWhatsapp,
      },
      clinicProfile: updatedProfile,
      logoPath: updatedProfile?.logoPath || '',
      logoFile,
      updatedAt: new Date().toISOString(),
    };

    await writeClinicScopedRecord(clinicId, record);
    return record;
  });

  ipcMain.handle('clinic-whatsapp-test', async (_event, payload = {}) => {
    requireAccess({ roles: ['admin'], perms: ['clinic.manage'] });
    const currentUser = getCurrentUser();
    if (!isZapiManagerUser(currentUser)) {
      throw new Error('Apenas o Super Admin Voithos pode testar configuracoes legadas de integracao.');
    }
    const clinicId = requireClinicContext();
    const phone = String(payload.phone || '').trim();
    if (!phone) throw new Error('Telefone de teste obrigatorio.');
    const message = String(payload.message || '').trim() || 'Mensagem de teste da integracao WhatsApp da Voithos.';

    const clinicConfig = await readClinicScopedRecord(clinicId);
    const whatsappStored = decryptWhatsAppConfig(clinicConfig?.messaging?.whatsapp || {});
    const whatsappDraft = normalizeWhatsAppConfig(payload?.config || {});
    const hasDraftConfig = payload?.config && typeof payload.config === 'object';
    const whatsapp = hasDraftConfig
      ? {
          ...whatsappStored,
          ...whatsappDraft,
          enabled: payload?.config?.enabled === true,
          token: resolveSecretValue(String(payload?.config?.token || '').trim(), whatsappStored.token) || whatsappStored.token,
          instanceId: String(payload?.config?.instanceId || '').trim() || whatsappDraft.instanceId || whatsappStored.instanceId,
          apiUrl: String(payload?.config?.apiUrl || '').trim() || whatsappDraft.apiUrl || whatsappStored.apiUrl,
          clientToken: resolveSecretValue(String(payload?.config?.clientToken || '').trim(), whatsappStored.clientToken) || whatsappStored.clientToken,
        }
      : whatsappStored;
    if (!whatsapp.enabled) throw new Error('WhatsApp desabilitado para esta clinica.');

    if (hasDraftConfig) {
      const whatsappStoredEncrypted = normalizeWhatsAppConfig(clinicConfig?.messaging?.whatsapp || {});
      const whatsappToPersist = {
        ...whatsappStoredEncrypted,
        ...whatsappDraft,
        enabled: whatsapp.enabled,
        provider: String(whatsapp.provider || 'whatsapp_engine').trim().toLowerCase() || 'whatsapp_engine',
        apiUrl: String(whatsapp.apiUrl || '').trim(),
        instanceId: String(whatsapp.instanceId || '').trim(),
        token: String(whatsapp.token || '').trim() ? encryptSecret(String(whatsapp.token || '').trim()) : '',
        clientToken: String(whatsapp.clientToken || '').trim()
          ? encryptSecret(String(whatsapp.clientToken || '').trim())
          : '',
      };
      await writeClinicScopedRecord(clinicId, {
        ...clinicConfig,
        messaging: {
          ...(clinicConfig?.messaging || {}),
          whatsapp: whatsappToPersist,
        },
        updatedAt: new Date().toISOString(),
      });
    }

    try {
      const response = await sendWhatsAppMessage({
        clinicConfig: {
          ...clinicConfig,
          messaging: {
            ...(clinicConfig?.messaging || {}),
            whatsapp,
          },
        },
        to: phone,
        text: message,
      });
      await appendMessagingLog(clinicId, {
        clinicId,
        channel: 'whatsapp',
        type: 'test',
        status: 'success',
        to: phone,
        provider: whatsapp.provider || 'whatsapp_engine',
        instanceId: String(whatsapp.instanceId || '').trim(),
        clinicSenderPhone: String(whatsapp.phoneNumber || '').trim(),
      });
      return { success: true, response };
    } catch (err) {
      await appendMessagingLog(clinicId, {
        clinicId,
        channel: 'whatsapp',
        type: 'test',
        status: 'error',
        to: phone,
        provider: whatsapp.provider || 'whatsapp_engine',
        instanceId: String(whatsapp.instanceId || '').trim(),
        clinicSenderPhone: String(whatsapp.phoneNumber || '').trim(),
        error: err?.message || String(err),
      });
      throw err;
    }
  });

  ipcMain.handle('clinic-whatsapp-enqueue', async (_event, payload = {}) => {
    requireAccess({ roles: ['admin', 'recepcionista', 'dentista'], perms: [] });
    const clinicId = requireClinicContext();
    return enqueueClinicWhatsApp(clinicId, {
      phone: payload.phone,
      message: payload.message,
      type: payload.type || 'manual',
      meta: payload.meta || {},
      maxAttempts: payload.maxAttempts,
      retryDelayMs: payload.retryDelayMs,
      throttleMs: payload.throttleMs,
    });
  });

  ipcMain.handle('clinic-messaging-logs-list', async (_event, payload = {}) => {
    requireAccess({ roles: ['admin', 'recepcionista', 'dentista'], perms: [] });
    const clinicId = requireClinicContext();
    const items = await readMessagingLogs(clinicId, payload.limit);
    return { clinicId, items };
  });

  ipcMain.handle('clinic-whatsapp-pending-list', async (_event, payload = {}) => {
    requireAccess({ roles: ['admin', 'recepcionista', 'dentista'], perms: [] });
    if (!whatsappPendingQueueService?.listPending) return { clinicId: requireClinicContext(), items: [] };
    const clinicId = requireClinicContext();
    const [items, summary] = await Promise.all([
      whatsappPendingQueueService.listPending({
        clinicId,
        limit: payload?.limit || 20,
      }),
      whatsappPendingQueueService?.getPendingStats
        ? whatsappPendingQueueService.getPendingStats({ clinicId })
        : Promise.resolve(null),
    ]);
    return { clinicId, items, summary };
  });
};

module.exports = { registerClinicHandlers };



