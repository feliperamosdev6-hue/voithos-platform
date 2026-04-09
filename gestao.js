(function () {
  const ENABLE_GESTAO_HUB = true;

  const formatCurrency = (value) => {
    const v = Number(value) || 0;
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const formatMetodoPagamento = (value) => {
    const key = String(value || '').toLowerCase();
    if (key === 'pix') return 'Pix';
    if (key === 'cartao_credito') return 'Cartao credito';
    if (key === 'cartao_debito') return 'Cartao debito';
    if (key === 'dinheiro') return 'Dinheiro';
    if (key === 'boleto') return 'Boleto';
    return value || '-';
  };

  const formatCategoria = (value) => {
    const key = String(value || '').toLowerCase();
    if (key === 'laboratorio') return 'Laboratório';
    if (key === 'materiais') return 'Materiais';
    if (key === 'funcionarios') return 'Colaboradores';
    if (key === 'fixos') return 'Fixos';
    if (key === 'outros') return 'Outros';
    if (key === 'procedimentos') return 'Procedimentos';
    if (!value) return '-';
    return String(value).charAt(0).toUpperCase() + String(value).slice(1);
  };
  const isProcedureLancamento = (lancamento) => {
    const origem = String(lancamento?.origem || '').toLowerCase();
    const categoria = String(lancamento?.categoria || '').toLowerCase();
    return origem === 'procedimento' || categoria === 'procedimentos' || !!String(lancamento?.procedureId || lancamento?.servicoId || '').trim();
  };
  const cleanProcedureDescricao = (value) => {
    let text = String(value || '').trim();
    if (!text) return '';
    text = text.replace(/^\[procedimento\]\s*/i, '').trim();
    text = text.replace(/^procedimento:\s*/i, '').trim();
    return text;
  };
  const stripDescricaoTag = (value) => String(value || '').replace(/^\s*\[[^\]]+\]\s*/i, '').trim();
  const formatReceitaDescricaoDisplay = (lancamento) => {
    if (!lancamento) return '';
    if (!isProcedureLancamento(lancamento)) return stripDescricaoTag(lancamento.descricao || '');
    const procedimento = String(lancamento.procedimento || '').trim() || cleanProcedureDescricao(lancamento.descricao);
    const paciente = String(lancamento.paciente || '').trim();
    const content = [procedimento, paciente].filter(Boolean).join(' - ');
    return content ? content : stripDescricaoTag(lancamento.descricao || '');
  };
  const formatDescricaoCell = (primary, secondary = '') => {
    const main = String(primary || '').trim() || '-';
    const sub = String(secondary || '').trim();
    if (!sub) return main;
    return `
      <div class="table-cell-main">${main}</div>
      <div class="table-cell-sub">${sub}</div>
    `;
  };
  const canOpenPatientFinanceFromEntry = (lancamento) => {
    const prontuario = String(lancamento?.prontuario || '').trim();
    const patientId = String(lancamento?.patientId || '').trim();
    const paciente = String(lancamento?.paciente || '').trim();
    return Boolean(prontuario || (patientId && paciente));
  };
  const isPlanLancamento = (lancamento) => {
    if (!lancamento || String(lancamento?.tipo || '').toLowerCase() !== 'receita') return false;
    const categoria = String(lancamento?.categoria || '').toLowerCase();
    const origem = String(lancamento?.origem || '').toLowerCase();
    const descricao = String(lancamento?.descricao || '');
    return Boolean(
      String(lancamento?.planId || '').trim()
      || categoria === 'planos'
      || origem === 'plano'
      || /^\s*\[plano\]/i.test(descricao)
    );
  };
  const cleanPlanDescricao = (value) => {
    let text = String(value || '').trim();
    if (!text) return '';
    text = text.replace(/^\[plano\]\s*/i, '').trim();
    text = text.replace(/\s*[-–]\s*parcela\s+\d+\s*\/\s*\d+\s*$/i, '').trim();
    return text;
  };
  const parsePlanParcelaInfo = (value) => {
    const text = String(value || '');
    const match = text.match(/parcela\s+(\d+)\s*\/\s*(\d+)/i);
    if (!match) return { current: null, total: null };
    return {
      current: Number(match[1]) || null,
      total: Number(match[2]) || null,
    };
  };
  const resolvePlanGroupKey = (entry) => {
    const planId = String(entry?.planId || '').trim();
    if (planId) return `plan:${planId}`;
    const descricao = cleanPlanDescricao(entry?.descricao || '').toLowerCase();
    const paciente = String(entry?.paciente || '').trim().toLowerCase();
    return `fallback:${descricao}|${paciente}`;
  };
  const getPlanDisplayRows = (rows = []) => {
    const display = [];
    const grouped = new Map();
    (Array.isArray(rows) ? rows : []).forEach((entry) => {
      if (!isPlanLancamento(entry)) {
        display.push({ kind: 'entry', entry });
        return;
      }
      const key = resolvePlanGroupKey(entry);
      if (!grouped.has(key)) {
        grouped.set(key, {
          kind: 'plan-group',
          key,
          planId: String(entry?.planId || '').trim(),
          patientName: String(entry?.paciente || '').trim(),
          prontuario: String(entry?.prontuario || '').trim(),
          patientId: String(entry?.patientId || '').trim(),
          title: cleanPlanDescricao(entry?.descricao || '') || String(entry?.procedimento || '').trim() || 'Plano odontologico',
          entries: [],
        });
        display.push({ kind: 'plan-group-placeholder', key });
      }
      grouped.get(key).entries.push(entry);
    });

    const groupedByKey = new Map();
    grouped.forEach((group, key) => {
      const entries = group.entries.slice().sort((a, b) => {
        const parcelaA = parsePlanParcelaInfo(a?.descricao || '').current || 9999;
        const parcelaB = parsePlanParcelaInfo(b?.descricao || '').current || 9999;
        if (parcelaA !== parcelaB) return parcelaA - parcelaB;
        return String(a?.data || '').localeCompare(String(b?.data || ''));
      });
      const paid = entries.filter((item) => isPaid(item));
      const pending = entries.filter((item) => isPending(item));
      const cancelled = entries.filter((item) => isCancelled(item));
      const pendingOverdue = pending.filter((item) => {
        const due = getDueDate(item);
        if (!due || Number.isNaN(due.getTime())) return false;
        const today = new Date();
        const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        return due < start;
      });
      const totalValue = entries.reduce((acc, item) => acc + (Number(item?.valor) || 0), 0);
      const paidValue = paid.reduce((acc, item) => acc + (Number(item?.valor) || 0), 0);
      const pendingValue = pending.reduce((acc, item) => acc + (Number(item?.valor) || 0), 0);
      const nextPending = pending
        .map((item) => ({ item, due: getDueDate(item) }))
        .filter((item) => item.due && !Number.isNaN(item.due.getTime()))
        .sort((a, b) => a.due.getTime() - b.due.getTime())[0]?.item || null;
      const latest = entries
        .slice()
        .sort((a, b) => String(b?.data || '').localeCompare(String(a?.data || '')))[0] || null;
      const totalParcels = entries.reduce((acc, item) => {
        const info = parsePlanParcelaInfo(item?.descricao || '');
        return Math.max(acc, Number(info.total) || 0);
      }, 0) || entries.length;
      const paidParcels = paid.length;
      const baseEntry = nextPending || latest || entries[0];
      const merged = {
        ...group,
        entries,
        representativeId: String(baseEntry?.id || ''),
        date: nextPending?.dueDate || nextPending?.vencimento || nextPending?.data || baseEntry?.data || '',
        status: pending.length > 0 ? 'pendente' : (paid.length > 0 ? 'pago' : 'cancelado'),
        statusLabel: pending.length > 0
          ? (pendingOverdue.length > 0 ? 'Pendente (em atraso)' : 'Pendente')
          : (cancelled.length === entries.length ? 'Cancelado' : 'Pago'),
        totals: {
          totalValue,
          paidValue,
          pendingValue,
          totalParcels,
          paidParcels,
          pendingCount: pending.length,
          overdueCount: pendingOverdue.length,
        },
      };
      groupedByKey.set(key, merged);
    });
    const normalizedDisplay = display.map((item) => {
      if (item.kind !== 'plan-group-placeholder') return item;
      const group = groupedByKey.get(item.key);
      if (!group) return null;
      return { kind: 'plan-group', group };
    }).filter(Boolean);

    return { display: normalizedDisplay, groupedByKey };
  };


  const parseLancamentoDate = (value) => {
    if (!value) return null;
    if (value.includes('/')) {
      const parts = value.split('/');
      if (parts.length === 3) {
        const [d, m, y] = parts;
        return new Date(`${y}-${m}-${d}T00:00:00`);
      }
    }
    return new Date(`${value}T00:00:00`);
  };

  const normalizeFinanceStatus = (value) => {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    if (raw === 'pago' || raw === 'paid') return 'pago';
    if (raw === 'pendente' || raw === 'pending') return 'pendente';
    if (raw === 'cancelado' || raw === 'cancelled') return 'cancelado';
    return raw;
  };
  const getFinanceStatus = (entry) => {
    const paymentStatus = normalizeFinanceStatus(entry?.paymentStatus);
    if (paymentStatus) return paymentStatus;
    return normalizeFinanceStatus(entry?.status);
  };

  const isPaid = (entry) => getFinanceStatus(entry) === 'pago';
  const isPending = (entry) => getFinanceStatus(entry) === 'pendente';
  const isCancelled = (entry) => getFinanceStatus(entry) === 'cancelado';
  const dedupeProcedureLancamentos = (rows = []) => {
    if (!Array.isArray(rows) || rows.length < 2) return Array.isArray(rows) ? rows : [];
    const groups = new Map();
    rows.forEach((entry) => {
      if (!isProcedureLancamento(entry)) return;
      const procedureId = String(entry?.procedureId || entry?.servicoId || '').trim();
      if (!procedureId) return;
      const patientKey = String(entry?.prontuario || entry?.patientId || '').trim();
      if (!patientKey) return;
      const key = `${procedureId}::${patientKey}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(entry);
    });

    const keepIds = new Set();
    const statusRank = (entry) => {
      const status = getFinanceStatus(entry);
      if (status === 'pago') return 3;
      if (status === 'pendente') return 2;
      if (status === 'cancelado') return 1;
      return 0;
    };
    groups.forEach((entries) => {
      if (entries.length === 1) {
        keepIds.add(String(entries[0]?.id || ''));
        return;
      }
      const sorted = entries.slice().sort((a, b) => {
        const rank = statusRank(b) - statusRank(a);
        if (rank !== 0) return rank;
        const timeA = parseAnyDate(a?.updatedAt || a?.paidAt || a?.data || '')?.getTime() || 0;
        const timeB = parseAnyDate(b?.updatedAt || b?.paidAt || b?.data || '')?.getTime() || 0;
        return timeB - timeA;
      });
      keepIds.add(String(sorted[0]?.id || ''));
    });

    return rows.filter((entry) => {
      if (!isProcedureLancamento(entry)) return true;
      const procedureId = String(entry?.procedureId || entry?.servicoId || '').trim();
      const patientKey = String(entry?.prontuario || entry?.patientId || '').trim();
      if (!procedureId || !patientKey) return true;
      return keepIds.has(String(entry?.id || ''));
    });
  };
  const getDueDate = (entry) => parseAnyDate(entry?.dueDate || entry?.vencimento || '');
  const getPaidDate = (entry) => parseAnyDate(entry?.paidAt || entry?.data || '');
  const getEntryDateForPending = (entry) => parseAnyDate(entry?.dueDate || entry?.vencimento || entry?.data || '');
  const getEntryDateForExpense = (entry) => parseAnyDate(entry?.data || '');
  const getEntryRevenueAmount = (entry) => {
    const total = Number(entry?.valor ?? entry?.totalAmount ?? 0);
    return Number.isFinite(total) ? total : 0;
  };
  const getEntryReceivedAmount = (entry) => {
    const paidAmount = Number(entry?.paidAmount);
    if (Number.isFinite(paidAmount) && paidAmount > 0) return paidAmount;
    return isPaid(entry) ? getEntryRevenueAmount(entry) : 0;
  };
  const getEntryPendingAmount = (entry) => {
    const remaining = Number(entry?.remainingAmount);
    if (Number.isFinite(remaining) && remaining >= 0) return remaining;
    return getEntryRevenueAmount(entry);
  };
  const getNormalizedEntryType = (entry) => {
    const raw = String(entry?.tipo || entry?.type || '').toLowerCase().trim();
    if (raw === 'despesa' || raw === 'expense') return 'despesa';
    return 'receita';
  };
  const normalizeLancamentoForGestao = (entry = {}) => ({
    ...entry,
    tipo: getNormalizedEntryType(entry),
    valor: Number(entry?.valor ?? entry?.totalAmount ?? 0) || 0,
    categoria: String(entry?.categoria || entry?.category || '').toLowerCase().trim() || 'outros',
    metodoPagamento: entry?.metodoPagamento || entry?.paymentMethod || '',
    data: entry?.data || entry?.dueDate || entry?.vencimento || entry?.paidAt || entry?.createdAt || '',
  });
  const getEntryReferenceDate = (entry) => {
    if (getNormalizedEntryType(entry) === 'despesa') return getEntryDateForExpense(entry);
    return getPaidDate(entry) || parseAnyDate(entry?.updatedAt || entry?.createdAt || entry?.data || '');
  };
  const computeResumoPeriodoFromLancamentos = (periodo) => {
    let receitas = 0;
    let despesas = 0;
    lancamentos.forEach((item) => {
      if (isCancelled(item)) return;
      if (getNormalizedEntryType(item) === 'receita') {
        const ref = getEntryReferenceDate(item);
        if (ref && getDateInPeriod(ref, periodo)) receitas += getEntryReceivedAmount(item);
        return;
      }
      const valor = Number(item?.valor) || 0;
      const refDespesa = getEntryDateForExpense(item);
      if (refDespesa && getDateInPeriod(refDespesa, periodo)) despesas += valor;
    });
    return { receitas, despesas, saldo: receitas - despesas };
  };

  const parseAnyDate = (value) => {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    const raw = String(value).trim();
    if (!raw) return null;
    if (raw.includes('/')) return parseLancamentoDate(raw);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(`${raw}T00:00:00`);
    const direct = new Date(raw);
    if (!Number.isNaN(direct.getTime())) return direct;
    return null;
  };

  const getDateInPeriod = (date, periodo) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
    const hoje = new Date();
    const startDay = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    if (periodo === 'dia') {
      return (
        date.getFullYear() === startDay.getFullYear() &&
        date.getMonth() === startDay.getMonth() &&
        date.getDate() === startDay.getDate()
      );
    }
    if (periodo === 'semana') {
      const startWeek = new Date(startDay);
      const weekday = startWeek.getDay();
      const adjust = weekday === 0 ? -6 : 1 - weekday;
      startWeek.setDate(startWeek.getDate() + adjust);
      const endWeek = new Date(startWeek);
      endWeek.setDate(startWeek.getDate() + 7);
      return date >= startWeek && date < endWeek;
    }
    return date.getFullYear() === startDay.getFullYear() && date.getMonth() === startDay.getMonth();
  };

  const formatDateBR = (dateLike) => {
    const dt = parseAnyDate(dateLike);
    if (!dt) return '-';
    return dt.toLocaleDateString('pt-BR');
  };

  const filtrarLancamentosPorPeriodo = (lista, periodo) => {
    if (!Array.isArray(lista)) return [];
    const hoje = new Date();
    const inicioSemana = new Date(hoje);
    const diaSemana = inicioSemana.getDay();
    const ajuste = diaSemana === 0 ? -6 : 1 - diaSemana;
    inicioSemana.setDate(inicioSemana.getDate() + ajuste);
    inicioSemana.setHours(0, 0, 0, 0);
    const fimSemana = new Date(inicioSemana);
    fimSemana.setDate(inicioSemana.getDate() + 6);
    fimSemana.setHours(23, 59, 59, 999);

    return lista.filter((l) => {
      const data = parseLancamentoDate(l.data);
      if (!data || Number.isNaN(data.getTime())) return true;

      if (periodo === 'dia') {
        return (
          data.getFullYear() === hoje.getFullYear() &&
          data.getMonth() === hoje.getMonth() &&
          data.getDate() === hoje.getDate()
        );
      }

      if (periodo === 'semana') {
        return data >= inicioSemana && data <= fimSemana;
      }

      return data.getFullYear() === hoje.getFullYear() && data.getMonth() === hoje.getMonth();
    });
  };

  const filtrarLancamentosPorMesAno = (lista, mes, ano) => {
    if (!Array.isArray(lista)) return [];
    const mesNumero = Number(mes);
    const anoNumero = Number(ano);
    return lista.filter((l) => {
      const data = parseLancamentoDate(l.data);
      if (!data || Number.isNaN(data.getTime())) return false;
      return data.getFullYear() === anoNumero && data.getMonth() + 1 === mesNumero;
    });
  };

  const calcularTotais = (lista) => {
    const entradas = lista.filter((l) => getNormalizedEntryType(l) === 'receita');
    const saidas = lista.filter((l) => getNormalizedEntryType(l) !== 'receita');
    const totalEntradas = entradas.reduce((acc, item) => acc + (Number(item.valor) || 0), 0);
    const totalSaidas = saidas.reduce((acc, item) => acc + (Number(item.valor) || 0), 0);
    const saldo = totalEntradas - totalSaidas;
    const totalMovimentado = totalEntradas + totalSaidas;
    return {
      entradas: totalEntradas,
      saidas: totalSaidas,
      saldo,
      movimentado: totalMovimentado,
    };
  };

  const preencherTabelaRelatorio = (seletor, itens) => {
    const tbody = document.querySelector(seletor);
    if (!tbody) return;
    tbody.innerHTML = '';

    itens.forEach((l) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${l.data || ''}</td>
        <td>${l.descricao || ''}</td>
        <td>${formatCategoria(l.categoria)}</td>
        <td>${formatCurrency(l.valor)}</td>
        <td>${(l.status || '').charAt(0).toUpperCase() + (l.status || '').slice(1)}</td>
      `;
      tbody.appendChild(tr);
    });
  };

  const atualizarRelatorio = (lista) => {
    const totais = calcularTotais(lista);
    const totalEntradasEl = document.getElementById('relatorio-total-entradas');
    const totalSaidasEl = document.getElementById('relatorio-total-saidas');
    const totalSaldoEl = document.getElementById('relatorio-total-saldo');
    if (totalEntradasEl) totalEntradasEl.textContent = formatCurrency(totais.entradas);
    if (totalSaidasEl) totalSaidasEl.textContent = formatCurrency(totais.saidas);
    if (totalSaldoEl) totalSaldoEl.textContent = formatCurrency(totais.saldo);
    preencherTabelaRelatorio('#tabela-relatorio-entradas tbody', lista.filter((l) => getNormalizedEntryType(l) === 'receita'));
    preencherTabelaRelatorio('#tabela-relatorio-saidas tbody', lista.filter((l) => getNormalizedEntryType(l) !== 'receita'));
  };

  const atualizarRelatorioAtual = () => {
    const mesEl = document.getElementById('relatorio-mes');
    const anoEl = document.getElementById('relatorio-ano');
    if (!mesEl || !anoEl) return;
    const lista = filtrarLancamentosPorMesAno(lancamentos, mesEl.value, anoEl.value);
    atualizarRelatorio(lista);
  };

  const atualizarResumoDashboard = () => {
    const mesEl = document.getElementById('resumo-mes');
    const anoEl = document.getElementById('resumo-ano');
    if (!mesEl || !anoEl) return;
    const filtrados = filtrarLancamentosPorMesAno(lancamentos, mesEl.value, anoEl.value);
    const totaisMes = calcularTotais(filtrados);
    const entradasEl = document.getElementById('resumo-total-entradas');
    const saidasEl = document.getElementById('resumo-total-saidas');
    const saldoEl = document.getElementById('resumo-total-saldo');
    if (entradasEl) entradasEl.textContent = formatCurrency(totaisMes.entradas);
    if (saidasEl) saidasEl.textContent = formatCurrency(totaisMes.saidas);
    if (saldoEl) saldoEl.textContent = formatCurrency(totaisMes.saldo);
  };

  function configurarRelatorios() {
    const mesEl = document.getElementById('relatorio-mes');
    const anoEl = document.getElementById('relatorio-ano');
    const btnGerar = document.getElementById('btn-gerar-relatorio');
    if (!mesEl || !anoEl) return;

    const hoje = new Date();
    mesEl.value = String(hoje.getMonth() + 1);
    anoEl.value = String(hoje.getFullYear());

    if (btnGerar) {
      btnGerar.addEventListener('click', atualizarRelatorioAtual);
    }
  }

  function configurarResumoDashboard() {
    const mesEl = document.getElementById('resumo-mes');
    const anoEl = document.getElementById('resumo-ano');
    const btnAtualizar = document.getElementById('btn-atualizar-resumo');
    if (!mesEl || !anoEl) return;

    const hoje = new Date();
    mesEl.value = String(hoje.getMonth() + 1);
    anoEl.value = String(hoje.getFullYear());

    if (btnAtualizar) {
      btnAtualizar.addEventListener('click', atualizarResumoDashboard);
    }
  }

  let pacientesCache = [];
  const appApi = window.appApi || {};
  const authApi = appApi.auth || window.auth || {};
  const patientsApi = appApi.patients || window.api?.patients || {};
  const financeApi = appApi.finance || window.api?.finance || {};
  const servicesApi = appApi.services || window.api?.services || {};


  const carregarPacientesReceita = async () => {
    const listaEl = document.getElementById('lista-pacientes');
    if (!listaEl || !patientsApi.list) return;

    try {
      const lista = await patientsApi.list();
      pacientesCache = lista || [];
      listaEl.innerHTML = '';

      pacientesCache.forEach((p) => {
        const nome = p.fullName || p.nome || 'Sem nome';
        const cpf = String(p.cpf || '').replace(/\D/g, '');
        const prontuario = String(p.prontuario || '').trim();

        const optNome = document.createElement('option');
        optNome.value = nome;
        listaEl.appendChild(optNome);

        if (cpf) {
          const optCpf = document.createElement('option');
          optCpf.value = cpf;
          listaEl.appendChild(optCpf);
        }

        if (prontuario) {
          const optPront = document.createElement('option');
          optPront.value = prontuario;
          listaEl.appendChild(optPront);
        }
      });
    } catch (err) {
      console.error('Erro ao carregar pacientes:', err);
    }
  };

  const resolverPaciente = (valor) => {
    const raw = String(valor || '').trim();
    if (!raw) return '';
    const lower = raw.toLowerCase();
    const digits = raw.replace(/\D/g, '');

    const encontrado = pacientesCache.find((p) => {
      const nome = (p.fullName || p.nome || '').toLowerCase();
      const cpf = String(p.cpf || '').replace(/\D/g, '');
      const prontuario = String(p.prontuario || '').toLowerCase();
      return nome === lower || (digits && cpf === digits) || prontuario === lower;
    });

    return encontrado ? (encontrado.fullName || encontrado.nome || raw) : raw;
  };

  const preencherListaColaboradores = () => {
    const listaEl = document.getElementById('lista-colaboradores-lancamento');
    if (!listaEl) return;
    listaEl.innerHTML = '';
    dentistasGestaoCache.forEach((dentista) => {
      const nome = String(dentista?.nome || dentista?.fullName || dentista?.login || '').trim();
      if (!nome) return;
      const opt = document.createElement('option');
      opt.value = nome;
      listaEl.appendChild(opt);
    });
  };

  const preencherFiltrosDentistasGestao = () => {
    [
      document.getElementById('filtro-receitas-dentista'),
      document.getElementById('filtro-despesas-dentista'),
    ].forEach((select) => {
      if (!select) return;
      const currentValue = String(select.value || '');
      select.innerHTML = '<option value="">Todos os dentistas</option>';
      dentistasGestaoCache.forEach((dentista) => {
        const dentistaId = String(dentista?.id || '').trim();
        const nome = String(dentista?.nome || dentista?.fullName || dentista?.login || '').trim();
        if (!nome) return;
        const option = document.createElement('option');
        option.value = dentistaId || nome;
        option.textContent = nome;
        select.appendChild(option);
      });
      if (currentValue && Array.from(select.options).some((opt) => opt.value === currentValue)) {
        select.value = currentValue;
      }
    });
  };

  const carregarDentistasGestao = async () => {
    try {
      const clinicId = String(usuarioLogado?.clinicId || '').trim();
      const users = await authApi.listUsers?.();
      dentistasGestaoCache = (Array.isArray(users) ? users : []).filter((user) => {
        const tipo = String(user?.tipo || user?.role || '').trim().toLowerCase();
        const normalizedClinicId = String(user?.clinicId || '').trim();
        return (tipo === 'dentista' || tipo === 'dentista'.toUpperCase().toLowerCase())
          && (!clinicId || normalizedClinicId === clinicId);
      });
      preencherListaColaboradores();
      preencherFiltrosDentistasGestao();
    } catch (err) {
      console.warn('Falha ao carregar dentistas da gestao.', err);
      dentistasGestaoCache = [];
      preencherListaColaboradores();
      preencherFiltrosDentistasGestao();
    }
  };

  const resolveDentistaGestao = (value) => {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return null;
    return dentistasGestaoCache.find((dentista) => String(dentista?.nome || dentista?.fullName || dentista?.login || '').trim().toLowerCase() === raw) || null;
  };

  let lancamentos = [];
  let editingLancamentoId = null;
  let isFinanceAdmin = false;
  let gestaoHubRuntimeEnabled = ENABLE_GESTAO_HUB;
  let periodoAtual = 'mes'; // 'dia', 'semana', 'mes'
  let secaoAtual = 'overview';
  let filtroReceitasTexto = '';
  let filtroReceitasDentista = '';
  let filtroReceitasStatus = '';
  let filtroReceitasSomenteAtrasadas = false;
  let filtroDespesasTexto = '';
  let filtroDespesasDentista = '';
  let filtroDespesasStatus = '';
  let filtroLucratividadeTexto = '';
  let procedimentosById = new Map();
  let returnToLancamentoDetailsId = '';
  let dentistasGestaoCache = [];
  let procedimentosLucratividade = [];
  let planGroupedReceitasIndex = new Map();
  let estoqueProdutos = [];
  let estoqueBusca = '';
  let estoqueEditId = null;
  let activeRowMenu = null;
  const ESTOQUE_STORAGE_KEY = 'voithos_estoque_produtos_v1';

  let usuarioLogado = null;
  let financeRefreshInFlight = false;
  const TREND_SECTION_HTML = `
    <section class="bloco trend-bloco">
      <div class="bloco-header">
        <h2 data-trend-role="title">Tendencia do periodo</h2>
      </div>
      <div class="trend-grid">
        <div class="trend-item">
          <div class="trend-top">
            <span data-trend-role="receitas-label">Faturamento</span>
            <strong data-trend-role="receitas-valor">R$ 0,00</strong>
          </div>
          <div class="trend-bar">
            <div data-trend-role="receitas-bar"></div>
          </div>
        </div>
        <div class="trend-item">
          <div class="trend-top">
            <span data-trend-role="despesas-label">Despesas</span>
            <strong data-trend-role="despesas-valor">R$ 0,00</strong>
          </div>
          <div class="trend-bar despesa">
            <div data-trend-role="despesas-bar"></div>
          </div>
        </div>
      </div>
      <p class="trend-insight" data-trend-role="insight">Despesas representam 0,0% do faturamento no periodo</p>
    </section>
  `;

  const emitFinanceUpdated = (source) => {
    try {
      window.dispatchEvent(new CustomEvent('finance-updated', { detail: { source: source || 'gestao' } }));
      localStorage.setItem('voithos-finance-updated', JSON.stringify({ at: Date.now(), source: source || 'gestao' }));
    } catch (_) {
    }
  };

  const refreshFinanceViews = async () => {
    if (financeRefreshInFlight) return;
    financeRefreshInFlight = true;
    try {
      await carregarLancamentos();
    } finally {
      financeRefreshInFlight = false;
    }
  };
  const getPeriodoTrendLabel = () => {
    if (periodoAtual === 'dia') return { title: 'Tendencia do dia', short: 'dia' };
    if (periodoAtual === 'semana') return { title: 'Tendencia da semana', short: 'semana' };
    return { title: 'Tendencia do mes', short: 'mes' };
  };
  const renderTrendSection = (containerId, data = {}) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!container.querySelector('[data-trend-role="title"]')) {
      container.innerHTML = TREND_SECTION_HTML;
    }
    const receitas = Number(data.receitas || 0);
    const despesas = Number(data.despesas || 0);
    const maxValue = Math.max(receitas, despesas, 1);
    const label = getPeriodoTrendLabel();
    const titleEl = container.querySelector('[data-trend-role="title"]');
    const receitasLabelEl = container.querySelector('[data-trend-role="receitas-label"]');
    const despesasLabelEl = container.querySelector('[data-trend-role="despesas-label"]');
    const receitasValorEl = container.querySelector('[data-trend-role="receitas-valor"]');
    const despesasValorEl = container.querySelector('[data-trend-role="despesas-valor"]');
    const receitasBarEl = container.querySelector('[data-trend-role="receitas-bar"]');
    const despesasBarEl = container.querySelector('[data-trend-role="despesas-bar"]');
    const insightEl = container.querySelector('[data-trend-role="insight"]');
    if (titleEl) titleEl.textContent = label.title;
    if (receitasLabelEl) receitasLabelEl.textContent = `Faturamento (${label.short})`;
    if (despesasLabelEl) despesasLabelEl.textContent = `Despesas (${label.short})`;
    if (receitasValorEl) receitasValorEl.textContent = formatCurrency(receitas);
    if (despesasValorEl) despesasValorEl.textContent = formatCurrency(despesas);
    if (receitasBarEl) receitasBarEl.style.width = `${Math.max(6, (receitas / maxValue) * 100)}%`;
    if (despesasBarEl) despesasBarEl.style.width = `${Math.max(6, (despesas / maxValue) * 100)}%`;
    if (insightEl) {
      const percentual = receitas > 0 ? (despesas / receitas) * 100 : 0;
      insightEl.textContent = `Despesas representam ${percentual.toFixed(1).replace('.', ',')}% do faturamento no periodo`;
    }
  };
  const renderTrendSections = (data = {}) => {
    renderTrendSection('trend-overview', data);
    renderTrendSection('trend-receitas', data);
    renderTrendSection('trend-despesas', data);
  };

  const readEstoqueStorage = () => {
    try {
      const raw = window.localStorage.getItem(ESTOQUE_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.warn('Falha ao ler estoque no localStorage.', err);
      return [];
    }
  };

  const writeEstoqueStorage = (list) => {
    try {
      window.localStorage.setItem(ESTOQUE_STORAGE_KEY, JSON.stringify(list || []));
    } catch (err) {
      console.warn('Falha ao salvar estoque no localStorage.', err);
    }
  };

  const normalizeStockNumber = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.trunc(n);
  };

  const getStockStatus = (item) => {
    const atual = normalizeStockNumber(item?.estoqueAtual);
    const minimo = normalizeStockNumber(item?.estoqueMinimo);
    if (atual <= 0) return { key: 'critical', label: 'Crítico' };
    if (atual <= minimo) return { key: 'low', label: 'Baixo' };
    return { key: 'ok', label: 'OK' };
  };

  const getFilteredEstoque = () => {
    const q = String(estoqueBusca || '').toLowerCase().trim();
    return estoqueProdutos.filter((item) => {
      if (!q) return true;
      const text = [item.nome, item.categoria, item.unidade]
        .map((v) => String(v || '').toLowerCase())
        .join(' ');
      return text.includes(q);
    });
  };

  const openEstoqueModal = (item) => {
    const bg = document.getElementById('modal-estoque-bg');
    if (!bg) return;
    estoqueEditId = item?.id || null;
    const title = document.getElementById('titulo-modal-estoque');
    if (title) title.textContent = estoqueEditId ? 'Editar produto' : 'Cadastrar produto';

    const nomeEl = document.getElementById('input-estoque-nome');
    const categoriaEl = document.getElementById('input-estoque-categoria');
    const unidadeEl = document.getElementById('input-estoque-unidade');
    const minimoEl = document.getElementById('input-estoque-minimo');

    if (nomeEl) nomeEl.value = item?.nome || '';
    if (categoriaEl) categoriaEl.value = item?.categoria || 'EPI';
    if (unidadeEl) unidadeEl.value = item?.unidade || 'Unidade';
    if (minimoEl) minimoEl.value = normalizeStockNumber(item?.estoqueMinimo);
    bg.classList.remove('hidden');
  };

  const closeEstoqueModal = () => {
    const bg = document.getElementById('modal-estoque-bg');
    if (!bg) return;
    bg.classList.add('hidden');
    estoqueEditId = null;
  };

  const saveEstoqueProduto = () => {
    const nomeEl = document.getElementById('input-estoque-nome');
    const categoriaEl = document.getElementById('input-estoque-categoria');
    const unidadeEl = document.getElementById('input-estoque-unidade');
    const minimoEl = document.getElementById('input-estoque-minimo');

    const nome = String(nomeEl?.value || '').trim();
    const categoria = String(categoriaEl?.value || 'EPI');
    const unidade = String(unidadeEl?.value || 'Unidade');
    const estoqueMinimo = normalizeStockNumber(minimoEl?.value);
    if (!nome) {
      alert('Informe o nome do produto.');
      return;
    }

    if (estoqueEditId) {
      estoqueProdutos = estoqueProdutos.map((item) => {
        if (item.id !== estoqueEditId) return item;
        return { ...item, nome, categoria, unidade, estoqueMinimo };
      });
    } else {
      const novo = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        nome,
        categoria,
        unidade,
        estoqueMinimo,
        estoqueAtual: estoqueMinimo,
        createdAt: new Date().toISOString(),
      };
      estoqueProdutos.push(novo);
    }

    writeEstoqueStorage(estoqueProdutos);
    closeEstoqueModal();
    renderEstoque();
  };

  const renderEstoque = () => {
    const tableWrap = document.getElementById('estoque-table-wrap');
    const emptyState = document.getElementById('estoque-empty-state');
    const tbody = document.querySelector('#tabela-estoque tbody');
    const totalEl = document.getElementById('estoque-resumo-total');
    const criticosEl = document.getElementById('estoque-resumo-criticos');
    const baixosEl = document.getElementById('estoque-resumo-baixos');
    if (!tableWrap || !emptyState || !tbody) return;

    const totalProdutos = estoqueProdutos.length;
    const criticos = estoqueProdutos.filter((item) => getStockStatus(item).key === 'critical').length;
    const baixos = estoqueProdutos.filter((item) => getStockStatus(item).key === 'low').length;
    if (totalEl) totalEl.textContent = String(totalProdutos);
    if (criticosEl) criticosEl.textContent = String(criticos);
    if (baixosEl) baixosEl.textContent = String(baixos);

    const lista = getFilteredEstoque();
    tbody.innerHTML = '';

    if (!lista.length) {
      tableWrap.classList.add('hidden');
      emptyState.classList.remove('hidden');
      return;
    }

    tableWrap.classList.remove('hidden');
    emptyState.classList.add('hidden');

    lista.forEach((item) => {
      const status = getStockStatus(item);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${item.nome || ''}</td>
        <td>${item.categoria || ''}</td>
        <td>${item.unidade || ''}</td>
        <td>${normalizeStockNumber(item.estoqueAtual)}</td>
        <td>${normalizeStockNumber(item.estoqueMinimo)}</td>
        <td><span class="stock-status ${status.key}">${status.label}</span></td>
        <td class="actions-col">
          <div class="row-actions">
            <button class="btn-row-actions" type="button" data-action="stock-row-menu" data-id="${item.id}" aria-haspopup="menu" aria-expanded="false" aria-label="Abrir ações">&#8942;</button>
            <div class="row-actions-menu" data-stock-menu-id="${item.id}">
              <button type="button" data-action="stock-edit" data-id="${item.id}">Editar</button>
              <button type="button" data-action="stock-adjust" data-id="${item.id}">Ajustar estoque</button>
              <button type="button" class="danger" data-action="stock-delete" data-id="${item.id}">Excluir</button>
            </div>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  };

  const toggleStockRowMenu = (id) => {
    if (!id) return;
    const menu = document.querySelector(`.row-actions-menu[data-stock-menu-id="${id}"]`);
    if (!menu) return;
    const isOpen = activeRowMenu === menu && menu.classList.contains('open');
    closeRowMenus();
    if (isOpen) return;
    menu.classList.add('open');
    positionRowMenu(menu);
    setMenuButtonExpanded(menu, true);
    activeRowMenu = menu;
  };

  const configureEstoqueModule = () => {
    estoqueProdutos = readEstoqueStorage();
    renderEstoque();

    const busca = document.getElementById('estoque-busca');
    const btnCadastro = document.getElementById('btn-estoque-cadastrar');
    const btnCadastroEmpty = document.getElementById('btn-estoque-cadastrar-empty');
    const btnSalvar = document.getElementById('btn-salvar-estoque');
    const btnCancelar = document.getElementById('btn-cancelar-estoque');
    const btnFechar = document.getElementById('btn-fechar-modal-estoque');
    const modalBg = document.getElementById('modal-estoque-bg');
    const tabela = document.getElementById('tabela-estoque');

    busca?.addEventListener('input', () => {
      estoqueBusca = busca.value || '';
      renderEstoque();
    });
    btnCadastro?.addEventListener('click', () => openEstoqueModal());
    btnCadastroEmpty?.addEventListener('click', () => openEstoqueModal());
    btnSalvar?.addEventListener('click', saveEstoqueProduto);
    btnCancelar?.addEventListener('click', closeEstoqueModal);
    btnFechar?.addEventListener('click', closeEstoqueModal);

    modalBg?.addEventListener('click', (event) => {
      if (event.target === modalBg) closeEstoqueModal();
    });

    tabela?.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-action');
      const id = btn.getAttribute('data-id');
      if (!id) return;
      const item = estoqueProdutos.find((p) => p.id === id);
      if (!item) return;

      if (action === 'stock-row-menu') {
        event.stopPropagation();
        toggleStockRowMenu(id);
        return;
      }

      closeRowMenus();

      if (action === 'stock-edit') {
        openEstoqueModal(item);
        return;
      }
      if (action === 'stock-adjust') {
        const atual = normalizeStockNumber(item.estoqueAtual);
        const novoValor = prompt('Informe o novo estoque atual:', String(atual));
        if (novoValor === null) return;
        const estoqueAtual = normalizeStockNumber(novoValor);
        estoqueProdutos = estoqueProdutos.map((p) => (p.id === id ? { ...p, estoqueAtual } : p));
        writeEstoqueStorage(estoqueProdutos);
        renderEstoque();
        return;
      }
      if (action === 'stock-delete') {
        const ok = confirm('Excluir este produto do estoque?');
        if (!ok) return;
        estoqueProdutos = estoqueProdutos.filter((p) => p.id !== id);
        writeEstoqueStorage(estoqueProdutos);
        renderEstoque();
      }
    });

    document.addEventListener('click', (event) => {
      if (!event.target.closest('.row-actions')) {
        closeRowMenus();
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeRowMenus();
    });
    window.addEventListener('resize', () => {
      if (!activeRowMenu) return;
      positionRowMenu(activeRowMenu);
    }, { passive: true });
  };

  const setHubBackButtonsVisible = (visible) => {
    const btnFinanceiro = document.getElementById('btn-voltar-hub-financeiro');
    const btnOperacional = document.getElementById('btn-voltar-hub-operacional');
    [btnFinanceiro, btnOperacional].forEach((btn) => {
      if (!btn) return;
      btn.classList.toggle('hidden', !visible);
    });
  };

  const setGestaoView = (view) => {
    const hub = document.getElementById('gestao-hub');
    const financeiro = document.getElementById('gestao-financeiro');
    const operacional = document.getElementById('gestao-operacional');
    if (!hub || !financeiro || !operacional) return;
    hub.classList.toggle('hidden', view !== 'hub');
    financeiro.classList.toggle('hidden', view !== 'financeiro');
    operacional.classList.toggle('hidden', view !== 'operacional');
    if (view !== 'operacional') {
      const placeholder = document.getElementById('gestao-operacional-estoque-placeholder');
      if (placeholder) placeholder.classList.add('hidden');
      const navLab = document.getElementById('nav-operacional-laboratorio');
      const navEstoque = document.getElementById('btn-operacional-open-estoque');
      navLab?.classList.add('active');
      navEstoque?.classList.remove('active');
    }
  };

  const bindClickOnce = (id, handler) => {
    const el = document.getElementById(id);
    if (!el || el.dataset.boundClick === 'true') return;
    el.addEventListener('click', handler);
    el.dataset.boundClick = 'true';
  };

  const setupGestaoHub = () => {
    const hub = document.getElementById('gestao-hub');
    const financeiro = document.getElementById('gestao-financeiro');
    const operacional = document.getElementById('gestao-operacional');
    if (!hub || !financeiro || !operacional) {
      throw new Error('Containers do Hub de Gestao nao encontrados.');
    }

    if (!gestaoHubRuntimeEnabled) {
      setHubBackButtonsVisible(false);
      setGestaoView('financeiro');
      return;
    }

    setHubBackButtonsVisible(true);
    setGestaoView('hub');

    bindClickOnce('btn-hub-open-financeiro', () => setGestaoView('financeiro'));
    bindClickOnce('btn-hub-open-operacional', () => {
      const placeholder = document.getElementById('gestao-operacional-estoque-placeholder');
      if (placeholder) placeholder.classList.add('hidden');
      const navLab = document.getElementById('nav-operacional-laboratorio');
      const navEstoque = document.getElementById('btn-operacional-open-estoque');
      navLab?.classList.add('active');
      navEstoque?.classList.remove('active');
      setGestaoView('operacional');
    });
    bindClickOnce('btn-voltar-hub-financeiro', () => setGestaoView('hub'));
    bindClickOnce('btn-voltar-hub-operacional', () => setGestaoView('hub'));
    const abrirEstoqueOperacional = () => {
      const placeholder = document.getElementById('gestao-operacional-estoque-placeholder');
      if (!placeholder) return;
      placeholder.classList.remove('hidden');
      const navLab = document.getElementById('nav-operacional-laboratorio');
      const navEstoque = document.getElementById('btn-operacional-open-estoque');
      navLab?.classList.remove('active');
      navEstoque?.classList.add('active');
    };
    bindClickOnce('btn-operacional-open-estoque', abrirEstoqueOperacional);
    bindClickOnce('btn-operacional-open-estoque-card', abrirEstoqueOperacional);
  };

  const ensureAdmin = async () => {
    try {
      usuarioLogado = await authApi.currentUser?.();
      const profile = String(usuarioLogado?.tipo || usuarioLogado?.role || '').trim().toLowerCase();
      const canViewFinance = usuarioLogado?.permissions?.admin === true
        || usuarioLogado?.permissions?.['finance.view'] === true
        || ['admin', 'administrativo', 'dentista', 'super_admin'].includes(profile);
      isFinanceAdmin = usuarioLogado?.permissions?.admin === true || ['admin', 'administrativo', 'super_admin'].includes(profile);
      if (!usuarioLogado || !canViewFinance) {
        console.warn('Acesso financeiro bloqueado para usuario sem permissao.');
        return false;
      }
      return true;
    } catch (err) {
      console.warn('Falha ao obter usuario atual.', err);
      return false;
    }
  };

  async function carregarDashboard() {
    try {
      const isAdmin = await ensureAdmin();
      if (!isAdmin) return;
      const dashRaw = await financeApi.getDashboard?.();
      const dash = dashRaw || {
        hoje: { receitas: 0, despesas: 0, saldo: 0 },
        semana: { receitas: 0, despesas: 0, saldo: 0 },
        mes: { receitas: 0, despesas: 0, saldo: 0 },
        categoriasMes: {},
        despesasFuncionarios: [],
      };
      try {
        console.info('[GESTAO] financial_widget_source', JSON.stringify({
          widget: 'gestao-dashboard-cards',
          financial_widget_source: 'finance-list',
          metric_semantics: {
            receitas: 'paid_amount_in_selected_period',
            despesas: 'expense_amount_in_selected_period',
            saldo: 'receitas_minus_despesas_in_selected_period',
            aReceber: 'pending_revenue_in_selected_period',
            emAtraso: 'overdue_pending_revenue_in_selected_period',
          },
        }));
        console.info('[GESTAO] financial_widget_source', JSON.stringify({
          widget: 'gestao-dashboard-supporting',
          financial_widget_source: 'dashboard',
          metric_semantics: {
            categoriasMes: 'central_dashboard_categories',
            despesasFuncionarios: 'central_dashboard_employee_expenses',
          },
        }));
      } catch (_) {}

      let bloco;
      let widgetSource = 'finance-list';
      let zeroReason = '';
      if (periodoAtual === 'dia') {
        bloco = computeResumoPeriodoFromLancamentos('dia');
        document.getElementById('texto-periodo-faturamento').textContent = 'Hoje';
        document.getElementById('texto-periodo-despesas').textContent = 'Hoje';
        document.getElementById('texto-periodo-saldo').textContent = 'Hoje';
      } else if (periodoAtual === 'semana') {
        bloco = computeResumoPeriodoFromLancamentos('semana');
        document.getElementById('texto-periodo-faturamento').textContent = 'Semana atual';
        document.getElementById('texto-periodo-despesas').textContent = 'Semana atual';
        document.getElementById('texto-periodo-saldo').textContent = 'Semana atual';
      } else {
        const monthlySummary = dash?.monthlySummary || null;
        bloco = computeResumoPeriodoFromLancamentos('mes');
        if ((!bloco.receitas && !bloco.despesas) && monthlySummary) {
          bloco = {
            receitas: Number(monthlySummary?.totalReceived) || 0,
            despesas: Number(monthlySummary?.totalExpenses) || 0,
            saldo: Number(monthlySummary?.saldo) || ((Number(monthlySummary?.totalReceived) || 0) - (Number(monthlySummary?.totalExpenses) || 0)),
          };
          widgetSource = 'dashboard';
        }
        document.getElementById('texto-periodo-faturamento').textContent = 'Mes atual';
        document.getElementById('texto-periodo-despesas').textContent = 'Mes atual';
        document.getElementById('texto-periodo-saldo').textContent = 'Mes atual';
      }
      if (!bloco.receitas && !bloco.despesas) {
        zeroReason = Array.isArray(lancamentos) && lancamentos.length ? 'period_filter' : 'no_data';
      }

      document.getElementById('valor-faturamento').textContent = formatCurrency(bloco.receitas);
      document.getElementById('valor-despesas').textContent = formatCurrency(bloco.despesas);
      document.getElementById('valor-saldo').textContent = formatCurrency(bloco.saldo);
      const cardBarReceitas = document.getElementById('card-bar-faturamento');
      const cardBarDespesas = document.getElementById('card-bar-despesas');
      const cardBarMax = Math.max(Number(bloco.receitas || 0), Number(bloco.despesas || 0), 1);
      if (cardBarReceitas) cardBarReceitas.style.width = `${Math.max(6, (Number(bloco.receitas || 0) / cardBarMax) * 100)}%`;
      if (cardBarDespesas) cardBarDespesas.style.width = `${Math.max(6, (Number(bloco.despesas || 0) / cardBarMax) * 100)}%`;
      const hubFaturamento = document.getElementById('hub-finance-faturamento');
      const hubDespesas = document.getElementById('hub-finance-despesas');
      const hubSaldo = document.getElementById('hub-finance-saldo');
      if (hubFaturamento) hubFaturamento.textContent = formatCurrency(bloco.receitas);
      if (hubDespesas) hubDespesas.textContent = formatCurrency(bloco.despesas);
      if (hubSaldo) hubSaldo.textContent = formatCurrency(bloco.saldo);

      const hoje = new Date();
      const receitasPendentes = lancamentos
        .filter((l) => getNormalizedEntryType(l) === 'receita')
        .filter((l) => isPending(l))
        .filter((l) => {
          const ref = getEntryDateForPending(l);
          if (!ref) return false;
          return getDateInPeriod(ref, periodoAtual);
        });
      const aReceber = receitasPendentes.length
        ? receitasPendentes.reduce((acc, item) => acc + getEntryPendingAmount(item), 0)
        : (periodoAtual === 'mes' && dash?.monthlySummary ? (Number(dash.monthlySummary?.totalPending) || 0) : 0);
      const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
      const overduePending = receitasPendentes
        .filter((item) => {
          const due = getDueDate(item);
          return due && !Number.isNaN(due.getTime()) && due < inicioHoje;
        });
      const emAtraso = overduePending.length
        ? overduePending.reduce((acc, item) => acc + getEntryPendingAmount(item), 0)
        : (periodoAtual === 'mes' && dash?.monthlySummary ? (Number(dash.monthlySummary?.totalOverdue) || 0) : 0);

      const aReceberEl = document.getElementById('valor-a-receber');
      const emAtrasoEl = document.getElementById('valor-em-atraso');
      if (aReceberEl) aReceberEl.textContent = formatCurrency(aReceber);
      if (emAtrasoEl) emAtrasoEl.textContent = formatCurrency(emAtraso);
      try {
        console.info('[GESTAO] management_widget_loaded', JSON.stringify({
          widget: 'gestao-dashboard-cards',
          management_widget_source: widgetSource,
          management_widget_metric: 'receita_recebida|despesas|saldo|a_receber|em_atraso',
          management_widget_zero_reason: zeroReason,
          clinicId: usuarioLogado?.clinicId || '',
          period: periodoAtual,
        }));
      } catch (_) {}

      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const lastUpdateEl = document.getElementById('finance-last-update');
      if (lastUpdateEl) lastUpdateEl.textContent = `Atualizado às ${hh}:${mm}`;

      renderTrendSections(bloco);

      preencherCategorias(dash.categoriasMes || {});
      preencherTabelaColaboradores(dash.despesasFuncionarios || []);
    } catch (err) {
      console.error('Erro ao carregar dashboard financeiro:', err);
    }
  }

  function preencherCategorias(categorias) {
    const ul = document.getElementById('lista-categorias');
    if (!ul) return;
    ul.innerHTML = '';

    const mapLabels = {
      laboratorio: 'Laboratorio',
      materiais: 'Materiais',
      funcionarios: 'Colaboradores',
      fixos: 'Fixos',
      outros: 'Outros',
    };

    Object.keys(categorias).forEach((key) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <span>${mapLabels[key] || key}</span>
        <strong>${formatCurrency(categorias[key])}</strong>
      `;
      ul.appendChild(li);
    });
  }

  function preencherTabelaColaboradores(itens) {
    const tbody = document.querySelector('#tabela-colaboradores tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    itens.forEach((l) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${l.data || ''}</td>
        <td>${l.funcionario || '-'}</td>
        <td>${l.descricao || ''}</td>
        <td>${formatCurrency(l.valor)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function buildActionsCell(l, options = {}) {
    const groupedPlan = options?.groupedPlan || null;
    const baseEntry = groupedPlan ? (groupedPlan.entries?.[0] || null) : l;
    const id = groupedPlan ? String(groupedPlan.representativeId || '') : String(l?.id || '');
      const isReceita = groupedPlan ? true : getNormalizedEntryType(l) === 'receita';
    const navItem = baseEntry && canOpenPatientFinanceFromEntry(baseEntry)
      ? `<button type="button" data-action="open-patient-finance" data-id="${id}">Abrir financeiro no prontuario</button>`
      : '';
    const viewParcelsItem = groupedPlan
      ? `<button type="button" data-action="show-plan-parcels" data-plan-key="${groupedPlan.key}">Ver parcelas</button>`
      : '';
    const openPlanItem = groupedPlan?.planId
      ? `<button type="button" data-action="open-plan-page" data-plan-id="${groupedPlan.planId}">Abrir plano</button>`
      : '';
    if (groupedPlan) {
      const groupItems = [viewParcelsItem, openPlanItem, navItem].filter(Boolean).join('');
      if (!groupItems.trim()) return '<td class="actions-col"></td>';
      return `
        <td class="actions-col">
          <div class="row-actions">
            <button class="btn-row-actions" type="button" data-action="row-menu" data-id="${id}" aria-haspopup="menu" aria-expanded="false" aria-label="Abrir ações">&#8942;</button>
            <div class="row-actions-menu" data-menu-id="${id}">
              ${groupItems}
            </div>
          </div>
        </td>
      `;
    }
    const adminItems = isFinanceAdmin
      ? (isReceita
        ? `
            <button type="button" data-action="confirm" data-id="${id}">Confirmar recebimento</button>
            <button type="button" data-action="cancel" data-id="${id}">Cancelar recebimento</button>
            <button type="button" data-action="edit" data-id="${id}">Detalhes de recebimento</button>
            <button type="button" class="danger" data-action="delete" data-id="${id}">Excluir recebimento</button>
        `
        : `
            <button type="button" data-action="confirm" data-id="${id}">Confirmar pagamento</button>
            <button type="button" data-action="cancel" data-id="${id}">Cancelar pagamento</button>
            <button type="button" data-action="edit" data-id="${id}">Detalhes da despesa</button>
            <button type="button" class="danger" data-action="delete" data-id="${id}">Excluir despesa</button>
        `)
      : '';
    const menuItems = [navItem, adminItems].filter(Boolean).join('');
    if (!menuItems.trim()) return '<td class="actions-col"></td>';

    return `
      <td class="actions-col">
        <div class="row-actions">
          <button class="btn-row-actions" type="button" data-action="row-menu" data-id="${id}" aria-haspopup="menu" aria-expanded="false" aria-label="Abrir ações">&#8942;</button>
          <div class="row-actions-menu" data-menu-id="${id}">
            ${menuItems}
          </div>
        </div>
      </td>
    `;
  }

  function preencherTabelas() {
    const tbodyRec = document.querySelector('#tabela-receitas tbody');
    const tbodyDesp = document.querySelector('#tabela-despesas tbody');
    const tbodyRecPreview = document.querySelector('#tabela-receitas-preview tbody');
    const tbodyDespPreview = document.querySelector('#tabela-despesas-preview tbody');
    if (!tbodyRec || !tbodyDesp) return;

    tbodyRec.innerHTML = '';
    tbodyDesp.innerHTML = '';
    if (tbodyRecPreview) tbodyRecPreview.innerHTML = '';
    if (tbodyDespPreview) tbodyDespPreview.innerHTML = '';

    const receitasFiltradas = getReceitasFiltradas();
    const despesasFiltradas = getDespesasFiltradas();
    const receitasDisplay = getPlanDisplayRows(receitasFiltradas);
    planGroupedReceitasIndex = receitasDisplay.groupedByKey;

    receitasDisplay.display.forEach((rowData) => {
      const tr = document.createElement('tr');
      if (rowData.kind === 'plan-group') {
        const group = rowData.group;
        const actionsCell = buildActionsCell(group.entries[0], { groupedPlan: group });
        const parcelasInfo = `${group.totals.paidParcels}/${group.totals.totalParcels}`;
        const descricao = `${stripDescricaoTag(group.title)}${group.patientName ? ` - ${group.patientName}` : ''} (${parcelasInfo} pagas)`;
        const metodoLabel = 'Parcelado';
        const valorLabel = group.totals.pendingValue > 0
          ? `${formatCurrency(group.totals.paidValue)} recebido | ${formatCurrency(group.totals.pendingValue)} pendente`
          : formatCurrency(group.totals.totalValue);
        tr.innerHTML = `
          <td>${group.date || ''}</td>
          <td>${descricao}</td>
          <td>Planos</td>
          <td>${metodoLabel}</td>
          <td>${valorLabel}</td>
          <td>${group.statusLabel}</td>
          ${actionsCell}
        `;
      } else {
        const l = rowData.entry;
        const actionsCell = buildActionsCell(l);
        const descricao = formatDescricaoCell(
          formatReceitaDescricaoDisplay(l),
          resolveLancamentoColaborador(l) ? `Responsavel: ${resolveLancamentoColaborador(l)}` : ''
        );
        tr.innerHTML = `
          <td>${l.data || ''}</td>
          <td>${descricao}</td>
          <td>${formatCategoria(l.categoria)}</td>
          <td>${formatMetodoPagamento(l.metodoPagamento)}</td>
          <td>${formatCurrency(l.valor)}</td>
          <td>${getFinanceStatus(l).replace(/^./, (m) => m.toUpperCase())}</td>
          ${actionsCell}
        `;
      }
      tbodyRec.appendChild(tr);
    });

    despesasFiltradas.forEach((l) => {
      const tr = document.createElement('tr');
      const actionsCell = buildActionsCell(l);
      tr.innerHTML = `
        <td>${l.data || ''}</td>
        <td>${formatDescricaoCell(l.descricao || '', resolveLancamentoColaborador(l) ? `Responsavel: ${resolveLancamentoColaborador(l)}` : '')}</td>
        <td>${formatCategoria(l.categoria)}</td>
        <td>${formatMetodoPagamento(l.metodoPagamento)}</td>
        <td>${formatCurrency(l.valor)}</td>
        <td>${getFinanceStatus(l).replace(/^./, (m) => m.toUpperCase())}</td>
        ${actionsCell}
      `;
      tbodyDesp.appendChild(tr);
    });

    const receitasPreview = getLancamentosPeriodoAtual()
      .filter((l) => getNormalizedEntryType(l) === 'receita')
      .slice()
      .sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')))
      .slice(0, 5);
    const totalReceitasPeriodo = getLancamentosPeriodoAtual().filter((l) => getNormalizedEntryType(l) === 'receita').length;
    const totalDespesasPeriodo = getLancamentosPeriodoAtual().filter((l) => getNormalizedEntryType(l) !== 'receita').length;
    const btnVerTodasReceitas = document.getElementById('btn-ver-todas-receitas');
    const btnVerTodasDespesas = document.getElementById('btn-ver-todas-despesas');
    if (btnVerTodasReceitas) btnVerTodasReceitas.textContent = `Ver tudo (${totalReceitasPeriodo})`;
    if (btnVerTodasDespesas) btnVerTodasDespesas.textContent = `Ver tudo (${totalDespesasPeriodo})`;

    receitasPreview.forEach((l) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${l.data || ''}</td>
        <td>${formatDescricaoCell(formatReceitaDescricaoDisplay(l), resolveLancamentoColaborador(l) ? `Responsavel: ${resolveLancamentoColaborador(l)}` : '')}</td>
        <td>${formatCategoria(l.categoria)}</td>
        <td>${formatCurrency(l.valor)}</td>
        <td>${getFinanceStatus(l).replace(/^./, (m) => m.toUpperCase())}</td>
      `;
      tbodyRecPreview?.appendChild(tr);
    });

    const despesasPreview = getLancamentosPeriodoAtual()
      .filter((l) => getNormalizedEntryType(l) !== 'receita')
      .slice()
      .sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')))
      .slice(0, 5);
    despesasPreview.forEach((l) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${l.data || ''}</td>
        <td>${formatDescricaoCell(l.descricao || '', resolveLancamentoColaborador(l) ? `Responsavel: ${resolveLancamentoColaborador(l)}` : '')}</td>
        <td>${formatCategoria(l.categoria)}</td>
        <td>${formatCurrency(l.valor)}</td>
        <td>${getFinanceStatus(l).replace(/^./, (m) => m.toUpperCase())}</td>
      `;
      tbodyDespPreview?.appendChild(tr);
    });

    const emptyReceitas = document.getElementById('empty-receitas');
    const emptyDespesas = document.getElementById('empty-despesas');
    if (emptyReceitas) emptyReceitas.classList.toggle('hidden', receitasFiltradas.length > 0);
    if (emptyDespesas) emptyDespesas.classList.toggle('hidden', despesasFiltradas.length > 0);
    preencherTabelaLucratividade();
  }

  async function carregarLancamentos() {
    try {
      const isAdmin = await ensureAdmin();
      if (!isAdmin) return;
      await carregarDentistasGestao();
      const list = await financeApi.list?.();
      lancamentos = dedupeProcedureLancamentos((Array.isArray(list) ? list : []).map(normalizeLancamentoForGestao));
      preencherTabelas();
      atualizarRelatorioAtual();
      await carregarDashboard();
      await carregarProcedimentosLucratividade();
    } catch (err) {
      console.error('Erro ao carregar lancamentos financeiros:', err);
    }
  }

  function configurarBotoesPeriodo() {
    const botoes = document.querySelectorAll('.btn-periodo');
    botoes.forEach((btn) => {
      btn.addEventListener('click', () => {
        setPeriodoAtual(btn.dataset.period || 'mes');
      });
    });
  }

  function configurarFiltrosFinancas() {
    const receitasTextoEl = document.getElementById('filtro-receitas-texto');
    const receitasDentistaEl = document.getElementById('filtro-receitas-dentista');
    const receitasStatusEl = document.getElementById('filtro-receitas-status');
    const despesasTextoEl = document.getElementById('filtro-despesas-texto');
    const despesasDentistaEl = document.getElementById('filtro-despesas-dentista');
    const despesasStatusEl = document.getElementById('filtro-despesas-status');
    const lucratividadeTextoEl = document.getElementById('filtro-lucratividade-texto');

    receitasTextoEl?.addEventListener('input', () => {
      filtroReceitasTexto = receitasTextoEl.value || '';
      preencherTabelas();
    });

    receitasDentistaEl?.addEventListener('change', () => {
      filtroReceitasDentista = String(receitasDentistaEl.value || '').trim();
      preencherTabelas();
    });

    receitasStatusEl?.addEventListener('change', () => {
      filtroReceitasStatus = String(receitasStatusEl.value || '').toLowerCase();
      filtroReceitasSomenteAtrasadas = false;
      document.querySelectorAll('[data-quick-status][data-target="receitas"]').forEach((chip) => {
        chip.classList.toggle('active', String(chip.getAttribute('data-quick-status') || '') === filtroReceitasStatus);
      });
      preencherTabelas();
    });

    despesasTextoEl?.addEventListener('input', () => {
      filtroDespesasTexto = despesasTextoEl.value || '';
      preencherTabelas();
    });

    despesasDentistaEl?.addEventListener('change', () => {
      filtroDespesasDentista = String(despesasDentistaEl.value || '').trim();
      preencherTabelas();
    });

    despesasStatusEl?.addEventListener('change', () => {
      filtroDespesasStatus = String(despesasStatusEl.value || '').toLowerCase();
      document.querySelectorAll('[data-quick-status][data-target="despesas"]').forEach((chip) => {
        chip.classList.toggle('active', String(chip.getAttribute('data-quick-status') || '') === filtroDespesasStatus);
      });
      preencherTabelas();
    });

    lucratividadeTextoEl?.addEventListener('input', () => {
      filtroLucratividadeTexto = lucratividadeTextoEl.value || '';
      preencherTabelaLucratividade();
    });
  }

  function configurarChipsRapidos() {
    document.querySelectorAll('[data-quick-period]').forEach((chip) => {
      chip.addEventListener('click', () => {
        const period = chip.getAttribute('data-quick-period') || 'dia';
        setPeriodoAtual(period);
      });
    });

    document.querySelectorAll('[data-quick-status]').forEach((chip) => {
      chip.addEventListener('click', () => {
        const target = chip.getAttribute('data-target') || '';
        const status = String(chip.getAttribute('data-quick-status') || '').toLowerCase();
        if (target === 'receitas') {
          filtroReceitasStatus = status;
          filtroReceitasSomenteAtrasadas = false;
          const select = document.getElementById('filtro-receitas-status');
          if (select) select.value = status;
          document.querySelectorAll('[data-quick-status][data-target="receitas"]').forEach((item) => {
            item.classList.toggle('active', item === chip);
          });
        }
        if (target === 'despesas') {
          filtroDespesasStatus = status;
          const select = document.getElementById('filtro-despesas-status');
          if (select) select.value = status;
          document.querySelectorAll('[data-quick-status][data-target="despesas"]').forEach((item) => {
            item.classList.toggle('active', item === chip);
          });
        }
        preencherTabelas();
      });
    });
  }

  
  
  function alternarSecao(secao) {
    secaoAtual = secao || 'overview';
    const sections = {
      overview: document.getElementById('sec-overview'),
      receitas: document.getElementById('sec-receitas'),
      despesas: document.getElementById('sec-despesas'),
      lucratividade: document.getElementById('sec-lucratividade'),
      colaboradores: document.getElementById('sec-colaboradores'),
      relatorios: document.getElementById('relatorios-placeholder'),
      estoque: document.getElementById('sec-estoque'),
    };

    Object.keys(sections).forEach((key) => {
      const el = sections[key];
      if (!el) return;
      el.classList.toggle('hidden', key !== secaoAtual);
    });
  }

  function configurarMenuLateral() {
    const botoes = document.querySelectorAll('.nav-item-gestao');
    botoes.forEach((btn) => {
      const secao = btn.dataset.section;
      if (!secao || secao === 'laboratorio') return;
      btn.addEventListener('click', () => {
        botoes.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        alternarSecao(secao);
      });
    });

    const ativo = document.querySelector('.nav-item-gestao.active');
    if (ativo && ativo.dataset.section && ativo.dataset.section !== 'laboratorio') {
      alternarSecao(ativo.dataset.section);
    } else {
      alternarSecao('overview');
    }
  }

  function configurarNavegacaoAuxiliar() {
    const btnVerTodasReceitas = document.getElementById('btn-ver-todas-receitas');
    const btnVerTodasDespesas = document.getElementById('btn-ver-todas-despesas');
    const btnKpiPendentes = document.getElementById('btn-kpi-ver-pendentes');
    const btnKpiAtrasadas = document.getElementById('btn-kpi-ver-atrasadas');
    const btnVoltarOverviewEstoque = document.getElementById('btn-voltar-overview-estoque');
    const marcarSecaoAtiva = (secao) => {
      document.querySelectorAll('.nav-item-gestao').forEach((item) => {
        if (!item.dataset.section || item.dataset.section === 'laboratorio') return;
        item.classList.toggle('active', item.dataset.section === secao);
      });
      alternarSecao(secao);
    };
    const abrirReceitasComFiltro = (atrasadas) => {
      marcarSecaoAtiva('receitas');
      filtroReceitasStatus = 'pendente';
      filtroReceitasSomenteAtrasadas = Boolean(atrasadas);
      const select = document.getElementById('filtro-receitas-status');
      if (select) select.value = 'pendente';
      document.querySelectorAll('[data-quick-status][data-target="receitas"]').forEach((item) => {
        item.classList.toggle('active', String(item.getAttribute('data-quick-status') || '').toLowerCase() === 'pendente');
      });
      preencherTabelas();
    };

    btnVerTodasReceitas?.addEventListener('click', () => marcarSecaoAtiva('receitas'));
    btnVerTodasDespesas?.addEventListener('click', () => marcarSecaoAtiva('despesas'));
    btnKpiPendentes?.addEventListener('click', () => abrirReceitasComFiltro(false));
    btnKpiAtrasadas?.addEventListener('click', () => abrirReceitasComFiltro(true));
    btnVoltarOverviewEstoque?.addEventListener('click', () => marcarSecaoAtiva('overview'));
  }

  // --- Modal de lancamento ---
  async function abrirModal(tipo, categoriaOverride) {
    const bg = document.getElementById('modal-lancamento-bg');
    editingLancamentoId = null;
    returnToLancamentoDetailsId = '';
    const btnSalvar = document.getElementById('btn-salvar-lancamento');
    if (btnSalvar) btnSalvar.textContent = 'Salvar';
    const backBtn = document.getElementById('btn-voltar-detalhe-lancamento');
    if (backBtn) backBtn.classList.add('hidden');
    if (!bg) return;
    if (!dentistasGestaoCache.length) await carregarDentistasGestao();

    document.getElementById('titulo-modal-lancamento').textContent =
      tipo === 'receita' ? 'Nova receita' : 'Nova despesa';

    document.getElementById('input-tipo-lancamento').value = tipo === 'receita' ? 'receita' : 'despesa';
    const categoriaPadrao = tipo === 'receita' ? 'procedimentos' : 'outros';
    document.getElementById('input-categoria-lancamento').value = categoriaOverride || categoriaPadrao;

    const hoje = new Date().toISOString().split('T')[0];
    document.getElementById('input-data-lancamento').value = hoje;
    document.getElementById('input-descricao-lancamento').value = '';
    document.getElementById('input-valor-lancamento').value = '';
    document.getElementById('input-colaborador-lancamento').value = '';
    document.getElementById('input-status-lancamento').value = 'pago';

    const receitaExtra = document.querySelector('.receita-extra');
    if (tipo === 'receita') {
      await carregarPacientesReceita();
    }
    if (receitaExtra) {
      receitaExtra.classList.toggle('hidden', tipo !== 'receita');
    }

    const pacienteInput = document.getElementById('input-paciente-lancamento');
    const procedimentoInput = document.getElementById('input-procedimento-lancamento');
    const metodoInput = document.getElementById('input-metodo-pagamento-lancamento');
    const planoInput = document.getElementById('input-plano-finalizado-lancamento');

    if (pacienteInput) pacienteInput.value = '';
    if (procedimentoInput) procedimentoInput.value = '';
    if (metodoInput) metodoInput.value = 'pix';
    if (planoInput) planoInput.value = 'nao';
    bg.classList.remove('hidden');
  }

  function fecharModal() {
    const bg = document.getElementById('modal-lancamento-bg');
    if (!bg) return;
    bg.classList.add('hidden');
    editingLancamentoId = null;
    returnToLancamentoDetailsId = '';
    const btnSalvar = document.getElementById('btn-salvar-lancamento');
    if (btnSalvar) btnSalvar.textContent = 'Salvar';
    const backBtn = document.getElementById('btn-voltar-detalhe-lancamento');
    if (backBtn) backBtn.classList.add('hidden');
  }

  const getMenuButton = (menu) => menu?.parentElement?.querySelector('.btn-row-actions') || null;
  const setMenuButtonExpanded = (menu, expanded) => {
    const button = getMenuButton(menu);
    if (!button) return;
    button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  };
  const getRowMenuScrollContainer = (menu) => {
    if (!menu) return null;
    const explicitContainer = menu.closest('#tabela-receitas, #tabela-despesas, #tabela-estoque');
    if (explicitContainer) return explicitContainer;
    let parent = menu.parentElement;
    while (parent && parent !== document.body) {
      const style = window.getComputedStyle(parent);
      const overflow = `${style.overflowX} ${style.overflowY}`;
      if (/auto|scroll|hidden/.test(overflow)) return parent;
      parent = parent.parentElement;
    }
    return null;
  };
  const positionRowMenu = (menu) => {
    if (!menu) return;
    const button = getMenuButton(menu);
    if (!button) return;
    const gap = 6;
    const margin = 8;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const buttonRect = button.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    let top = buttonRect.top - menuRect.height - gap;
    if (top < margin) top = margin;
    let left = buttonRect.right - menuRect.width;
    if (left < margin) left = margin;
    if ((left + menuRect.width) > (viewportWidth - margin)) {
      left = Math.max(margin, viewportWidth - menuRect.width - margin);
    }
    menu.classList.add('open-up');
    menu.classList.add('floating-menu');
    menu.style.top = `${Math.round(top)}px`;
    menu.style.left = `${Math.round(left)}px`;
    menu.style.right = 'auto';
    menu.style.bottom = 'auto';
  };
  const closeRowMenus = () => {
    if (!activeRowMenu) return;
    if (activeRowMenu.isConnected) {
      activeRowMenu.classList.remove('open', 'open-up', 'floating-menu');
      activeRowMenu.style.top = '';
      activeRowMenu.style.left = '';
      activeRowMenu.style.right = '';
      activeRowMenu.style.bottom = '';
      setMenuButtonExpanded(activeRowMenu, false);
    }
    activeRowMenu = null;
  };
  const closePlanGroupModal = () => {
    const modal = document.getElementById('plan-group-modal-bg');
    if (!modal) return;
    modal.classList.add('hidden');
    delete modal.__planGroupData;
    modal.dataset.filter = 'all';
    modal.dataset.sort = 'due-asc';
    modal.dataset.query = '';
    const body = modal.querySelector('[data-plan-group-modal-body]');
    if (body) body.innerHTML = '';
  };
  const updatePlanGroupModalSummary = (modal, entries = [], shownCount = null) => {
    const summary = modal.querySelector('[data-plan-group-modal-summary]');
    if (!summary) return;
    const paid = entries.filter((item) => getFinanceStatus(item) === 'pago');
    const pending = entries.filter((item) => getFinanceStatus(item) === 'pendente');
    const overdue = pending.filter((item) => {
      const due = getDueDate(item);
      if (!due || Number.isNaN(due.getTime())) return false;
      const today = new Date();
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      return due < start;
    });
    const total = entries.reduce((acc, item) => acc + (Number(item?.valor) || 0), 0);
    const paidValue = paid.reduce((acc, item) => acc + (Number(item?.valor) || 0), 0);
    const pendingValue = pending.reduce((acc, item) => acc + (Number(item?.valor) || 0), 0);
    const shown = shownCount === null ? entries.length : Number(shownCount) || 0;
    summary.textContent = `Mostrando ${shown} de ${entries.length} parcelas | Total: ${formatCurrency(total)} | Pago: ${formatCurrency(paidValue)} | Pendente: ${formatCurrency(pendingValue)} | Atrasadas: ${overdue.length}`;
  };
  const renderPlanGroupModalRows = (modal, group, filter = 'all', sort = 'due-asc', query = '') => {
    const body = modal.querySelector('[data-plan-group-modal-body]');
    if (!body) return;
    const normalizedQuery = String(query || '').trim().toLowerCase();
    const allEntries = (group?.entries || []).slice().sort((a, b) => {
      const parcelaA = parsePlanParcelaInfo(a?.descricao || '').current || 9999;
      const parcelaB = parsePlanParcelaInfo(b?.descricao || '').current || 9999;
      return parcelaA - parcelaB;
    });
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    let entries = allEntries.filter((item) => {
      const status = getFinanceStatus(item);
      if (filter === 'paid') return status === 'pago';
      if (filter === 'pending') return status === 'pendente';
      if (filter === 'overdue') {
        if (status !== 'pendente') return false;
        const due = getDueDate(item);
        return due && !Number.isNaN(due.getTime()) && due < todayStart;
      }
      return true;
    });
    if (normalizedQuery) {
      entries = entries.filter((item) => {
        const info = parsePlanParcelaInfo(item?.descricao || '');
        const current = String(info.current || '');
        const full = info.current && info.total ? `${info.current}/${info.total}` : '';
        return current.includes(normalizedQuery) || full.includes(normalizedQuery);
      });
    }
    entries = entries.slice().sort((a, b) => {
      const dueA = getDueDate(a)?.getTime() || 0;
      const dueB = getDueDate(b)?.getTime() || 0;
      if (sort === 'due-desc') return dueB - dueA;
      return dueA - dueB;
    });
    updatePlanGroupModalSummary(modal, allEntries, entries.length);
    body.innerHTML = '';
    const header = document.createElement('div');
    header.style.display = 'grid';
    header.style.gridTemplateColumns = '0.8fr 1fr 1fr 0.9fr 0.8fr 1fr';
    header.style.gap = '8px';
    header.style.padding = '10px 12px';
    header.style.background = '#f8fafc';
    header.style.fontWeight = '700';
    header.innerHTML = '<span>Parcela</span><span>Vencimento</span><span>Valor</span><span>Status</span><span>Metodo</span><span>Acoes</span>';
    body.appendChild(header);
    if (!entries.length) {
      const empty = document.createElement('div');
      empty.style.padding = '12px';
      empty.style.color = '#64748b';
      empty.textContent = 'Nenhuma parcela para o filtro selecionado.';
      body.appendChild(empty);
      return;
    }
    entries.forEach((item) => {
      const status = getFinanceStatus(item);
      const parcelaInfo = parsePlanParcelaInfo(item?.descricao || '');
      const row = document.createElement('div');
      row.style.display = 'grid';
      row.style.gridTemplateColumns = '0.8fr 1fr 1fr 0.9fr 0.8fr 1fr';
      row.style.gap = '8px';
      row.style.padding = '10px 12px';
      row.style.borderTop = '1px solid #eef2f7';
      row.innerHTML = `
        <span>${parcelaInfo.current || '-'}/${parcelaInfo.total || group.totals?.totalParcels || '-'}</span>
        <span>${formatDateBR(item.dueDate || item.vencimento || item.data || '')}</span>
        <span>${formatCurrency(item.valor)}</span>
        <span>${String(status || '-').replace(/^./, (m) => m.toUpperCase())}</span>
        <span>${formatMetodoPagamento(item.metodoPagamento || item.paymentMethod || 'outro')}</span>
        <span>
          ${status === 'pendente' && isFinanceAdmin
            ? `<button type="button" class="btn-secundario" style="padding:6px 10px;" data-action="confirm-plan-parcel" data-id="${item.id || ''}" data-installment-id="${item.installmentId || ''}" data-plan-key="${group.key}">Confirmar</button>`
            : '-'
          }
        </span>
      `;
      body.appendChild(row);
    });
  };
  const ensurePlanGroupModal = () => {
    let modal = document.getElementById('plan-group-modal-bg');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'plan-group-modal-bg';
    modal.className = 'modal-bg hidden';
    modal.innerHTML = `
      <div class="modal-lancamento" style="width:min(860px, calc(100vw - 32px)); max-height:80vh; overflow:auto;">
        <h2 style="margin-bottom:6px;">Parcelas do plano</h2>
        <p id="plan-group-modal-subtitle" style="margin:0 0 12px; color:#64748b; font-size:13px;"></p>
        <div style="display:flex; flex-wrap:wrap; gap:8px; margin:0 0 10px;">
          <button type="button" class="btn-secundario" data-action="filter-plan-parcels" data-filter="all">Todas</button>
          <button type="button" class="btn-secundario" data-action="filter-plan-parcels" data-filter="pending">Pendentes</button>
          <button type="button" class="btn-secundario" data-action="filter-plan-parcels" data-filter="paid">Pagas</button>
          <button type="button" class="btn-secundario" data-action="filter-plan-parcels" data-filter="overdue">Atrasadas</button>
        </div>
        <div style="display:grid; grid-template-columns: 220px minmax(180px, 1fr); gap:8px; margin:0 0 10px;">
          <select data-action="sort-plan-parcels" style="padding:8px 10px; border:1px solid #cbd5e1; border-radius:10px;">
            <option value="due-asc">Vencimento (mais proximo)</option>
            <option value="due-desc">Vencimento (mais distante)</option>
          </select>
          <input type="search" data-action="search-plan-parcels" placeholder="Buscar parcela (ex: 1/24 ou 12)" style="padding:8px 10px; border:1px solid #cbd5e1; border-radius:10px;">
        </div>
        <p data-plan-group-modal-summary style="margin:0 0 10px; color:#0f172a; font-size:13px; font-weight:600;"></p>
        <div data-plan-group-modal-body style="border:1px solid #e2e8f0; border-radius:10px; overflow:hidden;"></div>
        <div class="modal-actions">
          <button type="button" class="btn-secundario" data-action="close-plan-group-modal">Fechar</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', async (event) => {
      const closeBtn = event.target.closest('[data-action="close-plan-group-modal"]');
      if (closeBtn || event.target === modal) {
        closePlanGroupModal();
        return;
      }
      const filterBtn = event.target.closest('[data-action="filter-plan-parcels"]');
      if (filterBtn) {
        const nextFilter = String(filterBtn.dataset.filter || 'all');
        modal.dataset.filter = nextFilter;
        modal.querySelectorAll('[data-action="filter-plan-parcels"]').forEach((btn) => {
          btn.classList.toggle('btn-primario', btn === filterBtn);
          btn.classList.toggle('btn-secundario', btn !== filterBtn);
        });
        const group = modal.__planGroupData;
        if (group) renderPlanGroupModalRows(modal, group, nextFilter, modal.dataset.sort || 'due-asc', modal.dataset.query || '');
        return;
      }
      const sortField = event.target.closest('[data-action="sort-plan-parcels"]');
      if (sortField) {
        modal.dataset.sort = String(sortField.value || 'due-asc');
        const group = modal.__planGroupData;
        if (group) renderPlanGroupModalRows(modal, group, modal.dataset.filter || 'all', modal.dataset.sort || 'due-asc', modal.dataset.query || '');
        return;
      }
      const confirmBtn = event.target.closest('[data-action="confirm-plan-parcel"]');
      if (!confirmBtn) return;
      const financeId = String(confirmBtn.dataset.id || '');
      if (!financeId) return;
      const original = confirmBtn.textContent;
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Confirmando...';
      try {
        if (financeApi.confirmPayment) {
          await financeApi.confirmPayment({
            financeEntryId: financeId,
            installmentId: String(confirmBtn.dataset.installmentId || ''),
          });
        } else {
          await financeApi.update?.({ id: financeId, status: 'pago' });
        }
        emitFinanceUpdated('gestao-plan-group-confirm');
        await refreshFinanceViews();
        const key = String(confirmBtn.dataset.planKey || '');
        if (key) {
          const refreshed = planGroupedReceitasIndex.get(key);
          if (refreshed) {
            modal.__planGroupData = refreshed;
            renderPlanGroupModalRows(modal, refreshed, modal.dataset.filter || 'all', modal.dataset.sort || 'due-asc', modal.dataset.query || '');
          }
        }
      } catch (err) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = original || 'Confirmar';
        alert('Nao foi possivel confirmar a parcela.');
      }
    });
    modal.addEventListener('input', (event) => {
      const searchField = event.target.closest('[data-action="search-plan-parcels"]');
      if (!searchField) return;
      modal.dataset.query = String(searchField.value || '').trim().toLowerCase();
      const group = modal.__planGroupData;
      if (group) renderPlanGroupModalRows(modal, group, modal.dataset.filter || 'all', modal.dataset.sort || 'due-asc', modal.dataset.query || '');
    });
    return modal;
  };
  const openPlanGroupModal = (group) => {
    if (!group || !Array.isArray(group.entries) || !group.entries.length) return;
    const modal = ensurePlanGroupModal();
    const subtitle = modal.querySelector('#plan-group-modal-subtitle');
    modal.__planGroupData = group;
    if (subtitle) {
      const parcels = `${group.totals?.paidParcels || 0}/${group.totals?.totalParcels || group.entries.length}`;
      subtitle.textContent = `${group.title}${group.patientName ? ` - ${group.patientName}` : ''} | Parcelas pagas: ${parcels}`;
    }
    if (!modal.dataset.filter) modal.dataset.filter = 'all';
    if (!modal.dataset.sort) modal.dataset.sort = 'due-asc';
    if (typeof modal.dataset.query !== 'string') modal.dataset.query = '';
    const sortField = modal.querySelector('[data-action="sort-plan-parcels"]');
    if (sortField) sortField.value = modal.dataset.sort;
    const searchField = modal.querySelector('[data-action="search-plan-parcels"]');
    if (searchField) searchField.value = modal.dataset.query || '';
    const selectedFilter = modal.dataset.filter || 'all';
    modal.querySelectorAll('[data-action="filter-plan-parcels"]').forEach((btn) => {
      const active = String(btn.dataset.filter || '') === selectedFilter;
      btn.classList.toggle('btn-primario', active);
      btn.classList.toggle('btn-secundario', !active);
    });
    renderPlanGroupModalRows(modal, group, selectedFilter, modal.dataset.sort || 'due-asc', modal.dataset.query || '');
    modal.classList.remove('hidden');
  };

  const setPeriodoAtual = (periodo) => {
    periodoAtual = periodo || 'mes';
    document.querySelectorAll('.btn-periodo').forEach((b) => {
      b.classList.toggle('active', b.dataset.period === periodoAtual);
    });
    document.querySelectorAll('[data-quick-period]').forEach((chip) => {
      chip.classList.toggle('active', chip.getAttribute('data-quick-period') === periodoAtual);
    });
    carregarDashboard();
    preencherTabelas();
    atualizarRelatorioAtual();
  };

  const getLancamentosPeriodoAtual = () => filtrarLancamentosPorPeriodo(lancamentos, periodoAtual);

  const matchTextoLancamento = (item, texto) => {
    const q = String(texto || '').toLowerCase().trim();
    if (!q) return true;
    const content = [
      item.descricao,
      item.categoria,
      item.status,
      item.paciente,
      item.procedimento,
      item.funcionario,
      item.metodoPagamento,
      item.data,
    ].map((v) => String(v || '').toLowerCase()).join(' ');
    return content.includes(q);
  };

  const matchDentistaLancamento = (item, filtro) => {
    const rawFilter = String(filtro || '').trim().toLowerCase();
    if (!rawFilter) return true;
    const dentistaId = String(item?.dentistaId || '').trim().toLowerCase();
    if (dentistaId && dentistaId === rawFilter) return true;
    const collaborator = String(resolveLancamentoColaborador(item) || '').trim().toLowerCase();
    return collaborator === rawFilter;
  };

  const getReceitasFiltradas = () => {
    const hoje = new Date();
    const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    return getLancamentosPeriodoAtual()
      .filter((l) => getNormalizedEntryType(l) === 'receita')
      .filter((l) => matchTextoLancamento(l, filtroReceitasTexto))
      .filter((l) => matchDentistaLancamento(l, filtroReceitasDentista))
      .filter((l) => !filtroReceitasStatus || getFinanceStatus(l) === filtroReceitasStatus)
      .filter((l) => {
        if (!filtroReceitasSomenteAtrasadas) return true;
        const due = getDueDate(l);
        return due && !Number.isNaN(due.getTime()) && due < inicioHoje;
      });
  };

  const getDespesasFiltradas = () => {
    return getLancamentosPeriodoAtual()
      .filter((l) => getNormalizedEntryType(l) !== 'receita')
      .filter((l) => matchTextoLancamento(l, filtroDespesasTexto))
      .filter((l) => matchDentistaLancamento(l, filtroDespesasDentista))
      .filter((l) => !filtroDespesasStatus || getFinanceStatus(l) === filtroDespesasStatus);
  };

  const normalizeProcedimentoLucratividade = (svc) => {
    const valorCobrado = Number(svc?.valorCobrado ?? svc?.valor ?? svc?.value ?? 0) || 0;
    const custoExists = svc?.custoTotal !== undefined && svc?.custoTotal !== null && svc?.custoTotal !== '';
    const custoTotal = custoExists ? (Number(svc?.custoTotal) || 0) : null;
    const lucroStored = svc?.lucro !== undefined && svc?.lucro !== null ? Number(svc.lucro) : null;
    const lucro = lucroStored !== null && Number.isFinite(lucroStored)
      ? lucroStored
      : (custoTotal !== null ? (valorCobrado - custoTotal) : null);
    const lucroHoraStored = svc?.lucroPorHora !== undefined && svc?.lucroPorHora !== null
      ? Number(svc.lucroPorHora)
      : null;
    const tempoMinutos = Number(svc?.tempoMinutos || 0) || 0;
    const lucroPorHora = lucroHoraStored !== null && Number.isFinite(lucroHoraStored)
      ? lucroHoraStored
      : (lucro !== null && tempoMinutos > 0 ? (lucro / (tempoMinutos / 60)) : null);
    const dataRef = svc?.dataRealizacao || svc?.finishedAt || svc?.updatedAt || svc?.createdAt || '';
    return {
      id: String(svc?.id || svc?._id || ''),
      dataRef,
      dataObj: parseAnyDate(dataRef),
      procedimento: svc?.tipo || svc?.nome || svc?.procedimento || 'Procedimento',
      paciente: svc?.patientName || svc?.pacienteNome || svc?.nomePaciente || svc?.paciente || '-',
      valorCobrado,
      custoTotal,
      lucro,
      lucroPorHora,
      status: String(svc?.statusFinanceiroProcedimento || 'rascunho').toLowerCase(),
    };
  };

  const getLucratividadeFiltrada = () => {
    const q = String(filtroLucratividadeTexto || '').toLowerCase().trim();
    return procedimentosLucratividade
      .filter((item) => item.dataObj && getDateInPeriod(item.dataObj, periodoAtual))
      .filter((item) => {
        if (!q) return true;
        return `${item.procedimento} ${item.paciente}`.toLowerCase().includes(q);
      })
      .sort((a, b) => (b.dataObj?.getTime() || 0) - (a.dataObj?.getTime() || 0));
  };

  const formatMoneyOrDash = (value) => (
    value === null || value === undefined || Number.isNaN(Number(value))
      ? 'â€”'
      : formatCurrency(Number(value))
  );

  const preencherTabelaLucratividade = () => {
    const tbody = document.querySelector('#tabela-lucratividade tbody');
    const empty = document.getElementById('empty-lucratividade');
    if (!tbody) return;

    const lista = getLucratividadeFiltrada();
    tbody.innerHTML = '';

    const lucroPeriodo = lista.reduce((acc, item) => acc + (Number(item.lucro) || 0), 0);
    const custoPeriodo = lista.reduce((acc, item) => acc + (Number(item.custoTotal) || 0), 0);
    const mediaLucro = lista.length ? (lucroPeriodo / lista.length) : 0;

    const lucroEl = document.getElementById('lucratividade-lucro-periodo');
    const custoEl = document.getElementById('lucratividade-custo-periodo');
    const mediaEl = document.getElementById('lucratividade-lucro-medio');
    const totalEl = document.getElementById('lucratividade-total-procedimentos');
    if (lucroEl) lucroEl.textContent = formatCurrency(lucroPeriodo);
    if (custoEl) custoEl.textContent = formatCurrency(custoPeriodo);
    if (mediaEl) mediaEl.textContent = formatCurrency(mediaLucro);
    if (totalEl) totalEl.textContent = String(lista.length);

    if (empty) empty.classList.toggle('hidden', lista.length > 0);
    if (!lista.length) return;

    lista.forEach((item) => {
      const tr = document.createElement('tr');
      const statusLabel = item.status === 'finalizado' ? 'Finalizado' : 'Rascunho';
      tr.innerHTML = `
        <td>${formatDateBR(item.dataRef)}</td>
        <td>${item.procedimento}</td>
        <td>${item.paciente || '-'}</td>
        <td>${formatCurrency(item.valorCobrado)}</td>
        <td>${formatMoneyOrDash(item.custoTotal)}</td>
        <td>${formatMoneyOrDash(item.lucro)}</td>
        <td>${formatMoneyOrDash(item.lucroPorHora)}</td>
        <td>${statusLabel}</td>
      `;
      tbody.appendChild(tr);
    });
  };

  const carregarProcedimentosLucratividade = async () => {
    try {
      if (!servicesApi.listAll) {
        procedimentosLucratividade = [];
        procedimentosById = new Map();
        preencherTabelaLucratividade();
        return;
      }
      const list = await servicesApi.listAll();
      procedimentosById = new Map((Array.isArray(list) ? list : []).map((item) => [String(item?.id || '').trim(), item]).filter((item) => item[0]));
      procedimentosLucratividade = (Array.isArray(list) ? list : []).map(normalizeProcedimentoLucratividade);
      preencherTabelaLucratividade();
    } catch (err) {
      console.warn('Falha ao carregar lucratividade por procedimento.', err);
      procedimentosLucratividade = [];
      procedimentosById = new Map();
      preencherTabelaLucratividade();
    }
  };

  const toggleRowMenu = (id) => {
    if (!id) return;
    const menu = document.querySelector(`.row-actions-menu[data-menu-id="${id}"]`);
    if (!menu) return;
    const isOpen = activeRowMenu === menu && menu.classList.contains('open');
    closeRowMenus();
    if (isOpen) return;
    menu.classList.add('open');
    positionRowMenu(menu);
    setMenuButtonExpanded(menu, true);
    activeRowMenu = menu;
  };

  const findLinkedProcedureForLancamento = (lancamento) => {
    const procedureId = String(lancamento?.procedureId || lancamento?.servicoId || '').trim();
    if (!procedureId) return null;
    return procedimentosById.get(procedureId) || null;
  };

  const resolveLancamentoColaborador = (lancamento) => {
    const explicit = String(lancamento?.funcionario || lancamento?.dentistaNome || '').trim();
    if (explicit) return explicit;
    const linkedProcedure = findLinkedProcedureForLancamento(lancamento);
    return String(
      linkedProcedure?.dentistaNome
      || linkedProcedure?.dentista
      || linkedProcedure?.dentistaName
      || linkedProcedure?.responsavelNome
      || ''
    ).trim();
  };

  const ensureLancamentoDetailsModal = () => {
    let bg = document.getElementById('modal-lancamento-detalhes-bg');
    if (bg) return bg;
    bg = document.createElement('div');
    bg.id = 'modal-lancamento-detalhes-bg';
    bg.className = 'modal-bg hidden';
    bg.innerHTML = `
      <div class="modal-lancamento finance-details-modal">
        <div class="finance-details-header">
          <div class="finance-details-kicker">Financeiro do paciente</div>
          <h2 id="titulo-modal-lancamento-detalhes">Detalhes do recebimento</h2>
          <p class="finance-details-subtitle">Consulte o recebimento, abra o prontuario ou entre no modo de edicao.</p>
        </div>
        <div class="finance-details-content">
          <div class="finance-details-grid">
            <div class="finance-details-card">
            <label>Paciente</label>
            <input id="detalhe-lancamento-paciente" type="text" readonly />
            </div>
            <div class="finance-details-card">
            <label>Procedimento</label>
            <input id="detalhe-lancamento-procedimento" type="text" readonly />
            </div>
            <div class="finance-details-card">
            <label>Data</label>
            <input id="detalhe-lancamento-data" type="text" readonly />
            </div>
            <div class="finance-details-card">
            <label>Status</label>
            <input id="detalhe-lancamento-status" type="text" readonly />
            </div>
            <div class="finance-details-card">
            <label>Valor</label>
            <input id="detalhe-lancamento-valor" type="text" readonly />
            </div>
            <div class="finance-details-card">
            <label>Metodo de pagamento</label>
            <input id="detalhe-lancamento-metodo" type="text" readonly />
            </div>
            <div class="finance-details-card full">
              <label>Colaborador responsavel</label>
              <input id="detalhe-lancamento-colaborador" type="text" readonly />
            </div>
            <div class="finance-details-card full">
              <label>Descricao</label>
              <textarea id="detalhe-lancamento-descricao" rows="4" readonly></textarea>
            </div>
          </div>
        </div>
        <div class="finance-details-actions">
          <button id="btn-detalhe-lancamento-editar" class="btn-primario" type="button">Editar</button>
          <button id="btn-detalhe-lancamento-prontuario" class="btn-secundario" type="button">Abrir no prontuario</button>
          <button id="btn-detalhe-lancamento-fechar" class="btn-secundario" type="button">Fechar</button>
        </div>
      </div>
    `;
    document.body.appendChild(bg);
    bg.addEventListener('click', (event) => {
      if (event.target === bg) bg.classList.add('hidden');
    });
    bg.querySelector('#btn-detalhe-lancamento-fechar')?.addEventListener('click', () => {
      bg.classList.add('hidden');
    });
    bg.querySelector('#btn-detalhe-lancamento-editar')?.addEventListener('click', async () => {
      const lancamentoId = String(bg.dataset.lancamentoId || '').trim();
      const lancamento = lancamentos.find((item) => String(item?.id || '') === lancamentoId);
      if (!lancamento) return;
      returnToLancamentoDetailsId = lancamentoId;
      bg.classList.add('hidden');
      await abrirModalEdicao(lancamento);
    });
    bg.querySelector('#btn-detalhe-lancamento-prontuario')?.addEventListener('click', () => {
      const lancamentoId = String(bg.dataset.lancamentoId || '').trim();
      const lancamento = lancamentos.find((item) => String(item?.id || '') === lancamentoId);
      if (!lancamento) return;
      try {
        const patientStub = {
          prontuario: String(lancamento.prontuario || '').trim(),
          id: String(lancamento.patientId || '').trim(),
          nome: String(lancamento.paciente || '').trim(),
          fullName: String(lancamento.paciente || '').trim(),
        };
        if (!patientStub.prontuario) {
          alert('Este lancamento nao possui prontuario vinculado.');
          return;
        }
        localStorage.setItem('prontuarioPatient', JSON.stringify(patientStub));
        localStorage.setItem('prontuario-open-tab', 'financeiro');
        localStorage.setItem('prontuario-focus-finance-entry', String(lancamento.id || ''));
        window.location.href = 'prontuario.html';
      } catch (err) {
        console.error('Erro ao abrir prontuario a partir do detalhe financeiro:', err);
        alert('Nao foi possivel abrir o prontuario do paciente.');
      }
    });
    return bg;
  };

  const openLancamentoDetailsModal = (lancamento) => {
    if (!lancamento) return;
    const bg = ensureLancamentoDetailsModal();
    const isReceita = getNormalizedEntryType(lancamento) === 'receita';
    const colaborador = resolveLancamentoColaborador(lancamento);
    bg.dataset.lancamentoId = String(lancamento?.id || '');
    const titleEl = bg.querySelector('#titulo-modal-lancamento-detalhes');
    const editBtn = bg.querySelector('#btn-detalhe-lancamento-editar');
    const prontuarioBtn = bg.querySelector('#btn-detalhe-lancamento-prontuario');
    if (titleEl) titleEl.textContent = isReceita ? 'Detalhes do recebimento' : 'Detalhes da despesa';
    if (editBtn) editBtn.textContent = isReceita ? 'Editar recebimento' : 'Editar despesa';
    if (prontuarioBtn) prontuarioBtn.classList.toggle('hidden', !canOpenPatientFinanceFromEntry(lancamento));
    const setValue = (selector, value) => {
      const field = bg.querySelector(selector);
      if (field) field.value = value;
    };
    setValue('#detalhe-lancamento-paciente', String(lancamento?.paciente || '-').trim() || '-');
    setValue('#detalhe-lancamento-procedimento', String(lancamento?.procedimento || '-').trim() || '-');
    setValue('#detalhe-lancamento-data', String(lancamento?.data || '').trim() || '-');
    setValue('#detalhe-lancamento-status', getFinanceStatus(lancamento).replace(/^./, (m) => m.toUpperCase()));
    setValue('#detalhe-lancamento-valor', formatCurrency(lancamento?.valor || 0));
    setValue('#detalhe-lancamento-metodo', formatMetodoPagamento(lancamento?.metodoPagamento || lancamento?.paymentMethod || ''));
    setValue('#detalhe-lancamento-colaborador', colaborador || '-');
    setValue('#detalhe-lancamento-descricao', String(lancamento?.descricao || '').trim() || '-');
    bg.classList.remove('hidden');
  };

  const abrirModalEdicao = async (lancamento) => {
    if (!lancamento) return;
    const bg = document.getElementById('modal-lancamento-bg');
    if (!bg) return;

    const tipo = lancamento.tipo || 'receita';
    document.getElementById('titulo-modal-lancamento').textContent =
      tipo === 'receita' ? 'Editar receita' : 'Editar despesa';

    document.getElementById('input-tipo-lancamento').value = tipo;
    document.getElementById('input-categoria-lancamento').value = lancamento.categoria || 'outros';
    document.getElementById('input-data-lancamento').value = lancamento.data || '';
    document.getElementById('input-descricao-lancamento').value = lancamento.descricao || '';
    document.getElementById('input-valor-lancamento').value = Number(lancamento.valor || 0).toFixed(2);
    document.getElementById('input-colaborador-lancamento').value = resolveLancamentoColaborador(lancamento);
    document.getElementById('input-status-lancamento').value = lancamento.status || 'pago';

    const receitaExtra = document.querySelector('.receita-extra');
    if (tipo === 'receita') {
      await carregarPacientesReceita();
    }
    if (receitaExtra) {
      receitaExtra.classList.toggle('hidden', tipo !== 'receita');
    }

    const pacienteInput = document.getElementById('input-paciente-lancamento');
    const procedimentoInput = document.getElementById('input-procedimento-lancamento');
    const metodoInput = document.getElementById('input-metodo-pagamento-lancamento');
    const planoInput = document.getElementById('input-plano-finalizado-lancamento');

    if (pacienteInput) pacienteInput.value = lancamento.paciente || '';
    if (procedimentoInput) procedimentoInput.value = lancamento.procedimento || '';
    if (metodoInput) metodoInput.value = lancamento.metodoPagamento || 'pix';
    if (planoInput) planoInput.value = lancamento.planoFinalizado ? 'sim' : 'nao';

    editingLancamentoId = lancamento.id || null;
    const btnSalvar = document.getElementById('btn-salvar-lancamento');
    if (btnSalvar) btnSalvar.textContent = 'Atualizar';
    const backBtn = document.getElementById('btn-voltar-detalhe-lancamento');
    if (backBtn) {
      const shouldShowBack = String(returnToLancamentoDetailsId || '').trim() === String(lancamento.id || '').trim();
      backBtn.classList.toggle('hidden', !shouldShowBack);
    }

    bg.classList.remove('hidden');
  };

  function configurarModal() {
    const bg = document.getElementById('modal-lancamento-bg');
    const btnSalvar = document.getElementById('btn-salvar-lancamento');
    const btnCancelar = document.getElementById('btn-cancelar-lancamento');
    const btnVoltarDetalhe = document.getElementById('btn-voltar-detalhe-lancamento');
    const btnNovaReceita = document.getElementById('btn-nova-receita');
    const btnNovaDespesa = document.getElementById('btn-nova-despesa');
    const btnNovaReceitaEmpty = document.getElementById('btn-empty-nova-receita');
    const btnNovaDespesaEmpty = document.getElementById('btn-empty-nova-despesa');
    const btnNovoPagamentoColaborador = document.getElementById('btn-novo-pagamento-colaborador');
    const tipoSelect = document.getElementById('input-tipo-lancamento');
    const receitaExtra = document.querySelector('.receita-extra');
    const pacienteInput = document.getElementById('input-paciente-lancamento');
    const procedimentoInput = document.getElementById('input-procedimento-lancamento');
    const metodoInput = document.getElementById('input-metodo-pagamento-lancamento');
    const planoInput = document.getElementById('input-plano-finalizado-lancamento');

    const toggleReceitaCampos = (tipo) => {
      if (receitaExtra) {
        receitaExtra.classList.toggle('hidden', tipo !== 'receita');
      }
      if (tipo !== 'receita') {
        if (pacienteInput) pacienteInput.value = '';
        if (procedimentoInput) procedimentoInput.value = '';
        if (metodoInput) metodoInput.value = 'pix';
        if (planoInput) planoInput.value = 'nao';
      }
    };


    if (btnNovaReceita) {
      btnNovaReceita.addEventListener('click', async () => {
        const isAdmin = await ensureAdmin();
        if (!isAdmin) {
          alert('Acesso restrito a administradores.');
          return;
        }
        await abrirModal('receita');
      });
    }
    if (btnNovaReceitaEmpty) {
      btnNovaReceitaEmpty.addEventListener('click', async () => {
        const isAdmin = await ensureAdmin();
        if (!isAdmin) {
          alert('Acesso restrito a administradores.');
          return;
        }
        await abrirModal('receita');
      });
    }
    if (btnNovaDespesa) {
      btnNovaDespesa.addEventListener('click', async () => {
        const isAdmin = await ensureAdmin();
        if (!isAdmin) {
          alert('Acesso restrito a administradores.');
          return;
        }
        await abrirModal('despesa');
      });
    }
    if (btnNovaDespesaEmpty) {
      btnNovaDespesaEmpty.addEventListener('click', async () => {
        const isAdmin = await ensureAdmin();
        if (!isAdmin) {
          alert('Acesso restrito a administradores.');
          return;
        }
        await abrirModal('despesa');
      });
    }

    if (btnNovoPagamentoColaborador) {
      btnNovoPagamentoColaborador.addEventListener('click', async () => {
        const isAdmin = await ensureAdmin();
        if (!isAdmin) {
          alert('Acesso restrito a administradores.');
          return;
        }
        await abrirModal('despesa', 'funcionarios');
      });
    }

    if (tipoSelect) {
      tipoSelect.addEventListener('change', () => {
        toggleReceitaCampos(tipoSelect.value);
      });
      toggleReceitaCampos(tipoSelect.value);
    }

    if (btnCancelar) {
      btnCancelar.addEventListener('click', fecharModal);
    }

    if (btnVoltarDetalhe) {
      btnVoltarDetalhe.addEventListener('click', () => {
        const lancamentoId = String(returnToLancamentoDetailsId || '').trim();
        const lancamento = lancamentos.find((item) => String(item?.id || '') === lancamentoId);
        if (!lancamento) {
          fecharModal();
          return;
        }
        if (bg) bg.classList.add('hidden');
        editingLancamentoId = null;
        const btnSalvarAtual = document.getElementById('btn-salvar-lancamento');
        if (btnSalvarAtual) btnSalvarAtual.textContent = 'Salvar';
        openLancamentoDetailsModal(lancamento);
      });
    }

    if (bg) {
      bg.addEventListener('click', (e) => {
        if (e.target === bg) fecharModal();
      });
    }


    const descricaoInputEl = document.getElementById('input-descricao-lancamento');
    if (descricaoInputEl) {
      descricaoInputEl.addEventListener('input', () => {
        const tipoAtual = document.getElementById('input-tipo-lancamento')?.value;
        if (tipoAtual !== 'receita') return;
        const texto = descricaoInputEl.value || '';
        if (!texto.includes(' - ')) return;

        const partes = texto.split(' - ').map((p) => p.trim()).filter(Boolean);
        if (!partes.length) return;

        const procedimentoEl = document.getElementById('input-procedimento-lancamento');
        const pacienteEl = document.getElementById('input-paciente-lancamento');
        const procedimentoTexto = partes[0] || '';
        const pacienteTexto = partes.slice(1).join(' - ');

        if (procedimentoEl && !procedimentoEl.value && procedimentoTexto) {
          procedimentoEl.value = procedimentoTexto;
        }

        if (pacienteEl && !pacienteEl.value && pacienteTexto) {
          pacienteEl.value = resolverPaciente(pacienteTexto);
        }
      });
    }
    if (btnSalvar) {
      btnSalvar.addEventListener('click', async () => {
        try {
          const isAdmin = await ensureAdmin();
          if (!isAdmin) {
            alert('Acesso restrito a administradores.');
            return;
          }

          const tipo = document.getElementById('input-tipo-lancamento').value;
          const categoria = document.getElementById('input-categoria-lancamento').value;
          const data = document.getElementById('input-data-lancamento').value;
          const descricaoInput = document.getElementById('input-descricao-lancamento').value.trim();
          let descricao = descricaoInput;
          const valorInput = document.getElementById('input-valor-lancamento').value;
          const valor = Number(valorInput);
          const colaborador = document.getElementById('input-colaborador-lancamento').value;
          const dentistaSelecionado = resolveDentistaGestao(colaborador);

          const status = document.getElementById('input-status-lancamento').value;
          const pacienteRaw = document.getElementById('input-paciente-lancamento')?.value.trim() || '';
          const paciente = resolverPaciente(pacienteRaw);
          const procedimento = document.getElementById('input-procedimento-lancamento')?.value.trim() || '';
          const metodoPagamento = document.getElementById('input-metodo-pagamento-lancamento')?.value || '';
          const planoFinalizado = document.getElementById('input-plano-finalizado-lancamento')?.value === 'sim';

          if (tipo === 'receita') {
            if (!paciente) {
              alert('Informe o paciente.');
              return;
            }
            if (!procedimento) {
              alert('Informe o procedimento.');
              return;
            }
            if (!metodoPagamento) {
              alert('Informe o metodo de pagamento.');
              return;
            }
          }

          if (tipo === 'receita' && !descricao) {
            descricao = [procedimento, paciente].filter(Boolean).join(' - ');
          }

          if (!data || !descricao) {
            alert('Preencha data, descricao e valor.');
            return;
          }

          if (!Number.isFinite(valor) || valor <= 0) {
            alert('Informe um valor valido.');
            return;
          }

          const payload = {
            tipo,
            categoria,
            data,
            descricao,
            valor,
            funcionario: colaborador,
            dentistaId: dentistaSelecionado?.id || '',
            dentistaNome: dentistaSelecionado?.nome || dentistaSelecionado?.fullName || dentistaSelecionado?.login || colaborador,
            status,
            paciente,
            procedimento,
            metodoPagamento,
            planoFinalizado,
          };

          if (editingLancamentoId) {
            await financeApi.update?.({ id: editingLancamentoId, ...payload });
          } else {
            await financeApi.add?.(payload);
          }

          fecharModal();
          await carregarLancamentos();
          await carregarDashboard();
        } catch (err) {
          console.error('Erro ao salvar lancamento financeiro:', err);
          alert('Erro ao salvar lancamento.');
        }
      });
    }
  }

  
  const configurarAcoesTabela = () => {
    const tabelas = [document.getElementById('tabela-receitas'), document.getElementById('tabela-despesas')];
    tabelas.forEach((tabela) => {
      tabela?.addEventListener('click', async (event) => {
        const btn = event.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        if (action === 'show-plan-parcels') {
          event.stopPropagation();
          const planKey = String(btn.dataset.planKey || '');
          if (!planKey) return;
          const group = planGroupedReceitasIndex.get(planKey);
          if (!group) return;
          closeRowMenus();
          openPlanGroupModal(group);
          return;
        }
        if (action === 'open-plan-page') {
          event.stopPropagation();
          const planId = String(btn.dataset.planId || '');
          if (!planId) return;
          closeRowMenus();
          window.location.href = `planos.html?planId=${encodeURIComponent(planId)}`;
          return;
        }
        const id = btn.dataset.id;
        if (!id) return;
        const lancamento = lancamentos.find((l) => String(l.id || '') === String(id));
        if (!lancamento) return;

        if (action === 'row-menu') {
          event.stopPropagation();
          toggleRowMenu(id);
          return;
        }

        if (action === 'open-patient-finance') {
          closeRowMenus();
          try {
            const patientStub = {
              prontuario: String(lancamento.prontuario || '').trim(),
              id: String(lancamento.patientId || '').trim(),
              nome: String(lancamento.paciente || '').trim(),
              fullName: String(lancamento.paciente || '').trim(),
            };

            if (!patientStub.prontuario) {
              alert('Este lancamento nao possui prontuario vinculado.');
              return;
            }

            localStorage.setItem('prontuarioPatient', JSON.stringify(patientStub));
            localStorage.setItem('prontuario-open-tab', 'financeiro');
            localStorage.setItem('prontuario-focus-finance-entry', String(lancamento.id || ''));
            window.location.href = 'prontuario.html';
          } catch (err) {
            console.error('Erro ao abrir prontuario no financeiro:', err);
            alert('Nao foi possivel abrir o prontuario do paciente.');
          }
          return;
        }

        if (!isFinanceAdmin) {
          alert('Acesso restrito a administradores.');
          closeRowMenus();
          return;
        }

        if (action === 'edit') {
          closeRowMenus();
          openLancamentoDetailsModal(lancamento);
          return;
        }

        if (action === 'confirm') {
          const originalLabel = btn.textContent;
          btn.disabled = true;
          btn.textContent = 'Confirmando...';
          try {
            if (financeApi.confirmPayment) {
              await financeApi.confirmPayment({ financeEntryId: id });
            } else {
              await financeApi.update?.({ id, status: 'pago' });
            }
            btn.textContent = 'Confirmado';
            btn.classList.add('is-confirmed');
            emitFinanceUpdated('gestao-confirm');
            await new Promise((resolve) => setTimeout(resolve, 350));
            closeRowMenus();
            await refreshFinanceViews();
          } catch (err) {
            btn.disabled = false;
            btn.textContent = originalLabel || 'Confirmar';
            console.error('Erro ao confirmar recebimento/pagamento:', err);
            alert('Nao foi possivel confirmar.');
          }
          return;
        }

        if (action === 'cancel') {
          closeRowMenus();
          const cancelLabel = lancamento.tipo === 'receita' ? 'recebimento' : 'pagamento';
          const ok = confirm(`Deseja cancelar este ${cancelLabel}?`);
          if (!ok) return;
          try {
            await financeApi.update?.({ id, status: 'cancelado' });
            emitFinanceUpdated('gestao-cancel');
            await refreshFinanceViews();
          } catch (err) {
            console.error('Erro ao cancelar recebimento/pagamento:', err);
            alert('Nao foi possivel cancelar.');
          }
          return;
        }

        if (action === 'delete') {
          closeRowMenus();
          const ok = confirm('Excluir este lancamento?');
          if (!ok) return;
          try {
            const linkedProcedureId = String(lancamento?.procedureId || lancamento?.servicoId || '').trim();
            const prontuario = String(lancamento?.prontuario || '').trim();
            if (linkedProcedureId && prontuario && servicesApi.delete) {
              await servicesApi.delete({ prontuario, id: linkedProcedureId });
            } else {
              await financeApi.remove?.(id);
            }
            emitFinanceUpdated('gestao-delete');
            await refreshFinanceViews();
          } catch (err) {
            console.error('Erro ao excluir lancamento financeiro:', err);
            alert('Nao foi possivel excluir o lancamento.');
          }
        }
      });
    });

    document.addEventListener('click', (event) => {
      if (!event.target.closest('.row-actions')) {
        closeRowMenus();
      }
    });
  };
  function initGestao() {
    setPeriodoAtual(periodoAtual);
    configurarBotoesPeriodo();
    configurarMenuLateral();
    configurarNavegacaoAuxiliar();
    configurarFiltrosFinancas();
    configurarChipsRapidos();
    configurarRelatorios();
    configurarModal();
    configurarAcoesTabela();
    configureEstoqueModule();
    window.addEventListener('finance-updated', () => {
      refreshFinanceViews().catch((err) => console.error('Falha ao sincronizar financeiro (evento).', err));
    });
    window.addEventListener('storage', (event) => {
      if (event.key !== 'voithos-finance-updated') return;
      refreshFinanceViews().catch((err) => console.error('Falha ao sincronizar financeiro (storage).', err));
    });
    try {
      setupGestaoHub();
    } catch (err) {
      console.error('Falha ao inicializar Hub de Gestao. Aplicando fallback.', err);
      gestaoHubRuntimeEnabled = false;
      setHubBackButtonsVisible(false);
      setGestaoView('financeiro');
    }
    carregarLancamentos();
  }

  window.addEventListener('DOMContentLoaded', initGestao);
})();


































