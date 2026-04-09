document.addEventListener('DOMContentLoaded', () => {
  const appApi = window.appApi || {};
  const patientsApi = appApi.patients || window.api?.patients || {};
  const documentsApi = appApi.documents || window.api?.documents || {};
  const anamneseModelsApi = appApi.anamneseModels || window.api?.anamneseModels || {};
  const form = document.getElementById('anamnese-form');
  const prontuarioInput = document.getElementById('prontuarioInput');
  const cpfInput = document.getElementById('cpfInput');
  const patientName = document.getElementById('patientName');
  const patientProntuario = document.getElementById('patientProntuario');
  const patientResult = document.getElementById('patientSearchResult');
  const searchBtn = document.getElementById('searchPatientBtn');
  const formMessage = document.getElementById('formMessage');
  const dynamicFormFields = document.getElementById('dynamic-form-fields');
  const deviceInfo = document.getElementById('deviceInfo');

  let activeModel = null;

  const api = {
    readPatient: (prontuario) => patientsApi.read?.(prontuario),
    searchPatients: (query) => patientsApi.search?.(query),
    saveAnamnese: (payload) => documentsApi.saveAnamnese?.(payload),
    getActiveModel: () => anamneseModelsApi.getActive?.(),
  };

  const labelFromOption = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return raw
      .split(/[_-]+/g)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  };

  const showMessage = (text, type = 'info') => {
    if (patientResult) {
      patientResult.textContent = text;
      patientResult.dataset.type = type;
    }
    if (formMessage) {
      formMessage.textContent = text;
      formMessage.dataset.type = type;
    }
  };

  const buildFallbackModel = () => ({
    id: 'fallback',
    name: 'Padrao',
    sections: [
      {
        id: 'fallback-geral',
        title: 'Informacoes gerais',
        questions: [
          { key: 'anamneseDate', label: 'Data', type: 'date', required: false, options: [] },
          { key: 'responsavel', label: 'Responsavel', type: 'text', required: false, options: [] },
          { key: 'queixa', label: 'Queixa principal', type: 'textarea', required: false, options: [] },
          { key: 'historicoMedico', label: 'Historico de saude', type: 'textarea', required: false, options: [] },
          { key: 'planoTratamento', label: 'Plano de tratamento', type: 'textarea', required: false, options: [] },
          { key: 'observacoes', label: 'Observacoes gerais', type: 'textarea', required: false, options: [] },
          { key: 'dataHoraPreenchimento', label: 'Data e hora do preenchimento', type: 'text', required: false, options: [] },
        ],
      },
    ],
  });

  const createFieldHtml = (question, sectionIndex, questionIndex) => {
    const key = String(question.key || '').trim();
    const label = String(question.label || '').trim();
    const type = String(question.type || 'text').trim().toLowerCase();
    const requiredAttr = question.required ? 'required' : '';
    const id = `q-${sectionIndex}-${questionIndex}`;
    const readOnly = key === 'dataHoraPreenchimento' ? 'readonly' : '';
    const disabled = key === 'assinaturaDigital' ? 'disabled' : '';
    const options = Array.isArray(question.options) ? question.options : [];

    if (!key || !label) return '';

    if (type === 'textarea') {
      return `
        <label class="full-width">
          ${label}
          <textarea id="${id}" name="${key}" rows="3" ${requiredAttr} ${readOnly} ${disabled}></textarea>
        </label>
      `;
    }

    if (type === 'select' || type === 'yesno') {
      const optionList = (type === 'yesno')
        ? ['nao', 'sim']
        : options;
      const optionsHtml = optionList
        .map((opt) => `<option value="${opt}">${labelFromOption(opt)}</option>`)
        .join('');
      return `
        <label>
          ${label}
          <select id="${id}" name="${key}" ${requiredAttr} ${disabled}>
            <option value="">Nao informado</option>
            ${optionsHtml}
          </select>
        </label>
      `;
    }

    if (type === 'checkbox') {
      return `
        <label class="full-width checkbox-item">
          <input type="checkbox" id="${id}" name="${key}" value="on" ${requiredAttr} ${disabled}>
          ${label}
        </label>
      `;
    }

    if (type === 'multicheck') {
      const checkboxName = key.endsWith('[]') ? key : `${key}[]`;
      const optionsHtml = options
        .map((opt, idx) => {
          const checkId = `${id}-opt-${idx}`;
          return `
            <label class="checkbox-item" for="${checkId}">
              <input type="checkbox" id="${checkId}" name="${checkboxName}" value="${opt}" ${disabled}>
              ${labelFromOption(opt)}
            </label>
          `;
        })
        .join('');
      return `
        <div class="form-group full-width">
          <div class="section-subtitle">${label}</div>
          <div class="checkbox-grid">
            ${optionsHtml}
          </div>
        </div>
      `;
    }

    const htmlType = type === 'number' ? 'number' : type === 'date' ? 'date' : 'text';
    return `
      <label>
        ${label}
        <input type="${htmlType}" id="${id}" name="${key}" ${requiredAttr} ${readOnly} ${disabled}>
      </label>
    `;
  };

  const renderActiveModel = (model) => {
    if (!dynamicFormFields) return;
    const sections = Array.isArray(model?.sections) ? model.sections : [];
    dynamicFormFields.innerHTML = sections.map((section, sectionIndex) => {
      const title = String(section?.title || '').trim();
      const questions = Array.isArray(section?.questions) ? section.questions : [];
      const questionsHtml = questions
        .map((question, questionIndex) => createFieldHtml(question, sectionIndex, questionIndex))
        .join('');
      return `
        <div class="section-title full-width">${title || `Secao ${sectionIndex + 1}`}</div>
        ${questionsHtml}
      `;
    }).join('');
  };

  const queryByName = (name) => {
    const safeName = String(name || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return form ? form.querySelectorAll(`[name="${safeName}"]`) : [];
  };

  const fillForm = (data) => {
    if (!data || !form) return;
    Object.entries(data).forEach(([name, value]) => {
      const elements = queryByName(name);
      if (!elements.length) return;

      if (elements.length > 1 && elements[0].type === 'checkbox') {
        const list = Array.isArray(value) ? value.map((v) => String(v)) : [String(value || '')];
        elements.forEach((input) => {
          input.checked = list.includes(String(input.value || ''));
        });
        return;
      }

      const element = elements[0];
      if (element.type === 'checkbox') {
        const normalized = String(value || '').toLowerCase();
        element.checked = normalized === 'on' || normalized === 'true' || normalized === 'sim' || value === true;
      } else {
        element.value = value ?? '';
      }
    });
  };

  const serializeForm = () => {
    if (!form) return {};
    const payload = {};
    const fields = form.querySelectorAll('input[name], select[name], textarea[name]');
    fields.forEach((field) => {
      const name = String(field.name || '');
      if (!name) return;

      if (field.type === 'checkbox') {
        if (name.endsWith('[]')) {
          if (!Array.isArray(payload[name])) payload[name] = [];
          if (field.checked) payload[name].push(field.value || 'on');
        } else {
          payload[name] = field.checked ? (field.value || 'on') : '';
        }
        return;
      }

      if (field.type === 'radio') {
        if (field.checked) payload[name] = field.value;
        return;
      }

      payload[name] = field.value ?? '';
    });
    return payload;
  };

  const setAutoFields = () => {
    const dataHora = form?.elements?.namedItem('dataHoraPreenchimento');
    if (dataHora && !dataHora.value) {
      const now = new Date();
      const date = now.toLocaleDateString('pt-BR');
      const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      dataHora.value = `${date} ${time}`;
    }
    if (deviceInfo && !deviceInfo.value) {
      deviceInfo.value = navigator.userAgent || '';
    }
  };

  const clearFormForNewAnamnese = () => {
    if (!form) return;
    form.reset();
    if (patientName) patientName.value = '';
    if (patientProntuario) patientProntuario.value = '';
    if (prontuarioInput) prontuarioInput.value = '';
    if (cpfInput) cpfInput.value = '';
    if (patientResult) {
      patientResult.textContent = '';
      patientResult.dataset.type = '';
    }

    // Limpa qualquer rascunho legado de anamnese.
    Object.keys(localStorage || {}).forEach((key) => {
      if (String(key).startsWith('anamnese-draft-') || key === 'anamnese-last-draft') {
        localStorage.removeItem(key);
      }
    });
  };

  const loadPatientFromStorage = async () => {
    const raw = localStorage.getItem('anamnesePatient');
    if (!raw) return;
    localStorage.removeItem('anamnesePatient');
    try {
      const patient = JSON.parse(raw);
      if (!patient) return;
      const name = patient.fullName || patient.nome || 'Paciente';
      const pront = patient.prontuario || patient.id || patient._id || '';
      if (patientName) patientName.value = name;
      if (patientProntuario) patientProntuario.value = pront;
      if (prontuarioInput && pront) prontuarioInput.value = pront;
      if (cpfInput && patient.cpf) cpfInput.value = patient.cpf;
      showMessage(`Paciente encontrado: ${name}`, 'success');
    } catch (err) {
      console.warn('Falha ao carregar paciente salvo', err);
    }
  };

  const handleSearch = async () => {
    const prontuario = (prontuarioInput?.value || '').trim();
    const cpf = (cpfInput?.value || '').trim();
    if (!prontuario && !cpf) {
      showMessage('Informe prontuario ou CPF para buscar.', 'error');
      return;
    }

    try {
      let patient = null;
      if (prontuario) {
        patient = await api.readPatient(prontuario);
      } else if (cpf) {
        const results = await api.searchPatients(cpf);
        patient = Array.isArray(results) ? results[0] : null;
        if (patient?.id && !patient.prontuario) {
          const full = await api.readPatient(patient.id);
          patient = full || patient;
        }
      }

      if (!patient) {
        showMessage('Paciente nao encontrado.', 'error');
        return;
      }

      const name = patient.fullName || patient.nome || 'Paciente';
      if (patientName) patientName.value = name;
      if (patientProntuario) patientProntuario.value = patient.prontuario || prontuario || '';
      if (prontuarioInput && !prontuarioInput.value && patient.prontuario) prontuarioInput.value = patient.prontuario;
      if (cpfInput && !cpfInput.value && patient.cpf) cpfInput.value = patient.cpf;
      showMessage(`Paciente encontrado: ${name}`, 'success');
    } catch (err) {
      console.warn('Falha ao buscar paciente', err);
      showMessage('Erro ao buscar paciente.', 'error');
    }
  };

  const loadActiveModel = async () => {
    try {
      const model = await api.getActiveModel?.();
      activeModel = model || buildFallbackModel();
    } catch (err) {
      console.warn('Falha ao carregar modelo ativo, usando fallback', err);
      activeModel = buildFallbackModel();
    }
    renderActiveModel(activeModel);
  };

  searchBtn?.addEventListener('click', handleSearch);

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    setAutoFields();

    const prontuario = (patientProntuario?.value || prontuarioInput?.value || '').trim();
    if (!prontuario) {
      showMessage('Informe o prontuario para salvar.', 'error');
      return;
    }

    const payload = serializeForm();

    try {
      if (!api.saveAnamnese) throw new Error('API indisponivel');
      await api.saveAnamnese({ prontuario, data: payload });
      clearFormForNewAnamnese();
      showMessage('Anamnese salva com sucesso. Formulario limpo para nova anamnese.', 'success');
    } catch (err) {
      console.warn('Falha ao salvar anamnese', err);
      showMessage('Erro ao salvar anamnese.', 'error');
    }
  });

  (async () => {
    await loadActiveModel();
    setAutoFields();
    await loadPatientFromStorage();
  })();
});
