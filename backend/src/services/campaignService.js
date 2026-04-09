const crypto = require('crypto');
const { AppError } = require('../errors/AppError');
const { campaignRepository } = require('../repositories/campaignRepository');
const { clinicRepository } = require('../repositories/clinicRepository');
const { patientRepository } = require('../repositories/patientRepository');
const { appointmentRepository } = require('../repositories/appointmentRepository');
const { financialRepository } = require('../repositories/financialRepository');
const { patientClinicalRepository } = require('../repositories/patientClinicalRepository');
const { messagingDispatchService } = require('./messagingDispatchService');
const { resolveAudiencePreviewData } = require('./campaignAudienceResolver');
const { listCampaignTemplatesCatalog, getCampaignTemplateById } = require('../../../shared/campaign-template-catalog');

const nowIso = () => new Date().toISOString();
const cleanText = (value) => String(value || '').trim();
const normalizePhone = (value) => String(value || '').replace(/\D/g, '');
const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

const toDate = (value) => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toDateOnly = (value) => {
  const parsed = toDate(value);
  return parsed ? parsed.toISOString().slice(0, 10) : '';
};

const toStartOfDay = (value) => {
  const raw = cleanText(value);
  if (!raw) return null;
  return toDate(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00.000Z` : raw);
};

const toEndOfDay = (value) => {
  const raw = cleanText(value);
  if (!raw) return null;
  return toDate(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T23:59:59.999Z` : raw);
};

const normalizeCampaignStatusToEnum = (value) => {
  const raw = cleanText(value).toLowerCase();
  if (raw === 'rascunho' || raw === 'draft') return 'DRAFT';
  if (raw === 'agendada' || raw === 'scheduled') return 'SCHEDULED';
  if (raw === 'pausada' || raw === 'paused') return 'PAUSED';
  if (raw === 'concluida' || raw === 'concluída' || raw === 'completed') return 'COMPLETED';
  if (raw === 'inativa' || raw === 'inactive') return 'INACTIVE';
  return 'ACTIVE';
};

const mapCampaignStatusToLegacy = (value) => {
  const raw = cleanText(value).toUpperCase();
  if (raw === 'DRAFT') return 'rascunho';
  if (raw === 'SCHEDULED') return 'agendada';
  if (raw === 'PAUSED') return 'pausada';
  if (raw === 'COMPLETED') return 'concluida';
  if (raw === 'INACTIVE') return 'inativa';
  return 'ativa';
};

const normalizeDispatchStatus = (value) => {
  const raw = cleanText(value).toUpperCase();
  if (raw === 'PROCESSING') return 'PROCESSING';
  if (raw === 'SENT') return 'SENT';
  if (raw === 'FAILED') return 'FAILED';
  if (raw === 'BLOCKED') return 'BLOCKED';
  return 'PENDING';
};

const normalizeChannel = (value) => {
  const raw = cleanText(value).toUpperCase();
  return raw === 'WHATSAPP' ? 'WHATSAPP' : 'WHATSAPP';
};

const normalizeSegmentKey = (value) => cleanText(value || 'all_active').toLowerCase() || 'all_active';
const SUPPORTED_SEGMENTS = new Set([
  'all_active',
  'patients_active',
  'messaging_consent',
  'inactive_90',
  'inactive_180',
  'never_cleaning',
  'birthday_month',
  'appointment_window',
  'by_dentist',
  'missed_followup',
  'with_plan',
  'financial_pending',
  'plan_overdue',
]);

const normalizeTemplateMetadata = (template = {}) => {
  if (!template || typeof template !== 'object') return null;
  const normalizedId = cleanText(template?.id);
  if (!normalizedId) return null;
  return {
    id: normalizedId,
    version: Number(template?.version || 1),
    title: cleanText(template?.title || template?.nome || 'Template') || 'Template',
    description: cleanText(template?.description || template?.descricao),
    objective: cleanText(template?.objective),
    category: cleanText(template?.category || 'RELATIONSHIP') || 'RELATIONSHIP',
    segmentType: normalizeSegmentKey(template?.segmentType || template?.segmentKey || template?.segmento || 'all_active'),
    segmentSuggestion: cleanText(template?.segmentSuggestion),
    priority: cleanText(template?.priority || 'MEDIUM') || 'MEDIUM',
    impact: cleanText(template?.impact || template?.estimatedConversionImpact || 'MEDIUM') || 'MEDIUM',
    color: cleanText(template?.color || template?.cor || '#2a9d8f') || '#2a9d8f',
    internalCta: cleanText(template?.internalCta || template?.cta),
    messageTemplate: cleanText(template?.messageTemplate || template?.baseMessage || template?.messages?.standard),
  };
};

const normalizeCampaignMetadata = (payload = {}) => {
  const baseMetadata = payload?.metadata && typeof payload.metadata === 'object'
    ? { ...payload.metadata }
    : {};
  const templateMetadata = normalizeTemplateMetadata({
    ...(baseMetadata?.template && typeof baseMetadata.template === 'object' ? baseMetadata.template : {}),
    id: payload?.templateId || baseMetadata?.template?.id,
    version: payload?.templateVersion || baseMetadata?.template?.version,
    title: payload?.templateTitle || baseMetadata?.template?.title,
    description: payload?.templateDescription || baseMetadata?.template?.description,
    objective: payload?.templateObjective || baseMetadata?.template?.objective,
    category: payload?.templateCategory || baseMetadata?.template?.category,
    segmentType: payload?.segmentType || payload?.segmentKey || baseMetadata?.template?.segmentType,
    segmentSuggestion: payload?.segmentSuggestion || baseMetadata?.template?.segmentSuggestion,
    priority: payload?.templatePriority || baseMetadata?.template?.priority,
    impact: payload?.estimatedConversionImpact || payload?.templateImpact || baseMetadata?.template?.impact,
    color: payload?.cor || payload?.color || baseMetadata?.template?.color,
    internalCta: payload?.internalCta || payload?.cta || baseMetadata?.template?.internalCta,
    messageTemplate: payload?.messageTemplate || payload?.baseMessage || baseMetadata?.template?.messageTemplate,
  });

  if (templateMetadata) {
    baseMetadata.template = templateMetadata;
  }

  return Object.keys(baseMetadata).length ? baseMetadata : null;
};

const getCampaignTemplateMetadata = (campaign = {}) => (
  campaign?.metadata && typeof campaign.metadata === 'object' && campaign.metadata.template && typeof campaign.metadata.template === 'object'
    ? normalizeTemplateMetadata(campaign.metadata.template)
    : null
);

const buildCampaignId = () => `camp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeCampaignInput = (payload = {}, clinicId, actorName = '') => {
  const now = nowIso();
  return {
    id: cleanText(payload?.id || buildCampaignId()),
    clinicId: cleanText(clinicId),
    name: cleanText(payload?.nome || payload?.titulo || payload?.name || 'Campanha') || 'Campanha',
    description: cleanText(payload?.descricao || payload?.description || ''),
    period: cleanText(payload?.periodo || payload?.period || ''),
    color: cleanText(payload?.cor || payload?.color || '#2a9d8f') || '#2a9d8f',
    startAt: toStartOfDay(payload?.inicio || payload?.startAt),
    endAt: toEndOfDay(payload?.fim || payload?.endAt),
    channel: normalizeChannel(payload?.canal || payload?.channel),
    status: normalizeCampaignStatusToEnum(payload?.status),
    audienceSegmentKey: normalizeSegmentKey(payload?.segmentKey || payload?.segmento || 'all_active'),
    audienceFilters: payload?.audienceFilters && typeof payload.audienceFilters === 'object'
      ? payload.audienceFilters
      : (payload?.filters && typeof payload.filters === 'object' ? payload.filters : null),
    sourceType: cleanText(payload?.sourceType || 'CAMPAIGN'),
    originType: cleanText(payload?.originType || 'MANUAL'),
    eventType: cleanText(payload?.eventType || 'CAMPAIGN_MANUAL_DISPATCH') || null,
    entityType: cleanText(payload?.entityType || 'CAMPAIGN') || null,
    entityId: cleanText(payload?.entityId || payload?.id || '') || null,
    metadata: normalizeCampaignMetadata(payload),
    createdByUserId: cleanText(payload?.createdByUserId || payload?.criadoPor || '') || null,
    createdByName: cleanText(payload?.createdByName || actorName || '') || null,
    createdAt: toDate(payload?.dataCriacao || payload?.createdAt) || new Date(now),
    updatedAt: toDate(payload?.dataAtualizacao || payload?.updatedAt) || new Date(now),
  };
};

const mapCampaignToLegacy = (row = {}) => {
  const template = getCampaignTemplateMetadata(row);
  return {
    id: cleanText(row?.id),
    clinicId: cleanText(row?.clinicId),
    nome: cleanText(row?.name || 'Campanha') || 'Campanha',
    titulo: cleanText(row?.name || 'Campanha') || 'Campanha',
    periodo: cleanText(row?.period),
    cor: cleanText(row?.color || '#2a9d8f') || '#2a9d8f',
    descricao: cleanText(row?.description),
    inicio: toDateOnly(row?.startAt),
    fim: toDateOnly(row?.endAt),
    canal: row?.channel === 'WHATSAPP' ? 'WhatsApp' : cleanText(row?.channel || 'WhatsApp') || 'WhatsApp',
    status: mapCampaignStatusToLegacy(row?.status),
    origem: 'clinica',
    somenteLeitura: false,
    publico: 'pacientes_clinica',
    publicoLabel: 'Pacientes da clinica',
    segmentKey: normalizeSegmentKey(row?.audienceSegmentKey || template?.segmentType || 'all_active'),
    templateId: cleanText(template?.id),
    templateTitle: cleanText(template?.title),
    templateCategory: cleanText(template?.category),
    templateObjective: cleanText(template?.objective),
    templatePriority: cleanText(template?.priority),
    templateImpact: cleanText(template?.impact),
    templateCta: cleanText(template?.internalCta),
    templateMessage: cleanText(template?.messageTemplate),
    metadata: row?.metadata && typeof row.metadata === 'object' ? row.metadata : null,
    criadoPor: cleanText(row?.createdByUserId || row?.createdByName),
    dataCriacao: row?.createdAt ? new Date(row.createdAt).toISOString() : '',
    dataAtualizacao: row?.updatedAt ? new Date(row.updatedAt).toISOString() : '',
  };
};

const summarizeReasons = (members = []) => {
  const counts = new Map();
  members.forEach((item) => {
    const key = cleanText(item?.reasonCode || item?.status || 'UNKNOWN') || 'UNKNOWN';
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return Array.from(counts.entries()).map(([reasonCode, total]) => ({ reasonCode, total }));
};

const renderCampaignBody = ({ campaign, patientName, clinicName }) => {
  const normalizedPatientName = cleanText(patientName || 'paciente') || 'paciente';
  const normalizedClinicName = cleanText(clinicName || 'Voithos') || 'Voithos';
  const rawTemplate = cleanText(campaign?.description);
  const fallback = `Ola, ${normalizedPatientName}. ${cleanText(campaign?.name || 'Campanha')}: ${cleanText(campaign?.description || '')}`.trim();
  return (rawTemplate || fallback)
    .replace(/\{NOME_PACIENTE\}/g, normalizedPatientName)
    .replace(/\{NOME_CLINICA\}/g, normalizedClinicName)
    .trim();
};

const redactCampaignBody = (body, patientName) => {
  const normalizedBody = cleanText(body);
  if (!normalizedBody) return '';
  const safeName = cleanText(patientName);
  const withoutName = safeName
    ? normalizedBody.replace(new RegExp(safeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '[PACIENTE]')
    : normalizedBody;
  return withoutName.slice(0, 160);
};

const buildIdempotencyLogicalKey = ({ campaignId, patientId, channel = 'WHATSAPP', dispatchType = 'CAMPAIGN' }) =>
  [cleanText(campaignId), cleanText(patientId), cleanText(channel), cleanText(dispatchType)].join(':');

const mapBatchToResponse = (batch = {}, dispatches = []) => ({
  batchId: cleanText(batch?.id),
  sendBatchId: cleanText(batch?.id),
  clinicId: cleanText(batch?.clinicId),
  campaignId: cleanText(batch?.campaignId),
  audienceSnapshotId: cleanText(batch?.audienceSnapshotId),
  createdAt: batch?.createdAt ? new Date(batch.createdAt).toISOString() : '',
  updatedAt: batch?.updatedAt ? new Date(batch.updatedAt).toISOString() : '',
  segmentKey: cleanText(batch?.metadata?.segmentKey || ''),
  audienceCount: Number(batch?.totalRecipients || 0),
  sentCount: Number(batch?.successCount || 0),
  failedCount: Number(batch?.failedCount || 0),
  blockedCount: Number(batch?.blockedCount || 0),
  pendingCount: Number(batch?.pendingCount || 0),
  status: cleanText(batch?.status),
  dispatches: (Array.isArray(dispatches) ? dispatches : []).map((dispatch) => ({
    dispatchId: cleanText(dispatch?.id),
    patientId: cleanText(dispatch?.patientId),
    patientName: cleanText(dispatch?.patientName),
    phone: cleanText(dispatch?.phone),
    body: cleanText(dispatch?.body),
    status: cleanText(dispatch?.status),
    sendBatchId: cleanText(dispatch?.batchId),
    batchId: cleanText(dispatch?.batchId),
    campaignId: cleanText(dispatch?.campaignId),
    errorMessage: cleanText(dispatch?.lastError),
  })),
});

const normalizeLegacyCampaigns = (campaigns = [], clinicId = '') => {
  const normalizedClinicId = cleanText(clinicId);
  return (Array.isArray(campaigns) ? campaigns : [])
    .filter((item) => item && typeof item === 'object')
    .map((item) => normalizeCampaignInput(item, normalizedClinicId))
    .map((item) => ({
      ...item,
      entityId: cleanText(item?.entityId || item?.id) || null,
    }));
};

const resolveTemplateContext = ({ templateId = '', segmentKey = '' } = {}) => {
  const template = cleanText(templateId) ? getCampaignTemplateById(templateId) : null;
  const resolvedSegmentKey = normalizeSegmentKey(template?.segmentType || segmentKey || 'all_active');
  return {
    template,
    templateId: cleanText(template?.id || templateId),
    templateTitle: cleanText(template?.title),
    segmentKey: resolvedSegmentKey,
  };
};

const loadAudienceDatasets = async ({ clinicId, segmentKey, filters = {} }) => {
  const normalizedClinicId = cleanText(clinicId);
  const normalizedSegmentKey = normalizeSegmentKey(segmentKey);
  const needsFinancial = ['financial_pending', 'plan_overdue'].includes(normalizedSegmentKey);
  const needsPlans = normalizedSegmentKey === 'with_plan';
  const appointmentsTo = filters?.dateTo || filters?.to || null;
  const appointmentsFrom = normalizedSegmentKey === 'appointment_window' || normalizedSegmentKey === 'by_dentist'
    ? (filters?.dateFrom || filters?.from || null)
    : null;

  const [patients, appointments, procedures, accounts, plans] = await Promise.all([
    patientRepository.listAudienceBaseByClinic(normalizedClinicId),
    appointmentRepository.listAudienceBaseByClinic({ clinicId: normalizedClinicId, from: appointmentsFrom, to: appointmentsTo }),
    patientClinicalRepository.listProcedureAudienceBaseByClinic({ clinicId: normalizedClinicId }),
    needsFinancial ? financialRepository.listFinancialAccountsAudienceBaseByClinic({ clinicId: normalizedClinicId }) : Promise.resolve([]),
    needsPlans ? financialRepository.listPatientPlansByClinic({ clinicId: normalizedClinicId }) : Promise.resolve([]),
  ]);

  return {
    patients,
    appointments,
    procedures,
    accounts,
    plans,
  };
};

const campaignService = {};

campaignService.listTemplates = async () => listCampaignTemplatesCatalog();

campaignService.ensureLegacyCampaignsMigrated = async ({ clinicId }) => {
  const normalizedClinicId = cleanText(clinicId);
  if (!normalizedClinicId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
  }
  const existingCount = await campaignRepository.countByClinic({ clinicId: normalizedClinicId });
  if (existingCount > 0) return;

  const clinic = await clinicRepository.findProfileById(normalizedClinicId);
  const legacyCampaigns = normalizeLegacyCampaigns(clinic?.operationalSettings?.campaigns, normalizedClinicId);
  if (!legacyCampaigns.length) return;

  await campaignRepository.createManyCampaigns(legacyCampaigns);
  console.info('[CAMPAIGN]', JSON.stringify({
    action: 'campaign_legacy_seeded',
    clinicId: normalizedClinicId,
    count: legacyCampaigns.length,
    campaign_source: 'central',
  }));
};

campaignService.listCampaigns = async ({ clinicId }) => {
  const normalizedClinicId = cleanText(clinicId);
  await campaignService.ensureLegacyCampaignsMigrated({ clinicId: normalizedClinicId });
  const campaigns = await campaignRepository.listCampaignsByClinic({ clinicId: normalizedClinicId });
  return campaigns.map(mapCampaignToLegacy);
};

campaignService.getCampaignById = async ({ clinicId, campaignId }) => {
  const normalizedClinicId = cleanText(clinicId);
  const normalizedCampaignId = cleanText(campaignId);
  await campaignService.ensureLegacyCampaignsMigrated({ clinicId: normalizedClinicId });
  const row = await campaignRepository.findCampaignByIdAndClinic({
    clinicId: normalizedClinicId,
    campaignId: normalizedCampaignId,
  });
  if (!row) throw new AppError(404, 'CAMPAIGN_NOT_FOUND', 'Campaign not found.');
  return mapCampaignToLegacy(row);
};

campaignService.replaceCampaigns = async ({ clinicId, campaigns = [], actorName = '' }) => {
  const normalizedClinicId = cleanText(clinicId);
  if (!normalizedClinicId) throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');

  await campaignService.ensureLegacyCampaignsMigrated({ clinicId: normalizedClinicId });
  const incoming = normalizeLegacyCampaigns(campaigns, normalizedClinicId).map((item) => ({
    ...item,
    createdByName: cleanText(item?.createdByName || actorName) || null,
  }));
  const existing = await campaignRepository.listCampaignsByClinic({ clinicId: normalizedClinicId });
  const existingMap = new Map(existing.map((item) => [cleanText(item.id), item]));

  for (const item of incoming) {
    if (existingMap.has(item.id)) {
      await campaignRepository.updateCampaign({
        clinicId: normalizedClinicId,
        campaignId: item.id,
        data: {
          name: item.name,
          description: item.description,
          period: item.period,
          color: item.color,
          startAt: item.startAt,
          endAt: item.endAt,
          channel: item.channel,
          status: item.status,
          audienceSegmentKey: item.audienceSegmentKey,
          audienceFilters: item.audienceFilters,
          sourceType: item.sourceType,
          originType: item.originType,
          eventType: item.eventType,
          entityType: item.entityType,
          entityId: item.entityId,
          metadata: item.metadata,
          createdByUserId: item.createdByUserId,
          createdByName: item.createdByName,
          deletedAt: null,
        },
      });
    } else {
      await campaignRepository.createCampaign(item);
    }
  }

  const incomingIds = new Set(incoming.map((item) => item.id));
  for (const current of existing) {
    if (!incomingIds.has(cleanText(current.id))) {
      await campaignRepository.softDeleteCampaign({
        clinicId: normalizedClinicId,
        campaignId: current.id,
      });
    }
  }

  console.info('[CAMPAIGN]', JSON.stringify({
    action: 'campaign_replace_completed',
    clinicId: normalizedClinicId,
    count: incoming.length,
    campaign_source: 'central',
  }));

  return campaignService.listCampaigns({ clinicId: normalizedClinicId });
};

campaignService.createCampaign = async ({ clinicId, payload = {}, actorName = '' }) => {
  const normalizedClinicId = cleanText(clinicId);
  if (!normalizedClinicId) throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');

  await campaignService.ensureLegacyCampaignsMigrated({ clinicId: normalizedClinicId });
  const normalized = normalizeCampaignInput(payload, normalizedClinicId, actorName);
  const created = await campaignRepository.createCampaign(normalized);

  console.info('[CAMPAIGN]', JSON.stringify({
    action: 'campaign_created',
    clinicId: normalizedClinicId,
    campaignId: created.id,
    segmentKey: cleanText(created.audienceSegmentKey),
    status: cleanText(created.status),
    campaign_source: 'central',
  }));

  return mapCampaignToLegacy(created);
};

campaignService.updateCampaign = async ({ clinicId, campaignId, changes = {}, actorName = '' }) => {
  const normalizedClinicId = cleanText(clinicId);
  const normalizedCampaignId = cleanText(campaignId);
  if (!normalizedClinicId || !normalizedCampaignId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'clinicId and campaignId are required.');
  }

  await campaignService.ensureLegacyCampaignsMigrated({ clinicId: normalizedClinicId });
  const existing = await campaignRepository.findCampaignByIdAndClinic({
    clinicId: normalizedClinicId,
    campaignId: normalizedCampaignId,
  });
  if (!existing) throw new AppError(404, 'CAMPAIGN_NOT_FOUND', 'Campaign not found.');

  const normalizedPatch = normalizeCampaignInput({
    ...mapCampaignToLegacy(existing),
    ...changes,
    id: existing.id,
  }, normalizedClinicId, actorName);

  const updated = await campaignRepository.updateCampaign({
    clinicId: normalizedClinicId,
    campaignId: normalizedCampaignId,
    data: {
      name: normalizedPatch.name,
      description: normalizedPatch.description,
      period: normalizedPatch.period,
      color: normalizedPatch.color,
      startAt: normalizedPatch.startAt,
      endAt: normalizedPatch.endAt,
      channel: normalizedPatch.channel,
      status: normalizedPatch.status,
      audienceSegmentKey: normalizedPatch.audienceSegmentKey,
      audienceFilters: normalizedPatch.audienceFilters,
      sourceType: normalizedPatch.sourceType,
      originType: normalizedPatch.originType,
      eventType: normalizedPatch.eventType,
      entityType: normalizedPatch.entityType,
      entityId: normalizedPatch.entityId,
      metadata: normalizedPatch.metadata,
      createdByName: normalizedPatch.createdByName,
    },
  });

  console.info('[CAMPAIGN]', JSON.stringify({
    action: 'campaign_updated',
    clinicId: normalizedClinicId,
    campaignId: normalizedCampaignId,
    status: cleanText(updated?.status),
    campaign_source: 'central',
  }));

  return mapCampaignToLegacy(updated);
};

campaignService.deleteCampaign = async ({ clinicId, campaignId }) => {
  const normalizedClinicId = cleanText(clinicId);
  const normalizedCampaignId = cleanText(campaignId);
  if (!normalizedClinicId || !normalizedCampaignId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'clinicId and campaignId are required.');
  }

  const existing = await campaignRepository.findCampaignByIdAndClinic({
    clinicId: normalizedClinicId,
    campaignId: normalizedCampaignId,
  });
  if (!existing) throw new AppError(404, 'CAMPAIGN_NOT_FOUND', 'Campaign not found.');

  await campaignRepository.softDeleteCampaign({
    clinicId: normalizedClinicId,
    campaignId: normalizedCampaignId,
  });

  console.info('[CAMPAIGN]', JSON.stringify({
    action: 'campaign_deleted',
    clinicId: normalizedClinicId,
    campaignId: normalizedCampaignId,
    campaign_source: 'central',
  }));

  return { success: true };
};

campaignService.resolveAudiencePreview = async ({ clinicId, segmentKey, filters = {}, campaignId = '', actorName = '', templateId = '' }) => {
  const normalizedClinicId = cleanText(clinicId);
  if (!normalizedClinicId) throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');

  const startedAt = Date.now();
  const templateContext = resolveTemplateContext({ templateId, segmentKey });
  const normalizedSegmentKey = templateContext.segmentKey;
  const normalizedTemplateId = cleanText(templateContext.templateId);
  if (cleanText(templateId) && !templateContext.template) {
    return {
      segmentKey: normalizedSegmentKey,
      templateId: cleanText(templateId),
      template: null,
      unavailable: true,
      reason: 'Template de campanha nao encontrado.',
      total: 0,
      includedCount: 0,
      blockedCount: 0,
      patientIds: [],
      members: [],
      summary: {
        blockedReasons: [],
        suggestionReasons: [],
        quickFilters: {
          all: 0,
          selected: 0,
          inactive: 0,
          missed: 0,
          withoutCleaning: 0,
          blocked: 0,
        },
      },
    };
  }
  if (!SUPPORTED_SEGMENTS.has(normalizedSegmentKey)) {
    return {
      segmentKey: normalizedSegmentKey,
      templateId: normalizedTemplateId,
      template: null,
      unavailable: true,
      reason: 'Segmento indisponivel.',
      total: 0,
      includedCount: 0,
      blockedCount: 0,
      patientIds: [],
      members: [],
      summary: {
        blockedReasons: [],
        suggestionReasons: [],
        quickFilters: {
          all: 0,
          selected: 0,
          inactive: 0,
          missed: 0,
          withoutCleaning: 0,
          blocked: 0,
        },
      },
    };
  }

  if (normalizedTemplateId) {
    console.info('[CAMPAIGN]', JSON.stringify({
      action: 'campaign_template_audience_requested',
      clinicId: normalizedClinicId,
      campaignId: cleanText(campaignId),
      templateId: normalizedTemplateId,
      segmentKey: normalizedSegmentKey,
      campaign_source: 'central',
    }));
  }

  const datasets = await loadAudienceDatasets({
    clinicId: normalizedClinicId,
    segmentKey: normalizedSegmentKey,
    filters,
  });

  if (!datasets.patients.length) {
    return {
      segmentKey: normalizedSegmentKey,
      templateId: normalizedTemplateId,
      template: templateContext.template ? listCampaignTemplatesCatalog().annualTemplates.find((item) => item.id === normalizedTemplateId) || null : null,
      unavailable: true,
      reason: 'Sem pacientes cadastrados.',
      total: 0,
      includedCount: 0,
      blockedCount: 0,
      patientIds: [],
      members: [],
      summary: {
        blockedReasons: [],
        suggestionReasons: [],
        quickFilters: {
          all: 0,
          selected: 0,
          inactive: 0,
          missed: 0,
          withoutCleaning: 0,
          blocked: 0,
        },
      },
    };
  }

  const preview = resolveAudiencePreviewData({
    ...datasets,
    segmentKey: normalizedSegmentKey,
    filters,
    actorName,
    campaignId,
    templateId: normalizedTemplateId,
    templateTitle: cleanText(templateContext.template?.title),
  });

  if (preview.total === 0) {
    return {
      segmentKey: normalizedSegmentKey,
      templateId: normalizedTemplateId,
      template: templateContext.template ? listCampaignTemplatesCatalog().annualTemplates.find((item) => item.id === normalizedTemplateId) || null : null,
      unavailable: true,
      reason: 'Nenhum paciente elegivel para a audiencia sugerida.',
      total: 0,
      includedCount: 0,
      blockedCount: 0,
      patientIds: [],
      members: [],
      summary: preview.summary,
    };
  }

  console.info('[CAMPAIGN]', JSON.stringify({
    action: 'campaign_audience_resolved',
    clinicId: normalizedClinicId,
    campaignId: cleanText(campaignId),
    segmentKey: normalizedSegmentKey,
    audienceSize: preview.total,
    includedCount: preview.includedCount,
    blockedCount: preview.blockedCount,
    resolutionMs: Date.now() - startedAt,
    campaign_source: 'central',
  }));

  if (normalizedTemplateId) {
    console.info('[CAMPAIGN]', JSON.stringify({
      action: 'campaign_template_audience_resolved',
      clinicId: normalizedClinicId,
      campaignId: cleanText(campaignId),
      templateId: normalizedTemplateId,
      suggestedAudienceSize: preview.total,
      includedCount: preview.includedCount,
      blockedCount: preview.blockedCount,
      resolutionMs: Date.now() - startedAt,
      campaign_source: 'central',
    }));
  }

  return {
    ...preview,
    templateId: normalizedTemplateId,
    template: templateContext.template ? listCampaignTemplatesCatalog().annualTemplates.find((item) => item.id === normalizedTemplateId) || null : null,
    resolutionMs: Date.now() - startedAt,
  };
};

campaignService.createBatch = async ({
  clinicId,
  campaignId,
  actorUserId = '',
  actorName = '',
  force = false,
  selectedPatientIds = [],
  templateId = '',
} = {}) => {
  const normalizedClinicId = cleanText(clinicId);
  const normalizedCampaignId = cleanText(campaignId);
  if (!normalizedClinicId || !normalizedCampaignId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'clinicId and campaignId are required.');
  }

  await campaignService.ensureLegacyCampaignsMigrated({ clinicId: normalizedClinicId });
  const campaign = await campaignRepository.findCampaignByIdAndClinic({
    clinicId: normalizedClinicId,
    campaignId: normalizedCampaignId,
  });
  if (!campaign) throw new AppError(404, 'CAMPAIGN_NOT_FOUND', 'Campaign not found.');
  const template = getCampaignTemplateMetadata(campaign) || getCampaignTemplateById(templateId);
  const normalizedTemplateId = cleanText(template?.id || templateId);
  const selectedIds = Array.from(new Set(
    (Array.isArray(selectedPatientIds) ? selectedPatientIds : [])
      .map((value) => cleanText(value))
      .filter(Boolean),
  ));

  if (!force && !selectedIds.length) {
    const reusable = await campaignRepository.findLatestReusableBatch({
      clinicId: normalizedClinicId,
      campaignId: normalizedCampaignId,
    });
    if (reusable) {
      const existingDispatches = await campaignRepository.listDispatchesByBatch({
        clinicId: normalizedClinicId,
        batchId: reusable.id,
      });
      return { ...mapBatchToResponse(reusable, existingDispatches), reused: true };
    }
  }

  const audience = await campaignService.resolveAudiencePreview({
    clinicId: normalizedClinicId,
    campaignId: normalizedCampaignId,
    segmentKey: campaign.audienceSegmentKey || template?.segmentType || 'all_active',
    filters: campaign.audienceFilters || {},
    actorName,
    templateId: normalizedTemplateId,
  });
  if (audience.unavailable) {
    throw new AppError(400, 'CAMPAIGN_AUDIENCE_UNAVAILABLE', audience.reason || 'Campaign audience unavailable.');
  }

  const finalAudienceMembers = selectedIds.length
    ? audience.members.filter((member) => selectedIds.includes(cleanText(member.patientId)))
    : audience.members;

  if (selectedIds.length && finalAudienceMembers.length !== selectedIds.length) {
    throw new AppError(400, 'CAMPAIGN_SELECTED_PATIENTS_INVALID', 'Selected patients are not part of the suggested audience.');
  }
  if (!finalAudienceMembers.length) {
    throw new AppError(400, 'CAMPAIGN_AUDIENCE_EMPTY', 'No patients selected for the campaign.');
  }

  const clinic = await clinicRepository.findProfileById(normalizedClinicId);
  const clinicName = cleanText(clinic?.nomeFantasia || clinic?.razaoSocial || 'Voithos');
  const existingDispatches = await campaignRepository.listExistingDispatchesByCampaignAndPatients({
    clinicId: normalizedClinicId,
    campaignId: normalizedCampaignId,
    patientIds: finalAudienceMembers.map((member) => member.patientId),
  });
  const existingLogicalKeys = new Set(existingDispatches.map((item) => buildIdempotencyLogicalKey(item)));

  const snapshotId = crypto.randomUUID();
  const members = finalAudienceMembers.map((member) => {
    const logicalKey = buildIdempotencyLogicalKey({
      campaignId: normalizedCampaignId,
      patientId: member.patientId,
      channel: 'WHATSAPP',
      dispatchType: 'CAMPAIGN',
    });
    const duplicateBlocked = existingLogicalKeys.has(logicalKey);
    return {
      id: crypto.randomUUID(),
      clinicId: normalizedClinicId,
      snapshotId,
      patientId: member.patientId,
      patientName: member.patientName,
      phone: member.phone,
      allowsMessages: member.allowsMessages,
      included: member.included && !duplicateBlocked,
      status: member.included && !duplicateBlocked ? 'INCLUDED' : 'BLOCKED',
      reasonCode: duplicateBlocked ? 'IDEMPOTENT_ALREADY_DISPATCHED' : member.reasonCode,
      reasonLabel: duplicateBlocked
        ? 'Paciente ja possui envio ativo ou concluido para esta campanha.'
        : member.reasonLabel,
      metadata: {
        ...(member.metadata || {}),
        logicalKey,
        suggestionReasonCode: cleanText(member.suggestionReasonCode),
        suggestionReasonLabel: cleanText(member.suggestionReasonLabel),
        templateId: normalizedTemplateId,
      },
    };
  });

  const includedCount = members.filter((item) => item.included).length;
  const blockedCount = members.length - includedCount;
  const { snapshot, members: createdMembers } = await campaignRepository.createAudienceSnapshotWithMembers({
    snapshot: {
      id: snapshotId,
      clinicId: normalizedClinicId,
      campaignId: normalizedCampaignId,
      segmentKey: normalizeSegmentKey(campaign.audienceSegmentKey || 'all_active'),
      filters: campaign.audienceFilters || {},
      totalRecipients: members.length,
      includedRecipients: includedCount,
      blockedRecipients: blockedCount,
      source: 'central',
      summary: {
        templateId: normalizedTemplateId || null,
        suggestedAudienceSize: Number(audience.total || members.length),
        finalAudienceSize: members.length,
        blockedReasons: summarizeReasons(members.filter((item) => !item.included)),
      },
      createdByUserId: cleanText(actorUserId) || null,
      createdByName: cleanText(actorName) || null,
    },
    members,
  });

  const memberMap = new Map(createdMembers.map((item) => [cleanText(item.patientId), item]));
  const batchId = crypto.randomUUID();
  const now = new Date();
  const dispatches = members.map((member) => {
    const createdMember = memberMap.get(member.patientId);
    const body = renderCampaignBody({ campaign, patientName: member.patientName, clinicName });
    const isBlocked = member.included !== true;
    return {
      id: crypto.randomUUID(),
      clinicId: normalizedClinicId,
      campaignId: normalizedCampaignId,
      batchId,
      audienceSnapshotId: snapshot.id,
      audienceMemberId: createdMember.id,
      channel: 'WHATSAPP',
      status: isBlocked ? 'BLOCKED' : 'PENDING',
      dispatchType: 'CAMPAIGN',
      sourceType: cleanText(campaign.sourceType || 'CAMPAIGN'),
      originType: cleanText(campaign.originType || 'MANUAL'),
      eventType: cleanText(campaign.eventType || 'CAMPAIGN_MANUAL_DISPATCH') || null,
      entityType: cleanText(campaign.entityType || 'CAMPAIGN') || null,
      entityId: cleanText(campaign.entityId || normalizedCampaignId) || null,
      patientId: member.patientId,
      patientName: member.patientName,
      phone: member.phone,
      body,
      bodyRedacted: redactCampaignBody(body, member.patientName),
      idempotencyKey: `${batchId}:${member.patientId}:WHATSAPP:CAMPAIGN`,
      attemptCount: 0,
      blockedAt: isBlocked ? now : null,
      lastError: isBlocked ? cleanText(member.reasonLabel || 'Dispatch blocked.') : null,
      metadata: {
        logicalKey: member.metadata?.logicalKey || buildIdempotencyLogicalKey({
          campaignId: normalizedCampaignId,
          patientId: member.patientId,
          channel: 'WHATSAPP',
          dispatchType: 'CAMPAIGN',
        }),
        reasonCode: cleanText(member.reasonCode),
        reasonLabel: cleanText(member.reasonLabel),
        suggestionReasonCode: cleanText(member.metadata?.suggestionReasonCode || member.suggestionReasonCode),
        suggestionReasonLabel: cleanText(member.metadata?.suggestionReasonLabel || member.suggestionReasonLabel),
        templateId: normalizedTemplateId || null,
      },
    };
  });

  const pendingCount = dispatches.filter((item) => item.status === 'PENDING').length;
  const batchStatus = pendingCount > 0 ? 'CREATED' : (blockedCount > 0 ? 'BLOCKED' : 'COMPLETED');

  const { batch, dispatches: createdDispatches } = await campaignRepository.createBatchWithDispatches({
    batch: {
      id: batchId,
      clinicId: normalizedClinicId,
      campaignId: normalizedCampaignId,
      audienceSnapshotId: snapshot.id,
      channel: 'WHATSAPP',
      status: batchStatus,
      sourceType: cleanText(campaign.sourceType || 'CAMPAIGN'),
      originType: cleanText(campaign.originType || 'MANUAL'),
      eventType: cleanText(campaign.eventType || 'CAMPAIGN_MANUAL_DISPATCH') || null,
      entityType: cleanText(campaign.entityType || 'CAMPAIGN') || null,
      entityId: cleanText(campaign.entityId || normalizedCampaignId) || null,
      totalRecipients: dispatches.length,
      processedCount: blockedCount,
      successCount: 0,
      failedCount: 0,
      blockedCount,
      pendingCount,
      startedAt: pendingCount > 0 ? now : null,
      completedAt: pendingCount === 0 ? now : null,
      createdByUserId: cleanText(actorUserId) || null,
      createdByName: cleanText(actorName) || null,
      metadata: {
        segmentKey: normalizeSegmentKey(campaign.audienceSegmentKey || 'all_active'),
        templateId: normalizedTemplateId || null,
        suggestedAudienceSize: Number(audience.total || dispatches.length),
        finalAudienceSize: dispatches.length,
      },
    },
    dispatches,
  });

  console.info('[CAMPAIGN]', JSON.stringify({
    action: 'campaign_batch_created',
    clinicId: normalizedClinicId,
    campaignId: normalizedCampaignId,
    batchId: batch.id,
    audienceSize: dispatches.length,
    blockedCount,
    pendingCount,
    status: batch.status,
    templateId: normalizedTemplateId || undefined,
    campaign_source: 'central',
  }));

  console.info('[CAMPAIGN]', JSON.stringify({
    action: 'campaign_dispatch_started',
    clinicId: normalizedClinicId,
    campaignId: normalizedCampaignId,
    batchId: batch.id,
    audienceSize: dispatches.length,
    pendingCount,
    templateId: normalizedTemplateId || undefined,
    campaign_source: 'central',
  }));

  if (normalizedTemplateId) {
    console.info('[CAMPAIGN]', JSON.stringify({
      action: 'campaign_template_send_started',
      clinicId: normalizedClinicId,
      templateId: normalizedTemplateId,
      campaignId: normalizedCampaignId,
      batchId: batch.id,
      suggestedAudienceSize: Number(audience.total || dispatches.length),
      finalAudienceSize: dispatches.length,
      blockedCount,
      campaign_source: 'central',
    }));
  }

  return mapBatchToResponse(batch, createdDispatches);
};

campaignService.refreshBatchStats = async ({ clinicId, batchId }) => messagingDispatchService.refreshBatchStats({ clinicId, batchId });

campaignService.updateDispatchStatus = async ({
  clinicId,
  dispatchId,
  status,
  provider = '',
  providerMessageId = '',
  errorMessage = '',
  metadata = null,
} = {}) => {
  return messagingDispatchService.updateDispatchStatus({
    clinicId,
    dispatchId,
    status,
    provider,
    providerMessageId,
    errorMessage,
    metadata,
    logPrefix: 'campaign',
    logNamespace: 'CAMPAIGN',
  });
};

campaignService.listDispatchLogs = async ({ clinicId, campaignId, status, dateFrom, dateTo, page = 1, limit = 50 } = {}) => {
  const normalizedClinicId = cleanText(clinicId);
  const result = await campaignRepository.listDispatchesByClinic({
    clinicId: normalizedClinicId,
    campaignId: cleanText(campaignId) || undefined,
    sourceType: 'CAMPAIGN',
    status: cleanText(status) ? normalizeDispatchStatus(status) : undefined,
    dateFrom: toStartOfDay(dateFrom),
    dateTo: toEndOfDay(dateTo),
    page,
    limit,
  });

  const campaigns = await campaignRepository.listCampaignsByClinic({ clinicId: normalizedClinicId });
  const campaignMap = new Map(campaigns.map((item) => [cleanText(item.id), item]));

  return {
    ...result,
    items: (result.items || []).map((item) => ({
      logId: cleanText(item.id),
      dispatchId: cleanText(item.id),
      campaignId: cleanText(item.campaignId),
      campaignName: cleanText(campaignMap.get(cleanText(item.campaignId))?.name || 'Campanha') || 'Campanha',
      patientId: cleanText(item.patientId),
      patientName: cleanText(item.patientName || '--') || '--',
      sendBatchId: cleanText(item.batchId),
      channel: cleanText(item.channel),
      status: cleanText(item.status),
      createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : '',
      errorMessage: cleanText(item.lastError),
      provider: cleanText(item.provider),
    })),
  };
};

campaignService.getDashboard = async ({ clinicId }) => {
  const normalizedClinicId = cleanText(clinicId);
  await campaignService.ensureLegacyCampaignsMigrated({ clinicId: normalizedClinicId });
  const campaigns = await campaignRepository.listCampaignsByClinic({ clinicId: normalizedClinicId });

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const dispatchesToday = await campaignRepository.listRecentDispatchesByClinic({
    clinicId: normalizedClinicId,
    from: startOfToday,
    to: endOfToday,
    sourceType: 'CAMPAIGN',
  });

  const sentToday = dispatchesToday.filter((item) => cleanText(item.status).toUpperCase() === 'SENT').length;
  const failedToday = dispatchesToday.filter((item) => cleanText(item.status).toUpperCase() === 'FAILED').length;
  const attempts = sentToday + failedToday;
  const deliveryRateToday = attempts > 0 ? sentToday / attempts : null;

  const nextEligible = campaigns
    .filter((item) => ['ACTIVE', 'SCHEDULED'].includes(cleanText(item.status).toUpperCase()))
    .filter((item) => toDate(item.startAt))
    .filter((item) => toDate(item.startAt).getTime() > Date.now())
    .sort((a, b) => toDate(a.startAt).getTime() - toDate(b.startAt).getTime())[0] || null;

  const lastSent = dispatchesToday
    .filter((item) => cleanText(item.status).toUpperCase() === 'SENT')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] || null;

  return {
    sentToday,
    failedToday,
    deliveryRateToday,
    responseRate: null,
    nextEligibleSend: nextEligible ? {
      id: cleanText(nextEligible.id),
      nome: cleanText(nextEligible.name || 'Campanha') || 'Campanha',
      inicio: toDateOnly(nextEligible.startAt),
      status: mapCampaignStatusToLegacy(nextEligible.status),
      canal: nextEligible.channel === 'WHATSAPP' ? 'WhatsApp' : cleanText(nextEligible.channel),
    } : null,
    activeCampaigns: campaigns.filter((item) => ['ACTIVE', 'SCHEDULED'].includes(cleanText(item.status).toUpperCase())).length,
    lastSendAt: lastSent?.createdAt ? new Date(lastSent.createdAt).toISOString() : null,
    updatedAt: nowIso(),
  };
};

campaignService.getCampaignResult = async ({ clinicId, campaignId, windowDays = 7 } = {}) => {
  const normalizedClinicId = cleanText(clinicId);
  const normalizedCampaignId = cleanText(campaignId);
  if (!normalizedClinicId || !normalizedCampaignId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'clinicId and campaignId are required.');
  }

  const [batches, appointments, accounts] = await Promise.all([
    campaignRepository.listBatchesByCampaign({ clinicId: normalizedClinicId, campaignId: normalizedCampaignId, limit: 50 }),
    appointmentRepository.listByClinic({ clinicId: normalizedClinicId }),
    financialRepository.listFinancialAccountsAudienceBaseByClinic({ clinicId: normalizedClinicId }),
  ]);

  if (!batches.length) {
    return {
      campaignId: normalizedCampaignId,
      windowDays: Math.max(1, Number(windowDays) || 7),
      windowStart: null,
      windowEnd: null,
      recipients: 0,
      conversions7d: 0,
      revenue7d: null,
      lastDispatch: null,
      monthlyConversions7d: 0,
      monthlyRevenue7d: null,
    };
  }

  const safeWindowDays = Math.max(1, Number(windowDays) || 7);
  const evaluateBatch = async (batch) => {
    const batchDispatches = await campaignRepository.listDispatchesByBatch({
      clinicId: normalizedClinicId,
      batchId: batch.id,
    });
    const batchCreatedAt = toDate(batch.createdAt);
    const windowEnd = new Date(batchCreatedAt.getTime() + (safeWindowDays * 24 * 60 * 60 * 1000));
    const sentPatientIds = Array.from(new Set(batchDispatches
      .filter((item) => cleanText(item.status).toUpperCase() === 'SENT')
      .map((item) => cleanText(item.patientId))
      .filter(Boolean)));

    const conversions = appointments.filter((appointment) => {
      const patientId = cleanText(appointment?.patientId);
      const createdAt = toDate(appointment?.createdAt || appointment?.dataHora);
      return patientId && sentPatientIds.includes(patientId) && createdAt && createdAt > batchCreatedAt && createdAt <= windowEnd;
    });
    const uniqueAppointmentIds = new Set(conversions.map((item) => cleanText(item.id)).filter(Boolean));

    let revenue = 0;
    accounts.forEach((account) => {
      const patientId = cleanText(account?.patientId);
      if (!patientId || !sentPatientIds.includes(patientId)) return;
      (Array.isArray(account?.transactions) ? account.transactions : []).forEach((transaction) => {
        const createdAt = toDate(transaction?.createdAt);
        if (!createdAt || createdAt <= batchCreatedAt || createdAt > windowEnd) return;
        if (cleanText(transaction?.type).toUpperCase() !== 'PAYMENT') return;
        revenue += Number(transaction?.amount || 0);
      });
    });

    return {
      recipients: sentPatientIds.length,
      conversions7d: uniqueAppointmentIds.size,
      revenue7d: revenue > 0 ? roundMoney(revenue) : null,
    };
  };

  const lastBatch = batches[0];
  const lastEval = await evaluateBatch(lastBatch);
  const monthKey = new Date().toISOString().slice(0, 7);
  const monthBatches = batches.filter((item) => String(item?.createdAt || '').slice(0, 7) === monthKey);

  let monthlyConversions7d = 0;
  let monthlyRevenueRaw = 0;
  let monthlyHasRevenue = false;
  for (const batch of monthBatches) {
    const data = await evaluateBatch(batch);
    monthlyConversions7d += data.conversions7d;
    if (data.revenue7d != null) {
      monthlyHasRevenue = true;
      monthlyRevenueRaw += Number(data.revenue7d) || 0;
    }
  }

  console.info('[CAMPAIGN]', JSON.stringify({
    action: 'campaign_analytics_loaded',
    clinicId: normalizedClinicId,
    campaignId: normalizedCampaignId,
    batchId: cleanText(lastBatch.id),
    audienceSize: Number(lastBatch.totalRecipients || 0),
    status: cleanText(lastBatch.status),
    campaign_source: 'central',
  }));

  return {
    campaignId: normalizedCampaignId,
    windowDays: safeWindowDays,
    windowStart: lastBatch?.createdAt ? new Date(lastBatch.createdAt).toISOString() : null,
    windowEnd: lastBatch?.createdAt ? new Date(new Date(lastBatch.createdAt).getTime() + (safeWindowDays * 24 * 60 * 60 * 1000)).toISOString() : null,
    recipients: lastEval.recipients,
    conversions7d: lastEval.conversions7d,
    revenue7d: lastEval.revenue7d,
    lastDispatch: {
      sendBatchId: cleanText(lastBatch.id),
      createdAt: lastBatch?.createdAt ? new Date(lastBatch.createdAt).toISOString() : null,
      segmentKey: cleanText(lastBatch?.metadata?.segmentKey || ''),
      audienceCount: Number(lastBatch?.totalRecipients || 0),
      sentCount: Number(lastBatch?.successCount || 0),
      failedCount: Number(lastBatch?.failedCount || 0),
    },
    monthlyConversions7d,
    monthlyRevenue7d: monthlyHasRevenue ? roundMoney(monthlyRevenueRaw) : null,
  };
};

module.exports = { campaignService, mapCampaignToLegacy, normalizeSegmentKey, normalizeDispatchStatus };
