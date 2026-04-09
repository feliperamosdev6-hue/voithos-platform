const express = require('express');
const {
  listInternalNotificationEvents,
  createInternalNotificationEvent,
} = require('../controllers/internalNotificationEventController');
const { serviceAuthenticate } = require('../middlewares/serviceAuthenticate');

const router = express.Router();

router.use(serviceAuthenticate);
router.get('/', listInternalNotificationEvents);
router.post('/', createInternalNotificationEvent);

module.exports = router;
