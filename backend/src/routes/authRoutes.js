const express = require('express');
const {
  login,
  signup,
  logout,
  me,
  changePassword,
  requestPasswordResetFlow,
  validatePasswordResetFlow,
  confirmPasswordResetFlow,
  impersonateClinicAdmin,
} = require('../controllers/authController');
const { authenticate } = require('../middlewares/authenticate');

const router = express.Router();

router.post('/login', login);
router.post('/signup', signup);
router.post('/password-reset/request', requestPasswordResetFlow);
router.post('/password-reset/validate', validatePasswordResetFlow);
router.post('/password-reset/confirm', confirmPasswordResetFlow);
router.get('/me', authenticate, me);
router.post('/logout', authenticate, logout);
router.post('/change-password', authenticate, changePassword);
router.post('/impersonate-clinic-admin', authenticate, impersonateClinicAdmin);

module.exports = router;
