document.addEventListener('DOMContentLoaded', () => {
  const tabs = Array.from(document.querySelectorAll('.tab'));
  const panels = Array.from(document.querySelectorAll('.tab-panel'));

  const patientName = document.getElementById('patient-name');
  const patientAvatar = document.getElementById('patient-avatar');
  const patientAvatarPhoto = document.getElementById('patient-avatar-photo');
  const patientAvatarFallback = document.getElementById('patient-avatar-fallback');
  const patientPhone = document.getElementById('patient-phone');
  const patientCpf = document.getElementById('patient-cpf');
  const patientProntuario = document.getElementById('patient-prontuario');
  const patientStatus = document.getElementById('patient-status');

  const btnEditProfile = document.getElementById('btn-edit-profile');
  const btnGeneralInfo = document.getElementById('btn-general-info');
  const btnWhatsAppPatient = document.getElementById('btn-whatsapp-patient');
  const btnNewAtestado = document.getElementById('btn-new-atestado');
  const btnNewAnamnese = document.getElementById('btn-new-anamnese');
  const btnNewReceita = document.getElementById('btn-new-receita');
  const docsList = document.getElementById('docs-list');
  const docsEmpty = document.getElementById('docs-empty');
  const arquivosList = document.getElementById('arquivos-list');
  const arquivosEmpty = document.getElementById('arquivos-empty');
  const anamneseList = document.getElementById('anamnese-list');
  const anamneseEmpty = document.getElementById('anamnese-empty');
  const docsNewMenu = document.getElementById('docs-new-menu');
  const docsNewDropdown = document.getElementById('docs-new-dropdown');
  const btnDocsNew = document.getElementById('btn-docs-new');
  const btnDocsDossie = document.getElementById('btn-docs-dossie');
  const uploadDrawer = document.getElementById('upload-drawer');
  const uploadDrawerForm = document.getElementById('upload-drawer-form');
  const uploadFileInput = document.getElementById('upload-file-input');
  const uploadPhotoInput = document.getElementById('upload-photo-input');
  const uploadFileName = document.getElementById('upload-file-name');
  const uploadPatientName = document.getElementById('upload-patient-name');
  const uploadFolder = document.getElementById('upload-folder');
  const uploadTitle = document.getElementById('upload-title');
  const uploadStatus = document.getElementById('upload-status');
  const uploadSubmitButton = uploadDrawerForm?.querySelector('button[type="submit"]');
  const infoDrawer = document.getElementById('info-drawer');
  const infoNome = document.getElementById('info-nome');
  const infoSexo = document.getElementById('info-sexo');
  const infoEstadoCivil = document.getElementById('info-estado-civil');
  const infoSituacaoProfissional = document.getElementById('info-situacao-profissional');
  const infoCpf = document.getElementById('info-cpf');
  const infoRg = document.getElementById('info-rg');
  const infoDataNascimento = document.getElementById('info-data-nascimento');
  const infoTelefone = document.getElementById('info-telefone');
  const infoEmail = document.getElementById('info-email');
  const infoEndereco = document.getElementById('info-endereco');
  const consultasList = document.getElementById('consultas-list');
  const consultasEmpty = document.getElementById('consultas-empty');
  const resumoDentes = document.getElementById('resumo-dentes');
  const resumoDente = document.getElementById('resumo-dente');
  const resumoFaces = document.getElementById('resumo-faces');
  const resumoFaceChips = Array.from(document.querySelectorAll('.summary-legend .legend-chip[data-face]'));
  const odontogramaFrame = document.querySelector('.odontograma-frame');
  const procedimentosBody = document.getElementById('procedimentos-body');
  const procedimentosEmpty = document.getElementById('procedimentos-empty');
  const procedimentosFiltros = Array.from(document.querySelectorAll('.procedimentos-filtros .pill-btn'));
  const procModal = document.getElementById('proc-modal');
  const procModalTitle = document.getElementById('proc-modal-title');
  const procModalStatus = document.getElementById('proc-modal-status');
  const procModalDentista = document.getElementById('proc-modal-dentista');
  const procModalValor = document.getElementById('proc-modal-valor');
  const procModalAdd = document.getElementById('proc-modal-add');
  const procModalFinal = document.getElementById('proc-modal-final');
  const procModalObs = document.getElementById('proc-modal-obs');
  const procModalDentes = document.getElementById('proc-modal-dentes');
  const procModalFaces = document.getElementById('proc-modal-faces');
  const procModalTempo = document.getElementById('proc-modal-tempo');
  const procModalCodigo = document.getElementById('proc-modal-codigo');
  const procModalFinStatus = document.getElementById('proc-modal-fin-status');
  const procModalFinMethod = document.getElementById('proc-modal-fin-method');
  const procModalFinInstallments = document.getElementById('proc-modal-fin-installments');
  const procModalFinDue = document.getElementById('proc-modal-fin-due');
  const procModalFinPaidAt = document.getElementById('proc-modal-fin-paid-at');
  const procModalCustoTotal = document.getElementById('proc-modal-custo-total');
  const procModalCustoLab = document.getElementById('proc-modal-custo-lab');
  const procModalCustoMateriais = document.getElementById('proc-modal-custo-materiais');
  const procModalCustoOutros = document.getElementById('proc-modal-custo-outros');
  const procModalLucro = document.getElementById('proc-modal-lucro');
  const procModalLucroHora = document.getElementById('proc-modal-lucro-hora');
  const procEditModal = document.getElementById('proc-edit-modal');
  const procEditForm = document.getElementById('proc-edit-form');
  const procEditId = document.getElementById('proc-edit-id');
  const procEditName = document.getElementById('proc-edit-name');
  const procEditValor = document.getElementById('proc-edit-valor');
  const procEditDentes = document.getElementById('proc-edit-dentes');
  const procEditProfissional = document.getElementById('proc-edit-profissional');
  const procEditRealizado = document.getElementById('proc-edit-realizado');
  const procEditObs = document.getElementById('proc-edit-obs');
  const procEditFinanceiro = document.getElementById('proc-edit-financeiro');
  const procEditDatalist = document.getElementById('proc-edit-procedures');
  const procEditStatusRadios = Array.from(document.querySelectorAll('input[name="proc-edit-status"]'));
  const procEditFaces = Array.from(document.querySelectorAll('input[name="proc-edit-faces"]'));
  const procFinalizeModal = document.getElementById('proc-finalize-modal');
  const procFinalizeForm = document.getElementById('proc-finalize-form');
  const procFinalizeTitle = document.getElementById('proc-finalize-title');
  const procFinalizeDraftBtn = document.getElementById('proc-finalize-draft-btn');
  const procQuickStatus = document.getElementById('proc-quick-status');
  const procStickyWorkflow = document.getElementById('proc-sticky-workflow');
  const procStickyValor = document.getElementById('proc-sticky-valor');
  const procStickyCusto = document.getElementById('proc-sticky-custo');
  const procStickyLucro = document.getElementById('proc-sticky-lucro');
  const procFinalizeId = document.getElementById('proc-finalize-id');
  const procFinalizeSubmit = document.getElementById('proc-finalize-submit');
  const procFullName = document.getElementById('proc-full-name');
  const procFullDentes = document.getElementById('proc-full-dentes');
  const procFullProfissional = document.getElementById('proc-full-profissional');
  const procFullRegisteredAt = document.getElementById('proc-full-registered-at');
  const procFullFinishedAt = document.getElementById('proc-full-finished-at');
  const procFullObs = document.getElementById('proc-full-obs');
  const procFullGerarFinanceiro = document.getElementById('proc-full-gerar-financeiro');
  const procFullStatusRadios = Array.from(document.querySelectorAll('input[name="proc-full-status"]'));
  const procFullFaces = Array.from(document.querySelectorAll('input[name="proc-full-faces"]'));
  const procFinalizeValor = document.getElementById('proc-finalize-valor');
  const procFinalizeTempo = document.getElementById('proc-finalize-tempo');
  const procFinalizeTimerBlock = document.getElementById('proc-finalize-timer-block');
  const procTimerStatusHint = document.getElementById('proc-timer-status-hint');
  const procTimerDisplay = document.getElementById('proc-timer-display');
  const procMateriaisList = document.getElementById('proc-materiais-list');
  const procOutrosList = document.getElementById('proc-outros-list');
  const procLabDescricao = document.getElementById('proc-lab-descricao');
  const procLabValor = document.getElementById('proc-lab-valor');
  const procResumoValor = document.getElementById('proc-resumo-valor');
  const procResumoCusto = document.getElementById('proc-resumo-custo');
  const procResumoLucro = document.getElementById('proc-resumo-lucro');
  const procResumoLucroHora = document.getElementById('proc-resumo-lucro-hora');
  const procResumoPaymentStatus = document.getElementById('proc-resumo-payment-status');
  const procPaymentMethod = document.getElementById('proc-payment-method');
  const procPaymentStatusRadios = Array.from(document.querySelectorAll('input[name="proc-payment-status"]'));
  const procPaymentDueWrap = document.getElementById('proc-payment-due-wrap');
  const procPaymentDueDate = document.getElementById('proc-payment-due-date');
  const procPaymentInstallmentsWrap = document.getElementById('proc-payment-installments-wrap');
  const procPaymentInstallmentsLabel = document.getElementById('proc-payment-installments-label');
  const procPaymentInstallments = document.getElementById('proc-payment-installments');
  const procPaymentPaidAtWrap = document.getElementById('proc-payment-paid-at-wrap');
  const procPaymentPaidAt = document.getElementById('proc-payment-paid-at');
  const timerRunningBanner = document.getElementById('timer-running-banner');
  const timerRunningText = document.getElementById('timer-running-text');
  const financeTotalPrevisto = document.getElementById('finance-total-previsto');
  const financeTotalRecebido = document.getElementById('finance-total-recebido');
  const financeSaldo = document.getElementById('finance-saldo');
  const patientFinanceTotalPaid = document.getElementById('patient-finance-total-paid');
  const patientFinanceTotalPending = document.getElementById('patient-finance-total-pending');
  const patientFinanceTotalOverdue = document.getElementById('patient-finance-total-overdue');
  const patientFinanceBody = document.getElementById('patient-finance-body');
  const patientFinanceEmpty = document.getElementById('patient-finance-empty');
  const patientPaymentModal = document.getElementById('patient-payment-modal');
  const patientPaymentModalTitle = document.getElementById('patient-payment-modal-title');
  const patientPaymentForm = document.getElementById('patient-payment-form');
  const patientPaymentDescription = document.getElementById('patient-payment-description');
  const patientPaymentMode = document.getElementById('patient-payment-mode');
  const patientPaymentValue = document.getElementById('patient-payment-value');
  const patientPaymentMethod = document.getElementById('patient-payment-method');
  const patientPaymentDueDate = document.getElementById('patient-payment-due-date');
  const patientPaymentInstallmentsWrap = document.getElementById('patient-payment-installments-wrap');
  const patientPaymentInstallments = document.getElementById('patient-payment-installments');
  const patientPaymentStatus = document.getElementById('patient-payment-status');
  const patientPaymentSubmit = document.getElementById('patient-payment-submit');
  const serviceDrawer = document.getElementById('service-drawer');
  const serviceDrawerForm = document.getElementById('service-drawer-form');
  const serviceDrawerName = document.getElementById('drawer-proc-name');
  const serviceDrawerValue = document.getElementById('drawer-proc-value');
  const serviceDrawerProcCode = document.getElementById('drawer-proc-code');
  const serviceDrawerDentes = document.getElementById('drawer-dentes');
  const serviceDrawerDentesSelect = document.getElementById('drawer-dentes-select');
  const serviceDrawerObs = document.getElementById('drawer-obs');
  const serviceDrawerHelp = document.getElementById('drawer-dentes-help');
  const serviceDrawerFaceChips = Array.from(document.querySelectorAll('.drawer-face-chip[data-face]'));
  const btnsNovaEvolucao = Array.from(document.querySelectorAll('[data-action="nova-evolucao"]'));
  const anotacoesList = document.getElementById('anotacoes-list');
  const anotacoesEmpty = document.getElementById('anotacoes-empty');
  const anotacaoModal = document.getElementById('anotacao-modal');
  const anotacaoModalTitle = document.getElementById('anotacao-modal-title');
  const anotacaoForm = document.getElementById('anotacao-form');
  const anotacaoTexto = document.getElementById('anotacao-texto');
  const anotacaoStatus = document.getElementById('anotacao-status');
  const anotacaoSubmit = document.getElementById('anotacao-submit');


  let currentPatient = null;
  let currentUser = null;
  const appApi = window.appApi || {};
  const authApi = appApi.auth || window.auth || {};
  const patientsApi = appApi.patients || window.api?.patients || {};
  const servicesApi = appApi.services || window.api?.services || {};
  const proceduresCatalogApi = appApi.procedures || window.api?.procedures || {};
  const financeApi = appApi.finance || window.api?.finance || {};
  const documentsApi = appApi.documents || window.api?.documents || {};
  const agendaApi = appApi.agenda || window.api?.agenda || {};
  const loadProceduresApi = appApi.loadProcedures || window.api?.loadProcedures;
  const openExternalUrlApi = appApi.openExternalUrl || window.api?.openExternalUrl;
  let docsCache = [];
  let selectedUploadFile = null;
  let dentesSelecionadosIframe = [];
  let allProcedures = [];
  let resumoDenteAtual = '';
  let facesPorDente = {};
  let suppressDrawerOpen = false;
  const faceOrder = ['D', 'L', 'M', 'O', 'V'];
  const maxPatientDocumentUploadBytes = 5 * 1024 * 1024;
  const supportedUploadExt = /\.(pdf|png|jpe?g|webp)$/i;
  const supportedUploadMimeTypes = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp']);


  let pendingOdontogramaServices = null;
  let anotacaoSaving = false;
  let editingAnotacaoId = '';
  let timerIntervals = new Map();
  let activeRunningServiceId = '';
  let patientFinanceRows = [];
  let procedureFinalizeSaving = false;
  let procFinalizeMode = 'finalize';
  let procQuickStatusSyncing = false;
  let procFinalizeSectionsReady = false;
  let patientPaymentSaving = false;
  let uploadSaving = false;
  let editingPatientPaymentId = '';
  let proceduresCatalogLoadedAt = 0;
  let proceduresCatalogLoading = null;
  let procedimentosDataLoading = false;
  let patientFinanceDataLoading = false;
  let lastProcedimentosPatientKey = '';
  let lastPatientFinanceKey = '';
  let patientAvatarLoadToken = 0;
  let documentsLoadToken = 0;
  let consultaStatusUpdating = false;
  let currentUserPromise = null;
  let patientFetchPromise = null;
  let patientFetchKey = '';
  let patientFinancePromise = null;
  let patientFinancePromiseKey = '';
  let documentsPromise = null;
  let documentsPromiseKey = '';
  let procedimentosRefreshPromise = null;
  let procedimentosRefreshKey = '';
  const PRONTUARIO_CACHE_TTL_MS = 60 * 1000;

  const prontuarioNowMs = () => (window.performance?.now ? window.performance.now() : Date.now());
  const prontuarioPerfLog = (stage, started = null, extra = {}) => {
    console.info('[perf][prontuario-open]', {
      stage,
      durationMs: Number.isFinite(started) ? Math.round(prontuarioNowMs() - started) : 0,
      ...extra,
    });
  };

  const ensureLoadingStyles = (() => {
    let injected = false;
    return () => {
      if (injected || document.getElementById('voithos-loading-styles')) return;
      injected = true;
      const style = document.createElement('style');
      style.id = 'voithos-loading-styles';
      style.textContent = `
        @keyframes voithos-loading-pulse {
          0%, 100% { opacity: 0.55; }
          50% { opacity: 1; }
        }
        .voithos-loading-panel {
          display: grid;
          gap: 12px;
          align-items: center;
          justify-items: start;
          min-height: 180px;
          padding: 16px 12px;
        }
        .voithos-loading-line,
        .voithos-loading-pill {
          background: linear-gradient(90deg, rgba(226, 232, 240, 0.92) 25%, rgba(203, 213, 225, 0.92) 50%, rgba(226, 232, 240, 0.92) 75%);
          background-size: 200% 100%;
          animation: voithos-loading-pulse 1.25s ease-in-out infinite;
          border-radius: 999px;
        }
        .voithos-loading-line {
          height: 12px;
          width: 100%;
        }
        .voithos-loading-line.w-80 { width: 80%; }
        .voithos-loading-line.w-65 { width: 65%; }
        .voithos-loading-line.w-50 { width: 50%; }
        .voithos-loading-pill {
          width: 112px;
          height: 34px;
          border-radius: 999px;
        }
      `;
      document.head.appendChild(style);
    };
  })();

  const buildLoadingStateHtml = (title, subtitle, rows = 3) => {
    ensureLoadingStyles();
    const safeRows = Math.max(2, Math.min(Number(rows) || 3, 5));
    const lines = Array.from({ length: safeRows }, (_, index) => {
      const widths = ['w-80', 'w-65', 'w-50'];
      return `<div class="voithos-loading-line ${widths[index % widths.length]}"></div>`;
    }).join('');
    return `
      <div class="voithos-loading-panel" role="status" aria-live="polite" aria-busy="true">
        <div class="voithos-loading-pill"></div>
        <p class="empty-state-title">${title}</p>
        <p class="empty-state-subtitle">${subtitle}</p>
        ${lines}
      </div>
    `;
  };

  const getCurrentPatientKey = () => {
    if (!currentPatient) return '';
    return String(currentPatient?.id || currentPatient?._id || currentPatient?.prontuario || '').trim();
  };

  const getPatientKey = (patient = null) => String(patient?.id || patient?._id || patient?.prontuario || '').trim();
  const getPatientHeaderCacheKey = (patient = null) => {
    const clinicId = String(currentUser?.clinicId || patient?.clinicId || patient?.clinicaId || '').trim() || 'global';
    const userId = String(currentUser?.id || currentUser?._id || currentUser?.login || '').trim() || 'user';
    const patientKey = getPatientKey(patient);
    return patientKey ? `voithos-prontuario-patient-header:v1:${clinicId}:${userId}:${patientKey}` : '';
  };

  const pickPatientHeaderCache = (patient = {}) => ({
    id: patient.id || patient._id || '',
    _id: patient._id || patient.id || '',
    prontuario: patient.prontuario || '',
    clinicId: patient.clinicId || patient.clinicaId || '',
    clinicaId: patient.clinicaId || patient.clinicId || '',
    fullName: patient.fullName || patient.nome || '',
    nome: patient.nome || patient.fullName || '',
    telefone: patient.telefone || patient.phone || patient.celular || patient.whatsapp || '',
    phone: patient.phone || patient.telefone || '',
    celular: patient.celular || '',
    whatsapp: patient.whatsapp || '',
    cpf: patient.cpf || '',
    temAnamnese: Boolean(patient.temAnamnese),
    selfieUrl: patient.selfieUrl || '',
    profilePhotoUrl: patient.profilePhotoUrl || '',
    fotoPerfilUrl: patient.fotoPerfilUrl || '',
    avatarUrl: patient.avatarUrl || '',
    photoUrl: patient.photoUrl || '',
    fotoUrl: patient.fotoUrl || '',
    selfieMime: patient.selfieMime || '',
    profilePhotoMime: patient.profilePhotoMime || '',
    selfiePath: patient.selfiePath || '',
    profilePhotoPath: patient.profilePhotoPath || '',
    selfieUpdatedAt: patient.selfieUpdatedAt || '',
    profilePhotoUpdatedAt: patient.profilePhotoUpdatedAt || '',
  });

  const readPatientHeaderCache = (patient = null) => {
    const key = getPatientHeaderCacheKey(patient);
    if (!key) return null;
    try {
      const parsed = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (!parsed || Number(parsed.expiresAt || 0) < Date.now()) {
        sessionStorage.removeItem(key);
        return null;
      }
      return parsed.patient || null;
    } catch (_) {
      sessionStorage.removeItem(key);
      return null;
    }
  };

  const writePatientHeaderCache = (patient = null) => {
    const key = getPatientHeaderCacheKey(patient);
    if (!key || !patient) return;
    try {
      sessionStorage.setItem(key, JSON.stringify({
        expiresAt: Date.now() + PRONTUARIO_CACHE_TTL_MS,
        patient: pickPatientHeaderCache(patient),
      }));
    } catch (_) {}
  };

  const invalidatePatientHeaderCache = (patient = null) => {
    const key = getPatientHeaderCacheKey(patient);
    if (!key) return;
    try {
      sessionStorage.removeItem(key);
    } catch (_) {}
  };

  const setAnotacaoStatus = (text = '', isError = false) => {
    if (!anotacaoStatus) return;
    anotacaoStatus.textContent = text;
    anotacaoStatus.style.color = isError ? '#b42318' : '#148764';
  };
  const emitFinanceUpdated = () => {
    try {
      window.dispatchEvent(new CustomEvent('finance-updated', { detail: { source: 'prontuario' } }));
      localStorage.setItem(getClinicStorageKey('voithos-finance-updated'), JSON.stringify({
        at: Date.now(),
        source: 'prontuario',
        prontuario: currentPatient?.prontuario || '',
      }));
    } catch (_) {
    }
  };

  const avatarImageExtPattern = /\.(png|jpe?g|webp)(?:[?#].*)?$/i;

  const getPatientAvatarSource = (patient = null) => {
    if (!patient || typeof patient !== 'object') return { url: '', mime: '' };
    const url = [
      patient.selfieUrl,
      patient.profilePhotoUrl,
      patient.fotoPerfilUrl,
      patient.avatarUrl,
      patient.photoUrl,
      patient.fotoUrl,
    ].find((value) => typeof value === 'string' && value.trim());
    const mime = [
      patient.selfieMime,
      patient.profilePhotoMime,
      patient.fotoPerfilMime,
      patient.avatarMime,
      patient.photoMime,
      patient.fotoMime,
    ].find((value) => typeof value === 'string' && value.trim());
    return {
      url: String(url || '').trim(),
      mime: String(mime || '').trim().toLowerCase(),
    };
  };

  const canUsePatientAvatarImage = ({ url = '', mime = '' } = {}) => {
    if (!url) return false;
    if (mime) return /^image\/(png|jpe?g|webp)$/i.test(mime);
    if (/^data:image\/(png|jpe?g|webp)/i.test(url)) return true;
    return avatarImageExtPattern.test(url);
  };

  const canLoadPatientAvatarAsset = (patient = {}) => Boolean(
    patientsApi.getSelfieObjectUrl
    && (patient?.selfiePath || patient?.profilePhotoPath || patient?.selfieUpdatedAt || patient?.profilePhotoUpdatedAt)
    && (patient?.id || patient?._id || patient?.prontuario)
  );

  const setPatientAvatarPhotoSource = ({ url, loadToken, initial, patientNameValue }) => {
    if (!patientAvatarPhoto || !patientAvatarFallback || !url) return;
    patientAvatarPhoto.onload = () => {
      if (patientAvatarLoadToken !== loadToken) return;
      patientAvatar.classList.add('has-photo');
      patientAvatar.title = patientNameValue ? `${patientNameValue} (foto de perfil)` : 'Foto de perfil do paciente';
      patientAvatarFallback.hidden = true;
      patientAvatarPhoto.hidden = false;
    };
    patientAvatarPhoto.onerror = () => {
      if (patientAvatarLoadToken !== loadToken) return;
      setPatientAvatarFallback(initial, patientNameValue);
    };
    patientAvatarPhoto.src = url;
  };

  const setPatientAvatarFallback = (initial = 'P', patientNameValue = '') => {
    patientAvatarLoadToken += 1;
    if (patientAvatar) {
      patientAvatar.classList.remove('has-photo');
      patientAvatar.title = patientNameValue ? `${patientNameValue} (sem foto de perfil)` : 'Sem foto de perfil';
    }
    if (patientAvatarPhoto) {
      patientAvatarPhoto.hidden = true;
      patientAvatarPhoto.removeAttribute('src');
      patientAvatarPhoto.onerror = null;
      patientAvatarPhoto.onload = null;
    }
    if (patientAvatarFallback) {
      patientAvatarFallback.textContent = initial;
      patientAvatarFallback.hidden = false;
    } else if (patientAvatar) {
      patientAvatar.textContent = initial;
    }
  };

  const renderPatientAvatar = (patient, initial = 'P', patientNameValue = '') => {
    if (!patientAvatar) return;
    setPatientAvatarFallback(initial, patientNameValue);
    if (!patientAvatarPhoto || !patientAvatarFallback) return;

    const source = getPatientAvatarSource(patient);
    if (canUsePatientAvatarImage(source)) {
      const loadToken = patientAvatarLoadToken + 1;
      patientAvatarLoadToken = loadToken;
      setPatientAvatarPhotoSource({ url: source.url, loadToken, initial, patientNameValue });
      return;
    }

    if (!canLoadPatientAvatarAsset(patient)) return;
    const loadToken = patientAvatarLoadToken + 1;
    patientAvatarLoadToken = loadToken;
    patientsApi.getSelfieObjectUrl({
      patientId: patient.id || patient._id || patient.prontuario,
      selfieUpdatedAt: patient.selfieUpdatedAt || patient.profilePhotoUpdatedAt || '',
    }).then((url) => {
      if (patientAvatarLoadToken !== loadToken) return;
      setPatientAvatarPhotoSource({ url, loadToken, initial, patientNameValue });
    }).catch(() => {
      if (patientAvatarLoadToken !== loadToken) return;
      setPatientAvatarFallback(initial, patientNameValue);
    });
  };
  const updateAnotacaoSubmitState = () => {
    if (!anotacaoSubmit) return;
    const hasText = Boolean((anotacaoTexto?.value || '').trim());
    anotacaoSubmit.disabled = anotacaoSaving || !hasText;
  };

  const closeAnotacaoModal = () => {
    if (!anotacaoModal) return;
    anotacaoModal.classList.remove('open');
    anotacaoModal.setAttribute('aria-hidden', 'true');
    if (anotacaoForm) anotacaoForm.reset();
    editingAnotacaoId = '';
    if (anotacaoModalTitle) anotacaoModalTitle.textContent = 'Adicionar anotacao';
    if (anotacaoSubmit) anotacaoSubmit.textContent = 'Adicionar anotacao';
    anotacaoSaving = false;
    setAnotacaoStatus('');
    updateAnotacaoSubmitState();
    document.body.style.overflow = '';
  };

  const openAnotacaoModal = (anotacao = null) => {
    if (!anotacaoModal) return;
    const isEdit = Boolean(anotacao?.id);
    editingAnotacaoId = isEdit ? String(anotacao.id) : '';
    if (anotacaoTexto) {
      anotacaoTexto.value = isEdit ? String(anotacao?.data?.texto || anotacao?.texto || '').trim() : '';
    }
    if (anotacaoModalTitle) anotacaoModalTitle.textContent = isEdit ? 'Editar anotacao' : 'Adicionar anotacao';
    if (anotacaoSubmit) anotacaoSubmit.textContent = isEdit ? 'Salvar anotacao' : 'Adicionar anotacao';
    anotacaoModal.classList.add('open');
    anotacaoModal.setAttribute('aria-hidden', 'false');
    anotacaoSaving = false;
    setAnotacaoStatus('');
    updateAnotacaoSubmitState();
    document.body.style.overflow = 'hidden';
    anotacaoTexto?.focus();
  };

  const showAnotacaoToast = (message) => {
    const text = String(message || '').trim();
    if (!text) return;
    const toast = document.createElement('div');
    toast.className = 'anotacao-toast';
    toast.textContent = text;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 220);
    }, 2200);
  };

  const normalizeFacesList = (faces) => {
    if (!faces) return [];
    if (Array.isArray(faces)) return faces.map((f) => String(f).trim()).filter(Boolean);
    return String(faces).split('').map((f) => f.trim()).filter(Boolean);
  };

  const buildOdontogramaSelections = (services = []) => {
    const map = {};
    (Array.isArray(services) ? services : []).forEach((svc) => {
      const dentes = Array.isArray(svc.dentes) ? svc.dentes : [];
      const denteFaces = String(svc.denteFaces || '').trim();
      const faces = normalizeFacesList(svc.faces);
      dentes.forEach((d) => {
        const key = String(d).trim();
        if (!key) return;
        if (!map[key]) map[key] = new Set();
        if (denteFaces && key === denteFaces && faces.length) {
          faces.forEach((face) => map[key].add(face));
        }
      });
    });
    return map;
  };

  const applyOdontogramaSelections = (services = []) => {
    if (!odontogramaFrame) return;
    if (!odontogramaFrame.contentWindow) {
      pendingOdontogramaServices = services;
      return;
    }
    suppressDrawerOpen = true;
    const map = buildOdontogramaSelections(services);
    const selectedTeeth = Object.keys(map);
    odontogramaFrame.contentWindow.postMessage({
      type: 'odontograma:set-dentes',
      dentes: selectedTeeth,
      lastDente: selectedTeeth.length ? selectedTeeth[selectedTeeth.length - 1] : '',
    }, '*');
    selectedTeeth.forEach((dente) => {
      const faces = Array.from(map[dente] || []);
      if (!faces.length) return;
      odontogramaFrame.contentWindow.postMessage({
        type: 'odontograma:set-faces',
        dente,
        faces,
      }, '*');
    });
    setTimeout(() => { suppressDrawerOpen = false; }, 350);
  };

  const loadCurrentUser = async () => {
    if (currentUser) return currentUser;
    if (currentUserPromise) return currentUserPromise;
    const started = prontuarioNowMs();
    currentUserPromise = (async () => {
      try {
        prontuarioPerfLog('current_user_start');
        currentUser = await authApi.currentUser?.();
        prontuarioPerfLog('current_user_done', started, { source: 'auth' });
        return currentUser;
      } catch (err) {
        console.warn('[PRONTUARIO] nao foi possivel carregar usuario atual', err);
        currentUser = null;
        prontuarioPerfLog('current_user_error', started);
        return null;
      } finally {
        currentUserPromise = null;
      }
    })();
    return currentUserPromise;
  };

  const renderServiceDrawerProcedureOptions = () => {
    if (!serviceDrawerName) return;
    const options = allProcedures
      .slice()
      .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || '')))
      .map((proc) => {
        const nome = String(proc.nome || 'Procedimento').replace(/"/g, '&quot;');
        const codigo = String(proc.codigo || '').replace(/"/g, '&quot;');
        const preco = Number(proc.preco || 0) || 0;
        return `<option value="${nome}" data-code="${codigo}" data-price="${preco}">${nome}</option>`;
      })
      .join('');
    serviceDrawerName.innerHTML = `<option value="">Selecione o procedimento</option>${options}`;
  };

  const updateServiceDrawerProcedureMeta = () => {
    const selectedName = (serviceDrawerName?.value || '').trim();
    const match = allProcedures.find((proc) => proc.nome === selectedName || proc.codigo === selectedName);
    if (serviceDrawerProcCode) {
      serviceDrawerProcCode.textContent = `Codigo: ${match?.codigo || '-'}`;
    }
    if (match && serviceDrawerValue) {
      serviceDrawerValue.value = (Number(match.preco || 0) || 0).toFixed(2).replace('.', ',');
    }
  };

  const loadProcedures = async (force = false) => {
    const TTL_MS = 60 * 1000;
    const stillFresh = !force && allProcedures.length && (Date.now() - proceduresCatalogLoadedAt < TTL_MS);
    if (stillFresh) {
      renderServiceDrawerProcedureOptions();
      return allProcedures;
    }
    if (proceduresCatalogLoading && !force) return proceduresCatalogLoading;

    const fetchCatalog = async () => {
      try {
        let procedures = [];
        if (proceduresCatalogApi?.list) {
          try {
            procedures = await proceduresCatalogApi.list();
          } catch (err) {
            // Fallback esperado para perfis sem permissao no modulo de cadastro.
            procedures = [];
          }
        }
        if ((!Array.isArray(procedures) || !procedures.length) && loadProceduresApi) {
          procedures = await loadProceduresApi();
        }
        allProcedures = (Array.isArray(procedures) ? procedures : []).map((p) => ({
          codigo: String(p.codigo || p.id || ''),
          nome: (p.nome || 'Procedimento sem nome').replace(/\s+/g, ' ').trim(),
          preco: parseFloat(p.preco || 0),
        }));
        proceduresCatalogLoadedAt = Date.now();
        renderServiceDrawerProcedureOptions();
        updateServiceDrawerProcedureMeta();
        return allProcedures;
      } catch (err) {
        console.warn('[PRONTUARIO] procedimentos nao carregados', err);
        renderServiceDrawerProcedureOptions();
        return [];
      } finally {
        proceduresCatalogLoading = null;
      }
    };

    proceduresCatalogLoading = fetchCatalog();
    return proceduresCatalogLoading;
  };

  const updateDrawerDentesUI = () => {
    const label = dentesSelecionadosIframe.length ? dentesSelecionadosIframe.join(', ') : '';
    if (serviceDrawerDentes) serviceDrawerDentes.value = label;
    if (serviceDrawerHelp) serviceDrawerHelp.style.display = label ? 'none' : 'block';
    if (serviceDrawerDentesSelect) {
      Array.from(serviceDrawerDentesSelect.options || []).forEach((opt) => {
        if (!opt.value) return;
        opt.disabled = dentesSelecionadosIframe.includes(opt.value);
      });
      if (serviceDrawerDentesSelect.value && dentesSelecionadosIframe.includes(serviceDrawerDentesSelect.value)) {
        serviceDrawerDentesSelect.value = '';
      }
    }
  };

  const getDrawerSelectableTeeth = () => ([
    '18','17','16','15','14','13','12','11',
    '21','22','23','24','25','26','27','28',
    '48','47','46','45','44','43','42','41',
    '31','32','33','34','35','36','37','38',
    '55','54','53','52','51',
    '61','62','63','64','65',
    '85','84','83','82','81',
    '71','72','73','74','75',
  ]);

  const renderDrawerTeethSelectOptions = () => {
    if (!serviceDrawerDentesSelect) return;
    const current = serviceDrawerDentesSelect.value || '';
    const options = getDrawerSelectableTeeth()
      .map((tooth) => `<option value="${tooth}">${tooth}</option>`)
      .join('');
    serviceDrawerDentesSelect.innerHTML = `<option value="">Selecionar dente...</option>${options}`;
    serviceDrawerDentesSelect.value = current;
    updateDrawerDentesUI();
  };

  const openServiceDrawer = async () => {
    if (!serviceDrawer) return;
    serviceDrawer.classList.add('open');
    serviceDrawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    updateDrawerDentesUI();
    updateResumoFacesUI();
    if (serviceDrawerName && !allProcedures.length) {
      serviceDrawerName.innerHTML = '<option value="">Carregando procedimentos...</option>';
    }
    renderDrawerTeethSelectOptions();
    await loadProcedures(true);
    serviceDrawerName?.focus();
  };

  const closeServiceDrawer = () => {
    if (!serviceDrawer) return;
    serviceDrawer.classList.remove('open');
    serviceDrawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  };

  const updateDrawerFacesUI = (faces) => {
    serviceDrawerFaceChips.forEach((chip) => {
      chip.classList.toggle('active', faces.includes(chip.dataset.face));
    });
  };

  const updateResumoFacesUI = () => {
    const faces = resumoDenteAtual ? (facesPorDente[resumoDenteAtual] || []) : [];
    const label = faces.length === faceOrder.length ? 'Completo' : (faces.length ? faces.join('') : '-');
    if (resumoFaces) resumoFaces.textContent = label;
    resumoFaceChips.forEach((chip) => {
      chip.classList.toggle('active', faces.includes(chip.dataset.face));
    });
    updateDrawerFacesUI(faces);
  };

  const sendFacesToIframe = () => {
    if (!odontogramaFrame?.contentWindow || !resumoDenteAtual) return;
    const faces = facesPorDente[resumoDenteAtual] || [];
    odontogramaFrame.contentWindow.postMessage({
      type: 'odontograma:set-faces',
      dente: resumoDenteAtual,
      faces,
    }, '*');
  };

  const sendDrawerTeethToIframe = () => {
    if (!odontogramaFrame?.contentWindow) return;
    odontogramaFrame.contentWindow.postMessage({
      type: 'odontograma:set-dentes',
      dentes: dentesSelecionadosIframe.slice(),
      lastDente: dentesSelecionadosIframe.length ? dentesSelecionadosIframe[dentesSelecionadosIframe.length - 1] : '',
    }, '*');
  };

  const toggleFace = (face) => {
    if (!resumoDenteAtual) return false;
    const faces = new Set(facesPorDente[resumoDenteAtual] || []);
    if (faces.has(face)) {
      faces.delete(face);
    } else {
      faces.add(face);
    }
    facesPorDente[resumoDenteAtual] = Array.from(faces);
    updateResumoFacesUI();
    sendFacesToIframe();
    return true;
  };

  serviceDrawerFaceChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const face = chip.dataset.face;
      if (!face) return;
      if (!toggleFace(face)) {
        alert('Selecione um dente no odontograma.');
      }
    });
  });

  resumoFaceChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const face = chip.dataset.face;
      if (!face) return;
      toggleFace(face);
    });
  });

  serviceDrawerForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!currentPatient?.prontuario) {
      alert('Paciente nao encontrado.');
      return;
    }
    const nameValue = (serviceDrawerName?.value || '').trim();
    if (!nameValue) {
      alert('Selecione um procedimento.');
      return;
    }
    const selectedProcedure = allProcedures.find((proc) => proc.nome === nameValue || proc.codigo === nameValue);
    if (!selectedProcedure) {
      alert('Selecione um procedimento valido da lista.');
      serviceDrawerName?.focus();
      return;
    }    const valorRaw = (serviceDrawerValue?.value || '')
      .replace(/[^0-9,.-]/g, '')
      .replace('.', '')
      .replace(',', '.');
    const valor = parseFloat(valorRaw) || 0;
    const obs = (serviceDrawerObs?.value || '').trim();
    const faces = resumoDenteAtual ? (facesPorDente[resumoDenteAtual] || []) : [];

    const service = {
      tipo: selectedProcedure.nome || nameValue,
      nome: selectedProcedure.nome || nameValue,
      codigo: selectedProcedure.codigo || '',
      valor,
      dentes: dentesSelecionadosIframe.slice(),
      faces,
      denteFaces: resumoDenteAtual || '',
      observacoes: obs,
    };

    try {
      const result = await servicesApi.addToPatient?.({ prontuario: currentPatient.prontuario, service });
      closeServiceDrawer();
      if (serviceDrawerForm) serviceDrawerForm.reset();
      if (result?.financeWarning) {
        buildProcedureToast('Procedimento salvo, mas houve falha ao sincronizar no Financeiro.', true);
      }
      await refreshProcedimentos();
    } catch (err) {
      console.warn('[PRONTUARIO] falha ao salvar procedimento', err);
      alert(err?.message || 'Nao foi possivel salvar o procedimento.');
    }
  });

  serviceDrawerName?.addEventListener('change', updateServiceDrawerProcedureMeta);
  serviceDrawerName?.addEventListener('input', updateServiceDrawerProcedureMeta);
  serviceDrawer?.addEventListener('keydown', (event) => {
    if (event.key !== 'Backspace') return;
    if (!serviceDrawer.classList.contains('open')) return;
    const target = event.target;
    const tag = String(target?.tagName || '').toUpperCase();
    const isTypingField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (isTypingField) return;
    if (!dentesSelecionadosIframe.length) return;
    event.preventDefault();
    dentesSelecionadosIframe = dentesSelecionadosIframe.slice(0, -1);
    updateDrawerDentesUI();
    sendDrawerTeethToIframe();
  });

  window.addEventListener('message', (event) => {
    if (!event || !event.data || event.data.type !== 'odontograma:update') return;
    const payload = event.data.payload || {};
    const resumo = Array.isArray(payload.resumo) ? payload.resumo : [];
    const dentes = Array.isArray(payload.dentes) ? payload.dentes : [];
    const lastDente = payload.lastDente || '';
    const lastFacesArr = Array.isArray(payload.lastFaces) ? payload.lastFaces : [];

    dentesSelecionadosIframe = dentes;
    updateDrawerDentesUI();

    if (resumoDentes) resumoDentes.textContent = resumo.length ? resumo.join(', ') : 'Nenhum';
    if (resumoDente) resumoDente.textContent = lastDente || '-';

    if (lastDente) {
      resumoDenteAtual = lastDente;
      facesPorDente[lastDente] = lastFacesArr;
      if (!suppressDrawerOpen && serviceDrawer && !serviceDrawer.classList.contains('open')) {
        openServiceDrawer();
      }
    } else {
      resumoDenteAtual = '';
    }
    updateResumoFacesUI();
  });


  odontogramaFrame?.addEventListener('load', () => {
    if (!pendingOdontogramaServices) return;
    const queued = pendingOdontogramaServices;
    pendingOdontogramaServices = null;
    applyOdontogramaSelections(queued);
  });
  const ACTIVE_PRONTUARIO_CONTEXT_KEY = 'activeProntuarioPatient';
  const AGENDA_PREFILL_PATIENT_KEY = 'agendaPrefillPatient';
  const LEGACY_PRONTUARIO_STORAGE_KEYS = ['prontuarioPatient', 'editingPatient', 'servicePatient', 'documentsPatient'];

  const getClinicStorageKey = (baseKey) => {
    const clinicId = String(currentUser?.clinicId || '').trim();
    return clinicId ? `${baseKey}:${clinicId}` : `${baseKey}:global`;
  };

  const getClinicStorageCandidates = (baseKey) => {
    const clinicKey = getClinicStorageKey(baseKey);
    return clinicKey === baseKey ? [baseKey] : [clinicKey, baseKey];
  };

  const readStoredPatientCandidate = (key, source) => {
    const storage = source === 'session' ? sessionStorage : localStorage;
    const raw = storage.getItem(key);
    if (!raw) return null;
    try {
      const patient = JSON.parse(raw);
      const activeClinicId = String(currentUser?.clinicId || '').trim();
      const patientClinicId = String(patient?.clinicId || patient?.clinicaId || '').trim();
      if (activeClinicId && patientClinicId && patientClinicId !== activeClinicId) {
        console.warn('[PRONTUARIO] stale_storage_context_detected=true', {
          clinicId: activeClinicId,
          patientId: patient?.id || patient?.prontuario || '',
          storageKey: key,
          patientClinicId,
        });
        storage.removeItem(key);
        console.info('[PRONTUARIO] prontuario_storage_key_cleared', { key, clinicId: activeClinicId, reason: 'clinic_mismatch' });
        return null;
      }
      return patient;
    } catch (err) {
      console.warn('[PRONTUARIO] stale_storage_context_detected=true', {
        clinicId: String(currentUser?.clinicId || '').trim(),
        storageKey: key,
        reason: 'invalid_json',
        error: err?.message || err,
      });
      storage.removeItem(key);
      console.info('[PRONTUARIO] prontuario_storage_key_cleared', { key, clinicId: String(currentUser?.clinicId || '').trim(), reason: 'invalid_json' });
      return null;
    }
  };

  const persistActiveProntuarioContext = (patient, source) => {
    if (!patient) return;
    try {
      sessionStorage.setItem(ACTIVE_PRONTUARIO_CONTEXT_KEY, JSON.stringify(patient));
      console.info('[PRONTUARIO] prontuario_context_source=' + source, {
        clinicId: String(currentUser?.clinicId || patient?.clinicId || patient?.clinicaId || '').trim(),
        patientId: patient?.id || patient?.prontuario || '',
      });
    } catch (_) {}
  };

  const resolvePatientFromStorage = () => {
    for (const baseKey of LEGACY_PRONTUARIO_STORAGE_KEYS) {
      for (const key of getClinicStorageCandidates(baseKey)) {
        const patient = readStoredPatientCandidate(key, 'local');
        if (!patient) continue;
        localStorage.removeItem(key);
        console.info('[PRONTUARIO] prontuario_storage_key_cleared', {
          key,
          clinicId: String(currentUser?.clinicId || patient?.clinicId || patient?.clinicaId || '').trim(),
        });
        persistActiveProntuarioContext(patient, 'storage');
        return { patient, key, source: 'storage' };
      }
    }

    const activeSessionPatient = readStoredPatientCandidate(ACTIVE_PRONTUARIO_CONTEXT_KEY, 'session');
    if (activeSessionPatient) {
      return { patient: activeSessionPatient, key: ACTIVE_PRONTUARIO_CONTEXT_KEY, source: 'session' };
    }
    return null;
  };


  const normalizeEstado = (status) => {
    const key = String(status || '').toLowerCase();
    if (['realizado', 'feito', 'concluido', 'conclu?do'].includes(key)) return 'realizado';
    if (['pre-existente', 'preexistente', 'pr?-existente', 'pre existente'].includes(key)) return 'pre-existente';
    return 'a-realizar';
  };

  const statusLabel = (status) => {
    const key = normalizeEstado(status);
    if (key === 'realizado') return 'Realizado';
    if (key === 'pre-existente') return 'Pre-existente';
    return 'A realizar';
  };

  const statusClass = (status) => {
    const key = normalizeEstado(status);
    if (key === 'realizado') return 'done';
    if (key === 'pre-existente') return 'pre';
    return 'pending';
  };
  const extractProcedureNameFromDescription = (value) => {
    let text = String(value || '').trim();
    if (!text) return '';
    text = text.replace(/^\[procedimento\]\s*/i, '').trim();
    text = text.replace(/^procedimento:\s*/i, '').trim();
    return text;
  };
  const resolveServiceDisplayName = (service = {}) => {
    const financeiro = service?.financeiro || {};
    return String(
      service?.tipo
      || service?.nome
      || service?.procedimento
      || service?.name
      || service?.procedureName
      || service?.serviceLabel
      || service?.serviceName
      || financeiro?.procedureName
      || financeiro?.serviceLabel
      || extractProcedureNameFromDescription(financeiro?.description)
      || ''
    ).trim();
  };
  const resolveFinanceProcedureLabel = (entry = {}) => {
    const metadata = entry?.metadata && typeof entry.metadata === 'object' ? entry.metadata : {};
    return String(
      entry?.procedimento
      || entry?.procedureName
      || entry?.serviceLabel
      || entry?.serviceName
      || metadata?.procedureName
      || metadata?.serviceLabel
      || extractProcedureNameFromDescription(entry?.descricao || entry?.description || metadata?.description)
      || ''
    ).trim();
  };
  const resolveFinanceDescription = (entry = {}) => {
    const metadata = entry?.metadata && typeof entry.metadata === 'object' ? entry.metadata : {};
    const description = String(entry?.descricao || entry?.description || metadata?.description || '').trim();
    if (description) return description;
    const label = resolveFinanceProcedureLabel(entry);
    return label ? `Procedimento: ${label}` : '';
  };
  const getServicePaymentStatusUpper = (service = {}) => {
    const financeiro = service?.financeiro || {};
    return normalizePaymentStatusUpper(financeiro.paymentStatus || service.paymentStatus || 'PENDING');
  };
  const deriveServiceWorkflowStatus = (service = {}) => {
    const procStatus = normalizeEstado(service.status || service.estado || service.situacao);
    const payStatus = getServicePaymentStatusUpper(service);
    if (procStatus === 'pre-existente') {
      return { key: 'pre', label: 'Pre-existente' };
    }
    if (procStatus === 'realizado' && payStatus === 'PAID') {
      return { key: 'pago', label: 'Pago / Realizado' };
    }
    if (procStatus === 'realizado' && payStatus === 'PENDING') {
      return { key: 'realizado', label: 'Realizado / Ag. pagamento' };
    }
    if (payStatus === 'PAID') {
      return { key: 'pago', label: 'Pago / A realizar' };
    }
    if (payStatus === 'CANCELLED') {
      return { key: 'cancelado', label: 'Cancelado' };
    }
    return { key: 'pendente', label: 'A realizar / Ag. pagamento' };
  };
  const workflowChipClass = (workflowKey) => {
    const key = String(workflowKey || '').toLowerCase();
    if (key === 'realizado') return 'workflow-realizado';
    if (key === 'pago') return 'workflow-pago';
    if (key === 'cancelado') return 'workflow-cancelado';
    if (key === 'pre') return 'workflow-pre';
    return 'workflow-pendente';
  };
  const workflowSelectClass = (workflowValue) => {
    const key = String(workflowValue || '').toUpperCase();
    if (key === 'PAGO') return 'state-pago';
    if (key === 'PAGO_A_REALIZAR') return 'state-pago-a-realizar';
    if (key === 'REALIZADO_AG_PAGAMENTO') return 'state-realizado-ag-pagamento';
    return 'state-ag-pagamento';
  };
  const deriveServiceWorkflowOptionValue = (service = {}) => {
    const procStatus = normalizeEstado(service.status || service.estado || service.situacao);
    const payStatus = getServicePaymentStatusUpper(service);
    if (procStatus === 'realizado' && payStatus === 'PAID') return 'PAGO';
    if (procStatus === 'realizado' && payStatus === 'PENDING') return 'REALIZADO_AG_PAGAMENTO';
    if (payStatus === 'PAID') return 'PAGO_A_REALIZAR';
    return 'AG_PAGAMENTO';
  };
  const applyProcedureRowWorkflowStatus = async (serviceId, nextValue) => {
    const service = findServiceById(serviceId);
    if (!service || !currentPatient?.prontuario) return;
    const option = String(nextValue || '').toUpperCase();
    const baseFinanceiro = service.financeiro || {};
    let financeEntryId = baseFinanceiro.financeEntryId || service.financeiroId || '';
    const currentMethod = normalizePaymentMethodUpper(baseFinanceiro.paymentMethod || service.paymentMethod || service.metodoPagamento || 'PIX');
    const procedureName = resolveServiceDisplayName(service) || 'Procedimento';
    const servicePatch = {
      financeiro: {
        ...baseFinanceiro,
        procedureName,
        serviceLabel: procedureName,
        description: String(baseFinanceiro.description || `Procedimento: ${procedureName}`).trim(),
        paymentMethod: currentMethod,
      },
    };

    if (option === 'AG_PAGAMENTO') {
      servicePatch.status = 'a-realizar';
      servicePatch.dataRealizacao = null;
      servicePatch.statusFinanceiroProcedimento = 'rascunho';
      servicePatch.paymentStatus = 'PENDING';
      servicePatch.financeiro.paymentStatus = 'PENDING';
      servicePatch.financeiro.paidAt = null;
    } else if (option === 'PAGO_A_REALIZAR') {
      servicePatch.status = 'a-realizar';
      servicePatch.dataRealizacao = null;
      servicePatch.statusFinanceiroProcedimento = 'rascunho';
      servicePatch.paymentStatus = 'PAID';
      servicePatch.financeiro.paymentStatus = 'PAID';
      servicePatch.financeiro.paidAt = baseFinanceiro.paidAt || nowIso();
    } else if (option === 'PAGO') {
      servicePatch.status = 'realizado';
      servicePatch.dataRealizacao = service.dataRealizacao || service.finishedAt || service.finalizadoEm || nowIso();
      servicePatch.statusFinanceiroProcedimento = 'finalizado';
      servicePatch.paymentStatus = 'PAID';
      servicePatch.financeiro.paymentStatus = 'PAID';
      servicePatch.financeiro.paidAt = baseFinanceiro.paidAt || nowIso();
    } else if (option === 'REALIZADO_AG_PAGAMENTO') {
      servicePatch.status = 'realizado';
      servicePatch.dataRealizacao = service.dataRealizacao || service.finishedAt || service.finalizadoEm || nowIso();
      servicePatch.statusFinanceiroProcedimento = 'finalizado';
      servicePatch.paymentStatus = 'PENDING';
      servicePatch.financeiro.paymentStatus = 'PENDING';
      servicePatch.financeiro.paidAt = null;
    } else {
      return;
    }

    try {
      const updateResult = await servicesApi.update?.({
        prontuario: currentPatient.prontuario,
        service: {
          id: serviceId,
          ...servicePatch,
        },
      });

      const savedService = updateResult?.service || findServiceById(serviceId) || service;
      financeEntryId = updateResult?.financeId || savedService?.financeiroId || savedService?.financeiro?.financeEntryId || financeEntryId;

      emitFinanceUpdated();
      await refreshProcedimentos();
      await refreshPatientFinance();
      buildProcedureToast('Status do procedimento atualizado.');
    } catch (err) {
      console.warn('[PRONTUARIO] falha ao atualizar estado da linha do procedimento', err);
      buildProcedureToast('Nao foi possivel atualizar o status.', true);
      await refreshProcedimentos();
    }
  };

  const formatDentes = (dentes) => {
    if (!dentes || !Array.isArray(dentes) || dentes.length === 0) return '-';
    return dentes.join(', ');
  };

  const formatCurrency = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const getServiceAmount = (service = {}) => {
    const amount = Number(
      service.valorCobrado !== undefined
        ? service.valorCobrado
        : (service.valor !== undefined ? service.valor : service.value)
    );
    return Number.isFinite(amount) ? amount : 0;
  };
  const formatDateBr = (value) => {
    if (!value) return '-';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return String(value);
    return dt.toLocaleDateString('pt-BR');
  };
  const normalizePaymentStatusUpper = (value) => {
    const raw = String(value || '').toUpperCase().trim();
    if (raw === 'PENDING' || raw === 'PENDENTE' || raw === 'OPEN' || raw === 'PARTIAL') return 'PENDING';
    if (raw === 'CANCELLED' || raw === 'CANCELED' || raw === 'CANCELADO') return 'CANCELLED';
    if (raw === 'PAID' || raw === 'PAGO') return 'PAID';
    return 'PENDING';
  };
  const normalizePaymentMethodUpper = (value) => {
    const raw = String(value || '').toUpperCase().trim();
    if (['PIX', 'CREDIT', 'DEBIT', 'CASH', 'BOLETO', 'TRANSFER', 'OTHER'].includes(raw)) return raw;
    if (raw === 'CARTAO_CREDITO' || raw === 'CREDITO') return 'CREDIT';
    if (raw === 'CARTAO_DEBITO' || raw === 'DEBITO') return 'DEBIT';
    if (raw === 'CARD' || raw === 'CARTAO') return 'CREDIT';
    if (raw === 'DINHEIRO') return 'CASH';
    if (raw === 'TRANSFERENCIA') return 'TRANSFER';
    if (raw === 'OUTRO') return 'OTHER';
    if (raw === 'CARTAO_CREDITO' || raw === 'CARTAO_DEBITO') return raw === 'CARTAO_CREDITO' ? 'CREDIT' : 'DEBIT';
    if (raw === 'PIX') return 'PIX';
    return 'PIX';
  };
  const paymentStatusLabel = (value) => {
    const key = normalizePaymentStatusUpper(value);
    if (key === 'PENDING') return 'Pendente';
    if (key === 'CANCELLED') return 'Cancelado';
    return 'Pago';
  };
  const paymentMethodToFinance = (value) => {
    const key = normalizePaymentMethodUpper(value);
    const map = {
      PIX: 'pix',
      CREDIT: 'cartao_credito',
      DEBIT: 'cartao_debito',
      CASH: 'dinheiro',
      BOLETO: 'boleto',
      TRANSFER: 'transferencia',
      OTHER: 'outro',
    };
    return map[key] || 'pix';
  };
  const paymentMethodLabel = (value) => {
    const key = normalizePaymentMethodUpper(value);
    const map = {
      PIX: 'Pix',
      CREDIT: 'Cartao credito',
      DEBIT: 'Cartao debito',
      CASH: 'Dinheiro',
      BOLETO: 'Boleto',
      TRANSFER: 'Transferencia',
      OTHER: 'Outro',
    };
    return map[key] || 'Pix';
  };
  const patientFinanceMethodSupportsInstallments = (value) => {
    const key = normalizePaymentMethodUpper(value || 'OTHER');
    return key === 'CREDIT' || key === 'BOLETO' || key === 'OTHER';
  };
  const getPatientFinanceInstallmentsLabel = (item = {}) => {
    const method = normalizePaymentMethodUpper(item.paymentMethod || item.metodoPagamento || 'OTHER');
    const installments = Math.max(1, Number(item.installments || 0) || 1);
    if (method === 'CREDIT') return installments > 1 ? `${installments}x no credito` : 'Credito a vista';
    if (method === 'BOLETO') return installments > 1 ? `${installments} boletos` : '1 boleto';
    if (method === 'OTHER') return installments > 1 ? `${installments} parcelas` : 'Pagamento unico';
    return '';
  };
  const getPatientFinanceInstallmentsOptions = (selectedValue = 1) => {
    const selected = Math.max(1, Number(selectedValue || 1) || 1);
    const values = [1, 2, 3, 4, 5, 6, 8, 10, 12];
    return values.map((n) => `<option value="${n}"${n === selected ? ' selected' : ''}>${n}x</option>`).join('');
  };
  const formatDateTimeBr = (value) => {
    if (!value) return '-';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return String(value);
    return dt.toLocaleString('pt-BR');
  };
  const formatTempoMinutos = (value) => {
    const minutes = Math.max(0, Math.floor(Number(value) || 0));
    if (!minutes) return '-';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h > 0 && m > 0) return `${h}h ${m}min`;
    if (h > 0) return `${h}h`;
    return `${m}min`;
  };
  const formatFacesLabel = (faces) => {
    const list = Array.isArray(faces)
      ? faces
      : String(faces || '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
    if (!list.length) return '-';
    return list.join(', ');
  };
  const getPaymentMethodSelectOptions = (selectedValue) => {
    const selected = normalizePaymentMethodUpper(selectedValue || 'PIX');
    const options = [
      { value: 'PIX', label: 'Pix' },
      { value: 'CREDIT', label: 'Cartao credito' },
      { value: 'DEBIT', label: 'Cartao debito' },
      { value: 'CASH', label: 'Dinheiro' },
      { value: 'BOLETO', label: 'Boleto' },
      { value: 'TRANSFER', label: 'Transferencia' },
      { value: 'OTHER', label: 'Outro' },
    ];
    return options
      .map((option) => `<option value="${option.value}"${option.value === selected ? ' selected' : ''}>${option.label}</option>`)
      .join('');
  };
  const normalizeFinanceStatusLower = (value) => {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    if (raw === 'paid' || raw === 'pago' || raw === 'received' || raw === 'recebido') return 'pago';
    if (raw === 'open' || raw === 'pending' || raw === 'pendente') return 'pendente';
    if (raw === 'partial' || raw === 'parcial') return 'parcial';
    if (raw === 'overdue' || raw === 'atrasado') return 'atrasado';
    if (raw === 'cancelled' || raw === 'canceled' || raw === 'cancelado') return 'cancelado';
    return raw;
  };
  const isPaidFinanceStatus = (value) => normalizeFinanceStatusLower(value) === 'pago';
  const isCancelledFinanceStatus = (value) => normalizeFinanceStatusLower(value) === 'cancelado';
  const isPendingLikeFinanceStatus = (value) => ['pendente', 'parcial', 'atrasado'].includes(normalizeFinanceStatusLower(value));
  const patientFinanceStatusChip = (value) => {
    const key = normalizeFinanceStatusLower(value);
    if (key === 'atrasado') return '<span class="patient-finance-status-chip overdue">Atrasado</span>';
    if (key === 'parcial') return '<span class="patient-finance-status-chip partial">Parcial</span>';
    if (key === 'pendente') return '<span class="patient-finance-status-chip pending">Pendente</span>';
    if (key === 'cancelado') return '<span class="patient-finance-status-chip cancelled">Cancelado</span>';
    return '<span class="patient-finance-status-chip paid">Pago</span>';
  };
  const setPatientPaymentModalStatus = (text = '', type = '') => {
    if (!patientPaymentStatus) return;
    patientPaymentStatus.textContent = text;
    patientPaymentStatus.classList.remove('error', 'success');
    if (type) patientPaymentStatus.classList.add(type);
  };
  const getPatientPaymentMode = () => String(patientPaymentMode?.value || 'single') === 'installment' ? 'installment' : 'single';
  const togglePatientPaymentInstallmentsUi = () => {
    const installmentMode = getPatientPaymentMode() === 'installment';
    patientPaymentInstallmentsWrap?.classList.toggle('hidden', !installmentMode);
    if (patientPaymentInstallments) patientPaymentInstallments.disabled = !installmentMode;
    const buttons = Array.from(patientPaymentModal?.querySelectorAll('[data-action="patient-payment-mode"]') || []);
    buttons.forEach((button) => {
      const active = button.dataset.mode === (installmentMode ? 'installment' : 'single');
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  };
  const setPatientPaymentMode = (mode = 'single') => {
    if (patientPaymentMode) patientPaymentMode.value = mode === 'installment' ? 'installment' : 'single';
    togglePatientPaymentInstallmentsUi();
  };
  const resetPatientPaymentForm = () => {
    patientPaymentForm?.reset();
    editingPatientPaymentId = '';
    if (patientPaymentModalTitle) patientPaymentModalTitle.textContent = 'Adicionar novo pagamento';
    if (patientPaymentMethod) patientPaymentMethod.value = 'OTHER';
    if (patientPaymentValue) patientPaymentValue.value = '';
    if (patientPaymentDueDate) patientPaymentDueDate.value = '';
    if (patientPaymentInstallments) patientPaymentInstallments.value = '2';
    setPatientPaymentMode('single');
    setPatientPaymentModalStatus('');
    patientPaymentSaving = false;
    if (patientPaymentSubmit) {
      patientPaymentSubmit.disabled = false;
      patientPaymentSubmit.textContent = 'Salvar';
    }
  };
  const openPatientPaymentModalForEdit = (row) => {
    if (!patientPaymentModal || !row) return;
    resetPatientPaymentForm();
    editingPatientPaymentId = String(row.id || '');
    if (patientPaymentModalTitle) patientPaymentModalTitle.textContent = 'Editar pagamento';
    if (patientPaymentDescription) patientPaymentDescription.value = resolveFinanceDescription(row) || resolveFinanceProcedureLabel(row) || '';
    if (patientPaymentValue) patientPaymentValue.value = String(Number(row.valor || 0) || '');
    const method = normalizePaymentMethodUpper(row.paymentMethod || row.metodoPagamento || 'OTHER');
    if (patientPaymentMethod) patientPaymentMethod.value = method;
    if (patientPaymentDueDate) patientPaymentDueDate.value = toDateOnlyValue(row.dueDate || row.vencimento || '');
    const installments = Math.max(1, Number(row.installments || 0) || 1);
    if (patientPaymentInstallments) patientPaymentInstallments.value = String(Math.min(12, installments));
    setPatientPaymentMode(installments > 1 ? 'installment' : 'single');
    patientPaymentModal.classList.add('open');
    patientPaymentModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    setTimeout(() => patientPaymentDescription?.focus(), 10);
  };
  const showPatientFinanceDetails = (row) => {
    if (!row) return;
    const metodo = paymentMethodLabel(row.paymentMethod || row.metodoPagamento || 'OTHER');
    const parcelas = getPatientFinanceInstallmentsLabel(row) || '-';
    const status = paymentStatusLabel(row.paymentStatus || row.status || 'PENDING');
    const data = formatDateBr(row.data || '');
    const venc = formatDateBr(row.dueDate || row.vencimento || '');
    const recebido = formatDateTimeBr(row.paidAt || '');
    const origem = row.origem || '-';
    const procedimento = resolveFinanceProcedureLabel(row) || '-';
    const descricao = resolveFinanceDescription(row) || '-';
    alert(
      `Detalhes do pagamento\n\n` +
      `Data: ${data}\n` +
      `Descricao: ${descricao}\n` +
      `Procedimento: ${procedimento}\n` +
      `Valor: ${formatCurrency(row.valor)}\n` +
      `Forma: ${metodo}\n` +
      `Parcelas: ${parcelas}\n` +
      `Status: ${status}\n` +
      `Vencimento: ${venc}\n` +
      `Recebido em: ${recebido}\n` +
      `Origem: ${origem}`
    );
  };
  const openPatientPaymentModal = () => {
    if (!patientPaymentModal || !currentPatient) return;
    resetPatientPaymentForm();
    patientPaymentModal.classList.add('open');
    patientPaymentModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    setTimeout(() => patientPaymentDescription?.focus(), 10);
  };
  const closePatientPaymentModal = () => {
    if (!patientPaymentModal) return;
    patientPaymentModal.classList.remove('open');
    patientPaymentModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    resetPatientPaymentForm();
  };
  const toDateOnlyValue = (value) => {
    if (!value) return '';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return '';
    return dt.toISOString().slice(0, 10);
  };
  const toDateTimeLocalValue = (value) => {
    if (!value) return '';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  };
  const parseDateOnlyInputToIso = (value) => {
    if (!value) return null;
    const dt = new Date(`${value}T00:00:00`);
    if (Number.isNaN(dt.getTime())) return null;
    return dt.toISOString();
  };
  const parseDateTimeLocalToIso = (value) => {
    if (!value) return null;
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return null;
    return dt.toISOString();
  };
  const getSelectedPaymentStatus = () => {
    const checked = procPaymentStatusRadios.find((radio) => radio.checked);
    return normalizePaymentStatusUpper(checked?.value || 'PENDING');
  };
  const paymentMethodSupportsInstallments = (method) => {
    const key = normalizePaymentMethodUpper(method || procPaymentMethod?.value || 'PIX');
    return key === 'CREDIT' || key === 'BOLETO';
  };
  const getSelectedProcedureEditorStatus = () => {
    const checked = procFullStatusRadios.find((radio) => radio.checked);
    return normalizeEstado(checked?.value || 'a-realizar');
  };
  const deriveProcedureQuickStatus = () => {
    const procStatus = getSelectedProcedureEditorStatus();
    const payStatus = getSelectedPaymentStatus();
    if (procStatus === 'pre-existente') return 'CUSTOM';
    if (procStatus === 'realizado') return 'REALIZADO';
    if (payStatus === 'PAID') return 'PAGO';
    return 'PENDENTE';
  };
  const updateProcQuickStatusUi = () => {
    if (!procQuickStatus) return;
    const derived = deriveProcedureQuickStatus();
    procQuickStatusSyncing = true;
    procQuickStatus.value = derived;
    procQuickStatusSyncing = false;
  };
  const updateProcEditorSticky = () => {
    const workflowMap = {
      PENDENTE: 'Pendente',
      PAGO: 'Pago / A realizar',
      REALIZADO: 'Realizado',
      CUSTOM: 'Personalizado',
    };
    const quick = deriveProcedureQuickStatus();
    if (procStickyWorkflow) procStickyWorkflow.textContent = workflowMap[quick] || 'Pendente';
    if (procStickyValor) procStickyValor.textContent = procResumoValor?.textContent || formatCurrency(0);
    if (procStickyCusto) procStickyCusto.textContent = procResumoCusto?.textContent || formatCurrency(0);
    if (procStickyLucro) procStickyLucro.textContent = procResumoLucro?.textContent || formatCurrency(0);
  };
  const toggleProcTimerByStatus = () => {
    const isRealizado = getSelectedProcedureEditorStatus() === 'realizado';
    if (procFinalizeTimerBlock) procFinalizeTimerBlock.classList.toggle('is-disabled', !isRealizado);
    if (procTimerStatusHint) procTimerStatusHint.classList.toggle('hidden', isRealizado);
    if (!procFinalizeTimerBlock) return;
    const controls = procFinalizeTimerBlock.querySelectorAll('button[data-action^="timer-"], #proc-finalize-tempo');
    controls.forEach((el) => {
      if (!el) return;
      el.disabled = !isRealizado;
    });
  };
  const setupProcFinalizeCollapsibles = () => {
    if (procFinalizeSectionsReady || !procFinalizeForm) return;
    const blocks = Array.from(procFinalizeForm.querySelectorAll('.proc-finalize-block[data-collapsible]'));
    blocks.forEach((block, index) => {
      const h4 = block.querySelector('h4');
      if (!h4 || h4.querySelector('.proc-collapsible-toggle')) return;
      block.classList.add('is-expanded');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'proc-collapsible-toggle';
      btn.setAttribute('aria-expanded', 'true');
      btn.textContent = 'Ocultar';
      btn.addEventListener('click', () => {
        const expanded = block.classList.toggle('is-expanded');
        btn.setAttribute('aria-expanded', String(expanded));
        btn.textContent = expanded ? 'Ocultar' : 'Expandir';
      });
      h4.appendChild(btn);
      if (index > 0) {
        // Mantem resumo e dados abertos por padrao; outros podem iniciar fechados no mobile via CSS.
      }
    });
    procFinalizeSectionsReady = true;
  };
  const isPastDate = (yyyyMmDd) => {
    if (!yyyyMmDd) return false;
    const dt = new Date(`${yyyyMmDd}T00:00:00`);
    if (Number.isNaN(dt.getTime())) return false;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return dt < today;
  };
  const togglePaymentDueUi = () => {
    if (!procPaymentDueWrap) return;
    const pending = getSelectedPaymentStatus() === 'PENDING';
    procPaymentDueWrap.classList.toggle('hidden', !pending);
    if (procPaymentInstallmentsWrap) {
      const method = normalizePaymentMethodUpper(procPaymentMethod?.value || 'PIX');
      const showInstallments = paymentMethodSupportsInstallments(method);
      procPaymentInstallmentsWrap.classList.toggle('hidden', !showInstallments);
      if (procPaymentInstallmentsLabel) {
        procPaymentInstallmentsLabel.textContent = method === 'BOLETO'
          ? 'Quantidade de boletos/parcelas'
          : 'Numero de parcelas';
      }
      if (showInstallments && procPaymentInstallments && !procPaymentInstallments.value) {
        procPaymentInstallments.value = '1';
      }
      if (!showInstallments && procPaymentInstallments) {
        procPaymentInstallments.value = '1';
      }
    }
    if (procPaymentPaidAtWrap) {
      const paid = getSelectedPaymentStatus() === 'PAID';
      procPaymentPaidAtWrap.classList.toggle('hidden', !paid);
      if (!paid && procPaymentPaidAt) procPaymentPaidAt.value = '';
    }
  };
  const renderPatientFinance = (rows = [], options = {}) => {
    if (!patientFinanceBody || !patientFinanceEmpty) return;
    const list = Array.isArray(rows) ? rows : [];
    patientFinanceRows = list;
    patientFinanceBody.innerHTML = '';

    if (options.loading) {
      patientFinanceEmpty.innerHTML = buildLoadingStateHtml(
        'Carregando financeiro do paciente...',
        'Buscando valores, parcelas e formas de pagamento da clínica.',
        4
      );
      patientFinanceEmpty.classList.add('show');
      updateFinanceMetrics([], { loading: true });
      return;
    }

    if (options.error) {
      patientFinanceEmpty.innerHTML = `
        <div class="voithos-loading-panel" role="alert">
          <p class="empty-state-title">Nao foi possivel carregar o financeiro</p>
          <p class="empty-state-subtitle">${options.error}</p>
        </div>
      `;
      patientFinanceEmpty.classList.add('show');
      updateFinanceMetrics([], { loading: false });
      return;
    }

    const visibleRows = list
      .filter((item) => !isCancelledFinanceStatus(item.paymentStatus || item.status));
    const totalPaid = visibleRows
      .reduce((acc, item) => acc + (Number(item.paidAmount) || (isPaidFinanceStatus(item.paymentStatus || item.status) ? Number(item.valor) || 0 : 0)), 0);
    const totalPending = visibleRows
      .reduce((acc, item) => acc + (Number(item.remainingAmount) || (isPendingLikeFinanceStatus(item.paymentStatus || item.status) ? Number(item.valor) || 0 : 0)), 0);
    const totalOverdue = visibleRows
      .filter((item) => normalizeFinanceStatusLower(item.paymentStatus || item.status) === 'atrasado'
        || (isPendingLikeFinanceStatus(item.paymentStatus || item.status) && isPastDate(item.vencimento || item.dueDate)))
      .reduce((acc, item) => acc + (Number(item.remainingAmount) || Number(item.valor) || 0), 0);

    if (patientFinanceTotalPaid) patientFinanceTotalPaid.textContent = formatCurrency(totalPaid);
    if (patientFinanceTotalPending) patientFinanceTotalPending.textContent = formatCurrency(totalPending);
    if (patientFinanceTotalOverdue) patientFinanceTotalOverdue.textContent = formatCurrency(totalOverdue);

    if (!list.length) {
      patientFinanceEmpty.innerHTML = `
        <div class="empty-state">
          <p class="empty-state-title">Nenhum lancamento financeiro encontrado</p>
          <p class="empty-state-subtitle">O paciente ainda nao possui valores vinculados neste prontuario.</p>
        </div>
      `;
      patientFinanceEmpty.classList.add('show');
      return;
    }
    patientFinanceEmpty.classList.remove('show');
    patientFinanceEmpty.innerHTML = '';

    list.forEach((item) => {
      const statusRaw = normalizeFinanceStatusLower(item.paymentStatus || item.status);
      const method = normalizePaymentMethodUpper(item.paymentMethod || item.metodoPagamento || 'PIX');
      const canConfirm = isPendingLikeFinanceStatus(statusRaw);
      const dueDate = item.dueDate || item.vencimento || '';
      const procedureLabel = resolveFinanceProcedureLabel(item);
      const installmentsHelp = getPatientFinanceInstallmentsLabel(item);
      const supportsInstallments = patientFinanceMethodSupportsInstallments(method);
      const installmentsValue = Math.max(1, Number(item.installments || 0) || 1);
      const row = document.createElement('div');
      row.className = 'procedimentos-row';
      row.innerHTML = `
        <span>${formatDateBr(dueDate || item.data)}</span>
        <span>${procedureLabel || resolveFinanceDescription(item) || '-'}</span>
        <span>${formatCurrency(item.valor)}</span>
        <span class="patient-finance-method">
          <select class="patient-finance-method-select" data-finance-id="${item.id}" aria-label="Forma de pagamento">
            ${getPaymentMethodSelectOptions(method)}
          </select>
          ${supportsInstallments
            ? `
              <div class="patient-finance-method-inline">
                <select class="patient-finance-installments-select" data-finance-id="${item.id}" aria-label="Parcelas">
                  ${getPatientFinanceInstallmentsOptions(installmentsValue)}
                </select>
                <small class="patient-finance-method-meta">${installmentsHelp || '-'}</small>
              </div>
            `
            : (installmentsHelp ? `<small class="patient-finance-method-meta">${installmentsHelp}</small>` : '')
          }
        </span>
        <span class="patient-finance-status">${patientFinanceStatusChip(statusRaw)}</span>
        <span class="patient-finance-actions">
          <div class="menu-wrap">
            <button class="menu-trigger" type="button" aria-label="Acoes do pagamento">&#8942;</button>
            <div class="menu">
              ${canConfirm
                ? `<button type="button" data-action="confirm-patient-payment" data-finance-id="${item.id}">Marcar como realizado</button>`
                : `<button type="button" disabled>Pagamento confirmado</button>`
              }
              <button type="button" data-action="patient-payment-details" data-finance-id="${item.id}">Detalhes do pagamento</button>
              <button type="button" data-action="edit-patient-payment" data-finance-id="${item.id}">Editar</button>
              <button type="button" class="danger" data-action="delete-patient-payment" data-finance-id="${item.id}">Excluir</button>
            </div>
          </div>
        </span>
      `;
      patientFinanceBody.appendChild(row);
    });
  };

  const refreshPatientFinance = async () => {
    if (!financeApi.listByPatient || !currentPatient) {
      renderPatientFinance([], {
        error: 'Nao ha paciente selecionado para carregar o financeiro.',
      });
      return;
    }
    const patientKey = getCurrentPatientKey();
    const requestKey = `${String(currentUser?.clinicId || '')}:${patientKey}`;
    if (patientFinancePromise && patientFinancePromiseKey === requestKey) return patientFinancePromise;
    if (patientKey && patientKey !== lastPatientFinanceKey) {
      patientFinanceDataLoading = true;
      renderPatientFinance([], { loading: true });
    }
    const started = prontuarioNowMs();
    prontuarioPerfLog('patient_finance_fetch_start');
    patientFinancePromiseKey = requestKey;
    patientFinancePromise = (async () => {
      try {
        const rows = await financeApi.listByPatient({
          patientId: currentPatient.id || currentPatient._id || '',
          prontuario: currentPatient.prontuario || '',
        });
        lastPatientFinanceKey = patientKey;
        patientFinanceDataLoading = false;
        renderPatientFinance(rows || []);
        updateFinanceMetrics(currentPatient?.servicos || []);
        prontuarioPerfLog('patient_finance_fetch_done', started, { count: Array.isArray(rows) ? rows.length : 0 });
        return rows || [];
      } catch (err) {
        console.warn('[PRONTUARIO] falha ao carregar financeiro do paciente', err);
        patientFinanceDataLoading = false;
        renderPatientFinance([], {
          error: err?.message || 'Nao foi possivel carregar o financeiro do paciente.',
        });
        updateFinanceMetrics(currentPatient?.servicos || []);
        prontuarioPerfLog('patient_finance_fetch_error', started);
        return [];
      } finally {
        patientFinancePromise = null;
        patientFinancePromiseKey = '';
      }
    })();
    return patientFinancePromise;
  };
  const nowIso = () => new Date().toISOString();
  const ensureArray = (value) => (Array.isArray(value) ? value : []);
  const asNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };
  const formatTimer = (seconds) => {
    const total = Math.max(0, Math.floor(asNumber(seconds)));
    const h = String(Math.floor(total / 3600)).padStart(2, '0');
    const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
    const s = String(total % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
  };
  const getServiceTimer = (service = {}) => ({
    startedAt: service?.timer?.startedAt || null,
    isRunning: Boolean(service?.timer?.isRunning),
    accumulatedSeconds: Math.max(0, Math.floor(asNumber(service?.timer?.accumulatedSeconds))),
  });
  const getServiceElapsedSeconds = (service = {}) => {
    const timer = getServiceTimer(service);
    let seconds = timer.accumulatedSeconds;
    if (timer.isRunning && timer.startedAt) {
      const started = new Date(timer.startedAt).getTime();
      if (!Number.isNaN(started)) {
        seconds += Math.max(0, Math.floor((Date.now() - started) / 1000));
      }
    }
    return Math.max(0, seconds);
  };
  const buildProcedureToast = (message, isError = false) => {
    const toast = document.createElement('div');
    toast.className = `anotacao-toast${isError ? ' error' : ''}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 220);
    }, 2200);
  };
  const collectMateriais = () => {
    return Array.from(procMateriaisList?.querySelectorAll('.proc-line') || []).map((row) => {
      const nome = row.querySelector('[data-field="nome"]')?.value || '';
      const categoria = row.querySelector('[data-field="categoria"]')?.value || 'Outros';
      const unidade = row.querySelector('[data-field="unidade"]')?.value || '';
      const quantidade = asNumber(row.querySelector('[data-field="quantidade"]')?.value);
      const custoUnitario = asNumber(row.querySelector('[data-field="custoUnitario"]')?.value);
      const custoTotal = quantidade * custoUnitario;
      return { nome, categoria, unidade, quantidade, custoUnitario, custoTotal };
    });
  };
  const collectOutros = () => {
    return Array.from(procOutrosList?.querySelectorAll('.proc-line') || []).map((row) => ({
      descricao: row.querySelector('[data-field="descricao"]')?.value || '',
      valor: asNumber(row.querySelector('[data-field="valor"]')?.value),
    }));
  };
  const computeFinalizeResumo = () => {
    const valorCobrado = asNumber((procFinalizeValor?.value || '').replace(',', '.'));
    const tempoMinutos = Math.max(0, Math.floor(asNumber(procFinalizeTempo?.value)));
    const materiais = collectMateriais();
    const outros = collectOutros();
    const custoMateriais = materiais.reduce((acc, item) => acc + asNumber(item.custoTotal), 0);
    const custoLab = asNumber(procLabValor?.value);
    const custoOutros = outros.reduce((acc, item) => acc + asNumber(item.valor), 0);
    const custoTotal = custoMateriais + custoLab + custoOutros;
    const lucro = valorCobrado - custoTotal;
    const lucroPorHora = tempoMinutos > 0 ? (lucro / (tempoMinutos / 60)) : 0;
    const paymentStatus = getSelectedPaymentStatus();
    const paymentMethod = normalizePaymentMethodUpper(procPaymentMethod?.value || 'PIX');
    const installments = paymentMethodSupportsInstallments(paymentMethod)
      ? Math.max(1, Number(procPaymentInstallments?.value || 1))
      : null;
    const dueDate = procPaymentDueDate?.value || '';
    if (procResumoValor) procResumoValor.textContent = formatCurrency(valorCobrado);
    if (procResumoCusto) procResumoCusto.textContent = formatCurrency(custoTotal);
    if (procResumoLucro) procResumoLucro.textContent = formatCurrency(lucro);
    if (procResumoLucroHora) procResumoLucroHora.textContent = formatCurrency(lucroPorHora);
    if (procResumoPaymentStatus) procResumoPaymentStatus.textContent = paymentStatusLabel(paymentStatus);
    updateProcEditorSticky();
    return {
      valorCobrado,
      tempoMinutos,
      custos: {
        materiais,
        laboratorio: {
          descricao: procLabDescricao?.value || '',
          valor: custoLab,
        },
        outros,
      },
      custoTotal,
      lucro,
      lucroPorHora,
      financeiro: {
        paymentStatus,
        paymentMethod,
        paidAt: paymentStatus === 'PAID' ? nowIso() : null,
        dueDate: paymentStatus === 'PENDING' ? (dueDate || null) : null,
        installments,
      },
    };
  };
  const collectProcFinalizeEditorFields = (base = {}) => {
    const currentStatus = normalizeEstado(base.status || base.estado || base.situacao);
    const selectedStatus = procFullStatusRadios.find((r) => r.checked)?.value || currentStatus || 'a-realizar';
    const finalizedIso = parseDateOnlyInputToIso(procFullFinishedAt?.value || '');
    const registeredIso = parseDateOnlyInputToIso(procFullRegisteredAt?.value || '');
    const faces = procFullFaces.filter((b) => b.checked).map((b) => b.value);
    const nomeProcedimento = (procFullName?.value || '').trim();
    const financeiroBase = base?.financeiro || {};
    const paymentStatus = getSelectedPaymentStatus();
    const paidAtManual = parseDateTimeLocalToIso(procPaymentPaidAt?.value || '');

    return {
      tipo: nomeProcedimento || base.tipo || base.nome || base.procedimento,
      nome: nomeProcedimento || base.nome || base.tipo || base.procedimento,
      dentes: parseDentesInput(procFullDentes?.value || ''),
      faces,
      dentistaNome: (procFullProfissional?.value || '').trim() || base.dentistaNome || base.dentista || '',
      status: selectedStatus,
      observacoes: (procFullObs?.value || '').trim(),
      gerarFinanceiro: Boolean(procFullGerarFinanceiro?.checked),
      registeredAt: registeredIso || base.registeredAt || base.dataAdicionado || base.createdAt || null,
      dataRealizacao: finalizedIso || (selectedStatus === 'realizado'
        ? (base.dataRealizacao || base.finishedAt || base.finalizadoEm || nowIso())
        : null),
      financeiro: {
        ...financeiroBase,
        paymentStatus,
        paymentMethod: normalizePaymentMethodUpper(procPaymentMethod?.value || financeiroBase.paymentMethod || base.paymentMethod || 'PIX'),
        paidAt: paymentStatus === 'PAID'
          ? (paidAtManual || financeiroBase.paidAt || nowIso())
          : null,
        dueDate: paymentStatus === 'PENDING'
          ? ((procPaymentDueDate?.value || '') || null)
          : null,
      },
    };
  };

  const updateFinanceMetrics = (services = [], options = {}) => {
    if (!financeTotalPrevisto || !financeTotalRecebido || !financeSaldo) return;
    if (options.loading) {
      financeTotalPrevisto.textContent = 'Carregando...';
      financeTotalRecebido.textContent = 'Carregando...';
      financeSaldo.textContent = 'Carregando...';
      return;
    }
    if (Array.isArray(patientFinanceRows) && patientFinanceRows.length) {
      const visibleRows = patientFinanceRows
        .filter((row) => !isCancelledFinanceStatus(row?.paymentStatus || row?.status));
      const totalPrevisto = visibleRows
        .filter((row) => !row?.metadata?.receivedOnly)
        .reduce((acc, row) => acc + (Number(row.valor) || Number(row.totalAmount) || 0), 0);
      const totalRecebido = visibleRows
        .reduce((acc, row) => acc + (Number(row.paidAmount) || (isPaidFinanceStatus(row?.paymentStatus || row?.status) ? Number(row.valor) || 0 : 0)), 0);
      const saldo = visibleRows
        .filter((row) => !row?.metadata?.receivedOnly)
        .reduce((acc, row) => acc + (Number(row.remainingAmount) || (isPendingLikeFinanceStatus(row?.paymentStatus || row?.status) ? Number(row.valor) || 0 : 0)), 0);
      financeTotalPrevisto.textContent = formatCurrency(totalPrevisto);
      financeTotalRecebido.textContent = formatCurrency(totalRecebido);
      financeSaldo.textContent = formatCurrency(saldo);
      return;
    }
    const list = Array.isArray(services) ? services : [];
    const totalPrevisto = list.reduce((sum, svc) => sum + getServiceAmount(svc), 0);
    const totalRecebido = list.reduce((sum, svc) => {
      if (getServicePaymentStatusUpper(svc) === 'PAID') return sum + getServiceAmount(svc);
      return sum;
    }, 0);
    const saldo = Math.max(totalPrevisto - totalRecebido, 0);

    financeTotalPrevisto.textContent = formatCurrency(totalPrevisto);
    financeTotalRecebido.textContent = formatCurrency(totalRecebido);
    financeSaldo.textContent = formatCurrency(saldo);
  };

  const createMaterialLine = (item = {}) => {
    if (!procMateriaisList) return;
    const row = document.createElement('div');
    row.className = 'proc-line';
    row.innerHTML = `
      <input type="text" data-field="nome" placeholder="Nome" value="${item.nome || ''}">
      <select data-field="categoria">
        <option value="EPI">EPI</option>
        <option value="Instrumento">Instrumento</option>
        <option value="Material de consumo">Material de consumo</option>
        <option value="Medicamento">Medicamento</option>
        <option value="Outros">Outros</option>
      </select>
      <input type="text" data-field="unidade" placeholder="Unidade" value="${item.unidade || ''}">
      <input type="number" data-field="quantidade" min="0" step="0.01" placeholder="Qtd" value="${asNumber(item.quantidade) || ''}">
      <input type="number" data-field="custoUnitario" min="0" step="0.01" placeholder="Custo unit." value="${asNumber(item.custoUnitario) || ''}">
      <button class="btn ghost danger" type="button" data-action="remove-line">Remover</button>
    `;
    const categoriaEl = row.querySelector('[data-field="categoria"]');
    if (categoriaEl && item.categoria) categoriaEl.value = item.categoria;
    procMateriaisList.appendChild(row);
  };

  const createOutroCustoLine = (item = {}) => {
    if (!procOutrosList) return;
    const row = document.createElement('div');
    row.className = 'proc-line';
    row.innerHTML = `
      <input type="text" data-field="descricao" placeholder="Descricao" value="${item.descricao || ''}">
      <input type="number" data-field="valor" min="0" step="0.01" placeholder="Valor" value="${asNumber(item.valor) || ''}">
      <button class="btn ghost danger" type="button" data-action="remove-line">Remover</button>
    `;
    procOutrosList.appendChild(row);
  };

  const closeProcFinalizeModal = () => {
    if (!procFinalizeModal) return;
    procFinalizeModal.classList.remove('open');
    procFinalizeModal.setAttribute('aria-hidden', 'true');
    if (procFinalizeForm) procFinalizeForm.reset();
    if (procMateriaisList) procMateriaisList.innerHTML = '';
    if (procOutrosList) procOutrosList.innerHTML = '';
    if (procTimerDisplay) procTimerDisplay.textContent = '00:00:00';
    if (procFullName) procFullName.value = '';
    if (procFullDentes) procFullDentes.value = '';
    if (procFullProfissional) procFullProfissional.value = '';
    if (procFullRegisteredAt) procFullRegisteredAt.value = '';
    if (procFullFinishedAt) procFullFinishedAt.value = '';
    if (procFullObs) procFullObs.value = '';
    if (procFullGerarFinanceiro) procFullGerarFinanceiro.checked = true;
    procFullStatusRadios.forEach((radio) => {
      radio.checked = radio.value === 'a-realizar';
    });
    if (procQuickStatus) procQuickStatus.value = 'PENDENTE';
    procFullFaces.forEach((box) => { box.checked = false; });
    procPaymentStatusRadios.forEach((radio) => {
      radio.checked = radio.value === 'PAID';
    });
    if (procPaymentMethod) procPaymentMethod.value = 'PIX';
    if (procPaymentDueDate) procPaymentDueDate.value = '';
    if (procPaymentInstallments) procPaymentInstallments.value = '1';
    if (procPaymentPaidAt) procPaymentPaidAt.value = '';
    procFinalizeMode = 'finalize';
    if (procFinalizeTitle) procFinalizeTitle.textContent = 'Finalizar procedimento';
    if (procFinalizeSubmit) procFinalizeSubmit.textContent = 'Finalizar procedimento';
    if (procFinalizeDraftBtn) procFinalizeDraftBtn.hidden = false;
    togglePaymentDueUi();
    toggleProcTimerByStatus();
    updateProcEditorSticky();
    document.body.style.overflow = '';
  };

  const openProcFinalizeModal = (service = {}, options = {}) => {
    if (!procFinalizeModal || !service) return;
    setupProcFinalizeCollapsibles();
    procFinalizeMode = options.mode === 'edit' ? 'edit' : 'finalize';
    if (procFinalizeTitle) {
      procFinalizeTitle.textContent = procFinalizeMode === 'edit'
        ? 'Editor completo do procedimento'
        : 'Finalizar procedimento';
    }
    if (procFinalizeSubmit) {
      procFinalizeSubmit.textContent = procFinalizeMode === 'edit'
        ? 'Salvar alteracoes'
        : 'Finalizar procedimento';
    }
    if (procFinalizeDraftBtn) procFinalizeDraftBtn.hidden = procFinalizeMode === 'edit';
    if (procFinalizeId) procFinalizeId.value = service.id || '';
    if (procFullName) procFullName.value = resolveServiceDisplayName(service);
    if (procFullDentes) procFullDentes.value = formatDentes(service.dentes || []).replace(/-/g, '').trim();
    if (procFullProfissional) procFullProfissional.value = service.dentistaNome || service.dentista || '';
    if (procFullRegisteredAt) procFullRegisteredAt.value = toInputDate(service.registeredAt || service.dataAdicionado || service.createdAt);
    if (procFullFinishedAt) procFullFinishedAt.value = toInputDate(service.dataRealizacao || service.finishedAt || service.finalizadoEm);
    if (procFullObs) procFullObs.value = service.observacoes || service.obs || service.observacao || '';
    if (procFullGerarFinanceiro) procFullGerarFinanceiro.checked = service.gerarFinanceiro !== false;
    const currentStatus = normalizeEstado(service.status || service.estado || service.situacao);
    procFullStatusRadios.forEach((radio) => {
      radio.checked = radio.value === currentStatus;
    });
    const faces = Array.isArray(service.faces) ? service.faces : (service.faces || '').toString().split('');
    procFullFaces.forEach((box) => {
      box.checked = faces.includes(box.value);
    });
    if (procFinalizeValor) {
      const val = asNumber(service.valorCobrado !== undefined ? service.valorCobrado : service.valor || service.value);
      procFinalizeValor.value = val ? val.toFixed(2).replace('.', ',') : '';
    }
    const elapsedSeconds = getServiceElapsedSeconds(service);
    if (procTimerDisplay) procTimerDisplay.textContent = formatTimer(elapsedSeconds);
    if (procFinalizeTempo) {
      const tempo = Math.max(0, Math.floor(asNumber(service.tempoMinutos) || (elapsedSeconds / 60)));
      procFinalizeTempo.value = tempo ? String(tempo) : '';
    }
    if (procLabDescricao) procLabDescricao.value = service?.custos?.laboratorio?.descricao || '';
    if (procLabValor) procLabValor.value = asNumber(service?.custos?.laboratorio?.valor) || '';
    const financeiro = service?.financeiro || {};
    const paymentMethod = normalizePaymentMethodUpper(financeiro.paymentMethod || service.paymentMethod || service.metodoPagamento || 'PIX');
    const paymentStatus = normalizePaymentStatusUpper(financeiro.paymentStatus || service.paymentStatus || 'PENDING');
    const dueDate = financeiro.dueDate || service.vencimento || '';
    const installments = Number(financeiro.installments || 0) || 0;
    if (procPaymentMethod) procPaymentMethod.value = paymentMethod;
    procPaymentStatusRadios.forEach((radio) => {
      radio.checked = radio.value === paymentStatus;
    });
    if (procPaymentDueDate) procPaymentDueDate.value = toDateOnlyValue(dueDate);
    if (procPaymentInstallments) procPaymentInstallments.value = String(Math.max(1, installments || 1));
    if (procPaymentPaidAt) procPaymentPaidAt.value = toDateTimeLocalValue(financeiro.paidAt || '');
    togglePaymentDueUi();
    updateProcQuickStatusUi();
    toggleProcTimerByStatus();
    if (procMateriaisList) procMateriaisList.innerHTML = '';
    if (procOutrosList) procOutrosList.innerHTML = '';
    ensureArray(service?.custos?.materiais).forEach(createMaterialLine);
    ensureArray(service?.custos?.outros).forEach(createOutroCustoLine);
    computeFinalizeResumo();
    procFinalizeModal.classList.add('open');
    procFinalizeModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  };

  const saveServicePatch = async (serviceId, patch, toastSuccess = '') => {
    if (!currentPatient?.prontuario || !serviceId) return;
    const result = await servicesApi.update?.({
      prontuario: currentPatient.prontuario,
      service: {
        id: serviceId,
        ...patch,
      },
    });
    await refreshProcedimentos();
    if (toastSuccess) buildProcedureToast(toastSuccess);
    return result;
  };

  const persistRunningTimer = async (serviceId) => {
    const service = findServiceById(serviceId);
    if (!service) return;
    const timer = getServiceTimer(service);
    if (!timer.isRunning) return;
    const elapsed = getServiceElapsedSeconds(service);
    await saveServicePatch(serviceId, {
      timer: {
        startedAt: nowIso(),
        isRunning: true,
        accumulatedSeconds: elapsed,
      },
      updatedAt: nowIso(),
      updatedBy: currentUser?.id || '',
    });
  };

  const stopTrackedTimer = (serviceId) => {
    const refs = timerIntervals.get(serviceId);
    if (!refs) return;
    if (refs.tick) window.clearInterval(refs.tick);
    if (refs.persist) window.clearInterval(refs.persist);
    timerIntervals.delete(serviceId);
  };

  const startTrackedTimer = (serviceId) => {
    stopTrackedTimer(serviceId);
    const tick = window.setInterval(() => {
      const service = findServiceById(serviceId);
      if (!service || !getServiceTimer(service).isRunning) {
        stopTrackedTimer(serviceId);
        return;
      }
      if (procFinalizeModal?.classList.contains('open') && procFinalizeId?.value === serviceId) {
        if (procTimerDisplay) procTimerDisplay.textContent = formatTimer(getServiceElapsedSeconds(service));
      }
      const rowTimer = document.querySelector(`[data-service-timer="${serviceId}"]`);
      if (rowTimer) rowTimer.textContent = formatTimer(getServiceElapsedSeconds(service));
    }, 1000);
    const persist = window.setInterval(() => {
      persistRunningTimer(serviceId).catch(() => {});
    }, 15000);
    timerIntervals.set(serviceId, { tick, persist });
  };

  const syncTrackedTimers = () => {
    // Cronometro removido do fluxo principal: interrompe qualquer timer residual.
    Array.from(timerIntervals.keys()).forEach((id) => stopTrackedTimer(id));
    activeRunningServiceId = '';
    if (timerRunningBanner) timerRunningBanner.classList.add('hidden');
  };

  const renderProcedimentos = (services = [], filter = 'ficha', options = {}) => {
    if (!procedimentosBody || !procedimentosEmpty) return;
    let list = Array.isArray(services) ? [...services] : [];

    if (options.loading) {
      procedimentosBody.innerHTML = '';
      procedimentosEmpty.innerHTML = buildLoadingStateHtml(
        'Carregando procedimentos...',
        'Sincronizando ficha, financeiro e odontograma da clínica.',
        4
      );
      procedimentosEmpty.classList.add('show');
      updateFinanceMetrics([], { loading: true });
      syncTrackedTimers();
      return;
    }

    if (options.error) {
      procedimentosBody.innerHTML = '';
      procedimentosEmpty.innerHTML = `
        <div class="voithos-loading-panel" role="alert">
          <p class="empty-state-title">Nao foi possivel carregar os procedimentos</p>
          <p class="empty-state-subtitle">${options.error}</p>
        </div>
      `;
      procedimentosEmpty.classList.add('show');
      updateFinanceMetrics([], { loading: false });
      syncTrackedTimers();
      return;
    }

    if (filter && filter !== 'ficha') {
      list = list.filter((svc) => {
        const estado = normalizeEstado(svc.status || svc.estado || svc.situacao);
        if (filter === 'a-realizar') return estado === 'a-realizar';
        if (filter === 'realizado') return estado === 'realizado';
        if (filter === 'pre-existente') return estado === 'pre-existente';
        return true;
      });
    }

    if (!list.length) {
      procedimentosBody.innerHTML = '';
      procedimentosEmpty.innerHTML = `
        <div class="empty-state">
          <p class="empty-state-title">Nenhum procedimento encontrado</p>
          <p class="empty-state-subtitle">Ajuste os filtros ou cadastre o primeiro procedimento.</p>
        </div>
      `;
      procedimentosEmpty.classList.add('show');
      updateFinanceMetrics([]);
      syncTrackedTimers();
      return;
    }

    procedimentosEmpty.classList.remove('show');
    updateFinanceMetrics(list);
    procedimentosBody.innerHTML = list.map((svc) => {
      const nome = resolveServiceDisplayName(svc) || 'Procedimento';
      const dentes = formatDentes(svc.dentes);
      const estadoNormalizado = normalizeEstado(svc.status || svc.estado || svc.situacao);
      const workflowValue = deriveServiceWorkflowOptionValue(svc);
      const workflowSelectStateClass = workflowSelectClass(workflowValue);
      const serviceId = svc.id || svc._id || '';
      return `
        <div class="procedimentos-row" data-service-id="${serviceId}">
          <span>${nome}</span>
          <span>${dentes}</span>
          <label class="proc-row-state-wrap">
            <select class="proc-row-state-select ${workflowSelectStateClass}" data-proc-row-state="${serviceId}" data-last-value="${workflowValue}" aria-label="Status do procedimento">
              <option value="AG_PAGAMENTO" ${workflowValue === 'AG_PAGAMENTO' ? 'selected' : ''}>A realizar / Ag. pagamento</option>
              <option value="PAGO_A_REALIZAR" ${workflowValue === 'PAGO_A_REALIZAR' ? 'selected' : ''}>Pago / A realizar</option>
              <option value="PAGO" ${workflowValue === 'PAGO' ? 'selected' : ''}>Pago / Realizado</option>
              <option value="REALIZADO_AG_PAGAMENTO" ${workflowValue === 'REALIZADO_AG_PAGAMENTO' ? 'selected' : ''}>Realizado / Ag. pagamento</option>
            </select>
          </label>
          <div class="procedimentos-actions">
            <button class="btn ghost" type="button" data-action="proc-view-details" data-service-id="${serviceId}">Detalhes</button>
            <div class="menu-wrap">
              <button class="menu-trigger" type="button" aria-label="Acoes">&#8942;</button>
              <div class="menu">
                <button type="button" data-action="proc-view-debt" data-service-id="${serviceId}">Visualizar debito</button>
                <button type="button" data-action="proc-view-details" data-service-id="${serviceId}">Visualizar detalhes</button>
                <button type="button" data-action="proc-edit" data-service-id="${serviceId}">Editar completo</button>
                <button type="button" class="danger" data-action="proc-delete" data-service-id="${serviceId}">Excluir procedimento</button>
              </div>
            </div>
          </div>
        </div>`;
    }).join('');
    syncTrackedTimers();
  };

  const formatDate = (value) => {
    if (!value) return '-';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return value;
    return dt.toLocaleDateString('pt-BR');
  };

  const renderAnotacoes = (docs = [], options = {}) => {
    if (!anotacoesList || !anotacoesEmpty) return;
    anotacoesList.innerHTML = '';
    if (options.loading) {
      anotacoesEmpty.innerHTML = buildLoadingStateHtml(
        'Carregando anotacoes...',
        'Buscando as evolucoes clinicas deste paciente.',
        3
      );
      anotacoesEmpty.style.display = 'block';
      return;
    }
    if (options.error) {
      anotacoesEmpty.innerHTML = `
        <div class="voithos-loading-panel" role="alert">
          <p class="empty-state-title">Nao foi possivel carregar as anotacoes</p>
          <p class="empty-state-subtitle">${options.error}</p>
        </div>
      `;
      anotacoesEmpty.style.display = 'block';
      return;
    }
    const list = (Array.isArray(docs) ? docs : [])
      .filter((doc) => {
        const type = String(doc.type || doc.tipo || '').toUpperCase();
        return type === 'EVOLUCAO' || type === 'EVOLUCAO_CLINICA';
      })
      .sort((a, b) => {
        const ta = new Date(a.createdAt || a.documentDate || a.data || 0).getTime() || 0;
        const tb = new Date(b.createdAt || b.documentDate || b.data || 0).getTime() || 0;
        return tb - ta;
      });

    if (!list.length) {
      anotacoesEmpty.textContent = 'O paciente nao possui anotacoes adicionadas.';
      anotacoesEmpty.style.display = 'block';
      return;
    }

    anotacoesEmpty.style.display = 'none';
    list.forEach((doc) => {
      const rawDate = doc.createdAt || doc.documentDate || doc.data || new Date().toISOString();
      const date = new Date(rawDate);
      const dateLabel = Number.isNaN(date.getTime())
        ? formatDate(rawDate)
        : `${date.toLocaleDateString('pt-BR')} ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
      const author = doc.createdBy?.nome || doc.data?.profissionalNome || doc.profissionalNome || '-';
      const texto = String(doc.data?.texto || doc.texto || doc.data?.conteudo || '').trim() || 'Sem descricao.';
      const card = document.createElement('article');
      card.className = 'anotacao-card';
      card.innerHTML = `
        <div class="anotacao-card-header">
          <span class="anotacao-card-date">${dateLabel}</span>
          <button class="anotacao-edit-btn" type="button" data-action="edit-anotacao" data-doc-id="${doc.id || ''}">Editar</button>
        </div>
        <div class="anotacao-card-author">${author}</div>
        <p class="anotacao-card-text">${texto}</p>
      `;
      anotacoesList.appendChild(card);
    });
  };

  const textOrDefault = (value) => {
    const normalized = String(value || '').trim();
    return normalized ? normalized : 'Nao informado';
  };

  const firstExistingValue = (obj, keys = []) => {
    for (const key of keys) {
      const value = obj?.[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return '';
  };

  const formatBirthDate = (value) => {
    if (!value) return 'Nao informado';
    const raw = String(value).trim();
    const direct = new Date(raw);
    if (!Number.isNaN(direct.getTime())) return direct.toLocaleDateString('pt-BR');
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return raw;
    const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00`);
    if (Number.isNaN(date.getTime())) return raw;
    return date.toLocaleDateString('pt-BR');
  };

  const updateGeneralInfoDrawer = (patient) => {
    const p = patient || {};
    if (infoNome) infoNome.textContent = textOrDefault(firstExistingValue(p, ['fullName', 'nome']));
    if (infoSexo) infoSexo.textContent = textOrDefault(firstExistingValue(p, ['sexo', 'gender']));
    if (infoEstadoCivil) infoEstadoCivil.textContent = textOrDefault(firstExistingValue(p, ['estadoCivil', 'civilStatus']));
    if (infoSituacaoProfissional) infoSituacaoProfissional.textContent = textOrDefault(firstExistingValue(p, ['situacaoProfissional', 'profissao', 'ocupacao']));
    if (infoCpf) infoCpf.textContent = textOrDefault(firstExistingValue(p, ['cpf']));
    if (infoRg) infoRg.textContent = textOrDefault(firstExistingValue(p, ['rg']));
    if (infoDataNascimento) infoDataNascimento.textContent = formatBirthDate(firstExistingValue(p, ['dataNascimento', 'birthDate']));
    if (infoTelefone) infoTelefone.textContent = textOrDefault(firstExistingValue(p, ['telefone', 'phone', 'celular', 'whatsapp']));
    if (infoEmail) infoEmail.textContent = textOrDefault(firstExistingValue(p, ['email']));
    if (infoEndereco) infoEndereco.textContent = textOrDefault(firstExistingValue(p, ['address', 'endereco']));
  };

  const openInfoDrawer = () => {
    if (!infoDrawer || !currentPatient) return;
    updateGeneralInfoDrawer(currentPatient);
    infoDrawer.classList.add('open');
    infoDrawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  };

  const closeInfoDrawer = () => {
    if (!infoDrawer) return;
    infoDrawer.classList.remove('open');
    infoDrawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  };

  const parseDateBr = (value) => {
    if (!value) return null;
    const clean = value.trim();
    const match = clean.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return null;
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const dt = new Date(year, month - 1, day);
    if (Number.isNaN(dt.getTime())) return null;
    if (dt.getFullYear() != year || dt.getMonth() != month - 1 || dt.getDate() != day) return null;
    return dt;
  };

  const getActiveProcedimentosFilter = () => {
    const active = procedimentosFiltros.find((btn) => btn.classList.contains('active'));
    if (!active) return 'ficha';
    const key = active.textContent.toLowerCase().trim();
    const map = {
      'ficha geral': 'ficha',
      'a realizar': 'a-realizar',
      'realizado': 'realizado',
      'pre-existente': 'pre-existente',
    };
    return map[key] || 'ficha';
  };

  const refreshProcedimentos = async (options = {}) => {
    if (!currentPatient?.prontuario || !servicesApi.listForPatient) return;
    const { awaitFinance = true } = options;
    const now = Date.now();
    const patientKey = getCurrentPatientKey();
    const requestKey = `${String(currentUser?.clinicId || '')}:${patientKey}:${getActiveProcedimentosFilter()}`;
    if (procedimentosRefreshPromise && procedimentosRefreshKey === requestKey) return procedimentosRefreshPromise;
    if (financeSyncRefreshInFlight || (now - financeSyncLastRefreshAt) < 250) return procedimentosRefreshPromise;
    financeSyncRefreshInFlight = true;
    procedimentosRefreshKey = requestKey;
    const started = prontuarioNowMs();
    if (patientKey && patientKey !== lastProcedimentosPatientKey) {
      procedimentosDataLoading = true;
      renderProcedimentos(currentPatient.servicos || [], getActiveProcedimentosFilter(), { loading: true });
    }
    prontuarioPerfLog('procedures_fetch_start');
    procedimentosRefreshPromise = (async () => {
      try {
        const resp = await servicesApi.listForPatient(currentPatient.prontuario);
        currentPatient.servicos = resp?.servicos || [];
        lastProcedimentosPatientKey = patientKey;
        procedimentosDataLoading = false;
        renderProcedimentos(currentPatient.servicos, getActiveProcedimentosFilter());
        updateFinanceMetrics(currentPatient.servicos);
        applyOdontogramaSelections(currentPatient.servicos);
        prontuarioPerfLog('procedures_fetch_done', started, { count: currentPatient.servicos.length });
        if (awaitFinance) {
          await refreshPatientFinance();
        } else {
          refreshPatientFinance().catch((err) => console.warn('[PRONTUARIO] falha ao carregar financeiro em background', err));
        }
        financeSyncLastRefreshAt = Date.now();
        return currentPatient.servicos;
      } catch (err) {
        console.warn('[PRONTUARIO] nao foi possivel atualizar procedimentos', err);
        procedimentosDataLoading = false;
        renderProcedimentos(currentPatient.servicos || [], getActiveProcedimentosFilter(), {
          error: err?.message || 'Nao foi possivel carregar os procedimentos do paciente.',
        });
        prontuarioPerfLog('procedures_fetch_error', started);
        return currentPatient.servicos || [];
      } finally {
        financeSyncRefreshInFlight = false;
        procedimentosRefreshPromise = null;
        procedimentosRefreshKey = '';
      }
    })();
    return procedimentosRefreshPromise;
  };

  let financeSyncLastRefreshAt = 0;
  let financeSyncRefreshInFlight = false;
  const syncFinanceViews = async () => {
    await refreshProcedimentos();
  };


  const closeProcModal = () => {
    if (!procModal) return;
    procModal.classList.remove('open');
    procModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  };

  const openProcModal = () => {
    if (!procModal) return;
    procModal.classList.add('open');
    procModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  };

  const closeProcEditModal = () => {
    if (!procEditModal) return;
    procEditModal.classList.remove('open');
    procEditModal.setAttribute('aria-hidden', 'true');
  };

  const openProcEditModal = () => {
    if (!procEditModal) return;
    procEditModal.classList.add('open');
    procEditModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  };

  const toInputDate = (value) => {
    if (!value) return '';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return '';
    return dt.toISOString().slice(0, 10);
  };

  const parseDentesInput = (value) => {
    if (!value) return [];
    return value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  };

  const loadProceduresCatalog = async () => {
    if (!procEditDatalist || !loadProceduresApi) return;
    try {
      const data = await loadProceduresApi();
      const items = Array.isArray(data) ? data : [];
      procEditDatalist.innerHTML = items
        .map((p) => `<option value="${(p.nome || '').replace(/"/g, '')}"></option>`)
        .join('');
    } catch (err) {
      console.warn('[PRONTUARIO] nao foi possivel carregar procedimentos', err);
    }
  };

  const fillProcEditModal = (service) => {
    if (!service) return;
    if (procEditId) procEditId.value = service.id || '';
    if (procEditName) procEditName.value = resolveServiceDisplayName(service);
    if (procEditValor) {
      const val = getServiceAmount(service);
      procEditValor.value = val ? val.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '';
    }
    if (procEditDentes) procEditDentes.value = formatDentes(service.dentes || []).replace(/-/g, '').trim();
    if (procEditProfissional) procEditProfissional.value = service.dentistaNome || service.dentista || '';
    if (procEditRealizado) procEditRealizado.value = toInputDate(service.dataRealizacao || service.finishedAt || service.finalizadoEm);
    if (procEditObs) procEditObs.value = service.observacoes || service.obs || service.observacao || '';
    if (procEditFinanceiro) procEditFinanceiro.checked = Boolean(service.gerarFinanceiro || service.financeiro);

    const currentStatus = normalizeEstado(service.status || service.estado || service.situacao);
    procEditStatusRadios.forEach((radio) => {
      radio.checked = radio.value === currentStatus;
    });

    const faces = Array.isArray(service.faces) ? service.faces : (service.faces || '').toString().split('');
    procEditFaces.forEach((box) => {
      box.checked = faces.includes(box.value);
    });
  };

  const fillProcModal = (service) => {
    if (!service) return;
    const nome = resolveServiceDisplayName(service) || 'Procedimento';
    const dentes = formatDentes(service.dentes);
    const codigo = service.codigo || service.code || '';
    const title = codigo ? `[${codigo}] | ${nome}` : `${nome}`;
    const estadoLabel = statusLabel(service.status || service.estado || service.situacao);
    const estadoClass = statusClass(service.status || service.estado || service.situacao);
    const workflow = deriveServiceWorkflowStatus(service);
    const workflowClass = workflowChipClass(workflow.key);
    const dentista = service.dentistaNome || service.dentista || service.dentistaName || '-';
    const valor = getServiceAmount(service).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const added = formatDate(service.registeredAt || service.dataAdicionado || service.createdAt);
    const finished = formatDate(service.dataRealizacao || service.finishedAt || service.finalizadoEm);
    const obs = service.observacoes || service.obs || service.observacao || service.notas || 'Sem observacoes.';
    const financeiro = service?.financeiro || {};
    const financeEntryId = financeiro.financeEntryId || service.financeiroId || '';
    const linkedFinance = (patientFinanceRows || []).find((row) => String(row?.id || '') === String(financeEntryId)) || null;
    const finStatus = paymentStatusLabel(linkedFinance?.paymentStatus || linkedFinance?.status || financeiro.paymentStatus || service.paymentStatus || 'PENDING');
    const finMethod = paymentMethodLabel(linkedFinance?.paymentMethod || linkedFinance?.metodoPagamento || financeiro.paymentMethod || service.paymentMethod || service.metodoPagamento || 'OTHER');
    const finDue = formatDateBr(linkedFinance?.dueDate || linkedFinance?.vencimento || financeiro.dueDate || service.vencimento || '');
    const finPaidAt = formatDateTimeBr(linkedFinance?.paidAt || financeiro.paidAt || '');
    const finInstallments = Number(linkedFinance?.installments ?? financeiro.installments ?? 0) || 0;
    const faces = formatFacesLabel(service.faces);
    const tempo = formatTempoMinutos(service.tempoMinutos || Math.floor(getServiceElapsedSeconds(service) / 60));
    const codigoLabel = codigo || '-';
    const custoTotal = Number(service?.custoTotal ?? service?.custos?.total ?? 0) || 0;
    const custoLab = Number(service?.custos?.laboratorio?.valor ?? 0) || 0;
    const custoMateriais = ensureArray(service?.custos?.materiais).reduce((sum, item) => sum + (Number(item?.custoTotal) || 0), 0);
    const custoOutros = ensureArray(service?.custos?.outros).reduce((sum, item) => sum + (Number(item?.valor) || 0), 0);
    const lucro = Number(service?.lucro ?? (getServiceAmount(service) - custoTotal)) || 0;
    const lucroHora = Number(service?.lucroPorHora ?? 0) || 0;

    if (procModalTitle) procModalTitle.textContent = title + (dentes && dentes !== '-' ? ` | Dentes: ${dentes}` : '');
    if (procModalStatus) procModalStatus.innerHTML = `
      <div class="status-chip-group">
        <span class="status-chip ${estadoClass}">${estadoLabel}</span>
        <span class="status-chip workflow-chip ${workflowClass}">${workflow.label}</span>
      </div>
    `;
    if (procModalDentista) procModalDentista.textContent = dentista || '-';
    if (procModalValor) procModalValor.textContent = valor;
    if (procModalAdd) procModalAdd.textContent = added || '-';
    if (procModalFinal) procModalFinal.textContent = finished || '-';
    if (procModalObs) procModalObs.textContent = obs;
    if (procModalDentes) procModalDentes.textContent = dentes || '-';
    if (procModalFaces) procModalFaces.textContent = faces;
    if (procModalTempo) procModalTempo.textContent = tempo;
    if (procModalCodigo) procModalCodigo.textContent = codigoLabel;
    if (procModalFinStatus) procModalFinStatus.textContent = finStatus;
    if (procModalFinMethod) procModalFinMethod.textContent = finMethod;
    if (procModalFinInstallments) procModalFinInstallments.textContent = finInstallments > 1 ? `${finInstallments}x` : '-';
    if (procModalFinDue) procModalFinDue.textContent = finDue || '-';
    if (procModalFinPaidAt) procModalFinPaidAt.textContent = finPaidAt || '-';
    if (procModalCustoTotal) procModalCustoTotal.textContent = formatCurrency(custoTotal);
    if (procModalCustoLab) procModalCustoLab.textContent = formatCurrency(custoLab);
    if (procModalCustoMateriais) procModalCustoMateriais.textContent = formatCurrency(custoMateriais);
    if (procModalCustoOutros) procModalCustoOutros.textContent = formatCurrency(custoOutros);
    if (procModalLucro) procModalLucro.textContent = formatCurrency(lucro);
    if (procModalLucroHora) procModalLucroHora.textContent = lucroHora ? formatCurrency(lucroHora) : '-';

    const modalActions = procModal?.querySelectorAll('[data-service-id]') || [];
    modalActions.forEach((btn) => {
      btn.dataset.serviceId = service.id || '';
    });
  };

  const findServiceById = (serviceId) => {
    if (!serviceId || !currentPatient?.servicos) return null;
    return currentPatient.servicos.find((s) => String(s.id || '') === String(serviceId)) || null;
  };

  const handleProcedureAction = async (action, serviceId) => {
    if (!action || !serviceId || !currentPatient?.prontuario) return false;

    const service = findServiceById(serviceId);
    if (!service) {
      alert('Procedimento nao encontrado.');
      return true;
    }

    if (action === 'proc-cronometrar' || action === 'proc-finalize') {
      return true;
    }

    if (action === 'proc-view-details') {
      fillProcModal(service);
      openProcModal();
      return true;
    }

    if (action === 'proc-view-debt') {
      const valor = getServiceAmount(service).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      alert(`Debito do procedimento: ${valor}`);
      setActiveTab('financeiro');
      closeProcModal();
      closeProcEditModal();
      return true;
    }

    if (action === 'proc-edit') {
      closeProcModal();
      openProcFinalizeModal(service, { mode: 'edit' });
      return true;
    }

    if (action === 'proc-edit-costs-time') {
      closeProcModal();
      openProcFinalizeModal(service, { mode: 'edit' });
      return true;
    }

    if (action === 'proc-delete') {
      const ok = confirm('Excluir este procedimento?');
      if (!ok) return true;
      try {
        await servicesApi.delete?.({ prontuario: currentPatient.prontuario, id: serviceId });
        await refreshProcedimentos();
      } catch (err) {
        console.warn('[PRONTUARIO] falha ao excluir procedimento', err);
        alert('Nao foi possivel excluir o procedimento.');
      }
      return true;
    }

    return false;
  };


  const ensureProntuario = async () => {
    if (!currentPatient) {
      const stored = resolvePatientFromStorage();
      if (stored?.patient) currentPatient = stored.patient;
    }
    if (currentPatient?.prontuario) return currentPatient.prontuario;
    const candidate = currentPatient?.id || currentPatient?._id || '';
    if (!candidate) return '';
    const full = await fetchPatient(currentPatient);
    if (full?.prontuario) {
      currentPatient = full;
      updateHeader(currentPatient);
      return full.prontuario;
    }
    return '';
  };

  const normalizeDocumentTypeValue = (doc) => String(doc?.type || doc?.tipo || '').trim().toUpperCase();
  const normalizeDocumentCategoryValue = (doc) => String(doc?.category || doc?.categoria || '').trim().toUpperCase();
  const attachmentCategories = new Set(['ARQUIVO_PACIENTE', 'ARQUIVOS', 'ANEXO', 'ANEXOS', 'EXAMES', 'IDENTIDADE', 'FINANCEIRO', 'IMAGEM', 'IMAGENS', 'OUTROS']);
  const generatedDocumentTypes = new Set(['CUSTOMIZAVEL', 'RECEITA', 'ATESTADO', 'CONTRATO', 'DOSSIE', 'ORCAMENTO']);
  const isMimeLikeType = (value) => /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(String(value || '').trim());
  const isAnamneseDoc = (doc) => normalizeDocumentTypeValue(doc) === 'ANAMNESE';
  const isEvolucaoDoc = (doc) => {
    const type = normalizeDocumentTypeValue(doc);
    return type === 'EVOLUCAO' || type === 'EVOLUCAO_CLINICA';
  };
  const isGeneratedClinicalDocument = (doc) => {
    const type = normalizeDocumentTypeValue(doc);
    if (!type || isAnamneseDoc(doc) || isEvolucaoDoc(doc)) return false;
    return generatedDocumentTypes.has(type);
  };
  const isAttachmentDocument = (doc) => {
    if (!doc || isAnamneseDoc(doc) || isEvolucaoDoc(doc)) return false;
    const type = normalizeDocumentTypeValue(doc);
    const category = normalizeDocumentCategoryValue(doc);
    if (attachmentCategories.has(category)) return true;
    if (type === 'ARQUIVO' || type === 'ANEXO' || type === 'IMAGEM') return true;
    if (isMimeLikeType(doc?.type || doc?.tipo)) return true;
    if (isGeneratedClinicalDocument(doc)) return false;
    return Boolean(doc?.storedName || doc?.originalName || doc?.extension);
  };
  const buildDocumentCard = (doc, actionOpen, actionDelete, defaultTitle = 'Documento', defaultCategory = 'Documento') => {
    const title = doc.title || doc.titulo || doc.nome || doc.originalName || doc.type || defaultTitle;
    const category = doc.category || doc.categoria || defaultCategory;
    const typeLabel = doc.type || doc.tipo || defaultTitle;
    const folder = doc.folder ? ` - Pasta: ${doc.folder}` : '';
    const dateLabel = formatDate(doc.documentDate || doc.createdAt || doc.data);
    const author = doc.createdBy?.nome || doc.data?.profissionalNome || doc.profissionalNome || '-';
    const card = document.createElement('div');
    card.className = 'doc-card';
    card.dataset.docId = doc.id || '';
    card.innerHTML = `
      <div class="doc-card-info">
        <div class="doc-card-title">${title}</div>
        <div class="doc-card-meta">${typeLabel} - ${category}${folder}</div>
        <div class="doc-card-meta">Data: ${dateLabel}</div>
        <div class="doc-card-meta">Autor: ${author}</div>
      </div>
      <div class="doc-card-actions">
        <button class="btn ghost" data-action="${actionOpen}">Abrir</button>
        <button class="btn ghost danger" data-action="${actionDelete}">Excluir</button>
      </div>
    `;
    return card;
  };

  const renderDocuments = (docs) => {
    if (!docsList || !docsEmpty) return;
    const list = (Array.isArray(docs) ? docs : []).filter((doc) => isGeneratedClinicalDocument(doc));
    docsList.innerHTML = '';
    if (!list.length) {
      docsEmpty.classList.add('show');
      return;
    }
    docsEmpty.classList.remove('show');
    list.forEach((doc) => {
      docsList.appendChild(buildDocumentCard(doc, 'open-doc', 'delete-doc', 'Documento clinico', 'Clinico'));
    });
  };

  const renderArquivos = (docs) => {
    if (!arquivosList || !arquivosEmpty) return;
    const list = (Array.isArray(docs) ? docs : [])
      .filter((doc) => isAttachmentDocument(doc))
      .sort((a, b) => String(b.createdAt || b.documentDate || '').localeCompare(String(a.createdAt || a.documentDate || '')));
    arquivosList.innerHTML = '';
    if (!list.length) {
      arquivosEmpty.classList.add('show');
      return;
    }
    arquivosEmpty.classList.remove('show');
    list.forEach((doc) => {
      arquivosList.appendChild(buildDocumentCard(doc, 'open-file', 'delete-file', 'Documento', 'Documento do paciente'));
    });
  };

  const renderAnamneseDocuments = (docs) => {
    if (!anamneseList || !anamneseEmpty) return;
    const list = (Array.isArray(docs) ? docs : [])
      .filter((doc) => isAnamneseDoc(doc))
      .sort((a, b) => String(b.createdAt || b.documentDate || '').localeCompare(String(a.createdAt || a.documentDate || '')));

    anamneseList.innerHTML = '';
    if (!list.length) {
      anamneseEmpty.style.display = 'block';
      return;
    }

    anamneseEmpty.style.display = 'none';
    list.forEach((doc) => {
      const title = doc.title || doc.titulo || 'Anamnese';
      const dateLabel = formatDate(doc.documentDate || doc.createdAt || doc.data);
      const author = doc.createdBy?.nome || doc.data?.profissionalNome || doc.profissionalNome || '-';
      const card = document.createElement('div');
      card.className = 'doc-card';
      card.dataset.docId = doc.id || '';
      card.innerHTML = `
        <div class="doc-card-info">
          <div class="doc-card-title">${title}</div>
          <div class="doc-card-meta">Anamnese</div>
          <div class="doc-card-meta">Data: ${dateLabel}</div>
          <div class="doc-card-meta">Autor: ${author}</div>
        </div>
        <div class="doc-card-actions">
          <button class="btn ghost" data-action="open-anamnese-doc">Abrir</button>
          <button class="btn ghost danger" data-action="delete-anamnese-doc">Excluir</button>
        </div>
      `;
      anamneseList.appendChild(card);
    });
  };

  const renderDocumentsLoading = () => {
    const loadingHtml = buildLoadingStateHtml(
      'Carregando documentos...',
      'Buscando anexos, anamneses e documentos clinicos do paciente.',
      3
    );
    if (docsList) docsList.innerHTML = '';
    if (docsEmpty) {
      docsEmpty.innerHTML = loadingHtml;
      docsEmpty.classList.add('show');
    }
    if (arquivosList) arquivosList.innerHTML = '';
    if (arquivosEmpty) {
      arquivosEmpty.innerHTML = loadingHtml;
      arquivosEmpty.classList.add('show');
    }
    if (anamneseList) anamneseList.innerHTML = '';
    if (anamneseEmpty) {
      anamneseEmpty.innerHTML = loadingHtml;
      anamneseEmpty.style.display = 'block';
    }
    renderAnotacoes([], { loading: true });
  };

  const renderProntuarioShell = () => {
    const started = prontuarioNowMs();
    if (patientName) patientName.textContent = 'Carregando paciente...';
    if (patientPhone) patientPhone.textContent = 'Telefone: carregando...';
    if (patientCpf) patientCpf.textContent = 'CPF: carregando...';
    if (patientProntuario) patientProntuario.textContent = 'Prontuario: carregando...';
    if (patientStatus) patientStatus.textContent = 'Carregando dados clinicos';
    setPatientAvatarFallback('P', 'Carregando paciente');
    renderConsultas([]);
    renderProcedimentos([], getActiveProcedimentosFilter(), { loading: true });
    renderPatientFinance([], { loading: true });
    renderDocumentsLoading();
    prontuarioPerfLog('shell_render_done', started);
  };

  const renderProntuarioNoPatient = () => {
    if (patientName) patientName.textContent = 'Selecione um paciente';
    if (patientPhone) patientPhone.textContent = 'Telefone: -';
    if (patientCpf) patientCpf.textContent = 'CPF: -';
    if (patientProntuario) patientProntuario.textContent = 'Prontuario: -';
    if (patientStatus) patientStatus.textContent = 'Nenhum paciente selecionado';
    setPatientAvatarFallback('P', 'Nenhum paciente selecionado');
    renderConsultas([]);
    renderProcedimentos([], getActiveProcedimentosFilter());
    renderPatientFinance([], {
      error: 'Selecione um paciente para carregar o financeiro.',
    });
    renderDocuments([]);
    renderArquivos([]);
    renderAnamneseDocuments([]);
    renderAnotacoes([]);
  };

  const getCurrentUserRole = () => String(currentUser?.tipo || currentUser?.role || '').trim().toLowerCase();
  const hasCurrentUserPermission = (key) => Boolean(currentUser?.permissions?.[key]);

  const canManageDocuments = () => {
    if (!currentUser) return false;
    const role = getCurrentUserRole();
    if (Boolean(currentUser?.isClinicAdmin || currentUser?.clinicAdmin)) return true;
    if (hasCurrentUserPermission('admin') || hasCurrentUserPermission('documents.write') || hasCurrentUserPermission('clinical.write')) return true;
    return ['admin', 'administrativo', 'super_admin', 'recepcionista', 'recepcao', 'dentista'].includes(role);
  };

  const canGenerateDossie = () => {
    if (!currentUser) return false;
    const role = getCurrentUserRole();
    if (Boolean(currentUser?.isClinicAdmin || currentUser?.clinicAdmin)) return true;
    if (hasCurrentUserPermission('admin') || hasCurrentUserPermission('documents.write') || hasCurrentUserPermission('clinical.write')) return true;
    return ['admin', 'administrativo', 'super_admin', 'dentista'].includes(role);
  };

  const closeNewDocMenu = () => {
    if (!docsNewDropdown) return;
    docsNewDropdown.classList.remove('open');
    docsNewDropdown.setAttribute('aria-hidden', 'true');
  };

  const openNewDocMenu = () => {
    if (!docsNewDropdown) return;
    docsNewDropdown.classList.add('open');
    docsNewDropdown.setAttribute('aria-hidden', 'false');
  };

  const toggleNewDocMenu = () => {
    if (!docsNewDropdown) return;
    if (docsNewDropdown.classList.contains('open')) {
      closeNewDocMenu();
      return;
    }
    openNewDocMenu();
  };

  const setUploadStatus = (text, type = '') => {
    if (!uploadStatus) return;
    uploadStatus.textContent = text || '';
    uploadStatus.className = `upload-status ${type}`.trim();
  };

  const setUploadSaving = (saving) => {
    uploadSaving = saving === true;
    if (uploadSubmitButton) uploadSubmitButton.disabled = uploadSaving;
    [uploadFileInput, uploadPhotoInput].forEach((input) => {
      if (input) input.disabled = uploadSaving;
    });
    document.querySelectorAll('[data-action="select-upload-file"], [data-action="capture-upload-file"]').forEach((btn) => {
      btn.disabled = uploadSaving;
    });
  };

  const validateUploadFile = (file) => {
    if (!file || (!file.path && !file.name)) {
      return 'Selecione um arquivo para adicionar.';
    }
    const mimeType = String(file.type || '').trim().toLowerCase();
    const extension = String((file.name || '').split('.').pop() || '').toLowerCase();
    const hasAllowedMime = !mimeType || supportedUploadMimeTypes.has(mimeType);
    const hasMimeExtensionMatch = !mimeType
      || (mimeType === 'application/pdf' && extension === 'pdf')
      || (mimeType === 'image/webp' && extension === 'webp')
      || (mimeType === 'image/png' && extension === 'png')
      || ((mimeType === 'image/jpeg' || mimeType === 'image/jpg') && ['jpg', 'jpeg'].includes(extension));
    if (!supportedUploadExt.test(file.name || '') || !hasAllowedMime || !hasMimeExtensionMatch) {
      return 'Formato nao permitido.';
    }
    if ((file.size || 0) > maxPatientDocumentUploadBytes) {
      return 'Arquivo muito grande. Limite: 5 MB.';
    }
    return '';
  };

  const setUploadFile = (file) => {
    selectedUploadFile = file || null;
    if (uploadFileName) {
      uploadFileName.textContent = file?.name ? `${file.name} (${Math.ceil((file.size || 0) / 1024)} KB)` : 'Nenhum documento selecionado.';
    }
    const validationError = file ? validateUploadFile(file) : '';
    setUploadStatus(validationError, validationError ? 'error' : '');
  };

  const openUploadDrawer = () => {
    if (!uploadDrawer) return;
    if (!canManageDocuments()) {
      alert('Voce nao possui permissao para adicionar arquivos.');
      return;
    }
    if (!currentPatient?.prontuario) {
      alert('Selecione um paciente valido antes de adicionar arquivos.');
      return;
    }
    closeNewDocMenu();
    if (uploadPatientName) uploadPatientName.value = currentPatient.fullName || currentPatient.nome || 'Paciente';
    setUploadStatus('');
    uploadDrawer.classList.add('open');
    uploadDrawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  };

  const closeUploadDrawer = () => {
    if (!uploadDrawer) return;
    uploadDrawer.classList.remove('open');
    uploadDrawer.setAttribute('aria-hidden', 'true');
    if (uploadDrawerForm) uploadDrawerForm.reset();
    if (uploadFileInput) uploadFileInput.value = '';
    if (uploadPhotoInput) uploadPhotoInput.value = '';
    setUploadFile(null);
    setUploadStatus('');
    setUploadSaving(false);
    document.body.style.overflow = '';
  };

  const syncDocumentsUiPermissions = () => {
    const allow = canManageDocuments();
    const allowDossie = canGenerateDossie();
    if (docsNewMenu) docsNewMenu.style.display = allow ? '' : 'none';
    if (btnDocsDossie) btnDocsDossie.style.display = allowDossie ? '' : 'none';
    if (uploadDrawer && !allow) closeUploadDrawer();
    const uploadButtons = document.querySelectorAll('[data-action="open-upload-drawer"]');
    uploadButtons.forEach((btn) => {
      btn.style.display = allow ? '' : 'none';
    });
  };

  const createEvolucao = async () => {
    const prontuario = await ensureProntuario();
    if (!prontuario) {
      alert('Prontuario do paciente nao encontrado.');
      return;
    }
    openAnotacaoModal();
  };

  const createCustomDocument = async () => {
    const prontuario = await ensureProntuario();
    if (!prontuario) {
      alert('Prontuario do paciente nao encontrado.');
      return;
    }

    const title = (prompt('Titulo do documento customizavel:') || '').trim();
    if (!title) return;
    const conteudo = (prompt('Conteudo do documento:') || '').trim();
    if (!conteudo) {
      alert('Informe o conteudo do documento.');
      return;
    }
    const dataPadrao = new Date().toISOString().split('T')[0];
    const data = (prompt('Data do documento (YYYY-MM-DD):', dataPadrao) || '').trim() || dataPadrao;

    try {
      await documentsApi.saveCustom?.({
        prontuario,
        pacienteId: currentPatient?.id || currentPatient?.prontuario || currentPatient?._id || '',
        pacienteNome: currentPatient?.fullName || currentPatient?.nome || '',
        profissionalId: currentUser?.id || '',
        profissionalNome: currentUser?.nome || '',
        title,
        conteudo,
        data,
        category: 'clinicos',
      });
      await loadDocuments({ force: true });
      setActiveTab('documentos');
      alert('Documento customizavel salvo com sucesso.');
    } catch (err) {
      console.warn('[PRONTUARIO] falha ao salvar documento customizavel', err);
      alert(err?.message || 'Nao foi possivel salvar o documento customizavel.');
    }
  };

  const generateDossieCompleto = async () => {
    const prontuario = await ensureProntuario();
    if (!prontuario) {
      alert('Prontuario do paciente nao encontrado.');
      return;
    }
    if (!canGenerateDossie()) {
      alert('Apenas Admin e Dentista podem gerar dossie.');
      return;
    }
    try {
      const docs = await documentsApi.list?.({ prontuario, includeArchived: false });
      const result = await documentsApi.generateDossie?.({
        prontuario,
        docs: docs || [],
        systemVersion: 'voithos-desktop',
      });
      await loadDocuments({ force: true });
      setActiveTab('documentos');
      if (result?.record?.id) {
        await documentsApi.open?.({ prontuario, documentId: result.record.id });
      }
      alert(`Dossie gerado com sucesso.\nHash: ${result?.hash || '-'}`);
    } catch (err) {
      console.warn('[PRONTUARIO] falha ao gerar dossie', err);
      alert(err?.message || 'Nao foi possivel gerar o dossie.');
    }
  };

  const renderConsultas = (consultas) => {
    if (!consultasList || !consultasEmpty) return;
    const agendadasEl = document.getElementById('consultas-kpi-agendadas');
    const realizadasEl = document.getElementById('consultas-kpi-realizadas');
    const faltasEl = document.getElementById('consultas-kpi-faltas');
    const list = Array.isArray(consultas) ? consultas : [];
    const statusMap = {
      em_aberto: 'Em aberto',
      confirmado: 'Confirmado',
      cancelado: 'Cancelado',
    };
    const attendanceMap = {
      compareceu: 'Compareceu',
      nao_compareceu: 'Não compareceu',
    };

    const parseDate = (value) => {
      if (!value) return null;
      if (typeof value === 'string' && value.includes('/')) return parseDateBr(value);
      const dt = new Date(`${value}T00:00:00`);
      return Number.isNaN(dt.getTime()) ? null : dt;
    };

    const isOpenStatus = (status) => ['em_aberto', 'confirmado'].includes(String(status || '').trim().toLowerCase());
    const hasAttendance = (attendanceStatus) => ['compareceu', 'nao_compareceu'].includes(String(attendanceStatus || '').trim().toLowerCase());
    const buildConsultaActions = (consulta, statusKey, attendanceKey) => {
      const appointmentId = String(consulta?.appointmentId || consulta?.id || '').trim();
      if (!appointmentId) return '';
      if (!attendanceKey && isOpenStatus(statusKey)) {
        return `
          <div class="consulta-actions">
            <button type="button" class="btn ghost success consulta-action-btn" data-action="consulta-attendance" data-appointment-id="${appointmentId}" data-attendance-status="compareceu">Compareceu</button>
            <button type="button" class="btn ghost danger consulta-action-btn" data-action="consulta-attendance" data-appointment-id="${appointmentId}" data-attendance-status="nao_compareceu">Não compareceu</button>
          </div>
        `;
      }
      if (['compareceu', 'nao_compareceu'].includes(attendanceKey)) {
        return `
          <div class="consulta-actions">
            <button type="button" class="btn ghost consulta-action-btn" data-action="consulta-attendance" data-appointment-id="${appointmentId}" data-attendance-status="pendente">Limpar marcação</button>
          </div>
        `;
      }
      return '';
    };
    const agendadas = list.filter((consulta) => !hasAttendance(consulta?.attendanceStatus) && isOpenStatus(consulta?.status)).length;
    const realizadas = list.filter((consulta) => String(consulta?.attendanceStatus || '').trim().toLowerCase() === 'compareceu').length;
    const faltas = list.filter((consulta) => String(consulta?.attendanceStatus || '').trim().toLowerCase() === 'nao_compareceu').length;

    if (agendadasEl) agendadasEl.textContent = String(agendadas);
    if (realizadasEl) realizadasEl.textContent = String(realizadas);
    if (faltasEl) faltasEl.textContent = String(faltas);

    consultasList.innerHTML = '';
    if (!list.length) {
      consultasEmpty.style.display = 'block';
      return;
    }
    consultasEmpty.style.display = 'none';

    const sorted = list.slice().sort((a, b) => {
      const statusAOpen = (!hasAttendance(a?.attendanceStatus) && isOpenStatus(a?.status)) ? 0 : 1;
      const statusBOpen = (!hasAttendance(b?.attendanceStatus) && isOpenStatus(b?.status)) ? 0 : 1;
      if (statusAOpen !== statusBOpen) return statusAOpen - statusBOpen;
      const da = parseDate(a.data)?.getTime() || 0;
      const db = parseDate(b.data)?.getTime() || 0;
      if (statusAOpen === 0) {
        if (da !== db) return da - db;
        return String(a.horaInicio || '').localeCompare(String(b.horaInicio || ''));
      }
      if (da !== db) return db - da;
      return String(b.horaInicio || '').localeCompare(String(a.horaInicio || ''));
    });

    sorted.forEach((consulta) => {
      const statusKey = String(consulta.status || 'em_aberto').trim().toLowerCase();
      const attendanceKey = String(consulta.attendanceStatus || '').trim().toLowerCase();
      const dt = parseDate(consulta.data);
      const dataFmt = dt ? dt.toLocaleDateString('pt-BR') : (consulta.data || '-');
      const horario = `${consulta.horaInicio || '--:--'}${consulta.horaFim ? ' - ' + consulta.horaFim : ''}`;
      const tipo = consulta.tipo || 'Consulta';
      const dentista = consulta.dentistaNome || 'Dentista';
      const marcador = consulta.marcadorNome || '';
      const observacoes = String(consulta.observacoes || '').trim();
      const details = [
        `<span class="consulta-detail-chip">Dentista: ${dentista}</span>`,
        `<span class="consulta-detail-chip">Horario: ${horario}</span>`,
      ];
      if (marcador) details.push(`<span class="consulta-detail-chip">Marcador: ${marcador}</span>`);
      if (observacoes) details.push(`<span class="consulta-detail-chip">Obs: ${observacoes}</span>`);

      const card = document.createElement('div');
      card.className = 'consulta-card';
      card.innerHTML = `
        <div class="consulta-info">
          <h4>${tipo}</h4>
          <p>${dataFmt}</p>
          <div class="consulta-details">${details.join('')}</div>
          ${buildConsultaActions(consulta, statusKey, attendanceKey)}
        </div>
        <div class="consulta-meta">
          <div>${dentista}</div>
          <div class="consulta-meta-badges">
            <span class="consulta-status status-${statusKey}">${statusMap[statusKey] || statusKey}</span>
            ${attendanceKey ? `<span class="consulta-status consulta-attendance status-${attendanceKey}">${attendanceMap[attendanceKey] || attendanceKey}</span>` : ''}
          </div>
        </div>
      `;
      consultasList.appendChild(card);
    });
  };

  const updateConsultaAttendance = async ({ appointmentId, attendanceStatus }) => {
    const normalizedAppointmentId = String(appointmentId || '').trim();
    const normalizedAttendanceStatus = String(attendanceStatus || '').trim().toLowerCase();
    const allowedStatuses = new Set(['compareceu', 'nao_compareceu', 'pendente']);
    if (!normalizedAppointmentId || !allowedStatuses.has(normalizedAttendanceStatus) || !agendaApi?.update) {
      return;
    }
    if (consultaStatusUpdating) return;

    consultaStatusUpdating = true;
    try {
      await agendaApi.update(normalizedAppointmentId, {
        attendanceStatus: normalizedAttendanceStatus,
        clinicId: String(currentUser?.clinicId || '').trim(),
      });
      await loadConsultasTab({ sync: true });
    } catch (err) {
      console.warn('[PRONTUARIO] nao foi possivel atualizar presenca da consulta', {
        appointmentId: normalizedAppointmentId,
        attendanceStatus: normalizedAttendanceStatus,
        clinicId: String(currentUser?.clinicId || '').trim(),
        err,
      });
      alert(err?.message || 'Nao foi possivel atualizar a presença da consulta.');
    } finally {
      consultaStatusUpdating = false;
    }
  };

  const mergePatientShadowFields = (previousPatient, canonicalPatient) => {
    if (!canonicalPatient) return previousPatient;
    const previousConsultas = Array.isArray(previousPatient?.consultas) ? previousPatient.consultas : [];
    if (!Array.isArray(canonicalPatient?.consultas) && previousConsultas.length) {
      return { ...canonicalPatient, consultas: previousConsultas };
    }
    return canonicalPatient;
  };

  const loadConsultasTab = async ({ sync = true } = {}) => {
    const key = currentPatient?.prontuario || currentPatient?.id || currentPatient?._id || '';
    let syncedConsultas = null;
    if (sync && key && agendaApi.syncConsultas) {
      try {
        const result = await agendaApi.syncConsultas(key);
        if (Array.isArray(result?.consultas)) {
          syncedConsultas = result.consultas;
        }
      } catch (err) {
        console.warn('[PRONTUARIO] nao foi possivel sincronizar consultas', err);
      }
    }
    const refreshed = currentPatient ? await fetchPatient(currentPatient) : null;
    if (refreshed) {
      currentPatient = refreshed;
    }
    const consultas = Array.isArray(syncedConsultas)
      ? syncedConsultas
      : (Array.isArray(currentPatient?.consultas) ? currentPatient.consultas : []);
    if (currentPatient) {
      currentPatient = { ...currentPatient, consultas };
      persistActiveProntuarioContext(currentPatient, Array.isArray(syncedConsultas) ? 'agenda' : 'central');
    }
    renderConsultas(consultas);
  };

  const loadDocuments = async (options = {}) => {
    const { force = false } = options;
    if (!documentsApi.list) {
      docsCache = [];
      renderAnotacoes([], { error: 'Modulo de documentos indisponivel neste ambiente.' });
      return;
    }
    const prontuario = await ensureProntuario();
    if (!prontuario) return;
    const requestKey = `${String(currentUser?.clinicId || '')}:${prontuario}`;
    if (!force && documentsPromise && documentsPromiseKey === requestKey) return documentsPromise;
    const loadToken = ++documentsLoadToken;
    const started = prontuarioNowMs();
    documentsPromiseKey = requestKey;
    prontuarioPerfLog('documents_fetch_start');
    renderAnotacoes([], { loading: true });
    documentsPromise = (async () => {
      try {
        const docs = await documentsApi.list({ prontuario, includeArchived: false });
        if (loadToken !== documentsLoadToken) return [];
        docsCache = Array.isArray(docs) ? docs : [];
        renderDocuments(docs || []);
        renderArquivos(docs || []);
        renderAnamneseDocuments(docs || []);
        renderAnotacoes(docs || []);
        prontuarioPerfLog('documents_fetch_done', started, { count: docsCache.length });
        return docsCache;
      } catch (err) {
        if (loadToken !== documentsLoadToken) return [];
        console.warn('[PRONTUARIO] falha ao carregar documentos', err);
        docsCache = [];
        renderDocuments([]);
        renderArquivos([]);
        renderAnamneseDocuments([]);
        renderAnotacoes([], {
          error: err?.message || 'Verifique sua conexao e tente novamente.',
        });
        prontuarioPerfLog('documents_fetch_error', started);
        return [];
      } finally {
        documentsPromise = null;
        documentsPromiseKey = '';
      }
    })();
    return documentsPromise;
  };

  const setActiveTab = (tabId) => {
    tabs.forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.tab === tabId);
    });
    panels.forEach((panel) => {
      panel.classList.toggle('active', panel.id === `tab-${tabId}`);
    });
  };

  procedimentosFiltros.forEach((btn) => {
    btn.addEventListener('click', () => {
      procedimentosFiltros.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const key = btn.textContent.toLowerCase().trim();
      const map = {
        'ficha geral': 'ficha',
        'a realizar': 'a-realizar',
        'realizado': 'realizado',
        'pre-existente': 'pre-existente',
      };
      const filter = map[key] || 'ficha';
      renderProcedimentos(currentPatient?.servicos || [], filter);
    });
  });

  tabs.forEach((tab) => {
    tab.addEventListener('click', async () => {
      setActiveTab(tab.dataset.tab);
      if (tab.dataset.tab === 'documentos' || tab.dataset.tab === 'arquivos' || tab.dataset.tab === 'anamnese') {
        loadDocuments();
      }
      if (tab.dataset.tab === 'financeiro') {
        await refreshPatientFinance();
      }
      if (tab.dataset.tab === 'consultas') {
        await loadConsultasTab({ sync: true });
      }
    });
  });

  if (consultasList) {
    consultasList.addEventListener('click', async (event) => {
      const actionBtn = event.target.closest('[data-action="consulta-attendance"]');
      if (!actionBtn) return;
      event.preventDefault();
      await updateConsultaAttendance({
        appointmentId: actionBtn.dataset.appointmentId,
        attendanceStatus: actionBtn.dataset.attendanceStatus,
      });
    });
  }

  const updateHeader = (patient) => {
    if (!patient) return;
    const name = patient.fullName || patient.nome || 'Paciente';
    const phone = patient.telefone || patient.phone || patient.celular || patient.whatsapp || '-';
    const cpf = patient.cpf || '-';
    const prontuario = patient.prontuario || patient.id || patient._id || '-';
    const initial = name ? name.trim().charAt(0).toUpperCase() : 'P';

    if (patientName) patientName.textContent = name;
    renderPatientAvatar(patient, initial, name);
    if (patientPhone) patientPhone.textContent = `Telefone: ${phone}`;
    if (patientCpf) patientCpf.textContent = `CPF: ${cpf}`;
    if (patientProntuario) patientProntuario.textContent = `Prontuario: ${prontuario}`;
    if (btnWhatsAppPatient) {
      const digits = toDigits(phone);
      const hasPhone = digits.length >= 10;
      btnWhatsAppPatient.disabled = !hasPhone;
      btnWhatsAppPatient.title = hasPhone ? 'Falar com paciente no WhatsApp' : 'Paciente sem telefone valido para WhatsApp';
    }

    if (patientStatus) {
      const hasAnamnese = Boolean(patient.temAnamnese);
      patientStatus.textContent = hasAnamnese ? 'Anamnese registrada' : 'Sem anamnese registrada';
    }

    updateGeneralInfoDrawer(patient);
  };

  const loadPatientFromStorage = async () => {
    const resolved = resolvePatientFromStorage();
    if (!resolved?.patient) return null;
    console.info('[PRONTUARIO] prontuario_storage_key_used', {
      key: resolved.key,
      clinicId: String(currentUser?.clinicId || resolved.patient?.clinicId || resolved.patient?.clinicaId || '').trim(),
      patientId: resolved.patient?.id || resolved.patient?.prontuario || '',
    });
    return resolved.patient;
  };

  const applyProntuarioEntryNavigation = () => {
    let targetTab = '';
    try {
      const navKey = getClinicStorageKey('prontuario-open-tab');
      targetTab = String(localStorage.getItem(navKey) || localStorage.getItem('prontuario-open-tab') || '').trim().toLowerCase();
      if (targetTab) {
        localStorage.removeItem(navKey);
        localStorage.removeItem('prontuario-open-tab');
      }
    } catch (_) {
      targetTab = '';
    }
    if (!targetTab) return;

    if (targetTab === 'financeiro') {
      setActiveTab('financeiro');
      return;
    }
    if (targetTab === 'consultas') {
      setActiveTab('consultas');
      loadConsultasTab({ sync: true }).catch((err) => {
        console.warn('[PRONTUARIO] nao foi possivel carregar consultas na entrada', err);
      });
      return;
    }
    const allowed = new Set(['ficha', 'anamnese', 'evolucao', 'orcamentos', 'documentos', 'arquivos', 'consultas']);
    if (allowed.has(targetTab)) setActiveTab(targetTab);
  };
  const fetchPatient = async (patient) => {
    const prontuario = patient?.prontuario || patient?.id || patient?._id || '';
    if (!prontuario) return patient;
    const requestKey = `${String(currentUser?.clinicId || patient?.clinicId || patient?.clinicaId || '')}:${prontuario}`;
    if (patientFetchPromise && patientFetchKey === requestKey) return patientFetchPromise;
    patientFetchKey = requestKey;
    const started = prontuarioNowMs();
    prontuarioPerfLog('patient_fetch_start', null, { source: 'patientsApi.read' });
    patientFetchPromise = (async () => {
      try {
        const full = await patientsApi.read?.(prontuario);
        const canonicalPatient = mergePatientShadowFields(patient, full || patient);
        persistActiveProntuarioContext(canonicalPatient, 'central');
        writePatientHeaderCache(canonicalPatient);
        console.info('[PRONTUARIO] prontuario_patient_rehydrated_from_central=true', {
          clinicId: String(currentUser?.clinicId || canonicalPatient?.clinicId || canonicalPatient?.clinicaId || '').trim(),
          patientId: canonicalPatient?.id || canonicalPatient?.prontuario || '',
        });
        prontuarioPerfLog('patient_fetch_done', started);
        return canonicalPatient;
      } catch (err) {
        console.warn('[PRONTUARIO] nao foi possivel atualizar paciente', err);
        prontuarioPerfLog('patient_fetch_error', started);
        return patient;
      }
    })().finally(() => {
      patientFetchPromise = null;
      patientFetchKey = '';
    });
    return patientFetchPromise;
  };

  const openServicePage = () => {
    if (!currentPatient) return;
    localStorage.setItem(getClinicStorageKey('servicePatient'), JSON.stringify(currentPatient));
    window.location.href = 'servicos.html';
  };

  const openAnamnesePage = () => {
    if (!currentPatient) return;
    localStorage.setItem(getClinicStorageKey('anamnesePatient'), JSON.stringify(currentPatient));
    window.location.href = 'anamnese.html';
  };

  const openReceitaPage = () => {
    if (!currentPatient) return;
    localStorage.setItem(getClinicStorageKey('receitaPatient'), JSON.stringify(currentPatient));
    window.location.href = 'receita.html';
  };

  const openAtestadoPage = () => {
    if (!currentPatient) return;
    localStorage.setItem(getClinicStorageKey('atestadoPatient'), JSON.stringify(currentPatient));
    window.location.href = 'atestado.html';
  };

  const openEditProfile = () => {
    if (!currentPatient) return;
    invalidatePatientHeaderCache(currentPatient);
    localStorage.setItem(getClinicStorageKey('editingPatient'), JSON.stringify(currentPatient));
    window.location.href = 'editar-paciente.html';
  };

  const toDigits = (value) => String(value || '').replace(/\D/g, '');

  const openPatientWhatsApp = async () => {
    const phone = currentPatient?.telefone || currentPatient?.phone || currentPatient?.celular || currentPatient?.whatsapp || '';
    const digits = toDigits(phone);
    if (digits.length < 10) {
      alert('Paciente sem telefone valido para WhatsApp.');
      return;
    }
    if (!openExternalUrlApi) {
      alert('Nao foi possivel abrir o WhatsApp neste ambiente.');
      return;
    }
    try {
      await openExternalUrlApi(`https://wa.me/${digits}`);
    } catch (err) {
      console.warn('[PRONTUARIO] falha ao abrir WhatsApp do paciente', err);
      alert('Nao foi possivel abrir o WhatsApp do paciente.');
    }
  };

  const handlePanelAction = (action) => {
    if (action === 'novo-servico') return openServiceDrawer();
    if (action === 'novo-orcamento') return openServicePage();
    if (action === 'close-service-drawer') return closeServiceDrawer();
    if (action === 'nova-anamnese') return openAnamnesePage();
    if (action === 'nova-receita') return openReceitaPage();
    if (action === 'toggle-new-doc-menu') return toggleNewDocMenu();
    if (action === 'new-doc-custom') {
      closeNewDocMenu();
      return createCustomDocument();
    }
    if (action === 'new-doc-receita') {
      closeNewDocMenu();
      return openReceitaPage();
    }
    if (action === 'new-doc-atestado') {
      closeNewDocMenu();
      return openAtestadoPage();
    }
    if (action === 'generate-dossie') {
      closeNewDocMenu();
      return generateDossieCompleto();
    }
    if (action === 'open-upload-drawer') return openUploadDrawer();
    if (action === 'close-upload-drawer') return closeUploadDrawer();
    if (action === 'close-anotacao-modal') return closeAnotacaoModal();
    if (action === 'open-info-drawer') return openInfoDrawer();
    if (action === 'close-info-drawer') return closeInfoDrawer();
    if (action === 'toggle-info-section') return;
    if (action === 'select-upload-file') return uploadFileInput?.click();
    if (action === 'capture-upload-file') return uploadPhotoInput?.click();
    if (action === 'nova-evolucao') {
      createEvolucao();
      return;
    }
    if (action === 'abrir-documentos') {
      if (currentPatient) {
        localStorage.setItem(getClinicStorageKey('documentsPatient'), JSON.stringify(currentPatient));
      }
      window.location.href = 'arquivos.html';
      return;
    }
    if (action === 'abrir-arquivos') {
      openUploadDrawer();
      return;
    }
    if (action === 'abrir-financeiro') {
      window.location.href = 'gestao.html';
      return;
    }
    if (action === 'open-patient-payment-modal') {
      openPatientPaymentModal();
      return;
    }
    if (action === 'close-patient-payment-modal') {
      closePatientPaymentModal();
      return;
    }
    if (action === 'abrir-agenda') {
      if (currentPatient) {
        try {
          sessionStorage.setItem(getClinicStorageKey(AGENDA_PREFILL_PATIENT_KEY), JSON.stringify(currentPatient));
        } catch (_) {}
      }
      window.location.href = 'agendamentos.html';
    }
    if (action === 'close-proc-modal') {
      closeProcModal();
    }
    if (action === 'close-proc-edit') {
      closeProcEditModal();
      document.body.style.overflow = '';
    }
  };



  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('.menu-trigger');
    const openMenus = document.querySelectorAll('.menu-wrap.open');
    openMenus.forEach((wrap) => {
      if (trigger && wrap.contains(trigger)) return;
      wrap.classList.remove('open');
    });
    if (!trigger) return;
    const wrap = trigger.closest('.menu-wrap');
    if (wrap) wrap.classList.toggle('open');
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeProcModal();
      closeProcEditModal();
      closeProcFinalizeModal();
      closeServiceDrawer();
      closeUploadDrawer();
      closeAnotacaoModal();
      closePatientPaymentModal();
      closeInfoDrawer();
      closeNewDocMenu();
      document.body.style.overflow = '';
    }
  });
  procedimentosBody?.addEventListener('change', async (event) => {
    const select = event.target.closest('.proc-row-state-select');
    if (!select) return;
    const serviceId = select.dataset.procRowState || '';
    if (!serviceId) return;
    const originalValue = select.dataset.lastValue || deriveServiceWorkflowOptionValue(findServiceById(serviceId) || {});
    select.disabled = true;
    try {
      await applyProcedureRowWorkflowStatus(serviceId, select.value);
      select.dataset.lastValue = select.value;
    } catch (_) {
      select.value = originalValue;
    } finally {
      select.disabled = false;
    }
  });

  document.body.addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action || '';
    if (action === 'timer-banner-continue' || action === 'timer-banner-adjust' || action === 'timer-banner-finalize') {
      const service = findServiceById(activeRunningServiceId);
      if (!service) return;
      openProcFinalizeModal(service);
      return;
    }
    if (action === 'add-material') {
      createMaterialLine();
      computeFinalizeResumo();
      return;
    }
    if (action === 'add-drawer-dente') {
      const tooth = (serviceDrawerDentesSelect?.value || '').trim();
      if (!tooth) return;
      if (!dentesSelecionadosIframe.includes(tooth)) {
        dentesSelecionadosIframe = [...dentesSelecionadosIframe, tooth];
        updateDrawerDentesUI();
        sendDrawerTeethToIframe();
      }
      if (serviceDrawerDentesSelect) serviceDrawerDentesSelect.value = '';
      return;
    }
    if (action === 'clear-drawer-dentes') {
      dentesSelecionadosIframe = [];
      updateDrawerDentesUI();
      sendDrawerTeethToIframe();
      return;
    }
    if (action === 'remove-last-drawer-dente') {
      if (!dentesSelecionadosIframe.length) return;
      dentesSelecionadosIframe = dentesSelecionadosIframe.slice(0, -1);
      updateDrawerDentesUI();
      sendDrawerTeethToIframe();
      return;
    }
    if (action === 'add-outro-custo') {
      createOutroCustoLine();
      computeFinalizeResumo();
      return;
    }
    if (action === 'refresh-procedure-catalog') {
      await loadProcedures(true);
      buildProcedureToast('Lista de procedimentos atualizada.');
      return;
    }
    if (action === 'remove-line') {
      const row = btn.closest('.proc-line');
      if (row) row.remove();
      computeFinalizeResumo();
      return;
    }
    if (action === 'timer-use-clock') {
      const service = findServiceById(procFinalizeId?.value || '');
      if (service && procFinalizeTempo) {
        procFinalizeTempo.value = String(Math.floor(getServiceElapsedSeconds(service) / 60));
        computeFinalizeResumo();
      }
      return;
    }
    if (action === 'timer-start' || action === 'timer-resume') {
      const serviceId = procFinalizeId?.value || '';
      const service = findServiceById(serviceId);
      if (!service) return;
      const elapsed = getServiceElapsedSeconds(service);
      await saveServicePatch(serviceId, {
        timer: {
          startedAt: nowIso(),
          isRunning: true,
          accumulatedSeconds: elapsed,
        },
      }, 'Cronometro iniciado.');
      const refreshed = findServiceById(serviceId);
      if (refreshed) openProcFinalizeModal(refreshed);
      return;
    }
    if (action === 'timer-pause' || action === 'timer-stop') {
      const serviceId = procFinalizeId?.value || '';
      const service = findServiceById(serviceId);
      if (!service) return;
      const elapsed = getServiceElapsedSeconds(service);
      await saveServicePatch(serviceId, {
        timer: {
          startedAt: null,
          isRunning: false,
          accumulatedSeconds: elapsed,
        },
      }, 'Cronometro pausado.');
      const refreshed = findServiceById(serviceId);
      if (refreshed) openProcFinalizeModal(refreshed);
      return;
    }
    if (action === 'save-proc-draft') {
      const serviceId = procFinalizeId?.value || '';
      if (!serviceId) return;
      const summary = computeFinalizeResumo();
      const base = findServiceById(serviceId) || {};
      const editorFields = collectProcFinalizeEditorFields(base);
      await saveServicePatch(serviceId, {
        tipo: editorFields.tipo,
        nome: editorFields.nome,
        dentes: editorFields.dentes,
        faces: editorFields.faces,
        dentistaNome: editorFields.dentistaNome,
        status: editorFields.status,
        observacoes: editorFields.observacoes,
        gerarFinanceiro: editorFields.gerarFinanceiro,
        registeredAt: editorFields.registeredAt,
        dataRealizacao: editorFields.dataRealizacao,
        valorCobrado: summary.valorCobrado,
        tempoMinutos: summary.tempoMinutos,
        custos: summary.custos,
        custoTotal: summary.custoTotal,
        lucro: summary.lucro,
        lucroPorHora: summary.lucroPorHora,
        paymentStatus: summary.financeiro.paymentStatus,
        paymentMethod: summary.financeiro.paymentMethod,
        vencimento: summary.financeiro.dueDate,
        financeiro: {
          ...(base.financeiro || {}),
          ...(editorFields.financeiro || {}),
          paymentStatus: editorFields.financeiro.paymentStatus || summary.financeiro.paymentStatus,
          paymentMethod: editorFields.financeiro.paymentMethod || summary.financeiro.paymentMethod,
          paidAt: editorFields.financeiro.paidAt,
          dueDate: editorFields.financeiro.dueDate,
          installments: (editorFields.financeiro.installments ?? summary.financeiro.installments),
        },
        statusFinanceiroProcedimento: 'rascunho',
      }, 'Rascunho salvo com sucesso.');
      closeProcFinalizeModal();
      return;
    }
    if (action === 'close-proc-finalize') {
      closeProcFinalizeModal();
      return;
    }
    if (action === 'close-patient-payment-modal') {
      closePatientPaymentModal();
      return;
    }
    if (action === 'patient-payment-mode') {
      setPatientPaymentMode(btn.dataset.mode || 'single');
      return;
    }
    if (action === 'confirm-patient-payment') {
      const financeEntryId = btn.dataset.financeId || '';
      if (!financeEntryId) return;
      const originalLabel = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Confirmando...';
      try {
        if (financeApi.confirmPayment) {
          await financeApi.confirmPayment({ financeEntryId });
        } else {
          await financeApi.update?.({ id: financeEntryId, status: 'pago' });
        }
        btn.textContent = 'Confirmado';
        btn.classList.add('is-confirmed');
        buildProcedureToast('Recebimento confirmado. Valor atualizado no Financeiro do paciente e na Gestao.');
        emitFinanceUpdated();
        await new Promise((resolve) => setTimeout(resolve, 350));
        await refreshProcedimentos();
      } catch (err) {
        btn.disabled = false;
        btn.textContent = originalLabel || 'Confirmar recebimento';
        console.warn('[PRONTUARIO] falha ao confirmar pagamento', err);
        buildProcedureToast('Nao foi possivel confirmar o pagamento.', true);
      }
      return;
    }
    if (action === 'change-patient-payment-method') {
      const financeEntryId = btn.dataset.financeId || '';
      if (!financeEntryId) return;
      const row = (patientFinanceRows || []).find((item) => String(item?.id || '') === String(financeEntryId));
      if (!row) return;
      const currentMethod = normalizePaymentMethodUpper(row.paymentMethod || row.metodoPagamento || 'PIX');
      const sequence = ['PIX', 'CREDIT', 'DEBIT', 'CASH', 'BOLETO', 'TRANSFER', 'OTHER'];
      const currentIndex = sequence.indexOf(currentMethod);
      const nextMethod = sequence[(currentIndex + 1) % sequence.length];
      try {
        await financeApi.update?.({
          id: financeEntryId,
          paymentMethod: nextMethod,
          paymentMethodDetail: nextMethod,
          metodoPagamento: paymentMethodToFinance(nextMethod),
        });
        buildProcedureToast(`Forma de pagamento: ${paymentMethodLabel(nextMethod)}.`);
        await refreshProcedimentos();
      } catch (err) {
        console.warn('[PRONTUARIO] falha ao alterar forma de pagamento', err);
        buildProcedureToast('Nao foi possivel atualizar a forma de pagamento.', true);
      }
      return;
    }
    if (action === 'patient-payment-details') {
      const financeEntryId = btn.dataset.financeId || '';
      if (!financeEntryId) return;
      const row = (patientFinanceRows || []).find((item) => String(item?.id || '') === String(financeEntryId));
      if (!row) return;
      showPatientFinanceDetails(row);
      return;
    }
    if (action === 'edit-patient-payment') {
      const financeEntryId = btn.dataset.financeId || '';
      if (!financeEntryId) return;
      const row = (patientFinanceRows || []).find((item) => String(item?.id || '') === String(financeEntryId));
      if (!row) return;
      openPatientPaymentModalForEdit(row);
      return;
        }
    if (action === 'delete-patient-payment') {
      const financeEntryId = btn.dataset.financeId || '';
      if (!financeEntryId) return;
      const row = (patientFinanceRows || []).find((item) => String(item?.id || '') === String(financeEntryId));
      if (!row) return;
      const ok = confirm('Excluir este pagamento?');
      if (!ok) return;
      try {
        const linkedProcedureId = row?.procedureId || row?.servicoId || '';
        const linkedProcedure = linkedProcedureId ? findServiceById(linkedProcedureId) : null;
        if (linkedProcedure && servicesApi.delete && currentPatient?.prontuario) {
          await servicesApi.delete({ prontuario: currentPatient.prontuario, id: linkedProcedureId });
          emitFinanceUpdated();
          currentPatient.servicos = (Array.isArray(currentPatient.servicos) ? currentPatient.servicos : [])
            .filter((svc) => String(svc?.id || '') !== String(linkedProcedureId));
          renderProcedimentos(currentPatient.servicos, getActiveProcedimentosFilter());
          patientFinanceRows = (patientFinanceRows || []).filter((item) => String(item?.id || '') !== String(financeEntryId));
          renderPatientFinance(patientFinanceRows);
          buildProcedureToast('Pagamento e procedimento excluidos com sucesso.');
        } else {
          await financeApi.remove?.(financeEntryId);
          emitFinanceUpdated();
          patientFinanceRows = (patientFinanceRows || []).filter((item) => String(item?.id || '') !== String(financeEntryId));
          renderPatientFinance(patientFinanceRows);
          buildProcedureToast('Pagamento excluido com sucesso.');
        }
      } catch (err) {
        console.warn('[PRONTUARIO] falha ao excluir pagamento', err);
        buildProcedureToast('Nao foi possivel excluir o pagamento.', true);
      }
      return;
    }
    if (action === 'toggle-info-section') {
      const section = btn.dataset.section || '';
      const target = section ? document.getElementById(`info-section-${section}`) : null;
      if (!target) return;
      const collapsed = target.classList.toggle('hidden');
      btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      return;
    }
    if (action.startsWith('proc-')) {
      await handleProcedureAction(action, btn.dataset.serviceId);
      return;
    }
    handlePanelAction(action);
  });

  patientFinanceBody?.addEventListener('change', async (event) => {
    const field = event.target.closest('.patient-finance-method-select');
    const installmentsField = event.target.closest('.patient-finance-installments-select');
    if (!field && !installmentsField) return;
    const financeEntryId = (field || installmentsField)?.dataset.financeId || '';
    if (!financeEntryId) return;
    const row = (patientFinanceRows || []).find((item) => String(item?.id || '') === String(financeEntryId));
    if (!row) return;
    const nextMethod = normalizePaymentMethodUpper(field?.value || row.paymentMethod || row.metodoPagamento || 'PIX');
    const supportsInstallments = patientFinanceMethodSupportsInstallments(nextMethod);
    const nextInstallments = supportsInstallments
      ? Math.max(1, Number((installmentsField?.value) || row.installments || 1) || 1)
      : null;
    try {
      await financeApi.update?.({
        id: financeEntryId,
        paymentMethod: nextMethod,
        paymentMethodDetail: nextMethod,
        metodoPagamento: paymentMethodToFinance(nextMethod),
        installments: nextInstallments,
      });
      buildProcedureToast(`Pagamento atualizado: ${paymentMethodLabel(nextMethod)}${nextInstallments && nextInstallments > 1 ? ` (${nextInstallments}x)` : ''}.`);
      emitFinanceUpdated();
      await refreshProcedimentos();
    } catch (err) {
      console.warn('[PRONTUARIO] falha ao alterar forma/parcelas do pagamento', err);
      buildProcedureToast('Nao foi possivel atualizar o pagamento.', true);
      await refreshPatientFinance();
    }
  });

  btnEditProfile?.addEventListener('click', openEditProfile);
  btnGeneralInfo?.addEventListener('click', openInfoDrawer);
  btnWhatsAppPatient?.addEventListener('click', openPatientWhatsApp);
  btnNewAtestado?.addEventListener('click', openAtestadoPage);
  btnNewAnamnese?.addEventListener('click', openAnamnesePage);
  btnNewReceita?.addEventListener('click', openReceitaPage);
  btnsNovaEvolucao.forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      createEvolucao();
    });
  });

  uploadFileInput?.addEventListener('change', () => {
    const file = uploadFileInput.files?.[0] || null;
    setUploadFile(file);
  });

  uploadPhotoInput?.addEventListener('change', () => {
    const file = uploadPhotoInput.files?.[0] || null;
    setUploadFile(file);
  });

  procFinalizeForm?.addEventListener('input', () => {
    togglePaymentDueUi();
    updateProcQuickStatusUi();
    toggleProcTimerByStatus();
    computeFinalizeResumo();
    const serviceId = procFinalizeId?.value || '';
    const service = findServiceById(serviceId);
    if (service && procTimerDisplay) {
      procTimerDisplay.textContent = formatTimer(getServiceElapsedSeconds(service));
    }
  });
  procPaymentStatusRadios.forEach((radio) => {
    radio.addEventListener('change', () => {
      togglePaymentDueUi();
      updateProcQuickStatusUi();
      toggleProcTimerByStatus();
      computeFinalizeResumo();
    });
  });
  procFullStatusRadios.forEach((radio) => {
    radio.addEventListener('change', () => {
      updateProcQuickStatusUi();
      toggleProcTimerByStatus();
      computeFinalizeResumo();
    });
  });
  procQuickStatus?.addEventListener('change', () => {
    if (procQuickStatusSyncing) return;
    const next = String(procQuickStatus.value || 'CUSTOM').toUpperCase();
    if (next === 'CUSTOM') {
      updateProcQuickStatusUi();
      return;
    }
    if (next === 'PENDENTE') {
      procFullStatusRadios.forEach((r) => { r.checked = r.value === 'a-realizar'; });
      procPaymentStatusRadios.forEach((r) => { r.checked = r.value === 'PENDING'; });
      if (procFullFinishedAt) procFullFinishedAt.value = '';
      if (procPaymentPaidAt) procPaymentPaidAt.value = '';
    }
    if (next === 'PAGO') {
      procFullStatusRadios.forEach((r) => { r.checked = r.value === 'a-realizar'; });
      procPaymentStatusRadios.forEach((r) => { r.checked = r.value === 'PAID'; });
      if (procPaymentPaidAt && !procPaymentPaidAt.value) procPaymentPaidAt.value = toDateTimeLocalValue(nowIso());
      if (procFullFinishedAt) procFullFinishedAt.value = '';
    }
    if (next === 'REALIZADO') {
      procFullStatusRadios.forEach((r) => { r.checked = r.value === 'realizado'; });
      if (procFullFinishedAt && !procFullFinishedAt.value) procFullFinishedAt.value = toInputDate(nowIso());
    }
    togglePaymentDueUi();
    toggleProcTimerByStatus();
    updateProcQuickStatusUi();
    computeFinalizeResumo();
  });
  togglePaymentDueUi();
  toggleProcTimerByStatus();
  updateProcQuickStatusUi();

  uploadDrawer?.addEventListener('click', (event) => {
    if (event.target === uploadDrawer) {
      closeUploadDrawer();
    }
  });

  infoDrawer?.addEventListener('click', (event) => {
    if (event.target === infoDrawer) {
      closeInfoDrawer();
    }
  });

  anotacaoModal?.addEventListener('click', (event) => {
    if (event.target === anotacaoModal) {
      closeAnotacaoModal();
    }
  });

  anotacoesList?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="edit-anotacao"]');
    if (!button) return;
    const docId = String(button.dataset.docId || '').trim();
    if (!docId) return;
    const anotacao = docsCache.find((doc) => String(doc.id || '') === docId);
    if (!anotacao) return;
    openAnotacaoModal(anotacao);
  });

  anotacaoTexto?.addEventListener('input', () => {
    setAnotacaoStatus('');
    updateAnotacaoSubmitState();
  });

  anotacaoForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const prontuario = await ensureProntuario();
    if (!prontuario) {
      setAnotacaoStatus('Prontuario do paciente nao encontrado.', true);
      return;
    }
    const texto = String(anotacaoTexto?.value || '').trim();
    if (!texto) {
      setAnotacaoStatus('Escreva uma anotacao para continuar.', true);
      updateAnotacaoSubmitState();
      return;
    }

    anotacaoSaving = true;
    updateAnotacaoSubmitState();
    setAnotacaoStatus(editingAnotacaoId ? 'Atualizando anotacao...' : 'Salvando anotacao...');
    try {
      const now = new Date();
      const wasEditing = Boolean(editingAnotacaoId);
      const basePayload = {
        prontuario,
        pacienteId: currentPatient?.id || currentPatient?.prontuario || currentPatient?._id || '',
        pacienteNome: currentPatient?.fullName || currentPatient?.nome || '',
        profissionalId: currentUser?.id || '',
        profissionalNome: currentUser?.nome || '',
        data: now.toISOString().split('T')[0],
        texto,
        category: 'clinicos',
        title: `Anotacao ${now.toLocaleDateString('pt-BR')}`,
      };
      if (wasEditing && documentsApi.updateEvolucao) {
        await documentsApi.updateEvolucao({
          ...basePayload,
          documentId: editingAnotacaoId,
        });
      } else {
        await documentsApi.saveEvolucao?.(basePayload);
      }
      await loadDocuments({ force: true });
      closeAnotacaoModal();
      showAnotacaoToast(wasEditing ? 'Anotacao atualizada com sucesso!' : 'Anotacao salva com sucesso!');
    } catch (err) {
      console.warn('[PRONTUARIO] falha ao salvar anotacao', err);
      anotacaoSaving = false;
      updateAnotacaoSubmitState();
      setAnotacaoStatus(err?.message || 'Nao foi possivel salvar a anotacao.', true);
    }
  });

  uploadDrawerForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (uploadSaving) return;
    if (!documentsApi.upload) {
      setUploadStatus('Modulo de documentos indisponivel neste ambiente.', 'error');
      return;
    }
    const file = selectedUploadFile;
    const validationError = validateUploadFile(file);
    if (validationError) {
      setUploadStatus(validationError, 'error');
      return;
    }
    const prontuario = await ensureProntuario();
    if (!prontuario) {
      setUploadStatus('Prontuario do paciente nao encontrado.', 'error');
      return;
    }
    try {
      setUploadSaving(true);
      setUploadStatus('Enviando arquivo...');
      await documentsApi.upload({
        prontuario,
        pacienteId: currentPatient?.id || currentPatient?.prontuario || currentPatient?._id || '',
        category: 'arquivo_paciente',
        type: 'ARQUIVO',
        title: (uploadTitle?.value || '').trim() || file.name,
        folder: (uploadFolder?.value || '').trim(),
        documentDate: new Date().toISOString().split('T')[0],
        filePath: file.path || '',
        file,
        fileName: file.name || '',
        mimeType: file.type || '',
      });
      closeUploadDrawer();
      await loadDocuments({ force: true });
      setActiveTab('arquivos');
      alert('Documento anexado com sucesso.');
    } catch (err) {
      console.warn('[PRONTUARIO] falha ao enviar arquivo', err);
      setUploadStatus(err?.message || 'Nao foi possivel salvar o arquivo.', 'error');
    } finally {
      setUploadSaving(false);
    }
  });

  docsList?.addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const card = btn.closest('.doc-card');
    const docId = card?.dataset?.docId || '';
    if (!docId || !currentPatient?.prontuario) return;
    try {
      if (action === 'open-doc') {
        await documentsApi.open?.({ prontuario: currentPatient.prontuario, documentId: docId });
        return;
      }
      if (action === 'delete-doc') {
        const ok = confirm('Excluir este documento?');
        if (!ok) return;
        await documentsApi.archive?.({
          prontuario: currentPatient.prontuario,
          documentId: docId,
          archived: true,
        });
        await loadDocuments({ force: true });
      }
    } catch (err) {
      console.warn('[PRONTUARIO] nao foi possivel executar acao do documento', err);
      alert(err?.message || 'Nao foi possivel atualizar o documento.');
    }
  });

  arquivosList?.addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const card = btn.closest('.doc-card');
    const docId = card?.dataset?.docId || '';
    if (!docId || !currentPatient?.prontuario) return;
    try {
      if (action === 'open-file') {
        await documentsApi.open?.({ prontuario: currentPatient.prontuario, documentId: docId });
        return;
      }
      if (action === 'delete-file') {
        const ok = confirm('Excluir este arquivo?');
        if (!ok) return;
        await documentsApi.archive?.({
          prontuario: currentPatient.prontuario,
          documentId: docId,
          archived: true,
        });
        await loadDocuments({ force: true });
      }
    } catch (err) {
      console.warn('[PRONTUARIO] nao foi possivel executar acao do arquivo', err);
      alert(err?.message || 'Nao foi possivel atualizar o arquivo.');
    }
  });

  anamneseList?.addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const card = btn.closest('.doc-card');
    const docId = card?.dataset?.docId || '';
    if (!docId || !currentPatient?.prontuario) return;
    try {
      if (action === 'open-anamnese-doc') {
        await documentsApi.open?.({ prontuario: currentPatient.prontuario, documentId: docId });
        return;
      }
      if (action === 'delete-anamnese-doc') {
        const ok = confirm('Excluir esta anamnese?');
        if (!ok) return;
        await documentsApi.archive?.({
          prontuario: currentPatient.prontuario,
          documentId: docId,
          archived: true,
        });
        await loadDocuments({ force: true });
      }
    } catch (err) {
      console.warn('[PRONTUARIO] falha ao abrir anamnese', err);
      alert(err?.message || 'Nao foi possivel concluir a acao da anamnese.');
    }
  });

  document.addEventListener('click', (event) => {
    if (!docsNewMenu || !docsNewDropdown) return;
    if (docsNewMenu.contains(event.target)) return;
    closeNewDocMenu();
  });

  patientPaymentForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (patientPaymentSaving) return;
    if (!currentPatient) {
      setPatientPaymentModalStatus('Paciente nao carregado.', 'error');
      return;
    }
    if (!editingPatientPaymentId && !financeApi.applyPatientPayment && (!financeApi.add || !financeApi.confirmPayment)) {
      setPatientPaymentModalStatus('Funcao financeira indisponivel neste ambiente.', 'error');
      return;
    }
    if (editingPatientPaymentId && !financeApi.update) {
      setPatientPaymentModalStatus('Edicao financeira indisponivel neste ambiente.', 'error');
      return;
    }

    const descricao = (patientPaymentDescription?.value || '').trim();
    const valor = Number(String(patientPaymentValue?.value || '').replace(',', '.'));
    const mode = getPatientPaymentMode();
    const installments = mode === 'installment' ? Math.max(2, Number(patientPaymentInstallments?.value || 2)) : 1;
    const dueDate = (patientPaymentDueDate?.value || '').trim();
    const paymentMethod = normalizePaymentMethodUpper(patientPaymentMethod?.value || 'OTHER');
    const today = new Date().toISOString().slice(0, 10);

    if (!descricao) {
      setPatientPaymentModalStatus('Informe a descricao do lancamento.', 'error');
      patientPaymentDescription?.focus();
      return;
    }
    if (!Number.isFinite(valor) || valor <= 0) {
      setPatientPaymentModalStatus('Informe um valor valido maior que zero.', 'error');
      patientPaymentValue?.focus();
      return;
    }

    patientPaymentSaving = true;
    setPatientPaymentModalStatus('');
    if (patientPaymentSubmit) {
      patientPaymentSubmit.disabled = true;
      patientPaymentSubmit.textContent = 'Salvando...';
    }

    try {
      const basePayload = {
        descricao,
        valor,
        paymentMethod,
        paymentMethodDetail: paymentMethod,
        metodoPagamento: paymentMethodToFinance(paymentMethod),
        dueDate: dueDate || null,
        vencimento: dueDate || null,
        installments: installments > 1 ? installments : 1,
        patientId: currentPatient.id || currentPatient._id || '',
        prontuario: currentPatient.prontuario || '',
        paciente: currentPatient.nome || currentPatient.name || '',
      };
      if (editingPatientPaymentId) {
        const currentRow = (patientFinanceRows || []).find((r) => String(r?.id || '') === String(editingPatientPaymentId));
        const nextStatus = normalizePaymentStatusUpper(currentRow?.paymentStatus || currentRow?.status || 'PENDING');
        await financeApi.update({
          id: editingPatientPaymentId,
          ...basePayload,
          paymentStatus: nextStatus,
          status: nextStatus === 'PAID' ? 'pago' : (nextStatus === 'CANCELLED' ? 'cancelado' : 'pendente'),
        });
        setPatientPaymentModalStatus('Pagamento atualizado com sucesso.', 'success');
      } else {
        const idempotencyKey = `patient-payment:${currentPatient.id || currentPatient._id || currentPatient.prontuario || ''}:${Date.now()}`;
        if (financeApi.applyPatientPayment) {
          await financeApi.applyPatientPayment({
            patientId: currentPatient.id || currentPatient._id || '',
            prontuario: currentPatient.prontuario || '',
            amount: valor,
            valor,
            paymentMethod,
            paymentMethodDetail: paymentMethod,
            paidAt: nowIso(),
            description: descricao,
            descricao,
            metadata: {
              origin: 'prontuario_payment',
              idempotencyKey,
            },
          });
        } else {
          const addResult = await financeApi.add({
            tipo: 'receita',
            categoria: 'outros',
            origem: 'prontuario',
            data: today,
            ...basePayload,
            status: 'pago',
            paymentStatus: 'PAID',
            procedimento: '',
            metadata: {
              receivedOnly: true,
              origin: 'prontuario_payment',
              idempotencyKey,
            },
          });
          const financeEntryId = addResult?.lancamento?.id || addResult?.id || '';
          if (financeEntryId && financeApi.confirmPayment) {
            await financeApi.confirmPayment({
              financeEntryId,
              amount: valor,
              paymentMethod,
              paymentMethodDetail: paymentMethod,
              paidAt: nowIso(),
              metadata: {
                receivedOnly: true,
                origin: 'prontuario_payment',
                idempotencyKey: `patient-payment-confirm:${financeEntryId}:${valor}`,
              },
            });
          }
        }
        setPatientPaymentModalStatus('Pagamento adicionado com sucesso.', 'success');
      }
      emitFinanceUpdated();
      await refreshPatientFinance();
      buildProcedureToast(editingPatientPaymentId ? 'Pagamento atualizado no Financeiro do paciente.' : 'Lancamento adicionado no Financeiro do paciente.');
      setTimeout(() => closePatientPaymentModal(), 250);
    } catch (err) {
      console.warn('[PRONTUARIO] falha ao adicionar pagamento manual', err);
      setPatientPaymentModalStatus(err?.message || 'Nao foi possivel salvar o pagamento.', 'error');
      if (patientPaymentSubmit) {
        patientPaymentSubmit.disabled = false;
        patientPaymentSubmit.textContent = 'Salvar';
      }
      patientPaymentSaving = false;
    }
  });

  patientPaymentForm?.addEventListener('input', () => {
    if (patientPaymentStatus?.textContent) setPatientPaymentModalStatus('');
  });

  procEditForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!currentPatient?.prontuario || !procEditId?.value) return;
    const serviceId = procEditId.value;
    const base = findServiceById(serviceId) || {};

    const nameValue = (procEditName?.value || '').trim();
    const valorRaw = (procEditValor?.value || '').replace(/[^0-9,.-]/g, '').replace('.', '').replace(',', '.');
    const valor = parseFloat(valorRaw) || 0;
    const dentes = parseDentesInput(procEditDentes?.value || '');
    const profissional = (procEditProfissional?.value || '').trim();
    const obs = (procEditObs?.value || '').trim();
    const statusValue = procEditStatusRadios.find((r) => r.checked)?.value || normalizeEstado(base.status || base.estado || base.situacao);
    const faces = procEditFaces.filter((b) => b.checked).map((b) => b.value);
    const realizadoEm = procEditRealizado?.value ? new Date(procEditRealizado.value + 'T00:00:00').toISOString() : '';

    const updated = {
      id: serviceId,
      tipo: nameValue || base.tipo || base.nome || base.procedimento,
      nome: nameValue || base.nome || base.tipo || base.procedimento,
      valor,
      dentes,
      faces,
      dentistaNome: profissional || base.dentistaNome,
      status: statusValue,
      dataRealizacao: realizadoEm,
      observacoes: obs,
      gerarFinanceiro: Boolean(procEditFinanceiro?.checked),
    };

    try {
      await servicesApi.update?.({ prontuario: currentPatient.prontuario, service: updated });
      closeProcEditModal();
      document.body.style.overflow = '';
      await refreshProcedimentos();
    } catch (err) {
      console.warn('[PRONTUARIO] falha ao salvar edicao do procedimento', err);
      alert('Nao foi possivel salvar as alteracoes.');
    }
  });

  procFinalizeForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (procedureFinalizeSaving) return;
    const serviceId = procFinalizeId?.value || '';
    if (!serviceId || !currentPatient?.prontuario) return;
    const summary = computeFinalizeResumo();
    const base = findServiceById(serviceId) || {};
    const elapsed = getServiceElapsedSeconds(base);
    const tempoMinutos = summary.tempoMinutos || Math.floor(elapsed / 60);
    const isEditCostsMode = procFinalizeMode === 'edit';
    const editorFields = collectProcFinalizeEditorFields(base);
    const baseStatus = normalizeEstado(base.status || base.estado || base.situacao);
    const resolvedPaidAt = isEditCostsMode
      ? (base?.financeiro?.paidAt || summary.financeiro.paidAt)
      : summary.financeiro.paidAt;
    const submitBtn = procFinalizeForm?.querySelector('button[type=\"submit\"]');
    procedureFinalizeSaving = true;
    if (submitBtn) submitBtn.disabled = true;
    try {
      const patchBase = {
        tipo: editorFields.tipo,
        nome: editorFields.nome,
        dentes: editorFields.dentes,
        faces: editorFields.faces,
        dentistaNome: editorFields.dentistaNome,
        observacoes: editorFields.observacoes,
        gerarFinanceiro: editorFields.gerarFinanceiro,
        registeredAt: editorFields.registeredAt,
        valorCobrado: summary.valorCobrado,
        tempoMinutos,
        custos: summary.custos,
        custoTotal: summary.custoTotal,
        lucro: summary.lucro,
        lucroPorHora: tempoMinutos > 0 ? (summary.lucro / (tempoMinutos / 60)) : 0,
        paymentStatus: summary.financeiro.paymentStatus,
        paymentMethod: summary.financeiro.paymentMethod,
        vencimento: summary.financeiro.dueDate,
        financeiro: {
          ...(base.financeiro || {}),
          ...(editorFields.financeiro || {}),
          paymentStatus: editorFields.financeiro.paymentStatus || summary.financeiro.paymentStatus,
          paymentMethod: editorFields.financeiro.paymentMethod || summary.financeiro.paymentMethod,
          paidAt: editorFields.financeiro.paymentStatus === 'PAID'
            ? (editorFields.financeiro.paidAt || resolvedPaidAt)
            : null,
          dueDate: editorFields.financeiro.dueDate ?? summary.financeiro.dueDate,
          installments: editorFields.financeiro.installments ?? summary.financeiro.installments,
          financeEntryId: base?.financeiro?.financeEntryId || base?.financeiroId || '',
        },
        timer: {
          startedAt: null,
          isRunning: false,
          accumulatedSeconds: elapsed,
        },
      };

      const patch = isEditCostsMode
        ? {
            ...patchBase,
            status: editorFields.status || baseStatus || 'a-realizar',
            dataRealizacao: editorFields.dataRealizacao,
            statusFinanceiroProcedimento: ((editorFields.status || baseStatus || '') === 'realizado')
              ? 'finalizado'
              : 'rascunho',
          }
        : {
            ...patchBase,
            statusFinanceiroProcedimento: 'finalizado',
            status: 'realizado',
            dataRealizacao: editorFields.dataRealizacao || nowIso(),
          };

      const result = await saveServicePatch(serviceId, {
        ...patch,
      });
      const financeCreated = Boolean(result?.financeCreated);
      buildProcedureToast(
        isEditCostsMode
          ? 'Custos/tempo do procedimento atualizados.'
          : (
            financeCreated
              ? 'Procedimento finalizado e lancamento criado no Financeiro.'
              : 'Procedimento finalizado e lancamento atualizado no Financeiro.'
          )
      );
      emitFinanceUpdated();
      closeProcFinalizeModal();
      await refreshPatientFinance();
    } catch (err) {
      console.warn('[PRONTUARIO] falha ao finalizar procedimento', err);
      buildProcedureToast('Nao foi possivel finalizar o procedimento.', true);
    } finally {
      procedureFinalizeSaving = false;
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  window.addEventListener('finance-updated', () => {
    syncFinanceViews().catch((err) => console.warn('[PRONTUARIO] falha ao sincronizar financeiro apos evento.', err));
  });
  window.addEventListener('storage', (event) => {
    if (event.key !== getClinicStorageKey('voithos-finance-updated')) return;
    syncFinanceViews().catch((err) => console.warn('[PRONTUARIO] falha ao sincronizar financeiro apos storage.', err));
  });

  (async () => {
    const started = prontuarioNowMs();
    renderProntuarioShell();
    try {
      await loadCurrentUser();
      syncDocumentsUiPermissions();
      const storedPatient = await loadPatientFromStorage();
      if (storedPatient) {
        const cachedHeader = readPatientHeaderCache(storedPatient);
        currentPatient = cachedHeader ? { ...cachedHeader, ...storedPatient } : storedPatient;
        updateHeader(currentPatient);
        renderConsultas(currentPatient?.consultas || []);
        if (Array.isArray(currentPatient?.servicos) && currentPatient.servicos.length) {
          renderProcedimentos(currentPatient.servicos, getActiveProcedimentosFilter());
          updateFinanceMetrics(currentPatient.servicos);
          applyOdontogramaSelections(currentPatient.servicos);
        }
        applyProntuarioEntryNavigation();
        prontuarioPerfLog(cachedHeader ? 'patient_cache_hit' : 'patient_cache_miss', started, {
          patientId: getPatientKey(currentPatient),
        });
        loadProcedures().catch((err) => console.warn('[PRONTUARIO] catalogo carregara sob demanda', err));
        fetchPatient(storedPatient).then((full) => {
          currentPatient = full || currentPatient;
          updateHeader(currentPatient);
          renderConsultas(currentPatient?.consultas || []);
          refreshProcedimentos({ awaitFinance: false }).catch((err) => {
            console.warn('[PRONTUARIO] nao foi possivel carregar procedimentos em background', err);
          });
          loadDocuments().catch((err) => {
            console.warn('[PRONTUARIO] nao foi possivel carregar documentos em background', err);
          });
          if (document.getElementById('tab-consultas')?.classList.contains('active')) {
            loadConsultasTab({ sync: true }).catch((err) => {
              console.warn('[PRONTUARIO] nao foi possivel carregar consultas na entrada', err);
            });
          }
          if (document.getElementById('tab-financeiro')?.classList.contains('active')) {
            refreshPatientFinance().catch((err) => {
              console.warn('[PRONTUARIO] nao foi possivel carregar financeiro na entrada', err);
            });
          }
        }).catch((err) => {
          console.warn('[PRONTUARIO] falha ao revalidar paciente em background', err);
        });
        prontuarioPerfLog('init_done', started, { mode: 'background_revalidate' });
        return;
      }
      renderProntuarioNoPatient();
      prontuarioPerfLog('init_no_patient', started);
    } catch (err) {
      console.warn('[PRONTUARIO] falha ao inicializar prontuario', err);
      renderProcedimentos(currentPatient?.servicos || [], getActiveProcedimentosFilter(), {
        error: err?.message || 'Nao foi possivel carregar os dados do prontuario.',
      });
      renderPatientFinance([], {
        error: 'Nao foi possivel carregar os dados financeiros do paciente.',
      });
      renderAnotacoes([], {
        error: 'Nao foi possivel carregar as anotacoes do paciente.',
      });
    }
  })();
});















