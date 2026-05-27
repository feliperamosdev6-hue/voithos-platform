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
  const tabButtons = Array.from(document.querySelectorAll('[data-tab]'));
  const tabPanels = Array.from(document.querySelectorAll('[data-tab-panel]'));
  const subscriptionSummary = document.getElementById('subscription-summary');
  const subscriptionSearchInput = document.getElementById('subscription-search');
  const subscriptionStatusFilter = document.getElementById('subscription-status-filter');
  const subscriptionList = document.getElementById('subscription-list');
  const subscriptionStatus = document.getElementById('subscription-status');
  const subscriptionError = document.getElementById('subscription-error');
  const btnRefreshSubscriptions = document.getElementById('btn-refresh-subscriptions');
  const paymentsList = document.getElementById('payments-list');
  const blocksSummary = document.getElementById('blocks-summary');
  const blocksList = document.getElementById('blocks-list');

  const successModal = document.getElementById('success-modal');
  const successClinicName = document.getElementById('success-clinic-name');
  const successAdminEmail = document.getElementById('success-admin-email');
  const successAdminPassword = document.getElementById('success-admin-password');
  const btnCopyCredentials = document.getElementById('btn-copy-credentials');
  const btnOpenCreatedClinic = document.getElementById('btn-open-created-clinic');
  const btnCloseSuccessModal = document.getElementById('btn-close-success-modal');
  const btnCloseSuccessModalX = document.getElementById('btn-close-success-modal-x');
  const subscriptionModal = document.getElementById('subscription-modal');
  const subscriptionModalTitle = document.getElementById('subscription-modal-title');
  const subscriptionModalSubtitle = document.getElementById('subscription-modal-subtitle');
  const subscriptionModalForm = document.getElementById('subscription-modal-form');
  const subscriptionModalError = document.getElementById('subscription-modal-error');
  const btnSubmitSubscriptionModal = document.getElementById('btn-submit-subscription-modal');
  const btnCloseSubscriptionModal = document.getElementById('btn-close-subscription-modal');
  const btnCloseSubscriptionModalX = document.getElementById('btn-close-subscription-modal-x');

  const clinicCredentialsCache = new Map();
  const dashboardClinicMap = new Map();
  const pendingCleanupIds = new Set();
  const promotionActionIds = new Set();
  const clinicAccessActionIds = new Set();
  const subscriptionActionIds = new Set();
  let clinicsCache = [];
  let promotionOffersCache = [];
  let dashboardCache = null;
  let lastCreatedClinicId = '';
  let subscriptionModalState = null;
  const planCatalog = window.VoithosPlanCatalog || {};

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

  const setSubscriptionError = (message) => {
    if (subscriptionError) subscriptionError.textContent = message || '';
  };

  const setSubscriptionStatus = (message) => {
    if (!subscriptionStatus) return;
    const text = String(message || '').trim();
    subscriptionStatus.textContent = text;
    subscriptionStatus.hidden = !text;
  };

  const setSubscriptionModalError = (message) => {
    if (subscriptionModalError) subscriptionModalError.textContent = message || '';
  };

  const setActiveTab = (tabName) => {
    const normalizedTab = String(tabName || 'overview').trim() || 'overview';
    tabButtons.forEach((button) => {
      const active = button.dataset.tab === normalizedTab;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    tabPanels.forEach((panel) => {
      const active = panel.dataset.tabPanel === normalizedTab;
      panel.hidden = !active;
      panel.classList.toggle('is-active', active);
    });
  };

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));

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

  const formatDate = (value) => {
    const parsed = value ? new Date(value) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) return '-';
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(parsed);
  };

  const formatPhone = (value) => {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return 'Sem telefone';
    if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return String(value || '').trim() || 'Sem telefone';
  };

  const getDaysUntil = (value) => {
    const parsed = value ? new Date(value) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    parsed.setHours(0, 0, 0, 0);
    return Math.ceil((parsed.getTime() - today.getTime()) / 86400000);
  };

  const formatDaysUntil = (value) => {
    const days = getDaysUntil(value);
    if (days === null) return 'Nao definido';
    if (days < 0) return `Vencido ha ${Math.abs(days)} dia${Math.abs(days) === 1 ? '' : 's'}`;
    if (days === 0) return 'Vence hoje';
    return `${days} dia${days === 1 ? '' : 's'} para vencer`;
  };

  const formatPlanLabel = (plan) => {
    const catalogPlan = planCatalog.getPlanDefinition?.(plan);
    if (catalogPlan?.label) return catalogPlan.label;
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
      TRIALING: 'Trial ativo',
      TRIAL_EXPIRED: 'Trial expirado',
      GRACE_PERIOD: 'Em tolerancia',
      BLOCKED: 'Bloqueada',
      CANCELED: 'Cancelada',
      NO_SUBSCRIPTION: 'Sem assinatura',
    };
    const normalized = String(stage || '').trim().toUpperCase();
    return labels[normalized] || fallback || normalized || 'Etapa';
  };

  const getBadgeClass = (stage) => {
    const normalized = String(stage || '').trim().toUpperCase();
    if (['BLOCKED', 'CANCELED'].includes(normalized)) return 'badge is-danger';
    if (['EMAIL_VERIFICATION_PENDING', 'PROFILE_PENDING', 'PAYMENT_PENDING', 'GRACE_PERIOD', 'TRIAL_EXPIRED'].includes(normalized)) return 'badge is-warn';
    if (['ACTIVE', 'TRIALING'].includes(normalized)) return 'badge';
    return 'badge is-neutral';
  };

  const getCommercialStatus = (snapshot = {}) => {
    const stage = String(snapshot?.stage || '').trim().toUpperCase();
    const paymentStatus = String(snapshot?.lastPaymentStatus || '').trim().toUpperCase();
    const paidPaymentStatus = String(snapshot?.latestPaidPaymentStatus || '').trim().toUpperCase();
    const daysUntilEnd = getDaysUntil(snapshot?.subscriptionEndDate);

    if (stage === 'PAYMENT_PENDING' || paymentStatus === 'PENDING') return { label: 'Aguardando pagamento', className: 'badge is-warn' };
    if (['BLOCKED', 'CANCELED'].includes(stage)) return { label: formatStageLabel(stage), className: 'badge is-danger' };
    if (daysUntilEnd !== null && daysUntilEnd < 0) return { label: 'Vencida', className: 'badge is-danger' };
    if (daysUntilEnd !== null && daysUntilEnd <= 7) return { label: 'Vencendo em breve', className: 'badge is-warn' };
    if (stage === 'ACTIVE' || paymentStatus === 'PAID' || paidPaymentStatus === 'PAID') return { label: 'Ativa', className: 'badge' };
    return { label: formatStageLabel(stage, 'Pendente'), className: getBadgeClass(stage) };
  };

  const isClinicAccessBlocked = (clinic = {}, snapshot = {}) => clinic?.accessBlocked === true || snapshot?.accessBlocked === true;

  const getAccessStatus = (snapshot = {}, clinic = {}) => {
    if (isClinicAccessBlocked(clinic, snapshot)) return 'Bloqueada';
    const commercialStatus = getCommercialStatus(snapshot);
    const label = String(commercialStatus.label || '').trim();
    if (label === 'Ativa' || label === 'Vencendo em breve') return 'Liberado';
    if (label === 'Vencida') return 'Vencido';
    if (label === 'Aguardando pagamento') return 'Pendente';
    return 'Bloqueio manual/futuro';
  };

  const getSubscriptionRows = () => {
    const snapshots = Array.isArray(dashboardCache?.clinicSnapshots) ? dashboardCache.clinicSnapshots : [];
    return snapshots.map((snapshot) => {
      const clinicId = String(snapshot?.clinicId || '').trim();
      const clinic = clinicsCache.find((item) => String(item?.clinicId || '').trim() === clinicId) || {};
      return {
        ...snapshot,
        clinicName: snapshot?.nomeFantasia || clinic?.nomeFantasia || snapshot?.razaoSocial || clinic?.razaoSocial || 'Sem nome',
        clinicDocument: snapshot?.cnpjOuCpf || clinic?.cnpjOuCpf || '',
        clinicPhone: snapshot?.clinicPhone || clinic?.telefone || clinic?.telefoneComercial || '',
      };
    });
  };

  const getSubscriptionEffectiveStatus = (row = {}) => (
    String(row.effectiveSubscriptionStatus || row.subscriptionStatus || row.stage || 'NO_SUBSCRIPTION').trim().toUpperCase()
      || 'NO_SUBSCRIPTION'
  );

  const getSubscriptionPlan = (row = {}) => (
    String(row.subscriptionBillingCycle || row.selectedPlan || '').trim().toUpperCase()
  );

  const getSubscriptionAmount = (row = {}) => {
    if (row.subscriptionCustomPriceEnabled === true && row.subscriptionBillingAmount != null) {
      return Number(row.subscriptionBillingAmount || 0);
    }
    if (row.subscriptionAmount != null) return Number(row.subscriptionAmount || 0);
    if (row.latestPaidPaymentAmount != null) return Number(row.latestPaidPaymentAmount || 0);
    if (row.lastPaymentAmount != null) return Number(row.lastPaymentAmount || 0);
    return 0;
  };

  const getSubscriptionDueDays = (row = {}) => getDaysUntil(row.subscriptionEndDate);

  const formatDueDays = (row = {}) => {
    const days = getSubscriptionDueDays(row);
    if (days === null) return 'Nao definido';
    if (days < 0) return `${Math.abs(days)}d vencido`;
    if (days === 0) return 'Hoje';
    return `${days}d`;
  };

  const getLastPaymentLabel = (row = {}) => {
    const status = String(row.latestPaidPaymentStatus || row.lastPaymentStatus || '').trim().toUpperCase();
    const amount = row.latestPaidPaymentAmount ?? row.lastPaymentAmount;
    const paidAt = row.latestPaidPaymentPaidAt || row.lastPaymentPaidAt || row.lastPaymentCreatedAt;
    if (!status) return 'Sem pagamento';
    return `${formatStageLabel(status, status)} | ${formatCurrency(amount)} | ${formatDateTime(paidAt)}`;
  };

  const filterSubscriptionRows = (rows = []) => {
    const query = String(subscriptionSearchInput?.value || '').trim().toLowerCase();
    const statusFilter = String(subscriptionStatusFilter?.value || '').trim().toUpperCase();
    return rows.filter((row) => {
      const status = getSubscriptionEffectiveStatus(row);
      const haystack = [
        row.clinicId,
        row.clinicName,
        row.clinicDocument,
        row.adminEmail,
        row.clinicEmail,
        row.selectedPlan,
        row.subscriptionBillingCycle,
      ].map((value) => String(value || '').trim().toLowerCase()).join(' ');
      if (query && !haystack.includes(query)) return false;
      if (statusFilter && status !== statusFilter) return false;
      return true;
    });
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
            ? `Lead pendente | ${entry.email || '-'} | ${formatPhone(entry.phone)} | Plano ${formatPlanLabel(entry.selectedPlan)}`
            : `Clinica ${entry.clinicId || '-'} | ${entry.adminEmail || entry.clinicEmail || '-'} | ${formatPhone(entry.clinicPhone)} | Plano ${formatPlanLabel(entry.selectedPlan)}`}
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
            ${entry.email || '-'} | ${formatPhone(entry.phone)} | Plano ${formatPlanLabel(entry.selectedPlan)} | Responsavel ${entry.responsavelNome || '-'}
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

  const renderSubscriptionSummary = (rows = []) => {
    if (!subscriptionSummary) return;
    const active = rows.filter((row) => getSubscriptionEffectiveStatus(row) === 'ACTIVE').length;
    const trialing = rows.filter((row) => getSubscriptionEffectiveStatus(row) === 'TRIALING').length;
    const pending = rows.filter((row) => getSubscriptionEffectiveStatus(row) === 'PENDING_PAYMENT').length;
    const custom = rows.filter((row) => row.subscriptionCustomPriceEnabled === true).length;
    const cards = [
      { label: 'Assinaturas', value: rows.length, subcopy: `${active} ativas` },
      { label: 'Trial', value: trialing, subcopy: 'Clinicas em teste' },
      { label: 'Aguardando pagamento', value: pending, subcopy: 'Sem confirmacao webhook' },
      { label: 'Preco customizado', value: custom, subcopy: 'Controles comerciais ativos' },
    ];
    subscriptionSummary.innerHTML = cards.map((card) => `
      <article class="metric-card">
        <div class="metric-label">${escapeHtml(card.label)}</div>
        <div class="metric-value">${card.value}</div>
        <div class="metric-subcopy">${escapeHtml(card.subcopy)}</div>
      </article>
    `).join('');
  };

  const renderSubscriptions = () => {
    if (!subscriptionList) return;
    const rows = getSubscriptionRows();
    const filteredRows = filterSubscriptionRows(rows);
    renderSubscriptionSummary(rows);

    if (!rows.length) {
      subscriptionList.innerHTML = '<div class="list-empty">Nenhuma assinatura encontrada.</div>';
      return;
    }
    if (!filteredRows.length) {
      subscriptionList.innerHTML = '<div class="list-empty">Nenhuma assinatura combina com os filtros.</div>';
      return;
    }

    subscriptionList.innerHTML = `
      <table class="data-table subscriptions-table">
        <thead>
          <tr>
            <th>Clinica</th>
            <th>Status</th>
            <th>Plano</th>
            <th>Valor</th>
            <th>Desconto</th>
            <th>Custom</th>
            <th>Ciclo</th>
            <th>Trial</th>
            <th>Ultimo pagamento</th>
            <th>Vence em</th>
            <th>Acoes</th>
          </tr>
        </thead>
        <tbody>
          ${filteredRows.map((row) => {
            const clinicId = String(row.clinicId || '').trim();
            const status = getSubscriptionEffectiveStatus(row);
            const amount = getSubscriptionAmount(row);
            const discount = Number(row.subscriptionDiscountAmount || 0);
            const billingCycle = getSubscriptionPlan(row);
            const isBusy = subscriptionActionIds.has(clinicId);
            const hasSubscription = Boolean(row.subscriptionId || row.subscriptionStatus || row.subscriptionAmount != null || row.subscriptionTrialEndsAt);
            const canExtendTrial = hasSubscription && status === 'TRIALING';
            const actionDisabled = isBusy || !hasSubscription;
            return `
              <tr data-clinic-id="${escapeHtml(clinicId)}">
                <td>
                  <strong>${escapeHtml(row.clinicName)}</strong>
                  <span>${escapeHtml(row.adminEmail || row.clinicEmail || clinicId)}</span>
                </td>
                <td><span class="${getBadgeClass(status)}">${escapeHtml(formatStageLabel(status))}</span></td>
                <td>${escapeHtml(formatPlanLabel(row.selectedPlan))}</td>
                <td>${escapeHtml(formatCurrency(amount))}</td>
                <td>${discount > 0 ? escapeHtml(formatCurrency(discount)) : '-'}</td>
                <td>${row.subscriptionCustomPriceEnabled === true ? '<span class="badge">Ativo</span>' : '<span class="badge is-neutral">Inativo</span>'}</td>
                <td>${escapeHtml(formatPlanLabel(billingCycle))}</td>
                <td>${escapeHtml(formatDate(row.subscriptionTrialEndsAt))}</td>
                <td>${escapeHtml(getLastPaymentLabel(row))}</td>
                <td>${escapeHtml(formatDueDays(row))}</td>
                <td>
                  <div class="table-actions">
                    <button type="button" data-action="subscription-price" data-clinic-id="${escapeHtml(clinicId)}" ${actionDisabled ? 'disabled' : ''}>Preco</button>
                    <button type="button" data-action="subscription-discount" data-clinic-id="${escapeHtml(clinicId)}" ${actionDisabled ? 'disabled' : ''}>Desconto</button>
                    <button type="button" data-action="subscription-trial" data-clinic-id="${escapeHtml(clinicId)}" ${actionDisabled || !canExtendTrial ? 'disabled' : ''} title="${canExtendTrial ? '' : 'Disponivel apenas em trial ativo'}">Trial</button>
                    <button type="button" data-action="subscription-cycle" data-clinic-id="${escapeHtml(clinicId)}" ${actionDisabled ? 'disabled' : ''}>Ciclo</button>
                    <button type="button" data-action="subscription-notes" data-clinic-id="${escapeHtml(clinicId)}" ${actionDisabled ? 'disabled' : ''}>Nota</button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  };

  const renderPayments = () => {
    if (!paymentsList) return;
    const rows = getSubscriptionRows()
      .filter((row) => row.lastPaymentStatus || row.latestPaidPaymentStatus)
      .sort((left, right) => String(right.lastPaymentCreatedAt || right.latestPaidPaymentPaidAt || '').localeCompare(String(left.lastPaymentCreatedAt || left.latestPaidPaymentPaidAt || '')));
    if (!rows.length) {
      paymentsList.innerHTML = '<div class="list-empty">Nenhum pagamento recente encontrado.</div>';
      return;
    }
    paymentsList.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Clinica</th>
            <th>Status</th>
            <th>Valor</th>
            <th>Pago em</th>
            <th>Criado em</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => {
            const status = String(row.latestPaidPaymentStatus || row.lastPaymentStatus || '').trim().toUpperCase();
            return `
              <tr>
                <td><strong>${escapeHtml(row.clinicName)}</strong><span>${escapeHtml(row.adminEmail || row.clinicId || '')}</span></td>
                <td><span class="${getBadgeClass(status === 'PAID' ? 'ACTIVE' : status)}">${escapeHtml(formatStageLabel(status, status))}</span></td>
                <td>${escapeHtml(formatCurrency(row.latestPaidPaymentAmount ?? row.lastPaymentAmount))}</td>
                <td>${escapeHtml(formatDateTime(row.latestPaidPaymentPaidAt || row.lastPaymentPaidAt))}</td>
                <td>${escapeHtml(formatDateTime(row.lastPaymentCreatedAt))}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  };

  const renderBlocks = () => {
    if (!blocksList) return;
    const rows = getSubscriptionRows();
    const blockedRows = rows.filter((row) => {
      const status = getSubscriptionEffectiveStatus(row);
      return row.accessBlocked === true || ['BLOCKED', 'CANCELED', 'TRIAL_EXPIRED'].includes(status);
    });
    if (blocksSummary) {
      const manual = rows.filter((row) => row.accessBlocked === true).length;
      const subscriptionBlocked = rows.filter((row) => getSubscriptionEffectiveStatus(row) === 'BLOCKED').length;
      const trialExpired = rows.filter((row) => getSubscriptionEffectiveStatus(row) === 'TRIAL_EXPIRED').length;
      const cards = [
        { label: 'Bloqueios manuais', value: manual, subcopy: 'Controle de acesso' },
        { label: 'Assinaturas bloqueadas', value: subscriptionBlocked, subcopy: 'Fim da tolerancia' },
        { label: 'Trial expirado', value: trialExpired, subcopy: 'Modo somente leitura' },
        { label: 'Total em atencao', value: blockedRows.length, subcopy: 'Itens listados' },
      ];
      blocksSummary.innerHTML = cards.map((card) => `
        <article class="metric-card">
          <div class="metric-label">${escapeHtml(card.label)}</div>
          <div class="metric-value">${card.value}</div>
          <div class="metric-subcopy">${escapeHtml(card.subcopy)}</div>
        </article>
      `).join('');
    }
    if (!blockedRows.length) {
      blocksList.innerHTML = '<div class="list-empty">Nenhuma clinica bloqueada ou em restricao.</div>';
      return;
    }
    blocksList.innerHTML = blockedRows.map((row) => {
      const clinicId = String(row.clinicId || '').trim();
      const status = getSubscriptionEffectiveStatus(row);
      const isManualBlocked = row.accessBlocked === true;
      const isBusy = clinicAccessActionIds.has(clinicId);
      return `
        <article class="activity-item" data-clinic-id="${escapeHtml(clinicId)}">
          <div class="activity-item-header">
            <div class="activity-title">${escapeHtml(row.clinicName)}</div>
            <span class="${getBadgeClass(isManualBlocked ? 'BLOCKED' : status)}">${escapeHtml(isManualBlocked ? 'Bloqueio manual' : formatStageLabel(status))}</span>
          </div>
          <div class="activity-meta">
            ${escapeHtml(row.adminEmail || row.clinicEmail || '-')} | Plano ${escapeHtml(formatPlanLabel(row.selectedPlan))} | Vencimento ${escapeHtml(formatDate(row.subscriptionEndDate))}
          </div>
          <div class="activity-submeta">
            ${isManualBlocked ? `Bloqueado em ${escapeHtml(formatDateTime(row.accessBlockedAt))}${row.accessBlockedReason ? ` | ${escapeHtml(row.accessBlockedReason)}` : ''}` : escapeHtml(formatDaysUntil(row.subscriptionEndDate))}
          </div>
          <div class="clinic-actions">
            ${isManualBlocked
              ? `<button type="button" class="btn-outline" data-action="unblock-clinic-access" data-clinic-id="${escapeHtml(clinicId)}" ${isBusy ? 'disabled' : ''}>${isBusy ? 'Desbloqueando...' : 'Desbloquear acesso'}</button>`
              : `<button type="button" class="btn-outline" data-action="block-clinic-access" data-clinic-id="${escapeHtml(clinicId)}" ${isBusy ? 'disabled' : ''}>${isBusy ? 'Bloqueando...' : 'Bloquear manualmente'}</button>`}
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
    renderSubscriptions();
    renderPayments();
    renderBlocks();
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
        clinic?.telefone,
        clinic?.telefoneComercial,
        snapshot?.adminEmail,
        snapshot?.clinicEmail,
        snapshot?.clinicPhone,
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
      const commercialStatus = getCommercialStatus(snapshot || {});
      const accessBlocked = isClinicAccessBlocked(clinic, snapshot || {});
      const accessStatus = getAccessStatus(snapshot || {}, clinic);
      const accessReason = String(snapshot?.accessBlockedReason || clinic?.accessBlockedReason || '').trim();
      const accessBlockedAt = snapshot?.accessBlockedAt || clinic?.accessBlockedAt;
      const hasPaidPayment = String(snapshot?.latestPaidPaymentStatus || snapshot?.lastPaymentStatus || '').trim().toUpperCase() === 'PAID';
      const paidAmount = snapshot?.latestPaidPaymentAmount ?? snapshot?.lastPaymentAmount;
      const paidAt = snapshot?.latestPaidPaymentPaidAt || snapshot?.lastPaymentPaidAt;
      const canDeletePending = String(snapshot?.stage || '').trim().toUpperCase() === 'PAYMENT_PENDING';
      const isDeletingPending = pendingCleanupIds.has(clinicId);
      const isAccessBusy = clinicAccessActionIds.has(clinicId);
      return `
        <article class="clinic-item" data-clinic-id="${clinicId}">
          <div class="clinic-topline">
            <div class="clinic-name">${clinic.nomeFantasia || clinic.razaoSocial || 'Sem nome'}</div>
            <span class="${commercialStatus.className}">${commercialStatus.label}</span>
          </div>
          <div class="clinic-meta">ID: ${clinicId}</div>
          <div class="clinic-meta">CNPJ/CPF: ${clinic.cnpjOuCpf || '-'}</div>
          <div class="clinic-meta">Telefone: ${formatPhone(clinic.telefone || clinic.telefoneComercial || snapshot?.clinicPhone)}</div>
          <div class="clinic-meta">Status interno: ${status} | Funil: ${stageLabel}</div>
          <div class="clinic-meta">Plano: ${formatPlanLabel(snapshot?.selectedPlan)} | Perfil: ${formatOperationLabel(snapshot?.operationType)}</div>
          <div class="clinic-meta">Pagamento: ${hasPaidPayment ? `${formatCurrency(paidAmount)} em ${formatDateTime(paidAt)}` : 'Sem pagamento confirmado'}</div>
          <div class="clinic-meta">Vencimento: ${formatDate(snapshot?.subscriptionEndDate)} | ${formatDaysUntil(snapshot?.subscriptionEndDate)}</div>
          <div class="clinic-meta">Acesso: ${accessStatus}${accessBlocked ? ` | Bloqueado em ${formatDateTime(accessBlockedAt)}${accessReason ? ` | Motivo: ${accessReason}` : ''}` : ' | Controle manual disponivel'}</div>
          <div class="clinic-meta">Origem: ${snapshot?.promotionCode ? `Promocao ${snapshot.promotionCode}` : (snapshot?.acquisitionSource || 'landing')}</div>
          <div class="clinic-meta">Admin: ${snapshot?.adminEmail || '-'}</div>
          <div class="clinic-meta">Atualizado: ${formatDateTime(snapshot?.onboardingUpdatedAt || snapshot?.updatedAt || clinic?.updatedAt)}</div>
          <div class="clinic-actions">
            <button type="button" class="btn-primary" data-action="open-clinic" data-clinic-id="${clinicId}" ${accessBlocked ? 'disabled title="Desbloqueie o acesso antes de abrir a clinica."' : ''}>Abrir clinica</button>
            <button type="button" data-action="copy-id" data-clinic-id="${clinicId}">Copiar ID</button>
            ${hasCredentials ? `<button type="button" data-action="copy-credentials" data-clinic-id="${clinicId}">Copiar credenciais</button>` : ''}
            ${accessBlocked
              ? `<button type="button" class="btn-outline" data-action="unblock-clinic-access" data-clinic-id="${clinicId}" ${isAccessBusy ? 'disabled' : ''}>${isAccessBusy ? 'Desbloqueando...' : 'Desbloquear acesso'}</button>`
              : `<button type="button" class="btn-outline" data-action="block-clinic-access" data-clinic-id="${clinicId}" ${isAccessBusy ? 'disabled' : ''}>${isAccessBusy ? 'Bloqueando...' : 'Bloquear acesso'}</button>`}
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
      renderSubscriptions();
      renderPayments();
      renderBlocks();
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

  const getDefaultPlanPrice = (planType) => {
    const plan = planCatalog.getPlanDefinition?.(planType);
    return plan?.amount ? Number(plan.amount).toFixed(2) : '0.00';
  };

  const getSubscriptionRowByClinicId = (clinicId) => getSubscriptionRows()
    .find((row) => String(row?.clinicId || '').trim() === String(clinicId || '').trim()) || null;

  const closeSubscriptionModal = () => {
    subscriptionModalState = null;
    if (subscriptionModalForm) subscriptionModalForm.innerHTML = '';
    setSubscriptionModalError('');
    if (!subscriptionModal) return;
    subscriptionModal.classList.remove('is-open');
    subscriptionModal.hidden = true;
  };

  const buildSubscriptionModalFields = (action, row = {}) => {
    const amount = getSubscriptionAmount(row) || Number(getDefaultPlanPrice(getSubscriptionPlan(row)));
    const discountAmount = Number(row.subscriptionDiscountAmount || 0);
    const billingCycle = getSubscriptionPlan(row) || row.selectedPlan || 'MONTHLY';
    const commercialNotes = String(row.subscriptionCommercialNotes || '').trim();

    if (action === 'subscription-price') {
      return `
        <label>
          Novo valor
          <input name="billingAmount" type="number" min="0.01" step="0.01" value="${escapeHtml(amount.toFixed(2))}" required>
        </label>
        <label class="checkbox-label">
          <input name="customPriceEnabled" type="checkbox" checked>
          Preco customizado ativo
        </label>
        <label class="span-2">
          Motivo
          <textarea name="reason" rows="3" placeholder="Contexto comercial"></textarea>
        </label>
      `;
    }

    if (action === 'subscription-discount') {
      return `
        <label>
          Desconto
          <input name="discountAmount" type="number" min="0" step="0.01" value="${escapeHtml(discountAmount.toFixed(2))}" required>
        </label>
        <label class="span-2">
          Motivo
          <textarea name="reason" rows="3" placeholder="Contexto comercial"></textarea>
        </label>
      `;
    }

    if (action === 'subscription-trial') {
      return `
        <label>
          Dias para adicionar
          <input name="days" type="number" min="1" max="365" step="1" value="7" required>
        </label>
        <label class="span-2">
          Motivo
          <textarea name="reason" rows="3" placeholder="Contexto comercial"></textarea>
        </label>
      `;
    }

    if (action === 'subscription-cycle') {
      return `
        <label>
          Ciclo de cobranca
          <select name="billingCycle" required>
            <option value="MONTHLY" ${billingCycle === 'MONTHLY' ? 'selected' : ''}>Mensal</option>
            <option value="QUARTERLY" ${billingCycle === 'QUARTERLY' ? 'selected' : ''}>Trimestral</option>
            <option value="SEMIANNUAL" ${billingCycle === 'SEMIANNUAL' ? 'selected' : ''}>Semestral</option>
            <option value="ANNUAL" ${billingCycle === 'ANNUAL' ? 'selected' : ''}>Anual</option>
          </select>
        </label>
        <label class="span-2">
          Motivo
          <textarea name="reason" rows="3" placeholder="Contexto comercial"></textarea>
        </label>
      `;
    }

    return `
      <label class="span-2">
        Nota comercial
        <textarea name="commercialNotes" rows="5" maxlength="2000" placeholder="Observacao interna">${escapeHtml(commercialNotes)}</textarea>
      </label>
    `;
  };

  const openSubscriptionModal = (action, clinicId) => {
    const row = getSubscriptionRowByClinicId(clinicId);
    if (!row) {
      setSubscriptionError('Assinatura nao encontrada para esta clinica.');
      return;
    }
    const titles = {
      'subscription-price': 'Alterar preco',
      'subscription-discount': 'Aplicar desconto',
      'subscription-trial': 'Estender trial',
      'subscription-cycle': 'Alterar ciclo',
      'subscription-notes': 'Editar nota comercial',
    };
    subscriptionModalState = {
      action,
      clinicId: String(clinicId || '').trim(),
    };
    if (subscriptionModalTitle) subscriptionModalTitle.textContent = titles[action] || 'Editar assinatura';
    if (subscriptionModalSubtitle) {
      subscriptionModalSubtitle.textContent = `${row.clinicName || row.clinicId} | ${formatStageLabel(getSubscriptionEffectiveStatus(row))}`;
    }
    if (subscriptionModalForm) subscriptionModalForm.innerHTML = buildSubscriptionModalFields(action, row);
    setSubscriptionModalError('');
    if (subscriptionModal) {
      subscriptionModal.hidden = false;
      subscriptionModal.classList.add('is-open');
    }
  };

  const executeSubscriptionModalAction = async () => {
    if (!subscriptionModalState?.clinicId || !subscriptionModalState?.action || !subscriptionModalForm) return;
    const action = subscriptionModalState.action;
    const clinicId = subscriptionModalState.clinicId;
    const fields = subscriptionModalForm.elements;
    const label = String(subscriptionModalTitle?.textContent || 'alteracao comercial').trim();
    const confirmed = window.confirm(`${label} para esta assinatura?\n\nEsta acao nao confirma pagamento e nao altera pagamento PAID.`);
    if (!confirmed) return;

    const requireAction = (fnName) => {
      if (typeof authApi?.[fnName] !== 'function') {
        throw new Error('Endpoint comercial indisponivel neste ambiente.');
      }
      return authApi[fnName];
    };

    subscriptionActionIds.add(clinicId);
    setSubscriptionError('');
    setSubscriptionStatus('');
    setSubscriptionModalError('');
    if (btnSubmitSubscriptionModal) btnSubmitSubscriptionModal.disabled = true;
    renderSubscriptions();

    try {
      if (action === 'subscription-price') {
        const customPriceEnabled = fields.customPriceEnabled?.checked === true;
        const billingAmount = Number(fields.billingAmount?.value || 0);
        await requireAction('updateSubscriptionPrice')(clinicId, {
          billingAmount,
          customPriceEnabled,
          reason: String(fields.reason?.value || '').trim(),
        });
      } else if (action === 'subscription-discount') {
        await requireAction('applySubscriptionDiscount')(clinicId, {
          discountAmount: Number(fields.discountAmount?.value || 0),
          reason: String(fields.reason?.value || '').trim(),
        });
      } else if (action === 'subscription-trial') {
        await requireAction('extendSubscriptionTrial')(clinicId, {
          days: Number(fields.days?.value || 0),
          reason: String(fields.reason?.value || '').trim(),
        });
      } else if (action === 'subscription-cycle') {
        await requireAction('updateSubscriptionBillingCycle')(clinicId, {
          billingCycle: String(fields.billingCycle?.value || '').trim(),
          reason: String(fields.reason?.value || '').trim(),
        });
      } else if (action === 'subscription-notes') {
        await requireAction('updateSubscriptionCommercialNotes')(clinicId, {
          commercialNotes: String(fields.commercialNotes?.value || '').trim(),
        });
      }

      closeSubscriptionModal();
      setSubscriptionStatus('Assinatura atualizada.');
      await refreshSuperAdminData();
    } catch (err) {
      setSubscriptionModalError(err?.message || 'Falha ao atualizar assinatura.');
    } finally {
      subscriptionActionIds.delete(clinicId);
      if (btnSubmitSubscriptionModal) btnSubmitSubscriptionModal.disabled = false;
      renderSubscriptions();
    }
  };

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

    if (action === 'block-clinic-access') {
      await handleClinicAccessBlock(clinicId);
      return;
    }

    if (action === 'unblock-clinic-access') {
      await handleClinicAccessUnblock(clinicId);
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

  subscriptionList?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const action = String(target.dataset.action || '').trim();
    const clinicId = String(target.dataset.clinicId || '').trim();
    if (!action || !clinicId) return;
    if (!action.startsWith('subscription-')) return;
    openSubscriptionModal(action, clinicId);
  });

  blocksList?.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.dataset.action;
    const clinicId = target.dataset.clinicId;
    if (action === 'block-clinic-access') {
      await handleClinicAccessBlock(clinicId);
      return;
    }
    if (action === 'unblock-clinic-access') {
      await handleClinicAccessUnblock(clinicId);
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

  const handleClinicAccessBlock = async (clinicId) => {
    const normalizedId = String(clinicId || '').trim();
    if (!normalizedId) {
      setDashboardError('Clinica invalida para bloqueio.');
      return;
    }

    const clinic = clinicsCache.find((item) => String(item.clinicId || '').trim() === normalizedId);
    const label = clinic?.nomeFantasia || clinic?.razaoSocial || normalizedId;
    const reason = String(window.prompt(`Informe o motivo do bloqueio manual de acesso para:\n\n${label}`, '') || '').replace(/\s+/g, ' ').trim();
    if (!reason) {
      setDashboardError('Informe um motivo para bloquear o acesso.');
      return;
    }

    const confirmed = window.confirm('Confirmar bloqueio manual? A clinica nao conseguira acessar o sistema ate ser desbloqueada.');
    if (!confirmed) return;

    clinicAccessActionIds.add(normalizedId);
    setDashboardError('');
    setDashboardStatus('');
    renderClinics(clinicsCache);

    try {
      await authApi.blockClinicAccess(normalizedId, reason);
      setDashboardStatus('Acesso da clinica bloqueado.');
      await refreshSuperAdminData();
    } catch (err) {
      setDashboardError(err?.message || 'Falha ao bloquear acesso da clinica.');
    } finally {
      clinicAccessActionIds.delete(normalizedId);
      renderClinics(clinicsCache);
    }
  };

  const handleClinicAccessUnblock = async (clinicId) => {
    const normalizedId = String(clinicId || '').trim();
    if (!normalizedId) {
      setDashboardError('Clinica invalida para desbloqueio.');
      return;
    }

    const clinic = clinicsCache.find((item) => String(item.clinicId || '').trim() === normalizedId);
    const label = clinic?.nomeFantasia || clinic?.razaoSocial || normalizedId;
    const confirmed = window.confirm(`Desbloquear acesso da clinica?\n\n${label}`);
    if (!confirmed) return;

    clinicAccessActionIds.add(normalizedId);
    setDashboardError('');
    setDashboardStatus('');
    renderClinics(clinicsCache);

    try {
      await authApi.unblockClinicAccess(normalizedId);
      setDashboardStatus('Acesso da clinica desbloqueado.');
      await refreshSuperAdminData();
    } catch (err) {
      setDashboardError(err?.message || 'Falha ao desbloquear acesso da clinica.');
    } finally {
      clinicAccessActionIds.delete(normalizedId);
      renderClinics(clinicsCache);
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

  subscriptionModal?.addEventListener('click', (event) => {
    if (event.target === subscriptionModal) {
      closeSubscriptionModal();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (subscriptionModal && !subscriptionModal.hidden) {
      closeSubscriptionModal();
      return;
    }
    if (successModal && !successModal.hidden) {
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

  btnRefreshSubscriptions?.addEventListener('click', async () => {
    setSubscriptionStatus('Atualizando assinaturas...');
    await refreshSuperAdminData();
    setSubscriptionStatus('');
  });

  clinicSearchInput?.addEventListener('input', () => {
    renderClinics(clinicsCache);
  });

  clinicStageFilter?.addEventListener('change', () => {
    renderClinics(clinicsCache);
  });

  subscriptionSearchInput?.addEventListener('input', () => {
    renderSubscriptions();
  });

  subscriptionStatusFilter?.addEventListener('change', () => {
    renderSubscriptions();
  });

  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setActiveTab(button.dataset.tab || 'overview');
    });
  });

  btnCloseSubscriptionModal?.addEventListener('click', () => {
    closeSubscriptionModal();
  });
  btnCloseSubscriptionModalX?.addEventListener('click', () => {
    closeSubscriptionModal();
  });
  btnSubmitSubscriptionModal?.addEventListener('click', async () => {
    await executeSubscriptionModalAction();
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

