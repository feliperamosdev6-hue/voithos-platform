const state = {
  agendamentos: [],
  birthdays: [],
  campaignsDashboard: null,
  campaignLogs: [],
  plans: [],
  plansDashboard: null,
  planAttentionItems: [],
  planHistoryByPlan: new Map(),
  todayIso: '',
};

const appApi = window.appApi || {};
const agendaApi = appApi.agenda || {};
const birthdaysApi = appApi.birthdays || {};
const canSendBirthdayMessage = typeof birthdaysApi.sendBirthdayMessage === 'function';
const campaignsApi = appApi.campanhas || {};
const plansApi = appApi.plans || {};
const relationshipApi = appApi.relationship || {};

const birthdaysCount = document.getElementById('birthdays-count');
const birthdaysMeta = document.getElementById('birthdays-meta');
const birthdaysSummary = document.getElementById('birthdays-summary');
const birthdaysList = document.getElementById('birthdays-list');
const campaignsSentCount = document.getElementById('campaigns-sent-count');
const campaignsMeta = document.getElementById('campaigns-meta');
const campaignsSummary = document.getElementById('campaigns-summary');
const campaignsKpiSent = document.getElementById('campaigns-kpi-sent');
const campaignsKpiFailed = document.getElementById('campaigns-kpi-failed');
const campaignsKpiRate = document.getElementById('campaigns-kpi-rate');
const campaignsKpiLastSend = document.getElementById('campaigns-kpi-last-send');
const campaignsLogsBody = document.getElementById('campaigns-logs-body');
const plansOverdueCount = document.getElementById('plans-overdue-count');
const plansMeta = document.getElementById('plans-meta');
const plansSummary = document.getElementById('plans-summary');
const plansAttentionList = document.getElementById('plans-attention-list');
const faltasCount = document.getElementById('faltas-count');
const desmarcadosCount = document.getElementById('desmarcados-count');
const agendaOpenCount = document.getElementById('agenda-open-count');
const agendaOpenMeta = document.getElementById('agenda-open-meta');
const agendadosList = document.getElementById('agendados-list');
const faltasList = document.getElementById('faltas-list');
const desmarcadosList = document.getElementById('desmarcados-list');

const PLAN_MESSAGE_LOOKAHEAD_DAYS = 3;

const PLAN_EVENT_LABELS = {
  PLAN_INSTALLMENT_DUE_SOON: 'A vencer',
  PLAN_INSTALLMENT_DUE_TODAY: 'Vence hoje',
  PLAN_INSTALLMENT_OVERDUE: 'Vencida',
  PLAN_PAYMENT_CONFIRMED: 'Pagamento confirmado',
};

const PLAN_STATUS_LABELS = {
  CREATED: 'Criada',
  PENDING: 'Pendente',
  SENT: 'Enviada',
  FAILED: 'Falhou',
  BLOCKED: 'Bloqueada',
};

const toIso = (date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const parseDateOnly = (value) => {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
};

const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + Number(days || 0));
  return result;
};

const diffDays = (left, right) => {
  const a = parseDateOnly(left);
  const b = parseDateOnly(right);
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const ms = a.getTime() - b.getTime();
  return Math.round(ms / 86400000);
};

const clean = (value) => String(value || '').trim();
const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const toDigits = (value) => String(value || '').replace(/\D/g, '');

const formatDateBr = (value) => {
  const dt = parseDateOnly(value) || new Date(value);
  if (!dt || Number.isNaN(dt.getTime())) return '--';
  return dt.toLocaleDateString('pt-BR');
};

const formatDateTimeBr = (value) => {
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '--';
  return dt.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatCurrencyBr = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '--';
  return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const emptyBlock = (label) => `<div class="empty-card">${label}</div>`;

const getDispatchStatusClass = (value) => {
  const normalized = clean(value).toUpperCase();
  if (normalized === 'FAILED') return 'failed';
  if (normalized === 'BLOCKED') return 'blocked';
  if (normalized === 'PENDING' || normalized === 'PROCESSING' || normalized === 'CREATED') return 'pending';
  return 'sent';
};

const normalizeAppt = (appt) => ({
  id: clean(appt?.id),
  paciente: clean(appt?.paciente || appt?.pacienteNome) || 'Paciente',
  data: clean(appt?.data),
  horaInicio: clean(appt?.horaInicio),
  horaFim: clean(appt?.horaFim),
  status: clean(appt?.status) || 'em_aberto',
  desmarcado: Boolean(appt?.desmarcado),
  tipo: clean(appt?.tipo),
  dentista: clean(appt?.dentistaNome),
});

const buildAppointmentCard = (appt, actions = []) => {
  const meta = [
    appt.data ? `Data: ${appt.data}` : null,
    appt.horaInicio ? `Horario: ${appt.horaInicio}` : null,
    appt.tipo ? `Tipo: ${appt.tipo}` : null,
    appt.dentista ? `Dentista: ${appt.dentista}` : null,
  ].filter(Boolean).join(' • ');

  const actionsHtml = actions.length ? `<div class="appt-actions">${actions.join('')}</div>` : '';
  return `
    <article class="appt-card" data-id="${appt.id}">
      <div class="appt-card-top">
        <h4>${appt.paciente}</h4>
        <span class="status-pill ${appt.status === 'nao_compareceu' ? 'failed' : 'pending'}">${appt.status === 'nao_compareceu' ? 'Falta' : (appt.desmarcado ? 'Desmarcado' : 'Agendado')}</span>
      </div>
      <div class="appt-meta">${meta || 'Sem detalhes adicionais'}</div>
      ${actionsHtml}
    </article>
  `;
};

const buildBirthdayCard = (item) => {
  const patientId = clean(item?.patientId || item?.prontuario);
  const sentYear = item?.birthdaySentYear === true;
  const sentToday = item?.birthdaySentToday === true;
  const hasPhone = toDigits(item?.telefone).length >= 10;
  const blocked = item?.allowsMessages === false || !hasPhone;
  const phoneLabel = clean(item?.telefone) || 'Sem telefone valido';
  const actionLabel = sentYear ? 'Ja enviado' : (canSendBirthdayMessage ? 'Enviar parabens' : 'Disponivel no desktop');
  const actionDisabled = sentYear || blocked || !canSendBirthdayMessage;
  const reason = item?.allowsMessages === false
    ? 'Paciente optou por nao receber mensagens.'
    : (!hasPhone ? 'Telefone invalido para envio.' : (!canSendBirthdayMessage ? 'Envio de aniversario ainda indisponivel no webapp.' : ''));

  return `
    <article class="relationship-card">
      <div class="relationship-card-top">
        <div>
          <h4>${item?.nome || 'Paciente'}</h4>
          <div class="relationship-subtitle">${phoneLabel} • Nascimento ${formatDateBr(item?.dataNascimento)}</div>
        </div>
        <span class="status-pill ${sentYear ? 'sent' : 'pending'}">${sentToday ? 'Enviado hoje' : (sentYear ? 'Enviado este ano' : 'Pendente')}</span>
      </div>
      <div class="relationship-tags">
        <span class="tag-pill ${item?.hasAppointment ? 'info' : 'pending'}">${item?.hasAppointment ? 'Com consulta hoje' : 'Sem consulta hoje'}</span>
        ${blocked ? `<span class="tag-pill blocked">${reason}</span>` : ''}
      </div>
      <div class="relationship-actions">
        <button class="btn ${sentYear ? 'ghost' : 'primary'}" type="button" data-action="birthday-send" data-patient-id="${patientId}" ${actionDisabled ? 'disabled' : ''}>${actionLabel}</button>
        <a class="btn subtle" href="agendamentos.html">Abrir agenda</a>
      </div>
    </article>
  `;
};

const buildPlanAttentionItems = (plans = []) => {
  const todayIso = state.todayIso;
  return (Array.isArray(plans) ? plans : []).flatMap((plan) => {
    const schedule = Array.isArray(plan?.payment?.schedule) ? plan.payment.schedule : [];
    return schedule.map((parcel) => {
      const status = clean(parcel?.status).toUpperCase();
      const dueDate = clean(parcel?.dueDate);
      const remainingAmount = num(parcel?.remainingAmount, num(parcel?.value, 0));
      if (!dueDate || remainingAmount <= 0 || status === 'PAID' || status === 'CANCELLED') return null;

      let eventType = '';
      if (status === 'OVERDUE' || diffDays(dueDate, todayIso) < 0) {
        eventType = 'PLAN_INSTALLMENT_OVERDUE';
      } else if (diffDays(dueDate, todayIso) === 0) {
        eventType = 'PLAN_INSTALLMENT_DUE_TODAY';
      } else if (diffDays(dueDate, todayIso) <= PLAN_MESSAGE_LOOKAHEAD_DAYS) {
        eventType = 'PLAN_INSTALLMENT_DUE_SOON';
      }
      if (!eventType) return null;

      return {
        planId: clean(plan?.planId || plan?.id),
        planTitle: clean(plan?.title) || 'Plano',
        patientName: clean(plan?.patientName) || 'Paciente',
        patientId: clean(plan?.patientId || plan?.prontuario),
        installmentId: clean(parcel?.parcelId || parcel?.id),
        installmentSequence: num(parcel?.number, 0) || num(parcel?.sequence, 0) || 1,
        installmentsCount: Math.max(1, num(plan?.installmentsCount, schedule.length || 1)),
        dueDate,
        amount: num(parcel?.value, 0),
        remainingAmount,
        eventType,
        rawStatus: status,
      };
    }).filter(Boolean);
  }).sort((left, right) => {
    const priority = {
      PLAN_INSTALLMENT_OVERDUE: 0,
      PLAN_INSTALLMENT_DUE_TODAY: 1,
      PLAN_INSTALLMENT_DUE_SOON: 2,
    };
    const leftPriority = priority[left.eventType] ?? 99;
    const rightPriority = priority[right.eventType] ?? 99;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    return clean(left.dueDate).localeCompare(clean(right.dueDate));
  }).slice(0, 10);
};

const getPlanHistoryItems = (planId) => {
  const payload = state.planHistoryByPlan.get(clean(planId));
  return Array.isArray(payload?.items) ? payload.items : [];
};

const getLatestPlanHistory = (item) => {
  return getPlanHistoryItems(item.planId)
    .filter((historyItem) => clean(historyItem?.installmentId) === clean(item.installmentId))
    .sort((left, right) => new Date(right.lastAttemptAt || right.createdAt || 0).getTime() - new Date(left.lastAttemptAt || left.createdAt || 0).getTime())[0] || null;
};

const buildPlanCard = (item) => {
  const latest = item?.latestHistory || getLatestPlanHistory(item);
  const sameEvent = clean(latest?.eventType) === clean(item.eventType);
  const statusClass = latest ? getDispatchStatusClass(latest.status) : 'pending';
  const statusLabel = latest
    ? `${PLAN_STATUS_LABELS[clean(latest.status).toUpperCase()] || clean(latest.status) || 'Pendente'}${latest.sentAt ? ` • ${formatDateTimeBr(latest.sentAt)}` : ''}`
    : 'Ainda nao notificado';
  const reason = clean(latest?.lastError);

  return `
    <article class="relationship-card">
      <div class="relationship-card-top">
        <div>
          <h4>${item.patientName}</h4>
          <div class="relationship-subtitle">${item.planTitle} • Parcela ${item.installmentSequence}/${item.installmentsCount}</div>
        </div>
        <span class="status-pill ${statusClass}">${PLAN_EVENT_LABELS[item.eventType] || 'Mensagem'}</span>
      </div>
      <div class="relationship-metrics">
        <div class="metric-tile"><span>Vencimento</span><strong>${formatDateBr(item.dueDate)}</strong></div>
        <div class="metric-tile"><span>Valor pendente</span><strong>${formatCurrencyBr(item.remainingAmount)}</strong></div>
        <div class="metric-tile"><span>Ultimo envio</span><strong>${statusLabel}</strong></div>
        <div class="metric-tile"><span>Historico</span><strong>${latest ? `Tentativas ${num(latest.attemptCount, 0)}` : 'Sem historico'}</strong></div>
      </div>
      ${reason ? `<div class="relationship-subtitle">Motivo: ${reason}</div>` : ''}
      <div class="relationship-actions">
        ${sameEvent && latest ? `<button class="btn ghost" type="button" data-action="plan-message-resend" data-plan-id="${item.planId}" data-plan-message-id="${clean(latest.id)}">Reenviar</button>` : `<button class="btn primary" type="button" data-action="plan-message-send" data-plan-id="${item.planId}" data-parcel-id="${item.installmentId}" data-event-type="${item.eventType}">Enviar lembrete</button>`}
        <a class="btn subtle" href="planos.html?planId=${encodeURIComponent(item.planId)}">Abrir plano</a>
      </div>
    </article>
  `;
};

const renderSummary = () => {
  const birthdays = Array.isArray(state.birthdays) ? state.birthdays : [];
  const birthdayPending = birthdays.filter((item) => item?.birthdaySentYear !== true).length;
  const birthdaySent = birthdays.filter((item) => item?.birthdaySentYear === true).length;
  const campaignDashboard = state.campaignsDashboard || {};
  const plansDashboard = state.plansDashboard || {};
  const faltas = state.agendamentos.filter((item) => item.status === 'nao_compareceu');
  const desmarcados = state.agendamentos.filter((item) => item.desmarcado);
  const agendados = state.agendamentos.filter((item) => !item.desmarcado && ['em_aberto', 'confirmado'].includes(item.status));

  if (birthdaysCount) birthdaysCount.textContent = String(birthdays.length);
  if (birthdaysMeta) birthdaysMeta.textContent = birthdays.length
    ? `${birthdayPending} pendentes • ${birthdaySent} enviados no ano`
    : 'Nenhum aniversariante na data atual';

  if (campaignsSentCount) campaignsSentCount.textContent = String(num(campaignDashboard.sentToday, 0));
  if (campaignsMeta) campaignsMeta.textContent = `${num(campaignDashboard.failedToday, 0)} falhas • entrega ${campaignDashboard.deliveryRateToday == null ? '--' : `${Math.round(num(campaignDashboard.deliveryRateToday, 0) * 100)}%`}`;

  if (plansOverdueCount) plansOverdueCount.textContent = String(state.planAttentionItems.filter((item) => item.eventType === 'PLAN_INSTALLMENT_OVERDUE').length);
  if (plansMeta) plansMeta.textContent = `${state.planAttentionItems.length} parcelas com acao • aberto ${formatCurrencyBr(plansDashboard.totalOpenAmount || 0)}`;

  if (faltasCount) faltasCount.textContent = String(faltas.length);
  if (desmarcadosCount) desmarcadosCount.textContent = String(desmarcados.length);
  if (agendaOpenCount) agendaOpenCount.textContent = String(agendados.length);
  if (agendaOpenMeta) agendaOpenMeta.textContent = `${faltas.length} faltas • ${desmarcados.length} desmarcados nos ultimos 30 dias`;
};

const renderBirthdays = () => {
  const birthdays = Array.isArray(state.birthdays) ? state.birthdays : [];
  if (birthdaysSummary) {
    birthdaysSummary.textContent = birthdays.length
      ? `${birthdays.filter((item) => item?.birthdaySentYear !== true).length} pendentes • ${birthdays.filter((item) => item?.hasAppointment).length} com consulta hoje`
      : 'Nenhum aniversariante na data atual.';
  }
  if (!birthdaysList) return;
  birthdaysList.innerHTML = birthdays.length
    ? birthdays.map((item) => buildBirthdayCard(item)).join('')
    : emptyBlock('Nenhum aniversariante na data atual.');
};

const renderCampaigns = () => {
  const dashboard = state.campaignsDashboard || {};
  if (campaignsKpiSent) campaignsKpiSent.textContent = String(num(dashboard.sentToday, 0));
  if (campaignsKpiFailed) campaignsKpiFailed.textContent = String(num(dashboard.failedToday, 0));
  if (campaignsKpiRate) campaignsKpiRate.textContent = dashboard.deliveryRateToday == null ? '--' : `${Math.round(num(dashboard.deliveryRateToday, 0) * 100)}%`;
  if (campaignsKpiLastSend) campaignsKpiLastSend.textContent = dashboard.lastSendAt ? formatDateTimeBr(dashboard.lastSendAt) : '--';
  if (campaignsSummary) campaignsSummary.textContent = dashboard.nextEligibleSend?.inicio
    ? `Proximo elegivel: ${dashboard.nextEligibleSend.nome || 'Campanha'} • ${formatDateTimeBr(dashboard.nextEligibleSend.inicio)}`
    : 'Historico central de disparos do dia atual.';

  if (!campaignsLogsBody) return;
  const items = Array.isArray(state.campaignLogs) ? state.campaignLogs : [];
  campaignsLogsBody.innerHTML = items.length
    ? items.map((item) => `
      <tr>
        <td>${formatDateTimeBr(item.createdAt)}</td>
        <td>${item.campaignName || '--'}</td>
        <td>${item.patientName || '--'}</td>
        <td><span class="status-pill ${getDispatchStatusClass(item.status)}">${clean(item.status) || '--'}</span></td>
        <td>${clean(item.errorMessage) || '--'}</td>
      </tr>
    `).join('')
    : '<tr><td colspan="5" class="logs-empty">Sem disparos registrados hoje.</td></tr>';
};

const renderPlans = () => {
  const plansDashboard = state.plansDashboard || {};
  if (plansSummary) {
    plansSummary.textContent = state.planAttentionItems.length
      ? `${state.planAttentionItems.filter((item) => item.eventType === 'PLAN_INSTALLMENT_OVERDUE').length} vencidas • ${state.planAttentionItems.filter((item) => item.eventType === 'PLAN_INSTALLMENT_DUE_TODAY').length} vencem hoje • aberto ${formatCurrencyBr(plansDashboard.totalOpenAmount || 0)}`
      : `Sem parcelas a vencer ou vencidas nos proximos ${PLAN_MESSAGE_LOOKAHEAD_DAYS} dias.`;
  }
  if (!plansAttentionList) return;
  plansAttentionList.innerHTML = state.planAttentionItems.length
    ? state.planAttentionItems.map((item) => buildPlanCard(item)).join('')
    : emptyBlock(`Nenhuma parcela com acao em ate ${PLAN_MESSAGE_LOOKAHEAD_DAYS} dias.`);
};

const renderAgenda = () => {
  const faltas = state.agendamentos.filter((item) => item.status === 'nao_compareceu');
  const desmarcados = state.agendamentos.filter((item) => item.desmarcado);
  const agendados = state.agendamentos.filter((item) => !item.desmarcado && ['em_aberto', 'confirmado'].includes(item.status));

  if (agendadosList) {
    agendadosList.innerHTML = agendados.length
      ? agendados.map((appt) => buildAppointmentCard(appt, [
        '<button class="btn danger" type="button" data-action="falta">Marcar falta</button>',
        '<button class="btn ghost" type="button" data-action="desmarcado">Desmarcou</button>',
      ])).join('')
      : emptyBlock('Sem agendamentos recentes para recuperar.');
  }

  if (faltasList) {
    faltasList.innerHTML = faltas.length
      ? faltas.map((appt) => buildAppointmentCard(appt, [
        '<button class="btn primary" type="button" data-action="reagendar">Reagendado</button>',
      ])).join('')
      : emptyBlock('Nenhuma falta registrada.');
  }

  if (desmarcadosList) {
    desmarcadosList.innerHTML = desmarcados.length
      ? desmarcados.map((appt) => buildAppointmentCard(appt, [
        '<button class="btn primary" type="button" data-action="retomar">Reagendar</button>',
      ])).join('')
      : emptyBlock('Nenhum desmarcado registrado.');
  }
};

const renderAll = () => {
  renderSummary();
  renderBirthdays();
  renderCampaigns();
  renderPlans();
  renderAgenda();
};

const hydrateFromRelationshipOverview = (overview = {}) => {
  const birthdays = overview?.birthdays || {};
  const campaigns = overview?.campaigns || {};
  const plans = overview?.plans || {};

  state.birthdays = Array.isArray(birthdays?.items)
    ? birthdays.items.map((item) => ({
      patientId: clean(item?.patientId),
      prontuario: clean(item?.patientId),
      nome: item?.patientName || 'Paciente',
      telefone: item?.phone || '',
      dataNascimento: item?.birthDate || '',
      allowsMessages: item?.allowsMessages !== false,
      hasAppointment: item?.hasAppointment === true,
      birthdaySentYear: item?.birthdaySentYear === true,
      birthdaySentToday: item?.birthdaySentToday === true,
    }))
    : [];
  state.campaignsDashboard = campaigns?.dashboard || {};
  state.campaignLogs = Array.isArray(campaigns?.logs) ? campaigns.logs : [];
  state.plansDashboard = plans?.dashboard || {};
  state.planAttentionItems = Array.isArray(plans?.attention) ? plans.attention : [];
};

const loadAgendamentos = async () => {
  const today = new Date();
  const start = addDays(today, -30);
  const end = addDays(today, 30);
  try {
    const data = await agendaApi.getRange?.({ start: toIso(start), end: toIso(end) });
    const list = Array.isArray(data) ? data.map(normalizeAppt) : [];
    state.agendamentos = list.filter((item) => item.id);
  } catch (_error) {
    state.agendamentos = [];
  }
};

const loadBirthdays = async () => {
  try {
    const payload = await birthdaysApi.listToday?.({ date: state.todayIso });
    state.birthdays = Array.isArray(payload?.items) ? payload.items : [];
  } catch (_error) {
    state.birthdays = [];
  }
};

const loadCampaigns = async () => {
  const today = state.todayIso;
  try {
    const [dashboard, logs] = await Promise.all([
      campaignsApi.dashboard?.(),
      campaignsApi.logsList?.({ dateFrom: today, dateTo: today, page: 1, limit: 12 }),
    ]);
    state.campaignsDashboard = dashboard || {};
    state.campaignLogs = Array.isArray(logs?.items) ? logs.items : [];
  } catch (_error) {
    state.campaignsDashboard = {};
    state.campaignLogs = [];
  }
};

const loadPlanHistoriesForAttentionItems = async () => {
  state.planHistoryByPlan = new Map();
  if (typeof plansApi.messageHistory !== 'function') return;
  const planIds = [...new Set(state.planAttentionItems.map((item) => clean(item.planId)).filter(Boolean))].slice(0, 8);
  const histories = await Promise.all(planIds.map(async (planId) => {
    try {
      const history = await plansApi.messageHistory({ planId });
      return [planId, history || { items: [] }];
    } catch (_error) {
      return [planId, { items: [] }];
    }
  }));
  histories.forEach(([planId, payload]) => {
    state.planHistoryByPlan.set(planId, payload || { items: [] });
  });
};

const loadRelationshipOverview = async () => {
  if (typeof relationshipApi.getOverview !== 'function') return false;
  try {
    const overview = await relationshipApi.getOverview({
      date: state.todayIso,
      dueSoonDays: PLAN_MESSAGE_LOOKAHEAD_DAYS,
    });
    if (!overview || overview.source !== 'central') return false;
    hydrateFromRelationshipOverview(overview);
    return true;
  } catch (_error) {
    return false;
  }
};

const loadPlans = async () => {
  try {
    const [plans, dashboard] = await Promise.all([
      plansApi.list?.({}),
      plansApi.dashboard?.(),
    ]);
    state.plans = Array.isArray(plans) ? plans : [];
    state.plansDashboard = dashboard || {};
    state.planAttentionItems = buildPlanAttentionItems(state.plans);
    await loadPlanHistoriesForAttentionItems();
  } catch (_error) {
    state.plans = [];
    state.plansDashboard = {};
    state.planAttentionItems = [];
    state.planHistoryByPlan = new Map();
  }
};

const refreshRelationshipData = async () => {
  const loadedFromOverview = await loadRelationshipOverview();
  if (loadedFromOverview) {
    await loadAgendamentos();
  } else {
    await Promise.all([
      loadBirthdays(),
      loadCampaigns(),
      loadPlans(),
      loadAgendamentos(),
    ]);
  }
  renderAll();
};

const updateAppointment = async (id, changes) => {
  if (!id) return;
  try {
    await agendaApi.update?.(id, changes);
    await loadAgendamentos();
    renderSummary();
    renderAgenda();
  } catch (_error) {
    alert('Nao foi possivel atualizar o agendamento.');
  }
};

const sendBirthdayMessage = async (patientId) => {
  if (!patientId || typeof birthdaysApi.sendBirthdayMessage !== 'function') {
    alert('Envio de aniversario indisponivel.');
    return;
  }
  try {
    await birthdaysApi.sendBirthdayMessage({ patientId });
    await loadBirthdays();
    renderSummary();
    renderBirthdays();
    alert('Mensagem de aniversario enviada com sucesso.');
  } catch (error) {
    alert(error?.message || 'Nao foi possivel enviar a mensagem de aniversario.');
  }
};

const sendPlanMessage = async ({ planId, installmentId, eventType }) => {
  if (!planId || !installmentId || !eventType || typeof plansApi.sendMessage !== 'function') {
    alert('Mensageria de planos indisponivel.');
    return;
  }
  try {
    const result = await plansApi.sendMessage({ planId, installmentId, eventType });
    await loadPlans();
    renderSummary();
    renderPlans();
    if (result?.blocked) {
      alert(result?.reason || 'Este envio ja possui um evento equivalente registrado.');
    } else {
      alert('Mensagem do plano enviada com sucesso.');
    }
  } catch (error) {
    alert(error?.message || 'Nao foi possivel enviar a mensagem do plano.');
  }
};

const resendPlanMessage = async ({ planId, planMessageId }) => {
  if (!planId || !planMessageId || typeof plansApi.resendMessage !== 'function') {
    alert('Reenvio de mensageria de planos indisponivel.');
    return;
  }
  try {
    await plansApi.resendMessage({ planMessageId });
    await loadPlans();
    renderSummary();
    renderPlans();
    alert('Mensagem do plano reenviada com sucesso.');
  } catch (error) {
    alert(error?.message || 'Nao foi possivel reenviar a mensagem do plano.');
  }
};

const scrollToTarget = (targetId) => {
  const target = targetId ? document.getElementById(targetId) : null;
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const setupActions = () => {
  document.addEventListener('click', async (event) => {
    const target = event.target;
    const button = target instanceof HTMLElement ? target.closest('[data-action], [data-target]') : null;
    if (!button) return;

    const scrollTarget = button.getAttribute('data-target');
    if (scrollTarget) {
      scrollToTarget(scrollTarget);
      return;
    }

    const action = clean(button.getAttribute('data-action'));
    if (!action) return;

    if (action === 'birthday-send') {
      await sendBirthdayMessage(clean(button.getAttribute('data-patient-id')));
      return;
    }

    if (action === 'plan-message-send') {
      await sendPlanMessage({
        planId: clean(button.getAttribute('data-plan-id')),
        installmentId: clean(button.getAttribute('data-parcel-id')),
        eventType: clean(button.getAttribute('data-event-type')),
      });
      return;
    }

    if (action === 'plan-message-resend') {
      await resendPlanMessage({
        planId: clean(button.getAttribute('data-plan-id')),
        planMessageId: clean(button.getAttribute('data-plan-message-id')),
      });
      return;
    }

    const card = button.closest('.appt-card');
    const appointmentId = clean(card?.dataset?.id);
    if (!appointmentId) return;

    if (action === 'falta') {
      updateAppointment(appointmentId, { status: 'nao_compareceu', desmarcado: false });
    } else if (action === 'desmarcado') {
      updateAppointment(appointmentId, { desmarcado: true });
    } else if (action === 'reagendar') {
      updateAppointment(appointmentId, { status: 'confirmado', desmarcado: false });
    } else if (action === 'retomar') {
      updateAppointment(appointmentId, { desmarcado: false, status: 'em_aberto' });
    }
  });
};

const init = async () => {
  state.todayIso = toIso(new Date());
  setupActions();
  await refreshRelationshipData();
};

init();
