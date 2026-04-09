const { clinicService } = require('../services/clinicService');
const { campaignService } = require('../services/campaignService');

const listClinics = async (_req, res, next) => {
  try {
    const clinics = await clinicService.list();
    return res.status(200).json({
      ok: true,
      data: clinics,
    });
  } catch (error) {
    return next(error);
  }
};

const getMyOperationalSettings = async (req, res, next) => {
  try {
    const data = await clinicService.getOperationalSettings({
      clinicId: req?.auth?.clinicId,
    });
    return res.status(200).json({
      ok: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

const updateMyOperationalSettings = async (req, res, next) => {
  try {
    const data = await clinicService.updateOperationalSettings({
      clinicId: req?.auth?.clinicId,
      patch: req?.body || {},
    });
    return res.status(200).json({
      ok: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

const getMyClinicProfile = async (req, res, next) => {
  try {
    const data = await clinicService.getProfile({
      clinicId: req?.auth?.clinicId,
    });
    return res.status(200).json({
      ok: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

const updateMyClinicProfile = async (req, res, next) => {
  try {
    const data = await clinicService.updateProfile({
      clinicId: req?.auth?.clinicId,
      patch: req?.body || {},
    });
    return res.status(200).json({
      ok: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

const listMyCampaigns = async (req, res, next) => {
  try {
    const data = await campaignService.listCampaigns({
      clinicId: req?.auth?.clinicId,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const replaceMyCampaigns = async (req, res, next) => {
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

const createMyCampaign = async (req, res, next) => {
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

const updateMyCampaign = async (req, res, next) => {
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

const deleteMyCampaign = async (req, res, next) => {
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

module.exports = {
  listClinics,
  getMyOperationalSettings,
  updateMyOperationalSettings,
  getMyClinicProfile,
  updateMyClinicProfile,
  listMyCampaigns,
  replaceMyCampaigns,
  createMyCampaign,
  updateMyCampaign,
  deleteMyCampaign,
};
