(function () {
  const TOKEN_KEY = 'whatsapp_engine_admin_token';
  const page = document.body.dataset.page;
  const toastEl = document.getElementById('toast');
  const INSTANCES_PER_PAGE = 10;

  const VIEW_META = {
    dashboard: {
      eyebrow: 'Dashboard',
      title: 'Visao operacional do ambiente',
      description: 'Resumo do engine, saude da API, risco operacional e atividade recente das clinicas.',
    },
    instances: {
      eyebrow: 'Instancias',
      title: 'Centro operacional das clinicas',
      description: 'Filtros multi-clinica, lista paginada e drawer lateral de suporte por instancia.',
    },
    messages: {
      eyebrow: 'Mensagens',
      title: 'Operacao de jobs e envios',
      description: 'Resumo do dia, filtros fortes e navegacao cruzada para clinicas e instancias relacionadas.',
    },
    webhooks: {
      eyebrow: 'Webhooks',
      title: 'Estrutura inicial de integracao',
      description: 'Base funcional para eventos suportados, payloads e futuras configuracoes persistidas.',
    },
    security: {
      eyebrow: 'Seguranca',
      title: 'Visao segura do ambiente',
      description: 'Token interno mascarado, sessao administrativa e trilha paginada de auditoria para suporte multi-clinica.',
    },
    logs: {
      eyebrow: 'Logs',
      title: 'Suporte e diagnostico operacional',
      description: 'Eventos recentes com filtros por clinica, instancia e integracao cruzada com o modulo de suporte.',
    },
    settings: {
      eyebrow: 'Configuracoes',
      title: 'Defaults operacionais do engine',
      description: 'Visao read-only de runtime, integracoes, monitoracao, retencao e protecao de escala do WhatsApp NG.',
    },
  };

  const state = {
    instances: [],
    filteredInstances: [],
    paginatedInstances: [],
    selectedInstanceId: null,
    selectedInstanceDetails: null,
    selectedInstanceJobs: [],
    autoRefreshTimer: null,
    currentView: 'dashboard',
    apiHealthy: false,
    instanceSegment: '',
    instancesPage: 1,
    messagesLoaded: false,
    logsLoaded: false,
    webhooksLoaded: false,
    webhooksOverview: null,
    securityLoaded: false,
    settingsLoaded: false,
    adminSession: null,
    selectedWebhookEvent: '',
    selectedDetailsTab: 'overview',
    operationsOverview: null,
    securityAudit: {
      items: [],
      offset: 0,
      limit: 20,
      hasMore: false,
    },
    messageSummary: {
      sentToday: 0,
      failedToday: 0,
      queuedToday: 0,
      processingToday: 0,
    },
  };

  function showToast(message, type) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.className = `toast ${type || ''}`.trim();
    toastEl.classList.remove('hidden');
    window.clearTimeout(showToast._timer);
    showToast._timer = window.setTimeout(() => {
      toastEl.classList.add('hidden');
    }, 3200);
  }

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY) || '';
  }

  function getCachedSession() {
    try {
      const raw = sessionStorage.getItem(TOKEN_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_error) {
      return null;
    }
  }

  function cacheSession(session) {
    if (!session) {
      sessionStorage.removeItem(TOKEN_KEY);
      return;
    }
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify(session));
  }

  function canManageSession() {
    return state.adminSession?.role === 'operator';
  }

  function operatorDisabledAttr() {
    return canManageSession() ? '' : 'disabled title="Sessao em modo leitura. Use token de operador para esta acao."';
  }

  function updateSessionIndicator() {
    const roleEl = document.getElementById('session-role-indicator');
    if (!roleEl) return;
    const role = state.adminSession?.role === 'viewer' ? 'Leitura' : 'Operacao';
    roleEl.textContent = `Sessao ${role}`;
    roleEl.className = `pill ${state.adminSession?.role === 'viewer' ? 'warning' : 'connected'}`;
  }

  function applySessionPermissions() {
    updateSessionIndicator();
    const canManage = canManageSession();
    const createInstanceSubmit = document.querySelector('#create-instance-form button[type="submit"]');
    const messageSubmit = document.querySelector('#message-form button[type="submit"]');
    const settingsInputs = document.querySelectorAll('#settings-form input');
    const settingsSave = document.getElementById('settings-save-button');
    const settingsReset = document.getElementById('settings-reset-button');
    if (createInstanceSubmit) createInstanceSubmit.disabled = !canManage;
    if (messageSubmit) messageSubmit.disabled = !canManage;
    settingsInputs.forEach((input) => {
      input.disabled = !canManage;
    });
    if (settingsSave) settingsSave.disabled = !canManage;
    if (settingsReset) settingsReset.disabled = !canManage;
  }

  async function apiFetch(url, options) {
    const headers = new Headers(options?.headers || {});
    if (options?.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(url, { ...options, headers });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.success === false) {
      throw new Error(data?.error?.message || 'Falha na requisicao.');
    }

    return data.data;
  }

  function formatDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(date);
  }

  function formatPercent(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) return '-';
    return `${numeric.toFixed(1)}%`;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function downloadJsonFile(filename, payload) {
    const blob = new Blob([JSON.stringify(payload || {}, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function getClinicPrimaryName(instance) {
    const clinicName = String(instance?.clinicName || '').trim();
    const displayName = String(instance?.displayName || '').trim();
    return clinicName || displayName || String(instance?.clinicId || '').trim() || 'Clinica sem identificacao';
  }

  function getClinicSecondaryName(instance) {
    const legalName = String(instance?.clinicLegalName || '').trim();
    if (legalName) return legalName;
    const displayName = String(instance?.displayName || '').trim();
    const clinicName = String(instance?.clinicName || '').trim();
    if (displayName && displayName !== clinicName) return displayName;
    return '';
  }

  function statusClass(status) {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'connected') return 'status-connected';
    if (normalized === 'connecting') return 'status-connecting';
    if (normalized === 'error') return 'status-error';
    if (normalized === 'created') return 'status-created';
    return 'status-disconnected';
  }

  function jobStatusClass(status) {
    const normalized = String(status || '').toUpperCase();
    if (normalized === 'SENT') return 'status-connected';
    if (normalized === 'PROCESSING') return 'status-connecting';
    if (normalized === 'FAILED' || normalized === 'BLOCKED') return 'status-error';
    return 'status-created';
  }

  function severityClass(value) {
    const normalized = String(value || '').toLowerCase();
    if (normalized === 'critical') return 'status-error';
    if (normalized === 'warning') return 'status-connecting';
    return 'status-connected';
  }

  function normalizeOperationalHealthLabel(value) {
    const normalized = String(value || '').toLowerCase();
    if (normalized === 'healthy') return 'Saudavel';
    if (normalized === 'warning') return 'Atencao';
    if (normalized === 'critical') return 'Critico';
    if (normalized === 'unconfigured') return 'Nao configurado';
    return 'Aguardando';
  }

  function formatPressureReasons(reasons) {
    const list = Array.isArray(reasons) ? reasons : [];
    if (!list.length) return 'Operacao estavel';
    const labels = {
      fila: 'Fila',
      bloqueios: 'Bloqueios',
      falha_de_envio: 'Falha de envio',
      instancia_em_erro: 'Instancia em erro',
      reconnect: 'Reconnect',
      cooldown: 'Cooldown',
      qr_pendente: 'QR pendente',
      pareamento: 'Pareamento',
      runtime: 'Runtime',
      inatividade: 'Inatividade',
      rbac: 'RBAC',
    };
    return list.map((item) => labels[item] || item).join(' • ');
  }

  function boolBadge(value, positiveLabel = 'Configurado', negativeLabel = 'Nao configurado') {
    const enabled = Boolean(value);
    return `<span class="status-badge ${enabled ? 'status-connected' : 'status-error'}">${escapeHtml(enabled ? positiveLabel : negativeLabel)}</span>`;
  }

  function renderSettingsList(containerId, items, emptyMessage) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const validItems = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!validItems.length) {
      container.className = 'activity-list empty-state';
      container.textContent = emptyMessage || 'Nenhuma configuracao disponivel.';
      return;
    }
    container.className = 'activity-list';
    container.innerHTML = validItems.map((item) => `
      <article class="activity-item settings-item">
        <div class="activity-item-head">
          <strong>${escapeHtml(item.label || '-')}</strong>
          ${item.badge || ''}
        </div>
        <p class="muted">${escapeHtml(item.description || '-')}</p>
      </article>
    `).join('');
  }

  function renderSettingsOverview(data) {
    const runtime = data?.runtime || {};
    const storage = data?.storage || {};
    const integrations = data?.integrations || {};
    const monitoring = data?.monitoring || {};
    const retention = data?.retention || {};
    const protection = data?.protection || {};
    const editable = data?.editable || {};
    const effective = editable.effective || {};
    const overrides = editable.overrides || {};

    const runtimeModeEl = document.getElementById('settings-runtime-mode');
    const centralStatusEl = document.getElementById('settings-central-status');
    const monitorStatusEl = document.getElementById('settings-monitor-status');
    const capacityPerClinicEl = document.getElementById('settings-capacity-per-clinic');
    const noteEl = document.getElementById('settings-override-note');

    if (runtimeModeEl) runtimeModeEl.textContent = String(runtime.nodeEnv || '-');
    if (centralStatusEl) centralStatusEl.textContent = integrations.centralBackendConfigured ? 'Conectado' : 'Atencao';
    if (monitorStatusEl) monitorStatusEl.textContent = Number(monitoring.syntheticMonitorIntervalMs || 0) > 0 ? 'Ativo' : 'Desligado';
    if (capacityPerClinicEl) capacityPerClinicEl.textContent = String(protection.serverMaxActiveJobsPerClinic || '-');
    if (noteEl) {
      const overrideKeys = Object.keys(overrides || {});
      noteEl.textContent = overrideKeys.length
        ? `Overrides ativos: ${overrideKeys.join(', ')}. Arquivo: ${editable.filePath || 'nao informado'}.`
        : `Sem overrides ativos. Arquivo: ${editable.filePath || 'nao informado'}.`;
    }

    const assignInputValue = (id, value) => {
      const element = document.getElementById(id);
      if (element) element.value = String(value ?? '');
    };
    assignInputValue('settings-clinic-sla-warning', effective.clinicSlaWarningRatePct);
    assignInputValue('settings-clinic-sla-critical', effective.clinicSlaCriticalRatePct);
    assignInputValue('settings-synthetic-interval', effective.syntheticMonitorIntervalMs);
    assignInputValue('settings-synthetic-cooldown', effective.syntheticAlertCooldownMs);
    assignInputValue('settings-maintenance-interval', effective.maintenanceCleanupIntervalMs);
    assignInputValue('settings-retention-jobs', effective.retentionMessageJobsDays);
    assignInputValue('settings-retention-logs', effective.retentionMessageLogsDays);
    assignInputValue('settings-retention-events', effective.retentionOperationalEventsDays);
    applySessionPermissions();

    renderSettingsList('settings-runtime-list', [
      { label: `Porta HTTP ${runtime.port || '-'}`, description: `Log level ${runtime.logLevel || '-'} e sessoes em ${runtime.sessionsDir || '-'}.` },
      { label: `Workers ${runtime.workerConcurrency || 0}`, description: `Tentativas por mensagem: ${runtime.messageMaxAttempts || 0}. Backoff inicial: ${runtime.messageBackoffMs || 0} ms.` },
      { label: 'Banco e Redis', description: `Database ${storage.databaseConfigured ? 'configurado' : 'nao configurado'}, Redis ${storage.redisHost || '-'}:${storage.redisPort || '-'}. Senha ${storage.redisPasswordConfigured ? 'configurada' : 'nao configurada'}.` },
    ], 'Falha ao carregar runtime.');

    renderSettingsList('settings-integrations-list', [
      { label: 'Central backend', description: String(integrations.centralBackendBaseUrl || 'Nao configurado'), badge: boolBadge(integrations.centralBackendConfigured, 'Conectado', 'Pendente') },
      { label: 'Token interno do NG', description: 'Necessario para endpoints internos, smoke, readiness e operacao integrada.', badge: boolBadge(integrations.internalServiceTokenConfigured) },
      { label: 'Painel admin', description: 'Perfis separados para operador e visualizacao read-only.', badge: boolBadge(integrations.adminPanelOperatorEnabled && integrations.adminPanelReadOnlyEnabled, 'RBAC ativo', 'RBAC parcial') },
      { label: 'Webhook de alerta', description: 'Canal externo para incidentes criticos do monitor sintetico.', badge: boolBadge(integrations.opsAlertWebhookConfigured, 'Ativo', 'Nao configurado') },
    ], 'Falha ao carregar integracoes.');

    renderSettingsList('settings-monitoring-list', [
      { label: `Monitor sintetico a cada ${monitoring.syntheticMonitorIntervalMs || 0} ms`, description: `Cooldown de alerta: ${monitoring.syntheticAlertCooldownMs || 0} ms.` },
      { label: `Clinicas monitoradas: ${monitoring.monitoredClinicCount || 0}`, description: Array.isArray(monitoring.monitoredClinicIds) && monitoring.monitoredClinicIds.length ? monitoring.monitoredClinicIds.join(', ') : 'Nenhuma clinica fixa configurada.' },
      { label: 'SLA operacional', description: `Warning abaixo de ${monitoring.clinicSlaWarningRatePct || 0}% e critico abaixo de ${monitoring.clinicSlaCriticalRatePct || 0}%.` },
      { label: 'Limpeza automatica', description: `Executada a cada ${monitoring.maintenanceCleanupIntervalMs || 0} ms.` },
    ], 'Falha ao carregar monitoracao.');

    renderSettingsList('settings-retention-list', [
      { label: `Jobs encerrados por ${retention.messageJobsDays || 0} dias`, description: 'Mantem fila ativa segura e remove historico encerrado.' },
      { label: `Logs por ${retention.messageLogsDays || 0} dias`, description: 'Preserva trilha recente sem inflar storage.' },
      { label: `Eventos operacionais por ${retention.operationalEventsDays || 0} dias`, description: 'Sustenta overview, auditoria e investigacao recente.' },
    ], 'Falha ao carregar retencao.');

    renderSettingsList('settings-protection-list', [
      { label: `Capacidade global ${protection.serverMaxActiveJobsGlobal || 0} jobs`, description: `Limite por clinica: ${protection.serverMaxActiveJobsPerClinic || 0} jobs ativos.` },
      { label: `Cooldown por instancia ${protection.instanceSendCooldownBaseMs || 0} -> ${protection.instanceSendCooldownMaxMs || 0} ms`, description: 'Evita rajada de retries em runtime instavel.' },
      { label: `Circuit breaker ${protection.instanceCircuitBreakerThreshold || 0} falhas`, description: `Janela ${protection.instanceCircuitBreakerWindowMs || 0} ms e abertura ${protection.instanceCircuitBreakerOpenMs || 0} ms.` },
      { label: `Runtime recovery ${protection.runtimeRecoveryConcurrency || 0} concorrentes`, description: `Delay entre lotes ${protection.runtimeRecoveryDelayMs || 0} ms. Reconnect ${protection.reconnectBaseDelayMs || 0} -> ${protection.reconnectMaxDelayMs || 0} ms.` },
    ], 'Falha ao carregar protecao.');
  }

  function matchesOperationalRiskFilters(item) {
    const severityFilter = String(document.getElementById('ops-severity-filter')?.value || '').trim().toLowerCase();
    const causeFilter = String(document.getElementById('ops-cause-filter')?.value || '').trim().toLowerCase();
    const reasons = Array.isArray(item?.pressureReasons) ? item.pressureReasons.map((entry) => String(entry || '').toLowerCase()) : [];
    const severity = String(item?.severity || '').trim().toLowerCase();
    const matchesSeverity = !severityFilter || severity === severityFilter;
    const matchesCause = !causeFilter || reasons.includes(causeFilter);
    return matchesSeverity && matchesCause;
  }

  function formatWebhookEventLabel(eventName) {
    const value = String(eventName || '').trim();
    if (!value) return 'Evento nao informado';
    const normalized = value.toLowerCase();
    if (normalized === 'connected') return 'Ao conectar';
    if (normalized === 'disconnected') return 'Ao desconectar';
    if (normalized === 'message received') return 'Ao receber';
    if (normalized === 'message sent') return 'Ao enviar';
    if (normalized === 'error') return 'Erros e falhas';
    return value;
  }

  function formatWebhookEventSupport(eventName) {
    const normalized = String(eventName || '').trim().toLowerCase();
    if (normalized === 'message received') return 'Entrega eventos de entrada e contexto do remetente.';
    if (normalized === 'message sent') return 'Cobertura de envio, confirmacao e rastreio basico.';
    if (normalized === 'connected') return 'Sinal de pareamento e socket ativo.';
    if (normalized === 'disconnected') return 'Sinaliza perda de sessao ou socket encerrado.';
    if (normalized === 'error') return 'Falhas operacionais e eventos criticos.';
    return 'Evento suportado pela camada estrutural atual.';
  }

  function setDetailsTab(tab) {
    state.selectedDetailsTab = tab === 'webhooks' ? 'webhooks' : 'overview';
    if (state.selectedDetailsTab === 'webhooks' && !state.webhooksLoaded) {
      void loadWebhooksModule();
    }
    document.querySelectorAll('.detail-tab').forEach((button) => {
      button.classList.toggle('active', button.dataset.detailTab === state.selectedDetailsTab);
    });
    document.querySelectorAll('.detail-tab-panel').forEach((panel) => {
      panel.classList.toggle('active', panel.dataset.detailPanel === state.selectedDetailsTab);
    });
  }

  function isRecentActivity(value, hours) {
    if (!value) return false;
    const timestamp = new Date(value).getTime();
    if (Number.isNaN(timestamp)) return false;
    return Date.now() - timestamp <= (hours || 24) * 60 * 60 * 1000;
  }

  function copyText(value, label) {
    navigator.clipboard.writeText(String(value || ''))
      .then(() => showToast(`${label} copiado.`, 'success'))
      .catch(() => showToast(`Falha ao copiar ${label.toLowerCase()}.`, 'error'));
  }

  function updateViewMeta(view) {
    const meta = VIEW_META[view] || VIEW_META.dashboard;
    const eyebrow = document.getElementById('page-eyebrow');
    const title = document.getElementById('page-title');
    const description = document.getElementById('page-description');
    if (eyebrow) eyebrow.textContent = meta.eyebrow;
    if (title) title.textContent = meta.title;
    if (description) description.textContent = meta.description;
  }

  function updateSummary(summary) {
    document.getElementById('summary-total').textContent = String(summary.total || 0);
    document.getElementById('summary-connected').textContent = String(summary.CONNECTED || 0);
    document.getElementById('summary-connecting').textContent = String(summary.CONNECTING || 0);
    document.getElementById('summary-disconnected').textContent = String(summary.DISCONNECTED || 0);
    document.getElementById('summary-error').textContent = String(summary.ERROR || 0);
    document.getElementById('dashboard-instances-error').textContent = String(summary.ERROR || 0);
  }

  function updateMessageSummary(summary) {
    state.messageSummary = {
      sentToday: summary.sentToday || 0,
      failedToday: summary.failedToday || 0,
      queuedToday: summary.queuedToday || 0,
      processingToday: summary.processingToday || 0,
    };

    document.getElementById('messages-sent-today').textContent = String(state.messageSummary.sentToday);
    document.getElementById('messages-failed-today').textContent = String(state.messageSummary.failedToday);
    document.getElementById('messages-queued-today').textContent = String(state.messageSummary.queuedToday);
    document.getElementById('messages-processing-today').textContent = String(state.messageSummary.processingToday);
    document.getElementById('dashboard-sent-today').textContent = String(state.messageSummary.sentToday);
    document.getElementById('dashboard-failed-today').textContent = String(state.messageSummary.failedToday);
    document.getElementById('dashboard-queued-today').textContent = String(state.messageSummary.queuedToday);
    document.getElementById('dashboard-processing-today').textContent = String(state.messageSummary.processingToday);
  }

  function updateConnectionIndicator(ok) {
    state.apiHealthy = ok;
    const indicator = document.getElementById('connection-indicator');
    const dashboardStatus = document.getElementById('dashboard-api-status');
    const dashboardRefresh = document.getElementById('dashboard-last-refresh');
    const lastRefresh = document.getElementById('last-refresh')?.textContent || 'Sem sincronizacao';

    if (indicator) {
      indicator.textContent = ok ? 'API online' : 'API com erro';
      indicator.className = `pill ${ok ? 'connected' : 'error'}`;
    }
    if (dashboardStatus) dashboardStatus.textContent = ok ? 'Online e respondendo' : 'Falha de comunicacao';
    if (dashboardRefresh) dashboardRefresh.textContent = lastRefresh;
  }

  function renderRecentActivity() {
    const container = document.getElementById('recent-activity');
    if (!container) return;
    const items = [...state.instances]
      .sort((a, b) => new Date(b.lastSeenAt || b.updatedAt || b.createdAt || 0) - new Date(a.lastSeenAt || a.updatedAt || a.createdAt || 0))
      .slice(0, 5);

    if (!items.length) {
      container.className = 'activity-list empty-state';
      container.textContent = 'Nenhuma atividade recente disponivel.';
      return;
    }

    container.className = 'activity-list';
    container.innerHTML = items.map((instance) => `
      <article class="activity-item">
        <div class="activity-item-head">
          <strong>${escapeHtml(getClinicPrimaryName(instance))}</strong>
          <span class="status-badge ${statusClass(instance.status)}">${escapeHtml(instance.status)}</span>
        </div>
        <p class="muted">${escapeHtml(instance.clinicId)}</p>
        <p class="muted">${escapeHtml(getClinicSecondaryName(instance) || instance.id)}</p>
        <p class="muted">Ultima atividade em ${escapeHtml(formatDate(instance.lastSeenAt || instance.updatedAt || instance.createdAt))}</p>
      </article>
    `).join('');
  }

  function renderRecentClinics() {
    const container = document.getElementById('recent-clinics');
    if (!container) return;
    const inactiveCount = state.instances.filter((item) => !isRecentActivity(item.lastSeenAt || item.updatedAt || item.createdAt, 24)).length;
    document.getElementById('dashboard-inactive-count').textContent = String(inactiveCount);

    const clinics = [...state.instances]
      .sort((a, b) => new Date(b.lastSeenAt || b.updatedAt || b.createdAt || 0) - new Date(a.lastSeenAt || a.updatedAt || a.createdAt || 0))
      .slice(0, 5);

    if (!clinics.length) {
      container.className = 'activity-list empty-state';
      container.textContent = 'Nenhuma clinica com atividade recente.';
      return;
    }

    container.className = 'activity-list';
    container.innerHTML = clinics.map((instance) => `
      <article class="activity-item">
        <div class="activity-item-head">
          <strong>${escapeHtml(getClinicPrimaryName(instance))}</strong>
          <span class="muted">${escapeHtml(formatDate(instance.lastSeenAt || instance.updatedAt || instance.createdAt))}</span>
        </div>
        <p class="muted">${escapeHtml(instance.clinicId)}</p>
        <p class="muted">${escapeHtml(getClinicSecondaryName(instance) || 'Sem nome operacional')}</p>
        <p class="muted">${escapeHtml(instance.phoneNumber || 'Sem numero vinculado')}</p>
      </article>
    `).join('');
  }

  function renderOperationsOverview(data) {
    state.operationsOverview = data || null;
    const summary = data?.summary || {};
    const clinicPressure = (Array.isArray(data?.topClinicPressure) ? data.topClinicPressure : []).filter(matchesOperationalRiskFilters);
    const riskClinics = (Array.isArray(data?.topClinicRisks) ? data.topClinicRisks : []).filter(matchesOperationalRiskFilters);
    const riskInstances = (Array.isArray(data?.topInstanceRisks) ? data.topInstanceRisks : []).filter(matchesOperationalRiskFilters);
    const pressureContainer = document.getElementById('dashboard-clinic-pressure');
    const clinicsContainer = document.getElementById('dashboard-risk-clinics');
    const instancesContainer = document.getElementById('dashboard-risk-instances');

    const clinicsAtRiskEl = document.getElementById('dashboard-clinics-at-risk');
    const queuePressureEl = document.getElementById('dashboard-queue-pressure');
    const adminDeniedEl = document.getElementById('dashboard-admin-denied');
    const runtimeFailuresEl = document.getElementById('dashboard-runtime-failures');
    const clinicsCooldownEl = document.getElementById('dashboard-clinics-cooldown');
    const clinicsQrPendingEl = document.getElementById('dashboard-clinics-qr-pending');
    const reconnectingInstancesEl = document.getElementById('dashboard-reconnecting-instances');
    const clinicsBelowSlaEl = document.getElementById('dashboard-clinics-below-sla');
    const activeAlertsEl = document.getElementById('dashboard-active-alerts');
    const syntheticStatusEl = document.getElementById('dashboard-synthetic-status');
    const centralStatusEl = document.getElementById('dashboard-central-status');
    const maintenanceStatusEl = document.getElementById('dashboard-maintenance-status');
    const maintenanceNoteEl = document.getElementById('dashboard-maintenance-note');

    if (clinicsAtRiskEl) clinicsAtRiskEl.textContent = String(summary.clinicsAtRisk || 0);
    if (queuePressureEl) queuePressureEl.textContent = String(summary.clinicsWithQueuePressure || 0);
    if (adminDeniedEl) adminDeniedEl.textContent = String(summary.adminDeniedRecent || 0);
    if (runtimeFailuresEl) runtimeFailuresEl.textContent = String(summary.runtimeFailuresRecent || 0);
    if (clinicsCooldownEl) clinicsCooldownEl.textContent = String(summary.clinicsInCooldown || 0);
    if (clinicsQrPendingEl) clinicsQrPendingEl.textContent = String(summary.clinicsWithQrPending || 0);
    if (reconnectingInstancesEl) reconnectingInstancesEl.textContent = String(summary.reconnectingInstances || 0);
    if (clinicsBelowSlaEl) clinicsBelowSlaEl.textContent = String(summary.clinicsBelowSla || 0);
    if (activeAlertsEl) activeAlertsEl.textContent = String(summary.activeOperationalAlerts || 0);
    if (syntheticStatusEl) {
      const syntheticStatus = String(summary.syntheticStatus || data?.syntheticMonitor?.status || '').toLowerCase();
      syntheticStatusEl.textContent = normalizeOperationalHealthLabel(syntheticStatus);
      syntheticStatusEl.className = severityClass(syntheticStatus === 'unconfigured' ? 'warning' : syntheticStatus);
    }
    if (centralStatusEl) {
      const centralStatus = String(summary.centralStatus || data?.syntheticMonitor?.centralStatus || '').toLowerCase();
      centralStatusEl.textContent = normalizeOperationalHealthLabel(centralStatus);
      centralStatusEl.className = severityClass(centralStatus === 'unconfigured' ? 'warning' : centralStatus);
    }
    if (maintenanceStatusEl) {
      maintenanceStatusEl.textContent = data?.maintenance?.lastCompletedAt ? `Limpeza em ${formatDate(data.maintenance.lastCompletedAt)}` : 'Sem limpeza registrada';
    }
    if (maintenanceNoteEl) {
      const pruned = data?.maintenance?.lastPruned || {};
      maintenanceNoteEl.textContent = data?.maintenance?.lastErrorAt
        ? `Ultima falha: ${formatDate(data.maintenance.lastErrorAt)} - ${data.maintenance.lastErrorMessage || 'erro nao informado'}`
        : `Removidos na ultima rotina: logs ${pruned.messageLogs || 0}, jobs ${pruned.messageJobs || 0}, eventos ${pruned.operationalEvents || 0}.`;
    }

    if (pressureContainer) {
      if (!clinicPressure.length) {
        pressureContainer.className = 'activity-list empty-state';
        pressureContainer.textContent = 'Nenhuma clinica com pressao operacional na janela atual.';
      } else {
        pressureContainer.className = 'activity-list';
        pressureContainer.innerHTML = clinicPressure.map((item) => `
          <article class="activity-item ops-risk-item">
            <div class="activity-item-head">
              <strong>${escapeHtml(item.clinicName || item.clinicId)}</strong>
              <div class="compact-actions">
                <span class="status-badge ${severityClass(item.severity)}">${escapeHtml(item.severity)}</span>
                <span class="status-badge">${escapeHtml(item.pressureScore || 0)} pts</span>
              </div>
            </div>
            <p class="muted">${escapeHtml(item.clinicId)}</p>
            <p class="ops-reasons">${escapeHtml(formatPressureReasons(item.pressureReasons))}</p>
            <div class="ops-metrics">
              <span>Fila: ${escapeHtml(item.queuePressure)}</span>
              <span>Bloqueados: ${escapeHtml(item.blockedJobs || 0)}</span>
              <span>SLA: ${escapeHtml(formatPercent(item.deliverySuccessRate))}</span>
              <span>Cooldown: ${escapeHtml(item.coolingDownCount)}</span>
              <span>Reconnect: ${escapeHtml(item.reconnectScheduledCount)}</span>
              <span>QR: ${escapeHtml(item.qrPendingCount + item.qrAvailableCount)}</span>
              <span>Pareamento: ${escapeHtml(item.pairingPendingCount)}</span>
              <span>Runtime: ${escapeHtml(item.runtimeDegradedCount)}</span>
            </div>
            <div class="panel-actions">
              <button class="btn btn-secondary btn-small" type="button" data-open-clinic-id="${escapeHtml(item.clinicId)}" data-open-clinic-view="instances">Ver instancias</button>
              <button class="btn btn-ghost btn-small" type="button" data-open-clinic-id="${escapeHtml(item.clinicId)}" data-open-clinic-view="logs">Ver logs</button>
            </div>
          </article>
        `).join('');
      }
    }

    if (clinicsContainer) {
      if (!riskClinics.length) {
        clinicsContainer.className = 'activity-list empty-state';
        clinicsContainer.textContent = 'Nenhuma clinica com risco operacional na janela atual.';
      } else {
        clinicsContainer.className = 'activity-list';
        clinicsContainer.innerHTML = riskClinics.map((item) => `
          <article class="activity-item ops-risk-item">
            <div class="activity-item-head">
              <strong>${escapeHtml(item.clinicName || item.clinicId)}</strong>
              <span class="status-badge ${severityClass(item.severity)}">${escapeHtml(item.severity)}</span>
            </div>
            <p class="muted">${escapeHtml(item.clinicId)}</p>
            <p class="ops-reasons">${escapeHtml(formatPressureReasons(item.pressureReasons))}</p>
            <div class="ops-metrics">
              <span>Instancias: ${escapeHtml(item.instanceCount)}</span>
              <span>Erros: ${escapeHtml(item.errorCount)}</span>
              <span>Fila: ${escapeHtml(item.queuePressure)}</span>
              <span>Bloqueados: ${escapeHtml(item.blockedJobs || 0)}</span>
              <span>SLA: ${escapeHtml(formatPercent(item.deliverySuccessRate))}</span>
              <span>Falhas: ${escapeHtml(item.failedJobs)}</span>
              <span>Inativas: ${escapeHtml(item.inactiveCount)}</span>
            </div>
            <div class="panel-actions">
              <button class="btn btn-secondary btn-small" type="button" data-open-clinic-id="${escapeHtml(item.clinicId)}" data-open-clinic-view="instances">Ver instancias</button>
              <button class="btn btn-ghost btn-small" type="button" data-open-clinic-id="${escapeHtml(item.clinicId)}" data-open-clinic-view="messages">Ver mensagens</button>
            </div>
          </article>
        `).join('');
      }
    }

    if (instancesContainer) {
      if (!riskInstances.length) {
        instancesContainer.className = 'activity-list empty-state';
        instancesContainer.textContent = 'Nenhuma instancia exigindo manutencao agora.';
      } else {
        instancesContainer.className = 'activity-list';
        instancesContainer.innerHTML = riskInstances.map((item) => `
          <article class="activity-item ops-risk-item">
            <div class="activity-item-head">
              <strong>${escapeHtml(item.clinicName || item.instanceId)}</strong>
              <span class="status-badge ${severityClass(item.severity)}">${escapeHtml(item.severity)}</span>
            </div>
            <p class="muted">${escapeHtml(item.instanceId)} - ${escapeHtml(item.clinicId)}</p>
            <p class="ops-reasons">${escapeHtml(formatPressureReasons(item.pressureReasons))}</p>
            <div class="ops-metrics">
              <span>Status: ${escapeHtml(item.status)}</span>
              <span>Runtime: ${escapeHtml(item.runtimeSocketState || '-')}</span>
              <span>Fila: ${escapeHtml(item.queuePressure)}</span>
              <span>Bloqueados: ${escapeHtml(item.blockedJobs || 0)}</span>
              <span>SLA: ${escapeHtml(formatPercent(item.deliverySuccessRate))}</span>
              <span>Falhas: ${escapeHtml(item.failedJobs)}</span>
              <span>Reconnect: ${escapeHtml(item.reconnectAttempt || 0)}</span>
              <span>${item.inactive ? 'Sem atividade 24h' : 'Ativa 24h'}</span>
            </div>
            <div class="panel-actions">
              <button class="btn btn-secondary btn-small" type="button" data-open-instance-id="${escapeHtml(item.instanceId)}">Abrir cockpit</button>
              <button class="btn btn-ghost btn-small" type="button" data-open-clinic-id="${escapeHtml(item.clinicId)}" data-open-clinic-view="logs">Ver logs</button>
            </div>
          </article>
        `).join('');
      }
    }
  }

  function updateSegmentButtons() {
    document.querySelectorAll('.instance-tab').forEach((button) => {
      button.classList.toggle('active', button.dataset.instanceSegment === state.instanceSegment);
    });
  }

  function renderInstancesPagination() {
    const totalItems = state.filteredInstances.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / INSTANCES_PER_PAGE));
    const start = totalItems ? ((state.instancesPage - 1) * INSTANCES_PER_PAGE) + 1 : 0;
    const end = Math.min(totalItems, state.instancesPage * INSTANCES_PER_PAGE);
    const meta = document.getElementById('instances-pagination-meta');
    const prev = document.getElementById('instances-prev-page');
    const next = document.getElementById('instances-next-page');
    if (meta) meta.textContent = totalItems ? `Mostrando ${start}-${end} de ${totalItems} instancias` : 'Nenhuma instancia para exibir';
    if (prev) prev.disabled = state.instancesPage <= 1;
    if (next) next.disabled = state.instancesPage >= totalPages;
  }

  function renderInstancesTable() {
    const tbody = document.getElementById('instances-table-body');
    if (!tbody) return;

    if (!state.filteredInstances.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Nenhuma instancia encontrada para os filtros atuais.</td></tr>';
      renderInstancesPagination();
      return;
    }

    const start = (state.instancesPage - 1) * INSTANCES_PER_PAGE;
    state.paginatedInstances = state.filteredInstances.slice(start, start + INSTANCES_PER_PAGE);
    tbody.innerHTML = state.paginatedInstances.map((instance) => `
      <tr class="${state.selectedInstanceId === instance.id ? 'selected-row' : ''} instance-row" data-open-instance-id="${escapeHtml(instance.id)}">
        <td>
          <span class="status-badge ${statusClass(instance.status)}">${escapeHtml(instance.status)}</span>
          <div class="row-hint">Clique para abrir o cockpit da clinica</div>
        </td>
        <td>
          <button class="table-link" data-open-instance-id="${escapeHtml(instance.id)}" type="button">${escapeHtml(instance.clinicId)}</button>
          <div class="row-secondary">${escapeHtml(getClinicPrimaryName(instance))}</div>
          <div class="row-secondary">${escapeHtml(getClinicSecondaryName(instance) || 'Sem nome juridico complementar')}</div>
        </td>
        <td>
          <button class="table-link" data-open-instance-id="${escapeHtml(instance.id)}" type="button">${escapeHtml(instance.id)}</button>
          <div class="row-secondary">${escapeHtml(instance.connectedInRuntime ? `Runtime ${instance.runtimeSocketState || 'OPEN'}` : `Runtime ${instance.runtimeSocketState || 'inativo'}`)}</div>
        </td>
        <td>${escapeHtml(instance.phoneNumber || '-')}</td>
        <td>
          <div>${escapeHtml(instance.displayName || '-')}</div>
          <div class="row-secondary">${escapeHtml(instance.clinicDocument || '-')}</div>
        </td>
        <td>${escapeHtml(formatDate(instance.createdAt))}</td>
        <td>${escapeHtml(formatDate(instance.lastSeenAt || instance.updatedAt))}</td>
        <td>
          <div class="instance-actions actions-inline">
            <button class="btn btn-secondary btn-small" data-action="details" data-id="${escapeHtml(instance.id)}" type="button">Detalhes</button>
            <button class="btn btn-secondary btn-small" data-action="status" data-id="${escapeHtml(instance.id)}" type="button">Status</button>
            <button class="btn btn-secondary btn-small" data-action="qr" data-id="${escapeHtml(instance.id)}" type="button" ${operatorDisabledAttr()}>QR</button>
            <button class="btn btn-secondary btn-small" data-action="disconnect" data-id="${escapeHtml(instance.id)}" type="button" ${operatorDisabledAttr()}>Desconectar</button>
            <button class="btn btn-ghost btn-small" data-action="delete" data-id="${escapeHtml(instance.id)}" type="button" ${operatorDisabledAttr()}>Excluir</button>
            <button class="btn btn-secondary btn-small" data-action="test" data-id="${escapeHtml(instance.id)}" data-clinic-id="${escapeHtml(instance.clinicId)}" type="button" ${operatorDisabledAttr()}>Teste</button>
            <button class="btn btn-ghost btn-small" data-action="copy-instance" data-id="${escapeHtml(instance.id)}" type="button">Copiar instanceId</button>
            <button class="btn btn-ghost btn-small" data-action="copy-clinic" data-clinic-id="${escapeHtml(instance.clinicId)}" type="button">Copiar clinicId</button>
          </div>
        </td>
      </tr>
    `).join('');
    renderInstancesPagination();
  }

  function renderInstanceShortcuts(instance) {
    const container = document.getElementById('instance-shortcuts');
    if (!container) return;

    if (!instance) {
      container.className = 'actions-inline empty-state';
      container.textContent = 'Selecione uma instancia para habilitar os atalhos.';
      return;
    }

    container.className = 'actions-inline';
    container.innerHTML = `
      <button class="btn btn-secondary btn-small" data-action="qr" data-id="${escapeHtml(instance.id)}" type="button" ${operatorDisabledAttr()}>Gerar QR</button>
      <button class="btn btn-secondary btn-small" data-action="status" data-id="${escapeHtml(instance.id)}" type="button">Atualizar status</button>
      <button class="btn btn-secondary btn-small" data-action="disconnect" data-id="${escapeHtml(instance.id)}" type="button" ${operatorDisabledAttr()}>Desconectar</button>
      <button class="btn btn-ghost btn-small" data-action="delete" data-id="${escapeHtml(instance.id)}" type="button" ${operatorDisabledAttr()}>Excluir</button>
      <button class="btn btn-secondary btn-small" data-action="test" data-id="${escapeHtml(instance.id)}" data-clinic-id="${escapeHtml(instance.clinicId)}" type="button" ${operatorDisabledAttr()}>Teste de mensagem</button>
      <button class="btn btn-ghost btn-small" data-action="copy-instance" data-id="${escapeHtml(instance.id)}" type="button">Copiar instanceId</button>
      <button class="btn btn-ghost btn-small" data-action="copy-clinic" data-clinic-id="${escapeHtml(instance.clinicId)}" type="button">Copiar clinicId</button>
    `;
  }

  function renderInstanceHealth(instance) {
    const container = document.getElementById('instance-health');
    if (!container) return;

    if (!instance) {
      container.className = 'stack empty-state';
      container.textContent = 'Selecione uma instancia para ver a saude operacional.';
      return;
    }

    const recent = isRecentActivity(instance.lastSeenAt || instance.updatedAt || instance.createdAt, 24);
    const webhookReady = Boolean(state.webhooksOverview?.supportedEvents?.length);
    container.className = 'stack';
    container.innerHTML = `
      <article class="security-item">
        <div>
          <strong>Saude da instancia</strong>
          <p class="muted">${instance.connectedInRuntime ? `Socket ativo em runtime (${instance.runtimeSocketState || 'OPEN'}).` : `Socket inativo no runtime atual (${instance.runtimeSocketState || 'CLOSED'}).`}</p>
        </div>
        <span class="toggle-chip">${instance.connectedInRuntime ? 'Runtime ativo' : 'Runtime inativo'}</span>
      </article>
      <article class="security-item">
        <div>
          <strong>Atividade recente</strong>
          <p class="muted">${recent ? 'A instancia teve atividade nas ultimas 24h.' : 'Sem atividade recente nas ultimas 24h.'}</p>
        </div>
        <span class="toggle-chip">${recent ? 'Recente' : 'Atencao'}</span>
      </article>
      <article class="security-item">
        <div>
          <strong>Webhook relacionado</strong>
          <p class="muted">${webhookReady ? 'Eventos e payloads ja estao mapeados para esta instancia no modulo visual.' : 'O modulo de webhooks ainda nao foi carregado nesta sessao.'}</p>
        </div>
        <span class="toggle-chip">${webhookReady ? 'Base pronta' : 'Pendente'}</span>
      </article>
    `;
  }

  function renderInstanceWebhooks(instance) {
    const container = document.getElementById('instance-webhooks');
    if (!container) return;

    if (!instance) {
      container.className = 'stack empty-state';
      container.textContent = 'Selecione uma instancia para configurar os webhooks desta clinica.';
      return;
    }

    const webhooks = state.webhooksOverview || {};
    const supportedEvents = Array.isArray(webhooks.supportedEvents) ? webhooks.supportedEvents : [];
    const configured = Boolean(webhooks.configured);
    const selectedEvent = state.selectedWebhookEvent && supportedEvents.includes(state.selectedWebhookEvent)
      ? state.selectedWebhookEvent
      : supportedEvents[0];
    const samplePayload = webhooks.samplePayloads?.[selectedEvent] || {};

    container.className = 'stack';
    container.innerHTML = `
      <div class="instance-webhook-hero">
        <div>
          <span class="pill ${instance.connectedInRuntime ? 'connected' : 'error'}">${instance.connectedInRuntime ? 'Instancia ativa' : 'Instancia em alerta'}</span>
          <h4>${escapeHtml(instance.clinicId)} <span class="muted">/ ${escapeHtml(instance.id)}</span></h4>
          <p class="muted">Painel de configuracao visual da instancia, mantendo o escopo compartilhado atual e preparando o desenho por clinica.</p>
        </div>
        <div class="instance-webhook-meta">
          <div class="health-card compact-card">
            <span class="health-label">URL de destino</span>
            <strong>${escapeHtml(webhooks.baseUrl || 'Nao configurada')}</strong>
            <p class="muted">${configured ? 'Configuracao estrutural carregada.' : 'Sem persistencia por instancia nesta fase.'}</p>
          </div>
          <div class="health-card compact-card">
            <span class="health-label">Escopo atual</span>
            <strong>${webhooks.supportsPerInstanceConfig ? 'Por instancia' : 'Compartilhado'}</strong>
            <p class="muted">${webhooks.supportsPerInstanceConfig ? 'A clinica pode ter regra propria.' : 'A regra visual segue a base global do engine.'}</p>
          </div>
        </div>
      </div>
      <div class="instance-webhook-grid">
        ${supportedEvents.map((eventName) => `
          <button
            class="instance-webhook-card ${selectedEvent === eventName ? 'active' : ''}"
            type="button"
            data-instance-webhook-event="${escapeHtml(eventName)}"
          >
            <span class="instance-webhook-card-copy">
              <strong>${escapeHtml(formatWebhookEventLabel(eventName))}</strong>
              <span class="muted">${escapeHtml(formatWebhookEventSupport(eventName))}</span>
            </span>
            <span class="toggle-chip">${configured ? 'Configurado' : 'Estrutural'}</span>
          </button>
        `).join('') || '<div class="empty-state">Nenhum evento suportado foi informado pelo engine.</div>'}
      </div>
      <div class="instance-webhook-preview-grid">
        <div class="health-card compact-card">
          <span class="health-label">Evento em foco</span>
          <strong>${escapeHtml(formatWebhookEventLabel(selectedEvent))}</strong>
          <p class="muted">${escapeHtml(formatWebhookEventSupport(selectedEvent))}</p>
        </div>
        <div class="health-card compact-card">
          <span class="health-label">Payload de exemplo</span>
          <pre>${escapeHtml(JSON.stringify(samplePayload, null, 2))}</pre>
        </div>
      </div>
    `;
  }

  function renderDetails(instance) {
    const container = document.getElementById('instance-details');
    const subtitle = document.getElementById('instance-details-subtitle');
    const refreshButton = document.getElementById('details-refresh');
    const connectionTestButton = document.getElementById('details-connection-test');
    const openMessagesButton = document.getElementById('details-open-messages');
    const openLogsButton = document.getElementById('details-open-logs');
    if (!container || !subtitle || !refreshButton || !connectionTestButton || !openMessagesButton || !openLogsButton) return;

    if (!instance) {
      subtitle.textContent = 'Selecione uma instancia para ver detalhes operacionais.';
      refreshButton.disabled = true;
      connectionTestButton.disabled = true;
      openMessagesButton.disabled = true;
      openLogsButton.disabled = true;
      container.className = 'details-card empty-state';
      container.textContent = 'Nenhuma instancia selecionada.';
      renderInstanceShortcuts(null);
      renderInstanceHealth(null);
      renderInstanceWebhooks(null);
      return;
    }

    refreshButton.disabled = false;
    connectionTestButton.disabled = false;
    openMessagesButton.disabled = false;
    openLogsButton.disabled = false;
    subtitle.textContent = `${getClinicPrimaryName(instance)} - ${instance.id}`;
    container.className = 'details-card';
    container.innerHTML = `
      <div class="detail-row"><span class="detail-label">Status</span><span><span class="status-badge ${statusClass(instance.status)}">${escapeHtml(instance.status)}</span></span></div>
      <div class="detail-row"><span class="detail-label">Status persistido</span><span>${escapeHtml(instance.persistedStatus || instance.status)}</span></div>
      <div class="detail-row"><span class="detail-label">Clinica</span><span>${escapeHtml(getClinicPrimaryName(instance))}</span></div>
      <div class="detail-row"><span class="detail-label">Razao social</span><span>${escapeHtml(instance.clinicLegalName || '-')}</span></div>
      <div class="detail-row"><span class="detail-label">Clinic ID</span><span>${escapeHtml(instance.clinicId)}</span></div>
      <div class="detail-row"><span class="detail-label">Documento</span><span>${escapeHtml(instance.clinicDocument || '-')}</span></div>
      <div class="detail-row"><span class="detail-label">Instance ID</span><span>${escapeHtml(instance.id)}</span></div>
      <div class="detail-row"><span class="detail-label">Numero</span><span>${escapeHtml(instance.phoneNumber || '-')}</span></div>
      <div class="detail-row"><span class="detail-label">Display name</span><span>${escapeHtml(instance.displayName || '-')}</span></div>
      <div class="detail-row"><span class="detail-label">Ultima atividade</span><span>${escapeHtml(formatDate(instance.lastSeenAt || instance.updatedAt))}</span></div>
      <div class="detail-row"><span class="detail-label">Socket em runtime</span><span>${instance.connectedInRuntime ? 'Sim' : 'Nao'}</span></div>
      <div class="detail-row"><span class="detail-label">Runtime socket state</span><span>${escapeHtml(instance.runtimeSocketState || '-')}</span></div>
    `;
    renderInstanceShortcuts(instance);
    renderInstanceHealth(instance);
    renderInstanceWebhooks(instance);
  }

  function renderLogs(logs) {
    const container = document.getElementById('instance-logs');
    if (!container) return;

    if (!logs || !logs.length) {
      container.className = 'log-list empty-state';
      container.textContent = 'Nenhum log recente para esta instancia.';
      return;
    }

    container.className = 'log-list';
    container.innerHTML = logs.map((log) => `
      <article class="log-item ${String(log.eventType || '').toUpperCase() === 'FAILED' ? 'failed' : ''}">
        <div class="log-head">
          <strong>${escapeHtml(log.eventType)}</strong>
          <span class="log-meta">${escapeHtml(formatDate(log.createdAt))}</span>
        </div>
        <div class="log-meta">jobId: ${escapeHtml(log.job?.id || '-')} - destino: ${escapeHtml(log.job?.toPhone || '-')}</div>
        <pre>${escapeHtml(JSON.stringify(log.payload, null, 2))}</pre>
      </article>
    `).join('');
  }

  function renderInstanceJobs(jobs) {
    const container = document.getElementById('instance-jobs');
    if (!container) return;

    if (!jobs || !jobs.length) {
      container.className = 'jobs-list empty-state';
      container.textContent = 'Nenhum job recente relacionado a esta instancia.';
      return;
    }

    container.className = 'jobs-list';
    container.innerHTML = jobs.map((job) => `
      <article class="job-item ${String(job.status || '').toUpperCase() === 'FAILED' ? 'failed' : ''}">
        <div class="job-head">
          <div>
            <strong>${escapeHtml(job.toPhone)}</strong>
            <p class="muted">${escapeHtml(formatDate(job.createdAt))}</p>
          </div>
          <span class="status-badge ${jobStatusClass(job.status)}">${escapeHtml(job.status)}</span>
        </div>
        <div class="job-preview">${escapeHtml(job.body || '-')}</div>
        ${job.lastError ? `<div class="muted">Erro: ${escapeHtml(job.lastError)}</div>` : ''}
      </article>
    `).join('');
  }

  function renderMessagesList(jobs) {
    const container = document.getElementById('messages-list');
    if (!container) return;

    if (!jobs || !jobs.length) {
      container.className = 'jobs-list empty-state';
      container.textContent = 'Nenhum job encontrado para os filtros atuais.';
      return;
    }

    container.className = 'jobs-list';
    container.innerHTML = jobs.map((job) => `
      <article class="job-item ${String(job.status || '').toUpperCase() === 'FAILED' ? 'failed' : ''}">
        <div class="job-head">
          <div>
            <button class="table-link" data-open-instance-id="${escapeHtml(job.instanceId)}" type="button">${escapeHtml(job.clinicId)}</button>
            <p class="muted"><button class="table-link" data-open-instance-id="${escapeHtml(job.instanceId)}" type="button">${escapeHtml(job.instanceId)}</button></p>
          </div>
          <span class="status-badge ${jobStatusClass(job.status)}">${escapeHtml(job.status)}</span>
        </div>
        <div class="job-meta">
          <span>Destino: ${escapeHtml(job.toPhone)}</span>
          <span>Retry: ${escapeHtml(job.retryCount)}</span>
          <span>Criado em ${escapeHtml(formatDate(job.createdAt))}</span>
        </div>
        <div class="job-preview">${escapeHtml(job.body || '-')}</div>
        ${job.lastError ? `<div class="muted">Erro: ${escapeHtml(job.lastError)}</div>` : ''}
      </article>
    `).join('');
  }

  function renderModuleLogs(logs) {
    const container = document.getElementById('logs-list');
    if (!container) return;

    if (!logs || !logs.length) {
      container.className = 'log-list empty-state';
      container.textContent = 'Nenhum log encontrado para os filtros atuais.';
      return;
    }

    container.className = 'log-list';
    container.innerHTML = logs.map((log) => `
      <article class="log-item ${String(log.eventType || log.type || '').toUpperCase().includes('FAILED') ? 'failed' : ''}">
        <div class="log-head">
          <strong>${escapeHtml(log.eventType || log.type || 'EVENT')}</strong>
          <span class="log-meta">${escapeHtml(formatDate(log.createdAt))}</span>
        </div>
        <div class="log-meta">
          Clinic: <button class="table-link" data-open-instance-id="${escapeHtml(log.job?.instanceId || log.instanceId || '')}" type="button">${escapeHtml(log.job?.clinicId || log.clinicId || '-')}</button>
          - Instance: <button class="table-link" data-open-instance-id="${escapeHtml(log.job?.instanceId || log.instanceId || '')}" type="button">${escapeHtml(log.job?.instanceId || log.instanceId || '-')}</button>
        </div>
        <div class="log-meta">Destino: ${escapeHtml(log.job?.toPhone || log.phone || '-')} - Job: ${escapeHtml(log.job?.id || log.messageJobId || '-')}</div>
        ${log.summary ? `<div class="job-preview">${escapeHtml(log.summary)}</div>` : ''}
        ${log.job?.lastError ? `<div class="muted">Erro: ${escapeHtml(log.job.lastError)}</div>` : ''}
        <pre>${escapeHtml(JSON.stringify(log.payload || {}, null, 2))}</pre>
      </article>
    `).join('');
  }

  function renderWebhookOverview(data) {
    const baseUrl = document.getElementById('webhooks-base-url');
    const baseUrlNote = document.getElementById('webhooks-base-url-note');
    const scopeStatus = document.getElementById('webhooks-scope-status');
    const scopeNote = document.getElementById('webhooks-scope-note');
    const eventCount = document.getElementById('webhooks-event-count');
    const events = document.getElementById('webhooks-events');
    const payload = document.getElementById('webhooks-sample-payload');
    const history = document.getElementById('webhooks-history');

    state.webhooksOverview = data;
    const supportedEvents = Array.isArray(data.supportedEvents) ? data.supportedEvents : [];
    if (!state.selectedWebhookEvent || !supportedEvents.includes(state.selectedWebhookEvent)) {
      state.selectedWebhookEvent = supportedEvents[0] || '';
    }
    if (baseUrl) baseUrl.textContent = data.baseUrl || 'Nao configurada';
    if (baseUrlNote) {
      baseUrlNote.textContent = data.configured
        ? 'Destino estrutural carregado pelo modulo de suporte.'
        : 'Ainda sem destino persistido no engine para esta fase.';
    }
    if (scopeStatus) scopeStatus.textContent = data.supportsPerInstanceConfig ? 'Configuracao por instancia' : 'Estrutura compartilhada';
    if (scopeNote) {
      scopeNote.textContent = data.supportsPerInstanceConfig
        ? 'O modulo aceita isolamento por instancia.'
        : 'O desenho atual reaproveita a base estrutural em todas as clinicas.';
    }
    if (eventCount) eventCount.textContent = `${supportedEvents.length} ${supportedEvents.length === 1 ? 'evento' : 'eventos'}`;
    if (payload) {
      payload.className = 'json-preview';
      payload.textContent = state.selectedWebhookEvent
        ? JSON.stringify(data.samplePayloads?.[state.selectedWebhookEvent] || {}, null, 2)
        : 'Selecione um evento para ver o payload de exemplo.';
    }
    if (history) {
      if (data.recentDeliveries?.length) {
        history.className = 'log-list';
        history.innerHTML = data.recentDeliveries.map((delivery) => `
          <article class="log-item">
            <div class="log-head">
              <strong>${escapeHtml(delivery.event || 'Entrega')}</strong>
              <span class="log-meta">${escapeHtml(formatDate(delivery.timestamp || delivery.createdAt))}</span>
            </div>
            <div class="muted">${escapeHtml(delivery.targetUrl || data.baseUrl || 'Destino nao informado')}</div>
            <div class="log-meta">Clinica: ${escapeHtml(delivery.clinicId || '-')} - Telefone: ${escapeHtml(delivery.fromPhone || '-')}</div>
            <div class="log-meta">Intent: ${escapeHtml(delivery.intent || 'UNKNOWN')} - Status: ${escapeHtml(delivery.status || '-')}</div>
            ${delivery.appointmentId ? `<div class="log-meta">Appointment: ${escapeHtml(delivery.appointmentId)}</div>` : ''}
            ${delivery.bodyPreview ? `<div class="muted">${escapeHtml(delivery.bodyPreview)}</div>` : ''}
          </article>
        `).join('');
      } else {
        history.className = 'log-list empty-state';
        history.textContent = 'Nenhum inbound recente sincronizado com o backend central.';
      }
    }

    if (!events) return;
    events.className = 'webhook-event-grid';
    events.innerHTML = supportedEvents.map((eventName) => `
      <button class="webhook-event-card ${state.selectedWebhookEvent === eventName ? 'active' : ''}" type="button" data-webhook-event="${escapeHtml(eventName)}">
        <span class="webhook-event-copy">
          <strong>${escapeHtml(formatWebhookEventLabel(eventName))}</strong>
          <span class="muted">${escapeHtml(formatWebhookEventSupport(eventName))}</span>
        </span>
        <span class="toggle-chip">${data.configured ? 'Configurado' : 'Estrutural'}</span>
      </button>
    `).join('');

    events.querySelectorAll('[data-webhook-event]').forEach((button) => {
      button.addEventListener('click', () => {
        const eventName = button.getAttribute('data-webhook-event');
        state.selectedWebhookEvent = eventName || '';
        renderWebhookOverview(data);
        if (state.selectedInstanceDetails) renderInstanceWebhooks(state.selectedInstanceDetails);
      });
    });
    if (state.selectedInstanceDetails) renderInstanceWebhooks(state.selectedInstanceDetails);
  }

  function renderSecurityOverview(data) {
    const maskedToken = document.getElementById('security-masked-token');
    const placeholders = document.getElementById('security-placeholders');
    if (maskedToken) maskedToken.textContent = data.maskedServiceToken || 'Nao configurado';
    if (!placeholders) return;

    const items = [
      ['Token de servico', data.hasServiceToken ? 'Token de servico separado e usado para integracao interna.' : 'Nenhum token de servico configurado.'],
      ['Token do painel', data.hasAdminPanelToken ? 'Painel autenticado com token proprio, sem reutilizar o token de servico.' : 'Nenhum token de painel configurado.'],
      ['Sessoes administrativas', data.adminSessions?.summary],
      ['Allowlist de IP', data.ipAllowlist?.summary],
      ['Auditoria basica', data.audit?.summary],
      ['Rotacao de token', data.rotation?.summary],
    ];

    placeholders.innerHTML = items.map(([title, description], index) => `
      <article class="security-item">
        <div>
          <strong>${escapeHtml(title)}</strong>
          <p class="muted">${escapeHtml(description || 'Em definicao.')}</p>
        </div>
        <span class="toggle-chip">${index === 0 ? 'Ativo' : 'Planejado'}</span>
      </article>
    `).join('');
  }

  function renderSecurityAudit(payload) {
    const items = Array.isArray(payload?.items) ? payload.items : [];
    const pagination = payload?.pagination || {};
    const container = document.getElementById('security-audit-list');
    const meta = document.getElementById('security-audit-pagination-meta');
    const prev = document.getElementById('security-audit-prev-page');
    const next = document.getElementById('security-audit-next-page');
    const offset = Number(pagination.offset || 0);
    const limit = Number(pagination.limit || state.securityAudit.limit || 20);
    const hasMore = Boolean(pagination.hasMore);

    state.securityAudit = {
      items,
      offset,
      limit,
      hasMore,
    };

    if (container) {
      if (!items.length) {
        container.className = 'log-list empty-state';
        container.textContent = 'Nenhum evento de auditoria encontrado para os filtros atuais.';
      } else {
        container.className = 'log-list';
        container.innerHTML = items.map((entry) => `
          <article class="log-item ${String(entry.eventType || '').toUpperCase().includes('FAILED') || String(entry.eventType || '').toUpperCase().includes('DENIED') ? 'failed' : ''}">
            <div class="log-head">
              <strong>${escapeHtml(entry.eventType || 'ADMIN_EVENT')}</strong>
              <span class="log-meta">${escapeHtml(formatDate(entry.createdAt))}</span>
            </div>
            <div class="log-meta">Clinic: ${escapeHtml(entry.clinicId || '-')} - Instance: ${escapeHtml(entry.instanceId || '-')}</div>
            <div class="log-meta">Status: ${escapeHtml(entry.status || '-')} - Job: ${escapeHtml(entry.messageJobId || '-')}</div>
            ${entry.summary ? `<div class="job-preview">${escapeHtml(entry.summary)}</div>` : ''}
            <pre>${escapeHtml(JSON.stringify(entry.payload || {}, null, 2))}</pre>
          </article>
        `).join('');
      }
    }

    if (meta) {
      const start = items.length ? offset + 1 : 0;
      const end = offset + items.length;
      meta.textContent = items.length
        ? `Mostrando ${start}-${end} da trilha de auditoria`
        : 'Nenhum evento de auditoria para exibir';
    }
    if (prev) prev.disabled = offset <= 0;
    if (next) next.disabled = !hasMore;
  }

  function renderCreateInstanceReadiness(readiness) {
    const container = document.getElementById('create-instance-readiness');
    if (!container) return;

    if (!readiness) {
      container.className = 'stack compact empty-state';
      container.textContent = 'Valide a clinica antes de provisionar a instancia.';
      return;
    }

    const clinic = readiness.clinic || {};
    const badgeClass = readiness.smokePassed
      ? 'status-connected'
      : readiness.canProvision
        ? 'status-connecting'
        : 'status-error';

    container.className = 'stack compact';
    container.innerHTML = `
      <div class="activity-item">
        <div class="activity-item-head">
          <strong>${escapeHtml(clinic.clinicName || readiness.clinicId)}</strong>
          <span class="status-badge ${badgeClass}">${readiness.smokePassed ? 'Pronta' : readiness.canProvision ? 'Provisionavel' : 'Atencao'}</span>
        </div>
        <p class="muted">${escapeHtml(clinic.clinicDocument || readiness.clinicId)}</p>
        <div class="ops-metrics">
          <span>Instancia: ${escapeHtml(readiness.instance?.id || '-')}</span>
          <span>Fila ativa: ${escapeHtml(readiness.activeJobs || 0)}</span>
          <span>Falhas 24h: ${escapeHtml(readiness.recentFailures || 0)}</span>
          <span>SLA: ${escapeHtml(formatPercent(readiness.deliverySuccessRate))}</span>
        </div>
        <div class="stack compact">
          ${(Array.isArray(readiness.checks) ? readiness.checks : []).map((check) => `
            <div class="log-meta">${check.ok ? 'OK' : 'ATENCAO'} - ${escapeHtml(check.summary || check.key || '')}</div>
          `).join('')}
        </div>
      </div>
    `;
  }

  async function loadClinicReadiness(clinicId, notifySuccess) {
    const normalizedClinicId = String(clinicId || '').trim();
    if (!normalizedClinicId) {
      renderCreateInstanceReadiness(null);
      return null;
    }

    try {
      const params = new URLSearchParams({ clinicId: normalizedClinicId });
      const readiness = await apiFetch(`/operations/clinic-readiness?${params.toString()}`);
      renderCreateInstanceReadiness(readiness || null);
      if (notifySuccess !== false) {
        const message = readiness?.canProvision
          ? `Clinica ${normalizedClinicId} validada e pronta para provisionar.`
          : readiness?.smokePassed
            ? `Clinica ${normalizedClinicId} ja esta operacional no NG.`
            : `Clinica ${normalizedClinicId} validada com atencao.`;
        showToast(message, readiness?.canProvision || readiness?.smokePassed ? 'success' : 'info');
      }
      return readiness || null;
    } catch (error) {
      renderCreateInstanceReadiness({
        clinicId: normalizedClinicId,
        checks: [],
      });
      showToast(error.message || 'Falha ao validar clinica.', 'error');
      return null;
    }
  }

  async function loadSecurityAuditModule() {
    const container = document.getElementById('security-audit-list');
    if (container) {
      container.className = 'log-list empty-state';
      container.textContent = 'Carregando auditoria...';
    }

    try {
      const clinicId = String(document.getElementById('security-audit-clinic-filter')?.value || '').trim();
      const eventType = String(document.getElementById('security-audit-type-filter')?.value || '').trim();
      const search = String(document.getElementById('security-audit-search')?.value || '').trim();
      const params = new URLSearchParams();
      if (clinicId) params.set('clinicId', clinicId);
      if (eventType) params.set('eventType', eventType);
      if (search) params.set('search', search);
      params.set('limit', String(state.securityAudit.limit || 20));
      params.set('offset', String(state.securityAudit.offset || 0));

      const payload = await apiFetch(`/security/audit?${params.toString()}`);
      renderSecurityAudit(payload || {});
    } catch (error) {
      if (container) {
        container.className = 'log-list empty-state';
        container.textContent = error.message || 'Falha ao carregar auditoria.';
      }
    }
  }

  async function exportSecurityIncident() {
    const clinicId = String(document.getElementById('security-audit-clinic-filter')?.value || '').trim();
    const hours = String(document.getElementById('security-export-hours')?.value || '24').trim();
    if (!clinicId) {
      showToast('Informe o clinicId para exportar o incidente.', 'error');
      return;
    }

    try {
      const params = new URLSearchParams({
        clinicId,
        hours: hours || '24',
      });
      const payload = await apiFetch(`/operations/export?${params.toString()}`);
      downloadJsonFile(`incident-${clinicId}-${new Date().toISOString().replaceAll(':', '-').slice(0, 19)}.json`, payload || {});
      showToast(`Incidente exportado para ${clinicId}.`, 'success');
    } catch (error) {
      showToast(error.message || 'Falha ao exportar incidente.', 'error');
    }
  }

  async function runConnectionTest(instanceId, notifySuccess) {
    try {
      const status = await apiFetch(`/instances/${encodeURIComponent(instanceId)}/status`);
      const runtimeLabel = status.connectedInRuntime
        ? `socket ativo (${status.runtimeSocketState || 'OPEN'})`
        : `socket inativo (${status.runtimeSocketState || 'CLOSED'})`;
      if (notifySuccess !== false) {
        showToast(`Status ${status.status} para ${status.clinicId} (${runtimeLabel}).`, 'success');
      }
      return status;
    } catch (error) {
      showToast(error.message || 'Falha no teste de conexao.', 'error');
      return null;
    }
  }

  function applyFilters() {
    const quickSearch = String(document.getElementById('instance-search')?.value || '').trim().toLowerCase();
    const clinicFilter = String(document.getElementById('instance-clinic-filter')?.value || '').trim().toLowerCase();
    const nameFilter = String(document.getElementById('instance-name-filter')?.value || '').trim().toLowerCase();
    const phoneFilter = String(document.getElementById('instance-phone-filter')?.value || '').trim().toLowerCase();
    const statusFilter = String(document.getElementById('status-filter')?.value || '').trim().toUpperCase();
    const createdFilter = String(document.getElementById('created-filter')?.value || '').trim();
    const activityFilter = String(document.getElementById('activity-filter')?.value || '').trim();

    state.filteredInstances = state.instances.filter((instance) => {
      const activityDate = instance.lastSeenAt || instance.updatedAt || instance.createdAt;
      const createdTime = new Date(instance.createdAt || 0).getTime();
      const now = Date.now();

      const matchesQuickSearch = !quickSearch || [instance.id, instance.clinicId, instance.phoneNumber, instance.displayName, instance.clinicName, instance.clinicLegalName, instance.clinicDocument]
        .some((value) => String(value || '').toLowerCase().includes(quickSearch));
      const matchesClinic = !clinicFilter || String(instance.clinicId || '').toLowerCase().includes(clinicFilter);
      const matchesName = !nameFilter || [instance.displayName, instance.clinicName, instance.clinicLegalName]
        .some((value) => String(value || '').toLowerCase().includes(nameFilter));
      const matchesPhone = !phoneFilter || String(instance.phoneNumber || '').toLowerCase().includes(phoneFilter);
      const matchesStatus = !statusFilter || String(instance.status || '').toUpperCase() === statusFilter;
      const matchesSegment = !state.instanceSegment || String(instance.status || '').toUpperCase() === state.instanceSegment;

      let matchesCreated = true;
      if (createdFilter === 'today') matchesCreated = new Date(instance.createdAt || 0).toDateString() === new Date().toDateString();
      if (createdFilter === '7d') matchesCreated = now - createdTime <= 7 * 24 * 60 * 60 * 1000;
      if (createdFilter === '30d') matchesCreated = now - createdTime <= 30 * 24 * 60 * 60 * 1000;

      let matchesActivity = true;
      const recent = isRecentActivity(activityDate, 24);
      if (activityFilter === '24h') matchesActivity = recent;
      if (activityFilter === 'inactive') matchesActivity = !recent;

      return matchesQuickSearch && matchesClinic && matchesName && matchesPhone && matchesStatus && matchesSegment && matchesCreated && matchesActivity;
    });

    state.instancesPage = 1;
    renderInstancesTable();
    updateSegmentButtons();
  }

  async function loadMessageSummary() {
    try {
      const summary = await apiFetch('/messages/summary');
      updateMessageSummary(summary || {});
    } catch (_error) {
      updateMessageSummary({});
    }
  }

  async function loadOperationsOverview() {
    try {
      const overview = await apiFetch('/operations/overview?hours=24&limit=8');
      renderOperationsOverview(overview || {});
    } catch (_error) {
      renderOperationsOverview({
        summary: {},
        topClinicPressure: [],
        topClinicRisks: [],
        topInstanceRisks: [],
      });
    }
  }

  async function loadInstances() {
    try {
      const result = await apiFetch('/instances');
      state.instances = Array.isArray(result.items) ? result.items : [];
      updateSummary(result.summary || {});
      applyFilters();
      renderRecentActivity();
      renderRecentClinics();
      updateConnectionIndicator(true);

      const timestampLabel = `Atualizado em ${formatDate(new Date().toISOString())}`;
      const lastRefresh = document.getElementById('last-refresh');
      const dashboardRefresh = document.getElementById('dashboard-last-refresh');
      if (lastRefresh) lastRefresh.textContent = timestampLabel;
      if (dashboardRefresh) dashboardRefresh.textContent = timestampLabel;

      if (state.selectedInstanceId) {
        const stillExists = state.instances.find((item) => item.id === state.selectedInstanceId);
        if (stillExists) {
          await loadInstanceDetails(state.selectedInstanceId, false, { preserveCurrentView: true });
        } else {
          state.selectedInstanceId = null;
          state.selectedInstanceDetails = null;
          renderDetails(null);
          renderLogs([]);
          renderInstanceJobs([]);
        }
      }
    } catch (error) {
      updateConnectionIndicator(false);
      showToast(error.message || 'Falha ao carregar instancias.', 'error');
    }
  }

  async function loadInstanceDetails(instanceId, notifyOnError, options) {
    const detailsContainer = document.getElementById('instance-details');
    const logsContainer = document.getElementById('instance-logs');
    const jobsContainer = document.getElementById('instance-jobs');
    if (detailsContainer) {
      detailsContainer.className = 'details-card empty-state';
      detailsContainer.textContent = 'Carregando detalhes da instancia...';
    }
    if (logsContainer) {
      logsContainer.className = 'log-list empty-state';
      logsContainer.textContent = 'Carregando logs recentes...';
    }
    if (jobsContainer) {
      jobsContainer.className = 'jobs-list empty-state';
      jobsContainer.textContent = 'Carregando jobs relacionados...';
    }

    try {
      const [details, logs, jobs] = await Promise.all([
        apiFetch(`/instances/${encodeURIComponent(instanceId)}`),
        apiFetch(`/instances/${encodeURIComponent(instanceId)}/logs?limit=12`),
        apiFetch(`/messages/jobs?instanceId=${encodeURIComponent(instanceId)}&limit=8`),
      ]);
      state.selectedInstanceId = instanceId;
      state.selectedInstanceDetails = details;
      state.selectedInstanceJobs = jobs || [];
      renderDetails(details);
      renderLogs(logs || []);
      renderInstanceJobs(jobs || []);
      if (!options?.preserveCurrentView) {
        setView('instances', false);
      }
      renderInstancesTable();
    } catch (error) {
      state.selectedInstanceDetails = null;
      state.selectedInstanceJobs = [];
      renderDetails(null);
      renderLogs([]);
      renderInstanceJobs([]);
      if (notifyOnError !== false) showToast(error.message || 'Falha ao carregar detalhes.', 'error');
    }
  }

  async function loadMessagesModule() {
    const list = document.getElementById('messages-list');
    if (list) {
      list.className = 'jobs-list empty-state';
      list.textContent = 'Carregando mensagens...';
    }

    try {
      const clinicId = String(document.getElementById('messages-clinic-filter')?.value || '').trim();
      const status = String(document.getElementById('messages-status-filter')?.value || '').trim();
      const search = String(document.getElementById('messages-search')?.value || '').trim();
      const params = new URLSearchParams();
      if (clinicId) params.set('clinicId', clinicId);
      if (status) params.set('status', status);
      if (search) params.set('search', search);
      params.set('limit', '40');

      const [summary, jobs] = await Promise.all([
        apiFetch('/messages/summary'),
        apiFetch(`/messages/jobs?${params.toString()}`),
      ]);

      updateMessageSummary(summary || {});
      renderMessagesList(jobs || []);
      state.messagesLoaded = true;
    } catch (error) {
      if (list) {
        list.className = 'jobs-list empty-state';
        list.textContent = error.message || 'Falha ao carregar mensagens.';
      }
    }
  }

  async function loadLogsModule() {
    const list = document.getElementById('logs-list');
    if (list) {
      list.className = 'log-list empty-state';
      list.textContent = 'Carregando logs...';
    }

    try {
      const clinicId = String(document.getElementById('logs-clinic-filter')?.value || '').trim();
      const instanceId = String(document.getElementById('logs-instance-filter')?.value || '').trim();
      const eventType = String(document.getElementById('logs-type-filter')?.value || '').trim();
      const search = String(document.getElementById('logs-search')?.value || '').trim();
      const params = new URLSearchParams();
      if (clinicId) params.set('clinicId', clinicId);
      if (instanceId) params.set('instanceId', instanceId);
      if (eventType) params.set('eventType', eventType);
      if (search) params.set('search', search);
      params.set('limit', '50');

      const [logs, operationalEvents] = await Promise.all([
        apiFetch(`/logs/recent?${params.toString()}`),
        apiFetch(`/operational-events/recent?${params.toString()}`),
      ]);
      const merged = [...(logs || []), ...(operationalEvents || [])]
        .sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime());
      renderModuleLogs(merged);
      state.logsLoaded = true;
    } catch (error) {
      if (list) {
        list.className = 'log-list empty-state';
        list.textContent = error.message || 'Falha ao carregar logs.';
      }
    }
  }

  async function loadWebhooksModule() {
    try {
      const data = await apiFetch('/webhooks/overview');
      renderWebhookOverview(data || {});
      state.webhooksLoaded = true;
    } catch (error) {
      const events = document.getElementById('webhooks-events');
      if (events) {
        events.className = 'webhook-event-grid empty-state';
        events.textContent = error.message || 'Falha ao carregar webhooks.';
      }
    }
  }

  async function loadSecurityModule() {
    try {
      const data = await apiFetch('/security/overview');
      renderSecurityOverview(data || {});
      await loadSecurityAuditModule();
      state.securityLoaded = true;
    } catch (error) {
      const token = document.getElementById('security-masked-token');
      if (token) token.textContent = error.message || 'Falha ao carregar seguranca.';
    }
  }

  async function loadSettingsModule() {
    try {
      const data = await apiFetch('/settings/overview');
      renderSettingsOverview(data || {});
      state.settingsLoaded = true;
    } catch (error) {
      renderSettingsList('settings-runtime-list', [], error.message || 'Falha ao carregar configuracoes.');
      renderSettingsList('settings-integrations-list', [], error.message || 'Falha ao carregar configuracoes.');
      renderSettingsList('settings-monitoring-list', [], error.message || 'Falha ao carregar configuracoes.');
      renderSettingsList('settings-retention-list', [], error.message || 'Falha ao carregar configuracoes.');
      renderSettingsList('settings-protection-list', [], error.message || 'Falha ao carregar configuracoes.');
    }
  }

  function setView(view, updateButtons) {
    state.currentView = view;
    updateViewMeta(view);
    document.querySelectorAll('.view-panel').forEach((section) => {
      section.classList.toggle('active', section.dataset.view === view);
    });

    if (updateButtons !== false) {
      document.querySelectorAll('.nav-link').forEach((button) => {
        button.classList.toggle('active', button.dataset.nav === view);
      });
    }

    if (view === 'messages') void loadMessagesModule();
    if (view === 'logs') void loadLogsModule();
    if (view === 'webhooks' && !state.webhooksLoaded) void loadWebhooksModule();
    if (view === 'security') {
      if (!state.securityLoaded) void loadSecurityModule();
      else void loadSecurityAuditModule();
    }
    if (view === 'settings' && !state.settingsLoaded) void loadSettingsModule();
  }

  function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }

  async function openQrModal(instanceId) {
    const content = document.getElementById('qr-modal-content');
    if (!content) return;
    content.innerHTML = '<div class="empty-state">Gerando QR da instancia...</div>';
    openModal('qr-modal');

    try {
      const qr = await apiFetch(`/instances/${encodeURIComponent(instanceId)}/qr`);
      const pendingState = qr?.qrPending === true && !qr?.qrDataUrl;
      content.innerHTML = `
        <div class="qr-wrapper">
          ${qr.qrDataUrl
            ? `<img class="qr-image" src="${qr.qrDataUrl}" alt="QR Code da instancia">`
            : `<div class="empty-state">${pendingState ? 'Instancia reconectando e preparando novo QR. Aguarde alguns segundos e atualize.' : 'Nenhum QR disponivel no momento. Consulte o status e tente novamente.'}</div>`}
          <div class="stack compact">
            <div><strong>Status:</strong> ${escapeHtml(qr.status || '-')}</div>
            <div><strong>Runtime:</strong> ${escapeHtml(qr.runtimeSocketState || '-')}</div>
            <div><strong>Pairing code:</strong> ${escapeHtml(qr.pairingCode || '-')}</div>
            <div><strong>Atualizado em:</strong> ${escapeHtml(formatDate(qr.qrUpdatedAt))}</div>
          </div>
        </div>
      `;
    } catch (error) {
      content.innerHTML = `<div class="empty-state">${escapeHtml(error.message || 'Falha ao gerar QR.')}</div>`;
    }
  }

  async function disconnectInstance(instanceId) {
    if (!canManageSession()) {
      showToast('Sessao em modo leitura. Use token de operador para desconectar.', 'error');
      return;
    }
    if (!window.confirm('Deseja desconectar esta instancia e limpar a sessao atual?')) return;

    try {
      await apiFetch(`/instances/${encodeURIComponent(instanceId)}/disconnect`, {
        method: 'POST',
      });
      showToast('Instancia desconectada com sucesso.', 'success');
      await loadInstances();
      if (state.selectedInstanceId === instanceId) {
        await loadInstanceDetails(instanceId, false, { preserveCurrentView: true });
      }
    } catch (error) {
      showToast(error.message || 'Falha ao desconectar instancia.', 'error');
    }
  }

  async function deleteInstance(instanceId) {
    if (!canManageSession()) {
      showToast('Sessao em modo leitura. Use token de operador para excluir instancia.', 'error');
      return;
    }
    const instance = state.instances.find((item) => item.id === instanceId)
      || (state.selectedInstanceDetails?.id === instanceId ? state.selectedInstanceDetails : null);
    if (instance?.clinicId) {
      const readiness = await loadClinicReadiness(instance.clinicId, false);
      if (readiness && Number(readiness.activeJobs || 0) > 0) {
        showToast(`A clinica ${instance.clinicId} ainda possui ${readiness.activeJobs} job(s) ativo(s). Drene a fila antes de excluir a instancia.`, 'error');
        return;
      }
    }
    if (!window.confirm('Deseja excluir esta instancia? Essa acao remove a sessao e exige novo pareamento.')) return;

    try {
      await apiFetch(`/instances/${encodeURIComponent(instanceId)}`, {
        method: 'DELETE',
      });
      showToast('Instancia excluida com sucesso.', 'success');
      if (state.selectedInstanceId === instanceId) {
        state.selectedInstanceId = null;
        state.selectedInstanceDetails = null;
      }
      await loadInstances();
    } catch (error) {
      showToast(error.message || 'Falha ao excluir instancia.', 'error');
    }
  }

  function openMessageModal(instanceId, clinicId) {
    document.getElementById('message-instance-id').value = instanceId;
    document.getElementById('message-clinic-id').value = clinicId;
    document.getElementById('message-to-phone').value = '';
    openModal('message-modal');
  }

  function focusInstance(instanceId, targetView) {
    if (!instanceId) return;
    const search = document.getElementById('instance-search');
    const clinicFilter = document.getElementById('instance-clinic-filter');
    const nameFilter = document.getElementById('instance-name-filter');
    const phoneFilter = document.getElementById('instance-phone-filter');
    const statusFilter = document.getElementById('status-filter');
    const createdFilter = document.getElementById('created-filter');
    const activityFilter = document.getElementById('activity-filter');

    if (search) search.value = instanceId;
    if (clinicFilter) clinicFilter.value = '';
    if (nameFilter) nameFilter.value = '';
    if (phoneFilter) phoneFilter.value = '';
    if (statusFilter) statusFilter.value = '';
    if (createdFilter) createdFilter.value = '';
    if (activityFilter) activityFilter.value = '';
    state.instanceSegment = '';
    applyFilters();
    setView(targetView || 'instances');
    void loadInstanceDetails(instanceId);
  }

  function focusClinic(clinicId, targetView) {
    if (!clinicId) return;

    if ((targetView || 'instances') === 'messages') {
      const clinicFilter = document.getElementById('messages-clinic-filter');
      const search = document.getElementById('messages-search');
      const status = document.getElementById('messages-status-filter');
      if (clinicFilter) clinicFilter.value = clinicId;
      if (search) search.value = '';
      if (status) status.value = '';
      setView('messages');
      void loadMessagesModule();
      return;
    }

    if ((targetView || 'instances') === 'logs') {
      const clinicFilter = document.getElementById('logs-clinic-filter');
      const instanceFilter = document.getElementById('logs-instance-filter');
      const search = document.getElementById('logs-search');
      const typeFilter = document.getElementById('logs-type-filter');
      if (clinicFilter) clinicFilter.value = clinicId;
      if (instanceFilter) instanceFilter.value = '';
      if (search) search.value = '';
      if (typeFilter) typeFilter.value = '';
      setView('logs');
      void loadLogsModule();
      return;
    }

    const search = document.getElementById('instance-search');
    const clinicFilter = document.getElementById('instance-clinic-filter');
    const nameFilter = document.getElementById('instance-name-filter');
    const phoneFilter = document.getElementById('instance-phone-filter');
    const statusFilter = document.getElementById('status-filter');
    const createdFilter = document.getElementById('created-filter');
    const activityFilter = document.getElementById('activity-filter');
    if (search) search.value = '';
    if (clinicFilter) clinicFilter.value = clinicId;
    if (nameFilter) nameFilter.value = '';
    if (phoneFilter) phoneFilter.value = '';
    if (statusFilter) statusFilter.value = '';
    if (createdFilter) createdFilter.value = '';
    if (activityFilter) activityFilter.value = '';
    state.instanceSegment = '';
    applyFilters();
    setView('instances');
  }

  function focusMessagesForInstance(instance) {
    if (!instance) return;
    const clinicFilter = document.getElementById('messages-clinic-filter');
    const search = document.getElementById('messages-search');
    const status = document.getElementById('messages-status-filter');
    if (clinicFilter) clinicFilter.value = instance.clinicId || '';
    if (search) search.value = instance.id || '';
    if (status) status.value = '';
    setView('messages');
  }

  function focusLogsForInstance(instance) {
    if (!instance) return;
    const clinicFilter = document.getElementById('logs-clinic-filter');
    const instanceFilter = document.getElementById('logs-instance-filter');
    const search = document.getElementById('logs-search');
    const typeFilter = document.getElementById('logs-type-filter');
    if (clinicFilter) clinicFilter.value = instance.clinicId || '';
    if (instanceFilter) instanceFilter.value = instance.id || '';
    if (search) search.value = '';
    if (typeFilter) typeFilter.value = '';
    setView('logs');
  }

  async function handleCreateInstance(event) {
    event.preventDefault();
    if (!canManageSession()) {
      showToast('Sessao em modo leitura. Use token de operador para criar instancia.', 'error');
      return;
    }
    const clinicId = document.getElementById('clinic-id').value.trim();
    const displayName = document.getElementById('display-name').value.trim();
    const readiness = await loadClinicReadiness(clinicId, false);
    if (!readiness?.canProvision) {
      showToast(readiness?.instance
        ? `A clinica ${clinicId} ja possui instancia provisionada no NG.`
        : `A clinica ${clinicId} nao esta pronta para provisionar no NG.`, 'error');
      return;
    }

    try {
      const created = await apiFetch('/instances', {
        method: 'POST',
        body: JSON.stringify({ clinicId, displayName: displayName || undefined }),
      });
      showToast(`Instancia ${created.id} criada para ${created.clinicId}.`, 'success');
      event.target.reset();
      await loadInstances();
      await loadInstanceDetails(created.id, false);
      setView('instances');
    } catch (error) {
      showToast(error.message || 'Falha ao criar instancia.', 'error');
    }
  }

  async function handleMessageSubmit(event) {
    event.preventDefault();
    if (!canManageSession()) {
      showToast('Sessao em modo leitura. Use token de operador para enviar mensagens.', 'error');
      return;
    }
    const clinicId = document.getElementById('message-clinic-id').value.trim();
    const toPhone = document.getElementById('message-to-phone').value.trim();
    const body = document.getElementById('message-body').value.trim();

    try {
      const result = await apiFetch('/messages/send', {
        method: 'POST',
        body: JSON.stringify({ clinicId, toPhone, body }),
      });
      showToast(`Job ${result.jobId} enviado para fila.`, 'success');
      closeModal('message-modal');
      await loadMessageSummary();
      if (state.currentView === 'messages') await loadMessagesModule();
      if (state.selectedInstanceId) await loadInstanceDetails(state.selectedInstanceId, false, { preserveCurrentView: true });
    } catch (error) {
      showToast(error.message || 'Falha ao enviar teste.', 'error');
    }
  }

  async function handleSettingsSubmit(event) {
    event.preventDefault();
    if (!canManageSession()) {
      showToast('Sessao em modo leitura. Use token de operador para editar configuracoes.', 'error');
      return;
    }

    const payload = {
      clinicSlaWarningRatePct: Number(document.getElementById('settings-clinic-sla-warning')?.value || 0),
      clinicSlaCriticalRatePct: Number(document.getElementById('settings-clinic-sla-critical')?.value || 0),
      syntheticMonitorIntervalMs: Number(document.getElementById('settings-synthetic-interval')?.value || 0),
      syntheticAlertCooldownMs: Number(document.getElementById('settings-synthetic-cooldown')?.value || 0),
      maintenanceCleanupIntervalMs: Number(document.getElementById('settings-maintenance-interval')?.value || 0),
      retentionMessageJobsDays: Number(document.getElementById('settings-retention-jobs')?.value || 0),
      retentionMessageLogsDays: Number(document.getElementById('settings-retention-logs')?.value || 0),
      retentionOperationalEventsDays: Number(document.getElementById('settings-retention-events')?.value || 0),
    };

    try {
      await apiFetch('/settings/overview', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      state.settingsLoaded = false;
      await loadSettingsModule();
      showToast('Overrides operacionais salvos com sucesso.', 'success');
    } catch (error) {
      showToast(error.message || 'Falha ao salvar configuracoes.', 'error');
    }
  }

  async function handleSettingsReset() {
    if (!canManageSession()) {
      showToast('Sessao em modo leitura. Use token de operador para reverter configuracoes.', 'error');
      return;
    }
    if (!window.confirm('Deseja reverter os overrides operacionais para os defaults do ambiente?')) return;

    try {
      await apiFetch('/settings/reset', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      state.settingsLoaded = false;
      await loadSettingsModule();
      showToast('Overrides operacionais revertidos para defaults.', 'success');
    } catch (error) {
      showToast(error.message || 'Falha ao reverter configuracoes.', 'error');
    }
  }

  async function handleTableAction(event) {
    const button = event.target.closest('[data-action], [data-open-instance-id], [data-open-clinic-id], [data-instance-webhook-event]');
    if (!button) return;

    if (button.dataset.instanceWebhookEvent) {
      state.selectedWebhookEvent = button.dataset.instanceWebhookEvent;
      if (state.selectedInstanceDetails) renderInstanceWebhooks(state.selectedInstanceDetails);
      return;
    }

    const openInstanceId = button.dataset.openInstanceId;
    if (openInstanceId) {
      focusInstance(openInstanceId, 'instances');
      return;
    }

    const openClinicId = button.dataset.openClinicId;
    if (openClinicId) {
      focusClinic(openClinicId, button.dataset.openClinicView || 'instances');
      return;
    }

    const action = button.dataset.action;
    const instanceId = button.dataset.id;
    const clinicId = button.dataset.clinicId;

    if (action === 'details' || action === 'status') {
      await loadInstanceDetails(instanceId);
      if (action === 'status') {
        const status = await runConnectionTest(instanceId, true);
        if (status) {
          state.selectedInstanceDetails = status;
          renderDetails(status);
        }
      }
      return;
    }

    if (action === 'qr') {
      if (!canManageSession()) {
        showToast('Sessao em modo leitura. Use token de operador para gerar QR.', 'error');
        return;
      }
      await openQrModal(instanceId);
      return;
    }

    if (action === 'disconnect') {
      await disconnectInstance(instanceId);
      return;
    }

    if (action === 'delete') {
      await deleteInstance(instanceId);
      return;
    }

    if (action === 'test') {
      openMessageModal(instanceId, clinicId);
      return;
    }

    if (action === 'copy-instance') {
      copyText(instanceId, 'Instance ID');
      return;
    }

    if (action === 'copy-clinic') {
      copyText(clinicId, 'Clinic ID');
    }
  }

  function startAutoRefresh() {
    if (state.autoRefreshTimer) {
      window.clearInterval(state.autoRefreshTimer);
    }

    if (!document.getElementById('auto-refresh')?.checked) return;

    state.autoRefreshTimer = window.setInterval(() => {
      void loadInstances();
      void loadMessageSummary();
      void loadOperationsOverview();
      if (state.currentView === 'messages') void loadMessagesModule();
      if (state.currentView === 'logs') void loadLogsModule();
      if (state.currentView === 'security') void loadSecurityAuditModule();
    }, 15000);
  }

  function registerModalEvents() {
    document.querySelectorAll('[data-close-modal]').forEach((button) => {
      button.addEventListener('click', () => closeModal(button.dataset.closeModal));
    });

    document.querySelectorAll('.modal').forEach((modal) => {
      modal.addEventListener('click', (event) => {
        if (event.target === modal) closeModal(modal.id);
      });
    });
  }

  function registerNavigation() {
    document.querySelectorAll('.nav-link').forEach((button) => {
      button.addEventListener('click', () => {
        setView(button.dataset.nav);
      });
    });
  }

  function registerInstanceFilters() {
    document.getElementById('instance-search')?.addEventListener('input', applyFilters);
    document.getElementById('instance-clinic-filter')?.addEventListener('input', applyFilters);
    document.getElementById('instance-name-filter')?.addEventListener('input', applyFilters);
    document.getElementById('instance-phone-filter')?.addEventListener('input', applyFilters);
    document.getElementById('status-filter')?.addEventListener('change', applyFilters);
    document.getElementById('created-filter')?.addEventListener('change', applyFilters);
    document.getElementById('activity-filter')?.addEventListener('change', applyFilters);

    document.querySelectorAll('.instance-tab').forEach((button) => {
      button.addEventListener('click', () => {
        state.instanceSegment = button.dataset.instanceSegment || '';
        applyFilters();
      });
    });

    document.getElementById('instances-prev-page')?.addEventListener('click', () => {
      state.instancesPage = Math.max(1, state.instancesPage - 1);
      renderInstancesTable();
    });

    document.getElementById('instances-next-page')?.addEventListener('click', () => {
      const totalPages = Math.max(1, Math.ceil(state.filteredInstances.length / INSTANCES_PER_PAGE));
      state.instancesPage = Math.min(totalPages, state.instancesPage + 1);
      renderInstancesTable();
    });
  }

  function registerOperationalFilters() {
    document.getElementById('ops-severity-filter')?.addEventListener('change', () => {
      renderOperationsOverview(state.operationsOverview || {});
    });
    document.getElementById('ops-cause-filter')?.addEventListener('change', () => {
      renderOperationsOverview(state.operationsOverview || {});
    });

    document.getElementById('messages-search')?.addEventListener('input', () => { void loadMessagesModule(); });
    document.getElementById('messages-clinic-filter')?.addEventListener('input', () => { void loadMessagesModule(); });
    document.getElementById('messages-status-filter')?.addEventListener('change', () => { void loadMessagesModule(); });

    document.getElementById('logs-search')?.addEventListener('input', () => { void loadLogsModule(); });
    document.getElementById('logs-clinic-filter')?.addEventListener('input', () => { void loadLogsModule(); });
    document.getElementById('logs-instance-filter')?.addEventListener('input', () => { void loadLogsModule(); });
    document.getElementById('logs-type-filter')?.addEventListener('change', () => { void loadLogsModule(); });

    document.getElementById('webhooks-test-button')?.addEventListener('click', () => {
      showToast('Teste visual executado. Persistencia real de webhooks continua parcial e segura nesta fase.', 'success');
    });
    document.getElementById('clinic-readiness-button')?.addEventListener('click', () => {
      const clinicId = String(document.getElementById('clinic-id')?.value || '').trim();
      void loadClinicReadiness(clinicId, true);
    });
    document.getElementById('clinic-id')?.addEventListener('input', () => {
      renderCreateInstanceReadiness(null);
    });

    document.getElementById('security-copy-token')?.addEventListener('click', () => {
      showToast('Copia de token desabilitada nesta fase para evitar exposicao do segredo operacional.', 'info');
    });
    document.getElementById('security-audit-clinic-filter')?.addEventListener('input', () => {
      state.securityAudit.offset = 0;
      void loadSecurityAuditModule();
    });
    document.getElementById('security-audit-type-filter')?.addEventListener('change', () => {
      state.securityAudit.offset = 0;
      void loadSecurityAuditModule();
    });
    document.getElementById('security-audit-search')?.addEventListener('input', () => {
      state.securityAudit.offset = 0;
      void loadSecurityAuditModule();
    });
    document.getElementById('security-audit-refresh')?.addEventListener('click', () => {
      state.securityAudit.offset = 0;
      void loadSecurityAuditModule();
    });
    document.getElementById('security-audit-prev-page')?.addEventListener('click', () => {
      state.securityAudit.offset = Math.max(0, Number(state.securityAudit.offset || 0) - Number(state.securityAudit.limit || 20));
      void loadSecurityAuditModule();
    });
    document.getElementById('security-audit-next-page')?.addEventListener('click', () => {
      if (!state.securityAudit.hasMore) return;
      state.securityAudit.offset = Number(state.securityAudit.offset || 0) + Number(state.securityAudit.limit || 20);
      void loadSecurityAuditModule();
    });
    document.getElementById('security-export-incident')?.addEventListener('click', () => {
      void exportSecurityIncident();
    });

    document.getElementById('details-open-messages')?.addEventListener('click', () => {
      if (state.selectedInstanceDetails) focusMessagesForInstance(state.selectedInstanceDetails);
    });

    document.getElementById('details-open-logs')?.addEventListener('click', () => {
      if (state.selectedInstanceDetails) focusLogsForInstance(state.selectedInstanceDetails);
    });

    document.getElementById('details-refresh-list')?.addEventListener('click', () => {
      void loadInstances();
    });

    document.querySelectorAll('.detail-tab').forEach((button) => {
      button.addEventListener('click', () => {
        setDetailsTab(button.dataset.detailTab);
      });
    });
  }

  function resolveInitialView() {
    const pathname = window.location.pathname || '';
    if (pathname.endsWith('/instances')) return 'instances';
    return 'dashboard';
  }

  async function handleLogin(event) {
    event.preventDefault();
    const token = String(document.getElementById('internal-token')?.value || '').trim();

    try {
      const response = await fetch('/admin/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success === false) {
        throw new Error(payload?.error?.message || 'Falha ao autenticar.');
      }

      state.adminSession = {
        authenticated: true,
        role: payload?.data?.role || 'operator',
        label: payload?.data?.label || 'Operator',
      };
      cacheSession(state.adminSession);
      window.location.href = '/admin/instances';
    } catch (error) {
      showToast(error.message || 'Falha ao autenticar.', 'error');
    }
  }

  async function handleLogout() {
    try {
      await fetch('/admin/session', { method: 'DELETE' });
    } catch (_error) {
      // noop
    }

    state.adminSession = null;
    cacheSession(null);
    window.location.href = '/admin/login';
  }

  async function ensureAdminSession() {
    const cached = getCachedSession();
    if (cached?.authenticated) {
      state.adminSession = cached;
      return true;
    }

    try {
      const response = await fetch('/admin/session');
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload?.data?.authenticated === true) {
        state.adminSession = {
          authenticated: true,
          role: payload?.data?.role || 'operator',
          label: payload?.data?.label || 'Operator',
        };
        cacheSession(state.adminSession);
        return true;
      }
    } catch (_error) {
      // noop
    }

    state.adminSession = null;
    cacheSession(null);
    return false;
  }

  function initLoginPage() {
    document.getElementById('login-form')?.addEventListener('submit', handleLogin);
  }

  async function initDashboard() {
    const authenticated = await ensureAdminSession();
    if (!authenticated) {
      window.location.href = '/admin/login';
      return;
    }

    document.getElementById('create-instance-form')?.addEventListener('submit', handleCreateInstance);
    document.getElementById('message-form')?.addEventListener('submit', handleMessageSubmit);
    document.getElementById('instances-table-body')?.addEventListener('click', handleTableAction);
    document.getElementById('instance-shortcuts')?.addEventListener('click', handleTableAction);
    document.getElementById('instance-webhooks')?.addEventListener('click', handleTableAction);
    document.getElementById('messages-list')?.addEventListener('click', handleTableAction);
    document.getElementById('logs-list')?.addEventListener('click', handleTableAction);
    document.getElementById('settings-form')?.addEventListener('submit', handleSettingsSubmit);
    document.getElementById('settings-reset-button')?.addEventListener('click', () => {
      void handleSettingsReset();
    });
    document.getElementById('recent-activity')?.addEventListener('click', handleTableAction);
    document.getElementById('recent-clinics')?.addEventListener('click', handleTableAction);
    document.getElementById('dashboard-risk-clinics')?.addEventListener('click', handleTableAction);
    document.getElementById('dashboard-risk-instances')?.addEventListener('click', handleTableAction);
    document.getElementById('dashboard-clinic-pressure')?.addEventListener('click', handleTableAction);
    document.getElementById('refresh-all')?.addEventListener('click', () => {
      void loadInstances();
      void loadMessageSummary();
      void loadOperationsOverview();
      if (state.currentView === 'messages') void loadMessagesModule();
      if (state.currentView === 'logs') void loadLogsModule();
      if (state.currentView === 'security') void loadSecurityAuditModule();
      if (state.currentView === 'settings') void loadSettingsModule();
    });
    document.getElementById('logout-button')?.addEventListener('click', handleLogout);
    document.getElementById('details-refresh')?.addEventListener('click', () => {
      if (state.selectedInstanceId) void loadInstanceDetails(state.selectedInstanceId);
    });
    document.getElementById('details-connection-test')?.addEventListener('click', async () => {
      if (!state.selectedInstanceId) return;
      const status = await runConnectionTest(state.selectedInstanceId, true);
      if (status) {
        state.selectedInstanceDetails = status;
        renderDetails(status);
      }
    });
    document.getElementById('auto-refresh')?.addEventListener('change', startAutoRefresh);

    registerNavigation();
    registerInstanceFilters();
    registerOperationalFilters();
    registerModalEvents();
    applySessionPermissions();
    setView(resolveInitialView());
    startAutoRefresh();
    void loadMessageSummary();
    void loadOperationsOverview();
    void loadInstances();
  }

  if (page === 'login') initLoginPage();
  if (page === 'dashboard') void initDashboard();
})();
