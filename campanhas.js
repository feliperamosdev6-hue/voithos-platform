const normalizeCampaign = (camp = {}) => ({
  ...camp,
  nome: camp.nome || 'Campanha',
  periodo: camp.periodo || '',
  cor: camp.cor || '#2a9d8f',
  descricao: camp.descricao || '',
  status: (() => {
    const raw = String(camp.status || '').trim().toLowerCase();
    if (raw === 'rascunho') return 'rascunho';
    if (raw === 'agendada') return 'agendada';
    if (raw === 'pausada') return 'pausada';
    if (raw === 'concluida' || raw === 'concluída') return 'concluida';
    if (raw === 'inativa') return 'inativa';
    return 'ativa';
  })(),
  origem: camp.origem || 'clinica',
  somenteLeitura: camp.origem === 'voithos',
  publico: camp.publico || 'pacientes_clinica',
  publicoLabel: camp.publicoLabel || 'Pacientes da clinica',
  segmentKey: String(camp.segmentKey || camp.segmento || 'all_active').trim().toLowerCase(),
  audienceFilters: camp.audienceFilters || camp.filters || {},
});

const emitCampaignsUpdated = (source = 'campanhas') => {
  const clinicId = String(window.__VOITHOS_ACTIVE_CLINIC_ID__ || '').trim();
  const storageKey = clinicId ? `voithos-campaigns-updated:${clinicId}` : 'voithos-campaigns-updated';
  try {
    window.dispatchEvent(new CustomEvent('campaigns-updated', { detail: { source } }));
    localStorage.setItem(storageKey, JSON.stringify({ at: Date.now(), source, clinicId }));
  } catch (_) {
  }
};


let canManage = false;
let canOperateCampaigns = false;
const CAMPAIGN_MANAGE_ROLES = new Set(['admin', 'administrativo', 'super_admin', 'recepcionista', 'recepcao']);
const CAMPAIGN_OPERATE_ROLES = new Set([...CAMPAIGN_MANAGE_ROLES, 'dentista']);
const SEGMENT_LABELS = {
  all_active: 'Todos pacientes ativos',
  inactive_90: 'Inativos ha 90 dias',
  inactive_180: 'Inativos ha 180 dias',
  never_cleaning: 'Nunca fizeram limpeza',
  birthday_month: 'Aniversariantes do mes',
  appointment_window: 'Janela de agenda',
  missed_followup: 'Faltou e nao reagendou',
  with_plan: 'Pacientes com plano ativo',
  financial_pending: 'Financeiro pendente',
  plan_overdue: 'Pacientes com plano em atraso',
};

const OPPORTUNITY_SEGMENTS = [
  { key: 'plan_overdue', source: 'plano', priority: 'alta', title: 'Plano ou parcela em atraso' },
  { key: 'financial_pending', source: 'financeiro', priority: 'alta', title: 'Cobranca vencida' },
  { key: 'missed_followup', source: 'agenda', priority: 'alta', title: 'Faltou e nao reagendou' },
  { key: 'inactive_180', source: 'agenda', priority: 'media', title: 'Sem retorno ha 180 dias' },
  { key: 'inactive_90', source: 'agenda', priority: 'media', title: 'Sem retorno ha 90 dias' },
  { key: 'never_cleaning', source: 'prontuario', priority: 'media', title: 'Sem limpeza registrada' },
];

const TEMPLATE_FLOW_FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'selected', label: 'Selecionados' },
  { key: 'inactive', label: 'Inativos' },
  { key: 'missed', label: 'Faltou' },
  { key: 'withoutCleaning', label: 'Sem limpeza' },
  { key: 'blocked', label: 'Bloqueados' },
];

const formatDateTimeBr = (value) => {
  if (!value) return '--';
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

const formatHourBr = (value) => {
  if (!value) return '--';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '--';
  return dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const formatPercent = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '--';
  return `${Math.round(Number(value) * 100)}%`;
};

const getDispatchStatusClass = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'failed') return 'failed';
  if (normalized === 'blocked') return 'blocked';
  if (normalized === 'pending' || normalized === 'processing') return 'pending';
  return 'sent';
};

const formatCurrencyBr = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '--';
  return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const FALLBACK_ANNUAL_TEMPLATES = [
  { month: 1, id: 'annual-janeiro-sorriso-ano-novo', title: 'Sorriso do Ano Novo', description: 'Renovacao estetica no inicio do ano.', category: 'AESTHETICS', estimatedConversionImpact: 'HIGH', color: '#0ea5e9', segmentKey: 'inactive_180', messages: { standard: 'Ola, {NOME_PACIENTE}! 😊\n\nO inicio do ano e o momento perfeito para cuidar do seu sorriso.\n\nAqui na {NOME_CLINICA}, estamos com uma condicao especial para avaliacao e clareamento dental.\n\nSe quiser saber mais ou agendar uma avaliacao, e so me chamar por aqui.' } },
  { month: 2, id: 'annual-fevereiro-pos-carnaval', title: 'Seu sorriso apos o Carnaval', description: 'Profilaxia e limpeza preventiva.', category: 'PREVENTION', estimatedConversionImpact: 'HIGH', color: '#22c55e', segmentKey: 'all_active', messages: { standard: 'Ola, {NOME_PACIENTE}!\n\nApos o periodo de festas, e sempre importante realizar uma limpeza e avaliacao preventiva.\n\nEstamos com agenda aberta para profilaxia e check-up.\n\nSe desejar, posso verificar um horario para voce.' } },
  { month: 3, id: 'annual-marco-checkup-preventivo', title: 'Check-up Preventivo', description: 'Avaliacao preventiva mensal.', category: 'PREVENTION', estimatedConversionImpact: 'HIGH', color: '#14b8a6', segmentKey: 'inactive_90', messages: { standard: 'Ola, {NOME_PACIENTE}! Estamos com agenda aberta para check-up preventivo na {NOME_CLINICA}.' } },
  { month: 4, id: 'annual-abril-saude-gengival', title: 'Saude da gengiva e prevencao', description: 'Prevencao e cuidado gengival.', category: 'PREVENTION', estimatedConversionImpact: 'HIGH', color: '#0f766e', segmentKey: 'never_cleaning', messages: { standard: 'Ola, {NOME_PACIENTE}! Abril e um excelente momento para avaliar saude gengival e prevencao.' } },
  { month: 5, id: 'annual-maio-cuidado-especial', title: 'Cuidado especial com o sorriso', description: 'Campanha estetica de maio.', category: 'AESTHETICS', estimatedConversionImpact: 'MEDIUM', color: '#ec4899', segmentKey: 'all_active', messages: { standard: 'Ola, {NOME_PACIENTE}! Maio e um bom momento para investir no cuidado do sorriso.' } },
  { month: 6, id: 'annual-junho-sorriso-destaque', title: 'Seu sorriso em destaque', description: 'Estetica para junho.', category: 'AESTHETICS', estimatedConversionImpact: 'HIGH', color: '#f43f5e', segmentKey: 'inactive_180', messages: { standard: 'Ola, {NOME_PACIENTE}! Junho e ideal para dar destaque ao seu sorriso com planejamento estetico.' } },
  { month: 7, id: 'annual-julho-avaliacao-ferias', title: 'Avaliacao nas ferias', description: 'Revisao ortodontica e avaliacao.', category: 'ORTHODONTICS', estimatedConversionImpact: 'HIGH', color: '#6366f1', segmentKey: 'inactive_90', messages: { standard: 'Ola, {NOME_PACIENTE}! Nas ferias, aproveite para colocar sua avaliacao odontologica em dia.' } },
  { month: 8, id: 'annual-agosto-checkup', title: 'Check-up preventivo', description: 'Acao preventiva de agosto.', category: 'PREVENTION', estimatedConversionImpact: 'MEDIUM', color: '#0f172a', segmentKey: 'all_active', messages: { standard: 'Ola, {NOME_PACIENTE}! Agosto e um bom mes para seu check-up preventivo.' } },
  { month: 9, id: 'annual-setembro-primavera', title: 'Primavera do sorriso', description: 'Renovacao estetica na primavera.', category: 'AESTHETICS', estimatedConversionImpact: 'HIGH', color: '#84cc16', segmentKey: 'inactive_180', messages: { standard: 'Ola, {NOME_PACIENTE}! Que tal aproveitar a primavera para renovar seu sorriso?' } },
  { month: 10, id: 'annual-outubro-cuidado-prevencao', title: 'Cuidado e prevencao com sua saude', description: 'Abordagem preventiva respeitosa.', category: 'PREVENTION', estimatedConversionImpact: 'MEDIUM', color: '#f97316', segmentKey: 'inactive_180', messages: { standard: 'Ola, {NOME_PACIENTE}!\n\nA prevencao e sempre o melhor caminho para cuidar da saude.\n\nEsse e um bom momento para realizar sua avaliacao odontologica e garantir que esta tudo bem.\n\nSe desejar, posso verificar um horario para voce.' } },
  { month: 11, id: 'annual-novembro-avaliacao-preventiva', title: 'Avaliacao preventiva e cuidado com sua saude', description: 'Prevencao e bem-estar em novembro.', category: 'PREVENTION', estimatedConversionImpact: 'MEDIUM', color: '#1d4ed8', segmentKey: 'inactive_90', messages: { standard: 'Ola, {NOME_PACIENTE}!\n\nManter sua saude bucal em dia faz toda a diferenca no seu bem-estar.\n\nEstamos com agenda aberta para avaliacoes preventivas.\n\nSe desejar, posso verificar um horario para voce.' } },
  { month: 12, id: 'annual-dezembro-sorriso-fim-ano', title: 'Seu sorriso para o fim do ano', description: 'Preparacao para eventos e festas.', category: 'AESTHETICS', estimatedConversionImpact: 'HIGH', color: '#0f766e', segmentKey: 'inactive_180', messages: { standard: 'Ola, {NOME_PACIENTE}! Prepare seu sorriso para o fim do ano com uma avaliacao na {NOME_CLINICA}.' } },
];

const validateGlobalsPayload = (list) => {
  if (!Array.isArray(list)) return 'O JSON deve ser uma lista de campanhas.';
  const errors = [];
  list.forEach((camp, idx) => {
    if (!camp || typeof camp !== 'object') {
      errors.push(`#${idx + 1}: item invalido`);
      return;
    }
    const nome = camp.nome || camp.titulo;
    if (!nome) {
      errors.push(`#${idx + 1}: nome/titulo obrigatorio`);
    }
  });
  return errors.length ? `Campanhas globais invalidas: ${errors.join('; ')}` : '';
};

const formatPeriodo = (valor) => {
  if (!valor) return '--';
  const [ano, mes] = valor.split('-');
  if (!ano || !mes) return valor;
  return `${mes}/${ano}`;
};

const getTodayValues = () => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return {
    date: `${yyyy}-${mm}-${dd}`,
    month: `${yyyy}-${mm}`,
  };
};

const getPriorityRank = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'high' || normalized === 'alta') return 3;
  if (normalized === 'medium' || normalized === 'media') return 2;
  return 1;
};

const createCard = (camp, audienceStats = null) => {
  const card = document.createElement('div');
  card.className = 'campanha-card campanha-clickable';
  if (camp.id) card.dataset.id = camp.id;

  const info = document.createElement('div');
  info.className = 'campanha-info';
  const metadataTemplate = camp?.metadata?.template || {};
  const priority = String(metadataTemplate.priority || camp.templatePriority || 'MEDIUM').trim().toUpperCase();
  const objective = String(
    metadataTemplate.objective
    || camp.templateObjective
    || camp.descricao
    || 'Campanha sugerida para contato manual.'
  ).trim();
  const eligibleLabel = audienceStats
    ? `${Number(audienceStats.eligibleCount || 0)} pacientes elegiveis`
    : 'Pacientes elegiveis em revisao';

  info.innerHTML = `
    <div class="campanha-title-row">
      <h4>${camp.nome || 'Campanha'}</h4>
      <span class="priority-pill priority-${escapeHtml(String(priority).toLowerCase())}">${escapeHtml(priority)}</span>
    </div>
    <p>${escapeHtml(objective)}</p>
    <div class="campanha-extra">
      <span><strong>Segmento:</strong> ${SEGMENT_LABELS[camp.segmentKey] || SEGMENT_LABELS.all_active}</span>
      <span><strong>Status:</strong> ${camp.status || 'ativa'}</span>
      <span><strong>Sugeridos:</strong> ${eligibleLabel}</span>
    </div>
  `;

  const meta = document.createElement('div');
  meta.className = 'campanha-meta';

  const tagPeriodo = document.createElement('div');
  tagPeriodo.className = 'tag';
  tagPeriodo.innerHTML = `<span class="color-dot" style="background:${camp.cor || '#2a9d8f'}"></span> ${formatPeriodo(camp.periodo)}`;

  const tagPublico = document.createElement('div');
  tagPublico.className = 'tag';
  tagPublico.textContent = camp.publicoLabel || 'Pacientes da clinica';

  meta.appendChild(tagPeriodo);
  meta.appendChild(tagPublico);

  const viewButton = document.createElement('button');
  viewButton.className = 'btn-small ghost';
  viewButton.type = 'button';
  viewButton.textContent = 'Ver pacientes';
  viewButton.setAttribute('data-action', 'view-patients');
  viewButton.setAttribute('data-id', camp.id || '');
  meta.appendChild(viewButton);

  card.appendChild(info);
  card.appendChild(meta);

  if (canManage && !camp.somenteLeitura && !card.querySelector('.campanha-actions')) {
    const actions = document.createElement('div');
    actions.className = 'campanha-actions';
    const btnExcluir = document.createElement('button');
    btnExcluir.className = 'btn-small danger';
    btnExcluir.type = 'button';
    btnExcluir.textContent = 'Excluir';
    btnExcluir.setAttribute('data-action', 'delete');
    btnExcluir.setAttribute('data-id', camp.id || '');
    actions.appendChild(btnExcluir);
    card.appendChild(actions);
  }
  return card;
};

document.addEventListener('DOMContentLoaded', () => {
  const appApi = window.appApi || {};
  const authApi = appApi.auth || {};
  const campanhasApi = appApi.campanhas || {};
  const campanhasGlobalApi = appApi.campanhasGlobal || {};
  const clinicApi = appApi.clinic || {};
  const patientsApi = appApi.patients || {};
  const whatsappApi = appApi.whatsapp || {};
  const listEl = document.getElementById('campanhas-list');
  const templatesPanel = document.getElementById('templates-panel');
  const monthlyTemplateCard = document.getElementById('monthly-template-card');
  const monthlyTemplateTitle = document.getElementById('monthly-template-title');
  const monthlyTemplateDesc = document.getElementById('monthly-template-desc');
  const monthlyTemplateCta = document.getElementById('monthly-template-cta');
  const activateMonthlyTemplateBtn = document.getElementById('btn-activate-monthly-template');
  const quickTemplatesGrid = document.getElementById('quick-templates-grid');
  const kpiSentToday = document.getElementById('kpi-sent-today');
  const kpiFailedToday = document.getElementById('kpi-failed-today');
  const kpiDeliveryRate = document.getElementById('kpi-delivery-rate');
  const kpiLastSend = document.getElementById('kpi-last-send');
  const kpiNextSend = document.getElementById('kpi-next-send');
  const openLogsTodayBtn = document.getElementById('btn-logs-hoje');
  const openStrategyVideoBtn = document.getElementById('btn-open-strategy-video');
  const modal = document.getElementById('campanha-modal');
  const openBtn = document.getElementById('btn-nova-campanha');
  const openGlobalsBtn = document.getElementById('btn-globais');
  const closeBtn = document.getElementById('close-modal');
  const cancelBtn = document.getElementById('cancelar-modal');
  const form = document.getElementById('campanha-form');
  const inputNome = document.getElementById('camp-nome');
  const inputPeriodo = document.getElementById('camp-periodo');
  const inputCor = document.getElementById('camp-cor');
  const inputDescricao = document.getElementById('camp-descricao');
  const inputInicio = document.getElementById('camp-inicio');
  const inputFim = document.getElementById('camp-fim');
  const selectCanal = document.getElementById('camp-canal');
  const selectStatus = document.getElementById('camp-status');
  const selectPublico = document.getElementById('camp-publico');
  const selectSegmento = document.getElementById('camp-segmento');
  const segmentPreview = document.getElementById('segment-preview');
  const campaignPatientSearch = document.getElementById('camp-patient-search');
  const campaignPatientPicker = document.getElementById('camp-patient-picker');
  const campaignSelectedPatients = document.getElementById('camp-selected-patients');

  const globalsModal = document.getElementById('campanhas-globais-modal');
  const globalsCloseBtn = document.getElementById('close-globais-modal');
  const globalsCancelBtn = document.getElementById('cancelar-globais');
  const globalsForm = document.getElementById('campanhas-globais-form');
  const globalsTextarea = document.getElementById('campanhas-globais-json');
  const logsModal = document.getElementById('campanha-logs-modal');
  const closeLogsModalBtn = document.getElementById('close-logs-modal');
  const logsTbody = document.getElementById('logs-tbody');
  const strategyVideoModal = document.getElementById('strategy-video-modal');
  const closeStrategyVideoModalBtn = document.getElementById('close-strategy-video-modal');
  const strategyVideoIframe = document.getElementById('strategy-video-iframe');
  const strategyVideoSrc = 'https://www.youtube.com/embed/dQw4w9WgXcQ';
  const templateFlowModal = document.getElementById('template-flow-modal');
  const closeTemplateFlowModalBtn = document.getElementById('close-template-flow-modal');
  const templateFlowCancelBtn = document.getElementById('template-flow-cancel');
  const templateFlowSendBtn = document.getElementById('template-flow-send');
  const templateFlowScheduleBtn = document.getElementById('template-flow-schedule');
  const templateFlowCategory = document.getElementById('template-flow-category');
  const templateFlowTitle = document.getElementById('template-flow-title');
  const templateFlowDescription = document.getElementById('template-flow-description');
  const templateFlowTotal = document.getElementById('template-flow-total');
  const templateFlowEligible = document.getElementById('template-flow-eligible');
  const templateFlowBlocked = document.getElementById('template-flow-blocked');
  const templateFlowSelected = document.getElementById('template-flow-selected');
  const templateFlowCampaignName = document.getElementById('template-flow-campaign-name');
  const templateFlowMessage = document.getElementById('template-flow-message');
  const templateFlowMessageTools = document.getElementById('template-flow-message-tools');
  const templateFlowSearch = document.getElementById('template-flow-search');
  const templateFlowSearchWrap = document.getElementById('template-flow-search-wrap');
  const templateFlowSearchPicker = document.getElementById('template-flow-search-picker');
  const templateFlowManualSearch = document.getElementById('template-flow-manual-search');
  const templateFlowManualSearchWrap = document.getElementById('template-flow-manual-search-wrap');
  const templateFlowManualSearchPicker = document.getElementById('template-flow-manual-search-picker');
  const templateFlowManualSelectVisibleBtn = document.getElementById('template-flow-manual-select-visible');
  const templateFlowManualClearBtn = document.getElementById('template-flow-manual-clear');
  const templateFlowManualSelected = document.getElementById('template-flow-manual-selected');
  const templateFlowManualMeta = document.getElementById('template-flow-manual-meta');
  const templateFlowSelectVisibleBtn = document.getElementById('template-flow-select-visible');
  const templateFlowSelectAllBtn = document.getElementById('template-flow-select-all');
  const templateFlowClearBtn = document.getElementById('template-flow-clear-selection');
  const templateFlowFilters = document.getElementById('template-flow-filters');
  const templateFlowSelectionHint = document.getElementById('template-flow-selection-hint');
  const templateFlowListMeta = document.getElementById('template-flow-list-meta');
  const templateFlowAudienceList = document.getElementById('template-flow-audience-list');
  const templateFlowObjective = document.getElementById('template-flow-objective');
  const templateFlowTags = document.getElementById('template-flow-tags');
  const templateFlowSegment = document.getElementById('template-flow-segment');
  const templateFlowCta = document.getElementById('template-flow-cta');
  const templateFlowPreviewSample = document.getElementById('template-flow-preview-sample');
  const templateFlowMessagePreview = document.getElementById('template-flow-message-preview');
  const templateFlowMessageHealth = document.getElementById('template-flow-message-health');
  const templateFlowMessageGuidance = document.getElementById('template-flow-message-guidance');
  const templateFlowReviewTitle = document.getElementById('template-flow-review-title');
  const templateFlowReviewCount = document.getElementById('template-flow-review-count');
  const templateFlowReviewList = document.getElementById('template-flow-review-list');
  const templateFlowBlockedSummary = document.getElementById('template-flow-blocked-summary');
  const templateSendConfirmModal = document.getElementById('template-send-confirm-modal');
  const closeTemplateSendConfirmModalBtn = document.getElementById('close-template-send-confirm-modal');
  const templateSendConfirmCancelBtn = document.getElementById('template-send-confirm-cancel');
  const templateSendConfirmSubmitBtn = document.getElementById('template-send-confirm-submit');
  const templateSendConfirmTitle = document.getElementById('template-send-confirm-title');
  const templateSendConfirmCopy = document.getElementById('template-send-confirm-copy');
  const templateSendConfirmSelected = document.getElementById('template-send-confirm-selected');
  const templateSendConfirmBlocked = document.getElementById('template-send-confirm-blocked');
  const templateSendConfirmLength = document.getElementById('template-send-confirm-length');
  const templateSendConfirmList = document.getElementById('template-send-confirm-list');
  const templateSendConfirmBlockedList = document.getElementById('template-send-confirm-blocked-list');
  const templateSendConfirmPreview = document.getElementById('template-send-confirm-preview');
  const templateSendResultModal = document.getElementById('template-send-result-modal');
  const closeTemplateSendResultModalBtn = document.getElementById('close-template-send-result-modal');
  const templateSendResultRetryFailedBtn = document.getElementById('template-send-result-retry-failed');
  const templateSendResultReviewBlockedBtn = document.getElementById('template-send-result-review-blocked');
  const templateSendResultCloseBtn = document.getElementById('template-send-result-close');
  const templateSendResultTitle = document.getElementById('template-send-result-title');
  const templateSendResultCopy = document.getElementById('template-send-result-copy');
  const templateSendResultSent = document.getElementById('template-send-result-sent');
  const templateSendResultFailed = document.getElementById('template-send-result-failed');
  const templateSendResultBlocked = document.getElementById('template-send-result-blocked');
  const templateSendResultSentList = document.getElementById('template-send-result-sent-list');
  const templateSendResultIssues = document.getElementById('template-send-result-issues');

  let currentUser = null;
  let campanhas = [];
  let templatesData = { monthly: null, annualTemplates: [] };
  let campaignResults = new Map();
  let campaignPatients = [];
  let campaignPatientLookup = new Map();
  let templateAudienceCache = new Map();
  let campaignAudienceCache = new Map();
  let contactOpportunities = [];
  let selectedCampaignPatientIds = new Set();
  let editingCampaignId = null;
  let templateFlowState = {
    open: false,
    template: null,
    source: '',
    audience: null,
    selectedPatientIds: new Set(),
    manualSelectedPatientIds: new Set(),
    filter: 'all',
    search: '',
    searchPickerOpen: false,
    manualSearch: '',
    manualSearchPickerOpen: false,
    confirmOpen: false,
    confirmPayload: null,
    loading: false,
    sending: false,
  };
  const params = new URLSearchParams(window.location.search);
  const editId = params.get('edit');
  let templateSendResultState = {
    open: false,
    payload: null,
  };

  const getClinicStorageKey = (baseKey) => {
    const clinicId = String(currentUser?.clinicId || '').trim();
    return clinicId ? `${baseKey}:${clinicId}` : `${baseKey}:global`;
  };

  const ensureUser = async () => {
    try {
      const user = await authApi.currentUser();
      if (!user) {
        window.location.href = 'login.html';
        return null;
      }
      return user;
    } catch (err) {
      console.error('Erro ao obter usuario logado', err);
      window.location.href = 'login.html';
      return null;
    }
  };

  const loadCampaigns = async () => {
    try {
      const data = await campanhasApi.list?.();
      if (!Array.isArray(data)) return [];
      return data.map(normalizeCampaign);
    } catch (err) {
      console.warn('Erro ao carregar campanhas', err);
      return [];
    }
  };

  const updateHealthPanel = async () => {
    const uniqueSuggestedPatients = new Set();
    let withWhatsapp = 0;
    templateAudienceCache.forEach((stats) => {
      (Array.isArray(stats?.patientIds) ? stats.patientIds : []).forEach((patientId) => {
        if (patientId) uniqueSuggestedPatients.add(String(patientId).trim());
      });
      withWhatsapp += Number(stats?.withPhoneCount || 0);
    });
    const activeCampaigns = campanhas.filter((camp) => {
      const status = String(camp?.status || 'ativa').trim().toLowerCase();
      return !['concluida', 'inativa'].includes(status);
    }).length;
    if (kpiSentToday) kpiSentToday.textContent = String(uniqueSuggestedPatients.size || 0);
    if (kpiFailedToday) kpiFailedToday.textContent = String(activeCampaigns || 0);
    if (kpiDeliveryRate) kpiDeliveryRate.textContent = String(templatesData.annualTemplates.length || 0);
    if (kpiLastSend) kpiLastSend.textContent = String(withWhatsapp || 0);
    if (kpiNextSend) kpiNextSend.textContent = 'Paciente a paciente';
  };

  const loadCampaignResults = async () => {
    if (!campanhasApi.result) {
      campaignResults = new Map();
      return;
    }
    const map = new Map();
    const ids = campanhas.map((camp) => String(camp?.id || '').trim()).filter(Boolean);
    await Promise.all(ids.map(async (id) => {
      try {
        const data = await campanhasApi.result({ campaignId: id, windowDays: 7 });
        map.set(id, data || null);
      } catch (_) {
      }
    }));
    campaignResults = map;
  };

  const loadCampaignAudienceStats = async () => {
    campaignAudienceCache = new Map();
    if (!campanhasApi.resolveAudience || !Array.isArray(campanhas) || !campanhas.length) return;
    const statsEntries = await Promise.allSettled(campanhas.map(async (camp) => {
      const campaignId = String(camp?.id || '').trim();
      if (!campaignId) return null;
      const audience = await campanhasApi.resolveAudience({
        campaignId,
        segmentKey: String(camp?.segmentKey || 'all_active').trim().toLowerCase(),
        filters: camp?.audienceFilters || {},
      });
      if (!audience || audience.unavailable) {
        return [campaignId, {
          eligibleCount: 0,
          totalCount: 0,
          blockedCount: 0,
          patientIds: [],
          withPhoneCount: 0,
        }];
      }
      const members = Array.isArray(audience?.members) ? audience.members : [];
      const eligibleMembers = members.filter((member) => member?.included === true);
      return [campaignId, {
        eligibleCount: Number(audience?.includedCount || eligibleMembers.length || 0),
        totalCount: Number(audience?.total || members.length || 0),
        blockedCount: Number(audience?.blockedCount || 0),
        patientIds: eligibleMembers.map((member) => String(member?.patientId || '').trim()).filter(Boolean),
        withPhoneCount: eligibleMembers.filter((member) => String(member?.phone || '').trim()).length,
      }];
    }));
    statsEntries.forEach((entry) => {
      if (entry.status !== 'fulfilled' || !Array.isArray(entry.value)) return;
      const [campaignId, stats] = entry.value;
      if (!campaignId) return;
      campaignAudienceCache.set(campaignId, stats || null);
    });
  };

  const getCampaignPatientId = (patient = {}) => String(patient?.id || patient?.patientId || patient?.prontuario || '').trim();

  const getCampaignPatientLabel = (patient = {}) => String(
    patient?.nome || patient?.fullName || patient?.patientName || 'Paciente',
  ).trim() || 'Paciente';

  const loadCampaignPatients = async () => {
    if (!patientsApi.list) {
      campaignPatients = [];
      campaignPatientLookup = new Map();
      return;
    }
    try {
      const list = await patientsApi.list();
      const activeClinicId = String(currentUser?.clinicId || '').trim();
      campaignPatients = (Array.isArray(list) ? list : [])
        .filter((patient) => getCampaignPatientId(patient))
        .filter((patient) => {
          if (!activeClinicId) return true;
          const patientClinicId = String(patient?.clinicId || '').trim();
          return !patientClinicId || patientClinicId === activeClinicId;
        })
        .sort((left, right) => getCampaignPatientLabel(left).localeCompare(getCampaignPatientLabel(right), 'pt-BR'));
      campaignPatientLookup = buildCampaignPatientLookup();
    } catch (err) {
      console.warn('Erro ao carregar pacientes para campanhas', err);
      campaignPatients = [];
      campaignPatientLookup = new Map();
    }
  };

  const getPatientPhone = (patient = {}) => String(
    patient?.telefone || patient?.phone || patient?.celular || patient?.whatsapp || '',
  ).trim();

  const normalizeWhatsAppPhone = (value) => {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('55')) return digits;
    if (digits.length >= 10 && digits.length <= 11) return `55${digits}`;
    return digits;
  };

  const getOpportunityPriorityValue = (priority) => {
    const normalized = String(priority || '').trim().toLowerCase();
    if (normalized === 'alta') return 3;
    if (normalized === 'media') return 2;
    return 1;
  };

  const buildOpportunityMessage = (opportunity = {}) => {
    const name = opportunity.patientName || 'paciente';
    const reason = opportunity.reason || opportunity.title || 'oportunidade de contato';
    return `Ola, ${name}. Aqui e da clinica. Identificamos uma pendencia: ${reason}. Posso te ajudar com isso?`;
  };

  const createOpportunityFromMember = ({ member = {}, segment = {}, patient = null } = {}) => {
    const patientId = String(member?.patientId || patient?.id || patient?.patientId || patient?.prontuario || '').trim();
    if (!patientId) return null;
    const phone = String(member?.phone || getPatientPhone(patient)).trim();
    const reason = String(member?.suggestionReasonLabel || segment.title || SEGMENT_LABELS[segment.key] || 'Contato sugerido').trim();
    const detail = String(member?.suggestionExplanation || member?.reasonLabel || '').trim();
    return {
      id: `${segment.key}:${patientId}`,
      patientId,
      patientName: String(member?.patientName || getCampaignPatientLabel(patient) || 'Paciente').trim(),
      phone,
      whatsappPhone: normalizeWhatsAppPhone(phone),
      title: segment.title,
      reason,
      detail,
      source: segment.source,
      priority: segment.priority,
      segmentKey: segment.key,
      included: member?.included !== false,
    };
  };

  const buildCampaignPatientLookup = () => {
    const map = new Map();
    campaignPatients.forEach((patient) => {
      [
        patient?.id,
        patient?.patientId,
        patient?.prontuario,
        patient?._id,
        patient?.pacienteId,
      ]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .forEach((key) => {
          if (!map.has(key)) map.set(key, patient);
        });
    });
    return map;
  };

  const resolveOpportunitySegment = async (segment) => {
    if (!campanhasApi.resolveAudience) return [];
    try {
      const payload = await campanhasApi.resolveAudience({
        segmentKey: segment.key,
        filters: segment.key === 'appointment_window' ? { dateFrom: getTodayValues().date } : {},
      });
      if (payload?.unavailable) return [];
      const patientMap = campaignPatientLookup;
      const members = Array.isArray(payload?.members)
        ? payload.members
        : (Array.isArray(payload?.patientIds) ? payload.patientIds.map((patientId) => ({ patientId })) : []);
      return members
        .map((member) => createOpportunityFromMember({
          member,
          segment,
          patient: patientMap.get(String(member?.patientId || '').trim()) || null,
        }))
        .filter(Boolean);
    } catch (err) {
      console.warn('Erro ao resolver oportunidades de contato', segment.key, err);
      return [];
    }
  };

  const loadContactOpportunities = async () => {
    const groups = await Promise.all(OPPORTUNITY_SEGMENTS.map(resolveOpportunitySegment));
    const unique = new Map();
    groups.flat().forEach((item) => {
      const current = unique.get(item.patientId);
      if (!current || getOpportunityPriorityValue(item.priority) > getOpportunityPriorityValue(current.priority)) {
        unique.set(item.patientId, item);
      }
    });
    contactOpportunities = Array.from(unique.values())
      .sort((left, right) => {
        const priorityDiff = getOpportunityPriorityValue(right.priority) - getOpportunityPriorityValue(left.priority);
        if (priorityDiff) return priorityDiff;
        return left.patientName.localeCompare(right.patientName, 'pt-BR');
      });
    return contactOpportunities;
  };

  const getSelectedCampaignPatients = () => campaignPatients
    .filter((patient) => selectedCampaignPatientIds.has(getCampaignPatientId(patient)));

  const renderSelectedCampaignPatients = () => {
    if (!campaignSelectedPatients) return;
    const selected = getSelectedCampaignPatients();
    if (!selected.length) {
      campaignSelectedPatients.innerHTML = '<span class="campaign-selected-empty">Nenhum paciente especifico selecionado.</span>';
      return;
    }
    campaignSelectedPatients.innerHTML = selected.map((patient) => {
      const patientId = getCampaignPatientId(patient);
      return `
        <button type="button" class="campaign-patient-chip" data-remove-campaign-patient="${escapeHtml(patientId)}">
          <span>${escapeHtml(getCampaignPatientLabel(patient))}</span>
          <strong aria-hidden="true">&times;</strong>
        </button>
      `;
    }).join('');
  };

  const renderCampaignPatientPicker = () => {
    if (!campaignPatientPicker) return;
    const query = String(campaignPatientSearch?.value || '').trim().toLowerCase();
    const terms = query.split(/\s+/).filter(Boolean);
    const matches = campaignPatients
      .filter((patient) => {
        if (!terms.length) return true;
        const haystack = [
          getCampaignPatientLabel(patient),
          patient?.telefone,
          patient?.phone,
          patient?.email,
          patient?.cpf,
          patient?.prontuario,
          patient?.id,
        ].map((value) => String(value || '').toLowerCase()).join(' ');
        return terms.every((term) => haystack.includes(term));
      })
      .slice(0, 8);

    if (!campaignPatients.length) {
      campaignPatientPicker.innerHTML = '<div class="empty-state">Nenhum paciente cadastrado nesta clinica.</div>';
      return;
    }
    if (!matches.length) {
      campaignPatientPicker.innerHTML = '<div class="empty-state">Nenhum paciente encontrado.</div>';
      return;
    }

    campaignPatientPicker.innerHTML = matches.map((patient) => {
      const patientId = getCampaignPatientId(patient);
      const selected = selectedCampaignPatientIds.has(patientId);
      return `
        <button type="button" class="campaign-patient-option${selected ? ' selected' : ''}" data-campaign-patient-id="${escapeHtml(patientId)}">
          <span>
            <strong>${escapeHtml(getCampaignPatientLabel(patient))}</strong>
            <small>${escapeHtml(patient?.telefone || patient?.phone || patient?.email || patientId)}</small>
          </span>
          <em>${selected ? 'Selecionado' : 'Adicionar'}</em>
        </button>
      `;
    }).join('');
  };

  const renderCampaignManualAudience = () => {
    renderCampaignPatientPicker();
    renderSelectedCampaignPatients();
  };

  const refreshSegmentPreview = async () => {
    if (!segmentPreview) return;
    if (!campanhasApi.resolveAudience) {
      segmentPreview.textContent = 'Segmentacao indisponivel.';
      return;
    }
    const segmentKey = String(selectSegmento?.value || 'all_active').trim().toLowerCase();
    const selectedPatientIds = Array.from(selectedCampaignPatientIds);
    segmentPreview.textContent = 'Calculando audiencia...';
    try {
      const data = await campanhasApi.resolveAudience({
        segmentKey,
        filters: selectedPatientIds.length ? { selectedPatientIds } : {},
      });
      if (data?.unavailable) {
        segmentPreview.textContent = data?.reason || 'Segmento indisponivel.';
        segmentPreview.title = data?.reason || 'Segmento indisponivel.';
        return;
      }
      const manualSuffix = selectedPatientIds.length ? ` de ${selectedPatientIds.length} escolhidos manualmente` : '';
      segmentPreview.textContent = `${data?.total ?? 0} pacientes selecionados${manualSuffix}`;
      segmentPreview.title = '';
    } catch (err) {
      segmentPreview.textContent = 'Falha ao calcular audiencia.';
      segmentPreview.title = err?.message || '';
    }
  };

  const loadTodayLogs = async () => {
    if (!logsTbody || !campanhasApi.logsList) return;
    const today = getTodayValues().date;
    logsTbody.innerHTML = '<tr><td colspan="5" class="logs-empty">Carregando logs...</td></tr>';
    try {
      const payload = await campanhasApi.logsList({ dateFrom: today, dateTo: today, page: 1, limit: 200 });
      const items = Array.isArray(payload?.items) ? payload.items : [];
      if (!items.length) {
        logsTbody.innerHTML = '<tr><td colspan="5" class="logs-empty">Sem logs hoje.</td></tr>';
        return;
      }
      logsTbody.innerHTML = items.map((item) => `
        <tr>
          <td>${formatHourBr(item.createdAt)}</td>
          <td>${item.campaignName || '--'}</td>
          <td>${item.patientName || '--'}</td>
          <td><span class="status-pill ${getDispatchStatusClass(item.status)}">${item.status || '--'}</span></td>
          <td>${item.errorMessage || '--'}</td>
        </tr>
      `).join('');
    } catch (err) {
      logsTbody.innerHTML = '<tr><td colspan="5" class="logs-empty">Falha ao carregar logs.</td></tr>';
      console.error('Erro ao carregar logs de campanhas', err);
    }
  };

  const openLogsModal = async () => {
    if (!logsModal) return;
    logsModal.classList.add('open');
    logsModal.setAttribute('aria-hidden', 'false');
    await loadTodayLogs();
  };

  const closeLogsModal = () => {
    if (!logsModal) return;
    logsModal.classList.remove('open');
    logsModal.setAttribute('aria-hidden', 'true');
  };

  const openStrategyVideoModal = () => {
    if (!strategyVideoModal) return;
    strategyVideoModal.classList.add('open');
    strategyVideoModal.setAttribute('aria-hidden', 'false');
    if (strategyVideoIframe && !strategyVideoIframe.src) {
      strategyVideoIframe.src = strategyVideoSrc;
    }
  };

  const closeStrategyVideoModal = () => {
    if (!strategyVideoModal) return;
    strategyVideoModal.classList.remove('open');
    strategyVideoModal.setAttribute('aria-hidden', 'true');
  };

  const logTemplateFlow = (action, payload = {}) => {
    console.info('[CAMPANHAS]', JSON.stringify({
      action,
      clinicId: String(currentUser?.clinicId || '').trim(),
      ...payload,
    }));
  };

  const getTemplateTitle = (template = {}) => template.title || template.nome || 'Template';
  const getTemplateDescription = (template = {}) => template.description || template.descricao || '';
  const getTemplateObjective = (template = {}) => template.objective || template.templateObjective || template.descricao || '';
  const getTemplateBaseMessage = (template = {}) => template.messageTemplate || template.baseMessage || template.messages?.standard || '';
  const getTemplatePriority = (template = {}) => template.priority || '--';
  const getTemplateImpact = (template = {}) => template.impact || template.estimatedConversionImpact || '--';
  const getTemplateSegmentKey = (template = {}) => String(template.segmentType || template.segmentKey || 'all_active').trim().toLowerCase();
  const getCurrentClinicDisplayName = () => [
    currentUser?.clinicName,
    currentUser?.nomeClinica,
    currentUser?.clinicDisplayName,
    currentUser?.clinic?.nomeFantasia,
    currentUser?.clinic?.razaoSocial,
    'Voithos',
  ].map((value) => String(value || '').trim()).find(Boolean) || 'Voithos';

  const getCampaignTemplateModel = (camp = {}) => {
    const metadataTemplate = camp?.metadata?.template || {};
    return {
      id: metadataTemplate.id || camp.templateId || camp.id || '',
      title: metadataTemplate.title || camp.nome || 'Campanha',
      description: metadataTemplate.description || camp.descricao || '',
      objective: metadataTemplate.objective || camp.templateObjective || camp.descricao || '',
      category: metadataTemplate.category || camp.templateCategory || 'RELATIONSHIP',
      priority: metadataTemplate.priority || camp.templatePriority || 'MEDIUM',
      impact: metadataTemplate.impact || camp.templateImpact || 'MEDIUM',
      color: metadataTemplate.color || camp.cor || '#2a9d8f',
      segmentType: metadataTemplate.segmentType || camp.segmentKey || 'all_active',
      segmentSuggestion: metadataTemplate.segmentSuggestion || '',
      internalCta: metadataTemplate.internalCta || '',
      messageTemplate: metadataTemplate.messageTemplate || camp.messageTemplate || camp.descricao || '',
      nome: metadataTemplate.title || camp.nome || 'Campanha',
      descricao: metadataTemplate.description || camp.descricao || '',
      cor: metadataTemplate.color || camp.cor || '#2a9d8f',
      segmentKey: metadataTemplate.segmentType || camp.segmentKey || 'all_active',
    };
  };

  const getCampaignSuggestedMessage = (camp = {}) => String(
    camp?.metadata?.template?.messageTemplate
    || camp?.messageTemplate
    || camp?.descricao
    || getTemplateBaseMessage(getCampaignTemplateModel(camp))
    || ''
  ).trim();

  const normalizePhone = (value) => String(value || '').replace(/\D/g, '');
  const buildWaLink = (phone, message = '') => {
    const digits = normalizePhone(phone);
    if (!digits) return '';
    const text = String(message || '').trim();
    return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
  };

  const buildTemplateMessageForMember = (template = {}, member = {}, draftOverride = '') => {
    const draft = String(draftOverride || templateFlowMessage?.value || getTemplateBaseMessage(template) || '').trim();
    return draft
      .replace(/\{NOME_PACIENTE\}/g, member?.patientName || 'Paciente')
      .replace(/\{NOME_CLINICA\}/g, getCurrentClinicDisplayName())
      .trim();
  };

  const copyTextToClipboard = async (value) => {
    const text = String(value || '').trim();
    if (!text) return false;
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      const fallback = document.createElement('textarea');
      fallback.value = text;
      document.body.appendChild(fallback);
      fallback.select();
      document.execCommand('copy');
      fallback.remove();
      return true;
    }
  };

  const getTemplateAudienceMemberById = (patientId) => {
    const normalizedId = String(patientId || '').trim();
    if (!normalizedId) return null;
    const members = Array.isArray(templateFlowState.audience?.members) ? templateFlowState.audience.members : [];
    return members.find((member) => getTemplateMemberId(member) === normalizedId) || null;
  };

  const openManualPatientProntuario = (member = {}) => {
    const patientId = String(member?.patientId || '').trim();
    const storedPatient = patientId ? campaignPatientLookup.get(patientId) || null : null;
    const patient = storedPatient || {
      id: patientId,
      patientId,
      prontuario: patientId,
      nome: member?.patientName || '',
      telefone: member?.phone || '',
      clinicId: currentUser?.clinicId || '',
    };
    localStorage.setItem(getClinicStorageKey('prontuarioPatient'), JSON.stringify(patient));
    window.location.href = 'prontuario.html';
  };

  const handleTemplatePatientAction = async (action, patientId) => {
    const member = getTemplateAudienceMemberById(patientId);
    const patient = campaignPatientLookup.get(String(patientId || '').trim()) || null;
    if (!member && !patient) return;
    const target = {
      patientId: String(patientId || '').trim(),
      patientName: member?.patientName || getCampaignPatientLabel(patient),
      phone: member?.phone || getPatientPhone(patient),
    };
    const message = buildTemplateMessageForMember(templateFlowState.template || {}, target);
    if (action === 'whatsapp') {
      const url = buildWaLink(target?.phone, message);
      if (!url) {
        alert('Paciente sem telefone valido para WhatsApp.');
        return;
      }
      if (appApi?.openExternalUrl) {
        await appApi.openExternalUrl(url);
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (action === 'copy') {
      await copyTextToClipboard(message);
      alert('Mensagem copiada para este paciente.');
      return;
    }
    if (action === 'prontuario') {
      openManualPatientProntuario(target);
    }
  };

  const getTemplatePreviewMember = (audience = null) => {
    const entries = getTemplateSelectionEntries();
    if (entries.length) return entries[0];
    const members = Array.isArray(audience?.members) ? audience.members : [];
    return members.find((member) => isTemplateMemberSelectable(member)) || members[0] || null;
  };

  const getTemplateIssueGuidance = ({ reasonCode = '', reasonLabel = '', status = '' } = {}) => {
    const normalizedCode = String(reasonCode || '').trim().toUpperCase();
    const normalizedLabel = String(reasonLabel || '').trim();
    const normalizedStatus = String(status || '').trim().toUpperCase();
    const text = `${normalizedCode} ${normalizedLabel}`.toUpperCase();

    if (normalizedCode === 'NO_CONSENT' || text.includes('CONSENTIMENTO')) {
      return {
        tone: 'warning',
        action: 'Atualizar consentimento',
        detail: 'Confirme no cadastro do paciente a autorizacao para mensagens antes de tentar novamente.',
      };
    }
    if (normalizedCode === 'NO_PHONE' || text.includes('TELEFONE')) {
      return {
        tone: 'warning',
        action: 'Atualizar WhatsApp',
        detail: 'Corrija ou complete o telefone do paciente no cadastro para liberar o envio.',
      };
    }
    if (normalizedCode === 'IDEMPOTENT_ALREADY_DISPATCHED' || text.includes('JA POSSUI ENVIO')) {
      return {
        tone: 'info',
        action: 'Nao reenviar agora',
        detail: 'Esse paciente ja recebeu ou possui envio ativo para esta campanha. Evite duplicidade.',
      };
    }
    if (normalizedStatus === 'FAILED') {
      return {
        tone: 'warning',
        action: 'Tentar novamente',
        detail: 'Revise o contato e repita o envio apenas para os pacientes com falha.',
      };
    }
    return {
      tone: 'neutral',
      action: 'Revisar cadastro',
      detail: 'Verifique o prontuario e o cadastro do paciente antes de uma nova tentativa.',
    };
  };

  const analyzeTemplateMessageDraft = (value = '') => {
    const message = String(value || '').trim();
    const length = message.length;
    const hasPatientPlaceholder = /\{NOME_PACIENTE\}/i.test(message);
    const hasClinicPlaceholder = /\{NOME_CLINICA\}/i.test(message);
    const hasCta = /(agend|responda|responder|horari|falar|chamar|confirm|remarcar|posso verificar|quero|me avise)/i.test(message);
    const isEmpty = !message;
    const isLong = length > 420;
    const isVeryLong = length > 650;
    let guidance = 'Mensagem pronta para envio com personalizacao basica.';
    let severity = 'success';

    if (isEmpty) {
      guidance = 'Escreva a mensagem base antes de enviar a campanha.';
      severity = 'danger';
    } else if (!hasPatientPlaceholder && !hasCta) {
      guidance = 'A copy ainda esta generica. Inclua o nome do paciente e um convite para responder ou agendar.';
      severity = 'warning';
    } else if (!hasPatientPlaceholder) {
      guidance = 'Inclua {NOME_PACIENTE} para a mensagem parecer menos generica.';
      severity = 'warning';
    } else if (!hasCta) {
      guidance = 'Inclua um CTA simples, como responder por aqui ou solicitar um horario.';
      severity = 'warning';
    } else if (isVeryLong) {
      guidance = 'A mensagem esta longa para WhatsApp. Considere encurtar antes do envio.';
      severity = 'warning';
    } else if (isLong) {
      guidance = 'A copy esta boa, mas pode ficar mais leve se voce encurtar alguns trechos.';
      severity = 'info';
    }

    return {
      message,
      length,
      isEmpty,
      hasPatientPlaceholder,
      hasClinicPlaceholder,
      hasCta,
      isLong,
      isVeryLong,
      guidance,
      severity,
      badges: [
        { label: hasPatientPlaceholder ? 'Personaliza por paciente' : 'Sem nome do paciente', tone: hasPatientPlaceholder ? 'success' : 'warning' },
        { label: hasClinicPlaceholder ? 'Mostra nome da clinica' : 'Sem nome da clinica', tone: hasClinicPlaceholder ? 'info' : 'neutral' },
        { label: hasCta ? 'Tem CTA' : 'Sem CTA claro', tone: hasCta ? 'success' : 'warning' },
        { label: `${length} caracteres`, tone: isVeryLong ? 'danger' : (isLong ? 'warning' : 'neutral') },
      ],
    };
  };

  const buildTemplatePreviewText = (template = {}, audience = null) => {
    const message = String(templateFlowMessage?.value || getTemplateBaseMessage(template) || '').trim();
    const previewMember = getTemplatePreviewMember(audience);
    const patientName = previewMember?.patientName || 'Paciente';
    const clinicName = getCurrentClinicDisplayName();
    return message
      .replace(/\{NOME_PACIENTE\}/g, patientName)
      .replace(/\{NOME_CLINICA\}/g, clinicName)
      .trim() || 'Selecione um template para ver a mensagem.';
  };

  const getTemplateManualSelectedPatients = () => campaignPatients
    .filter((patient) => templateFlowState.manualSelectedPatientIds.has(getCampaignPatientId(patient)));

  const getTemplateSelectionEntries = () => {
    const entries = new Map();

    getSelectedTemplateMembers().forEach((member) => {
      const patientId = getTemplateMemberId(member);
      if (!patientId || entries.has(patientId)) return;
      const storedPatient = campaignPatientLookup.get(patientId) || null;
      entries.set(patientId, {
        patientId,
        patientName: member?.patientName || getCampaignPatientLabel(storedPatient) || 'Paciente',
        phone: member?.phone || getPatientPhone(storedPatient),
        source: 'suggested',
        sourceLabel: member?.suggestionReasonLabel || member?.suggestionExplanation || 'Paciente sugerido',
        reasonLabel: member?.suggestionReasonLabel || member?.suggestionExplanation || 'Paciente sugerido',
        reasonExplanation: member?.suggestionExplanation || '',
        member,
        patient: storedPatient,
        blocked: isTemplateMemberBlocked(member),
        manualSelected: false,
      });
    });

    getTemplateManualSelectedPatients().forEach((patient) => {
      const patientId = getCampaignPatientId(patient);
      if (!patientId) return;
      const existing = entries.get(patientId);
      if (existing) {
        existing.manualSelected = true;
        if (existing.source === 'suggested') {
          existing.sourceLabel = `${existing.sourceLabel} | escolhido manualmente`;
        }
        return;
      }
      entries.set(patientId, {
        patientId,
        patientName: getCampaignPatientLabel(patient),
        phone: getPatientPhone(patient),
        source: 'manual',
        sourceLabel: 'Escolhido manualmente',
        reasonLabel: 'Paciente escolhido manualmente',
        reasonExplanation: 'Selecionado diretamente do prontuario da clinica.',
        member: null,
        patient,
        blocked: false,
        manualSelected: true,
      });
    });

    return Array.from(entries.values());
  };

  const getTemplateSelectionCount = () => getTemplateSelectionEntries().length;

  const matchesTemplateManualSearch = (patient = {}) => {
    const term = String(templateFlowState.manualSearch || '').trim().toLowerCase();
    if (!term) return true;
    return [
      getCampaignPatientLabel(patient),
      getPatientPhone(patient),
      patient?.cpf,
      patient?.prontuario,
      patient?.email,
      patient?.id,
    ].some((value) => String(value || '').toLowerCase().includes(term));
  };

  const getVisibleManualPatients = () => {
    const queryMatches = campaignPatients.filter((patient) => matchesTemplateManualSearch(patient));
    return queryMatches.sort((left, right) => {
      const leftId = getCampaignPatientId(left);
      const rightId = getCampaignPatientId(right);
      const leftSelected = templateFlowState.manualSelectedPatientIds.has(leftId) ? 1 : 0;
      const rightSelected = templateFlowState.manualSelectedPatientIds.has(rightId) ? 1 : 0;
      if (leftSelected !== rightSelected) return rightSelected - leftSelected;
      return getCampaignPatientLabel(left).localeCompare(getCampaignPatientLabel(right), 'pt-BR');
    });
  };

  const resetTemplateFlowState = () => {
    templateFlowState = {
      open: false,
      template: null,
      source: '',
      audience: null,
      selectedPatientIds: new Set(),
      manualSelectedPatientIds: new Set(),
      filter: 'all',
      search: '',
      searchPickerOpen: false,
      manualSearch: '',
      manualSearchPickerOpen: false,
      confirmOpen: false,
      confirmPayload: null,
      loading: false,
      sending: false,
    };
  };

  const getTemplateFlowSummary = () => templateFlowState.audience?.summary?.quickFilters || {
    all: 0,
    inactive: 0,
    missed: 0,
    withoutCleaning: 0,
    blocked: 0,
  };

  const getTemplateMemberId = (member = {}) => String(member?.patientId || '').trim();
  const isTemplateMemberBlocked = (member = {}) => String(member?.status || '').trim().toUpperCase() === 'BLOCKED';
  const isTemplateMemberSelectable = (member = {}) => Boolean(member?.included) && !isTemplateMemberBlocked(member);

  const sortTemplateMembers = (members = []) => [...members].sort((left, right) => {
    const leftId = getTemplateMemberId(left);
    const rightId = getTemplateMemberId(right);
    const leftSelected = templateFlowState.selectedPatientIds.has(leftId) ? 1 : 0;
    const rightSelected = templateFlowState.selectedPatientIds.has(rightId) ? 1 : 0;
    if (leftSelected !== rightSelected) return rightSelected - leftSelected;

    const leftBlocked = isTemplateMemberBlocked(left) ? 1 : 0;
    const rightBlocked = isTemplateMemberBlocked(right) ? 1 : 0;
    if (leftBlocked !== rightBlocked) return leftBlocked - rightBlocked;

    return String(left?.patientName || '').localeCompare(String(right?.patientName || ''), 'pt-BR');
  });

  const matchesTemplateFlowFilter = (member = {}) => {
    const activeFilter = templateFlowState.filter || 'all';
    if (activeFilter === 'selected') return templateFlowState.selectedPatientIds.has(getTemplateMemberId(member));
    if (activeFilter === 'inactive') return member?.flags?.inactive === true;
    if (activeFilter === 'missed') return member?.flags?.missedFollowup === true;
    if (activeFilter === 'withoutCleaning') return member?.flags?.withoutCleaning === true;
    if (activeFilter === 'blocked') return isTemplateMemberBlocked(member);
    return true;
  };

  const matchesTemplateFlowSearch = (member = {}) => {
    const term = String(templateFlowState.search || '').trim().toLowerCase();
    if (!term) return true;
    return [
      member?.patientName,
      member?.responsibleDentistName,
      member?.suggestionReasonLabel,
      member?.suggestionExplanation,
    ].some((value) => String(value || '').toLowerCase().includes(term));
  };

  const getVisibleTemplateMembers = () => {
    const members = Array.isArray(templateFlowState.audience?.members) ? templateFlowState.audience.members : [];
    return sortTemplateMembers(members.filter((member) => matchesTemplateFlowFilter(member) && matchesTemplateFlowSearch(member)));
  };

  const getVisibleEligibleTemplateMembers = () => getVisibleTemplateMembers().filter((member) => isTemplateMemberSelectable(member));

  const getSelectedTemplateMembers = () => {
    const members = Array.isArray(templateFlowState.audience?.members) ? templateFlowState.audience.members : [];
    return sortTemplateMembers(
      members.filter((member) => templateFlowState.selectedPatientIds.has(getTemplateMemberId(member))),
    );
  };

  const getSearchPickerMembers = () => {
    const members = Array.isArray(templateFlowState.audience?.members) ? templateFlowState.audience.members : [];
    return sortTemplateMembers(members.filter((member) => matchesTemplateFlowSearch(member)));
  };

  const renderTemplateFlowFilters = () => {
    if (!templateFlowFilters) return;
    const counts = {
      ...getTemplateFlowSummary(),
      selected: templateFlowState.selectedPatientIds.size,
    };
    templateFlowFilters.innerHTML = TEMPLATE_FLOW_FILTERS.map((item) => `
      <button
        type="button"
        class="template-chip ${templateFlowState.filter === item.key ? 'is-active' : ''}"
        data-template-filter="${item.key}">
        ${escapeHtml(item.label)} <span>${Number(counts[item.key] || 0)}</span>
      </button>
    `).join('');
  };

  const renderTemplateSearchPicker = () => {
    if (!templateFlowSearchPicker || !templateFlowSearchWrap) return;
    const shouldOpen = Boolean(templateFlowState.open && templateFlowState.searchPickerOpen);
    templateFlowSearchWrap.classList.toggle('is-open', shouldOpen);
    if (!shouldOpen) {
      templateFlowSearchPicker.hidden = true;
      templateFlowSearchPicker.innerHTML = '';
      return;
    }

    templateFlowSearchPicker.hidden = false;
    if (templateFlowState.loading) {
      templateFlowSearchPicker.innerHTML = '<div class="empty-state">Carregando pacientes sugeridos...</div>';
      return;
    }

    const audienceMembers = Array.isArray(templateFlowState.audience?.members) ? templateFlowState.audience.members : [];
    if (!audienceMembers.length) {
      templateFlowSearchPicker.innerHTML = '<div class="empty-state">Nenhum paciente sugerido para esta campanha.</div>';
      return;
    }

    const members = getSearchPickerMembers();
    if (!members.length) {
      templateFlowSearchPicker.innerHTML = '<div class="empty-state">Nenhum paciente encontrado com essa busca.</div>';
      return;
    }

    const displayedMembers = members.slice(0, 12);
    templateFlowSearchPicker.innerHTML = `
      <p class="template-search-picker-meta">${displayedMembers.length} de ${members.length} pacientes sugeridos do prontuario da clinica</p>
      ${displayedMembers.map((member) => {
        const patientId = getTemplateMemberId(member);
        const selected = templateFlowState.selectedPatientIds.has(patientId);
        const blocked = isTemplateMemberBlocked(member);
        const dentistLabel = member?.responsibleDentistName ? `Dentista: ${member.responsibleDentistName}` : 'Dentista: --';
        const helperLabel = blocked
          ? (member?.reasonLabel || 'Bloqueado para envio')
          : (member?.suggestionReasonLabel || member?.suggestionExplanation || 'Paciente sugerido');
        return `
          <label class="template-search-item ${selected ? 'is-selected' : ''} ${blocked ? 'is-blocked' : ''}">
            <input
              type="checkbox"
              class="template-search-item-check"
              data-template-picker-patient-id="${escapeHtml(patientId)}"
              ${selected ? 'checked' : ''}
              ${blocked ? 'disabled' : ''}>
            <span class="template-search-item-copy">
              <strong>${escapeHtml(member?.patientName || 'Paciente')}</strong>
              <small>${escapeHtml(helperLabel)}</small>
              <small>${escapeHtml(dentistLabel)}</small>
            </span>
            <span class="template-search-item-status">${escapeHtml(blocked ? 'Bloqueado' : (selected ? 'Selecionado' : 'Selecionar'))}</span>
          </label>
        `;
      }).join('')}
      ${members.length > displayedMembers.length ? `<p class="template-search-picker-more">Continue digitando para refinar os ${members.length} pacientes sugeridos.</p>` : ''}
    `;
  };

  const renderTemplateSelectionHint = () => {
    if (!templateFlowSelectionHint) return;
    if (templateFlowState.loading) {
      templateFlowSelectionHint.innerHTML = '';
      return;
    }

    const visibleMembers = getVisibleTemplateMembers();
    const visibleEligibleCount = visibleMembers.filter((member) => isTemplateMemberSelectable(member)).length;
    const visibleBlockedCount = visibleMembers.filter((member) => isTemplateMemberBlocked(member)).length;
    const visibleIds = new Set(visibleMembers.map((member) => getTemplateMemberId(member)));
    const hiddenSelectedCount = Array.from(templateFlowState.selectedPatientIds).filter((patientId) => !visibleIds.has(patientId)).length;
    const manualSelectedCount = templateFlowState.manualSelectedPatientIds.size;
    const hasSearch = Boolean(String(templateFlowState.search || '').trim());
    const hasNonDefaultFilter = String(templateFlowState.filter || 'all') !== 'all';

    if (!visibleMembers.length && !hiddenSelectedCount && !manualSelectedCount && !hasSearch && !hasNonDefaultFilter) {
      templateFlowSelectionHint.innerHTML = '';
      return;
    }

    const messages = [];
    if (visibleEligibleCount) messages.push(`${visibleEligibleCount} elegiveis nesta visao`);
    if (visibleBlockedCount) messages.push(`${visibleBlockedCount} bloqueados nesta visao`);
    if (hiddenSelectedCount) messages.push(`${hiddenSelectedCount} selecionados fora da visao atual`);
    if (manualSelectedCount) messages.push(`${manualSelectedCount} escolhidos manualmente`);
    if (!messages.length && hasSearch) messages.push('Refine a busca para localizar pacientes sugeridos');

    templateFlowSelectionHint.innerHTML = `
      <span>${escapeHtml(messages.join(' • '))}</span>
      <div class="template-flow-selection-actions">
        ${hiddenSelectedCount ? '<button type="button" class="btn-small ghost" data-template-selection-action="show-selected">Ver selecionados</button>' : ''}
        ${hasSearch ? '<button type="button" class="btn-small ghost" data-template-selection-action="clear-search">Limpar busca</button>' : ''}
      </div>
    `;
  };

  const renderTemplateReview = () => {
    if (!templateFlowReviewTitle || !templateFlowReviewCount || !templateFlowReviewList || !templateFlowBlockedSummary) return;

    const selectedMembers = getSelectedTemplateMembers();
    const blockedMembers = (Array.isArray(templateFlowState.audience?.members) ? templateFlowState.audience.members : [])
      .filter((member) => isTemplateMemberBlocked(member));

    if (templateFlowState.loading) {
      templateFlowReviewTitle.textContent = 'Pacientes sugeridos agora';
      templateFlowReviewCount.textContent = 'Carregando revisao final...';
      templateFlowReviewList.innerHTML = '';
      templateFlowBlockedSummary.innerHTML = '';
      return;
    }

    templateFlowReviewTitle.textContent = selectedMembers.length ? 'Pacientes sugeridos agora' : 'Revise a audiencia final';

    if (!selectedMembers.length) {
      templateFlowReviewCount.textContent = 'Nenhum paciente elegivel nesta revisao.';
      templateFlowReviewList.innerHTML = '<p class="template-review-empty">Use a busca e os filtros para revisar quem faz sentido abordar nesta campanha.</p>';
    } else {
      const displayedMembers = selectedMembers.slice(0, 6);
      const hiddenCount = selectedMembers.length - displayedMembers.length;
      templateFlowReviewCount.textContent = `${selectedMembers.length} pacientes sugeridos para contato manual.`;
      templateFlowReviewList.innerHTML = `
        ${displayedMembers.map((member) => `
          <article class="template-review-item">
            <strong>${escapeHtml(member?.patientName || 'Paciente')}</strong>
            <span>${escapeHtml(member?.suggestionReasonLabel || member?.suggestionExplanation || 'Paciente selecionado')}</span>
          </article>
        `).join('')}
        ${hiddenCount > 0 ? `<p class="template-review-more">+ ${hiddenCount} pacientes selecionados alem dos exibidos.</p>` : ''}
      `;
    }

    if (!blockedMembers.length) {
      templateFlowBlockedSummary.innerHTML = '<p class="template-review-ok">Nenhum bloqueio real detectado nesta audiencia.</p>';
      return;
    }

    const blockedReasons = new Map();
    blockedMembers.forEach((member) => {
      const reason = String(member?.reasonLabel || 'Bloqueio de elegibilidade').trim() || 'Bloqueio de elegibilidade';
      blockedReasons.set(reason, Number(blockedReasons.get(reason) || 0) + 1);
    });

    const topReasons = [...blockedReasons.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3);

    templateFlowBlockedSummary.innerHTML = `
      <p class="template-review-blocked-title">${blockedMembers.length} pacientes ficaram bloqueados.</p>
      <div class="template-review-blocked-list">
        ${topReasons.map(([reason, count]) => `<span class="template-badge danger">${escapeHtml(`${count} • ${reason}`)}</span>`).join('')}
      </div>
    `;
  };

  const renderTemplateMessageAssist = () => {
    const template = templateFlowState.template || {};
    const audience = templateFlowState.audience;
    const previewMember = getTemplatePreviewMember(audience);
    const diagnostics = analyzeTemplateMessageDraft(templateFlowMessage?.value || getTemplateBaseMessage(template) || '');

    if (templateFlowPreviewSample) {
      templateFlowPreviewSample.textContent = previewMember?.patientName
        ? `Exemplo real com ${previewMember.patientName}`
        : 'Exemplo com paciente selecionado';
    }
    if (templateFlowMessageHealth) {
      templateFlowMessageHealth.innerHTML = diagnostics.badges
        .map((badge) => `<span class="template-badge ${escapeHtml(badge.tone)}">${escapeHtml(badge.label)}</span>`)
        .join('');
    }
    if (templateFlowMessageGuidance) {
      templateFlowMessageGuidance.textContent = diagnostics.guidance;
    }
  };

  const buildTemplateSendConfirmationPayload = () => {
    const template = templateFlowState.template;
    const audience = templateFlowState.audience;
    if (!template || !audience || audience?.unavailable) {
      return {
        error: audience?.reason || 'Audiencia indisponivel para este template.',
      };
    }

    const selectedEligibleMembers = getTemplateSelectionEntries();
    const draftMessage = String(templateFlowMessage?.value || getTemplateBaseMessage(template) || '').trim();
    const messageDiagnostics = analyzeTemplateMessageDraft(draftMessage);

    if (!selectedEligibleMembers.length) {
      return { error: 'Selecione pelo menos um paciente elegivel.' };
    }
    if (messageDiagnostics.isEmpty) {
      return { error: messageDiagnostics.guidance };
    }

    const blockedMembers = (Array.isArray(audience?.members) ? audience.members : [])
      .filter((member) => isTemplateMemberBlocked(member));
    const blockedReasons = new Map();
    blockedMembers.forEach((member) => {
      const reason = String(member?.reasonLabel || 'Bloqueio de elegibilidade').trim() || 'Bloqueio de elegibilidade';
      blockedReasons.set(reason, Number(blockedReasons.get(reason) || 0) + 1);
    });

    return {
      template,
      audience,
      templateId: String(template?.id || '').trim(),
      draftMessage,
      messageDiagnostics,
      selectedEligibleMembers,
      blockedMembers,
      blockedReasons: [...blockedReasons.entries()].sort((left, right) => right[1] - left[1]),
      previewText: draftMessage
        .replace(/\{NOME_PACIENTE\}/g, selectedEligibleMembers[0]?.patientName || 'Paciente')
        .replace(/\{NOME_CLINICA\}/g, getCurrentClinicDisplayName())
        .trim() || 'Mensagem indisponivel.',
    };
  };

  const renderTemplateSendConfirmation = () => {
    if (!templateSendConfirmModal) return;
    const shouldOpen = Boolean(templateFlowState.confirmOpen);
    templateSendConfirmModal.classList.toggle('open', shouldOpen);
    templateSendConfirmModal.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');
    if (!shouldOpen) return;

    const payload = templateFlowState.confirmPayload;
    if (!payload) return;

    if (templateSendConfirmTitle) templateSendConfirmTitle.textContent = `Contato manual: ${getTemplateTitle(payload.template)}`;
    if (templateSendConfirmCopy) {
      templateSendConfirmCopy.textContent = `${payload.selectedEligibleMembers.length} pacientes da clinica atual foram escolhidos para contato manual.`;
    }
    if (templateSendConfirmSelected) templateSendConfirmSelected.textContent = String(payload.selectedEligibleMembers.length);
    if (templateSendConfirmBlocked) templateSendConfirmBlocked.textContent = String(payload.blockedMembers.length);
    if (templateSendConfirmLength) templateSendConfirmLength.textContent = `${payload.messageDiagnostics.length} chars`;
    if (templateSendConfirmList) {
      const displayedMembers = payload.selectedEligibleMembers.slice(0, 6);
      const hiddenCount = payload.selectedEligibleMembers.length - displayedMembers.length;
      templateSendConfirmList.innerHTML = `
        ${displayedMembers.map((member) => `
          <article class="template-review-item">
            <strong>${escapeHtml(member?.patientName || 'Paciente')}</strong>
            <span>${escapeHtml(member?.sourceLabel || member?.reasonLabel || member?.suggestionReasonLabel || member?.suggestionExplanation || 'Paciente elegivel')}</span>
          </article>
        `).join('')}
        ${hiddenCount > 0 ? `<p class="template-review-more">+ ${hiddenCount} pacientes escolhidos alem dos exibidos.</p>` : ''}
      `;
    }
    if (templateSendConfirmBlockedList) {
      if (!payload.blockedReasons.length) {
        templateSendConfirmBlockedList.innerHTML = '<p class="template-review-ok">Nenhum bloqueio real detectado nesta audiencia.</p>';
      } else {
        templateSendConfirmBlockedList.innerHTML = `
          <p class="template-review-blocked-title">${payload.blockedMembers.length} pacientes ficaram fora da sugestao por bloqueio real.</p>
          <div class="template-review-blocked-list">
            ${payload.blockedReasons.slice(0, 4).map(([reason, count]) => `<span class="template-badge danger">${escapeHtml(`${count} • ${reason}`)}</span>`).join('')}
          </div>
        `;
      }
    }
    if (templateSendConfirmPreview) templateSendConfirmPreview.textContent = payload.previewText;
    if (templateSendConfirmSubmitBtn) {
      templateSendConfirmSubmitBtn.disabled = true;
      templateSendConfirmSubmitBtn.textContent = 'Envio desativado';
    }
  };

  const closeTemplateSendConfirmModal = () => {
    if (templateFlowState.sending) return;
    templateFlowState.confirmOpen = false;
    templateFlowState.confirmPayload = null;
    renderTemplateSendConfirmation();
  };

  const openTemplateSendConfirmModal = (payload) => {
    templateFlowState.confirmPayload = payload;
    templateFlowState.confirmOpen = true;
    renderTemplateSendConfirmation();
  };

  const applyTemplateFlowOpenOptions = (options = {}) => {
    const normalizedSearch = String(options?.search || '').trim();
    const normalizedFilter = String(options?.filter || 'all').trim();
    const focusPatientIds = new Set(
      (Array.isArray(options?.focusPatientIds) ? options.focusPatientIds : [])
        .map((item) => String(item || '').trim())
        .filter(Boolean),
    );

    if (templateFlowCampaignName && String(options?.campaignName || '').trim()) {
      templateFlowCampaignName.value = String(options.campaignName || '').trim();
    }
    if (templateFlowMessage && typeof options?.message === 'string') {
      templateFlowMessage.value = options.message;
    }
    templateFlowState.search = normalizedSearch;
    if (templateFlowSearch) templateFlowSearch.value = normalizedSearch;
    templateFlowState.filter = normalizedFilter || 'all';

    if (focusPatientIds.size) {
      const members = Array.isArray(templateFlowState.audience?.members) ? templateFlowState.audience.members : [];
      const nextSelectedIds = options?.replaceSelection === true
        ? new Set()
        : new Set(templateFlowState.selectedPatientIds);
      members.forEach((member) => {
        const patientId = getTemplateMemberId(member);
        if (!focusPatientIds.has(patientId)) return;
        if (!isTemplateMemberSelectable(member)) return;
        nextSelectedIds.add(patientId);
      });
      templateFlowState.selectedPatientIds = nextSelectedIds;
      if (options?.filterToSelected === true && nextSelectedIds.size > 0) {
        templateFlowState.filter = 'selected';
      }
    }

    renderTemplateFlow();
  };

  const reopenTemplateFlowFromResult = async (mode = 'failed') => {
    const payload = templateSendResultState.payload || null;
    if (!payload?.template) return;

    const focusPatientIds = mode === 'failed'
      ? (Array.isArray(payload?.summary?.failedItems) ? payload.summary.failedItems.map((item) => item?.patientId) : [])
      : (Array.isArray(payload?.summary?.blockedItems) ? payload.summary.blockedItems.map((item) => item?.patientId) : []);

    closeTemplateSendResultModal();
    await openTemplateFlowModal(
      payload.template,
      mode === 'failed' ? 'campanhas-template-retry-failed' : 'campanhas-template-review-blocked',
      {
        campaignName: payload.campaignName || getTemplateTitle(payload.template),
        message: payload.draftMessage || getTemplateBaseMessage(payload.template),
        filter: mode === 'blocked' ? 'blocked' : 'all',
        focusPatientIds,
        replaceSelection: mode === 'failed',
        filterToSelected: mode === 'failed',
      },
    );
  };

  const renderTemplateSendResultModal = () => {
    if (!templateSendResultModal) return;
    const shouldOpen = Boolean(templateSendResultState.open);
    templateSendResultModal.classList.toggle('open', shouldOpen);
    templateSendResultModal.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');
    if (!shouldOpen) return;

    const payload = templateSendResultState.payload || {};
    const sentItems = Array.isArray(payload?.summary?.sentItems) ? payload.summary.sentItems : [];
    const failedItems = Array.isArray(payload?.summary?.failedItems) ? payload.summary.failedItems : [];
    const blockedItems = Array.isArray(payload?.summary?.blockedItems) ? payload.summary.blockedItems : [];

    if (templateSendResultTitle) templateSendResultTitle.textContent = `Campanha enviada: ${payload.campaignName || 'Campanha'}`;
    if (templateSendResultCopy) {
      const failedCount = Number(payload?.summary?.failed || 0);
      const blockedCount = Number(payload?.summary?.blocked || 0);
      if (failedCount > 0 || blockedCount > 0) {
        templateSendResultCopy.textContent = `${Number(payload?.summary?.sent || 0)} envio(s) concluido(s). Voce pode reabrir as falhas ou revisar os bloqueados da clinica atual.`;
      } else {
        templateSendResultCopy.textContent = `${Number(payload?.summary?.sent || 0)} envio(s) concluido(s) para a clinica atual.`;
      }
    }
    if (templateSendResultSent) templateSendResultSent.textContent = String(payload?.summary?.sent || 0);
    if (templateSendResultFailed) templateSendResultFailed.textContent = String(payload?.summary?.failed || 0);
    if (templateSendResultBlocked) templateSendResultBlocked.textContent = String(payload?.summary?.blocked || 0);
    if (templateSendResultRetryFailedBtn) {
      templateSendResultRetryFailedBtn.disabled = Number(payload?.summary?.failed || 0) === 0;
    }
    if (templateSendResultReviewBlockedBtn) {
      templateSendResultReviewBlockedBtn.disabled = Number(payload?.summary?.blocked || 0) === 0;
    }
    if (templateSendResultSentList) {
      if (!sentItems.length) {
        templateSendResultSentList.innerHTML = '<p class="template-review-empty">Nenhum envio concluido neste disparo.</p>';
      } else {
        const displayed = sentItems.slice(0, 6);
        const hiddenCount = sentItems.length - displayed.length;
        templateSendResultSentList.innerHTML = `
          ${displayed.map((item) => `
            <article class="template-review-item">
              <strong>${escapeHtml(item?.patientName || 'Paciente')}</strong>
              <span>${escapeHtml(item?.phone ? `WhatsApp: ${item.phone}` : 'Envio concluido')}</span>
            </article>
          `).join('')}
          ${hiddenCount > 0 ? `<p class="template-review-more">+ ${hiddenCount} pacientes receberam alem dos exibidos.</p>` : ''}
        `;
      }
    }
    if (templateSendResultIssues) {
      const issueItems = [
        ...failedItems.map((item) => ({
          label: item?.patientName || 'Paciente',
          detail: item?.reason || 'Falha no envio',
          reasonCode: item?.reasonCode || 'DELIVERY_FAILED',
          status: 'FAILED',
          tone: 'warning',
        })),
        ...blockedItems.map((item) => ({
          label: item?.patientName || 'Paciente',
          detail: item?.reason || 'Bloqueado pelas regras de elegibilidade',
          reasonCode: item?.reasonCode || '',
          status: 'BLOCKED',
          tone: 'danger',
        })),
      ];
      if (!issueItems.length) {
        templateSendResultIssues.innerHTML = '<p class="template-review-ok">Nenhuma falha ou bloqueio registrado neste envio.</p>';
      } else {
        const displayed = issueItems.slice(0, 8);
        const hiddenCount = issueItems.length - displayed.length;
        templateSendResultIssues.innerHTML = `
          ${displayed.map((item) => {
            const guidance = getTemplateIssueGuidance({
              reasonCode: item?.reasonCode,
              reasonLabel: item?.detail,
              status: item?.status,
            });
            return `
            <article class="template-review-item">
              <strong>${escapeHtml(item.label)}</strong>
              <span>${escapeHtml(item.detail)}</span>
              <span class="template-review-help">${escapeHtml(`${guidance.action}: ${guidance.detail}`)}</span>
            </article>
          `;
          }).join('')}
          ${hiddenCount > 0 ? `<p class="template-review-more">+ ${hiddenCount} ocorrencias alem das exibidas.</p>` : ''}
        `;
      }
    }
  };

  const openTemplateSendResultModal = (payload) => {
    templateSendResultState = {
      open: true,
      payload,
    };
    renderTemplateSendResultModal();
  };

  const closeTemplateSendResultModal = () => {
    templateSendResultState = {
      open: false,
      payload: null,
    };
    renderTemplateSendResultModal();
  };

  const renderTemplateAudienceList = () => {
    if (!templateFlowAudienceList || !templateFlowListMeta) return;
    if (templateFlowState.loading) {
      templateFlowAudienceList.innerHTML = '<div class="empty-state">Carregando audiencia sugerida...</div>';
      templateFlowListMeta.textContent = 'Carregando audiencia sugerida...';
      return;
    }
    const audience = templateFlowState.audience;
    const members = getVisibleTemplateMembers();
    const selectedCount = templateFlowState.selectedPatientIds.size;
    templateFlowListMeta.textContent = `${members.length} pacientes exibidos • ${selectedCount} selecionados`;
    if (!audience || !Array.isArray(audience.members) || !audience.members.length) {
      templateFlowAudienceList.innerHTML = '<div class="empty-state">Nenhum paciente sugerido para este template.</div>';
      return;
    }
    if (!members.length) {
      templateFlowAudienceList.innerHTML = '<div class="empty-state">Nenhum paciente encontrado com esse filtro.</div>';
      return;
    }
    templateFlowAudienceList.innerHTML = members.map((member) => {
      const patientId = getTemplateMemberId(member);
      const selected = templateFlowState.selectedPatientIds.has(patientId);
      const blocked = isTemplateMemberBlocked(member);
      const issueGuidance = blocked ? getTemplateIssueGuidance({
        reasonCode: member?.reasonCode,
        reasonLabel: member?.reasonLabel,
        status: member?.status,
      }) : null;
      const badges = Array.isArray(member?.badges) ? member.badges : [];
      const lastAttendance = member?.lastAttendanceAt ? `Ultimo atendimento: ${formatDateTimeBr(member.lastAttendanceAt)}` : 'Sem atendimento registrado';
      const dentist = member?.responsibleDentistName ? `Dentista: ${member.responsibleDentistName}` : 'Dentista: --';
      const phoneLabel = blocked
        ? (member?.reasonLabel || 'Bloqueado para envio')
        : (member?.phone ? `WhatsApp elegivel: ${member.phone}` : 'WhatsApp elegivel');
      return `
        <article
          class="template-member ${selected ? 'is-selected' : ''} ${blocked ? 'is-blocked' : ''}"
          data-template-member-id="${escapeHtml(patientId)}"
          data-template-member-blocked="${blocked ? 'true' : 'false'}">
          <div class="template-member-top">
            <input
              class="template-member-check"
              type="checkbox"
              data-template-patient-id="${escapeHtml(patientId)}"
              ${selected ? 'checked' : ''}
              ${blocked ? 'disabled' : ''}>
            <div class="template-member-heading">
              <strong>${escapeHtml(member?.patientName || 'Paciente')}</strong>
              <span class="template-member-reason">${escapeHtml(member?.suggestionReasonLabel || member?.suggestionExplanation || 'Paciente sugerido')}</span>
              <div class="template-member-meta">
                <span>${escapeHtml(lastAttendance)}</span>
                <span>${escapeHtml(dentist)}</span>
                <span>${escapeHtml(phoneLabel)}</span>
              </div>
            </div>
            <div class="template-member-status">
              <strong>${blocked ? 'Bloqueado' : 'Elegivel'}</strong>
              <span>${escapeHtml(member?.suggestionExplanation || '')}</span>
            </div>
          </div>
          <div class="template-member-badges">
            ${badges.map((badge) => `<span class="template-badge ${escapeHtml((badge?.tone || 'neutral').toLowerCase())}">${escapeHtml(badge?.label || badge?.code || '')}</span>`).join('')}
          </div>
          ${blocked ? `
            <div class="template-member-block-reason">
              <span>${escapeHtml(member?.reasonLabel || 'Paciente bloqueado pelas regras de elegibilidade.')}</span>
              <small class="template-member-block-help">${escapeHtml(`${issueGuidance?.action || 'Revisar'}: ${issueGuidance?.detail || 'Verifique o cadastro do paciente.'}`)}</small>
            </div>
          ` : ''}
        </article>
      `;
    }).join('');
  };

  const renderTemplateSummary = () => {
    const template = templateFlowState.template || {};
    const audience = templateFlowState.audience;
    const selectedCount = templateFlowState.selectedPatientIds.size;
    const messageDiagnostics = analyzeTemplateMessageDraft(templateFlowMessage?.value || getTemplateBaseMessage(template) || '');
    if (templateFlowCategory) templateFlowCategory.textContent = `${template.category || 'Campanha assistida'} • Impacto ${getTemplateImpact(template)}`;
    if (templateFlowTitle) templateFlowTitle.textContent = getTemplateTitle(template);
    if (templateFlowDescription) templateFlowDescription.textContent = getTemplateDescription(template) || 'Template orientado para marketing clinico leve.';
    if (templateFlowTotal) templateFlowTotal.textContent = String(audience?.total || 0);
    if (templateFlowEligible) templateFlowEligible.textContent = String(audience?.includedCount || 0);
    if (templateFlowBlocked) templateFlowBlocked.textContent = String(audience?.blockedCount || 0);
    if (templateFlowSelected) templateFlowSelected.textContent = String(selectedCount);
    if (templateFlowObjective) templateFlowObjective.textContent = template.objective || 'Objetivo do template';
    if (templateFlowSegment) templateFlowSegment.textContent = `Segmento sugerido: ${SEGMENT_LABELS[getTemplateSegmentKey(template)] || 'Pacientes da clinica'}`;
    if (templateFlowCta) templateFlowCta.textContent = template.internalCta ? `CTA interno: ${template.internalCta}` : 'CTA interno: abrir fluxo assistido';
    if (templateFlowTags) {
      templateFlowTags.innerHTML = [
        template.priority ? `<span class="template-badge neutral">Prioridade ${escapeHtml(getTemplatePriority(template))}</span>` : '',
        template.segmentSuggestion ? `<span class="template-badge info">${escapeHtml(template.segmentSuggestion)}</span>` : '',
        audience?.resolutionMs ? `<span class="template-badge success">${escapeHtml(`${audience.resolutionMs} ms`)}</span>` : '',
      ].filter(Boolean).join('');
    }
    if (templateFlowMessagePreview) {
      templateFlowMessagePreview.textContent = buildTemplatePreviewText(template, audience);
    }
    if (templateFlowSendBtn) {
      templateFlowSendBtn.disabled = true;
      templateFlowSendBtn.textContent = 'Envio desativado';
    }
    if (templateFlowSelectVisibleBtn) templateFlowSelectVisibleBtn.disabled = templateFlowState.loading || getVisibleEligibleTemplateMembers().length === 0;
    if (templateFlowSelectAllBtn) templateFlowSelectAllBtn.disabled = templateFlowState.loading || !audience?.includedCount;
    if (templateFlowClearBtn) templateFlowClearBtn.disabled = templateFlowState.loading || selectedCount === 0;
  };

  const renderTemplateAudienceCards = () => {
    if (!templateFlowAudienceList || !templateFlowListMeta) return;
    if (templateFlowState.loading) {
      templateFlowAudienceList.innerHTML = '<div class="empty-state">Carregando audiencia sugerida...</div>';
      templateFlowListMeta.textContent = 'Carregando audiencia sugerida...';
      return;
    }
    const audience = templateFlowState.audience;
    const members = getVisibleTemplateMembers();
    const selectedCount = templateFlowState.selectedPatientIds.size;
    templateFlowListMeta.textContent = `${members.length} pacientes visiveis | ${selectedCount} selecionados`;
    if (!audience || !Array.isArray(audience.members) || !audience.members.length) {
      templateFlowAudienceList.innerHTML = '<div class="empty-state">Nenhum paciente sugerido para este template.</div>';
      return;
    }
    if (!members.length) {
      templateFlowAudienceList.innerHTML = '<div class="empty-state">Nenhum paciente encontrado com esse filtro.</div>';
      return;
    }
    templateFlowAudienceList.innerHTML = members.map((member) => {
      const patientId = getTemplateMemberId(member);
      const selected = templateFlowState.selectedPatientIds.has(patientId);
      const blocked = isTemplateMemberBlocked(member);
      const issueGuidance = blocked ? getTemplateIssueGuidance({
        reasonCode: member?.reasonCode,
        reasonLabel: member?.reasonLabel,
        status: member?.status,
      }) : null;
      const badges = Array.isArray(member?.badges) ? member.badges : [];
      const lastAttendance = member?.lastAttendanceAt ? `Ultimo atendimento: ${formatDateTimeBr(member.lastAttendanceAt)}` : 'Sem atendimento registrado';
      const dentist = member?.responsibleDentistName ? `Dentista: ${member.responsibleDentistName}` : 'Dentista: --';
      const phoneLabel = blocked
        ? (member?.reasonLabel || 'Bloqueado para envio')
        : (member?.phone ? `WhatsApp: ${member.phone}` : 'Sem telefone valido');
      const personalizedMessage = buildTemplateMessageForMember(templateFlowState.template || {}, member);
      return `
        <article
          class="template-member ${selected ? 'is-selected' : ''} ${blocked ? 'is-blocked' : ''}"
          data-template-member-id="${escapeHtml(patientId)}"
          data-template-member-blocked="${blocked ? 'true' : 'false'}">
          <div class="template-member-top">
            <div class="template-member-heading">
              <strong>${escapeHtml(member?.patientName || 'Paciente')}</strong>
              <span class="template-member-reason">${escapeHtml(member?.suggestionReasonLabel || member?.suggestionExplanation || 'Paciente sugerido')}</span>
              <div class="template-member-meta">
                <span>${escapeHtml(lastAttendance)}</span>
                <span>${escapeHtml(dentist)}</span>
                <span>${escapeHtml(phoneLabel)}</span>
              </div>
            </div>
            <div class="template-member-status">
              <strong>${blocked ? 'Bloqueado' : 'Elegivel'}</strong>
              <span>${escapeHtml(member?.suggestionExplanation || 'Paciente elegivel para contato manual.')}</span>
            </div>
          </div>
          <div class="template-member-badges">
            ${badges.map((badge) => `<span class="template-badge ${escapeHtml((badge?.tone || 'neutral').toLowerCase())}">${escapeHtml(badge?.label || badge?.code || '')}</span>`).join('')}
          </div>
          ${blocked ? `
            <div class="template-member-block-reason">
              <span>${escapeHtml(member?.reasonLabel || 'Paciente bloqueado pelas regras de elegibilidade.')}</span>
              <small class="template-member-block-help">${escapeHtml(`${issueGuidance?.action || 'Revisar'}: ${issueGuidance?.detail || 'Verifique o cadastro do paciente.'}`)}</small>
            </div>
          ` : ''}
          <div class="template-member-actions">
            <button type="button" class="btn-small ghost" data-template-patient-action="whatsapp" data-template-patient-id="${escapeHtml(patientId)}" ${member?.phone ? '' : 'disabled'}>Abrir WhatsApp</button>
            <button type="button" class="btn-small ghost" data-template-patient-action="copy" data-template-patient-id="${escapeHtml(patientId)}">Copiar mensagem</button>
            <button type="button" class="btn-small ghost" data-template-patient-action="prontuario" data-template-patient-id="${escapeHtml(patientId)}">Abrir prontuario</button>
          </div>
          <pre class="template-member-message">${escapeHtml(personalizedMessage || 'Mensagem indisponivel para este paciente.')}</pre>
        </article>
      `;
    }).join('');
  };

  const renderTemplateManualSearchPicker = () => {
    if (!templateFlowManualSearchPicker || !templateFlowManualSearchWrap) return;
    const shouldOpen = Boolean(templateFlowState.open && templateFlowState.manualSearchPickerOpen);
    templateFlowManualSearchWrap.classList.toggle('is-open', shouldOpen);
    if (!shouldOpen) {
      templateFlowManualSearchPicker.hidden = true;
      templateFlowManualSearchPicker.innerHTML = '';
      return;
    }

    templateFlowManualSearchPicker.hidden = false;
    if (templateFlowState.loading) {
      templateFlowManualSearchPicker.innerHTML = '<div class="empty-state">Carregando pacientes da clinica...</div>';
      return;
    }

    if (!campaignPatients.length) {
      templateFlowManualSearchPicker.innerHTML = '<div class="empty-state">Nenhum paciente cadastrado nesta clinica.</div>';
      return;
    }

    const visiblePatients = getVisibleManualPatients();
    if (!visiblePatients.length) {
      templateFlowManualSearchPicker.innerHTML = '<div class="empty-state">Nenhum paciente encontrado com essa busca.</div>';
      return;
    }

    const displayedPatients = visiblePatients.slice(0, 12);
    const selectedCount = templateFlowState.manualSelectedPatientIds.size;
    templateFlowManualSearchPicker.innerHTML = `
      <p class="template-search-picker-meta">${displayedPatients.length} de ${visiblePatients.length} pacientes da clinica</p>
      ${displayedPatients.map((patient) => {
        const patientId = getCampaignPatientId(patient);
        const selected = templateFlowState.manualSelectedPatientIds.has(patientId);
        const phone = getPatientPhone(patient);
        const helperLabel = phone
          ? `${phone} | Prontuario ${String(patient?.prontuario || patientId)}`
          : `Prontuario ${String(patient?.prontuario || patientId)}`;
        return `
          <button type="button" class="campaign-patient-option${selected ? ' selected' : ''}" data-template-manual-patient-id="${escapeHtml(patientId)}">
            <span>
              <strong>${escapeHtml(getCampaignPatientLabel(patient))}</strong>
              <small>${escapeHtml(helperLabel)}</small>
            </span>
            <em>${selected ? 'Selecionado' : 'Adicionar'}</em>
          </button>
        `;
      }).join('')}
      ${visiblePatients.length > displayedPatients.length ? `<p class="template-search-picker-more">Continue digitando para refinar os ${visiblePatients.length} pacientes da clinica.</p>` : ''}
      ${selectedCount > 0 ? `<p class="template-search-picker-more">${selectedCount} paciente(s) ja escolhidos manualmente.</p>` : ''}
    `;
  };

  const renderTemplateManualSelectedPatients = () => {
    if (!templateFlowManualSelected) return;
    const selectedPatients = getTemplateManualSelectedPatients();
    if (!selectedPatients.length) {
      templateFlowManualSelected.innerHTML = '<span class="campaign-selected-empty">Nenhum paciente escolhido manualmente.</span>';
      return;
    }

    templateFlowManualSelected.innerHTML = selectedPatients.map((patient) => {
      const patientId = getCampaignPatientId(patient);
      return `
        <button type="button" class="campaign-patient-chip" data-remove-template-manual-patient="${escapeHtml(patientId)}">
          <span>${escapeHtml(getCampaignPatientLabel(patient))}</span>
          <strong aria-hidden="true">&times;</strong>
        </button>
      `;
    }).join('');
  };

  const renderTemplateManualSelection = () => {
    const selectedCount = templateFlowState.manualSelectedPatientIds.size;
    const visiblePatients = getVisibleManualPatients();
    if (templateFlowManualMeta) {
      templateFlowManualMeta.textContent = selectedCount
        ? `${selectedCount} paciente(s) escolhidos manualmente | ${getTemplateSelectionCount()} na campanha`
        : 'Busque e marque pacientes especificos da sua clinica.';
    }
    if (templateFlowManualSelectVisibleBtn) {
      templateFlowManualSelectVisibleBtn.disabled = templateFlowState.loading || visiblePatients.length === 0;
    }
    if (templateFlowManualClearBtn) {
      templateFlowManualClearBtn.disabled = templateFlowState.loading || selectedCount === 0;
    }
    renderTemplateManualSearchPicker();
    renderTemplateManualSelectedPatients();
  };

  const renderTemplateSummaryPanel = () => {
    const template = templateFlowState.template || {};
    const audience = templateFlowState.audience;
    const selectedCount = getTemplateSelectionCount();
    const messageDiagnostics = analyzeTemplateMessageDraft(templateFlowMessage?.value || getTemplateBaseMessage(template) || '');
    if (templateFlowCategory) templateFlowCategory.textContent = `${template.category || 'Campanha'} | Impacto ${getTemplateImpact(template)}`;
    if (templateFlowTitle) templateFlowTitle.textContent = getTemplateTitle(template);
    if (templateFlowDescription) templateFlowDescription.textContent = getTemplateDescription(template) || 'Campanha estrategica com escolha manual de pacientes.';
    if (templateFlowTotal) templateFlowTotal.textContent = String(audience?.total || 0);
    if (templateFlowEligible) templateFlowEligible.textContent = String(audience?.includedCount || 0);
    if (templateFlowBlocked) templateFlowBlocked.textContent = String(audience?.blockedCount || 0);
    if (templateFlowSelected) templateFlowSelected.textContent = String(selectedCount);
    if (templateFlowObjective) templateFlowObjective.textContent = getTemplateObjective(template) || 'Objetivo do template';
    if (templateFlowSegment) templateFlowSegment.textContent = `Segmento sugerido: ${SEGMENT_LABELS[getTemplateSegmentKey(template)] || 'Pacientes da clinica'}`;
    if (templateFlowCta) templateFlowCta.textContent = template.internalCta ? `CTA interno: ${template.internalCta}` : 'CTA interno: abrir fluxo assistido';
    if (templateFlowTags) {
      templateFlowTags.innerHTML = [
        template.priority ? `<span class="template-badge neutral">Prioridade ${escapeHtml(getTemplatePriority(template))}</span>` : '',
        template.segmentSuggestion ? `<span class="template-badge info">${escapeHtml(template.segmentSuggestion)}</span>` : '',
        audience?.resolutionMs ? `<span class="template-badge success">${escapeHtml(`${audience.resolutionMs} ms`)}</span>` : '',
      ].filter(Boolean).join('');
    }
    if (templateFlowMessagePreview) {
      templateFlowMessagePreview.textContent = buildTemplatePreviewText(template, audience);
    }
    if (templateFlowSendBtn) {
      templateFlowSendBtn.disabled = messageDiagnostics.isEmpty;
      templateFlowSendBtn.textContent = 'Copiar mensagem base';
    }
    if (templateFlowScheduleBtn) templateFlowScheduleBtn.hidden = true;
    if (templateFlowSelectVisibleBtn) templateFlowSelectVisibleBtn.disabled = templateFlowState.loading || getVisibleEligibleTemplateMembers().length === 0;
    if (templateFlowSelectAllBtn) templateFlowSelectAllBtn.disabled = templateFlowState.loading || !audience?.includedCount;
    if (templateFlowClearBtn) templateFlowClearBtn.disabled = templateFlowState.loading || selectedCount === 0;
  };

  const renderTemplateReviewPanel = () => {
    if (!templateFlowReviewTitle || !templateFlowReviewCount || !templateFlowReviewList || !templateFlowBlockedSummary) return;
    const selectedEntries = getTemplateSelectionEntries();
    const blockedMembers = (Array.isArray(templateFlowState.audience?.members) ? templateFlowState.audience.members : [])
      .filter((member) => isTemplateMemberBlocked(member));

    if (templateFlowState.loading) {
      templateFlowReviewTitle.textContent = 'Pacientes escolhidos';
      templateFlowReviewCount.textContent = 'Carregando revisao final...';
      templateFlowReviewList.innerHTML = '';
      templateFlowBlockedSummary.innerHTML = '';
      return;
    }

    templateFlowReviewTitle.textContent = selectedEntries.length ? 'Pacientes escolhidos' : 'Revise a audiencia final';

    if (!selectedEntries.length) {
      templateFlowReviewCount.textContent = 'Nenhum paciente escolhido ainda.';
      templateFlowReviewList.innerHTML = '<p class="template-review-empty">Use a busca dos pacientes da clinica para adicionar contatos especificos alem das sugestoes.</p>';
    } else {
      const displayedEntries = selectedEntries.slice(0, 6);
      const hiddenCount = selectedEntries.length - displayedEntries.length;
      templateFlowReviewCount.textContent = `${selectedEntries.length} pacientes escolhidos para contato manual.`;
      templateFlowReviewList.innerHTML = `
        ${displayedEntries.map((entry) => `
          <article class="template-review-item">
            <strong>${escapeHtml(entry?.patientName || 'Paciente')}</strong>
            <span>${escapeHtml(entry?.sourceLabel || entry?.reasonLabel || 'Paciente escolhido')}</span>
            <small class="template-review-help">${escapeHtml(entry?.phone ? `WhatsApp: ${entry.phone}` : 'Sem telefone valido')}</small>
            <div class="template-member-actions">
              <button type="button" class="btn-small ghost" data-template-patient-action="whatsapp" data-template-patient-id="${escapeHtml(entry?.patientId || '')}" ${entry?.phone ? '' : 'disabled'}>Abrir WhatsApp</button>
              <button type="button" class="btn-small ghost" data-template-patient-action="copy" data-template-patient-id="${escapeHtml(entry?.patientId || '')}">Copiar mensagem</button>
              <button type="button" class="btn-small ghost" data-template-patient-action="prontuario" data-template-patient-id="${escapeHtml(entry?.patientId || '')}">Abrir prontuario</button>
            </div>
          </article>
        `).join('')}
        ${hiddenCount > 0 ? `<p class="template-review-more">+ ${hiddenCount} pacientes escolhidos alem dos exibidos.</p>` : ''}
      `;
    }

    if (!blockedMembers.length) {
      templateFlowBlockedSummary.innerHTML = '<p class="template-review-ok">Nenhum bloqueio real detectado nesta audiencia.</p>';
      return;
    }

    const blockedReasons = new Map();
    blockedMembers.forEach((member) => {
      const reason = String(member?.reasonLabel || 'Bloqueio de elegibilidade').trim() || 'Bloqueio de elegibilidade';
      blockedReasons.set(reason, Number(blockedReasons.get(reason) || 0) + 1);
    });

    const topReasons = [...blockedReasons.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3);

    templateFlowBlockedSummary.innerHTML = `
      <p class="template-review-blocked-title">${blockedMembers.length} pacientes ficaram bloqueados.</p>
      <div class="template-review-blocked-list">
        ${topReasons.map(([reason, count]) => `<span class="template-badge danger">${escapeHtml(`${count} | ${reason}`)}</span>`).join('')}
      </div>
    `;
  };

  const renderTemplateFlow = () => {
    renderTemplateFlowFilters();
    renderTemplateSummaryPanel();
    renderTemplateSearchPicker();
    renderTemplateSelectionHint();
    renderTemplateAudienceCards();
    renderTemplateManualSelection();
    renderTemplateMessageAssist();
    renderTemplateReviewPanel();
    renderTemplateSendConfirmation();
  };

  const setTemplateSearchPickerOpen = (open) => {
    templateFlowState.searchPickerOpen = Boolean(open);
    if (open) templateFlowState.manualSearchPickerOpen = false;
    renderTemplateFlow();
  };

  const setTemplateManualSearchPickerOpen = (open) => {
    templateFlowState.manualSearchPickerOpen = Boolean(open);
    if (open) templateFlowState.searchPickerOpen = false;
    renderTemplateFlow();
  };

  const closeTemplateFlowModal = () => {
    if (templateFlowState.sending) return;
    if (!templateFlowModal) return;
    templateFlowModal.classList.remove('open');
    templateFlowModal.setAttribute('aria-hidden', 'true');
    closeTemplateSendConfirmModal();
    if (templateFlowSearch) templateFlowSearch.value = '';
    if (templateFlowManualSearch) templateFlowManualSearch.value = '';
    if (templateFlowCampaignName) templateFlowCampaignName.value = '';
    if (templateFlowMessage) templateFlowMessage.value = '';
    resetTemplateFlowState();
    renderTemplateFlow();
  };

  const loadTemplateAudience = async (template = {}, source = 'campanhas-template', options = {}) => {
    if (!campanhasApi.resolveAudience) {
      alert('Segmentacao central indisponivel.');
      return;
    }
    templateFlowState.loading = true;
    templateFlowState.audience = null;
    templateFlowState.selectedPatientIds = new Set();
    templateFlowState.manualSelectedPatientIds = new Set();
    renderTemplateFlow();
    const templateId = String(template?.id || '').trim();
    const startedAt = Date.now();
    logTemplateFlow('campaign_template_audience_requested', { templateId });
    try {
      const audience = await campanhasApi.resolveAudience({
        campaignId: String(options?.campaignId || '').trim(),
        templateId,
        segmentKey: getTemplateSegmentKey(template),
        filters: options?.filters || {},
      });
      if (audience?.unavailable) {
        templateFlowState.audience = audience;
        templateFlowState.loading = false;
        renderTemplateFlow();
        return;
      }
      const selectedIds = new Set(
        (Array.isArray(audience?.members) ? audience.members : [])
          .filter((member) => member?.included)
          .map((member) => String(member?.patientId || '').trim())
          .filter(Boolean),
      );
      templateFlowState.template = audience?.template || template;
      templateFlowState.audience = audience || null;
      templateFlowState.selectedPatientIds = selectedIds;
      templateFlowState.loading = false;
      renderTemplateFlow();
      logTemplateFlow('campaign_template_audience_resolved', {
        templateId,
        suggestedAudienceSize: Number(audience?.total || 0),
        finalAudienceSize: selectedIds.size,
        resolutionMs: Date.now() - startedAt,
      });
    } catch (err) {
      templateFlowState.loading = false;
      templateFlowState.audience = {
        unavailable: true,
        reason: err?.message || 'Falha ao carregar audiencia.',
        total: 0,
        includedCount: 0,
        blockedCount: 0,
        members: [],
        summary: { quickFilters: {} },
      };
      renderTemplateFlow();
    }
  };

  const openTemplateFlowModal = async (template = {}, source = 'campanhas-template', options = {}) => {
    if (!canOperateCampaigns) {
      alert('Seu perfil nao pode usar templates de campanha.');
      return;
    }
    closeTemplateSendResultModal();
    resetTemplateFlowState();
    templateFlowState.open = true;
    templateFlowState.template = template;
    templateFlowState.source = source;
    if (templateFlowCampaignName) templateFlowCampaignName.value = String(options?.campaignName || getTemplateTitle(template) || '').trim();
    if (templateFlowMessage) templateFlowMessage.value = typeof options?.message === 'string'
      ? options.message
      : getTemplateBaseMessage(template);
    if (templateFlowSearch) templateFlowSearch.value = '';
    if (templateFlowManualSearch) templateFlowManualSearch.value = '';
    if (templateFlowModal) {
      templateFlowModal.classList.add('open');
      templateFlowModal.setAttribute('aria-hidden', 'false');
    }
    renderTemplateFlow();
    logTemplateFlow('campaign_template_selected', {
      templateId: String(template?.id || '').trim(),
      source,
    });
    await loadTemplateAudience(template, source, options);
    applyTemplateFlowOpenOptions(options);
  };

  const toggleTemplatePatientSelection = (patientId, selected) => {
    const normalizedId = String(patientId || '').trim();
    if (!normalizedId) return;
    if (selected) {
      templateFlowState.selectedPatientIds.add(normalizedId);
    } else {
      templateFlowState.selectedPatientIds.delete(normalizedId);
    }
    logTemplateFlow('campaign_template_patient_selected', {
      templateId: String(templateFlowState.template?.id || '').trim(),
      patientId: normalizedId,
      selected,
      finalAudienceSize: templateFlowState.selectedPatientIds.size,
    });
    renderTemplateFlow();
  };

  const selectAllTemplateAudience = () => {
    const members = Array.isArray(templateFlowState.audience?.members) ? templateFlowState.audience.members : [];
    templateFlowState.selectedPatientIds = new Set(
      members
        .filter((member) => member?.included)
        .map((member) => String(member?.patientId || '').trim())
        .filter(Boolean),
    );
    renderTemplateFlow();
  };

  const selectVisibleTemplateAudience = () => {
    const visibleEligibleMembers = getVisibleEligibleTemplateMembers();
    visibleEligibleMembers.forEach((member) => {
      const patientId = getTemplateMemberId(member);
      if (patientId) templateFlowState.selectedPatientIds.add(patientId);
    });
    renderTemplateFlow();
  };

  const insertTemplateMessageToken = (token) => {
    if (!templateFlowMessage) return;
    const normalizedToken = String(token || '').trim();
    if (!normalizedToken) return;
    const start = Number(templateFlowMessage.selectionStart || 0);
    const end = Number(templateFlowMessage.selectionEnd || start);
    const currentValue = String(templateFlowMessage.value || '');
    const prefix = currentValue.slice(0, start);
    const suffix = currentValue.slice(end);
    const spacerBefore = prefix && !/\s$/.test(prefix) ? ' ' : '';
    const spacerAfter = suffix && !/^\s/.test(suffix) ? ' ' : '';
    templateFlowMessage.value = `${prefix}${spacerBefore}${normalizedToken}${spacerAfter}${suffix}`;
    const nextPos = `${prefix}${spacerBefore}${normalizedToken}`.length;
    templateFlowMessage.focus();
    templateFlowMessage.setSelectionRange(nextPos, nextPos);
    renderTemplateFlow();
  };

  const buildTemplatePayload = (template = {}, options = {}) => {
    const today = getTodayValues();
    const templateName = getTemplateTitle(template);
    const messageTemplate = String(options.message || getTemplateBaseMessage(template) || '').trim();
    return {
      nome: options.nome || templateName,
      periodo: today.month,
      cor: template.color || template.cor || '#2a9d8f',
      descricao: messageTemplate || 'Campanha criada a partir da biblioteca anual Voithos.',
      inicio: options.inicio || today.date,
      fim: options.fim || '',
      canal: 'WhatsApp',
      status: options.status || 'ativa',
      origem: 'clinica',
      publico: 'pacientes_clinica',
      segmentKey: options.segmentKey || getTemplateSegmentKey(template),
      originType: 'TEMPLATE',
      sourceType: 'CAMPAIGN',
      templateId: template.id || '',
      templateTitle: getTemplateTitle(template),
      templateDescription: getTemplateDescription(template),
      templateObjective: template.objective || '',
      templateCategory: template.category || '',
      templatePriority: getTemplatePriority(template),
      templateImpact: getTemplateImpact(template),
      templateVersion: template.version || 1,
      segmentType: getTemplateSegmentKey(template),
      segmentSuggestion: template.segmentSuggestion || '',
      internalCta: template.internalCta || '',
      messageTemplate,
      metadata: {
        template: {
          id: template.id || '',
          version: template.version || 1,
          title: getTemplateTitle(template),
          description: getTemplateDescription(template),
          objective: template.objective || '',
          category: template.category || '',
          segmentType: getTemplateSegmentKey(template),
          segmentSuggestion: template.segmentSuggestion || '',
          priority: getTemplatePriority(template),
          impact: getTemplateImpact(template),
          color: template.color || template.cor || '#2a9d8f',
          internalCta: template.internalCta || '',
          messageTemplate,
        },
        source: 'template_assisted_flow',
      },
    };
  };

  const createCampaignFromTemplate = async (template = {}, source = 'campanhas-template') => openTemplateFlowModal(template, source);

  const renderTemplates = () => {
    if (!templatesPanel) return;
    templatesPanel.hidden = false;
    const monthly = templatesData.monthly || null;
    const monthlyStats = monthly ? templateAudienceCache.get(String(monthly.id || '').trim()) || null : null;
    if (monthlyTemplateTitle) monthlyTemplateTitle.textContent = getTemplateTitle(monthly) || 'Campanha do mes';
    if (monthlyTemplateDesc) monthlyTemplateDesc.textContent = getTemplateDescription(monthly) || 'Sem template mensal no momento.';
    if (monthlyTemplateCta) {
      const monthlyCountLabel = monthlyStats ? `${Number(monthlyStats.eligibleCount || 0)} pacientes elegiveis` : 'Pacientes elegiveis em revisao';
      monthlyTemplateCta.textContent = monthly?.cta ? `Sugestao: ${monthly.cta} | ${monthlyCountLabel}` : monthlyCountLabel;
    }
    if (monthlyTemplateCard) {
      monthlyTemplateCard.style.borderColor = monthly?.cor || '';
      monthlyTemplateCard.style.boxShadow = monthly?.cor ? `0 10px 24px ${monthly.cor}22` : '';
    }
    if (activateMonthlyTemplateBtn) {
      activateMonthlyTemplateBtn.disabled = !canOperateCampaigns || !monthly;
    }
    if (!quickTemplatesGrid) return;
    const templates = Array.isArray(templatesData.annualTemplates) ? templatesData.annualTemplates : [];
    if (!templates.length) {
      quickTemplatesGrid.innerHTML = '<div class="empty-state">Sem templates anuais disponiveis.</div>';
      return;
    }
    quickTemplatesGrid.innerHTML = templates.map((template, idx) => `
      <article class="quick-template-item" style="--tpl-accent:${template.color || template.cor || '#2a9d8f'}">
        <div class="quick-template-top">
          <h4>${escapeHtml(getTemplateTitle(template) || 'Template')}</h4>
          <span class="priority-pill priority-${escapeHtml(String(getTemplatePriority(template)).toLowerCase())}">${escapeHtml(getTemplatePriority(template))}</span>
        </div>
        <p>${escapeHtml(getTemplateDescription(template) || 'Sem descricao')}</p>
        <p class="quick-template-objective">${escapeHtml(getTemplateObjective(template) || 'Campanha sugerida para contato manual.')}</p>
        <small>${escapeHtml(template.category || '')} • ${escapeHtml((templateAudienceCache.get(String(template.id || '').trim())?.eligibleCount ?? '--'))} pacientes elegiveis</small>
        <button type="button" class="btn ghost" data-action="use-template" data-template-index="${idx}" ${canOperateCampaigns ? '' : 'disabled'}>Ver pacientes</button>
      </article>
    `).join('');
  };

  const loadTemplates = async () => {
    const currentMonth = new Date().getMonth() + 1;
    const applyFallbackTemplates = () => {
      const annualTemplates = [...FALLBACK_ANNUAL_TEMPLATES];
      const monthly = annualTemplates.find((item) => Number(item?.month) === currentMonth) || annualTemplates[0] || null;
      templatesData = { monthly, annualTemplates };
    };

    templateAudienceCache = new Map();
    if (!campanhasApi.templates) {
      applyFallbackTemplates();
      renderTemplates();
    } else {
      try {
        const data = await campanhasApi.templates();
        const annualTemplatesFromApi = Array.isArray(data?.annualTemplates)
          ? data.annualTemplates
          : (Array.isArray(data?.quickTemplates) ? data.quickTemplates : []);
        const annualTemplates = Array.isArray(annualTemplatesFromApi) ? annualTemplatesFromApi.filter(Boolean) : [];
        const monthly = data?.monthly || annualTemplates.find((item) => Number(item?.month) === currentMonth) || null;
        templatesData = {
          monthly,
          annualTemplates,
        };
        if (!templatesData.monthly || !templatesData.annualTemplates.length) {
          applyFallbackTemplates();
        }
      } catch (err) {
        console.warn('Erro ao carregar templates de campanha', err);
        applyFallbackTemplates();
      }
    }
    renderTemplates();

    if (!campanhasApi.resolveAudience) return;
    const templatesToResolve = Array.from(new Map(
      (Array.isArray(templatesData.annualTemplates) ? templatesData.annualTemplates : [])
        .filter((template) => String(template?.id || '').trim())
        .map((template) => [String(template.id || '').trim(), template]),
    ).values());
    const statsEntries = await Promise.allSettled(templatesToResolve.map(async (template) => {
      const audience = await campanhasApi.resolveAudience({
        templateId: String(template?.id || '').trim(),
        segmentKey: getTemplateSegmentKey(template),
      });
      if (!audience || audience.unavailable) {
        return [String(template?.id || '').trim(), {
          eligibleCount: 0,
          totalCount: 0,
          blockedCount: 0,
          patientIds: [],
          withPhoneCount: 0,
        }];
      }
      const members = Array.isArray(audience?.members) ? audience.members : [];
      const eligibleMembers = members.filter((member) => member?.included === true);
      return [String(template?.id || '').trim(), {
        eligibleCount: Number(audience?.includedCount || eligibleMembers.length || 0),
        totalCount: Number(audience?.total || members.length || 0),
        blockedCount: Number(audience?.blockedCount || 0),
        patientIds: eligibleMembers.map((member) => String(member?.patientId || '').trim()).filter(Boolean),
        withPhoneCount: eligibleMembers.filter((member) => String(member?.phone || '').trim()).length,
      }];
    }));
    statsEntries.forEach((entry) => {
      if (entry.status !== 'fulfilled' || !Array.isArray(entry.value)) return;
      const [templateId, stats] = entry.value;
      if (!templateId) return;
      templateAudienceCache.set(templateId, stats || null);
    });
    renderTemplates();
  };

  const reloadCampaignsData = async () => {
    await loadCampaignPatients();
    campanhas = await loadCampaigns();
    await loadCampaignAudienceStats();
    await loadTemplates();
    render();
    await updateHealthPanel();
  };

  const render = () => {
    listEl.innerHTML = '';
    const visibleCampaigns = (Array.isArray(campanhas) ? campanhas : []).filter((camp) => {
      const status = String(camp?.status || 'ativa').trim().toLowerCase();
      return !['concluida', 'inativa'].includes(status);
    });
    if (!visibleCampaigns.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'Nenhuma campanha ativa ainda. Escolha uma campanha da biblioteca acima para revisar seus pacientes.';
      listEl.appendChild(empty);
      return;
    }
    visibleCampaigns.forEach((camp) => {
      const stats = campaignAudienceCache.get(String(camp?.id || '').trim()) || null;
      listEl.appendChild(createCard(camp, stats));
    });
  };

  const setSubmitLabel = (label) => {
    const submitBtn = form?.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.textContent = label;
  };

  const openModalWith = (camp = null) => {
    if (!canManage) return;
    setupPublicoField();
    if (camp) {
      editingCampaignId = camp.id || null;
      if (inputNome) inputNome.value = camp.nome || '';
      if (inputDescricao) inputDescricao.value = camp.descricao || '';
      if (inputInicio) inputInicio.value = camp.inicio || '';
      if (inputFim) inputFim.value = camp.fim || '';
      if (selectCanal) selectCanal.value = camp.canal || '';
      if (inputPeriodo) inputPeriodo.value = camp.periodo || '';
      if (inputCor) inputCor.value = camp.cor || '#2a9d8f';
      if (selectStatus) selectStatus.value = camp.status || 'ativa';
      if (selectSegmento) selectSegmento.value = camp.segmentKey || 'all_active';
      selectedCampaignPatientIds = new Set(
        (Array.isArray(camp?.audienceFilters?.selectedPatientIds) ? camp.audienceFilters.selectedPatientIds : [])
          .map((value) => String(value || '').trim())
          .filter(Boolean),
      );
      if (campaignPatientSearch) campaignPatientSearch.value = '';
      setSubmitLabel('Salvar');
    } else {
      editingCampaignId = null;
      selectedCampaignPatientIds = new Set();
      if (campaignPatientSearch) campaignPatientSearch.value = '';
      const today = getTodayValues();
      if (inputInicio && !inputInicio.value) inputInicio.value = today.date;
      if (inputFim && !inputFim.value) inputFim.value = today.date;
      if (inputPeriodo && !inputPeriodo.value) inputPeriodo.value = today.month;
      if (selectCanal && !selectCanal.value) selectCanal.value = 'WhatsApp';
      if (selectStatus && !selectStatus.value) selectStatus.value = 'ativa';
      if (selectSegmento && !selectSegmento.value) selectSegmento.value = 'all_active';
      setSubmitLabel('Adicionar');
    }
    renderCampaignManualAudience();
    refreshSegmentPreview();
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    setTimeout(() => inputNome?.focus(), 50);
  };

  const closeModal = () => {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    form?.reset();
    editingCampaignId = null;
    selectedCampaignPatientIds = new Set();
    if (campaignPatientSearch) campaignPatientSearch.value = '';
    renderCampaignManualAudience();
    setSubmitLabel('Adicionar');
    if (selectPublico) selectPublico.value = 'pacientes_clinica';
    if (selectSegmento) selectSegmento.value = 'all_active';
    if (segmentPreview) segmentPreview.textContent = '';
  };

  const setupPublicoField = () => {
    if (selectPublico) {
      selectPublico.innerHTML = '';
      const option = document.createElement('option');
      option.value = 'pacientes_clinica';
      option.textContent = 'Pacientes da clinica';
      selectPublico.appendChild(option);
      selectPublico.value = 'pacientes_clinica';
      selectPublico.disabled = true;
    }
  };

  const openGlobalsModal = async () => {
    if (!canManage) return;
    globalsModal.classList.add('open');
    globalsModal.setAttribute('aria-hidden', 'false');
    try {
      const globals = await campanhasGlobalApi.list();
      globalsTextarea.value = JSON.stringify(globals || [], null, 2);
    } catch (err) {
      console.error('Erro ao carregar campanhas globais', err);
      globalsTextarea.value = '[]';
    }
    setTimeout(() => globalsTextarea?.focus(), 50);
  };

  const closeGlobalsModal = () => {
    globalsModal.classList.remove('open');
    globalsModal.setAttribute('aria-hidden', 'true');
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!canManage) {
      alert('Apenas admin e recepcionista podem criar campanhas.');
      return;
    }
    const periodoVal = inputPeriodo?.value || '';
    const inicioVal = inputInicio?.value || '';
    const fimVal = inputFim?.value || '';
    if (inicioVal && fimVal) {
      const inicioDate = new Date(inicioVal);
      const fimDate = new Date(fimVal);
      if (fimDate < inicioDate) {
        alert('A data de termino nao pode ser anterior ao inicio.');
        return;
      }
    }
    if (!selectCanal?.value) {
      alert('Selecione o meio de comunicacao.');
      return;
    }
    const payload = {
      nome: inputNome?.value.trim() || 'Campanha',
      periodo: periodoVal,
      cor: inputCor?.value || '#2a9d8f',
      descricao: inputDescricao?.value.trim() || '',
      inicio: inicioVal,
      fim: fimVal,
      canal: selectCanal?.value || '',
      status: selectStatus?.value || 'ativa',
      origem: 'clinica',
      publico: 'pacientes_clinica',
      segmentKey: String(selectSegmento?.value || 'all_active').trim().toLowerCase(),
    };
    const manualPatientIds = Array.from(selectedCampaignPatientIds);
    if (manualPatientIds.length) {
      payload.audienceFilters = { selectedPatientIds: manualPatientIds };
    }

    try {
      if (editingCampaignId) {
        const updated = await campanhasApi.update({ id: editingCampaignId, changes: payload });
        if (updated) {
          await reloadCampaignsData();
          emitCampaignsUpdated('campanhas-update');
          closeModal();
        }
        return;
      }
      const created = await campanhasApi.create(payload);
      if (created) {
        await reloadCampaignsData();
        emitCampaignsUpdated('campanhas-create');
        closeModal();
      }
    } catch (err) {
      console.error('Erro ao salvar campanha', err);
      alert('Nao foi possivel salvar a campanha.');
    }
  };

  const buildCampaignMessage = (camp, paciente) => {
    const nomePaciente = paciente?.nome || paciente?.fullName || paciente?.patientName || 'paciente';
    const nomeCampanha = camp?.nome || 'Campanha';
    const descricao = camp?.descricao || '';
    return `Ola, ${nomePaciente}. ${nomeCampanha}: ${descricao}`.trim();
  };

  const toDigits = (value) => String(value || '').replace(/\D/g, '');

  const executeBatchDispatch = async ({ camp, batch, dispatchMetadata = null } = {}) => {
    throw new Error('Disparo em massa de campanhas foi desativado.');
    let dispatches = Array.isArray(batch?.dispatches) ? batch.dispatches : [];
    let blocked = dispatches.filter((item) => String(item?.status || '').trim().toUpperCase() === 'BLOCKED').length;
    const blockedItems = dispatches
      .filter((item) => String(item?.status || '').trim().toUpperCase() === 'BLOCKED')
      .map((item) => ({
        patientId: item?.patientId || '',
        patientName: item?.patientName || 'Paciente',
        phone: item?.phone || '',
        reasonCode: item?.metadata?.reasonCode || '',
        reason: item?.metadata?.reasonLabel || item?.lastError || item?.errorMessage || 'Bloqueado pelas regras de elegibilidade',
      }));
    if (!dispatches.length) {
      const pacientes = await (patientsApi.list?.() || []);
      const segmentKey = String(camp?.segmentKey || 'all_active').trim().toLowerCase();
      let allowedPatients = null;
      if (campanhasApi.resolveAudience) {
        try {
          const audience = await campanhasApi.resolveAudience({ segmentKey });
          if (audience?.unavailable) {
            alert(audience?.reason || 'Segmento indisponivel para disparo.');
            return;
          }
          const ids = new Set((Array.isArray(audience?.patientIds) ? audience.patientIds : []).map((id) => String(id || '').trim()).filter(Boolean));
          allowedPatients = ids;
          blocked = Number(audience?.blockedCount || 0);
        } catch (err) {
          console.warn('Falha ao resolver audiencia da campanha em fallback local', err);
        }
      }
      dispatches = (Array.isArray(pacientes) ? pacientes : [])
        .filter((p) => p?.allowsMessages !== false)
        .filter((p) => {
          if (!allowedPatients) return true;
          const keys = [p?.prontuario, p?.id, p?._id, p?.patientId, p?.pacienteId]
            .map((value) => String(value || '').trim())
            .filter(Boolean);
          return keys.some((key) => allowedPatients.has(key));
        })
        .map((p) => ({
          dispatchId: '',
          patientId: p?.prontuario || p?.id || p?._id || '',
          patientName: p?.nome || p?.fullName || '',
          phone: p?.telefone || p?.phone || p?.celular || p?.whatsapp || '',
          body: buildCampaignMessage(camp, p),
          status: toDigits(p?.telefone || p?.phone || p?.celular || p?.whatsapp || '').length >= 10 ? 'PENDING' : 'BLOCKED',
          reasonCode: toDigits(p?.telefone || p?.phone || p?.celular || p?.whatsapp || '').length >= 10 ? '' : 'NO_PHONE',
          reasonLabel: toDigits(p?.telefone || p?.phone || p?.celular || p?.whatsapp || '').length >= 10 ? '' : 'Paciente sem telefone valido para WhatsApp.',
        }));
      blockedItems.push(
        ...dispatches
          .filter((item) => String(item?.status || '').trim().toUpperCase() === 'BLOCKED')
          .map((item) => ({
            patientId: item?.patientId || '',
            patientName: item?.patientName || 'Paciente',
            phone: item?.phone || '',
            reasonCode: item?.reasonCode || '',
            reason: item?.reasonLabel || 'Bloqueado pelas regras de elegibilidade',
          })),
      );
    }
    const elegiveis = dispatches.filter((item) => String(item?.status || '').trim().toUpperCase() === 'PENDING');
    if (!elegiveis.length) {
      return { sent: 0, failed: 0, blocked, eligible: 0, sentItems: [], failedItems: [], blockedItems };
    }

    const sendBatchId = String(batch?.sendBatchId || batch?.batchId || '').trim();
    let sent = 0;
    let failed = 0;
    const sentItems = [];
    const failedItems = [];
    for (const item of elegiveis) {
      const patientId = item?.patientId || '';
      try {
        if (false) {
          const dispatchResult = await Promise.reject(new Error('Disparo de campanha desativado.'));
          if (!dispatchResult?.success) {
            throw new Error(dispatchResult?.error || 'Falha no envio do WhatsApp');
          }
        } else {
          await Promise.reject(new Error('Disparo de campanha desativado.'));
        }
        await campanhasApi.logDelivery?.({
          dispatchId: item?.dispatchId || '',
          campaignId: camp.id || '',
          patientId,
          sendBatchId,
          channel: 'WHATSAPP',
          status: 'SENT',
          metadata: dispatchMetadata,
        });
        sent += 1;
        sentItems.push({
          patientId,
          patientName: item?.patientName || 'Paciente',
          phone: item?.phone || '',
        });
      } catch (err) {
        await campanhasApi.logDelivery?.({
          dispatchId: item?.dispatchId || '',
          campaignId: camp.id || '',
          patientId,
          sendBatchId,
          channel: 'WHATSAPP',
          status: 'FAILED',
          errorMessage: err?.message || 'Falha no envio',
          metadata: dispatchMetadata,
        });
        failed += 1;
        failedItems.push({
          patientId,
          patientName: item?.patientName || 'Paciente',
          phone: item?.phone || '',
          reasonCode: 'DELIVERY_FAILED',
          reason: err?.message || 'Falha no envio',
        });
      }
    }
    return { sent, failed, blocked, eligible: elegiveis.length, sentItems, failedItems, blockedItems };
  };

  const dispatchCampaignWhatsApp = async (camp) => {
    alert('Disparo em massa de campanhas foi desativado. Revise os pacientes manualmente.');
    return;
    const canSendCampaign = false;
    if (!camp || !canSendCampaign) {
      alert('Envio de WhatsApp indisponivel.');
      return;
    }
    let batch = null;
    try {
      batch = null;
    } catch (err) {
      console.error('Falha ao criar lote central da campanha', err);
      alert(err?.message || 'Nao foi possivel criar o lote da campanha.');
      return;
    }

    const pending = Array.isArray(batch?.dispatches)
      ? batch.dispatches.filter((item) => String(item?.status || '').trim().toUpperCase() === 'PENDING').length
      : Number(batch?.pendingCount || 0);
    const blocked = Array.isArray(batch?.dispatches)
      ? batch.dispatches.filter((item) => String(item?.status || '').trim().toUpperCase() === 'BLOCKED').length
      : Number(batch?.blockedCount || 0);
    const ok = confirm(`Disparar campanha para ${pending} paciente(s)?${blocked > 0 ? ` Bloqueados: ${blocked}.` : ''}`);
    if (!ok) return;
    const summary = await executeBatchDispatch({ camp, batch });
    if (!summary.eligible) {
      alert(summary.blocked > 0
        ? `Nao ha pacientes elegiveis para envio. Bloqueados no lote: ${summary.blocked}.`
        : 'Nao ha pacientes elegiveis para envio.');
      return;
    }
    alert(`Disparo concluido. Sucesso: ${summary.sent} | Falhas: ${summary.failed}`);
    await reloadCampaignsData();
    emitCampaignsUpdated('campanhas-dispatch');
  };

  const performTemplateSendNow = async (payload) => {
    alert('Disparo em massa de campanhas foi desativado. Use as acoes manuais por paciente.');
    return;
    const canSendCampaign = false;
    if (!canSendCampaign) {
      alert('Envio de WhatsApp indisponivel.');
      return;
    }

    const {
      template,
      audience,
      templateId,
      draftMessage,
      selectedEligibleMembers,
    } = payload || {};

    let createdCampaignId = '';
    templateFlowState.sending = true;
    renderTemplateFlow();
    logTemplateFlow('campaign_template_send_started', {
      templateId,
      suggestedAudienceSize: Number(audience?.total || 0),
      finalAudienceSize: selectedEligibleMembers.length,
    });

    try {
      const created = await campanhasApi.create(buildTemplatePayload(template, {
        nome: templateFlowCampaignName?.value.trim() || getTemplateTitle(template),
        message: draftMessage,
        status: 'ativa',
      }));
      if (!created?.id) throw new Error('Nao foi possivel criar a campanha a partir do template.');

      const campaign = normalizeCampaign(created);
      createdCampaignId = campaign.id || '';
      const batch = null;
      const summary = await executeBatchDispatch({
        camp: campaign,
        batch,
        dispatchMetadata: {
          templateId,
          suggestedAudienceSize: Number(audience?.total || 0),
          finalAudienceSize: selectedEligibleMembers.length,
        },
      });
      if (!summary.eligible) {
        throw new Error(summary.blocked > 0
          ? `Nao ha pacientes elegiveis para envio. Bloqueados no lote: ${summary.blocked}.`
          : 'Nao ha pacientes elegiveis para envio.');
      }
      logTemplateFlow('campaign_template_send_completed', {
        templateId,
        campaignId: campaign.id,
        suggestedAudienceSize: Number(audience?.total || 0),
        finalAudienceSize: selectedEligibleMembers.length,
        sentCount: summary.sent,
        failedCount: summary.failed,
        blockedCount: summary.blocked,
      });
      const resultPayload = {
        templateId,
        campaignId: campaign.id,
        campaignName: campaign.nome || getTemplateTitle(template),
        template,
        draftMessage,
        summary,
      };
      closeTemplateFlowModal();
      await reloadCampaignsData();
      emitCampaignsUpdated('campanhas-template-send');
      openTemplateSendResultModal(resultPayload);
    } catch (err) {
      console.error('Erro ao enviar campanha por template', err);
      logTemplateFlow('campaign_template_send_failed', {
        templateId,
        campaignId: createdCampaignId,
        suggestedAudienceSize: Number(audience?.total || 0),
        finalAudienceSize: selectedEligibleMembers.length,
        error: err?.message || 'Falha no envio',
      });
      alert(err?.message || 'Nao foi possivel enviar a campanha por template.');
    } finally {
      if (templateFlowState.open) {
        templateFlowState.sending = false;
        templateFlowState.confirmOpen = false;
        templateFlowState.confirmPayload = null;
        renderTemplateFlow();
      }
    }
  };

  const handleTemplateSendNow = async () => {
    if (templateFlowState.loading) return;
    const draftMessage = String(templateFlowMessage?.value || '').trim();
    if (!draftMessage) {
      alert('Escreva ou ajuste a mensagem antes de copiar.');
      return;
    }
    await copyTextToClipboard(draftMessage);
    alert('Mensagem base copiada. Agora escolha o paciente e abra o WhatsApp manualmente.');
  };

  const init = async () => {
    currentUser = await ensureUser();
    window.__VOITHOS_ACTIVE_CLINIC_ID__ = String(currentUser?.clinicId || '').trim();
    canManage = CAMPAIGN_MANAGE_ROLES.has(String(currentUser?.tipo || '').trim().toLowerCase());
    canOperateCampaigns = CAMPAIGN_OPERATE_ROLES.has(String(currentUser?.tipo || '').trim().toLowerCase());
    if (openBtn) {
      openBtn.style.display = 'none';
    }
    if (openGlobalsBtn) {
      openGlobalsBtn.style.display = 'none';
    }
    if (activateMonthlyTemplateBtn) {
      activateMonthlyTemplateBtn.style.display = canOperateCampaigns ? '' : 'none';
    }
    if (templatesPanel) templatesPanel.hidden = false;
    await loadCampaignPatients();
    campanhas = await loadCampaigns();
    await loadCampaignAudienceStats();
    await loadTemplates();
    setupPublicoField();
    renderTemplateFlow();
    render();
    await updateHealthPanel();
  };
  const handleGlobalsSubmit = async (ev) => {
    ev.preventDefault();
    if (!canManage) return;
    const raw = globalsTextarea?.value || '[]';
    let parsed = [];
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      alert('JSON invalido.');
      return;
    }
    const validationError = validateGlobalsPayload(parsed);
    if (validationError) {
      alert(validationError);
      return;
    }
    try {
      await campanhasGlobalApi.save(parsed);
      await reloadCampaignsData();
      emitCampaignsUpdated('campanhas-globais-save');
      closeGlobalsModal();
    } catch (err) {
      console.error('Erro ao salvar campanhas globais', err);
      const message = err?.message || 'Nao foi possivel salvar as campanhas globais.';
      alert(message);
    }
  };

  openBtn?.addEventListener('click', () => openModalWith());
  activateMonthlyTemplateBtn?.addEventListener('click', () => {
    if (!templatesData.monthly) return;
    createCampaignFromTemplate(templatesData.monthly, 'campanhas-monthly-template');
  });

  openGlobalsBtn?.addEventListener('click', openGlobalsModal);
  closeBtn?.addEventListener('click', closeModal);
  globalsCloseBtn?.addEventListener('click', closeGlobalsModal);
  cancelBtn?.addEventListener('click', closeModal);

  listEl?.addEventListener('click', async (ev) => {
    const target = ev.target;
    const actionButton = target instanceof HTMLElement ? target.closest('button[data-action]') : null;
    if (actionButton) {
      const action = actionButton.dataset.action;
      const id = actionButton.dataset.id || '';
      if (!action || !id) return;
      const camp = campanhas.find((c) => c.id === id);
      if (!camp) return;
      if (action === 'view-patients') {
        const template = getCampaignTemplateModel(camp);
        await openTemplateFlowModal(template, 'campanhas-card-view', {
          campaignId: camp.id || '',
          campaignName: camp.nome || getTemplateTitle(template),
          message: getCampaignSuggestedMessage(camp),
          filters: camp?.audienceFilters || {},
        });
        return;
      }
      if (action === 'edit') {
        if (!canManage || camp.somenteLeitura) return;
        openModalWith(camp);
        return;
      }
      if (!canManage || camp.somenteLeitura) return;
      if (action === 'delete') {
        if (!confirm('Excluir esta campanha?')) return;
        try {
          await campanhasApi.remove(id);
          await reloadCampaignsData();
          emitCampaignsUpdated('campanhas-delete');
        } catch (err) {
          console.error('Erro ao excluir campanha', err);
          alert('Nao foi possivel excluir a campanha.');
        }
      }
      return;
    }

    const card = target instanceof HTMLElement ? target.closest('.campanha-card') : null;
    if (!card) return;
    const id = card.dataset.id || '';
    if (!id || !canOperateCampaigns) return;
    const camp = campanhas.find((c) => c.id === id);
    if (!camp) return;
    const template = getCampaignTemplateModel(camp);
    await openTemplateFlowModal(template, 'campanhas-card-click', {
      campaignId: camp.id || '',
      campaignName: camp.nome || getTemplateTitle(template),
      message: getCampaignSuggestedMessage(camp),
      filters: camp?.audienceFilters || {},
    });
  });
  quickTemplatesGrid?.addEventListener('click', (ev) => {
    const btn = ev.target instanceof HTMLElement ? ev.target.closest('[data-action="use-template"]') : null;
    if (!btn) return;
    const index = Number(btn.dataset.templateIndex || -1);
    if (!Number.isInteger(index) || index < 0) return;
    const template = (Array.isArray(templatesData.annualTemplates) ? templatesData.annualTemplates : [])[index];
    if (!template) return;
    createCampaignFromTemplate(template, 'campanhas-quick-template');
  });
  globalsCancelBtn?.addEventListener('click', closeGlobalsModal);
  openLogsTodayBtn?.addEventListener('click', openLogsModal);
  closeLogsModalBtn?.addEventListener('click', closeLogsModal);
  closeTemplateFlowModalBtn?.addEventListener('click', closeTemplateFlowModal);
  templateFlowCancelBtn?.addEventListener('click', closeTemplateFlowModal);
  templateFlowSendBtn?.addEventListener('click', handleTemplateSendNow);
  closeTemplateSendConfirmModalBtn?.addEventListener('click', closeTemplateSendConfirmModal);
  templateSendConfirmCancelBtn?.addEventListener('click', closeTemplateSendConfirmModal);
  templateSendConfirmSubmitBtn?.addEventListener('click', async () => {
    if (!templateFlowState.confirmPayload || templateFlowState.sending) return;
    await performTemplateSendNow(templateFlowState.confirmPayload);
  });
  templateSendResultRetryFailedBtn?.addEventListener('click', async () => {
    if (templateFlowState.sending) return;
    await reopenTemplateFlowFromResult('failed');
  });
  templateSendResultReviewBlockedBtn?.addEventListener('click', async () => {
    if (templateFlowState.sending) return;
    await reopenTemplateFlowFromResult('blocked');
  });
  closeTemplateSendResultModalBtn?.addEventListener('click', closeTemplateSendResultModal);
  templateSendResultCloseBtn?.addEventListener('click', closeTemplateSendResultModal);
  templateFlowScheduleBtn?.addEventListener('click', () => {
    alert('Agendamento automatico ainda nao foi liberado com seguranca neste fluxo.');
  });
  templateFlowSelectVisibleBtn?.addEventListener('click', selectVisibleTemplateAudience);
  templateFlowSelectAllBtn?.addEventListener('click', selectAllTemplateAudience);
  templateFlowClearBtn?.addEventListener('click', () => {
    templateFlowState.selectedPatientIds = new Set();
    templateFlowState.manualSelectedPatientIds = new Set();
    renderTemplateFlow();
  });
  templateFlowManualSelectVisibleBtn?.addEventListener('click', () => {
    const visiblePatients = getVisibleManualPatients().slice(0, 12);
    visiblePatients.forEach((patient) => {
      const patientId = getCampaignPatientId(patient);
      if (patientId) templateFlowState.manualSelectedPatientIds.add(patientId);
    });
    renderTemplateFlow();
  });
  templateFlowManualClearBtn?.addEventListener('click', () => {
    templateFlowState.manualSelectedPatientIds = new Set();
    renderTemplateFlow();
  });
  templateFlowSearch?.addEventListener('focus', () => {
    setTemplateSearchPickerOpen(true);
  });
  templateFlowSearch?.addEventListener('click', () => {
    setTemplateSearchPickerOpen(true);
  });
  templateFlowSearch?.addEventListener('input', (ev) => {
    templateFlowState.search = ev.target?.value || '';
    setTemplateSearchPickerOpen(true);
  });
  templateFlowManualSearch?.addEventListener('focus', () => {
    setTemplateManualSearchPickerOpen(true);
  });
  templateFlowManualSearch?.addEventListener('click', () => {
    setTemplateManualSearchPickerOpen(true);
  });
  templateFlowManualSearch?.addEventListener('input', (ev) => {
    templateFlowState.manualSearch = ev.target?.value || '';
    setTemplateManualSearchPickerOpen(true);
  });
  templateFlowMessage?.addEventListener('input', renderTemplateFlow);
  templateFlowMessageTools?.addEventListener('click', (ev) => {
    const btn = ev.target instanceof HTMLElement ? ev.target.closest('[data-template-token]') : null;
    if (!btn) return;
    insertTemplateMessageToken(btn.dataset.templateToken || '');
  });
  openStrategyVideoBtn?.addEventListener('click', openStrategyVideoModal);
  closeStrategyVideoModalBtn?.addEventListener('click', closeStrategyVideoModal);
  selectSegmento?.addEventListener('change', refreshSegmentPreview);
  campaignPatientSearch?.addEventListener('input', renderCampaignPatientPicker);
  campaignPatientPicker?.addEventListener('click', (ev) => {
    const target = ev.target;
    const option = target instanceof HTMLElement ? target.closest('[data-campaign-patient-id]') : null;
    if (!option) return;
    const patientId = String(option.dataset.campaignPatientId || '').trim();
    if (!patientId) return;
    if (selectedCampaignPatientIds.has(patientId)) selectedCampaignPatientIds.delete(patientId);
    else selectedCampaignPatientIds.add(patientId);
    renderCampaignManualAudience();
    refreshSegmentPreview();
  });
  campaignSelectedPatients?.addEventListener('click', (ev) => {
    const target = ev.target;
    const button = target instanceof HTMLElement ? target.closest('[data-remove-campaign-patient]') : null;
    if (!button) return;
    const patientId = String(button.dataset.removeCampaignPatient || '').trim();
    if (!patientId) return;
    selectedCampaignPatientIds.delete(patientId);
    renderCampaignManualAudience();
    refreshSegmentPreview();
  });
  templateFlowFilters?.addEventListener('click', (ev) => {
    const btn = ev.target instanceof HTMLElement ? ev.target.closest('[data-template-filter]') : null;
    if (!btn) return;
    templateFlowState.filter = btn.dataset.templateFilter || 'all';
    renderTemplateFlow();
  });
  templateFlowSelectionHint?.addEventListener('click', (ev) => {
    const btn = ev.target instanceof HTMLElement ? ev.target.closest('[data-template-selection-action]') : null;
    if (!btn) return;
    const action = btn.dataset.templateSelectionAction || '';
    if (action === 'show-selected') {
      templateFlowState.filter = 'selected';
      templateFlowState.search = '';
      if (templateFlowSearch) templateFlowSearch.value = '';
      renderTemplateFlow();
      return;
    }
    if (action === 'clear-search') {
      templateFlowState.search = '';
      if (templateFlowSearch) templateFlowSearch.value = '';
      renderTemplateFlow();
    }
  });
  templateFlowAudienceList?.addEventListener('change', (ev) => {
    const input = ev.target instanceof HTMLInputElement ? ev.target : null;
    if (!input || input.type !== 'checkbox') return;
    const patientId = input.dataset.templatePatientId || '';
    toggleTemplatePatientSelection(patientId, input.checked);
  });
  templateFlowSearchPicker?.addEventListener('change', (ev) => {
    const input = ev.target instanceof HTMLInputElement ? ev.target : null;
    if (!input || input.type !== 'checkbox') return;
    const patientId = input.dataset.templatePickerPatientId || '';
    toggleTemplatePatientSelection(patientId, input.checked);
  });
  templateFlowManualSearchPicker?.addEventListener('click', (ev) => {
    const target = ev.target instanceof HTMLElement ? ev.target : null;
    if (!target) return;
    const button = target.closest('[data-template-manual-patient-id]');
    if (!(button instanceof HTMLElement)) return;
    const patientId = String(button.dataset.templateManualPatientId || '').trim();
    if (!patientId) return;
    const selected = templateFlowState.manualSelectedPatientIds.has(patientId);
    if (selected) templateFlowState.manualSelectedPatientIds.delete(patientId);
    else templateFlowState.manualSelectedPatientIds.add(patientId);
    renderTemplateFlow();
  });
  templateFlowManualSelected?.addEventListener('click', (ev) => {
    const target = ev.target instanceof HTMLElement ? ev.target : null;
    if (!target) return;
    const button = target.closest('[data-remove-template-manual-patient]');
    if (!(button instanceof HTMLElement)) return;
    const patientId = String(button.dataset.removeTemplateManualPatient || '').trim();
    if (!patientId) return;
    templateFlowState.manualSelectedPatientIds.delete(patientId);
    renderTemplateFlow();
  });
  templateFlowReviewList?.addEventListener('click', (ev) => {
    const target = ev.target instanceof HTMLElement ? ev.target : null;
    if (!target) return;
    const patientActionButton = target.closest('[data-template-patient-action]');
    if (!(patientActionButton instanceof HTMLElement)) return;
    const action = patientActionButton.dataset.templatePatientAction || '';
    const patientId = patientActionButton.dataset.templatePatientId || '';
    handleTemplatePatientAction(action, patientId);
  });
  templateFlowAudienceList?.addEventListener('click', (ev) => {
    const target = ev.target instanceof HTMLElement ? ev.target : null;
    if (!target) return;
    const patientActionButton = target.closest('[data-template-patient-action]');
    if (patientActionButton instanceof HTMLElement) {
      const action = patientActionButton.dataset.templatePatientAction || '';
      const patientId = patientActionButton.dataset.templatePatientId || '';
      handleTemplatePatientAction(action, patientId);
      return;
    }
    if (target.closest('input, button, a, textarea, label, pre')) return;
    const memberCard = target.closest('[data-template-member-id]');
    if (!(memberCard instanceof HTMLElement)) return;
    if (memberCard.dataset.templateMemberBlocked === 'true') return;
    const patientId = memberCard.dataset.templateMemberId || '';
    const selected = templateFlowState.selectedPatientIds.has(patientId);
    toggleTemplatePatientSelection(patientId, !selected);
  });

  modal?.addEventListener('click', (ev) => {
    if (ev.target === modal) closeModal();
  });

  globalsModal?.addEventListener('click', (ev) => {
    if (ev.target === globalsModal) closeGlobalsModal();
  });
  logsModal?.addEventListener('click', (ev) => {
    if (ev.target === logsModal) closeLogsModal();
  });
  templateFlowModal?.addEventListener('click', (ev) => {
    if (ev.target === templateFlowModal) closeTemplateFlowModal();
  });
  templateSendConfirmModal?.addEventListener('click', (ev) => {
    if (ev.target === templateSendConfirmModal) closeTemplateSendConfirmModal();
  });
  templateSendResultModal?.addEventListener('click', (ev) => {
    if (ev.target === templateSendResultModal) closeTemplateSendResultModal();
  });
  strategyVideoModal?.addEventListener('click', (ev) => {
    if (ev.target === strategyVideoModal) closeStrategyVideoModal();
  });

  window.addEventListener('campaigns-updated', () => {
    reloadCampaignsData();
  });

  window.addEventListener('storage', (event) => {
    const scopedKey = String(window.__VOITHOS_ACTIVE_CLINIC_ID__ || '').trim()
      ? `voithos-campaigns-updated:${String(window.__VOITHOS_ACTIVE_CLINIC_ID__ || '').trim()}`
      : 'voithos-campaigns-updated';
    if (event.key === 'voithos-campaigns-updated' || event.key === scopedKey) {
      reloadCampaignsData();
    }
  });

  document.addEventListener('click', (ev) => {
    const target = ev.target instanceof Node ? ev.target : null;
    if (!target) return;
    if (templateFlowState.searchPickerOpen && !templateFlowSearchWrap?.contains(target)) {
      setTemplateSearchPickerOpen(false);
    }
    if (templateFlowState.manualSearchPickerOpen && !templateFlowManualSearchWrap?.contains(target)) {
      setTemplateManualSearchPickerOpen(false);
    }
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && modal?.classList.contains('open')) closeModal();
    if (ev.key === 'Escape' && globalsModal?.classList.contains('open')) closeGlobalsModal();
    if (ev.key === 'Escape' && logsModal?.classList.contains('open')) closeLogsModal();
    if (ev.key === 'Escape' && templateFlowState.manualSearchPickerOpen) {
      setTemplateManualSearchPickerOpen(false);
      return;
    }
    if (ev.key === 'Escape' && templateFlowState.searchPickerOpen) {
      setTemplateSearchPickerOpen(false);
      return;
    }
    if (ev.key === 'Escape' && templateFlowState.confirmOpen) {
      closeTemplateSendConfirmModal();
      return;
    }
    if (ev.key === 'Escape' && templateSendResultState.open) {
      closeTemplateSendResultModal();
      return;
    }
    if (ev.key === 'Escape' && templateFlowModal?.classList.contains('open')) closeTemplateFlowModal();
    if (ev.key === 'Escape' && strategyVideoModal?.classList.contains('open')) closeStrategyVideoModal();
  });

  form?.addEventListener('submit', handleSubmit);
  globalsForm?.addEventListener('submit', handleGlobalsSubmit);

  init();
});
