const express = require('express');
const { authenticate } = require('../middlewares/authenticate');
const { checkSubscription } = require('../middlewares/checkSubscription');
const { listInboundMessages } = require('../controllers/inboundMessageController');

const router = express.Router();

router.use(authenticate, checkSubscription);
router.get('/', listInboundMessages);

module.exports = router;
