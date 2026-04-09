const express = require('express');
const { authenticate } = require('../middlewares/authenticate');
const {
  getOutboundMessageById,
  listOutboundMessages,
} = require('../controllers/outboundMessageController');

const router = express.Router();

router.use(authenticate);

router.get('/', listOutboundMessages);
router.get('/:id', getOutboundMessageById);

module.exports = router;
