document.addEventListener('DOMContentLoaded', () => {
  const appApi = window.appApi || {};
  const authApi = appApi.auth || window.auth || {};
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
  let currentUser = null;

  const getClinicStorageKey = (baseKey) => {
    const clinicId = String(currentUser?.clinicId || '').trim();
    return clinicId ? `${baseKey}:${clinicId}` : `${baseKey}:global`;
  };

  const getClinicStorageCandidates = (baseKey) => {
    const candidates = [getClinicStorageKey(baseKey), `${baseKey}:global`, baseKey];
    return candidates.filter((value, index) => value && candidates.indexOf(value) === index);
  };

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

  const ALLOWED_TYPES = new Set(['text', 'textarea', 'select', 'number', 'date', 'yesno', 'checkbox', 'multicheck']);

  const normalizeQuestionType = (value) => {
    const raw = String(value || 'text').trim().toLowerCase();
    if (ALLOWED_TYPES.has(raw)) return raw;
    if (['bool', 'boolean', 'radio', 'simnao', 'sim_nao', 'yes_no'].includes(raw)) return 'yesno';
    if (['dropdown', 'combo', 'combobox', 'lista'].includes(raw)) return 'select';
    if (['multiple', 'multiple-choice', 'multiple_choice', 'multi_select', 'multiselect'].includes(raw)) return 'multicheck';
    if (['longtext', 'paragraph'].includes(raw)) return 'textarea';
    if (['numeric', 'decimal', 'currency'].includes(raw)) return 'number';
    return 'text';
  };

  const buildRichFallbackModel = () => ({
    id: 'default',
    name: 'Padrao',
    active: true,
    sections: [
      {
        id: 's-geral',
        title: 'Informacoes gerais',
        questions: [
          { id: 'q-data', key: 'anamneseDate', label: 'Data', type: 'date', required: false, options: [] },
          { id: 'q-responsavel', key: 'responsavel', label: 'Responsavel', type: 'text', required: false, options: [] },
          { id: 'q-queixa', key: 'queixa', label: 'Queixa principal', type: 'textarea', required: false, options: [] },
        ],
      },
      {
        id: 's-hist-med',
        title: 'Historico medico',
        questions: [
          { id: 'q-hist-saude', key: 'historicoMedico', label: 'Historico de saude', type: 'textarea', required: false, options: [] },
          { id: 'q-alergias', key: 'alergias', label: 'Alergias', type: 'text', required: false, options: [] },
          { id: 'q-meds', key: 'medicamentos', label: 'Medicamentos em uso', type: 'text', required: false, options: [] },
        ],
      },
      {
        id: 's-condicoes',
        title: 'Condicoes sistemicas',
        questions: [
          {
            id: 'q-condicoes',
            key: 'condicoes[]',
            label: 'Condicoes sistemicas',
            type: 'multicheck',
            required: false,
            options: ['diabetes', 'hipertensao', 'cardiopatias', 'epilepsia', 'asma', 'coagulacao', 'hepatite_hiv'],
          },
        ],
      },
      {
        id: 's-medicacoes',
        title: 'Medicamentos especificos',
        questions: [
          { id: 'q-anticoag', key: 'anticoagulantes', label: 'Usa anticoagulantes', type: 'yesno', required: false, options: [] },
          { id: 'q-antidepr', key: 'antidepressivos', label: 'Usa antidepressivos', type: 'yesno', required: false, options: [] },
          { id: 'q-cort', key: 'corticoides', label: 'Usa corticoides', type: 'yesno', required: false, options: [] },
          { id: 'q-insulina', key: 'insulina', label: 'Usa insulina', type: 'yesno', required: false, options: [] },
        ],
      },
      {
        id: 's-reacoes',
        title: 'Reacoes anteriores',
        questions: [
          { id: 'q-anest', key: 'reacaoAnestesia', label: 'Reacao a anestesia odontologica', type: 'yesno', required: false, options: [] },
          { id: 'q-sang', key: 'sangramentoExcessivo', label: 'Sangramento excessivo', type: 'yesno', required: false, options: [] },
          { id: 'q-desmaio', key: 'desmaioOdonto', label: 'Desmaio em atendimento odontologico', type: 'yesno', required: false, options: [] },
          { id: 'q-gestante', key: 'gestante', label: 'Gestante', type: 'yesno', required: false, options: [] },
          { id: 'q-pressao', key: 'pressao', label: 'Pressao arterial', type: 'text', required: false, options: [] },
        ],
      },
      {
        id: 's-odonto',
        title: 'Historico odontologico',
        questions: [
          { id: 'q-hist-odonto', key: 'historicoOdonto', label: 'Historico odontologico', type: 'textarea', required: false, options: [] },
          { id: 'q-escov', key: 'escovacao', label: 'Frequencia de escovacao', type: 'select', required: false, options: ['1', '2', '3', '4'] },
          { id: 'q-ult-visita', key: 'ultimaVisita', label: 'Ultima visita ao dentista', type: 'date', required: false, options: [] },
          { id: 'q-motivo-visita', key: 'motivoUltimaVisita', label: 'Motivo da ultima visita', type: 'text', required: false, options: [] },
          { id: 'q-sensib', key: 'sensibilidade', label: 'Sensibilidade dentaria', type: 'yesno', required: false, options: [] },
          { id: 'q-dor-mast', key: 'dorMastigar', label: 'Dor ao mastigar', type: 'yesno', required: false, options: [] },
          { id: 'q-brux', key: 'bruxismo', label: 'Ranger os dentes (bruxismo)', type: 'yesno', required: false, options: [] },
          { id: 'q-fio', key: 'fioDental', label: 'Uso de fio dental', type: 'yesno', required: false, options: [] },
          { id: 'q-habitos', key: 'habitos', label: 'Habitos e observacoes', type: 'textarea', required: false, options: [] },
        ],
      },
      {
        id: 's-consent',
        title: 'Declaracoes e consentimento',
        questions: [
          {
            id: 'q-declaracao',
            key: 'declaracaoVerdade',
            label: 'Declaro que as informacoes prestadas sao verdadeiras e informarei qualquer alteracao no meu estado de saude.',
            type: 'checkbox',
            required: true,
            options: [],
          },
          { id: 'q-data-hora', key: 'dataHoraPreenchimento', label: 'Data e hora do preenchimento', type: 'text', required: false, options: [] },
          { id: 'q-origem', key: 'origemPreenchimento', label: 'Origem do preenchimento', type: 'select', required: false, options: ['paciente', 'recepcao', 'dentista'] },
          { id: 'q-assinatura', key: 'assinaturaDigital', label: 'Assinatura digital do paciente (futuro)', type: 'text', required: false, options: [] },
        ],
      },
      {
        id: 's-plano',
        title: 'Plano e observacoes',
        questions: [
          { id: 'q-plano', key: 'planoTratamento', label: 'Plano de tratamento', type: 'textarea', required: false, options: [] },
          { id: 'q-observacoes', key: 'observacoes', label: 'Observacoes gerais', type: 'textarea', required: false, options: [] },
        ],
      },
    ],
  });

  const extractModelSections = (model = {}) => {
    const nested = model?.data || model?.fields || model?.payload || {};
    const directSections = model?.sections || model?.secoes;
    const nestedSections = nested?.sections || nested?.secoes;
    if (Array.isArray(directSections)) return directSections;
    if (Array.isArray(nestedSections)) return nestedSections;

    const looseQuestions = model?.questions || model?.perguntas || nested?.questions || nested?.perguntas;
    if (Array.isArray(looseQuestions) && looseQuestions.length) {
      return [{ title: model?.sectionTitle || nested?.sectionTitle || 'Perguntas gerais', questions: looseQuestions }];
    }
    return [];
  };

  const normalizeQuestion = (question = {}, sectionIndex = 0, questionIndex = 0) => {
    const label = String(question?.label || question?.pergunta || question?.title || '').trim();
    if (!label) return null;
    const type = normalizeQuestionType(question?.type || question?.tipo);
    const key = String(question?.key || question?.campo || question?.id || `campo_${sectionIndex + 1}_${questionIndex + 1}`).trim();
    const rawOptions = question?.options || question?.opcoes || question?.choices || [];
    const options = Array.isArray(rawOptions)
      ? rawOptions.map((item) => String(item?.value || item?.label || item || '').trim()).filter(Boolean)
      : [];
    return {
      id: String(question?.id || `q-${sectionIndex}-${questionIndex}`).trim(),
      key,
      label,
      type,
      required: Boolean(question?.required || question?.obrigatoria),
      options: type === 'select' || type === 'multicheck' ? options : [],
    };
  };

  const normalizeSection = (section = {}, sectionIndex = 0) => {
    const title = String(section?.title || section?.nome || section?.label || `Secao ${sectionIndex + 1}`).trim();
    const questionsSource = Array.isArray(section?.questions)
      ? section.questions
      : (Array.isArray(section?.perguntas) ? section.perguntas : []);
    const questions = questionsSource
      .map((question, questionIndex) => normalizeQuestion(question, sectionIndex, questionIndex))
      .filter(Boolean);
    if (!questions.length) return null;
    return {
      id: String(section?.id || `s-${sectionIndex}`).trim(),
      title,
      questions,
    };
  };

  const normalizeModel = (model) => {
    const fallback = buildRichFallbackModel();
    if (!model || typeof model !== 'object') return fallback;
    const sections = extractModelSections(model)
      .map((section, sectionIndex) => normalizeSection(section, sectionIndex))
      .filter(Boolean);
    if (!sections.length) return fallback;
    return {
      id: String(model?.id || fallback.id).trim() || fallback.id,
      name: String(model?.name || model?.nome || fallback.name).trim() || fallback.name,
      active: model?.active !== false && model?.ativo !== false,
      sections,
    };
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
    let patient = null;
    for (const key of getClinicStorageCandidates('anamnesePatient')) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      localStorage.removeItem(key);
      try {
        patient = JSON.parse(raw);
        break;
      } catch (err) {
        console.warn('Falha ao desserializar paciente salvo para anamnese', err);
      }
    }
    if (!patient) return;
    try {
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
      activeModel = normalizeModel(model);
    } catch (err) {
      console.warn('Falha ao carregar modelo ativo, usando fallback robusto', err);
      activeModel = buildRichFallbackModel();
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
      showMessage('Anamnese salva com sucesso e registrada no prontuario.', 'success');
    } catch (err) {
      console.warn('Falha ao salvar anamnese', err);
      showMessage(`Erro ao salvar anamnese: ${err?.message || 'falha desconhecida'}`, 'error');
    }
  });

  (async () => {
    try {
      currentUser = await authApi.currentUser?.();
    } catch (err) {
      console.warn('Falha ao carregar usuario atual para escopo da anamnese', err);
    }
    await loadActiveModel();
    setAutoFields();
    await loadPatientFromStorage();
  })();
});
