const express = require('express');
const { runInternalDayBeforeReminderJob } = require('../controllers/internalAutomationController');
const { serviceAuthenticate } = require('../middlewares/serviceAuthenticate');

const router = express.Router();

router.use(serviceAuthenticate);
router.post('/appointments/reminders/run', runInternalDayBeforeReminderJob);

module.exports = router;
