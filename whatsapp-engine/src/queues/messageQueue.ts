import { ConnectionOptions, JobsOptions, Queue } from 'bullmq';
import { env } from '../config/env';
import { logger } from '../config/logger';

export const redisConnection: ConnectionOptions = {
  host: env.redisHost,
  port: env.redisPort,
  password: env.redisPassword || undefined,
  ...(env.redisTls ? { tls: {} } : {}),
  maxRetriesPerRequest: null,
};

export const MESSAGE_QUEUE_NAME = 'voithos-whatsapp-message-queue';

export const messageQueue = env.whatsappQueueEnabled
  ? new Queue(MESSAGE_QUEUE_NAME, {
      connection: redisConnection,
    })
  : null;

export type MessageQueuePayload = {
  jobId: string;
};

export const enqueueMessageJob = async (
  payload: MessageQueuePayload,
  options?: { delayMs?: number },
): Promise<void> => {
  if (!env.whatsappQueueEnabled || !messageQueue) {
    logger.warn({ queue: MESSAGE_QUEUE_NAME }, 'whatsapp redis queue disabled; enqueue skipped');
    throw new Error('WHATSAPP_QUEUE_DISABLED');
  }

  const jobOptions: JobsOptions = {
    jobId: payload.jobId,
    attempts: env.messageMaxAttempts,
    backoff: {
      type: 'fixed',
      delay: env.messageBackoffMs,
    },
    removeOnComplete: true,
    removeOnFail: {
      age: 7 * 24 * 60 * 60,
      count: 1000,
    },
  };
  if (options?.delayMs && options.delayMs > 0) {
    jobOptions.delay = options.delayMs;
  }

  await messageQueue.add('send-text', payload, jobOptions);
};
