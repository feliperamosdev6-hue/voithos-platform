import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, HttpError } from '../utils/http';
import {
  clearAdminSessionCookie,
  getAdminSessionInfo,
  hasValidAdminSession,
  resolveAdminPanelRole,
  setAdminSessionCookie,
} from '../services/auth/authorizationService';
import { operationalEventRepository } from '../repositories/operationalEventRepository';

const resolveAdminPublicDir = (): string => {
  const candidates = [
    path.resolve(process.cwd(), 'public', 'admin'),
    path.resolve(process.cwd(), 'whatsapp-engine', 'public', 'admin'),
    path.resolve(__dirname, '..', '..', 'public', 'admin'),
    path.resolve(__dirname, '..', '..', '..', 'public', 'admin'),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
};

const adminPublicDir = resolveAdminPublicDir();

const loginSchema = z.object({
  token: z.string().optional(),
});

const sendAdminFile = (res: Response, filename: string): void => {
  res.sendFile(path.join(adminPublicDir, filename));
};

export const getAdminLoginPage = (_req: Request, res: Response): void => {
  sendAdminFile(res, 'login.html');
};

export const getAdminAppPage = (_req: Request, res: Response): void => {
  sendAdminFile(res, 'index.html');
};

export const createAdminSession = asyncHandler(async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, 'Invalid payload.', parsed.error.flatten());
  }

  const token = String(parsed.data.token || '').trim();
  const role = resolveAdminPanelRole(token);
  if (!role) {
    await operationalEventRepository.append({
      eventType: 'ADMIN_LOGIN_FAILED',
      status: 'DENIED',
      summary: 'Tentativa de login no painel com token invalido.',
      payload: { reason: 'invalid_admin_panel_token' },
    }).catch(() => null);
    throw new HttpError(401, 'Invalid admin panel token.');
  }

  const label = role === 'viewer' ? 'Viewer' : 'Operator';
  setAdminSessionCookie(res, { role, label });
  await operationalEventRepository.append({
    eventType: 'ADMIN_LOGIN',
    status: 'SUCCESS',
    summary: `Sessao do painel iniciada com perfil ${label}.`,
    payload: { role },
  }).catch(() => null);
  res.json({
    success: true,
    data: {
      authenticated: true,
      role,
      label,
    },
  });
});

export const getAdminSession = (req: Request, res: Response): void => {
  const session = getAdminSessionInfo(req);
  res.json({
    success: true,
    data: {
      authenticated: hasValidAdminSession(req),
      role: session?.role || null,
      label: session?.label || null,
    },
  });
};

export const deleteAdminSession = (req: Request, res: Response): void => {
  const session = getAdminSessionInfo(req);
  void operationalEventRepository.append({
    eventType: 'ADMIN_LOGOUT',
    status: 'SUCCESS',
    summary: `Sessao do painel encerrada (${session?.label || 'unknown'}).`,
    payload: { role: session?.role || null },
  }).catch(() => null);
  clearAdminSessionCookie(res);
  res.json({
    success: true,
    data: {
      authenticated: false,
    },
  });
};
