const { AppError } = require('../errors/AppError');
const { patientRepository } = require('../repositories/patientRepository');
const { patientClinicalRepository } = require('../repositories/patientClinicalRepository');
const { financialRepository } = require('../repositories/financialRepository');
const { patientDocumentStorageService } = require('./patientDocumentStorageService');
const { financialService, mapAccountToLegacy } = require('./financialService');

const assertPatientBelongsToClinic = async ({ clinicId, patientId }) => {
  const patient = await patientRepository.findByIdAndClinic(patientId, clinicId);
  if (!patient) {
    throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient not found for this clinic.');
  }
  return patient;
};

const normalizeIsoDate = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (dateOnly) return new Date(`${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T00:00:00.000Z`);
  return null;
};

const cleanText = (value) => String(value || '').trim();
const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;
const PROCEDURE_FINANCIAL_SOURCE = 'procedimento';
const PROCEDURE_FINANCIAL_CATEGORY = 'procedimentos';

const normalizeProcedureStatus = (value) => {
  const raw = cleanText(value).toLowerCase();
  if (!raw || raw === 'em_aberto') return 'a-realizar';
  if (['feito', 'concluido', 'concluído'].includes(raw)) return 'realizado';
  return raw;
};

const normalizeProcedurePaymentStatus = (value) => {
  const raw = cleanText(value).toUpperCase();
  if (raw === 'PAID' || raw === 'PAGO') return 'PAID';
  if (raw === 'CANCELLED' || raw === 'CANCELED' || raw === 'CANCELADO') return 'CANCELLED';
  return 'PENDING';
};

const normalizeProcedurePaymentMethod = (value) => {
  const raw = cleanText(value).toUpperCase();
  if (!raw) return 'PIX';
  if (raw === 'DINHEIRO') return 'CASH';
  if (raw === 'CARTAO_CREDITO' || raw === 'CREDITO' || raw === 'CREDIT' || raw === 'CARTAO' || raw === 'CARD') return 'CREDIT';
  if (raw === 'CARTAO_DEBITO' || raw === 'DEBITO' || raw === 'DEBIT') return 'DEBIT';
  if (raw === 'TRANSFERENCIA' || raw === 'TRANSFER') return 'TRANSFER';
  if (raw === 'BOLETO') return 'BOLETO';
  if (raw === 'PIX') return 'PIX';
  if (raw === 'OUTRO') return 'OTHER';
  return raw;
};

const normalizeProcedureTeeth = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => cleanText(item)).filter(Boolean);
  }
  const single = cleanText(value);
  return single ? [single] : [];
};

const resolveProcedureAmount = (payload = {}) => {
  const candidates = [
    payload?.valorCobrado,
    payload?.valor,
    payload?.price,
    payload?.preco,
    payload?.financeiro?.valor,
    payload?.financeiro?.totalAmount,
  ];
  for (const candidate of candidates) {
    const amount = roundMoney(candidate);
    if (amount > 0) return amount;
  }
  return 0;
};

const resolveProcedureSyncAmount = ({ payload = {}, procedureRow = {}, linkedAccount = null } = {}) => {
  const candidates = [
    resolveProcedureAmount(payload),
    resolveProcedureAmount(procedureRow?.payload || {}),
    procedureRow?.financialSnapshot?.amount,
    procedureRow?.financialSnapshot?.totalAmount,
    linkedAccount?.totalAmount,
    linkedAccount?.valor,
  ];
  for (const candidate of candidates) {
    const amount = roundMoney(candidate);
    if (amount > 0) return amount;
  }
  return 0;
};

const resolveProcedureInstallments = (payload = {}) => {
  const count = Number(
    payload?.financeiro?.installments
    ?? payload?.financeiro?.installmentsCount
    ?? payload?.parcelas
    ?? payload?.installments
    ?? 1
  ) || 1;
  return Math.max(1, count);
};

const buildProcedureDueDate = (payload = {}, fallback = new Date()) => {
  return normalizeIsoDate(
    payload?.financeiro?.dueDate
    || payload?.vencimento
    || payload?.dueDate
    || payload?.dataRealizacao
    || payload?.registeredAt
    || payload?.createdAt
    || payload?.dataRegistro
  ) || fallback;
};

const buildProcedurePaidAt = (payload = {}) => (
  normalizeIsoDate(
    payload?.financeiro?.paidAt
    || payload?.paidAt
    || payload?.dataPagamento
    || payload?.dataRealizacao
  ) || new Date()
);

const shouldGenerateProcedureFinance = ({ payload = {}, amount = 0, status = '' } = {}) => {
  if (payload?.gerarFinanceiro === false) return false;
  const normalizedStatus = normalizeProcedureStatus(status);
  if (normalizedStatus === 'pre-existente' || normalizedStatus === 'cancelado') return false;
  return true;
};

const pickLinkedFinancialAccount = (row = {}) => {
  const accounts = Array.isArray(row?.financialAccounts) ? row.financialAccounts : [];
  if (!accounts.length) return null;
  return accounts.find((item) => cleanText(item?.status).toUpperCase() !== 'CANCELED') || accounts[0] || null;
};

const sumLinkedAccountPayments = (account = {}) => {
  const transactions = Array.isArray(account?.transactions) ? account.transactions : [];
  return roundMoney(
    transactions
      .filter((item) => cleanText(item?.type).toUpperCase() === 'PAYMENT')
      .reduce((acc, item) => acc + roundMoney(item?.amount ?? 0), 0),
  );
};

const buildProcedurePaymentIdempotencyKey = ({ procedureRow = {}, payload = {}, amount = 0 } = {}) => {
  const externalReference = cleanText(procedureRow?.externalId || payload?.id || payload?.externalId);
  if (!externalReference) return '';
  return `procedure-payment:${externalReference}:${roundMoney(amount).toFixed(2)}`;
};

const buildProcedureFinancialSnapshot = ({
  payload = {},
  financeAccount = null,
  financeId = '',
  financeWarning = '',
  amount = 0,
} = {}) => {
  const baseSnapshot = payload?.financeiro && typeof payload.financeiro === 'object'
    ? payload.financeiro
    : {};
  if (!financeAccount) {
    return {
      ...baseSnapshot,
      financeEntryId: cleanText(baseSnapshot.financeEntryId || financeId),
      paymentStatus: normalizeProcedurePaymentStatus(baseSnapshot.paymentStatus),
      paymentMethod: normalizeProcedurePaymentMethod(
        baseSnapshot.paymentMethodDetail
        || baseSnapshot.paymentMethod
        || payload?.paymentMethodDetail
        || payload?.paymentMethod
        || payload?.metodoPagamento
        || 'PIX',
      ),
      paymentMethodDetail: normalizeProcedurePaymentMethod(
        baseSnapshot.paymentMethodDetail
        || baseSnapshot.paymentMethod
        || payload?.paymentMethodDetail
        || payload?.paymentMethod
        || payload?.metodoPagamento
        || 'PIX',
      ),
      dueDate: cleanText(baseSnapshot.dueDate || payload?.vencimento || payload?.dueDate || ''),
      installments: Number(baseSnapshot.installments ?? resolveProcedureInstallments(payload)) || 1,
      amount,
      warning: cleanText(financeWarning),
    };
  }
  return {
    ...baseSnapshot,
    financeEntryId: cleanText(financeAccount.id || financeId),
    paymentStatus: cleanText(financeAccount.paymentStatus || 'PENDING'),
    paymentMethod: normalizeProcedurePaymentMethod(
      financeAccount.paymentMethodDetail
      || financeAccount.metadata?.paymentMethodDetail
      || financeAccount.paymentMethod
      || financeAccount.metodoPagamento
      || '',
    ),
    paymentMethodDetail: normalizeProcedurePaymentMethod(
      financeAccount.paymentMethodDetail
      || financeAccount.metadata?.paymentMethodDetail
      || financeAccount.paymentMethod
      || financeAccount.metodoPagamento
      || '',
    ),
    dueDate: cleanText(financeAccount.dueDate || financeAccount.vencimento || ''),
    paidAt: financeAccount.paidAt || null,
    installments: Number(financeAccount.installmentsCount || baseSnapshot.installments || 1) || 1,
    amount: roundMoney(financeAccount.totalAmount ?? financeAccount.valor ?? amount),
    paidAmount: roundMoney(financeAccount.paidAmount ?? 0),
    remainingAmount: roundMoney(financeAccount.remainingAmount ?? amount),
    status: cleanText(financeAccount.status || ''),
    warning: cleanText(financeWarning),
  };
};

const mapLinkedFinanceToLegacy = (row = {}, payload = {}) => {
  const linkedAccount = pickLinkedFinancialAccount(row);
  const legacyAccount = linkedAccount ? mapAccountToLegacy(linkedAccount) : null;
  const storedSnapshot = row?.financialSnapshot && typeof row.financialSnapshot === 'object'
    ? row.financialSnapshot
    : {};
  const payloadFinance = payload?.financeiro && typeof payload.financeiro === 'object'
    ? payload.financeiro
    : {};
  const merged = {
    ...payloadFinance,
    ...storedSnapshot,
  };
  if (!legacyAccount) {
    return {
      ...merged,
      financeEntryId: cleanText(merged.financeEntryId || ''),
      paymentStatus: normalizeProcedurePaymentStatus(merged.paymentStatus),
      paymentMethod: normalizeProcedurePaymentMethod(
        merged.paymentMethodDetail
        || merged.paymentMethod
        || payload?.paymentMethodDetail
        || payload?.paymentMethod
        || payload?.metodoPagamento
        || '',
      ),
      paymentMethodDetail: normalizeProcedurePaymentMethod(
        merged.paymentMethodDetail
        || merged.paymentMethod
        || payload?.paymentMethodDetail
        || payload?.paymentMethod
        || payload?.metodoPagamento
        || '',
      ),
      dueDate: cleanText(merged.dueDate || payload?.vencimento || payload?.dueDate || ''),
      installments: Number(merged.installments ?? resolveProcedureInstallments(payload)) || 1,
      amount: resolveProcedureAmount(payload),
      paidAmount: roundMoney(merged.paidAmount ?? 0),
      remainingAmount: roundMoney(merged.remainingAmount ?? resolveProcedureAmount(payload)),
    };
  }
  return {
    ...merged,
    financeEntryId: legacyAccount.id,
    accountId: legacyAccount.id,
    paymentStatus: legacyAccount.paymentStatus,
    paymentMethod: legacyAccount.paymentMethod || legacyAccount.paymentMethodDetail || legacyAccount.metodoPagamento || '',
    paymentMethodDetail: legacyAccount.paymentMethodDetail || legacyAccount.paymentMethod || legacyAccount.metodoPagamento || '',
    dueDate: legacyAccount.dueDate || legacyAccount.vencimento || '',
    paidAt: legacyAccount.paidAt || null,
    installments: Number(legacyAccount.installmentsCount || merged.installments || 1) || 1,
    amount: roundMoney(legacyAccount.totalAmount ?? legacyAccount.valor ?? resolveProcedureAmount(payload)),
    paidAmount: roundMoney(legacyAccount.paidAmount ?? 0),
    remainingAmount: roundMoney(legacyAccount.remainingAmount ?? 0),
    status: legacyAccount.status || '',
  };
};

const syncProcedureFinancialAccount = async ({
  clinicId,
  patient = {},
  procedureRow = {},
  payload = {},
  allowPaymentRegistration = true,
} = {}) => {
  const linkedAccount = pickLinkedFinancialAccount(procedureRow)
    || await financialRepository.findFinancialAccountByExternalReference({
      clinicId,
      externalReference: cleanText(procedureRow?.externalId || payload?.id || payload?.externalId),
    });
  const amount = resolveProcedureSyncAmount({ payload, procedureRow, linkedAccount });
  const shouldGenerate = shouldGenerateProcedureFinance({
    payload,
    amount,
    status: payload?.status || procedureRow?.status,
  });

  if (!shouldGenerate) {
    if (linkedAccount) {
      const hasPayments = Array.isArray(linkedAccount?.transactions) && linkedAccount.transactions.some((item) => roundMoney(item?.amount) > 0);
      if (hasPayments) {
        const cancelled = await financialService.updateFinancialAccount({
          clinicId,
          accountId: linkedAccount.id,
          payload: {
            status: 'CANCELED',
            metadata: {
              ...(linkedAccount.metadata && typeof linkedAccount.metadata === 'object' ? linkedAccount.metadata : {}),
              origin: PROCEDURE_FINANCIAL_SOURCE,
              category: PROCEDURE_FINANCIAL_CATEGORY,
            },
          },
        });
        return { financeAccount: cancelled, financeId: cleanText(cancelled?.id), financeWarning: '' };
      }
      await financialService.deleteFinancialAccount({ clinicId, accountId: linkedAccount.id });
    }
    return { financeAccount: null, financeId: '', financeWarning: '' };
  }

  const procedureName = cleanText(
    procedureRow?.name
    || payload?.nome
    || payload?.tipo
    || payload?.procedimento
    || 'Procedimento'
  );
  const dentistId = cleanText(procedureRow?.dentistId || payload?.dentistaId);
  const dentistName = cleanText(procedureRow?.dentistName || payload?.dentistaNome);
  const dueDate = buildProcedureDueDate(payload, procedureRow?.registeredAt || new Date());
  const requestedPaymentStatus = normalizeProcedurePaymentStatus(payload?.financeiro?.paymentStatus || payload?.paymentStatus || payload?.statusPagamento);
  const paymentStatus = allowPaymentRegistration ? requestedPaymentStatus : 'PENDING';
  const paidAt = paymentStatus === 'PAID' ? buildProcedurePaidAt(payload) : null;
  const paymentMethod = normalizeProcedurePaymentMethod(payload?.financeiro?.paymentMethod || payload?.paymentMethod || payload?.metodoPagamento || 'PIX');
  const financePayload = {
    patientId: cleanText(patient?.id || procedureRow?.patientId),
    patientProcedureId: cleanText(procedureRow?.id),
    procedureId: cleanText(procedureRow?.externalId || payload?.id || payload?.externalId),
    externalReference: cleanText(procedureRow?.externalId || payload?.id || payload?.externalId),
    patientName: cleanText(patient?.nome || payload?.pacienteNome || ''),
    prontuario: cleanText(patient?.id || procedureRow?.patientId || payload?.prontuario || ''),
    procedureName,
    description: `Procedimento: ${procedureName}`,
    totalAmount: amount,
    valor: amount,
    category: PROCEDURE_FINANCIAL_CATEGORY,
    categoria: PROCEDURE_FINANCIAL_CATEGORY,
    source: PROCEDURE_FINANCIAL_SOURCE,
    origem: PROCEDURE_FINANCIAL_SOURCE,
    type: 'receita',
    tipo: 'receita',
    dueDate,
    vencimento: dueDate,
    status: paymentStatus === 'PAID' ? 'PAID' : 'OPEN',
    paymentStatus,
    paidAt,
    paymentMethod,
    parcelas: resolveProcedureInstallments(payload),
    dentistaId: dentistId,
    dentistaNome: dentistName,
    metadata: {
      prontuario: cleanText(patient?.id || procedureRow?.patientId || ''),
      patientName: cleanText(patient?.nome || ''),
      procedureName,
      procedureId: cleanText(procedureRow?.externalId || payload?.id || payload?.externalId),
      dentistId,
      dentistName,
      funcionario: dentistName,
      category: PROCEDURE_FINANCIAL_CATEGORY,
      origin: PROCEDURE_FINANCIAL_SOURCE,
      type: 'receita',
      data: dueDate.toISOString().slice(0, 10),
      paymentStatus,
      paidAt: paidAt ? paidAt.toISOString() : null,
    },
  };

  let financeAccount = linkedAccount
    ? await financialService.updateFinancialAccount({
      clinicId,
      accountId: linkedAccount.id,
      payload: financePayload,
    })
    : await financialService.createFinancialAccount({
      clinicId,
      payload: financePayload,
    });

  const previousPaidAmount = sumLinkedAccountPayments(linkedAccount);
  const shouldRegisterAutomaticPayment = allowPaymentRegistration
    && paymentStatus === 'PAID'
    && roundMoney(financeAccount?.remainingAmount ?? amount) > 0
    && previousPaidAmount < roundMoney(amount);

  if (shouldRegisterAutomaticPayment) {
    financeAccount = await financialService.registerPayment({
      clinicId,
      accountId: financeAccount.id,
      amount: roundMoney(financeAccount?.remainingAmount ?? amount),
      method: paymentMethod,
      paidAt,
      metadata: {
        origin: PROCEDURE_FINANCIAL_SOURCE,
        category: PROCEDURE_FINANCIAL_CATEGORY,
        procedureId: cleanText(procedureRow?.externalId || payload?.id || payload?.externalId),
        patientProcedureId: cleanText(procedureRow?.id),
        idempotencyKey: buildProcedurePaymentIdempotencyKey({
          procedureRow,
          payload,
          amount: roundMoney(financeAccount?.remainingAmount ?? amount),
        }),
      },
    });
  }

  return {
    financeAccount,
    financeId: cleanText(financeAccount?.id),
    financeWarning: '',
  };
};

const mapProcedureToLegacy = (row = {}) => {
  const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
  const linkedFinance = mapLinkedFinanceToLegacy(row, payload);
  const resolvedName = row.name || payload.nome || payload.tipo || payload.procedimento || '';
  const resolvedStatus = normalizeProcedureStatus(row.status || payload.status || payload.estado || payload.situacao || 'a-realizar');
  const resolvedTeeth = normalizeProcedureTeeth(payload.dentes || row.tooth || payload.dente);
  const resolvedAmount = resolveProcedureAmount(payload);
  return {
    ...payload,
    id: row.externalId || row.id,
    centralProcedureId: row.id,
    patientId: row.patientId,
    clinicId: row.clinicId,
    appointmentId: row.appointmentId || payload.appointmentId || '',
    codigo: row.procedureCode || payload.codigo || payload.code || '',
    nome: resolvedName,
    tipo: payload.tipo || row.name || payload.nome || '',
    procedimento: payload.procedimento || resolvedName,
    status: resolvedStatus,
    estado: payload.estado || resolvedStatus,
    situacao: payload.situacao || resolvedStatus,
    observacoes: row.observations || payload.observacoes || payload.obs || '',
    dentistaId: row.dentistId || payload.dentistaId || '',
    dentistaNome: row.dentistName || payload.dentistaNome || '',
    dentes: resolvedTeeth,
    dente: row.tooth || payload.dente || resolvedTeeth[0] || '',
    faces: Array.isArray(payload.faces) ? payload.faces : (Array.isArray(row.faces) ? row.faces : []),
    valor: resolvedAmount,
    valorCobrado: roundMoney(payload.valorCobrado ?? resolvedAmount),
    gerarFinanceiro: payload.gerarFinanceiro !== false,
    registeredAt: row.registeredAt ? row.registeredAt.toISOString() : (payload.registeredAt || ''),
    dataRealizacao: row.performedAt ? row.performedAt.toISOString() : (payload.dataRealizacao || ''),
    financeiroId: cleanText(linkedFinance.financeEntryId || payload.financeiroId || ''),
    paymentStatus: cleanText(linkedFinance.paymentStatus || payload.paymentStatus || ''),
    vencimento: cleanText(linkedFinance.dueDate || payload.vencimento || ''),
    financeiro: linkedFinance,
    integracoes: payload.integracoes || {},
  };
};

const mapDocumentToLegacy = (row = {}) => {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const nestedData = metadata?.data && typeof metadata.data === 'object'
    ? metadata.data
    : (
      metadata?.metadata && typeof metadata.metadata === 'object'
        ? metadata.metadata
        : {}
    );
  return {
    id: row.externalDocumentId || row.id,
    centralDocumentId: row.id,
    prontuario: metadata.prontuario || row.patientId || '',
    patientId: row.patientId || metadata.patientId || '',
    category: row.category || metadata.category || metadata.categoria || '',
    categoria: row.category || metadata.categoria || metadata.category || '',
    type: row.type || metadata.type || metadata.tipo || '',
    title: row.title || metadata.title || metadata.titulo || '',
    titulo: row.title || metadata.titulo || metadata.title || '',
    notes: metadata.notes || metadata.observacoes || '',
    folder: metadata.folder || metadata.pasta || '',
    atendimentoId: metadata.atendimentoId || '',
    documentDate: row.documentDate ? row.documentDate.toISOString().split('T')[0] : (metadata.documentDate || ''),
    createdAt: row.createdAt?.toISOString?.() || '',
    updatedAt: metadata.updatedAt || '',
    createdBy: metadata.createdBy || {
      id: row.createdByUserId || '',
      nome: row.createdByName || '',
    },
    updatedBy: metadata.updatedBy || null,
    dentistaId: metadata.dentistaId || '',
    originalName: row.originalName || metadata.originalName || '',
    storedName: row.storedName || metadata.storedName || '',
    extension: row.extension || metadata.extension || '',
    size: row.size ?? metadata.size ?? null,
    sourceJsonName: metadata.sourceJsonName || '',
    sourceJsonSize: metadata.sourceJsonSize ?? null,
    versionOf: metadata.versionOf || row.externalDocumentId || row.id,
    version: Number(metadata.version) || 1,
    isLatest: metadata.isLatest !== false,
    archived: Boolean(row.archived),
    archivedAt: row.archivedAt?.toISOString?.() || null,
    archivedBy: metadata.archivedBy || null,
    localPath: row.localPath || metadata.localPath || '',
    data: nestedData,
    metadata,
  };
};

const sanitizeDocumentPayload = (document = {}) => {
  if (!document || typeof document !== 'object' || Array.isArray(document)) return {};
  const {
    clinicId: _clinicId,
    patientId: _patientId,
    clinicalRecordId: _clinicalRecordId,
    metadata,
    ...rest
  } = document;

  const sanitizedNestedMetadata = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? (({
      clinicId: __clinicId,
      patientId: __patientId,
      clinicalRecordId: __clinicalRecordId,
      ...nestedRest
    }) => nestedRest)(metadata)
    : metadata;

  return {
    ...rest,
    ...(sanitizedNestedMetadata !== undefined ? { metadata: sanitizedNestedMetadata } : {}),
  };
};

const patientClinicalService = {
  getClinicalRecord: async ({ clinicId, patientId }) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const normalizedPatientId = String(patientId || '').trim();
    if (!normalizedClinicId || !normalizedPatientId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId and patientId are required.');
    }
    await assertPatientBelongsToClinic({ clinicId: normalizedClinicId, patientId: normalizedPatientId });
    const record = await patientClinicalRepository.ensureClinicalRecord({
      clinicId: normalizedClinicId,
      patientId: normalizedPatientId,
    });
    return record;
  },

  listProcedures: async ({ clinicId, patientId }) => {
    await patientClinicalService.getClinicalRecord({ clinicId, patientId });
    const rows = await patientClinicalRepository.listProcedures({ clinicId, patientId });
    return rows.map(mapProcedureToLegacy);
  },

  upsertProcedure: async ({ clinicId, patientId, procedure }) => {
    const record = await patientClinicalService.getClinicalRecord({ clinicId, patientId });
    const patient = await patientRepository.findByIdAndClinic(patientId, clinicId);
    const externalId = cleanText(procedure?.id || procedure?.externalId || `proc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

    const payload = { ...(procedure || {}) };
    const existing = await patientClinicalRepository.findProcedureByExternalId({
      clinicId,
      patientId,
      externalId,
    });
    const existingPayload = existing?.payload && typeof existing.payload === 'object' ? existing.payload : {};
    const mergedPayload = existing ? { ...existingPayload, ...payload } : payload;
    const resolvedStatus = normalizeProcedureStatus(payload.status || payload.estado || payload.situacao || existing?.status || existingPayload.status || 'a-realizar');
    const resolvedTeeth = normalizeProcedureTeeth(mergedPayload.dentes || existing?.tooth || mergedPayload.dente);
    const resolvedAmount = resolveProcedureSyncAmount({ payload: mergedPayload, procedureRow: existing || {} });
    const resolvedName = cleanText(
      mergedPayload.nome
      || mergedPayload.tipo
      || mergedPayload.procedimento
      || existing?.name
      || 'Procedimento'
    );
    const payloadWithIdentity = {
      ...mergedPayload,
      id: externalId,
      externalId,
      nome: resolvedName,
      tipo: cleanText(mergedPayload.tipo || mergedPayload.nome || mergedPayload.procedimento || resolvedName),
      dentes: resolvedTeeth,
      dente: cleanText(mergedPayload.dente || resolvedTeeth[0] || ''),
      faces: Array.isArray(mergedPayload.faces) ? mergedPayload.faces.map((item) => cleanText(item)).filter(Boolean) : [],
      status: resolvedStatus,
      valor: resolvedAmount,
      valorCobrado: roundMoney(mergedPayload.valorCobrado ?? resolvedAmount),
      gerarFinanceiro: mergedPayload.gerarFinanceiro !== false,
    };

    const data = {
      clinicId,
      patientId,
      clinicalRecordId: record.id,
      appointmentId: cleanText(mergedPayload.appointmentId) || null,
      externalId,
      procedureCode: cleanText(mergedPayload.codigo || mergedPayload.code) || null,
      name: resolvedName,
      status: resolvedStatus,
      dentistId: cleanText(mergedPayload.dentistaId) || null,
      dentistName: cleanText(mergedPayload.dentistaNome) || null,
      tooth: cleanText(resolvedTeeth[0] || mergedPayload.dente) || null,
      faces: payloadWithIdentity.faces,
      observations: cleanText(mergedPayload.observacoes || mergedPayload.obs || mergedPayload.observacao) || null,
      registeredAt: normalizeIsoDate(mergedPayload.registeredAt || mergedPayload.createdAt || mergedPayload.dataRegistro) || existing?.registeredAt || new Date(),
      performedAt: normalizeIsoDate(mergedPayload.dataRealizacao || mergedPayload.finishedAt),
      financialSnapshot: mergedPayload.financeiro || existing?.financialSnapshot || null,
      payload: payloadWithIdentity,
    };

    if (existing) {
      await patientClinicalRepository.updateProcedure({
        id: existing.id,
        clinicId,
        patientId,
        data,
      });
      let updated = await patientClinicalRepository.findProcedureByExternalId({ clinicId, patientId, externalId });
      let financeId = cleanText(updated?.financialSnapshot?.financeEntryId || '');
      let financeWarning = '';
      try {
        const syncResult = await syncProcedureFinancialAccount({
          clinicId,
          patient,
          procedureRow: updated,
          payload: payloadWithIdentity,
          allowPaymentRegistration: true,
        });
        financeId = cleanText(syncResult?.financeId || financeId);
        financeWarning = cleanText(syncResult?.financeWarning || '');
        const nextSnapshot = buildProcedureFinancialSnapshot({
          payload: payloadWithIdentity,
          financeAccount: syncResult?.financeAccount || null,
          financeId,
          financeWarning,
          amount: resolvedAmount,
        });
        await patientClinicalRepository.updateProcedure({
          id: updated.id,
          clinicId,
          patientId,
          data: {
            financialSnapshot: nextSnapshot,
            payload: {
              ...payloadWithIdentity,
              financeiro: nextSnapshot,
            },
          },
        });
      } catch (error) {
        financeWarning = error?.message || 'Nao foi possivel sincronizar o procedimento no financeiro.';
      }
      updated = await patientClinicalRepository.findProcedureByExternalId({ clinicId, patientId, externalId });
      return {
        service: mapProcedureToLegacy(updated),
        financeId: cleanText(updated?.financialSnapshot?.financeEntryId || financeId),
        financeWarning: cleanText(updated?.financialSnapshot?.warning || financeWarning),
      };
    }

    const created = await patientClinicalRepository.createProcedure(data);
    let financeId = '';
    let financeWarning = '';
    try {
      const syncResult = await syncProcedureFinancialAccount({
        clinicId,
        patient,
        procedureRow: created,
        payload: payloadWithIdentity,
        allowPaymentRegistration: false,
      });
      financeId = cleanText(syncResult?.financeId || '');
      financeWarning = cleanText(syncResult?.financeWarning || '');
      const nextSnapshot = buildProcedureFinancialSnapshot({
        payload: payloadWithIdentity,
        financeAccount: syncResult?.financeAccount || null,
        financeId,
        financeWarning,
        amount: resolvedAmount,
      });
      await patientClinicalRepository.updateProcedure({
        id: created.id,
        clinicId,
        patientId,
        data: {
          financialSnapshot: nextSnapshot,
          payload: {
            ...payloadWithIdentity,
            financeiro: nextSnapshot,
          },
        },
      });
    } catch (error) {
      financeWarning = error?.message || 'Nao foi possivel sincronizar o procedimento no financeiro.';
    }
    const refreshed = await patientClinicalRepository.findProcedureByExternalId({ clinicId, patientId, externalId });
    return {
      service: mapProcedureToLegacy(refreshed),
      financeId: cleanText(refreshed?.financialSnapshot?.financeEntryId || financeId),
      financeWarning: cleanText(refreshed?.financialSnapshot?.warning || financeWarning),
    };
  },

  deleteProcedure: async ({ clinicId, patientId, externalId }) => {
    await patientClinicalService.getClinicalRecord({ clinicId, patientId });
    const existing = await patientClinicalRepository.findProcedureByExternalId({ clinicId, patientId, externalId });
    let financeId = '';
    let financeAction = '';
    let financeWarning = '';
    if (existing) {
      try {
        const linkedAccount = pickLinkedFinancialAccount(existing)
          || await financialRepository.findFinancialAccountByExternalReference({
            clinicId,
            externalReference: cleanText(existing.externalId || externalId),
          });
        if (linkedAccount) {
          financeId = cleanText(linkedAccount.id);
          const hasPayments = Array.isArray(linkedAccount.transactions) && linkedAccount.transactions.some((item) => roundMoney(item?.amount) > 0);
          if (hasPayments) {
            await financialService.updateFinancialAccount({
              clinicId,
              accountId: linkedAccount.id,
              payload: { status: 'CANCELED' },
            });
            financeAction = 'canceled';
          } else {
            await financialService.deleteFinancialAccount({ clinicId, accountId: linkedAccount.id });
            financeAction = 'deleted';
          }
        }
      } catch (error) {
        financeWarning = error?.message || 'Nao foi possivel sincronizar a exclusao do financeiro.';
      }
    }
    const result = await patientClinicalRepository.deleteProcedure({ clinicId, patientId, externalId });
    return {
      success: result.count > 0,
      financeId,
      financeAction,
      financeWarning,
    };
  },

  listDocuments: async ({ clinicId, patientId, includeArchived }) => {
    await patientClinicalService.getClinicalRecord({ clinicId, patientId });
    const rows = await patientClinicalRepository.listDocuments({ clinicId, patientId, includeArchived });
    return rows.map(mapDocumentToLegacy);
  },

  upsertDocumentMetadata: async ({ clinicId, patientId, document }) => {
    const record = await patientClinicalService.getClinicalRecord({ clinicId, patientId });
    const externalDocumentId = String(document?.id || document?.externalDocumentId || '').trim();
    if (!externalDocumentId) throw new AppError(400, 'VALIDATION_ERROR', 'document.id is required.');
    const metadata = sanitizeDocumentPayload(document);
    const existing = await patientClinicalRepository.findDocumentByExternalId({
      clinicId,
      patientId,
      externalDocumentId,
    });

    const data = {
      clinicId,
      patientId,
      clinicalRecordId: record.id,
      externalDocumentId,
      title: String(metadata.title || metadata.titulo || '').trim() || null,
      category: String(metadata.category || metadata.categoria || '').trim() || null,
      type: String(metadata.type || metadata.tipo || '').trim() || null,
      localPath: String(metadata.localPath || '').trim() || null,
      originalName: String(metadata.originalName || '').trim() || null,
      storedName: String(metadata.storedName || '').trim() || null,
      extension: String(metadata.extension || '').trim() || null,
      size: Number.isFinite(Number(metadata.size)) ? Math.trunc(Number(metadata.size)) : null,
      documentDate: normalizeIsoDate(metadata.documentDate),
      archived: Boolean(metadata.archived),
      archivedAt: metadata.archived ? (normalizeIsoDate(metadata.archivedAt) || new Date()) : null,
      createdByUserId: String(metadata?.createdBy?.id || '').trim() || null,
      createdByName: String(metadata?.createdBy?.nome || '').trim() || null,
      metadata,
    };

    if (existing) {
      await patientClinicalRepository.updateDocument({
        id: existing.id,
        clinicId,
        patientId,
        data,
      });
      const updated = await patientClinicalRepository.findDocumentByExternalId({ clinicId, patientId, externalDocumentId });
      return mapDocumentToLegacy(updated);
    }

    const created = await patientClinicalRepository.createDocument(data);
    return mapDocumentToLegacy(created);
  },

  storeDocumentAsset: async ({ clinicId, patientId, externalDocumentId, role, buffer, fileName, contentType }) => {
    await patientClinicalService.getClinicalRecord({ clinicId, patientId });
    return patientDocumentStorageService.storeDocumentAsset({
      clinicId,
      patientId,
      externalDocumentId,
      role,
      buffer,
      fileName,
      contentType,
    });
  },

  getDocumentAsset: async ({ clinicId, patientId, externalDocumentId, role }) => {
    await patientClinicalService.getClinicalRecord({ clinicId, patientId });
    return patientDocumentStorageService.getDocumentAsset({
      clinicId,
      patientId,
      externalDocumentId,
      role,
    });
  },

  listAnamneses: async ({ clinicId, patientId }) => {
    await patientClinicalService.getClinicalRecord({ clinicId, patientId });
    return patientClinicalRepository.listAnamneses({ clinicId, patientId });
  },

  createAnamnesis: async ({ clinicId, patientId, data, sourceDocument }) => {
    const record = await patientClinicalService.getClinicalRecord({ clinicId, patientId });
    let sourceDocumentId = null;
    let sourceDocumentRecord = null;
    if (sourceDocument) {
      const doc = await patientClinicalService.upsertDocumentMetadata({ clinicId, patientId, document: sourceDocument });
      sourceDocumentRecord = doc;
      const docRow = await patientClinicalRepository.findDocumentByExternalId({
        clinicId,
        patientId,
        externalDocumentId: String(doc.id || '').trim(),
      });
      sourceDocumentId = docRow?.id || null;
    }

    const created = await patientClinicalRepository.createAnamnesis({
      clinicId,
      patientId,
      clinicalRecordId: record.id,
      sourceDocumentId,
      title: String(sourceDocument?.title || sourceDocument?.titulo || 'Anamnese').trim(),
      data,
      createdByUserId: String(sourceDocument?.createdBy?.id || '').trim() || null,
      createdByName: String(sourceDocument?.createdBy?.nome || '').trim() || null,
      documentDate: normalizeIsoDate(sourceDocument?.documentDate),
    });
    return {
      record: created,
      sourceDocument: sourceDocumentRecord,
    };
  },

  listClinicalNotes: async ({ clinicId, patientId, noteType }) => {
    await patientClinicalService.getClinicalRecord({ clinicId, patientId });
    return patientClinicalRepository.listClinicalNotes({ clinicId, patientId, noteType });
  },

  createClinicalNote: async ({ clinicId, patientId, noteType, content, sourceDocument }) => {
    const record = await patientClinicalService.getClinicalRecord({ clinicId, patientId });
    let sourceDocumentId = null;
    let sourceDocumentRecord = null;
    if (sourceDocument) {
      const doc = await patientClinicalService.upsertDocumentMetadata({ clinicId, patientId, document: sourceDocument });
      sourceDocumentRecord = doc;
      const docRow = await patientClinicalRepository.findDocumentByExternalId({
        clinicId,
        patientId,
        externalDocumentId: String(doc.id || '').trim(),
      });
      sourceDocumentId = docRow?.id || null;
    }

    const created = await patientClinicalRepository.createClinicalNote({
      clinicId,
      patientId,
      clinicalRecordId: record.id,
      sourceDocumentId,
      noteType: String(noteType || 'EVOLUCAO').trim(),
      title: String(sourceDocument?.title || sourceDocument?.titulo || 'Evolucao').trim(),
      content,
      status: String(content?.status || '').trim() || null,
      createdByUserId: String(sourceDocument?.createdBy?.id || '').trim() || null,
      createdByName: String(sourceDocument?.createdBy?.nome || '').trim() || null,
      noteDate: normalizeIsoDate(sourceDocument?.documentDate),
    });
    return {
      record: created,
      sourceDocument: sourceDocumentRecord,
    };
  },

  updateClinicalNoteBySourceDocument: async ({ clinicId, patientId, sourceDocumentId, content, sourceDocument }) => {
    await patientClinicalService.getClinicalRecord({ clinicId, patientId });
    const existing = await patientClinicalRepository.findClinicalNoteBySourceDocumentId({
      clinicId,
      patientId,
      sourceDocumentId,
    });
    if (!existing) {
      throw new AppError(404, 'CLINICAL_NOTE_NOT_FOUND', 'Clinical note not found.');
    }
    const sourceDocumentRecord = await patientClinicalService.upsertDocumentMetadata({ clinicId, patientId, document: sourceDocument });
    await patientClinicalRepository.updateClinicalNote({
      id: existing.id,
      clinicId,
      patientId,
      data: {
        title: String(sourceDocument?.title || sourceDocument?.titulo || existing.title || 'Evolucao').trim(),
        content,
        status: String(content?.status || '').trim() || null,
        noteDate: normalizeIsoDate(sourceDocument?.documentDate),
      },
    });
    const updated = await patientClinicalRepository.findClinicalNoteBySourceDocumentId({
      clinicId,
      patientId,
      sourceDocumentId,
    });
    return {
      record: updated,
      sourceDocument: sourceDocumentRecord,
    };
  },
};

module.exports = { patientClinicalService, mapProcedureToLegacy, mapDocumentToLegacy };
