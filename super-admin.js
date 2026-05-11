document.addEventListener('DOMContentLoaded', () => {
  const appApi = window.appApi || {};
  const authApi = appApi.auth || {};
  const clinicForm = document.getElementById('clinic-form');
  const btnCreate = document.getElementById('btn-create-clinic');
  const clinicsList = document.getElementById('clinics-list');
  const createError = document.getElementById('create-error');
  const dashboardError = document.getElementById('dashboard-error');
  const dashboardMetrics = document.getElementById('dashboard-metrics');
  const dashboardStages = document.getElementById('dashboard-stages');
  const dashboardPlans = document.getElementById('dashboard-plans');
  const dashboardRecentEntries = document.getElementById('dashboard-recent-entries');
  const dashboardPendingSignups = document.getElementById('dashboard-pending-signups');
  const dashboardStatus = document.getElementById('dashboard-status');
  const btnRefreshDashboard = document.getElementById('btn-refresh-dashboard');
  const clinicSearchInput = document.getElementById('clinic-search');
  const clinicStageFilter = document.getElementById('clinic-stage-filter');
  const btnLogout = document.getElementById('btn-logout');
  const btnOpenWhatsappSupport = document.getElementById('btn-open-whatsapp-support');
  const promotionForm = document.getElementById('promotion-form');
  const promotionList = document.getElementById('promotion-list');
  const promotionStatus = document.getElementById('promotion-status');
  const promotionError = document.getElementById('promotion-error');
  const btnCreatePromotion = document.getElementById('btn-create-promotion');
  const btnRefreshPromotions = document.getElementById('btn-refresh-promotions');

  const successModal = document.getElementById('success-modal');
  const successClinicName = document.getElementById('success-clinic-name');
  const successAdminEmail = document.getElementById('success-admin-email');
  const successAdminPassword = document.getElementById('success-admin-password');
  const btnCopyCredentials = document.getElementById('btn-copy-credentials');
  const btnOpenCreatedClinic = document.getElementById('btn-open-created-clinic');
  const btnCloseSuccessModal = document.getElementById('btn-close-success-modal');
  const btnCloseSuccessModalX = document.getElementById('btn-close-success-modal-x');

  const clinicCredentialsCache = new Map();
  const dashboardClinicMap = new Map();
  const pendingCleanupIds = new Set();
  const promotionActionIds = new Set();
  let clinicsCache = [];
  let promotionOffersCache = [];
  let dashboardCache = null;
  let lastCreatedClinicId = '';

  const setError = (message) => {
    if (createError) createError.textContent = message || '';
  };

  const setDashboardError = (message) => {
    if (dashboardError) dashboardError.textContent = message || '';
  };

  const setDashboardStatus = (message) => {
    if (!dashboardStatus) return;
    const text = String(message || '').trim();
    dashboardStatus.textContent = text;
    dashboardStatus.hidden = !text;
  };

  const setPromotionError = (message) => {
    if (promotionError) promotionError.textContent = message || '';
  };

  const setPromotionStatus = (message) => {
    if (!promotionStatus) return;
    const text = String(message || '').trim();
    promotionStatus.textContent = text;
    promotionStatus.hidden = !text;
  };

  const getPromotionCreateErrorMessage = (error) => {
    const status = Number(error?.status || 0);
    const code = String(error?.code || '').trim().toUpperCase();
    const message = String(error?.message || '').trim();

    if (status === 401 || code === 'UNAUTHORIZED') {
      return 'Sessao expirada. Entre novamente como superadmin para criar links promocionais.';
    }
    if (status === 403 || code === 'FORBIDDEN') {
      return 'Seu usuario autenticado nao tem permissao de superadmin para criar links promocionais.';
    }
    if (status === 400 || code === 'VALIDATION_ERROR') {
      return message || 'Revise os dados da oferta promocional.';
    }
    if (status === 409 || code === 'PROMOTION_CODE_EXISTS') {
      return message || 'Este codigo promocional ja existe. Use outro codigo.';
    }
    return message || 'Falha ao criar link promocional.';
  };

  const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value || 0));

  const formatDateTime = (value) => {
    const parsed = value ? new Date(value) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) return '-';
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(parsed);
  };

  const formatPlanLabel = (plan) => {
    const labels = {
      MONTHLY: 'Mensal',
      QUARTERLY: 'Trimestral',
      SEMIANNUAL: 'Semestral',
      ANNUAL: 'Anual',
    };
    return labels[String(plan || '').trim().toUpperCase()] || '-';
  };

  const formatOperationLabel = (operationType) => {
    const labels = {
      AUTONOMOUS_DENTIST: 'Dentista autonomo',
      CLINIC: 'Clinica',
      OTHER: 'Outros',
    };
    return labels[String(operationType || '').trim().toUpperCase()] || '-';
  };

  const formatStageLabel = (stage, fallback = '') => {
    const labels = {
      ACTIVE: 'Ativa',
      EMAIL_VERIFICATION_PENDING: 'Pendente de verificacao',
      PROFILE_PENDING: 'Pendente de perfil',
      PAYMENT_PENDING: 'Aguardando pagamento',
      GRACE_PERIOD: 'Em tolerancia',
      BLOCKED: 'Bloqueada',
      CANCELED: 'Cancelada',
    };
    const normalized = String(stage || '').trim().toUpperCase();
    return labels[normalized] || fallback || normalized || 'Etapa';
  };

  const getBadgeClass = (stage) => {
    const normalized = String(stage || '').trim().toUpperCase();
    if (['BLOCKED', 'CANCELED'].includes(normalized)) return 'badge is-danger';
    if (['EMAIL_VERIFICATION_PENDING', 'PROFILE_PENDING', 'PAYMENT_PENDING', 'GRACE_PERIOD'].includes(normalized)) return 'badge is-warn';
    if (normalized === 'ACTIVE') return 'badge';
    return 'badge is-neutral';
  };

  const copyText = async (text) => {
    if (!text) return;
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const temp = document.createElement('textarea');
    temp.value = text;
    temp.style.position = 'fixed';
    temp.style.left = '-9999px';
    document.body.appendChild(temp);
    temp.select();
    document.execCommand('copy');
    document.body.removeChild(temp);
  };

  const closeSuccessModal = () => {
    if (!successModal) return;
    successModal.classList.remove('is-open');
    successModal.hidden = true;
  };

  const openSuccessModal = ({ clinicId, clinicName, email, senhaTemporaria }) => {
    if (!successModal) return;
    lastCreatedClinicId = clinicId;
    if (successClinicName) successClinicName.textContent = clinicName || '';
    if (successAdminEmail) successAdminEmail.textContent = email || '-';
    if (successAdminPassword) successAdminPassword.textContent = senhaTemporaria || '-';
    successModal.hidden = false;
    successModal.classList.add('is-open');
  };

  const buildCredentialsLabel = (credentials) => {
    if (!credentials?.email || !credentials?.senhaTemporaria) return '';
    return `Email: ${credentials.email}\nSenha temporaria: ${credentials.senhaTemporaria}`;
  };

  const impersonateClinic = async (clinicId) => {
    const targetClinicId = String(clinicId || '').trim();
    if (!targetClinicId) {
      setError('Clinica invalida para abrir.');
      return;
    }

    try {
      await authApi.impersonateClinic(targetClinicId);
      window.location.href = 'index.html';
    } catch (err) {
      setError(err?.message || 'Falha ao abrir clinica.');
    }
  };

  const renderMetricCards = (summary = {}) => {
    if (!dashboardMetrics) return;
    const cards = [
      {
        label: 'Clinicas totais',
        value: Number(summary.totalClinics || 0),
        subcopy: `${Number(summary.clinicsCreatedToday || 0)} hoje | ${Number(summary.clinicsCreatedLast7Days || 0)} nos ultimos 7 dias`,
      },
      {
        label: 'Aguardando e-mail',
        value: Number(summary.activePendingSignups || 0),
        subcopy: `${Number(summary.pendingSignupsCreatedToday || 0)} novos hoje`,
      },
      {
        label: 'Aguardando perfil',
        value: Number(summary.clinicsAwaitingProfile || 0),
        subcopy: 'Clinicas criadas sem perfil operacional definido',
      },
      {
        label: 'Aguardando pagamento',
        value: Number(summary.clinicsAwaitingPayment || 0),
        subcopy: `${Number(summary.activeSubscriptions || 0)} ativas | ${Number(summary.gracePeriodSubscriptions || 0)} em tolerancia`,
      },
    ];

    dashboardMetrics.innerHTML = cards.map((card) => `
      <article class="metric-card">
        <div class="metric-label">${card.label}</div>
        <div class="metric-value">${card.value}</div>
        <div class="metric-subcopy">${card.subcopy}</div>
      </article>
    `).join('');
  };

  const renderKeyValuePanel = (container, items = [], emptyLabel) => {
    if (!container) return;
    if (!items.length) {
      container.innerHTML = `<div class="list-empty">${emptyLabel}</div>`;
      return;
    }
    container.innerHTML = items.map((item) => `
      <div class="stage-item">
        <div class="stage-item-header">
          <span class="stage-item-label">${item.label}</span>
          <span class="stage-item-value">${item.value}</span>
        </div>
        ${item.subcopy ? `<div class="activity-meta">${item.subcopy}</div>` : ''}
      </div>
    `).join('');
  };

  const renderRecentEntries = (entries = []) => {
    if (!dashboardRecentEntries) return;
    if (!entries.length) {
      dashboardRecentEntries.innerHTML = '<div class="list-empty">Nenhuma atividade recente do funil.</div>';
      return;
    }

    dashboardRecentEntries.innerHTML = entries.map((entry) => `
      <article class="activity-item">
        <div class="activity-item-header">
          <div class="activity-title">${entry.nomeFantasia || entry.nomeClinica || entry.email || entry.clinicId || 'Registro do onboarding'}</div>
          <span class="${getBadgeClass(entry.stage)}">${entry.stageLabel || entry.stage || 'Etapa'}</span>
        </div>
        <div class="activity-meta">
          ${entry.entryType === 'pending_signup'
            ? `Lead pendente | ${entry.email || '-'} | Plano ${formatPlanLabel(entry.selectedPlan)}`
            : `Clinica ${entry.clinicId || '-'} | ${entry.adminEmail || entry.clinicEmail || '-'} | Plano ${formatPlanLabel(entry.selectedPlan)}`}
        </div>
        <div class="activity-submeta">
          ${entry.operationType ? `Perfil ${formatOperationLabel(entry.operationType)} | ` : ''}Atualizado em ${formatDateTime(entry.sortDate || entry.updatedAt || entry.createdAt)}
        </div>
      </article>
    `).join('');
  };

  const renderPendingSignups = (entries = []) => {
    if (!dashboardPendingSignups) return;
    if (!entries.length) {
      dashboardPendingSignups.innerHTML = '<div class="list-empty">Nenhum cadastro pendente para limpeza.</div>';
      return;
    }

    dashboardPendingSignups.innerHTML = entries.map((entry) => {
      const canDelete = ['EMAIL_VERIFICATION_PENDING', 'PAYMENT_PENDING'].includes(String(entry.stage || '').trim().toUpperCase());
      const isLoading = pendingCleanupIds.has(String(entry.id || '').trim());
      return `
        <article class="activity-item" data-pending-id="${String(entry.id || '')}">
          <div class="activity-item-header">
            <div class="activity-title">${entry.nomeClinica || entry.responsavelNome || entry.email || 'Cadastro pendente'}</div>
            <span class="${getBadgeClass(entry.stage)}">${formatStageLabel(entry.stage, entry.stageLabel)}</span>
          </div>
          <div class="activity-meta">
            ${entry.email || '-'} | Plano ${formatPlanLabel(entry.selectedPlan)} | Responsavel ${entry.responsavelNome || '-'}
          </div>
          <div class="activity-submeta">
            Criado em ${formatDateTime(entry.createdAt)} | Atualizado em ${formatDateTime(entry.updatedAt)}
          </div>
          <div class="clinic-actions">
            ${canDelete ? `<button type="button" class="btn-outline" data-action="delete-pending" data-pending-id="${String(entry.id || '')}" ${isLoading ? 'disabled' : ''}>${isLoading ? 'Excluindo...' : 'Excluir pendente'}</button>` : ''}
          </div>
        </article>
      `;
    }).join('');
  };

  const getPromotionStatus = (offer = {}) => {
    if (offer.active === false) return { label: 'Inativa', className: 'badge is-neutral' };
    const validUntil = offer.validUntil ? new Date(offer.validUntil).getTime() : 0;
    if (validUntil && validUntil < Date.now()) return { label: 'Expirada', className: 'badge is-danger' };
    if (offer.maxUses !== null && offer.maxUses !== undefined && Number(offer.usedCount || 0) >= Number(offer.maxUses)) {
      return { label: 'Limite atingido', className: 'badge is-warn' };
    }
    return { label: 'Ativa', className: 'badge' };
  };

  const renderPromotionOffers = (offers = []) => {
    if (!promotionList) return;
    const list = Array.isArray(offers) ? offers : [];
    if (!list.length) {
      promotionList.className = 'list-empty';
      promotionList.textContent = 'Nenhum link promocional criado.';
      return;
    }

    promotionList.className = 'promotion-list';
    promotionList.innerHTML = list.map((offer) => {
      const status = getPromotionStatus(offer);
      const id = String(offer.id || '').trim();
      const isBusy = promotionActionIds.has(id);
      return `
        <article class="promotion-item" data-promotion-id="${id}">
          <div class="promotion-topline">
            <div>
              <div class="promotion-title">${offer.title || 'Oferta sem nome'}</div>
              <div class="promotion-code">${offer.code || '-'}</div>
            </div>
            <span class="${status.className}">${status.label}</span>
          </div>
          <div class="clinic-meta">Plano: ${formatPlanLabel(offer.planType)} | Origem: ${offer.source || 'MANUAL'}</div>
          <div class="clinic-meta">Preco: ${formatCurrency(offer.regularPrice)} por <strong>${formatCurrency(offer.promotionalPrice)}</strong></div>
          <div class="clinic-meta">Validade: ${formatDateTime(offer.validUntil)} | Usos: ${Number(offer.usedCount || 0)}${offer.maxUses ? `/${offer.maxUses}` : ''}</div>
          <div class="clinic-meta">Alvo: ${offer.targetEmail || offer.targetPhone || 'Livre'} | Link: ${offer.link || '-'}</div>
          <div class="clinic-actions">
            <button type="button" data-action="copy-promotion-link" data-promotion-id="${id}">Copiar link</button>
            <button type="button" data-action="copy-promotion-code" data-promotion-id="${id}">Copiar codigo</button>
            ${offer.active !== false ? `<button type="button" class="btn-outline" data-action="deactivate-promotion" data-promotion-id="${id}" ${isBusy ? 'disabled' : ''}>${isBusy ? 'Desativando...' : 'Desativar'}</button>` : ''}
          </div>
        </article>
      `;
    }).join('');
  };

  const renderDashboard = (dashboard = null) => {
    dashboardCache = dashboard;
    const summary = dashboard?.summary || {};
    const stageBreakdown = dashboard?.stageBreakdown || {};
    const planBreakdown = dashboard?.planBreakdown || {};
    const clinicSnapshots = Array.isArray(dashboard?.clinicSnapshots) ? dashboard.clinicSnapshots : [];
    dashboardClinicMap.clear();
    clinicSnapshots.forEach((snapshot) => {
      dashboardClinicMap.set(String(snapshot?.clinicId || '').trim(), snapshot);
    });

    renderMetricCards(summary);
    renderKeyValuePanel(dashboardStages, [
      { label: 'Confirmacao de e-mail', value: Number(stageBreakdown.EMAIL_VERIFICATION_PENDING || 0) },
      { label: 'Aguardando perfil', value: Number(stageBreakdown.PROFILE_PENDING || 0) },
      { label: 'Aguardando pagamento', value: Number(stageBreakdown.PAYMENT_PENDING || 0) },
      { label: 'Onboarding concluido', value: Number(stageBreakdown.ACTIVE || 0) },
      { label: 'Em tolerancia', value: Number(stageBreakdown.GRACE_PERIOD || 0) },
      { label: 'Bloqueadas', value: Number(stageBreakdown.BLOCKED || 0) },
      { label: 'Canceladas', value: Number(stageBreakdown.CANCELED || 0) },
    ], 'Nenhuma etapa ativa no momento.');
    renderKeyValuePanel(dashboardPlans, [
      { label: 'Mensal', value: Number(planBreakdown.MONTHLY || 0) },
      { label: 'Trimestral', value: Number(planBreakdown.QUARTERLY || 0) },
      { label: 'Semestral', value: Number(planBreakdown.SEMIANNUAL || 0) },
      { label: 'Anual', value: Number(planBreakdown.ANNUAL || 0) },
    ], 'Nenhum plano em andamento.');
    renderRecentEntries(Array.isArray(dashboard?.recentEntries) ? dashboard.recentEntries : []);
    renderPendingSignups(Array.isArray(dashboard?.pendingSignups) ? dashboard.pendingSignups : []);
    renderClinics(clinicsCache);
  };

  const getClinicStageSnapshot = (clinicId) => dashboardClinicMap.get(String(clinicId || '').trim()) || null;

  const filterClinics = (clinics = []) => {
    const query = String(clinicSearchInput?.value || '').trim().toLowerCase();
    const stageFilter = String(clinicStageFilter?.value || '').trim().toUpperCase();

    return (Array.isArray(clinics) ? clinics : []).filter((clinic) => {
      const clinicId = String(clinic.clinicId || '').trim();
      const snapshot = getClinicStageSnapshot(clinicId);
      const haystack = [
        clinicId,
        clinic?.nomeFantasia,
        clinic?.razaoSocial,
        clinic?.cnpjOuCpf,
        clinic?.email,
        snapshot?.adminEmail,
        snapshot?.clinicEmail,
      ].map((value) => String(value || '').trim().toLowerCase()).join(' ');

      if (query && !haystack.includes(query)) return false;
      if (stageFilter) {
        const normalizedStage = String(snapshot?.stage || '').trim().toUpperCase();
        if (normalizedStage !== stageFilter) return false;
      }
      return true;
    });
  };

  const renderClinics = (clinics) => {
    if (!clinicsList) return;
    const filteredClinics = filterClinics(clinics);
    if (!filteredClinics.length) {
      clinicsList.innerHTML = '<div class="list-empty">Nenhuma clinica cadastrada.</div>';
      return;
    }

    clinicsList.innerHTML = filteredClinics.map((clinic) => {
      const status = clinic.status === 'active' ? 'Ativa' : 'Suspensa';
      const clinicId = String(clinic.clinicId || '');
      const hasCredentials = clinicCredentialsCache.has(clinicId);
      const snapshot = getClinicStageSnapshot(clinicId);
      const stageLabel = formatStageLabel(snapshot?.stage, snapshot?.stageLabel || 'Sem telemetria');
      const canDeletePending = String(snapshot?.stage || '').trim().toUpperCase() === 'PAYMENT_PENDING';
      const isDeletingPending = pendingCleanupIds.has(clinicId);
      return `
        <article class="clinic-item" data-clinic-id="${clinicId}">
          <div class="clinic-topline">
            <div class="clinic-name">${clinic.nomeFantasia || clinic.razaoSocial || 'Sem nome'}</div>
            <span class="${getBadgeClass(snapshot?.stage)}">${stageLabel}</span>
          </div>
          <div class="clinic-meta">ID: ${clinicId}</div>
          <div class="clinic-meta">CNPJ/CPF: ${clinic.cnpjOuCpf || '-'}</div>
          <div class="clinic-meta">Telefone: ${clinic.telefone || clinic.telefoneComercial || snapshot?.clinicPhone || '-'}</div>
          <div class="clinic-meta">Status: ${status}</div>
          <div class="clinic-meta">Plano: ${formatPlanLabel(snapshot?.selectedPlan)} | Perfil: ${formatOperationLabel(snapshot?.operationType)}</div>
          <div class="clinic-meta">Origem: ${snapshot?.promotionCode ? `Promocao ${snapshot.promotionCode}` : (snapshot?.acquisitionSource || 'landing')}</div>
          <div class="clinic-meta">Admin: ${snapshot?.adminEmail || '-'}</div>
          <div class="clinic-meta">Atualizado: ${formatDateTime(snapshot?.onboardingUpdatedAt || snapshot?.updatedAt || clinic?.updatedAt)}</div>
          <div class="clinic-actions">
            <button type="button" class="btn-primary" data-action="open-clinic" data-clinic-id="${clinicId}">Abrir clinica</button>
            <button type="button" data-action="copy-id" data-clinic-id="${clinicId}">Copiar ID</button>
            ${hasCredentials ? `<button type="button" data-action="copy-credentials" data-clinic-id="${clinicId}">Copiar credenciais</button>` : ''}
            ${canDeletePending ? `<button type="button" class="btn-outline" data-action="delete-pending" data-pending-id="${clinicId}" ${isDeletingPending ? 'disabled' : ''}>${isDeletingPending ? 'Excluindo...' : 'Excluir pendente'}</button>` : ''}
          </div>
        </article>
      `;
    }).join('');
  };

  const ensureSuperAdmin = async () => {
    const user = await authApi.currentUser();
    if (!user) {
      window.location.href = 'login.html';
      return null;
    }
    if (user.tipo !== 'super_admin') {
      window.location.href = 'index.html';
      return null;
    }
    return user;
  };

  const loadClinics = async () => {
    try {
      const clinics = await authApi.listClinics();
      clinicsCache = clinics || [];
      renderClinics(clinicsCache);
      return clinicsCache;
    } catch (err) {
      clinicsList.textContent = err?.message || 'Falha ao carregar clinicas.';
      return [];
    }
  };

  const loadDashboard = async () => {
    if (!authApi?.getOnboardingDashboard) return null;
    try {
      setDashboardError('');
      const dashboard = await authApi.getOnboardingDashboard();
      renderDashboard(dashboard || null);
      return dashboard || null;
    } catch (err) {
      setDashboardError(err?.message || 'Falha ao carregar o dashboard do onboarding.');
      return null;
    }
  };

  const loadPromotionOffers = async () => {
    if (!authApi?.listPromotionOffers) {
      if (promotionList) promotionList.textContent = 'Links promocionais indisponiveis neste ambiente.';
      return [];
    }
    try {
      setPromotionError('');
      const offers = await authApi.listPromotionOffers();
      promotionOffersCache = Array.isArray(offers) ? offers : [];
      renderPromotionOffers(promotionOffersCache);
      return promotionOffersCache;
    } catch (err) {
      setPromotionError(err?.message || 'Falha ao carregar links promocionais.');
      renderPromotionOffers([]);
      return [];
    }
  };

  const refreshSuperAdminData = async () => {
    const [dashboard] = await Promise.all([
      loadDashboard(),
      loadClinics(),
      loadPromotionOffers(),
    ]);
    return dashboard;
  };

  const getDefaultPlanPrice = (planType) => ({
    MONTHLY: '94.90',
    QUARTERLY: '269.90',
    SEMIANNUAL: '499.90',
    ANNUAL: '899.90',
  }[String(planType || '').trim().toUpperCase()] || '899.90');

  const collectPromotionPayload = () => ({
    title: String(document.getElementById('promotion-title')?.value || '').trim(),
    code: String(document.getElementById('promotion-code')?.value || '').trim(),
    planType: String(document.getElementById('promotion-plan')?.value || '').trim(),
    regularPrice: Number(document.getElementById('promotion-regular-price')?.value || 0),
    promotionalPrice: Number(document.getElementById('promotion-price')?.value || 0),
    validUntil: String(document.getElementById('promotion-valid-until')?.value || '').trim(),
    maxUses: String(document.getElementById('promotion-max-uses')?.value || '').trim(),
    source: String(document.getElementById('promotion-source')?.value || 'MANUAL').trim(),
    targetEmail: String(document.getElementById('promotion-target-email')?.value || '').trim(),
    targetPhone: String(document.getElementById('promotion-target-phone')?.value || '').trim(),
    notes: String(document.getElementById('promotion-notes')?.value || '').trim(),
  });

  document.getElementById('promotion-plan')?.addEventListener('change', (event) => {
    const regularPriceInput = document.getElementById('promotion-regular-price');
    if (regularPriceInput) regularPriceInput.value = getDefaultPlanPrice(event.target?.value);
  });

  btnCreatePromotion?.addEventListener('click', async () => {
    if (!authApi?.createPromotionOffer) {
      setPromotionError('Criacao de links promocionais indisponivel neste ambiente.');
      return;
    }
    const payload = collectPromotionPayload();
    if (!payload.title || !payload.planType || !payload.regularPrice || !payload.promotionalPrice) {
      setPromotionError('Preencha nome, plano, preco normal e preco promocional.');
      return;
    }

    btnCreatePromotion.disabled = true;
    setPromotionError('');
    setPromotionStatus('Criando oferta...');
    try {
      const created = await authApi.createPromotionOffer(payload);
      promotionForm?.reset();
      const regularPriceInput = document.getElementById('promotion-regular-price');
      if (regularPriceInput) regularPriceInput.value = getDefaultPlanPrice('ANNUAL');
      setPromotionStatus(`Link promocional criado: ${created?.link || created?.code || ''}`);
      await loadPromotionOffers();
    } catch (err) {
      setPromotionError(getPromotionCreateErrorMessage(err));
      setPromotionStatus('');
    } finally {
      btnCreatePromotion.disabled = false;
    }
  });

  btnRefreshPromotions?.addEventListener('click', () => {
    loadPromotionOffers();
  });

  btnCreate?.addEventListener('click', async () => {
    setError('');

    const clinicNomeInput = String(document.getElementById('clinic-nome')?.value || '').trim();
    const clinicRazaoInput = String(document.getElementById('clinic-razao')?.value || '').trim();
    const clinicCnpjInput = String(document.getElementById('clinic-cnpj')?.value || '').trim();

    const payload = {
      clinic: {
        nomeFantasia: clinicNomeInput,
        razaoSocial: clinicRazaoInput,
        cnpjOuCpf: clinicCnpjInput,
        emailClinica: String(document.getElementById('clinic-email')?.value || '').trim(),
        telefone: String(document.getElementById('clinic-telefone')?.value || '').trim(),
        whatsapp: String(document.getElementById('clinic-whatsapp')?.value || '').trim(),
      },
      admin: {
        nome: String(document.getElementById('admin-nome')?.value || '').trim(),
        email: String(document.getElementById('admin-email')?.value || '').trim().toLowerCase(),
      },
    };

    if (!payload.clinic.nomeFantasia || !payload.clinic.razaoSocial || !payload.clinic.cnpjOuCpf || !payload.admin.nome || !payload.admin.email) {
      setError('Preencha os campos obrigatorios.');
      return;
    }

    try {
      const result = await authApi.createClinic(payload);
      await refreshSuperAdminData();
      const clinics = clinicsCache;

      let clinicId = String(result?.clinic?.clinicId || '').trim();
      let clinicName = result?.clinic?.nomeFantasia || result?.clinic?.razaoSocial || '';
      if (!clinicId) {
        const inferred = clinics.find((clinic) =>
          String(clinic?.cnpjOuCpf || '').trim() === clinicCnpjInput
          || String(clinic?.nomeFantasia || '').trim() === clinicNomeInput
          || String(clinic?.razaoSocial || '').trim() === clinicRazaoInput
        );
        if (inferred) {
          clinicId = String(inferred.clinicId || '').trim();
          clinicName = clinicName || inferred.nomeFantasia || inferred.razaoSocial || '';
        }
      }

      if (clinicId && result?.credentials?.email && result?.credentials?.senhaTemporaria) {
        clinicCredentialsCache.set(clinicId, {
          email: result.credentials.email,
          senhaTemporaria: result.credentials.senhaTemporaria,
        });
      }

      openSuccessModal({
        clinicId,
        clinicName: clinicName || clinicId,
        email: result?.credentials?.email || '',
        senhaTemporaria: result?.credentials?.senhaTemporaria || '',
      });

      clinicForm?.reset();
      if (!clinicId) {
        setError('Clinica criada, mas nao foi possivel identificar o clinicId para impersonacao imediata.');
      }
    } catch (err) {
      setError(err?.message || 'Falha ao criar clinica.');
    }
  });

  clinicsList?.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const action = target.dataset.action;
    const clinicId = target.dataset.clinicId;
    const pendingId = String(target.dataset.pendingId || '').trim();
    if (!action) return;

    if (action === 'open-clinic') {
      if (!clinicId) return;
      await impersonateClinic(clinicId);
      return;
    }

    if (action === 'copy-id') {
      if (!clinicId) return;
      try {
        await copyText(clinicId);
      } catch (_err) {
        setError('Nao foi possivel copiar o ID da clinica.');
      }
      return;
    }

    if (action === 'copy-credentials') {
      if (!clinicId) return;
      const credentials = clinicCredentialsCache.get(clinicId);
      if (!credentials) {
        setError('Credenciais nao disponiveis para esta clinica nesta sessao.');
        return;
      }
      try {
        await copyText(buildCredentialsLabel(credentials));
      } catch (_err) {
        setError('Nao foi possivel copiar as credenciais.');
      }
      return;
    }

    if (action === 'delete-pending') {
      await handleDeletePending(pendingId || clinicId);
      return;
    }
  });

  dashboardPendingSignups?.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.dataset.action !== 'delete-pending') return;
    const pendingId = String(target.dataset.pendingId || '').trim();
    if (!pendingId) return;
    await handleDeletePending(pendingId);
  });

  promotionList?.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.dataset.action || '';
    const promotionId = String(target.dataset.promotionId || '').trim();
    if (!action || !promotionId) return;
    const offer = promotionOffersCache.find((item) => String(item.id || '').trim() === promotionId);
    if (!offer) return;

    if (action === 'copy-promotion-link') {
      try {
        await copyText(offer.link || '');
        setPromotionStatus('Link copiado.');
      } catch (_error) {
        setPromotionError('Nao foi possivel copiar o link.');
      }
      return;
    }

    if (action === 'copy-promotion-code') {
      try {
        await copyText(offer.code || '');
        setPromotionStatus('Codigo copiado.');
      } catch (_error) {
        setPromotionError('Nao foi possivel copiar o codigo.');
      }
      return;
    }

    if (action === 'deactivate-promotion') {
      const confirmed = window.confirm(`Desativar o link promocional ${offer.code}?`);
      if (!confirmed) return;
      promotionActionIds.add(promotionId);
      renderPromotionOffers(promotionOffersCache);
      try {
        await authApi.deactivatePromotionOffer(promotionId);
        setPromotionStatus('Link promocional desativado.');
        await loadPromotionOffers();
      } catch (err) {
        setPromotionError(err?.message || 'Falha ao desativar link promocional.');
      } finally {
        promotionActionIds.delete(promotionId);
        renderPromotionOffers(promotionOffersCache);
      }
    }
  });

  const handleDeletePending = async (pendingId) => {
    const normalizedId = String(pendingId || '').trim();
    if (!normalizedId) {
      setDashboardError('Cadastro pendente invalido.');
      return;
    }

    const label = clinicsCache.find((clinic) => String(clinic.clinicId || '').trim() === normalizedId)?.nomeFantasia
      || dashboardCache?.pendingSignups?.find((item) => String(item.id || '').trim() === normalizedId)?.email
      || normalizedId;

    const confirmed = window.confirm(`Tem certeza? Esta ação removerá o cadastro pendente e liberará o e-mail.\n\n${label}`);
    if (!confirmed) return;

    pendingCleanupIds.add(normalizedId);
    setDashboardError('');
    setDashboardStatus('');
    renderClinics(clinicsCache);
    renderPendingSignups(Array.isArray(dashboardCache?.pendingSignups) ? dashboardCache.pendingSignups : []);

    try {
      await authApi.deletePendingClinicRegistration(normalizedId);
      setDashboardStatus('Cadastro pendente removido com sucesso.');
      await refreshSuperAdminData();
    } catch (err) {
      setDashboardError(err?.message || 'Falha ao excluir cadastro pendente.');
    } finally {
      pendingCleanupIds.delete(normalizedId);
      renderClinics(clinicsCache);
      renderPendingSignups(Array.isArray(dashboardCache?.pendingSignups) ? dashboardCache.pendingSignups : []);
    }
  };

  btnCopyCredentials?.addEventListener('click', async () => {
    const credentials = clinicCredentialsCache.get(lastCreatedClinicId);
    if (!credentials) {
      setError('Credenciais indisponiveis.');
      return;
    }
    try {
      await copyText(buildCredentialsLabel(credentials));
    } catch (_err) {
      setError('Nao foi possivel copiar as credenciais.');
    }
  });

  btnOpenCreatedClinic?.addEventListener('click', async () => {
    if (!lastCreatedClinicId) {
      setError('Clinica recem criada nao encontrada.');
      return;
    }
    await impersonateClinic(lastCreatedClinicId);
  });

  btnCloseSuccessModal?.addEventListener('click', () => {
    closeSuccessModal();
  });
  btnCloseSuccessModalX?.addEventListener('click', () => {
    closeSuccessModal();
  });

  successModal?.addEventListener('click', (event) => {
    if (event.target === successModal) {
      closeSuccessModal();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && successModal && !successModal.hidden) {
      closeSuccessModal();
    }
  });

  btnLogout?.addEventListener('click', async () => {
    try {
      await authApi.logout();
    } finally {
      window.location.href = 'login.html';
    }
  });

  btnOpenWhatsappSupport?.addEventListener('click', async () => {
    try {
      if (!appApi?.openExternalUrl) {
        throw new Error('Abertura do painel global do WhatsApp NG indisponivel neste ambiente.');
      }
      await appApi.openExternalUrl('http://127.0.0.1:8099/admin/login');
    } catch (err) {
      setError(err?.message || 'Falha ao abrir o painel global do WhatsApp NG.');
    }
  });

  btnRefreshDashboard?.addEventListener('click', async () => {
    await refreshSuperAdminData();
  });

  clinicSearchInput?.addEventListener('input', () => {
    renderClinics(clinicsCache);
  });

  clinicStageFilter?.addEventListener('change', () => {
    renderClinics(clinicsCache);
  });

  (async () => {
    try {
      const user = await ensureSuperAdmin();
      if (!user) return;
      await refreshSuperAdminData();
    } catch (_err) {
      window.location.href = 'login.html';
    }
  })();
});

