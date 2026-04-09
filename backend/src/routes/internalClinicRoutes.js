const express = require('express');
const {
  getInternalOperationalSettings,
  updateInternalOperationalSettings,
} = require('../controllers/internalClinicController');
const { serviceAuthenticate } = require('../middlewares/serviceAuthenticate');

const router = express.Router();

router.use(serviceAuthenticate);
router.get('/operational-settings', getInternalOperationalSettings);
router.patch('/operational-settings', updateInternalOperationalSettings);

module.exports = router;
