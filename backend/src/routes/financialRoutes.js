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

module.exports = router;
