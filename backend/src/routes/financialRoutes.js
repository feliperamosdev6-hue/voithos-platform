const express = require('express');
const { authenticate } = require('../middlewares/authenticate');
const { checkSubscription, requireSubscriptionAccess } = require('../middlewares/checkSubscription');
const {
  listAccounts,
  createAccount,
  updateAccount,
  getAccount,
  deleteAccount,
  registerPayment,
  applyPatientPayment,
  getPatientSummary,
  getDashboard,
  getMonthlySummary,
  getReminders,
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
} = require('../controllers/financialController');

const router = express.Router();
const requireWriteAccess = requireSubscriptionAccess('WRITE');

router.use(authenticate, checkSubscription);
router.get('/accounts', listAccounts);
router.post('/accounts', requireWriteAccess, createAccount);
router.get('/accounts/:accountId', getAccount);
router.patch('/accounts/:accountId', requireWriteAccess, updateAccount);
router.delete('/accounts/:accountId', requireWriteAccess, deleteAccount);
router.post('/accounts/:accountId/payments', requireWriteAccess, registerPayment);
router.post('/patients/:patientId/payments', requireWriteAccess, applyPatientPayment);
router.get('/patients/:patientId/summary', getPatientSummary);
router.get('/dashboard', getDashboard);
router.get('/summary', getMonthlySummary);
router.get('/reminders', getReminders);
router.get('/plans', listPlans);
router.get('/plans/dashboard', getPlansDashboard);
router.post('/plans', requireWriteAccess, createPlan);
router.get('/plans/:planId', getPlan);
router.patch('/plans/:planId', requireWriteAccess, updatePlan);
router.delete('/plans/:planId', requireWriteAccess, deletePlan);
router.get('/plans/:planId/messages', listPlanMessageHistory);
router.get('/plans/:planId/messages/suggestions', listPlanMessageSuggestions);
router.post('/plans/:planId/messages/send', requireWriteAccess, sendPlanMessage);
router.post('/plan-messages/:messageId/resend', requireWriteAccess, resendPlanMessage);

module.exports = router;
