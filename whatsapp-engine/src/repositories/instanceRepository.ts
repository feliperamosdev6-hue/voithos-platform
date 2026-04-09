import { InstanceStatus, WhatsAppInstance } from '@prisma/client';
import { prisma } from '../lib/prisma';

export type CreateInstanceInput = {
  clinicId: string;
  displayName?: string;
};

export const instanceRepository = {
  createOrGetByClinic: async (input: CreateInstanceInput): Promise<WhatsAppInstance> => {
    const existing = await prisma.whatsAppInstance.findUnique({
      where: { clinicId: input.clinicId },
    });
    if (existing) return existing;

    return prisma.whatsAppInstance.create({
      data: {
        clinicId: input.clinicId,
        displayName: input.displayName || null,
        status: InstanceStatus.CREATED,
      },
    });
  },

  findById: async (id: string): Promise<WhatsAppInstance | null> => prisma.whatsAppInstance.findUnique({
    where: { id },
  }),

  findByClinicId: async (clinicId: string): Promise<WhatsAppInstance | null> => prisma.whatsAppInstance.findUnique({
    where: { clinicId },
  }),

  listAll: async (): Promise<WhatsAppInstance[]> => prisma.whatsAppInstance.findMany({
    orderBy: [
      { updatedAt: 'desc' },
      { createdAt: 'desc' },
    ],
  }),

  updateStatus: async (id: string, status: InstanceStatus): Promise<WhatsAppInstance> => prisma.whatsAppInstance.update({
    where: { id },
    data: {
      status,
      lastSeenAt: new Date(),
    },
  }),

  updateAuthBlob: async (id: string, authBlobEncrypted: string): Promise<void> => {
    await prisma.whatsAppInstance.update({
      where: { id },
      data: {
        authBlobEncrypted,
        updatedAt: new Date(),
      },
    });
  },

  updateConnectionMeta: async (id: string, payload: { status: InstanceStatus; phoneNumber?: string; displayName?: string }): Promise<void> => {
    await prisma.whatsAppInstance.update({
      where: { id },
      data: {
        status: payload.status,
        phoneNumber: payload.phoneNumber || null,
        displayName: payload.displayName || undefined,
        lastSeenAt: new Date(),
      },
    });
  },

  resetSessionState: async (id: string): Promise<WhatsAppInstance> => prisma.whatsAppInstance.update({
    where: { id },
    data: {
      status: InstanceStatus.CREATED,
      phoneNumber: null,
      authBlobEncrypted: null,
      lastSeenAt: new Date(),
    },
  }),

  deleteById: async (id: string): Promise<{ instance: WhatsAppInstance; deletedJobs: number }> => {
    const [jobsResult, instance] = await prisma.$transaction([
      prisma.messageJob.deleteMany({
        where: { instanceId: id },
      }),
      prisma.whatsAppInstance.delete({
        where: { id },
      }),
    ]);

    return {
      instance,
      deletedJobs: jobsResult.count,
    };
  },

  listForBootRecovery: async (): Promise<WhatsAppInstance[]> => prisma.whatsAppInstance.findMany({
    where: {
      status: {
        in: [InstanceStatus.CONNECTED, InstanceStatus.CONNECTING, InstanceStatus.DISCONNECTED],
      },
    },
  }),
};
