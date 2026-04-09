import { MessageJob, MessageJobStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';

export type CreateMessageJobInput = {
  clinicId: string;
  instanceId: string;
  appointmentId?: string;
  toPhone: string;
  body: string;
  scheduledFor?: Date | null;
  status: MessageJobStatus;
};

export const messageJobRepository = {
  create: async (input: CreateMessageJobInput): Promise<MessageJob> => prisma.messageJob.create({
    data: {
      clinicId: input.clinicId,
      instanceId: input.instanceId,
      appointmentId: input.appointmentId || null,
      toPhone: input.toPhone,
      body: input.body,
      scheduledFor: input.scheduledFor || null,
      status: input.status,
    },
  }),

  findById: async (id: string): Promise<MessageJob | null> => prisma.messageJob.findUnique({ where: { id } }),

  findLatestActiveSimilar: async (filters: {
    clinicId: string;
    appointmentId: string;
    toPhone: string;
    body: string;
  }): Promise<MessageJob | null> => prisma.messageJob.findFirst({
    where: {
      clinicId: filters.clinicId,
      appointmentId: filters.appointmentId,
      toPhone: filters.toPhone,
      body: filters.body,
      status: {
        in: [
          MessageJobStatus.QUEUED,
          MessageJobStatus.PROCESSING,
          MessageJobStatus.BLOCKED,
          MessageJobStatus.SCHEDULED,
        ],
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  }),

  findRecent: async (filters: {
    clinicId?: string;
    instanceId?: string;
    status?: MessageJobStatus;
    search?: string;
    limit?: number;
  }) => {
    const search = String(filters.search || '').trim();
    const limit = Math.min(Math.max(filters.limit || 50, 1), 100);

    return prisma.messageJob.findMany({
      where: {
        clinicId: filters.clinicId || undefined,
        instanceId: filters.instanceId || undefined,
        status: filters.status || undefined,
        OR: search ? [
          { clinicId: { contains: search, mode: 'insensitive' } },
          { instanceId: { contains: search, mode: 'insensitive' } },
          { toPhone: { contains: search, mode: 'insensitive' } },
          { body: { contains: search, mode: 'insensitive' } },
          { lastError: { contains: search, mode: 'insensitive' } },
        ] : undefined,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });
  },

  findSince: async (filters: {
    since: Date;
    clinicId?: string;
    instanceId?: string;
    status?: MessageJobStatus;
    limit?: number;
  }) => {
    const limit = Math.min(Math.max(filters.limit || 500, 1), 1000);

    return prisma.messageJob.findMany({
      where: {
        createdAt: {
          gte: filters.since,
        },
        clinicId: filters.clinicId || undefined,
        instanceId: filters.instanceId || undefined,
        status: filters.status || undefined,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });
  },

  countByStatusSince: async (since: Date) => {
    const jobs = await prisma.messageJob.groupBy({
      by: ['status'],
      where: {
        createdAt: {
          gte: since,
        },
      },
      _count: {
        _all: true,
      },
    });

    return jobs.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = item._count._all;
      return acc;
    }, {});
  },

  countByStatuses: async (filters: {
    clinicId?: string;
    instanceId?: string;
    statuses: MessageJobStatus[];
  }) => prisma.messageJob.count({
    where: {
      clinicId: filters.clinicId || undefined,
      instanceId: filters.instanceId || undefined,
      status: {
        in: filters.statuses,
      },
    },
  }),

  failByStatuses: async (filters: {
    clinicId?: string;
    instanceId?: string;
    statuses: MessageJobStatus[];
    lastError: string;
  }): Promise<number> => {
    const result = await prisma.messageJob.updateMany({
      where: {
        clinicId: filters.clinicId || undefined,
        instanceId: filters.instanceId || undefined,
        status: {
          in: filters.statuses,
        },
      },
      data: {
        status: MessageJobStatus.FAILED,
        lastError: filters.lastError,
      },
    });
    return Number(result.count || 0);
  },

  updateStatus: async (id: string, status: MessageJobStatus, extra?: { lastError?: string; retryCount?: number }): Promise<void> => {
    await prisma.messageJob.update({
      where: { id },
      data: {
        status,
        lastError: extra?.lastError,
        retryCount: extra?.retryCount,
      },
    });
  },

  pruneCompletedBefore: async (cutoff: Date): Promise<number> => {
    const result = await prisma.messageJob.deleteMany({
      where: {
        createdAt: {
          lt: cutoff,
        },
        status: {
          in: [MessageJobStatus.SENT, MessageJobStatus.FAILED],
        },
      },
    });
    return Number(result.count || 0);
  },
};
