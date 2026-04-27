const express = require('express');
const { authenticate } = require('../middlewares/authenticate');
const { checkSubscription } = require('../middlewares/checkSubscription');
const { runDayBeforeReminderJob } = require('../controllers/automationController');

const router = express.Router();

router.use(authenticate, checkSubscription);
router.post('/appointments/reminders/run', runDayBeforeReminderJob);

module.exports = router;
