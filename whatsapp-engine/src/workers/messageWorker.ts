import { Worker } from 'bullmq';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { MESSAGE_QUEUE_NAME, redisConnection } from '../queues/messageQueue';
import { messagingService } from '../services/messaging/messagingService';

if (!env.whatsappQueueEnabled || !env.whatsappRedisWorkersEnabled) {
  logger.warn(
    {
      queue: MESSAGE_QUEUE_NAME,
      whatsappQueueEnabled: env.whatsappQueueEnabled,
      whatsappRedisWorkersEnabled: env.whatsappRedisWorkersEnabled,
    },
    'whatsapp redis worker disabled by kill switch',
  );
  process.exit(0);
}

const worker = new Worker(
  MESSAGE_QUEUE_NAME,
  async (job) => {
    const payload = job.data as { jobId: string };
    await messagingService.processQueuedJob(payload.jobId, job.attemptsMade + 1);
  },
  {
    connection: redisConnection,
    concurrency: env.workerConcurrency,
    lockDuration: env.workerLockDurationMs,
    stalledInterval: env.workerStalledIntervalMs,
    drainDelay: env.workerDrainDelaySeconds,
  },
);

worker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'message job completed');
});

worker.on('failed', (job, error) => {
  logger.error({ jobId: job?.id, error }, 'message job failed');
});

logger.info(
  {
    queue: MESSAGE_QUEUE_NAME,
    concurrency: env.workerConcurrency,
    lockDuration: env.workerLockDurationMs,
    stalledInterval: env.workerStalledIntervalMs,
    drainDelay: env.workerDrainDelaySeconds,
  },
  'message worker started',
);
