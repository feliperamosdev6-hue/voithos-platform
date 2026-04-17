const express = require('express');
const { authenticate } = require('../middlewares/authenticate');
const {
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
} = require('../controllers/financialController');

const router = express.Router();

router.use(authenticate);
router.get('/accounts', listAccounts);
router.post('/accounts', createAccount);
router.get('/accounts/:accountId', getAccount);
router.patch('/accounts/:accountId', updateAccount);
router.delete('/accounts/:accountId', deleteAccount);
router.post('/accounts/:accountId/payments', registerPayment);
router.get('/patients/:patientId/summary', getPatientSummary);
router.get('/dashboard', getDashboard);
router.get('/summary', getMonthlySummary);
router.get('/reminders', getReminders);
router.get('/plans', listPlans);
router.post('/plans', createPlan);
router.get('/plans/:planId', getPlan);
router.patch('/plans/:planId', updatePlan);
router.delete('/plans/:planId', deletePlan);
router.get('/plans/:planId/messages', listPlanMessageHistory);
router.get('/plans/:planId/messages/suggestions', listPlanMessageSuggestions);
router.post('/plans/:planId/messages/send', sendPlanMessage);
router.post('/plan-messages/:messageId/resend', resendPlanMessage);

module.exports = router;
