import { ConnectionOptions, JobsOptions, Queue } from 'bullmq';
import { env } from '../config/env';

export const redisConnection: ConnectionOptions = {
  host: env.redisHost,
  port: env.redisPort,
  password: env.redisPassword || undefined,
  maxRetriesPerRequest: null,
};

export const MESSAGE_QUEUE_NAME = 'voithos-whatsapp-message-queue';

export const messageQueue = new Queue(MESSAGE_QUEUE_NAME, {
  connection: redisConnection,
});

export type MessageQueuePayload = {
  jobId: string;
};

export const enqueueMessageJob = async (
  payload: MessageQueuePayload,
  options?: { delayMs?: number },
): Promise<void> => {
  const jobOptions: JobsOptions = {
    jobId: payload.jobId,
    attempts: env.messageMaxAttempts,
    backoff: {
      type: 'fixed',
      delay: env.messageBackoffMs,
    },
    removeOnComplete: true,
    removeOnFail: false,
  };
  if (options?.delayMs && options.delayMs > 0) {
    jobOptions.delay = options.delayMs;
  }

  await messageQueue.add('send-text', payload, jobOptions);
};
