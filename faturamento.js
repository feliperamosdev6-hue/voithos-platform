(() => {
  const api = window?.api?.faturamento;
  if (!api) {
    console.warn('API de faturamento não disponível no preload.');
    return;
  }

  const els = {
    periodButtons: Array.from(document.querySelectorAll('.period-btn')),
    valorDia: document.getElementById('valor-dia'),
    valorSemana: document.getElementById('valor-semana'),
    valorMes: document.getElementById('valor-mes'),
    valorPrevisto: document.getElementById('valor-previsto'),
    textoPrevisto: document.getElementById('texto-previsto'),
    filtroMetodo: document.getElementById('filtro-metodo'),
    filtroStatus: document.getElementById('filtro-status'),
    filtroBusca: document.getElementById('filtro-busca'),
    btnAtualizar: document.getElementById('btn-atualizar'),
    tabelaBody: document.querySelector('#tabela-faturamento tbody'),
    listaPendentes: document.getElementById('lista-pendentes'),
    listaRecebidas: document.getElementById('lista-recebidas'),
    modal: document.getElementById('modal-recebimento'),
    btnAbrirModal: document.getElementById('btn-abrir-modal'),
    btnFecharModal: document.getElementById('btn-fechar-modal'),
    btnCancelar: document.getElementById('btn-cancelar'),
    btnSalvar: document.getElementById('btn-salvar'),
    inputPaciente: document.getElementById('input-paciente'),
    inputDescricao: document.getElementById('input-descricao'),
    inputValor: document.getElementById('input-valor'),
    inputData: document.getElementById('input-data'),
    inputMetodo: document.getElementById('input-metodo'),
    grupoParcelas: document.getElementById('grupo-parcelas'),
    inputParcelas: document.getElementById('input-parcelas'),
    inputStatus: document.getElementById('input-status'),
    modalError: document.getElementById('modal-error'),
  };

  const state = {
    period: 'dia',
    method: 'todos',
    status: 'todos',
    search: '',
    lancamentos: [],
    dashboard: null,
  };

  const currency = (value = 0) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);

  const normalizeKey = (value = '') =>
    String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

  const normalizeMethod = (method = '') => {
    const key = normalizeKey(method);
    if (key.includes('credito')) return 'cartao_credito';
    if (key.includes('debito')) return 'debito';
    if (key.includes('boleto')) return 'boleto';
    if (key.includes('dinheiro') || key.includes('cash')) return 'dinheiro';
    if (key.includes('pix')) return 'pix';
    return key || 'pix';
  };

  const methodLabel = (method) => {
    const map = {
      pix: 'Pix',
      debito: 'Débito',
      cartao_credito: 'Crédito',
      boleto: 'Boleto',
      dinheiro: 'Dinheiro',
    };
    return map[normalizeMethod(method)] || 'Outro';
  };

  const todayISO = () => new Date().toISOString().split('T')[0];

  const listByPeriod = () => {
    if (state.period === 'semana') return api.listSemana();
    if (state.period === 'mes') return api.listMes();
    return api.listDia();
  };

  const clearModalError = () => {
    if (!els.modalError) return;
    els.modalError.textContent = '';
    els.modalError.classList.add('hidden');
  };

  const setModalError = (message) => {
    if (!els.modalError) return;
    els.modalError.textContent = message;
    els.modalError.classList.remove('hidden');
  };

  const openModal = () => {
    els.inputData.value = els.inputData.value || todayISO();
    clearModalError();
    els.modal.classList.remove('hidden');
  };

  const closeModal = () => {
    els.modal.classList.add('hidden');
    els.inputPaciente.value = '';
    els.inputDescricao.value = '';
    els.inputValor.value = '';
    els.inputParcelas.value = '1';
    els.inputStatus.value = 'pago';
    els.inputMetodo.value = 'pix';
    els.grupoParcelas.classList.add('hidden');
    clearModalError();
  };

  const computeStatus = (lanc) => {
    const parcelas = lanc?.parcelas?.lista || [];
    if (!parcelas.length) return lanc.status || 'pendente';
    const todasPagas = parcelas.every((p) => p.status === 'pago');
    return todasPagas ? 'pago' : 'pendente';
  };

  const filterData = (data) => {
    let filtered = [...data];
    if (state.method !== 'todos') {
      filtered = filtered.filter((l) => normalizeMethod(l.metodoPagamento) === state.method);
    }
    if (state.status !== 'todos') {
      filtered = filtered.filter((l) => computeStatus(l) === state.status);
    }
    if (state.search) {
      const q = state.search.toLowerCase();
      filtered = filtered.filter((l) =>
        (l.descricao || '').toLowerCase().includes(q) ||
        (l.origem || '').toLowerCase().includes(q) ||
        (l.paciente || '').toLowerCase().includes(q) ||
        methodLabel(l.metodoPagamento || '').toLowerCase().includes(q)
      );
    }
    return filtered;
  };

  const renderDashboard = () => {
    const dash = state.dashboard || {};
    const pendentesValor = (dash.parcelasPendentes || []).reduce((acc, p) => acc + (Number(p.valor) || 0), 0);
    els.valorDia.textContent = currency(dash.totalDia || 0);
    els.valorSemana.textContent = currency(dash.totalSemana || 0);
    els.valorMes.textContent = currency(dash.totalMes || 0);
    els.valorPrevisto.textContent = currency(pendentesValor);
    els.textoPrevisto.textContent = `${(dash.parcelasPendentes || []).length} parcelas aguardando`;
  };

  const renderParcelas = () => {
    const dash = state.dashboard || {};
    const pendentes = dash.parcelasPendentes || [];
    const recebidas = dash.parcelasRecebidas || [];

    const itemTpl = (p, variant) => {
      return `<li class="parcela-item">
        <strong>${currency(p.valor)}</strong>
        <span>${p.data || '-'} · ${variant}</span>
      </li>`;
    };

    els.listaPendentes.innerHTML = pendentes.length
      ? pendentes.slice(0, 6).map((p) => itemTpl(p, methodLabel(p.metodoPagamento || ''))).join('')
      : '<li class="parcela-item">Sem pendências</li>';

    els.listaRecebidas.innerHTML = recebidas.length
      ? recebidas.slice(0, 6).map((p) => itemTpl(p, methodLabel(p.metodoPagamento || ''))).join('')
      : '<li class="parcela-item">Sem registros</li>';
  };

  const renderTable = () => {
    const data = filterData(state.lancamentos);
    const rows = data.map((lanc) => {
      const parcelas = lanc?.parcelas?.lista || [];
      const pagas = parcelas.filter((p) => p.status === 'pago').length;
      const totalParcelas = parcelas.length || 1;
      const resumoParcelas = `${pagas}/${totalParcelas}`;
      const status = computeStatus(lanc);
      const proxParcela = parcelas.find((p) => p.status !== 'pago');
      const proxData = proxParcela?.data || lanc.data;
      const disablePago = status === 'pago';

      return `<tr>
        <td>${lanc.data || '-'}</td>
        <td>${lanc.origem || 'Paciente'}</td>
        <td>${lanc.descricao || '-'}</td>
        <td>${methodLabel(lanc.metodoPagamento || '')}</td>
        <td>${resumoParcelas} <small>${proxData ? ` · próx: ${proxData}` : ''}</small></td>
        <td><span class="status-chip ${status}">${status}</span></td>
        <td>${currency(lanc.valor)}</td>
        <td>
          <div class="table-actions">
            <button data-action="pago" data-id="${lanc.id}" ${disablePago ? 'disabled' : ''}>Marcar pago</button>
            <button data-action="delete" data-id="${lanc.id}">Excluir</button>
          </div>
        </td>
      </tr>`;
    });

    els.tabelaBody.innerHTML = rows.join('') || '<tr><td colspan="8">Nenhum lançamento encontrado.</td></tr>';
  };

  const loadData = async () => {
    try {
      const [list, dash] = await Promise.all([listByPeriod(), api.dashboard()]);
      state.lancamentos = Array.isArray(list) ? list : [];
      state.dashboard = dash || {};
      renderDashboard();
      renderTable();
      renderParcelas();
    } catch (err) {
      console.error('Erro ao carregar faturamento', err);
    }
  };

  const saveRecebimento = async () => {
    const valor = Number(els.inputValor.value || 0);
    if (!valor) {
      setModalError('Informe um valor.');
      return;
    }

    const metodo = normalizeMethod(els.inputMetodo.value || 'pix');
    const payload = {
      paciente: els.inputPaciente.value?.trim(),
      origem: els.inputPaciente.value?.trim(),
      descricao: els.inputDescricao.value?.trim(),
      valor,
      data: els.inputData.value || todayISO(),
      metodoPagamento: metodo,
      status: els.inputStatus.value || 'pago',
    };

    if (metodo === 'cartao_credito') {
      const qtd = Math.max(1, Number(els.inputParcelas.value || 1));
      payload.parcelas = { quantidade: qtd };
    }

    try {
      await api.add(payload);
      closeModal();
      await loadData();
    } catch (err) {
      console.error('Erro ao salvar faturamento', err);
      setModalError('Nao foi possivel salvar o recebimento.');
    }
  };

  const markAsPaid = async (id) => {
    const lanc = state.lancamentos.find((l) => l.id === id);
    if (!lanc) return;
    const updated = {
      ...lanc,
      status: 'pago',
      parcelas: {
        ...(lanc.parcelas || {}),
        lista: (lanc.parcelas?.lista || []).map((p) => ({ ...p, status: 'pago' })),
      },
    };
    try {
      await api.update(updated);
      await loadData();
    } catch (err) {
      console.error('Erro ao marcar como pago', err);
    }
  };

  const deleteLancamento = async (id) => {
    if (!confirm('Deseja excluir este recebimento?')) return;
    try {
      await api.remove(id);
      await loadData();
    } catch (err) {
      console.error('Erro ao excluir recebimento', err);
    }
  };

  // Eventos
  els.periodButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      els.periodButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.period = btn.dataset.period;
      loadData();
    });
  });

  els.filtroMetodo.addEventListener('change', (e) => {
    state.method = e.target.value;
    renderTable();
  });
  els.filtroStatus.addEventListener('change', (e) => {
    state.status = e.target.value;
    renderTable();
  });
  els.filtroBusca.addEventListener('input', (e) => {
    state.search = e.target.value;
    renderTable();
  });
  els.btnAtualizar.addEventListener('click', loadData);

  els.btnAbrirModal.addEventListener('click', openModal);
  els.btnFecharModal.addEventListener('click', closeModal);
  els.btnCancelar.addEventListener('click', closeModal);

  els.inputMetodo.addEventListener('change', (e) => {
    const showParcelas = e.target.value === 'cartao_credito';
    els.grupoParcelas.classList.toggle('hidden', !showParcelas);
    clearModalError();
  });

  els.btnSalvar.addEventListener('click', saveRecebimento);

  els.tabelaBody.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === 'pago') markAsPaid(id);
    if (action === 'delete') deleteLancamento(id);
  });

  // Init
  els.inputData.value = todayISO();
  [
    els.inputPaciente,
    els.inputDescricao,
    els.inputValor,
    els.inputData,
    els.inputParcelas,
    els.inputStatus,
  ].forEach((el) => {
    if (!el) return;
    el.addEventListener('input', clearModalError);
  });
  loadData();
})();
