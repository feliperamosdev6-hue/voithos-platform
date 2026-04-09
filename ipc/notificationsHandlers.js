const path = require('path');

const DEFAULT_CLINIC_ID = 'defaultClinic';

const getDefaultNotifications = () => ({
  channels: {
    email: true,
    whatsapp: false,
    sms: false,
    inapp: true,
  },
  reminderHours: 24,
  daySummary: false,
  summaryTime: '18:00',
  updatedAt: '',
});

const normalizeTime = (value, fallback) => {
  const raw = String(value || '').trim();
  return /^\d{2}:\d{2}$/.test(raw) ? raw : fallback;
};

const registerNotificationsHandlers = ({
  ipcMain,
  requireAccess,
  ensureDir,
  pathExists,
  readJsonFile,
  writeJsonFile,
  clinicPath,
  notificationsFile,
  currentUserRef,
  readSessionCache,
  centralBackendAdapter,
}) => {
  const normalizeClinicId = (value) => {
    const raw = String(value || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID;
    return raw.replace(/[^a-zA-Z0-9_-]/g, '_');
  };

  const getCurrentClinicId = () => normalizeClinicId(currentUserRef?.()?.clinicId || DEFAULT_CLINIC_ID);
  const scopedRoot = path.join(clinicPath, 'settings', 'notifications');
  const getScopedFile = (clinicId) => path.join(scopedRoot, `${normalizeClinicId(clinicId)}.json`);
  const canUseCentralSettings = () => (
    centralBackendAdapter?.isEnabled?.() === true
    && typeof centralBackendAdapter?.getClinicOperationalSettingsWithToken === 'function'
    && typeof centralBackendAdapter?.updateClinicOperationalSettingsWithToken === 'function'
  );
  const getUserToken = () => String(readSessionCache?.()?.token || '').trim();

  const ensureNotificationsFile = async (clinicId) => {
    await ensureDir(scopedRoot);
    const scopedFile = getScopedFile(clinicId);
    if (!(await pathExists(scopedFile))) {
      if (normalizeClinicId(clinicId) === DEFAULT_CLINIC_ID && (await pathExists(notificationsFile))) {
        const legacy = await readJsonFile(notificationsFile).catch(() => null);
        await writeJsonFile(scopedFile, { ...getDefaultNotifications(), ...(legacy || {}) });
      } else {
        await writeJsonFile(scopedFile, getDefaultNotifications());
      }
    }
    return scopedFile;
  };

  const readLocalNotifications = async (clinicId) => {
    const filePath = await ensureNotificationsFile(clinicId);
    try {
      const data = await readJsonFile(filePath);
      return { ...getDefaultNotifications(), ...(data || {}) };
    } catch (err) {
      console.warn('[NOTIFICATIONS] Falha ao ler configuracoes', err);
      return getDefaultNotifications();
    }
  };

  const writeLocalNotifications = async (clinicId, record) => {
    const filePath = await ensureNotificationsFile(clinicId);
    await writeJsonFile(filePath, record);
    return record;
  };

  ipcMain.handle('notifications-get', async () => {
    requireAccess({ roles: ['admin'], perms: ['notifications.manage'] });
    const clinicId = getCurrentClinicId();
    const localRecord = await readLocalNotifications(clinicId);

    if (canUseCentralSettings()) {
      const userToken = getUserToken();
      if (userToken) {
        try {
          const remote = await centralBackendAdapter.getClinicOperationalSettingsWithToken(userToken);
          const remoteRecord = { ...getDefaultNotifications(), ...(remote?.notificationPreferences || {}) };
          const shouldSeedCentral = !String(remoteRecord.updatedAt || '').trim() && String(localRecord.updatedAt || '').trim();
          const effectiveRecord = shouldSeedCentral
            ? { ...getDefaultNotifications(), ...((await centralBackendAdapter.updateClinicOperationalSettingsWithToken(userToken, { notificationPreferences: localRecord }))?.notificationPreferences || localRecord) }
            : remoteRecord;
          await writeLocalNotifications(clinicId, effectiveRecord).catch(() => null);
          return effectiveRecord;
        } catch (err) {
          console.warn('[NOTIFICATIONS] Falha ao ler configuracoes centrais', err?.message || err);
        }
      }
    }

    return localRecord;
  });

  ipcMain.handle('notifications-save', async (_event, payload = {}) => {
    requireAccess({ roles: ['admin'], perms: ['notifications.manage'] });
    const clinicId = getCurrentClinicId();
    const filePath = await ensureNotificationsFile(clinicId);

    const channels = payload.channels || {};
    const record = {
      ...getDefaultNotifications(),
      channels: {
        email: !!channels.email,
        whatsapp: !!channels.whatsapp,
        sms: !!channels.sms,
        inapp: channels.inapp !== false,
      },
      reminderHours: Math.max(1, Number(payload.reminderHours) || 24),
      daySummary: !!payload.daySummary,
      summaryTime: normalizeTime(payload.summaryTime, '18:00'),
      updatedAt: new Date().toISOString(),
    };

    if (canUseCentralSettings()) {
      const userToken = getUserToken();
      if (userToken) {
        try {
          const remote = await centralBackendAdapter.updateClinicOperationalSettingsWithToken(userToken, {
            notificationPreferences: record,
          });
          const effectiveRecord = { ...getDefaultNotifications(), ...(remote?.notificationPreferences || record) };
          await writeLocalNotifications(clinicId, effectiveRecord).catch(() => null);
          return effectiveRecord;
        } catch (err) {
          console.warn('[NOTIFICATIONS] Falha ao salvar configuracoes centrais', err?.message || err);
        }
      }
    }

    await writeJsonFile(filePath, record);
    return record;
  });

  ipcMain.handle('notifications-events-list', async (_event, payload = {}) => {
    requireAccess({ roles: ['admin', 'recepcionista', 'dentista'], perms: ['agenda.view'] });
    if (centralBackendAdapter?.isEnabled?.() !== true || typeof centralBackendAdapter?.listNotificationEventsWithToken !== 'function') {
      return [];
    }

    const session = await readSessionCache?.().catch(() => null);
    const token = String(session?.remoteToken || session?.token || '').trim();
    if (!token) return [];

    try {
      return await centralBackendAdapter.listNotificationEventsWithToken(token, {
        type: payload?.type,
        limit: payload?.limit || 20,
      });
    } catch (error) {
      const code = String(error?.code || '').trim().toUpperCase();
      const status = Number(error?.status || 0);
      const shouldFallback =
        code === 'CENTRAL_BACKEND_UNAVAILABLE'
        || code === 'CENTRAL_BACKEND_TIMEOUT'
        || error?.name === 'AbortError'
        || status >= 500;
      if (shouldFallback) {
        console.warn('[NOTIFICATIONS] central notification events unavailable', error?.message || error);
        return [];
      }
      throw error;
    }
  });
};

module.exports = { registerNotificationsHandlers };
