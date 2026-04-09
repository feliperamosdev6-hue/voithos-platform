const DEFAULT_CLINIC_ID = 'defaultClinic';

const VALID_STATUS = new Set(['ATIVO', 'EM_ANDAMENTO', 'LIBERADO', 'CANCELADO']);
const VALID_RELEASE_RULE = new Set(['FIRST_PAYMENT', 'PERCENT_50', 'FULL']);
const VALID_PARCEL_STATUS = new Set(['PENDING', 'PAID', 'CANCELLED']);
const VALID_PAYMENT_METHODS = new Set(['PIX', 'CREDIT', 'DEBIT', 'CASH', 'BOLETO', 'TRANSFER', 'OTHER']);
const ENTRY_PARCEL_ID = '__ENTRY__';

const createPlansService = ({
  plansPath,
  plansFile,
  financePath,
  financeFile,
  ensureDir,
  pathExists,
  readJsonFile,
  writeJsonFile,
  getCurrentUser,
  generateFinanceId,
}) => {
  const getCurrentUserSafe = () => (typeof getCurrentUser === 'function' ? (getCurrentUser() || null) : null);
  const getCurrentClinicId = () => String(getCurrentUserSafe()?.clinicId || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID;
  const getActorId = () => String(getCurrentUserSafe()?.id || '').trim();

  const cleanText = (value) => String(value || '').trim().replace(/[<>]/g, '');
  const toNumber = (value, fallback = 0) => {
    if (value === null || value === undefined || value === '') return fallback;
    if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
    let raw = String(value).trim();
    if (!raw) return fallback;
    raw = raw.replace(/\s+/g, '');
    if (raw.includes(',') && raw.includes('.')) {
      raw = raw.replace(/\./g, '').replace(',', '.');
    } else if (raw.includes(',')) {
      raw = raw.replace(',', '.');
    } else if (raw.includes('.')) {
      const dots = (raw.match(/\./g) || []).length;
      if (dots > 1) {
        raw = raw.replace(/\./g, '');
      } else {
        const [left, right = ''] = raw.split('.');
        if (/^\d+$/.test(left) && /^\d+$/.test(right) && right.length === 3) {
          raw = `${left}${right}`;
        }
      }
    }
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  };
  const nowIso = () => new Date().toISOString();
  const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

  const toDateOnly = (value, fallback = '') => {
    if (!value) return fallback;
    const raw = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return fallback;
    return dt.toISOString().slice(0, 10);
  };

  const addMonthsToDateOnly = (dateOnly, months = 0, dueDay = 0) => {
    const base = new Date(`${toDateOnly(dateOnly, new Date().toISOString().slice(0, 10))}T00:00:00`);
    const monthOffset = Math.max(0, toNumber(months, 0));
    const next = new Date(base.getFullYear(), base.getMonth() + monthOffset, 1);
    const day = Math.max(1, Math.min(28, toNumber(dueDay, base.getDate())));
    next.setDate(day);
    return next.toISOString().slice(0, 10);
  };

  const generatePlanId = () => `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const generateParcelId = () => `parcel-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const generateFinanceIdSafe = () =>
    (typeof generateFinanceId === 'function'
      ? generateFinanceId()
      : `fin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);

  const ensurePlansFile = async () => {
    await ensureDir(plansPath);
    if (!(await pathExists(plansFile))) {
      await writeJsonFile(plansFile, { plans: [] });
    }
  };

  const ensureFinanceFile = async () => {
    if (!financePath || !financeFile) return;
    await ensureDir(financePath);
    if (!(await pathExists(financeFile))) {
      await writeJsonFile(financeFile, { lancamentos: [] });
    }
  };

  const readPlans = async () => {
    await ensurePlansFile();
    const data = await readJsonFile(plansFile);
    return Array.isArray(data?.plans) ? data.plans : [];
  };

  const writePlans = async (plans) => {
    await ensurePlansFile();
    await writeJsonFile(plansFile, { plans: Array.isArray(plans) ? plans : [] });
  };

  const readFinance = async () => {
    if (!financeFile) return [];
    await ensureFinanceFile();
    const data = await readJsonFile(financeFile);
    return Array.isArray(data?.lancamentos) ? data.lancamentos : [];
  };

  const writeFinance = async (rows) => {
    if (!financeFile) return;
    await ensureFinanceFile();
    await writeJsonFile(financeFile, { lancamentos: Array.isArray(rows) ? rows : [] });
  };

  const normalizeFinancePaymentStatus = (value) => {
    const raw = cleanText(value).toUpperCase();
    if (raw === 'PAID' || raw === 'PAGO') return 'PAID';
    if (raw === 'PENDING' || raw === 'PENDENTE') return 'PENDING';
    if (raw === 'CANCELLED' || raw === 'CANCELADO') return 'CANCELLED';
    return 'PENDING';
  };

  const normalizePaymentMethodUpper = (value) => {
    const raw = cleanText(value).toUpperCase();
    if (VALID_PAYMENT_METHODS.has(raw)) return raw;
    const alias = {
      CARTAO_CREDITO: 'CREDIT',
      CARTAO_DEBITO: 'DEBIT',
      TRANSFERENCIA: 'TRANSFER',
      DINHEIRO: 'CASH',
      OUTRO: 'OTHER',
      CREDITO: 'CREDIT',
      DEBITO: 'DEBIT',
      BOLETO: 'BOLETO',
      PIX: 'PIX',
    };
    return alias[raw] || 'OTHER';
  };

  const paymentMethodToFinance = (value) => {
    const key = normalizePaymentMethodUpper(value);
    const map = {
      PIX: 'pix',
      CREDIT: 'cartao_credito',
      DEBIT: 'cartao_debito',
      CASH: 'dinheiro',
      BOLETO: 'boleto',
      TRANSFER: 'transferencia',
      OTHER: 'outro',
    };
    return map[key] || 'outro';
  };

  const normalizeReleaseRule = (payload = {}) => {
    const direct = cleanText(payload.releaseRule).toUpperCase();
    if (VALID_RELEASE_RULE.has(direct)) return direct;

    const legacyRule = cleanText(payload.regra).toLowerCase();
    if (legacyRule === 'quitacao_total') return 'FULL';

    const installmentsCount = Math.max(1, toNumber(payload.installmentsCount ?? payload.parcelas, 1));
    const minInstallments = Math.max(1, toNumber(payload.minInstallmentsRelease ?? payload.minParcelas, 1));
    if (minInstallments >= Math.ceil(installmentsCount * 0.5)) return 'PERCENT_50';
    return 'FIRST_PAYMENT';
  };

  const computeMinInstallmentsRelease = ({ releaseRule, installmentsCount, minInstallmentsRelease }) => {
    const base = Math.max(1, toNumber(installmentsCount, 1));
    const custom = Math.max(1, toNumber(minInstallmentsRelease, 1));
    if (releaseRule === 'FULL') return base;
    if (releaseRule === 'PERCENT_50') return Math.max(custom, Math.ceil(base * 0.5));
    return custom;
  };

  const normalizeStatus = (value) => {
    const raw = cleanText(value).toUpperCase();
    if (VALID_STATUS.has(raw)) return raw;
    if (raw === 'INATIVO') return 'CANCELADO';
    return 'ATIVO';
  };

  const distributeInstallments = (totalValue, count) => {
    const safeCount = Math.max(1, toNumber(count, 1));
    const cents = Math.max(0, Math.round((Number(totalValue) || 0) * 100));
    const base = Math.floor(cents / safeCount);
    const remainder = cents - (base * safeCount);
    const values = [];
    for (let i = 0; i < safeCount; i += 1) {
      values.push((base + (i < remainder ? 1 : 0)) / 100);
    }
    return values;
  };

  const ensureScheduleFromLegacy = (plan) => {
    const current = Array.isArray(plan?.payment?.schedule) ? plan.payment.schedule : [];
    if (current.length) return current;
    const totalValue = Math.max(0, toNumber(plan?.totalValue, 0));
    const entryValue = Math.max(0, toNumber(plan?.payment?.entry?.value, 0));
    const restante = Math.max(0, totalValue - Math.min(entryValue, totalValue));
    const installmentsCount = Math.max(1, toNumber(plan?.installmentsCount, 1));
    const paidInstallments = Math.max(0, Math.min(installmentsCount, toNumber(plan?.paidInstallments, 0)));
    const values = distributeInstallments(restante, installmentsCount);
    const startDate = toDateOnly(plan?.startDate, new Date().toISOString().slice(0, 10));
    const dueDay = Math.max(0, toNumber(plan?.dueDay, 0));
    return values.map((value, index) => ({
      parcelId: generateParcelId(),
      number: index + 1,
      value: roundMoney(value),
      dueDate: addMonthsToDateOnly(startDate, index, dueDay),
      status: index < paidInstallments ? 'PAID' : 'PENDING',
      paymentMethod: 'OTHER',
      paidAt: index < paidInstallments ? nowIso() : null,
      financeEntryId: null,
    }));
  };

  const normalizeParcel = (parcel = {}, fallback = {}) => {
    const status = cleanText(parcel.status).toUpperCase();
    const method = normalizePaymentMethodUpper(parcel.paymentMethod || fallback.paymentMethod);
    return {
      parcelId: cleanText(parcel.parcelId || fallback.parcelId || generateParcelId()),
      number: Math.max(1, toNumber(parcel.number ?? fallback.number, 1)),
      value: roundMoney(toNumber(parcel.value ?? fallback.value, 0)),
      dueDate: toDateOnly(parcel.dueDate ?? fallback.dueDate, ''),
      status: VALID_PARCEL_STATUS.has(status) ? status : (fallback.status || 'PENDING'),
      paymentMethod: method,
      paidAt: parcel.paidAt || fallback.paidAt || null,
      financeEntryId: cleanText(parcel.financeEntryId || fallback.financeEntryId || ''),
    };
  };

  const normalizeEntry = (entry = {}, fallback = {}) => {
    const value = roundMoney(Math.max(0, toNumber(entry.value ?? entry.entryValue ?? fallback.value, 0)));
    return {
      value,
      paidAt: entry.paidAt ?? entry.entryPaidAt ?? fallback.paidAt ?? null,
      paymentMethod: normalizePaymentMethodUpper(entry.paymentMethod ?? entry.entryPaymentMethod ?? fallback.paymentMethod ?? 'PIX'),
      financeEntryId: cleanText(entry.financeEntryId ?? fallback.financeEntryId ?? ''),
      status: value > 0 ? 'PAID' : 'PENDING',
      notes: cleanText(entry.notes ?? fallback.notes ?? ''),
    };
  };

  const computeRelease = (plan = {}, schedule = []) => {
    const totalValue = Math.max(0, toNumber(plan.totalValue, 0));
    const paidFromSchedule = roundMoney(
      schedule
        .filter((parcel) => cleanText(parcel.status).toUpperCase() === 'PAID')
        .reduce((acc, parcel) => acc + toNumber(parcel.value), 0)
    );
    const paidFromEntry = roundMoney(Math.max(0, toNumber(plan?.payment?.entry?.value, 0)));
    const paidTotal = roundMoney(paidFromSchedule + paidFromEntry);
    const pendingTotal = roundMoney(
      Math.max(0, totalValue - paidTotal)
    );
    const paidCount = schedule.filter((parcel) => cleanText(parcel.status).toUpperCase() === 'PAID').length;
    const percentPaid = totalValue > 0 ? (paidTotal / totalValue) : 0;
    const releaseRule = cleanText(plan.releaseRule).toUpperCase() || 'FULL';
    let isReleased = false;
    if (releaseRule === 'FIRST_PAYMENT') isReleased = paidTotal > 0;
    else if (releaseRule === 'PERCENT_50') isReleased = percentPaid >= 0.5;
    else isReleased = percentPaid >= 1;

    const releaseStatus = isReleased
      ? 'LIBERADO'
      : (paidTotal > 0 ? 'PARCIAL' : 'NAO_LIBERADO');

    const existingStatus = cleanText(plan.statusAtual).toUpperCase();
    let statusAtual = existingStatus;
    if (existingStatus !== 'CANCELADO') {
      if (releaseStatus === 'LIBERADO') statusAtual = 'LIBERADO';
      else if (paidTotal > 0) statusAtual = 'EM_ANDAMENTO';
      else statusAtual = 'ATIVO';
    }

    return {
      paidTotal,
      pendingTotal,
      paidCount,
      percentPaid,
      releaseStatus,
      statusAtual,
      releasedAt: isReleased ? (plan?.payment?.releasedAt || plan.releasedAt || nowIso()) : null,
    };
  };

  const normalizePlan = (payload = {}, { clinicId, existing, nowAt, actorId }) => {
    const installmentsCount = Math.max(1, toNumber(payload.installmentsCount ?? payload.parcelas, existing?.installmentsCount || 1));
    const totalValue = Math.max(0, toNumber(payload.totalValue ?? payload.valorTotal, existing?.totalValue || 0));
    const releaseRule = normalizeReleaseRule(payload);
    const minInstallmentsRelease = computeMinInstallmentsRelease({
      releaseRule,
      installmentsCount,
      minInstallmentsRelease: payload.minInstallmentsRelease ?? payload.minParcelas ?? existing?.minInstallmentsRelease,
    });
    const title = cleanText(payload.title ?? payload.nome ?? existing?.title ?? '');
    const patientId = cleanText(payload.patientId ?? existing?.patientId ?? '');
    const prontuario = cleanText(payload.prontuario ?? payload.patientProntuario ?? existing?.prontuario ?? '');
    const dueDay = Math.max(0, toNumber(payload.dueDay ?? existing?.dueDay, 0));
    const startDate = toDateOnly(payload.startDate ?? existing?.startDate, new Date().toISOString().slice(0, 10));
    const explicitEntryValue = payload?.entryValue ?? payload?.entradaValor ?? payload?.payment?.entryValue ?? payload?.payment?.entry?.value;
    const explicitEntryPaidAt = payload?.entryPaidAt;
    const explicitEntryMethod = payload?.entryPaymentMethod;
    const entry = normalizeEntry(
      {
        ...(payload?.payment?.entry || {}),
        ...(explicitEntryValue !== undefined ? { value: explicitEntryValue, entryValue: explicitEntryValue } : {}),
        ...(explicitEntryPaidAt !== undefined ? { paidAt: explicitEntryPaidAt, entryPaidAt: explicitEntryPaidAt } : {}),
        ...(explicitEntryMethod !== undefined ? { paymentMethod: explicitEntryMethod, entryPaymentMethod: explicitEntryMethod } : {}),
      },
      existing?.payment?.entry || {}
    );
    const totalAfterEntry = Math.max(0, totalValue - Math.min(entry.value, totalValue));

    const merged = {
      planId: cleanText(payload.planId ?? existing?.planId ?? generatePlanId()),
      clinicId,
      patientId,
      prontuario,
      patientName: cleanText(payload.patientName ?? payload.paciente ?? existing?.patientName ?? ''),
      dentistName: cleanText(payload.dentistName ?? payload.dentista ?? existing?.dentistName ?? ''),
      title,
      category: cleanText(payload.category ?? payload.categoria ?? existing?.category ?? ''),
      description: cleanText(payload.description ?? payload.descricao ?? existing?.description ?? ''),
      serviceLabel: cleanText(payload.serviceLabel ?? payload.servico ?? payload.serviceName ?? existing?.serviceLabel ?? ''),
      notes: cleanText(payload.notes ?? payload.observacoes ?? existing?.notes ?? ''),
      totalValue: roundMoney(totalValue),
      installmentsCount,
      installmentValue: roundMoney(installmentsCount > 0 ? totalAfterEntry / installmentsCount : totalAfterEntry),
      paidInstallments: Math.max(0, toNumber(payload.paidInstallments ?? payload.parcelasPagas, existing?.paidInstallments || 0)),
      minInstallmentsRelease,
      releaseRule,
      startDate,
      dueDay,
      statusAtual: normalizeStatus(payload.statusAtual ?? payload.status ?? existing?.statusAtual),
      linkedServiceIds: Array.isArray(payload.linkedServiceIds ?? payload.servicos)
        ? (payload.linkedServiceIds ?? payload.servicos).map((v) => cleanText(v)).filter(Boolean)
        : (payload.linkedServiceIds === null
          ? []
          : (Array.isArray(existing?.linkedServiceIds)
            ? existing.linkedServiceIds
            : [])),
      deletedAt: payload.deletedAt ?? existing?.deletedAt ?? null,
      createdAt: existing?.createdAt || nowAt,
      createdBy: existing?.createdBy || actorId,
      updatedAt: nowAt,
      updatedBy: actorId,
      payment: {
        schedule: Array.isArray(payload?.payment?.schedule)
          ? payload.payment.schedule.map((parcel) => normalizeParcel(parcel))
          : (Array.isArray(existing?.payment?.schedule)
            ? existing.payment.schedule.map((parcel) => normalizeParcel(parcel))
            : []),
        paidTotal: roundMoney(toNumber(payload?.payment?.paidTotal, existing?.payment?.paidTotal || 0)),
        pendingTotal: roundMoney(toNumber(payload?.payment?.pendingTotal, existing?.payment?.pendingTotal || 0)),
        releasedAt: payload?.payment?.releasedAt ?? existing?.payment?.releasedAt ?? null,
        releaseStatus: cleanText(payload?.payment?.releaseStatus || existing?.payment?.releaseStatus).toUpperCase() || 'NAO_LIBERADO',
        releaseRule,
        entry,
      },
      linkage: {
        financeEntryIds: { ...(existing?.linkage?.financeEntryIds || {}), ...(payload?.linkage?.financeEntryIds || {}) },
      },
    };

    if (!merged.payment.schedule.length) {
      merged.payment.schedule = ensureScheduleFromLegacy(merged);
    }

    const computed = computeRelease(merged, merged.payment.schedule);
    merged.paidInstallments = computed.paidCount;
    merged.payment.paidTotal = computed.paidTotal;
    merged.payment.pendingTotal = computed.pendingTotal;
    merged.payment.releaseStatus = computed.releaseStatus;
    merged.payment.releasedAt = computed.releasedAt;
    merged.payment.releaseRule = merged.releaseRule;
    merged.statusAtual = merged.statusAtual === 'CANCELADO' ? 'CANCELADO' : computed.statusAtual;
    merged.releasedAt = merged.payment.releasedAt;

    return merged;
  };

  const validatePlan = (plan = {}) => {
    if (!cleanText(plan.title)) throw new Error('Nome do plano obrigatorio.');
    if (!cleanText(plan.patientId) && !cleanText(plan.prontuario)) {
      throw new Error('Paciente obrigatorio (patientId ou prontuario).');
    }
    if (toNumber(plan.totalValue) <= 0) throw new Error('Valor total deve ser maior que zero.');
    if (toNumber(plan?.payment?.entry?.value) > toNumber(plan.totalValue)) {
      throw new Error('Entrada nao pode ser maior que o valor total.');
    }
    if (toNumber(plan.installmentsCount) < 1) throw new Error('Numero de parcelas deve ser ao menos 1.');
    if (!VALID_RELEASE_RULE.has(cleanText(plan.releaseRule).toUpperCase())) throw new Error('Regra de liberacao invalida.');
    if (!Array.isArray(plan?.payment?.schedule) || !plan.payment.schedule.length) {
      throw new Error('Plano sem parcelas geradas.');
    }
    const paidCount = plan.payment.schedule.filter((parcel) => cleanText(parcel.status).toUpperCase() === 'PAID').length;
    if (paidCount > toNumber(plan.installmentsCount)) {
      throw new Error('Parcelas pagas nao pode ser maior que parcelas totais.');
    }
  };

  const isPlanFinanceEntry = (entry = {}, clinicId, planId) => {
    return cleanText(entry?.clinicId || DEFAULT_CLINIC_ID) === cleanText(clinicId)
      && cleanText(entry?.planId) === cleanText(planId);
  };

  const upsertPlanFinanceEntries = (plan, financeRows, actorId) => {
    const mutableRows = Array.isArray(financeRows) ? financeRows : [];
    const clinicId = cleanText(plan.clinicId || DEFAULT_CLINIC_ID);
    const now = nowIso();
    const financeByParcel = new Map();
    mutableRows.forEach((entry, idx) => {
      if (isPlanFinanceEntry(entry, clinicId, plan.planId) && cleanText(entry?.parcelId)) {
        financeByParcel.set(cleanText(entry.parcelId), { entry, idx });
      }
    });

    const linkage = {};

    const entryInfo = normalizeEntry(plan?.payment?.entry || {});
    const existingEntry = financeByParcel.get(ENTRY_PARCEL_ID);
    if (entryInfo.value > 0) {
      const base = existingEntry?.entry || {};
      const entryFinanceId = cleanText(entryInfo.financeEntryId || base?.id || generateFinanceIdSafe());
      const entryPaidAt = entryInfo.paidAt || base?.paidAt || now;
      const entryPaymentMethod = normalizePaymentMethodUpper(entryInfo.paymentMethod || base?.paymentMethod || 'PIX');
      const entryRow = {
        ...base,
        id: entryFinanceId,
        clinicId,
        tipo: 'receita',
        categoria: 'planos',
        origem: 'plano',
        descricao: `[Plano] ${plan.title} - Entrada`,
        valor: roundMoney(entryInfo.value),
        status: 'pago',
        paymentStatus: 'PAID',
        paymentMethod: entryPaymentMethod,
        metodoPagamento: paymentMethodToFinance(entryPaymentMethod),
        dueDate: toDateOnly(entryPaidAt, now.slice(0, 10)),
        vencimento: toDateOnly(entryPaidAt, now.slice(0, 10)),
        paidAt: entryPaidAt,
        installments: plan.installmentsCount,
        patientId: cleanText(plan.patientId),
        prontuario: cleanText(plan.prontuario),
        paciente: cleanText(plan.patientName),
        procedureId: '',
        servicoId: '',
        procedimento: '',
        planId: cleanText(plan.planId),
        parcelId: ENTRY_PARCEL_ID,
        parcelNumber: 0,
        createdAt: base.createdAt || now,
        createdBy: base.createdBy || actorId,
        updatedAt: now,
        updatedBy: actorId,
        notes: entryInfo.notes || base.notes || '',
      };
      if (existingEntry) mutableRows[existingEntry.idx] = entryRow;
      else mutableRows.push(entryRow);
      linkage[ENTRY_PARCEL_ID] = entryFinanceId;
      plan.payment.entry = {
        ...entryInfo,
        status: 'PAID',
        paidAt: entryPaidAt,
        paymentMethod: entryPaymentMethod,
        financeEntryId: entryFinanceId,
      };
    } else {
      if (existingEntry) {
        mutableRows[existingEntry.idx] = {
          ...existingEntry.entry,
          status: 'cancelado',
          paymentStatus: 'CANCELLED',
          updatedAt: now,
          updatedBy: actorId,
        };
      }
      plan.payment.entry = {
        ...entryInfo,
        status: 'PENDING',
        financeEntryId: '',
      };
    }

    plan.payment.schedule = plan.payment.schedule.map((parcel) => {
      const normalized = normalizeParcel(parcel);
      const key = cleanText(normalized.parcelId);
      const existing = key ? financeByParcel.get(key) : null;
      const financeId = cleanText(normalized.financeEntryId || existing?.entry?.id || generateFinanceIdSafe());
      const paymentStatus = normalizeFinancePaymentStatus(
        normalized.status === 'PAID' ? 'PAID' : (normalized.status === 'CANCELLED' ? 'CANCELLED' : 'PENDING')
      );
      const statusLower = paymentStatus === 'PAID' ? 'pago' : (paymentStatus === 'CANCELLED' ? 'cancelado' : 'pendente');
      const paymentMethod = normalizePaymentMethodUpper(normalized.paymentMethod || existing?.entry?.paymentMethod || 'OTHER');
      const dueDate = toDateOnly(normalized.dueDate || existing?.entry?.dueDate, '');

      const base = existing?.entry || {};
      const entry = {
        ...base,
        id: financeId,
        clinicId,
        tipo: 'receita',
        categoria: 'planos',
        origem: 'plano',
        descricao: `[Plano] ${plan.title} - Parcela ${normalized.number}/${plan.installmentsCount}`,
        valor: roundMoney(normalized.value),
        status: statusLower,
        paymentStatus,
        paymentMethod,
        metodoPagamento: paymentMethodToFinance(paymentMethod),
        dueDate: dueDate || null,
        vencimento: dueDate || null,
        paidAt: paymentStatus === 'PAID' ? (normalized.paidAt || base.paidAt || now) : null,
        installments: plan.installmentsCount,
        patientId: cleanText(plan.patientId),
        prontuario: cleanText(plan.prontuario),
        paciente: cleanText(plan.patientName),
        procedureId: '',
        servicoId: '',
        procedimento: '',
        planId: cleanText(plan.planId),
        parcelId: key,
        parcelNumber: normalized.number,
        createdAt: base.createdAt || now,
        createdBy: base.createdBy || actorId,
        updatedAt: now,
        updatedBy: actorId,
        notes: base.notes || '',
      };

      if (existing) mutableRows[existing.idx] = entry;
      else mutableRows.push(entry);

      linkage[key] = financeId;

      return {
        ...normalized,
        financeEntryId: financeId,
        paymentMethod,
        paidAt: entry.paidAt || null,
        status: paymentStatus === 'PAID' ? 'PAID' : (paymentStatus === 'CANCELLED' ? 'CANCELLED' : 'PENDING'),
      };
    });

    mutableRows.forEach((entry, idx) => {
      if (!isPlanFinanceEntry(entry, clinicId, plan.planId)) return;
      const parcelId = cleanText(entry?.parcelId);
      if (!parcelId || linkage[parcelId]) return;
      mutableRows[idx] = {
        ...entry,
        status: 'cancelado',
        paymentStatus: 'CANCELLED',
        updatedAt: now,
        updatedBy: actorId,
      };
    });

    plan.linkage = {
      ...(plan.linkage || {}),
      financeEntryIds: {
        ...(plan.linkage?.financeEntryIds || {}),
        ...linkage,
      },
    };
  };

  const syncPlanFromFinanceEntries = (plan, financeRows = []) => {
    const clinicId = cleanText(plan?.clinicId || DEFAULT_CLINIC_ID);
    const scoped = financeRows.filter((entry) => isPlanFinanceEntry(entry, clinicId, plan?.planId));
    if (!Array.isArray(plan?.payment?.schedule)) return plan;

    const byParcelId = new Map();
    scoped.forEach((entry) => {
      const parcelId = cleanText(entry?.parcelId);
      if (parcelId) byParcelId.set(parcelId, entry);
    });

    const entryRef = byParcelId.get(ENTRY_PARCEL_ID);
    const currentEntry = normalizeEntry(plan?.payment?.entry || {});
    const syncedEntry = entryRef
      ? {
        value: roundMoney(Math.max(0, toNumber(entryRef.valor, currentEntry.value))),
        paidAt: entryRef.paidAt || currentEntry.paidAt || null,
        paymentMethod: normalizePaymentMethodUpper(entryRef.paymentMethod || entryRef.metodoPagamento || currentEntry.paymentMethod),
        financeEntryId: cleanText(entryRef.id || currentEntry.financeEntryId),
        status: normalizeFinancePaymentStatus(entryRef.paymentStatus || entryRef.status) === 'PAID' ? 'PAID' : 'PENDING',
        notes: cleanText(entryRef.notes || currentEntry.notes || ''),
      }
      : currentEntry;

    const nextSchedule = plan.payment.schedule.map((parcel) => {
      const normalized = normalizeParcel(parcel);
      const ref = byParcelId.get(cleanText(normalized.parcelId));
      if (!ref) return normalized;
      const paymentStatus = normalizeFinancePaymentStatus(ref.paymentStatus || ref.status);
      return {
        ...normalized,
        financeEntryId: cleanText(ref.id || normalized.financeEntryId),
        value: roundMoney(toNumber(ref.valor, normalized.value)),
        dueDate: toDateOnly(ref.dueDate || ref.vencimento || normalized.dueDate, normalized.dueDate),
        status: paymentStatus === 'PAID' ? 'PAID' : (paymentStatus === 'CANCELLED' ? 'CANCELLED' : 'PENDING'),
        paymentMethod: normalizePaymentMethodUpper(ref.paymentMethod || ref.metodoPagamento || normalized.paymentMethod),
        paidAt: paymentStatus === 'PAID' ? (ref.paidAt || normalized.paidAt || null) : null,
      };
    });

    const computed = computeRelease(plan, nextSchedule);
    const totalAfterEntry = Math.max(0, toNumber(plan.totalValue) - Math.min(toNumber(syncedEntry.value), toNumber(plan.totalValue)));
    return {
      ...plan,
      installmentsCount: Math.max(1, nextSchedule.length || toNumber(plan.installmentsCount, 1)),
      installmentValue: roundMoney(nextSchedule.length ? (totalAfterEntry / nextSchedule.length) : toNumber(plan.installmentValue)),
      paidInstallments: computed.paidCount,
      statusAtual: cleanText(plan.statusAtual).toUpperCase() === 'CANCELADO' ? 'CANCELADO' : computed.statusAtual,
      releasedAt: computed.releasedAt,
      payment: {
        ...(plan.payment || {}),
        schedule: nextSchedule,
        paidTotal: computed.paidTotal,
        pendingTotal: computed.pendingTotal,
        releasedAt: computed.releasedAt,
        releaseStatus: computed.releaseStatus,
        releaseRule: cleanText(plan.releaseRule).toUpperCase(),
        entry: syncedEntry,
      },
      linkage: {
        ...(plan.linkage || {}),
        financeEntryIds: nextSchedule.reduce((acc, parcel) => {
          if (parcel?.parcelId && parcel?.financeEntryId) acc[parcel.parcelId] = parcel.financeEntryId;
          return acc;
        }, { ...(plan.linkage?.financeEntryIds || {}), ...(syncedEntry.financeEntryId ? { [ENTRY_PARCEL_ID]: syncedEntry.financeEntryId } : {}) }),
      },
    };
  };

  const applyFilters = (list = [], filters = {}) => {
    const category = cleanText(filters.category || filters.categoria).toLowerCase();
    const status = cleanText(filters.status).toUpperCase();
    const search = cleanText(filters.search).toLowerCase();
    return list.filter((plan) => {
      if (plan.deletedAt) return false;
      if (category && cleanText(plan.category).toLowerCase() !== category) return false;
      if (status && cleanText(plan.statusAtual).toUpperCase() !== status) return false;
      if (search) {
        const haystack = [
          plan.title,
          plan.patientName,
          plan.prontuario,
          plan.patientId,
          plan.dentistName,
          plan.serviceLabel,
        ].map((v) => cleanText(v).toLowerCase()).join(' ');
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
  };

  const needsPlanFinanceSync = (plan, financeRows = []) => {
    const clinicId = cleanText(plan?.clinicId || DEFAULT_CLINIC_ID);
    const scoped = (Array.isArray(financeRows) ? financeRows : [])
      .filter((entry) => isPlanFinanceEntry(entry, clinicId, plan?.planId));
    const byParcelId = new Map();
    scoped.forEach((entry) => {
      const parcelId = cleanText(entry?.parcelId);
      if (parcelId) byParcelId.set(parcelId, entry);
    });

    const entryInfo = normalizeEntry(plan?.payment?.entry || {});
    const entryRow = byParcelId.get(ENTRY_PARCEL_ID);
    if (entryInfo.value > 0) {
      if (!entryRow) return true;
      const entryStatus = normalizeFinancePaymentStatus(entryRow.paymentStatus || entryRow.status);
      if (entryStatus !== 'PAID') return true;
    }

    const schedule = Array.isArray(plan?.payment?.schedule) ? plan.payment.schedule : [];
    for (let i = 0; i < schedule.length; i += 1) {
      const parcel = normalizeParcel(schedule[i]);
      const parcelId = cleanText(parcel.parcelId);
      if (!parcelId) return true;
      const ref = byParcelId.get(parcelId);
      if (!ref) return true;
      const financeStatus = normalizeFinancePaymentStatus(ref.paymentStatus || ref.status);
      const parcelStatus = cleanText(parcel.status).toUpperCase();
      if (parcelStatus === 'PAID' && financeStatus !== 'PAID') return true;
      if (parcelStatus === 'PENDING' && financeStatus === 'PAID') return true;
    }
    return false;
  };

  const rebuildScheduleForUpdate = (existingPlan, draftPlan) => {
    const existingSchedule = Array.isArray(existingPlan?.payment?.schedule)
      ? existingPlan.payment.schedule.map((parcel) => normalizeParcel(parcel))
      : [];
    if (!existingSchedule.length) {
      draftPlan.payment.schedule = ensureScheduleFromLegacy(draftPlan);
      return;
    }

    const paidParcels = existingSchedule
      .filter((parcel) => parcel.status === 'PAID')
      .sort((a, b) => a.number - b.number);
    const paidCount = paidParcels.length;
    if (draftPlan.installmentsCount < paidCount) {
      throw new Error('Nao e permitido reduzir parcelas abaixo da quantidade ja paga.');
    }

    const pendingTargetCount = Math.max(0, draftPlan.installmentsCount - paidCount);
    const paidTotal = roundMoney(paidParcels.reduce((acc, parcel) => acc + toNumber(parcel.value), 0));
    const entryValue = roundMoney(Math.max(0, toNumber(draftPlan?.payment?.entry?.value, 0)));
    const pendingTotal = roundMoney(Math.max(0, toNumber(draftPlan.totalValue) - entryValue - paidTotal));
    const pendingValues = distributeInstallments(pendingTotal, Math.max(1, pendingTargetCount || 1));
    const oldPending = existingSchedule
      .filter((parcel) => parcel.status !== 'PAID')
      .sort((a, b) => a.number - b.number);

    const startDate = toDateOnly(draftPlan.startDate, new Date().toISOString().slice(0, 10));
    const dueDay = Math.max(0, toNumber(draftPlan.dueDay, 0));
    const schedule = [];

    paidParcels.forEach((paid, index) => {
      schedule.push({
        ...paid,
        number: index + 1,
      });
    });

    for (let i = 0; i < pendingTargetCount; i += 1) {
      const old = oldPending[i];
      const number = paidCount + i + 1;
      schedule.push(normalizeParcel({
        parcelId: old?.parcelId || generateParcelId(),
        number,
        value: pendingValues[i] || 0,
        dueDate: old?.dueDate || addMonthsToDateOnly(startDate, number - 1, dueDay),
        status: 'PENDING',
        paymentMethod: old?.paymentMethod || 'OTHER',
        paidAt: null,
        financeEntryId: old?.financeEntryId || '',
      }));
    }

    draftPlan.payment.schedule = schedule;
  };

  const hydratePlansWithFinance = (plans, financeRows) =>
    plans.map((plan) => syncPlanFromFinanceEntries(plan, financeRows));

  const listPlans = async ({ clinicId, filters = {} } = {}) => {
    const tenantId = cleanText(clinicId) || getCurrentClinicId();
    let all = await readPlans();
    let scoped = all
      .filter((plan) => cleanText(plan.clinicId) === tenantId)
      .map((plan) => normalizePlan(plan, {
        clinicId: tenantId,
        existing: plan,
        nowAt: plan.updatedAt || nowIso(),
        actorId: plan.updatedBy || getActorId(),
      }));
    const financeRows = await readFinance();

    const actorId = getActorId() || 'system';
    const repaired = new Map();
    scoped.forEach((plan) => {
      if (plan?.deletedAt) return;
      if (!needsPlanFinanceSync(plan, financeRows)) return;
      const nowAt = nowIso();
      const draft = normalizePlan(plan, {
        clinicId: tenantId,
        existing: plan,
        nowAt,
        actorId,
      });
      upsertPlanFinanceEntries(draft, financeRows, actorId);
      const synced = syncPlanFromFinanceEntries(draft, financeRows);
      repaired.set(cleanText(synced.planId), synced);
    });

    if (repaired.size > 0) {
      all = all.map((plan) => {
        const sameTenant = cleanText(plan?.clinicId || DEFAULT_CLINIC_ID) === tenantId;
        const key = cleanText(plan?.planId);
        if (!sameTenant || plan?.deletedAt || !repaired.has(key)) return plan;
        return repaired.get(key);
      });
      await Promise.all([writePlans(all), writeFinance(financeRows)]);
      scoped = scoped.map((plan) => repaired.get(cleanText(plan.planId)) || plan);
    }

    const hydrated = hydratePlansWithFinance(scoped, financeRows);
    const filtered = applyFilters(hydrated, filters);
    return filtered.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  };

  const getPlanById = async ({ clinicId, planId } = {}) => {
    const tenantId = cleanText(clinicId) || getCurrentClinicId();
    const id = cleanText(planId);
    if (!id) throw new Error('planId obrigatorio.');
    const plans = await listPlans({ clinicId: tenantId });
    const found = plans.find((item) => cleanText(item.planId) === id && !item.deletedAt);
    if (!found) throw new Error('Plano nao encontrado.');
    return found;
  };

  const createPlan = async ({ clinicId, payload = {} } = {}) => {
    const tenantId = cleanText(clinicId) || getCurrentClinicId();
    const nowAt = nowIso();
    const actorId = getActorId();
    const draft = normalizePlan(payload, { clinicId: tenantId, nowAt, actorId });
    validatePlan(draft);

    const financeRows = await readFinance();
    upsertPlanFinanceEntries(draft, financeRows, actorId);
    const synced = syncPlanFromFinanceEntries(draft, financeRows);
    validatePlan(synced);

    const all = await readPlans();
    all.unshift(synced);
    await Promise.all([writePlans(all), writeFinance(financeRows)]);
    return synced;
  };

  const updatePlan = async ({ clinicId, planId, patch = {} } = {}) => {
    const tenantId = cleanText(clinicId) || getCurrentClinicId();
    const id = cleanText(planId || patch.planId);
    if (!id) throw new Error('planId obrigatorio.');

    const all = await readPlans();
    const idx = all.findIndex((item) => cleanText(item.planId) === id && cleanText(item.clinicId) === tenantId && !item.deletedAt);
    if (idx === -1) throw new Error('Plano nao encontrado.');

    const existing = normalizePlan(all[idx], {
      clinicId: tenantId,
      existing: all[idx],
      nowAt: all[idx].updatedAt || nowIso(),
      actorId: all[idx].updatedBy || getActorId(),
    });
    const nowAt = nowIso();
    const actorId = getActorId();
    const draft = normalizePlan({ ...existing, ...patch, planId: id }, {
      clinicId: tenantId,
      existing,
      nowAt,
      actorId,
    });

    rebuildScheduleForUpdate(existing, draft);
    validatePlan(draft);

    const financeRows = await readFinance();
    upsertPlanFinanceEntries(draft, financeRows, actorId);
    const synced = syncPlanFromFinanceEntries(draft, financeRows);
    validatePlan(synced);

    all[idx] = synced;
    await Promise.all([writePlans(all), writeFinance(financeRows)]);
    return synced;
  };

  const deletePlan = async ({ clinicId, planId } = {}) => {
    const tenantId = cleanText(clinicId) || getCurrentClinicId();
    const id = cleanText(planId);
    if (!id) throw new Error('planId obrigatorio.');
    const all = await readPlans();
    const idx = all.findIndex((item) => cleanText(item.planId) === id && cleanText(item.clinicId) === tenantId && !item.deletedAt);
    if (idx === -1) throw new Error('Plano nao encontrado.');
    const actorId = getActorId();
    const nowAt = nowIso();
    all[idx] = {
      ...all[idx],
      deletedAt: nowAt,
      updatedAt: nowAt,
      updatedBy: actorId,
      statusAtual: 'CANCELADO',
    };

    const financeRows = await readFinance();
    for (let i = 0; i < financeRows.length; i += 1) {
      const row = financeRows[i];
      if (!isPlanFinanceEntry(row, tenantId, id)) continue;
      financeRows[i] = {
        ...row,
        status: 'cancelado',
        paymentStatus: 'CANCELLED',
        updatedAt: nowAt,
        updatedBy: actorId,
      };
    }

    await Promise.all([writePlans(all), writeFinance(financeRows)]);
    return { success: true };
  };

  const getPlansDashboard = async ({ clinicId } = {}) => {
    const tenantId = cleanText(clinicId) || getCurrentClinicId();
    const plans = await listPlans({ clinicId: tenantId });
    const activePlans = plans.filter((plan) => ['ATIVO', 'EM_ANDAMENTO', 'LIBERADO'].includes(cleanText(plan.statusAtual).toUpperCase()));
    const liberados = plans.filter((plan) => cleanText(plan.statusAtual).toUpperCase() === 'LIBERADO').length;
    const totalValue = roundMoney(activePlans.reduce((acc, plan) => acc + toNumber(plan.totalValue), 0));
    const pendingInstallments = activePlans.reduce((acc, plan) => {
      const schedule = Array.isArray(plan?.payment?.schedule) ? plan.payment.schedule : [];
      return acc + schedule.filter((parcel) => cleanText(parcel.status).toUpperCase() === 'PENDING').length;
    }, 0);
    const pendenteTotal = roundMoney(activePlans.reduce((acc, plan) => acc + toNumber(plan?.payment?.pendingTotal, 0), 0));

    const today = new Date();
    const month = today.getMonth();
    const year = today.getFullYear();
    let recebidoMes = 0;
    let inadimplencia = 0;
    activePlans.forEach((plan) => {
      const schedule = Array.isArray(plan?.payment?.schedule) ? plan.payment.schedule : [];
      const entry = plan?.payment?.entry || {};
      if (toNumber(entry.value) > 0 && cleanText(entry.status).toUpperCase() === 'PAID' && entry.paidAt) {
        const paidAt = new Date(entry.paidAt);
        if (!Number.isNaN(paidAt.getTime()) && paidAt.getMonth() === month && paidAt.getFullYear() === year) {
          recebidoMes += toNumber(entry.value, 0);
        }
      }
      schedule.forEach((parcel) => {
        const status = cleanText(parcel.status).toUpperCase();
        if (status === 'PAID' && parcel.paidAt) {
          const paidAt = new Date(parcel.paidAt);
          if (!Number.isNaN(paidAt.getTime()) && paidAt.getMonth() === month && paidAt.getFullYear() === year) {
            recebidoMes += toNumber(parcel.value, 0);
          }
        }
        if (status === 'PENDING' && parcel.dueDate) {
          const due = new Date(`${parcel.dueDate}T23:59:59`);
          if (!Number.isNaN(due.getTime()) && due < today) inadimplencia += 1;
        }
      });
    });

    return {
      totalPlans: plans.length,
      ativos: activePlans.length,
      liberados,
      totalValue,
      totalEmPlanos: totalValue,
      pendingInstallments,
      pendenteTotal,
      recebidoMes: roundMoney(recebidoMes),
      inadimplencia,
      updatedAt: nowIso(),
    };
  };

  return {
    listPlans,
    getPlanById,
    createPlan,
    updatePlan,
    deletePlan,
    getPlansDashboard,
  };
};

module.exports = { createPlansService };
