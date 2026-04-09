const path = require('path');

const DEFAULT_CLINIC_ID = 'defaultClinic';
const MODELS_FILE = 'document-modelos.json';
const ALLOWED_ENGINES = new Set(['html']);
const ALLOWED_CATEGORIES = new Set(['clinicos', 'administrativos', 'financeiros', 'gerais']);

const normalizeText = (value, max = 160) =>
  String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);

const generateId = (prefix) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const deepGet = (obj, pathKey) => {
  const parts = String(pathKey || '').split('.').filter(Boolean);
  let ref = obj;
  for (const part of parts) {
    if (ref && Object.prototype.hasOwnProperty.call(ref, part)) {
      ref = ref[part];
    } else {
      return '';
    }
  }
  return ref ?? '';
};

const renderTemplate = (html, context) =>
  String(html || '').replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_m, key) => {
    const value = deepGet(context, key);
    return String(value ?? '');
  });

const sanitizeVariables = (vars) => {
  const list = Array.isArray(vars) ? vars : [];
  return list
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const key = normalizeText(item.key, 120);
      if (!key) return null;
      return {
        key,
        label: normalizeText(item.label, 120) || key,
        example: normalizeText(item.example, 200),
      };
    })
    .filter(Boolean)
    .slice(0, 120);
};

const sanitizeModel = (model = {}, fallbackIndex = 0) => {
  const categoryRaw = normalizeText(model.category, 60).toLowerCase();
  const category = ALLOWED_CATEGORIES.has(categoryRaw) ? categoryRaw : 'gerais';
  const type = normalizeText(model.type, 80).toLowerCase() || 'documento';
  const engineRaw = normalizeText(model.engine, 40).toLowerCase();
  const engine = ALLOWED_ENGINES.has(engineRaw) ? engineRaw : 'html';
  const contentHtml = String(model.contentHtml || model.template || '').trim();
  const variables = sanitizeVariables(model.variables);

  return {
    id: normalizeText(model.id, 80) || generateId('docm'),
    name: normalizeText(model.name, 120) || `Modelo ${fallbackIndex + 1}`,
    category,
    type,
    active: Boolean(model.active),
    engine,
    contentHtml,
    variables,
    version: Math.max(1, Number(model.version) || 1),
    createdAt: model.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
};

const DEFAULT_ATESTADO_TEMPLATE = `
<style>
  * { box-sizing: border-box; }
  .atest-doc { font-family: Arial, sans-serif; color: #0f172a; margin: 12px 34px 10px; }
  .atest-title { margin: 10px 0 46px; text-align: center; text-transform: uppercase; font-size: 24px; font-weight: 700; letter-spacing: 0.3px; }
  .atest-date { margin-top: 0; font-size: 15px; color: #1e293b; }
  .atest-body { margin-top: 36px; font-size: 15px; line-height: 1.75; }
  .atest-body p { margin: 0 0 16px; }
  .atest-cid { margin-top: 10px; font-weight: 700; }
  .atest-sign { margin-top: 92px; text-align: center; page-break-inside: avoid; }
  .atest-sign-img { margin: 0 auto 8px; max-height: 76px; max-width: 320px; object-fit: contain; display: block; }
  .atest-sign-line { margin: 0 auto 14px; border-top: 1px solid #334155; width: 300px; max-width: 90%; }
  .atest-sign-name { font-size: 16px; font-weight: 500; }
  .atest-sign-reg { margin-top: 4px; font-size: 14px; color: #334155; }
</style>
<div class="atest-doc">
  <h1 class="atest-title">ATESTADO</h1>
  <div class="atest-date">{{clinica.endereco.cidade}} - {{clinica.endereco.uf}}, {{documento.data}}</div>
  <div class="atest-body">
    <p>Atesto, para os devidos fins, que o(a) Sr.(a) <strong>{{paciente.nome}}</strong> CPF {{paciente.cpf}}, foi submetido(a) a procedimentos nesta data.</p>
    <p>{{documento.conteudo}}</p>
    <p class="atest-cid">CID: {{documento.cid}}</p>
  </div>
  <div class="atest-sign">
    <img class="atest-sign-img" src="{{profissional.receituario.assinaturaImagemData}}" alt="Assinatura digital">
    <div class="atest-sign-line"></div>
    <div class="atest-sign-name">{{profissional.receituario.assinaturaNome}}</div>
    <div class="atest-sign-reg">{{profissional.receituario.assinaturaRegistro}}</div>
  </div>
</div>
`.trim();

const DEFAULT_ATESTADO_VARIABLES = [
  { key: 'paciente.nome', label: 'Nome do paciente', example: 'Fulano da Silva' },
  { key: 'paciente.cpf', label: 'CPF do paciente', example: '123.456.789-00' },
  { key: 'documento.data', label: 'Data do documento', example: '17 de fevereiro de 2026' },
  { key: 'documento.conteudo', label: 'Conteudo', example: 'Afastamento por 2 dia(s), a partir desta data.' },
  { key: 'documento.cid', label: 'CID', example: 'K00.3' },
  { key: 'clinica.endereco.cidade', label: 'Cidade da clinica', example: 'Sao Paulo' },
  { key: 'clinica.endereco.uf', label: 'UF da clinica', example: 'SP' },
  { key: 'profissional.receituario.assinaturaNome', label: 'Nome da assinatura', example: 'Dra. Maria' },
  { key: 'profissional.receituario.assinaturaRegistro', label: 'Registro da assinatura', example: 'CRO-SP 12345' },
  { key: 'profissional.receituario.assinaturaImagemData', label: 'Imagem da assinatura', example: 'data:image/png;base64,...' },
];

const DEFAULT_RECEITA_TEMPLATE = `
<style>
  * { box-sizing: border-box; }
  .rec-doc { font-family: Arial, sans-serif; color: #0f172a; margin: 12px 34px 10px; }
  .rec-title { margin: 10px 0 46px; text-align: center; text-transform: uppercase; font-size: 24px; font-weight: 700; letter-spacing: 0.3px; }
  .rec-date { margin-top: 0; font-size: 15px; color: #1e293b; }
  .rec-body { margin-top: 20px; font-size: 15px; line-height: 1.7; }
  .rec-body p { margin: 0 0 12px; }
  .rec-block { margin-bottom: 14px; page-break-inside: avoid; }
  .rec-label { font-size: 13px; color: #334155; margin-bottom: 4px; font-weight: 700; }
  .rec-value { white-space: pre-wrap; font-size: 14px; }
  .rec-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px; }
  .rec-table th, .rec-table td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  .rec-table th { background: #f8fafc; font-weight: 700; }
  .rec-sign { margin-top: 72px; text-align: center; page-break-inside: avoid; }
  .rec-sign-img { margin: 0 auto 8px; max-height: 76px; max-width: 320px; object-fit: contain; display: block; }
  .rec-sign-line { margin: 0 auto 14px; border-top: 1px solid #334155; width: 300px; max-width: 90%; }
  .rec-sign-name { font-size: 16px; font-weight: 500; }
  .rec-sign-reg { margin-top: 4px; font-size: 14px; color: #334155; }
</style>
<div class="rec-doc">
  <div class="rec-block"><div class="rec-value">{{clinica.receituario.cabecalho}}</div></div>
  <h1 class="rec-title">Receita</h1>
  <div class="rec-date">{{clinica.endereco.cidade}} - {{clinica.endereco.uf}}, {{documento.data}}</div>
  <div class="rec-body">
    <p>Paciente: <strong>{{paciente.nome}}</strong></p>
    <p>Prontuario: {{paciente.prontuario}}</p>
    <p>Profissional: {{profissional.nome}}</p>
  </div>
  <div class="rec-block">
    <div class="rec-label">Itens da receita</div>
    <div class="rec-value">{{documento.itensTexto}}</div>
  </div>
  <div class="rec-block">
    <div class="rec-label">Texto livre</div>
    <div class="rec-value">{{documento.texto}}</div>
  </div>
  <div class="rec-block">
    <div class="rec-label">Observacoes</div>
    <div class="rec-value">{{documento.observacoes}}</div>
  </div>
  <div class="rec-sign">
    <img class="rec-sign-img" src="{{profissional.receituario.assinaturaImagemData}}" alt="Assinatura digital">
    <div class="rec-sign-line"></div>
    <div class="rec-sign-name">{{profissional.receituario.assinaturaNome}}</div>
    <div class="rec-sign-reg">{{profissional.receituario.assinaturaRegistro}}</div>
  </div>
  <div class="rec-block"><div class="rec-value">{{clinica.receituario.rodape}}</div></div>
</div>
`.trim();

const DEFAULT_RECEITA_VARIABLES = [
  { key: 'paciente.nome', label: 'Nome do paciente', example: 'Fulano da Silva' },
  { key: 'paciente.prontuario', label: 'Prontuario do paciente', example: '20260220232833' },
  { key: 'profissional.nome', label: 'Nome do profissional', example: 'Dra. Maria' },
  { key: 'profissional.receituario.assinaturaNome', label: 'Assinatura por profissional (nome)', example: 'Dra. Maria' },
  { key: 'profissional.receituario.assinaturaRegistro', label: 'Assinatura por profissional (registro)', example: 'CRO-SP 12345' },
  { key: 'profissional.receituario.assinaturaImagemData', label: 'Assinatura por profissional (imagem)', example: 'data:image/png;base64,...' },
  { key: 'documento.data', label: 'Data da receita', example: '14 de fevereiro de 2026' },
  { key: 'documento.itensTexto', label: 'Itens da receita em texto', example: '1. Amoxicilina | 1 cp 8/8h | 21 cps' },
  { key: 'documento.texto', label: 'Texto livre', example: 'Usar conforme orientacao.' },
  { key: 'documento.observacoes', label: 'Observacoes', example: 'Retorno em 7 dias.' },
  { key: 'clinica.endereco.cidade', label: 'Cidade da clinica', example: 'Sao Paulo' },
  { key: 'clinica.endereco.uf', label: 'UF da clinica', example: 'SP' },
  { key: 'clinica.receituario.cabecalho', label: 'Cabecalho do receituario', example: 'Prescricao odontologica' },
  { key: 'clinica.receituario.rodape', label: 'Rodape do receituario', example: 'Assinatura obrigatoria' },
];

const buildDefaultAtestadoModel = () => ({
  id: 'docm-atestado-default',
  name: 'Atestado padrao',
  category: 'clinicos',
  type: 'atestado',
  active: true,
  engine: 'html',
  contentHtml: DEFAULT_ATESTADO_TEMPLATE,
  variables: DEFAULT_ATESTADO_VARIABLES,
  version: 5,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const buildDefaultModels = () => ([
  buildDefaultAtestadoModel(),
  {
    id: 'docm-receita-default',
    name: 'Receita padrao',
    category: 'clinicos',
    type: 'receita',
    active: true,
    engine: 'html',
    contentHtml: DEFAULT_RECEITA_TEMPLATE,
    variables: DEFAULT_RECEITA_VARIABLES,
    version: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
]);

const registerDocumentModelsHandlers = ({
  ipcMain,
  requireAccess,
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
    const scopedPath = path.join(clinicDir, MODELS_FILE);
    const legacyPath = path.join(clinicPath, MODELS_FILE);

    await ensureDir(clinicDir);
    if (!(await pathExists(scopedPath))) {
      if (clinicId === DEFAULT_CLINIC_ID && (await pathExists(legacyPath))) {
        const legacy = await readJsonFile(legacyPath).catch(() => null);
        await writeJsonFile(scopedPath, legacy && Array.isArray(legacy?.models) ? legacy : { models: buildDefaultModels() });
      } else {
        await writeJsonFile(scopedPath, { models: buildDefaultModels() });
      }
    }

    return scopedPath;
  };

  const readLocalModels = async () => {
    const filePath = await resolveFilePath();
    const data = await readJsonFile(filePath);
    const list = Array.isArray(data?.models) ? data.models : [];
    const sanitized = list.map((model, idx) => sanitizeModel(model, idx));
    if (!sanitized.length) return buildDefaultModels();

    let needsPersist = false;
    const migrated = sanitized.map((model) => {
      if (model.id === 'docm-atestado-default' && model.type === 'atestado') {
        if (Number(model.version || 1) >= 5) return model;
        needsPersist = true;
        return {
          ...model,
          contentHtml: DEFAULT_ATESTADO_TEMPLATE,
          variables: DEFAULT_ATESTADO_VARIABLES,
          version: 5,
          updatedAt: new Date().toISOString(),
        };
      }
      if (model.id === 'docm-receita-default' && model.type === 'receita') {
        if (Number(model.version || 1) >= 2) return model;
        needsPersist = true;
        return {
          ...model,
          contentHtml: DEFAULT_RECEITA_TEMPLATE,
          variables: DEFAULT_RECEITA_VARIABLES,
          version: 2,
          updatedAt: new Date().toISOString(),
        };
      }
      return model;
    });

    const byType = new Map();
    migrated.forEach((model, index) => {
      const key = model.type || 'documento';
      if (!byType.has(key)) byType.set(key, []);
      byType.get(key).push(index);
    });
    byType.forEach((indexes) => {
      const active = indexes.filter((idx) => migrated[idx].active);
      if (!active.length && indexes.length) migrated[indexes[0]].active = true;
      if (active.length > 1) {
        let first = true;
        active.forEach((idx) => {
          migrated[idx].active = first;
          first = false;
        });
        needsPersist = true;
      }
    });

    if (needsPersist) await writeLocalModels(migrated);
    return migrated;
  };

  const writeLocalModels = async (models) => {
    const filePath = await resolveFilePath();
    const list = Array.isArray(models) ? models : [];
    const byType = new Map();
    list.forEach((model, index) => {
      const key = model.type || 'documento';
      if (!byType.has(key)) byType.set(key, []);
      byType.get(key).push(index);
    });
    byType.forEach((indexes) => {
      const active = indexes.filter((idx) => list[idx].active);
      if (!active.length && indexes.length) list[indexes[0]].active = true;
      if (active.length > 1) {
        let first = true;
        active.forEach((idx) => {
          list[idx].active = first;
          first = false;
        });
      }
    });
    await writeJsonFile(filePath, { models: list });
    return list;
  };

  const readModels = async () => {
    const localModels = await readLocalModels();

    if (canUseCentral()) {
      const userToken = await getUserToken();
      if (userToken) {
        try {
          const remote = await centralBackendAdapter.getClinicOperationalSettingsWithToken(userToken);
          const remoteRaw = Array.isArray(remote?.documentModels) ? remote.documentModels : [];
          const remoteModels = remoteRaw.map((model, idx) => sanitizeModel(model, idx));
          const effective = remoteModels.length
            ? remoteModels
            : (
              localModels.length
                ? (
                  await centralBackendAdapter.updateClinicOperationalSettingsWithToken(userToken, {
                    documentModels: localModels,
                  })
                )?.documentModels?.map((model, idx) => sanitizeModel(model, idx)) || localModels
                : localModels
            );
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
            documentModels: list,
          });
          const effective = Array.isArray(remote?.documentModels)
            ? remote.documentModels.map((model, idx) => sanitizeModel(model, idx))
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

  ipcMain.handle('document-models-list', async (_event, payload = {}) => {
    requireAccess({ roles: ['admin'], perms: ['clinic.manage'] });
    const typeFilter = normalizeText(payload.type, 80).toLowerCase();
    const categoryFilter = normalizeText(payload.category, 60).toLowerCase();
    const list = await readModels();
    return list.filter((item) => {
      if (typeFilter && item.type !== typeFilter) return false;
      if (categoryFilter && item.category !== categoryFilter) return false;
      return true;
    });
  });

  ipcMain.handle('document-models-create', async (_event, payload = {}) => {
    requireAccess({ roles: ['admin'], perms: ['clinic.manage'] });
    const models = await readModels();
    const sanitized = sanitizeModel(payload, models.length);
    sanitized.id = generateId('docm');
    sanitized.version = 1;
    models.unshift(sanitized);
    await writeModels(models);
    return sanitized;
  });

  ipcMain.handle('document-models-update', async (_event, payload = {}) => {
    requireAccess({ roles: ['admin'], perms: ['clinic.manage'] });
    const id = normalizeText(payload.id, 80);
    if (!id) throw new Error('Id do modelo obrigatorio.');
    const models = await readModels();
    const index = models.findIndex((m) => m.id === id);
    if (index < 0) throw new Error('Modelo nao encontrado.');

    const previous = models[index];
    const merged = sanitizeModel({ ...previous, ...payload }, index);
    merged.id = previous.id;
    merged.createdAt = previous.createdAt || merged.createdAt;
    merged.version = Math.max(1, Number(previous.version) || 1) + 1;
    merged.active = previous.active;
    models[index] = merged;
    await writeModels(models);
    return merged;
  });

  ipcMain.handle('document-models-delete', async (_event, payload = {}) => {
    requireAccess({ roles: ['admin'], perms: ['clinic.manage'] });
    const id = normalizeText(payload.id, 80);
    if (!id) throw new Error('Id do modelo obrigatorio.');
    const models = await readModels();
    const index = models.findIndex((m) => m.id === id);
    if (index < 0) throw new Error('Modelo nao encontrado.');
    const target = models[index];
    const sameTypeCount = models.filter((m) => m.type === target.type).length;
    if (sameTypeCount <= 1) throw new Error('Mantenha ao menos um modelo por tipo.');
    const wasActive = target.active;
    models.splice(index, 1);
    if (wasActive) {
      const firstOfType = models.find((m) => m.type === target.type);
      if (firstOfType) firstOfType.active = true;
    }
    await writeModels(models);
    return { success: true };
  });

  ipcMain.handle('document-models-set-active', async (_event, payload = {}) => {
    requireAccess({ roles: ['admin'], perms: ['clinic.manage'] });
    const id = normalizeText(payload.id, 80);
    if (!id) throw new Error('Id do modelo obrigatorio.');
    const models = await readModels();
    const target = models.find((m) => m.id === id);
    if (!target) throw new Error('Modelo nao encontrado.');
    models.forEach((m) => {
      if (m.type === target.type) m.active = m.id === target.id;
      m.updatedAt = new Date().toISOString();
    });
    await writeModels(models);
    return target;
  });

  ipcMain.handle('document-models-render-preview', async (_event, payload = {}) => {
    requireAccess({ roles: ['admin'], perms: ['clinic.manage'] });
    const html = String(payload.contentHtml || '').trim();
    if (!html) throw new Error('Template vazio.');
    const context = (payload.context && typeof payload.context === 'object') ? payload.context : {};
    const renderedHtml = renderTemplate(html, context);
    return { renderedHtml };
  });
};

module.exports = { registerDocumentModelsHandlers };
