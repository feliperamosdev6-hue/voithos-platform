const statusLabels = {
  ativa: 'Ativa',
  pausada: 'Pausada',
  agendada: 'Agendada',
  concluida: 'Concluida'
};

const normalizeStatus = (camp = {}) => {
  const raw = String(camp?.status || '').toLowerCase();
  if (['ativa', 'pausada', 'agendada', 'concluida'].includes(raw)) return raw;
  if (raw === 'inativa') return 'pausada';
  return 'ativa';
};

const normalizeCampaign = (camp = {}) => ({
  id: camp.id || '',
  nome: camp.nome || camp.titulo || 'Campanha',
  descricao: camp.descricao || 'Sem descricao',
  status: normalizeStatus(camp),
  canal: camp.canal || camp.canalNome || 'Nao definido',
  periodo: camp.periodo || '',
  origem: camp.origem || 'clinica',
  somenteLeitura: camp.somenteLeitura || camp.origem === 'voithos',
  publicoLabel: camp.publicoLabel || 'Pacientes da clinica',
  pacientes: Array.isArray(camp.pacientes) ? camp.pacientes : null
});

const grid = document.getElementById('campaigns-grid');
const emptyState = document.getElementById('empty-state');
const tabs = Array.from(document.querySelectorAll('.tab'));
const countEls = Array.from(document.querySelectorAll('[data-count]'));
const novaCampanhaBtn = document.getElementById('btn-nova-campanha');

let campaigns = [];
let patientNames = [];
let canManage = false;
const appApi = window.appApi || {};
const authApi = appApi.auth || {};
const campanhasApi = appApi.campanhas || {};
const patientsApi = appApi.patients || {};

const buildChips = (patients) => {
  if (!patients.length) {
    return '<span class="patient-chip muted">Sem pacientes cadastrados</span>';
  }
  const max = 3;
  const preview = patients.slice(0, max);
  const rest = patients.length - preview.length;
  const chips = preview.map((name) => `<span class="patient-chip">${name}</span>`).join('');
  return rest > 0 ? `${chips}<span class="patient-chip muted">+${rest}</span>` : chips;
};

const getPatientsForCampaign = (camp) => {
  if (Array.isArray(camp.pacientes) && camp.pacientes.length) return camp.pacientes;
  return patientNames;
};

const renderCounts = () => {
  const counts = campaigns.reduce(
    (acc, camp) => {
      acc.todas += 1;
      acc[camp.status] += 1;
      return acc;
    },
    { todas: 0, ativa: 0, pausada: 0, agendada: 0, concluida: 0 }
  );

  countEls.forEach((el) => {
    const key = el.getAttribute('data-count');
    el.textContent = counts[key] ?? 0;
  });
};

const renderCampaigns = (status) => {
  const filtered = status === 'todas'
    ? campaigns
    : campaigns.filter((camp) => camp.status === status);

  if (!filtered.length) {
    grid.innerHTML = '';
    grid.style.display = 'none';
    emptyState.hidden = false;
    return;
  }

  grid.style.display = 'grid';
  emptyState.hidden = true;
  grid.innerHTML = filtered.map((camp) => {
    const patients = getPatientsForCampaign(camp);
    const patientCount = patients.length;
    const editButton = (canManage && !camp.somenteLeitura && camp.id)
      ? `<button class="action-edit" type="button" data-action="edit" data-id="${camp.id}">Editar</button>`
      : '';
    const deleteButton = (canManage && !camp.somenteLeitura && camp.id)
      ? `<button class="action-delete" type="button" data-action="delete" data-id="${camp.id}">Excluir</button>`
      : '';

    return `
      <article class="campaign-card">
        <div class="card-header">
          <span class="status-badge status-${camp.status}">${statusLabels[camp.status]}</span>
          <span class="channel">${camp.canal}</span>
        </div>
        <h3>${camp.nome}</h3>
        <p class="muted">${camp.descricao}</p>
        <div class="card-meta">
          <span>Periodo: ${camp.periodo || '--'}</span>
          <span>Pacientes: ${patientCount}</span>
        </div>
        <div class="patient-row">
          ${buildChips(patients)}
        </div>
        <div class="card-actions">
          <a class="link" href="campanhas.html">Abrir campanha</a>
          <a class="link secondary" href="lista-pacientes.html">Ver pacientes</a>
          ${editButton}
          ${deleteButton}
        </div>
      </article>
    `;
  }).join('');
};

const setActiveTab = (target) => {
  tabs.forEach((tab) => tab.classList.remove('is-active'));
  target.classList.add('is-active');
  renderCampaigns(target.dataset.status);
};

const loadUserPermissions = async () => {
  try {
    const user = await authApi.currentUser?.();
    canManage = ['admin', 'recepcionista'].includes(user?.tipo);
  } catch (_err) {
    canManage = false;
  }
};

const loadCampaigns = async () => {
  try {
    const data = await campanhasApi.list?.();
    if (!Array.isArray(data)) return [];
    return data.map(normalizeCampaign);
  } catch (_err) {
    return [];
  }
};

const loadPatients = async () => {
  try {
    const data = await patientsApi.list?.();
    if (!Array.isArray(data)) return [];
    return data
      .map((p) => p.fullName || p.nome || '')
      .map((name) => String(name).trim())
      .filter(Boolean);
  } catch (_err) {
    return [];
  }
};

const handleDelete = async (id) => {
  if (!id || !canManage) return;
  if (!confirm('Excluir esta campanha?')) return;
  try {
    await campanhasApi.remove?.(id);
    campaigns = campaigns.filter((camp) => camp.id !== id);
    renderCounts();
    const activeTab = document.querySelector('.tab.is-active');
    renderCampaigns(activeTab?.dataset?.status || 'todas');
  } catch (_err) {
    alert('Nao foi possivel excluir a campanha.');
  }
};

tabs.forEach((tab) => {
  tab.addEventListener('click', () => setActiveTab(tab));
});

if (novaCampanhaBtn) {
  novaCampanhaBtn.addEventListener('click', () => {
    window.location.href = 'campanhas.html';
  });
}

if (grid) {
  grid.addEventListener('click', (ev) => {
    const target = ev.target;
    const button = target instanceof HTMLElement ? target.closest('button[data-action]') : null;
    if (!button) return;
    const action = button.dataset.action;
    const id = button.dataset.id || '';
    if (action === 'edit') {
      if (id) window.location.href = `campanhas.html?edit=${id}`;
      return;
    }
    if (action === 'delete') {
      handleDelete(id);
    }
  });
}

const init = async () => {
  await loadUserPermissions();
  campaigns = await loadCampaigns();
  patientNames = await loadPatients();
  renderCounts();
  renderCampaigns('todas');
};

init();
