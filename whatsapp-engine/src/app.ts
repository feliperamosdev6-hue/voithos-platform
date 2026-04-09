import fs from 'fs';
import path from 'path';
import express, { NextFunction, Request, Response } from 'express';
import pinoHttp from 'pino-http';
import { apiRoutes } from './routes';
import { adminRoutes } from './routes/adminRoutes';
import { logger } from './config/logger';
import { internalAuthMiddleware } from './services/auth/authorizationService';
import { HttpError } from './utils/http';

export const app = express();
app.locals.engineBootState = {
  bootMode: process.env.WHATSAPP_ENGINE_BOOT_MODE || 'api',
  ready: false,
  startedAt: new Date().toISOString(),
  completedAt: null as string | null,
  runtimeRecoveryFinishedAt: null as string | null,
  runtimeRecoveryFailedAt: null as string | null,
};

const resolveAdminPublicDir = (): string => {
  const candidates = [
    path.resolve(process.cwd(), 'public', 'admin'),
    path.resolve(__dirname, '..', 'public', 'admin'),
    path.resolve(__dirname, '..', '..', 'public', 'admin'),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
};

const adminPublicDir = resolveAdminPublicDir();

app.use(express.json({ limit: '1mb' }));
app.use(pinoHttp({ logger }));
app.use('/admin-assets', express.static(adminPublicDir, { index: false }));
app.use('/admin', adminRoutes);
app.get('/health', (_req, res) => {
  const bootState = app.locals.engineBootState || {};
  res.status(bootState.ready ? 200 : 503).json({
    success: true,
    data: {
      status: bootState.ready ? 'ok' : 'starting',
      health_ready: Boolean(bootState.ready),
      boot_mode: bootState.bootMode || 'api',
      startedAt: bootState.startedAt || null,
      completedAt: bootState.completedAt || null,
      runtimeRecoveryFinishedAt: bootState.runtimeRecoveryFinishedAt || null,
      runtimeRecoveryFailedAt: bootState.runtimeRecoveryFailedAt || null,
      timestamp: new Date().toISOString(),
    },
  });
});
app.use('/', internalAuthMiddleware, apiRoutes);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const isHttpError = err instanceof HttpError;
  const statusCode = isHttpError ? err.statusCode : 500;
  const message = err instanceof Error ? err.message : 'Internal server error';
  const details = isHttpError ? err.details : undefined;

  logger.error({ err }, 'request failed');
  res.status(statusCode).json({
    success: false,
    error: {
      code: isHttpError ? 'BAD_REQUEST' : 'INTERNAL_ERROR',
      message,
      details,
    },
  });
});
