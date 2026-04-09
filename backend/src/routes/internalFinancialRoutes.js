const express = require('express');
const { serviceAuthenticate } = require('../middlewares/serviceAuthenticate');
const {
  listAccounts,
  createAccount,
  updateAccount,
  getAccount,
  deleteAccount,
  registerPayment,
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
  createPlan,
  getPlan,
  updatePlan,
  deletePlan,
  listPlanMessageHistory,
  listPlanMessageSuggestions,
  sendPlanMessage,
  resendPlanMessage,
  runPlanMessageAutomation,
} = require('../controllers/internalFinancialController');

const router = express.Router();

router.use(serviceAuthenticate);

router.get('/accounts', listAccounts);
router.post('/accounts', createAccount);
router.get('/accounts/:accountId', getAccount);
router.patch('/accounts/:accountId', updateAccount);
router.delete('/accounts/:accountId', deleteAccount);
router.post('/accounts/:accountId/payments', registerPayment);
router.get('/patients/:patientId/summary', getPatientSummary);
router.get('/dashboard', getDashboard);
router.get('/report', getReport);
router.get('/summary', getMonthlySummary);
router.get('/projection', getCashFlowProjection);
router.get('/overdue', getOverdueAccounts);
router.get('/reminders', getReminders);
router.post('/snapshots/close', closeMonth);
router.get('/faturamento', listFaturamento);
router.get('/plans', listPlans);
router.post('/plans', createPlan);
router.get('/plans/:planId', getPlan);
router.patch('/plans/:planId', updatePlan);
router.delete('/plans/:planId', deletePlan);
router.get('/plans/:planId/messages', listPlanMessageHistory);
router.get('/plans/:planId/messages/suggestions', listPlanMessageSuggestions);
router.post('/plans/:planId/messages/send', sendPlanMessage);
router.post('/plan-messages/:messageId/resend', resendPlanMessage);
router.post('/plan-messages/run', runPlanMessageAutomation);

module.exports = router;
