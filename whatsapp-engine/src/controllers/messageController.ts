import { Request, Response } from 'express';
import { MessageJobStatus } from '@prisma/client';
import { z } from 'zod';
import { asyncHandler, HttpError } from '../utils/http';
import { messagingService } from '../services/messaging/messagingService';
import { messageJobRepository } from '../repositories/messageJobRepository';
import { operationalEventRepository } from '../repositories/operationalEventRepository';

const getAdminActor = (req: Request): string => {
  const session = (req as Request & { adminSession?: { label?: string; role?: string } | null }).adminSession;
  return session?.label || session?.role || 'service';
};

const sendMessageSchema = z.object({
  clinicId: z.string().min(1),
  toPhone: z.string().min(8),
  body: z.string().min(1).max(4096),
  auditBody: z.string().min(1).max(4096).optional(),
  appointmentId: z.string().min(1).optional(),
  scheduledFor: z.string().datetime().optional(),
});

const listMessageJobsQuerySchema = z.object({
  clinicId: z.string().optional(),
  instanceId: z.string().optional(),
  status: z.nativeEnum(MessageJobStatus).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const sendMessage = asyncHandler(async (req: Request, res: Response) => {
  const parsed = sendMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, 'Invalid payload.', parsed.error.flatten());
  }

  console.info('[WHATSAPP_NG] send request received', JSON.stringify({
    clinicId: parsed.data.clinicId,
    appointmentId: parsed.data.appointmentId || null,
    toPhone: parsed.data.toPhone,
    mode: 'queue',
  }));

  const scheduledFor = parsed.data.scheduledFor ? new Date(parsed.data.scheduledFor) : null;
  const job = await messagingService.createAndEnqueueJob({
    clinicId: parsed.data.clinicId,
    toPhone: parsed.data.toPhone,
    body: parsed.data.body,
    auditBody: parsed.data.auditBody,
    appointmentId: parsed.data.appointmentId,
    scheduledFor,
  });
  await operationalEventRepository.append({
    eventType: 'ADMIN_QUEUE_MESSAGE',
    clinicId: job.clinicId,
    instanceId: job.instanceId,
    phone: job.toPhone,
    messageJobId: job.id,
    appointmentId: job.appointmentId || null,
    status: job.status,
    summary: `Mensagem enfileirada pelo painel (${getAdminActor(req)}).`,
    payload: { actor: getAdminActor(req) },
  }).catch(() => null);

  res.status(202).json({
    success: true,
    data: {
      jobId: job.id,
      status: job.status,
      deduped: job.deduped === true,
      clinicId: job.clinicId,
      instanceId: job.instanceId,
      scheduledFor: job.scheduledFor,
      createdAt: job.createdAt,
    },
  });
});

export const sendMessageSync = asyncHandler(async (req: Request, res: Response) => {
  const parsed = sendMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, 'Invalid payload.', parsed.error.flatten());
  }

  console.info('[WHATSAPP_NG] send request received', JSON.stringify({
    clinicId: parsed.data.clinicId,
    appointmentId: parsed.data.appointmentId || null,
    toPhone: parsed.data.toPhone,
    mode: 'sync',
  }));

  const job = await messagingService.createAndDispatchJob({
    clinicId: parsed.data.clinicId,
    toPhone: parsed.data.toPhone,
    body: parsed.data.body,
    auditBody: parsed.data.auditBody,
    appointmentId: parsed.data.appointmentId,
  });
  await operationalEventRepository.append({
    eventType: 'ADMIN_SEND_MESSAGE_SYNC',
    clinicId: job.clinicId,
    instanceId: job.instanceId,
    phone: parsed.data.toPhone,
    messageJobId: job.jobId,
    appointmentId: parsed.data.appointmentId || null,
    status: job.status,
    summary: `Mensagem sincrona enviada pelo painel (${getAdminActor(req)}).`,
    payload: { actor: getAdminActor(req) },
  }).catch(() => null);

  res.status(200).json({
    success: true,
    data: {
      ...job,
      deduped: job.deduped === true,
    },
  });
});

export const listMessageJobs = asyncHandler(async (req: Request, res: Response) => {
  const parsed = listMessageJobsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new HttpError(400, 'Invalid query params.', parsed.error.flatten());
  }

  const jobs = await messageJobRepository.findRecent(parsed.data);
  res.json({
    success: true,
    data: jobs,
  });
});

export const getMessageSummary = asyncHandler(async (_req: Request, res: Response) => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const grouped = await messageJobRepository.countByStatusSince(startOfDay);

  res.json({
    success: true,
    data: {
      sentToday: grouped.SENT || 0,
      failedToday: grouped.FAILED || 0,
      queuedToday: grouped.QUEUED || 0,
      processingToday: grouped.PROCESSING || 0,
    },
  });
});
