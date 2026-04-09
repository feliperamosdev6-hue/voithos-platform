const express = require('express');
const { authenticate } = require('../middlewares/authenticate');
const { listNotificationEvents } = require('../controllers/notificationEventController');

const router = express.Router();

router.use(authenticate);
router.get('/', listNotificationEvents);

module.exports = router;
