const express = require('express');
const {
  listInternalInboundWhatsapp,
  receiveInboundWhatsapp,
  resetInternalClinicWhatsappContext,
} = require('../controllers/internalWhatsappController');
const { serviceAuthenticate } = require('../middlewares/serviceAuthenticate');

const router = express.Router();

router.use(serviceAuthenticate);
router.get('/inbound', listInternalInboundWhatsapp);
router.post('/inbound', receiveInboundWhatsapp);
router.post('/reset-clinic-context', resetInternalClinicWhatsappContext);

module.exports = router;
