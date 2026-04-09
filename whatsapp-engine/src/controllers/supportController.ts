import { MessageEventType, MessageJobStatus } from '@prisma/client';
import { Request, Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import { messageLogRepository } from '../repositories/messageLogRepository';
import { messageJobRepository } from '../repositories/messageJobRepository';
import { operationalEventRepository } from '../repositories/operationalEventRepository';
import { centralBackendService } from '../services/integration/centralBackendService';
import { instanceService } from '../services/instance/instanceService';
import { maintenanceService } from '../services/maintenance/maintenanceService';
import { syntheticMonitorService } from '../services/monitoring/syntheticMonitorService';
import { operationalSettingsService } from '../services/settings/operationalSettingsService';
import { asyncHandler, HttpError } from '../utils/http';

const listRecentLogsQuerySchema = z.object({
  clinicId: z.string().optional(),
  instanceId: z.string().optional(),
  eventType: z.nativeEnum(MessageEventType).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).max(5000).optional(),
});

const listOperationalEventsQuerySchema = z.object({
  clinicId: z.string().optional(),
  instanceId: z.string().optional(),
  eventType: z.string().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).max(5000).optional(),
});

const listAdminAuditQuerySchema = z.object({
  clinicId: z.string().optional(),
  search: z.string().optional(),
  eventType: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).max(5000).optional(),
});

const operationsOverviewQuerySchema = z.object({
  hours: z.coerce.number().int().min(1).max(168).optional(),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

const exportClinicIncidentQuerySchema = z.object({
  clinicId: z.string().min(1),
  hours: z.coerce.number().int().min(1).max(168).optional(),
});

const clinicReadinessQuerySchema = z.object({
  clinicId: z.string().min(1),
});

const settingsUpdateSchema = z.object({
  maintenanceCleanupIntervalMs: z.coerce.number().int().min(60000).max(86400000),
  retentionMessageJobsDays: z.coerce.number().int().min(1).max(90),
  retentionMessageLogsDays: z.coerce.number().int().min(1).max(90),
  retentionOperationalEventsDays: z.coerce.number().int().min(1).max(90),
  clinicSlaWarningRatePct: z.coerce.number().min(70).max(100),
  clinicSlaCriticalRatePct: z.coerce.number().min(50).max(100),
  syntheticMonitorIntervalMs: z.coerce.number().int().min(60000).max(3600000),
  syntheticAlertCooldownMs: z.coerce.number().int().min(60000).max(86400000),
}).refine((data) => data.clinicSlaCriticalRatePct <= data.clinicSlaWarningRatePct, {
  message: 'Critical SLA must be less than or equal to warning SLA.',
  path: ['clinicSlaCriticalRatePct'],
});

const settingsResetSchema = z.object({
  keys: z.array(z.enum([
    'maintenanceCleanupIntervalMs',
    'retentionMessageJobsDays',
    'retentionMessageLogsDays',
    'retentionOperationalEventsDays',
    'clinicSlaWarningRatePct',
    'clinicSlaCriticalRatePct',
    'syntheticMonitorIntervalMs',
    'syntheticAlertCooldownMs',
  ])).optional(),
});

const isRecentActivity = (value: unknown, hours = 24): boolean => {
  if (!value) return false;
  const timestamp = new Date(String(value)).getTime();
  if (Number.isNaN(timestamp)) return false;
  return Date.now() - timestamp <= hours * 60 * 60 * 1000;
};

const isOperationalFailureEvent = (eventType: string): boolean => {
  const normalized = String(eventType || '').toUpperCase();
  return normalized.endsWith('_FAILED')
    || normalized.endsWith('_BLOCKED')
    || normalized === 'INSTANCE_DISCONNECTED';
};

const computeDeliverySuccessRate = (sentJobs?: number, failedJobs?: number): number | null => {
  const sent = Number(sentJobs || 0);
  const failed = Number(failedJobs || 0);
  const total = sent + failed;
  if (total <= 0) return null;
  return Number(((sent / total) * 100).toFixed(2));
};

const computeSlaStatus = (input: {
  deliverySuccessRate?: number | null;
  failedJobs?: number;
  queuePressure?: number;
  runtimeFailures?: number;
}): 'healthy' | 'warning' | 'critical' | 'no_data' => {
  const settings = operationalSettingsService.getEffective();
  const rate = typeof input.deliverySuccessRate === 'number' ? input.deliverySuccessRate : null;
  if (rate === null) {
    if (Number(input.failedJobs || 0) > 0 || Number(input.runtimeFailures || 0) > 0 || Number(input.queuePressure || 0) > 0) {
      return 'warning';
    }
    return 'no_data';
  }
  if (rate < settings.clinicSlaCriticalRatePct) return 'critical';
  if (rate < settings.clinicSlaWarningRatePct) return 'warning';
  return 'healthy';
};

const computeSeverity = (input: {
  errorCount?: number;
  failedJobs?: number;
  operationalErrors?: number;
  runtimeFailures?: number;
  queuedJobs?: number;
  processingJobs?: number;
  blockedJobs?: number;
  inactiveCount?: number;
  adminDenied?: number;
  reconnectScheduledCount?: number;
  coolingDownCount?: number;
  runtimeDegradedCount?: number;
  qrPendingCount?: number;
  pairingPendingCount?: number;
}): 'critical' | 'warning' | 'healthy' => {
  const queuePressure = Number(input.queuedJobs || 0) + Number(input.processingJobs || 0) + Number(input.blockedJobs || 0);
  const currentRuntimePressure =
    Number(input.runtimeDegradedCount || 0)
    + Number(input.reconnectScheduledCount || 0)
    + Number(input.coolingDownCount || 0)
    + Number(input.qrPendingCount || 0)
    + Number(input.pairingPendingCount || 0);
  if (
    Number(input.errorCount || 0) > 0
    || Number(input.failedJobs || 0) > 0
    || Number(input.blockedJobs || 0) > 0
    || currentRuntimePressure > 0
  ) {
    return 'critical';
  }
  if (
    queuePressure > 0
    || Number(input.inactiveCount || 0) > 0
    || Number(input.adminDenied || 0) > 0
    || Number(input.operationalErrors || 0) > 0
    || Number(input.runtimeFailures || 0) > 0
  ) {
    return 'warning';
  }
  return 'healthy';
};

const computePressureScore = (input: {
  errorCount?: number;
  failedJobs?: number;
  operationalErrors?: number;
  runtimeFailures?: number;
  queuedJobs?: number;
  processingJobs?: number;
  blockedJobs?: number;
  inactiveCount?: number;
  adminDenied?: number;
  reconnectScheduledCount?: number;
  coolingDownCount?: number;
  qrPendingCount?: number;
  pairingPendingCount?: number;
  runtimeDegradedCount?: number;
}): number => (
  (Number(input.errorCount || 0) * 5)
  + (Number(input.failedJobs || 0) * 4)
  + (Number(input.operationalErrors || 0) * 3)
  + (Number(input.runtimeFailures || 0) * 4)
  + (Number(input.queuedJobs || 0) * 2)
  + (Number(input.processingJobs || 0) * 2)
  + (Number(input.blockedJobs || 0) * 3)
  + (Number(input.inactiveCount || 0) * 2)
  + (Number(input.adminDenied || 0) * 2)
  + (Number(input.reconnectScheduledCount || 0) * 3)
  + (Number(input.coolingDownCount || 0) * 3)
  + (Number(input.qrPendingCount || 0) * 2)
  + (Number(input.pairingPendingCount || 0) * 1)
  + (Number(input.runtimeDegradedCount || 0) * 3)
);

const buildClinicPressureReasons = (item: Record<string, any>): string[] => {
  const reasons: string[] = [];
  if (Number(item.queuePressure || 0) > 0) reasons.push('fila');
  if (Number(item.blockedJobs || 0) > 0) reasons.push('bloqueios');
  if (Number(item.failedJobs || 0) > 0) reasons.push('falha_de_envio');
  if (Number(item.errorCount || 0) > 0) reasons.push('instancia_em_erro');
  if (Number(item.reconnectScheduledCount || 0) > 0) reasons.push('reconnect');
  if (Number(item.coolingDownCount || 0) > 0) reasons.push('cooldown');
  if (Number(item.qrPendingCount || 0) > 0) reasons.push('qr_pendente');
  if (Number(item.pairingPendingCount || 0) > 0) reasons.push('pareamento');
  if (Number(item.runtimeDegradedCount || 0) > 0) reasons.push('runtime');
  if (Number(item.inactiveCount || 0) > 0) reasons.push('inatividade');
  if (Number(item.adminDenied || 0) > 0) reasons.push('rbac');
  return reasons;
};

const buildInstancePressureReasons = (item: Record<string, any>): string[] => {
  const reasons: string[] = [];
  if (String(item.status || '').toUpperCase() === 'ERROR') reasons.push('instancia_em_erro');
  if (Number(item.queuePressure || 0) > 0) reasons.push('fila');
  if (Number(item.blockedJobs || 0) > 0) reasons.push('bloqueios');
  if (Number(item.failedJobs || 0) > 0) reasons.push('falha_de_envio');
  if (item.reconnectScheduled) reasons.push('reconnect');
  if (item.coolingDown) reasons.push('cooldown');
  if (item.qrPending) reasons.push('qr_pendente');
  if (item.pairingCodeAvailable) reasons.push('pareamento');
  if (item.runtimeDegraded) reasons.push('runtime');
  if (item.inactive) reasons.push('inatividade');
  if (Number(item.adminDenied || 0) > 0) reasons.push('rbac');
  return reasons;
};

const maskToken = (token: string): string => {
  if (!token) return 'Nao configurado';
  if (token.length <= 8) return `${token.slice(0, 2)}****${token.slice(-1)}`;
  return `${token.slice(0, 4)}••••••${token.slice(-4)}`;
};

export const listRecentLogs = asyncHandler(async (req: Request, res: Response) => {
  const parsed = listRecentLogsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new HttpError(400, 'Invalid query params.', parsed.error.flatten());
  }

  const logs = await messageLogRepository.findRecent(parsed.data);
  res.json({
    success: true,
    data: logs,
  });
});

export const listOperationalEvents = asyncHandler(async (req: Request, res: Response) => {
  const parsed = listOperationalEventsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new HttpError(400, 'Invalid query params.', parsed.error.flatten());
  }

  const events = await operationalEventRepository.listRecent(parsed.data);
  res.json({
    success: true,
    data: events,
  });
});

export const listAdminAudit = asyncHandler(async (req: Request, res: Response) => {
  const parsed = listAdminAuditQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new HttpError(400, 'Invalid query params.', parsed.error.flatten());
  }

  const limit = parsed.data.limit || 20;
  const offset = parsed.data.offset || 0;
  const items = await operationalEventRepository.listRecent({
    clinicId: parsed.data.clinicId,
    eventType: parsed.data.eventType,
    search: parsed.data.search,
    limit: limit + 1,
    offset,
    auditOnly: true,
  });

  res.json({
    success: true,
    data: {
      items: items.slice(0, limit),
      pagination: {
        offset,
        limit,
        hasMore: items.length > limit,
      },
    },
  });
});

export const getOperationsOverview = asyncHandler(async (req: Request, res: Response) => {
  const parsed = operationsOverviewQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new HttpError(400, 'Invalid query params.', parsed.error.flatten());
  }

  const hours = parsed.data.hours || 24;
  const limit = parsed.data.limit || 8;
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const [instancePayload, jobCounts, recentJobs, recentEvents] = await Promise.all([
    instanceService.listInstances(),
    messageJobRepository.countByStatusSince(since),
    messageJobRepository.findSince({ since, limit: 500 }),
    operationalEventRepository.listRecent({ limit: 500 }),
  ]);

  const instances = Array.isArray(instancePayload?.items) ? instancePayload.items : [];
  const scopedEvents = (recentEvents || []).filter((item) => {
    const timestamp = new Date(String(item?.createdAt || '')).getTime();
    return !Number.isNaN(timestamp) && timestamp >= since.getTime();
  });

  const clinicMap = new Map<string, any>();
  const instanceMap = new Map<string, any>();

  for (const instance of instances) {
    const clinicId = String(instance?.clinicId || '').trim();
    const instanceId = String(instance?.id || '').trim();
    if (!clinicId || !instanceId) continue;

    if (!clinicMap.has(clinicId)) {
      clinicMap.set(clinicId, {
        clinicId,
        clinicName: instance?.clinicName || instance?.displayName || clinicId,
        clinicLegalName: instance?.clinicLegalName || null,
        clinicDocument: instance?.clinicDocument || null,
        instanceCount: 0,
        connectedCount: 0,
        errorCount: 0,
        inactiveCount: 0,
        failedJobs: 0,
        queuedJobs: 0,
        processingJobs: 0,
        blockedJobs: 0,
        sentJobs: 0,
        operationalErrors: 0,
        runtimeFailures: 0,
        adminDenied: 0,
        reconnectScheduledCount: 0,
        coolingDownCount: 0,
        qrPendingCount: 0,
        qrAvailableCount: 0,
        pairingPendingCount: 0,
        runtimeDegradedCount: 0,
        reconnectAttemptMax: 0,
        lastActivityAt: instance?.lastSeenAt || instance?.updatedAt || instance?.createdAt || null,
      });
    }

    const clinicEntry = clinicMap.get(clinicId);
    clinicEntry.instanceCount += 1;
    if (String(instance?.status || '').toUpperCase() === 'CONNECTED') clinicEntry.connectedCount += 1;
    if (String(instance?.status || '').toUpperCase() === 'ERROR') clinicEntry.errorCount += 1;
    if (!isRecentActivity(instance?.lastSeenAt || instance?.updatedAt || instance?.createdAt, 24)) {
      clinicEntry.inactiveCount += 1;
    }
    if (Boolean(instance?.reconnectScheduled)) clinicEntry.reconnectScheduledCount += 1;
    if (Boolean(instance?.coolingDown)) clinicEntry.coolingDownCount += 1;
    if (Boolean(instance?.qrPending)) clinicEntry.qrPendingCount += 1;
    if (Boolean(instance?.qrAvailable)) clinicEntry.qrAvailableCount += 1;
    if (Boolean(instance?.pairingCodeAvailable)) clinicEntry.pairingPendingCount += 1;
    if (Boolean(instance?.runtimeDegraded)) clinicEntry.runtimeDegradedCount += 1;
    clinicEntry.reconnectAttemptMax = Math.max(clinicEntry.reconnectAttemptMax, Number(instance?.reconnectAttempt || 0));

    const instanceActivityAt = instance?.lastSeenAt || instance?.updatedAt || instance?.createdAt || null;
    if (
      instanceActivityAt
      && (!clinicEntry.lastActivityAt || new Date(instanceActivityAt).getTime() > new Date(clinicEntry.lastActivityAt).getTime())
    ) {
      clinicEntry.lastActivityAt = instanceActivityAt;
    }

    instanceMap.set(instanceId, {
      instanceId,
      clinicId,
      clinicName: clinicEntry.clinicName,
      clinicDocument: clinicEntry.clinicDocument,
      displayName: instance?.displayName || null,
      phoneNumber: instance?.phoneNumber || null,
      status: instance?.status || 'UNKNOWN',
      connectedInRuntime: Boolean(instance?.connectedInRuntime),
      runtimeSocketState: instance?.runtimeSocketState || null,
      lastActivityAt: instanceActivityAt,
      failedJobs: 0,
      queuedJobs: 0,
      processingJobs: 0,
      blockedJobs: 0,
      sentJobs: 0,
      operationalErrors: 0,
      runtimeFailures: 0,
      adminDenied: 0,
      inactive: !isRecentActivity(instanceActivityAt, 24),
      reconnectAttempt: Number(instance?.reconnectAttempt || 0),
      reconnectScheduled: Boolean(instance?.reconnectScheduled),
      reconnectNextAttemptAt: instance?.reconnectNextAttemptAt || null,
      reconnectDelayMs: Number(instance?.reconnectDelayMs || 0),
      coolingDown: Boolean(instance?.coolingDown),
      qrPending: Boolean(instance?.qrPending),
      qrAvailable: Boolean(instance?.qrAvailable),
      qrUpdatedAt: instance?.qrUpdatedAt || null,
      pairingCodeAvailable: Boolean(instance?.pairingCodeAvailable),
      runtimeDegraded: Boolean(instance?.runtimeDegraded),
    });
  }

  for (const job of recentJobs || []) {
    const clinicEntry = clinicMap.get(String(job.clinicId || ''));
    const instanceEntry = instanceMap.get(String(job.instanceId || ''));
    const status = String(job.status || '').toUpperCase();

    if (clinicEntry) {
      if (status === 'FAILED') clinicEntry.failedJobs += 1;
      if (status === 'QUEUED') clinicEntry.queuedJobs += 1;
      if (status === 'PROCESSING') clinicEntry.processingJobs += 1;
      if (status === 'BLOCKED') clinicEntry.blockedJobs += 1;
      if (status === 'SENT') clinicEntry.sentJobs += 1;
    }

    if (instanceEntry) {
      if (status === 'FAILED') instanceEntry.failedJobs += 1;
      if (status === 'QUEUED') instanceEntry.queuedJobs += 1;
      if (status === 'PROCESSING') instanceEntry.processingJobs += 1;
      if (status === 'BLOCKED') instanceEntry.blockedJobs += 1;
      if (status === 'SENT') instanceEntry.sentJobs += 1;
    }
  }

  for (const event of scopedEvents) {
    const clinicEntry = clinicMap.get(String(event.clinicId || ''));
    const instanceEntry = instanceMap.get(String(event.instanceId || ''));
    const eventType = String(event.eventType || '').toUpperCase();

    if (eventType === 'ADMIN_ACTION_DENIED') {
      if (clinicEntry) clinicEntry.adminDenied += 1;
      if (instanceEntry) instanceEntry.adminDenied += 1;
    }

    if (isOperationalFailureEvent(eventType)) {
      if (clinicEntry) clinicEntry.operationalErrors += 1;
      if (instanceEntry) instanceEntry.operationalErrors += 1;
    }

    if (eventType.includes('RUNTIME') || eventType === 'INSTANCE_DISCONNECTED') {
      if (clinicEntry) clinicEntry.runtimeFailures += 1;
      if (instanceEntry) instanceEntry.runtimeFailures += 1;
    }
  }

  const clinicRisks = [...clinicMap.values()]
    .map((item) => ({
      ...item,
      deliverySuccessRate: computeDeliverySuccessRate(item.sentJobs, item.failedJobs),
      queuePressure: item.queuedJobs + item.processingJobs + item.blockedJobs,
    }))
    .map((item) => ({
      ...item,
      severity: computeSeverity(item),
      slaStatus: computeSlaStatus({
        deliverySuccessRate: item.deliverySuccessRate,
        failedJobs: item.failedJobs,
        queuePressure: item.queuePressure,
        runtimeFailures: item.runtimeFailures,
      }),
      pressureScore: computePressureScore({
        ...item,
        queuedJobs: item.queuedJobs,
        processingJobs: item.processingJobs,
        blockedJobs: item.blockedJobs,
      }),
      pressureReasons: buildClinicPressureReasons({
        ...item,
        queuePressure: item.queuedJobs + item.processingJobs + item.blockedJobs,
      }),
    }))
    .sort((left, right) => {
      const severityOrder = { critical: 0, warning: 1, healthy: 2 } as Record<string, number>;
      const severityDiff = severityOrder[left.severity] - severityOrder[right.severity];
      if (severityDiff !== 0) return severityDiff;
      return (right.failedJobs + right.queuePressure + right.errorCount + right.inactiveCount) - (left.failedJobs + left.queuePressure + left.errorCount + left.inactiveCount);
    });

  const instanceRisks = [...instanceMap.values()]
    .map((item) => ({
      ...item,
      deliverySuccessRate: computeDeliverySuccessRate(item.sentJobs, item.failedJobs),
      queuePressure: item.queuedJobs + item.processingJobs + item.blockedJobs,
    }))
    .map((item) => ({
      ...item,
      severity: computeSeverity({
        errorCount: String(item.status || '').toUpperCase() === 'ERROR' ? 1 : 0,
        failedJobs: item.failedJobs,
        operationalErrors: item.operationalErrors,
        runtimeFailures: item.runtimeFailures,
        queuedJobs: item.queuedJobs,
        processingJobs: item.processingJobs,
        blockedJobs: item.blockedJobs,
        inactiveCount: item.inactive ? 1 : 0,
        adminDenied: item.adminDenied,
      }),
      slaStatus: computeSlaStatus({
        deliverySuccessRate: item.deliverySuccessRate,
        failedJobs: item.failedJobs,
        queuePressure: item.queuePressure,
        runtimeFailures: item.runtimeFailures,
      }),
      pressureScore: computePressureScore({
        errorCount: String(item.status || '').toUpperCase() === 'ERROR' ? 1 : 0,
        failedJobs: item.failedJobs,
        operationalErrors: item.operationalErrors,
        runtimeFailures: item.runtimeFailures,
        queuedJobs: item.queuedJobs,
        processingJobs: item.processingJobs,
        blockedJobs: item.blockedJobs,
        inactiveCount: item.inactive ? 1 : 0,
        adminDenied: item.adminDenied,
        reconnectScheduledCount: item.reconnectScheduled ? 1 : 0,
        coolingDownCount: item.coolingDown ? 1 : 0,
        qrPendingCount: item.qrPending ? 1 : 0,
        pairingPendingCount: item.pairingCodeAvailable ? 1 : 0,
        runtimeDegradedCount: item.runtimeDegraded ? 1 : 0,
      }),
      pressureReasons: buildInstancePressureReasons({
        ...item,
        queuePressure: item.queuedJobs + item.processingJobs + item.blockedJobs,
      }),
    }))
    .sort((left, right) => {
      const severityOrder = { critical: 0, warning: 1, healthy: 2 } as Record<string, number>;
      const severityDiff = severityOrder[left.severity] - severityOrder[right.severity];
      if (severityDiff !== 0) return severityDiff;
      return (right.failedJobs + right.queuePressure + right.operationalErrors + (right.inactive ? 1 : 0)) - (left.failedJobs + left.queuePressure + left.operationalErrors + (left.inactive ? 1 : 0));
    });

  const clinicsAtRisk = clinicRisks.filter((item) => item.severity !== 'healthy').length;
  const clinicsWithQueuePressure = clinicRisks.filter((item) => item.queuePressure > 0).length;
  const clinicsInCooldown = clinicRisks.filter((item) => item.coolingDownCount > 0).length;
  const clinicsWithQrPending = clinicRisks.filter((item) => item.qrPendingCount > 0 || item.qrAvailableCount > 0 || item.pairingPendingCount > 0).length;
  const reconnectingInstances = instanceRisks.filter((item) => item.reconnectScheduled).length;
  const clinicsBelowSla = clinicRisks.filter((item) => item.slaStatus === 'warning' || item.slaStatus === 'critical').length;
  const activeOperationalAlerts = clinicRisks.filter((item) => item.severity === 'critical' || item.slaStatus === 'critical').length;
  const maintenance = maintenanceService.getSnapshot();
  const syntheticMonitor = syntheticMonitorService.getSnapshot();

  const clinicPressure = [...clinicRisks]
    .sort((left, right) => {
      const severityOrder = { critical: 0, warning: 1, healthy: 2 } as Record<string, number>;
      const severityDiff = severityOrder[left.severity] - severityOrder[right.severity];
      if (severityDiff !== 0) return severityDiff;
      return Number(right.pressureScore || 0) - Number(left.pressureScore || 0);
    });

  res.json({
    success: true,
    data: {
      generatedAt: new Date().toISOString(),
      periodHours: hours,
      summary: {
        totalClinics: clinicMap.size,
        clinicsWithInstances: clinicMap.size,
        clinicsAtRisk,
        clinicsWithQueuePressure,
        clinicsInCooldown,
        clinicsWithQrPending,
        reconnectingInstances,
        clinicsBelowSla,
        activeOperationalAlerts,
        syntheticStatus: syntheticMonitor.status,
        centralStatus: syntheticMonitor.centralStatus,
        sentJobsRecent: Number(jobCounts.SENT || 0),
        failedJobsRecent: Number(jobCounts.FAILED || 0),
        queuedJobsRecent: Number(jobCounts.QUEUED || 0),
        processingJobsRecent: Number(jobCounts.PROCESSING || 0),
        blockedJobsRecent: Number(jobCounts.BLOCKED || 0),
        adminDeniedRecent: scopedEvents.filter((item) => String(item.eventType || '').toUpperCase() === 'ADMIN_ACTION_DENIED').length,
        runtimeFailuresRecent: scopedEvents.filter((item) => {
          const eventType = String(item.eventType || '').toUpperCase();
          return eventType.includes('RUNTIME') || eventType === 'INSTANCE_DISCONNECTED';
        }).length,
      },
      maintenance,
      syntheticMonitor,
      topClinicPressure: clinicPressure.slice(0, limit),
      topClinicRisks: clinicRisks.slice(0, limit),
      topInstanceRisks: instanceRisks.slice(0, limit),
    },
  });
});

export const getClinicReadiness = asyncHandler(async (req: Request, res: Response) => {
  const parsed = clinicReadinessQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new HttpError(400, 'Invalid query params.', parsed.error.flatten());
  }

  const clinicId = String(parsed.data.clinicId || '').trim();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [clinic, instancePayload, activeJobs, recentJobs] = await Promise.all([
    centralBackendService.getClinicById(clinicId).catch(() => null),
    instanceService.listInstances(),
    messageJobRepository.countByStatuses({
      clinicId,
      statuses: [
        MessageJobStatus.QUEUED,
        MessageJobStatus.PROCESSING,
        MessageJobStatus.SCHEDULED,
        MessageJobStatus.BLOCKED,
      ],
    }),
    messageJobRepository.findSince({ since, clinicId, limit: 120 }),
  ]);

  const instance = (Array.isArray(instancePayload?.items) ? instancePayload.items : [])
    .find((item: any) => String(item?.clinicId || '').trim() === clinicId) || null;
  const instanceStatus = String(instance?.status || '').toUpperCase();
  const needsPairing = Boolean(instance) && instanceStatus === 'CREATED' && !instance?.connectedInRuntime;
  const needsManualAttention = Boolean(instance) && instanceStatus === 'ERROR';
  const recentFailures = recentJobs.filter((job: any) => String(job?.status || '').toUpperCase() === 'FAILED').length;
  const recentSent = recentJobs.filter((job: any) => String(job?.status || '').toUpperCase() === 'SENT').length;
  const deliverySuccessRate = computeDeliverySuccessRate(recentSent, recentFailures);

  const checks = [
    {
      key: 'central_clinic_resolved',
      ok: Boolean(clinic),
      summary: clinic ? 'Clinica encontrada no catalogo central.' : 'Clinica nao encontrada no catalogo central.',
    },
    {
      key: 'instance_present',
      ok: Boolean(instance),
      summary: instance ? 'Instancia ja provisionada no NG.' : 'Clinica pronta para onboarding no NG.',
    },
    {
      key: 'runtime_connected',
      ok: Boolean(instance?.connectedInRuntime),
      summary: instance
        ? (
          instance.connectedInRuntime
            ? 'Runtime conectado e pronto para envio.'
            : needsPairing
              ? 'Instancia provisionada, aguardando novo pareamento manual.'
              : needsManualAttention
                ? 'Instancia provisionada, mas requer revisao manual do operador.'
                : 'Runtime ainda nao conectado para a clinica.'
        )
        : 'Ainda sem instancia provisionada.',
    },
    {
      key: 'queue_pressure_clear',
      ok: activeJobs === 0,
      summary: activeJobs === 0 ? 'Sem fila ativa para a clinica.' : `Fila ativa com ${activeJobs} job(s).`,
    },
    {
      key: 'recent_failures_clear',
      ok: recentFailures === 0,
      summary: recentFailures === 0 ? 'Sem falhas recentes de envio.' : `${recentFailures} falha(s) recentes nas ultimas 24h.`,
    },
  ];

  res.json({
    success: true,
    data: {
      clinicId,
      clinic: clinic ? {
        id: String(clinic?.id || clinic?.clinicId || clinicId),
        clinicName: String(clinic?.nomeFantasia || clinic?.name || '').trim() || clinicId,
        clinicLegalName: String(clinic?.razaoSocial || '').trim() || null,
        clinicDocument: String(clinic?.cnpjCpf || clinic?.cnpjOuCpf || '').trim() || null,
      } : null,
      instance,
      activeJobs,
      recentFailures,
      deliverySuccessRate,
      canProvision: Boolean(clinic) && !instance,
      canDeprovision: Boolean(instance) && activeJobs === 0,
      needsPairing,
      needsManualAttention,
      smokePassed: Boolean(clinic) && Boolean(instance?.connectedInRuntime) && activeJobs === 0,
      checks,
    },
  });
});

export const getWebhookOverview = asyncHandler(async (_req: Request, res: Response) => {
  const recentInbound = await centralBackendService.listRecentInboundWhatsapp({ limit: 12 }).catch(() => []);

  res.json({
    success: true,
    data: {
      baseUrl: env.centralBackendBaseUrl || '',
      configured: Boolean(env.centralBackendBaseUrl && env.centralBackendServiceToken),
      supportsPerInstanceConfig: false,
      supportedEvents: [
        'connected',
        'disconnected',
        'message received',
        'message sent',
        'error',
      ],
      recentDeliveries: recentInbound.map((item: any) => ({
        event: item.intent === 'APPOINTMENT_CONFIRMATION'
          ? 'message received'
          : item.intent === 'APPOINTMENT_RESCHEDULE'
            ? 'message received'
            : 'message received',
        clinicId: item.clinicId,
        timestamp: item.createdAt,
        targetUrl: env.centralBackendBaseUrl || '',
        fromPhone: item.fromPhone,
        appointmentId: item.appointmentId,
        status: item.status,
        intent: item.intent,
        bodyPreview: String(item.body || '').slice(0, 120),
      })),
      samplePayloads: {
        connected: {
          event: 'connected',
          clinicId: 'clinic-001',
          instanceId: 'instance-123',
          timestamp: new Date().toISOString(),
        },
        disconnected: {
          event: 'disconnected',
          clinicId: 'clinic-001',
          instanceId: 'instance-123',
          reason: 'runtime socket closed',
          timestamp: new Date().toISOString(),
        },
        'message received': {
          event: 'message received',
          clinicId: 'clinic-001',
          fromPhone: '5511999999999',
          body: '1',
          intent: 'APPOINTMENT_CONFIRMATION',
          appointmentId: 'appointment-123',
          timestamp: new Date().toISOString(),
        },
        'message sent': {
          event: 'message sent',
          clinicId: 'clinic-001',
          instanceId: 'instance-123',
          to: '5511988887777',
          status: 'SENT',
        },
        error: {
          event: 'error',
          clinicId: 'clinic-001',
          instanceId: 'instance-123',
          message: 'Instance disconnected.',
        },
      },
    },
  });
});

export const exportClinicIncident = asyncHandler(async (req: Request, res: Response) => {
  const parsed = exportClinicIncidentQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new HttpError(400, 'Invalid query params.', parsed.error.flatten());
  }

  const clinicId = String(parsed.data.clinicId || '').trim();
  const hours = parsed.data.hours || 24;
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const [instancePayload, recentJobs, recentMessageLogs, recentOperationalEvents] = await Promise.all([
    instanceService.listInstances(),
    messageJobRepository.findSince({ since, clinicId, limit: 200 }),
    messageLogRepository.findRecent({ clinicId, limit: 120, offset: 0 }),
    operationalEventRepository.listRecent({ clinicId, limit: 240, offset: 0 }),
  ]);

  const instances = (Array.isArray(instancePayload?.items) ? instancePayload.items : [])
    .filter((item: any) => String(item?.clinicId || '').trim() === clinicId);

  const summary = recentJobs.reduce<Record<string, number>>((acc, job: any) => {
    const status = String(job?.status || 'UNKNOWN').toUpperCase();
    acc[status] = Number(acc[status] || 0) + 1;
    return acc;
  }, {});

  res.json({
    success: true,
    data: {
      generatedAt: new Date().toISOString(),
      clinicId,
      periodHours: hours,
      summary: {
        instanceCount: instances.length,
        recentJobs: recentJobs.length,
        recentMessageLogs: recentMessageLogs.length,
        recentOperationalEvents: recentOperationalEvents.length,
        statuses: summary,
      },
      instances,
      recentJobs,
      recentMessageLogs,
      recentOperationalEvents,
    },
  });
});

export const getSecurityOverview = (_req: Request, res: Response): void => {
  res.json({
    success: true,
    data: {
      maskedInternalToken: maskToken(env.serviceInternalApiToken),
      hasInternalToken: Boolean(env.serviceInternalApiToken),
      maskedServiceToken: maskToken(env.serviceInternalApiToken),
      hasServiceToken: Boolean(env.serviceInternalApiToken),
      maskedAdminPanelToken: maskToken(env.adminPanelToken),
      hasAdminPanelToken: Boolean(env.adminPanelToken),
      maskedReadOnlyAdminPanelToken: maskToken(env.adminPanelReadOnlyToken),
      hasReadOnlyAdminPanelToken: Boolean(env.adminPanelReadOnlyToken),
      adminSessions: {
        supported: true,
        summary: 'Painel com sessao assinada em cookie httpOnly e perfis separados de leitura e operacao.',
      },
      ipAllowlist: {
        supported: false,
        summary: 'Allowlist de IP ainda nao foi implementada no engine.',
      },
      audit: {
        supported: true,
        summary: 'Log operacional registra login/logout e acoes sensiveis disparadas pelo painel admin, com consulta paginada por clinica.',
      },
      rotation: {
        supported: false,
        summary: 'Tokens de servico e painel agora sao separados, mas a rotacao coordenada ainda nao foi implementada.',
      },
    },
  });
};

export const getSettingsOverview = (_req: Request, res: Response): void => {
  const settings = operationalSettingsService.getSnapshot();
  const monitoredClinicIds = String(env.syntheticMonitorClinicIds || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  res.json({
    success: true,
    data: {
      runtime: {
        nodeEnv: env.nodeEnv,
        port: env.port,
        logLevel: env.logLevel,
        sessionsDir: env.sessionsDir,
        workerConcurrency: env.workerConcurrency,
        messageMaxAttempts: env.messageMaxAttempts,
        messageBackoffMs: env.messageBackoffMs,
      },
      storage: {
        databaseConfigured: Boolean(env.databaseUrl),
        redisHost: env.redisHost,
        redisPort: env.redisPort,
        redisPasswordConfigured: Boolean(env.redisPassword),
      },
      integrations: {
        centralBackendBaseUrl: env.centralBackendBaseUrl || 'Nao configurado',
        centralBackendConfigured: Boolean(env.centralBackendBaseUrl && env.centralBackendServiceToken),
        internalServiceTokenConfigured: Boolean(env.serviceInternalApiToken),
        adminPanelOperatorEnabled: Boolean(env.adminPanelToken),
        adminPanelReadOnlyEnabled: Boolean(env.adminPanelReadOnlyToken),
        opsAlertWebhookConfigured: Boolean(env.opsAlertWebhookUrl && env.opsAlertWebhookToken),
      },
      monitoring: {
        maintenanceCleanupIntervalMs: settings.effective.maintenanceCleanupIntervalMs,
        syntheticMonitorIntervalMs: settings.effective.syntheticMonitorIntervalMs,
        syntheticAlertCooldownMs: settings.effective.syntheticAlertCooldownMs,
        monitoredClinicIds,
        monitoredClinicCount: monitoredClinicIds.length,
        clinicSlaWarningRatePct: settings.effective.clinicSlaWarningRatePct,
        clinicSlaCriticalRatePct: settings.effective.clinicSlaCriticalRatePct,
      },
      retention: {
        messageJobsDays: settings.effective.retentionMessageJobsDays,
        messageLogsDays: settings.effective.retentionMessageLogsDays,
        operationalEventsDays: settings.effective.retentionOperationalEventsDays,
      },
      protection: {
        serverMaxActiveJobsGlobal: env.serverMaxActiveJobsGlobal,
        serverMaxActiveJobsPerClinic: env.serverMaxActiveJobsPerClinic,
        instanceSendCooldownBaseMs: env.instanceSendCooldownBaseMs,
        instanceSendCooldownMaxMs: env.instanceSendCooldownMaxMs,
        instanceCircuitBreakerThreshold: env.instanceCircuitBreakerThreshold,
        instanceCircuitBreakerWindowMs: env.instanceCircuitBreakerWindowMs,
        instanceCircuitBreakerOpenMs: env.instanceCircuitBreakerOpenMs,
        runtimeRecoveryConcurrency: env.runtimeRecoveryConcurrency,
        runtimeRecoveryDelayMs: env.runtimeRecoveryDelayMs,
        reconnectBaseDelayMs: env.reconnectBaseDelayMs,
        reconnectMaxDelayMs: env.reconnectMaxDelayMs,
      },
      editable: {
        defaults: settings.defaults,
        overrides: settings.overrides,
        effective: settings.effective,
        filePath: operationalSettingsService.getFilePath(),
      },
    },
  });
};

const reloadOperationalSchedules = async (): Promise<void> => {
  maintenanceService.reloadSchedule();
  syntheticMonitorService.reloadSchedule();
  await Promise.allSettled([
    maintenanceService.runNow(),
    syntheticMonitorService.runNow(),
  ]);
};

export const updateSettingsOverview = asyncHandler(async (req: Request, res: Response) => {
  const parsed = settingsUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, 'Invalid payload.', parsed.error.flatten());
  }

  const snapshot = operationalSettingsService.save(parsed.data);
  await reloadOperationalSchedules();

  const adminSession = (req as Request & { adminSession?: { role?: string; label?: string } }).adminSession || null;
  await operationalEventRepository.append({
    eventType: 'ADMIN_SETTINGS_UPDATED',
    status: 'SUCCESS',
    summary: `Configuracoes operacionais atualizadas por ${adminSession?.label || 'unknown'}.`,
    payload: {
      role: adminSession?.role || null,
      updatedKeys: Object.keys(parsed.data),
      overrides: snapshot.overrides,
    },
  }).catch(() => null);

  res.json({
    success: true,
    data: {
      defaults: snapshot.defaults,
      overrides: snapshot.overrides,
      effective: snapshot.effective,
      filePath: operationalSettingsService.getFilePath(),
    },
  });
});

export const resetSettingsOverview = asyncHandler(async (req: Request, res: Response) => {
  const parsed = settingsResetSchema.safeParse(req.body || {});
  if (!parsed.success) {
    throw new HttpError(400, 'Invalid payload.', parsed.error.flatten());
  }

  const snapshot = operationalSettingsService.reset(parsed.data.keys);
  await reloadOperationalSchedules();

  const adminSession = (req as Request & { adminSession?: { role?: string; label?: string } }).adminSession || null;
  await operationalEventRepository.append({
    eventType: 'ADMIN_SETTINGS_RESET',
    status: 'SUCCESS',
    summary: `Configuracoes operacionais resetadas por ${adminSession?.label || 'unknown'}.`,
    payload: {
      role: adminSession?.role || null,
      resetKeys: parsed.data.keys || 'ALL',
      overrides: snapshot.overrides,
    },
  }).catch(() => null);

  res.json({
    success: true,
    data: {
      defaults: snapshot.defaults,
      overrides: snapshot.overrides,
      effective: snapshot.effective,
      filePath: operationalSettingsService.getFilePath(),
    },
  });
});
