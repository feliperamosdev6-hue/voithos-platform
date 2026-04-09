const path = require('path');

const DEFAULT_CLINIC_ID = 'defaultClinic';

const getDefaultAgendaSettings = () => ({
  timezone: 'America/Sao_Paulo',
  markers: [],
  updatedAt: '',
});

const normalizeColor = (value) => {
  const raw = String(value || '').trim();
  const match = raw.match(/^#([0-9a-fA-F]{6})$/);
  return match ? `#${match[1].toUpperCase()}` : '';
};

const sanitizeMarker = (marker = {}) => {
  const nome = String(marker.nome || '').trim();
  const cor = normalizeColor(marker.cor);
  if (!nome || !cor) return null;
  const id = String(marker.id || '').trim() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  return { id, nome, cor };
};

const registerAgendaSettingsHandlers = ({
  ipcMain,
  requireAccess,
  ensureDir,
  pathExists,
  readJsonFile,
  writeJsonFile,
  clinicPath,
  agendaSettingsFile,
  currentUserRef,
  readSessionCache,
  centralBackendAdapter,
}) => {
  const normalizeClinicId = (value) => {
    const raw = String(value || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID;
    return raw.replace(/[^a-zA-Z0-9_-]/g, '_');
  };

  const getCurrentClinicId = () => normalizeClinicId(currentUserRef?.()?.clinicId || DEFAULT_CLINIC_ID);
  const scopedRoot = path.join(clinicPath, 'settings', 'agenda');
  const getScopedFile = (clinicId) => path.join(scopedRoot, `${normalizeClinicId(clinicId)}.json`);
  const canUseCentral = () => (
    centralBackendAdapter?.isEnabled?.() === true
    && typeof centralBackendAdapter?.getClinicOperationalSettingsWithToken === 'function'
    && typeof centralBackendAdapter?.updateClinicOperationalSettingsWithToken === 'function'
  );
  const getUserToken = () => String(readSessionCache?.()?.token || '').trim();

  const ensureAgendaSettingsFile = async (clinicId) => {
    await ensureDir(scopedRoot);
    const scopedFile = getScopedFile(clinicId);
    if (!(await pathExists(scopedFile))) {
      if (normalizeClinicId(clinicId) === DEFAULT_CLINIC_ID && (await pathExists(agendaSettingsFile))) {
        const legacy = await readJsonFile(agendaSettingsFile).catch(() => null);
        await writeJsonFile(scopedFile, { ...getDefaultAgendaSettings(), ...(legacy || {}) });
      } else {
        await writeJsonFile(scopedFile, getDefaultAgendaSettings());
      }
    }
    return scopedFile;
  };

  const readLocalAgendaSettings = async (clinicId) => {
    const filePath = await ensureAgendaSettingsFile(clinicId);
    try {
      const data = await readJsonFile(filePath);
      return { ...getDefaultAgendaSettings(), ...(data || {}) };
    } catch (err) {
      console.warn('[AGENDA] Falha ao ler ajustes da agenda', err);
      return getDefaultAgendaSettings();
    }
  };

  const writeLocalAgendaSettings = async (clinicId, record) => {
    const filePath = await ensureAgendaSettingsFile(clinicId);
    await writeJsonFile(filePath, record);
    return record;
  };

  ipcMain.handle('agenda-settings-get', async () => {
    requireAccess({ roles: ['admin'], perms: ['agenda.settings'] });
    const clinicId = getCurrentClinicId();
    const localRecord = await readLocalAgendaSettings(clinicId);

    if (canUseCentral()) {
      const userToken = getUserToken();
      if (userToken) {
        try {
          const remote = await centralBackendAdapter.getClinicOperationalSettingsWithToken(userToken);
          const remoteRecord = { ...getDefaultAgendaSettings(), ...(remote?.agendaSettings || {}) };
          const shouldSeedCentral = !String(remoteRecord.updatedAt || '').trim() && String(localRecord.updatedAt || '').trim();
          const effectiveRecord = shouldSeedCentral
            ? { ...getDefaultAgendaSettings(), ...((await centralBackendAdapter.updateClinicOperationalSettingsWithToken(userToken, { agendaSettings: localRecord }))?.agendaSettings || localRecord) }
            : remoteRecord;
          await writeLocalAgendaSettings(clinicId, effectiveRecord).catch(() => null);
          return effectiveRecord;
        } catch (err) {
          console.warn('[AGENDA] Falha ao ler ajustes centrais da agenda', err?.message || err);
        }
      }
    }

    return localRecord;
  });

  ipcMain.handle('agenda-settings-save', async (_event, payload = {}) => {
    requireAccess({ roles: ['admin'], perms: ['agenda.settings'] });
    const clinicId = getCurrentClinicId();
    const filePath = await ensureAgendaSettingsFile(clinicId);

    const timezone = String(payload.timezone || '').trim() || 'America/Sao_Paulo';
    const markers = Array.isArray(payload.markers) ? payload.markers : [];
    const sanitizedMarkers = markers
      .map(sanitizeMarker)
      .filter(Boolean);

    const record = {
      ...getDefaultAgendaSettings(),
      timezone,
      markers: sanitizedMarkers,
      updatedAt: new Date().toISOString(),
    };

    if (canUseCentral()) {
      const userToken = getUserToken();
      if (userToken) {
        try {
          const remote = await centralBackendAdapter.updateClinicOperationalSettingsWithToken(userToken, {
            agendaSettings: record,
          });
          const effectiveRecord = { ...getDefaultAgendaSettings(), ...(remote?.agendaSettings || record) };
          await writeLocalAgendaSettings(clinicId, effectiveRecord).catch(() => null);
          return effectiveRecord;
        } catch (err) {
          console.warn('[AGENDA] Falha ao salvar ajustes centrais da agenda', err?.message || err);
        }
      }
    }

    await writeJsonFile(filePath, record);
    return record;
  });
};

module.exports = { registerAgendaSettingsHandlers };
