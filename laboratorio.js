(function () {
  const appApi = window.appApi || {};
  const patientsApi = appApi.patients || {};
  const laboratorioApi = appApi.laboratorio || {};

  const formatCurrency = (value) => {
    const v = Number(value) || 0;
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  let registros = [];
  let editId = null;
  let saveInFlight = false;

  function setLabFeedback(message = '', type = '') {
    const feedback = document.getElementById('lab-form-feedback');
    if (!feedback) return;
    feedback.textContent = message || '';
    feedback.classList.toggle('is-success', type === 'success');
    feedback.classList.toggle('is-error', type === 'error');
  }

  function updatePacienteFieldState() {
    const select = document.getElementById('input-paciente');
    const help = document.getElementById('input-paciente-help');
    if (!select) return;
    const locked = Boolean(editId);
    select.disabled = locked;
    select.title = locked ? 'Paciente bloqueado nesta edicao.' : '';
    if (help) {
      help.textContent = locked
        ? 'Paciente bloqueado nesta edicao. Para mudar o vinculo, crie um novo registro.'
        : 'Selecione um paciente. Na edicao, este vinculo fica bloqueado.';
    }
  }

  async function carregarPacientes() {
    const select = document.getElementById('input-paciente');
    if (!select) return;
    select.innerHTML = '<option value="">Selecione...</option>';

    try {
      const patients = (await patientsApi.list?.()) || [];
      patients.forEach((p) => {
        const opt = document.createElement('option');
        const pacienteId = p.prontuario || p.id || '';
        opt.value = pacienteId;
        opt.dataset.nome = p.nome || p.fullName || 'Paciente';
        opt.dataset.prontuario = pacienteId;
        const labelNome = p.nome || p.fullName || 'Paciente';
        const prontuario = p.prontuario ? ` (${p.prontuario})` : '';
        opt.textContent = `${labelNome}${prontuario}`;
        select.appendChild(opt);
      });
    } catch (err) {
      console.error('Erro ao carregar pacientes:', err);
    }
  }

  function renderTabela() {
    const tbody = document.querySelector('#tabela-lab tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!registros.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="sem-registros">Nenhum registro encontrado.</td></tr>';
      return;
    }

    registros.forEach((r) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.laboratorio || ''}</td>
        <td>${r.paciente || ''}</td>
        <td>${r.peca || ''}</td>
        <td>${r.entrada || ''}</td>
        <td>${r.saida || ''}</td>
        <td>${formatCurrency(r.valor)}</td>
        <td><span class="badge-status ${r.status === 'entregue' ? 'entregue' : 'pendente'}">${(r.status || 'pendente').replace(/^./, (c) => c.toUpperCase())}</span></td>
        <td class="acoes">
          <button class="btn-acao" data-acao="editar" data-id="${r.id}">Editar</button>
          <button class="btn-acao" data-acao="excluir" data-id="${r.id}">Excluir</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  function abrirModal(registro) {
    const bg = document.getElementById('modal-lab-bg');
    if (!bg) return;

    editId = registro?.id || null;
    document.getElementById('titulo-modal-lab').textContent = editId ? 'Editar registro' : 'Novo registro';

    document.getElementById('input-laboratorio').value = registro?.laboratorio || '';
    document.getElementById('input-paciente').value = registro?.patientId || registro?.prontuario || registro?.paciente || '';
    document.getElementById('input-peca').value = registro?.peca || '';
    document.getElementById('input-entrada').value = registro?.entrada || new Date().toISOString().split('T')[0];
    document.getElementById('input-saida').value = registro?.saida || '';
    document.getElementById('input-valor').value = registro?.valor ?? '';
    document.getElementById('input-status').value = registro?.status || 'pendente';
    setLabFeedback('', '');
    updatePacienteFieldState();

    bg.classList.remove('hidden');
  }

  function fecharModal() {
    const bg = document.getElementById('modal-lab-bg');
    if (!bg) return;
    bg.classList.add('hidden');
    saveInFlight = false;
    const saveBtn = document.getElementById('btn-salvar-lab');
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Salvar';
    }
    setLabFeedback('', '');
  }

  async function carregarRegistros() {
    try {
      registros = await laboratorioApi.list?.();
      renderTabela();
      await atualizarDash();
    } catch (err) {
      console.error('Erro ao carregar registros do laboratorio:', err);
    }
  }

  async function atualizarDash() {
    try {
      const dash = await laboratorioApi.getDashboard?.();
      if (!dash) return;
      document.getElementById('total-mes').textContent = formatCurrency(dash.totalMes || 0);
      document.getElementById('total-pendentes').textContent = String(dash.pendentes || 0);
    } catch (err) {
      console.error('Erro ao carregar dashboard de laboratorio:', err);
    }
  }

  async function salvarRegistro() {
    if (saveInFlight) return;
    const pacienteSelect = document.getElementById('input-paciente');
    const pacienteId = pacienteSelect?.value?.trim() || '';
    const pacienteNome = pacienteSelect?.selectedOptions?.[0]?.dataset?.nome || pacienteId;
    const saveBtn = document.getElementById('btn-salvar-lab');
    const payload = {
      id: editId,
      laboratorio: document.getElementById('input-laboratorio').value.trim(),
      paciente: pacienteNome,
      patientId: pacienteId,
      prontuario: pacienteId,
      peca: document.getElementById('input-peca').value.trim(),
      entrada: document.getElementById('input-entrada').value,
      saida: document.getElementById('input-saida').value,
      valor: Number(document.getElementById('input-valor').value) || 0,
      status: document.getElementById('input-status').value || 'pendente',
    };

    try {
      saveInFlight = true;
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Salvando...';
      }
      if (payload.id) {
        await laboratorioApi.update?.(payload);
      } else {
        await laboratorioApi.add?.(payload);
      }
      await carregarRegistros();
      setLabFeedback('Servico de laboratorio salvo com sucesso.', 'success');
      setTimeout(() => {
        fecharModal();
      }, 250);
    } catch (err) {
      console.error('Erro ao salvar registro de laboratorio:', err);
      setLabFeedback(err?.message ? `Erro ao salvar registro: ${err.message}` : 'Erro ao salvar registro.', 'error');
      saveInFlight = false;
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Salvar';
      }
    }
  }

  async function removerRegistro(id) {
    if (!id) return;
    const ok = confirm('Deseja excluir este registro?');
    if (!ok) return;
    try {
      await laboratorioApi.remove?.(id);
      await carregarRegistros();
    } catch (err) {
      console.error('Erro ao excluir registro de laboratorio:', err);
      alert('Erro ao excluir registro.');
    }
  }

  function configurarTabela() {
    const tbody = document.querySelector('#tabela-lab tbody');
    if (!tbody) return;
    tbody.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button[data-acao]');
      if (!btn) return;
      const id = btn.dataset.id;
      const registro = registros.find((r) => r.id === id);
      if (btn.dataset.acao === 'editar') {
        abrirModal(registro);
      } else if (btn.dataset.acao === 'excluir') {
        removerRegistro(id);
      }
    });
  }

  function configurarBotoes() {
    document.getElementById('btn-novo')?.addEventListener('click', () => abrirModal());
    document.getElementById('btn-cancelar-lab')?.addEventListener('click', fecharModal);
    document.getElementById('btn-salvar-lab')?.addEventListener('click', salvarRegistro);
    document.getElementById('input-paciente')?.addEventListener('change', () => {
      if (editId) updatePacienteFieldState();
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    configurarTabela();
    configurarBotoes();
    await carregarPacientes();
    await carregarRegistros();
  });
})();
