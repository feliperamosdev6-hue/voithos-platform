const { AppError } = require('../errors/AppError');
const { financialRepository } = require('../repositories/financialRepository');
const { patientClinicalRepository } = require('../repositories/patientClinicalRepository');
const { planMessageService } = require('./planMessageService');
const { ensurePlanFinancialAccount, ensurePlanFinancialAccounts } = require('./planFinancialAccountSyncService');

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

const toDate = (value, fallback = null) => {
  if (!value) return fallback;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed;
};

const toDateOnly = (value, fallback = '') => {
  const parsed = toDate(value);
  if (!parsed) return fallback;
  return parsed.toISOString().slice(0, 10);
};

const cleanText = (value) => String(value || '').trim();
const PAYMENT_TRANSACTION_TYPES = new Set(['PAYMENT']);
const PAYMENT_METHOD_DETAILS = new Set(['PIX', 'CREDIT', 'DEBIT', 'CASH', 'BOLETO', 'TRANSFER', 'OTHER']);

const normalizeAccountStatus = (value) => {
  const raw = cleanText(value).toUpperCase();
  if (raw === 'PAID' || raw === 'PAGO') return 'PAID';
  if (raw === 'PARTIAL' || raw === 'PARCIAL') return 'PARTIAL';
  if (raw === 'CANCELED' || raw === 'CANCELADO' || raw === 'CANCELLED') return 'CANCELED';
  return 'OPEN';
};

const normalizeInstallmentStatus = (value) => {
  const raw = cleanText(value).toUpperCase();
  if (raw === 'PAID' || raw === 'PAGO') return 'PAID';
  if (raw === 'OVERDUE' || raw === 'ATRASADO') return 'OVERDUE';
  if (raw === 'CANCELED' || raw === 'CANCELADO' || raw === 'CANCELLED') return 'CANCELED';
  return 'PENDING';
};

const normalizeTransactionMethod = (value) => {
  const raw = cleanText(value).toUpperCase();
  if (raw === 'DINHEIRO') return 'CASH';
  if (raw === 'CARTAO' || raw === 'CREDIT' || raw === 'DEBIT' || raw === 'CARD' || raw === 'CARTAO_CREDITO' || raw === 'CARTAO_DEBITO') return 'CARD';
  if (raw === 'TRANSFERENCIA') return 'TRANSFER';
  if (raw === 'BOLETO') return 'BOLETO';
  if (raw === 'PIX') return 'PIX';
  if (raw === 'OUTRO') return 'OTHER';
  return raw || 'OTHER';
};

const normalizePaymentMethodDetail = (value, fallback = 'PIX') => {
  const raw = cleanText(value).toUpperCase();
  if (PAYMENT_METHOD_DETAILS.has(raw)) return raw;
  if (raw === 'CARTAO_CREDITO' || raw === 'CREDITO' || raw === 'CARTAO' || raw === 'CARD') return 'CREDIT';
  if (raw === 'CARTAO_DEBITO' || raw === 'DEBITO') return 'DEBIT';
  if (raw === 'DINHEIRO') return 'CASH';
  if (raw === 'TRANSFERENCIA') return 'TRANSFER';
  if (raw === 'OUTRO') return 'OTHER';
  const fallbackRaw = cleanText(fallback).toUpperCase();
  if (PAYMENT_METHOD_DETAILS.has(fallbackRaw)) return fallbackRaw;
  if (fallbackRaw === 'CARD' || fallbackRaw === 'CARTAO') return 'CREDIT';
  return 'PIX';
};

const normalizePlanStatus = (value) => {
  const raw = cleanText(value).toUpperCase();
  if (raw === 'ATIVO' || raw === 'ACTIVE') return 'ACTIVE';
  if (raw === 'EM_ANDAMENTO' || raw === 'IN_PROGRESS') return 'IN_PROGRESS';
  if (raw === 'LIBERADO' || raw === 'RELEASED') return 'RELEASED';
  if (raw === 'CANCELADO' || raw === 'CANCELED' || raw === 'CANCELLED') return 'CANCELED';
  return 'ACTIVE';
};

const accountStatusToLegacy = (status) => {
  if (status === 'PAID') return 'pago';
  if (status === 'PARTIAL') return 'parcial';
  if (status === 'CANCELED') return 'cancelado';
  return 'pendente';
};

const methodToLegacy = (method) => {
  if (method === 'CASH') return 'dinheiro';
  if (method === 'CREDIT') return 'cartao_credito';
  if (method === 'DEBIT') return 'cartao_debito';
  if (method === 'CARD') return 'cartao';
  if (method === 'TRANSFER') return 'transferencia';
  if (method === 'BOLETO') return 'boleto';
  if (method === 'PIX') return 'pix';
  return 'outro';
};

const addMonths = (baseDate, months, dueDay = 0) => {
  const seed = toDate(baseDate, new Date());
  const next = new Date(Date.UTC(seed.getUTCFullYear(), seed.getUTCMonth() + months, 1, 0, 0, 0, 0));
  const day = dueDay > 0 ? dueDay : seed.getUTCDate();
  next.setUTCDate(day);
  return next;
};

const distributeInstallments = (totalAmount, count, dueDate) => {
  const installmentsCount = Math.max(1, Number(count) || 1);
  const totalCents = Math.round(roundMoney(totalAmount) * 100);
  const baseCents = Math.floor(totalCents / installmentsCount);
  let remainder = totalCents - (baseCents * installmentsCount);
  return Array.from({ length: installmentsCount }, (_, index) => {
    const cents = baseCents + (remainder > 0 ? 1 : 0);
    remainder = Math.max(0, remainder - 1);
    return {
      sequence: index + 1,
      amount: cents / 100,
      dueDate: addMonths(dueDate || new Date(), index),
      status: 'PENDING',
      paidAt: null,
    };
  });
};

const buildInstallmentsFromPayload = (payload = {}, accountTotal = 0) => {
  if (Array.isArray(payload.installments) && payload.installments.length) {
    return payload.installments.map((item, index) => ({
      sequence: Math.max(1, Number(item.sequence || item.numero || index + 1) || index + 1),
      dueDate: toDate(item.dueDate || item.vencimento || payload.dueDate || payload.data || new Date(), new Date()),
      amount: roundMoney(item.amount ?? item.valor ?? 0),
      status: normalizeInstallmentStatus(item.status),
      paidAt: toDate(item.paidAt, null),
    }));
  }

  const installmentsCount = Math.max(1, Number(payload.installmentsCount ?? payload.parcelas ?? payload.installmentsTotal ?? 1) || 1);
  return distributeInstallments(accountTotal, installmentsCount, payload.dueDate || payload.vencimento || payload.data || new Date());
};

const ensureClinicPatient = async ({ clinicId, patientId }) => {
  const patient = await financialRepository.findPatientByIdAndClinic({ clinicId, patientId });
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient not found for this clinic.');
  return patient;
};

const clearProcedureFinancialSnapshot = async ({ clinicId, account = null } = {}) => {
  const patientProcedureId = cleanText(account?.patientProcedureId);
  if (!patientProcedureId) return;

  const procedure = await financialRepository.findPatientProcedureByIdAndClinic({
    clinicId,
    patientProcedureId,
  });
  if (!procedure) return;

  const payload = procedure.payload && typeof procedure.payload === 'object' ? procedure.payload : {};
  await patientClinicalRepository.updateProcedure({
    id: procedure.id,
    clinicId,
    patientId: procedure.patientId,
    data: {
      financialSnapshot: null,
      payload: {
        ...payload,
        financeiro: null,
        paymentStatus: '',
        paymentMethod: '',
        metodoPagamento: '',
        vencimento: '',
      },
    },
  });
};

const sanitizeTenantMetadata = (value = {}) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const {
    clinicId: _clinicId,
    patientId: _patientId,
    planId: _planId,
    ...rest
  } = value;
  return rest;
};

const resolveProcedureLink = async ({ clinicId, patientId, procedureId }) => {
  const normalized = cleanText(procedureId);
  if (!normalized) return null;
  const byExternalId = await financialRepository.findPatientProcedureByExternalId({
    clinicId,
    patientId,
    externalId: normalized,
  });
  if (byExternalId) return byExternalId;
  return financialRepository.findPatientProcedureByIdAndClinic({
    clinicId,
    patientProcedureId: normalized,
  });
};

const sumTransactionAmount = (transactions = [], predicate = () => true) => roundMoney(transactions
  .filter((item) => PAYMENT_TRANSACTION_TYPES.has(item.type) && predicate(item))
  .reduce((acc, item) => acc + roundMoney(item.amount), 0));

const deriveInstallmentSnapshot = (row = {}, transactions = []) => {
  const dueDate = toDateOnly(row.dueDate);
  const due = dueDate ? new Date(`${dueDate}T23:59:59.999Z`) : null;
  const now = new Date();
  const amount = roundMoney(row.amount);
  const paidAmount = sumTransactionAmount(transactions, (item) => item.installmentId === row.id);
  const remainingAmount = roundMoney(Math.max(0, amount - paidAmount));

  let derivedStatus = row.status;
  if (row.status === 'CANCELED') {
    derivedStatus = 'CANCELED';
  } else if (remainingAmount <= 0 && amount > 0) {
    derivedStatus = 'PAID';
  } else if (paidAmount > 0) {
    derivedStatus = due && due < now ? 'OVERDUE' : 'PARTIAL';
  } else if (row.status === 'PENDING' && due && due < now) {
    derivedStatus = 'OVERDUE';
  } else {
    derivedStatus = row.status || 'PENDING';
  }

  return {
    id: row.id,
    sequence: row.sequence,
    dueDate,
    amount,
    paidAmount,
    remainingAmount,
    status: derivedStatus,
    paidAt: remainingAmount <= 0 && row.paidAt ? row.paidAt.toISOString() : (remainingAmount <= 0 ? new Date().toISOString() : null),
  };
};

const mapTransaction = (row = {}) => ({
  id: row.id,
  accountId: row.accountId,
  installmentId: row.installmentId || '',
  type: row.type,
  amount: Number(row.amount || 0),
  method: row.method,
  createdAt: row.createdAt ? row.createdAt.toISOString() : null,
  metadata: row.metadata || null,
});

const mapAccountToLegacy = (row = {}) => {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const transactions = Array.isArray(row.transactions) ? row.transactions.map(mapTransaction) : [];
  const installments = Array.isArray(row.installments)
    ? row.installments.map((item) => deriveInstallmentSnapshot(item, row.transactions || []))
    : [];
  const paidAmount = sumTransactionAmount(row.transactions || []);
  const remainingAmount = roundMoney(Math.max(0, roundMoney(row.totalAmount || 0) - paidAmount));
  const paymentStatus = summarizeAccountStatus({
    installments,
    transactions,
    totalAmount: row.totalAmount,
    rowStatus: row.status,
  });
  const firstDueDate = installments[0]?.dueDate || toDateOnly(row.dueDate);
  const paymentMethodDetail = normalizePaymentMethodDetail(
    metadata.paymentMethodDetail || row.paymentMethodDetail || metadata.entryPaymentMethod || row.paymentMethod || row.metodoPagamento || '',
    row.paymentMethodDetail || row.paymentMethod || metadata.paymentMethodDetail || metadata.entryPaymentMethod || 'PIX',
  );
  return {
    id: row.id,
    clinicId: row.clinicId,
    patientId: row.patientId,
    appointmentId: row.appointmentId || '',
    patientProcedureId: row.patientProcedureId || '',
    procedureId: cleanText(metadata.procedureId || row.externalReference || ''),
    servicoId: cleanText(metadata.procedureId || row.externalReference || ''),
    prontuario: cleanText(metadata.prontuario || row.patientId),
    paciente: cleanText(metadata.patientName || ''),
    procedimento: cleanText(metadata.procedureName || ''),
    funcionario: cleanText(metadata.funcionario || metadata.dentistName || ''),
    dentistaId: cleanText(metadata.dentistId || ''),
    dentistaNome: cleanText(metadata.dentistName || metadata.funcionario || ''),
    descricao: row.description,
    valor: Number(row.totalAmount || 0),
    totalAmount: Number(row.totalAmount || 0),
    data: cleanText(metadata.data || firstDueDate || toDateOnly(row.createdAt)),
    dueDate: firstDueDate || null,
    vencimento: firstDueDate || null,
    categoria: cleanText(row.category || metadata.category || 'outros'),
    origem: cleanText(row.source || metadata.origin || 'financeiro'),
    tipo: cleanText(metadata.type || 'receita'),
    status: accountStatusToLegacy(paymentStatus),
    paymentStatus,
    metodoPagamento: methodToLegacy(paymentMethodDetail),
    paymentMethod: paymentMethodDetail,
    paymentMethodDetail,
    paidAt: installments.find((item) => item.status === 'PAID')?.paidAt || null,
    paidAmount,
    remainingAmount,
    installments,
    installmentsCount: installments.length || 1,
    transactions,
    externalReference: row.externalReference || '',
    metadata,
    createdAt: row.createdAt ? row.createdAt.toISOString() : null,
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
  };
};

const summarizeAccountStatus = ({ installments = [], transactions = [], totalAmount = 0, rowStatus = '' } = {}) => {
  if (!installments.length && roundMoney(totalAmount) <= 0) return normalizeAccountStatus(rowStatus || 'OPEN');
  const activeInstallments = installments.filter((item) => item.status !== 'CANCELED');
  const activeAmount = roundMoney(activeInstallments.reduce((acc, item) => acc + roundMoney(item.amount), 0));
  const referenceAmount = activeAmount > 0 ? activeAmount : roundMoney(totalAmount);
  const paidAmount = sumTransactionAmount(transactions);
  const canceled = installments.length > 0 && activeInstallments.length === 0;
  if (canceled) return 'CANCELED';
  if (referenceAmount > 0 && paidAmount >= referenceAmount) return 'PAID';
  if (paidAmount > 0) return 'PARTIAL';
  return 'OPEN';
};

const filterAccountsByMonthYear = (accounts = [], month, year) => {
  const targetMonth = Number(month);
  const targetYear = Number(year);
  return accounts.filter((item) => {
    const ref = toDate(item.data || item.createdAt, null);
    return ref && ref.getUTCFullYear() === targetYear && (ref.getUTCMonth() + 1) === targetMonth;
  });
};

const sumInstallmentsRemainingByStatuses = (accounts = [], statuses = []) => accounts
  .flatMap((item) => Array.isArray(item.installments) ? item.installments : [])
  .filter((parcel) => statuses.includes(parcel.status))
  .reduce((acc, parcel) => acc + roundMoney(parcel.remainingAmount ?? parcel.amount), 0);

const isInstallmentCollectible = (installment = {}) => {
  const status = cleanText(installment.status).toUpperCase();
  const remainingAmount = roundMoney(installment.remainingAmount ?? installment.amount);
  return remainingAmount > 0 && status !== 'PAID' && status !== 'CANCELED';
};

const differenceInCalendarDaysUtc = (a, b) => {
  const left = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const right = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((left - right) / 86400000);
};

const earliestCollectibleDueDate = (account = {}) => {
  const dueDates = (account.installments || [])
    .filter(isInstallmentCollectible)
    .map((installment) => cleanText(installment.dueDate))
    .filter(Boolean)
    .sort();
  return dueDates[0] || null;
};

const buildReminderGroup = (items = []) => ({
  count: items.length,
  totalAmount: roundMoney(items.reduce((acc, item) => acc + roundMoney(item.remainingAmount || 0), 0)),
  items: items.slice(0, 5),
});

const buildReminderItem = ({ account = {}, installment = null, type = '' } = {}) => {
  const metadata = account?.metadata && typeof account.metadata === 'object' ? account.metadata : {};
  const remainingAmount = roundMoney(
    installment?.remainingAmount
      ?? account?.remainingAmount
      ?? installment?.amount
      ?? account?.valor
      ?? 0,
  );

  return {
    type,
    accountId: account?.id || '',
    patientId: account?.patientId || '',
    patientName: cleanText(account?.paciente || metadata.patientName || ''),
    description: cleanText(account?.descricao || ''),
    dueDate: cleanText(installment?.dueDate || earliestCollectibleDueDate(account) || ''),
    remainingAmount,
    status: cleanText(installment?.status || account?.paymentStatus || account?.status || ''),
    planId: cleanText(metadata.planId || metadata.patientPlanId || ''),
    externalReference: cleanText(account?.externalReference || ''),
  };
};

const buildFinancialReport = ({ clinicId, month, year, accounts = [] }) => {
  const filtered = filterAccountsByMonthYear(accounts, month, year);
  const entradas = filtered.filter((item) => String(item.tipo || '').toLowerCase() === 'receita');
  const saidas = filtered.filter((item) => String(item.tipo || '').toLowerCase() !== 'receita');
  const totalEntradas = roundMoney(entradas.reduce((acc, item) => acc + roundMoney(item.valor), 0));
  const totalSaidas = roundMoney(saidas.reduce((acc, item) => acc + roundMoney(item.valor), 0));
  const totalReceived = roundMoney(entradas.reduce((acc, item) => acc + roundMoney(item.paidAmount || 0), 0));
  const totalPending = roundMoney(sumPendingEntriesByPredicate(filtered, (entry) => isEntryPendingLike(entry)));
  const totalOverdue = roundMoney(sumPendingEntriesByPredicate(filtered, (entry) => isEntryOverdueLike(entry)));
  return {
    clinicId: cleanText(clinicId),
    mes: Number(month),
    ano: Number(year),
    entradas,
    saidas,
    totalEntradas,
    totalSaidas,
    totalReceived,
    totalPending,
    totalOverdue,
    saldo: roundMoney(totalReceived - totalSaidas),
  };
};

const normalizePlanDueDay = (value) => {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.max(1, Math.min(28, Math.round(parsed)));
};

const resolvePlanDueDate = (payload = {}, fallback = new Date()) => {
  const direct = toDate(payload.firstDueDate || payload.dueDate || payload.vencimento || payload.data, null);
  if (direct) return direct;
  const base = toDate(payload.startDate, fallback || new Date()) || new Date();
  const dueDay = normalizePlanDueDay(payload.dueDay);
  if (!dueDay) return base;
  const candidate = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), dueDay, 0, 0, 0, 0));
  const baseDay = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate());
  if (candidate.getTime() >= baseDay) return candidate;
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, dueDay, 0, 0, 0, 0));
};

const extractPlanMetadata = (planRow = {}) => (
  planRow?.metadata && typeof planRow.metadata === 'object' ? planRow.metadata : {}
);

const extractPlanIdFromAccountRow = (accountRow = {}) => {
  const metadata = accountRow?.metadata && typeof accountRow.metadata === 'object' ? accountRow.metadata : {};
  const fromMetadata = cleanText(metadata.planId || metadata.patientPlanId || '');
  if (fromMetadata) return fromMetadata;
  const externalReference = cleanText(accountRow?.externalReference || '');
  if (externalReference.toLowerCase().startsWith('plan:')) {
    return cleanText(externalReference.slice(5));
  }
  return '';
};

const mapPlanScheduleFromAccount = (accountRow = null) => {
  if (!accountRow) return [];
  const legacyAccount = mapAccountToLegacy(accountRow);
  return (legacyAccount.installments || []).map((item, index) => ({
    parcelId: cleanText(item.id),
    number: Math.max(1, Number(item.sequence || index + 1) || index + 1),
    value: roundMoney(item.amount ?? 0),
    dueDate: cleanText(item.dueDate || ''),
    status: normalizeInstallmentStatus(item.status),
    paidAt: item.paidAt || null,
    paymentMethod: cleanText(legacyAccount.paymentMethod || ''),
    financeEntryId: cleanText(legacyAccount.id || ''),
    remainingAmount: roundMoney(item.remainingAmount ?? item.amount ?? 0),
    paidAmount: roundMoney(item.paidAmount ?? 0),
  }));
};

const mapPlanScheduleFromMetadata = (metadata = {}, fallbackFinanceEntryId = '', fallbackPaymentMethod = '') => {
  const source = Array.isArray(metadata.schedule) ? metadata.schedule : [];
  return source.map((item, index) => ({
    parcelId: cleanText(item.parcelId || item.id || item.installmentId || `parcel-${index + 1}`),
    number: Math.max(1, Number(item.number || item.sequence || index + 1) || index + 1),
    value: roundMoney(item.value ?? item.amount ?? item.valor ?? 0),
    dueDate: cleanText(item.dueDate || item.vencimento || ''),
    status: normalizeInstallmentStatus(item.status),
    paidAt: item.paidAt || null,
    paymentMethod: cleanText(item.paymentMethod || fallbackPaymentMethod || ''),
    financeEntryId: cleanText(item.financeEntryId || fallbackFinanceEntryId || ''),
    remainingAmount: roundMoney(item.remainingAmount ?? item.value ?? item.amount ?? item.valor ?? 0),
    paidAmount: roundMoney(item.paidAmount ?? 0),
  }));
};

const computePlanReleaseState = ({ planRow = {}, schedule = [], entryValue = 0, existingStatusAtual = '' } = {}) => {
  const totalValue = roundMoney(planRow.totalValue || 0);
  const paidFromSchedule = roundMoney(
    schedule
      .filter((parcel) => normalizeInstallmentStatus(parcel.status) === 'PAID')
      .reduce((acc, parcel) => acc + roundMoney(parcel.value), 0),
  );
  const paidFromEntry = roundMoney(Math.max(0, entryValue));
  const paidTotal = roundMoney(paidFromSchedule + paidFromEntry);
  const pendingTotal = roundMoney(Math.max(0, totalValue - paidTotal));
  const paidCount = schedule.filter((parcel) => normalizeInstallmentStatus(parcel.status) === 'PAID').length;
  const percentPaid = totalValue > 0 ? (paidTotal / totalValue) : 0;
  const releaseRule = cleanText(planRow.releaseRule).toUpperCase() || 'FULL';

  let isReleased = false;
  if (releaseRule === 'FIRST_PAYMENT') isReleased = paidTotal > 0;
  else if (releaseRule === 'PERCENT_50') isReleased = percentPaid >= 0.5;
  else isReleased = percentPaid >= 1;

  const releaseStatus = isReleased
    ? 'LIBERADO'
    : (paidTotal > 0 ? 'PARCIAL' : 'NAO_LIBERADO');

  const currentStatus = cleanText(existingStatusAtual).toUpperCase();
  let statusAtual = currentStatus;
  if (currentStatus !== 'CANCELADO') {
    if (releaseStatus === 'LIBERADO') statusAtual = 'LIBERADO';
    else if (paidTotal > 0) statusAtual = 'EM_ANDAMENTO';
    else statusAtual = 'ATIVO';
  }

  return {
    paidTotal,
    pendingTotal,
    paidCount,
    releaseStatus,
    statusAtual,
    releasedAt: isReleased ? (planRow?.releasedAt || new Date().toISOString()) : null,
  };
};

const buildLegacyPlan = ({ planRow = {}, accountRow = null } = {}) => {
  const metadata = extractPlanMetadata(planRow);
  const scheduleFromAccount = mapPlanScheduleFromAccount(accountRow);
  const scheduleFromMetadata = mapPlanScheduleFromMetadata(
    metadata,
    cleanText(accountRow?.id || ''),
    cleanText(accountRow?.paymentMethod || metadata.entryPaymentMethod || ''),
  );
  const schedule = scheduleFromAccount.length ? scheduleFromAccount : scheduleFromMetadata;
  const entryValue = roundMoney(planRow.entryAmount ?? metadata.entryAmount ?? metadata.entryValue ?? metadata.valorEntrada ?? 0);
  const release = computePlanReleaseState({
    planRow,
    schedule,
    entryValue,
    existingStatusAtual: metadata.statusAtual || planRow.status,
  });
  const installmentsCount = Math.max(1, Number(planRow.installments || metadata.installmentsCount || schedule.length || 1) || 1);
  const scheduleTotal = roundMoney(schedule.reduce((acc, item) => acc + roundMoney(item.value), 0));
  const installmentValue = roundMoney(
    schedule.length
      ? (scheduleTotal / Math.max(1, schedule.length))
      : (Math.max(0, roundMoney(planRow.totalValue || 0) - entryValue) / installmentsCount),
  );

  return {
    id: cleanText(planRow.id),
    planId: cleanText(planRow.id),
    clinicId: cleanText(planRow.clinicId),
    patientId: cleanText(planRow.patientId),
    prontuario: cleanText(metadata.prontuario || planRow?.patient?.id || planRow.patientId),
    patientName: cleanText(metadata.patientName || planRow?.patient?.nome || ''),
    dentistName: cleanText(metadata.dentistName || metadata.funcionario || ''),
    title: cleanText(planRow.name),
    name: cleanText(planRow.name),
    category: cleanText(metadata.category || ''),
    description: cleanText(metadata.description || ''),
    serviceLabel: cleanText(metadata.serviceLabel || metadata.procedureName || ''),
    notes: cleanText(metadata.notes || ''),
    totalValue: roundMoney(planRow.totalValue || 0),
    installmentsCount,
    installmentValue,
    paidInstallments: release.paidCount,
    minInstallmentsRelease: Math.max(1, Number(metadata.minInstallmentsRelease || 1) || 1),
    releaseRule: cleanText(planRow.releaseRule || metadata.releaseRule || 'FULL').toUpperCase(),
    statusAtual: release.statusAtual,
    startDate: cleanText(metadata.startDate || ''),
    dueDay: normalizePlanDueDay(metadata.dueDay),
    linkedServiceIds: Array.isArray(metadata.linkedServiceIds) ? metadata.linkedServiceIds.map((item) => cleanText(item)).filter(Boolean) : [],
    createdAt: planRow.createdAt ? planRow.createdAt.toISOString() : null,
    updatedAt: planRow.updatedAt ? planRow.updatedAt.toISOString() : null,
    releasedAt: release.releasedAt,
    payment: {
      entry: {
        value: entryValue,
        paidAt: cleanText(metadata.entryPaidAt || '') || null,
        paymentMethod: cleanText(metadata.entryPaymentMethod || 'PIX').toUpperCase() || 'PIX',
        status: entryValue > 0 ? 'PAID' : 'PENDING',
        financeEntryId: cleanText(metadata.entryFinanceEntryId || ''),
      },
      schedule,
      paidTotal: release.paidTotal,
      pendingTotal: release.pendingTotal,
      releaseStatus: release.releaseStatus,
      releaseRule: cleanText(planRow.releaseRule || metadata.releaseRule || 'FULL').toUpperCase(),
    },
  };
};

const buildPlanAccountMap = (accounts = []) => {
  const byPlanId = new Map();
  accounts.forEach((accountRow) => {
    const planId = extractPlanIdFromAccountRow(accountRow);
    if (planId && !byPlanId.has(planId)) {
      byPlanId.set(planId, accountRow);
    }
  });
  return byPlanId;
};

const normalizeLedgerFinancialState = (value) => {
  const raw = cleanText(value).toUpperCase();
  if (raw === 'PAID' || raw === 'PAGO') return 'PAID';
  if (raw === 'CANCELED' || raw === 'CANCELADO' || raw === 'CANCELLED') return 'CANCELED';
  if (raw === 'OVERDUE' || raw === 'ATRASADO') return 'OVERDUE';
  if (raw === 'PARTIAL' || raw === 'PARCIAL' || raw === 'OPEN' || raw === 'PENDING' || raw === 'PENDENTE') return 'PENDING';
  return '';
};

const isPlanFinancialAccount = (row = {}) => Boolean(
  extractPlanIdFromAccountRow(row)
  || cleanText(row?.source).toLowerCase() === 'plano'
  || cleanText(row?.category).toLowerCase() === 'planos'
);

const isCanceledFinancialAccount = (row = {}) => cleanText(row?.status).toUpperCase() === 'CANCELED';

const isProcedureFinancialAccount = (row = {}) => {
  const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return cleanText(row?.source || metadata?.origin).toLowerCase() === 'procedimento'
    || cleanText(row?.category || metadata?.category).toLowerCase() === 'procedimentos'
    || Boolean(cleanText(row?.patientProcedureId || metadata?.patientProcedureId || metadata?.procedureId));
};

const buildFinancialAccountDedupKey = (row = {}) => {
  if (!isProcedureFinancialAccount(row)) return '';
  const externalReference = cleanText(row?.externalReference);
  if (externalReference) return `procedure:ref:${externalReference}`;
  const procedureId = cleanText(row?.patientProcedureId);
  if (procedureId) return `procedure:id:${procedureId}`;
  return '';
};

const dedupeFinancialAccountRows = (rows = []) => {
  const preferredByKey = new Map();

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const dedupKey = buildFinancialAccountDedupKey(row);
    if (!dedupKey) return;
    const current = preferredByKey.get(dedupKey);
    if (!current) {
      preferredByKey.set(dedupKey, row);
      return;
    }
    if (isCanceledFinancialAccount(current) && !isCanceledFinancialAccount(row)) {
      preferredByKey.set(dedupKey, row);
    }
  });

  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const dedupKey = buildFinancialAccountDedupKey(row);
    if (!dedupKey) return true;
    return preferredByKey.get(dedupKey)?.id === row.id;
  });
};

const cleanPlanLedgerTitle = (value) => cleanText(value).replace(/^plano:\s*/i, '').trim() || 'Plano odontologico';

const buildPlanLedgerEntries = (accountRow = {}) => {
  const legacyAccount = mapAccountToLegacy(accountRow);
  const metadata = accountRow?.metadata && typeof accountRow.metadata === 'object' ? accountRow.metadata : {};
  const accountId = cleanText(accountRow?.id);
  const planId = extractPlanIdFromAccountRow(accountRow);
  const planTitle = cleanPlanLedgerTitle(accountRow?.description || metadata?.planName || metadata?.title || '');
  const patientName = cleanText(legacyAccount?.paciente || metadata?.patientName || '');
  const prontuario = cleanText(legacyAccount?.prontuario || metadata?.prontuario || accountRow?.patientId || '');
  const paymentMethod = cleanText(
    legacyAccount?.paymentMethod
    || legacyAccount?.paymentMethodDetail
    || metadata?.entryPaymentMethod
    || accountRow?.paymentMethod
    || '',
  );
  const metodoPagamento = methodToLegacy(paymentMethod);
  const baseEntry = {
    clinicId: cleanText(accountRow?.clinicId),
    patientId: cleanText(accountRow?.patientId),
    appointmentId: cleanText(accountRow?.appointmentId || ''),
    patientProcedureId: cleanText(accountRow?.patientProcedureId || ''),
    procedureId: '',
    servicoId: '',
    prontuario,
    paciente: patientName,
    procedimento: planTitle,
    funcionario: cleanText(metadata?.funcionario || metadata?.dentistName || ''),
    dentistaId: cleanText(metadata?.dentistId || ''),
    dentistaNome: cleanText(metadata?.dentistName || metadata?.funcionario || ''),
    categoria: cleanText(accountRow?.category || metadata?.category || 'planos'),
    origem: cleanText(accountRow?.source || metadata?.origin || 'plano'),
    tipo: 'receita',
    planId,
    accountId,
    financeEntryId: accountId,
    externalReference: cleanText(accountRow?.externalReference || ''),
    metadata,
    createdAt: accountRow?.createdAt ? accountRow.createdAt.toISOString() : null,
    updatedAt: accountRow?.updatedAt ? accountRow.updatedAt.toISOString() : null,
  };

  const installmentEntries = (legacyAccount.installments || []).map((installment) => {
    const normalizedState = normalizeLedgerFinancialState(installment?.status);
    const remainingAmount = roundMoney(installment?.remainingAmount ?? installment?.amount ?? 0);
    const paidAmount = roundMoney(installment?.paidAmount ?? 0);
    return {
      ...baseEntry,
      id: accountId,
      installmentId: cleanText(installment?.id),
      parcelId: cleanText(installment?.id),
      parcelNumber: Number(installment?.sequence || 0) || null,
      descricao: `[Plano] ${planTitle} - Parcela ${Number(installment?.sequence || 0) || 1}/${legacyAccount.installmentsCount || 1}`,
      valor: roundMoney(installment?.amount ?? 0),
      totalAmount: roundMoney(installment?.amount ?? 0),
      data: cleanText(installment?.dueDate || ''),
      dueDate: cleanText(installment?.dueDate || '') || null,
      vencimento: cleanText(installment?.dueDate || '') || null,
      status: accountStatusToLegacy(normalizedState || 'PENDING'),
      paymentStatus: normalizedState === 'PAID' ? 'PAID' : (normalizedState === 'CANCELED' ? 'CANCELED' : 'PENDING'),
      metodoPagamento,
      paymentMethod: paymentMethod || '',
      paidAt: installment?.paidAt || null,
      paidAmount,
      remainingAmount,
      installments: [],
      installmentsCount: legacyAccount.installmentsCount || 1,
      transactions: [],
    };
  });

  const entryValue = roundMoney(legacyAccount?.metadata?.entryAmount ?? legacyAccount?.payment?.entry?.value ?? 0);
  const entryPaidAt = cleanText(legacyAccount?.metadata?.entryPaidAt || legacyAccount?.payment?.entry?.paidAt || '');
  const entryPaymentMethod = cleanText(legacyAccount?.metadata?.entryPaymentMethod || legacyAccount?.payment?.entry?.paymentMethod || paymentMethod);
  const entryState = normalizeLedgerFinancialState(legacyAccount?.payment?.entry?.status || (entryPaidAt ? 'PAID' : 'PENDING'));
  const entryReferenceDate = entryPaidAt
    || cleanText(metadata?.startDate || '')
    || (accountRow?.createdAt ? toDateOnly(accountRow.createdAt) : '');
  const entryRow = entryValue > 0 ? [{
    ...baseEntry,
    id: accountId,
    installmentId: '',
    parcelId: 'entry',
    parcelNumber: 0,
    descricao: `[Plano] ${planTitle} - Entrada`,
    valor: entryValue,
    totalAmount: entryValue,
    data: entryReferenceDate,
    dueDate: entryReferenceDate || null,
    vencimento: entryReferenceDate || null,
    status: accountStatusToLegacy(entryState || 'PENDING'),
    paymentStatus: entryState === 'PAID' ? 'PAID' : 'PENDING',
    metodoPagamento: methodToLegacy(entryPaymentMethod),
    paymentMethod: entryPaymentMethod || '',
    paidAt: entryPaidAt || null,
    paidAmount: entryState === 'PAID' ? entryValue : 0,
    remainingAmount: entryState === 'PAID' ? 0 : entryValue,
    installments: [],
    installmentsCount: 1,
    transactions: [],
  }] : [];

  return [...installmentEntries, ...entryRow];
};

const hydratePlanFinancialRows = async ({ clinicId, patientId, rows = [] } = {}) => {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const missingPlanIds = Array.from(new Set(
    sourceRows
      .filter((row) => isPlanFinancialAccount(row))
      .map((row) => {
        const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
        const hasEntryInfo = metadata.entryAmount !== undefined
          || metadata.entryValue !== undefined
          || metadata.entryPaidAt !== undefined
          || metadata.entryPaymentMethod !== undefined;
        if (hasEntryInfo) return '';
        return extractPlanIdFromAccountRow(row);
      })
      .filter(Boolean),
  ));

  if (!missingPlanIds.length) return sourceRows;

  const planRows = patientId
    ? await financialRepository.listPatientPlansByPatient({
      clinicId: cleanText(clinicId),
      patientId: cleanText(patientId),
    })
    : await financialRepository.listPatientPlansByClinic({ clinicId: cleanText(clinicId) });

  const plansById = new Map(
    (Array.isArray(planRows) ? planRows : [])
      .map((row) => [cleanText(row?.id), row])
      .filter(([id]) => Boolean(id)),
  );

  return sourceRows.map((row) => {
    if (!isPlanFinancialAccount(row)) return row;
    const planId = extractPlanIdFromAccountRow(row);
    if (!planId || !missingPlanIds.includes(planId)) return row;
    const planRow = plansById.get(planId);
    if (!planRow) return row;
    const existingMetadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const planMetadata = extractPlanMetadata(planRow);
    const resolvedEntryAmount = existingMetadata.entryAmount ?? existingMetadata.entryValue ?? planRow.entryAmount ?? planMetadata.entryAmount ?? planMetadata.entryValue ?? 0;
    const resolvedEntryPaidAt = existingMetadata.entryPaidAt ?? planMetadata.entryPaidAt ?? null;
    const resolvedEntryPaymentMethod = existingMetadata.entryPaymentMethod ?? planMetadata.entryPaymentMethod ?? 'PIX';
    return {
      ...row,
      metadata: {
        ...existingMetadata,
        planName: cleanText(existingMetadata.planName || planRow.name || ''),
        startDate: cleanText(existingMetadata.startDate || planMetadata.startDate || ''),
        entryAmount: resolvedEntryAmount,
        entryValue: resolvedEntryAmount,
        entryPaidAt: resolvedEntryPaidAt,
        entryPaymentMethod: resolvedEntryPaymentMethod,
      },
    };
  });
};

const loadFinancialAccountRows = async ({ clinicId, patientId } = {}) => {
  const normalizedClinicId = cleanText(clinicId);
  if (!normalizedClinicId) throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
  const rows = patientId
    ? financialRepository.listFinancialAccountsByPatient({ clinicId: normalizedClinicId, patientId: cleanText(patientId) })
    : financialRepository.listFinancialAccountsByClinic({ clinicId: normalizedClinicId });
  const hydratedRows = await hydratePlanFinancialRows({
    clinicId: normalizedClinicId,
    patientId: cleanText(patientId),
    rows: await rows,
  });
  return dedupeFinancialAccountRows(hydratedRows);
};

const listFinancialAccountSnapshots = async ({ clinicId, patientId } = {}) => {
  const rows = await loadFinancialAccountRows({ clinicId, patientId });
  return rows.map(mapAccountToLegacy);
};

const listFinancialLedgerEntries = async ({ clinicId, patientId } = {}) => {
  const rows = await loadFinancialAccountRows({ clinicId, patientId });
  return rows.flatMap((row) => (isPlanFinancialAccount(row) ? buildPlanLedgerEntries(row) : [mapAccountToLegacy(row)]));
};

const getEntryRemainingAmount = (entry = {}) => {
  if (Array.isArray(entry.installments) && entry.installments.length) {
    return roundMoney(
      entry.installments.reduce((acc, parcel) => acc + roundMoney(parcel.remainingAmount ?? parcel.amount ?? 0), 0),
    );
  }
  return roundMoney(entry.remainingAmount ?? entry.valor ?? entry.totalAmount ?? 0);
};

const isEntryPendingLike = (entry = {}) => {
  const state = normalizeLedgerFinancialState(entry?.paymentStatus || entry?.status);
  return state === 'PENDING' || state === 'OVERDUE';
};

const isEntryOverdueLike = (entry = {}) => {
  const state = normalizeLedgerFinancialState(entry?.paymentStatus || entry?.status);
  if (state === 'OVERDUE') return true;
  if (state !== 'PENDING') return false;
  const due = toDate(entry?.dueDate || entry?.vencimento || entry?.data, null);
  if (!due) return false;
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return due < startOfToday;
};

const sumPendingEntriesByPredicate = (entries = [], predicate = () => true) => entries
  .filter((entry) => String(entry?.tipo || '').toLowerCase() === 'receita')
  .reduce((acc, entry) => {
    if (Array.isArray(entry.installments) && entry.installments.length) {
      const subtotal = entry.installments
        .filter((parcel) => predicate({
          ...entry,
          dueDate: parcel?.dueDate,
          vencimento: parcel?.dueDate,
          status: parcel?.status,
          paymentStatus: parcel?.status,
          remainingAmount: parcel?.remainingAmount ?? parcel?.amount,
        }))
        .reduce((sum, parcel) => sum + roundMoney(parcel?.remainingAmount ?? parcel?.amount ?? 0), 0);
      return roundMoney(acc + subtotal);
    }
    if (!predicate(entry)) return acc;
    return roundMoney(acc + getEntryRemainingAmount(entry));
  }, 0);

const financialService = {
  createFinancialAccount: async ({ clinicId, payload = {} }) => {
    const normalizedClinicId = cleanText(clinicId || payload.clinicId);
    const patientId = cleanText(payload.patientId);
    if (!normalizedClinicId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
    }

    const patient = patientId ? await ensureClinicPatient({ clinicId: normalizedClinicId, patientId }) : null;
    let appointmentId = cleanText(payload.appointmentId);
    if (appointmentId) {
      const appointment = await financialRepository.findAppointmentByIdAndClinic({
        clinicId: normalizedClinicId,
        appointmentId,
      });
      if (!appointment) throw new AppError(404, 'APPOINTMENT_NOT_FOUND', 'Appointment not found for this clinic.');
      appointmentId = appointment.id;
    }

    const procedureRef = cleanText(payload.patientProcedureId || payload.procedureId);
    let procedure = null;
    if (procedureRef) {
      if (!patientId) {
        throw new AppError(400, 'VALIDATION_ERROR', 'patientId is required to link a procedure.');
      }
      procedure = await resolveProcedureLink({
        clinicId: normalizedClinicId,
        patientId,
        procedureId: procedureRef,
      });
    }

    const totalAmount = roundMoney(payload.totalAmount ?? payload.valor ?? 0);
    if (totalAmount <= 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'totalAmount must be greater than zero.');
    }

    const externalReference = cleanText(payload.externalReference || payload.financeEntryId || payload.procedureId);
    if (externalReference) {
      const existing = await financialRepository.findFinancialAccountByExternalReference({
        clinicId: normalizedClinicId,
        externalReference,
      });
      if (existing) {
        return financialService.updateFinancialAccount({
          clinicId: normalizedClinicId,
          accountId: existing.id,
          payload,
        });
      }
    }

    const installments = buildInstallmentsFromPayload(payload, totalAmount);
    const status = summarizeAccountStatus({ installments, transactions: [], totalAmount });
    const metadata = {
      ...(payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {}),
      patientName: payload.patientName || patient?.nome || '',
      prontuario: payload.prontuario || patient?.id || '',
      paymentMethodDetail: normalizePaymentMethodDetail(
        payload.paymentMethodDetail || payload.paymentMethod || payload.metodoPagamento || payload?.metadata?.paymentMethodDetail || 'PIX',
      ),
      procedureName: payload.procedureName || '',
      funcionario: cleanText(payload.funcionario || payload.dentistaNome || ''),
      dentistId: cleanText(payload.dentistaId || ''),
      dentistName: cleanText(payload.dentistaNome || payload.funcionario || ''),
      procedureId: cleanText(payload.procedureId || procedure?.externalId || procedure?.id || ''),
      data: cleanText(payload.data || toDateOnly(payload.dueDate || payload.vencimento || new Date())),
      category: payload.category || payload.categoria || '',
      origin: payload.source || payload.origem || '',
      type: payload.type || payload.tipo || 'receita',
    };

    const account = await financialRepository.createFinancialAccount({
      clinicId: normalizedClinicId,
      patientId: patientId || null,
      appointmentId: appointmentId || null,
      patientProcedureId: procedure?.id || cleanText(payload.patientProcedureId) || null,
      description: cleanText(payload.description || payload.descricao || 'Lancamento financeiro'),
      totalAmount,
      status,
      category: cleanText(payload.category || payload.categoria || '') || null,
      source: cleanText(payload.source || payload.origem || '') || null,
      dueDate: toDate(payload.dueDate || payload.vencimento || payload.data, null),
      paymentMethod: cleanText(payload.paymentMethodDetail || payload.paymentMethod || payload.metodoPagamento || payload?.metadata?.paymentMethodDetail)
        ? normalizeTransactionMethod(payload.paymentMethodDetail || payload.paymentMethod || payload.metodoPagamento || payload?.metadata?.paymentMethodDetail)
        : null,
      externalReference: externalReference || null,
      metadata,
    });

    const persistedInstallments = await financialRepository.replaceInstallments({
      clinicId: normalizedClinicId,
      accountId: account.id,
      installments,
    });

    const refreshed = await financialRepository.updateFinancialAccount({
      id: account.id,
      clinicId: normalizedClinicId,
      data: {
        status: summarizeAccountStatus({
          installments: persistedInstallments,
          transactions: [],
          totalAmount,
        }),
      },
    });

    return mapAccountToLegacy(refreshed);
  },

  updateFinancialAccount: async ({ clinicId, accountId, payload = {} }) => {
    const normalizedClinicId = cleanText(clinicId || payload.clinicId);
    const normalizedAccountId = cleanText(accountId || payload.accountId || payload.id);
    if (!normalizedClinicId || !normalizedAccountId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId and accountId are required.');
    }
    const existing = await financialRepository.findFinancialAccountByIdAndClinic({
      clinicId: normalizedClinicId,
      accountId: normalizedAccountId,
    });
    if (!existing) throw new AppError(404, 'FINANCIAL_ACCOUNT_NOT_FOUND', 'Financial account not found.');

    let installments = Array.isArray(existing.installments) ? existing.installments.map((item) => ({
      sequence: item.sequence,
      dueDate: item.dueDate,
      amount: Number(item.amount || 0),
      status: item.status,
      paidAt: item.paidAt || null,
    })) : [];

    if (payload.installments || payload.installmentsCount || payload.parcelas) {
      installments = buildInstallmentsFromPayload(payload, payload.totalAmount ?? payload.valor ?? Number(existing.totalAmount || 0));
      await financialRepository.replaceInstallments({
        clinicId: normalizedClinicId,
        accountId: normalizedAccountId,
        installments,
      });
    }

    const nextStatus = normalizeAccountStatus(payload.status || summarizeAccountStatus({
      installments,
      transactions: existing.transactions || [],
      totalAmount: payload.totalAmount ?? payload.valor ?? Number(existing.totalAmount || 0),
      rowStatus: existing.status,
    }));
    const updated = await financialRepository.updateFinancialAccount({
      id: normalizedAccountId,
      clinicId: normalizedClinicId,
      data: {
        description: payload.description !== undefined || payload.descricao !== undefined
          ? cleanText(payload.description || payload.descricao || 'Lancamento financeiro')
          : existing.description,
        totalAmount: payload.totalAmount !== undefined || payload.valor !== undefined
          ? roundMoney(payload.totalAmount ?? payload.valor ?? Number(existing.totalAmount || 0))
          : existing.totalAmount,
        status: nextStatus,
        category: payload.category !== undefined || payload.categoria !== undefined
          ? cleanText(payload.category || payload.categoria || '') || null
          : existing.category,
        source: payload.source !== undefined || payload.origem !== undefined
          ? cleanText(payload.source || payload.origem || '') || null
          : existing.source,
        dueDate: payload.dueDate !== undefined || payload.vencimento !== undefined || payload.data !== undefined
          ? toDate(payload.dueDate || payload.vencimento || payload.data, null)
          : existing.dueDate,
        paymentMethod: payload.paymentMethod !== undefined || payload.metodoPagamento !== undefined || payload.paymentMethodDetail !== undefined || payload?.metadata?.paymentMethodDetail !== undefined
          ? normalizeTransactionMethod(payload.paymentMethodDetail || payload.paymentMethod || payload.metodoPagamento || payload?.metadata?.paymentMethodDetail)
          : existing.paymentMethod,
        metadata: {
          ...((existing.metadata && typeof existing.metadata === 'object') ? existing.metadata : {}),
          ...((payload.metadata && typeof payload.metadata === 'object') ? payload.metadata : {}),
          ...((payload.paymentMethod !== undefined || payload.metodoPagamento !== undefined || payload.paymentMethodDetail !== undefined || payload?.metadata?.paymentMethodDetail !== undefined)
            ? {
                paymentMethodDetail: normalizePaymentMethodDetail(
                  payload.paymentMethodDetail || payload.paymentMethod || payload.metodoPagamento || payload?.metadata?.paymentMethodDetail || existing.metadata?.paymentMethodDetail || existing.paymentMethod,
                  existing.metadata?.paymentMethodDetail || existing.paymentMethod,
                ),
              }
            : {}),
          ...(payload.funcionario !== undefined || payload.dentistaNome !== undefined || payload.dentistaId !== undefined
            ? {
                funcionario: cleanText(payload.funcionario || payload.dentistaNome || ''),
                dentistId: cleanText(payload.dentistaId || ''),
                dentistName: cleanText(payload.dentistaNome || payload.funcionario || ''),
              }
            : {}),
        },
      },
    });

    return mapAccountToLegacy(updated);
  },

  listFinancialAccounts: async ({ clinicId, patientId }) => {
    return listFinancialLedgerEntries({ clinicId, patientId });
  },

  getFinancialAccount: async ({ clinicId, accountId }) => {
    const row = await financialRepository.findFinancialAccountByIdAndClinic({
      clinicId: cleanText(clinicId),
      accountId: cleanText(accountId),
    });
    if (!row) throw new AppError(404, 'FINANCIAL_ACCOUNT_NOT_FOUND', 'Financial account not found.');
    return mapAccountToLegacy(row);
  },

  deleteFinancialAccount: async ({ clinicId, accountId }) => {
    const normalizedClinicId = cleanText(clinicId);
    const normalizedAccountId = cleanText(accountId);
    const row = await financialRepository.findFinancialAccountByIdAndClinic({
      clinicId: normalizedClinicId,
      accountId: normalizedAccountId,
    });
    if (!row) return { success: true };
    await financialRepository.deleteFinancialAccount({
      clinicId: normalizedClinicId,
      accountId: normalizedAccountId,
    });
    await clearProcedureFinancialSnapshot({
      clinicId: normalizedClinicId,
      account: row,
    });
    return { success: true };
  },

  registerPayment: async ({ clinicId, accountId, installmentId, amount, method, paidAt, metadata = {} }) => {
    const normalizedClinicId = cleanText(clinicId);
    const normalizedAccountId = cleanText(accountId);
    const row = await financialRepository.findFinancialAccountByIdAndClinic({
      clinicId: normalizedClinicId,
      accountId: normalizedAccountId,
    });
    if (!row) throw new AppError(404, 'FINANCIAL_ACCOUNT_NOT_FOUND', 'Financial account not found.');

    const normalizedMethod = normalizeTransactionMethod(method);
    const transactionMetadata = {
      ...(metadata && typeof metadata === 'object' ? metadata : {}),
      paymentMethodDetail: normalizePaymentMethodDetail(method, row.paymentMethod || metadata?.paymentMethodDetail),
    };
    const paidDate = toDate(paidAt, new Date());

    let targetInstallment = null;
    if (cleanText(installmentId)) {
      targetInstallment = row.installments.find((item) => item.id === cleanText(installmentId)) || null;
      if (!targetInstallment) throw new AppError(404, 'INSTALLMENT_NOT_FOUND', 'Installment not found.');
    } else {
      targetInstallment = row.installments.find((item) => item.status !== 'PAID' && item.status !== 'CANCELED') || null;
    }

    const targetSnapshot = targetInstallment
      ? deriveInstallmentSnapshot(targetInstallment, row.transactions || [])
      : null;
    const inferredAmount = targetSnapshot
      ? roundMoney(targetSnapshot.remainingAmount ?? targetInstallment?.amount ?? 0)
      : 0;
    const normalizedAmount = roundMoney(amount);
    const amountToPersist = normalizedAmount > 0 ? normalizedAmount : inferredAmount;

    if (targetInstallment && inferredAmount <= 0) {
      throw new AppError(409, 'INSTALLMENT_ALREADY_SETTLED', 'Installment is already settled.');
    }
    if (amountToPersist <= 0) throw new AppError(400, 'VALIDATION_ERROR', 'amount must be greater than zero.');

    const normalizedIdempotencyKey = cleanText(metadata?.idempotencyKey);
    const existingPayment = Array.isArray(row.transactions) ? row.transactions.find((transaction) => {
      if (cleanText(transaction?.type).toUpperCase() !== 'PAYMENT') return false;
      if (cleanText(transaction?.installmentId || '') !== cleanText(targetInstallment?.id || '')) return false;
      if (roundMoney(transaction?.amount || 0) !== amountToPersist) return false;
      if (normalizedIdempotencyKey && cleanText(transaction?.metadata?.idempotencyKey) === normalizedIdempotencyKey) return true;
      if (!normalizedIdempotencyKey) {
        const transactionMetadata = transaction?.metadata && typeof transaction.metadata === 'object' ? transaction.metadata : {};
        const payloadMetadata = metadata && typeof metadata === 'object' ? metadata : {};
        const sameOrigin = cleanText(transactionMetadata.origin || '').toLowerCase() === cleanText(payloadMetadata.origin || '').toLowerCase();
        const sameCategory = cleanText(transactionMetadata.category || '').toLowerCase() === cleanText(payloadMetadata.category || '').toLowerCase();
        const sameProcedure = cleanText(transactionMetadata.procedureId || '').toLowerCase() === cleanText(payloadMetadata.procedureId || '').toLowerCase();
        const samePatientProcedure = cleanText(transactionMetadata.patientProcedureId || '').toLowerCase() === cleanText(payloadMetadata.patientProcedureId || '').toLowerCase();
        return sameOrigin && sameCategory && sameProcedure && samePatientProcedure;
      }
      return false;
    }) : null;

    if (existingPayment) {
      const refreshedExisting = await financialRepository.findFinancialAccountByIdAndClinic({
        clinicId: normalizedClinicId,
        accountId: normalizedAccountId,
      });
      const nextStatusExisting = summarizeAccountStatus({
        installments: refreshedExisting.installments || [],
        transactions: refreshedExisting.transactions || [],
        totalAmount: refreshedExisting.totalAmount,
        rowStatus: refreshedExisting.status,
      });
      if (nextStatusExisting !== refreshedExisting.status) {
        await financialRepository.updateFinancialAccount({
          id: normalizedAccountId,
          clinicId: normalizedClinicId,
          data: {
            status: nextStatusExisting,
            paymentMethod: normalizedMethod,
          },
        });
      }
      return mapAccountToLegacy(await financialRepository.findFinancialAccountByIdAndClinic({
        clinicId: normalizedClinicId,
        accountId: normalizedAccountId,
      }));
    }

    await financialRepository.createTransaction({
      clinicId: normalizedClinicId,
      accountId: normalizedAccountId,
      installmentId: targetInstallment?.id || null,
      type: 'PAYMENT',
      amount: amountToPersist,
      method: normalizedMethod,
      metadata: transactionMetadata,
    });

    const refreshed = await financialRepository.findFinancialAccountByIdAndClinic({
      clinicId: normalizedClinicId,
      accountId: normalizedAccountId,
    });
    if (targetInstallment) {
      const refreshedInstallment = refreshed.installments.find((item) => item.id === targetInstallment.id);
      const installmentSnapshot = deriveInstallmentSnapshot(refreshedInstallment, refreshed.transactions || []);
      await financialRepository.updateInstallment({
        installmentId: targetInstallment.id,
        clinicId: normalizedClinicId,
        data: {
          status: installmentSnapshot.remainingAmount <= 0 ? 'PAID' : 'PENDING',
          paidAt: installmentSnapshot.remainingAmount <= 0 ? paidDate : null,
        },
      });
    }

    const persisted = await financialRepository.findFinancialAccountByIdAndClinic({
      clinicId: normalizedClinicId,
      accountId: normalizedAccountId,
    });
    const nextStatus = summarizeAccountStatus({
      installments: persisted.installments || [],
      transactions: persisted.transactions || [],
      totalAmount: persisted.totalAmount,
      rowStatus: persisted.status,
    });
    const updated = await financialRepository.updateFinancialAccount({
      id: normalizedAccountId,
      clinicId: normalizedClinicId,
      data: {
        status: nextStatus,
        paymentMethod: normalizedMethod,
      },
    });

    if (cleanText(targetInstallment?.id)) {
      planMessageService.handlePaymentConfirmedForInstallment({
        clinicId: normalizedClinicId,
        accountId: normalizedAccountId,
        installmentId: cleanText(targetInstallment.id),
        actorName: 'finance_register_payment',
      }).catch((error) => {
        console.warn('[PLAN_MESSAGE]', JSON.stringify({
          action: 'plan_payment_confirmed_followup_failed',
          clinicId: normalizedClinicId,
          financialAccountId: normalizedAccountId,
          installmentId: cleanText(targetInstallment.id),
          failureReason: error?.message || String(error || ''),
          plan_message_source: 'central',
        }));
      });
    }

    return mapAccountToLegacy(updated);
  },

  getPatientFinancialSummary: async ({ clinicId, patientId }) => {
    if (!cleanText(patientId)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'patientId is required.');
    }
    const accounts = await listFinancialAccountSnapshots({ clinicId, patientId });
    const totalOpen = accounts
      .reduce((acc, item) => acc + roundMoney(item.remainingAmount || 0), 0);
    const totalPaid = accounts
      .reduce((acc, item) => acc + roundMoney(item.paidAmount || 0), 0);

    return {
      patientId: cleanText(patientId),
      clinicId: cleanText(clinicId),
      totalAccounts: accounts.length,
      totalOpen: roundMoney(totalOpen),
      totalPaid: roundMoney(totalPaid),
      accounts,
    };
  },

  getFinancialDashboard: async ({ clinicId }) => {
    const ledgerEntries = await listFinancialLedgerEntries({ clinicId });
    const accountSnapshots = await listFinancialAccountSnapshots({ clinicId });
    const openAmount = sumPendingEntriesByPredicate(ledgerEntries, (entry) => isEntryPendingLike(entry));
    const totalPaidAmount = roundMoney(
      ledgerEntries
        .filter((entry) => String(entry?.tipo || '').toLowerCase() === 'receita')
        .reduce((acc, entry) => acc + roundMoney(entry.paidAmount || 0), 0),
    );
    const overdue = ledgerEntries.filter((entry) => isEntryOverdueLike(entry));

    return {
      totalAccounts: accountSnapshots.length,
      totalOpenAmount: openAmount,
      totalPaidAmount,
      overdueInstallments: overdue.length,
      accounts: ledgerEntries,
    };
  },

  getFinancialReport: async ({ clinicId, month, year }) => {
    const normalizedClinicId = cleanText(clinicId);
    const normalizedMonth = Number(month);
    const normalizedYear = Number(year);
    if (!normalizedClinicId || !normalizedMonth || !normalizedYear) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId, month and year are required.');
    }
    const accounts = await listFinancialLedgerEntries({ clinicId: normalizedClinicId });
    return buildFinancialReport({
      clinicId: normalizedClinicId,
      month: normalizedMonth,
      year: normalizedYear,
      accounts,
    });
  },

  getMonthlySummary: async ({ clinicId, month, year }) => {
    const report = await financialService.getFinancialReport({ clinicId, month, year });
    return {
      clinicId: report.clinicId,
      month: report.mes,
      year: report.ano,
      totalRevenue: report.totalEntradas,
      totalReceived: report.totalReceived,
      totalPending: report.totalPending,
      totalOverdue: report.totalOverdue,
      totalExpenses: report.totalSaidas,
      saldo: report.saldo,
      accountCount: report.entradas.length + report.saidas.length,
    };
  },

  getCashFlowProjection: async ({ clinicId }) => {
    const accounts = await listFinancialAccountSnapshots({ clinicId });
    const projection = new Map();
    accounts.forEach((account) => {
      const sign = String(account.tipo || '').toLowerCase() === 'despesa' ? -1 : 1;
      (account.installments || []).forEach((parcel) => {
        if (!parcel?.dueDate) return;
        const key = String(parcel.dueDate).slice(0, 7);
        const current = projection.get(key) || { period: key, expected: 0, received: 0, pending: 0, overdue: 0 };
        const amount = roundMoney(parcel.amount);
        const paidAmount = roundMoney(parcel.paidAmount || 0);
        const remainingAmount = roundMoney(parcel.remainingAmount ?? amount);
        current.expected = roundMoney(current.expected + (amount * sign));
        if (paidAmount > 0) current.received = roundMoney(current.received + (paidAmount * sign));
        if (parcel.status === 'PENDING' || parcel.status === 'PARTIAL') {
          current.pending = roundMoney(current.pending + (remainingAmount * sign));
        }
        if (parcel.status === 'OVERDUE') current.overdue = roundMoney(current.overdue + (remainingAmount * sign));
        projection.set(key, current);
      });
    });
    return Array.from(projection.values()).sort((a, b) => a.period.localeCompare(b.period));
  },

  getOverdueAccounts: async ({ clinicId }) => {
    const accounts = await listFinancialAccountSnapshots({ clinicId });
    return accounts.filter((account) => (account.installments || []).some((parcel) => parcel.status === 'OVERDUE'));
  },

  getFinancialReminders: async ({ clinicId }) => {
    const normalizedClinicId = cleanText(clinicId);
    if (!normalizedClinicId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
    }

    const accounts = await listFinancialAccountSnapshots({ clinicId: normalizedClinicId });
    const now = new Date();
    const overdueItems = [];
    const dueTodayItems = [];
    const dueSoonItems = [];
    const partialOutstandingItems = [];

    accounts
      .filter((account) => String(account?.tipo || '').toLowerCase() === 'receita')
      .forEach((account) => {
        const collectibleInstallments = (account.installments || []).filter(isInstallmentCollectible);
        collectibleInstallments.forEach((installment) => {
          const due = toDate(installment.dueDate, null);
          if (!due) return;
          const dayDiff = differenceInCalendarDaysUtc(due, now);
          if (dayDiff < 0 || installment.status === 'OVERDUE') {
            overdueItems.push(buildReminderItem({ account, installment, type: 'overdue' }));
            return;
          }
          if (dayDiff === 0) {
            dueTodayItems.push(buildReminderItem({ account, installment, type: 'dueToday' }));
            return;
          }
          if (dayDiff > 0 && dayDiff <= 3) {
            dueSoonItems.push(buildReminderItem({ account, installment, type: 'dueSoon' }));
          }
        });

        if (account.paymentStatus === 'PARTIAL' && roundMoney(account.remainingAmount || 0) > 0) {
          partialOutstandingItems.push(buildReminderItem({ account, type: 'partialOutstanding' }));
        }
      });

    overdueItems.sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')));
    dueTodayItems.sort((a, b) => String(a.patientName || '').localeCompare(String(b.patientName || '')));
    dueSoonItems.sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')));
    partialOutstandingItems.sort((a, b) => roundMoney(b.remainingAmount || 0) - roundMoney(a.remainingAmount || 0));

    return {
      clinicId: normalizedClinicId,
      generatedAt: new Date().toISOString(),
      overdue: buildReminderGroup(overdueItems),
      dueToday: buildReminderGroup(dueTodayItems),
      dueSoon: buildReminderGroup(dueSoonItems),
      partialOutstanding: buildReminderGroup(partialOutstandingItems),
    };
  },

  closeFinancialMonth: async ({ clinicId, month, year }) => {
    const normalizedClinicId = cleanText(clinicId);
    const normalizedMonth = Number(month);
    const normalizedYear = Number(year);
    if (!normalizedClinicId || !normalizedMonth || !normalizedYear) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId, month and year are required.');
    }

    const existing = await financialRepository.findFinancialSnapshot({
      clinicId: normalizedClinicId,
      year: normalizedYear,
      month: normalizedMonth,
    });
    if (existing) {
      throw new AppError(409, 'FINANCIAL_SNAPSHOT_EXISTS', 'Monthly financial snapshot already exists.');
    }

    const report = await financialService.getFinancialReport({
      clinicId: normalizedClinicId,
      month: normalizedMonth,
      year: normalizedYear,
    });

    const snapshot = await financialRepository.createFinancialSnapshot({
      clinicId: normalizedClinicId,
      month: normalizedMonth,
      year: normalizedYear,
      totalRevenue: report.totalEntradas,
      totalReceived: report.totalReceived,
      totalPending: report.totalPending,
      totalOverdue: report.totalOverdue,
      metadata: {
        totalExpenses: report.totalSaidas,
        saldo: report.saldo,
        entradas: report.entradas,
        saidas: report.saidas,
      },
    });

    return {
      id: snapshot.id,
      clinicId: snapshot.clinicId,
      month: snapshot.month,
      year: snapshot.year,
      totalRevenue: Number(snapshot.totalRevenue || 0),
      totalReceived: Number(snapshot.totalReceived || 0),
      totalPending: Number(snapshot.totalPending || 0),
      totalOverdue: Number(snapshot.totalOverdue || 0),
      createdAt: snapshot.createdAt?.toISOString?.() || null,
      metadata: snapshot.metadata || {},
    };
  },

  listFaturamentoByPeriod: async ({ clinicId, period = 'mes' }) => {
    const accounts = await listFinancialLedgerEntries({ clinicId });
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    if (period === 'semana') {
      start.setDate(now.getDate() - now.getDay());
      end.setDate(start.getDate() + 6);
    } else if (period === 'mes') {
      start.setDate(1);
      end.setMonth(start.getMonth() + 1, 0);
    }

    return accounts.filter((item) => {
      const ref = toDate(item.data || item.createdAt, null);
      if (!ref) return false;
      return ref >= start && ref <= end;
    });
  },

  createPatientPlan: async ({ clinicId, payload = {} }) => {
    const normalizedClinicId = cleanText(clinicId);
    const patientId = cleanText(payload.patientId);
    if (!normalizedClinicId || !patientId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId and patientId are required.');
    }
    const patient = await ensureClinicPatient({ clinicId: normalizedClinicId, patientId });

    const totalValue = roundMoney(payload.totalValue ?? payload.valorTotal ?? 0);
    const installments = Math.max(1, Number(payload.installments ?? payload.installmentsCount ?? payload.parcelas ?? 1) || 1);
    const entryAmount = roundMoney(
      payload.entryAmount
      ?? payload.entryValue
      ?? payload.valorEntrada
      ?? payload?.payment?.entry?.value
      ?? 0,
    );
    const planDueDate = resolvePlanDueDate(payload);
    const entryPaidAt = cleanText(payload.entryPaidAt || payload?.payment?.entry?.paidAt || '') || null;
    const entryPaymentMethod = cleanText(
      payload.paymentMethod
      || payload.entryPaymentMethod
      || payload?.payment?.entry?.paymentMethod
      || 'PIX',
    ).toUpperCase() || 'PIX';
    const metadata = {
      ...sanitizeTenantMetadata(payload.metadata),
      patientName: payload.patientName || patient.nome || '',
      prontuario: payload.prontuario || patient.id || '',
      dentistName: cleanText(payload.dentistName || payload.dentista || ''),
      category: cleanText(payload.category || payload.categoria || ''),
      description: cleanText(payload.description || payload.descricao || ''),
      serviceLabel: cleanText(payload.serviceLabel || payload.servico || payload.serviceName || ''),
      notes: cleanText(payload.notes || payload.observacoes || ''),
      startDate: cleanText(payload.startDate || '') || toDateOnly(planDueDate),
      dueDay: normalizePlanDueDay(payload.dueDay),
      minInstallmentsRelease: Math.max(1, Number(payload.minInstallmentsRelease || payload.minParcelas || 1) || 1),
      statusAtual: cleanText(payload.statusAtual || payload.status || ''),
      linkedServiceIds: Array.isArray(payload.linkedServiceIds)
        ? payload.linkedServiceIds.map((item) => cleanText(item)).filter(Boolean)
        : [],
      entryAmount,
      entryValue: entryAmount,
      entryPaidAt,
      entryPaymentMethod,
      schedule: buildInstallmentsFromPayload({
        installmentsCount: installments,
        dueDate: planDueDate,
      }, totalValue).map((item) => ({
        sequence: item.sequence,
        dueDate: toDateOnly(item.dueDate),
        amount: item.amount,
        status: item.status,
      })),
    };

    const plan = await financialRepository.createPatientPlan({
      clinicId: normalizedClinicId,
      patientId,
      name: cleanText(payload.name || payload.title || payload.nome || 'Plano odontologico'),
      totalValue,
      installments,
      status: normalizePlanStatus(payload.status || payload.statusAtual),
      entryAmount: entryAmount > 0 ? entryAmount : null,
      releaseRule: cleanText(payload.releaseRule || payload.regraLiberacao || '') || null,
      metadata,
    });

    await ensurePlanFinancialAccount({
      clinicId: normalizedClinicId,
      planRow: {
        ...plan,
        patient,
      },
    });

    return financialService.getPatientPlanById({
      clinicId: normalizedClinicId,
      planId: plan.id,
    });
  },

  listPatientPlans: async ({ clinicId, patientId }) => {
    const normalizedClinicId = cleanText(clinicId);
    const normalizedPatientId = cleanText(patientId);

    if (normalizedPatientId) {
      await ensureClinicPatient({ clinicId: normalizedClinicId, patientId: normalizedPatientId });
    }

    const rows = normalizedPatientId
      ? await financialRepository.listPatientPlansByPatient({ clinicId: normalizedClinicId, patientId: normalizedPatientId })
      : await financialRepository.listPatientPlansByClinic({ clinicId: normalizedClinicId });
    let accountRows = normalizedPatientId
      ? (await financialRepository.listFinancialAccountsByPatient({
        clinicId: normalizedClinicId,
        patientId: normalizedPatientId,
      })).filter((item) => extractPlanIdFromAccountRow(item))
      : await financialRepository.listPlanFinancialAccountsByClinic({ clinicId: normalizedClinicId });
    let accountsByPlanId = buildPlanAccountMap(accountRows);
    const missingPlans = rows.filter((item) => !accountsByPlanId.has(cleanText(item.id)));
    if (missingPlans.length) {
      const repaired = await ensurePlanFinancialAccounts({
        clinicId: normalizedClinicId,
        planRows: missingPlans,
      });
      accountRows = [...accountRows, ...(Array.isArray(repaired) ? repaired : [])];
      accountsByPlanId = buildPlanAccountMap(accountRows);
    }
    return rows.map((item) => buildLegacyPlan({
      planRow: item,
      accountRow: accountsByPlanId.get(cleanText(item.id)) || null,
    }));
  },

  getPatientPlanById: async ({ clinicId, planId }) => {
    const row = await financialRepository.findPatientPlanByIdAndClinic({
      clinicId: cleanText(clinicId),
      planId: cleanText(planId),
    });
    if (!row) throw new AppError(404, 'PATIENT_PLAN_NOT_FOUND', 'Patient plan not found.');
    let accountRow = await financialRepository.findPlanFinancialAccountByPlanId({
      clinicId: cleanText(clinicId),
      planId: cleanText(planId),
    });
    if (!accountRow) {
      accountRow = await ensurePlanFinancialAccount({
        clinicId: cleanText(clinicId),
        planRow: row,
      });
    }
    return buildLegacyPlan({
      planRow: row,
      accountRow,
    });
  },

  updatePatientPlan: async ({ clinicId, planId, payload = {} }) => {
    const existing = await financialRepository.findPatientPlanByIdAndClinic({
      clinicId: cleanText(clinicId),
      planId: cleanText(planId),
    });
    if (!existing) throw new AppError(404, 'PATIENT_PLAN_NOT_FOUND', 'Patient plan not found.');
    const requestedPatientId = cleanText(payload.patientId);
    if (requestedPatientId && requestedPatientId !== cleanText(existing.patientId)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'patientId cannot be reassigned.');
    }

    const nextInstallments = payload.installments !== undefined || payload.installmentsCount !== undefined || payload.parcelas !== undefined
      ? Math.max(1, Number(payload.installments ?? payload.installmentsCount ?? payload.parcelas ?? existing.installments) || existing.installments)
      : existing.installments;
    const nextTotalValue = payload.totalValue !== undefined || payload.valorTotal !== undefined
      ? roundMoney(payload.totalValue ?? payload.valorTotal ?? Number(existing.totalValue || 0))
      : Number(existing.totalValue || 0);
    const nextEntryAmount = payload.entryAmount !== undefined || payload.entryValue !== undefined || payload.valorEntrada !== undefined
      ? roundMoney(payload.entryAmount ?? payload.entryValue ?? payload.valorEntrada ?? 0)
      : Number(existing.entryAmount || 0);
    const nextDueDate = resolvePlanDueDate({
      ...extractPlanMetadata(existing),
      ...payload,
    }, new Date());
    const nextMetadata = {
      ...((existing.metadata && typeof existing.metadata === 'object') ? existing.metadata : {}),
      ...sanitizeTenantMetadata(payload.metadata),
      patientName: cleanText(payload.patientName || existing?.metadata?.patientName || existing?.patient?.nome || ''),
      prontuario: cleanText(payload.prontuario || existing?.metadata?.prontuario || existing?.patient?.id || existing.patientId),
      dentistName: cleanText(payload.dentistName || payload.dentista || existing?.metadata?.dentistName || ''),
      category: cleanText(payload.category || payload.categoria || existing?.metadata?.category || ''),
      description: cleanText(payload.description || payload.descricao || existing?.metadata?.description || ''),
      serviceLabel: cleanText(payload.serviceLabel || payload.servico || payload.serviceName || existing?.metadata?.serviceLabel || ''),
      notes: cleanText(payload.notes || payload.observacoes || existing?.metadata?.notes || ''),
      startDate: cleanText(payload.startDate || existing?.metadata?.startDate || ''),
      dueDay: normalizePlanDueDay(payload.dueDay ?? existing?.metadata?.dueDay),
      minInstallmentsRelease: Math.max(1, Number(payload.minInstallmentsRelease ?? payload.minParcelas ?? existing?.metadata?.minInstallmentsRelease ?? 1) || 1),
      statusAtual: cleanText(payload.statusAtual || payload.status || existing?.metadata?.statusAtual || existing.status || ''),
      linkedServiceIds: Array.isArray(payload.linkedServiceIds)
        ? payload.linkedServiceIds.map((item) => cleanText(item)).filter(Boolean)
        : (Array.isArray(existing?.metadata?.linkedServiceIds) ? existing.metadata.linkedServiceIds : []),
      entryAmount: nextEntryAmount,
      entryValue: nextEntryAmount,
      entryPaidAt: cleanText(payload.entryPaidAt || payload?.payment?.entry?.paidAt || existing?.metadata?.entryPaidAt || '') || null,
      entryPaymentMethod: cleanText(
        payload.paymentMethod
        || payload.entryPaymentMethod
        || payload?.payment?.entry?.paymentMethod
        || existing?.metadata?.entryPaymentMethod
        || 'PIX',
      ).toUpperCase() || 'PIX',
    };

    await financialRepository.updatePatientPlan({
      clinicId: cleanText(clinicId),
      planId: cleanText(planId),
      data: {
        name: payload.name !== undefined || payload.title !== undefined || payload.nome !== undefined
          ? cleanText(payload.name || payload.title || payload.nome || existing.name)
          : existing.name,
        totalValue: nextTotalValue,
        installments: nextInstallments,
        status: payload.status || payload.statusAtual ? normalizePlanStatus(payload.status || payload.statusAtual) : existing.status,
        entryAmount: nextEntryAmount,
        releaseRule: payload.releaseRule !== undefined || payload.regraLiberacao !== undefined
          ? cleanText(payload.releaseRule || payload.regraLiberacao || '') || null
          : existing.releaseRule,
        metadata: nextMetadata,
      },
    });

    const linkedAccount = await financialRepository.findPlanFinancialAccountByPlanId({
      clinicId: cleanText(clinicId),
      planId: cleanText(planId),
    });
    if (linkedAccount) {
      await financialService.updateFinancialAccount({
        clinicId: cleanText(clinicId),
        accountId: linkedAccount.id,
        payload: {
          description: `Plano: ${cleanText(payload.name || payload.title || payload.nome || existing.name)}`,
          totalAmount: nextTotalValue,
          installmentsCount: nextInstallments,
          dueDate: nextDueDate,
          paymentMethod: nextMetadata.entryPaymentMethod || linkedAccount.paymentMethod || 'OTHER',
          metadata: {
            ...((linkedAccount.metadata && typeof linkedAccount.metadata === 'object') ? linkedAccount.metadata : {}),
            planId: cleanText(planId),
            planName: cleanText(payload.name || payload.title || payload.nome || existing.name),
            patientName: nextMetadata.patientName,
            prontuario: nextMetadata.prontuario,
            dentistName: nextMetadata.dentistName,
            procedureName: nextMetadata.serviceLabel,
            category: nextMetadata.category,
            entryAmount: nextEntryAmount,
            entryValue: nextEntryAmount,
            entryPaidAt: nextMetadata.entryPaidAt,
            entryPaymentMethod: nextMetadata.entryPaymentMethod,
            startDate: cleanText(nextMetadata.startDate || '') || null,
          },
        },
      });
    } else {
      await ensurePlanFinancialAccount({
        clinicId: cleanText(clinicId),
        planRow: {
          ...(await financialRepository.findPatientPlanByIdAndClinic({
            clinicId: cleanText(clinicId),
            planId: cleanText(planId),
          })),
        },
      });
    }

    return financialService.getPatientPlanById({ clinicId, planId });
  },

  deletePatientPlan: async ({ clinicId, planId }) => {
    const existing = await financialRepository.findPatientPlanByIdAndClinic({
      clinicId: cleanText(clinicId),
      planId: cleanText(planId),
    });
    if (!existing) return { success: true };
    await financialRepository.deletePatientPlan({ clinicId: cleanText(clinicId), planId: cleanText(planId) });
    return { success: true };
  },
};

module.exports = { financialService, mapAccountToLegacy };
