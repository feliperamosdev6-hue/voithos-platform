document.addEventListener('DOMContentLoaded', () => {
  const appApi = window.appApi || {};
  const authApi = appApi.auth || {};
  const agendaSettingsApi = appApi.agendaSettings || {};
  const timezoneSelect = document.getElementById('agenda-timezone');
  const saveTimezoneBtn = document.getElementById('btn-save-timezone');
  const timezoneStatus = document.getElementById('timezone-status');
  const markersTbody = document.getElementById('markers-tbody');
  const addMarkerBtn = document.getElementById('btn-add-marker');
  const modal = document.getElementById('marker-modal');
  const modalClose = document.getElementById('marker-close');
  const modalCancel = document.getElementById('marker-cancel');
  const markerForm = document.getElementById('marker-form');
  const markerName = document.getElementById('marker-name');
  const markerColor = document.getElementById('marker-color');
  const markerColorPreview = document.getElementById('marker-color-preview');
  const markerColorLabel = document.getElementById('marker-color-label');
  const markerError = document.getElementById('marker-error');

  const timezoneOptions = [
    { value: 'America/Sao_Paulo', label: 'Brasilia - UTC-03:00' },
    { value: 'America/Fortaleza', label: 'Fortaleza - UTC-03:00' },
    { value: 'America/Cuiaba', label: 'Cuiaba - UTC-04:00' },
    { value: 'America/Manaus', label: 'Manaus - UTC-04:00' },
    { value: 'America/Boa_Vista', label: 'Boa Vista - UTC-04:00' },
    { value: 'America/Rio_Branco', label: 'Rio Branco - UTC-05:00' },
  ];

  const colorOptions = [
    { value: '#FBBF24', label: 'Amarelo' },
    { value: '#38BDF8', label: 'Azul claro' },
    { value: '#2563EB', label: 'Azul escuro' },
    { value: '#14B8A6', label: 'Azul turquesa' },
    { value: '#F97316', label: 'Laranja' },
    { value: '#F472B6', label: 'Rosa' },
    { value: '#A855F7', label: 'Roxo' },
    { value: '#22C55E', label: 'Verde claro' },
    { value: '#16A34A', label: 'Verde escuro' },
    { value: '#EF4444', label: 'Vermelho' },
    { value: '#64748B', label: 'Cinza' },
  ];

  let settings = {
    timezone: 'America/Sao_Paulo',
    markers: [],
  };

  const setStatus = (text) => {
    if (!timezoneStatus) return;
    timezoneStatus.textContent = text || '';
    if (text) {
      setTimeout(() => {
        if (timezoneStatus.textContent === text) timezoneStatus.textContent = '';
      }, 2500);
    }
  };

  const ensureAccess = async () => {
    try {
      const user = await authApi.currentUser();
      const perms = user?.permissions || {};
      const allowed = user?.tipo === 'admin' || perms.admin === true || perms['agenda.settings'] === true;
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

  const buildTimezoneOptions = () => {
    if (!timezoneSelect) return;
    timezoneSelect.innerHTML = timezoneOptions.map((opt) =>
      `<option value="${opt.value}">${opt.label}</option>`
    ).join('');
  };

  const buildColorOptions = () => {
    if (!markerColor) return;
    markerColor.innerHTML = '<option value="">Selecione uma cor</option>' + colorOptions
      .map((opt) => `<option value="${opt.value}">${opt.label}</option>`)
      .join('');
  };

  const getColorLabel = (value) => {
    const found = colorOptions.find((opt) => opt.value === value);
    return found ? found.label : 'Cor personalizada';
  };

  const updateColorPreview = () => {
    if (!markerColor) return;
    const value = markerColor.value || '';
    if (markerColorPreview) markerColorPreview.style.background = value || '#e2e8f0';
    if (markerColorLabel) markerColorLabel.textContent = value ? getColorLabel(value) : 'Selecione uma cor';
  };

  const renderMarkers = () => {
    if (!markersTbody) return;
    if (!settings.markers.length) {
      markersTbody.innerHTML = '<tr><td colspan="3" class="empty">Nenhum marcador criado.</td></tr>';
      return;
    }

    markersTbody.innerHTML = settings.markers.map((marker) => `
      <tr>
        <td>${marker.nome || ''}</td>
        <td><span class="marker-dot" style="background:${marker.cor}"></span>${getColorLabel(marker.cor)}</td>
        <td>
          <button class="action-btn danger" type="button" data-action="delete" data-id="${marker.id}">Excluir</button>
        </td>
      </tr>
    `).join('');

    markersTbody.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', async (ev) => {
        const id = ev.currentTarget.getAttribute('data-id');
        if (!id) return;
        const ok = confirm('Remover marcador?');
        if (!ok) return;
        settings.markers = settings.markers.filter((m) => m.id !== id);
        await saveSettings();
        renderMarkers();
      });
    });
  };

  const openModal = () => {
    if (markerForm) markerForm.reset();
    if (markerError) markerError.textContent = '';
    if (modal) modal.classList.add('open');
    updateColorPreview();
    markerName?.focus();
  };

  const closeModal = () => {
    if (modal) modal.classList.remove('open');
  };

  const saveSettings = async () => {
    try {
      const payload = {
        timezone: settings.timezone,
        markers: settings.markers,
      };
      const saved = await agendaSettingsApi.save(payload);
      settings = {
        timezone: saved?.timezone || settings.timezone,
        markers: Array.isArray(saved?.markers) ? saved.markers : settings.markers,
      };
      setStatus('Ajustes salvos');
    } catch (err) {
      console.error('Erro ao salvar ajustes da agenda', err);
      alert(err?.message || 'Erro ao salvar ajustes.');
    }
  };

  const loadSettings = async () => {
    if (markersTbody) markersTbody.innerHTML = '<tr><td colspan="3" class="empty">Carregando...</td></tr>';
    try {
      const data = await agendaSettingsApi.get();
      settings = {
        timezone: data?.timezone || 'America/Sao_Paulo',
        markers: Array.isArray(data?.markers) ? data.markers : [],
      };
      if (timezoneSelect) timezoneSelect.value = settings.timezone;
      renderMarkers();
    } catch (err) {
      console.error('Erro ao carregar ajustes da agenda', err);
      if (markersTbody) markersTbody.innerHTML = '<tr><td colspan="3" class="empty">Falha ao carregar.</td></tr>';
    }
  };

  saveTimezoneBtn?.addEventListener('click', async () => {
    settings.timezone = timezoneSelect?.value || 'America/Sao_Paulo';
    await saveSettings();
  });

  addMarkerBtn?.addEventListener('click', openModal);
  modalClose?.addEventListener('click', closeModal);
  modalCancel?.addEventListener('click', closeModal);
  markerColor?.addEventListener('change', updateColorPreview);

  markerForm?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (markerError) markerError.textContent = '';
    const nome = markerName?.value.trim() || '';
    const cor = markerColor?.value || '';
    if (!nome || !cor) {
      if (markerError) markerError.textContent = 'Informe nome e cor do marcador.';
      return;
    }
    const newMarker = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      nome,
      cor,
    };
    settings.markers = [...settings.markers, newMarker];
    await saveSettings();
    renderMarkers();
    closeModal();
  });

  (async () => {
    const ok = await ensureAccess();
    if (!ok) return;
    buildTimezoneOptions();
    buildColorOptions();
    updateColorPreview();
    loadSettings();
  })();
});
