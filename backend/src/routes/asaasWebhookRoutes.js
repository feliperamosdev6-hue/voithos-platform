const express = require('express');
const { handleAsaasWebhook } = require('../controllers/asaasWebhookController');

const router = express.Router();

router.post('/asaas', handleAsaasWebhook);

module.exports = router;
