import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { env } from '../../config/env';
import { operationalEventRepository } from '../../repositories/operationalEventRepository';

const ADMIN_COOKIE_NAME = 'we_admin_token';
const PUBLIC_ADMIN_PATHS = new Set(['/admin/login', '/admin/session']);
const ADMIN_SESSION_TTL_MS = 1000 * 60 * 60 * 8;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export type AdminSessionRole = 'operator' | 'viewer';
export type AdminSessionInfo = {
  exp: number;
  nonce: string;
  role: AdminSessionRole;
  label: string;
};

const parseCookies = (req: Request): Record<string, string> => {
  const raw = String(req.header('cookie') || '');
  if (!raw) return {};

  return raw.split(';').reduce<Record<string, string>>((acc, part) => {
    const [key, ...rest] = part.split('=');
    const parsedKey = String(key || '').trim();
    if (!parsedKey) return acc;

    acc[parsedKey] = decodeURIComponent(rest.join('=').trim());
    return acc;
  }, {});
};

export const getAdminCookieName = (): string => ADMIN_COOKIE_NAME;

const isPublicAdminRequest = (req: Request): boolean => {
  const path = String(req.path || '').trim();
  return path.startsWith('/admin-assets/') || PUBLIC_ADMIN_PATHS.has(path);
};

const resolveAdminSessionSecret = (): string => {
  if (env.adminSessionSecret) return env.adminSessionSecret;
  if (env.authEncryptionKeyHex) return env.authEncryptionKeyHex;
  if (env.authEncryptionKeyBase64) return env.authEncryptionKeyBase64;
  return env.adminPanelToken || env.serviceInternalApiToken || 'voithos-whatsapp-admin-session';
};

const signPayload = (payload: string): string => crypto
  .createHmac('sha256', resolveAdminSessionSecret())
  .update(payload)
  .digest('base64url');

const createAdminSessionToken = (session: Pick<AdminSessionInfo, 'role' | 'label'>): string => {
  const payload = Buffer.from(JSON.stringify({
    exp: Date.now() + ADMIN_SESSION_TTL_MS,
    nonce: crypto.randomUUID(),
    role: session.role,
    label: session.label,
  })).toString('base64url');
  const signature = signPayload(payload);
  return `${payload}.${signature}`;
};

const readAdminSessionToken = (token: string): AdminSessionInfo | null => {
  const raw = String(token || '').trim();
  if (!raw) return null;

  const [payload, signature] = raw.split('.');
  if (!payload || !signature) return null;

  const expected = signPayload(payload);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length) return null;
  if (!crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<AdminSessionInfo>;
    if (Number(decoded?.exp || 0) <= Date.now()) return null;
    const role = decoded?.role === 'viewer' ? 'viewer' : 'operator';
    return {
      exp: Number(decoded?.exp || 0),
      nonce: String(decoded?.nonce || '').trim(),
      role,
      label: String(decoded?.label || (role === 'viewer' ? 'Viewer' : 'Operator')).trim() || (role === 'viewer' ? 'Viewer' : 'Operator'),
    };
  } catch (_error) {
    return null;
  }
};

export const isValidServiceToken = (token: string): boolean => {
  if (!env.serviceInternalApiToken) return env.nodeEnv !== 'production';
  return String(token || '').trim() === env.serviceInternalApiToken;
};

export const isValidAdminPanelToken = (token: string): boolean => {
  if (!env.adminPanelToken) return false;
  return String(token || '').trim() === env.adminPanelToken;
};

export const resolveAdminPanelRole = (token: string): AdminSessionRole | null => {
  const normalized = String(token || '').trim();
  if (!normalized) return null;
  if (env.adminPanelToken && normalized === env.adminPanelToken) return 'operator';
  if (env.adminPanelReadOnlyToken && normalized === env.adminPanelReadOnlyToken) return 'viewer';
  return null;
};

export const getAdminSessionInfo = (req: Request): AdminSessionInfo | null => {
  const cookies = parseCookies(req);
  return readAdminSessionToken(String(cookies[ADMIN_COOKIE_NAME] || '').trim());
};

export const hasValidAdminSession = (req: Request): boolean => {
  return Boolean(getAdminSessionInfo(req));
};

export const setAdminSessionCookie = (res: Response, session: Pick<AdminSessionInfo, 'role' | 'label'>): void => {
  res.cookie(ADMIN_COOKIE_NAME, createAdminSessionToken(session), {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.nodeEnv === 'production',
    maxAge: ADMIN_SESSION_TTL_MS,
    path: '/',
  });
};

export const clearAdminSessionCookie = (res: Response): void => {
  res.clearCookie(ADMIN_COOKIE_NAME, {
    sameSite: 'lax',
    path: '/',
  });
};

export const internalAuthMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  if (isPublicAdminRequest(req)) {
    next();
    return;
  }

  const adminSession = getAdminSessionInfo(req);
  if (adminSession) {
    if (SAFE_METHODS.has(String(req.method || '').toUpperCase()) || adminSession.role === 'operator') {
      (req as Request & { adminSession?: AdminSessionInfo | null }).adminSession = adminSession;
      next();
      return;
    }

    void operationalEventRepository.append({
      eventType: 'ADMIN_ACTION_DENIED',
      clinicId: String(req.body?.clinicId || req.query?.clinicId || '').trim() || null,
      instanceId: String(req.params?.id || req.query?.instanceId || req.body?.instanceId || '').trim() || null,
      status: 'FORBIDDEN',
      summary: `Sessao ${adminSession.label} tentou executar ${req.method} ${req.path} sem permissao de operador.`,
      payload: {
        method: req.method,
        path: req.path,
        role: adminSession.role,
      },
    }).catch(() => null);

    res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Sessao em modo leitura. Use um token de operador para executar esta acao.',
      },
    });
    return;
  }

  if (!env.serviceInternalApiToken && env.nodeEnv === 'production') {
    res.status(503).json({
      success: false,
      error: {
        code: 'SERVICE_AUTH_NOT_CONFIGURED',
        message: 'Internal service authentication is not configured.',
      },
    });
    return;
  }

  if (!env.serviceInternalApiToken) {
    next();
    return;
  }

  const received = String(req.header('x-service-token') || req.header('x-internal-token') || '').trim();
  if (!isValidServiceToken(received)) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid internal token.',
      },
    });
    return;
  }

  next();
};

export const adminSessionMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  if (!env.adminPanelToken && !env.adminPanelReadOnlyToken && env.nodeEnv === 'production') {
    res.status(503).json({
      success: false,
      error: {
        code: 'ADMIN_AUTH_NOT_CONFIGURED',
        message: 'Admin authentication is not configured.',
      },
    });
    return;
  }

  if (!env.adminPanelToken && !env.adminPanelReadOnlyToken) {
    next();
    return;
  }

  const adminSession = getAdminSessionInfo(req);
  if (!adminSession) {
    res.redirect('/admin/login');
    return;
  }

  (req as Request & { adminSession?: AdminSessionInfo | null }).adminSession = adminSession;
  next();
};
