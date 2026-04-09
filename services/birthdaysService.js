const path = require('path');
const { decryptSecret } = require('./utils/secretsCrypto');

const DEFAULT_CLINIC_ID = 'defaultClinic';
const DEFAULT_TEMPLATE = 'Ola, {nome}! A equipe da {clinicaNome} deseja um feliz aniversario! Conte com a gente para cuidar do seu sorriso.';
const BIRTHDAY_EVENT_TYPES = {
  SENT: 'BIRTHDAY_MESSAGE_SENT',
  FAILED: 'BIRTHDAY_MESSAGE_FAILED',
  JOB_COMPLETED: 'BIRTHDAY_MESSAGE_JOB_COMPLETED',
};

const getDefaultBirthdaySettings = () => ({
  enabled: false,
  draftMode: true,
  sendTime: '09:00',
  dailyLimit: 200,
  throttleMs: 1000,
  template: DEFAULT_TEMPLATE,
  lastRunDate: '',
  updatedAt: '',
});

const getDefaultMessagingConfig = () => ({
  birthday: getDefaultBirthdaySettings(),
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
});

const parseDateOnly = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    const dt = new Date(y, m - 1, d);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const brMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    const d = Number(brMatch[1]);
    const m = Number(brMatch[2]);
    const y = Number(brMatch[3]);
    const dt = new Date(y, m - 1, d);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDateIso = (value) => {
  const dt = value instanceof Date ? value : parseDateOnly(value);
  if (!dt) return '';
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatTime = (value) => {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!match) return '09:00';
  const hh = Math.max(0, Math.min(23, Number(match[1] || 9)));
  const mm = Math.max(0, Math.min(59, Number(match[2] || 0)));
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};

const isBirthdayDay = (birthDate, dateIso) => {
  const birth = parseDateOnly(birthDate);
  const target = parseDateOnly(dateIso);
  if (!birth || !target) return false;
  return birth.getDate() === target.getDate() && birth.getMonth() === target.getMonth();
};

const toDigits = (value) => String(value || '').replace(/\D/g, '');

const buildPatientPhone = (patient = {}) =>
  patient.telefone || patient.phone || patient.celular || patient.whatsapp || '';

const buildPatientName = (patient = {}) =>
  patient.fullName || patient.nome || 'Paciente';

const hasBirthdaySentInYear = (patient = {}, year) => {
  const explicitYear = Number(patient?.birthdayMessageYear || 0);
  if (explicitYear === Number(year)) return true;
  const lastAt = parseDateOnly(patient?.lastBirthdayMessageAt || '');
  return !!lastAt && lastAt.getFullYear() === Number(year);
};

const interpolateTemplate = (template, vars) => {
  let text = String(template || DEFAULT_TEMPLATE);
  Object.keys(vars || {}).forEach((key) => {
    const value = String(vars[key] ?? '');
    text = text.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  });
  return text;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));

const normalizeWhatsappMessaging = (raw = {}) => ({
  enabled: raw?.enabled !== false,
  provider: String(raw?.provider || 'whatsapp_engine').trim().toLowerCase() || 'whatsapp_engine',
  apiUrl: String(raw?.apiUrl || raw?.baseUrl || raw?.url || '').trim(),
  token: decryptSecret(String(raw?.token || raw?.accessToken || '').trim()),
  instanceId: String(raw?.instanceId || raw?.instance || raw?.instance_id || '').trim(),
  clientToken: decryptSecret(String(raw?.clientToken || raw?.client_token || '').trim()),
  phoneNumber: String(raw?.phoneNumber || raw?.senderPhone || raw?.numeroWhatsapp || '').trim(),
  countryCode: String(raw?.countryCode || '55').replace(/\D/g, '').slice(0, 4) || '55',
});

const createBirthdaysService = ({
  patientsPath,
  clinicPath,
  clinicFile,
  ensureDir,
  pathExists,
  readJsonFile,
  writeJsonFile,
  fsPromises,
  getCurrentUser,
  agendaGetDay,
  sendWhatsAppMessage,
  centralBackendAdapter,
}) => {
  const clinicScopedPath = path.join(clinicPath, 'by-clinic');
  const birthdayLogsPath = path.join(clinicPath, 'logs');
  let schedulerTimer = null;
  let schedulerRunning = false;
  let intervalMs = 60 * 60 * 1000;

  const normalizeClinicId = (value) => {
    const normalized = String(value || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID;
    return normalized.replace(/[^a-zA-Z0-9_-]/g, '_');
  };

  const getCurrentClinicId = () => {
    const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    return normalizeClinicId(user?.clinicId || DEFAULT_CLINIC_ID);
  };

  const canUseCentralBirthdaySettings = () => (
    centralBackendAdapter?.isEnabled?.() === true
    && typeof centralBackendAdapter?.getClinicOperationalSettings === 'function'
    && typeof centralBackendAdapter?.updateClinicOperationalSettings === 'function'
  );

  const canUseCentralBirthdayEvents = () => (
    centralBackendAdapter?.isEnabled?.() === true
    && typeof centralBackendAdapter?.createNotificationEvent === 'function'
  );

  const getClinicConfigFile = (clinicId) => path.join(clinicScopedPath, `${normalizeClinicId(clinicId)}`, 'clinica.json');
  const getLegacyClinicConfigFile = (clinicId) => path.join(clinicScopedPath, `${normalizeClinicId(clinicId)}.json`);
  const getBirthdayLogsFile = (clinicId) => path.join(birthdayLogsPath, `birthday-messages-${normalizeClinicId(clinicId)}.json`);

  const readCentralBirthdaySettings = async (clinicId) => {
    if (!canUseCentralBirthdaySettings()) return null;
    try {
      const remote = await centralBackendAdapter.getClinicOperationalSettings(clinicId);
      return {
        ...getDefaultBirthdaySettings(),
        ...(remote?.birthdayMessaging || {}),
      };
    } catch (error) {
      console.warn('[BIRTHDAYS] Falha ao ler birthdayMessaging do backend central:', error?.message || error);
      return null;
    }
  };

  const writeCentralBirthdaySettings = async (clinicId, birthdaySettings = {}) => {
    if (!canUseCentralBirthdaySettings()) return null;
    try {
      const remote = await centralBackendAdapter.updateClinicOperationalSettings(clinicId, {
        birthdayMessaging: {
          ...getDefaultBirthdaySettings(),
          ...(birthdaySettings || {}),
        },
      });
      return {
        ...getDefaultBirthdaySettings(),
        ...(remote?.birthdayMessaging || birthdaySettings || {}),
      };
    } catch (error) {
      console.warn('[BIRTHDAYS] Falha ao salvar birthdayMessaging no backend central:', error?.message || error);
      return null;
    }
  };

  const readClinicConfig = async (clinicIdArg) => {
    const clinicId = normalizeClinicId(clinicIdArg || getCurrentClinicId());
    const scopedFile = getClinicConfigFile(clinicId);
    const legacyScopedFile = getLegacyClinicConfigFile(clinicId);

    let source = null;
    if (await pathExists(scopedFile)) {
      source = scopedFile;
    } else if (await pathExists(legacyScopedFile)) {
      source = legacyScopedFile;
    } else if (clinicId === DEFAULT_CLINIC_ID && (await pathExists(clinicFile))) {
      source = clinicFile;
    }

    if (!source) {
      await ensureDir(clinicScopedPath);
      return { clinicId, messaging: getDefaultMessagingConfig() };
    }

    try {
      const clinic = await readJsonFile(source);
      return {
        ...clinic,
        clinicId,
        messaging: {
          ...getDefaultMessagingConfig(),
          ...(clinic?.messaging || {}),
          birthday: {
            ...getDefaultBirthdaySettings(),
            ...(clinic?.messaging?.birthday || {}),
            sendTime: formatTime(clinic?.messaging?.birthday?.sendTime || '09:00'),
          },
          whatsapp: {
            ...getDefaultMessagingConfig().whatsapp,
            ...normalizeWhatsappMessaging(clinic?.messaging?.whatsapp || {}),
          },
        },
      };
    } catch (_) {
      return { clinicId, messaging: getDefaultMessagingConfig() };
    }
  };

  const readBirthdaySettings = async (clinicIdArg) => {
    const clinicId = normalizeClinicId(clinicIdArg || getCurrentClinicId());
    const clinic = await readClinicConfig(clinicId);
    const localRecord = {
      ...getDefaultBirthdaySettings(),
      ...(clinic?.messaging?.birthday || {}),
      sendTime: formatTime(clinic?.messaging?.birthday?.sendTime || '09:00'),
    };

    const remoteRecord = await readCentralBirthdaySettings(clinicId);
    if (!remoteRecord) return localRecord;

    const shouldSeedCentral = !String(remoteRecord.updatedAt || '').trim() && String(localRecord.updatedAt || '').trim();
    if (shouldSeedCentral) {
      const seededRecord = await writeCentralBirthdaySettings(clinicId, localRecord);
      return {
        ...getDefaultBirthdaySettings(),
        ...(seededRecord || localRecord),
      };
    }

    return {
      ...getDefaultBirthdaySettings(),
      ...remoteRecord,
    };
  };

  const writeClinicBirthdaySettings = async (birthdaySettings = {}, clinicIdArg) => {
    const clinicId = normalizeClinicId(clinicIdArg || getCurrentClinicId());
    const targetFile = getClinicConfigFile(clinicId);
    await ensureDir(path.dirname(targetFile));

    const clinic = await readClinicConfig(clinicId);
    const merged = {
      ...clinic,
      clinicId,
      messaging: {
        ...clinic.messaging,
        birthday: {
          ...getDefaultBirthdaySettings(),
          ...(clinic.messaging?.birthday || {}),
          ...birthdaySettings,
          sendTime: formatTime(birthdaySettings.sendTime || clinic.messaging?.birthday?.sendTime || '09:00'),
        },
      },
    };
    await writeJsonFile(targetFile, merged);
    await writeCentralBirthdaySettings(clinicId, merged?.messaging?.birthday || {}).catch(() => null);
    return merged?.messaging?.birthday || getDefaultBirthdaySettings();
  };

  const ensureLogsFile = async (clinicIdArg) => {
    const clinicId = normalizeClinicId(clinicIdArg || getCurrentClinicId());
    const logsFile = getBirthdayLogsFile(clinicId);
    await ensureDir(birthdayLogsPath);
    if (!(await pathExists(logsFile))) {
      await writeJsonFile(logsFile, { logs: [] });
    }
    return logsFile;
  };

  const appendLog = async (entry, clinicIdArg) => {
    const clinicId = normalizeClinicId(clinicIdArg || getCurrentClinicId());
    const logsFile = await ensureLogsFile(clinicId);
    const data = await readJsonFile(logsFile);
    const logs = Array.isArray(data?.logs) ? data.logs : [];
    logs.push({
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      clinicId,
      ...entry,
    });
    while (logs.length > 5000) logs.shift();
    await writeJsonFile(logsFile, { logs });
  };

  const listLocalHistory = async ({ clinicId, patientId, date, limit = 10 } = {}) => {
    const logsFile = await ensureLogsFile(clinicId);
    const data = await readJsonFile(logsFile).catch(() => ({ logs: [] }));
    const logs = Array.isArray(data?.logs) ? data.logs : [];
    const patientKey = String(patientId || '').trim();
    const dateIso = formatDateIso(date || '');
    return logs
      .filter((entry) => !patientKey || String(entry?.patientId || entry?.prontuario || '').trim() === patientKey)
      .filter((entry) => !dateIso || String(entry?.date || '').trim() === dateIso)
      .sort((a, b) => String(b?.timestamp || '').localeCompare(String(a?.timestamp || '')))
      .slice(0, Math.max(1, Number(limit) || 10))
      .map((entry) => ({
        id: String(entry?.id || '').trim(),
        type: entry?.status === 'success' ? BIRTHDAY_EVENT_TYPES.SENT : BIRTHDAY_EVENT_TYPES.FAILED,
        status: entry?.status === 'success' ? 'sent' : 'failed',
        trigger: String(entry?.trigger || '').trim(),
        timestamp: String(entry?.timestamp || '').trim(),
        patientId: String(entry?.patientId || entry?.prontuario || '').trim(),
        patientName: String(entry?.patientName || '').trim(),
        phone: String(entry?.phone || '').trim(),
        provider: String(entry?.provider || '').trim(),
        instanceId: String(entry?.instanceId || '').trim(),
        clinicSenderPhone: String(entry?.clinicSenderPhone || '').trim(),
        failureReason: String(entry?.error || '').trim(),
        source: 'local_fallback',
      }));
  };

  const createCentralBirthdayEvent = async ({
    clinicId,
    patientId,
    phone,
    type,
    payload = {},
  } = {}) => {
    if (!canUseCentralBirthdayEvents()) return null;
    try {
      return await centralBackendAdapter.createNotificationEvent({
        clinicId: normalizeClinicId(clinicId),
        patientId: String(patientId || '').trim() || null,
        phone: String(phone || '').trim() || null,
        type,
        payload: {
          ...(payload || {}),
          source: 'central',
          messageDomain: 'birthday',
        },
      });
    } catch (error) {
      console.warn('[BIRTHDAYS] Falha ao registrar evento central de aniversario:', error?.message || error);
      return null;
    }
  };

  const listAllPatients = async (clinicIdArg) => {
    const targetClinicId = normalizeClinicId(clinicIdArg || getCurrentClinicId());
    if (centralBackendAdapter?.isEnabled?.() === true && typeof centralBackendAdapter?.getPatients === 'function') {
      try {
        const centralPatients = await centralBackendAdapter.getPatients({ clinicId: targetClinicId });
        if (Array.isArray(centralPatients) && centralPatients.length) {
          return centralPatients;
        }
      } catch (_) {
      }
    }
    if (!(await pathExists(patientsPath))) return [];
    const files = await fsPromises.readdir(patientsPath);
    const list = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const filePath = path.join(patientsPath, file);
      try {
        const patient = await readJsonFile(filePath);
        if (!patient?.prontuario) continue;
        const patientClinicId = normalizeClinicId(patient?.clinicId || DEFAULT_CLINIC_ID);
        if (patientClinicId !== targetClinicId) continue;
        list.push(patient);
      } catch (_) {
      }
    }
    return list;
  };

  const listHistory = async ({ patientId, date, limit = 10 } = {}) => {
    const clinicId = getCurrentClinicId();
    const normalizedPatientId = String(patientId || '').trim();
    const dateIso = formatDateIso(date || '');
    const normalizedLimit = Math.max(1, Math.min(50, Number(limit) || 10));

    if (
      centralBackendAdapter?.isEnabled?.() === true
      && typeof centralBackendAdapter?.listNotificationEvents === 'function'
    ) {
      try {
        const dateFrom = dateIso ? `${dateIso}T00:00:00.000Z` : '';
        const dateTo = dateIso ? `${dateIso}T23:59:59.999Z` : '';
        const events = await centralBackendAdapter.listNotificationEvents({
          clinicId,
          patientId: normalizedPatientId,
          types: [BIRTHDAY_EVENT_TYPES.SENT, BIRTHDAY_EVENT_TYPES.FAILED, BIRTHDAY_EVENT_TYPES.JOB_COMPLETED],
          dateFrom,
          dateTo,
          limit: normalizedLimit,
        });
        return {
          clinicId,
          patientId: normalizedPatientId,
          date: dateIso,
          source: 'central',
          items: (Array.isArray(events) ? events : []).map((event) => ({
            id: String(event?.id || '').trim(),
            type: String(event?.type || '').trim(),
            status: String(event?.type || '').trim() === BIRTHDAY_EVENT_TYPES.FAILED ? 'failed' : 'sent',
            trigger: String(event?.payload?.trigger || '').trim(),
            timestamp: String(event?.payload?.timestamp || event?.createdAt || '').trim(),
            patientId: String(event?.patientId || event?.payload?.patientId || '').trim(),
            patientName: String(event?.payload?.patientName || '').trim(),
            phone: String(event?.phone || event?.payload?.phone || '').trim(),
            provider: String(event?.payload?.provider || '').trim(),
            instanceId: String(event?.payload?.instanceId || '').trim(),
            clinicSenderPhone: String(event?.payload?.clinicSenderPhone || '').trim(),
            failureReason: String(event?.payload?.error || '').trim(),
            source: 'central',
          })),
        };
      } catch (error) {
        console.warn('[BIRTHDAYS] Falha ao carregar historico central de aniversarios:', error?.message || error);
      }
    }

    return {
      clinicId,
      patientId: normalizedPatientId,
      date: dateIso,
      source: 'local_fallback',
      items: await listLocalHistory({
        clinicId,
        patientId: normalizedPatientId,
        date: dateIso,
        limit: normalizedLimit,
      }),
    };
  };

  const canAccessPatient = (patient, clinicIdArg) => {
    const targetClinicId = normalizeClinicId(clinicIdArg || getCurrentClinicId());
    const patientClinicId = normalizeClinicId(patient?.clinicId || DEFAULT_CLINIC_ID);
    if (patientClinicId !== targetClinicId) return false;

    const user = getCurrentUser();
    if (!user || user?.tipo === 'admin' || user?.tipo === 'recepcionista' || user?.tipo === 'recepcao') return true;
    if (user?.tipo === 'dentista') return String(patient?.dentistaId || '') === String(user.id || '');
    return false;
  };

  const listToday = async ({ date } = {}) => {
    const clinicId = getCurrentClinicId();
    const dateIso = formatDateIso(date || new Date());
    const year = Number((dateIso || '').slice(0, 4) || 0);
    const appointments = await agendaGetDay({ date: dateIso });
    const apptNameSet = new Set((appointments || []).map((a) => String(a?.paciente || '').trim().toLowerCase()).filter(Boolean));
    const apptProntSet = new Set((appointments || []).map((a) => String(a?.prontuario || a?.pacienteId || a?.patientId || '').trim()).filter(Boolean));

    const patients = await listAllPatients(clinicId);
    const items = patients
      .filter((patient) => canAccessPatient(patient, clinicId))
      .filter((patient) => isBirthdayDay(patient?.dataNascimento || patient?.birthDate || '', dateIso))
      .map((patient) => {
        const prontuario = patient.prontuario || patient.id || patient._id || '';
        const nome = buildPatientName(patient);
        const telefone = buildPatientPhone(patient);
        const allowsMessages = patient.allowsMessages !== false;
        const hasAppointment = apptProntSet.has(String(prontuario || ''))
          || apptNameSet.has(String(nome || '').trim().toLowerCase());
        const sentYear = hasBirthdaySentInYear(patient, year);
        return {
          prontuario,
          patientId: prontuario,
          nome,
          telefone,
          dataNascimento: patient.dataNascimento || patient.birthDate || '',
          allowsMessages,
          hasAppointment,
          birthdaySentYear: sentYear,
          birthdaySentToday: sentYear && String(patient.lastBirthdayMessageAt || '').startsWith(dateIso),
        };
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

    return {
      date: dateIso,
      clinicId,
      items,
    };
  };

  const readPatientByKey = async (patientId, clinicIdArg) => {
    const clinicId = normalizeClinicId(clinicIdArg || getCurrentClinicId());
    const key = String(patientId || '').trim();
    if (!key) return null;
    if (centralBackendAdapter?.isEnabled?.() === true && typeof centralBackendAdapter?.getPatientById === 'function') {
      try {
        const centralPatient = await centralBackendAdapter.getPatientById(key, { clinicId });
        if (centralPatient) return centralPatient;
      } catch (_) {
      }
    }
    const direct = path.join(patientsPath, `${key}.json`);
    if (await pathExists(direct)) {
      const patient = await readJsonFile(direct);
      const patientClinicId = normalizeClinicId(patient?.clinicId || DEFAULT_CLINIC_ID);
      return patientClinicId === clinicId ? patient : null;
    }
    const patients = await listAllPatients(clinicId);
    return patients.find((p) => String(p.prontuario || p.id || p._id || '') === key) || null;
  };

  const savePatient = async (patient) => {
    const prontuario = patient?.prontuario || patient?.id || patient?._id || '';
    if (!prontuario) throw new Error('Paciente sem prontuario para salvar.');
    const clinicId = normalizeClinicId(patient?.clinicId || getCurrentClinicId());
    if (centralBackendAdapter?.isEnabled?.() === true && typeof centralBackendAdapter?.updatePatient === 'function') {
      try {
        await centralBackendAdapter.updatePatient(prontuario, patient, { clinicId });
      } catch (_) {
      }
    }
    const filePath = path.join(patientsPath, `${prontuario}.json`);
    await writeJsonFile(filePath, patient);
  };

  const sendBirthdayMessage = async ({ patientId, date, trigger = 'manual', force = false } = {}) => {
    const clinicId = getCurrentClinicId();
    const patient = await readPatientByKey(patientId, clinicId);
    if (!patient) throw new Error('Paciente nao encontrado.');
    if (!canAccessPatient(patient, clinicId)) throw new Error('Acesso negado ao paciente.');

    const dateIso = formatDateIso(date || new Date());
    const year = Number((dateIso || '').slice(0, 4) || 0);
    if (!isBirthdayDay(patient?.dataNascimento || patient?.birthDate || '', dateIso)) {
      throw new Error('Paciente nao faz aniversario nesta data.');
    }
    if (patient.allowsMessages === false) {
      throw new Error('Paciente optou por nao receber mensagens.');
    }
    const phone = buildPatientPhone(patient);
    if (!toDigits(phone)) {
      throw new Error('Paciente sem telefone valido.');
    }
    if (!force && hasBirthdaySentInYear(patient, year)) {
      throw new Error('Mensagem de aniversario ja enviada neste ano para este paciente.');
    }

    const clinic = await readClinicConfig(clinicId);
    const birthdayCfg = await readBirthdaySettings(clinicId);
    const messageText = interpolateTemplate(birthdayCfg.template || DEFAULT_TEMPLATE, {
      nome: buildPatientName(patient),
      clinicaNome: clinic?.nomeClinica || clinic?.razaoSocial || 'Voithos',
      telefoneClinica: clinic?.telefone || '',
    });

    try {
      const providerResponse = await sendWhatsAppMessage({
        clinicConfig: clinic,
        to: phone,
        text: messageText,
      });

      const nowIso = new Date().toISOString();
      patient.lastBirthdayMessageAt = nowIso;
      patient.birthdayMessageYear = year;
      await savePatient(patient);

      await createCentralBirthdayEvent({
        clinicId,
        patientId: patient.prontuario || patient.id || patient._id || '',
        phone,
        type: BIRTHDAY_EVENT_TYPES.SENT,
        payload: {
          trigger,
          date: dateIso,
          timestamp: nowIso,
          patientName: buildPatientName(patient),
          provider: String(providerResponse?.provider || 'whatsapp_engine').trim().toLowerCase(),
          instanceId: String(providerResponse?.instanceId || '').trim(),
          clinicSenderPhone: String(providerResponse?.clinicSenderPhone || '').trim(),
        },
      });

      await appendLog({
        status: 'success',
        trigger,
        date: dateIso,
        timestamp: nowIso,
        patientId: patient.prontuario || patient.id || patient._id || '',
        prontuario: patient.prontuario || '',
        patientName: buildPatientName(patient),
        phone,
        provider: String(providerResponse?.provider || 'whatsapp_engine').trim().toLowerCase(),
        instanceId: String(providerResponse?.instanceId || '').trim(),
        clinicSenderPhone: String(providerResponse?.clinicSenderPhone || '').trim(),
      }, clinicId);

      return {
        success: true,
        patientId: patient.prontuario || patient.id || patient._id || '',
        patientName: buildPatientName(patient),
        phone,
        providerResponse,
      };
    } catch (err) {
      await appendLog({
        status: 'error',
        trigger,
        date: dateIso,
        timestamp: new Date().toISOString(),
        patientId: patient.prontuario || patient.id || patient._id || '',
        prontuario: patient.prontuario || '',
        patientName: buildPatientName(patient),
        phone,
        provider: 'whatsapp_engine',
        instanceId: '',
        clinicSenderPhone: '',
        error: err?.message || String(err),
      }, clinicId);
      await createCentralBirthdayEvent({
        clinicId,
        patientId: patient.prontuario || patient.id || patient._id || '',
        phone,
        type: BIRTHDAY_EVENT_TYPES.FAILED,
        payload: {
          trigger,
          date: dateIso,
          timestamp: new Date().toISOString(),
          patientName: buildPatientName(patient),
          provider: 'whatsapp_engine',
          error: err?.message || String(err),
        },
      });
      throw err;
    }
  };

  const runDailyJob = async ({ date, trigger = 'scheduler', force = false } = {}) => {
    const clinicId = getCurrentClinicId();
    const activeUser = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    const dateIso = formatDateIso(date || new Date());
    if (!force && (!activeUser?.clinicId || clinicId === DEFAULT_CLINIC_ID)) {
      return { skipped: true, reason: 'missing_clinic_context', sent: 0, date: dateIso };
    }
    const clinic = await readClinicConfig(clinicId);
    const birthdayCfg = await readBirthdaySettings(clinicId);
    const timeNow = new Date();
    const nowHHMM = `${String(timeNow.getHours()).padStart(2, '0')}:${String(timeNow.getMinutes()).padStart(2, '0')}`;
    const sendTime = formatTime(birthdayCfg.sendTime || '09:00');

    if (!birthdayCfg.enabled && !force) {
      return { skipped: true, reason: 'disabled', sent: 0, date: dateIso };
    }
    if (birthdayCfg.draftMode && !force) {
      return { skipped: true, reason: 'draft_mode', sent: 0, date: dateIso };
    }
    if (!force && dateIso === formatDateIso(new Date()) && nowHHMM < sendTime) {
      return { skipped: true, reason: 'before_send_time', sent: 0, date: dateIso, sendTime };
    }
    if (!force && String(birthdayCfg.lastRunDate || '') === dateIso) {
      return { skipped: true, reason: 'already_ran_today', sent: 0, date: dateIso };
    }

    const list = await listToday({ date: dateIso });
    const limit = Math.max(1, Number(birthdayCfg.dailyLimit || 200));
    const throttleMs = Math.max(0, Number(birthdayCfg.throttleMs || 1000));
    const eligible = (list.items || [])
      .filter((item) => item.allowsMessages !== false)
      .filter((item) => toDigits(item.telefone).length >= 10)
      .filter((item) => !item.birthdaySentYear)
      .slice(0, limit);

    let sent = 0;
    let failed = 0;
    for (let i = 0; i < eligible.length; i += 1) {
      const item = eligible[i];
      try {
        await sendBirthdayMessage({
          patientId: item.patientId || item.prontuario,
          date: dateIso,
          trigger,
          force: false,
        });
        sent += 1;
      } catch (_) {
        failed += 1;
      }
      if (i < eligible.length - 1 && throttleMs > 0) {
        await sleep(throttleMs);
      }
    }

    await writeClinicBirthdaySettings({
      ...birthdayCfg,
      lastRunDate: dateIso,
      updatedAt: new Date().toISOString(),
    }, clinicId);

    await createCentralBirthdayEvent({
      clinicId,
      type: BIRTHDAY_EVENT_TYPES.JOB_COMPLETED,
      payload: {
        trigger,
        date: dateIso,
        total: list.items.length,
        eligible: eligible.length,
        sent,
        failed,
        limit,
        source: 'central',
      },
    });

    return {
      skipped: false,
      clinicId,
      date: dateIso,
      total: list.items.length,
      eligible: eligible.length,
      sent,
      failed,
      limit,
    };
  };

  const startDailyScheduler = ({ intervalMinutes = 60 } = {}) => {
    intervalMs = Math.max(1, Number(intervalMinutes || 60)) * 60 * 1000;
    if (schedulerTimer) clearInterval(schedulerTimer);
    schedulerTimer = setInterval(async () => {
      if (schedulerRunning) return;
      schedulerRunning = true;
      try {
        await runDailyJob({ trigger: 'scheduler', force: false });
      } catch (_) {
      } finally {
        schedulerRunning = false;
      }
    }, intervalMs);
    return { started: true, intervalMs };
  };

  const stopDailyScheduler = () => {
    if (schedulerTimer) {
      clearInterval(schedulerTimer);
      schedulerTimer = null;
    }
    return { stopped: true };
  };

  return {
    getDefaultBirthdaySettings,
    getDefaultMessagingConfig,
    listToday,
    listHistory,
    sendBirthdayMessage,
    runDailyJob,
    startDailyScheduler,
    stopDailyScheduler,
  };
};

module.exports = { createBirthdaysService };

