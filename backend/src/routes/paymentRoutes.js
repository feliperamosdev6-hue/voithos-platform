const express = require('express');
const { authenticate } = require('../middlewares/authenticate');
const { checkSubscription, requireSubscriptionAccess } = require('../middlewares/checkSubscription');
const {
  createPayment,
  listPayments,
  getPayment,
  updatePaymentStatus,
} = require('../controllers/paymentController');

const router = express.Router();
const requireWriteAccess = requireSubscriptionAccess('WRITE');

router.use(authenticate, checkSubscription);

router.post('/', requireWriteAccess, createPayment);
router.get('/', listPayments);
router.get('/:id', getPayment);
router.patch('/:id/status', requireWriteAccess, updatePaymentStatus);

module.exports = router;
