import { env } from '../../config/env';
import { logger } from '../../config/logger';

type RetryDecision = (error: unknown, attempt: number) => boolean;

type AttemptFailurePayload = {
  error: unknown;
  attempt: number;
  willRetry: boolean;
  timedOut: boolean;
};

type InstanceSendTask<T> = {
  id: string;
  instanceId: string;
  clinicId: string;
  operation: (attempt: number) => Promise<T>;
  shouldRetry: RetryDecision;
  onAttemptFailure?: (payload: AttemptFailurePayload) => Promise<void> | void;
  enqueuedAt: Date;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

type InstanceSendQueueState = {
  instanceId: string;
  queue: Array<InstanceSendTask<unknown>>;
  processing: boolean;
  nextReadyAt: number;
  activeTaskId: string | null;
  activeTaskStartedAt: Date | null;
  lastDelayMs: number;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
};

type MutableInstanceSendHealth = {
  instanceId: string;
  clinicId: string;
  lastSendSuccessAt: Date | null;
  lastSendErrorAt: Date | null;
  lastSendError: string;
  lastSendTimedOutAt: Date | null;
  lastConnectionUpdateAt: Date | null;
  lastHeartbeatAt: Date | null;
  lastSendDurationMs: number;
  consecutiveSendFailures: number;
};

export type InstanceSendHealthSnapshot = {
  instanceId: string;
  clinicId: string;
  lastSendSuccessAt: string | null;
  lastSendErrorAt: string | null;
  lastSendError: string;
  lastSendTimedOutAt: string | null;
  lastConnectionUpdateAt: string | null;
  lastHeartbeatAt: string | null;
  lastSendDurationMs: number;
  consecutiveSendFailures: number;
  queueDepth: number;
  processing: boolean;
  activeTaskId: string | null;
  activeTaskStartedAt: string | null;
  nextReadyAt: string | null;
  lastDelayMs: number;
};

const INSTANCE_QUEUE_IDLE_TTL_MS = 5 * 60 * 1000;
const queuesByInstance = new Map<string, InstanceSendQueueState>();
const healthByInstance = new Map<string, MutableInstanceSendHealth>();
let taskSequence = 0;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => {
  setTimeout(resolve, Math.max(0, ms));
});

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error && String(error.message || '').trim()) return error.message;
  return String(error || 'Unknown WhatsApp send error.');
};

const toIso = (value: Date | null | undefined): string | null => value?.toISOString?.() || null;

const getTimeoutMs = (): number => Math.max(1000, env.instanceSendTimeoutMs);

const getRetryDelayMs = (): number => Math.max(0, env.instanceSendRetryDelayMs);

const getMaxAttempts = (): number => Math.max(1, Math.min(3, env.instanceSendMaxAttempts));

const getInterMessageDelayMs = (): number => {
  const minDelay = Math.max(0, env.instanceSendMinDelayMs);
  const maxDelay = Math.max(minDelay, env.instanceSendMaxDelayMs);
  if (maxDelay <= minDelay) return minDelay;
  return minDelay + Math.floor(Math.random() * (maxDelay - minDelay + 1));
};

const getOrCreateQueue = (instanceId: string): InstanceSendQueueState => {
  const existing = queuesByInstance.get(instanceId);
  if (existing) return existing;

  const created: InstanceSendQueueState = {
    instanceId,
    queue: [],
    processing: false,
    nextReadyAt: 0,
    activeTaskId: null,
    activeTaskStartedAt: null,
    lastDelayMs: 0,
    cleanupTimer: null,
  };
  queuesByInstance.set(instanceId, created);
  return created;
};

const getOrCreateHealth = (instanceId: string, clinicId = ''): MutableInstanceSendHealth => {
  const existing = healthByInstance.get(instanceId);
  if (existing) {
    if (clinicId && !existing.clinicId) existing.clinicId = clinicId;
    return existing;
  }

  const created: MutableInstanceSendHealth = {
    instanceId,
    clinicId,
    lastSendSuccessAt: null,
    lastSendErrorAt: null,
    lastSendError: '',
    lastSendTimedOutAt: null,
    lastConnectionUpdateAt: null,
    lastHeartbeatAt: null,
    lastSendDurationMs: 0,
    consecutiveSendFailures: 0,
  };
  healthByInstance.set(instanceId, created);
  return created;
};

const scheduleQueueCleanup = (state: InstanceSendQueueState): void => {
  if (state.cleanupTimer) {
    clearTimeout(state.cleanupTimer);
    state.cleanupTimer = null;
  }

  if (state.processing || state.queue.length > 0) return;

  state.cleanupTimer = setTimeout(() => {
    const current = queuesByInstance.get(state.instanceId);
    if (!current || current.processing || current.queue.length > 0) return;
    queuesByInstance.delete(state.instanceId);
  }, INSTANCE_QUEUE_IDLE_TTL_MS);
  state.cleanupTimer.unref?.();
};

const createTimeoutError = (timeoutMs: number): Error & { code: string; statusCode: number; timedOut: boolean } => {
  const error = new Error(`WhatsApp send timed out after ${timeoutMs}ms.`);
  return Object.assign(error, {
    code: 'INSTANCE_SEND_TIMEOUT',
    statusCode: 504,
    timedOut: true,
  });
};

const isTimeoutError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const maybe = error as { code?: string; timedOut?: boolean };
  return maybe.timedOut === true || maybe.code === 'INSTANCE_SEND_TIMEOUT';
};

const withSendTimeout = async <T>(operation: () => Promise<T>, timeoutMs: number): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      operation(),
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => reject(createTimeoutError(timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

const recordSendSuccess = <T>(task: InstanceSendTask<T>, durationMs: number): void => {
  const health = getOrCreateHealth(task.instanceId, task.clinicId);
  health.lastSendSuccessAt = new Date();
  health.lastSendErrorAt = null;
  health.lastSendError = '';
  health.lastSendTimedOutAt = null;
  health.lastSendDurationMs = durationMs;
  health.consecutiveSendFailures = 0;
};

const recordSendFailure = <T>(task: InstanceSendTask<T>, error: unknown, durationMs: number): void => {
  const health = getOrCreateHealth(task.instanceId, task.clinicId);
  health.lastSendErrorAt = new Date();
  health.lastSendError = toErrorMessage(error);
  health.lastSendDurationMs = durationMs;
  health.consecutiveSendFailures += 1;
  if (isTimeoutError(error)) {
    health.lastSendTimedOutAt = health.lastSendErrorAt;
  }
};

const runTaskWithAttempts = async <T>(task: InstanceSendTask<T>): Promise<T> => {
  const maxAttempts = getMaxAttempts();
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const startedAt = Date.now();
    try {
      const result = await withSendTimeout(() => task.operation(attempt), getTimeoutMs());
      recordSendSuccess(task, Date.now() - startedAt);
      return result;
    } catch (error) {
      lastError = error;
      const willRetry = attempt < maxAttempts && task.shouldRetry(error, attempt);
      recordSendFailure(task, error, Date.now() - startedAt);
      await task.onAttemptFailure?.({
        error,
        attempt,
        willRetry,
        timedOut: isTimeoutError(error),
      });

      logger.warn({
        error,
        instanceId: task.instanceId,
        clinicId: task.clinicId,
        attempt,
        maxAttempts,
        willRetry,
      }, 'instance send attempt failed');

      if (!willRetry) break;
      await sleep(getRetryDelayMs());
    }
  }

  throw lastError || new Error('WhatsApp send failed.');
};

const processQueue = async (instanceId: string): Promise<void> => {
  const state = getOrCreateQueue(instanceId);
  if (state.processing) return;

  state.processing = true;
  if (state.cleanupTimer) {
    clearTimeout(state.cleanupTimer);
    state.cleanupTimer = null;
  }

  try {
    while (state.queue.length > 0) {
      const task = state.queue.shift();
      if (!task) continue;

      const waitMs = Math.max(0, state.nextReadyAt - Date.now());
      if (waitMs > 0) await sleep(waitMs);

      state.activeTaskId = task.id;
      state.activeTaskStartedAt = new Date();
      try {
        const result = await runTaskWithAttempts(task);
        task.resolve(result);
      } catch (error) {
        task.reject(error);
      } finally {
        const delayMs = getInterMessageDelayMs();
        state.lastDelayMs = delayMs;
        state.nextReadyAt = Date.now() + delayMs;
        state.activeTaskId = null;
        state.activeTaskStartedAt = null;
      }
    }
  } finally {
    state.processing = false;
    scheduleQueueCleanup(state);
  }
};

export const enqueueInstanceSend = async <T>(input: {
  instanceId: string;
  clinicId: string;
  operation: (attempt: number) => Promise<T>;
  shouldRetry: RetryDecision;
  onAttemptFailure?: (payload: AttemptFailurePayload) => Promise<void> | void;
}): Promise<T> => {
  const instanceId = String(input.instanceId || '').trim();
  const clinicId = String(input.clinicId || '').trim();
  if (!instanceId) throw new Error('instanceId is required for instance send queue.');

  getOrCreateHealth(instanceId, clinicId);
  const state = getOrCreateQueue(instanceId);

  return new Promise<T>((resolve, reject) => {
    taskSequence += 1;
    const task: InstanceSendTask<T> = {
      id: `${Date.now()}-${taskSequence}`,
      instanceId,
      clinicId,
      operation: input.operation,
      shouldRetry: input.shouldRetry,
      onAttemptFailure: input.onAttemptFailure,
      enqueuedAt: new Date(),
      resolve,
      reject,
    };

    state.queue.push(task as InstanceSendTask<unknown>);
    logger.info({
      instanceId,
      clinicId,
      taskId: task.id,
      queueDepth: state.queue.length,
      processing: state.processing,
    }, 'instance send queued');

    void processQueue(instanceId);
  });
};

export const recordInstanceConnectionUpdate = (instanceId: string, clinicId: string): void => {
  const health = getOrCreateHealth(instanceId, clinicId);
  health.lastConnectionUpdateAt = new Date();
};

export const recordInstanceHeartbeat = (instanceId: string, clinicId: string): void => {
  const health = getOrCreateHealth(instanceId, clinicId);
  health.lastHeartbeatAt = new Date();
};

export const getInstanceSendHealthSnapshot = (instanceId: string, clinicId = ''): InstanceSendHealthSnapshot => {
  const health = getOrCreateHealth(instanceId, clinicId);
  const queue = queuesByInstance.get(instanceId) || null;
  const nextReadyAt = queue?.nextReadyAt && queue.nextReadyAt > Date.now()
    ? new Date(queue.nextReadyAt)
    : null;

  return {
    instanceId,
    clinicId: health.clinicId || clinicId,
    lastSendSuccessAt: toIso(health.lastSendSuccessAt),
    lastSendErrorAt: toIso(health.lastSendErrorAt),
    lastSendError: health.lastSendError,
    lastSendTimedOutAt: toIso(health.lastSendTimedOutAt),
    lastConnectionUpdateAt: toIso(health.lastConnectionUpdateAt),
    lastHeartbeatAt: toIso(health.lastHeartbeatAt),
    lastSendDurationMs: health.lastSendDurationMs,
    consecutiveSendFailures: health.consecutiveSendFailures,
    queueDepth: queue?.queue.length || 0,
    processing: queue?.processing === true,
    activeTaskId: queue?.activeTaskId || null,
    activeTaskStartedAt: toIso(queue?.activeTaskStartedAt || null),
    nextReadyAt: toIso(nextReadyAt),
    lastDelayMs: queue?.lastDelayMs || 0,
  };
};
