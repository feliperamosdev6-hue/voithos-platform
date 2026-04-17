const express = require('express');
const { authenticate } = require('../middlewares/authenticate');
const {
  createPayment,
  listPayments,
  getPayment,
  updatePaymentStatus,
} = require('../controllers/paymentController');

const router = express.Router();

router.use(authenticate);

router.post('/', createPayment);
router.get('/', listPayments);
router.get('/:id', getPayment);
router.patch('/:id/status', updatePaymentStatus);

module.exports = router;
