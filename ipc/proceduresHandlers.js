const path = require('path');
const DEFAULT_CLINIC_ID = 'defaultClinic';

const normalizeClinicId = (value) => String(value || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID;
const normalizeText = (value) => String(value || '').trim();

const getCurrentClinicId = (currentUserRef) => normalizeClinicId(currentUserRef?.()?.clinicId || DEFAULT_CLINIC_ID);

const getScopedOverridesFile = ({ clinicPath, currentUserRef }) => (
  clinicPath
    ? path.join(clinicPath, 'by-clinic', getCurrentClinicId(currentUserRef), 'procedimentos.json')
    : ''
);

const getLegacyOverridesFile = ({ clinicPath }) => (
  clinicPath ? path.join(clinicPath, 'procedimentos.json') : ''
);

const extractOverrides = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.procedimentos)) return raw.procedimentos;
  return [];
};

const sanitizeOverride = (item = {}) => {
  const codigo = normalizeText(item.codigo || item.id);
  const nome = normalizeText(item.nome);
  if (!codigo) return null;
  return {
    codigo,
    nome,
    preco: Number(item.preco ?? 0) || 0,
    ativo: item.ativo !== false,
    updatedAt: normalizeText(item.updatedAt) || new Date().toISOString(),
  };
};

const sanitizeOverrides = (list = []) => (
  (Array.isArray(list) ? list : [])
    .map((item) => sanitizeOverride(item))
    .filter(Boolean)
);

const readOverrides = async ({ clinicPath, currentUserRef, pathExists, readJsonFile }) => {
  const scopedFilePath = getScopedOverridesFile({ clinicPath, currentUserRef });
  if (!scopedFilePath) return [];
  if (await pathExists(scopedFilePath)) {
    try {
      const data = await readJsonFile(scopedFilePath);
      return extractOverrides(data);
    } catch (_) {
      return [];
    }
  }

  const legacyFilePath = getLegacyOverridesFile({ clinicPath });
  if (!(legacyFilePath && await pathExists(legacyFilePath))) return [];
  try {
    const data = await readJsonFile(legacyFilePath);
    const legacyClinicId = normalizeClinicId(data?.clinicId || DEFAULT_CLINIC_ID);
    if (legacyClinicId !== getCurrentClinicId(currentUserRef)) return [];
    return extractOverrides(data);
  } catch (_) {
    return [];
  }
};

const writeOverrides = async ({ clinicPath, currentUserRef, ensureDir, writeJsonFile }, list) => {
  const filePath = getScopedOverridesFile({ clinicPath, currentUserRef });
  if (!filePath) return;
  await ensureDir(path.dirname(filePath));
  await writeJsonFile(filePath, {
    clinicId: getCurrentClinicId(currentUserRef),
    procedimentos: list,
    updatedAt: new Date().toISOString(),
  });
};

const loadBaseProcedures = async ({ pathExists, readJsonFile }) => {
  const filePath = path.join(__dirname, '..', 'Procedimentos.json');
  if (!(await pathExists(filePath))) return [];
  const data = await readJsonFile(filePath);
  return Array.isArray(data?.servicos) ? data.servicos : [];
};

const mergeProcedures = (base = [], overrides = []) => {
  const overrideMap = new Map();
  sanitizeOverrides(overrides).forEach((p) => {
    overrideMap.set(p.codigo, p);
  });

  const merged = [];
  (Array.isArray(base) ? base : []).forEach((p) => {
    const codigo = normalizeText(p.codigo || p.id);
    if (!codigo) return;
    const override = overrideMap.get(codigo);
    if (override && override.ativo === false) return;
    merged.push({
      codigo,
      nome: normalizeText(override?.nome || p.nome),
      preco: Number(override?.preco ?? p.preco ?? 0) || 0,
      origem: 'base',
    });
    overrideMap.delete(codigo);
  });

  overrideMap.forEach((p) => {
    if (p.ativo === false) return;
    merged.push({
      codigo: p.codigo,
      nome: p.nome || 'Procedimento',
      preco: Number(p.preco ?? 0) || 0,
      origem: 'custom',
    });
  });

  return merged.sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || '')));
};

const registerProceduresHandlers = ({
  ipcMain,
  requireAccess,
  ensureDir,
  pathExists,
  readJsonFile,
  writeJsonFile,
  clinicPath,
  currentUserRef,
  centralBackendAdapter,
  readSessionCache,
}) => {
  const canUseCentral = () => (
    centralBackendAdapter?.isEnabled?.() === true
    && typeof centralBackendAdapter?.getClinicOperationalSettingsWithToken === 'function'
    && typeof centralBackendAdapter?.updateClinicOperationalSettingsWithToken === 'function'
  );
  const getUserToken = async () => {
    if (typeof readSessionCache !== 'function') return '';
    const session = await readSessionCache().catch(() => null);
    return normalizeText(session?.remoteToken || session?.token);
  };
  const readEffectiveOverrides = async () => {
    const localOverrides = sanitizeOverrides(await readOverrides({
      clinicPath,
      currentUserRef,
      pathExists,
      readJsonFile,
    }));

    if (canUseCentral()) {
      const userToken = await getUserToken();
      if (userToken) {
        try {
          const remote = await centralBackendAdapter.getClinicOperationalSettingsWithToken(userToken);
          const remoteOverrides = sanitizeOverrides(remote?.proceduresCatalog);
          if (remoteOverrides.length) {
            await writeOverrides({ clinicPath, currentUserRef, ensureDir, writeJsonFile }, remoteOverrides).catch(() => null);
            return remoteOverrides;
          }
          if (localOverrides.length) {
            const seeded = await centralBackendAdapter.updateClinicOperationalSettingsWithToken(userToken, {
              proceduresCatalog: localOverrides,
            });
            const effective = sanitizeOverrides(seeded?.proceduresCatalog);
            if (effective.length) {
              await writeOverrides({ clinicPath, currentUserRef, ensureDir, writeJsonFile }, effective).catch(() => null);
              return effective;
            }
          }
        } catch (_) {
          // fallback local
        }
      }
    }

    return localOverrides;
  };
  const writeEffectiveOverrides = async (list) => {
    const sanitized = sanitizeOverrides(list);
    if (canUseCentral()) {
      const userToken = await getUserToken();
      if (userToken) {
        try {
          const remote = await centralBackendAdapter.updateClinicOperationalSettingsWithToken(userToken, {
            proceduresCatalog: sanitized,
          });
          const effective = sanitizeOverrides(remote?.proceduresCatalog);
          const finalList = effective.length || !sanitized.length ? effective : sanitized;
          await writeOverrides({ clinicPath, currentUserRef, ensureDir, writeJsonFile }, finalList).catch(() => null);
          return finalList;
        } catch (_) {
          // fallback local
        }
      }
    }
    await writeOverrides({ clinicPath, currentUserRef, ensureDir, writeJsonFile }, sanitized);
    return sanitized;
  };

  ipcMain.handle('procedures-list', async () => {
    requireAccess({ roles: ['admin', 'administrativo', 'super_admin'], perms: ['procedures.manage'] });
    const [base, overrides] = await Promise.all([
      loadBaseProcedures({ pathExists, readJsonFile }),
      readEffectiveOverrides(),
    ]);
    return mergeProcedures(base, overrides);
  });

  ipcMain.handle('procedures-upsert', async (_event, payload = {}) => {
    requireAccess({ roles: ['admin', 'administrativo', 'super_admin'], perms: ['procedures.manage'] });
    const codigo = String(payload.codigo || '').trim();
    const nome = String(payload.nome || '').trim();
    if (!codigo || !nome) throw new Error('Codigo e nome sao obrigatorios.');
    const preco = Number(payload.preco ?? 0);

    const overrides = await readEffectiveOverrides();
    const idx = overrides.findIndex((p) => String(p.codigo || '') === codigo);
    const record = sanitizeOverride({
      codigo,
      nome,
      preco: Number.isFinite(preco) ? preco : 0,
      ativo: payload.ativo !== false,
      updatedAt: new Date().toISOString(),
    });
    if (idx >= 0) overrides[idx] = { ...overrides[idx], ...record };
    else overrides.push(record);
    await writeEffectiveOverrides(overrides);
    return record;
  });

  ipcMain.handle('procedures-delete', async (_event, payload = {}) => {
    requireAccess({ roles: ['admin', 'administrativo', 'super_admin'], perms: ['procedures.manage'] });
    const codigo = String(payload.codigo || '').trim();
    if (!codigo) throw new Error('Codigo obrigatorio.');
    const [overrides, base] = await Promise.all([
      readEffectiveOverrides(),
      loadBaseProcedures({ pathExists, readJsonFile }),
    ]);
    const existsInBase = base.some((p) => String(p.codigo || p.id || '').trim() === codigo);
    const idx = overrides.findIndex((p) => String(p.codigo || '') === codigo);
    if (idx >= 0 && !existsInBase) {
      overrides.splice(idx, 1);
    } else if (idx >= 0) {
      overrides[idx] = { ...overrides[idx], ativo: false, updatedAt: new Date().toISOString() };
    } else {
      overrides.push({ codigo, nome: '', preco: 0, ativo: false, updatedAt: new Date().toISOString() });
    }
    await writeEffectiveOverrides(overrides);
    return { success: true };
  });
};

module.exports = { registerProceduresHandlers };
