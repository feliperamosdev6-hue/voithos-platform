import fs from 'fs/promises';
import path from 'path';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  generateWAMessageFromContent,
  proto,
  useMultiFileAuthState,
  WASocket,
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import { InstanceStatus, MessageJobStatus, WhatsAppInstance } from '@prisma/client';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { messageLogRepository } from '../../repositories/messageLogRepository';
import { messageJobRepository } from '../../repositories/messageJobRepository';
import { HttpError } from '../../utils/http';
import { normalizeBrPhone } from '../../utils/phone';
import { instanceRepository } from '../../repositories/instanceRepository';
import { createBodySummary, operationalEventRepository } from '../../repositories/operationalEventRepository';
import { restoreSessionDirFromBlob, serializeSessionDir } from '../../lib/baileys/authBlobStore';
import { centralBackendService } from '../integration/centralBackendService';

type RuntimeSocket = {
  socket: WASocket;
  qr?: string;
  qrUpdatedAt?: Date;
  pairingCode?: string;
};

type ReconnectScheduleMeta = {
  attempt: number;
  delayMs: number;
  scheduledAt: Date;
  nextAttemptAt: Date;
};

const runtimeSockets = new Map<string, RuntimeSocket>();
const reconnectTimers = new Map<string, NodeJS.Timeout>();
const reconnectAttempts = new Map<string, number>();
const reconnectScheduleMeta = new Map<string, ReconnectScheduleMeta>();
const intentionalShutdowns = new Set<string>();
const sessionsRoot = path.resolve(process.cwd(), env.sessionsDir);
const BAILEYS_VERSION_TIMEOUT_MS = 8000;
const QR_RUNTIME_TIMEOUT_MS = 30000;
const SOCKET_OPEN_WAIT_TIMEOUT_MS = 15000;
const APPOINTMENT_CONFIRM_BUTTON_ID = 'APPOINTMENT_CONFIRM';
const APPOINTMENT_RESCHEDULE_BUTTON_ID = 'APPOINTMENT_RESCHEDULE';
const APPOINTMENT_QUICK_REPLIES_ENABLED = String(process.env.WHATSAPP_APPOINTMENT_QUICK_REPLIES_ENABLED || '')
  .trim()
  .toLowerCase() === 'true';

const getSessionDir = (instanceId: string): string => path.join(sessionsRoot, instanceId);

const resolveBaileysVersion = async (): Promise<{ version?: [number, number, number] } | null> => {
  try {
    const versionInfo = await Promise.race([
      fetchLatestBaileysVersion(),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), BAILEYS_VERSION_TIMEOUT_MS);
      }),
    ]);

    if (versionInfo?.version?.length === 3) {
      return { version: versionInfo.version as [number, number, number] };
    }

    logger.warn({
      timeoutMs: BAILEYS_VERSION_TIMEOUT_MS,
    }, 'baileys version lookup timed out; using bundled default version');
    return null;
  } catch (error) {
    logger.warn({
      error,
      timeoutMs: BAILEYS_VERSION_TIMEOUT_MS,
    }, 'failed fetching latest Baileys version; using bundled default version');
    return null;
  }
};

const parsePhoneFromJid = (jid: string | undefined): string => {
  const raw = String(jid || '').trim();
  if (!raw) return '';
  const at = raw.indexOf(':');
  const base = (at > 0 ? raw.slice(0, at) : raw).split('@')[0];
  return normalizeBrPhone(base);
};

const resolveIncomingPhone = (entry: any): string => {
  const candidates = [
    entry?.key?.senderPn,
    entry?.key?.participantPn,
    entry?.participantPn,
    entry?.key?.participant,
    entry?.participant,
    entry?.key?.remoteJid,
  ];

  for (const candidate of candidates) {
    const normalized = parsePhoneFromJid(candidate);
    if (normalized) return normalized;
  }

  return '';
};

const unwrapInboundMessage = (message: any): any => {
  let current = message;

  for (let depth = 0; depth < 8 && current && typeof current === 'object'; depth += 1) {
    const next = current?.ephemeralMessage?.message
      || current?.viewOnceMessage?.message
      || current?.viewOnceMessageV2?.message
      || current?.viewOnceMessageV2Extension?.message
      || current?.documentWithCaptionMessage?.message
      || current?.editedMessage?.message
      || current?.deviceSentMessage?.message;

    if (!next || next === current) break;
    current = next;
  }

  return current;
};

const parseInteractiveReplyText = (message: any): string => {
  const nativeParamsJson = String(message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson || '').trim();
  if (!nativeParamsJson) return '';

  try {
    const parsed = JSON.parse(nativeParamsJson);
    const candidates = [
      parsed?.selectedId,
      parsed?.selected_id,
      parsed?.selectedOptionId,
      parsed?.selected_option_id,
      parsed?.buttonId,
      parsed?.button_id,
      parsed?.id,
      parsed?.reply,
      parsed?.text,
    ];

    for (const candidate of candidates) {
      const normalized = String(candidate || '').trim();
      if (normalized) return normalized;
    }
  } catch (error) {
    logger.debug({ error }, 'failed to parse inbound interactive response paramsJson');
  }

  return '';
};

const summarizeInboundMessageShape = (message: any): { topLevelKeys: string[]; contentKeys: string[]; contentType: string | null } => {
  const normalizedMessage = unwrapInboundMessage(message);
  const topLevelKeys = normalizedMessage && typeof normalizedMessage === 'object'
    ? Object.keys(normalizedMessage).slice(0, 12)
    : [];
  const contentType = topLevelKeys[0] || null;

  const nestedContent = normalizedMessage?.[contentType as keyof typeof normalizedMessage];
  const contentKeys = nestedContent && typeof nestedContent === 'object'
    ? Object.keys(nestedContent).slice(0, 12)
    : [];

  return { topLevelKeys, contentKeys, contentType };
};

const extractIncomingText = (message: any): string => {
  const normalizedMessage = unwrapInboundMessage(message);
  const content = normalizedMessage?.conversation
    || normalizedMessage?.extendedTextMessage?.text
    || normalizedMessage?.imageMessage?.caption
    || normalizedMessage?.videoMessage?.caption
    || normalizedMessage?.documentMessage?.caption
    || normalizedMessage?.documentWithCaptionMessage?.message?.documentMessage?.caption
    || normalizedMessage?.buttonsResponseMessage?.selectedDisplayText
    || normalizedMessage?.buttonsResponseMessage?.selectedButtonId
    || normalizedMessage?.templateButtonReplyMessage?.selectedDisplayText
    || normalizedMessage?.templateButtonReplyMessage?.selectedId
    || normalizedMessage?.listResponseMessage?.title
    || normalizedMessage?.listResponseMessage?.singleSelectReply?.selectedRowId
    || normalizedMessage?.interactiveResponseMessage?.body?.text
    || normalizedMessage?.interactiveResponseMessage?.nativeFlowResponseMessage?.name
    || parseInteractiveReplyText(normalizedMessage)
    || '';
  return String(content || '').trim();
};

const shouldUseAppointmentQuickReplies = (payload: {
  appointmentId?: string | null;
  body?: string | null;
}): boolean => {
  if (!APPOINTMENT_QUICK_REPLIES_ENABLED) return false;
  const appointmentId = String(payload.appointmentId || '').trim();
  const normalizedBody = String(payload.body || '').trim();
  if (!appointmentId || !normalizedBody) return false;

  return /\b1\b/i.test(normalizedBody)
    && /\b2\b/i.test(normalizedBody)
    && /confirm/i.test(normalizedBody)
    && /remar/i.test(normalizedBody);
};

const stripAppointmentReplyFallback = (body: string): string => String(body || '')
  .replace(/\n+\s*responda[\s\S]*$/i, '')
  .trim();

const buildAppointmentQuickReplyMessage = (body: string) => {
  const baseText = stripAppointmentReplyFallback(body) || String(body || '').trim();
  return proto.Message.fromObject({
    templateMessage: {
      hydratedTemplate: {
        hydratedContentText: baseText,
        hydratedFooterText: 'Toque em Confirmar ou Remarcar. Se os botoes nao aparecerem, responda 1 ou 2.',
        hydratedButtons: [
          {
            index: 1,
            quickReplyButton: {
              displayText: 'Confirmar',
              id: APPOINTMENT_CONFIRM_BUTTON_ID,
            },
          },
          {
            index: 2,
            quickReplyButton: {
              displayText: 'Remarcar',
              id: APPOINTMENT_RESCHEDULE_BUTTON_ID,
            },
          },
        ],
      },
    },
  });
};

const ensureSessionMaterialized = async (instance: WhatsAppInstance): Promise<void> => {
  const sessionDir = getSessionDir(instance.id);
  await fs.mkdir(sessionDir, { recursive: true });
  const files = await fs.readdir(sessionDir).catch(() => []);
  logger.info({
    instanceId: instance.id,
    clinicId: instance.clinicId,
    sessionDir,
    fileCount: files.length,
    hasAuthBlob: Boolean(instance.authBlobEncrypted),
  }, 'instance session materialization check');
  if (files.length > 0) return;
  if (!instance.authBlobEncrypted) return;

  try {
    await restoreSessionDirFromBlob(sessionDir, instance.authBlobEncrypted);
    const restoredFiles = await fs.readdir(sessionDir).catch(() => []);
    logger.info({
      instanceId: instance.id,
      clinicId: instance.clinicId,
      sessionDir,
      restoredFileCount: restoredFiles.length,
    }, 'instance session restored from auth blob');
  } catch (error) {
    logger.error({
      error,
      instanceId: instance.id,
      clinicId: instance.clinicId,
      sessionDir,
    }, 'failed to restore session from auth blob');
    throw error;
  }
};

const persistAuthBlob = async (instance: WhatsAppInstance): Promise<void> => {
  const sessionDir = getSessionDir(instance.id);
  try {
    const encrypted = await serializeSessionDir(sessionDir);
    await instanceRepository.updateAuthBlob(instance.id, encrypted);
    logger.info({
      instanceId: instance.id,
      clinicId: instance.clinicId,
      sessionDir,
      authBlobLength: encrypted.length,
    }, 'instance auth blob persisted');
  } catch (error) {
    logger.error({
      error,
      instanceId: instance.id,
      clinicId: instance.clinicId,
      sessionDir,
    }, 'failed to persist auth blob');
    throw error;
  }
};

const clearReconnectTimer = (instanceId: string): void => {
  const reconnectTimer = reconnectTimers.get(instanceId);
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimers.delete(instanceId);
  }
  reconnectScheduleMeta.delete(instanceId);
};

const resetReconnectState = (instanceId: string): void => {
  clearReconnectTimer(instanceId);
  reconnectAttempts.delete(instanceId);
};

const isTransientRuntimeError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error || '');
  return /connection closed|websocket error|precondition required|stream errored|not connected/i.test(message);
};

const shouldForceReauthAfterDisconnect = (input: {
  reasonCode?: number;
  nextAttempt: number;
  runtime?: RuntimeSocket | null;
}): boolean => {
  const threshold = Math.max(3, env.instanceCircuitBreakerThreshold || 0);
  return Number(input.reasonCode || 0) === 408
    && input.nextAttempt >= threshold
    && !input.runtime?.qr
    && !input.runtime?.pairingCode;
};

const shouldPauseReconnectAfterDisconnect = (input: {
  reasonCode?: number;
  nextAttempt: number;
  runtime?: RuntimeSocket | null;
  isRegistered?: boolean;
}): boolean => {
  if (Number(input.reasonCode || 0) !== 408) return false;
  const threshold = Math.max(3, env.instanceCircuitBreakerThreshold || 0);
  return input.nextAttempt >= threshold
    && !input.runtime?.qr
    && !input.runtime?.pairingCode
    && !Boolean(input.isRegistered);
};

const removeSessionDir = async (instanceId: string): Promise<void> => {
  const sessionDir = getSessionDir(instanceId);
  await fs.rm(sessionDir, { recursive: true, force: true }).catch(() => null);
};

const closeRuntimeSocket = async (instance: WhatsAppInstance, reason: string): Promise<void> => {
  const runtime = runtimeSockets.get(instance.id);
  if (!runtime) return;

  intentionalShutdowns.add(instance.id);
  clearReconnectTimer(instance.id);
  runtimeSockets.delete(instance.id);

  try {
    if (runtime.socket.user) {
      await runtime.socket.logout().catch(() => null);
    }
  } catch (_error) {
    logger.warn({
      instanceId: instance.id,
      clinicId: instance.clinicId,
      reason,
    }, 'instance logout failed during runtime shutdown');
  }

  try {
    const ws = (runtime.socket as any)?.ws;
    if (ws?.readyState === 0 || ws?.readyState === 1) {
      ws.close();
    }
  } catch (_error) {
    logger.warn({
      instanceId: instance.id,
      clinicId: instance.clinicId,
      reason,
    }, 'instance websocket close failed during runtime shutdown');
  }

  logger.info({
    instanceId: instance.id,
    clinicId: instance.clinicId,
    reason,
  }, 'instance runtime socket closed intentionally');
};

const scheduleReconnect = (instance: WhatsAppInstance, delayMs?: number): void => {
  if (reconnectTimers.has(instance.id)) return;
  const attempt = Number(reconnectAttempts.get(instance.id) || 0) + 1;
  reconnectAttempts.set(instance.id, attempt);
  const baseDelay = Math.max(500, env.reconnectBaseDelayMs);
  const maxDelay = Math.max(baseDelay, env.reconnectMaxDelayMs);
  const computedDelay = Math.min(maxDelay, baseDelay * Math.pow(2, Math.max(0, attempt - 1)));
  const jitter = Math.floor(Math.random() * Math.min(1500, Math.max(250, Math.round(computedDelay * 0.25))));
  const effectiveDelay = Math.max(500, Math.min(maxDelay, Number(delayMs) || (computedDelay + jitter)));
  const scheduledAt = new Date();
  const nextAttemptAt = new Date(scheduledAt.getTime() + effectiveDelay);

  reconnectScheduleMeta.set(instance.id, {
    attempt,
    delayMs: effectiveDelay,
    scheduledAt,
    nextAttemptAt,
  });

  const timer = setTimeout(() => {
    reconnectTimers.delete(instance.id);
    reconnectScheduleMeta.delete(instance.id);
    void instanceService.connect(instance.id, undefined, { preserveReconnectState: true }).catch((error) => {
      logger.error({ error, instanceId: instance.id, clinicId: instance.clinicId }, 'reconnect failed');
    });
  }, effectiveDelay);

  reconnectTimers.set(instance.id, timer);
  logger.info({
    instanceId: instance.id,
    clinicId: instance.clinicId,
    delayMs: effectiveDelay,
    attempt,
  }, 'instance reconnect scheduled');
};

const waitForConnectedRuntime = async (instanceId: string, timeoutMs = 15000): Promise<RuntimeSocket | null> => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const runtime = runtimeSockets.get(instanceId);
    const instance = await instanceRepository.findById(instanceId);
    if (runtime && instance?.status === InstanceStatus.CONNECTED) {
      return runtime;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 400);
    });
  }

  return null;
};

const getRuntimeSocketState = (runtime: RuntimeSocket | null | undefined): 'OPEN' | 'CONNECTING' | 'CLOSING' | 'CLOSED' | 'MISSING' => {
  if (!runtime?.socket?.ws) return 'MISSING';
  if (runtime.socket.ws.isOpen) return 'OPEN';
  if (runtime.socket.ws.isConnecting) return 'CONNECTING';
  if (runtime.socket.ws.isClosing) return 'CLOSING';
  if (runtime.socket.ws.isClosed) return 'CLOSED';
  return 'MISSING';
};

const isRuntimeReadyForSend = (runtime: RuntimeSocket | null | undefined): boolean => {
  if (!runtime?.socket?.user) return false;
  return getRuntimeSocketState(runtime) === 'OPEN';
};

const buildRuntimeDiagnostics = (instance: WhatsAppInstance, runtime: RuntimeSocket | null | undefined) => {
  const runtimeSocketState = getRuntimeSocketState(runtime);
  const connectedInRuntime = isRuntimeReadyForSend(runtime);
  const reconnectMeta = reconnectScheduleMeta.get(instance.id) || null;
  const qrAvailable = Boolean(runtime?.qr);
  const pairingCodeAvailable = Boolean(runtime?.pairingCode);
  const qrUpdatedAt = runtime?.qrUpdatedAt || null;
  const qrAgeSeconds = qrUpdatedAt ? Math.max(0, Math.round((Date.now() - qrUpdatedAt.getTime()) / 1000)) : null;
  const reconnectAttempt = Number(reconnectAttempts.get(instance.id) || reconnectMeta?.attempt || 0);
  const reconnectScheduled = Boolean(reconnectMeta);
  const coolingDown = Boolean(reconnectMeta && reconnectMeta.nextAttemptAt.getTime() > Date.now());
  const status = toOperationalStatus(instance.status, runtime);
  const qrPending = Boolean(
    !connectedInRuntime
    && status === InstanceStatus.CONNECTING
    && !qrAvailable
    && !pairingCodeAvailable
  );
  const runtimeDegraded = Boolean(
    (!connectedInRuntime && runtimeSocketState !== 'OPEN')
    || status === InstanceStatus.ERROR
    || reconnectScheduled
  );

  return {
    runtimeSocketState,
    connectedInRuntime,
    reconnectAttempt,
    reconnectScheduled,
    reconnectDelayMs: reconnectMeta?.delayMs || 0,
    reconnectScheduledAt: reconnectMeta?.scheduledAt?.toISOString?.() || null,
    reconnectNextAttemptAt: reconnectMeta?.nextAttemptAt?.toISOString?.() || null,
    coolingDown,
    qrAvailable,
    qrPending,
    qrUpdatedAt: qrUpdatedAt?.toISOString?.() || null,
    qrAgeSeconds,
    pairingCodeAvailable,
    runtimeDegraded,
  };
};

const enrichWithClinicCatalog = async <T extends { clinicId: string; displayName?: string | null }>(items: T[]): Promise<Array<T & {
  clinicName: string;
  clinicLegalName: string;
  clinicDocument: string;
}>> => {
  if (!items.length) return [];

  const clinicCatalog = await centralBackendService.listClinics().catch(() => []);
  const clinicMap = new Map<string, {
    clinicName: string;
    clinicLegalName: string;
    clinicDocument: string;
  }>(
    clinicCatalog.map((clinic: any) => [
      String(clinic?.id || clinic?.clinicId || '').trim(),
      {
        clinicName: String(clinic?.nomeFantasia || clinic?.name || '').trim(),
        clinicLegalName: String(clinic?.razaoSocial || '').trim(),
        clinicDocument: String(clinic?.cnpjCpf || clinic?.cnpjOuCpf || '').trim(),
      },
    ]),
  );

  return items.map((item) => {
    const clinicMeta = clinicMap.get(String(item.clinicId || '').trim()) || {
      clinicName: '',
      clinicLegalName: '',
      clinicDocument: '',
    };
    return {
      ...item,
      clinicName: clinicMeta.clinicName,
      clinicLegalName: clinicMeta.clinicLegalName,
      clinicDocument: clinicMeta.clinicDocument,
    };
  });
};

const toOperationalStatus = (
  persistedStatus: InstanceStatus,
  runtime: RuntimeSocket | null | undefined,
): InstanceStatus => {
  const runtimeState = getRuntimeSocketState(runtime);
  if (runtimeState === 'OPEN') {
    return isRuntimeReadyForSend(runtime) ? InstanceStatus.CONNECTED : InstanceStatus.CONNECTING;
  }
  if (runtimeState === 'CONNECTING') return InstanceStatus.CONNECTING;
  if (runtimeState === 'CLOSING' || runtimeState === 'CLOSED') return InstanceStatus.DISCONNECTED;
  return persistedStatus === InstanceStatus.CONNECTED ? InstanceStatus.DISCONNECTED : persistedStatus;
};

const markRuntimeUnavailable = async (
  instance: WhatsAppInstance,
  runtime: RuntimeSocket | null | undefined,
  reason: string,
): Promise<void> => {
  const runtimeState = getRuntimeSocketState(runtime);
  runtimeSockets.delete(instance.id);
  clearReconnectTimer(instance.id);

  if (instance.status !== InstanceStatus.ERROR) {
    await instanceRepository.updateStatus(instance.id, InstanceStatus.DISCONNECTED).catch(() => null);
  }

  logger.warn({
    instanceId: instance.id,
    clinicId: instance.clinicId,
    persistedStatus: instance.status,
    runtimeState,
    reason,
  }, 'instance runtime marked unavailable');

  scheduleReconnect(instance, 1500);
};

const waitForQrRuntime = async (instanceId: string, timeoutMs = 10000): Promise<RuntimeSocket | null> => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const runtime = runtimeSockets.get(instanceId);
    const instance = await instanceRepository.findById(instanceId);
    if (!instance) return null;

    if (runtime?.qr || runtime?.pairingCode) {
      return runtime;
    }

    if (instance.status === InstanceStatus.CONNECTED) {
      return runtime || null;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 500);
    });
  }

  return runtimeSockets.get(instanceId) || null;
};

const waitForSocketOpen = async (socket: WASocket, timeoutMs = SOCKET_OPEN_WAIT_TIMEOUT_MS): Promise<boolean> => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const ws = (socket as any)?.ws;
    if (ws?.isOpen) return true;
    if (ws?.isClosed) return false;
    await new Promise((resolve) => {
      setTimeout(resolve, 250);
    });
  }
  return false;
};

const shouldRepairRegisteredCred = (creds: any): boolean => {
  if (!creds || creds.registered !== false) return false;
  const hasMe = Boolean(String(creds?.me?.id || '').trim());
  const hasAccount = Boolean(creds?.account?.details) && Boolean(creds?.account?.accountSignatureKey);
  const hasSignalIdentity = Array.isArray(creds?.signalIdentities) && creds.signalIdentities.length > 0;
  return hasMe && hasAccount && hasSignalIdentity;
};

const startSocket = async (instance: WhatsAppInstance, pairingPhone?: string): Promise<void> => {
  await fs.mkdir(sessionsRoot, { recursive: true });
  await ensureSessionMaterialized(instance);
  const sessionDir = getSessionDir(instance.id);
  const auth = await useMultiFileAuthState(sessionDir);
  if (shouldRepairRegisteredCred(auth.state.creds)) {
    auth.state.creds.registered = true;
    await auth.saveCreds();
    await persistAuthBlob(instance).catch(() => null);
    logger.warn({
      instanceId: instance.id,
      clinicId: instance.clinicId,
      sessionDir,
      meId: auth.state.creds?.me?.id || null,
    }, 'repaired stale registered=false in restored auth credentials');
  }
  const versionInfo = await resolveBaileysVersion();
  let currentStatus = instance.status;

  await instanceRepository.updateStatus(instance.id, InstanceStatus.CONNECTING);
  currentStatus = InstanceStatus.CONNECTING;
  logger.info({
    instanceId: instance.id,
    clinicId: instance.clinicId,
    previousStatus: instance.status,
    nextStatus: InstanceStatus.CONNECTING,
    sessionDir,
    registered: auth.state.creds.registered,
    hasPairingPhone: Boolean(pairingPhone),
    baileysVersion: versionInfo?.version?.join('.') || 'bundled-default',
  }, 'starting whatsapp socket');

  const socket = makeWASocket({
    auth: auth.state,
    ...(versionInfo?.version?.length ? { version: versionInfo.version } : {}),
    browser: Browsers.ubuntu('Voithos'),
    connectTimeoutMs: 30000,
    keepAliveIntervalMs: 30000,
    defaultQueryTimeoutMs: 60000,
    qrTimeout: QR_RUNTIME_TIMEOUT_MS,
    logger: logger.child({
      class: 'baileys',
      instanceId: instance.id,
      clinicId: instance.clinicId,
    }),
    printQRInTerminal: false,
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });

  const runtime: RuntimeSocket = { socket };
  runtimeSockets.set(instance.id, runtime);
  clearReconnectTimer(instance.id);

  socket.ev.on('creds.update', async () => {
    logger.info({
      instanceId: instance.id,
      clinicId: instance.clinicId,
      registered: auth.state.creds.registered,
    }, 'instance creds.update received');
    try {
      await auth.saveCreds();
      logger.info({
        instanceId: instance.id,
        clinicId: instance.clinicId,
        sessionDir,
      }, 'instance auth credentials saved to session dir');
      await persistAuthBlob(instance);
    } catch (error) {
      logger.error({
        error,
        instanceId: instance.id,
        clinicId: instance.clinicId,
        sessionDir,
      }, 'failed during creds.update persistence');
    }
  });

  socket.ev.on('connection.update', async (update) => {
    const reasonCode = (update.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
    logger.info({
      instanceId: instance.id,
      clinicId: instance.clinicId,
      previousStatus: currentStatus,
      connection: update.connection,
      hasQr: Boolean(update.qr),
      isNewLogin: update.isNewLogin,
      receivedPendingNotifications: update.receivedPendingNotifications,
      reasonCode,
    }, 'instance connection.update received');

    try {
      if (update.qr) {
        const previousStatus = currentStatus;
        runtime.qr = update.qr;
        runtime.qrUpdatedAt = new Date();
        await instanceRepository.updateStatus(instance.id, InstanceStatus.CONNECTING);
        await operationalEventRepository.append({
          eventType: 'QR_READY',
          clinicId: instance.clinicId,
          instanceId: instance.id,
          status: InstanceStatus.CONNECTING,
          summary: 'qr code ready for pairing',
          payload: {
            qrUpdatedAt: runtime.qrUpdatedAt?.toISOString() || null,
          },
        });
        currentStatus = InstanceStatus.CONNECTING;
        logger.info({
          instanceId: instance.id,
          clinicId: instance.clinicId,
          previousStatus,
          nextStatus: InstanceStatus.CONNECTING,
          qrUpdatedAt: runtime.qrUpdatedAt,
        }, 'instance qr updated');
      }

      if (update.connection === 'open') {
        resetReconnectState(instance.id);
        const phone = parsePhoneFromJid(socket.user?.id);
        const authenticated = Boolean(phone) && Boolean(socket.user?.id);
        const nextStatus = authenticated ? InstanceStatus.CONNECTED : InstanceStatus.CONNECTING;
        await instanceRepository.updateConnectionMeta(instance.id, {
          status: nextStatus,
          phoneNumber: phone,
          displayName: socket.user?.name || instance.displayName || undefined,
        });
        logger.info({
          instanceId: instance.id,
          clinicId: instance.clinicId,
          previousStatus: currentStatus,
          nextStatus,
          authenticated,
          phoneNumber: phone,
          displayName: socket.user?.name || instance.displayName || null,
        }, 'instance connection opened');
        currentStatus = nextStatus;
        if (authenticated) {
          await operationalEventRepository.append({
            eventType: 'INSTANCE_CONNECTED',
            clinicId: instance.clinicId,
            instanceId: instance.id,
            phone,
            status: nextStatus,
            summary: 'instance authenticated and ready',
          });
        }
        if (authenticated) {
          runtime.qr = undefined;
          runtime.qrUpdatedAt = undefined;
          runtime.pairingCode = undefined;
        }
      }

      if (update.connection === 'close') {
        const loggedOut = reasonCode === DisconnectReason.loggedOut;
        const restartRequired = reasonCode === DisconnectReason.restartRequired;
        const intentionalShutdown = intentionalShutdowns.has(instance.id);
        const nextReconnectAttempt = Number(reconnectAttempts.get(instance.id) || 0) + 1;
        const nextStatus = intentionalShutdown
          ? InstanceStatus.CREATED
          : loggedOut
            ? InstanceStatus.ERROR
            : InstanceStatus.DISCONNECTED;

        await instanceRepository.updateStatus(instance.id, nextStatus);
        logger.warn({
          instanceId: instance.id,
          clinicId: instance.clinicId,
          previousStatus: currentStatus,
          nextStatus,
          reasonCode,
          loggedOut,
          restartRequired,
          intentionalShutdown,
        }, 'instance connection closed');
        currentStatus = nextStatus;
        await operationalEventRepository.append({
          eventType: 'INSTANCE_DISCONNECTED',
          clinicId: instance.clinicId,
          instanceId: instance.id,
          status: nextStatus,
          summary: intentionalShutdown ? 'instance disconnected intentionally' : 'instance connection closed',
          payload: {
            reasonCode,
            loggedOut,
            restartRequired,
            intentionalShutdown,
          },
        });
        runtimeSockets.delete(instance.id);
        if (intentionalShutdown) {
          intentionalShutdowns.delete(instance.id);
          resetReconnectState(instance.id);
        } else if (!loggedOut) {
          if (shouldPauseReconnectAfterDisconnect({
            reasonCode,
            nextAttempt: nextReconnectAttempt,
            runtime,
            isRegistered: auth.state.creds.registered,
          })) {
            await operationalEventRepository.append({
              eventType: 'INSTANCE_PAIRING_REQUIRED',
              clinicId: instance.clinicId,
              instanceId: instance.id,
              status: InstanceStatus.CREATED,
              summary: 'instance requires manual pairing after repeated timeouts before qr became available',
              payload: {
                reasonCode,
                nextReconnectAttempt,
                registered: auth.state.creds.registered,
              },
            }).catch(() => null);
            resetReconnectState(instance.id);
            const reset = await instanceRepository.updateStatus(instance.id, InstanceStatus.CREATED);
            currentStatus = reset.status;
          } else if (shouldForceReauthAfterDisconnect({
            reasonCode,
            nextAttempt: nextReconnectAttempt,
            runtime,
          })) {
            await operationalEventRepository.append({
              eventType: 'INSTANCE_MANUAL_ATTENTION_REQUIRED',
              clinicId: instance.clinicId,
              instanceId: instance.id,
              status: InstanceStatus.ERROR,
              summary: 'instance hit repeated connection timeouts and requires operator review before destructive reset',
              payload: {
                reasonCode,
                nextReconnectAttempt,
                registered: auth.state.creds.registered,
              },
            }).catch(() => null);
            resetReconnectState(instance.id);
            const errored = await instanceRepository.updateStatus(instance.id, InstanceStatus.ERROR);
            currentStatus = errored.status;
          } else {
            scheduleReconnect(instance, restartRequired ? 750 : 5000);
          }
        }
      }
    } catch (error) {
      logger.error({
        error,
        instanceId: instance.id,
        clinicId: instance.clinicId,
        connection: update.connection,
        reasonCode,
      }, 'failed handling connection.update');
    }
  });

  socket.ev.on('messages.upsert', async ({ messages, type }) => {
    if (!Array.isArray(messages) || !messages.length) return;

    const upsertType = String(type || '').trim().toLowerCase();
    if (!['notify', 'append', 'replace'].includes(upsertType)) {
      await operationalEventRepository.append({
        eventType: 'INBOUND_MESSAGE_FILTERED',
        clinicId: instance.clinicId,
        instanceId: instance.id,
        summary: `messages.upsert type ignored: ${upsertType || 'unknown'}`,
        payload: {
          upsertType: upsertType || 'unknown',
          messageCount: messages.length,
        },
      }).catch(() => null);
      return;
    }

    for (const entry of messages) {
      try {
        if (!entry?.message) {
          await operationalEventRepository.append({
            eventType: 'INBOUND_MESSAGE_FILTERED',
            clinicId: instance.clinicId,
            instanceId: instance.id,
            summary: 'message without payload ignored',
            payload: {
              upsertType,
              providerMessageId: entry?.key?.id || null,
            },
          });
          continue;
        }
        if (entry?.key?.fromMe === true) {
          await operationalEventRepository.append({
            eventType: 'INBOUND_MESSAGE_FILTERED',
            clinicId: instance.clinicId,
            instanceId: instance.id,
            summary: 'fromMe message ignored',
            payload: {
              upsertType,
              providerMessageId: entry?.key?.id || null,
            },
          });
          continue;
        }

        const remoteJid = String(entry?.key?.remoteJid || '').trim();
        if (!remoteJid || remoteJid.endsWith('@broadcast') || remoteJid === 'status@broadcast') {
          await operationalEventRepository.append({
            eventType: 'INBOUND_MESSAGE_FILTERED',
            clinicId: instance.clinicId,
            instanceId: instance.id,
            summary: 'broadcast or empty jid ignored',
            payload: {
              upsertType,
              providerMessageId: entry?.key?.id || null,
              remoteJid: remoteJid || null,
            },
          });
          continue;
        }

        const fromPhone = resolveIncomingPhone(entry);
        const body = extractIncomingText(entry.message);
        if (!fromPhone || !body) {
          const messageShape = summarizeInboundMessageShape(entry.message);
          await operationalEventRepository.append({
            eventType: 'INBOUND_MESSAGE_FILTERED',
            clinicId: instance.clinicId,
            instanceId: instance.id,
            phone: fromPhone || null,
            summary: 'empty inbound body ignored',
            payload: {
              upsertType,
              providerMessageId: entry?.key?.id || null,
              remoteJid: remoteJid || null,
              bodyLength: String(body || '').trim().length,
              messageShape,
            },
          });
          continue;
        }

        const instancePhone = normalizeBrPhone(String(instance.phoneNumber || '').trim());
        if (instancePhone && fromPhone === instancePhone) {
          await operationalEventRepository.append({
            eventType: 'INBOUND_MESSAGE_FILTERED',
            clinicId: instance.clinicId,
            instanceId: instance.id,
            phone: fromPhone,
            summary: 'self echo message ignored',
            payload: {
              upsertType,
              providerMessageId: entry?.key?.id || null,
            },
          });
          continue;
        }

        const bodySummary = createBodySummary(body);
        await operationalEventRepository.append({
          eventType: 'INBOUND_MESSAGE_CAPTURED',
          clinicId: instance.clinicId,
          instanceId: instance.id,
          phone: fromPhone,
          status: 'RECEIVED',
          summary: bodySummary.preview,
          payload: {
            providerMessageId: entry?.key?.id || null,
            containsLinks: bodySummary.containsLinks,
            upsertType,
          },
        });

        logger.info({
          instanceId: instance.id,
          clinicId: instance.clinicId,
          providerMessageId: entry?.key?.id || null,
          fromPhone,
        }, 'inbound whatsapp message received');

        await operationalEventRepository.append({
          eventType: 'INBOUND_FORWARDED_TO_CENTRAL',
          clinicId: instance.clinicId,
          instanceId: instance.id,
          phone: fromPhone,
          summary: bodySummary.preview,
          payload: {
            providerMessageId: entry?.key?.id || null,
            upsertType,
          },
        });
        const inboundResult = await centralBackendService.postInboundWhatsapp({
          clinicId: instance.clinicId,
          fromPhone,
          body,
          providerMessageId: String(entry?.key?.id || '').trim() || null,
          rawPayload: entry,
        });
        await operationalEventRepository.append({
          eventType: 'INBOUND_CENTRAL_ACCEPTED',
          clinicId: instance.clinicId,
          instanceId: instance.id,
          phone: fromPhone,
          summary: bodySummary.preview,
          payload: {
            providerMessageId: entry?.key?.id || null,
            upsertType,
          },
        });

        const replyText = String((inboundResult as { replyText?: string } | null)?.replyText || '').trim();
        if (replyText) {
          await runtime.socket.sendMessage(remoteJid, { text: replyText });
          await operationalEventRepository.append({
            eventType: 'INBOUND_AUTO_REPLY_SENT',
            clinicId: instance.clinicId,
            instanceId: instance.id,
            phone: fromPhone,
            status: 'SENT',
            summary: createBodySummary(replyText).preview,
          });
        }
      } catch (error) {
        if (error instanceof Error && String(error.message || '').trim()) {
          await operationalEventRepository.append({
            eventType: 'INBOUND_AUTO_REPLY_FAILED',
            clinicId: instance.clinicId,
            instanceId: instance.id,
            summary: error.message,
          }).catch(() => null);
        }
        await operationalEventRepository.append({
          eventType: 'INBOUND_CENTRAL_FAILED',
          clinicId: instance.clinicId,
          instanceId: instance.id,
          summary: error instanceof Error ? error.message : 'failed processing inbound',
        });
        logger.error({
          error,
          instanceId: instance.id,
          clinicId: instance.clinicId,
        }, 'failed processing inbound whatsapp message');
      }
    }
  });

  if (pairingPhone && !auth.state.creds.registered) {
    void (async () => {
      const normalizedPairingPhone = normalizeBrPhone(pairingPhone);
      const socketReady = await waitForSocketOpen(socket);
      if (!socketReady) {
        logger.warn({
          instanceId: instance.id,
          clinicId: instance.clinicId,
          pairingPhone: normalizedPairingPhone,
          timeoutMs: SOCKET_OPEN_WAIT_TIMEOUT_MS,
        }, 'pairing code request skipped because socket did not reach open state in time');
        return;
      }

      try {
        const code = await socket.requestPairingCode(normalizedPairingPhone);
        runtime.pairingCode = code;
        logger.info({
          instanceId: instance.id,
          clinicId: instance.clinicId,
          pairingPhone: normalizedPairingPhone,
        }, 'pairing code requested');
      } catch (error) {
        logger.warn({
          error,
          instanceId: instance.id,
          clinicId: instance.clinicId,
          pairingPhone: normalizedPairingPhone,
        }, 'pairing code request failed; waiting for QR fallback');
      }
    })();
  }
};

export const instanceService = {
  create: async (payload: { clinicId: string; displayName?: string; pairingPhone?: string }) => {
    const clinicId = String(payload.clinicId || '').trim();
    if (!clinicId) throw new HttpError(400, 'clinicId is required.');
    const clinic = await centralBackendService.getClinicById(clinicId).catch(() => null);
    if (!clinic) {
      throw new HttpError(404, 'Clinic not found in central catalog.');
    }
    const instance = await instanceRepository.createOrGetByClinic({
      clinicId,
      displayName: payload.displayName || clinic?.nomeFantasia || clinic?.name || undefined,
    });
    intentionalShutdowns.delete(instance.id);
    resetReconnectState(instance.id);
    if (!runtimeSockets.has(instance.id)) {
      await startSocket(instance, payload.pairingPhone);
    }
    return instance;
  },

  connect: async (
    instanceId: string,
    pairingPhone?: string,
    options: { preserveReconnectState?: boolean } = {},
  ): Promise<WhatsAppInstance> => {
    const instance = await instanceRepository.findById(instanceId);
    if (!instance) throw new HttpError(404, 'Instance not found.');
    intentionalShutdowns.delete(instance.id);
    if (!options.preserveReconnectState) {
      resetReconnectState(instance.id);
    }
    if (!runtimeSockets.has(instance.id)) {
      await startSocket(instance, pairingPhone);
    }
    return instance;
  },

  disconnect: async (instanceId: string) => {
    const instance = await instanceRepository.findById(instanceId);
    if (!instance) throw new HttpError(404, 'Instance not found.');

    await closeRuntimeSocket(instance, 'manual disconnect');
    resetReconnectState(instance.id);
    await removeSessionDir(instance.id);
    const reset = await instanceRepository.resetSessionState(instance.id);

    logger.info({
      instanceId: instance.id,
      clinicId: instance.clinicId,
    }, 'instance disconnected and reset');

    return {
      id: reset.id,
      clinicId: reset.clinicId,
      status: reset.status,
      deleted: false,
    };
  },

  remove: async (instanceId: string) => {
    const instance = await instanceRepository.findById(instanceId);
    if (!instance) throw new HttpError(404, 'Instance not found.');
    const activeStatuses = [
      MessageJobStatus.QUEUED,
      MessageJobStatus.PROCESSING,
      MessageJobStatus.SCHEDULED,
      MessageJobStatus.BLOCKED,
    ];
    const activeJobs = await messageJobRepository.countByStatuses({
      clinicId: instance.clinicId,
      instanceId: instance.id,
      statuses: activeStatuses,
    });

    await closeRuntimeSocket(instance, 'manual delete');
    resetReconnectState(instance.id);
    let drainedJobs = 0;
    if (activeJobs > 0) {
      drainedJobs = await messageJobRepository.failByStatuses({
        clinicId: instance.clinicId,
        instanceId: instance.id,
        statuses: activeStatuses,
        lastError: 'Message job aborted because the clinic WhatsApp instance was deleted by the operator.',
      });
      await operationalEventRepository.append({
        eventType: 'INSTANCE_DELETE_DRAINED_ACTIVE_JOBS',
        clinicId: instance.clinicId,
        instanceId: instance.id,
        status: 'FAILED',
        summary: `instance delete drained ${drainedJobs} active job(s)`,
        payload: {
          activeJobs,
          drainedJobs,
        },
      }).catch(() => null);
    }
    await removeSessionDir(instance.id);
    const deleted = await instanceRepository.deleteById(instance.id);
    intentionalShutdowns.delete(instance.id);

    logger.info({
      instanceId: instance.id,
      clinicId: instance.clinicId,
      drainedJobs,
      deletedJobs: deleted.deletedJobs,
    }, 'instance deleted permanently');

    return {
      id: instance.id,
      clinicId: instance.clinicId,
      deleted: true,
      drainedJobs,
      deletedJobs: deleted.deletedJobs,
    };
  },

  getStatus: async (instanceId: string) => {
    const instance = await instanceRepository.findById(instanceId);
    if (!instance) throw new HttpError(404, 'Instance not found.');
    const runtime = runtimeSockets.get(instance.id) || null;
    const diagnostics = buildRuntimeDiagnostics(instance, runtime);
    const operationalStatus = toOperationalStatus(instance.status, runtime);
    const [enriched] = await enrichWithClinicCatalog([{
      id: instance.id,
      clinicId: instance.clinicId,
      status: operationalStatus,
      persistedStatus: instance.status,
      phoneNumber: instance.phoneNumber,
      displayName: instance.displayName,
      lastSeenAt: instance.lastSeenAt,
      ...diagnostics,
      runtimeReady: diagnostics.connectedInRuntime,
    }]);
    return enriched;
  },

  getStatusByClinicId: async (clinicId: string) => {
    const normalizedClinicId = String(clinicId || '').trim();
    if (!normalizedClinicId) throw new HttpError(400, 'clinicId is required.');
    const instance = await instanceRepository.findByClinicId(normalizedClinicId);
    if (!instance) throw new HttpError(404, 'Instance not found.');
    const runtime = runtimeSockets.get(instance.id) || null;
    const diagnostics = buildRuntimeDiagnostics(instance, runtime);
    const operationalStatus = toOperationalStatus(instance.status, runtime);
    const [enriched] = await enrichWithClinicCatalog([{
      id: instance.id,
      clinicId: instance.clinicId,
      status: operationalStatus,
      persistedStatus: instance.status,
      phoneNumber: instance.phoneNumber,
      displayName: instance.displayName,
      lastSeenAt: instance.lastSeenAt,
      ...diagnostics,
      runtimeReady: diagnostics.connectedInRuntime,
    }]);
    return enriched;
  },

  listInstances: async () => {
    const instances = await instanceRepository.listAll();
    const rawItems = instances.map((instance) => {
      const runtime = runtimeSockets.get(instance.id) || null;
      const diagnostics = buildRuntimeDiagnostics(instance, runtime);
      return {
        id: instance.id,
        clinicId: instance.clinicId,
        status: toOperationalStatus(instance.status, runtime),
        persistedStatus: instance.status,
        phoneNumber: instance.phoneNumber,
        displayName: instance.displayName,
        createdAt: instance.createdAt,
        updatedAt: instance.updatedAt,
        lastSeenAt: instance.lastSeenAt,
        ...diagnostics,
      };
    });
    const items = await enrichWithClinicCatalog(rawItems);

    const summary = items.reduce<Record<string, number>>((acc, instance) => {
      acc.total += 1;
      acc[instance.status] = (acc[instance.status] || 0) + 1;
      return acc;
    }, {
      total: 0,
      CREATED: 0,
      CONNECTING: 0,
      CONNECTED: 0,
      DISCONNECTED: 0,
      ERROR: 0,
    });

    return { items, summary };
  },

  getInstanceDetails: async (instanceId: string) => {
    return instanceService.getStatus(instanceId);
  },

  getQrPayload: async (instanceId: string) => {
    const instance = await instanceRepository.findById(instanceId);
    if (!instance) throw new HttpError(404, 'Instance not found.');

    if (!runtimeSockets.has(instance.id)) {
      try {
        await startSocket(instance);
      } catch (error) {
        if (!isTransientRuntimeError(error)) throw error;
        logger.warn({
          error,
          instanceId: instance.id,
          clinicId: instance.clinicId,
        }, 'transient runtime failure while preparing qr payload');
      }
    }

    const runtime = await waitForQrRuntime(instance.id, QR_RUNTIME_TIMEOUT_MS);
    const latest = await instanceRepository.findById(instance.id);
    const persistedStatus = latest?.status || instance.status;
    const operationalStatus = toOperationalStatus(persistedStatus, runtime);
    const diagnostics = buildRuntimeDiagnostics(instance, runtime);
    const qr = runtime?.qr || '';
    const pairingCode = runtime?.pairingCode || '';
    const qrDataUrl = qr ? await QRCode.toDataURL(qr).catch(() => '') : '';

    logger.info({
      instanceId: instance.id,
      clinicId: instance.clinicId,
      hasRuntime: Boolean(runtime),
      hasQr: Boolean(qr),
      hasPairingCode: Boolean(pairingCode),
      status: operationalStatus,
      persistedStatus,
      runtimeSocketState: diagnostics.runtimeSocketState,
      connectedInRuntime: diagnostics.connectedInRuntime,
    }, 'instance qr payload requested');

    return {
      instanceId: instance.id,
      status: operationalStatus,
      operationalStatus,
      persistedStatus,
      qr: qr || null,
      qrDataUrl: qrDataUrl || null,
      pairingCode: pairingCode || null,
      ...diagnostics,
    };
  },

  getRecentLogs: async (instanceId: string, limit = 20) => {
    const instance = await instanceRepository.findById(instanceId);
    if (!instance) throw new HttpError(404, 'Instance not found.');

    return messageLogRepository.findRecentByInstanceId(instanceId, limit);
  },

  sendText: async (instanceId: string, toPhone: string, body: string, options?: {
    appointmentId?: string | null;
  }) => {
    const instance = await instanceRepository.findById(instanceId);
    if (!instance) throw new HttpError(404, 'Instance not found.');

    let runtime: RuntimeSocket | null = runtimeSockets.get(instanceId) || null;
    if (!runtime) {
      logger.warn({
        instanceId,
        clinicId: instance.clinicId,
      }, 'sendText requested without runtime socket; attempting runtime recovery');
      await instanceService.connect(instanceId);
      runtime = await waitForConnectedRuntime(instanceId);
    }
    if (!runtime) {
      logger.error({
        instanceId,
        clinicId: instance.clinicId,
      }, 'runtime recovery did not reach connected state before send');
      throw new HttpError(409, 'WhatsApp instance runtime is unavailable. Reconnect is in progress.');
    }

    if (instance.status !== InstanceStatus.CONNECTED) {
      logger.warn({
        instanceId,
        clinicId: instance.clinicId,
        status: instance.status,
        runtimeState: getRuntimeSocketState(runtime),
      }, 'sendText blocked because instance is not connected after runtime recovery');
      throw new HttpError(409, 'WhatsApp instance is not connected.');
    }

    if (!isRuntimeReadyForSend(runtime)) {
      await markRuntimeUnavailable(instance, runtime, 'runtime socket is not open for send');
      throw new HttpError(409, 'WhatsApp instance runtime socket is closed. Reconnect started.');
    }

    const normalizedTo = normalizeBrPhone(toPhone);
    if (!normalizedTo) throw new HttpError(400, 'Invalid recipient phone.');

    const jid = `${normalizedTo}@s.whatsapp.net`;
    try {
      let providerMessageId: string | null = null;
      let remoteJid = jid;
      const shouldSendQuickReplies = shouldUseAppointmentQuickReplies({
        appointmentId: options?.appointmentId,
        body,
      });

      if (shouldSendQuickReplies) {
        try {
          const userJid = String(runtime.socket.user?.id || '').trim();
          if (!userJid) {
            throw new Error('runtime userJid unavailable for interactive appointment prompt');
          }

          const interactiveMessage = buildAppointmentQuickReplyMessage(body);
          const fullMsg = generateWAMessageFromContent(jid, interactiveMessage, {
            userJid,
          });
          if (!fullMsg.message) {
            throw new Error('interactive appointment prompt did not generate a message payload');
          }

          await runtime.socket.relayMessage(jid, fullMsg.message, {
            messageId: fullMsg.key.id || undefined,
          });

          providerMessageId = fullMsg.key.id || null;
          remoteJid = fullMsg.key.remoteJid || jid;
        } catch (interactiveError) {
          logger.warn({
            interactiveError,
            instanceId,
            clinicId: instance.clinicId,
            appointmentId: options?.appointmentId || null,
          }, 'interactive appointment prompt failed; falling back to plain text');

          const fallbackResponse = await runtime.socket.sendMessage(jid, { text: body });
          providerMessageId = fallbackResponse?.key?.id || null;
          remoteJid = fallbackResponse?.key?.remoteJid || jid;
        }
      } else {
        const response = await runtime.socket.sendMessage(jid, { text: body });
        providerMessageId = response?.key?.id || null;
        remoteJid = response?.key?.remoteJid || jid;
      }

      return {
        providerMessageId,
        remoteJid,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown send error';
      const looksLikeClosedConnection = /connection closed|socket closed|not connected|stream errored/i.test(message);
      logger.error({
        error,
        instanceId,
        clinicId: instance.clinicId,
        runtimeState: getRuntimeSocketState(runtime),
      }, 'sendText failed');
      if (looksLikeClosedConnection) {
        await markRuntimeUnavailable(instance, runtime, message);
        throw new HttpError(409, 'WhatsApp connection closed during send. Reconnect started.');
      }
      throw error;
    }
  },

  recoverRuntimeSessions: async (): Promise<void> => {
    const instances = await instanceRepository.listForBootRecovery();
    const concurrency = Math.max(1, env.runtimeRecoveryConcurrency);
    const delayMs = Math.max(0, env.runtimeRecoveryDelayMs);

    for (let index = 0; index < instances.length; index += concurrency) {
      const batch = instances.slice(index, index + concurrency);
      await Promise.all(batch.map(async (instance, batchIndex) => {
        try {
          if (delayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, delayMs * batchIndex));
          }
          if (!runtimeSockets.has(instance.id)) {
            await startSocket(instance);
          }
        } catch (error) {
          logger.error({ error, instanceId: instance.id, clinicId: instance.clinicId }, 'failed to recover instance on boot');
        }
      }));
    }
  },
};
