const createFaturamentoService = ({
  financePath,
  faturamentoFile,
  ensureDir,
  pathExists,
  readJsonFile,
  writeJsonFile,
  parseDateOnly,
  isSameDay,
  isSameMonth,
  getWeekRange,
  generateFinanceId,
}) => {
  const ensureFaturamentoFile = async () => {
    await ensureDir(financePath);
    if (!(await pathExists(faturamentoFile))) {
      await writeJsonFile(faturamentoFile, { lancamentos: [] });
    }
  };

  const readFaturamento = async () => {
    await ensureFaturamentoFile();
    const data = await readJsonFile(faturamentoFile);
    return Array.isArray(data.lancamentos) ? data.lancamentos : [];
  };

  const writeFaturamento = async (list) => {
    await ensureFaturamentoFile();
    await writeJsonFile(faturamentoFile, { lancamentos: list });
  };

  const normalizeKey = (value) =>
    String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

  const normalizeMetodoPagamento = (metodo) => {
    const key = normalizeKey(metodo);
    if (key.includes('credito')) return 'cartao_credito';
    if (key.includes('debito')) return 'debito';
    if (key.includes('boleto')) return 'boleto';
    if (key.includes('dinheiro') || key.includes('cash')) return 'dinheiro';
    if (key.includes('pix')) return 'pix';
    return key || 'pix';
  };

  const buildFaturamentoParcelas = ({ valor, metodoPagamento, dataBase, quantidade, status }) => {
    const total = Number(valor) || 0;
    const baseDate = parseDateOnly(dataBase) || new Date();
    const isCredito = metodoPagamento === 'cartao_credito';
    const qtd = isCredito ? Math.max(1, Number(quantidade) || 1) : 1;
    const valorParcela = Number((total / qtd).toFixed(2));

    const lista = [];
    for (let i = 0; i < qtd; i++) {
      const dt = new Date(baseDate);
      if (isCredito) dt.setMonth(dt.getMonth() + i);
      const statusParcela = isCredito
        ? (status === 'pago' && i === 0 ? 'pago' : 'pendente')
        : status;

      lista.push({
        numero: i + 1,
        valor: valorParcela,
        data: dt.toISOString().split('T')[0],
        status: statusParcela,
      });
    }

    return {
      quantidade: qtd,
      valorParcela,
      lista,
    };
  };

  const flattenParcelas = (lanc) => {
    const listaParcelas = Array.isArray(lanc?.parcelas?.lista) ? lanc.parcelas.lista : [];
    if (listaParcelas.length) {
      return listaParcelas.map((p) => ({
        ...p,
        lancamentoId: lanc.id,
        descricao: lanc.descricao,
        metodoPagamento: lanc.metodoPagamento,
        dataLancamento: lanc.data,
      }));
    }

    return [{
      numero: 1,
      valor: Number(lanc.valor) || 0,
      data: lanc.data,
      status: lanc.status || 'pendente',
      lancamentoId: lanc.id,
      descricao: lanc.descricao,
      metodoPagamento: lanc.metodoPagamento,
      dataLancamento: lanc.data,
    }];
  };

  const filterFaturamentoByPeriod = (list, period) => {
    const hoje = new Date();
    const { monday, sunday } = getWeekRange(hoje);

    return list.filter((l) => {
      const d = parseDateOnly(l.data);
      if (!d) return false;
      if (period === 'dia') return isSameDay(d, hoje);
      if (period === 'semana') return d >= monday && d <= sunday;
      if (period === 'mes') return isSameMonth(d, hoje);
      return true;
    });
  };

  const computeFaturamentoDashboard = (list) => {
    const hoje = new Date();
    const { monday, sunday } = getWeekRange(hoje);
    let totalDia = 0;
    let totalSemana = 0;
    let totalMes = 0;
    const totalPorMetodo = {};
    const parcelasPendentes = [];
    const parcelasRecebidas = [];

    list.forEach((lanc) => {
      const metodoPagamento = normalizeMetodoPagamento(lanc.metodoPagamento || 'pix');
      const parcelas = flattenParcelas(lanc);

      parcelas.forEach((p) => {
        const valor = Number(p.valor) || 0;
        const dataParcela = parseDateOnly(p.data) || parseDateOnly(lanc.data);
        const statusParcela = p.status || lanc.status || 'pendente';

        if (statusParcela === 'pago') {
          parcelasRecebidas.push({
            ...p,
            metodoPagamento,
          });
          totalPorMetodo[metodoPagamento] = (totalPorMetodo[metodoPagamento] || 0) + valor;
          if (dataParcela) {
            if (isSameDay(dataParcela, hoje)) totalDia += valor;
            if (dataParcela >= monday && dataParcela <= sunday) totalSemana += valor;
            if (isSameMonth(dataParcela, hoje)) totalMes += valor;
          }
        } else {
          parcelasPendentes.push({
            ...p,
            metodoPagamento,
          });
        }
      });
    });

    return {
      totalDia,
      totalSemana,
      totalMes,
      totalPorMetodo,
      parcelasPendentes,
      parcelasRecebidas,
    };
  };

  const buildFaturamentoRecord = (payload, existing = {}) => {
    const now = new Date();
    const dataLanc = payload.data || existing.data || now.toISOString().split('T')[0];
    const metodoPagamento = normalizeMetodoPagamento(payload.metodoPagamento || existing.metodoPagamento || 'pix');
    const status = payload.status || existing.status || 'pago';

    const incomingLista = Array.isArray(payload?.parcelas?.lista) ? payload.parcelas.lista : null;
    let parcelas = null;

    if (incomingLista) {
      const quantidade = payload.parcelas.quantidade || incomingLista.length || 1;
      const valorParcela = payload.parcelas.valorParcela
        || Number((Number(payload.valor ?? existing.valor ?? 0) / quantidade).toFixed(2));
      parcelas = {
        quantidade,
        valorParcela,
        lista: incomingLista,
      };
    } else {
      const quantidadeParcelas = payload?.parcelas?.quantidade
        ?? payload?.parcelasQuantidade
        ?? existing?.parcelas?.quantidade
        ?? 1;

      parcelas = buildFaturamentoParcelas({
        valor: payload.valor ?? existing.valor ?? 0,
        metodoPagamento,
        dataBase: dataLanc,
        quantidade: quantidadeParcelas,
        status,
      });
    }

    const record = {
      id: existing.id || generateFinanceId(),
      tipo: 'receita',
      categoria: 'faturamento',
      data: dataLanc,
      descricao: payload.descricao ?? existing.descricao ?? '',
      valor: Number(payload.valor ?? existing.valor ?? 0) || 0,
      metodoPagamento,
      parcelas,
      status,
      origem: payload.origem ?? existing.origem ?? payload.paciente ?? null,
      createdAt: existing.createdAt || now.toISOString(),
    };

    const hasPendente = (parcelas.lista || []).some((p) => p.status !== 'pago');
    if (hasPendente) record.status = 'pendente';

    return record;
  };

  return {
    readFaturamento,
    writeFaturamento,
    normalizeMetodoPagamento,
    buildFaturamentoParcelas,
    buildFaturamentoRecord,
    filterFaturamentoByPeriod,
    computeFaturamentoDashboard,
  };
};

module.exports = { createFaturamentoService };
