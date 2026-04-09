document.addEventListener('DOMContentLoaded', () => {
  const appApi = window.appApi || {};
  const authApi = appApi.auth || {};
  const documentModelsApi = appApi.documentModels || {};
  const tbody = document.getElementById('models-tbody');
  const filterType = document.getElementById('filter-type');
  const filterCategory = document.getElementById('filter-category');
  const btnNewModel = document.getElementById('btn-new-model');
  const editorCard = document.getElementById('editor-card');
  const editorTitle = document.getElementById('editor-title');
  const modelName = document.getElementById('model-name');
  const modelType = document.getElementById('model-type');
  const modelCategory = document.getElementById('model-category');
  const modelContent = document.getElementById('model-content');
  const previewContext = document.getElementById('preview-context');
  const btnPreview = document.getElementById('btn-preview');
  const btnCancel = document.getElementById('btn-cancel');
  const btnSave = document.getElementById('btn-save');
  const editorStatus = document.getElementById('editor-status');
  const previewBody = document.getElementById('preview-body');

  let cache = [];
  let editingId = '';

  const defaultContext = {
    paciente: { nome: 'Fulano da Silva', prontuario: '12345' },
    profissional: {
      nome: 'Dra. Maria',
      receituario: {
        assinaturaNome: 'Dra. Maria',
        assinaturaRegistro: 'CRO-SP 12345',
        assinaturaImagemData: '',
      },
    },
    clinica: {
      nome: 'Clinica Voithos',
      receituario: {
        cabecalho: 'Prescricao odontologica',
        rodape: 'Retorno em 7 dias',
        assinaturaImagemData: '',
      },
    },
    documento: {
      data: '2026-02-14',
      conteudo: 'Texto de exemplo',
      itensTexto: '1. Amoxicilina 500mg | 1 cp 8/8h | 21 cps',
      texto: 'Tomar apos alimentacao.',
      observacoes: 'Retorno em 7 dias.',
    },
  };

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
    editorCard?.classList.toggle('hidden', !visible);
  };

  const clearEditor = () => {
    editingId = '';
    if (editorTitle) editorTitle.textContent = 'Novo modelo';
    if (modelName) modelName.value = '';
    if (modelType) modelType.value = 'atestado';
    if (modelCategory) modelCategory.value = 'clinicos';
    if (modelContent) modelContent.value = '<h1>Documento</h1>\n<p>Paciente: {{paciente.nome}}</p>';
    if (previewContext) previewContext.value = JSON.stringify(defaultContext, null, 2);
    if (editorStatus) editorStatus.textContent = '';
    if (previewBody) previewBody.textContent = 'Nenhum preview gerado.';
  };

  const openEditorForCreate = () => {
    clearEditor();
    showEditor(true);
    modelName?.focus();
  };

  const openEditorForEdit = (model) => {
    editingId = model.id;
    if (editorTitle) editorTitle.textContent = 'Editar modelo';
    if (modelName) modelName.value = model.name || '';
    if (modelType) modelType.value = model.type || 'documento';
    if (modelCategory) modelCategory.value = model.category || 'gerais';
    if (modelContent) modelContent.value = model.contentHtml || '';
    if (previewContext) previewContext.value = JSON.stringify(defaultContext, null, 2);
    if (editorStatus) editorStatus.textContent = '';
    if (previewBody) previewBody.textContent = 'Nenhum preview gerado.';
    showEditor(true);
    modelName?.focus();
  };

  const closeEditor = () => {
    showEditor(false);
    editingId = '';
    if (editorStatus) editorStatus.textContent = '';
  };

  const applyFilters = () => {
    const t = String(filterType?.value || '').trim();
    const c = String(filterCategory?.value || '').trim();
    const list = cache.filter((m) => {
      if (t && m.type !== t) return false;
      if (c && m.category !== c) return false;
      return true;
    });
    renderTable(list);
  };

  const renderTable = (list) => {
    if (!tbody) return;
    if (!Array.isArray(list) || !list.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty">Nenhum modelo encontrado.</td></tr>';
      return;
    }

    tbody.innerHTML = list.map((m) => `
      <tr>
        <td>${m.name || ''}</td>
        <td>${m.type || ''}</td>
        <td>${m.category || ''}</td>
        <td>
          <label class="switch">
            <input type="checkbox" data-action="active" data-id="${m.id}" ${m.active ? 'checked' : ''}>
            <span class="slider"></span>
          </label>
        </td>
        <td>${m.version || 1}</td>
        <td>
          <div class="actions">
            <button class="action-btn" type="button" data-action="edit" data-id="${m.id}">Editar</button>
            <button class="action-btn danger" type="button" data-action="delete" data-id="${m.id}">Excluir</button>
          </div>
        </td>
      </tr>
    `).join('');
  };

  const loadModels = async () => {
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="empty">Carregando...</td></tr>';
    try {
      const list = await documentModelsApi.list({});
      cache = Array.isArray(list) ? list : [];
      applyFilters();
    } catch (err) {
      console.error('Erro ao carregar modelos de documentos', err);
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="empty">Falha ao carregar modelos.</td></tr>';
    }
  };

  const parsePreviewContext = () => {
    const raw = String(previewContext?.value || '').trim();
    if (!raw) return {};
    return JSON.parse(raw);
  };

  btnNewModel?.addEventListener('click', openEditorForCreate);
  btnCancel?.addEventListener('click', closeEditor);
  filterType?.addEventListener('change', applyFilters);
  filterCategory?.addEventListener('change', applyFilters);

  btnPreview?.addEventListener('click', async () => {
    if (editorStatus) editorStatus.textContent = '';
    try {
      const context = parsePreviewContext();
      const html = String(modelContent?.value || '').trim();
      if (!html) throw new Error('Template HTML vazio.');
      const preview = await documentModelsApi.renderPreview({
        contentHtml: html,
        context,
      });
      if (previewBody) previewBody.innerHTML = preview?.renderedHtml || '';
    } catch (err) {
      console.error('Erro ao gerar preview', err);
      if (editorStatus) editorStatus.textContent = err?.message || 'Erro ao gerar preview.';
    }
  });

  btnSave?.addEventListener('click', async () => {
    if (editorStatus) editorStatus.textContent = '';
    const payload = {
      id: editingId,
      name: String(modelName?.value || '').trim(),
      type: String(modelType?.value || '').trim(),
      category: String(modelCategory?.value || '').trim(),
      contentHtml: String(modelContent?.value || '').trim(),
      engine: 'html',
      variables: [],
    };

    if (!payload.name || !payload.type || !payload.contentHtml) {
      if (editorStatus) editorStatus.textContent = 'Preencha nome, tipo e template HTML.';
      return;
    }

    try {
      if (editingId) {
        await documentModelsApi.update(payload);
      } else {
        await documentModelsApi.create(payload);
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
    const model = cache.find((item) => item.id === id);
    if (!model) return;

    if (action === 'edit') {
      openEditorForEdit(model);
      return;
    }

    if (action === 'delete') {
      const ok = confirm(`Excluir o modelo "${model.name}"?`);
      if (!ok) return;
      try {
        await documentModelsApi.remove({ id });
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
    if (target.getAttribute('data-action') !== 'active') return;
    const id = target.getAttribute('data-id');
    if (!id) return;
    try {
      await documentModelsApi.setActive({ id });
      await loadModels();
    } catch (err) {
      console.error('Erro ao ativar modelo', err);
      alert(err?.message || 'Erro ao ativar modelo.');
      await loadModels();
    }
  });

  (async () => {
    const ok = await ensureAccess();
    if (!ok) return;
    clearEditor();
    await loadModels();
  })();
});
