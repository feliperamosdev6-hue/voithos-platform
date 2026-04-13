const { AppError } = require('../errors/AppError');
const { campaignRepository } = require('../repositories/campaignRepository');

const cleanText = (value) => String(value || '').trim();

const TENANT_SENSITIVE_KEYS = new Set([
  'clinicId',
  'campaignId',
  'patientId',
  'dispatchId',
  'batchId',
  'audienceSnapshotId',
  'audienceMemberId',
]);

const sanitizeTenantMetadata = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeTenantMetadata(item));
  }
  if (!value || typeof value !== 'object') return value;
  if (value instanceof Date) return value;

  return Object.entries(value).reduce((acc, [key, nestedValue]) => {
    if (TENANT_SENSITIVE_KEYS.has(cleanText(key))) return acc;
    acc[key] = sanitizeTenantMetadata(nestedValue);
    return acc;
  }, {});
};

const normalizeDispatchStatus = (value) => {
  const normalized = cleanText(value).toUpperCase();
  if (['PENDING', 'PROCESSING', 'SENT', 'FAILED', 'BLOCKED'].includes(normalized)) return normalized;
  return 'PENDING';
};

const messagingDispatchService = {
  normalizeDispatchStatus,

  refreshBatchStats: async ({ clinicId, batchId }) => {
    const normalizedClinicId = cleanText(clinicId);
    const normalizedBatchId = cleanText(batchId);
    const dispatches = await campaignRepository.listDispatchesByBatch({
      clinicId: normalizedClinicId,
      batchId: normalizedBatchId,
    });

    const counts = {
      totalRecipients: dispatches.length,
      processedCount: 0,
      successCount: 0,
      failedCount: 0,
      blockedCount: 0,
      pendingCount: 0,
    };

    dispatches.forEach((dispatch) => {
      const status = normalizeDispatchStatus(dispatch?.status);
      if (status === 'SENT') {
        counts.successCount += 1;
        counts.processedCount += 1;
      } else if (status === 'FAILED') {
        counts.failedCount += 1;
        counts.processedCount += 1;
      } else if (status === 'BLOCKED') {
        counts.blockedCount += 1;
        counts.processedCount += 1;
      } else {
        counts.pendingCount += 1;
      }
    });

    let status = 'PROCESSING';
    if (counts.totalRecipients === 0) status = 'FAILED';
    else if (counts.pendingCount === 0 && counts.failedCount === 0 && counts.blockedCount === counts.totalRecipients) status = 'BLOCKED';
    else if (counts.pendingCount === 0 && counts.failedCount === 0) status = 'COMPLETED';
    else if (counts.pendingCount === 0 && counts.successCount === 0) status = 'FAILED';
    else if (counts.pendingCount === counts.totalRecipients) status = 'CREATED';

    const batch = await campaignRepository.updateBatch({
      clinicId: normalizedClinicId,
      batchId: normalizedBatchId,
      data: {
        status,
        processedCount: counts.processedCount,
        successCount: counts.successCount,
        failedCount: counts.failedCount,
        blockedCount: counts.blockedCount,
        pendingCount: counts.pendingCount,
        completedAt: counts.pendingCount === 0 ? new Date() : null,
        lastError: counts.failedCount > 0 ? 'Batch contains failed dispatches.' : null,
      },
    });

    return { batch, dispatches, counts };
  },

  updateDispatchStatus: async ({
    clinicId,
    dispatchId,
    status,
    provider = '',
    providerMessageId = '',
    errorMessage = '',
    metadata = null,
    logPrefix = 'campaign',
    logNamespace = 'CAMPAIGN',
  } = {}) => {
    const normalizedClinicId = cleanText(clinicId);
    const normalizedDispatchId = cleanText(dispatchId);
    if (!normalizedClinicId || !normalizedDispatchId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId and dispatchId are required.');
    }

    const current = await campaignRepository.findDispatchByIdAndClinic({
      clinicId: normalizedClinicId,
      dispatchId: normalizedDispatchId,
    });
    if (!current) throw new AppError(404, 'CAMPAIGN_DISPATCH_NOT_FOUND', 'Campaign dispatch not found.');

    const nextStatus = normalizeDispatchStatus(status);
    if (['SENT', 'FAILED', 'BLOCKED'].includes(cleanText(current.status).toUpperCase()) && cleanText(current.status).toUpperCase() === nextStatus) {
      return current;
    }

    const now = new Date();
    const updated = await campaignRepository.updateDispatch({
      clinicId: normalizedClinicId,
      dispatchId: normalizedDispatchId,
      data: {
        status: nextStatus,
        provider: cleanText(provider) || current.provider || null,
        providerMessageId: cleanText(providerMessageId) || current.providerMessageId || null,
        lastError: nextStatus === 'FAILED' || nextStatus === 'BLOCKED'
          ? cleanText(errorMessage) || current.lastError || 'Dispatch failed.'
          : null,
        metadata: metadata && typeof metadata === 'object'
          ? {
            ...(current.metadata && typeof current.metadata === 'object' ? current.metadata : {}),
            ...sanitizeTenantMetadata(metadata),
          }
          : current.metadata,
        attemptCount: Math.max(Number(current.attemptCount || 0) + 1, 1),
        lastAttemptAt: now,
        sentAt: nextStatus === 'SENT' ? now : current.sentAt,
        failedAt: nextStatus === 'FAILED' ? now : current.failedAt,
        blockedAt: nextStatus === 'BLOCKED' ? now : current.blockedAt,
      },
    });

    const { batch } = await messagingDispatchService.refreshBatchStats({
      clinicId: normalizedClinicId,
      batchId: current.batchId,
    });

    const logAction = nextStatus === 'SENT'
      ? `${logPrefix}_dispatch_completed`
      : nextStatus === 'BLOCKED'
        ? `${logPrefix}_dispatch_blocked`
        : `${logPrefix}_dispatch_failed`;

    console.info(`[${logNamespace}]`, JSON.stringify({
      action: logAction,
      clinicId: normalizedClinicId,
      campaignId: cleanText(updated?.campaignId),
      batchId: cleanText(updated?.batchId),
      dispatchId: cleanText(updated?.id),
      status: nextStatus,
      failureReason: cleanText(updated?.lastError),
      plan_message_source: logPrefix === 'plan_message' ? 'central' : undefined,
      campaign_source: logPrefix === 'campaign' ? 'central' : undefined,
    }));

    return {
      ...updated,
      batchStatus: cleanText(batch?.status),
    };
  },
};

module.exports = { messagingDispatchService };
