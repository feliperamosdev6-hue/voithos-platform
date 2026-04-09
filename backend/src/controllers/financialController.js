const { financialService } = require('../services/financialService');
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

module.exports = {
  listAccounts,
  createAccount,
  updateAccount,
  getAccount,
  deleteAccount,
  registerPayment,
  getPatientSummary,
};
