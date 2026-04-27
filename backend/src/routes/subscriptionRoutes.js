const express = require('express');
const { authenticate } = require('../middlewares/authenticate');
const { validate } = require('../middlewares/validate');
const {
  getMySubscription,
  createSubscription,
  confirmSubscriptionPayment,
  renewSubscription,
} = require('../controllers/subscriptionController');

const router = express.Router();

const VALID_PLAN_TYPES = ['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'];

const validateCreateSubscription = validate((req) => {
  const issues = [];
  const planType = String(req.body?.planType || '').trim().toUpperCase();
  if (!planType) {
    issues.push({ field: 'planType', message: 'planType is required.' });
  } else if (!VALID_PLAN_TYPES.includes(planType)) {
    issues.push({ field: 'planType', message: `planType must be one of: ${VALID_PLAN_TYPES.join(', ')}.` });
  }
  return issues;
});

const validateConfirmPayment = validate((req) => {
  const issues = [];
  const paymentId = String(req.body?.paymentId || '').trim();
  const provider = String(req.body?.provider || '').trim();
  const externalPaymentId = String(req.body?.externalPaymentId || '').trim();

  if (!paymentId && !(provider && externalPaymentId)) {
    issues.push({
      field: 'paymentId',
      message: 'paymentId or provider + externalPaymentId are required.',
    });
  }

  if (req.body?.paidAt && Number.isNaN(new Date(req.body.paidAt).getTime())) {
    issues.push({ field: 'paidAt', message: 'paidAt is invalid.' });
  }

  return issues;
});

const validateRenewSubscription = validate((req) => {
  const issues = [];
  const planType = String(req.body?.planType || '').trim().toUpperCase();
  if (planType && !VALID_PLAN_TYPES.includes(planType)) {
    issues.push({ field: 'planType', message: `planType must be one of: ${VALID_PLAN_TYPES.join(', ')}.` });
  }
  return issues;
});

router.use(authenticate);

router.get('/me', getMySubscription);
router.post('/create', validateCreateSubscription, createSubscription);
router.post('/confirm-payment', validateConfirmPayment, confirmSubscriptionPayment);
router.post('/renew', validateRenewSubscription, renewSubscription);

module.exports = router;
