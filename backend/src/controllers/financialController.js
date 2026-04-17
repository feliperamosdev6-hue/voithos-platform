const { financialService } = require('../services/financialService');
const { planMessageService } = require('../services/planMessageService');
const { getAuthenticatedClinicId } = require('../utils/authContext');

const listAccounts = async (req, res, next) => {
  try {
    const data = await financialService.listFinancialAccounts({
      clinicId: getAuthenticatedClinicId(req),
      patientId: String(req.query?.patientId || '').trim(),
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const createAccount = async (req, res, next) => {
  try {
    const data = await financialService.createFinancialAccount({
      clinicId: getAuthenticatedClinicId(req),
      payload: req.body || {},
    });
    return res.status(201).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const updateAccount = async (req, res, next) => {
  try {
    const data = await financialService.updateFinancialAccount({
      clinicId: getAuthenticatedClinicId(req),
      accountId: req.params.accountId,
      payload: req.body || {},
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const getAccount = async (req, res, next) => {
  try {
    const data = await financialService.getFinancialAccount({
      clinicId: getAuthenticatedClinicId(req),
      accountId: req.params.accountId,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const deleteAccount = async (req, res, next) => {
  try {
    const data = await financialService.deleteFinancialAccount({
      clinicId: getAuthenticatedClinicId(req),
      accountId: req.params.accountId,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const registerPayment = async (req, res, next) => {
  try {
    const data = await financialService.registerPayment({
      clinicId: getAuthenticatedClinicId(req),
      accountId: req.params.accountId,
      installmentId: String(req.body?.installmentId || '').trim(),
      amount: req.body?.amount,
      method: req.body?.method || req.body?.paymentMethod || req.body?.metodoPagamento,
      paidAt: req.body?.paidAt,
      metadata: req.body?.metadata || {},
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const getPatientSummary = async (req, res, next) => {
  try {
    const data = await financialService.getPatientFinancialSummary({
      clinicId: getAuthenticatedClinicId(req),
      patientId: req.params.patientId,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const getDashboard = async (req, res, next) => {
  try {
    const data = await financialService.getFinancialDashboard({
      clinicId: getAuthenticatedClinicId(req),
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const getMonthlySummary = async (req, res, next) => {
  try {
    const now = new Date();
    const month = Number(req.query?.month || req.query?.mes || (now.getMonth() + 1));
    const year = Number(req.query?.year || req.query?.ano || now.getFullYear());
    const data = await financialService.getMonthlySummary({
      clinicId: getAuthenticatedClinicId(req),
      month,
      year,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const getReminders = async (req, res, next) => {
  try {
    const data = await financialService.getFinancialReminders({
      clinicId: getAuthenticatedClinicId(req),
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const listPlans = async (req, res, next) => {
  try {
    const data = await financialService.listPatientPlans({
      clinicId: getAuthenticatedClinicId(req),
      patientId: String(req.query?.patientId || '').trim(),
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const createPlan = async (req, res, next) => {
  try {
    const data = await financialService.createPatientPlan({
      clinicId: getAuthenticatedClinicId(req),
      payload: req.body || {},
    });
    return res.status(201).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const getPlan = async (req, res, next) => {
  try {
    const data = await financialService.getPatientPlanById({
      clinicId: getAuthenticatedClinicId(req),
      planId: req.params.planId,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const updatePlan = async (req, res, next) => {
  try {
    const data = await financialService.updatePatientPlan({
      clinicId: getAuthenticatedClinicId(req),
      planId: req.params.planId,
      payload: req.body || {},
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const deletePlan = async (req, res, next) => {
  try {
    const data = await financialService.deletePatientPlan({
      clinicId: getAuthenticatedClinicId(req),
      planId: req.params.planId,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const listPlanMessageHistory = async (req, res, next) => {
  try {
    const data = await planMessageService.listHistory({
      clinicId: getAuthenticatedClinicId(req),
      planId: req.params.planId,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const listPlanMessageSuggestions = async (req, res, next) => {
  try {
    const data = await planMessageService.listSuggestions({
      clinicId: getAuthenticatedClinicId(req),
      planId: req.params.planId,
      dueSoonDays: req.query?.dueSoonDays,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const sendPlanMessage = async (req, res, next) => {
  try {
    const data = await planMessageService.send({
      clinicId: getAuthenticatedClinicId(req),
      planId: req.params.planId,
      installmentId: String(req.body?.installmentId || '').trim(),
      eventType: String(req.body?.eventType || '').trim(),
      actorName: req?.auth?.userId || 'web_plans',
      manualResend: req.body?.manualResend === true,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const resendPlanMessage = async (req, res, next) => {
  try {
    const data = await planMessageService.resend({
      clinicId: getAuthenticatedClinicId(req),
      planMessageId: req.params.messageId,
      actorName: req?.auth?.userId || 'web_plans',
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listAccounts,
  createAccount,
  updateAccount,
  getAccount,
  deleteAccount,
  registerPayment,
  getPatientSummary,
  getDashboard,
  getMonthlySummary,
  getReminders,
  listPlans,
  createPlan,
  getPlan,
  updatePlan,
  deletePlan,
  listPlanMessageHistory,
  listPlanMessageSuggestions,
  sendPlanMessage,
  resendPlanMessage,
};
