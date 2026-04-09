document.addEventListener('DOMContentLoaded', () => {
  const appApi = window.appApi || {};
  const authApi = appApi.auth || {};
  const anamneseModelsApi = appApi.anamneseModels || {};
  const tbody = document.getElementById('models-tbody');
  const btnNewModel = document.getElementById('btn-new-model');
  const editorCard = document.getElementById('model-editor-card');
  const editorTitle = document.getElementById('editor-title');
  const modelNameInput = document.getElementById('model-name-input');
  const sectionsContainer = document.getElementById('sections-container');
  const btnAddSection = document.getElementById('btn-add-section');
  const btnCancelEditor = document.getElementById('btn-cancel-editor');
  const btnSaveModel = document.getElementById('btn-save-model');
  const editorStatus = document.getElementById('editor-status');

  let models = [];
  let editingId = '';
  let draft = null;

  const buildQuestion = () => ({
    id: `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    key: '',
    label: '',
    type: 'text',
    required: false,
    options: [],
  });

  const buildSection = () => ({
    id: `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    title: '',
    questions: [buildQuestion()],
  });

  const resetDraft = () => {
    editingId = '';
    draft = {
      name: '',
      sections: [buildSection()],
    };
  };

  const cloneModelToDraft = (model) => ({
    name: String(model?.name || ''),
    sections: Array.isArray(model?.sections) && model.sections.length
      ? model.sections.map((section) => ({
        id: String(section.id || ''),
        title: String(section.title || ''),
        questions: Array.isArray(section.questions) && section.questions.length
          ? section.questions.map((q) => ({
            id: String(q.id || ''),
            key: String(q.key || ''),
            label: String(q.label || ''),
            type: String(q.type || 'text'),
            required: Boolean(q.required),
            options: Array.isArray(q.options) ? q.options.map((opt) => String(opt || '')) : [],
          }))
          : [buildQuestion()],
      }))
      : [buildSection()],
  });

  const ensureAccess = async () => {
    try {
      const user = await authApi.currentUser();
      const perms = user?.permissions || {};
      const allowed = user?.tipo === 'admin' || perms.admin === true || perms['clinic.manage'] === true;
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

  const showEditor = (visible) => {
    if (!editorCard) return;
    editorCard.classList.toggle('hidden', !visible);
  };

  const sanitizeDraft = () => {
    const name = String(draft?.name || '').trim();
    const sections = (Array.isArray(draft?.sections) ? draft.sections : [])
      .map((section) => ({
        title: String(section?.title || '').trim(),
        questions: (Array.isArray(section?.questions) ? section.questions : [])
          .map((question) => ({
            key: String(question?.key || '').trim(),
            label: String(question?.label || '').trim(),
            type: String(question?.type || 'text').trim().toLowerCase(),
            required: Boolean(question?.required),
            options: Array.isArray(question?.options)
              ? question.options.map((opt) => String(opt || '').trim()).filter(Boolean)
              : [],
          }))
          .filter((question) => question.label),
      }))
      .filter((section) => section.title);
    return { name, sections };
  };

  const renderEditor = () => {
    if (!draft || !sectionsContainer) return;
    if (modelNameInput) modelNameInput.value = draft.name || '';

    sectionsContainer.innerHTML = draft.sections.map((section, sectionIndex) => {
      const sectionLabel = `Secao ${sectionIndex + 1}`;
      const questionsHtml = section.questions.map((question, questionIndex) => {
        const typeId = `q-type-${sectionIndex}-${questionIndex}`;
        const labelId = `q-label-${sectionIndex}-${questionIndex}`;
        const optsId = `q-opts-${sectionIndex}-${questionIndex}`;
        const reqId = `q-req-${sectionIndex}-${questionIndex}`;
        const optionsValue = Array.isArray(question.options) ? question.options.join(', ') : '';
        return `
          <div class="question-row" data-section="${sectionIndex}" data-question="${questionIndex}">
            <label class="field">
              <span>Pergunta</span>
              <input type="text" id="${labelId}" data-field="label" value="${question.label || ''}" placeholder="Digite aqui">
            </label>
            <label class="field">
              <span>Tipo de resposta</span>
              <select id="${typeId}" data-field="type">
                <option value="text" ${question.type === 'text' ? 'selected' : ''}>Somente texto</option>
                <option value="textarea" ${question.type === 'textarea' ? 'selected' : ''}>Texto longo</option>
                <option value="yesno" ${question.type === 'yesno' ? 'selected' : ''}>Sim/nao</option>
                <option value="date" ${question.type === 'date' ? 'selected' : ''}>Data</option>
                <option value="number" ${question.type === 'number' ? 'selected' : ''}>Numero</option>
                <option value="select" ${question.type === 'select' ? 'selected' : ''}>Lista de opcoes</option>
                <option value="checkbox" ${question.type === 'checkbox' ? 'selected' : ''}>Checkbox</option>
                <option value="multicheck" ${question.type === 'multicheck' ? 'selected' : ''}>Multiplas opcoes</option>
              </select>
            </label>
            <label class="check-inline" for="${reqId}">
              <input type="checkbox" id="${reqId}" data-field="required" ${question.required ? 'checked' : ''}>
              Obrigatoria
            </label>
            <button class="action-btn danger" type="button" data-action="remove-question">Excluir</button>
            <label class="field ${question.type === 'select' || question.type === 'multicheck' ? '' : 'hidden'}">
              <span>Opcoes (separe por virgula)</span>
              <input type="text" id="${optsId}" data-field="options" value="${optionsValue}" placeholder="Opcao 1, Opcao 2">
            </label>
          </div>
        `;
      }).join('');

      return `
        <section class="section-block" data-section="${sectionIndex}">
          <div class="section-header">
            <span class="section-title-label">${sectionLabel}</span>
            <button class="action-btn danger" type="button" data-action="remove-section" data-section="${sectionIndex}">Excluir secao</button>
          </div>
          <label class="field">
            <span>Nome da secao ${sectionIndex + 1}</span>
            <input type="text" data-field="section-title" data-section="${sectionIndex}" value="${section.title || ''}" placeholder="Digite aqui">
          </label>
          ${questionsHtml}
          <div class="editor-actions-top">
            <button class="btn-secondary outline" type="button" data-action="add-question" data-section="${sectionIndex}">Nova pergunta</button>
          </div>
        </section>
      `;
    }).join('');
  };

  const bindEditorEvents = () => {
    if (!sectionsContainer || !modelNameInput) return;

    modelNameInput.addEventListener('input', () => {
      if (!draft) return;
      draft.name = modelNameInput.value || '';
    });

    sectionsContainer.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !draft) return;
      const action = target.getAttribute('data-action');
      if (!action) return;

      if (action === 'add-question') {
        const sectionIndex = Number(target.getAttribute('data-section'));
        if (Number.isInteger(sectionIndex) && draft.sections[sectionIndex]) {
          draft.sections[sectionIndex].questions.push(buildQuestion());
          renderEditor();
        }
        return;
      }

      if (action === 'remove-question') {
        const row = target.closest('.question-row');
        const sectionIndex = Number(row?.getAttribute('data-section'));
        const questionIndex = Number(row?.getAttribute('data-question'));
        if (
          Number.isInteger(sectionIndex)
          && Number.isInteger(questionIndex)
          && draft.sections[sectionIndex]
        ) {
          const list = draft.sections[sectionIndex].questions;
          list.splice(questionIndex, 1);
          if (!list.length) list.push(buildQuestion());
          renderEditor();
        }
        return;
      }

      if (action === 'remove-section') {
        const sectionIndex = Number(target.getAttribute('data-section'));
        if (Number.isInteger(sectionIndex)) {
          draft.sections.splice(sectionIndex, 1);
          if (!draft.sections.length) draft.sections.push(buildSection());
          renderEditor();
        }
      }
    });

    sectionsContainer.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !draft) return;
      const field = target.getAttribute('data-field');
      const sectionIndex = Number(target.getAttribute('data-section'));
      const questionIndex = Number(target.getAttribute('data-question'));

      if (field === 'section-title' && Number.isInteger(sectionIndex) && draft.sections[sectionIndex]) {
        draft.sections[sectionIndex].title = target.value || '';
        return;
      }

      if (!Number.isInteger(sectionIndex) || !Number.isInteger(questionIndex) || !draft.sections[sectionIndex]) return;
      const question = draft.sections[sectionIndex].questions[questionIndex];
      if (!question) return;

      if (field === 'label') question.label = target.value || '';
      if (field === 'type') {
        question.type = target.value || 'text';
        if (question.type !== 'select' && question.type !== 'multicheck') question.options = [];
        renderEditor();
      }
      if (field === 'options') {
        question.options = String(target.value || '')
          .split(',')
          .map((opt) => opt.trim())
          .filter(Boolean);
      }
    });

    sectionsContainer.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !draft) return;
      const field = target.getAttribute('data-field');
      if (field !== 'required') return;
      const row = target.closest('.question-row');
      const sectionIndex = Number(row?.getAttribute('data-section'));
      const questionIndex = Number(row?.getAttribute('data-question'));
      if (!Number.isInteger(sectionIndex) || !Number.isInteger(questionIndex)) return;
      const question = draft.sections[sectionIndex]?.questions?.[questionIndex];
      if (!question) return;
      question.required = Boolean(target.checked);
    });
  };

  const renderTable = () => {
    if (!tbody) return;
    if (!models.length) {
      tbody.innerHTML = '<tr><td colspan="3" class="empty">Nenhum modelo cadastrado.</td></tr>';
      return;
    }

    tbody.innerHTML = models.map((model) => `
      <tr>
        <td class="name-cell">${model.name || 'Modelo'}</td>
        <td>
          <label class="switch">
            <input type="checkbox" data-action="set-active" data-id="${model.id}" ${model.active ? 'checked' : ''}>
            <span class="slider"></span>
          </label>
        </td>
        <td class="actions-cell">
          <button class="action-btn" type="button" data-action="edit" data-id="${model.id}">Editar</button>
          <button class="action-btn danger" type="button" data-action="delete" data-id="${model.id}">Excluir</button>
        </td>
      </tr>
    `).join('');
  };

  const loadModels = async () => {
    if (tbody) tbody.innerHTML = '<tr><td colspan="3" class="empty">Carregando...</td></tr>';
    try {
      const list = await anamneseModelsApi.list();
      models = Array.isArray(list) ? list : [];
      renderTable();
    } catch (err) {
      console.error('Erro ao carregar modelos de anamnese', err);
      if (tbody) tbody.innerHTML = '<tr><td colspan="3" class="empty">Falha ao carregar modelos.</td></tr>';
    }
  };

  const openCreateEditor = () => {
    resetDraft();
    if (editorTitle) editorTitle.textContent = 'Novo modelo de anamnese';
    if (editorStatus) editorStatus.textContent = '';
    renderEditor();
    showEditor(true);
    modelNameInput?.focus();
  };

  const openEditEditor = (model) => {
    editingId = model.id;
    draft = cloneModelToDraft(model);
    if (editorTitle) editorTitle.textContent = 'Editar modelo de anamnese';
    if (editorStatus) editorStatus.textContent = '';
    renderEditor();
    showEditor(true);
    modelNameInput?.focus();
  };

  const closeEditor = () => {
    showEditor(false);
    editingId = '';
    draft = null;
    if (editorStatus) editorStatus.textContent = '';
  };

  btnNewModel?.addEventListener('click', openCreateEditor);
  btnCancelEditor?.addEventListener('click', closeEditor);

  btnAddSection?.addEventListener('click', () => {
    if (!draft) return;
    draft.sections.push(buildSection());
    renderEditor();
  });

  btnSaveModel?.addEventListener('click', async () => {
    if (!draft) return;
    if (editorStatus) editorStatus.textContent = '';
    const sanitized = sanitizeDraft();

    if (!sanitized.name) {
      if (editorStatus) editorStatus.textContent = 'Informe o nome do modelo.';
      modelNameInput?.focus();
      return;
    }
    if (!sanitized.sections.length) {
      if (editorStatus) editorStatus.textContent = 'Adicione ao menos uma secao com perguntas.';
      return;
    }
    if (sanitized.sections.some((section) => !section.questions.length)) {
      if (editorStatus) editorStatus.textContent = 'Cada secao precisa ter pelo menos uma pergunta.';
      return;
    }

    try {
      if (editingId) {
        await anamneseModelsApi.update({ id: editingId, ...sanitized });
      } else {
        await anamneseModelsApi.create(sanitized);
      }
      closeEditor();
      await loadModels();
    } catch (err) {
      console.error('Erro ao salvar modelo', err);
      if (editorStatus) editorStatus.textContent = err?.message || 'Erro ao salvar modelo.';
    }
  });

  tbody?.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.getAttribute('data-action');
    const id = target.getAttribute('data-id');
    if (!action || !id) return;
    const model = models.find((item) => item.id === id);
    if (!model) return;

    if (action === 'edit') {
      openEditEditor(model);
      return;
    }

    if (action === 'delete') {
      if (models.length <= 1) {
        alert('Mantenha ao menos um modelo cadastrado.');
        return;
      }
      const ok = confirm(`Excluir o modelo "${model.name}"?`);
      if (!ok) return;
      try {
        await anamneseModelsApi.remove({ id });
        await loadModels();
      } catch (err) {
        console.error('Erro ao excluir modelo', err);
        alert(err?.message || 'Erro ao excluir modelo.');
      }
    }
  });

  tbody?.addEventListener('change', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.getAttribute('data-action') !== 'set-active') return;
    const id = target.getAttribute('data-id');
    if (!id) return;
    try {
      await anamneseModelsApi.setActive({ id });
      await loadModels();
    } catch (err) {
      console.error('Erro ao ativar modelo', err);
      alert(err?.message || 'Erro ao ativar modelo.');
      await loadModels();
    }
  });

  bindEditorEvents();

  (async () => {
    const ok = await ensureAccess();
    if (!ok) return;
    await loadModels();
  })();
});
