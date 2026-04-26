const path = require('path');

const { listCampaignTemplatesCatalog, getCampaignTemplateById } = require('../shared/campaign-template-catalog');

const DEFAULT_CLINIC_ID = 'defaultClinic';

const createCampanhasService = ({
  campaignsPath,
  campaignsFile,
  campaignsGlobalPath,
  campaignsGlobalFile,
  patientsPath,
  agendaPath,
  plansFile,
  financeFile,
  fsPromises,
  readJsonFile,
  writeJsonFile,
  pathExists,
  ensureDir,
  getCurrentUser,
  readSessionCache,
  centralBackendAdapter,
}) => {
  const campaignLogsFile = path.join(campaignsPath, 'campaign_logs.json');
  const campaignBatchesFile = path.join(campaignsPath, 'campaign_send_batches.json');
  const getCurrentClinicId = () => {
    const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    return String(user?.clinicId || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID;
  };
  const canUseCentralCampaigns = () => (
    centralBackendAdapter?.isEnabled?.() === true
    && typeof centralBackendAdapter?.listClinicCampaignsWithToken === 'function'
    && typeof centralBackendAdapter?.replaceClinicCampaignsWithToken === 'function'
    && typeof centralBackendAdapter?.createClinicCampaignWithToken === 'function'
    && typeof centralBackendAdapter?.updateClinicCampaignWithToken === 'function'
    && typeof centralBackendAdapter?.deleteClinicCampaignWithToken === 'function'
  );
  const canUseCentralCampaignOperations = () => (
    canUseCentralCampaigns()
    && typeof centralBackendAdapter?.getCampaignDashboardWithToken === 'function'
    && typeof centralBackendAdapter?.resolveCampaignAudienceWithToken === 'function'
    && typeof centralBackendAdapter?.createCampaignBatchWithToken === 'function'
    && typeof centralBackendAdapter?.updateCampaignDispatchWithToken === 'function'
    && typeof centralBackendAdapter?.listCampaignDispatchLogsWithToken === 'function'
    && typeof centralBackendAdapter?.getCampaignResultWithToken === 'function'
  );
  const canUseCentralCampaignTemplates = () => (
    canUseCentralCampaigns()
    && typeof centralBackendAdapter?.listCampaignTemplatesWithToken === 'function'
  );
  const getUserToken = async () => {
    if (typeof readSessionCache !== 'function') return '';
    const session = await readSessionCache().catch(() => null);
    return String(session?.remoteToken || session?.token || '').trim();
  };

  const normalizeClinicId = (value) => String(value || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID;

  const buildGlobalId = (camp, fallbackIndex) => {
    const nome = String(camp?.nome || camp?.titulo || 'campanha')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const periodo = String(camp?.periodo || '')
      .replace(/[^0-9]+/g, '')
      .slice(0, 6);
    const base = [nome, periodo].filter(Boolean).join('-') || `campanha-${fallbackIndex}`;
    return `global-${base}`;
  };

  const normalizeCampaign = (camp = {}, overrides = {}) => {
    const raw = { ...camp };
    if (!raw.nome && raw.titulo) raw.nome = raw.titulo;

    const origem = overrides.origem || raw.origem || 'clinica';
    const clinicId = normalizeClinicId(overrides.clinicId || raw.clinicId);

    return {
      ...raw,
      ...overrides,
      clinicId,
      id: raw.id || overrides.id || '',
      nome: raw.nome || 'Campanha',
      periodo: raw.periodo || '',
      cor: raw.cor || '#2a9d8f',
      descricao: raw.descricao || '',
      status: ['rascunho', 'ativa', 'agendada', 'pausada', 'concluida', 'inativa'].includes(raw.status) ? raw.status : 'ativa',
      origem,
      somenteLeitura: origem === 'voithos',
      publico: raw.publico || 'pacientes_clinica',
      publicoLabel: raw.publicoLabel || 'Pacientes da clinica',
      criadoPor: raw.criadoPor || '',
      dataCriacao: raw.dataCriacao || '',
      dataAtualizacao: raw.dataAtualizacao || '',
    };
  };

  const nowIso = () => new Date().toISOString();
  const dayKey = (dateLike) => {
    const dt = dateLike ? new Date(dateLike) : new Date();
    if (Number.isNaN(dt.getTime())) return '';
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };
  const toCampaignDate = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(`${raw}T00:00:00`);
    if (/^\d{4}-\d{2}$/.test(raw)) return new Date(`${raw}-01T00:00:00`);
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return null;
    return dt;
  };
  const normalizeCampaignStatus = (value) => {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'rascunho') return 'rascunho';
    if (raw === 'ativa') return 'ativa';
    if (raw === 'agendada') return 'agendada';
    if (raw === 'pausada') return 'pausada';
    if (raw === 'concluida' || raw === 'concluída') return 'concluida';
    if (raw === 'inativa') return 'inativa';
    return 'ativa';
  };

  const normalizeLogStatus = (value) => {
    const raw = String(value || '').trim().toUpperCase();
    if (raw === 'FAILED') return 'FAILED';
    if (raw === 'DELIVERED') return 'DELIVERED';
    if (raw === 'READ') return 'READ';
    if (raw === 'REPLIED') return 'REPLIED';
    return 'SENT';
  };
  const normalizeLogChannel = (value) => {
    const raw = String(value || '').trim().toUpperCase();
    if (raw === 'SMS') return 'SMS';
    if (raw === 'EMAIL') return 'EMAIL';
    return 'WHATSAPP';
  };
  const generateLogId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const generateSendBatchId = () => `batch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  const ensureCampaignLogsFile = async () => {
    await ensureDir(campaignsPath);
    if (!(await pathExists(campaignLogsFile))) {
      await writeJsonFile(campaignLogsFile, { logs: [] });
    }
  };

  const readCampaignLogs = async () => {
    await ensureCampaignLogsFile();
    const payload = await readJsonFile(campaignLogsFile);
    const list = Array.isArray(payload?.logs) ? payload.logs : [];
    return list.map((item) => ({
      logId: String(item?.logId || generateLogId()),
      clinicId: normalizeClinicId(item?.clinicId),
      campaignId: String(item?.campaignId || '').trim(),
      patientId: String(item?.patientId || '').trim(),
      sendBatchId: String(item?.sendBatchId || '').trim(),
      channel: normalizeLogChannel(item?.channel),
      status: normalizeLogStatus(item?.status),
      createdAt: item?.createdAt || nowIso(),
      errorMessage: String(item?.errorMessage || '').trim(),
    }));
  };

  const writeCampaignLogs = async (logs) => {
    await ensureCampaignLogsFile();
    await writeJsonFile(campaignLogsFile, { logs: Array.isArray(logs) ? logs : [] });
  };

  const ensureCampaignBatchesFile = async () => {
    await ensureDir(campaignsPath);
    if (!(await pathExists(campaignBatchesFile))) {
      await writeJsonFile(campaignBatchesFile, { batches: [], recipients: [] });
    }
  };

  const readCampaignBatchesPayload = async () => {
    await ensureCampaignBatchesFile();
    const payload = await readJsonFile(campaignBatchesFile).catch(() => null);
    return {
      batches: Array.isArray(payload?.batches) ? payload.batches : [],
      recipients: Array.isArray(payload?.recipients) ? payload.recipients : [],
    };
  };

  const writeCampaignBatchesPayload = async ({ batches, recipients }) => {
    await ensureCampaignBatchesFile();
    await writeJsonFile(campaignBatchesFile, {
      batches: Array.isArray(batches) ? batches : [],
      recipients: Array.isArray(recipients) ? recipients : [],
    });
  };

  const purgeLocalCampaignArtifacts = async ({ clinicId, campaignIds = [] } = {}) => {
    const normalizedClinicId = normalizeClinicId(clinicId || getCurrentClinicId());
    const normalizedCampaignIds = Array.from(new Set(
      (Array.isArray(campaignIds) ? campaignIds : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    ));
    if (!normalizedCampaignIds.length) return { logsRemoved: 0, batchesRemoved: 0 };

    const [logs, batchesState] = await Promise.all([
      readCampaignLogs(),
      readCampaignBatchesPayload(),
    ]);

    const logsBefore = logs.length;
    const nextLogs = logs.filter((item) => !(
      normalizeClinicId(item?.clinicId) === normalizedClinicId
      && normalizedCampaignIds.includes(String(item?.campaignId || '').trim())
    ));
    if (nextLogs.length !== logsBefore) {
      await writeCampaignLogs(nextLogs);
    }

    const batchesBefore = batchesState.batches.length + batchesState.recipients.length;
    const nextBatches = batchesState.batches.filter((item) => !(
      normalizeClinicId(item?.clinicId) === normalizedClinicId
      && normalizedCampaignIds.includes(String(item?.campaignId || '').trim())
    ));
    const nextRecipients = batchesState.recipients.filter((item) => !(
      normalizeClinicId(item?.clinicId) === normalizedClinicId
      && normalizedCampaignIds.includes(String(item?.campaignId || '').trim())
    ));
    if (nextBatches.length !== batchesState.batches.length || nextRecipients.length !== batchesState.recipients.length) {
      await writeCampaignBatchesPayload({ batches: nextBatches, recipients: nextRecipients });
    }

    return {
      logsRemoved: logsBefore - nextLogs.length,
      batchesRemoved: batchesBefore - (nextBatches.length + nextRecipients.length),
    };
  };

  const isValidPeriodo = (value) => {
    if (!value) return true;
    return /^\d{4}-\d{2}$/.test(String(value));
  };

  const isValidHexColor = (value) => {
    if (!value) return true;
    const raw = String(value).trim();
    return /^#?[0-9a-fA-F]{6}$/.test(raw);
  };

  const validateGlobalCampaignList = (payload = []) => {
    if (!Array.isArray(payload)) {
      throw new Error('Lista de campanhas invalida.');
    }
    const errors = [];
    payload.forEach((camp, idx) => {
      if (!camp || typeof camp !== 'object') {
        errors.push(`#${idx + 1}: item invalido`);
        return;
      }
      const nome = camp.nome || camp.titulo;
      if (!nome) {
        errors.push(`#${idx + 1}: nome/titulo obrigatorio`);
      }
      if (!isValidPeriodo(camp.periodo)) {
        errors.push(`#${idx + 1}: periodo invalido (use AAAA-MM)`);
      }
      if (!isValidHexColor(camp.cor)) {
        errors.push(`#${idx + 1}: cor invalida (use #RRGGBB)`);
      }
      if (camp.status && !['ativa', 'inativa'].includes(camp.status)) {
        errors.push(`#${idx + 1}: status invalido`);
      }
      if (camp.publico && camp.publico !== 'pacientes_clinica') {
        errors.push(`#${idx + 1}: publico invalido`);
      }
    });
    if (errors.length) {
      throw new Error(`Campanhas globais invalidas: ${errors.join('; ')}`);
    }
  };

  const normalizeGlobalCampaign = (camp = {}, index = 0) => {
    const id = camp.id || buildGlobalId(camp, index);
    return normalizeCampaign(camp, { origem: 'voithos', id, clinicId: DEFAULT_CLINIC_ID });
  };

  const generateCampaignId = () =>
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const readAllLocalCampaigns = async () => {
    await ensureDir(campaignsPath);
    if (!(await pathExists(campaignsFile))) return [];
    try {
      const data = await readJsonFile(campaignsFile);
      if (!Array.isArray(data)) return [];
      return data.map((camp) => normalizeCampaign(camp, { origem: 'clinica' }));
    } catch (err) {
      console.error('Erro ao ler campanhas locais:', err);
      return [];
    }
  };

  const writeAllLocalCampaigns = async (data) => {
    await ensureDir(campaignsPath);
    await writeJsonFile(campaignsFile, data);
  };

  const readClinicCampaigns = async () => {
    const clinicId = getCurrentClinicId();
    const localCampaigns = await readAllLocalCampaigns();

    if (canUseCentralCampaigns()) {
      const userToken = await getUserToken();
      if (userToken) {
        try {
          const remote = await centralBackendAdapter.listClinicCampaignsWithToken(userToken);
          const normalizedRemote = (Array.isArray(remote) ? remote : [])
            .map((camp) => normalizeCampaign(camp, { origem: 'clinica', clinicId }))
            .filter((camp) => normalizeClinicId(camp?.clinicId) === clinicId);
          const shouldSeedCentral = normalizedRemote.length === 0 && localCampaigns.length > 0;
          const effective = shouldSeedCentral
            ? (await centralBackendAdapter.replaceClinicCampaignsWithToken(userToken, localCampaigns)).map((camp) => normalizeCampaign(camp, { origem: 'clinica', clinicId }))
            : normalizedRemote;
          const removedCampaignIds = localCampaigns
            .map((camp) => String(camp?.id || '').trim())
            .filter((id) => id && !effective.some((current) => String(current?.id || '').trim() === id));
          if (removedCampaignIds.length) {
            await purgeLocalCampaignArtifacts({ clinicId, campaignIds: removedCampaignIds }).catch(() => null);
          }
          await writeAllLocalCampaigns(effective).catch(() => null);
          return effective;
        } catch (_) {
          // fallback local
        }
      }
    }

    return localCampaigns;
  };

  const upsertLocalCampaign = async (campaign) => {
    const list = await readAllLocalCampaigns();
    const next = [campaign, ...list.filter((item) => String(item?.id || '').trim() !== String(campaign?.id || '').trim())];
    await writeAllLocalCampaigns(next);
    return campaign;
  };

  const removeLocalCampaign = async (id) => {
    const normalizedId = String(id || '').trim();
    const list = await readAllLocalCampaigns();
    const next = list.filter((item) => String(item?.id || '').trim() !== normalizedId);
    await writeAllLocalCampaigns(next);
    return { success: true };
  };

  const readClinicPatients = async (clinicId) => {
    if (!patientsPath || !fsPromises) return [];
    if (!(await pathExists(patientsPath))) return [];
    const files = await fsPromises.readdir(patientsPath).catch(() => []);
    const list = [];
    for (const file of files) {
      if (!String(file).endsWith('.json')) continue;
      try {
        const item = await readJsonFile(path.join(patientsPath, file));
        if (!item || typeof item !== 'object') continue;
        if (normalizeClinicId(item.clinicId) !== clinicId) continue;
        list.push(item);
      } catch (_) {
      }
    }
    return list;
  };

  const toPatientKeyCandidates = (item = {}) => {
    const keys = [
      item.prontuario,
      item.patientId,
      item.pacienteId,
      item.id,
      item._id,
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    return Array.from(new Set(keys));
  };

  const readAgendaAppointments = async ({ clinicId, dateFrom = null } = {}) => {
    if (!agendaPath || !fsPromises) return [];
    if (!(await pathExists(agendaPath))) return [];
    const files = await fsPromises.readdir(agendaPath).catch(() => []);
    const result = [];
    for (const file of files) {
      if (!String(file).endsWith('.json')) continue;
      try {
        const payload = await readJsonFile(path.join(agendaPath, file));
        const list = Array.isArray(payload?.agendamentos) ? payload.agendamentos : [];
        for (const appt of list) {
          if (normalizeClinicId(appt?.clinicId) !== clinicId) continue;
          if (dateFrom && String(appt?.data || '') < dateFrom) continue;
          result.push(appt);
        }
      } catch (_) {
      }
    }
    return result;
  };

  const getAppointmentCreatedAt = (appt = {}) => {
    const dataCriacao = String(appt?.dataCriacao || '').trim();
    const horaCriacao = String(appt?.horaCriacao || '').trim();
    if (dataCriacao) {
      const dt = new Date(`${dataCriacao}T${horaCriacao || '00:00'}:00`);
      if (!Number.isNaN(dt.getTime())) return dt.toISOString();
    }
    const data = String(appt?.data || '').trim();
    const hora = String(appt?.horaInicio || '').trim();
    if (data) {
      const dt = new Date(`${data}T${hora || '00:00'}:00`);
      if (!Number.isNaN(dt.getTime())) return dt.toISOString();
    }
    return null;
  };

  const readPlans = async () => {
    if (!plansFile || !(await pathExists(plansFile))) return [];
    const payload = await readJsonFile(plansFile).catch(() => null);
    return Array.isArray(payload?.plans) ? payload.plans : [];
  };

  const readFinanceRows = async () => {
    if (!financeFile || !(await pathExists(financeFile))) return [];
    const payload = await readJsonFile(financeFile).catch(() => null);
    return Array.isArray(payload?.lancamentos) ? payload.lancamentos : [];
  };

  const normalizeMoney = (value) => {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    let raw = String(value).trim();
    if (!raw) return 0;
    if (raw.includes(',') && raw.includes('.')) {
      raw = raw.replace(/\./g, '').replace(',', '.');
    } else if (raw.includes(',')) {
      raw = raw.replace(',', '.');
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const normalizeDateOnly = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return '';
    return dt.toISOString().slice(0, 10);
  };

  const getPatientIdentityMap = (patients = []) => {
    const map = new Map();
    patients.forEach((patient) => {
      const keys = toPatientKeyCandidates(patient);
      keys.forEach((key) => {
        if (!map.has(key)) map.set(key, patient);
      });
    });
    return map;
  };

  const readLocalCampaigns = async () => {
    const clinicId = getCurrentClinicId();
    const list = await readAllLocalCampaigns();
    return list.filter((camp) => normalizeClinicId(camp.clinicId) === clinicId);
  };

  const readGlobalCampaigns = async () => {
    if (!campaignsGlobalPath || !campaignsGlobalFile) return [];
    await ensureDir(campaignsGlobalPath);
    if (!(await pathExists(campaignsGlobalFile))) return [];
    try {
      const data = await readJsonFile(campaignsGlobalFile);
      if (!Array.isArray(data)) return [];
      return data.map((camp, idx) => normalizeGlobalCampaign(camp, idx));
    } catch (err) {
      console.error('Erro ao ler campanhas globais:', err);
      return [];
    }
  };

  const listGlobalCampaigns = async () => readGlobalCampaigns();

  const saveGlobalCampaigns = async (payload = []) => {
    if (!campaignsGlobalPath || !campaignsGlobalFile) {
      throw new Error('Campanhas globais indisponiveis.');
    }
    validateGlobalCampaignList(payload);
    await ensureDir(campaignsGlobalPath);
    const list = payload.map((camp, idx) => normalizeGlobalCampaign(camp, idx));
    const seen = new Set();
    const unique = list.map((camp, idx) => {
      let id = camp.id;
      if (seen.has(id)) {
        id = `${id}-${idx + 1}`;
      }
      seen.add(id);
      return { ...camp, id };
    });
    await writeJsonFile(campaignsGlobalFile, unique);
    return unique;
  };

  const listCampaigns = async () => {
    const [locals, globals] = await Promise.all([
      readClinicCampaigns(),
      readGlobalCampaigns(),
    ]);

    const mergedMap = new Map();
    globals.forEach((camp) => {
      mergedMap.set(camp.id, camp);
    });
    locals.forEach((camp) => {
      mergedMap.set(camp.id, camp);
    });

    const merged = Array.from(mergedMap.values());
    const currentUser = getCurrentUser();
    if (currentUser?.tipo === 'dentista') {
      return merged.filter((c) => (c.status || 'ativa') === 'ativa');
    }
    return merged;
  };

  const createCampaignSendBatch = async (payload = {}) => {
    const clinicId = getCurrentClinicId();
    const campaignId = String(payload?.campaignId || '').trim();
    if (!campaignId) throw new Error('campaignId obrigatorio.');
    const selectedPatientIds = Array.isArray(payload?.selectedPatientIds) ? payload.selectedPatientIds : [];

    if (canUseCentralCampaignOperations()) {
      const userToken = await getUserToken();
      if (userToken) {
        try {
          const remote = await centralBackendAdapter.createCampaignBatchWithToken(userToken, campaignId, {
            force: payload?.force === true,
            selectedPatientIds,
            templateId: payload?.templateId || '',
          });
          console.info('[CAMPANHAS]', JSON.stringify({
            action: 'campaign_batch_created',
            clinicId,
            campaignId,
            batchId: String(remote?.batchId || remote?.sendBatchId || '').trim(),
            audienceSize: Number(remote?.audienceCount || 0),
            campaign_source: 'central',
          }));
          return remote;
        } catch (error) {
          console.warn('[CAMPANHAS] central batch create failed', error?.message || error);
          console.info('[CAMPANHAS]', JSON.stringify({
            action: 'campaign_batch_created',
            clinicId,
            campaignId,
            campaign_source: 'central',
            campaign_fallback_to_local: true,
            reason: error?.message || String(error || ''),
          }));
        }
      }
    }

    const sendBatchId = String(payload?.sendBatchId || generateSendBatchId()).trim();
    const segmentKey = String(payload?.segmentKey || 'all_active').trim().toLowerCase();
    const audienceCount = Math.max(0, Number(payload?.audienceCount) || 0);
    const createdAt = payload?.createdAt || nowIso();
    const state = await readCampaignBatchesPayload();
    state.batches.push({
      sendBatchId,
      clinicId,
      campaignId,
      createdAt,
      segmentKey,
      audienceCount,
      sentCount: 0,
      failedCount: 0,
      updatedAt: createdAt,
    });
    await writeCampaignBatchesPayload(state);
    return {
      sendBatchId,
      clinicId,
      campaignId,
      createdAt,
      segmentKey,
      audienceCount,
      sentCount: 0,
      failedCount: 0,
    };
  };

  const recordCampaignDeliveryLog = async (payload = {}) => {
    const clinicId = getCurrentClinicId();
    const campaignId = String(payload?.campaignId || '').trim();
    if (!campaignId) throw new Error('campaignId obrigatorio.');

    if (canUseCentralCampaignOperations()) {
      const userToken = await getUserToken();
      const dispatchId = String(payload?.dispatchId || '').trim();
      if (userToken && dispatchId) {
        try {
          const remote = await centralBackendAdapter.updateCampaignDispatchWithToken(userToken, dispatchId, {
            status: payload?.status,
            provider: payload?.provider || 'WHATSAPP_NG',
            providerMessageId: payload?.providerMessageId || '',
            errorMessage: payload?.errorMessage || '',
            metadata: payload?.metadata || null,
          });
          console.info('[CAMPANHAS]', JSON.stringify({
            action: 'campaign_dispatch_logged',
            clinicId,
            campaignId,
            batchId: String(remote?.batchId || payload?.sendBatchId || '').trim(),
            dispatchId,
            status: String(remote?.status || payload?.status || '').trim(),
            campaign_source: 'central',
          }));
          return remote;
        } catch (error) {
          console.warn('[CAMPANHAS] central dispatch update failed', error?.message || error);
          console.info('[CAMPANHAS]', JSON.stringify({
            action: 'campaign_dispatch_logged',
            clinicId,
            campaignId,
            dispatchId,
            campaign_source: 'central',
            campaign_fallback_to_local: true,
            reason: error?.message || String(error || ''),
          }));
        }
      }
    }

    const logs = await readCampaignLogs();
    const entry = {
      logId: generateLogId(),
      clinicId,
      campaignId,
      patientId: String(payload?.patientId || '').trim(),
      sendBatchId: String(payload?.sendBatchId || '').trim(),
      channel: normalizeLogChannel(payload?.channel),
      status: normalizeLogStatus(payload?.status),
      createdAt: payload?.createdAt || nowIso(),
      errorMessage: String(payload?.errorMessage || '').trim(),
    };
    logs.push(entry);
    await writeCampaignLogs(logs);

    const sendBatchId = String(payload?.sendBatchId || '').trim();
    if (sendBatchId) {
      const state = await readCampaignBatchesPayload();
      const batchIdx = state.batches.findIndex((item) =>
        normalizeClinicId(item?.clinicId) === clinicId
        && String(item?.campaignId || '').trim() === campaignId
        && String(item?.sendBatchId || '').trim() === sendBatchId);
      if (batchIdx >= 0) {
        const recipientKey = `${sendBatchId}::${entry.patientId}`;
        const recipientIdx = state.recipients.findIndex((item) =>
          `${String(item?.sendBatchId || '').trim()}::${String(item?.patientId || '').trim()}` === recipientKey);
        const recipientPayload = {
          sendBatchId,
          clinicId,
          campaignId,
          patientId: entry.patientId,
          status: entry.status,
          createdAt: entry.createdAt,
          errorMessage: entry.errorMessage,
        };
        if (recipientIdx >= 0) {
          state.recipients[recipientIdx] = { ...state.recipients[recipientIdx], ...recipientPayload };
        } else {
          state.recipients.push(recipientPayload);
        }

        const recipients = state.recipients.filter((item) =>
          normalizeClinicId(item?.clinicId) === clinicId
          && String(item?.sendBatchId || '').trim() === sendBatchId);
        const sentCount = recipients.filter((item) => normalizeLogStatus(item?.status) === 'SENT').length;
        const failedCount = recipients.filter((item) => normalizeLogStatus(item?.status) === 'FAILED').length;
        state.batches[batchIdx] = {
          ...state.batches[batchIdx],
          sentCount,
          failedCount,
          updatedAt: nowIso(),
        };
        await writeCampaignBatchesPayload(state);
      }
    }

    return entry;
  };

  const listCampaignTemplates = async () => {
    if (canUseCentralCampaignTemplates()) {
      const userToken = await getUserToken();
      if (userToken) {
        try {
          const remote = await centralBackendAdapter.listCampaignTemplatesWithToken(userToken);
          if (remote?.monthly || Array.isArray(remote?.annualTemplates)) {
            return remote;
          }
        } catch (error) {
          console.warn('[CAMPANHAS] central templates unavailable', error?.message || error);
        }
      }
    }
    return listCampaignTemplatesCatalog();
  };

  const getCampaignsDashboard = async () => {
    const clinicId = getCurrentClinicId();
    if (canUseCentralCampaignOperations()) {
      const userToken = await getUserToken();
      if (userToken) {
        try {
          const remote = await centralBackendAdapter.getCampaignDashboardWithToken(userToken);
          console.info('[CAMPANHAS]', JSON.stringify({
            action: 'campaign_analytics_loaded',
            clinicId,
            campaign_source: 'central',
          }));
          return remote || {};
        } catch (error) {
          console.warn('[CAMPANHAS] central dashboard unavailable', error?.message || error);
        }
      }
    }
    const [campaigns, logs] = await Promise.all([listCampaigns(), readCampaignLogs()]);
    const clinicLogs = logs.filter((item) => normalizeClinicId(item?.clinicId) === clinicId);
    const today = dayKey(new Date());
    const logsToday = clinicLogs.filter((item) => dayKey(item?.createdAt) === today);
    const sentToday = logsToday.filter((item) => item.status === 'SENT').length;
    const failedToday = logsToday.filter((item) => item.status === 'FAILED').length;
    const attempts = sentToday + failedToday;
    const deliveryRateToday = attempts > 0 ? (sentToday / attempts) : null;

    const eligible = (Array.isArray(campaigns) ? campaigns : [])
      .map((camp) => ({ ...camp, status: normalizeCampaignStatus(camp?.status) }))
      .filter((camp) => camp.status === 'ativa' || camp.status === 'agendada')
      .map((camp) => ({ ...camp, inicioDate: toCampaignDate(camp?.inicio) }))
      .filter((camp) => camp.inicioDate && !Number.isNaN(camp.inicioDate.getTime()))
      .filter((camp) => camp.inicioDate.getTime() > Date.now())
      .sort((a, b) => a.inicioDate.getTime() - b.inicioDate.getTime());

    const next = eligible[0] || null;
    const lastSent = clinicLogs
      .filter((item) => item.status === 'SENT')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] || null;

    const activeCampaigns = (Array.isArray(campaigns) ? campaigns : [])
      .map((camp) => normalizeCampaignStatus(camp?.status))
      .filter((status) => status === 'ativa' || status === 'agendada')
      .length;

    return {
      sentToday,
      failedToday,
      deliveryRateToday,
      responseRate: null,
      nextEligibleSend: next ? {
        id: String(next.id || '').trim(),
        nome: next.nome || 'Campanha',
        inicio: next.inicio || '',
        status: normalizeCampaignStatus(next.status),
        canal: next.canal || '',
      } : null,
      activeCampaigns,
      lastSendAt: lastSent?.createdAt || null,
      updatedAt: nowIso(),
    };
  };

  const listCampaignLogs = async ({
    dateFrom,
    dateTo,
    status,
    campaignId,
    page = 1,
    limit = 50,
  } = {}) => {
    const clinicId = getCurrentClinicId();
    if (canUseCentralCampaignOperations()) {
      const userToken = await getUserToken();
      if (userToken) {
        try {
          const remote = await centralBackendAdapter.listCampaignDispatchLogsWithToken(userToken, {
            dateFrom,
            dateTo,
            status,
            campaignId,
            page,
            limit,
          });
          return remote || { items: [], total: 0, page: 1, limit: 50, hasMore: false };
        } catch (error) {
          console.warn('[CAMPANHAS] central logs unavailable', error?.message || error);
        }
      }
    }
    const [allLogs, campaigns, patients] = await Promise.all([
      readCampaignLogs(),
      listCampaigns(),
      readClinicPatients(clinicId),
    ]);
    const campaignMap = new Map((Array.isArray(campaigns) ? campaigns : []).map((camp) => [String(camp?.id || '').trim(), camp]));
    const patientMap = getPatientIdentityMap(patients);
    const statusFilter = normalizeLogStatus(status || '');
    const hasStatusFilter = Boolean(String(status || '').trim());
    const fromKey = normalizeDateOnly(dateFrom);
    const toKey = normalizeDateOnly(dateTo);
    const filtered = allLogs
      .filter((item) => normalizeClinicId(item?.clinicId) === clinicId)
      .filter((item) => !campaignId || String(item?.campaignId || '').trim() === String(campaignId || '').trim())
      .filter((item) => !hasStatusFilter || item.status === statusFilter)
      .filter((item) => {
        const key = dayKey(item?.createdAt);
        if (fromKey && key < fromKey) return false;
        if (toKey && key > toKey) return false;
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));
    const safePage = Math.max(1, Number(page) || 1);
    const start = (safePage - 1) * safeLimit;
    const pageItems = filtered.slice(start, start + safeLimit).map((item) => {
      const camp = campaignMap.get(String(item.campaignId || '').trim());
      const patient = patientMap.get(String(item.patientId || '').trim());
      return {
        ...item,
        campaignName: camp?.nome || 'Campanha',
        patientName: patient?.fullName || patient?.nome || item.patientId || '--',
        sendBatchId: String(item?.sendBatchId || '').trim(),
      };
    });

    return {
      items: pageItems,
      total: filtered.length,
      page: safePage,
      limit: safeLimit,
      hasMore: start + safeLimit < filtered.length,
    };
  };

  const resolveAudience = async ({ segmentKey, filters = {}, templateId = '' } = {}) => {
    const clinicId = getCurrentClinicId();
    const template = templateId ? getCampaignTemplateById(templateId) : null;
    const normalizedKey = String(template?.segmentType || segmentKey || 'all_active').trim().toLowerCase();
    if (canUseCentralCampaignOperations()) {
      const userToken = await getUserToken();
      if (userToken) {
        try {
          const remote = await centralBackendAdapter.resolveCampaignAudienceWithToken(userToken, {
            segmentKey: normalizedKey,
            filters: filters || {},
            templateId: templateId || '',
          });
          return remote || {
            segmentKey: normalizedKey,
            unavailable: false,
            total: 0,
            includedCount: 0,
            blockedCount: 0,
            patientIds: [],
          };
        } catch (error) {
          console.warn('[CAMPANHAS] central audience unavailable', error?.message || error);
        }
      }
    }
    const patients = await readClinicPatients(clinicId);
    const patientMap = getPatientIdentityMap(patients);
    const getAllActiveKeys = () => patients
      .filter((patient) => patient?.allowsMessages !== false)
      .map((patient) => String(patient?.prontuario || patient?.id || patient?._id || '').trim())
      .filter(Boolean);

    if (!patients.length) {
      return { segmentKey: normalizedKey, unavailable: true, reason: 'Sem pacientes cadastrados.', total: 0, patientIds: [] };
    }

    if (normalizedKey === 'all_active') {
      const patientIds = getAllActiveKeys();
      return { segmentKey: normalizedKey, unavailable: false, total: patientIds.length, patientIds };
    }

    if (normalizedKey === 'inactive_90' || normalizedKey === 'inactive_180') {
      const days = normalizedKey === 'inactive_180' ? 180 : 90;
      const limitDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
      const appointments = await readAgendaAppointments({ clinicId });
      const lastByPatient = new Map();

      appointments.forEach((appt) => {
        const dt = new Date(`${String(appt?.data || '').trim()}T00:00:00`);
        if (Number.isNaN(dt.getTime())) return;
        toPatientKeyCandidates(appt).forEach((key) => {
          const current = lastByPatient.get(key);
          if (!current || current < dt.getTime()) lastByPatient.set(key, dt.getTime());
        });
      });

      patients.forEach((patient) => {
        const consultas = Array.isArray(patient?.consultas) ? patient.consultas : [];
        consultas.forEach((consulta) => {
          const dt = new Date(`${String(consulta?.data || '').trim()}T00:00:00`);
          if (Number.isNaN(dt.getTime())) return;
          toPatientKeyCandidates(patient).forEach((key) => {
            const current = lastByPatient.get(key);
            if (!current || current < dt.getTime()) lastByPatient.set(key, dt.getTime());
          });
        });
      });

      const patientIds = getAllActiveKeys().filter((id) => {
        const time = lastByPatient.get(id);
        return !time || time < limitDate.getTime();
      });
      return { segmentKey: normalizedKey, unavailable: false, total: patientIds.length, patientIds };
    }

    if (normalizedKey === 'never_cleaning') {
      const hasServiceData = patients.some((patient) => Array.isArray(patient?.servicos));
      if (!hasServiceData) {
        return { segmentKey: normalizedKey, unavailable: true, reason: 'Segmento indisponivel sem historico de servicos.', total: 0, patientIds: [] };
      }
      const patientIds = getAllActiveKeys().filter((id) => {
        const patient = patientMap.get(id);
        const services = Array.isArray(patient?.servicos) ? patient.servicos : [];
        const hasCleaning = services.some((service) => {
          const text = String(service?.nome || service?.procedimento || service?.descricao || '').toLowerCase();
          return text.includes('limpeza') || text.includes('profilaxia');
        });
        return !hasCleaning;
      });
      return { segmentKey: normalizedKey, unavailable: false, total: patientIds.length, patientIds };
    }

    if (normalizedKey === 'birthday_month') {
      const month = Math.max(1, Math.min(12, Number(filters?.month) || (new Date().getMonth() + 1)));
      const patientIds = getAllActiveKeys().filter((id) => {
        const patient = patientMap.get(id);
        const birth = normalizeDateOnly(patient?.dataNascimento || patient?.birthDate);
        if (!birth) return false;
        const birthMonth = Number(birth.split('-')[1] || 0);
        return birthMonth === month;
      });
      return { segmentKey: normalizedKey, unavailable: false, total: patientIds.length, patientIds };
    }

    if (normalizedKey === 'plan_overdue') {
      const plans = await readPlans();
      const today = normalizeDateOnly(new Date());
      const overdueKeys = new Set();
      plans.forEach((plan) => {
        if (normalizeClinicId(plan?.clinicId) !== clinicId) return;
        if (plan?.deletedAt) return;
        const status = String(plan?.statusAtual || '').trim().toUpperCase();
        if (status === 'CANCELADO') return;
        const schedule = Array.isArray(plan?.payment?.schedule) ? plan.payment.schedule : [];
        const hasOverdue = schedule.some((parcel) => {
          const parcelStatus = String(parcel?.status || '').trim().toUpperCase();
          const dueDate = normalizeDateOnly(parcel?.dueDate);
          return parcelStatus === 'PENDING' && dueDate && dueDate < today;
        });
        if (!hasOverdue) return;
        const key = String(plan?.patientId || plan?.prontuario || '').trim();
        if (key) overdueKeys.add(key);
      });
      const patientIds = Array.from(overdueKeys).filter((id) => {
        const patient = patientMap.get(id);
        return patient?.allowsMessages !== false;
      });
      return { segmentKey: normalizedKey, unavailable: false, total: patientIds.length, patientIds };
    }

    return { segmentKey: normalizedKey, unavailable: true, reason: 'Segmento indisponivel.', total: 0, patientIds: [] };
  };

  const getCampaignResult = async ({ campaignId, windowDays = 7 } = {}) => {
    const clinicId = getCurrentClinicId();
    const campaignKey = String(campaignId || '').trim();
    if (!campaignKey) throw new Error('campaignId obrigatorio.');

    if (canUseCentralCampaignOperations()) {
      const userToken = await getUserToken();
      if (userToken) {
        try {
          const remote = await centralBackendAdapter.getCampaignResultWithToken(userToken, campaignKey, {
            windowDays,
          });
          return remote || null;
        } catch (error) {
          console.warn('[CAMPANHAS] central analytics unavailable', error?.message || error);
        }
      }
    }

    const [state, appointments, financeRows] = await Promise.all([
      readCampaignBatchesPayload(),
      readAgendaAppointments({ clinicId }),
      readFinanceRows(),
    ]);
    const safeWindowDays = Math.max(1, Number(windowDays) || 7);
    const batches = state.batches
      .filter((item) => normalizeClinicId(item?.clinicId) === clinicId)
      .filter((item) => String(item?.campaignId || '').trim() === campaignKey)
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    if (!batches.length) {
      return {
        campaignId: campaignKey,
        windowDays: safeWindowDays,
        windowStart: null,
        windowEnd: null,
        recipients: 0,
        conversions7d: 0,
        revenue7d: null,
        lastDispatch: null,
        monthlyConversions7d: 0,
        monthlyRevenue7d: null,
      };
    }

    const evaluateBatch = (batch) => {
      const sendBatchId = String(batch?.sendBatchId || '').trim();
      const createdAt = new Date(batch?.createdAt || '');
      if (!sendBatchId || Number.isNaN(createdAt.getTime())) {
        return {
          conversions7d: 0,
          revenue7d: null,
          recipientsSent: 0,
          sentCount: Math.max(0, Number(batch?.sentCount) || 0),
          failedCount: Math.max(0, Number(batch?.failedCount) || 0),
          audienceCount: Math.max(0, Number(batch?.audienceCount) || 0),
          windowStart: null,
          windowEnd: null,
        };
      }
      const windowEnd = new Date(createdAt.getTime() + (safeWindowDays * 24 * 60 * 60 * 1000));
      const recipients = state.recipients.filter((item) =>
        normalizeClinicId(item?.clinicId) === clinicId
        && String(item?.sendBatchId || '').trim() === sendBatchId);
      const sentRecipients = recipients
        .filter((item) => normalizeLogStatus(item?.status) === 'SENT')
        .map((item) => String(item?.patientId || '').trim())
        .filter(Boolean);
      const sentSet = new Set(sentRecipients);
      const conversionList = [];
      appointments.forEach((appt) => {
        const createdAtIso = getAppointmentCreatedAt(appt);
        if (!createdAtIso) return;
        const createdAtAppt = new Date(createdAtIso);
        if (Number.isNaN(createdAtAppt.getTime())) return;
        if (!(createdAtAppt > createdAt && createdAtAppt <= windowEnd)) return;
        const keys = toPatientKeyCandidates(appt);
        if (!keys.some((key) => sentSet.has(key))) return;
        conversionList.push({
          appointmentId: String(appt?.id || '').trim(),
          patientId: String(appt?.prontuario || appt?.patientId || appt?.pacienteId || '').trim(),
        });
      });
      const uniqueAppointments = new Map();
      conversionList.forEach((item) => {
        const key = item.appointmentId || `${item.patientId}-${Math.random().toString(36).slice(2, 8)}`;
        if (!uniqueAppointments.has(key)) uniqueAppointments.set(key, item);
      });
      const conversionPatientSet = new Set(Array.from(uniqueAppointments.values()).map((item) => item.patientId).filter(Boolean));
      const revenueSum = financeRows
        .filter((row) => normalizeClinicId(row?.clinicId) === clinicId)
        .filter((row) => {
          const status = String(row?.paymentStatus || row?.status || '').trim().toUpperCase();
          return status === 'PAID' || status === 'PAGO';
        })
        .filter((row) => {
          const key = String(row?.patientId || row?.prontuario || '').trim();
          return key && conversionPatientSet.has(key);
        })
        .filter((row) => {
          const stamp = row?.updatedAt || row?.paidAt || row?.dataPagamento || row?.createdAt || row?.dueDate || row?.vencimento;
          const dt = stamp ? new Date(stamp) : null;
          if (!dt || Number.isNaN(dt.getTime())) return false;
          return dt > createdAt && dt <= windowEnd;
        })
        .reduce((acc, row) => acc + normalizeMoney(row?.valor ?? row?.valorTotal ?? row?.amount ?? 0), 0);
      const sentCount = recipients.filter((item) => normalizeLogStatus(item?.status) === 'SENT').length;
      const failedCount = recipients.filter((item) => normalizeLogStatus(item?.status) === 'FAILED').length;
      return {
        conversions7d: uniqueAppointments.size,
        revenue7d: revenueSum > 0 ? Math.round(revenueSum * 100) / 100 : null,
        recipientsSent: sentSet.size,
        sentCount,
        failedCount,
        audienceCount: Math.max(0, Number(batch?.audienceCount) || (sentCount + failedCount)),
        windowStart: createdAt.toISOString(),
        windowEnd: windowEnd.toISOString(),
      };
    };

    const lastBatch = batches[0];
    const lastEval = evaluateBatch(lastBatch);
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthBatches = batches.filter((item) => dayKey(item?.createdAt).startsWith(monthKey));
    let monthlyConversions7d = 0;
    let monthlyRevenueRaw = 0;
    let monthlyHasRevenue = false;
    monthBatches.forEach((batch) => {
      const data = evaluateBatch(batch);
      monthlyConversions7d += data.conversions7d;
      if (data.revenue7d != null) {
        monthlyHasRevenue = true;
        monthlyRevenueRaw += Number(data.revenue7d) || 0;
      }
    });

    return {
      campaignId: campaignKey,
      windowDays: safeWindowDays,
      windowStart: lastEval.windowStart,
      windowEnd: lastEval.windowEnd,
      recipients: lastEval.recipientsSent,
      conversions7d: lastEval.conversions7d,
      revenue7d: lastEval.revenue7d,
      lastDispatch: {
        sendBatchId: String(lastBatch?.sendBatchId || '').trim(),
        createdAt: lastBatch?.createdAt || null,
        segmentKey: String(lastBatch?.segmentKey || 'all_active').trim().toLowerCase(),
        audienceCount: lastEval.audienceCount,
        sentCount: lastEval.sentCount,
        failedCount: lastEval.failedCount,
      },
      monthlyConversions7d,
      monthlyRevenue7d: monthlyHasRevenue ? Math.round(monthlyRevenueRaw * 100) / 100 : null,
    };
  };

  const createCampaign = async (payload = {}) => {
    const clinicId = getCurrentClinicId();
    const currentUser = getCurrentUser();
    const now = new Date().toISOString();
    const normalized = normalizeCampaign(payload, { origem: 'clinica', clinicId });
    const campaign = {
      ...normalized,
      id: normalized.id || generateCampaignId(),
      clinicId,
      criadoPor: normalized.criadoPor || currentUser?.id || '',
      dataCriacao: normalized.dataCriacao || now,
      dataAtualizacao: now,
    };

    if (canUseCentralCampaigns()) {
      const userToken = await getUserToken();
      if (userToken) {
        try {
          const remote = await centralBackendAdapter.createClinicCampaignWithToken(userToken, campaign);
          const effective = normalizeCampaign(remote || campaign, { origem: 'clinica', clinicId });
          await upsertLocalCampaign(effective).catch(() => null);
          return effective;
        } catch (_) {
          // fallback local
        }
      }
    }

    await upsertLocalCampaign(campaign);
    return campaign;
  };

  const updateCampaign = async ({ id, changes } = {}) => {
    if (!id) throw new Error('Id obrigatorio.');
    const clinicId = getCurrentClinicId();
    const list = await readAllLocalCampaigns();
    const idx = list.findIndex((c) => c.id === id && normalizeClinicId(c.clinicId) === clinicId);
    if (idx === -1) throw new Error('Campanha nao encontrada.');

    const existing = list[idx];
    if (existing.origem === 'voithos') {
      throw new Error('Campanha global nao pode ser editada.');
    }

    const updated = normalizeCampaign({
      ...existing,
      ...(changes || {}),
      id: existing.id,
      clinicId,
      origem: existing.origem || 'clinica',
      criadoPor: existing.criadoPor,
      dataCriacao: existing.dataCriacao,
      dataAtualizacao: new Date().toISOString(),
    });
    if (canUseCentralCampaigns()) {
      const userToken = await getUserToken();
      if (userToken) {
        try {
          const remote = await centralBackendAdapter.updateClinicCampaignWithToken(userToken, id, updated);
          const effective = normalizeCampaign(remote || updated, { origem: 'clinica', clinicId });
          list[idx] = effective;
          await writeAllLocalCampaigns(list).catch(() => null);
          return effective;
        } catch (_) {
          // fallback local
        }
      }
    }

    list[idx] = updated;
    await writeAllLocalCampaigns(list);
    return updated;
  };

  const deleteCampaign = async (id) => {
    if (!id) throw new Error('Id obrigatorio.');
    const clinicId = getCurrentClinicId();
    const list = await readAllLocalCampaigns();
    const idx = list.findIndex((c) => c.id === id && normalizeClinicId(c.clinicId) === clinicId);
    if (idx === -1) throw new Error('Campanha nao encontrada.');
    if (list[idx].origem === 'voithos') {
      throw new Error('Campanha global nao pode ser removida.');
    }
    if (canUseCentralCampaigns()) {
      const userToken = await getUserToken();
      if (userToken) {
        try {
          await centralBackendAdapter.deleteClinicCampaignWithToken(userToken, id);
          await removeLocalCampaign(id).catch(() => null);
          await purgeLocalCampaignArtifacts({ clinicId, campaignIds: [id] }).catch(() => null);
          return { success: true };
        } catch (_) {
          // fallback local
        }
      }
    }

    list.splice(idx, 1);
    await writeAllLocalCampaigns(list);
    await purgeLocalCampaignArtifacts({ clinicId, campaignIds: [id] }).catch(() => null);
    return { success: true };
  };

  return {
    listCampaigns,
    createCampaign,
    updateCampaign,
    deleteCampaign,
    listGlobalCampaigns,
    saveGlobalCampaigns,
    createCampaignSendBatch,
    recordCampaignDeliveryLog,
    getCampaignsDashboard,
    listCampaignTemplates,
    listCampaignLogs,
    resolveAudience,
    getCampaignResult,
  };
};

module.exports = { createCampanhasService };




