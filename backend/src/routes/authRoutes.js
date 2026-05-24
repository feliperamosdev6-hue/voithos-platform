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
  validatePromotionOffer,
  requestPasswordResetFlow,
  validatePasswordResetFlow,
  confirmPasswordResetFlow,
  impersonateClinicAdmin,
} = require('../controllers/authController');
const { authenticate } = require('../middlewares/authenticate');
const { authRateLimits } = require('../middlewares/rateLimit');

const router = express.Router();

router.post('/login', authRateLimits.login, login);
router.post('/signup', authRateLimits.publicSignup, signup);
router.post('/email-verification/confirm', authRateLimits.emailVerification, confirmEmailVerificationFlow);
router.post('/email-verification/resend', authRateLimits.emailVerification, resendEmailVerificationFlow);
router.post('/pending-signup/onboarding', updatePendingSignupOnboarding);
router.post('/pending-signup/checkout', createPendingSignupCheckout);
router.post('/pending-signup/refresh-payment-status', refreshPendingSignupPaymentStatus);
router.get('/promotion-offers/:code', validatePromotionOffer);
router.post('/password-reset/request', authRateLimits.passwordReset, requestPasswordResetFlow);
router.post('/password-reset/validate', authRateLimits.passwordReset, validatePasswordResetFlow);
router.post('/password-reset/confirm', authRateLimits.passwordReset, confirmPasswordResetFlow);
router.get('/me', authenticate, me);
router.post('/logout', authenticate, logout);
router.post('/change-password', authenticate, changePassword);
router.post('/impersonate-clinic-admin', authenticate, authRateLimits.superAdmin, impersonateClinicAdmin);

module.exports = router;
