// Servicos: fluxo sem agendamento

document.addEventListener('DOMContentLoaded', () => {
  const AGENDA_PREFILL_PATIENT_KEY = 'agendaPrefillPatient';
  const AGENDA_PREFILL_DRAFT_KEY = 'agendaPrefillDraft';
  const appApi = window.appApi || {};
  const authApi = appApi.auth || window.auth || {};
  const patientsApi = appApi.patients || window.api?.patients || {};
  const servicesApi = appApi.services || window.api?.services || {};
  const documentsApi = appApi.documents || window.api?.documents || {};
  const loadProceduresApi = appApi.loadProcedures || window.api?.loadProcedures;
  const getElem = (id) => document.getElementById(id);
  const logProcedureSave = (stage, extra = {}) => {
    try {
      console.info(`[SERVICOS] ${stage}`, JSON.stringify(extra));
    } catch (_) {
      console.info(`[SERVICOS] ${stage}`, extra);
    }
  };
  const logServicesContext = (stage, extra = {}) => {
    try {
      console.info(`[SERVICOS] ${stage}`, JSON.stringify(extra));
    } catch (_) {
      console.info(`[SERVICOS] ${stage}`, extra);
    }
  };

  const serviceForm = getElem('service-form');
  const patientSearchResult = getElem('patientSearchResult');
  const hiddenProntuarioField = getElem('patientProntuario');
  const patientToggle = getElem('patient-toggle');
  const patientMenu = getElem('patient-menu');
  const patientSearchInput = getElem('patient-search');
  const patientList = getElem('patient-list');
  const viewAnamneseBtn = getElem('btn-ver-anamnese');
  const serviceNameInput = getElem('serviceName');
  const dropdownArrow = getElem('dropdownArrow');
  const serviceValueInput = getElem('serviceValue');
  const addServiceBtn = getElem('addServiceBtn');
  const selectedServicesList = getElem('selectedServicesList');
  const serviceSuggestionsContainer = getElem('serviceSuggestions');
  const selectDentistaServico = getElem('selectDentistaServico');
  const dentistaNomeFixo = getElem('dentistaNomeFixo');
  const btnSalvarServico = getElem('btn-salvar-servico');
  const btnSalvarServicoAgendar = getElem('btn-salvar-servico-agendar');
  const faceChips = Array.from(document.querySelectorAll('.face-chip[data-face]'));
  const odontogramaFrame = document.querySelector('.odontograma-frame');
  const odontogramaLayout = getElem('odontograma-layout');
  const odontoModeSubtitle = getElem('servicos-odontograma-mode-subtitle');
  const odontoModeButtons = Array.from(document.querySelectorAll('[data-odonto-mode]'));

  let allProcedures = [];
  let selectedServices = [];
  let currentUser = null;

  const getClinicStorageKey = (baseKey) => {
    const clinicId = String(currentUser?.clinicId || '').trim();
    return clinicId ? `${baseKey}:${clinicId}` : `${baseKey}:global`;
  };
  let currentPatient = null;
  let dentistasCache = [];
  let currentPatientNome = '';
  let pacientesCache = [];
  let dentesSelecionadosIframe = [];
  let resumoDenteAtual = '';
  let currentOdontoMode = 'permanente';
  let facesPorDente = {};
  const faceOrder = ['D', 'L', 'M', 'O', 'V'];
  const ODONTO_PERMANENTE_SET = new Set([
    '18','17','16','15','14','13','12','11','21','22','23','24','25','26','27','28',
    '48','47','46','45','44','43','42','41','31','32','33','34','35','36','37','38',
  ]);
  const ODONTO_DECIDUO_SET = new Set([
    '55','54','53','52','51','61','62','63','64','65',
    '85','84','83','82','81','71','72','73','74','75',
  ]);

  const normalizeOdontoMode = (mode) => String(mode || '').toLowerCase() === 'deciduo' ? 'deciduo' : 'permanente';
  const toothBelongsToOdontoMode = (tooth, mode = currentOdontoMode) => {
    const value = String(tooth || '').trim();
    if (!value) return false;
    const target = normalizeOdontoMode(mode);
    return target === 'deciduo' ? ODONTO_DECIDUO_SET.has(value) : ODONTO_PERMANENTE_SET.has(value);
  };
  const inferInitialOdontoMode = (patient) => {
    const p = patient || {};
    const directFlags = [p.isInfantil, p.infantil, p.pacienteInfantil, p.odontogramaInfantil];
    if (directFlags.some((flag) => flag === true || flag === 'true' || flag === 1 || flag === '1')) return 'deciduo';
    const tipo = String(p.tipoOdontograma || p.odontogramaTipo || p.classificacaoOdontograma || '').toLowerCase();
    if (tipo.includes('decid') || tipo.includes('infan')) return 'deciduo';
    return 'permanente';
  };
  const getOdontoModeSubtitle = (mode = currentOdontoMode) => (
    normalizeOdontoMode(mode) === 'deciduo' ? 'Deciduo' : 'Permanente'
  );
  const updateOdontoModeUI = () => {
    const mode = normalizeOdontoMode(currentOdontoMode);
    if (odontoModeSubtitle) odontoModeSubtitle.textContent = getOdontoModeSubtitle(mode);
    odontogramaLayout?.classList.toggle('is-deciduo', mode === 'deciduo');
    odontoModeButtons.forEach((btn) => {
      const active = String(btn.dataset.odontoMode || '') === mode;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  };
  const postOdontoModeToIframe = () => {
    if (!odontogramaFrame?.contentWindow) return;
    odontogramaFrame.contentWindow.postMessage({ type: 'odontograma:set-mode', mode: normalizeOdontoMode(currentOdontoMode) }, '*');
  };
  const setCurrentOdontoMode = (mode) => {
    const nextMode = normalizeOdontoMode(mode);
    const prevMode = normalizeOdontoMode(currentOdontoMode);
    currentOdontoMode = nextMode;
    updateOdontoModeUI();
    postOdontoModeToIframe();
    if (prevMode !== nextMode) {
      dentesSelecionadosIframe = dentesSelecionadosIframe.filter((d) => toothBelongsToOdontoMode(d, nextMode));
      if (resumoDenteAtual && !toothBelongsToOdontoMode(resumoDenteAtual, nextMode)) resumoDenteAtual = '';
      const resumoDentesEl = getElem('dentesSelecionadosResumo');
      if (resumoDentesEl) resumoDentesEl.textContent = dentesSelecionadosIframe.length ? dentesSelecionadosIframe.join(', ') : 'Nenhum';
      const resumoDenteEl = getElem('painelResumoDente');
      if (resumoDenteEl) resumoDenteEl.textContent = resumoDenteAtual || '-';
      updateFacesUI();
    }
  };

  const parseMoney = (raw) => {
    const clean = String(raw || '').trim().replace(',', '.');
    const value = parseFloat(clean);
    return Number.isFinite(value) ? value : 0;
  };

  const ensureToast = () => {
    if (document.getElementById('servicos-toast-style')) return;
    const style = document.createElement('style');
    style.id = 'servicos-toast-style';
    style.textContent = "\
.sv-toast-container { position: fixed; bottom: 20px; right: 20px; z-index: 2000; display: flex; flex-direction: column; gap: 10px; }\
.sv-toast { min-width: 260px; max-width: 340px; padding: 12px 16px; border-radius: 10px; font-size: 14px; box-shadow: 0 8px 20px rgba(0,0,0,0.15); background: #eef4ff; color: #1d4ed8; animation: svSlideIn 0.3s ease, svFadeOut 0.3s ease 4.7s forwards; }\
.sv-toast.error { background: #fdecea; color: #b42318; }\
.sv-toast.success { background: #e7f6ef; color: #0f5132; }\
@keyframes svSlideIn { from { transform: translateX(30px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }\
@keyframes svFadeOut { to { opacity: 0; transform: translateX(30px); } }\
";
    document.head.appendChild(style);
  };

  const showToast = (message, type = 'info') => {
    ensureToast();
    let container = document.querySelector('.sv-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'sv-toast-container';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `sv-toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
  };

  const emitProcedureAndFinanceUpdated = (source = 'servicos') => {
    try {
      window.dispatchEvent(new CustomEvent('finance-updated', { detail: { source } }));
      window.dispatchEvent(new CustomEvent('patient-clinical-updated', {
        detail: {
          source,
          prontuario: hiddenProntuarioField?.value || '',
          patientId: currentPatient?.id || currentPatient?.prontuario || '',
        },
      }));
      localStorage.setItem(getClinicStorageKey('voithos-finance-updated'), JSON.stringify({ at: Date.now(), source }));
    } catch (_) {}
  };

  const getFacesAtuais = () => (resumoDenteAtual ? (facesPorDente[resumoDenteAtual] || []) : []);

  const updateFacesUI = () => {
    const faces = getFacesAtuais();
    const label = faces.length === faceOrder.length ? 'Completo' : (faces.length ? faces.join('') : '-');
    const resumoFaces = getElem('painelResumoFaces');
    if (resumoFaces) resumoFaces.textContent = label;
    faceChips.forEach((chip) => {
      chip.classList.toggle('active', faces.includes(chip.dataset.face));
    });
  };

  const sendFacesToIframe = () => {
    if (!odontogramaFrame?.contentWindow || !resumoDenteAtual) return;
    const faces = getFacesAtuais();
    odontogramaFrame.contentWindow.postMessage({
      type: 'odontograma:set-faces',
      dente: resumoDenteAtual,
      faces,
    }, '*');
  };

  window.addEventListener('message', (event) => {
    if (!event || !event.data || event.data.type !== 'odontograma:update') return;
    const payload = event.data.payload || {};
    const payloadMode = normalizeOdontoMode(payload.mode || currentOdontoMode);
    const dentes = Array.isArray(payload.dentes) ? payload.dentes : [];
    const resumo = Array.isArray(payload.resumo) ? payload.resumo : [];
    dentesSelecionadosIframe = dentes.filter((d) => toothBelongsToOdontoMode(d, payloadMode));
    const el = getElem('dentesSelecionadosResumo');
    if (el) {
      el.textContent = resumo.length ? resumo.join(', ') : 'Nenhum';
    }
    const lastDente = payload.lastDente || '';
    const lastFacesArr = Array.isArray(payload.lastFaces) ? payload.lastFaces : [];
    const resumoDente = getElem('painelResumoDente');
    if (resumoDente) resumoDente.textContent = (lastDente && toothBelongsToOdontoMode(lastDente, payloadMode)) ? lastDente : '-';

    if (lastDente && toothBelongsToOdontoMode(lastDente, payloadMode)) {
      resumoDenteAtual = lastDente;
      facesPorDente[lastDente] = lastFacesArr;
    } else {
      resumoDenteAtual = '';
    }
    updateFacesUI();
  });

  const getDentesSelecionados = () => dentesSelecionadosIframe.slice();

  const resetWorkingOdontoSelection = ({ preserveVisual = true } = {}) => {
    dentesSelecionadosIframe = [];
    resumoDenteAtual = '';
    facesPorDente = {};
    const resumoDentes = getElem('dentesSelecionadosResumo');
    if (resumoDentes) resumoDentes.textContent = 'Nenhum';
    const resumoDente = getElem('painelResumoDente');
    if (resumoDente) resumoDente.textContent = '-';
    updateFacesUI();
    if (odontogramaFrame?.contentWindow) {
      odontogramaFrame.contentWindow.postMessage({
        type: preserveVisual ? 'odontograma:clear-working-selection' : 'odontograma:clear-selection',
      }, '*');
    }
  };

  const markServicesAsVisualHistory = (items = []) => {
    if (!odontogramaFrame?.contentWindow) return;
    const mergedByTooth = new Map();
    (Array.isArray(items) ? items : []).forEach((item) => {
      const dente = Array.isArray(item?.dentes) ? String(item.dentes[0] || '').trim() : '';
      if (!dente) return;
      const faces = Array.isArray(item?.faces) ? item.faces.filter(Boolean) : [];
      if (!mergedByTooth.has(dente)) mergedByTooth.set(dente, new Set());
      const set = mergedByTooth.get(dente);
      faces.forEach((face) => set.add(face));
      if (!faces.length && !mergedByTooth.has(dente)) mergedByTooth.set(dente, new Set());
    });
    mergedByTooth.forEach((facesSet, dente) => {
      odontogramaFrame.contentWindow.postMessage({
        type: 'odontograma:set-faces',
        dente,
        faces: Array.from(facesSet),
        historico: true,
        historyBucket: 'queue',
      }, '*');
    });
  };

  const syncQueueVisualHistoryFromSelectedServices = () => {
    if (!odontogramaFrame?.contentWindow) return;
    odontogramaFrame.contentWindow.postMessage({ type: 'odontograma:clear-queue-history' }, '*');
    if (!selectedServices.length) return;
    markServicesAsVisualHistory(selectedServices);
  };

  const normalizeToothList = (dentes) => {
    const seen = new Set();
    return (Array.isArray(dentes) ? dentes : [])
      .map((d) => String(d || '').trim())
      .filter((d) => d && !seen.has(d) && seen.add(d));
  };

  const explodeServiceByTooth = (entry = {}) => {
    const dentes = normalizeToothList(entry.dentes);
    const faces = Array.isArray(entry.faces) ? entry.faces.map((f) => String(f || '').trim()).filter(Boolean) : [];
    const denteFaces = String(entry.denteFaces || '').trim();
    if (!dentes.length) return [{ ...entry, dentes: [], faces: [], denteFaces: '' }];
    return dentes.map((tooth) => ({
      ...entry,
      dentes: [tooth],
      faces: denteFaces === tooth ? faces.slice() : [],
      denteFaces: denteFaces === tooth ? tooth : '',
    }));
  };

  const loadCurrentUser = async () => {
    try {
      currentUser = await authApi.currentUser?.();
    } catch (err) {
      console.warn('[SERVICOS] nao foi possivel carregar usuario atual', err);
      currentUser = null;
    }
  };

  const carregarDentistas = async () => {
    if (currentUser?.tipo === 'dentista') return;
    try {
      const users = await authApi.listUsers?.();
      const currentClinicId = String(currentUser?.clinicId || '').trim();
      dentistasCache = (users || []).filter((u) => {
        if (u.tipo !== 'dentista') return false;
        const dentistClinicId = String(u?.clinicId || '').trim();
        return !currentClinicId || dentistClinicId === currentClinicId;
      });
      if (selectDentistaServico) {
        selectDentistaServico.innerHTML = '<option value="">Selecione o dentista responsavel</option>';
        dentistasCache.forEach((d) => {
          const opt = document.createElement('option');
          opt.value = d.id || '';
          opt.textContent = d.nome || 'Dentista';
          selectDentistaServico.appendChild(opt);
        });
      }
    } catch (err) {
      console.warn('[SERVICOS] nao foi possivel carregar dentistas', err);
    }
  };

  const ajustarBlocoDentistaResponsavel = () => {
    const bloco = getElem('dentista-responsavel-bloco');
    if (!bloco) return;
    if (currentUser?.tipo === 'dentista') {
      if (selectDentistaServico) selectDentistaServico.style.display = 'none';
      if (dentistaNomeFixo) {
        dentistaNomeFixo.style.display = 'inline';
        dentistaNomeFixo.textContent = currentUser?.nome || 'Dentista';
      }
    } else {
      if (selectDentistaServico) selectDentistaServico.style.display = '';
      if (dentistaNomeFixo) dentistaNomeFixo.style.display = 'none';
    }
  };

  const loadProcedures = async () => {
    try {
      if (!loadProceduresApi) throw new Error('API indisponivel');
      const procedures = await loadProceduresApi();
      allProcedures = (procedures || []).map((p) => ({
        codigo: String(p.codigo || ''),
        nome: (p.nome || 'Procedimento sem nome').replace(/\s+/g, ' ').trim(),
        preco: parseFloat(p.preco || 0),
      }));
      dropdownArrow?.classList.add('clickable');
    } catch (error) {
      console.warn('[SERVICOS] procedimentos nao carregados', error);
    }
  };

  const showSuggestions = (inputValue = '') => {
    const searchTerm = inputValue.trim().toLowerCase();
    const results = searchTerm
      ? allProcedures.filter((proc) =>
          proc.nome.toLowerCase().includes(searchTerm) || proc.codigo.startsWith(searchTerm)
        )
      : allProcedures;

    if (results.length > 0) {
      const listHtml = results
        .map((proc) => `<li data-proc-codigo="${proc.codigo}"><strong>${proc.codigo}</strong> - ${proc.nome}</li>`)
        .join('');
      serviceSuggestionsContainer.innerHTML = `<ul>${listHtml}</ul>`;
      serviceSuggestionsContainer.style.display = 'block';
    } else {
      serviceSuggestionsContainer.style.display = 'none';
    }
  };

  const setPatientLabel = (text) => {
    if (!patientToggle) return;
    patientToggle.textContent = text || 'Selecione ou crie um(a) novo(a) paciente';
  };

  const setupPatientDropdown = () => {
    if (!patientToggle) return;
    setPatientLabel(currentPatientNome || 'Selecione ou crie um(a) novo(a) paciente');
  };

  const closePatientMenu = () => {
    if (patientMenu) patientMenu.classList.add('hidden');
  };

  const openPatientMenu = () => {
    if (patientMenu) patientMenu.classList.remove('hidden');
  };

  const renderPatientList = (query = '') => {
    if (!patientList) return;
    const q = String(query || '').trim().toLowerCase();
    const qDigits = String(query || '').replace(/\D/g, '');
    const filtered = pacientesCache.filter((p) => {
      if (!q && !qDigits) return true;
      const nome = String(p.fullName || p.nome || '').toLowerCase();
      const cpf = String(p.cpf || '').replace(/\D/g, '');
      const pront = String(p.prontuario || p.id || p._id || '').toLowerCase();
      return nome.includes(q) || (qDigits && cpf.includes(qDigits)) || pront.includes(q);
    });

    patientList.innerHTML = '';
    if (!filtered.length) {
      patientList.innerHTML = '<div class="patient-item">Nenhum paciente encontrado.</div>';
      return;
    }

    filtered.forEach((p) => {
      const value = p.prontuario || p.id || p._id || '';
      const name = p.fullName || p.nome || 'Paciente';
      const meta = [p.cpf ? `CPF ${p.cpf}` : '', p.prontuario ? `Prontuario ${p.prontuario}` : ''].filter(Boolean).join(' · ');
      const item = document.createElement('div');
      item.className = 'patient-item';
      item.innerHTML = `
        <div class="patient-item-name">${name}</div>
        ${meta ? `<div class="patient-item-meta">${meta}</div>` : ''}
      `;
      item.addEventListener('click', () => {
        applyPatient(p);
        setPatientLabel(name);
        if (patientSearchInput) patientSearchInput.value = name;
        closePatientMenu();
      });
      patientList.appendChild(item);
    });
  };


  const handleViewAnamnese = async () => {
    const prontuario = hiddenProntuarioField?.value?.trim();
    if (!prontuario) {
      showToast('Busque um paciente para ver a anamnese.', 'error');
      return;
    }
    try {
      if (!documentsApi.openLatestAnamnese) throw new Error('API indisponivel');
      await documentsApi.openLatestAnamnese({ prontuario });
    } catch (error) {
      console.warn('[SERVICOS] anamnese nao encontrada', error);
      showToast('Anamnese nao encontrada para este paciente.', 'error');
    }
  };


  const applyPatient = (patient) => {
    if (!patient) return;

    if (currentUser?.tipo === 'dentista' && patient.dentistaId && String(patient.dentistaId) != String(currentUser.id)) {
      logServicesContext('services_block_reason', {
        reason: 'patient_assigned_to_other_dentist',
        selected_patient_id: patient?.id || '',
        selected_patient_prontuario: patient?.prontuario || patient?.id || '',
        selected_patient_clinicId: patient?.clinicId || '',
      });
      showToast('Paciente pertence a outro dentista.', 'error');
      return;
    }

    currentPatient = patient;
    currentPatientNome = patient.fullName || patient.nome || '';
    setCurrentOdontoMode(inferInitialOdontoMode(patient));

    if (patientSearchResult) {
      patientSearchResult.textContent = `Paciente encontrado: ${currentPatientNome || 'Paciente'}`;
      patientSearchResult.style.color = '#2a9d8f';
    }

    const prontuario = patient.prontuario || patient.id || patient._id || '';
    if (hiddenProntuarioField) hiddenProntuarioField.value = prontuario;
    if (patientToggle) patientToggle.textContent = currentPatientNome || 'Paciente';
    if (viewAnamneseBtn) viewAnamneseBtn.style.display = 'inline-flex';
    logServicesContext('patient_services_context_loaded', {
      selected_patient_id: patient?.id || '',
      selected_patient_prontuario: prontuario,
      selected_patient_clinicId: patient?.clinicId || '',
      has_dentista: Boolean(patient?.dentistaId || patient?.dentista_id),
    });

    if (selectDentistaServico && currentUser?.tipo !== 'dentista') {
      const dentistaId = patient.dentistaId || patient.dentista_id || '';
      const dentistaNome = patient.dentistaNome || patient.dentista_nome || '';
      const scopedDentist = dentistasCache.find((d) => String(d?.id || '') === String(dentistaId || ''));
      if (dentistaId && scopedDentist) {
        selectDentistaServico.value = scopedDentist.id || '';
      } else {
        selectDentistaServico.value = '';
        if (dentistaId) {
          console.warn('[SERVICOS] dentista do paciente ignorado por nao pertencer a clinica atual', {
            patientId: patient?.id || patient?.prontuario || '',
            patientClinicId: patient?.clinicId || '',
            selectedDentistId: dentistaId,
            clinicId: currentUser?.clinicId || '',
          });
          logServicesContext('services_block_reason', {
            reason: 'stale_patient_dentist_outside_current_clinic',
            selected_patient_id: patient?.id || '',
            selected_patient_prontuario: prontuario,
            selected_patient_clinicId: patient?.clinicId || '',
            selected_dentist_id: dentistaId,
          });
          if (dentistaNome) {
            showToast('O dentista vinculado ao paciente nao pertence a clinica atual. Selecione outro dentista ou salve sem dentista.', 'error');
          }
        }
      }
      selectDentistaServico.disabled = false;
    }
  };

  const loadPatientFromStorage = () => {
    const raw = localStorage.getItem(getClinicStorageKey('servicePatient')) || localStorage.getItem('servicePatient');
    if (!raw) return;
    localStorage.removeItem(getClinicStorageKey('servicePatient'));
    localStorage.removeItem('servicePatient');
    try {
      const patient = JSON.parse(raw);
      logServicesContext('patient_services_context_loaded', {
        source: 'servicePatient',
        selected_patient_id: patient?.id || '',
        selected_patient_prontuario: patient?.prontuario || patient?.id || '',
        selected_patient_clinicId: patient?.clinicId || '',
      });
      applyPatient(patient);
    } catch (err) {
      console.warn('[SERVICOS] paciente salvo invalido', err);
    }
  };

  const clearPatientSearch = () => {
    patientSearchResult.textContent = '';
    hiddenProntuarioField.value = '';
    currentPatient = null;
    if (patientToggle) patientToggle.textContent = 'Selecione ou crie um(a) novo(a) paciente';
    if (selectDentistaServico) {
      selectDentistaServico.disabled = false;
      selectDentistaServico.value = '';
    }
    if (viewAnamneseBtn) viewAnamneseBtn.style.display = 'none';
    setCurrentOdontoMode('permanente');
  };

  const loadPatients = async () => {
    try {
      pacientesCache = (await patientsApi.list?.()) || [];
      logServicesContext('patient_services_context_loaded', {
        source: 'patientsApi.list',
        count: pacientesCache.length,
        ids: pacientesCache.map((p) => String(p?.id || '').trim()).filter(Boolean),
        prontuarios: pacientesCache.map((p) => String(p?.prontuario || p?.id || '').trim()).filter(Boolean),
        clinicIds: Array.from(new Set(pacientesCache.map((p) => String(p?.clinicId || '').trim()).filter(Boolean))),
      });
    } catch (err) {
      console.warn('[SERVICOS] pacientes nao carregados', err);
      pacientesCache = [];
    }
    renderPatientList(patientSearchInput?.value || '');
  };

  const renderSelectedServices = () => {
    if (!selectedServicesList) return;
    if (selectedServices.length === 0) {
      selectedServicesList.innerHTML = '<li>Nenhum servico adicionado.</li>';
      return;
    }

    let total = 0;
    const servicesHtml = selectedServices
      .map((service, index) => {
        total += service.value;
        const serviceValue = service.value.toFixed(2).replace('.', ',');
        const denteLabel = Array.isArray(service.dentes) && service.dentes.length ? service.dentes[0] : '-';
        const facesLabel = service.denteFaces && Array.isArray(service.faces) && service.faces.length
          ? ` | Face${service.faces.length > 1 ? 's' : ''}: ${service.faces.join('')}`
          : '';
        return `<li>
          <span><strong>${service.codigo}</strong> - ${service.name} - <strong>R$ ${serviceValue}</strong> | Dente: ${denteLabel}${facesLabel}</span>
          <button type="button" class="remove-item-btn" data-index="${index}" title="Remover servico">&times;</button>
        </li>`;
      })
      .join('');

    const totalFormatted = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    selectedServicesList.innerHTML = `${servicesHtml}
      <li class="total-row">
        <strong>TOTAL:</strong>
        <span>${totalFormatted}</span>
      </li>`;
  };

  const addServiceToList = () => {
    const name = serviceNameInput.value.trim();
    const value = (serviceValueInput.value || '').trim().replace(',', '.') || '0';
    if (!hiddenProntuarioField.value) {
      logServicesContext('services_block_reason', {
        reason: 'missing_selected_patient',
        selected_patient_id: currentPatient?.id || '',
        selected_patient_prontuario: hiddenProntuarioField?.value || '',
        selected_patient_clinicId: currentPatient?.clinicId || '',
      });
      return showToast('Selecione um paciente valido antes de adicionar procedimento.', 'error');
    }
    if (!name) {
      logServicesContext('services_block_reason', {
        reason: 'missing_procedure',
        selected_patient_id: currentPatient?.id || '',
        selected_patient_prontuario: hiddenProntuarioField?.value || '',
        selected_patient_clinicId: currentPatient?.clinicId || '',
      });
      return showToast('Selecione um procedimento antes de adicionar.', 'error');
    }
    const procedure = allProcedures.find((p) => p.nome === name);
    const codigo = procedure ? procedure.codigo : 'N/A';
    const baseEntry = {
      codigo,
      name,
      value: parseFloat(value) || 0,
      dentes: getDentesSelecionados(),
      faces: getFacesAtuais(),
      denteFaces: resumoDenteAtual || '',
    };
    const explodedItems = explodeServiceByTooth(baseEntry);
    selectedServices.push(...explodedItems);
    renderSelectedServices();
    markServicesAsVisualHistory(explodedItems);
    resetWorkingOdontoSelection({ preserveVisual: true });
    const qtdItens = explodedItems.length || 1;
    const plural = qtdItens > 1 ? 's' : '';
    const dentesLabel = qtdItens > 1 ? ` (${qtdItens} dentes)` : '';
    showToast(`Item${plural} adicionado${plural}. Selecao limpa.${dentesLabel}`, 'success');
    serviceNameInput.value = '';
    serviceValueInput.value = '';
    serviceNameInput.focus();
  };

  const obterDentistaResponsavel = () => {
    if (currentUser?.tipo === 'dentista') {
      return { id: currentUser.id, nome: currentUser.nome || 'Dentista' };
    }
    const dentId = selectDentistaServico?.value || '';
    if (!dentId) return null;
    const dentInfo = dentistasCache.find((d) => (d.id || '') === dentId);
    if (!dentInfo) {
      console.warn('[SERVICOS] dentista selecionado nao pertence ao cache da clinica atual', {
        selectedDentistId: dentId,
        clinicId: currentUser?.clinicId || '',
      });
      if (selectDentistaServico) selectDentistaServico.value = '';
      return null;
    }
    return { id: dentInfo.id || '', nome: dentInfo.nome || 'Dentista' };
  };

  const montarObjetoService = (dentInfo) => {
    const tipo = serviceNameInput.value.trim() || 'Procedimento';
    const valor = parseMoney(serviceValueInput.value || '0');
    const codigo = String(allProcedures.find((item) => item.nome === tipo)?.codigo || '').trim();
    return {
      codigo,
      nome: tipo,
      tipo,
      dentes: getDentesSelecionados(),
      faces: getFacesAtuais(),
      denteFaces: resumoDenteAtual || '',
      valor,
      valorCobrado: valor,
      gerarFinanceiro: valor > 0,
      statusFinanceiroProcedimento: 'rascunho',
      status: 'a-realizar',
      dentistaId: dentInfo?.id || '',
      dentistaNome: dentInfo?.nome || '',
    };
  };

  const montarServiceFromSelected = (selected, dentInfo) => {
    const valor = parseMoney(selected?.value || 0);
    return {
      codigo: selected?.codigo || '',
      nome: selected?.name || 'Procedimento',
      tipo: selected?.name || 'Procedimento',
      dentes: Array.isArray(selected?.dentes) ? selected.dentes : [],
      faces: Array.isArray(selected?.faces) ? selected.faces : [],
      denteFaces: selected?.denteFaces || '',
      valor,
      valorCobrado: valor,
      gerarFinanceiro: valor > 0,
      statusFinanceiroProcedimento: 'rascunho',
      status: 'a-realizar',
      dentistaId: dentInfo?.id || '',
      dentistaNome: dentInfo?.nome || '',
    };
  };

  const buildAgendaDraftFromServices = (dentInfo) => {
    const firstSelected = selectedServices[0] || null;
    const procedureName = String(
      firstSelected?.name
      || serviceNameInput?.value
      || ''
    ).trim();
    return {
      clinicId: String(currentUser?.clinicId || currentPatient?.clinicId || '').trim(),
      dentistaId: String(dentInfo?.id || '').trim(),
      dentistaNome: String(dentInfo?.nome || '').trim(),
      tipo: procedureName || 'Consulta',
      status: 'em_aberto',
    };
  };

  const openAgendaWithPatientDraft = () => {
    if (!currentPatient || !hiddenProntuarioField?.value) {
      showToast('Selecione um paciente antes de abrir a agenda.', 'error');
      return;
    }
    const dentInfo = obterDentistaResponsavel();
    const draft = buildAgendaDraftFromServices(dentInfo);
    try {
      sessionStorage.setItem(AGENDA_PREFILL_PATIENT_KEY, JSON.stringify(currentPatient));
      sessionStorage.setItem(AGENDA_PREFILL_DRAFT_KEY, JSON.stringify(draft));
    } catch (err) {
      console.warn('[SERVICOS] falha ao preparar handoff para agenda', err);
    }
    window.location.href = 'agendamentos.html?novo=agendamento';
  };

  const saveServices = async () => {
    if (!hiddenProntuarioField.value) {
      logServicesContext('services_block_reason', {
        reason: 'missing_selected_patient',
        selected_patient_id: currentPatient?.id || '',
        selected_patient_prontuario: hiddenProntuarioField?.value || '',
        selected_patient_clinicId: currentPatient?.clinicId || '',
      });
      return showToast('E necessario vincular um paciente antes de salvar.', 'error');
    }

    const dentInfo = obterDentistaResponsavel();
    logProcedureSave('procedure_save_started', {
      prontuario: hiddenProntuarioField.value || '',
      selected_dentist_id: dentInfo?.id || '',
      selected_procedure_id: selectedServices[0]?.codigo || '',
      queueLength: selectedServices.length || 1,
      failure_layer: '',
    });

    const queue = selectedServices.length
      ? selectedServices.flatMap((s) => explodeServiceByTooth(s).map((item) => montarServiceFromSelected(item, dentInfo)))
      : explodeServiceByTooth(montarObjetoService(dentInfo)).map((item) => montarServiceFromSelected(item, dentInfo));

    if (!queue.length || queue.every((s) => !String(s.tipo || '').trim() || parseMoney(s.valor) <= 0)) {
      logServicesContext('services_block_reason', {
        reason: 'missing_billable_procedure',
        selected_patient_id: currentPatient?.id || '',
        selected_patient_prontuario: hiddenProntuarioField?.value || '',
        selected_patient_clinicId: currentPatient?.clinicId || '',
      });
      return showToast('Adicione pelo menos um procedimento com valor antes de salvar.', 'error');
    }

    try {
      let transferConfirmed = false;
      let financeWarningDetected = false;
      for (let i = 0; i < queue.length; i += 1) {
        const service = {
          ...queue[i],
          confirmDentistTransfer: transferConfirmed,
        };
        logProcedureSave('procedure_save_started', {
          prontuario: hiddenProntuarioField.value || '',
          selected_dentist_id: service?.dentistaId || '',
          patient_current_dentist_id: currentPatient?.dentistaId || '',
          selected_procedure_id: service?.codigo || service?.tipo || '',
          failure_layer: '',
        });
        let result = await servicesApi.addToPatient?.({ prontuario: hiddenProntuarioField.value, service });
        if (result?.transferRequired) {
          const currentDentistLabel = result?.conflict?.patientCurrentDentistName || result?.conflict?.patientCurrentDentistId || 'dentista atual';
          const selectedDentistLabel = result?.conflict?.selectedDentistName || result?.conflict?.selectedDentistId || 'dentista selecionado';
          logProcedureSave('dentist_transfer_confirmation_required', {
            selected_dentist_id: result?.conflict?.selectedDentistId || '',
            patient_current_dentist_id: result?.conflict?.patientCurrentDentistId || '',
            selected_procedure_id: service?.codigo || service?.tipo || '',
            selected_patient_id: currentPatient?.id || '',
            selected_patient_prontuario: hiddenProntuarioField.value || '',
            selected_patient_clinicId: currentPatient?.clinicId || '',
          });
          const confirmed = window.confirm(`Este paciente ja possui um dentista atribuido (${currentDentistLabel}). Deseja transferir/alterar para ${selectedDentistLabel}?`);
          if (!confirmed) {
            showToast('Transferencia de dentista cancelada. Procedimento nao foi salvo.', 'info');
            return;
          }
          transferConfirmed = true;
          result = await servicesApi.addToPatient?.({
            prontuario: hiddenProntuarioField.value,
            service: {
              ...service,
              confirmDentistTransfer: true,
            },
          });
        }
        if (result?.financeWarning) {
          financeWarningDetected = true;
          console.warn('[SERVICOS] procedimento salvo com alerta de sincronizacao financeira', {
            procedureId: result?.service?.id || service?.id || '',
            financeWarning: result.financeWarning,
          });
        }
      }
      emitProcedureAndFinanceUpdated('servicos');
      showToast(
        financeWarningDetected
          ? 'Procedimentos salvos, mas houve alerta na sincronizacao com o financeiro.'
          : 'Procedimentos salvos com sucesso!',
        financeWarningDetected ? 'error' : 'success'
      );
      selectedServices = [];
      renderSelectedServices();
      serviceNameInput.value = '';
      serviceValueInput.value = '';
      if (getElem('painelProcedimentoAtivo')) getElem('painelProcedimentoAtivo').textContent = 'Nenhum';
      if (getElem('painelObs')) getElem('painelObs').value = '';
      dentesSelecionadosIframe = [];
      resumoDenteAtual = '';
      facesPorDente = {};
      const resumoDentes = getElem('dentesSelecionadosResumo');
      if (resumoDentes) resumoDentes.textContent = 'Nenhum';
      const resumoDente = getElem('painelResumoDente');
      if (resumoDente) resumoDente.textContent = '-';
      updateFacesUI();
      if (odontogramaFrame?.contentWindow) {
        odontogramaFrame.contentWindow.postMessage({ type: 'odontograma:clear-selection' }, '*');
      }
      serviceNameInput.focus();
    } catch (error) {
      console.warn('[SERVICOS] nao foi possivel salvar registro', error);
      logProcedureSave('procedure_save_failed', {
        prontuario: hiddenProntuarioField.value || '',
        selected_dentist_id: dentInfo?.id || '',
        patient_current_dentist_id: currentPatient?.dentistaId || '',
        selected_procedure_id: queue[0]?.codigo || queue[0]?.tipo || '',
        failure_layer: 'ui',
        message: error?.message || '',
      });
      showToast(error?.message || 'Nao foi possivel salvar o procedimento.', 'error');
    }
  };

  const init = async () => {
    await loadCurrentUser();
    await carregarDentistas();
    ajustarBlocoDentistaResponsavel();
    await loadProcedures();

    loadPatientFromStorage();
    setupPatientDropdown();

    renderSelectedServices();
    updateOdontoModeUI();

    odontoModeButtons.forEach((btn) => {
      const activate = () => setCurrentOdontoMode(btn.dataset.odontoMode || 'permanente');
      btn.addEventListener('click', activate);
      btn.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        ev.preventDefault();
        activate();
      });
    });

    odontogramaFrame?.addEventListener('load', () => {
      postOdontoModeToIframe();
    });

    patientToggle?.addEventListener('click', () => {
      if (!patientMenu) return;
      const isOpen = !patientMenu.classList.contains('hidden');
      if (isOpen) {
        closePatientMenu();
      } else {
        openPatientMenu();
        if (!pacientesCache.length) {
          loadPatients();
        } else {
          renderPatientList(patientSearchInput?.value || '');
        }
        patientSearchInput?.focus();
      }
    });

    patientSearchInput?.addEventListener('input', (e) => {
      renderPatientList(e.target.value || '');
    });

    document.addEventListener('click', (ev) => {
      if (!patientMenu || !patientToggle) return;
      if (patientMenu.contains(ev.target) || patientToggle.contains(ev.target)) return;
      closePatientMenu();
    });

    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        closePatientMenu();
      }
    });
    viewAnamneseBtn?.addEventListener('click', handleViewAnamnese);
    serviceNameInput?.addEventListener('input', () => {
      showSuggestions(serviceNameInput.value);
      const procEl = getElem('painelProcedimentoAtivo');
      if (procEl) procEl.textContent = serviceNameInput.value.trim() || 'Nenhum';
    });
    serviceNameInput?.addEventListener('focus', () => showSuggestions(serviceNameInput.value));
    serviceNameInput?.addEventListener('blur', () => {
      setTimeout(() => {
        if (serviceSuggestionsContainer) serviceSuggestionsContainer.style.display = 'none';
      }, 150);
    });
    dropdownArrow?.addEventListener('click', (e) => {
      e.stopPropagation();
      showSuggestions();
      serviceNameInput.focus();
    });
    addServiceBtn?.addEventListener('click', addServiceToList);

    document.addEventListener('click', (e) => {
      if (!serviceSuggestionsContainer) return;
      const inside = serviceSuggestionsContainer.contains(e.target) || serviceNameInput.contains(e.target) || dropdownArrow.contains(e.target);
      if (!inside) serviceSuggestionsContainer.style.display = 'none';
    });
    serviceForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      saveServices();
    });

    serviceSuggestionsContainer?.addEventListener('click', (e) => {
      const listItem = e.target.closest('li');
      if (listItem && listItem.dataset.procCodigo) {
        const procCodigo = listItem.dataset.procCodigo;
        const procedure = allProcedures.find((p) => p.codigo === procCodigo);
        if (procedure) {
          serviceNameInput.value = procedure.nome;
          serviceValueInput.value = procedure.preco.toFixed(2);
        }
        serviceValueInput.focus();
        serviceSuggestionsContainer.style.display = 'none';
      }
    });

    selectedServicesList?.addEventListener('click', (e) => {
      const btn = e.target.closest('.remove-item-btn');
      if (!btn) return;
      const index = Number(btn.dataset.index);
      if (Number.isNaN(index)) return;
      selectedServices.splice(index, 1);
      renderSelectedServices();
      syncQueueVisualHistoryFromSelectedServices();
    });

    faceChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        if (!resumoDenteAtual) {
          showToast('Selecione um dente no odontograma.', 'error');
          return;
        }
        const faces = new Set(getFacesAtuais());
        const face = chip.dataset.face;
        if (faces.has(face)) {
          faces.delete(face);
        } else {
          faces.add(face);
        }
        facesPorDente[resumoDenteAtual] = Array.from(faces);
        updateFacesUI();
        sendFacesToIframe();
      });
    });

    btnSalvarServico?.addEventListener('click', async () => {
      await saveServices();
    });

    if (btnSalvarServicoAgendar) {
      btnSalvarServicoAgendar.style.display = '';
      btnSalvarServicoAgendar.addEventListener('click', openAgendaWithPatientDraft);
    }
  };

  init();
});



