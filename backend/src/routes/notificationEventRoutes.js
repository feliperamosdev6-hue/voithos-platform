const express = require('express');
const { authenticate } = require('../middlewares/authenticate');
const { checkSubscription } = require('../middlewares/checkSubscription');
const { listNotificationEvents } = require('../controllers/notificationEventController');

const router = express.Router();

router.use(authenticate, checkSubscription);
router.get('/', listNotificationEvents);

module.exports = router;
