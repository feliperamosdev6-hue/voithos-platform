// Gestão de Arquivos - layout simples em tabela

document.addEventListener('DOMContentLoaded', () => {
  const appApi = window.appApi || {};
  const authApi = appApi.auth || window.auth || {};
  const patientsApi = appApi.patients || window.api?.patients || {};
  const documentsApi = appApi.documents || window.api?.documents || {};
  const filesApi = appApi.files || window.api?.files || {};
  const tbody = document.getElementById('patients-body');
  const statusEl = document.getElementById('list-status');
  const searchInput = document.getElementById('fileSearchInput');
  const searchButton = document.getElementById('fileSearchButton');
  let currentUser = null;

  const getClinicStorageKey = (baseKey) => {
    const clinicId = String(currentUser?.clinicId || '').trim();
    return clinicId ? `${baseKey}:${clinicId}` : `${baseKey}:global`;
  };

  const api = {
    readPatients: async () => {
      const centralList = await patientsApi.list?.();
      if (Array.isArray(centralList)) return centralList;
      const fileList = await filesApi.readPatients?.();
      return Array.isArray(fileList) ? fileList : [];
    },
    readPatient: (prontuario) => patientsApi.read?.(prontuario),
    deletePatient: (prontuario) => patientsApi.remove?.(prontuario),
    documents: {
      list: (payload) => documentsApi.list?.(payload),
      upload: (payload) => documentsApi.upload?.(payload),
      archive: (payload) => documentsApi.archive?.(payload),
      open: (payload) => documentsApi.open?.(payload),
    },
  };

  const store = new Map();
  let allPatients = [];


  const fileCategories = [
    { id: 'identidade', label: 'Documentos pessoais' },
    { id: 'clinicos', label: 'Arquivos clinicos e termos' },
    { id: 'exames', label: 'Exames e imagens' },
    { id: 'financeiro', label: 'Documentos financeiros e convenios' },
    { id: 'outros', label: 'Outros' },
  ];

  const fileTypes = {
    identidade: [
      'RG', 'CNH', 'CPF', 'Cartao SUS', 'Comprovante de endereco',
      'Termo de consentimento', 'Termo de uso de imagem',
      'Termo de responsabilidade', 'Contrato de prestacao de servicos',
      'Autorizacao de responsavel legal',
    ],
    clinicos: [
      'Anamnese odontologica', 'Anamnese medica', 'Odontograma inicial',
      'Plano de tratamento', 'Evolucao clinica', 'Prescricoes odontologicas',
      'Atestados odontologicos', 'Encaminhamentos', 'Relatorios clinicos',
    ],
    exames: [
      'Radiografia panoramica', 'Radiografia periapical', 'Radiografia interproximal',
      'Telerradiografia', 'Tomografia (CBCT)', 'Fotografias clinicas',
      'Escaneamento intraoral', 'Modelos digitais (STL)', 'Laudos radiologicos',
    ],
    financeiro: [
      'Orcamentos', 'Guias de convenios (TISS/TUSS)', 'Autorizacoes de convenio',
      'Notas fiscais', 'Recibos', 'Comprovantes de pagamento',
      'Parcelamentos', 'Contratos financeiros',
    ],
    outros: ['Outros'],
  };

  const generatedDocumentTypes = new Set(['ANAMNESE', 'RECEITA', 'ATESTADO', 'CONTRATO', 'DOSSIE', 'ORCAMENTO', 'CUSTOMIZAVEL']);
  const ignoredClinicalNoteTypes = new Set(['EVOLUCAO', 'EVOLUCAO_CLINICA']);
  const attachmentCategoryAliases = new Map([
    ['ARQUIVO_PACIENTE', 'outros'],
    ['ARQUIVOS', 'outros'],
    ['ANEXO', 'outros'],
    ['ANEXOS', 'outros'],
    ['IMAGEM', 'exames'],
    ['IMAGENS', 'exames'],
    ['EXAMES', 'exames'],
    ['IDENTIDADE', 'identidade'],
    ['FINANCEIRO', 'financeiro'],
    ['CLINICOS', 'clinicos'],
    ['OUTROS', 'outros'],
  ]);

  const normalizeDocType = (doc) => String(doc?.type || doc?.tipo || '').trim().toUpperCase();
  const normalizeCategoryId = (value) => {
    const normalized = String(value || '').trim().toUpperCase();
    return attachmentCategoryAliases.get(normalized) || String(value || '').trim().toLowerCase();
  };
  const isMimeLikeType = (value) => /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(String(value || '').trim());
  const isAttachmentDocument = (doc) => {
    const type = normalizeDocType(doc);
    if (!doc || generatedDocumentTypes.has(type) || ignoredClinicalNoteTypes.has(type)) return false;
    const categoryId = normalizeCategoryId(doc?.category || doc?.categoria);
    if (fileCategories.some((item) => item.id === categoryId)) return true;
    if (type === 'ARQUIVO' || type === 'ANEXO' || type === 'IMAGEM') return true;
    if (isMimeLikeType(doc?.type || doc?.tipo)) return true;
    return Boolean(doc?.storedName || doc?.originalName || doc?.extension || doc?.legacyPath);
  };

  const maxUploadBytes = 25 * 1024 * 1024;

  const documentsListModal = document.getElementById('documents-list-modal');
  const documentsListClose = document.getElementById('documents-list-close');
  const documentsList = document.getElementById('documents-list');
  const documentsEmpty = document.getElementById('documents-empty');
  const documentsSearch = document.getElementById('documents-search');
  const documentsCategoryFilter = document.getElementById('documents-category-filter');
  const documentsArchivedToggle = document.getElementById('documents-archived-toggle');
  const documentsRefresh = document.getElementById('documents-refresh');
  const documentsListSubtitle = document.getElementById('documents-list-subtitle');

  const documentsAddModal = document.getElementById('documents-add-modal');
  const documentsAddClose = document.getElementById('documents-add-close');
  const documentsAddSubtitle = document.getElementById('documents-add-subtitle');

  const uploadForm = document.getElementById('documents-upload-form');
  const docCategory = document.getElementById('doc-category');
  const docType = document.getElementById('doc-type');
  const docTitle = document.getElementById('doc-title');
  const docDate = document.getElementById('doc-date');
  const docAtendimento = document.getElementById('doc-atendimento');
  const docVersionOf = document.getElementById('doc-version-of');
  const docNotes = document.getElementById('doc-notes');
  const docFile = document.getElementById('doc-file');

  let activePatient = null;
  let currentDocuments = [];
  const logProntuarioList = (stage, extra = {}) => {
    try {
      console.info(`[ARQUIVOS] ${stage}`, JSON.stringify(extra));
    } catch (_) {
      console.info(`[ARQUIVOS] ${stage}`, extra);
    }
  };


const ensureToast = () => {
  if (document.getElementById('arquivos-toast-style')) return;
  const style = document.createElement('style');
  style.id = 'arquivos-toast-style';
  style.textContent = `
  .arq-toast-container { position: fixed; bottom: 20px; right: 20px; z-index: 3000; display: flex; flex-direction: column; gap: 10px; }
  .arq-toast { min-width: 240px; max-width: 340px; padding: 10px 14px; border-radius: 10px; font-size: 13px; box-shadow: 0 8px 18px rgba(0,0,0,0.15); background: #eef4ff; color: #1d4ed8; animation: arqIn 0.25s ease, arqOut 0.25s ease 4.5s forwards; }
  .arq-toast.error { background: #fdecea; color: #b42318; }
  @keyframes arqIn { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: translateX(0); } }
  @keyframes arqOut { to { opacity: 0; transform: translateX(24px); } }
  `;
  document.head.appendChild(style);
};

const showToast = (msg, type = 'info') => {
  ensureToast();
  let container = document.querySelector('.arq-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'arq-toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `arq-toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
};

  const formatCurrency = (value) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);

  const formatDate = (value) => {
    if (!value) return '-';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return '-';
    return dt.toLocaleDateString('pt-BR');
  };

  const buildReceiptRows = (services) =>
    (services || []).map((svc, index) => ([
      String(index + 1),
      svc.tipo || svc.name || 'Procedimento',
      Array.isArray(svc.dentes) && svc.dentes.length ? svc.dentes.join(', ') : '-',
      svc.dentistaNome || '-',
      formatDate(svc.registeredAt),
      formatCurrency(svc.valor),
    ]));


  const buildCategoryOptions = (includeAll = false) => {
    const options = [];
    if (includeAll) {
      options.push('<option value="">Todas as categorias</option>');
    }
    fileCategories.forEach((cat) => {
      options.push(`<option value="${cat.id}">${cat.label}</option>`);
    });
    return options.join('');
  };

  const buildTypeOptions = (categoryId) => {
    const types = fileTypes[categoryId] || fileTypes.outros;
    return types.map((type) => `<option value="${type}">${type}</option>`).join('');
  };

  const updateTypeOptions = () => {
    if (!docCategory || !docType) return;
    docType.innerHTML = buildTypeOptions(docCategory.value);
  };

  const refreshVersionOptions = () => {
    if (!docVersionOf) return;
    const options = ['<option value="">Nenhuma</option>'];
    currentDocuments
      .filter((doc) => !doc.archived && (doc.isLatest === undefined || doc.isLatest))
      .forEach((doc) => {
        const label = `${doc.type || 'Documento'} - v${doc.version || 1}`;
        options.push(`<option value="${doc.id}">${label}</option>`);
      });
    docVersionOf.innerHTML = options.join('');
  };

  const formatDocLabel = (doc) => doc.title || doc.type || doc.originalName || 'Documento';

  const buildLegacyDocuments = () => {
    if (!activePatient) return [];
    const legacy = [];

    (activePatient.serviceFiles || []).forEach((item) => {
      legacy.push({
        id: `legacy-service-${item.name}`,
        category: 'outros',
        type: 'Arquivo legado',
        title: item.name,
        originalName: item.name,
        createdAt: '',
        createdBy: {},
        isLegacy: true,
        legacyPath: item.path,
      });
    });

    return legacy;
  };

  const renderDocuments = () => {
    if (!documentsList || !documentsEmpty) return;
    const term = (documentsSearch?.value || '').trim().toLowerCase();
    const categoryFilter = documentsCategoryFilter?.value || '';

    const allDocs = [...currentDocuments, ...buildLegacyDocuments()].filter((doc) => isAttachmentDocument(doc));
    const filtered = allDocs.filter((doc) => {
      if (categoryFilter && normalizeCategoryId(doc.category || doc.categoria) !== categoryFilter) return false;
      if (!term) return true;
      const haystack = [
        doc.title,
        doc.type,
        doc.originalName,
        doc.createdBy?.nome,
        normalizeCategoryId(doc.category || doc.categoria),
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(term);
    });

    if (!filtered.length) {
      documentsList.innerHTML = '';
      documentsEmpty.classList.add('show');
      return;
    }

    documentsEmpty.classList.remove('show');
    const userRole = String(currentUser?.tipo || currentUser?.role || '').trim().toLowerCase();
    const canArchive = Boolean(currentUser?.isClinicAdmin || currentUser?.clinicAdmin)
      || Boolean(currentUser?.permissions?.admin || currentUser?.permissions?.['documents.write'])
      || ['admin', 'administrativo', 'super_admin', 'recepcionista', 'recepcao'].includes(userRole);

    documentsList.innerHTML = filtered.map((doc) => {
      const categoryId = normalizeCategoryId(doc.category || doc.categoria);
      const categoryLabel = fileCategories.find((cat) => cat.id === categoryId)?.label || 'Outros';
      const dateLabel = formatDate(doc.documentDate || doc.createdAt);
      const createdBy = doc.createdBy?.nome || '-';
      const versionLabel = doc.version ? `v${doc.version}` : (doc.isLegacy ? '-' : 'v1');
      const archivedLabel = doc.archived ? 'Arquivado' : '';
      const actionLabel = doc.archived ? 'Restaurar' : 'Arquivar';
      const archiveBtn = canArchive && !doc.isLegacy
        ? `<button class="btn secondary small" data-action="archive-document">${actionLabel}</button>`
        : '';
      return `
        <div class="document-item" data-doc-id="${doc.id}">
          <div class="document-main">
            <div class="document-title">${formatDocLabel(doc)}</div>
            <div class="document-meta">${categoryLabel} ? ${versionLabel} ? ${dateLabel}</div>
            <div class="document-meta">Responsavel: ${createdBy}${archivedLabel ? ' ? ' + archivedLabel : ''}</div>
          </div>
          <div class="document-actions">
            <button class="btn small" data-action="open-document">Abrir</button>
            ${archiveBtn}
          </div>
        </div>`;
    }).join('');
  };


  const loadDocuments = async () => {
    if (!activePatient?.prontuario) return;
    if (!api.documents?.list) {
      showToast('API de documentos indisponivel.', 'error');
      return;
    }

    try {
      const includeArchived = Boolean(documentsArchivedToggle?.checked);
      const loaded = await api.documents.list({
        prontuario: activePatient.prontuario,
        includeArchived,
      }) || [];
      currentDocuments = loaded.filter((doc) => isAttachmentDocument(doc));
      renderDocuments();
      refreshVersionOptions();
    } catch (err) {
      console.warn('Erro ao carregar documentos', err);
      showToast('Falha ao carregar documentos.', 'error');
    }
  };

  const setActivePatient = (patient) => {
    activePatient = patient;
    const name = patient?.nome || patient?.fullName || 'Paciente';
      const label = `${name} - Prontuario ${patient?.prontuario || '-'}`;
    if (documentsListSubtitle) documentsListSubtitle.textContent = label;
    if (documentsAddSubtitle) documentsAddSubtitle.textContent = label;
  };


  const openDocumentsFromStorage = async () => {
    const raw = localStorage.getItem(getClinicStorageKey('documentsPatient')) || localStorage.getItem('documentsPatient');
    if (!raw) return;
    localStorage.removeItem(getClinicStorageKey('documentsPatient'));
    localStorage.removeItem('documentsPatient');
    try {
      const patientRaw = JSON.parse(raw);
      const prontuario = patientRaw?.prontuario || patientRaw?.id || patientRaw?._id || '';
      let patient = null;
      if (prontuario) {
        patient = store.get(prontuario);
        if (!patient) {
          patient = await api.readPatient(prontuario).catch(() => null);
        }
      }
      patient = patient || patientRaw;
      if (patient?.prontuario) {
        await openDocumentsListModal(patient);
      }
    } catch (err) {
      console.warn('Nao foi possivel abrir documentos automaticamente', err);
    }
  };

  const resetDocumentState = () => {
    activePatient = null;
    currentDocuments = [];
    if (documentsList) documentsList.innerHTML = '';
  };

  const isAnyDocumentsModalOpen = () => (
    documentsListModal?.classList.contains('open')
    || documentsAddModal?.classList.contains('open')
  );

  const openDocumentsListModal = async (patient) => {
    if (!documentsListModal) return;
    setActivePatient(patient);
    if (documentsCategoryFilter) {
      documentsCategoryFilter.innerHTML = buildCategoryOptions(true);
    }
    await loadDocuments();
    documentsListModal.classList.add('open');
    documentsListModal.setAttribute('aria-hidden', 'false');
  };

  const openDocumentsAddModal = async (patient) => {
    if (!documentsAddModal) return;
    setActivePatient(patient);
    if (docCategory) {
      docCategory.innerHTML = buildCategoryOptions(false);
      updateTypeOptions();
    }
    await loadDocuments();
    documentsAddModal.classList.add('open');
    documentsAddModal.setAttribute('aria-hidden', 'false');
  };

  const closeDocumentsListModal = () => {
    if (!documentsListModal) return;
    documentsListModal.classList.remove('open');
    documentsListModal.setAttribute('aria-hidden', 'true');
    if (!isAnyDocumentsModalOpen()) resetDocumentState();
  };

  const closeDocumentsAddModal = () => {
    if (!documentsAddModal) return;
    documentsAddModal.classList.remove('open');
    documentsAddModal.setAttribute('aria-hidden', 'true');
    if (!isAnyDocumentsModalOpen()) resetDocumentState();
  };
  const applySearch = () => {
    const term = (searchInput?.value || '').trim().toLowerCase();
    if (!term) {
      renderRows(allPatients);
      return;
    }
    const filtered = allPatients.filter((p) => {
      const name = (p.nome || p.fullName || '').toLowerCase();
      const cpf = (p.cpf || '').toLowerCase();
      const prontuario = (p.prontuario || '').toLowerCase();
      return name.includes(term) || cpf.includes(term) || prontuario.includes(term);
    });
    renderRows(filtered);
  };

  const setStatus = (text) => { statusEl.textContent = text; };

  const renderEmpty = (msg) => {
    tbody.innerHTML = `<tr><td colspan="6" class="empty">${msg}</td></tr>`;
  };

  const renderRows = (patients = []) => {
    if (!patients.length) {
      renderEmpty('Nenhum paciente encontrado.');
      return;
    }

    const canManagePatient = currentUser && ['admin', 'recepcionista'].includes(currentUser.tipo);

    const rows = patients.map((p) => {
      const phone = p.telefone || p.phone || p.celular || p.whatsapp || '-';
      const docsCount = (Number(p.attachmentCount) || 0) + (p.serviceFiles?.length || 0);
      const actionsMenu = canManagePatient
        ? `
          <div class="row-menu">
            <button class="menu-trigger" type="button" data-action="toggle-row-menu" aria-label="Acoes">⋮</button>
            <div class="menu-list" role="menu">
              <button class="menu-item" type="button" data-action="edit-patient">Editar paciente</button>
              <button class="menu-item danger" type="button" data-action="delete-patient">Excluir paciente</button>
            </div>
          </div>`
        : '<span class="row-no-actions">-</span>';

      store.set(p.prontuario, p);

      return `
        <tr data-prontuario="${p.prontuario || ''}" data-file="${p.filePath || ''}">
          <td>${p.nome || p.fullName || 'Paciente'}</td>
          <td>${p.cpf || ''}</td>
          <td>${p.prontuario || ''}</td>
          <td>${phone}</td>
          <td class="count">${docsCount}</td>
          <td class="actions">
            ${actionsMenu}
          </td>
        </tr>`;
    }).join('');

    tbody.innerHTML = rows;
  };

  const loadData = async () => {
    setStatus('Carregando pacientes...');
    try {
      currentUser = await authApi.currentUser?.();
      const patients = await api.readPatients();

      if (!patients || patients.length === 0) {
        const msg = currentUser?.tipo === 'dentista'
          ? 'Nenhum paciente atribuido a voce no momento.'
          : 'Cadastre um paciente para listar aqui.';
        setStatus('Nenhum paciente encontrado');
        renderEmpty(msg);
        showToast(msg, 'info');
        return;
      }

      logProntuarioList('patient_prontuario_list_loaded', {
        source: patientsApi.list ? 'patientsApi.list' : 'filesApi.readPatients',
        count: patients.length,
        ids: (patients || []).map((p) => String(p?.id || '').trim()).filter(Boolean),
        prontuarios: (patients || []).map((p) => String(p?.prontuario || p?.id || '').trim()).filter(Boolean),
        clinicIds: Array.from(new Set((patients || []).map((p) => String(p?.clinicId || '').trim()).filter(Boolean))),
      });

        const withPhones = await Promise.all((patients || []).map(async (p) => {
          const hasPhone = p.telefone || p.phone || p.celular || p.whatsapp;
          if (hasPhone || !api.readPatient || !p.prontuario) return p;
          try {
            const full = await api.readPatient(p.prontuario);
            const phone = full?.telefone || full?.phone || full?.celular || full?.whatsapp || '';
            if (!phone) return p;
            return { ...p, telefone: phone, phone };
          } catch (err) {
            return p;
          }
        }));


      setStatus(`${withPhones.length} paciente${withPhones.length === 1 ? '' : 's'} carregado${withPhones.length === 1 ? '' : 's'}`);
      allPatients = withPhones;
      if (searchInput && searchInput.value.trim()) {
        applySearch();
      } else {
        renderRows(allPatients);
      }
      await openDocumentsFromStorage();
    } catch (err) {
      console.warn('Arquivos nao carregados (permissao ou erro)', err);
      setStatus('Erro ao carregar');
      renderEmpty('Nao foi possivel carregar os dados agora.');
      showToast('Nao foi possivel carregar os pacientes.', 'info');
    }
  };

  const handleOpenDocs = async (patient) => {
    if (!api.documents?.list) {
      showToast('Modulo de documentos nao disponivel.', 'error');
      return;
    }
    await openDocumentsAddModal(patient);
  };


  const openProntuario = (patient) => {
    if (!patient) return;
    localStorage.setItem(getClinicStorageKey('prontuarioPatient'), JSON.stringify(patient));
    window.location.href = 'prontuario.html';
  };

  const handleViewServices = async (prontuario) => {
    try {
      const patient = await api.readPatient(prontuario);
      if (patient) {
        localStorage.setItem(getClinicStorageKey('editingPatient'), JSON.stringify(patient));
      }
      window.location.href = 'editar-paciente.html';
    } catch (err) {
      console.warn('Nao foi possivel abrir paciente', err);
      alert('Não foi possível abrir os serviços deste paciente.');
    }
  };

  const handleDeletePatient = async (prontuario) => {
    if (!prontuario || !api.deletePatient) {
      showToast('Nao foi possivel excluir o paciente.', 'error');
      return;
    }
    const confirmed = window.confirm('Deseja realmente excluir este paciente? Esta acao nao pode ser desfeita.');
    if (!confirmed) return;
    try {
      await api.deletePatient(prontuario);
      showToast('Paciente excluido com sucesso.', 'info');
      await loadData();
    } catch (err) {
      console.warn('Erro ao excluir paciente', err);
      showToast('Falha ao excluir paciente.', 'error');
    }
  };

  const handleGenerateReceipt = async (prontuario) => {
    const canReceipts = currentUser && ['admin', 'recepcionista'].includes(currentUser.tipo);
    if (!canReceipts) {
      showToast('Sem permissao para gerar PDF.', 'error');
      return;
    }

    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) {
      showToast('Biblioteca de recibos nao carregada.', 'error');
      return;
    }

    let patient = null;
    try {
      patient = await api.readPatient(prontuario);
    } catch (err) {
      console.warn('Erro ao ler paciente para recibo', err);
      showToast('Nao foi possivel carregar o paciente.', 'error');
      return;
    }

    const services = Array.isArray(patient?.servicos) ? patient.servicos : [];
    if (!services.length) {
      showToast('Paciente sem procedimentos registrados.', 'error');
      return;
    }

    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const title = 'Recibo de Servicos';
    const patientName = patient.fullName || patient.nome || 'Paciente';
    const cpf = patient.cpf || '-';
    const now = new Date();
    const dateLabel = now.toLocaleDateString('pt-BR');
    const fileDate = now.toISOString().split('T')[0];

    doc.setFontSize(16);
    doc.text(title, 40, 40);
    doc.setFontSize(11);
    doc.text(`Paciente: ${patientName}`, 40, 62);
    doc.text(`Prontuario: ${prontuario}`, 40, 78);
    doc.text(`CPF: ${cpf}`, 40, 94);
    doc.text(`Data: ${dateLabel}`, 40, 110);

    const rows = buildReceiptRows(services);
    const total = services.reduce((sum, svc) => sum + (Number(svc.valor) || 0), 0);

    let cursorY = 130;
    if (typeof doc.autoTable === 'function') {
      doc.autoTable({
        startY: cursorY,
        head: [['#', 'Procedimento', 'Dentes', 'Dentista', 'Data', 'Valor']],
        body: rows,
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [46, 125, 50] },
        columnStyles: { 0: { cellWidth: 24 }, 5: { halign: 'right' } },
      });
      cursorY = doc.lastAutoTable.finalY + 20;
    } else {
      rows.forEach((row) => {
        doc.text(`${row[0]}. ${row[1]} | ${row[2]} | ${row[3]} | ${row[4]} | ${row[5]}`, 40, cursorY);
        cursorY += 16;
      });
      cursorY += 10;
    }

    doc.setFontSize(12);
    doc.text(`Total: ${formatCurrency(total)}`, 40, cursorY);
    doc.save(`recibo-${prontuario}-${fileDate}.pdf`);
  };
  if (searchInput) {
    searchInput.addEventListener('input', applySearch);
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applySearch();
      }
    });
  }
  searchButton?.addEventListener('click', applySearch);


  documentsListClose?.addEventListener('click', closeDocumentsListModal);
  documentsListModal?.addEventListener('click', (event) => {
    if (event.target === documentsListModal) closeDocumentsListModal();
  });
  documentsAddClose?.addEventListener('click', closeDocumentsAddModal);
  documentsAddModal?.addEventListener('click', (event) => {
    if (event.target === documentsAddModal) closeDocumentsAddModal();
  });
  documentsSearch?.addEventListener('input', renderDocuments);
  documentsCategoryFilter?.addEventListener('change', renderDocuments);
  documentsArchivedToggle?.addEventListener('change', loadDocuments);
  documentsRefresh?.addEventListener('click', loadDocuments);
  docCategory?.addEventListener('change', updateTypeOptions);

  uploadForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!activePatient?.prontuario) return;
    const file = docFile?.files?.[0];
    if (!file || !file.path) {
      showToast('Selecione um arquivo valido.', 'error');
      return;
    }
    if (file.size > maxUploadBytes) {
      showToast('Arquivo excede 25MB.', 'error');
      return;
    }

    try {
      const patientContext = activePatient;
      await api.documents.upload({
        prontuario: activePatient.prontuario,
        category: docCategory?.value,
        type: docType?.value,
        title: docTitle?.value,
        documentDate: docDate?.value,
        atendimentoId: docAtendimento?.value,
        notes: docNotes?.value,
        versionOf: docVersionOf?.value,
        filePath: file.path,
      });
      showToast('Arquivo enviado com sucesso.', 'info');
      uploadForm.reset();
      updateTypeOptions();
      await loadData();
      closeDocumentsAddModal();
      if (patientContext) {
        await openDocumentsListModal(patientContext);
      }
    } catch (err) {
      console.warn('Falha ao enviar arquivo', err);
      showToast('Falha ao enviar arquivo.', 'error');
    }
  });

  documentsList?.addEventListener('click', async (event) => {
    const btn = event.target.closest('button[data-action]');
    if (!btn) return;
    const item = event.target.closest('.document-item');
    const docId = item?.dataset?.docId;
    if (!docId || !activePatient?.prontuario) return;
    const doc = [...currentDocuments, ...buildLegacyDocuments()].find((d) => d.id === docId);
    if (!doc) return;

    if (btn.dataset.action === 'open-document') {
      try {
        if (doc.isLegacy) {
          await api.openFile?.(doc.legacyPath);
        } else {
          await api.documents.open({ prontuario: activePatient.prontuario, documentId: docId });
        }
      } catch (err) {
        console.warn('Erro ao abrir arquivo', err);
        showToast('Falha ao abrir arquivo.', 'error');
      }
      return;
    }

    if (btn.dataset.action === 'archive-document') {
      try {
        await api.documents.archive({
          prontuario: activePatient.prontuario,
          documentId: docId,
          archived: !doc.archived,
        });
        await loadDocuments();
      } catch (err) {
        console.warn('Erro ao arquivar arquivo', err);
        showToast('Falha ao atualizar arquivo.', 'error');
      }
    }
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.row-menu')) {
      document.querySelectorAll('.row-menu.open').forEach((menu) => menu.classList.remove('open'));
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      document.querySelectorAll('.row-menu.open').forEach((menu) => menu.classList.remove('open'));
    }
  });

  tbody.addEventListener('click', async (event) => {
    const btn = event.target.closest('button[data-action]');
    const row = event.target.closest('tr');
    const prontuario = row?.dataset?.prontuario;
    if (!prontuario) return;

    const patient = store.get(prontuario) || {};

    if (!btn) {
      if (event.target.closest('.row-menu')) return;
      openProntuario(patient);
      return;
    }

    const rowMenu = row.querySelector('.row-menu');

    switch (btn.dataset.action) {
      case 'toggle-row-menu':
        event.stopPropagation();
        document.querySelectorAll('.row-menu.open').forEach((menu) => {
          if (menu !== rowMenu) menu.classList.remove('open');
        });
        rowMenu?.classList.toggle('open');
        break;
      case 'edit-patient':
        event.stopPropagation();
        rowMenu?.classList.remove('open');
        await handleViewServices(prontuario);
        break;
      case 'delete-patient':
        event.stopPropagation();
        rowMenu?.classList.remove('open');
        await handleDeletePatient(prontuario);
        break;
      default:
        break;
    }
  });

  loadData();
});








