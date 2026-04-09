const { prisma } = require('../db/prisma');
const { toNullableString, toOptionalDate, toRequiredString } = require('../types/repositoryTypes');

const normalizeCampaignWhere = ({ clinicId, includeDeleted = false } = {}) => ({
  clinicId: toRequiredString(clinicId, 'clinicId'),
  deletedAt: includeDeleted ? undefined : null,
});

const campaignRepository = {
  countByClinic: async ({ clinicId, includeDeleted = false }) => prisma.campaign.count({
    where: normalizeCampaignWhere({ clinicId, includeDeleted }),
  }),

  listCampaignsByClinic: async ({ clinicId, includeDeleted = false }) => prisma.campaign.findMany({
    where: normalizeCampaignWhere({ clinicId, includeDeleted }),
    orderBy: { createdAt: 'desc' },
  }),

  findCampaignByIdAndClinic: async ({ clinicId, campaignId, includeDeleted = false }) => prisma.campaign.findFirst({
    where: {
      ...normalizeCampaignWhere({ clinicId, includeDeleted }),
      id: toRequiredString(campaignId, 'campaignId'),
    },
  }),

  createCampaign: async (data) => prisma.campaign.create({ data }),

  createManyCampaigns: async (data = []) => {
    const list = Array.isArray(data) ? data : [];
    if (!list.length) return { count: 0 };
    return prisma.campaign.createMany({
      data: list,
      skipDuplicates: true,
    });
  },

  updateCampaign: async ({ clinicId, campaignId, data }) => {
    await prisma.campaign.updateMany({
      where: {
        clinicId: toRequiredString(clinicId, 'clinicId'),
        id: toRequiredString(campaignId, 'campaignId'),
        deletedAt: null,
      },
      data,
    });
    return campaignRepository.findCampaignByIdAndClinic({ clinicId, campaignId, includeDeleted: true });
  },

  softDeleteCampaign: async ({ clinicId, campaignId }) => prisma.campaign.updateMany({
    where: {
      clinicId: toRequiredString(clinicId, 'clinicId'),
      id: toRequiredString(campaignId, 'campaignId'),
      deletedAt: null,
    },
    data: {
      deletedAt: new Date(),
      updatedAt: new Date(),
      status: 'INACTIVE',
    },
  }),

  findLatestReusableBatch: async ({ clinicId, campaignId, maxAgeMinutes = 15 }) => {
    const threshold = new Date(Date.now() - (Math.max(1, Number(maxAgeMinutes) || 15) * 60 * 1000));
    return prisma.campaignBatch.findFirst({
      where: {
        clinicId: toRequiredString(clinicId, 'clinicId'),
        campaignId: toRequiredString(campaignId, 'campaignId'),
        status: { in: ['CREATED', 'PROCESSING'] },
        createdAt: { gte: threshold },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  findBatchByIdAndClinic: async ({ clinicId, batchId }) => prisma.campaignBatch.findFirst({
    where: {
      clinicId: toRequiredString(clinicId, 'clinicId'),
      id: toRequiredString(batchId, 'batchId'),
    },
  }),

  listBatchesByCampaign: async ({ clinicId, campaignId, limit = 20 }) => prisma.campaignBatch.findMany({
    where: {
      clinicId: toRequiredString(clinicId, 'clinicId'),
      campaignId: toRequiredString(campaignId, 'campaignId'),
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(Number(limit) || 20, 1), 100),
  }),

  createAudienceSnapshotWithMembers: async ({ snapshot, members = [] }) => prisma.$transaction(async (tx) => {
    const createdSnapshot = await tx.campaignAudienceSnapshot.create({
      data: {
        id: toRequiredString(snapshot?.id, 'snapshot.id'),
        clinicId: toRequiredString(snapshot?.clinicId, 'snapshot.clinicId'),
        campaignId: toNullableString(snapshot?.campaignId),
        segmentKey: toRequiredString(snapshot?.segmentKey, 'snapshot.segmentKey'),
        filters: snapshot?.filters ?? null,
        totalRecipients: Math.max(0, Number(snapshot?.totalRecipients) || 0),
        includedRecipients: Math.max(0, Number(snapshot?.includedRecipients) || 0),
        blockedRecipients: Math.max(0, Number(snapshot?.blockedRecipients) || 0),
        source: toNullableString(snapshot?.source),
        summary: snapshot?.summary ?? null,
        createdByUserId: toNullableString(snapshot?.createdByUserId),
        createdByName: toNullableString(snapshot?.createdByName),
      },
    });

    const normalizedMembers = (Array.isArray(members) ? members : []).map((item) => ({
      id: toRequiredString(item?.id, 'member.id'),
      clinicId: toRequiredString(item?.clinicId, 'member.clinicId'),
      snapshotId: createdSnapshot.id,
      patientId: toRequiredString(item?.patientId, 'member.patientId'),
      patientName: toNullableString(item?.patientName),
      phone: toNullableString(item?.phone),
      allowsMessages: item?.allowsMessages !== false,
      included: item?.included !== false,
      status: toNullableString(item?.status),
      reasonCode: toNullableString(item?.reasonCode),
      reasonLabel: toNullableString(item?.reasonLabel),
      metadata: item?.metadata ?? null,
    }));

    if (normalizedMembers.length) {
      await tx.campaignAudienceSnapshotMember.createMany({
        data: normalizedMembers,
        skipDuplicates: true,
      });
    }

    const createdMembers = await tx.campaignAudienceSnapshotMember.findMany({
      where: { snapshotId: createdSnapshot.id },
      orderBy: { createdAt: 'asc' },
    });

    return { snapshot: createdSnapshot, members: createdMembers };
  }),

  createBatchWithDispatches: async ({ batch, dispatches = [] }) => prisma.$transaction(async (tx) => {
    const createdBatch = await tx.campaignBatch.create({
      data: {
        id: toRequiredString(batch?.id, 'batch.id'),
        clinicId: toRequiredString(batch?.clinicId, 'batch.clinicId'),
        campaignId: toNullableString(batch?.campaignId),
        audienceSnapshotId: toRequiredString(batch?.audienceSnapshotId, 'batch.audienceSnapshotId'),
        channel: toRequiredString(batch?.channel, 'batch.channel'),
        status: toRequiredString(batch?.status, 'batch.status'),
        sourceType: toNullableString(batch?.sourceType),
        originType: toNullableString(batch?.originType),
        eventType: toNullableString(batch?.eventType),
        entityType: toNullableString(batch?.entityType),
        entityId: toNullableString(batch?.entityId),
        totalRecipients: Math.max(0, Number(batch?.totalRecipients) || 0),
        processedCount: Math.max(0, Number(batch?.processedCount) || 0),
        successCount: Math.max(0, Number(batch?.successCount) || 0),
        failedCount: Math.max(0, Number(batch?.failedCount) || 0),
        blockedCount: Math.max(0, Number(batch?.blockedCount) || 0),
        pendingCount: Math.max(0, Number(batch?.pendingCount) || 0),
        lastError: toNullableString(batch?.lastError),
        createdByUserId: toNullableString(batch?.createdByUserId),
        createdByName: toNullableString(batch?.createdByName),
        startedAt: toOptionalDate(batch?.startedAt),
        completedAt: toOptionalDate(batch?.completedAt),
        metadata: batch?.metadata ?? null,
      },
    });

    const normalizedDispatches = (Array.isArray(dispatches) ? dispatches : []).map((item) => ({
      id: toRequiredString(item?.id, 'dispatch.id'),
      clinicId: toRequiredString(item?.clinicId, 'dispatch.clinicId'),
      campaignId: toNullableString(item?.campaignId),
      batchId: createdBatch.id,
      audienceSnapshotId: toRequiredString(item?.audienceSnapshotId, 'dispatch.audienceSnapshotId'),
      audienceMemberId: toRequiredString(item?.audienceMemberId, 'dispatch.audienceMemberId'),
      channel: toRequiredString(item?.channel, 'dispatch.channel'),
      status: toRequiredString(item?.status, 'dispatch.status'),
      dispatchType: toRequiredString(item?.dispatchType, 'dispatch.dispatchType'),
      sourceType: toNullableString(item?.sourceType),
      originType: toNullableString(item?.originType),
      eventType: toNullableString(item?.eventType),
      entityType: toNullableString(item?.entityType),
      entityId: toNullableString(item?.entityId),
      patientId: toRequiredString(item?.patientId, 'dispatch.patientId'),
      patientName: toNullableString(item?.patientName),
      phone: toNullableString(item?.phone),
      body: toRequiredString(item?.body, 'dispatch.body'),
      bodyRedacted: toNullableString(item?.bodyRedacted),
      idempotencyKey: toRequiredString(item?.idempotencyKey, 'dispatch.idempotencyKey'),
      attemptCount: Math.max(0, Number(item?.attemptCount) || 0),
      lastAttemptAt: toOptionalDate(item?.lastAttemptAt),
      sentAt: toOptionalDate(item?.sentAt),
      failedAt: toOptionalDate(item?.failedAt),
      blockedAt: toOptionalDate(item?.blockedAt),
      provider: toNullableString(item?.provider),
      providerMessageId: toNullableString(item?.providerMessageId),
      lastError: toNullableString(item?.lastError),
      metadata: item?.metadata ?? null,
    }));

    if (normalizedDispatches.length) {
      await tx.campaignDispatch.createMany({
        data: normalizedDispatches,
        skipDuplicates: true,
      });
    }

    const createdDispatches = await tx.campaignDispatch.findMany({
      where: { batchId: createdBatch.id },
      orderBy: { createdAt: 'asc' },
    });

    return { batch: createdBatch, dispatches: createdDispatches };
  }),

  listDispatchesByBatch: async ({ clinicId, batchId }) => prisma.campaignDispatch.findMany({
    where: {
      clinicId: toRequiredString(clinicId, 'clinicId'),
      batchId: toRequiredString(batchId, 'batchId'),
    },
    orderBy: { createdAt: 'asc' },
  }),

  listExistingDispatchesByCampaignAndPatients: async ({
    clinicId,
    campaignId,
    patientIds = [],
    statuses = ['PENDING', 'PROCESSING', 'SENT'],
  }) => {
    const normalizedPatientIds = Array.from(new Set(
      (Array.isArray(patientIds) ? patientIds : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    ));
    if (!normalizedPatientIds.length) return [];

    return prisma.campaignDispatch.findMany({
      where: {
        clinicId: toRequiredString(clinicId, 'clinicId'),
        campaignId: toRequiredString(campaignId, 'campaignId'),
        patientId: { in: normalizedPatientIds },
        status: { in: (Array.isArray(statuses) ? statuses : []).map((value) => toRequiredString(value, 'status')) },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  findDispatchByIdAndClinic: async ({ clinicId, dispatchId }) => prisma.campaignDispatch.findFirst({
    where: {
      clinicId: toRequiredString(clinicId, 'clinicId'),
      id: toRequiredString(dispatchId, 'dispatchId'),
    },
  }),

  findDispatchByIdempotencyKey: async ({ clinicId, idempotencyKey }) => prisma.campaignDispatch.findFirst({
    where: {
      clinicId: toRequiredString(clinicId, 'clinicId'),
      idempotencyKey: toRequiredString(idempotencyKey, 'idempotencyKey'),
    },
  }),

  updateDispatch: async ({ clinicId, dispatchId, data }) => {
    await prisma.campaignDispatch.updateMany({
      where: {
        clinicId: toRequiredString(clinicId, 'clinicId'),
        id: toRequiredString(dispatchId, 'dispatchId'),
      },
      data,
    });
    return campaignRepository.findDispatchByIdAndClinic({ clinicId, dispatchId });
  },

  updateBatch: async ({ clinicId, batchId, data }) => {
    await prisma.campaignBatch.updateMany({
      where: {
        clinicId: toRequiredString(clinicId, 'clinicId'),
        id: toRequiredString(batchId, 'batchId'),
      },
      data,
    });
    return campaignRepository.findBatchByIdAndClinic({ clinicId, batchId });
  },

  listDispatchesByClinic: async ({
    clinicId,
    campaignId,
    status,
    sourceType,
    originType,
    eventType,
    entityType,
    entityId,
    dateFrom,
    dateTo,
    page = 1,
    limit = 50,
  }) => {
    const where = {
      clinicId: toRequiredString(clinicId, 'clinicId'),
      campaignId: campaignId ? toRequiredString(campaignId, 'campaignId') : undefined,
      status: status ? toRequiredString(status, 'status') : undefined,
      sourceType: sourceType ? toRequiredString(sourceType, 'sourceType') : undefined,
      originType: originType ? toRequiredString(originType, 'originType') : undefined,
      eventType: eventType ? toRequiredString(eventType, 'eventType') : undefined,
      entityType: entityType ? toRequiredString(entityType, 'entityType') : undefined,
      entityId: entityId ? toRequiredString(entityId, 'entityId') : undefined,
      createdAt: undefined,
    };

    const fromDate = dateFrom ? toOptionalDate(dateFrom) : null;
    const toDate = dateTo ? toOptionalDate(dateTo) : null;
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = fromDate;
      if (toDate) where.createdAt.lte = toDate;
    }

    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const safePage = Math.max(1, Number(page) || 1);
    const skip = (safePage - 1) * safeLimit;

    const [items, total] = await prisma.$transaction([
      prisma.campaignDispatch.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
      }),
      prisma.campaignDispatch.count({ where }),
    ]);

    return {
      items,
      total,
      page: safePage,
      limit: safeLimit,
      hasMore: skip + safeLimit < total,
    };
  },

  listRecentDispatchesByClinic: async ({ clinicId, from, to, sourceType, originType, eventType, entityType, entityId }) => {
    const where = {
      clinicId: toRequiredString(clinicId, 'clinicId'),
      sourceType: sourceType ? toRequiredString(sourceType, 'sourceType') : undefined,
      originType: originType ? toRequiredString(originType, 'originType') : undefined,
      eventType: eventType ? toRequiredString(eventType, 'eventType') : undefined,
      entityType: entityType ? toRequiredString(entityType, 'entityType') : undefined,
      entityId: entityId ? toRequiredString(entityId, 'entityId') : undefined,
    };
    const fromDate = from ? toOptionalDate(from) : null;
    const toDate = to ? toOptionalDate(to) : null;
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = fromDate;
      if (toDate) where.createdAt.lte = toDate;
    }
    return prisma.campaignDispatch.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  },
};

module.exports = { campaignRepository };
