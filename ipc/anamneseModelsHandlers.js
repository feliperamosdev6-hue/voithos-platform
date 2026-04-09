const path = require('path');

const DEFAULT_CLINIC_ID = 'defaultClinic';
const MODEL_FILE = 'anamnese-modelos.json';
const ALLOWED_TYPES = new Set(['text', 'textarea', 'select', 'number', 'date', 'yesno', 'checkbox', 'multicheck']);

const normalizeText = (value, max = 160) =>
  String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);

const generateId = (prefix) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const slugify = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const sanitizeQuestion = (question = {}, usedKeys = new Set()) => {
  const label = normalizeText(question.label, 220);
  if (!label) return null;
  const type = String(question.type || 'text').trim().toLowerCase();
  const normalizedType = ALLOWED_TYPES.has(type) ? type : 'text';
  let key = normalizeText(question.key, 120) || slugify(label) || generateId('campo');
  while (usedKeys.has(key)) {
    key = `${key}_${Math.random().toString(36).slice(2, 4)}`;
  }
  usedKeys.add(key);
  const optionsRaw = Array.isArray(question.options) ? question.options : [];
  const options = optionsRaw
    .map((opt) => normalizeText(opt, 120))
    .filter(Boolean)
    .slice(0, 20);
  const finalOptions = (normalizedType === 'select' || normalizedType === 'multicheck') ? options : [];

  return {
    id: normalizeText(question.id, 80) || generateId('q'),
    key,
    label,
    type: normalizedType,
    required: Boolean(question.required),
    options: finalOptions,
  };
};

const sanitizeSection = (section = {}) => {
  const title = normalizeText(section.title || section.nome, 160);
  if (!title) return null;
  const usedKeys = new Set();
  const questions = (Array.isArray(section.questions) ? section.questions : [])
    .map((q) => sanitizeQuestion(q, usedKeys))
    .filter(Boolean)
    .slice(0, 60);

  return {
    id: normalizeText(section.id, 80) || generateId('s'),
    title,
    questions,
  };
};

const sanitizeModel = (model = {}, { fallbackName = 'Modelo' } = {}) => {
  const name = normalizeText(model.name || model.nome, 120) || fallbackName;
  const sections = (Array.isArray(model.sections) ? model.sections : [])
    .map(sanitizeSection)
    .filter(Boolean)
    .slice(0, 40);

  return {
    id: normalizeText(model.id, 80) || generateId('m'),
    name,
    active: Boolean(model.active),
    sections,
    createdAt: model.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
};

const buildDefaultModel = () => ({
  id: 'default',
  name: 'Padrao',
  active: true,
  sections: [
    {
      id: 's-geral',
      title: 'Informacoes gerais',
      questions: [
        { id: 'q-data', key: 'anamneseDate', label: 'Data', type: 'date', required: false, options: [] },
        { id: 'q-responsavel', key: 'responsavel', label: 'Responsavel', type: 'text', required: false, options: [] },
        { id: 'q-queixa', key: 'queixa', label: 'Queixa principal', type: 'textarea', required: false, options: [] },
      ],
    },
    {
      id: 's-hist-med',
      title: 'Historico medico',
      questions: [
        { id: 'q-hist-saude', key: 'historicoMedico', label: 'Historico de saude', type: 'textarea', required: false, options: [] },
        { id: 'q-alergias', key: 'alergias', label: 'Alergias', type: 'text', required: false, options: [] },
        { id: 'q-meds', key: 'medicamentos', label: 'Medicamentos em uso', type: 'text', required: false, options: [] },
      ],
    },
    {
      id: 's-condicoes',
      title: 'Condicoes sistemicas',
      questions: [
        {
          id: 'q-condicoes',
          key: 'condicoes[]',
          label: 'Condicoes sistemicas',
          type: 'multicheck',
          required: false,
          options: ['diabetes', 'hipertensao', 'cardiopatias', 'epilepsia', 'asma', 'coagulacao', 'hepatite_hiv'],
        },
      ],
    },
    {
      id: 's-medicacoes',
      title: 'Medicamentos especificos',
      questions: [
        { id: 'q-anticoag', key: 'anticoagulantes', label: 'Usa anticoagulantes', type: 'yesno', required: false, options: [] },
        { id: 'q-antidepr', key: 'antidepressivos', label: 'Usa antidepressivos', type: 'yesno', required: false, options: [] },
        { id: 'q-cort', key: 'corticoides', label: 'Usa corticoides', type: 'yesno', required: false, options: [] },
        { id: 'q-insulina', key: 'insulina', label: 'Usa insulina', type: 'yesno', required: false, options: [] },
      ],
    },
    {
      id: 's-reacoes',
      title: 'Reacoes anteriores',
      questions: [
        { id: 'q-anest', key: 'reacaoAnestesia', label: 'Reacao a anestesia odontologica', type: 'yesno', required: false, options: [] },
        { id: 'q-sang', key: 'sangramentoExcessivo', label: 'Sangramento excessivo', type: 'yesno', required: false, options: [] },
        { id: 'q-desmaio', key: 'desmaioOdonto', label: 'Desmaio em atendimento odontologico', type: 'yesno', required: false, options: [] },
        { id: 'q-gestante', key: 'gestante', label: 'Gestante', type: 'yesno', required: false, options: [] },
        { id: 'q-pressao', key: 'pressao', label: 'Pressao arterial', type: 'text', required: false, options: [] },
      ],
    },
    {
      id: 's-odonto',
      title: 'Historico odontologico',
      questions: [
        { id: 'q-hist-odonto', key: 'historicoOdonto', label: 'Historico odontologico', type: 'textarea', required: false, options: [] },
        { id: 'q-escov', key: 'escovacao', label: 'Frequencia de escovacao', type: 'select', required: false, options: ['1', '2', '3', '4'] },
        { id: 'q-ult-visita', key: 'ultimaVisita', label: 'Ultima visita ao dentista', type: 'date', required: false, options: [] },
        { id: 'q-motivo-visita', key: 'motivoUltimaVisita', label: 'Motivo da ultima visita', type: 'text', required: false, options: [] },
        { id: 'q-sensib', key: 'sensibilidade', label: 'Sensibilidade dentaria', type: 'yesno', required: false, options: [] },
        { id: 'q-dor-mast', key: 'dorMastigar', label: 'Dor ao mastigar', type: 'yesno', required: false, options: [] },
        { id: 'q-brux', key: 'bruxismo', label: 'Ranger os dentes (bruxismo)', type: 'yesno', required: false, options: [] },
        { id: 'q-fio', key: 'fioDental', label: 'Uso de fio dental', type: 'yesno', required: false, options: [] },
        { id: 'q-habitos', key: 'habitos', label: 'Habitos e observacoes', type: 'textarea', required: false, options: [] },
      ],
    },
    {
      id: 's-consent',
      title: 'Declaracoes e consentimento',
      questions: [
        {
          id: 'q-declaracao',
          key: 'declaracaoVerdade',
          label: 'Declaro que as informacoes prestadas sao verdadeiras e informarei qualquer alteracao no meu estado de saude.',
          type: 'checkbox',
          required: true,
          options: [],
        },
        { id: 'q-data-hora', key: 'dataHoraPreenchimento', label: 'Data e hora do preenchimento', type: 'text', required: false, options: [] },
        { id: 'q-origem', key: 'origemPreenchimento', label: 'Origem do preenchimento', type: 'select', required: false, options: ['paciente', 'recepcao', 'dentista'] },
        { id: 'q-assinatura', key: 'assinaturaDigital', label: 'Assinatura digital do paciente (futuro)', type: 'text', required: false, options: [] },
      ],
    },
    {
      id: 's-plano',
      title: 'Plano e observacoes',
      questions: [
        { id: 'q-plano', key: 'planoTratamento', label: 'Plano de tratamento', type: 'textarea', required: false, options: [] },
        { id: 'q-observacoes', key: 'observacoes', label: 'Observacoes gerais', type: 'textarea', required: false, options: [] },
      ],
    },
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const registerAnamneseModelsHandlers = ({
  ipcMain,
  requireAccess,
  requireRole,
  ensureDir,
  pathExists,
  readJsonFile,
  writeJsonFile,
  clinicPath,
  currentUserRef,
  readSessionCache,
  centralBackendAdapter,
}) => {
  const normalizeClinicId = (value) => {
    const raw = String(value || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID;
    return raw.replace(/[^a-zA-Z0-9_-]/g, '_');
  };

  const getCurrentClinicId = () => normalizeClinicId(currentUserRef?.()?.clinicId || DEFAULT_CLINIC_ID);
  const scopedRoot = path.join(clinicPath, 'by-clinic');
  const canUseCentral = () => (
    centralBackendAdapter?.isEnabled?.() === true
    && typeof centralBackendAdapter?.getClinicOperationalSettingsWithToken === 'function'
    && typeof centralBackendAdapter?.updateClinicOperationalSettingsWithToken === 'function'
  );
  const getUserToken = async () => {
    if (typeof readSessionCache !== 'function') return '';
    const session = await readSessionCache().catch(() => null);
    return String(session?.remoteToken || session?.token || '').trim();
  };

  const resolveFilePath = async () => {
    const clinicId = getCurrentClinicId();
    const clinicDir = path.join(scopedRoot, clinicId);
    const scopedPath = path.join(clinicDir, MODEL_FILE);
    const legacyPath = path.join(clinicPath, MODEL_FILE);

    await ensureDir(clinicDir);
    if (!(await pathExists(scopedPath))) {
      if (clinicId === DEFAULT_CLINIC_ID && (await pathExists(legacyPath))) {
        const legacy = await readJsonFile(legacyPath).catch(() => null);
        await writeJsonFile(scopedPath, legacy && Array.isArray(legacy?.models) ? legacy : { models: [buildDefaultModel()] });
      } else {
        await writeJsonFile(scopedPath, { models: [buildDefaultModel()] });
      }
    }

    return scopedPath;
  };

  const readLocalModels = async () => {
    const filePath = await resolveFilePath();
    const data = await readJsonFile(filePath);
    const raw = Array.isArray(data?.models) ? data.models : [];
    const list = raw.map((model, index) => sanitizeModel(model, { fallbackName: `Modelo ${index + 1}` }));
    const defaultModelIndex = list.findIndex((m) => m.id === 'default');
    if (defaultModelIndex >= 0 && (!Array.isArray(list[defaultModelIndex].sections) || !list[defaultModelIndex].sections.length)) {
      const base = buildDefaultModel();
      list[defaultModelIndex] = {
        ...base,
        active: list[defaultModelIndex].active,
        createdAt: list[defaultModelIndex].createdAt || base.createdAt,
        updatedAt: new Date().toISOString(),
      };
    }
    if (!list.length) return [buildDefaultModel()];
    const hasActive = list.some((m) => m.active);
    if (!hasActive) list[0].active = true;
    return list;
  };

  const writeLocalModels = async (models) => {
    const filePath = await resolveFilePath();
    const list = Array.isArray(models) ? models : [];
    const hasActive = list.some((m) => m.active);
    if (!hasActive && list.length) list[0].active = true;
    await writeJsonFile(filePath, { models: list });
    return list;
  };

  const readModels = async () => {
    const clinicId = getCurrentClinicId();
    const localModels = await readLocalModels();

    if (canUseCentral()) {
      const userToken = await getUserToken();
      if (userToken) {
        try {
          const remote = await centralBackendAdapter.getClinicOperationalSettingsWithToken(userToken);
          const remoteRaw = Array.isArray(remote?.anamneseModels) ? remote.anamneseModels : [];
          const remoteModels = remoteRaw.map((model, index) => sanitizeModel(model, { fallbackName: `Modelo ${index + 1}` }));
          const effective = remoteModels.length
            ? remoteModels
            : (localModels.length
              ? (await centralBackendAdapter.updateClinicOperationalSettingsWithToken(userToken, { anamneseModels: localModels }))?.anamneseModels?.map((model, index) => sanitizeModel(model, { fallbackName: `Modelo ${index + 1}` })) || localModels
              : localModels);
          await writeLocalModels(effective).catch(() => null);
          return effective;
        } catch (_) {
          // fallback local
        }
      }
    }

    return localModels;
  };

  const writeModels = async (models) => {
    const list = Array.isArray(models) ? models : [];
    if (canUseCentral()) {
      const userToken = await getUserToken();
      if (userToken) {
        try {
          const remote = await centralBackendAdapter.updateClinicOperationalSettingsWithToken(userToken, {
            anamneseModels: list,
          });
          const effective = Array.isArray(remote?.anamneseModels)
            ? remote.anamneseModels.map((model, index) => sanitizeModel(model, { fallbackName: `Modelo ${index + 1}` }))
            : list;
          await writeLocalModels(effective).catch(() => null);
          return effective;
        } catch (_) {
          // fallback local
        }
      }
    }
    return writeLocalModels(list);
  };

  ipcMain.handle('anamnese-models-list', async () => {
    requireAccess({ roles: ['admin'], perms: ['clinic.manage'] });
    return readModels();
  });

  ipcMain.handle('anamnese-models-get-active', async () => {
    requireRole(['admin', 'recepcionista', 'dentista']);
    const models = await readModels();
    return models.find((m) => m.active) || null;
  });

  ipcMain.handle('anamnese-models-create', async (_event, payload = {}) => {
    requireAccess({ roles: ['admin'], perms: ['clinic.manage'] });
    const models = await readModels();
    const sanitized = sanitizeModel(payload, { fallbackName: 'Novo modelo' });
    if (!sanitized.name) throw new Error('Nome do modelo obrigatorio.');
    sanitized.id = generateId('m');
    sanitized.active = models.length === 0;
    if (sanitized.active) {
      models.forEach((m) => { m.active = false; });
    }
    models.unshift(sanitized);
    await writeModels(models);
    return sanitized;
  });

  ipcMain.handle('anamnese-models-update', async (_event, payload = {}) => {
    requireAccess({ roles: ['admin'], perms: ['clinic.manage'] });
    const id = normalizeText(payload.id, 80);
    if (!id) throw new Error('Id do modelo obrigatorio.');
    const models = await readModels();
    const index = models.findIndex((m) => m.id === id);
    if (index < 0) throw new Error('Modelo nao encontrado.');
    const base = models[index];
    const sanitized = sanitizeModel({ ...base, ...payload }, { fallbackName: base.name || 'Modelo' });
    sanitized.id = base.id;
    sanitized.createdAt = base.createdAt || sanitized.createdAt;
    sanitized.active = base.active;
    models[index] = sanitized;
    await writeModels(models);
    return sanitized;
  });

  ipcMain.handle('anamnese-models-set-active', async (_event, payload = {}) => {
    requireAccess({ roles: ['admin'], perms: ['clinic.manage'] });
    const id = normalizeText(payload.id, 80);
    if (!id) throw new Error('Id do modelo obrigatorio.');
    const models = await readModels();
    const index = models.findIndex((m) => m.id === id);
    if (index < 0) throw new Error('Modelo nao encontrado.');
    models.forEach((m, idx) => {
      m.active = idx === index;
      m.updatedAt = new Date().toISOString();
    });
    await writeModels(models);
    return models[index];
  });

  ipcMain.handle('anamnese-models-delete', async (_event, payload = {}) => {
    requireAccess({ roles: ['admin'], perms: ['clinic.manage'] });
    const id = normalizeText(payload.id, 80);
    if (!id) throw new Error('Id do modelo obrigatorio.');
    const models = await readModels();
    if (models.length <= 1) throw new Error('Mantenha ao menos um modelo cadastrado.');
    const index = models.findIndex((m) => m.id === id);
    if (index < 0) throw new Error('Modelo nao encontrado.');
    const wasActive = models[index].active;
    models.splice(index, 1);
    if (wasActive && models.length) models[0].active = true;
    await writeModels(models);
    return { success: true };
  });
};

module.exports = { registerAnamneseModelsHandlers };
