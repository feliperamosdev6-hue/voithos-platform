const { financialService } = require('../services/financialService');
const { planMessageService } = require('../services/planMessageService');

const listAccounts = async (req, res, next) => {
  try {
    const data = await financialService.listFinancialAccounts({
      clinicId: String(req.query?.clinicId || '').trim(),
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
      clinicId: String(req.body?.clinicId || '').trim(),
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
      clinicId: String(req.body?.clinicId || req.query?.clinicId || '').trim(),
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
      clinicId: String(req.query?.clinicId || '').trim(),
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
      clinicId: String(req.query?.clinicId || req.body?.clinicId || '').trim(),
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
      clinicId: String(req.body?.clinicId || '').trim(),
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

const applyPatientPayment = async (req, res, next) => {
  try {
    const data = await financialService.applyPatientPayment({
      clinicId: String(req.body?.clinicId || '').trim(),
      patientId: req.params.patientId,
      amount: req.body?.amount,
      method: req.body?.method || req.body?.paymentMethod || req.body?.metodoPagamento,
      paidAt: req.body?.paidAt,
      description: req.body?.description || req.body?.descricao,
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
      clinicId: String(req.query?.clinicId || '').trim(),
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
      clinicId: String(req.query?.clinicId || '').trim(),
    });
    console.info('[FINANCEIRO]', JSON.stringify({
      action: 'financial_summary_loaded',
      clinicId: String(req.query?.clinicId || '').trim(),
      type: 'dashboard',
      financial_source: 'central',
    }));
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const getReport = async (req, res, next) => {
  try {
    const clinicId = String(req.query?.clinicId || '').trim();
    const month = Number(req.query?.month || req.query?.mes);
    const year = Number(req.query?.year || req.query?.ano);
    const data = await financialService.getFinancialReport({
      clinicId,
      month,
      year,
    });
    console.info('[FINANCEIRO]', JSON.stringify({
      action: 'financial_report_generated',
      clinicId,
      period: `${year}-${String(month).padStart(2, '0')}`,
      type: 'report',
      financial_source: 'central',
    }));
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const getMonthlySummary = async (req, res, next) => {
  try {
    const clinicId = String(req.query?.clinicId || '').trim();
    const month = Number(req.query?.month || req.query?.mes);
    const year = Number(req.query?.year || req.query?.ano);
    const data = await financialService.getMonthlySummary({
      clinicId,
      month,
      year,
    });
    console.info('[FINANCEIRO]', JSON.stringify({
      action: 'financial_summary_loaded',
      clinicId,
      period: `${year}-${String(month).padStart(2, '0')}`,
      type: 'monthly-summary',
      financial_source: 'central',
    }));
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const getCashFlowProjection = async (req, res, next) => {
  try {
    const clinicId = String(req.query?.clinicId || '').trim();
    const data = await financialService.getCashFlowProjection({
      clinicId,
    });
    console.info('[FINANCEIRO]', JSON.stringify({
      action: 'financial_projection_loaded',
      clinicId,
      type: 'projection',
      financial_source: 'central',
    }));
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const getOverdueAccounts = async (req, res, next) => {
  try {
    const clinicId = String(req.query?.clinicId || '').trim();
    const data = await financialService.getOverdueAccounts({
      clinicId,
    });
    console.info('[FINANCEIRO]', JSON.stringify({
      action: 'financial_summary_loaded',
      clinicId,
      type: 'overdue',
      financial_source: 'central',
    }));
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const getReminders = async (req, res, next) => {
  try {
    const clinicId = String(req.query?.clinicId || '').trim();
    const startedAt = Date.now();
    const data = await financialService.getFinancialReminders({ clinicId });
    console.info('[FINANCEIRO]', JSON.stringify({
      action: 'financial_reminders_loaded',
      clinicId,
      type: 'reminders',
      financial_reminders_source: 'central',
      durationMs: Date.now() - startedAt,
      counts: {
        overdue: data?.overdue?.count || 0,
        dueToday: data?.dueToday?.count || 0,
        dueSoon: data?.dueSoon?.count || 0,
        partialOutstanding: data?.partialOutstanding?.count || 0,
      },
    }));
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const closeMonth = async (req, res, next) => {
  try {
    const clinicId = String(req.body?.clinicId || '').trim();
    const month = Number(req.body?.month || req.body?.mes);
    const year = Number(req.body?.year || req.body?.ano);
    const data = await financialService.closeFinancialMonth({
      clinicId,
      month,
      year,
    });
    console.info('[FINANCEIRO]', JSON.stringify({
      action: 'financial_summary_loaded',
      clinicId,
      period: `${year}-${String(month).padStart(2, '0')}`,
      type: 'snapshot-close',
      financial_source: 'central',
    }));
    return res.status(201).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const listFaturamento = async (req, res, next) => {
  try {
    const data = await financialService.listFaturamentoByPeriod({
      clinicId: String(req.query?.clinicId || '').trim(),
      period: String(req.query?.period || 'mes').trim(),
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const listPlans = async (req, res, next) => {
  try {
    const data = await financialService.listPatientPlans({
      clinicId: String(req.query?.clinicId || '').trim(),
      patientId: String(req.query?.patientId || '').trim(),
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const getPlansDashboard = async (req, res, next) => {
  try {
    const data = await financialService.getPatientPlansDashboard({
      clinicId: String(req.query?.clinicId || '').trim(),
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const createPlan = async (req, res, next) => {
  try {
    const data = await financialService.createPatientPlan({
      clinicId: String(req.body?.clinicId || '').trim(),
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
      clinicId: String(req.query?.clinicId || '').trim(),
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
      clinicId: String(req.body?.clinicId || req.query?.clinicId || '').trim(),
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
      clinicId: String(req.query?.clinicId || req.body?.clinicId || '').trim(),
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
      clinicId: String(req.query?.clinicId || '').trim(),
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
      clinicId: String(req.query?.clinicId || '').trim(),
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
      clinicId: String(req.body?.clinicId || '').trim(),
      planId: req.params.planId,
      installmentId: String(req.body?.installmentId || '').trim(),
      eventType: String(req.body?.eventType || '').trim(),
      actorName: String(req.body?.actorName || '').trim() || 'internal_financial_api',
      manualResend: req.body?.manualResend === true,
      approvedByDentist: req.body?.approvedByDentist === true,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const resendPlanMessage = async (req, res, next) => {
  try {
    const data = await planMessageService.resend({
      clinicId: String(req.body?.clinicId || '').trim(),
      planMessageId: req.params.messageId,
      actorName: String(req.body?.actorName || '').trim() || 'internal_financial_api',
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const runPlanMessageAutomation = async (req, res, next) => {
  try {
    const bodyClinicId = String(req.body?.clinicId || req.query?.clinicId || '').trim();
    const bodyClinicIds = Array.isArray(req.body?.clinicIds)
      ? req.body.clinicIds.map((item) => String(item || '').trim()).filter(Boolean)
      : [];
    const data = await planMessageService.runAutomationsAcrossClinics({
      clinicIds: bodyClinicId ? [bodyClinicId] : bodyClinicIds,
      dueSoonDays: req.body?.dueSoonDays ?? req.query?.dueSoonDays,
      dryRun: req.body?.dryRun === true || String(req.query?.dryRun || '').trim().toLowerCase() === 'true',
      actorName: String(req.body?.actorName || '').trim() || 'internal_financial_api',
      limitPerClinic: req.body?.limitPerClinic ?? req.query?.limitPerClinic,
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
  registerPayment,
  applyPatientPayment,
  getPatientSummary,
  getDashboard,
  getReport,
  getMonthlySummary,
  getCashFlowProjection,
  getOverdueAccounts,
  getReminders,
  closeMonth,
  listFaturamento,
  listPlans,
  getPlansDashboard,
  createPlan,
  getPlan,
  updatePlan,
  deletePlan,
  listPlanMessageHistory,
  listPlanMessageSuggestions,
  sendPlanMessage,
  resendPlanMessage,
  runPlanMessageAutomation,
  deleteAccount,
};
