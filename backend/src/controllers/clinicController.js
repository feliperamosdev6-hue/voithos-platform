const { clinicService } = require('../services/clinicService');
const { campaignService } = require('../services/campaignService');
const { laboratoryService } = require('../services/laboratoryService');
const { outboundMessageService } = require('../services/outboundMessageService');
const { whatsappNgClient } = require('../adapters/whatsappNgClient');
const { AppError } = require('../errors/AppError');
const { isInternalServiceRequest, requireSuperAdmin } = require('../utils/accessControl');

const listClinics = async (req, res, next) => {
  try {
    if (!isInternalServiceRequest(req)) {
      if (!req?.auth) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      }
      requireSuperAdmin(req);
    }
    const clinics = await clinicService.list();
    return res.status(200).json({
      ok: true,
      data: clinics,
    });
  } catch (error) {
    return next(error);
  }
};

const createClinicBootstrap = async (req, res, next) => {
  try {
    requireSuperAdmin(req);
    const data = await clinicService.createWithAdmin(req.body || {});
    return res.status(201).json({
      ok: true,
      data,
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

const exportMyClinicData = async (req, res, next) => {
  try {
    const data = await clinicService.exportData({
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

const previewMyClinicImport = async (req, res, next) => {
  try {
    const data = await clinicService.previewImportData({
      clinicId: req?.auth?.clinicId,
      payload: req?.body || {},
    });
    return res.status(200).json({
      ok: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

const applyMyClinicImport = async (req, res, next) => {
  try {
    const data = await clinicService.applyImportData({
      clinicId: req?.auth?.clinicId,
      payload: req?.body || {},
    });
    return res.status(200).json({
      ok: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

const previewMyPatientImport = async (req, res, next) => {
  try {
    const data = await clinicService.previewPatientImportData({
      clinicId: req?.auth?.clinicId,
      payload: { ...(req?.body || {}), file: req?.file || null },
    });
    return res.status(200).json({
      ok: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

const applyMyPatientImport = async (req, res, next) => {
  try {
    const data = await clinicService.applyPatientImportData({
      clinicId: req?.auth?.clinicId,
      payload: { ...(req?.body || {}), file: req?.file || null },
    });
    return res.status(200).json({
      ok: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

const previewMyAppointmentImport = async (req, res, next) => {
  try {
    const data = await clinicService.previewAppointmentImportData({
      clinicId: req?.auth?.clinicId,
      payload: { ...(req?.body || {}), file: req?.file || null },
    });
    return res.status(200).json({
      ok: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

const applyMyAppointmentImport = async (req, res, next) => {
  try {
    const data = await clinicService.applyAppointmentImportData({
      clinicId: req?.auth?.clinicId,
      payload: { ...(req?.body || {}), file: req?.file || null },
    });
    return res.status(200).json({
      ok: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

const previewMyClinicalImport = async (req, res, next) => {
  try {
    const data = await clinicService.previewClinicalImportData({
      clinicId: req?.auth?.clinicId,
      payload: { ...(req?.body || {}), file: req?.file || null },
    });
    return res.status(200).json({
      ok: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

const applyMyClinicalImport = async (req, res, next) => {
  try {
    const data = await clinicService.applyClinicalImportData({
      clinicId: req?.auth?.clinicId,
      payload: { ...(req?.body || {}), file: req?.file || null },
    });
    return res.status(200).json({
      ok: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

const previewMyCashflowImport = async (req, res, next) => {
  try {
    const data = await clinicService.previewCashflowImportData({
      clinicId: req?.auth?.clinicId,
      payload: { ...(req?.body || {}), file: req?.file || null },
    });
    return res.status(200).json({
      ok: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

const applyMyCashflowImport = async (req, res, next) => {
  try {
    const data = await clinicService.applyCashflowImportData({
      clinicId: req?.auth?.clinicId,
      payload: { ...(req?.body || {}), file: req?.file || null },
    });
    return res.status(200).json({
      ok: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

const previewMyProceduresImport = async (req, res, next) => {
  try {
    const data = await clinicService.previewProceduresImportData({
      clinicId: req?.auth?.clinicId,
      payload: { ...(req?.body || {}), file: req?.file || null },
    });
    return res.status(200).json({
      ok: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

const applyMyProceduresImport = async (req, res, next) => {
  try {
    const data = await clinicService.applyProceduresImportData({
      clinicId: req?.auth?.clinicId,
      payload: { ...(req?.body || {}), file: req?.file || null },
    });
    return res.status(200).json({
      ok: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

const getMyWhatsAppEngineHealth = async (_req, res, next) => {
  try {
    const data = await whatsappNgClient.getHealth();
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const getMyWhatsAppConnection = async (req, res, next) => {
  try {
    const data = await whatsappNgClient.getConnectionByClinic({
      clinicId: req?.auth?.clinicId,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const refreshMyWhatsAppConnection = async (req, res, next) => {
  try {
    const data = await whatsappNgClient.refreshConnectionByClinic({
      clinicId: req?.auth?.clinicId,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const connectMyWhatsApp = async (req, res, next) => {
  try {
    const data = await whatsappNgClient.connectClinic({
      clinicId: req?.auth?.clinicId,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const disconnectMyWhatsApp = async (req, res, next) => {
  try {
    const data = await whatsappNgClient.disconnectClinic({
      clinicId: req?.auth?.clinicId,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const deleteMyWhatsAppInstance = async (req, res, next) => {
  try {
    const clinicId = req?.auth?.clinicId;
    const data = await whatsappNgClient.deleteClinicInstance({ clinicId });
    await outboundMessageService.resetClinicWhatsappReplyContexts({
      clinicId,
      reason: 'Clinic WhatsApp instance deleted by operator. Pending confirmation contexts were cleared before reconnect.',
    }).catch((error) => {
      console.warn('[clinicController] Failed to reset WhatsApp reply contexts after instance delete:', error?.message || error);
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const listMyLaboratoryOrders = async (req, res, next) => {
  try {
    const clinicId = req?.auth?.clinicId;
    const patientId = String(req.query?.patientId || '').trim();
    const data = patientId
      ? await laboratoryService.listOrdersByPatient({ clinicId, patientId })
      : await laboratoryService.listOrdersByClinic({ clinicId });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const createMyLaboratoryOrder = async (req, res, next) => {
  try {
    const data = await laboratoryService.createOrder({
      clinicId: req?.auth?.clinicId,
      payload: req?.body || {},
    });
    return res.status(201).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const updateMyLaboratoryOrder = async (req, res, next) => {
  try {
    const data = await laboratoryService.updateOrder({
      clinicId: req?.auth?.clinicId,
      orderId: req?.params?.orderId,
      payload: req?.body || {},
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const deleteMyLaboratoryOrder = async (req, res, next) => {
  try {
    const data = await laboratoryService.deleteOrder({
      clinicId: req?.auth?.clinicId,
      orderId: req?.params?.orderId,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const getMyLaboratoryDashboard = async (req, res, next) => {
  try {
    const data = await laboratoryService.getLaboratoryDashboardSummary({
      clinicId: req?.auth?.clinicId,
    });
    return res.status(200).json({ ok: true, data });
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
  createClinicBootstrap,
  getMyOperationalSettings,
  updateMyOperationalSettings,
  getMyClinicProfile,
  updateMyClinicProfile,
  exportMyClinicData,
  previewMyClinicImport,
  applyMyClinicImport,
  previewMyPatientImport,
  applyMyPatientImport,
  previewMyAppointmentImport,
  applyMyAppointmentImport,
  previewMyClinicalImport,
  applyMyClinicalImport,
  previewMyCashflowImport,
  applyMyCashflowImport,
  previewMyProceduresImport,
  applyMyProceduresImport,
  getMyWhatsAppEngineHealth,
  getMyWhatsAppConnection,
  refreshMyWhatsAppConnection,
  connectMyWhatsApp,
  disconnectMyWhatsApp,
  deleteMyWhatsAppInstance,
  listMyLaboratoryOrders,
  createMyLaboratoryOrder,
  updateMyLaboratoryOrder,
  deleteMyLaboratoryOrder,
  getMyLaboratoryDashboard,
  listMyCampaigns,
  replaceMyCampaigns,
  createMyCampaign,
  updateMyCampaign,
  deleteMyCampaign,
};
