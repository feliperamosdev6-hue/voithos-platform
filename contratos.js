document.addEventListener('DOMContentLoaded', () => {
  const appApi = window.appApi || {};
  const authApi = appApi.auth || {};
  const patientsApi = appApi.patients || {};
  const documentsApi = appApi.documents || {};
  const contratoBase = {
    tratamento: `
CONTRATO DE TRATAMENTO ODONTOLOGICO

Paciente: {{PACIENTE}}
Data: {{DATA}}

O presente contrato tem por objetivo regular os servicos odontologicos prestados...
`,
    plano: `
CONTRATO DE PLANO ODONTOLOGICO

Paciente: {{PACIENTE}}
Plano contratado: {{PLANO}}
Data: {{DATA}}
`,
    ortodontia: `
CONTRATO ORTODONTICO

Paciente: {{PACIENTE}}
Responsavel tecnico: {{DENTISTA}}
Data: {{DATA}}
`,
  };

  const pacienteSelect = document.getElementById('pacienteSelect');
  const modeloSelect = document.getElementById('modeloContrato');
  const textarea = document.getElementById('conteudoContrato');
  const btnGerar = document.getElementById('btnGerarPDF');

  const state = {
    patients: [],
    currentUser: null,
  };

  const todayIso = () => new Date().toISOString().split('T')[0];

  const getSelectedPatient = () =>
    state.patients.find((p) => String(p.id || p.prontuario || p._id || '') === String(pacienteSelect?.value || '')) || null;

  const templateTitle = () => {
    const modelo = String(modeloSelect?.value || '').trim();
    if (modelo === 'plano') return 'Contrato de Plano Odontologico';
    if (modelo === 'ortodontia') return 'Contrato Ortodontico';
    return 'Contrato de Tratamento Odontologico';
  };

  const applyTemplate = () => {
    if (!textarea) return;
    const patient = getSelectedPatient();
    const patientName = patient?.nome || patient?.fullName || '{{PACIENTE}}';
    const dentistName = state.currentUser?.nome || '{{DENTISTA}}';
    const base = contratoBase[String(modeloSelect?.value || 'tratamento')] || contratoBase.tratamento;
    const content = base
      .replaceAll('{{PACIENTE}}', patientName)
      .replaceAll('{{DATA}}', todayIso())
      .replaceAll('{{DENTISTA}}', dentistName)
      .replaceAll('{{PLANO}}', 'Plano odontologico');
    textarea.value = content;
  };

  const renderPatients = () => {
    if (!pacienteSelect) return;
    pacienteSelect.innerHTML = '<option value="">Selecione o paciente</option>';
    state.patients.forEach((p) => {
      const id = p.id || p.prontuario || p._id || '';
      if (!id) return;
      const name = p.nome || p.fullName || 'Paciente';
      const pront = p.prontuario ? ` (${p.prontuario})` : '';
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = `${name}${pront}`;
      pacienteSelect.appendChild(opt);
    });
  };

  const selectPatientFromStorage = () => {
    const raw = localStorage.getItem('prontuarioPatient');
    if (!raw) return;
    localStorage.removeItem('prontuarioPatient');
    try {
      const patient = JSON.parse(raw);
      const id = String(patient?.id || patient?.prontuario || patient?._id || '');
      if (!id || !pacienteSelect) return;
      pacienteSelect.value = id;
    } catch (_) {
      // ignore invalid cache
    }
  };

  const saveContrato = async () => {
    const patient = getSelectedPatient();
    if (!patient) {
      alert('Selecione um paciente.');
      return;
    }

    const prontuario = String(patient.prontuario || patient.id || patient._id || '').trim();
    if (!prontuario) {
      alert('Paciente sem prontuario valido.');
      return;
    }

    const conteudoContrato = String(textarea?.value || '').trim();
    if (!conteudoContrato) {
      alert('Informe o conteudo do contrato.');
      return;
    }

    try {
      const payload = {
        prontuario,
        pacienteId: String(patient.id || patient.prontuario || patient._id || ''),
        pacienteNome: patient.nome || patient.fullName || '',
        profissionalId: state.currentUser?.id || '',
        profissionalNome: state.currentUser?.nome || '',
        modelo: String(modeloSelect?.value || 'tratamento'),
        data: todayIso(),
        conteudoContrato,
        category: 'clinicos',
        title: `${templateTitle()} - ${(patient.nome || patient.fullName || 'Paciente')}`,
      };
      const record = await documentsApi.saveContrato?.(payload);
      if (record?.prontuario && record?.id) {
        await documentsApi.open?.({ prontuario: record.prontuario, documentId: record.id });
      }
      alert('Contrato salvo com sucesso.');
    } catch (err) {
      console.error('[CONTRATOS] falha ao salvar contrato', err);
      alert(err?.message || 'Nao foi possivel salvar o contrato.');
    }
  };

  const wireEvents = () => {
    modeloSelect?.addEventListener('change', applyTemplate);
    pacienteSelect?.addEventListener('change', applyTemplate);
    btnGerar?.addEventListener('click', saveContrato);
  };

  const init = async () => {
    try {
      state.currentUser = await authApi.currentUser?.();
      if (!state.currentUser) {
        window.location.href = 'login.html';
        return;
      }
    } catch (_) {
      window.location.href = 'login.html';
      return;
    }

    try {
      state.patients = (await patientsApi.list?.()) || [];
    } catch (err) {
      console.warn('[CONTRATOS] falha ao carregar pacientes', err);
      state.patients = [];
    }

    renderPatients();
    selectPatientFromStorage();
    applyTemplate();
  };

  wireEvents();
  init();
});
