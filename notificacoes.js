document.addEventListener('DOMContentLoaded', () => {
  const appApi = window.appApi || {};
  const authApi = appApi.auth || {};
  const notificationsApi = appApi.notifications || {};
  const channelEmail = document.getElementById('channel-email');
  const channelWhatsapp = document.getElementById('channel-whatsapp');
  const channelSms = document.getElementById('channel-sms');
  const channelInapp = document.getElementById('channel-inapp');
  const reminderHours = document.getElementById('reminder-hours');
  const daySummary = document.getElementById('day-summary');
  const summaryTime = document.getElementById('summary-time');
  const saveBtn = document.getElementById('save-notifications');
  const statusEl = document.getElementById('notifications-status');

  const ensureAccess = async () => {
    try {
      const user = await authApi.currentUser();
      const perms = user?.permissions || {};
      const allowed = user?.tipo === 'admin' || perms.admin === true || perms['notifications.manage'] === true;
      if (!user || !allowed) {
        window.location.href = 'index.html';
        return false;
      }
      return true;
    } catch (_) {
      window.location.href = 'index.html';
      return false;
    }
  };

  const setStatus = (text) => {
    if (!statusEl) return;
    statusEl.textContent = text || '';
    if (text) {
      setTimeout(() => {
        if (statusEl.textContent === text) statusEl.textContent = '';
      }, 2000);
    }
  };

  const loadSettings = async () => {
    try {
      const data = await notificationsApi.get();
      if (channelEmail) channelEmail.checked = !!data?.channels?.email;
      if (channelWhatsapp) channelWhatsapp.checked = !!data?.channels?.whatsapp;
      if (channelSms) channelSms.checked = !!data?.channels?.sms;
      if (channelInapp) channelInapp.checked = data?.channels?.inapp !== false;
      if (reminderHours) reminderHours.value = data?.reminderHours || 24;
      if (daySummary) daySummary.checked = !!data?.daySummary;
      if (summaryTime) summaryTime.value = data?.summaryTime || '18:00';
    } catch (err) {
      console.error('Erro ao carregar notificacoes', err);
    }
  };

  saveBtn?.addEventListener('click', async () => {
    try {
      await notificationsApi.save({
        channels: {
          email: !!channelEmail?.checked,
          whatsapp: !!channelWhatsapp?.checked,
          sms: !!channelSms?.checked,
          inapp: !!channelInapp?.checked,
        },
        reminderHours: Number(reminderHours?.value || 24),
        daySummary: !!daySummary?.checked,
        summaryTime: summaryTime?.value || '18:00',
      });
      setStatus('Notificacoes salvas');
    } catch (err) {
      console.error('Erro ao salvar notificacoes', err);
      setStatus(err?.message || 'Erro ao salvar');
    }
  });

  (async () => {
    const ok = await ensureAccess();
    if (!ok) return;
    loadSettings();
  })();
});
