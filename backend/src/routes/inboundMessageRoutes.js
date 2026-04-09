const express = require('express');
const { authenticate } = require('../middlewares/authenticate');
const { listInboundMessages } = require('../controllers/inboundMessageController');

const router = express.Router();

router.use(authenticate);
router.get('/', listInboundMessages);

module.exports = router;
