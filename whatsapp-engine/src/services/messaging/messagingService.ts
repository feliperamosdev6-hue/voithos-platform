import { MessageEventType, MessageJobStatus } from '@prisma/client';
import { instanceRepository } from '../../repositories/instanceRepository';
import { messageJobRepository } from '../../repositories/messageJobRepository';
import { messageLogRepository } from '../../repositories/messageLogRepository';
import { createBodySummary, operationalEventRepository } from '../../repositories/operationalEventRepository';
import { enqueueMessageJob } from '../../queues/messageQueue';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { HttpError } from '../../utils/http';
import { normalizeBrPhone } from '../../utils/phone';

const dispatchMessageThroughApi = async (payload: {
  instanceId: string;
  toPhone: string;
  body: string;
  appointmentId?: string | null;
}) => {
  const baseUrl = `http://127.0.0.1:${env.port}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (env.serviceInternalApiToken) {
    headers['x-service-token'] = env.serviceInternalApiToken;
  } else if (env.internalApiToken) {
    headers['x-internal-token'] = env.internalApiToken;
  }

  const response = await fetch(`${baseUrl}/instances/${encodeURIComponent(payload.instanceId)}/messages/send-internal`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          toPhone: payload.toPhone,
          body: payload.body,
          appointmentId: payload.appointmentId || undefined,
        }),
      });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.success === false) {
    throw new HttpError(response.status || 502, result?.error?.message || 'Internal API dispatch failed.');
  }

  return result.data as {
    providerMessageId?: string | null;
    remoteJid?: string | null;
  };
};

const isRuntimeUnavailableError = (error: unknown): boolean => {
  const statusCode = typeof error === 'object' && error && 'statusCode' in error
    ? Number((error as { statusCode?: number }).statusCode)
    : 0;
  const message = error instanceof Error ? error.message : String(error || '');
  return statusCode === 409
    || /runtime is unavailable|runtime socket is closed|connection closed during send|instance is not connected/i.test(message);
};

const ACTIVE_PRESSURE_STATUSES: MessageJobStatus[] = [
  MessageJobStatus.QUEUED,
  MessageJobStatus.PROCESSING,
  MessageJobStatus.BLOCKED,
  MessageJobStatus.SCHEDULED,
];

type InstanceDispatchCooldown = {
  blockedUntil: number;
  failureCount: number;
  reason: string;
};

type InstanceCircuitBreaker = {
  openUntil: number;
  failureTimestamps: number[];
  lastReason: string;
  tripCount: number;
};

const instanceDispatchCooldowns = new Map<string, InstanceDispatchCooldown>();
const instanceCircuitBreakers = new Map<string, InstanceCircuitBreaker>();

const formatCooldownSeconds = (remainingMs: number): number => Math.max(1, Math.ceil(remainingMs / 1000));

const getInstanceDispatchCooldown = (instanceId: string): (InstanceDispatchCooldown & { remainingMs: number }) | null => {
  const cooldown = instanceDispatchCooldowns.get(instanceId);
  if (!cooldown) return null;
  const remainingMs = cooldown.blockedUntil - Date.now();
  if (remainingMs <= 0) {
    instanceDispatchCooldowns.delete(instanceId);
    return null;
  }
  return {
    ...cooldown,
    remainingMs,
  };
};

const clearInstanceDispatchCooldown = (instanceId: string): void => {
  instanceDispatchCooldowns.delete(instanceId);
};

const registerInstanceDispatchCooldown = (
  instanceId: string,
  reason: string,
): (InstanceDispatchCooldown & { remainingMs: number }) => {
  const activeCooldown = getInstanceDispatchCooldown(instanceId);
  const failureCount = Math.max(1, Number(activeCooldown?.failureCount || 0) + 1);
  const baseDelay = Math.max(1000, env.instanceSendCooldownBaseMs);
  const maxDelay = Math.max(baseDelay, env.instanceSendCooldownMaxMs);
  const computedDelay = Math.min(maxDelay, Math.round(baseDelay * Math.pow(2, Math.max(0, failureCount - 1))));
  const jitter = Math.floor(Math.random() * Math.min(1500, Math.max(250, Math.round(computedDelay * 0.2))));
  const remainingMs = Math.max(baseDelay, Math.min(maxDelay, computedDelay + jitter));
  const blockedUntil = Date.now() + remainingMs;
  const cooldown = {
    blockedUntil,
    failureCount,
    reason,
    remainingMs,
  };
  instanceDispatchCooldowns.set(instanceId, cooldown);
  return cooldown;
};

const getInstanceCircuitBreaker = (instanceId: string): (InstanceCircuitBreaker & { remainingMs: number }) | null => {
  const breaker = instanceCircuitBreakers.get(instanceId);
  if (!breaker) return null;
  const remainingMs = breaker.openUntil - Date.now();
  if (remainingMs <= 0) {
    if (!breaker.failureTimestamps.length) {
      instanceCircuitBreakers.delete(instanceId);
    } else {
      instanceCircuitBreakers.set(instanceId, {
        ...breaker,
        openUntil: 0,
      });
    }
    return null;
  }
  return {
    ...breaker,
    remainingMs,
  };
};

const clearInstanceCircuitBreaker = (instanceId: string): void => {
  instanceCircuitBreakers.delete(instanceId);
};

const registerInstanceCircuitBreakerFailure = (
  instanceId: string,
  reason: string,
): {
  breaker: (InstanceCircuitBreaker & { remainingMs: number }) | null;
  failureCount: number;
  trippedNow: boolean;
} => {
  const now = Date.now();
  const threshold = Math.max(1, env.instanceCircuitBreakerThreshold);
  const windowMs = Math.max(1000, env.instanceCircuitBreakerWindowMs);
  const openMs = Math.max(1000, env.instanceCircuitBreakerOpenMs);
  const current = instanceCircuitBreakers.get(instanceId);
  const activeOpenUntil = current?.openUntil && current.openUntil > now ? current.openUntil : 0;
  const failureTimestamps = Array.isArray(current?.failureTimestamps)
    ? current.failureTimestamps.filter((timestamp) => now - Number(timestamp) <= windowMs)
    : [];

  failureTimestamps.push(now);
  const shouldTrip = failureTimestamps.length >= threshold;
  const nextOpenUntil = shouldTrip ? Math.max(activeOpenUntil, now + openMs) : activeOpenUntil;
  const trippedNow = shouldTrip && nextOpenUntil > activeOpenUntil;

  instanceCircuitBreakers.set(instanceId, {
    openUntil: nextOpenUntil,
    failureTimestamps,
    lastReason: reason,
    tripCount: Math.max(0, Number(current?.tripCount || 0)) + (trippedNow ? 1 : 0),
  });

  return {
    breaker: getInstanceCircuitBreaker(instanceId),
    failureCount: failureTimestamps.length,
    trippedNow,
  };
};

const assertMessagePressureWithinLimits = async (payload: {
  clinicId: string;
  instanceId: string;
}): Promise<void> => {
  const [globalActiveJobs, clinicActiveJobs] = await Promise.all([
    messageJobRepository.countByStatuses({
      statuses: ACTIVE_PRESSURE_STATUSES,
    }),
    messageJobRepository.countByStatuses({
      clinicId: payload.clinicId,
      statuses: ACTIVE_PRESSURE_STATUSES,
    }),
  ]);

  if (clinicActiveJobs >= env.serverMaxActiveJobsPerClinic) {
    throw new HttpError(
      429,
      'Clinic queue pressure limit reached. New jobs are temporarily blocked for this clinic.',
      {
        scope: 'clinic',
        clinicId: payload.clinicId,
        instanceId: payload.instanceId,
        clinicActiveJobs,
        clinicLimit: env.serverMaxActiveJobsPerClinic,
        globalActiveJobs,
        globalLimit: env.serverMaxActiveJobsGlobal,
      },
    );
  }

  if (globalActiveJobs >= env.serverMaxActiveJobsGlobal) {
    throw new HttpError(
      503,
      'Global queue pressure limit reached. New jobs are temporarily blocked while the engine stabilizes.',
      {
        scope: 'global',
        clinicId: payload.clinicId,
        instanceId: payload.instanceId,
        clinicActiveJobs,
        clinicLimit: env.serverMaxActiveJobsPerClinic,
        globalActiveJobs,
        globalLimit: env.serverMaxActiveJobsGlobal,
      },
    );
  }
};

const createMessageJobRecord = async (payload: {
  clinicId: string;
  instanceId: string;
  appointmentId?: string;
  toPhone: string;
  body: string;
  auditBody: string;
  scheduledFor?: Date | null;
}) => {
  const scheduledFor = payload.scheduledFor || null;
  const status = scheduledFor ? MessageJobStatus.SCHEDULED : MessageJobStatus.QUEUED;
  const created = await messageJobRepository.create({
    clinicId: payload.clinicId,
    instanceId: payload.instanceId,
    appointmentId: payload.appointmentId,
    toPhone: payload.toPhone,
    body: payload.auditBody,
    scheduledFor,
    status,
  });

  await messageLogRepository.create({
    jobId: created.id,
    eventType: MessageEventType.QUEUED,
    payload: {
      clinicId: payload.clinicId,
      instanceId: payload.instanceId,
      toPhone: payload.toPhone,
      scheduledFor,
    },
  });

  const dispatchSummary = createBodySummary(payload.body);
  const storedSummary = createBodySummary(payload.auditBody);
  await operationalEventRepository.append({
    eventType: 'MESSAGE_JOB_CREATED',
    clinicId: payload.clinicId,
    instanceId: payload.instanceId,
    phone: payload.toPhone,
    status,
    messageJobId: created.id,
    appointmentId: payload.appointmentId || null,
    summary: `job created for ${payload.toPhone}`,
    payload: {
      transport: scheduledFor ? 'scheduled' : 'queued',
      storedBodyPreview: storedSummary.preview,
    },
  });
  await operationalEventRepository.append({
    eventType: 'MESSAGE_PAYLOAD_COMPOSED',
    clinicId: payload.clinicId,
    instanceId: payload.instanceId,
    phone: payload.toPhone,
    status,
    messageJobId: created.id,
    appointmentId: payload.appointmentId || null,
    summary: storedSummary.preview,
    payload: {
      containsLinks: dispatchSummary.containsLinks,
      dispatchBodyLength: dispatchSummary.length,
      storedBodyPreview: storedSummary.preview,
    },
  });

  return {
    ...created,
    deduped: false,
  };
};

export const messagingService = {
  createAndEnqueueJob: async (payload: {
    clinicId: string;
    toPhone: string;
    body: string;
    auditBody?: string;
    appointmentId?: string;
    scheduledFor?: Date | null;
  }) => {
    const clinicId = String(payload.clinicId || '').trim();
    const normalizedTo = normalizeBrPhone(payload.toPhone);
    const body = String(payload.body || '').trim();
    const auditBody = String(payload.auditBody || body).trim() || body;
    const appointmentId = String(payload.appointmentId || '').trim() || undefined;
    if (!clinicId) throw new HttpError(400, 'clinicId is required.');
    if (!normalizedTo) throw new HttpError(400, 'toPhone is invalid.');
    if (!body) throw new HttpError(400, 'body is required.');

    const instance = await instanceRepository.findByClinicId(clinicId);
    if (!instance) throw new HttpError(404, 'No WhatsApp instance for this clinic.');
    try {
      await assertMessagePressureWithinLimits({
        clinicId,
        instanceId: instance.id,
      });
    } catch (error) {
      if (error instanceof HttpError) {
        const pressureDetails = (error.details && typeof error.details === 'object') ? error.details : {};
        await operationalEventRepository.append({
          eventType: 'MESSAGE_ENQUEUE_BLOCKED',
          clinicId,
          instanceId: instance.id,
          phone: normalizedTo,
          appointmentId: payload.appointmentId || null,
          summary: error.message,
          payload: {
            ...pressureDetails,
            bodyPreview: createBodySummary(body).preview,
          },
        });
      }
      throw error;
    }

    if (appointmentId) {
      const existingSimilarJob = await messageJobRepository.findLatestActiveSimilar({
        clinicId,
        appointmentId,
        toPhone: normalizedTo,
        body: auditBody,
      });
      if (existingSimilarJob) {
        await operationalEventRepository.append({
          eventType: 'MESSAGE_JOB_DEDUPED',
          clinicId,
          instanceId: instance.id,
          phone: normalizedTo,
          status: existingSimilarJob.status,
          messageJobId: existingSimilarJob.id,
          appointmentId,
          summary: 'duplicate message job prevented for the same appointment payload',
          payload: {
            existingJobId: existingSimilarJob.id,
            existingStatus: existingSimilarJob.status,
            bodyPreview: createBodySummary(auditBody).preview,
          },
        }).catch(() => null);
        return {
          ...existingSimilarJob,
          deduped: true,
        };
      }
    }

    const created = await createMessageJobRecord({
      clinicId,
      instanceId: instance.id,
      appointmentId,
      toPhone: normalizedTo,
      body,
      auditBody,
      scheduledFor: payload.scheduledFor || null,
    });

    const delayMs = payload.scheduledFor ? Math.max(0, new Date(payload.scheduledFor).getTime() - Date.now()) : 0;
    await enqueueMessageJob({ jobId: created.id }, { delayMs });

    return {
      ...created,
      deduped: false,
    };
  },

  createAndDispatchJob: async (payload: {
    clinicId: string;
    toPhone: string;
    body: string;
    auditBody?: string;
    appointmentId?: string;
  }) => {
    const clinicId = String(payload.clinicId || '').trim();
    const normalizedTo = normalizeBrPhone(payload.toPhone);
    const body = String(payload.body || '').trim();
    const auditBody = String(payload.auditBody || body).trim() || body;
    const appointmentId = String(payload.appointmentId || '').trim() || undefined;
    if (!clinicId) throw new HttpError(400, 'clinicId is required.');
    if (!normalizedTo) throw new HttpError(400, 'toPhone is invalid.');
    if (!body) throw new HttpError(400, 'body is required.');

    const instance = await instanceRepository.findByClinicId(clinicId);
    if (!instance) throw new HttpError(404, 'No WhatsApp instance for this clinic.');
    await assertMessagePressureWithinLimits({
      clinicId,
      instanceId: instance.id,
    });

    if (appointmentId) {
      const existingSimilarJob = await messageJobRepository.findLatestActiveSimilar({
        clinicId,
        appointmentId,
        toPhone: normalizedTo,
        body: auditBody,
      });
      if (existingSimilarJob) {
        return {
          jobId: existingSimilarJob.id,
          clinicId: existingSimilarJob.clinicId,
          instanceId: existingSimilarJob.instanceId,
          status: existingSimilarJob.status,
          providerMessageId: null,
          createdAt: existingSimilarJob.createdAt,
          updatedAt: existingSimilarJob.updatedAt,
          deduped: true,
        };
      }
    }

    const created = await createMessageJobRecord({
      clinicId,
      instanceId: instance.id,
      appointmentId,
      toPhone: normalizedTo,
      body,
      auditBody,
      scheduledFor: null,
    });
    if (created.deduped === true) {
      return {
        jobId: created.id,
        clinicId: created.clinicId,
        instanceId: created.instanceId,
        status: created.status,
        providerMessageId: null,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
        deduped: true,
      };
    }
    const result = await messagingService.processQueuedJob(created.id, 1, {
      dispatchBody: payload.body,
    });
    return {
      jobId: created.id,
      clinicId: created.clinicId,
      instanceId: created.instanceId,
      status: result.status,
      providerMessageId: result.providerMessageId || null,
      createdAt: created.createdAt,
      updatedAt: result.updatedAt,
      deduped: false,
    };
  },

  processQueuedJob: async (jobId: string, attemptCount: number, options?: { dispatchBody?: string }) => {
    const msgJob = await messageJobRepository.findById(jobId);
    if (!msgJob) throw new HttpError(404, 'Message job not found.');

    if (msgJob.status === MessageJobStatus.SENT) {
      await operationalEventRepository.append({
        eventType: 'MESSAGE_JOB_SKIPPED',
        clinicId: msgJob.clinicId,
        instanceId: msgJob.instanceId,
        phone: msgJob.toPhone,
        status: msgJob.status,
        messageJobId: msgJob.id,
        appointmentId: msgJob.appointmentId || null,
        summary: 'message job already sent; duplicate execution ignored',
      }).catch(() => null);
      return {
        status: MessageJobStatus.SENT,
        providerMessageId: null,
        updatedAt: msgJob.updatedAt,
      };
    }

    if (msgJob.status === MessageJobStatus.PROCESSING) {
      const updatedAtMs = new Date(msgJob.updatedAt).getTime();
      const processingWindowMs = Math.max(30000, env.workerLockDurationMs);
      if (Number.isFinite(updatedAtMs) && (Date.now() - updatedAtMs) < processingWindowMs) {
        await operationalEventRepository.append({
          eventType: 'MESSAGE_JOB_SKIPPED',
          clinicId: msgJob.clinicId,
          instanceId: msgJob.instanceId,
          phone: msgJob.toPhone,
          status: msgJob.status,
          messageJobId: msgJob.id,
          appointmentId: msgJob.appointmentId || null,
          summary: 'message job already processing; duplicate execution ignored',
        }).catch(() => null);
        return {
          status: MessageJobStatus.PROCESSING,
          providerMessageId: null,
          updatedAt: msgJob.updatedAt,
        };
      }
    }

    const instance = await instanceRepository.findById(msgJob.instanceId);
    if (!instance) throw new HttpError(404, 'Instance not found for message job.');
    if (instance.clinicId !== msgJob.clinicId) {
      throw new HttpError(409, 'Cross-clinic instance usage detected.');
    }

    const activeCircuitBreaker = getInstanceCircuitBreaker(instance.id);
    if (activeCircuitBreaker) {
      const breakerReason = `Instance circuit breaker active for ${formatCooldownSeconds(activeCircuitBreaker.remainingMs)}s after repeated runtime failures.`;
      await messageJobRepository.updateStatus(msgJob.id, MessageJobStatus.BLOCKED, {
        lastError: breakerReason,
      });
      await operationalEventRepository.append({
        eventType: 'MESSAGE_DISPATCH_BLOCKED',
        clinicId: msgJob.clinicId,
        instanceId: msgJob.instanceId,
        phone: msgJob.toPhone,
        status: MessageJobStatus.BLOCKED,
        messageJobId: msgJob.id,
        appointmentId: msgJob.appointmentId || null,
        summary: breakerReason,
        payload: {
          circuitBreakerMs: activeCircuitBreaker.remainingMs,
          tripCount: activeCircuitBreaker.tripCount,
          lastReason: activeCircuitBreaker.lastReason,
        },
      });
      await messageLogRepository.create({
        jobId: msgJob.id,
        eventType: MessageEventType.FAILED,
        payload: {
          reason: 'INSTANCE_CIRCUIT_BREAKER_ACTIVE',
          attemptCount,
          circuitBreakerMs: activeCircuitBreaker.remainingMs,
          tripCount: activeCircuitBreaker.tripCount,
        },
      });
      throw new HttpError(409, breakerReason);
    }

    const activeCooldown = getInstanceDispatchCooldown(instance.id);
    if (activeCooldown) {
      const cooldownReason = `Instance cooling down for ${formatCooldownSeconds(activeCooldown.remainingMs)}s after runtime instability.`;
      await messageJobRepository.updateStatus(msgJob.id, MessageJobStatus.BLOCKED, {
        lastError: cooldownReason,
      });
      await operationalEventRepository.append({
        eventType: 'MESSAGE_DISPATCH_BLOCKED',
        clinicId: msgJob.clinicId,
        instanceId: msgJob.instanceId,
        phone: msgJob.toPhone,
        status: MessageJobStatus.BLOCKED,
        messageJobId: msgJob.id,
        appointmentId: msgJob.appointmentId || null,
        summary: cooldownReason,
        payload: {
          cooldownMs: activeCooldown.remainingMs,
          failureCount: activeCooldown.failureCount,
          reason: activeCooldown.reason,
        },
      });
      await messageLogRepository.create({
        jobId: msgJob.id,
        eventType: MessageEventType.FAILED,
        payload: {
          reason: 'INSTANCE_COOLDOWN_ACTIVE',
          attemptCount,
          cooldownMs: activeCooldown.remainingMs,
          failureCount: activeCooldown.failureCount,
        },
      });
      throw new HttpError(409, cooldownReason);
    }

    if (instance.status !== 'CONNECTED') {
      const cooldown = registerInstanceDispatchCooldown(instance.id, 'instance disconnected before dispatch');
      const circuitFailure = registerInstanceCircuitBreakerFailure(instance.id, 'instance disconnected before dispatch');
      const activeBreaker = circuitFailure.breaker;
      const blockReason = activeBreaker
        ? `Instance disconnected. Cooling down for ${formatCooldownSeconds(cooldown.remainingMs)}s before retry. Circuit breaker active for ${formatCooldownSeconds(activeBreaker.remainingMs)}s after repeated runtime failures.`
        : `Instance disconnected. Cooling down for ${formatCooldownSeconds(cooldown.remainingMs)}s before retry.`;
      await messageJobRepository.updateStatus(msgJob.id, MessageJobStatus.BLOCKED, {
        lastError: blockReason,
      });
      await operationalEventRepository.append({
        eventType: 'MESSAGE_DISPATCH_BLOCKED',
        clinicId: msgJob.clinicId,
        instanceId: msgJob.instanceId,
        phone: msgJob.toPhone,
        status: MessageJobStatus.BLOCKED,
        messageJobId: msgJob.id,
        appointmentId: msgJob.appointmentId || null,
        summary: blockReason,
        payload: {
          cooldownMs: cooldown.remainingMs,
          failureCount: cooldown.failureCount,
          circuitFailureCount: circuitFailure.failureCount,
          circuitBreakerMs: activeBreaker?.remainingMs || null,
          circuitTripCount: activeBreaker?.tripCount || null,
        },
      });
      await messageLogRepository.create({
        jobId: msgJob.id,
        eventType: MessageEventType.FAILED,
        payload: {
          reason: 'INSTANCE_DISCONNECTED',
          instanceStatus: instance.status,
          attemptCount,
          cooldownMs: cooldown.remainingMs,
          failureCount: cooldown.failureCount,
          circuitFailureCount: circuitFailure.failureCount,
          circuitBreakerMs: activeBreaker?.remainingMs || null,
          circuitTripCount: activeBreaker?.tripCount || null,
        },
      });
      throw new HttpError(409, blockReason);
    }

    await messageJobRepository.updateStatus(msgJob.id, MessageJobStatus.PROCESSING, {
      retryCount: Math.max(0, attemptCount - 1),
    });
    await operationalEventRepository.append({
      eventType: 'MESSAGE_STATUS_UPDATED',
      clinicId: msgJob.clinicId,
      instanceId: msgJob.instanceId,
      phone: msgJob.toPhone,
      status: MessageJobStatus.PROCESSING,
      messageJobId: msgJob.id,
      appointmentId: msgJob.appointmentId || null,
      summary: 'message job moved to processing',
    });
    await messageLogRepository.create({
      jobId: msgJob.id,
      eventType: MessageEventType.PROCESSING,
      payload: {
        attemptCount,
      },
    });

    try {
      const dispatchBody = String(options?.dispatchBody || msgJob.body || '').trim();
      const dispatchSummary = createBodySummary(dispatchBody);
      await operationalEventRepository.append({
        eventType: 'MESSAGE_DISPATCH_STARTED',
        clinicId: msgJob.clinicId,
        instanceId: instance.id,
        phone: msgJob.toPhone,
        status: MessageJobStatus.PROCESSING,
        messageJobId: msgJob.id,
        appointmentId: msgJob.appointmentId || null,
        summary: dispatchSummary.preview,
        payload: {
          containsLinks: dispatchSummary.containsLinks,
          dispatchBodyLength: dispatchSummary.length,
        },
      });
      logger.info({
        jobId: msgJob.id,
        clinicId: msgJob.clinicId,
        instanceId: instance.id,
      }, 'dispatching queued message through internal api');
      const provider = await dispatchMessageThroughApi({
        instanceId: instance.id,
        toPhone: msgJob.toPhone,
        body: dispatchBody,
        appointmentId: msgJob.appointmentId || undefined,
      });
      clearInstanceDispatchCooldown(instance.id);
      clearInstanceCircuitBreaker(instance.id);
      await messageJobRepository.updateStatus(msgJob.id, MessageJobStatus.SENT);
      await operationalEventRepository.append({
        eventType: 'MESSAGE_DISPATCH_ACCEPTED',
        clinicId: msgJob.clinicId,
        instanceId: instance.id,
        phone: msgJob.toPhone,
        status: MessageJobStatus.SENT,
        messageJobId: msgJob.id,
        appointmentId: msgJob.appointmentId || null,
        summary: 'provider accepted dispatch',
        payload: {
          providerMessageId: provider.providerMessageId || null,
        },
      });
      await operationalEventRepository.append({
        eventType: 'MESSAGE_STATUS_UPDATED',
        clinicId: msgJob.clinicId,
        instanceId: instance.id,
        phone: msgJob.toPhone,
        status: MessageJobStatus.SENT,
        messageJobId: msgJob.id,
        appointmentId: msgJob.appointmentId || null,
        summary: 'message job marked as sent',
      });
      await messageLogRepository.create({
        jobId: msgJob.id,
        providerMessageId: provider.providerMessageId || undefined,
        eventType: MessageEventType.SENT,
        payload: {
          remoteJid: provider.remoteJid,
          attemptCount,
        },
      });
      const updated = await messageJobRepository.findById(msgJob.id);
      return {
        status: MessageJobStatus.SENT,
        providerMessageId: provider.providerMessageId || null,
        updatedAt: updated?.updatedAt || new Date(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown send error';
      const runtimeUnavailable = isRuntimeUnavailableError(error);
      const cooldown = runtimeUnavailable
        ? registerInstanceDispatchCooldown(instance.id, message)
        : null;
      const circuitFailure = runtimeUnavailable
        ? registerInstanceCircuitBreakerFailure(instance.id, message)
        : null;
      const activeBreaker = circuitFailure?.breaker || null;
      const eventType = runtimeUnavailable
        ? MessageEventType.FAILED
        : attemptCount > 1
          ? MessageEventType.RETRYING
          : MessageEventType.FAILED;
      await messageLogRepository.create({
        jobId: msgJob.id,
        eventType,
        payload: {
          error: message,
          attemptCount,
          runtimeUnavailable,
          cooldownMs: cooldown?.remainingMs || null,
          failureCount: cooldown?.failureCount || null,
          circuitFailureCount: circuitFailure?.failureCount || null,
          circuitBreakerMs: activeBreaker?.remainingMs || null,
          circuitTripCount: activeBreaker?.tripCount || null,
        },
      });
      await messageJobRepository.updateStatus(
        msgJob.id,
        runtimeUnavailable ? MessageJobStatus.BLOCKED : MessageJobStatus.FAILED,
        {
          retryCount: Math.max(0, attemptCount),
          lastError: runtimeUnavailable && cooldown
            ? activeBreaker
              ? `${message} Cooling down for ${formatCooldownSeconds(cooldown.remainingMs)}s before retry. Circuit breaker active for ${formatCooldownSeconds(activeBreaker.remainingMs)}s after repeated runtime failures.`
              : `${message} Cooling down for ${formatCooldownSeconds(cooldown.remainingMs)}s before retry.`
            : message,
        },
      );
      await operationalEventRepository.append({
        eventType: runtimeUnavailable ? 'MESSAGE_DISPATCH_BLOCKED' : 'MESSAGE_STATUS_UPDATED',
        clinicId: msgJob.clinicId,
        instanceId: msgJob.instanceId,
        phone: msgJob.toPhone,
        status: runtimeUnavailable ? MessageJobStatus.BLOCKED : MessageJobStatus.FAILED,
        messageJobId: msgJob.id,
        appointmentId: msgJob.appointmentId || null,
        summary: runtimeUnavailable && cooldown
          ? activeBreaker
            ? `${message} Cooling down for ${formatCooldownSeconds(cooldown.remainingMs)}s before retry. Circuit breaker active for ${formatCooldownSeconds(activeBreaker.remainingMs)}s after repeated runtime failures.`
            : `${message} Cooling down for ${formatCooldownSeconds(cooldown.remainingMs)}s before retry.`
          : message,
        payload: runtimeUnavailable && cooldown
          ? {
              cooldownMs: cooldown.remainingMs,
              failureCount: cooldown.failureCount,
              circuitFailureCount: circuitFailure?.failureCount || null,
              circuitBreakerMs: activeBreaker?.remainingMs || null,
              circuitTripCount: activeBreaker?.tripCount || null,
            }
          : undefined,
      });
      throw error;
    }
  },
};
