const express = require('express');
const {
  login,
  signup,
  logout,
  me,
  changePassword,
  confirmEmailVerificationFlow,
  resendEmailVerificationFlow,
  updatePendingSignupOnboarding,
  createPendingSignupCheckout,
  refreshPendingSignupPaymentStatus,
  requestPasswordResetFlow,
  validatePasswordResetFlow,
  confirmPasswordResetFlow,
  impersonateClinicAdmin,
} = require('../controllers/authController');
const { authenticate } = require('../middlewares/authenticate');

const router = express.Router();

router.post('/login', login);
router.post('/signup', signup);
router.post('/email-verification/confirm', confirmEmailVerificationFlow);
router.post('/email-verification/resend', resendEmailVerificationFlow);
router.post('/pending-signup/onboarding', updatePendingSignupOnboarding);
router.post('/pending-signup/checkout', createPendingSignupCheckout);
router.post('/pending-signup/refresh-payment-status', refreshPendingSignupPaymentStatus);
router.post('/password-reset/request', requestPasswordResetFlow);
router.post('/password-reset/validate', validatePasswordResetFlow);
router.post('/password-reset/confirm', confirmPasswordResetFlow);
router.get('/me', authenticate, me);
router.post('/logout', authenticate, logout);
router.post('/change-password', authenticate, changePassword);
router.post('/impersonate-clinic-admin', authenticate, impersonateClinicAdmin);

module.exports = router;
