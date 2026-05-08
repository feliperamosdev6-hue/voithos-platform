const { AppError } = require('../errors/AppError');
const { financialRepository } = require('../repositories/financialRepository');

const cleanText = (value) => String(value || '').trim();
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

const normalizeInstallmentStatus = (value) => {
  const raw = cleanText(value).toUpperCase();
  if (raw === 'PAID' || raw === 'PAGO') return 'PAID';
  if (raw === 'OVERDUE' || raw === 'ATRASADO') return 'OVERDUE';
  if (raw === 'CANCELED' || raw === 'CANCELADO' || raw === 'CANCELLED') return 'CANCELED';
  return 'PENDING';
};

const normalizeTransactionMethod = (value) => {
  const raw = cleanText(value).toUpperCase();
  if (raw === 'PIX') return 'PIX';
  if (raw === 'BOLETO') return 'BOLETO';
  if (raw === 'CASH' || raw === 'DINHEIRO') return 'CASH';
  if (raw === 'CREDIT' || raw === 'DEBIT' || raw === 'CARD' || raw === 'CARTAO' || raw === 'CARTAO_CREDITO' || raw === 'CARTAO_DEBITO') return 'CARD';
  if (raw === 'TRANSFER' || raw === 'TRANSFERENCIA') return 'TRANSFER';
  return 'OTHER';
};

const normalizePlanDueDay = (value) => {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.max(1, Math.min(28, Math.round(parsed)));
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

const extractPlanMetadata = (planRow = {}) => (
  planRow?.metadata && typeof planRow.metadata === 'object' ? planRow.metadata : {}
);

const resolvePlanDueDate = (metadata = {}, fallback = new Date()) => {
  const direct = toDate(metadata.firstDueDate || metadata.dueDate || metadata.vencimento || metadata.data, null);
  if (direct) return direct;
  const base = toDate(metadata.startDate, fallback || new Date()) || new Date();
  const dueDay = normalizePlanDueDay(metadata.dueDay);
  if (!dueDay) return base;
  const candidate = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), dueDay, 0, 0, 0, 0));
  const baseDay = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate());
  if (candidate.getTime() >= baseDay) return candidate;
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, dueDay, 0, 0, 0, 0));
};

const buildPlanInstallments = (planRow = {}) => {
  const metadata = extractPlanMetadata(planRow);
  const source = Array.isArray(metadata.schedule) ? metadata.schedule : [];
  if (source.length) {
    return source.map((item, index) => ({
      sequence: Math.max(1, Number(item.sequence || item.number || index + 1) || index + 1),
      dueDate: toDate(item.dueDate || item.vencimento || metadata.startDate || planRow.createdAt, new Date()),
      amount: roundMoney(item.amount ?? item.value ?? item.valor ?? 0),
      status: normalizeInstallmentStatus(item.status),
      paidAt: toDate(item.paidAt, null),
    }));
  }

  const totalValue = roundMoney(planRow.totalValue || 0);
  const entryAmount = roundMoney(planRow.entryAmount ?? metadata.entryAmount ?? metadata.entryValue ?? 0);
  const remainingTotal = roundMoney(Math.max(0, totalValue - entryAmount));
  const dueDate = resolvePlanDueDate(metadata, planRow.createdAt || new Date());
  return distributeInstallments(remainingTotal, Number(planRow.installments || 1) || 1, dueDate);
};

const buildPlanAccountData = ({ clinicId, planRow = {}, patient = {} }) => {
  const metadata = extractPlanMetadata(planRow);
  const entryAmount = roundMoney(planRow.entryAmount ?? metadata.entryAmount ?? metadata.entryValue ?? 0);
  const entryPaidAt = cleanText(metadata.entryPaidAt || '') || null;
  const entryPaymentMethod = cleanText(metadata.entryPaymentMethod || 'PIX').toUpperCase() || 'PIX';
  const accountMetadata = {
    ...(metadata && typeof metadata === 'object' ? metadata : {}),
    planId: cleanText(planRow.id),
    planName: cleanText(planRow.name),
    patientName: cleanText(metadata.patientName || patient?.nome || ''),
    prontuario: cleanText(metadata.prontuario || patient?.id || planRow.patientId || ''),
    dentistName: cleanText(metadata.dentistName || ''),
    procedureName: cleanText(metadata.serviceLabel || metadata.procedureName || ''),
    category: cleanText(metadata.category || 'planos'),
    entryAmount,
    entryValue: entryAmount,
    entryPaidAt,
    entryPaymentMethod,
    startDate: cleanText(metadata.startDate || '') || null,
  };

  return {
    clinicId: cleanText(clinicId),
    patientId: cleanText(planRow.patientId),
    description: `Plano: ${cleanText(planRow.name || 'Plano odontologico')}`,
    totalAmount: roundMoney(planRow.totalValue || 0),
    status: 'OPEN',
    category: 'planos',
    source: 'plano',
    dueDate: resolvePlanDueDate(metadata, planRow.createdAt || new Date()),
    paymentMethod: normalizeTransactionMethod(entryPaymentMethod),
    externalReference: `plan:${cleanText(planRow.id)}`,
    metadata: accountMetadata,
    installments: buildPlanInstallments(planRow),
  };
};

const createLinkedAccount = async ({ clinicId, planRow, patient }) => {
  const accountData = buildPlanAccountData({ clinicId, planRow, patient });
  const created = await financialRepository.createFinancialAccount({
    clinicId: accountData.clinicId,
    patientId: accountData.patientId || null,
    appointmentId: null,
    patientProcedureId: null,
    description: accountData.description,
    totalAmount: accountData.totalAmount,
    status: accountData.status,
    category: accountData.category,
    source: accountData.source,
    dueDate: accountData.dueDate,
    paymentMethod: accountData.paymentMethod,
    externalReference: accountData.externalReference,
    metadata: accountData.metadata,
  });

  await financialRepository.replaceInstallments({
    clinicId: cleanText(clinicId),
    accountId: created.id,
    installments: accountData.installments,
  });

  return financialRepository.findFinancialAccountByIdAndClinic({
    clinicId: cleanText(clinicId),
    accountId: created.id,
  });
};

const ensurePlanFinancialAccount = async ({ clinicId, planRow = {}, linkedAccount = null } = {}) => {
  const normalizedClinicId = cleanText(clinicId);
  const normalizedPlanId = cleanText(planRow?.id);
  if (!normalizedClinicId || !normalizedPlanId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'clinicId and planRow.id are required.');
  }

  if (linkedAccount) return linkedAccount;

  const existing = await financialRepository.findPlanFinancialAccountByPlanId({
    clinicId: normalizedClinicId,
    planId: normalizedPlanId,
  });
  if (existing) return existing;

  const patient = planRow?.patient
    || await financialRepository.findPatientByIdAndClinic({
      clinicId: normalizedClinicId,
      patientId: cleanText(planRow?.patientId),
    });
  if (!patient) {
    throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient not found for this clinic.');
  }

  return createLinkedAccount({ clinicId: normalizedClinicId, planRow, patient });
};

const ensurePlanFinancialAccounts = async ({ clinicId, planRows = [] } = {}) => {
  const normalizedClinicId = cleanText(clinicId);
  const results = [];
  for (const row of Array.isArray(planRows) ? planRows : []) {
    if (!cleanText(row?.id)) continue;
    const account = await ensurePlanFinancialAccount({
      clinicId: normalizedClinicId,
      planRow: row,
    });
    if (account) results.push(account);
  }
  return results;
};

module.exports = {
  ensurePlanFinancialAccount,
  ensurePlanFinancialAccounts,
};
