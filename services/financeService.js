const createFinanceService = ({
  financePath,
  financeFile,
  financeClosingsFile,
  ensureDir,
  pathExists,
  readJsonFile,
  writeJsonFile,
  parseDateOnly,
  generateFinanceId,
  loadAllPatients,
  getCurrentUser,
}) => {
  const DEFAULT_CLINIC_ID = 'defaultClinic';
  const PAYMENT_METHODS = new Set(['PIX', 'CREDIT', 'DEBIT', 'CASH', 'BOLETO', 'TRANSFER', 'OTHER']);
  const PAYMENT_STATUS = new Set(['PAID', 'PENDING', 'CANCELLED']);

  const getCurrentUserSafe = () => (typeof getCurrentUser === 'function' ? (getCurrentUser() || null) : null);
  const getCurrentClinicId = () => String(getCurrentUserSafe()?.clinicId || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID;
  const toNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };
  const cleanText = (value) => String(value || '').trim();
  const toDateOnly = (value) => {
    if (!value) return new Date().toISOString().split('T')[0];
    const raw = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return new Date().toISOString().split('T')[0];
    return dt.toISOString().split('T')[0];
  };

  const normalizePaymentMethodUpper = (value) => {
    const raw = cleanText(value).toUpperCase();
    if (PAYMENT_METHODS.has(raw)) return raw;
    const map = {
      PIX: 'PIX',
      CARTAO_CREDITO: 'CREDIT',
      CREDITO: 'CREDIT',
      CREDIT: 'CREDIT',
      CARTAO_DEBITO: 'DEBIT',
      DEBITO: 'DEBIT',
      DEBIT: 'DEBIT',
      DINHEIRO: 'CASH',
      CASH: 'CASH',
      BOLETO: 'BOLETO',
      TRANSFERENCIA: 'TRANSFER',
      TRANSFER: 'TRANSFER',
      OUTRO: 'OTHER',
      OTHER: 'OTHER',
    };
    return map[raw] || 'PIX';
  };

  const paymentMethodToFinance = (value) => {
    const upper = normalizePaymentMethodUpper(value);
    const map = {
      PIX: 'pix',
      CREDIT: 'cartao_credito',
      DEBIT: 'cartao_debito',
      CASH: 'dinheiro',
      BOLETO: 'boleto',
      TRANSFER: 'transferencia',
      OTHER: 'outro',
    };
    return map[upper] || 'pix';
  };

  const normalizePaymentStatusUpper = (value) => {
    const raw = cleanText(value).toUpperCase();
    if (PAYMENT_STATUS.has(raw)) return raw;
    if (raw === 'PAGO') return 'PAID';
    if (raw === 'PENDENTE') return 'PENDING';
    if (raw === 'CANCELADO') return 'CANCELLED';
    return 'PAID';
  };

  const paymentStatusToFinance = (value) => {
    const upper = normalizePaymentStatusUpper(value);
    if (upper === 'PENDING') return 'pendente';
    if (upper === 'CANCELLED') return 'cancelado';
    return 'pago';
  };

  const ensureFinanceFile = async () => {
    await ensureDir(financePath);
    if (!(await pathExists(financeFile))) {
      await writeJsonFile(financeFile, { lancamentos: [] });
    }
  };

  const readFinanceRaw = async () => {
    await ensureFinanceFile();
    const data = await readJsonFile(financeFile);
    return Array.isArray(data.lancamentos) ? data.lancamentos : [];
  };

  const writeFinance = async (list) => {
    await ensureFinanceFile();
    await writeJsonFile(financeFile, { lancamentos: list });
  };

  const isProcedureFinanceEntry = (item = {}) => {
    const origem = cleanText(item?.origem).toLowerCase();
    const categoria = cleanText(item?.categoria).toLowerCase();
    const procedureId = cleanText(item?.procedureId || item?.servicoId);
    return origem === 'procedimento' || categoria === 'procedimentos' || !!procedureId;
  };
  const procedureEntryKey = (item = {}) => {
    const clinicId = String(item?.clinicId || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID;
    const procedureId = cleanText(item?.procedureId || item?.servicoId);
    if (!procedureId) return '';
    const prontuario = cleanText(item?.prontuario);
    const patientId = cleanText(item?.patientId);
    const identity = prontuario || patientId;
    if (!identity) return '';
    return `${clinicId}::${procedureId}::${identity}`;
  };
  const paymentStatusRank = (item = {}) => {
    const status = normalizePaymentStatusUpper(item?.paymentStatus || item?.status);
    if (status === 'PAID') return 3;
    if (status === 'PENDING') return 2;
    if (status === 'CANCELLED') return 1;
    return 0;
  };
  const pickMostRelevantProcedureEntry = (entries = []) => {
    return entries.slice().sort((a, b) => {
      const rank = paymentStatusRank(b) - paymentStatusRank(a);
      if (rank !== 0) return rank;
      const updatedA = new Date(a?.updatedAt || a?.paidAt || a?.data || 0).getTime() || 0;
      const updatedB = new Date(b?.updatedAt || b?.paidAt || b?.data || 0).getTime() || 0;
      return updatedB - updatedA;
    })[0] || null;
  };
  const dedupeProcedureEntries = (list = [], preferredEntryId = '') => {
    if (!Array.isArray(list) || list.length < 2) return list;
    const byKey = new Map();
    list.forEach((item) => {
      if (!isProcedureFinanceEntry(item)) return;
      const key = procedureEntryKey(item);
      if (!key) return;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(item);
    });

    const keepIds = new Set();
    byKey.forEach((entries) => {
      if (!entries.length) return;
      if (entries.length === 1) {
        keepIds.add(String(entries[0]?.id || ''));
        return;
      }
      const preferred = entries.find((entry) => String(entry?.id || '') === String(preferredEntryId || ''));
      const chosen = preferred || pickMostRelevantProcedureEntry(entries);
      if (chosen?.id) keepIds.add(String(chosen.id));
    });

    return list.filter((item) => {
      if (!isProcedureFinanceEntry(item)) return true;
      const key = procedureEntryKey(item);
      if (!key) return true;
      return keepIds.has(String(item?.id || ''));
    });
  };

  const buildProcedureIndexByClinic = async (clinicId) => {
    if (typeof loadAllPatients !== 'function') return null;
    const patients = await loadAllPatients();
    const byProntuario = new Map();
    const byServiceId = new Set();

    (Array.isArray(patients) ? patients : []).forEach((patient) => {
      const patientClinicId = String(patient?.clinicId || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID;
      if (patientClinicId !== clinicId) return;
      const prontuario = cleanText(patient?.prontuario);
      if (!prontuario) return;
      const services = Array.isArray(patient?.servicos) ? patient.servicos : [];
      const serviceSet = byProntuario.get(prontuario) || new Set();
      services.forEach((service) => {
        const serviceId = cleanText(service?.id);
        if (!serviceId) return;
        serviceSet.add(serviceId);
        byServiceId.add(serviceId);
      });
      byProntuario.set(prontuario, serviceSet);
    });

    return { byProntuario, byServiceId };
  };

  const syncProcedureEntriesWithPatientRecords = async (list = []) => {
    if (!Array.isArray(list) || !list.length) return list;
    const clinicId = getCurrentClinicId();
    const index = await buildProcedureIndexByClinic(clinicId);
    if (!index) return list;

    const filtered = list.filter((entry) => {
      const entryClinicId = String(entry?.clinicId || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID;
      if (entryClinicId !== clinicId) return true;
      if (!isProcedureFinanceEntry(entry)) return true;

      const procedureId = cleanText(entry?.procedureId || entry?.servicoId);
      if (!procedureId) return false;

      const prontuario = cleanText(entry?.prontuario);
      if (prontuario) {
        const serviceSet = index.byProntuario.get(prontuario);
        return Boolean(serviceSet && serviceSet.has(procedureId));
      }

      return index.byServiceId.has(procedureId);
    });

    if (filtered.length !== list.length) {
      await writeFinance(filtered);
      return filtered;
    }

    return list;
  };

  const readFinance = async () => {
    const raw = await readFinanceRaw();
    const deduped = dedupeProcedureEntries(raw);
    if (deduped.length !== raw.length) {
      await writeFinance(deduped);
      return deduped;
    }
    return raw;
  };

  const ensureFinanceClosingsFile = async () => {
    await ensureDir(financePath);
    if (!(await pathExists(financeClosingsFile))) {
      await writeJsonFile(financeClosingsFile, { fechamentos: [] });
    }
  };

  const readFinanceClosings = async () => {
    await ensureFinanceClosingsFile();
    const data = await readJsonFile(financeClosingsFile);
    return Array.isArray(data.fechamentos) ? data.fechamentos : [];
  };

  const writeFinanceClosings = async (list) => {
    await ensureFinanceClosingsFile();
    await writeJsonFile(financeClosingsFile, { fechamentos: list });
  };

  const filterFinanceByMonthYear = (list, month, year) => {
    const mesNumero = Number(month);
    const anoNumero = Number(year);
    return list.filter((l) => {
      const d = parseDateOnly(l.data);
      if (!d) return false;
      return d.getFullYear() === anoNumero && d.getMonth() + 1 === mesNumero;
    });
  };

  const buildFinanceMonthlyReport = (list, month, year) => {
    const filtrado = filterFinanceByMonthYear(list, month, year);
    const entradas = filtrado.filter((l) => l.tipo === 'receita');
    const saidas = filtrado.filter((l) => l.tipo !== 'receita');
    const totalEntradas = entradas.reduce((acc, item) => acc + (Number(item.valor) || 0), 0);
    const totalSaidas = saidas.reduce((acc, item) => acc + (Number(item.valor) || 0), 0);
    const saldo = totalEntradas - totalSaidas;

    return {
      mes: Number(month),
      ano: Number(year),
      entradas,
      saidas,
      totalEntradas,
      totalSaidas,
      saldo,
    };
  };

  const createOrUpdateProcedureRevenue = async (payload = {}) => {
    const list = await readFinance();
    const clinicId = getCurrentClinicId();
    const nowIso = new Date().toISOString();
    const user = getCurrentUserSafe();
    const procedureId = cleanText(payload.procedureId || payload.servicoId || payload.serviceId);
    const patientId = cleanText(payload.patientId);
    const prontuario = cleanText(payload.prontuario || payload.patientProntuario);
    const paymentStatus = normalizePaymentStatusUpper(payload.status || payload.paymentStatus);
    const paymentMethod = normalizePaymentMethodUpper(payload.formaPagamento || payload.paymentMethod || payload.metodoPagamento);
    const statusFinance = paymentStatusToFinance(paymentStatus);
    const metodoPagamento = paymentMethodToFinance(paymentMethod);
    const valor = toNumber(payload.valor);
    const procedureName = cleanText(payload.procedureName || payload.procedimento || payload.nomeProcedimento || 'Procedimento');
    const pacienteNome = cleanText(payload.patientName || payload.pacienteNome || payload.paciente);
    const data = toDateOnly(payload.data || payload.dataFinalizacao || nowIso);
    const vencimento = payload.vencimento || payload.dueDate ? toDateOnly(payload.vencimento || payload.dueDate) : '';

    let idx = -1;
    const requestedId = cleanText(payload.financeEntryId);
    if (requestedId) {
      idx = list.findIndex((item) =>
        String(item?.id || '') === requestedId && String(item?.clinicId || DEFAULT_CLINIC_ID) === clinicId
      );
    }
    if (idx === -1 && procedureId) {
      idx = list.findIndex((item) =>
        String(item?.clinicId || DEFAULT_CLINIC_ID) === clinicId &&
        String(item?.procedureId || item?.servicoId || '') === procedureId
      );
    }

    const base = idx >= 0 ? list[idx] : null;
    const resolvedProcedureId = procedureId || cleanText(base?.procedureId || base?.servicoId);
    const resolvedPatientId = patientId || cleanText(base?.patientId);
    const resolvedProntuario = prontuario || cleanText(base?.prontuario);
    if (!resolvedProcedureId) {
      throw new Error('procedureId e obrigatorio para lancamento de procedimento.');
    }
    if (!resolvedPatientId && !resolvedProntuario) {
      throw new Error('Lancamento de procedimento exige patientId ou prontuario.');
    }
    const id = base?.id || (typeof generateFinanceId === 'function'
      ? generateFinanceId()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
    const paidAt = paymentStatus === 'PAID'
      ? (payload.paidAt || base?.paidAt || nowIso)
      : null;

    const entry = {
      ...(base || {}),
      id,
      clinicId,
      tipo: 'receita',
      categoria: 'procedimentos',
      descricao: cleanText(payload.descricao) || `Procedimento: ${procedureName}`,
      valor,
      status: statusFinance,
      metodoPagamento,
      paymentMethod,
      paymentStatus,
      paidAt,
      dueDate: vencimento || null,
      vencimento: vencimento || null,
      installments: payload.installments ?? base?.installments ?? null,
      patientId: resolvedPatientId,
      prontuario: resolvedProntuario,
      paciente: pacienteNome || base?.paciente || '',
      procedureId: resolvedProcedureId,
      servicoId: resolvedProcedureId,
      procedimento: procedureName || base?.procedimento || '',
      origem: 'procedimento',
      data,
      createdAt: base?.createdAt || nowIso,
      createdBy: base?.createdBy || user?.id || '',
      updatedAt: nowIso,
      updatedBy: user?.id || '',
    };

    if (idx >= 0) list[idx] = entry;
    else list.push(entry);
    const deduped = dedupeProcedureEntries(list, id);
    await writeFinance(deduped);
    return entry;
  };

  const confirmPayment = async (payload) => {
    const id = cleanText(typeof payload === 'string' ? payload : payload?.financeEntryId);
    if (!id) throw new Error('financeEntryId e obrigatorio.');
    const list = await readFinance();
    const clinicId = getCurrentClinicId();
    const idx = list.findIndex((item) => String(item?.id || '') === id);
    if (idx === -1) throw new Error('Lancamento nao encontrado.');
    if (String(list[idx]?.clinicId || DEFAULT_CLINIC_ID) !== clinicId) throw new Error('Acesso negado.');

    const requestedMethod = normalizePaymentMethodUpper(payload?.paymentMethod || payload?.metodoPagamento || list[idx]?.paymentMethod);
    const requestedPaidAt = payload?.paidAt ? new Date(payload.paidAt) : null;
    const paidAt = requestedPaidAt && !Number.isNaN(requestedPaidAt.getTime())
      ? requestedPaidAt.toISOString()
      : new Date().toISOString();
    const notes = cleanText(payload?.notes || payload?.observacao || payload?.observacoes);
    const nowIso = new Date().toISOString();
    const user = getCurrentUserSafe();
    list[idx] = {
      ...list[idx],
      status: 'pago',
      paymentStatus: 'PAID',
      paymentMethod: requestedMethod,
      metodoPagamento: paymentMethodToFinance(requestedMethod),
      paidAt,
      notes: notes || list[idx]?.notes || '',
      updatedAt: nowIso,
      updatedBy: user?.id || '',
    };
    const deduped = dedupeProcedureEntries(list, id);
    await writeFinance(deduped);
    return list[idx];
  };

  const listByPatient = async ({ patientId, prontuario } = {}) => {
    const clinicId = getCurrentClinicId();
    const patientKey = cleanText(patientId);
    const prontuarioKey = cleanText(prontuario);
    const list = await readFinance();
    return list
      .filter((item) => String(item?.clinicId || DEFAULT_CLINIC_ID) === clinicId)
      .filter((item) => {
        if (patientKey && cleanText(item?.patientId) === patientKey) return true;
        if (prontuarioKey && cleanText(item?.prontuario) === prontuarioKey) return true;
        return false;
      })
      .sort((a, b) => String(b?.data || '').localeCompare(String(a?.data || '')));
  };

  return {
    readFinance,
    writeFinance,
    readFinanceClosings,
    writeFinanceClosings,
    buildFinanceMonthlyReport,
    createOrUpdateProcedureRevenue,
    confirmPayment,
    listByPatient,
  };
};

module.exports = { createFinanceService };
