const { campaignService } = require('../services/campaignService');

const listCampaigns = async (req, res, next) => {
  try {
    const data = await campaignService.listCampaigns({
      clinicId: req?.auth?.clinicId,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const listTemplates = async (_req, res, next) => {
  try {
    const data = await campaignService.listTemplates();
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const getCampaignById = async (req, res, next) => {
  try {
    const data = await campaignService.getCampaignById({
      clinicId: req?.auth?.clinicId,
      campaignId: req?.params?.id,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const createCampaign = async (req, res, next) => {
  try {
    const data = await campaignService.createCampaign({
      clinicId: req?.auth?.clinicId,
      payload: req?.body || {},
      actorName: req?.auth?.userId || '',
    });
    return res.status(201).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const updateCampaign = async (req, res, next) => {
  try {
    const data = await campaignService.updateCampaign({
      clinicId: req?.auth?.clinicId,
      campaignId: req?.params?.id,
      changes: req?.body || {},
      actorName: req?.auth?.userId || '',
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const deleteCampaign = async (req, res, next) => {
  try {
    const data = await campaignService.deleteCampaign({
      clinicId: req?.auth?.clinicId,
      campaignId: req?.params?.id,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const replaceCampaigns = async (req, res, next) => {
  try {
    const data = await campaignService.replaceCampaigns({
      clinicId: req?.auth?.clinicId,
      campaigns: req?.body?.campaigns || [],
      actorName: req?.auth?.userId || '',
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const resolveAudience = async (req, res, next) => {
  try {
    const data = await campaignService.resolveAudiencePreview({
      clinicId: req?.auth?.clinicId,
      segmentKey: req?.body?.segmentKey,
      filters: req?.body?.filters || {},
      campaignId: req?.body?.campaignId || '',
      actorName: req?.auth?.userId || '',
      templateId: req?.body?.templateId || '',
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const createBatch = async (req, res, next) => {
  try {
    const data = await campaignService.createBatch({
      clinicId: req?.auth?.clinicId,
      campaignId: req?.params?.id,
      actorUserId: req?.auth?.userId || '',
      actorName: req?.auth?.userId || '',
      force: req?.body?.force === true,
      selectedPatientIds: req?.body?.selectedPatientIds || [],
      templateId: req?.body?.templateId || '',
    });
    return res.status(201).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const updateDispatch = async (req, res, next) => {
  try {
    const data = await campaignService.updateDispatchStatus({
      clinicId: req?.auth?.clinicId,
      dispatchId: req?.params?.dispatchId,
      status: req?.body?.status,
      provider: req?.body?.provider || '',
      providerMessageId: req?.body?.providerMessageId || '',
      errorMessage: req?.body?.errorMessage || '',
      metadata: req?.body?.metadata || null,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const listDispatchLogs = async (req, res, next) => {
  try {
    const data = await campaignService.listDispatchLogs({
      clinicId: req?.auth?.clinicId,
      campaignId: req?.query?.campaignId || '',
      status: req?.query?.status || '',
      dateFrom: req?.query?.dateFrom || '',
      dateTo: req?.query?.dateTo || '',
      page: req?.query?.page || 1,
      limit: req?.query?.limit || 50,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const getDashboard = async (req, res, next) => {
  try {
    const data = await campaignService.getDashboard({
      clinicId: req?.auth?.clinicId,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const getCampaignResult = async (req, res, next) => {
  try {
    const data = await campaignService.getCampaignResult({
      clinicId: req?.auth?.clinicId,
      campaignId: req?.params?.id,
      windowDays: req?.query?.windowDays || 7,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listTemplates,
  listCampaigns,
  getCampaignById,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  replaceCampaigns,
  resolveAudience,
  createBatch,
  updateDispatch,
  listDispatchLogs,
  getDashboard,
  getCampaignResult,
};
