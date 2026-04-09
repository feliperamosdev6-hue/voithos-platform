document.addEventListener('DOMContentLoaded', () => {
  const appApi = window.appApi || {};
  const authApi = appApi.auth || {};
  const patientsApi = appApi.patients || {};
  const documentsApi = appApi.documents || {};
  const form = document.getElementById('atest-form');
  const pacienteSelect = document.getElementById('atest-paciente');
  const pacienteBusca = document.getElementById('atest-paciente-busca');
  const pacienteToggle = document.getElementById('patient-toggle');
  const pacienteMenu = document.getElementById('patient-menu');
  const pacienteList = document.getElementById('patient-list');
  const profissionalSelect = document.getElementById('atest-profissional');
  const dataInput = document.getElementById('atest-data');
  const diasBlock = document.getElementById('atest-dias');
  const horasBlock = document.getElementById('atest-horas');
  const diasInput = document.getElementById('atest-quantidade');
  const horaInicio = document.getElementById('atest-hora-inicio');
  const horaFim = document.getElementById('atest-hora-fim');
  const cidInput = document.getElementById('atest-cid');
  const cidSuggest = document.getElementById('cid-suggest');
  const minusBtn = document.getElementById('dias-minus');
  const plusBtn = document.getElementById('dias-plus');
  const toggleButtons = Array.from(document.querySelectorAll('.toggle-btn'));
  const submitBtn = document.getElementById('atest-submit');
  const hint = document.getElementById('atest-hint');

  const cidList = [
    { codigo: 'K00.0', descricao: 'Anodontia' },
    { codigo: 'K00.1', descricao: 'Dentes supranumerarios' },
    { codigo: 'K00.2', descricao: 'Anomalias do tamanho e forma dos dentes' },
    { codigo: 'K00.3', descricao: 'Dentes manchados' },
    { codigo: 'K00.4', descricao: 'Disturbios da formacao dentaria' },
    { codigo: 'K00.5', descricao: 'Anomalias da erupcao dentaria' },
    { codigo: 'K00.6', descricao: 'Disturbios da erupcao dentaria' },
    { codigo: 'K00.7', descricao: 'Sindrome da erupcao retardada' },
    { codigo: 'K00.8', descricao: 'Outros transtornos do desenvolvimento dentario' },
    { codigo: 'K00.9', descricao: 'Transtorno do desenvolvimento dentario nao especificado' },
    { codigo: 'K01.0', descricao: 'Dente incluso' },
    { codigo: 'K01.1', descricao: 'Dente impactado' },
    { codigo: 'K02.0', descricao: 'Carie do esmalte' },
    { codigo: 'K02.1', descricao: 'Carie da dentina' },
    { codigo: 'K02.2', descricao: 'Carie do cemento' },
    { codigo: 'K02.3', descricao: 'Carie dentaria estacionada' },
    { codigo: 'K02.4', descricao: 'Carie odontoclastica' },
    { codigo: 'K02.8', descricao: 'Outras caries dentarias' },
    { codigo: 'K02.9', descricao: 'Carie dentaria nao especificada' },
    { codigo: 'K03.0', descricao: 'Atricao' },
    { codigo: 'K03.1', descricao: 'Abrasao' },
    { codigo: 'K03.2', descricao: 'Erosao' },
    { codigo: 'K03.3', descricao: 'Reabsorcao patologica dos dentes' },
    { codigo: 'K03.4', descricao: 'Hipercementose' },
    { codigo: 'K03.5', descricao: 'Anquilose dentaria' },
    { codigo: 'K03.6', descricao: 'Depositos nos dentes' },
    { codigo: 'K03.7', descricao: 'Alteracoes de coloracao dos dentes' },
    { codigo: 'K03.8', descricao: 'Outras doencas dos tecidos dentarios duros' },
    { codigo: 'K03.9', descricao: 'Doenca dos tecidos dentarios duros nao especificada' },
    { codigo: 'K04.0', descricao: 'Pulpite' },
    { codigo: 'K04.1', descricao: 'Necrose pulpar' },
    { codigo: 'K04.2', descricao: 'Degeneracao da polpa' },
    { codigo: 'K04.3', descricao: 'Formacao anormal de tecido duro na polpa' },
    { codigo: 'K04.4', descricao: 'Periodontite apical aguda' },
    { codigo: 'K04.5', descricao: 'Abscesso periapical com fistula' },
    { codigo: 'K04.6', descricao: 'Abscesso periapical sem fistula' },
    { codigo: 'K04.7', descricao: 'Cisto periapical' },
    { codigo: 'K04.8', descricao: 'Outras doencas da polpa e tecidos periapicais' },
    { codigo: 'K04.9', descricao: 'Doenca da polpa e tecidos periapicais nao especificada' },
    { codigo: 'K05.0', descricao: 'Gengivite aguda' },
    { codigo: 'K05.1', descricao: 'Gengivite cronica' },
    { codigo: 'K05.2', descricao: 'Periodontite aguda' },
    { codigo: 'K05.3', descricao: 'Periodontite cronica' },
    { codigo: 'K05.4', descricao: 'Periodontose' },
    { codigo: 'K05.5', descricao: 'Outras doencas periodontais' },
    { codigo: 'K05.6', descricao: 'Doenca periodontal nao especificada' },
    { codigo: 'K06.0', descricao: 'Retracao gengival' },
    { codigo: 'K06.1', descricao: 'Hiperplasia gengival' },
    { codigo: 'K06.2', descricao: 'Lesoes da gengiva' },
    { codigo: 'K06.8', descricao: 'Outros transtornos da gengiva e mucosa oral' },
    { codigo: 'K06.9', descricao: 'Transtorno da gengiva e mucosa nao especificado' },
    { codigo: 'K07.0', descricao: 'Anomalias do tamanho da mandibula' },
    { codigo: 'K07.1', descricao: 'Anomalias da relacao maxilomandibular' },
    { codigo: 'K07.2', descricao: 'Anomalias da posicao dos dentes' },
    { codigo: 'K07.3', descricao: 'Anomalias da arcada dentaria' },
    { codigo: 'K07.4', descricao: 'Maloclusao' },
    { codigo: 'K07.5', descricao: 'Anomalias funcionais dentofaciais' },
    { codigo: 'K07.6', descricao: 'Transtornos da articulacao temporomandibular' },
    { codigo: 'K07.8', descricao: 'Outras anomalias dentofaciais' },
    { codigo: 'K07.9', descricao: 'Anomalia dentofacial nao especificada' },
    { codigo: 'K08.0', descricao: 'Esfoliacao de dentes por causas sistemicas' },
    { codigo: 'K08.1', descricao: 'Perda de dentes adquirida' },
    { codigo: 'K08.2', descricao: 'Atrofia do rebordo alveolar' },
    { codigo: 'K08.3', descricao: 'Raiz dentaria retida' },
    { codigo: 'K08.8', descricao: 'Outros transtornos dos dentes e estruturas de suporte' },
    { codigo: 'K08.9', descricao: 'Transtorno dos dentes e estruturas de suporte nao especificado' },
    { codigo: 'K09.0', descricao: 'Cistos de desenvolvimento dos maxilares' },
    { codigo: 'K09.1', descricao: 'Cistos odontogenicos' },
    { codigo: 'K09.2', descricao: 'Outros cistos dos maxilares' },
    { codigo: 'K09.8', descricao: 'Outros cistos da regiao oral' },
    { codigo: 'K09.9', descricao: 'Cisto da regiao oral nao especificado' },
    { codigo: 'K10.0', descricao: 'Transtornos do desenvolvimento dos maxilares' },
    { codigo: 'K10.1', descricao: 'Granuloma central' },
    { codigo: 'K10.2', descricao: 'Doencas inflamatorias dos maxilares' },
    { codigo: 'K10.3', descricao: 'Alveolite' },
    { codigo: 'K10.8', descricao: 'Outras doencas dos maxilares' },
    { codigo: 'K10.9', descricao: 'Doenca do maxilar nao especificada' },
    { codigo: 'K11.0', descricao: 'Atrofia das glandulas salivares' },
    { codigo: 'K11.1', descricao: 'Hipertrofia das glandulas salivares' },
    { codigo: 'K11.2', descricao: 'Sialadenite' },
    { codigo: 'K11.3', descricao: 'Abscesso das glandulas salivares' },
    { codigo: 'K11.4', descricao: 'Fistula das glandulas salivares' },
    { codigo: 'K11.5', descricao: 'Sialolitiase' },
    { codigo: 'K11.6', descricao: 'Mucocele' },
    { codigo: 'K11.7', descricao: 'Disturbios da secrecao salivar' },
    { codigo: 'K11.8', descricao: 'Outras doencas das glandulas salivares' },
    { codigo: 'K11.9', descricao: 'Doenca das glandulas salivares nao especificada' },
    { codigo: 'K12.0', descricao: 'Estomatite aftosa' },
    { codigo: 'K12.1', descricao: 'Outras estomatites' },
    { codigo: 'K12.2', descricao: 'Celulite e abscesso da boca' },
    { codigo: 'K13.0', descricao: 'Doencas dos labios' },
    { codigo: 'K13.1', descricao: 'Mordedura da mucosa oral' },
    { codigo: 'K13.2', descricao: 'Leucoplasia' },
    { codigo: 'K13.3', descricao: 'Leucoedema' },
    { codigo: 'K13.4', descricao: 'Lesoes granulomatosas da mucosa oral' },
    { codigo: 'K13.5', descricao: 'Fibrose oral' },
    { codigo: 'K13.6', descricao: 'Hiperplasia da mucosa oral' },
    { codigo: 'K13.7', descricao: 'Outras lesoes da mucosa oral' },
    { codigo: 'K13.8', descricao: 'Outras doencas da mucosa oral' },
    { codigo: 'K13.9', descricao: 'Doenca da mucosa oral nao especificada' },
    { codigo: 'K14.0', descricao: 'Glossite' },
    { codigo: 'K14.1', descricao: 'Lingua geografica' },
    { codigo: 'K14.2', descricao: 'Glossite romboidal' },
    { codigo: 'K14.3', descricao: 'Hipertrofia das papilas da lingua' },
    { codigo: 'K14.4', descricao: 'Atrofia das papilas da lingua' },
    { codigo: 'K14.5', descricao: 'Lingua fissurada' },
    { codigo: 'K14.6', descricao: 'Glossite mediana' },
    { codigo: 'K14.8', descricao: 'Outras doencas da lingua' },
    { codigo: 'K14.9', descricao: 'Doenca da lingua nao especificada' },
    { codigo: 'Z45.8', descricao: 'Ajuste e manutencao de outros dispositivos medicos' },
  ];

  const state = {
    patients: [],
    professionals: [],
    type: 'dias',
    currentUser: null,
  };

  const formatToday = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };


  const setHint = (text) => {
    if (hint) hint.textContent = text || '';
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
      const value = p.id || p.prontuario || p._id || '';
      if (!value) return;
      const name = p.nome || p.fullName || 'Paciente';
      const meta = p.prontuario ? `Prontuario ${p.prontuario}` : '';
      const item = document.createElement('div');
      item.className = 'patient-item';
      if (String(value) === selectedId) item.classList.add('active');
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

  const escapeHtml = (value) => {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const highlightText = (text, query) => {
    if (!query) return escapeHtml(text);
    const safe = escapeHtml(text);
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')})`, 'ig');
    return safe.replace(regex, '<span class="cid-highlight">$1</span>');
  };

  const renderCidSuggestions = (query = '', showAll = false) => {
    if (!cidSuggest) return;
    const q = String(query || '').trim().toLowerCase();
    if (!q && !showAll) {
      cidSuggest.classList.add('hidden');
      cidSuggest.innerHTML = '';
      return;
    }
    const base = q
      ? cidList.filter((item) => (
        item.codigo.toLowerCase().includes(q) || item.descricao.toLowerCase().includes(q)
      ))
      : cidList;
    const results = base;
    if (!results.length) {
      cidSuggest.classList.add('hidden');
      cidSuggest.innerHTML = '';
      return;
    }
    cidSuggest.innerHTML = results.map((item) => {
      const codeHtml = highlightText(item.codigo, q);
      const descHtml = highlightText(item.descricao, q);
      return `
        <div class="cid-item" role="option" data-value="${escapeHtml(item.codigo)} - ${escapeHtml(item.descricao)}">
          <span class="cid-code">${codeHtml}</span>
          <span class="cid-desc">${descHtml}</span>
        </div>
      `;
    }).join('');
    cidSuggest.classList.remove('hidden');
    cidSuggest.querySelectorAll('.cid-item').forEach((item) => {
      item.addEventListener('click', () => {
        const value = item.dataset.value || '';
        if (cidInput) cidInput.value = value;
        cidSuggest.classList.add('hidden');
        cidSuggest.innerHTML = '';
        validateForm();
      });
    });
  };

  const toggleType = (type) => {
    state.type = type;
    toggleButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.type === type);
    });
    if (diasBlock) diasBlock.classList.toggle('hidden', type !== 'dias');
    if (horasBlock) horasBlock.classList.toggle('hidden', type !== 'horas');
    validateForm();
  };

  const validateForm = () => {
    const pacienteOk = Boolean(pacienteSelect?.value);
    const profissionalOk = Boolean(profissionalSelect?.value);
    const dataOk = Boolean(dataInput?.value);
    let extraOk = true;

    if (state.type === 'dias') {
      const qtd = Number(diasInput?.value || 0);
      extraOk = qtd >= 1;
    } else {
      const inicio = horaInicio?.value || '';
      const fim = horaFim?.value || '';
      extraOk = Boolean(inicio && fim && inicio < fim);
    }

    const isValid = pacienteOk && profissionalOk && dataOk && extraOk;
    if (submitBtn) submitBtn.disabled = !isValid;
    if (!pacienteOk || !profissionalOk || !dataOk) {
      setHint('Preencha paciente, profissional e data.');
    } else if (!extraOk) {
      setHint(state.type === 'dias' ? 'Informe a quantidade de dias.' : 'Informe horario de inicio e fim.');
    } else {
      setHint('Pronto para emitir o atestado.');
    }
    return isValid;
  };

  const loadPatientFromStorage = () => {
    const raw = localStorage.getItem('atestadoPatient');
    if (!raw) return;
    localStorage.removeItem('atestadoPatient');
    try {
      const patient = JSON.parse(raw);
      const target = state.patients.find((p) => (
        String(p.id || p.prontuario || p._id || '') === String(patient?.id || patient?.prontuario || patient?._id || '')
      ));
      if (!target) return;
      const value = target.id || target.prontuario || target._id || '';
      if (pacienteSelect) pacienteSelect.value = value;
      setPacienteLabel(target.nome || target.fullName || 'Paciente');
    } catch (_) {
      // ignore
    }
  };

  const wireEvents = () => {
    toggleButtons.forEach((btn) => {
      btn.addEventListener('click', () => toggleType(btn.dataset.type || 'dias'));
    });

    minusBtn?.addEventListener('click', () => {
      const current = Number(diasInput?.value || 1);
      diasInput.value = String(Math.max(1, current - 1));
      validateForm();
    });

    plusBtn?.addEventListener('click', () => {
      const current = Number(diasInput?.value || 1);
      diasInput.value = String(current + 1);
      validateForm();
    });

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

    [pacienteSelect, profissionalSelect, dataInput, diasInput, horaInicio, horaFim, cidInput].forEach((el) => {
      el?.addEventListener('change', validateForm);
      el?.addEventListener('input', validateForm);
    });

    cidInput?.addEventListener('input', (e) => {
      renderCidSuggestions(e.target.value || '', true);
    });

    cidInput?.addEventListener('focus', (e) => {
      renderCidSuggestions(e.target.value || '', true);
    });

    document.addEventListener('click', (ev) => {
      if (!cidSuggest || !cidInput) return;
      if (cidSuggest.contains(ev.target) || cidInput.contains(ev.target)) return;
      cidSuggest.classList.add('hidden');
      cidSuggest.innerHTML = '';
    });

    document.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape') return;
      closePacienteMenu();
      if (cidSuggest) {
        cidSuggest.classList.add('hidden');
        cidSuggest.innerHTML = '';
      }
    });

    form?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (!validateForm()) return;
      const selectedPatient = state.patients.find((p) => String(p.id || p.prontuario || p._id || '') === String(pacienteSelect?.value || ''));
      const prontuario = selectedPatient?.prontuario || selectedPatient?.id || selectedPatient?._id || '';
      const payload = {
        prontuario,
        pacienteId: pacienteSelect?.value || '',
        pacienteNome: selectedPatient?.nome || selectedPatient?.fullName || '',
        profissionalId: profissionalSelect?.value || '',
        profissionalNome: profissionalSelect?.selectedOptions?.[0]?.textContent || '',
        data: dataInput?.value || '',
        tipo: state.type,
        dias: state.type === 'dias' ? Number(diasInput?.value || 1) : 0,
        horaInicio: state.type === 'horas' ? (horaInicio?.value || '') : '',
        horaFim: state.type === 'horas' ? (horaFim?.value || '') : '',
        cid: cidInput?.value || '',
        assinatura: Boolean(document.getElementById('atest-assinatura')?.checked),
      };
      try {
        const record = await documentsApi.saveAtestado?.(payload);
        if (record?.prontuario && record?.id) {
          await documentsApi.open?.({ prontuario: record.prontuario, documentId: record.id });
        }
        alert('Atestado emitido com sucesso.');
      } catch (err) {
        console.error('[ATESTADO] erro ao emitir', err);
        alert(err?.message || 'Nao foi possivel emitir o atestado.');
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

    if (!state.professionals.length && state.currentUser) {
      state.professionals = [state.currentUser];
    }

    renderPatients();
    renderProfessionals();

    if (state.currentUser?.tipo === 'dentista' && profissionalSelect) {
      profissionalSelect.value = state.currentUser.id || '';
    }

    loadPatientFromStorage();
    toggleType('dias');
    validateForm();
  };

  wireEvents();
  init();
});

