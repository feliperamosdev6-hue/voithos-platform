const express = require('express');
const { serviceAuthenticate } = require('../middlewares/serviceAuthenticate');
const {
  createClinicWithAdmin,
  impersonateClinicAdmin,
} = require('../controllers/internalIdentityController');

const router = express.Router();

router.use(serviceAuthenticate);
router.post('/clinics/bootstrap', createClinicWithAdmin);
router.post('/auth/impersonate-clinic-admin', impersonateClinicAdmin);

module.exports = router;
