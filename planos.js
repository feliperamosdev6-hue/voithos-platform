document.addEventListener('DOMContentLoaded', () => {
  const appApi = window.appApi || {};
  const authApi = appApi.auth || {};
  const patientsApi = appApi.patients || {};
  const plansApi = appApi.plans || {};
  const financeApi = appApi.finance || {};

  const q = new URLSearchParams(window.location.search);
  const requestedPlanId = String(q.get('planId') || '').trim();

  const modal = document.getElementById('plan-modal');
  const openBtn = document.getElementById('btn-new-plan');
  const closeBtn = document.getElementById('close-modal');
  const cancelBtn = document.getElementById('cancel-modal');
  const form = document.getElementById('plan-form');
  const plansGrid = document.getElementById('plans-grid');
  const servicesLoadHint = document.getElementById('services-load-hint');
  const patientsDatalist = document.getElementById('patients-datalist');
  const servicesHistoryDatalist = document.getElementById('services-history-datalist');
  const planDetailEmpty = document.getElementById('plan-detail-empty');
  const planDetailContent = document.getElementById('plan-detail-content');

  const paymentModal = document.getElementById('plan-payment-modal');
  const paymentCloseBtn = document.getElementById('close-payment-modal');
  const paymentCancelBtn = document.getElementById('cancel-payment-modal');
  const paymentForm = document.getElementById('plan-payment-form');
  const paymentTitle = document.getElementById('plan-payment-title');
  const paymentInfo = document.getElementById('plan-payment-info');
  const paymentMethod = document.getElementById('plan-payment-method');
  const paymentDate = document.getElementById('plan-payment-date');
  const paymentNotes = document.getElementById('plan-payment-notes');
  const paymentConfirmCheck = document.getElementById('plan-payment-confirm-check');

  const filterCategory = document.getElementById('filter-category');
  const filterStatus = document.getElementById('filter-status');
  const filterSearch = document.getElementById('filter-search');
  const filterSearchSuggestions = document.getElementById('filter-search-suggestions');
  const refreshPlansBtn = document.getElementById('btn-refresh-plans');
  const parcelasHint = document.getElementById('input-parcelas-hint');
  const summaryTotal = document.getElementById('summary-total');
  const summaryAndamento = document.getElementById('summary-andamento');
  const summaryLiberados = document.getElementById('summary-liberados');
  const rulePreview = document.getElementById('rule-preview');

  const inputs = {
    nome: document.getElementById('input-nome'),
    categoria: document.getElementById('input-categoria'),
    descricao: document.getElementById('input-descricao'),
    paciente: document.getElementById('input-paciente'),
    dentista: document.getElementById('input-dentista'),
    valor: document.getElementById('input-valor'),
    parcelas: document.getElementById('input-parcelas'),
    valorParcela: document.getElementById('input-valor-parcela'),
    entradaValor: document.getElementById('input-entrada-valor'),
    entradaData: document.getElementById('input-entrada-data'),
    entradaForma: document.getElementById('input-entrada-forma'),
    parcelasPagas: document.getElementById('input-parcelas-pagas'),
    regra: document.getElementById('input-regra'),
    minParcelas: document.getElementById('input-min-parcelas'),
    status: document.getElementById('input-status'),
    startDate: document.getElementById('input-start-date'),
    dueDay: document.getElementById('input-due-day'),
    servico: document.getElementById('input-servico'),
    observacoes: document.getElementById('input-observacoes'),
  };

  let plans = [];
  let patients = [];
  let editingPlanId = null;
  let selectedPlanId = requestedPlanId || '';
  let paymentCtx = null;
  let parcelasBeforeEntryLock = 1;
  const expanded = new Set();
  let filterSearchRenderTimer = null;
  let isPlansLoading = false;
  let plansLoadError = '';
  const planMessageHistoryByPlan = new Map();
  const planMessageSuggestionsByPlan = new Map();

  const clean = (v) => String(v || '').trim().replace(/[<>]/g, '');
  const normalizeSearchText = (value) => clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const matchesSearch = (plan, query) => {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) return true;
    const tokens = normalizedQuery.split(' ').filter(Boolean);
    const prontuario = clean(plan?.prontuario || plan?.patientId);
    const label = prontuario ? `${clean(plan?.patientName)} ${prontuario}` : clean(plan?.patientName);
    const haystack = normalizeSearchText([
      plan?.title,
      plan?.patientName,
      prontuario,
      plan?.dentistName,
      plan?.serviceLabel,
      label,
    ].join(' '));
    return tokens.every((token) => haystack.includes(token));
  };
  const num = (v, d = 0) => {
    if (v === null || v === undefined || v === '') return d;
    if (typeof v === 'number') return Number.isFinite(v) ? v : d;
    let raw = String(v).trim();
    if (!raw) return d;
    raw = raw.replace(/\s+/g, '');
    if (raw.includes(',') && raw.includes('.')) {
      // pt-BR: 1.234,56
      raw = raw.replace(/\./g, '').replace(',', '.');
    } else if (raw.includes(',')) {
      // pt-BR: 1234,56
      raw = raw.replace(',', '.');
    } else if (raw.includes('.')) {
      // Dot-only input can be either decimal or thousand separator.
      const dots = (raw.match(/\./g) || []).length;
      if (dots > 1) {
        // 1.234.567 -> 1234567
        raw = raw.replace(/\./g, '');
      } else {
        const [left, right = ''] = raw.split('.');
        if (/^\d+$/.test(left) && /^\d+$/.test(right) && right.length === 3) {
          // 1.200 -> 1200 (common pt-BR thousand format without decimals)
          raw = `${left}${right}`;
        }
      }
    }
    const n = Number(raw);
    return Number.isFinite(n) ? n : d;
  };
  const normalizeDecimalInput = (input) => {
    if (!input) return;
    const raw = String(input.value || '').trim();
    if (!raw) return;
    let next = raw.replace(/\s+/g, '').replace(/[^\d,.-]/g, '');
    if (next.includes(',') && next.includes('.')) {
      next = next.replace(/\./g, '').replace(',', '.');
    } else if (next.includes(',')) {
      next = next.replace(',', '.');
    }
    const parsed = num(next, Number.NaN);
    if (Number.isFinite(parsed)) {
      input.value = parsed.toFixed(2);
      return;
    }
    input.value = next;
  };
  const readMoneyInput = (input, fallback = 0) => {
    if (!input) return fallback;
    return num(input.value, fallback);
  };
  const formatMoneyBr = (value) => (Number(value) || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const formatMoneyInputBr = (input, fallback = 0) => {
    if (!input) return;
    const raw = String(input.value || '').trim();
    if (!raw) return;
    const parsed = Math.max(0, num(raw, fallback));
    input.value = formatMoneyBr(parsed);
  };
  const dateOnly = (v) => {
    if (!v) return '';
    const raw = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return '';
    return dt.toISOString().slice(0, 10);
  };
  const brMoney = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const brDate = (v) => {
    if (!v) return '-';
    const dt = new Date(`${v}T00:00:00`);
    return Number.isNaN(dt.getTime()) ? '-' : dt.toLocaleDateString('pt-BR');
  };
  const isPast = (d) => {
    if (!d) return false;
    const dt = new Date(`${d}T23:59:59`);
    return !Number.isNaN(dt.getTime()) && dt.getTime() < Date.now();
  };
  const lateDays = (d) => {
    if (!isPast(d)) return 0;
    const due = new Date(`${d}T00:00:00`).getTime();
    return Math.max(0, Math.floor((Date.now() - due) / 86400000));
  };
  const methodLabel = (m) => ({ PIX: 'Pix', CREDIT: 'Cartao credito', DEBIT: 'Cartao debito', CASH: 'Dinheiro', BOLETO: 'Boleto', TRANSFER: 'Transferencia', OTHER: 'Outros' }[clean(m).toUpperCase()] || 'Outros');
  const catLabel = (v) => ({ estetica: 'Estetica', clareamento: 'Clareamento', implantes: 'Implantes', ortodontia: 'Ortodontia', protocolos_avancados: 'Protocolos avancados' }[v] || v || '-');
  const stLabel = (plan) => {
    const s = clean(plan?.statusAtual).toUpperCase();
    if (s === 'LIBERADO') return 'Liberado';
    if (s === 'EM_ANDAMENTO') return 'Parcial';
    if (s === 'CANCELADO') return 'Inativo';
    return 'Nao liberado';
  };
  const stClass = (plan) => {
    const s = clean(plan?.statusAtual).toUpperCase();
    if (s === 'LIBERADO') return 'liberado';
    if (s === 'EM_ANDAMENTO') return 'andamento';
    return '';
  };
  const parcelStClass = (p) => {
    const s = clean(p?.status).toUpperCase();
    if (s === 'PAID') return 'paid';
    if (s === 'CANCELLED') return 'cancelled';
    return 'pending';
  };
  const parcelStLabel = (p) => ({ PAID: 'Pago', PENDING: 'Pendente', CANCELLED: 'Cancelado' }[clean(p?.status).toUpperCase()] || 'Pendente');
  const hasActiveFilters = () => Boolean(
    clean(filterCategory?.value)
    || clean(filterStatus?.value)
    || clean(filterSearch?.value),
  );
  const clearFilters = () => {
    if (filterCategory) filterCategory.value = '';
    if (filterStatus) filterStatus.value = '';
    if (filterSearch) filterSearch.value = '';
    closeSearchSuggestions();
    renderPlans();
    updateSummary();
  };

  const metrics = (plan) => {
    const total = num(plan?.totalValue, 0);
    const entry = Math.max(0, num(plan?.payment?.entry?.value, 0));
    const parcelBase = Math.max(0, total - Math.min(entry, total));
    const paid = num(plan?.payment?.paidTotal, 0);
    const pending = Math.max(0, total - paid);
    const sch = Array.isArray(plan?.payment?.schedule) ? plan.payment.schedule : [];
    const paidCount = sch.filter((p) => clean(p.status).toUpperCase() === 'PAID').length;
    const late = sch.filter((p) => clean(p.status).toUpperCase() === 'PENDING' && isPast(p.dueDate)).length;
    const progress = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
    return {
      total,
      entry,
      parcelBase,
      paid,
      pending,
      sch,
      paidCount,
      totalCount: Math.max(1, num(plan?.installmentsCount, sch.length || 1)),
      late,
      progress,
    };
  };

  const planMessageEventLabel = (value) => ({
    PLAN_INSTALLMENT_DUE_SOON: 'A vencer',
    PLAN_INSTALLMENT_DUE_TODAY: 'Vence hoje',
    PLAN_INSTALLMENT_OVERDUE: 'Vencida',
    PLAN_PAYMENT_CONFIRMED: 'Pagamento confirmado',
  }[clean(value).toUpperCase()] || 'Mensagem');

  const planMessageStatusLabel = (value) => ({
    CREATED: 'Criada',
    PENDING: 'Pendente',
    SENT: 'Enviada',
    FAILED: 'Falhou',
    BLOCKED: 'Bloqueada',
  }[clean(value).toUpperCase()] || 'Pendente');

  const planMessageStatusClass = (value) => {
    const status = clean(value).toUpperCase();
    if (status === 'SENT') return 'sent';
    if (status === 'FAILED') return 'failed';
    if (status === 'BLOCKED') return 'blocked';
    return 'pending';
  };

  const getPlanMessageHistory = (planId) => {
    const key = clean(planId);
    const payload = planMessageHistoryByPlan.get(key);
    return Array.isArray(payload?.items) ? payload.items : [];
  };

  const getPlanMessageSuggestions = (planId) => {
    const key = clean(planId);
    const payload = planMessageSuggestionsByPlan.get(key);
    return Array.isArray(payload?.items) ? payload.items : [];
  };

  const findSuggestionByParcel = (planId, parcelId) => getPlanMessageSuggestions(planId)
    .find((item) => clean(item.installmentId) === clean(parcelId)) || null;

  const findLatestHistoryByParcel = (planId, parcelId) => getPlanMessageHistory(planId)
    .filter((item) => clean(item.installmentId) === clean(parcelId))
    .sort((a, b) => new Date(b.lastAttemptAt || b.createdAt || 0).getTime() - new Date(a.lastAttemptAt || a.createdAt || 0).getTime())[0] || null;

  const loadPlanMessaging = async (planId, options = {}) => {
    const normalizedPlanId = clean(planId);
    if (!normalizedPlanId) return;
    if (!plansApi.messageHistory || !plansApi.messageSuggestions) return;
    try {
      const [history, suggestions] = await Promise.all([
        plansApi.messageHistory({ planId: normalizedPlanId }),
        plansApi.messageSuggestions({ planId: normalizedPlanId }),
      ]);
      planMessageHistoryByPlan.set(normalizedPlanId, history || { items: [] });
      planMessageSuggestionsByPlan.set(normalizedPlanId, suggestions || { items: [] });
    } catch (err) {
      if (!options.silent) {
        console.warn('[PLANOS] mensageria indisponivel', err?.message || err);
      }
    }
  };

  const updateParcelasStateByEntry = () => {
    const total = Math.max(0, num(inputs.valor?.value, 0));
    const entrada = Math.max(0, num(inputs.entradaValor?.value, 0));
    const semSaldo = total > 0 && entrada >= total;
    if (!inputs.parcelas) return semSaldo;

    if (semSaldo) {
      parcelasBeforeEntryLock = Math.max(1, num(inputs.parcelas.value, 1));
      inputs.parcelas.value = '1';
      inputs.parcelas.setAttribute('disabled', 'disabled');
      if (parcelasHint) parcelasHint.textContent = 'Sem saldo para parcelar: ajuste a entrada para gerar parcelas.';
    } else {
      const wasDisabled = inputs.parcelas.hasAttribute('disabled');
      inputs.parcelas.removeAttribute('disabled');
      if (wasDisabled && !inputs.parcelas.value) {
        inputs.parcelas.value = String(Math.max(1, parcelasBeforeEntryLock || 1));
      }
      if (parcelasHint) parcelasHint.textContent = '';
    }
    return semSaldo;
  };

  const updateInstallmentValue = () => {
    const t = Math.max(0, readMoneyInput(inputs.valor, 0));
    const e = Math.max(0, readMoneyInput(inputs.entradaValor, 0));
    updateParcelasStateByEntry();
    const p = Math.max(1, num(inputs.parcelas?.value, 1));
    const restante = Math.max(0, t - Math.min(e, t));
    if (inputs.valorParcela) inputs.valorParcela.value = formatMoneyBr(restante / p);
    if (inputs.parcelasPagas) {
      const paid = Math.max(0, Math.min(p, num(inputs.parcelasPagas.value, 0)));
      inputs.parcelasPagas.value = String(paid);
    }
  };

  const updateRulePreview = () => {
    const regra = inputs.regra?.value || 'quitacao_total';
    const min = Math.max(1, num(inputs.minParcelas?.value, 1));
    if (regra === 'quitacao_total') {
      if (rulePreview) rulePreview.textContent = 'Liberacao apenas com quitacao total.';
      if (inputs.minParcelas) {
        inputs.minParcelas.value = String(Math.max(1, num(inputs.parcelas?.value, 1)));
        inputs.minParcelas.setAttribute('disabled', 'disabled');
      }
      return;
    }
    inputs.minParcelas?.removeAttribute('disabled');
    if (rulePreview) rulePreview.textContent = `Liberacao apos ${min} parcela(s) pagas.`;
  };

  const resolveReleaseRule = () => {
    const regra = inputs.regra?.value || 'quitacao_total';
    const parcelas = Math.max(1, num(inputs.parcelas?.value, 1));
    const min = Math.max(1, num(inputs.minParcelas?.value, 1));
    if (regra === 'quitacao_total') return { releaseRule: 'FULL', minInstallmentsRelease: parcelas };
    if (min >= Math.ceil(parcelas * 0.5)) return { releaseRule: 'PERCENT_50', minInstallmentsRelease: Math.max(min, Math.ceil(parcelas * 0.5)) };
    return { releaseRule: 'FIRST_PAYMENT', minInstallmentsRelease: min };
  };

  const resolvePatient = () => {
    const raw = clean(inputs.paciente?.value || '');
    if (!raw) return null;
    const lower = raw.toLowerCase();
    return patients.find((p) => `${p.nome} - ${p.prontuario}`.toLowerCase() === lower)
      || patients.find((p) => clean(p.prontuario).toLowerCase() === lower)
      || patients.find((p) => clean(p.nome).toLowerCase() === lower)
      || (!patients.length ? { patientId: raw, prontuario: raw, nome: raw } : null);
  };

  const renderPatients = () => {
    if (!patientsDatalist) return;
    patientsDatalist.innerHTML = '';
    patients.forEach((p) => {
      const o = document.createElement('option');
      o.value = `${p.nome} - ${p.prontuario}`;
      patientsDatalist.appendChild(o);
    });
  };

  const renderServiceSuggestions = () => {
    if (!servicesHistoryDatalist) return;
    const unique = new Map();
    plans.forEach((plan) => {
      const label = clean(plan?.serviceLabel);
      if (!label) return;
      const key = normalizeSearchText(label);
      if (!key || unique.has(key)) return;
      unique.set(key, label);
    });
    servicesHistoryDatalist.innerHTML = '';
    Array.from(unique.values())
      .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }))
      .slice(0, 30)
      .forEach((label) => {
        const option = document.createElement('option');
        option.value = label;
        servicesHistoryDatalist.appendChild(option);
      });
  };

  const renderPlanMessagingHistory = (plan) => {
    const history = getPlanMessageHistory(plan.planId);
    if (!history.length) {
      return '<div class="plan-message-empty">Nenhum envio registrado para este plano.</div>';
    }
    return `
      <div class="plan-message-list">
        ${history.slice().sort((a, b) => new Date(b.lastAttemptAt || b.createdAt || 0).getTime() - new Date(a.lastAttemptAt || a.createdAt || 0).getTime()).map((item) => `
          <article class="plan-message-card">
            <div class="plan-message-card-top">
              <span class="plan-message-chip ${planMessageStatusClass(item.status)}">${planMessageStatusLabel(item.status)}</span>
              <strong>${planMessageEventLabel(item.eventType)}</strong>
            </div>
            <div class="plan-message-card-meta">
              <span>Parcela ${item.installmentSequence || '-'}</span>
              <span>${item.dueDate ? brDate(dateOnly(item.dueDate)) : '-'}</span>
              <span>${brMoney(item.amount)}</span>
            </div>
            <div class="plan-message-card-meta">
              <span>Tentativas: ${item.attemptCount || 0}</span>
              <span>${item.lastAttemptAt ? `Ultimo envio ${new Date(item.lastAttemptAt).toLocaleString('pt-BR')}` : 'Sem tentativa registrada'}</span>
            </div>
            ${item.lastError ? `<p class="plan-message-error">${item.lastError}</p>` : ''}
            <div class="plan-message-actions">
              <button type="button" class="btn ghost btn-sm plan-action" data-action="resend-plan-message" data-plan-id="${plan.planId}" data-plan-message-id="${item.id}">Reenviar</button>
            </div>
          </article>
        `).join('')}
      </div>
    `;
  };

  const renderParcelMessageAction = (plan, parcel) => {
    const suggestion = findSuggestionByParcel(plan.planId, parcel.parcelId);
    const latest = findLatestHistoryByParcel(plan.planId, parcel.parcelId);
    const recommendedEventType = clean(suggestion?.recommendedEventType).toUpperCase();
    const canSend = Boolean(recommendedEventType);
    const primaryLabel = recommendedEventType === 'PLAN_PAYMENT_CONFIRMED' ? 'Enviar confirmacao' : 'Enviar lembrete';

    const statusHtml = latest
      ? `<span class="plan-message-chip ${planMessageStatusClass(latest.status)}">${planMessageStatusLabel(latest.status)}</span>`
      : '<span class="plan-message-chip pending">Nao notificada</span>';

    const metaHtml = latest
      ? `<small>${planMessageEventLabel(latest.eventType)}${latest.lastAttemptAt ? ` em ${new Date(latest.lastAttemptAt).toLocaleString('pt-BR')}` : ''}</small>`
      : `<small>${suggestion?.dueState === 'overdue' ? 'Parcela vencida.' : suggestion?.dueState === 'due_today' ? 'Parcela vence hoje.' : suggestion?.dueState === 'due_soon' ? 'Parcela a vencer.' : 'Sem evento sugerido.'}</small>`;

    let actionHtml = '<button type="button" class="btn ghost btn-sm plan-action plan-action--disabled" disabled>Sem acao</button>';
    if (canSend && !suggestion?.alreadyNotified) {
      actionHtml = `<button type="button" class="btn ghost btn-sm plan-action" data-action="send-plan-message" data-plan-id="${plan.planId}" data-parcel-id="${parcel.parcelId}" data-event-type="${recommendedEventType}">${primaryLabel}</button>`;
    } else if (clean(latest?.id)) {
      actionHtml = `<button type="button" class="btn ghost btn-sm plan-action" data-action="resend-plan-message" data-plan-id="${plan.planId}" data-plan-message-id="${latest.id}">Reenviar</button>`;
    }

    return `<div class="parcel-message-cell">${statusHtml}${metaHtml}${actionHtml}</div>`;
  };

  const renderDetail = () => {
    if (!planDetailEmpty || !planDetailContent) return;
    const plan = plans.find((p) => clean(p.planId) === clean(selectedPlanId));
    if (!plan) {
      planDetailEmpty.style.display = '';
      planDetailContent.innerHTML = '';
      return;
    }
    planDetailEmpty.style.display = 'none';
    const m = metrics(plan);
    const pending = m.sch.filter((p) => clean(p.status).toUpperCase() === 'PENDING');
    const opts = pending.map((p) => `<option value="${p.parcelId}">Parcela ${p.number}/${m.totalCount} - ${brMoney(p.value)}</option>`).join('');
    const rr = ({ FULL: '100% pago', PERCENT_50: '50% pago', FIRST_PAYMENT: '1a parcela paga' }[clean(plan.releaseRule).toUpperCase()] || '100% pago');
    const serviceLabel = clean(plan.serviceLabel);
    const messagingHistory = renderPlanMessagingHistory(plan);
    planDetailContent.innerHTML = `
      <div class="plan-detail-col">
        <h4>${plan.title}</h4>
        <div class="plan-detail-list">
          <div class="plan-detail-item"><span>Paciente</span><strong>${plan.patientName || '-'} (${plan.prontuario || '-'})</strong></div>
            <div class="plan-detail-item"><span>Valor total</span><strong>${brMoney(m.total)}</strong></div>
            <div class="plan-detail-item"><span>Entrada faturada</span><strong>${brMoney(m.entry)}</strong></div>
            <div class="plan-detail-item"><span>Restante parcelado</span><strong>${brMoney(m.parcelBase)}</strong></div>
            <div class="plan-detail-item"><span>Regra</span><strong>${rr}</strong></div>
            <div class="plan-detail-item"><span>Procedimento</span><strong>${serviceLabel || '-'}</strong></div>
          <div class="plan-detail-item"><span>Inicio</span><strong>${brDate(plan.startDate)}</strong></div>
          <div class="plan-detail-item"><span>Vencimento padrao</span><strong>Dia ${plan.dueDay || '-'}</strong></div>
        </div>
      </div>
      <div class="plan-detail-col">
        <h4>Progresso</h4>
        <div class="plan-detail-list">
          <div class="plan-detail-item"><span>Pago</span><strong>${brMoney(m.paid)}</strong></div>
          <div class="plan-detail-item"><span>Pendente</span><strong>${brMoney(m.pending)}</strong></div>
          <div class="plan-detail-item"><span>Parcelas</span><strong>${m.paidCount}/${m.totalCount}</strong></div>
          <div class="plan-detail-item"><span>Status</span><strong>${stLabel(plan)}</strong></div>
          <div class="plan-detail-item"><span>Liberado em</span><strong>${plan?.payment?.releasedAt ? brDate(dateOnly(plan.payment.releasedAt)) : '-'}</strong></div>
        </div>
        <div class="plan-progress-wrap" style="margin-top:8px;"><div class="plan-progress-bar"><span style="width:${m.progress}%"></span></div><small>${m.progress}% pago</small></div>
        <div class="plan-detail-select-wrap">
          <select id="plan-detail-pending-select">${opts || '<option value="">Sem parcelas pendentes</option>'}</select>
          <button type="button" class="btn primary btn-sm plan-action plan-action--detail-confirm" data-action="detail-confirm">Confirmar parcela</button>
        </div>
        <div class="plan-detail-actions plan-inline-actions">
          <button type="button" class="btn ghost btn-sm plan-action plan-action--finance" data-action="detail-open-finance">Ver no financeiro</button>
          ${m.sch.length ? '' : '<button type="button" class="btn ghost btn-sm plan-action plan-action--parcels" data-action="detail-generate-schedule">Gerar parcelas agora</button>'}
        </div>
        <div class="plan-message-panel">
          <div class="plan-message-panel-head">
            <h4>Mensageria do plano</h4>
            <small>Historico central por parcela</small>
          </div>
          ${messagingHistory}
        </div>
      </div>
    `;
  };

  const parcelRows = (plan) => {
    const m = metrics(plan);
    if (!m.sch.length) return '<tr><td colspan="8" class="parcel-empty">Nenhuma parcela gerada.</td></tr>';
    return m.sch.map((p) => {
      const pending = clean(p.status).toUpperCase() === 'PENDING';
      const late = pending && isPast(p.dueDate);
      const paidMeta = clean(p.status).toUpperCase() === 'PAID'
        ? `<small class="parcel-paid-meta">${methodLabel(p.paymentMethod)} em ${brDate(dateOnly(p.paidAt || ''))}</small>`
        : '';
      return `<tr>
        <td>${p.number}</td><td>${brDate(p.dueDate)}</td><td>${brMoney(p.value)}</td><td>${methodLabel(p.paymentMethod)}</td>
        <td><span class="parcel-status ${parcelStClass(p)}">${parcelStLabel(p)}</span>${paidMeta}</td>
        <td>${late ? `${lateDays(p.dueDate)} dia(s)` : '-'}</td>
        <td>${renderParcelMessageAction(plan, p)}</td>
        <td><div class="parcel-actions">${pending
          ? `<button type="button" class="btn ghost btn-sm plan-action plan-action--detail-confirm" data-action="confirm-parcel" data-plan-id="${plan.planId}" data-parcel-id="${p.parcelId}">Confirmar pagamento</button>
             <button type="button" class="btn ghost btn-sm plan-action plan-action--finance" data-action="copy-pix" data-plan-id="${plan.planId}" data-parcel-id="${p.parcelId}">Copiar Pix manual</button>`
          : '<button type="button" class="btn ghost btn-sm plan-action plan-action--disabled" disabled>Sem acoes</button>'}</div></td></tr>`;
    }).join('');
  };

  const renderPlans = () => {
    if (!plansGrid) return;
    if (isPlansLoading) {
      plansGrid.innerHTML = `
        <div class="empty-state empty-state-loading">
          <div class="loading-shimmer"></div>
          <p class="empty-state-title">Carregando planos...</p>
          <p class="empty-state-subtitle">Organizando informacoes financeiras e de procedimento.</p>
        </div>
      `;
      return;
    }
    if (plansLoadError) {
      plansGrid.innerHTML = `
        <div class="empty-state">
          <p class="empty-state-title">Nao foi possivel carregar os planos</p>
          <p class="empty-state-subtitle">${plansLoadError}</p>
          <div class="empty-state-actions">
            <button type="button" class="btn ghost" id="empty-clear-filters">Limpar filtros</button>
            <button type="button" class="btn primary" id="empty-new-plan">+ Novo plano</button>
          </div>
        </div>
      `;
      plansGrid.querySelector('#empty-clear-filters')?.addEventListener('click', () => clearFilters());
      plansGrid.querySelector('#empty-new-plan')?.addEventListener('click', () => openModalForm());
      return;
    }
    const cat = clean(filterCategory?.value).toLowerCase();
    const st = clean(filterStatus?.value).toLowerCase();
    const search = clean(filterSearch?.value);
    const filtered = plans.filter((p) => {
      if (cat && clean(p.category).toLowerCase() !== cat) return false;
      if (st && !stLabel(p).toLowerCase().includes(st.replace('_', ' '))) return false;
      if (!matchesSearch(p, search)) return false;
      return true;
    });

    plansGrid.innerHTML = '';
    if (!plans.length) {
      plansGrid.innerHTML = `
        <div class="empty-state">
          <p class="empty-state-title">Nenhum plano cadastrado ainda</p>
          <p class="empty-state-subtitle">Crie o primeiro plano para comecar a acompanhar entradas e parcelas.</p>
          <div class="empty-state-actions">
            <button type="button" class="btn primary" id="empty-new-plan">+ Novo plano</button>
          </div>
        </div>
      `;
      plansGrid.querySelector('#empty-new-plan')?.addEventListener('click', () => openModalForm());
      return;
    }
    if (!filtered.length) {
      plansGrid.innerHTML = `
        <div class="empty-state">
          <p class="empty-state-title">Nenhum plano encontrado</p>
          <p class="empty-state-subtitle">Ajuste os filtros para localizar o plano desejado.</p>
          <div class="empty-state-actions">
            ${hasActiveFilters() ? '<button type="button" class="btn ghost" id="empty-clear-filters">Limpar filtros</button>' : ''}
            <button type="button" class="btn primary" id="empty-new-plan">+ Novo plano</button>
          </div>
        </div>
      `;
      plansGrid.querySelector('#empty-clear-filters')?.addEventListener('click', () => clearFilters());
      plansGrid.querySelector('#empty-new-plan')?.addEventListener('click', () => openModalForm());
      return;
    }

    filtered.forEach((plan) => {
      const m = metrics(plan);
      const serviceLabel = clean(plan.serviceLabel);
      const card = document.createElement('article');
      const selected = clean(selectedPlanId) === clean(plan.planId);
      card.className = `plan-card${selected ? ' selected' : ''}`;
      card.innerHTML = `
        <div class="plan-header"><span class="plan-category">${catLabel(plan.category)}</span><span class="plan-status ${stClass(plan)}">${stLabel(plan)}</span></div>
        <h3 class="plan-title">${plan.title}</h3>
        <p class="plan-desc">${plan.patientName || '-'} | Prontuario: ${plan.prontuario || '-'}</p>
        ${serviceLabel ? `<div class="plan-services"><span>${serviceLabel}</span></div>` : ''}
        <div class="plan-alerts">${m.late > 0 ? `<span class="plan-alert-badge">Em atraso (${m.late})</span>` : ''}</div>
        <div class="plan-rule">Pago: ${brMoney(m.paid)} | Falta: ${brMoney(m.pending)} | Parcelas: ${m.paidCount}/${m.totalCount}</div>
        <div class="plan-finance-split">
          <span class="plan-split-chip">Entrada: ${brMoney(m.entry)}</span>
          <span class="plan-split-chip">Parcelado: ${brMoney(m.parcelBase)}</span>
        </div>
        <div class="plan-progress-wrap"><div class="plan-progress-bar"><span style="width:${m.progress}%"></span></div><small>${m.progress}% pago</small></div>
        <div class="modal-actions plan-card-actions">
          <button type="button" class="btn ghost btn-sm plan-action plan-action--detail" data-action="select-plan" data-id="${plan.planId}">Ver detalhes</button>
          <button type="button" class="btn ghost btn-sm plan-action plan-action--parcels" data-action="toggle-parcels" data-id="${plan.planId}">${expanded.has(plan.planId) ? 'Ocultar parcelas' : 'Ver parcelas'}</button>
          <button type="button" class="btn ghost btn-sm plan-action plan-action--edit" data-action="edit" data-id="${plan.planId}">Editar</button>
          <button type="button" class="btn ghost btn-sm plan-action plan-action--delete" data-action="delete" data-id="${plan.planId}">Excluir</button>
        </div>
        <div class="parcel-table-wrap ${expanded.has(plan.planId) ? 'show' : ''}">
          <table class="parcel-table"><thead><tr><th>Parcela</th><th>Vencimento</th><th>Valor</th><th>Forma</th><th>Status</th><th>Atraso</th><th>Mensageria</th><th>Acoes</th></tr></thead><tbody>${parcelRows(plan)}</tbody></table>
        </div>
      `;
      plansGrid.appendChild(card);
    });
  };

  const getSearchPatientSuggestions = (query = '') => {
    const q = clean(query).toLowerCase();
    const unique = new Map();
    plans.forEach((plan) => {
      const nome = clean(plan?.patientName);
      const prontuario = clean(plan?.prontuario || plan?.patientId);
      if (!nome && !prontuario) return;
      const label = prontuario ? `${nome || prontuario} - ${prontuario}` : nome;
      const key = `${nome.toLowerCase()}|${prontuario.toLowerCase()}`;
      const haystack = `${nome} ${prontuario} ${label}`.toLowerCase();
      if (q && !haystack.includes(q)) return;
      if (!unique.has(key)) unique.set(key, label);
    });
    return Array.from(unique.values()).slice(0, 8);
  };

  const closeSearchSuggestions = () => {
    if (!filterSearchSuggestions) return;
    filterSearchSuggestions.classList.remove('open');
    filterSearchSuggestions.innerHTML = '';
  };

  const selectPlanBySearch = (value) => {
    const q = clean(value).toLowerCase();
    if (!q) return;
    const match = plans.find((p) => {
      const nome = clean(p?.patientName).toLowerCase();
      const prontuario = clean(p?.prontuario || p?.patientId).toLowerCase();
      const label = prontuario ? `${nome || prontuario} - ${prontuario}` : nome;
      return nome === q || prontuario === q || label === q;
    });
    if (!match) return;
    selectedPlanId = clean(match.planId);
    loadPlanMessaging(selectedPlanId, { silent: true }).then(() => {
      renderPlans();
      renderDetail();
    }).catch(() => null);
    renderPlans();
    renderDetail();
  };

  const applySearchTerm = (value, options = {}) => {
    if (!filterSearch) return;
    filterSearch.value = value;
    renderPlans();
    updateSummary();
    if (options?.selectPlan) selectPlanBySearch(value);
  };

  const openSearchSuggestions = (query = '') => {
    if (!filterSearchSuggestions) return;
    const suggestions = getSearchPatientSuggestions(query);
    if (!suggestions.length) {
      closeSearchSuggestions();
      return;
    }
    filterSearchSuggestions.innerHTML = suggestions.map((label) => (
      `<button type="button" class="search-suggestion-item" data-value="${label.replace(/"/g, '&quot;')}">${label}</button>`
    )).join('');
    filterSearchSuggestions.classList.add('open');
  };
  const scheduleSearchRender = () => {
    if (filterSearchRenderTimer) clearTimeout(filterSearchRenderTimer);
    filterSearchRenderTimer = setTimeout(() => {
      filterSearchRenderTimer = null;
      renderPlans();
      updateSummary();
    }, 120);
  };

  const updateSummary = () => {
    if (summaryTotal) summaryTotal.textContent = String(plans.length);
    if (summaryAndamento) summaryAndamento.textContent = String(plans.filter((p) => clean(p.statusAtual).toUpperCase() === 'EM_ANDAMENTO').length);
    if (summaryLiberados) summaryLiberados.textContent = String(plans.filter((p) => clean(p.statusAtual).toUpperCase() === 'LIBERADO').length);
  };

  const resetForm = () => {
    editingPlanId = null;
    form?.reset();
    if (inputs.parcelasPagas) { inputs.parcelasPagas.value = '0'; inputs.parcelasPagas.removeAttribute('disabled'); }
    if (inputs.entradaValor) inputs.entradaValor.value = '0,00';
    if (inputs.entradaData) inputs.entradaData.value = dateOnly(new Date());
    if (inputs.entradaForma) inputs.entradaForma.value = 'PIX';
    if (inputs.startDate) inputs.startDate.value = dateOnly(new Date());
    if (inputs.dueDay) inputs.dueDay.value = String(new Date().getDate());
    updateInstallmentValue();
    updateRulePreview();
  };

  const openModalForm = (plan = null) => {
    modal?.classList.add('open');
    modal?.setAttribute('aria-hidden', 'false');
    resetForm();
    if (!plan) return;
    editingPlanId = plan.planId;
    if (inputs.nome) inputs.nome.value = plan.title || '';
    if (inputs.categoria) inputs.categoria.value = plan.category || 'estetica';
    if (inputs.descricao) inputs.descricao.value = plan.description || '';
    if (inputs.paciente) inputs.paciente.value = `${plan.patientName || ''}${plan.prontuario ? ` - ${plan.prontuario}` : ''}`.trim();
    if (inputs.dentista) inputs.dentista.value = plan.dentistName || '';
    if (inputs.valor) inputs.valor.value = formatMoneyBr(num(plan.totalValue, 0));
    if (inputs.entradaValor) inputs.entradaValor.value = formatMoneyBr(num(plan?.payment?.entry?.value, 0));
    if (inputs.entradaData) inputs.entradaData.value = dateOnly(plan?.payment?.entry?.paidAt || plan.startDate || new Date());
    if (inputs.entradaForma) inputs.entradaForma.value = clean(plan?.payment?.entry?.paymentMethod || 'PIX').toUpperCase() || 'PIX';
    if (inputs.parcelas) inputs.parcelas.value = String(Math.max(1, num(plan.installmentsCount, 1)));
    if (inputs.parcelasPagas) inputs.parcelasPagas.value = String(Math.max(0, Math.min(num(plan.installmentsCount, 1), num(plan.paidInstallments, 0))));
    if (inputs.servico) inputs.servico.value = clean(plan.serviceLabel);
    if (inputs.observacoes) inputs.observacoes.value = plan.notes || '';
    if (inputs.startDate) inputs.startDate.value = dateOnly(plan.startDate) || dateOnly(new Date());
    if (inputs.dueDay) inputs.dueDay.value = String(Math.max(0, num(plan.dueDay, new Date().getDate())));
    if (inputs.status) {
      const s = clean(plan.statusAtual).toUpperCase();
      inputs.status.value = s === 'CANCELADO' ? 'inativo' : (s === 'EM_ANDAMENTO' ? 'em_andamento' : 'ativo');
    }
    if (inputs.regra) inputs.regra.value = clean(plan.releaseRule).toUpperCase() === 'FULL' ? 'quitacao_total' : 'min_parcelas';
    if (inputs.minParcelas) inputs.minParcelas.value = String(Math.max(1, num(plan.minInstallmentsRelease, 1)));
    updateInstallmentValue();
    updateRulePreview();
  };

  const closeModalForm = () => {
    modal?.classList.remove('open');
    modal?.setAttribute('aria-hidden', 'true');
    resetForm();
  };

  const openPayModal = (ctx) => {
    paymentCtx = ctx;
    paymentModal?.classList.add('open');
    paymentModal?.setAttribute('aria-hidden', 'false');
    if (paymentTitle) paymentTitle.textContent = `Confirmar pagamento - Parcela ${ctx.parcelNumber}`;
    if (paymentInfo) paymentInfo.textContent = `${ctx.planTitle} | ${ctx.patientName} | ${brMoney(ctx.value)}`;
    if (paymentMethod) paymentMethod.value = 'PIX';
    if (paymentDate) paymentDate.value = dateOnly(new Date());
    if (paymentNotes) paymentNotes.value = '';
    if (paymentConfirmCheck) paymentConfirmCheck.checked = false;
  };

  const closePayModal = () => {
    paymentModal?.classList.remove('open');
    paymentModal?.setAttribute('aria-hidden', 'true');
    paymentCtx = null;
    paymentForm?.reset();
  };

  const replacePlan = (plan) => {
    const i = plans.findIndex((p) => clean(p.planId) === clean(plan?.planId));
    if (i >= 0) plans[i] = plan; else plans.unshift(plan);
  };

  const refreshPlan = async (planId) => {
    if (!plansApi.getById || !planId) return;
    const p = await plansApi.getById({ planId });
    replacePlan(p);
    await loadPlanMessaging(planId, { silent: true });
    updateSummary();
    renderServiceSuggestions();
    renderPlans();
    renderDetail();
  };

  const buildPayload = () => {
    normalizeDecimalInput(inputs.valor);
    normalizeDecimalInput(inputs.entradaValor);
    const patient = resolvePatient();
    if (!patient) throw new Error('Selecione um paciente valido (nome + prontuario).');
    const total = Math.max(0, readMoneyInput(inputs.valor, 0));
    const entrada = Math.max(0, readMoneyInput(inputs.entradaValor, 0));
    const n = Math.max(1, num(inputs.parcelas?.value, 1));
    const { releaseRule, minInstallmentsRelease } = resolveReleaseRule();
    const sb = clean(inputs.status?.value || 'ativo').toLowerCase();
    const payload = {
      planId: editingPlanId || undefined,
      title: clean(inputs.nome?.value),
      category: clean(inputs.categoria?.value),
      description: clean(inputs.descricao?.value),
      serviceLabel: clean(inputs.servico?.value),
      patientId: clean(patient.patientId || patient.prontuario),
      prontuario: clean(patient.prontuario || patient.patientId),
      patientName: clean(patient.nome),
      dentistName: clean(inputs.dentista?.value),
      totalValue: total,
      installmentsCount: n,
      paidInstallments: Math.max(0, Math.min(n, num(inputs.parcelasPagas?.value, 0))),
      installmentValue: Math.max(0, total - Math.min(entrada, total)) / n,
      entryValue: Math.min(entrada, total),
      entradaValor: Math.min(entrada, total),
      entryPaidAt: dateOnly(inputs.entradaData?.value || '') || dateOnly(new Date()),
      entryPaymentMethod: clean(inputs.entradaForma?.value || 'PIX').toUpperCase(),
      payment: {
        entry: {
          value: Math.min(entrada, total),
          paidAt: dateOnly(inputs.entradaData?.value || '') || dateOnly(new Date()),
          paymentMethod: clean(inputs.entradaForma?.value || 'PIX').toUpperCase(),
          status: Math.min(entrada, total) > 0 ? 'PAID' : 'PENDING',
        },
      },
      releaseRule,
      minInstallmentsRelease,
      statusAtual: sb === 'inativo' ? 'CANCELADO' : (sb === 'em_andamento' ? 'EM_ANDAMENTO' : 'ATIVO'),
      startDate: dateOnly(inputs.startDate?.value || ''),
      dueDay: Math.max(0, num(inputs.dueDay?.value, 0)),
      notes: clean(inputs.observacoes?.value),
      linkedServiceIds: [],
    };
    if (payload.totalValue <= 0) throw new Error('Valor total deve ser maior que zero.');
    if (payload.installmentsCount < 1) throw new Error('Numero de parcelas deve ser ao menos 1.');
    if (num(payload.entryValue, 0) > payload.totalValue) throw new Error('Entrada nao pode ser maior que o valor total.');
    return payload;
  };

  const loadPatients = async () => {
    if (!patientsApi.list) { patients = []; renderPatients(); return; }
    try {
      const data = await patientsApi.list();
      patients = (Array.isArray(data) ? data : []).map((p) => ({ patientId: clean(p.id || p.patientId || p.prontuario || ''), prontuario: clean(p.prontuario || p.patientId || p.id || ''), nome: clean(p.nome || p.name || '') })).filter((p) => p.prontuario || p.patientId);
    } catch (_) { patients = []; }
    renderPatients();
  };

  const loadPlans = async () => {
    if (isPlansLoading) return;
    if (!plansApi.list) {
      plans = [];
      plansLoadError = 'API de planos indisponivel no momento.';
      updateSummary();
      renderPlans();
      renderDetail();
      return;
    }
    isPlansLoading = true;
    plansLoadError = '';
    renderPlans();
    try {
      plans = (await plansApi.list({})) || [];
    } catch (_) {
      plans = [];
      plansLoadError = 'Verifique a conexao local e tente novamente.';
    } finally {
      isPlansLoading = false;
    }
    if (selectedPlanId && !plans.some((p) => clean(p.planId) === clean(selectedPlanId))) {
      if (requestedPlanId) alert('Plano nao encontrado.');
      selectedPlanId = '';
    }
    if (!selectedPlanId && plans.length) selectedPlanId = plans[0].planId;
    await loadPlanMessaging(selectedPlanId, { silent: true });
    updateSummary();
    renderServiceSuggestions();
    renderPlans();
    renderDetail();
  };

  const onSubmit = async (ev) => {
    ev.preventDefault();
    if (!plansApi.create || !plansApi.update) return alert('API de planos indisponivel.');
    try {
      const payload = buildPayload();
      const saved = editingPlanId ? await plansApi.update({ planId: editingPlanId, patch: payload }) : await plansApi.create(payload);
      selectedPlanId = clean(saved?.planId || saved?.id) || selectedPlanId;
      closeModalForm();
      await loadPlans();
    } catch (err) { alert(err?.message || 'Nao foi possivel salvar o plano.'); }
  };

  const onPaySubmit = async (ev) => {
    ev.preventDefault();
    if (!paymentCtx || !financeApi.confirmPayment) return;
    if (!paymentConfirmCheck?.checked) return alert('Confirme a opcao "Marcar como pago e registrar".');
    const ctxPlanId = paymentCtx.planId;
    const ctxParcelNumber = paymentCtx.parcelNumber;
    try {
      await financeApi.confirmPayment({
        financeEntryId: clean(paymentCtx.financeEntryId),
        installmentId: clean(paymentCtx.parcelId),
        paymentMethod: clean(paymentMethod?.value || 'PIX').toUpperCase(),
        paidAt: dateOnly(paymentDate?.value || '') || dateOnly(new Date()),
        notes: clean(paymentNotes?.value || ''),
      });
      closePayModal();
      expanded.add(ctxPlanId);
      await refreshPlan(ctxPlanId);
      alert(`Parcela ${ctxParcelNumber} confirmada.`);
      window.dispatchEvent(new CustomEvent('finance-updated', { detail: { source: 'planos' } }));
    } catch (err) { alert(err?.message || 'Nao foi possivel confirmar o pagamento da parcela.'); }
  };

  const openParcel = (plan, parcel) => {
    openPayModal({
      planId: plan.planId,
      planTitle: plan.title,
      patientName: plan.patientName || plan.prontuario || '-',
      parcelId: parcel.parcelId,
      parcelNumber: `${parcel.number}/${num(plan.installmentsCount, 1)}`,
      value: parcel.value,
      financeEntryId: clean(parcel.financeEntryId),
    });
  };

  const onGridClick = async (ev) => {
    const btn = ev.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const planId = clean(btn.dataset.id || btn.dataset.planId);
    const plan = plans.find((p) => clean(p.planId) === planId);
    if (!plan) return;

    if (action === 'select-plan') {
      selectedPlanId = planId;
      await loadPlanMessaging(planId, { silent: true });
      renderPlans();
      renderDetail();
      return;
    }
    if (action === 'toggle-parcels') { if (expanded.has(planId)) expanded.delete(planId); else expanded.add(planId); renderPlans(); return; }
    if (action === 'send-plan-message') {
      if (!plansApi.sendMessage) return alert('Mensageria de planos indisponivel.');
      try {
        const result = await plansApi.sendMessage({
          planId,
          installmentId: clean(btn.dataset.parcelId),
          eventType: clean(btn.dataset.eventType),
        });
        await loadPlanMessaging(planId, { silent: true });
        renderPlans();
        renderDetail();
        if (result?.blocked) {
          alert(result?.reason || 'Este envio ja possui um evento equivalente registrado.');
        } else {
          alert('Mensagem do plano enviada com sucesso.');
        }
      } catch (err) {
        alert(err?.message || 'Nao foi possivel enviar a mensagem do plano.');
      }
      return;
    }
    if (action === 'resend-plan-message') {
      if (!plansApi.resendMessage) return alert('Reenvio de mensageria de planos indisponivel.');
      try {
        await plansApi.resendMessage({
          planMessageId: clean(btn.dataset.planMessageId),
        });
        await loadPlanMessaging(planId, { silent: true });
        renderPlans();
        renderDetail();
        alert('Mensagem reenviada com sucesso.');
      } catch (err) {
        alert(err?.message || 'Nao foi possivel reenviar a mensagem do plano.');
      }
      return;
    }
    if (action === 'confirm-parcel') {
      const parcel = (Array.isArray(plan?.payment?.schedule) ? plan.payment.schedule : []).find((p) => clean(p.parcelId) === clean(btn.dataset.parcelId));
      if (parcel) openParcel(plan, parcel);
      return;
    }
    if (action === 'copy-pix') {
      const parcel = (Array.isArray(plan?.payment?.schedule) ? plan.payment.schedule : []).find((p) => clean(p.parcelId) === clean(btn.dataset.parcelId));
      if (!parcel) return;
      const text = `Plano: ${plan.title}\nPaciente: ${plan.patientName}\nParcela: ${parcel.number}/${num(plan.installmentsCount, 1)}\nValor: ${brMoney(parcel.value)}`;
      try { await navigator.clipboard.writeText(text); alert('Resumo Pix copiado.'); } catch (_) { alert('Nao foi possivel copiar.'); }
      return;
    }
    if (action === 'edit') return openModalForm(plan);
    if (action === 'delete') {
      if (!plansApi.remove) return alert('API de planos indisponivel.');
      if (!window.confirm('Deseja excluir este plano?')) return;
      try {
        await plansApi.remove({ planId });
        expanded.delete(planId);
        if (clean(selectedPlanId) === clean(planId)) selectedPlanId = '';
        await loadPlans();
      } catch (err) { alert(err?.message || 'Nao foi possivel excluir o plano.'); }
    }
  };

  const onDetailClick = async (ev) => {
    const btn = ev.target.closest('button[data-action]');
    if (!btn) return;
    const plan = plans.find((p) => clean(p.planId) === clean(selectedPlanId));
    if (!plan) return;
    if (btn.dataset.action === 'detail-confirm') {
      const sel = document.getElementById('plan-detail-pending-select');
      const parcelId = clean(sel?.value || '');
      const parcel = (Array.isArray(plan?.payment?.schedule) ? plan.payment.schedule : []).find((p) => clean(p.parcelId) === parcelId);
      if (parcel) openParcel(plan, parcel);
      return;
    }
    if (btn.dataset.action === 'detail-open-finance') {
      window.location.href = `gestao.html?secao=receitas&planId=${encodeURIComponent(plan.planId)}`;
      return;
    }
    if (btn.dataset.action === 'detail-generate-schedule') {
      try {
        await plansApi.update?.({ planId: plan.planId, patch: {} });
        await refreshPlan(plan.planId);
      } catch (err) {
        alert(err?.message || 'Nao foi possivel gerar parcelas.');
      }
    }
  };

  const getUserRole = (user) => String(user?.tipo || user?.role || '').trim().toLowerCase();
  const canAccessPlans = (user) => {
    if (!user) return false;
    const role = getUserRole(user);
    if (Boolean(user?.isClinicAdmin || user?.clinicAdmin)) return true;
    if (Boolean(user?.permissions?.admin || user?.permissions?.['finance.view'] || user?.permissions?.['plans.view'])) return true;
    return ['admin', 'administrativo', 'super_admin', 'recepcionista', 'recepcao', 'dentista'].includes(role);
  };

  const ensureAuth = async () => {
    try {
      const user = await authApi.currentUser?.();
      if (!user) { window.location.href = 'login.html'; return false; }
      if (!canAccessPlans(user)) { window.location.href = 'index.html'; return false; }
      return true;
    } catch (_) { window.location.href = 'login.html'; return false; }
  };

  openBtn?.addEventListener('click', () => openModalForm());
  closeBtn?.addEventListener('click', closeModalForm);
  cancelBtn?.addEventListener('click', closeModalForm);
  form?.addEventListener('submit', onSubmit);
  plansGrid?.addEventListener('click', onGridClick);
  planDetailContent?.addEventListener('click', onDetailClick);
  paymentCloseBtn?.addEventListener('click', closePayModal);
  paymentCancelBtn?.addEventListener('click', closePayModal);
  paymentForm?.addEventListener('submit', onPaySubmit);

  inputs.valor?.addEventListener('input', updateInstallmentValue);
  inputs.entradaValor?.addEventListener('input', updateInstallmentValue);
  inputs.valor?.addEventListener('blur', () => {
    normalizeDecimalInput(inputs.valor);
    formatMoneyInputBr(inputs.valor);
    updateInstallmentValue();
  });
  inputs.entradaValor?.addEventListener('blur', () => {
    normalizeDecimalInput(inputs.entradaValor);
    formatMoneyInputBr(inputs.entradaValor);
    updateInstallmentValue();
  });
  inputs.parcelas?.addEventListener('input', () => { updateInstallmentValue(); updateRulePreview(); });
  inputs.regra?.addEventListener('change', updateRulePreview);
  inputs.minParcelas?.addEventListener('input', updateRulePreview);
  [filterCategory, filterStatus].forEach((i) => i?.addEventListener('input', () => { renderPlans(); updateSummary(); }));
  filterSearch?.addEventListener('input', () => scheduleSearchRender());
  refreshPlansBtn?.addEventListener('click', async () => {
    if (refreshPlansBtn) {
      refreshPlansBtn.setAttribute('disabled', 'disabled');
      refreshPlansBtn.textContent = 'Atualizando...';
    }
    await loadPlans();
    if (refreshPlansBtn) {
      refreshPlansBtn.removeAttribute('disabled');
      refreshPlansBtn.textContent = 'Atualizar lista';
    }
  });
  filterSearch?.addEventListener('focus', () => openSearchSuggestions(filterSearch.value || ''));
  filterSearch?.addEventListener('click', () => openSearchSuggestions(filterSearch.value || ''));
  filterSearch?.addEventListener('input', () => openSearchSuggestions(filterSearch.value || ''));
  filterSearchSuggestions?.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.search-suggestion-item');
    if (!btn) return;
    applySearchTerm(clean(btn.dataset.value || ''), { selectPlan: true });
    closeSearchSuggestions();
  });
  document.addEventListener('click', (ev) => {
    if (ev.target === filterSearch) return;
    if (filterSearchSuggestions?.contains(ev.target)) return;
    closeSearchSuggestions();
  });

  modal?.addEventListener('click', (ev) => { if (ev.target === modal) closeModalForm(); });
  paymentModal?.addEventListener('click', (ev) => { if (ev.target === paymentModal) closePayModal(); });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && modal?.classList.contains('open')) closeModalForm();
    if (ev.key === 'Escape' && paymentModal?.classList.contains('open')) closePayModal();
  });
  window.addEventListener('finance-updated', () => { if (selectedPlanId) refreshPlan(selectedPlanId); });

  (async () => {
    const ok = await ensureAuth();
    if (!ok) return;
    if (servicesLoadHint) {
      servicesLoadHint.textContent = 'Campo livre opcional. A categoria do plano ja organiza o tipo de tratamento.';
      servicesLoadHint.style.color = '#64748b';
    }
    await loadPatients();
    updateInstallmentValue();
    updateRulePreview();
    await loadPlans();
  })();
});
