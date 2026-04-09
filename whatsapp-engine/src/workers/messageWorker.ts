import { Worker } from 'bullmq';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { MESSAGE_QUEUE_NAME, redisConnection } from '../queues/messageQueue';
import { messagingService } from '../services/messaging/messagingService';

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
  },
  'message worker started',
);
