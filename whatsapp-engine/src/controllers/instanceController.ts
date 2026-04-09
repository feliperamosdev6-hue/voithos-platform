import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, HttpError } from '../utils/http';
import { instanceService } from '../services/instance/instanceService';
import { operationalEventRepository } from '../repositories/operationalEventRepository';

const getAdminActor = (req: Request): string => {
  const session = (req as Request & { adminSession?: { label?: string; role?: string } | null }).adminSession;
  return session?.label || session?.role || 'service';
};

const createInstanceSchema = z.object({
  clinicId: z.string().min(1),
  displayName: z.string().min(1).max(160).optional(),
  pairingPhone: z.string().min(8).optional(),
});

const instanceLogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const internalDispatchMessageSchema = z.object({
  toPhone: z.string().min(8),
  body: z.string().min(1).max(4096),
  appointmentId: z.string().min(1).optional(),
});

export const createInstance = asyncHandler(async (req: Request, res: Response) => {
  const parsed = createInstanceSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, 'Invalid payload.', parsed.error.flatten());
  }

  const created = await instanceService.create(parsed.data);
  await operationalEventRepository.append({
    eventType: 'ADMIN_CREATE_INSTANCE',
    clinicId: created.clinicId,
    instanceId: created.id,
    status: created.status,
    summary: `Instancia criada pelo painel (${getAdminActor(req)}).`,
    payload: {
      actor: getAdminActor(req),
      displayName: parsed.data.displayName || null,
    },
  }).catch(() => null);
  res.status(201).json({
    success: true,
    data: {
      id: created.id,
      clinicId: created.clinicId,
      status: created.status,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    },
  });
});

export const listInstances = asyncHandler(async (_req: Request, res: Response) => {
  const result = await instanceService.listInstances();
  res.json({
    success: true,
    data: result,
  });
});

export const getInstanceDetails = asyncHandler(async (req: Request, res: Response) => {
  const instanceId = String(req.params.id || '').trim();
  if (!instanceId) throw new HttpError(400, 'id param is required.');

  const instance = await instanceService.getInstanceDetails(instanceId);
  res.json({
    success: true,
    data: instance,
  });
});

export const getInstanceStatus = asyncHandler(async (req: Request, res: Response) => {
  const instanceId = String(req.params.id || '').trim();
  if (!instanceId) throw new HttpError(400, 'id param is required.');

  const status = await instanceService.getStatus(instanceId);
  res.json({
    success: true,
    data: status,
  });
});

export const getInstanceStatusByClinic = asyncHandler(async (req: Request, res: Response) => {
  const clinicId = String(req.params.clinicId || '').trim();
  if (!clinicId) throw new HttpError(400, 'clinicId param is required.');

  const status = await instanceService.getStatusByClinicId(clinicId);
  res.json({
    success: true,
    data: status,
  });
});

export const getInstanceQr = asyncHandler(async (req: Request, res: Response) => {
  const instanceId = String(req.params.id || '').trim();
  if (!instanceId) throw new HttpError(400, 'id param is required.');
  const qr = await instanceService.getQrPayload(instanceId);
  res.json({
    success: true,
    data: qr,
  });
});

export const disconnectInstance = asyncHandler(async (req: Request, res: Response) => {
  const instanceId = String(req.params.id || '').trim();
  if (!instanceId) throw new HttpError(400, 'id param is required.');

  const result = await instanceService.disconnect(instanceId);
  await operationalEventRepository.append({
    eventType: 'ADMIN_DISCONNECT_INSTANCE',
    clinicId: result.clinicId,
    instanceId: result.id,
    status: result.status || 'CREATED',
    summary: `Instancia desconectada pelo painel (${getAdminActor(req)}).`,
    payload: { actor: getAdminActor(req) },
  }).catch(() => null);
  res.json({
    success: true,
    data: result,
  });
});

export const deleteInstance = asyncHandler(async (req: Request, res: Response) => {
  const instanceId = String(req.params.id || '').trim();
  if (!instanceId) throw new HttpError(400, 'id param is required.');

  const result = await instanceService.remove(instanceId);
  await operationalEventRepository.append({
    eventType: 'ADMIN_DELETE_INSTANCE',
    clinicId: result.clinicId,
    instanceId: result.id,
    status: 'DELETED',
    summary: `Instancia removida pelo painel (${getAdminActor(req)}).`,
    payload: { actor: getAdminActor(req) },
  }).catch(() => null);
  res.json({
    success: true,
    data: result,
  });
});

export const getInstanceLogs = asyncHandler(async (req: Request, res: Response) => {
  const instanceId = String(req.params.id || '').trim();
  if (!instanceId) throw new HttpError(400, 'id param is required.');

  const parsed = instanceLogsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new HttpError(400, 'Invalid query params.', parsed.error.flatten());
  }

  const logs = await instanceService.getRecentLogs(instanceId, parsed.data.limit || 20);
  res.json({
    success: true,
    data: logs,
  });
});

export const dispatchInstanceMessage = asyncHandler(async (req: Request, res: Response) => {
  const instanceId = String(req.params.id || '').trim();
  if (!instanceId) throw new HttpError(400, 'id param is required.');

  const parsed = internalDispatchMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, 'Invalid payload.', parsed.error.flatten());
  }

  const result = await instanceService.sendText(instanceId, parsed.data.toPhone, parsed.data.body, {
    appointmentId: parsed.data.appointmentId || null,
  });
  const instanceStatus = await instanceService.getStatus(instanceId).catch(() => null);
  await operationalEventRepository.append({
    eventType: 'ADMIN_TEST_MESSAGE',
    clinicId: instanceStatus?.clinicId || null,
    instanceId,
    phone: parsed.data.toPhone,
    status: 'QUEUED',
    summary: `Teste de mensagem disparado pelo painel (${getAdminActor(req)}).`,
    payload: { actor: getAdminActor(req) },
  }).catch(() => null);
  res.json({
    success: true,
    data: result,
  });
});
