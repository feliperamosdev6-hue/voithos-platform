document.addEventListener('DOMContentLoaded', () => {
  const appApi = window.appApi || {};
  const authApi = appApi.auth || window.auth || {};
  const patientsApi = appApi.patients || window.api?.patients || {};
  const documentsApi = appApi.documents || window.api?.documents || {};
  const clinicApi = appApi.clinic || window.api?.clinic || {};
  const form = document.getElementById('receita-form');
  const pacienteSelect = document.getElementById('receita-paciente');
  const pacienteBusca = document.getElementById('receita-paciente-busca');
  const pacienteToggle = document.getElementById('receita-patient-toggle');
  const pacienteMenu = document.getElementById('receita-patient-menu');
  const pacienteList = document.getElementById('receita-patient-list');
  const profissionalSelect = document.getElementById('receita-profissional');
  const dataInput = document.getElementById('receita-data');
  const itemsContainer = document.getElementById('receita-items');
  const favoritesContainer = document.getElementById('receita-favorites');
  const addItemBtn = document.getElementById('receita-add-item');
  const textoInput = document.getElementById('receita-texto');
  const observacoesInput = document.getElementById('receita-observacoes');
  const openLatestBtn = document.getElementById('receita-open-latest');
  const submitBtn = document.getElementById('receita-submit');
  const hint = document.getElementById('receita-hint');

  const state = {
    patients: [],
    professionals: [],
    currentUser: null,
    clinicReceita: null,
  };

  const setHint = (text) => {
    if (hint) hint.textContent = text || '';
  };

  const formatToday = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const setPacienteLabel = (text) => {
    if (!pacienteToggle) return;
    pacienteToggle.textContent = text || 'Selecione ou crie um(a) novo(a) paciente';
  };

  const closePacienteMenu = () => {
    if (pacienteMenu) pacienteMenu.classList.add('hidden');
  };

  const openPacienteMenu = () => {
    if (pacienteMenu) pacienteMenu.classList.remove('hidden');
  };

  const resolvePatientId = (patient) => String(patient?.id || patient?.prontuario || patient?._id || '');

  const findSelectedPatient = () =>
    state.patients.find((p) => resolvePatientId(p) === String(pacienteSelect?.value || '')) || null;

  const renderPatients = (query = '') => {
    if (!pacienteList) return;
    const normalized = String(query || '').trim().toLowerCase();
    const selectedId = String(pacienteSelect?.value || '');
    const filtered = state.patients.filter((p) => {
      if (!normalized) return true;
      const name = String(p.nome || p.fullName || '').toLowerCase();
      const pront = String(p.prontuario || p.id || '').toLowerCase();
      return name.includes(normalized) || pront.includes(normalized);
    });

    if (!filtered.length) {
      pacienteList.innerHTML = '<div class="patient-item">Nenhum paciente encontrado.</div>';
      return;
    }

    pacienteList.innerHTML = '';
    filtered.forEach((p) => {
      const value = resolvePatientId(p);
      if (!value) return;
      const name = p.nome || p.fullName || 'Paciente';
      const meta = p.prontuario ? `Prontuario ${p.prontuario}` : '';
      const item = document.createElement('div');
      item.className = 'patient-item';
      if (value === selectedId) item.classList.add('active');
      item.dataset.value = value;
      item.innerHTML = `
        <div class="patient-item-name">${name}</div>
        ${meta ? `<div class="patient-item-meta">${meta}</div>` : ''}
      `;
      item.addEventListener('click', () => {
        if (pacienteSelect) pacienteSelect.value = value;
        setPacienteLabel(name);
        closePacienteMenu();
        validateForm();
      });
      pacienteList.appendChild(item);
    });
  };

  const renderProfessionals = () => {
    if (!profissionalSelect) return;
    profissionalSelect.innerHTML = '<option value="">Selecione</option>';
    state.professionals.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id || '';
      opt.textContent = p.nome || 'Profissional';
      profissionalSelect.appendChild(opt);
    });
  };

  const createItemRow = (item = {}) => {
    const row = document.createElement('div');
    row.className = 'receita-item-row';
    row.innerHTML = `
      <input type="text" class="receita-item-nome" placeholder="Medicamento" value="${String(item.nome || '').replace(/"/g, '&quot;')}">
      <input type="text" class="receita-item-posologia" placeholder="Posologia" value="${String(item.posologia || '').replace(/"/g, '&quot;')}">
      <input type="text" class="receita-item-quantidade" placeholder="Quantidade" value="${String(item.quantidade || '').replace(/"/g, '&quot;')}">
      <button type="button" class="stepper-btn receita-item-remove" aria-label="Remover item">-</button>
    `;
    const removeBtn = row.querySelector('.receita-item-remove');
    removeBtn?.addEventListener('click', () => {
      row.remove();
      validateForm();
    });
    row.querySelectorAll('input').forEach((input) => {
      input.addEventListener('input', validateForm);
    });
    return row;
  };

  const renderFavoriteItems = () => {
    if (!favoritesContainer) return;
    const list = Array.isArray(state.clinicReceita?.itensFavoritos) ? state.clinicReceita.itensFavoritos : [];
    favoritesContainer.innerHTML = '';
    if (!list.length) {
      favoritesContainer.classList.add('hidden');
      return;
    }
    favoritesContainer.classList.remove('hidden');
    list.forEach((item) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'receita-favorite-btn';
      btn.textContent = String(item?.nome || 'Item');
      btn.title = [item?.nome, item?.posologia, item?.quantidade].filter(Boolean).join(' | ');
      btn.addEventListener('click', () => {
        itemsContainer?.appendChild(createItemRow(item || {}));
        validateForm();
      });
      favoritesContainer.appendChild(btn);
    });
  };

  const getItems = () => {
    const rows = Array.from(itemsContainer?.querySelectorAll('.receita-item-row') || []);
    return rows
      .map((row) => ({
        nome: row.querySelector('.receita-item-nome')?.value?.trim() || '',
        posologia: row.querySelector('.receita-item-posologia')?.value?.trim() || '',
        quantidade: row.querySelector('.receita-item-quantidade')?.value?.trim() || '',
      }))
      .filter((item) => item.nome);
  };

  const hasContent = () => {
    const items = getItems();
    const textoLivre = String(textoInput?.value || '').trim();
    return items.length > 0 || Boolean(textoLivre);
  };

  const validateForm = () => {
    const pacienteOk = Boolean(pacienteSelect?.value);
    const profissionalOk = Boolean(profissionalSelect?.value);
    const dataOk = Boolean(dataInput?.value);
    const contentOk = hasContent();
    const isValid = pacienteOk && profissionalOk && dataOk && contentOk;

    if (submitBtn) submitBtn.disabled = !isValid;

    if (!pacienteOk || !profissionalOk || !dataOk) {
      setHint('Preencha paciente, profissional e data.');
    } else if (!contentOk) {
      setHint('Adicione ao menos um item ou informe o texto livre.');
    } else {
      setHint('Pronto para emitir a receita.');
    }
    return isValid;
  };

  const loadPatientFromStorage = () => {
    const raw = localStorage.getItem('receitaPatient');
    if (!raw) return;
    localStorage.removeItem('receitaPatient');
    try {
      const patient = JSON.parse(raw);
      const target = state.patients.find((p) => (
        String(p.prontuario || p.id || p._id || '') === String(patient?.prontuario || patient?.id || patient?._id || '')
      ));
      if (!target) return;
      const value = resolvePatientId(target);
      if (pacienteSelect) pacienteSelect.value = value;
      setPacienteLabel(target.nome || target.fullName || 'Paciente');
    } catch (_) {
      // ignore
    }
  };

  const wireEvents = () => {
    pacienteToggle?.addEventListener('click', () => {
      if (pacienteMenu?.classList.contains('hidden')) {
        openPacienteMenu();
        renderPatients(pacienteBusca?.value || '');
        pacienteBusca?.focus();
      } else {
        closePacienteMenu();
      }
    });

    pacienteBusca?.addEventListener('input', (e) => {
      renderPatients(e.target.value || '');
    });

    document.addEventListener('click', (ev) => {
      if (!pacienteMenu || !pacienteToggle) return;
      if (pacienteMenu.contains(ev.target) || pacienteToggle.contains(ev.target)) return;
      closePacienteMenu();
    });

    [pacienteSelect, profissionalSelect, dataInput, textoInput, observacoesInput].forEach((el) => {
      el?.addEventListener('change', validateForm);
      el?.addEventListener('input', validateForm);
    });

    addItemBtn?.addEventListener('click', () => {
      itemsContainer?.appendChild(createItemRow());
      validateForm();
    });

    openLatestBtn?.addEventListener('click', async () => {
      const selectedPatient = findSelectedPatient();
      const prontuario = selectedPatient?.prontuario || selectedPatient?.id || selectedPatient?._id || '';
      if (!prontuario) {
        alert('Selecione um paciente para abrir a ultima receita.');
        return;
      }
      try {
        await documentsApi.openLatestReceita?.({ prontuario });
      } catch (err) {
        console.error('[RECEITA] erro ao abrir ultima receita', err);
        alert(err?.message || 'Nao foi possivel abrir a ultima receita.');
      }
    });

    form?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (!validateForm()) return;

      const selectedPatient = findSelectedPatient();
      const prontuario = selectedPatient?.prontuario || selectedPatient?.id || selectedPatient?._id || '';
      const payload = {
        prontuario,
        pacienteId: pacienteSelect?.value || '',
        pacienteNome: selectedPatient?.nome || selectedPatient?.fullName || '',
        profissionalId: profissionalSelect?.value || '',
        profissionalNome: profissionalSelect?.selectedOptions?.[0]?.textContent || '',
        data: dataInput?.value || '',
        itens: getItems(),
        texto: String(textoInput?.value || '').trim(),
        observacoes: String(observacoesInput?.value || '').trim(),
      };

      try {
        const record = await documentsApi.saveReceita?.(payload);
        if (record?.prontuario && record?.id) {
          await documentsApi.open?.({ prontuario: record.prontuario, documentId: record.id });
        }
        alert('Receita emitida com sucesso.');
      } catch (err) {
        console.error('[RECEITA] erro ao emitir', err);
        alert(err?.message || 'Nao foi possivel emitir a receita.');
      }
    });
  };

  const init = async () => {
    if (dataInput) dataInput.value = formatToday();

    try {
      state.currentUser = await authApi.currentUser?.();
      if (!state.currentUser) {
        window.location.href = 'login.html';
        return;
      }
    } catch (_err) {
      window.location.href = 'login.html';
      return;
    }

    try {
      state.patients = (await patientsApi.list?.()) || [];
    } catch (_err) {
      state.patients = [];
    }

    try {
      const users = await authApi.listUsers?.();
      state.professionals = (users || []).filter((u) => u.tipo === 'dentista');
    } catch (_err) {
      state.professionals = [];
    }

    try {
      const clinic = await clinicApi.get?.();
      state.clinicReceita = (clinic && typeof clinic.receituario === 'object') ? clinic.receituario : null;
    } catch (_err) {
      state.clinicReceita = null;
    }

    if (!state.professionals.length && state.currentUser) {
      state.professionals = [state.currentUser];
    }

    renderPatients();
    renderProfessionals();
    itemsContainer?.appendChild(createItemRow());
    renderFavoriteItems();

    if (state.currentUser?.tipo === 'dentista' && profissionalSelect) {
      profissionalSelect.value = state.currentUser.id || '';
    }

    loadPatientFromStorage();
    if (textoInput && !String(textoInput.value || '').trim()) {
      textoInput.value = String(state.clinicReceita?.textoPadrao || '');
    }
    if (observacoesInput && !String(observacoesInput.value || '').trim()) {
      observacoesInput.value = String(state.clinicReceita?.observacoesPadrao || '');
    }
    validateForm();
  };

  wireEvents();
  init();
});
