const MAX_QUEUE_ITEMS = 5000;
const MAX_PENDING_PER_CLINIC = 250;
const MAX_PENDING_CAMPAIGNS_PER_CLINIC = 80;
const MAX_RESOLVED_ITEMS = 1000;
const BASE_RETRY_DELAY_MS = 15000;
const MAX_RETRY_DELAY_MS = 10 * 60 * 1000;

const generateJobId = () => (
  typeof randomUUID === 'function'
    ? randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
);

const createWhatsAppPendingQueueService = ({
  queueFile,
  pathExists,
  readJsonFile,
  writeJsonFile,
}) => {
  const createQueueError = (message, code, details = {}) => {
    const error = new Error(message);
    error.code = code;
    error.details = details;
    return error;
  };

  const getTypePriority = (value) => {
    const type = String(value || '').trim().toUpperCase();
    if (type === 'APPOINTMENT_CONFIRMATION') return 0;
    if (type === 'APPOINTMENT_REMINDER') return 1;
    if (type === 'MANUAL') return 2;
    if (type === 'CAMPAIGN') return 3;
    return 4;
  };

  const comparePendingPriority = (left, right) => {
    const retryLeft = new Date(left?.nextRetryAt || left?.createdAt || 0).getTime();
    const retryRight = new Date(right?.nextRetryAt || right?.createdAt || 0).getTime();
    if (retryLeft !== retryRight) return retryLeft - retryRight;
    const priorityDiff = getTypePriority(left?.type) - getTypePriority(right?.type);
    if (priorityDiff !== 0) return priorityDiff;
    return String(left?.createdAt || '').localeCompare(String(right?.createdAt || ''));
  };

  const ensureQueueFile = async () => {
    if (!(await pathExists(queueFile))) {
      await writeJsonFile(queueFile, { items: [] });
    }
  };

  const readQueue = async () => {
    await ensureQueueFile();
    const payload = await readJsonFile(queueFile).catch(() => ({ items: [] }));
    return Array.isArray(payload?.items) ? payload.items : [];
  };

  const writeQueue = async (items) => {
    await ensureQueueFile();
    const normalizedItems = (Array.isArray(items) ? items : []).map((item) => normalizeEntry(item));
    const pending = normalizedItems.filter((item) => item.status === 'PENDING');
    const resolved = normalizedItems
      .filter((item) => item.status !== 'PENDING')
      .sort((a, b) => String(b?.updatedAt || b?.createdAt || '').localeCompare(String(a?.updatedAt || a?.createdAt || '')))
      .slice(0, MAX_RESOLVED_ITEMS);
    const nextItems = [...pending, ...resolved].slice(0, MAX_QUEUE_ITEMS);
    await writeJsonFile(queueFile, { items: nextItems });
  };

  const normalizeStatus = (value) => {
    const raw = String(value || '').trim().toUpperCase();
    if (raw === 'SENT' || raw === 'FAILED') return raw;
    return 'PENDING';
  };

  const normalizeEntry = (entry = {}) => {
    const createdAt = String(entry?.createdAt || new Date().toISOString());
    const nextRetryAt = String(entry?.nextRetryAt || createdAt);
    const clinicId = String(entry?.clinicId || '').trim();
    const phone = String(entry?.phone || '').trim();
    const message = String(entry?.message || '').trim();
    const type = String(entry?.type || 'MANUAL').trim().toUpperCase() || 'MANUAL';
    const appointmentId = String(entry?.appointmentId || '').trim();
    const campaignId = String(entry?.campaignId || '').trim();
    const patientId = String(entry?.patientId || '').trim();
    const dedupeKey = String(
      entry?.dedupeKey
      || [clinicId, type, appointmentId, campaignId, patientId, phone, message].join('|').toLowerCase()
    );

    return {
      jobId: String(entry?.jobId || generateJobId()),
      clinicId,
      phone,
      message,
      type,
      patientId,
      appointmentId,
      campaignId,
      status: normalizeStatus(entry?.status),
      retryCount: Math.max(0, Number(entry?.retryCount || 0)),
      nextRetryAt,
      lastError: String(entry?.lastError || '').trim(),
      createdAt,
      updatedAt: String(entry?.updatedAt || createdAt),
      resolvedAt: entry?.resolvedAt ? String(entry.resolvedAt) : '',
      provider: String(entry?.provider || '').trim(),
      instanceId: String(entry?.instanceId || '').trim(),
      clinicSenderPhone: String(entry?.clinicSenderPhone || '').trim(),
      dedupeKey,
    };
  };

  const computeRetryDelayMs = (retryCount) => {
    const exponent = Math.max(0, Number(retryCount || 0));
    return Math.min(MAX_RETRY_DELAY_MS, Math.round(BASE_RETRY_DELAY_MS * Math.pow(2, exponent)));
  };

  const enqueuePending = async (entry = {}) => {
    const items = (await readQueue()).map((item) => normalizeEntry(item));
    const normalized = normalizeEntry(entry);
    const duplicate = items.find((item) => (
      item.status === 'PENDING'
      && String(item?.dedupeKey || '') === normalized.dedupeKey
    ));
    if (duplicate) return duplicate;

    const clinicPending = items.filter((item) => item.status === 'PENDING' && item.clinicId === normalized.clinicId);
    const clinicPendingCampaigns = clinicPending.filter((item) => String(item?.type || '').trim().toUpperCase() === 'CAMPAIGN');

    if (normalized.type === 'CAMPAIGN' && clinicPendingCampaigns.length >= MAX_PENDING_CAMPAIGNS_PER_CLINIC) {
      throw createQueueError(
        'A fila local desta clinica esta sob pressao e novas campanhas foram bloqueadas para preservar confirmacoes e lembretes.',
        'WHATSAPP_PENDING_QUEUE_PRESSURE',
        {
          clinicId: normalized.clinicId,
          type: normalized.type,
          pendingCampaigns: clinicPendingCampaigns.length,
          maxPendingCampaigns: MAX_PENDING_CAMPAIGNS_PER_CLINIC,
        },
      );
    }

    if (clinicPending.length >= MAX_PENDING_PER_CLINIC) {
      const incomingPriority = getTypePriority(normalized.type);
      const evictable = clinicPending
        .filter((item) => getTypePriority(item.type) > incomingPriority)
        .sort((left, right) => {
          const priorityDiff = getTypePriority(right.type) - getTypePriority(left.type);
          if (priorityDiff !== 0) return priorityDiff;
          return String(left?.createdAt || '').localeCompare(String(right?.createdAt || ''));
        })[0];

      if (!evictable) {
        throw createQueueError(
          'A fila local desta clinica atingiu o limite operacional. Aguarde o motor NG estabilizar antes de enviar novas mensagens.',
          'WHATSAPP_PENDING_QUEUE_FULL',
          {
            clinicId: normalized.clinicId,
            type: normalized.type,
            pendingCount: clinicPending.length,
            maxPendingPerClinic: MAX_PENDING_PER_CLINIC,
          },
        );
      }

      const evictIndex = items.findIndex((item) => item.jobId === evictable.jobId);
      if (evictIndex >= 0) {
        items[evictIndex] = normalizeEntry({
          ...items[evictIndex],
          status: 'FAILED',
          resolvedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastError: 'Descartado por pressao de fila para priorizar mensagens clinicas mais urgentes.',
        });
      }
    }

    items.push(normalized);
    await writeQueue(items);
    return normalized;
  };

  const listPending = async ({ clinicId, limit = 50, includeResolved = false } = {}) => {
    const targetClinicId = String(clinicId || '').trim();
    const items = await readQueue();
    return items
      .map((item) => normalizeEntry(item))
      .filter((item) => !targetClinicId || item.clinicId === targetClinicId)
      .filter((item) => includeResolved || item.status === 'PENDING')
      .sort(comparePendingPriority)
      .slice(0, Math.max(1, Math.min(500, Number(limit) || 50)));
  };

  const listDuePending = async ({ limit = 20 } = {}) => {
    const now = Date.now();
    const items = await readQueue();
    return items
      .map((item) => normalizeEntry(item))
      .filter((item) => item.status === 'PENDING')
      .filter((item) => {
        const nextRetryAt = new Date(item.nextRetryAt || item.createdAt || 0).getTime();
        return !Number.isNaN(nextRetryAt) && nextRetryAt <= now;
      })
      .sort(comparePendingPriority)
      .slice(0, Math.max(1, Math.min(200, Number(limit) || 20)));
  };

  const getPendingStats = async ({ clinicId } = {}) => {
    const targetClinicId = String(clinicId || '').trim();
    const items = (await readQueue()).map((item) => normalizeEntry(item));
    const filtered = items.filter((item) => !targetClinicId || item.clinicId === targetClinicId);
    const pending = filtered.filter((item) => item.status === 'PENDING');
    const byType = pending.reduce((acc, item) => {
      const type = String(item?.type || 'MANUAL').trim().toUpperCase() || 'MANUAL';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});
    return {
      clinicId: targetClinicId,
      pendingTotal: pending.length,
      pendingConfirmations: byType.APPOINTMENT_CONFIRMATION || 0,
      pendingReminders: byType.APPOINTMENT_REMINDER || 0,
      pendingManual: byType.MANUAL || 0,
      pendingCampaigns: byType.CAMPAIGN || 0,
      queuePressure: pending.length >= Math.round(MAX_PENDING_PER_CLINIC * 0.8),
      campaignPressure: (byType.CAMPAIGN || 0) >= Math.round(MAX_PENDING_CAMPAIGNS_PER_CLINIC * 0.8),
      maxPendingPerClinic: MAX_PENDING_PER_CLINIC,
      maxPendingCampaignsPerClinic: MAX_PENDING_CAMPAIGNS_PER_CLINIC,
    };
  };

  const updateJob = async (jobId, mutator) => {
    const items = await readQueue();
    const index = items.findIndex((item) => String(item?.jobId || '').trim() === String(jobId || '').trim());
    if (index < 0) return null;
    const current = normalizeEntry(items[index]);
    const next = normalizeEntry({
      ...current,
      ...(typeof mutator === 'function' ? mutator(current) : mutator),
      updatedAt: new Date().toISOString(),
    });
    items[index] = next;
    await writeQueue(items);
    return next;
  };

  const markSent = async (jobId, meta = {}) => updateJob(jobId, (current) => ({
    ...current,
    status: 'SENT',
    resolvedAt: new Date().toISOString(),
    provider: String(meta?.provider || current.provider || '').trim(),
    instanceId: String(meta?.instanceId || current.instanceId || '').trim(),
    clinicSenderPhone: String(meta?.clinicSenderPhone || current.clinicSenderPhone || '').trim(),
    lastError: '',
  }));

  const reschedulePending = async (jobId, errorMessage) => updateJob(jobId, (current) => {
    const retryCount = Math.max(0, Number(current?.retryCount || 0)) + 1;
    const delayMs = computeRetryDelayMs(retryCount);
    return {
      ...current,
      status: 'PENDING',
      retryCount,
      lastError: String(errorMessage || '').trim(),
      nextRetryAt: new Date(Date.now() + delayMs).toISOString(),
    };
  });

  const markFailed = async (jobId, errorMessage) => updateJob(jobId, (current) => ({
    ...current,
    status: 'FAILED',
    resolvedAt: new Date().toISOString(),
    lastError: String(errorMessage || '').trim(),
  }));

  return {
    enqueuePending,
    listPending,
    listDuePending,
    getPendingStats,
    markSent,
    reschedulePending,
    markFailed,
  };
};

module.exports = { createWhatsAppPendingQueueService };
