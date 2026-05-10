const crypto = require('crypto');
const { AppError } = require('../errors/AppError');
const { campaignRepository } = require('../repositories/campaignRepository');
const { clinicRepository } = require('../repositories/clinicRepository');
const { financialRepository } = require('../repositories/financialRepository');
const { patientRepository } = require('../repositories/patientRepository');
const { planMessageRepository } = require('../repositories/planMessageRepository');
const { messagingDispatchService } = require('./messagingDispatchService');
const { notificationEventService } = require('./notificationEventService');
const { planMessageTemplateService } = require('./planMessageTemplateService');
const { whatsappNgClient } = require('../adapters/whatsappNgClient');
const { ensurePlanFinancialAccount, ensurePlanFinancialAccounts } = require('./planFinancialAccountSyncService');

const PLAN_MESSAGE_SOURCE = 'PLAN';
const PLAN_MESSAGE_ORIGIN = 'TRANSACTIONAL';
const PLAN_MESSAGE_ENTITY_TYPE = 'FINANCIAL_INSTALLMENT';
const PLAN_MESSAGE_DISPATCH_TYPE = 'PLAN_NOTIFICATION';
const DEFAULT_DUE_SOON_DAYS = 3;
const PLAN_CHARGE_EVENT_TYPES = new Set([
  'PLAN_INSTALLMENT_DUE_SOON',
  'PLAN_INSTALLMENT_DUE_TODAY',
  'PLAN_INSTALLMENT_OVERDUE',
]);
const PLAN_MESSAGE_APPROVAL_STATUS = {
  AWAITING_DENTIST_APPROVAL: 'AWAITING_DENTIST_APPROVAL',
  APPROVED: 'APPROVED',
};
const RETRYABLE_NG_ERROR_CODES = new Set([
  'WHATSAPP_NG_NOT_READY',
  'WHATSAPP_NG_TIMEOUT',
  'WHATSAPP_NG_UNAVAILABLE',
]);

const cleanText = (value) => String(value || '').trim();
const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

const toDate = (value) => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toDateOnly = (value) => {
  const parsed = toDate(value);
  return parsed ? parsed.toISOString().slice(0, 10) : '';
};

const normalizePhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55')) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
};

const normalizePlanMessageEventType = (value) => {
  const normalized = cleanText(value).toUpperCase();
  if ([
    'PLAN_INSTALLMENT_DUE_SOON',
    'PLAN_INSTALLMENT_DUE_TODAY',
    'PLAN_INSTALLMENT_OVERDUE',
    'PLAN_PAYMENT_CONFIRMED',
  ].includes(normalized)) return normalized;
  throw new AppError(400, 'PLAN_MESSAGE_EVENT_INVALID', 'Unsupported plan message event.');
};

const normalizePlanMessageStatus = (value) => {
  const normalized = cleanText(value).toUpperCase();
  if (['CREATED', 'PENDING', 'SENT', 'FAILED', 'BLOCKED'].includes(normalized)) return normalized;
  return 'CREATED';
};

const sumTransactionAmount = (transactions = [], matcher = null) => roundMoney(
  (Array.isArray(transactions) ? transactions : []).reduce((acc, item) => {
    if (typeof matcher === 'function' && !matcher(item)) return acc;
    return acc + roundMoney(item?.amount || 0);
  }, 0),
);

const deriveInstallmentSnapshot = (row = {}, transactions = [], now = new Date()) => {
  const dueDate = toDateOnly(row.dueDate);
  const due = dueDate ? new Date(`${dueDate}T23:59:59.999Z`) : null;
  const amount = roundMoney(row.amount);
  const paidAmount = sumTransactionAmount(transactions, (item) => cleanText(item?.installmentId) === cleanText(row.id));
  const remainingAmount = roundMoney(Math.max(0, amount - paidAmount));

  let derivedStatus = cleanText(row.status).toUpperCase() || 'PENDING';
  if (derivedStatus === 'CANCELED') derivedStatus = 'CANCELED';
  else if (remainingAmount <= 0 && amount > 0) derivedStatus = 'PAID';
  else if (paidAmount > 0) derivedStatus = due && due < now ? 'OVERDUE' : 'PARTIAL';
  else if (derivedStatus === 'PENDING' && due && due < now) derivedStatus = 'OVERDUE';

  return {
    id: cleanText(row.id),
    sequence: Number(row.sequence || 0),
    dueDate,
    amount,
    paidAmount,
    remainingAmount,
    status: derivedStatus,
    paidAt: remainingAmount <= 0 && row.paidAt ? new Date(row.paidAt).toISOString() : null,
  };
};

const deriveDueState = (installment = {}, dueSoonDays = DEFAULT_DUE_SOON_DAYS, now = new Date()) => {
  const status = cleanText(installment.status).toUpperCase();
  if (status === 'PAID') return 'paid';
  if (status === 'CANCELED') return 'cancelled';
  const dueDate = toDate(installment.dueDate ? `${installment.dueDate}T12:00:00.000Z` : null);
  if (!dueDate) return 'none';
  const today = toDate(`${toDateOnly(now)}T12:00:00.000Z`);
  const diffDays = Math.round((dueDate.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return 'overdue';
  if (diffDays === 0) return 'due_today';
  if (diffDays <= Math.max(1, Number(dueSoonDays) || DEFAULT_DUE_SOON_DAYS)) return 'due_soon';
  return 'future';
};

const resolveRecommendedEventType = (installment = {}, dueSoonDays = DEFAULT_DUE_SOON_DAYS, now = new Date()) => {
  const state = deriveDueState(installment, dueSoonDays, now);
  if (state === 'paid') return 'PLAN_PAYMENT_CONFIRMED';
  if (state === 'overdue') return 'PLAN_INSTALLMENT_OVERDUE';
  if (state === 'due_today') return 'PLAN_INSTALLMENT_DUE_TODAY';
  if (state === 'due_soon') return 'PLAN_INSTALLMENT_DUE_SOON';
  return '';
};

const extractPlanIdFromAccount = (account = {}) => {
  const externalReference = cleanText(account?.externalReference || '');
  if (externalReference.toLowerCase().startsWith('plan:')) {
    return cleanText(externalReference.slice(5));
  }
  const metadata = account?.metadata && typeof account.metadata === 'object' ? account.metadata : {};
  return cleanText(metadata.planId || '');
};

const normalizeSchedulerLimit = (value, fallback = 200) => {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(1000, Math.round(parsed)));
};

const buildLogicalIdempotencyKey = ({ clinicId, financialAccountId, installmentSequence, eventType }) => [
  cleanText(clinicId),
  cleanText(financialAccountId),
  String(Number(installmentSequence) || 0),
  normalizePlanMessageEventType(eventType),
].join(':');

const buildDispatchIdempotencyKey = ({ logicalKey, attempt }) => `${cleanText(logicalKey)}:attempt:${Math.max(1, Number(attempt) || 1)}`;

const pickAccountBillingContext = (account = {}) => {
  const metadata = account?.metadata && typeof account.metadata === 'object' ? account.metadata : {};
  return {
    externalBillingReference: cleanText(metadata.externalBillingReference || metadata.billingReference || account.externalReference || ''),
    paymentUrl: cleanText(metadata.paymentUrl || metadata.paymentLink || ''),
    barcode: cleanText(metadata.barcode || metadata.boletoBarcode || ''),
  };
};

const logPlanMessage = (action, payload = {}) => {
  console.info('[PLAN_MESSAGE]', JSON.stringify({
    action,
    ...payload,
    plan_message_source: 'central',
  }));
};

const extractEventPayload = (event = {}) => (
  event?.payload && typeof event.payload === 'object'
    ? event.payload
    : {}
);

const isPlanChargeEventType = (eventType) => PLAN_CHARGE_EVENT_TYPES.has(cleanText(eventType).toUpperCase());

const getApprovalState = (event = {}) => {
  const payload = extractEventPayload(event);
  return payload?.approvalState && typeof payload.approvalState === 'object'
    ? payload.approvalState
    : {};
};

const isAwaitingDentistApproval = (event = {}) => (
  cleanText(getApprovalState(event)?.status).toUpperCase() === PLAN_MESSAGE_APPROVAL_STATUS.AWAITING_DENTIST_APPROVAL
);

const isRetryableNgTransportError = (error = {}) => {
  const code = cleanText(error?.code).toUpperCase();
  if (RETRYABLE_NG_ERROR_CODES.has(code)) return true;
  const status = Number(error?.status || error?.statusCode || 0);
  return [502, 503, 504].includes(status) && /whatsapp ng/i.test(cleanText(error?.message));
};

const isRetryableBlockedEvent = (event = {}) => {
  if (normalizePlanMessageStatus(event?.status) !== 'BLOCKED') return false;
  if (isAwaitingDentistApproval(event)) return false;
  const payload = extractEventPayload(event);
  const dispatchState = payload?.dispatchState && typeof payload.dispatchState === 'object'
    ? payload.dispatchState
    : {};
  const blockedReasonCode = cleanText(dispatchState.blockedReasonCode || dispatchState.failureCode).toUpperCase();
  return dispatchState.retryable === true || RETRYABLE_NG_ERROR_CODES.has(blockedReasonCode);
};

const shouldLockEventForIdempotency = (event = {}) => {
  const status = normalizePlanMessageStatus(event?.status);
  if (status === 'PENDING' || status === 'SENT') return true;
  if (status === 'BLOCKED') return !isRetryableBlockedEvent(event);
  return false;
};

const getIdempotencyBlockReason = (event = {}) => {
  const status = normalizePlanMessageStatus(event?.status);
  if (status === 'PENDING') {
    return 'Evento equivalente ja possui envio em andamento para esta parcela.';
  }
  if (status === 'SENT') {
    return 'Evento equivalente ja possui envio registrado para esta parcela.';
  }
  if (status === 'BLOCKED' && !isRetryableBlockedEvent(event)) {
    if (isAwaitingDentistApproval(event)) {
      return 'Aguardando aprovacao do dentista antes de enviar cobranca ao paciente.';
    }
    return cleanText(event?.lastError) || 'Evento equivalente ja foi bloqueado para esta parcela.';
  }
  return '';
};

const createNotificationEvent = async (type, payload = {}) => notificationEventService.create({
  clinicId: cleanText(payload.clinicId),
  patientId: cleanText(payload.patientId) || null,
  phone: cleanText(payload.phone) || null,
  type,
  payload,
});

const resolvePlanContext = async ({ clinicId, planId }) => {
  const normalizedClinicId = cleanText(clinicId);
  const normalizedPlanId = cleanText(planId);
  if (!normalizedClinicId || !normalizedPlanId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'clinicId and planId are required.');
  }

  const [plan, clinic] = await Promise.all([
    financialRepository.findPatientPlanByIdAndClinic({ clinicId: normalizedClinicId, planId: normalizedPlanId }),
    clinicRepository.findById(normalizedClinicId),
  ]);
  if (!plan) throw new AppError(404, 'PATIENT_PLAN_NOT_FOUND', 'Patient plan not found.');

  let [patient, account] = await Promise.all([
    patientRepository.findById(cleanText(plan.patientId)),
    financialRepository.findPlanFinancialAccountByPlanId({ clinicId: normalizedClinicId, planId: normalizedPlanId }),
  ]);
  if (!patient || cleanText(patient.clinicId) !== normalizedClinicId) {
    throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient not found for plan.');
  }
  if (!account) {
    account = await ensurePlanFinancialAccount({
      clinicId: normalizedClinicId,
      planRow: {
        ...plan,
        patient,
      },
    });
  }
  if (!account) {
    throw new AppError(404, 'PLAN_FINANCIAL_ACCOUNT_NOT_FOUND', 'Financial account linked to plan not found.');
  }

  const installments = Array.isArray(account.installments)
    ? account.installments.map((item) => deriveInstallmentSnapshot(item, account.transactions || []))
    : [];

  return {
    clinicId: normalizedClinicId,
    clinic,
    plan,
    patient,
    account,
    installments,
    billing: pickAccountBillingContext(account),
  };
};

const findInstallmentInContext = (context, installmentId) => {
  const normalizedInstallmentId = cleanText(installmentId);
  if (!normalizedInstallmentId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'installmentId is required.');
  }
  const installment = (context?.installments || []).find((item) => cleanText(item.id) === normalizedInstallmentId);
  if (!installment) {
    throw new AppError(404, 'PLAN_INSTALLMENT_NOT_FOUND', 'Installment not found for plan.');
  }
  return installment;
};

const buildEventPayload = ({ context, installment, eventType }) => {
  const billing = context.billing || {};
  const clinicName = cleanText(context?.clinic?.nomeFantasia || context?.clinic?.razaoSocial || 'Voithos');
  const patientName = cleanText(context?.patient?.nome || 'Paciente');
  const planName = cleanText(context?.plan?.name || 'Plano odontologico');
  const rendered = planMessageTemplateService.render({
    eventType,
    patientName,
    clinicName,
    planName,
    amount: installment.amount,
    dueDate: installment.dueDate,
    paymentUrl: billing.paymentUrl,
  });

  return {
    templateKey: rendered.templateKey,
    templateVersion: rendered.templateVersion,
    body: rendered.body,
    auditBody: rendered.auditBody,
    payload: {
      clinicName,
      patientName,
      planName,
      amount: installment.amount,
      dueDate: installment.dueDate,
      paymentMethod: cleanText(context?.account?.paymentMethod || ''),
      externalBillingReference: billing.externalBillingReference || null,
      paymentUrl: billing.paymentUrl || null,
      barcode: billing.barcode || null,
    },
  };
};

const buildHistoryItem = ({ event, dispatch }) => ({
  id: cleanText(event?.id),
  planId: cleanText(event?.planId),
  patientId: cleanText(event?.patientId),
  financialAccountId: cleanText(event?.financialAccountId),
  installmentId: cleanText(event?.installmentId),
  installmentSequence: Number(event?.installmentSequence || 0),
  eventType: cleanText(event?.eventType),
  status: normalizePlanMessageStatus(event?.status),
  templateKey: cleanText(event?.templateKey),
  templateVersion: Number(event?.templateVersion || 1),
  dueDate: event?.dueDate ? new Date(event.dueDate).toISOString() : null,
  amount: Number(event?.amount || 0),
  paymentMethod: cleanText(event?.paymentMethod),
  externalBillingReference: cleanText(event?.externalBillingReference),
  paymentUrl: cleanText(event?.paymentUrl),
  barcode: cleanText(event?.barcode),
  latestBatchId: cleanText(event?.latestBatchId),
  latestDispatchId: cleanText(event?.latestDispatchId),
  attemptCount: Number(event?.attemptCount || 0),
  manualResendCount: Number(event?.manualResendCount || 0),
  lastAttemptAt: event?.lastAttemptAt ? new Date(event.lastAttemptAt).toISOString() : null,
  sentAt: event?.sentAt ? new Date(event.sentAt).toISOString() : null,
  failedAt: event?.failedAt ? new Date(event.failedAt).toISOString() : null,
  blockedAt: event?.blockedAt ? new Date(event.blockedAt).toISOString() : null,
  lastError: cleanText(event?.lastError),
  failureCode: cleanText(extractEventPayload(event)?.dispatchState?.blockedReasonCode),
  retryable: Boolean(extractEventPayload(event)?.dispatchState?.retryable),
  approvalRequired: isAwaitingDentistApproval(event),
  approvalStatus: cleanText(getApprovalState(event)?.status),
  approvedBy: cleanText(getApprovalState(event)?.approvedBy),
  approvedAt: cleanText(getApprovalState(event)?.approvedAt),
  provider: cleanText(dispatch?.provider),
  providerMessageId: cleanText(dispatch?.providerMessageId),
  bodyPreview: cleanText(dispatch?.bodyRedacted || dispatch?.body),
  createdAt: event?.createdAt ? new Date(event.createdAt).toISOString() : null,
  updatedAt: event?.updatedAt ? new Date(event.updatedAt).toISOString() : null,
});

const listHistoryWithDispatches = async ({ clinicId, planId }) => {
  const events = await planMessageRepository.listByPlan({ clinicId, planId });
  const dispatches = await Promise.all((events || []).map((item) => (
    cleanText(item?.latestDispatchId)
      ? campaignRepository.findDispatchByIdAndClinic({ clinicId, dispatchId: cleanText(item.latestDispatchId) })
      : Promise.resolve(null)
  )));

  return (events || []).map((event, index) => buildHistoryItem({ event, dispatch: dispatches[index] || null }));
};

const createDispatchArtifacts = async ({
  clinicId,
  patient,
  eventType,
  planMessageEvent,
  installment,
  content,
  actorName,
}) => {
  const snapshotId = crypto.randomUUID();
  const memberId = crypto.randomUUID();
  const batchId = crypto.randomUUID();
  const dispatchId = crypto.randomUUID();
  const attemptNumber = Math.max(Number(planMessageEvent?.attemptCount || 0) + 1, 1);
  const phone = normalizePhone(patient?.telefone || patient?.celular || patient?.whatsapp || '');

  const { snapshot, members } = await campaignRepository.createAudienceSnapshotWithMembers({
    snapshot: {
      id: snapshotId,
      clinicId,
      campaignId: null,
      segmentKey: `plan:${cleanText(eventType).toLowerCase()}`,
      filters: {
        patientId: cleanText(patient?.id),
        planId: cleanText(planMessageEvent?.planId),
        installmentId: cleanText(installment?.id),
      },
      totalRecipients: 1,
      includedRecipients: phone ? 1 : 0,
      blockedRecipients: phone ? 0 : 1,
      source: PLAN_MESSAGE_SOURCE,
      summary: {
        sourceType: PLAN_MESSAGE_SOURCE,
        originType: PLAN_MESSAGE_ORIGIN,
        eventType,
        entityType: PLAN_MESSAGE_ENTITY_TYPE,
        entityId: cleanText(installment?.id),
      },
      createdByName: cleanText(actorName) || 'system',
    },
    members: [{
      id: memberId,
      clinicId,
      patientId: cleanText(patient?.id),
      patientName: cleanText(patient?.nome),
      phone,
      allowsMessages: patient?.allowsMessages !== false,
      included: Boolean(phone),
      status: phone ? 'INCLUDED' : 'BLOCKED',
      reasonCode: phone ? null : 'PATIENT_PHONE_MISSING',
      reasonLabel: phone ? null : 'Paciente sem telefone valido para envio.',
      metadata: {
        eventType,
        planId: cleanText(planMessageEvent?.planId),
        financialAccountId: cleanText(planMessageEvent?.financialAccountId),
        installmentSequence: Number(installment?.sequence || 0),
      },
    }],
  });

  const member = Array.isArray(members) ? members[0] : null;
  if (!member) {
    throw new AppError(500, 'PLAN_MESSAGE_MEMBER_CREATE_FAILED', 'Unable to create plan message audience.');
  }

  const created = await campaignRepository.createBatchWithDispatches({
    batch: {
      id: batchId,
      clinicId,
      campaignId: null,
      audienceSnapshotId: snapshot.id,
      channel: 'WHATSAPP',
      status: 'CREATED',
      sourceType: PLAN_MESSAGE_SOURCE,
      originType: PLAN_MESSAGE_ORIGIN,
      eventType,
      entityType: PLAN_MESSAGE_ENTITY_TYPE,
      entityId: cleanText(installment?.id),
      totalRecipients: 1,
      processedCount: 0,
      successCount: 0,
      failedCount: 0,
      blockedCount: 0,
      pendingCount: 1,
      createdByName: cleanText(actorName) || 'system',
      metadata: {
        planId: cleanText(planMessageEvent?.planId),
        financialAccountId: cleanText(planMessageEvent?.financialAccountId),
        installmentSequence: Number(installment?.sequence || 0),
      },
    },
    dispatches: [{
      id: dispatchId,
      clinicId,
      campaignId: null,
      audienceSnapshotId: snapshot.id,
      audienceMemberId: member.id,
      channel: 'WHATSAPP',
      status: 'PENDING',
      dispatchType: PLAN_MESSAGE_DISPATCH_TYPE,
      sourceType: PLAN_MESSAGE_SOURCE,
      originType: PLAN_MESSAGE_ORIGIN,
      eventType,
      entityType: PLAN_MESSAGE_ENTITY_TYPE,
      entityId: cleanText(installment?.id),
      patientId: cleanText(patient?.id),
      patientName: cleanText(patient?.nome),
      phone: phone || '',
      body: content.body,
      bodyRedacted: content.auditBody,
      idempotencyKey: buildDispatchIdempotencyKey({
        logicalKey: cleanText(planMessageEvent?.idempotencyKey),
        attempt: attemptNumber,
      }),
      metadata: {
        planMessageEventId: cleanText(planMessageEvent?.id),
        attemptNumber,
        replyEnabled: false,
        noReplyExpected: true,
      },
    }],
  });

  return {
    snapshot,
    member,
    batch: created.batch,
    dispatch: Array.isArray(created.dispatches) ? created.dispatches[0] : null,
    phone,
    attemptNumber,
  };
};

const updatePlanMessageEventFromStatus = async ({
  event,
  status,
  batchId,
  dispatchId,
  errorMessage = '',
  manualResend = false,
  provider = '',
  providerMessageId = '',
  payloadPatch = null,
}) => {
  const now = new Date();
  return planMessageRepository.update({
    clinicId: cleanText(event?.clinicId),
    planMessageId: cleanText(event?.id),
    data: {
      status,
      latestBatchId: batchId || event.latestBatchId || null,
      latestDispatchId: dispatchId || event.latestDispatchId || null,
      attemptCount: Math.max(Number(event?.attemptCount || 0) + 1, 1),
      manualResendCount: manualResend ? Math.max(Number(event?.manualResendCount || 0) + 1, 1) : Number(event?.manualResendCount || 0),
      lastAttemptAt: now,
      sentAt: status === 'SENT' ? now : event.sentAt,
      failedAt: status === 'FAILED' ? now : event.failedAt,
      blockedAt: status === 'BLOCKED' ? now : event.blockedAt,
      lastError: status === 'FAILED' || status === 'BLOCKED'
        ? cleanText(errorMessage) || event.lastError || 'Plan message dispatch failed.'
        : null,
      payload: {
        ...extractEventPayload(event),
        provider: provider || undefined,
        providerMessageId: providerMessageId || undefined,
        ...(payloadPatch && typeof payloadPatch === 'object' ? payloadPatch : {}),
      },
    },
  });
};

const planMessageService = {
  listHistory: async ({ clinicId, planId }) => {
    const context = await resolvePlanContext({ clinicId, planId });
    const history = await listHistoryWithDispatches({ clinicId: context.clinicId, planId: cleanText(context.plan.id) });

    logPlanMessage('plan_message_history_loaded', {
      clinicId: context.clinicId,
      planId: cleanText(context.plan.id),
      patientId: cleanText(context.patient.id),
      financialAccountId: cleanText(context.account.id),
      count: history.length,
    });

    return {
      planId: cleanText(context.plan.id),
      patientId: cleanText(context.patient.id),
      financialAccountId: cleanText(context.account.id),
      items: history,
    };
  },

  listSuggestions: async ({ clinicId, planId, dueSoonDays = DEFAULT_DUE_SOON_DAYS }) => {
    const context = await resolvePlanContext({ clinicId, planId });
    const history = await planMessageRepository.listByPlan({ clinicId: context.clinicId, planId: cleanText(context.plan.id) });
    const historyMap = new Map(history.map((item) => [cleanText(item.idempotencyKey), item]));

    return {
      planId: cleanText(context.plan.id),
      patientId: cleanText(context.patient.id),
      financialAccountId: cleanText(context.account.id),
      items: context.installments.map((installment) => {
        const recommendedEventType = resolveRecommendedEventType(installment, dueSoonDays);
        const logicalKey = recommendedEventType
          ? buildLogicalIdempotencyKey({
            clinicId: context.clinicId,
            financialAccountId: context.account.id,
            installmentSequence: installment.sequence,
            eventType: recommendedEventType,
          })
          : '';
        const existing = logicalKey ? historyMap.get(logicalKey) : null;
        const dueState = deriveDueState(installment, dueSoonDays);
        const alreadyNotified = shouldLockEventForIdempotency(existing);
        const retryable = isRetryableBlockedEvent(existing);
        const awaitingApproval = isAwaitingDentistApproval(existing);

        return {
          installmentId: cleanText(installment.id),
          installmentSequence: Number(installment.sequence || 0),
          dueDate: installment.dueDate,
          amount: Number(installment.amount || 0),
          remainingAmount: Number(installment.remainingAmount || 0),
          installmentStatus: cleanText(installment.status),
          dueState,
          recommendedEventType,
          alreadyNotified,
          historyStatus: normalizePlanMessageStatus(existing?.status),
          lastEventId: cleanText(existing?.id),
          blockReason: alreadyNotified ? getIdempotencyBlockReason(existing) : '',
          retryableBlocked: retryable,
          approvalRequired: isPlanChargeEventType(recommendedEventType),
          awaitingApproval,
          paymentUrl: context.billing.paymentUrl || '',
        };
      }),
    };
  },

  send: async ({ clinicId, planId, installmentId, eventType, actorName = 'system', manualResend = false, approvedByDentist = false } = {}) => {
    const context = await resolvePlanContext({ clinicId, planId });
    const installment = findInstallmentInContext(context, installmentId);
    const normalizedEventType = normalizePlanMessageEventType(eventType);
    const recommendedEventType = resolveRecommendedEventType(installment);
    if (!manualResend && recommendedEventType && normalizedEventType !== recommendedEventType) {
      throw new AppError(400, 'PLAN_MESSAGE_EVENT_MISMATCH', 'Event type is not valid for the current installment state.');
    }
    if (normalizedEventType === 'PLAN_PAYMENT_CONFIRMED' && cleanText(installment.status) !== 'PAID') {
      throw new AppError(400, 'PLAN_MESSAGE_PAYMENT_NOT_CONFIRMED', 'Installment payment is not confirmed yet.');
    }

    const logicalKey = buildLogicalIdempotencyKey({
      clinicId: context.clinicId,
      financialAccountId: context.account.id,
      installmentSequence: installment.sequence,
      eventType: normalizedEventType,
    });

    let event = await planMessageRepository.findByIdempotencyKey({
      clinicId: context.clinicId,
      idempotencyKey: logicalKey,
    });

    const approvedForPatientSend = approvedByDentist === true || manualResend === true;
    const requiresApproval = isPlanChargeEventType(normalizedEventType);

    if (event && !approvedForPatientSend && !manualResend && shouldLockEventForIdempotency(event)) {
      const blockReason = getIdempotencyBlockReason(event) || 'IDEMPOTENT_ALREADY_NOTIFIED';
      logPlanMessage('plan_message_dispatch_blocked', {
        clinicId: context.clinicId,
        planId: cleanText(context.plan.id),
        patientId: cleanText(context.patient.id),
        financialAccountId: cleanText(context.account.id),
        installmentSequence: Number(installment.sequence || 0),
        eventType: normalizedEventType,
        status: normalizePlanMessageStatus(event.status),
        failureReason: blockReason,
      });
      return {
        blocked: true,
        reason: blockReason,
        awaitingApproval: isAwaitingDentistApproval(event),
        event: buildHistoryItem({ event, dispatch: null }),
      };
    }

    const billing = context.billing || {};
    const content = buildEventPayload({ context, installment, eventType: normalizedEventType });
    const phone = normalizePhone(context.patient?.telefone || context.patient?.celular || context.patient?.whatsapp || '');
    const allowsMessages = context.patient?.allowsMessages !== false;

    if (!event) {
      event = await planMessageRepository.create({
        id: crypto.randomUUID(),
        clinicId: context.clinicId,
        patientId: cleanText(context.patient.id),
        planId: cleanText(context.plan.id),
        financialAccountId: cleanText(context.account.id),
        installmentId: cleanText(installment.id) || null,
        installmentSequence: Number(installment.sequence || 0),
        eventType: normalizedEventType,
        status: 'CREATED',
        templateKey: content.templateKey,
        templateVersion: content.templateVersion,
        dueDate: installment.dueDate ? new Date(`${installment.dueDate}T12:00:00.000Z`) : null,
        amount: installment.amount,
        paymentMethod: cleanText(context.account.paymentMethod || ''),
        externalBillingReference: billing.externalBillingReference || null,
        paymentUrl: billing.paymentUrl || null,
        barcode: billing.barcode || null,
        idempotencyKey: logicalKey,
        payload: {
          ...content.payload,
          installmentId: cleanText(installment.id),
          installmentSequence: Number(installment.sequence || 0),
          ...(requiresApproval
            ? {
                approvalState: {
                  status: PLAN_MESSAGE_APPROVAL_STATUS.AWAITING_DENTIST_APPROVAL,
                  requestedAt: new Date().toISOString(),
                  requestedBy: cleanText(actorName) || 'system',
                },
              }
            : {}),
        },
      });
    }

    if (requiresApproval && !approvedForPatientSend) {
      const approvalEvent = await planMessageRepository.update({
        clinicId: context.clinicId,
        planMessageId: cleanText(event.id),
        data: {
          status: 'BLOCKED',
          blockedAt: event.blockedAt || new Date(),
          lastError: 'Aguardando aprovacao do dentista antes de enviar cobranca ao paciente.',
          payload: {
            ...extractEventPayload(event),
            approvalState: {
              ...(getApprovalState(event) || {}),
              status: PLAN_MESSAGE_APPROVAL_STATUS.AWAITING_DENTIST_APPROVAL,
              requestedAt: cleanText(getApprovalState(event)?.requestedAt) || new Date().toISOString(),
              requestedBy: cleanText(getApprovalState(event)?.requestedBy) || cleanText(actorName) || 'system',
            },
            dispatchState: {
              retryable: false,
              blockedReasonCode: 'DENTIST_APPROVAL_REQUIRED',
              blockedReason: 'Aguardando aprovacao do dentista antes de enviar cobranca ao paciente.',
              transport: 'INTERNAL_APPROVAL',
            },
          },
        },
      });

      await createNotificationEvent('PLAN_MESSAGE_DENTIST_APPROVAL_REQUIRED', {
        clinicId: context.clinicId,
        patientId: cleanText(context.patient.id),
        phone,
        planId: cleanText(context.plan.id),
        financialAccountId: cleanText(context.account.id),
        installmentSequence: Number(installment.sequence || 0),
        eventType: normalizedEventType,
        status: 'AWAITING_DENTIST_APPROVAL',
        targetRoles: ['dentista', 'dentist'],
        approvalRequired: true,
      }).catch(() => null);

      logPlanMessage('plan_message_approval_required', {
        clinicId: context.clinicId,
        planId: cleanText(context.plan.id),
        patientId: cleanText(context.patient.id),
        financialAccountId: cleanText(context.account.id),
        installmentSequence: Number(installment.sequence || 0),
        eventType: normalizedEventType,
      });

      return {
        blocked: true,
        awaitingApproval: true,
        approvalRequired: true,
        reason: 'Aguardando aprovacao do dentista antes de enviar cobranca ao paciente.',
        event: buildHistoryItem({ event: approvalEvent, dispatch: null }),
      };
    }

    if (requiresApproval && approvedForPatientSend) {
      event = await planMessageRepository.update({
        clinicId: context.clinicId,
        planMessageId: cleanText(event.id),
        data: {
          status: 'CREATED',
          blockedAt: null,
          lastError: null,
          payload: {
            ...extractEventPayload(event),
            approvalState: {
              ...(getApprovalState(event) || {}),
              status: PLAN_MESSAGE_APPROVAL_STATUS.APPROVED,
              approvedAt: new Date().toISOString(),
              approvedBy: cleanText(actorName) || 'dentist',
            },
          },
        },
      });
    }

    await createNotificationEvent(manualResend ? 'PLAN_MESSAGE_RESEND_REQUESTED' : 'PLAN_MESSAGE_EVENT_CREATED', {
      clinicId: context.clinicId,
      patientId: cleanText(context.patient.id),
      phone,
      planId: cleanText(context.plan.id),
      financialAccountId: cleanText(context.account.id),
      installmentSequence: Number(installment.sequence || 0),
      eventType: normalizedEventType,
      status: normalizePlanMessageStatus(event.status),
      approvedByDentist: approvedForPatientSend,
    }).catch(() => null);

    logPlanMessage(manualResend ? 'plan_message_resend_requested' : 'plan_message_event_created', {
      clinicId: context.clinicId,
      planId: cleanText(context.plan.id),
      patientId: cleanText(context.patient.id),
      financialAccountId: cleanText(context.account.id),
      installmentSequence: Number(installment.sequence || 0),
      eventType: normalizedEventType,
    });

    if (!allowsMessages || !phone) {
      const blockedReason = !allowsMessages
        ? 'Paciente sem consentimento para mensagens.'
        : 'Paciente sem telefone valido para envio.';
      const blockedEvent = await updatePlanMessageEventFromStatus({
        event,
        status: 'BLOCKED',
        batchId: '',
        dispatchId: '',
        errorMessage: blockedReason,
        manualResend,
        payloadPatch: {
          dispatchState: {
            retryable: false,
            blockedReasonCode: !allowsMessages ? 'PATIENT_CONSENT_REQUIRED' : 'PATIENT_PHONE_MISSING',
            blockedReason,
            transport: 'WHATSAPP_NG',
          },
        },
      });
      await createNotificationEvent('PLAN_MESSAGE_DISPATCH_BLOCKED', {
        clinicId: context.clinicId,
        patientId: cleanText(context.patient.id),
        phone,
        planId: cleanText(context.plan.id),
        financialAccountId: cleanText(context.account.id),
        installmentSequence: Number(installment.sequence || 0),
        eventType: normalizedEventType,
        status: 'BLOCKED',
        failureReason: blockedReason,
      }).catch(() => null);
      return {
        blocked: true,
        reason: blockedReason,
        event: buildHistoryItem({ event: blockedEvent, dispatch: null }),
      };
    }

    const artifacts = await createDispatchArtifacts({
      clinicId: context.clinicId,
      patient: context.patient,
      eventType: normalizedEventType,
      planMessageEvent: event,
      installment,
      content,
      actorName,
    });

    event = await planMessageRepository.update({
      clinicId: context.clinicId,
      planMessageId: cleanText(event.id),
      data: {
        status: 'PENDING',
        latestBatchId: cleanText(artifacts.batch?.id) || null,
        latestDispatchId: cleanText(artifacts.dispatch?.id) || null,
        templateKey: content.templateKey,
        templateVersion: content.templateVersion,
      },
    });

    await createNotificationEvent('PLAN_MESSAGE_DISPATCH_STARTED', {
      clinicId: context.clinicId,
      patientId: cleanText(context.patient.id),
      phone,
      planId: cleanText(context.plan.id),
      financialAccountId: cleanText(context.account.id),
      installmentSequence: Number(installment.sequence || 0),
      eventType: normalizedEventType,
      batchId: cleanText(artifacts.batch?.id),
      dispatchId: cleanText(artifacts.dispatch?.id),
      status: 'PENDING',
    }).catch(() => null);

    logPlanMessage('plan_message_dispatch_started', {
      clinicId: context.clinicId,
      planId: cleanText(context.plan.id),
      patientId: cleanText(context.patient.id),
      financialAccountId: cleanText(context.account.id),
      installmentSequence: Number(installment.sequence || 0),
      batchId: cleanText(artifacts.batch?.id),
      dispatchId: cleanText(artifacts.dispatch?.id),
      eventType: normalizedEventType,
      status: 'PENDING',
    });

    try {
      const provider = await whatsappNgClient.sendMessage({
        clinicId: context.clinicId,
        phone: artifacts.phone,
        body: content.body,
        auditBody: content.auditBody,
      });

      const updatedDispatch = await messagingDispatchService.updateDispatchStatus({
        clinicId: context.clinicId,
        dispatchId: cleanText(artifacts.dispatch?.id),
        status: 'SENT',
        provider: 'WHATSAPP_NG',
        providerMessageId: cleanText(provider?.providerMessageId || provider?.jobId || ''),
        metadata: {
          providerStatus: cleanText(provider?.status),
          sentMode: 'plan_message',
        },
        logPrefix: 'plan_message',
        logNamespace: 'PLAN_MESSAGE',
      });

      const sentEvent = await updatePlanMessageEventFromStatus({
        event,
        status: 'SENT',
        batchId: cleanText(artifacts.batch?.id),
        dispatchId: cleanText(updatedDispatch?.id || artifacts.dispatch?.id),
        manualResend,
        provider: 'WHATSAPP_NG',
        providerMessageId: cleanText(provider?.providerMessageId || provider?.jobId || ''),
        payloadPatch: {
          dispatchState: {
            retryable: false,
            blockedReasonCode: '',
            blockedReason: '',
            transport: 'WHATSAPP_NG',
          },
        },
      });

      await createNotificationEvent('PLAN_MESSAGE_DISPATCH_COMPLETED', {
        clinicId: context.clinicId,
        patientId: cleanText(context.patient.id),
        phone,
        planId: cleanText(context.plan.id),
        financialAccountId: cleanText(context.account.id),
        installmentSequence: Number(installment.sequence || 0),
        eventType: normalizedEventType,
        batchId: cleanText(artifacts.batch?.id),
        dispatchId: cleanText(updatedDispatch?.id),
        status: 'SENT',
      }).catch(() => null);

      return {
        success: true,
        event: buildHistoryItem({ event: sentEvent, dispatch: updatedDispatch }),
      };
    } catch (error) {
      const transientTransportError = isRetryableNgTransportError(error);
      const nextStatus = transientTransportError ? 'BLOCKED' : 'FAILED';
      const failureReason = error?.message || 'Plan message dispatch failed.';
      const failureCode = cleanText(error?.code || (transientTransportError ? 'WHATSAPP_NG_NOT_READY' : 'PLAN_MESSAGE_DISPATCH_FAILED'));
      const updatedDispatch = await messagingDispatchService.updateDispatchStatus({
        clinicId: context.clinicId,
        dispatchId: cleanText(artifacts.dispatch?.id),
        status: nextStatus,
        provider: 'WHATSAPP_NG',
        errorMessage: failureReason,
        metadata: {
          sentMode: 'plan_message',
          retryableTransport: transientTransportError,
          failureCode,
        },
        logPrefix: 'plan_message',
        logNamespace: 'PLAN_MESSAGE',
      }).catch(() => null);

      const failedEvent = await updatePlanMessageEventFromStatus({
        event,
        status: nextStatus,
        batchId: cleanText(artifacts.batch?.id),
        dispatchId: cleanText(updatedDispatch?.id || artifacts.dispatch?.id),
        errorMessage: failureReason,
        manualResend,
        payloadPatch: {
          dispatchState: {
            retryable: transientTransportError,
            blockedReasonCode: failureCode,
            blockedReason: failureReason,
            transport: 'WHATSAPP_NG',
          },
        },
      });

      await createNotificationEvent(transientTransportError ? 'PLAN_MESSAGE_DISPATCH_BLOCKED' : 'PLAN_MESSAGE_DISPATCH_FAILED', {
        clinicId: context.clinicId,
        patientId: cleanText(context.patient.id),
        phone,
        planId: cleanText(context.plan.id),
        financialAccountId: cleanText(context.account.id),
        installmentSequence: Number(installment.sequence || 0),
        eventType: normalizedEventType,
        batchId: cleanText(artifacts.batch?.id),
        dispatchId: cleanText(updatedDispatch?.id || artifacts.dispatch?.id),
        status: nextStatus,
        failureReason,
        failureCode,
        retryableTransport: transientTransportError,
      }).catch(() => null);

      if (transientTransportError) {
        return {
          blocked: true,
          reason: failureReason,
          event: buildHistoryItem({ event: failedEvent, dispatch: updatedDispatch }),
        };
      }

      throw new AppError(
        error?.status || 502,
        error?.code || 'PLAN_MESSAGE_DISPATCH_FAILED',
        failureReason || 'Nao foi possivel enviar a mensagem do plano.',
        { event: buildHistoryItem({ event: failedEvent, dispatch: updatedDispatch }) },
      );
    }
  },

  resend: async ({ clinicId, planMessageId, actorName = 'system' } = {}) => {
    const normalizedClinicId = cleanText(clinicId);
    const normalizedPlanMessageId = cleanText(planMessageId);
    if (!normalizedClinicId || !normalizedPlanMessageId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId and planMessageId are required.');
    }

    const event = await planMessageRepository.findByIdAndClinic({
      clinicId: normalizedClinicId,
      planMessageId: normalizedPlanMessageId,
    });
    if (!event) throw new AppError(404, 'PLAN_MESSAGE_NOT_FOUND', 'Plan message event not found.');

    return planMessageService.send({
      clinicId: normalizedClinicId,
      planId: cleanText(event.planId),
      installmentId: cleanText(event.installmentId),
      eventType: cleanText(event.eventType),
      actorName,
      manualResend: true,
    });
  },

  runAutomationsForClinic: async ({
    clinicId,
    dueSoonDays = DEFAULT_DUE_SOON_DAYS,
    actorName = 'plan_message_scheduler',
    dryRun = false,
    limit = 200,
    now = new Date(),
  } = {}) => {
    const normalizedClinicId = cleanText(clinicId);
    if (!normalizedClinicId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
    }

    const normalizedDueSoonDays = Math.max(1, Number(dueSoonDays) || DEFAULT_DUE_SOON_DAYS);
    const executionLimit = normalizeSchedulerLimit(limit, 200);
    const referenceDate = toDate(now) || new Date();
    const clinic = await clinicRepository.findById(normalizedClinicId);
    const planRows = await financialRepository.listPatientPlansByClinic({ clinicId: normalizedClinicId });
    if (planRows.length) {
      await ensurePlanFinancialAccounts({
        clinicId: normalizedClinicId,
        planRows,
      });
    }
    const accountRows = await financialRepository.listPlanFinancialAccountsByClinic({ clinicId: normalizedClinicId });

    const candidates = [];
    let skippedMissingPlanRef = 0;
    let skippedWithoutInstallments = 0;
    let skippedWithoutRelevantEvent = 0;

    (Array.isArray(accountRows) ? accountRows : []).forEach((account) => {
      const planId = extractPlanIdFromAccount(account);
      if (!planId) {
        skippedMissingPlanRef += 1;
        return;
      }

      const derivedInstallments = Array.isArray(account?.installments)
        ? account.installments.map((item) => deriveInstallmentSnapshot(item, account.transactions || [], referenceDate))
        : [];
      if (!derivedInstallments.length) {
        skippedWithoutInstallments += 1;
        return;
      }

      let accountHasCandidate = false;
      derivedInstallments.forEach((installment) => {
        const eventType = resolveRecommendedEventType(installment, normalizedDueSoonDays, referenceDate);
        if (!eventType || eventType === 'PLAN_PAYMENT_CONFIRMED') return;
        accountHasCandidate = true;
        candidates.push({
          clinicId: normalizedClinicId,
          clinicName: cleanText(clinic?.nomeFantasia || clinic?.razaoSocial || ''),
          planId,
          patientId: cleanText(account?.patientId || account?.patient?.id || ''),
          patientName: cleanText(account?.patient?.nome || account?.metadata?.patientName || ''),
          financialAccountId: cleanText(account?.id),
          installmentId: cleanText(installment.id),
          installmentSequence: Number(installment.sequence || 0),
          dueDate: installment.dueDate,
          amount: installment.amount,
          remainingAmount: installment.remainingAmount,
          installmentStatus: cleanText(installment.status),
          eventType,
        });
      });

      if (!accountHasCandidate) {
        skippedWithoutRelevantEvent += 1;
      }
    });

    const eventPriority = {
      PLAN_INSTALLMENT_OVERDUE: 0,
      PLAN_INSTALLMENT_DUE_TODAY: 1,
      PLAN_INSTALLMENT_DUE_SOON: 2,
    };
    const orderedCandidates = candidates
      .slice()
      .sort((a, b) => {
        const priorityDelta = (eventPriority[a.eventType] ?? 99) - (eventPriority[b.eventType] ?? 99);
        if (priorityDelta !== 0) return priorityDelta;
        return cleanText(a.dueDate).localeCompare(cleanText(b.dueDate));
      });
    const executionQueue = orderedCandidates.slice(0, executionLimit);

    logPlanMessage('plan_message_scheduler_started', {
      clinicId: normalizedClinicId,
      clinicName: cleanText(clinic?.nomeFantasia || clinic?.razaoSocial || ''),
      dueSoonDays: normalizedDueSoonDays,
      dryRun: dryRun === true,
      scannedAccounts: Array.isArray(accountRows) ? accountRows.length : 0,
      eligibleCandidates: orderedCandidates.length,
      executionLimit,
    });

    if (dryRun) {
      return {
        clinicId: normalizedClinicId,
        clinicName: cleanText(clinic?.nomeFantasia || clinic?.razaoSocial || ''),
        dryRun: true,
        dueSoonDays: normalizedDueSoonDays,
        scannedAccounts: Array.isArray(accountRows) ? accountRows.length : 0,
        eligibleCandidates: orderedCandidates.length,
        executionLimit,
        skippedMissingPlanRef,
        skippedWithoutInstallments,
        skippedWithoutRelevantEvent,
        preview: executionQueue,
      };
    }

    const results = [];
    let sentCount = 0;
    let blockedCount = 0;
    let failedCount = 0;

    for (const candidate of executionQueue) {
      try {
        const response = await planMessageService.send({
          clinicId: normalizedClinicId,
          planId: candidate.planId,
          installmentId: candidate.installmentId,
          eventType: candidate.eventType,
          actorName,
          manualResend: false,
        });
        const blocked = response?.blocked === true;
        if (blocked) blockedCount += 1;
        else if (response?.success) sentCount += 1;
        results.push({
          ...candidate,
          status: blocked ? 'BLOCKED' : 'SENT',
          reason: blocked ? cleanText(response?.reason || 'IDEMPOTENT_ALREADY_NOTIFIED') : '',
          eventId: cleanText(response?.event?.id || ''),
          batchId: cleanText(response?.event?.latestBatchId || ''),
          dispatchId: cleanText(response?.event?.latestDispatchId || ''),
        });
      } catch (error) {
        failedCount += 1;
        results.push({
          ...candidate,
          status: 'FAILED',
          reason: error?.message || 'plan_message_dispatch_failed',
          eventId: cleanText(error?.details?.event?.id || ''),
          batchId: cleanText(error?.details?.event?.latestBatchId || ''),
          dispatchId: cleanText(error?.details?.event?.latestDispatchId || ''),
        });
      }
    }

    logPlanMessage('plan_message_scheduler_completed', {
      clinicId: normalizedClinicId,
      clinicName: cleanText(clinic?.nomeFantasia || clinic?.razaoSocial || ''),
      dueSoonDays: normalizedDueSoonDays,
      scannedAccounts: Array.isArray(accountRows) ? accountRows.length : 0,
      eligibleCandidates: orderedCandidates.length,
      executedCount: executionQueue.length,
      sentCount,
      blockedCount,
      failedCount,
      skippedMissingPlanRef,
      skippedWithoutInstallments,
      skippedWithoutRelevantEvent,
    });

    return {
      clinicId: normalizedClinicId,
      clinicName: cleanText(clinic?.nomeFantasia || clinic?.razaoSocial || ''),
      dryRun: false,
      dueSoonDays: normalizedDueSoonDays,
      scannedAccounts: Array.isArray(accountRows) ? accountRows.length : 0,
      eligibleCandidates: orderedCandidates.length,
      executedCount: executionQueue.length,
      sentCount,
      blockedCount,
      failedCount,
      skippedMissingPlanRef,
      skippedWithoutInstallments,
      skippedWithoutRelevantEvent,
      results,
    };
  },

  runAutomationsAcrossClinics: async ({
    clinicIds = [],
    dueSoonDays = DEFAULT_DUE_SOON_DAYS,
    actorName = 'plan_message_scheduler',
    dryRun = false,
    limitPerClinic = 200,
    now = new Date(),
  } = {}) => {
    const allClinics = await clinicRepository.list();
    const normalizedClinicIds = Array.isArray(clinicIds)
      ? clinicIds.map((item) => cleanText(item)).filter(Boolean)
      : [];
    const scopedClinics = normalizedClinicIds.length
      ? allClinics.filter((item) => normalizedClinicIds.includes(cleanText(item?.id)))
      : allClinics;

    const results = [];
    for (const clinic of scopedClinics) {
      try {
        const result = await planMessageService.runAutomationsForClinic({
          clinicId: cleanText(clinic?.id),
          dueSoonDays,
          actorName,
          dryRun,
          limit: limitPerClinic,
          now,
        });
        results.push(result);
      } catch (error) {
        results.push({
          clinicId: cleanText(clinic?.id),
          clinicName: cleanText(clinic?.nomeFantasia || clinic?.razaoSocial || ''),
          dryRun: dryRun === true,
          failed: true,
          reason: error?.message || 'plan_message_scheduler_failed',
        });
      }
    }

    return {
      dryRun: dryRun === true,
      dueSoonDays: Math.max(1, Number(dueSoonDays) || DEFAULT_DUE_SOON_DAYS),
      clinics: results.length,
      sentCount: results.reduce((acc, item) => acc + Number(item?.sentCount || 0), 0),
      blockedCount: results.reduce((acc, item) => acc + Number(item?.blockedCount || 0), 0),
      failedCount: results.reduce((acc, item) => acc + Number(item?.failedCount || (item?.failed ? 1 : 0)), 0),
      results,
    };
  },

  handlePaymentConfirmedForInstallment: async ({ clinicId, accountId, installmentId, actorName = 'finance_register_payment' } = {}) => {
    const normalizedClinicId = cleanText(clinicId);
    const normalizedAccountId = cleanText(accountId);
    const normalizedInstallmentId = cleanText(installmentId);
    if (!normalizedClinicId || !normalizedAccountId || !normalizedInstallmentId) {
      return { skipped: true, reason: 'missing_context' };
    }

    const accounts = await financialRepository.listPlanFinancialAccountsByClinic({ clinicId: normalizedClinicId });
    const account = (accounts || []).find((item) => cleanText(item.id) === normalizedAccountId) || null;
    if (!account) return { skipped: true, reason: 'not_a_plan_account' };

    const planId = extractPlanIdFromAccount(account);
    if (!planId) return { skipped: true, reason: 'plan_reference_missing' };

    const installment = (Array.isArray(account.installments) ? account.installments : []).find((item) => cleanText(item.id) === normalizedInstallmentId);
    if (!installment) return { skipped: true, reason: 'installment_not_found' };

    const derived = deriveInstallmentSnapshot(installment, account.transactions || []);
    if (cleanText(derived.status) !== 'PAID') return { skipped: true, reason: 'installment_not_paid' };

    return planMessageService.send({
      clinicId: normalizedClinicId,
      planId,
      installmentId: normalizedInstallmentId,
      eventType: 'PLAN_PAYMENT_CONFIRMED',
      actorName,
      manualResend: false,
    }).catch((error) => ({
      skipped: false,
      failed: true,
      reason: error?.message || 'plan_payment_confirmed_failed',
    }));
  },
};

module.exports = {
  planMessageService,
  normalizePlanMessageEventType,
  normalizePlanMessageStatus,
  resolveRecommendedEventType,
};
