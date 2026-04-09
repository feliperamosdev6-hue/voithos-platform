const express = require('express');
const { authenticate } = require('../middlewares/authenticate');
const { runDayBeforeReminderJob } = require('../controllers/automationController');

const router = express.Router();

router.use(authenticate);
router.post('/appointments/reminders/run', runDayBeforeReminderJob);

module.exports = router;
