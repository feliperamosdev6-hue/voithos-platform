import { MessageEventType } from '@prisma/client';
import { prisma } from '../lib/prisma';

export const messageLogRepository = {
  create: async (payload: {
    jobId: string;
    providerMessageId?: string;
    eventType: MessageEventType;
    payload: unknown;
  }): Promise<void> => {
    await prisma.messageLog.create({
      data: {
        jobId: payload.jobId,
        providerMessageId: payload.providerMessageId || null,
        eventType: payload.eventType,
        payload: payload.payload as object,
      },
    });
  },

  findRecentByInstanceId: async (instanceId: string, limit = 20) => prisma.messageLog.findMany({
    where: {
      job: {
        instanceId,
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: limit,
    include: {
      job: {
        select: {
          id: true,
          clinicId: true,
          instanceId: true,
          toPhone: true,
          status: true,
          lastError: true,
        },
      },
    },
  }),

  findRecent: async (filters: {
    clinicId?: string;
    instanceId?: string;
    eventType?: MessageEventType;
    search?: string;
    limit?: number;
    offset?: number;
  }) => {
    const search = String(filters.search || '').trim();
    const limit = Math.min(Math.max(filters.limit || 50, 1), 100);
    const offset = Math.max(Number(filters.offset) || 0, 0);

    const logs = await prisma.messageLog.findMany({
      where: {
        eventType: filters.eventType || undefined,
        providerMessageId: search ? { contains: search, mode: 'insensitive' } : undefined,
        job: {
          clinicId: filters.clinicId || undefined,
          instanceId: filters.instanceId || undefined,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip: offset,
      take: limit,
      include: {
        job: {
          select: {
            id: true,
            clinicId: true,
            instanceId: true,
            toPhone: true,
            body: true,
            status: true,
            lastError: true,
          },
        },
      },
    });

    if (!search) return logs;

    const normalizedSearch = search.toLowerCase();
    return logs.filter((log) => {
      const haystack = [
        log.providerMessageId,
        log.eventType,
        log.job?.clinicId,
        log.job?.instanceId,
        log.job?.toPhone,
        log.job?.body,
        log.job?.lastError,
        JSON.stringify(log.payload),
      ].join(' ').toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  },

  pruneBefore: async (cutoff: Date): Promise<number> => {
    const result = await prisma.messageLog.deleteMany({
      where: {
        createdAt: {
          lt: cutoff,
        },
      },
    });
    return Number(result.count || 0);
  },
};
