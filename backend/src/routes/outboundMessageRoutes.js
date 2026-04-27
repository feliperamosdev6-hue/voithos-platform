const express = require('express');
const { authenticate } = require('../middlewares/authenticate');
const { checkSubscription } = require('../middlewares/checkSubscription');
const {
  getOutboundMessageById,
  listOutboundMessages,
} = require('../controllers/outboundMessageController');

const router = express.Router();

router.use(authenticate, checkSubscription);

router.get('/', listOutboundMessages);
router.get('/:id', getOutboundMessageById);

module.exports = router;
