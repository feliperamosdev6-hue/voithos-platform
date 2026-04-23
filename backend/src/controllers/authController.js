const { AppError } = require('../errors/AppError');
const { authService } = require('../services/authService');
const { clinicService } = require('../services/clinicService');
const { requireSuperAdmin } = require('../utils/accessControl');

const maskEmail = (email) => {
  const [localPart = '', domain = ''] = String(email || '').trim().toLowerCase().split('@');
  if (!localPart || !domain) return '';
  const localMask = localPart.length <= 2
    ? `${localPart[0] || '*'}*`
    : `${localPart.slice(0, 2)}***`;
  return `${localMask}@${domain}`;
};

const logPasswordReset = (stage, req, extra = {}) => {
  console.info('[password-reset][auth-controller]', {
    stage,
    endpoint: req?.originalUrl || req?.path || extra.endpoint || '',
    method: req?.method || '',
    email: maskEmail(req?.body?.email || req?.body?.login || req?.body?.adminEmail || ''),
    status: extra.status || '',
    fallback: false,
    error: extra.error || '',
  });
};

const logAuthDiagnostic = (stage, req, extra = {}) => {
  console.info('[auth][auth-controller]', {
    stage,
    endpoint: req?.originalUrl || req?.path || extra.endpoint || '',
    method: req?.method || '',
    email: maskEmail(req?.body?.email || req?.body?.login || req?.body?.adminEmail || ''),
    status: extra.status || '',
    error: extra.error || '',
  });
};

const login = async (req, res, next) => {
  try {
    const result = await authService.login(req.body || {});
    return res.status(200).json({
      ok: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

const signup = async (req, res, next) => {
  try {
    logAuthDiagnostic('signup_received', req, { status: 'received' });
    const result = await clinicService.publicSignup(req.body || {});
    logAuthDiagnostic('signup_completed', req, { status: 'success' });
    return res.status(201).json({
      ok: true,
      data: result,
    });
  } catch (error) {
    logAuthDiagnostic('signup_error', req, { status: 'error', error: error?.message || String(error || '') });
    return next(error);
  }
};

const me = async (req, res, next) => {
  try {
    if (!req.auth) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
    }

    const user = await authService.getCurrentUser(req.auth.token);
    if (!user) {
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired session.');
    }

    return res.status(200).json({
      ok: true,
      data: user,
    });
  } catch (error) {
    return next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    if (!req.auth) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
    }

    await authService.logout(req.auth.token);
    return res.status(200).json({
      ok: true,
      data: {
        loggedOut: true,
      },
    });
  } catch (error) {
    return next(error);
  }
};

const changePassword = async (req, res, next) => {
  try {
    if (!req.auth) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
    }

    const data = await authService.changePassword({
      token: req.auth.token,
      currentPassword: req.body?.currentPassword || req.body?.senhaAtual || '',
      newPassword: req.body?.newPassword || req.body?.novaSenha || '',
    });

    return res.status(200).json({
      ok: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

const impersonateClinicAdmin = async (req, res, next) => {
  try {
    if (!req.auth) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
    }
    requireSuperAdmin(req);

    const data = await authService.impersonateClinicAdmin(req.body?.clinicId || req.query?.clinicId || '');
    return res.status(200).json({
      ok: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

const confirmEmailVerificationFlow = async (req, res, next) => {
  try {
    logAuthDiagnostic('email_verification_received', req, { status: 'received' });
    const data = await authService.confirmEmailVerification({
      email: req.body?.email || req.body?.login || req.body?.adminEmail || '',
      code: req.body?.code || req.body?.verificationCode || req.body?.codigo || '',
    });
    logAuthDiagnostic('email_verification_completed', req, { status: 'success' });

    return res.status(200).json({
      ok: true,
      data,
    });
  } catch (error) {
    logAuthDiagnostic('email_verification_error', req, { status: 'error', error: error?.message || String(error || '') });
    return next(error);
  }
};

const resendEmailVerificationFlow = async (req, res, next) => {
  try {
    logAuthDiagnostic('email_verification_resend_received', req, { status: 'received' });
    const data = await authService.resendEmailVerification({
      email: req.body?.email || req.body?.login || req.body?.adminEmail || '',
    });
    logAuthDiagnostic('email_verification_resend_completed', req, {
      status: data?.deliveryConfirmed === true || data?.resent === true ? 'success' : 'blocked',
    });

    return res.status(200).json({
      ok: true,
      data,
    });
  } catch (error) {
    logAuthDiagnostic('email_verification_resend_error', req, { status: 'error', error: error?.message || String(error || '') });
    return next(error);
  }
};

const requestPasswordResetFlow = async (req, res, next) => {
  try {
    logPasswordReset('request_received', req, { status: 'received' });
    const data = await authService.requestPasswordReset({
      email: req.body?.email || req.body?.login || req.body?.adminEmail || '',
    });
    logPasswordReset('request_completed', req, { status: 'success' });

    return res.status(200).json({
      ok: true,
      data,
    });
  } catch (error) {
    logPasswordReset('request_error', req, { status: 'error', error: error?.message || String(error || '') });
    return next(error);
  }
};

const validatePasswordResetFlow = async (req, res, next) => {
  try {
    logPasswordReset('validate_received', req, { status: 'received' });
    const data = await authService.validatePasswordResetCode({
      email: req.body?.email || req.body?.login || req.body?.adminEmail || '',
      code: req.body?.code || req.body?.resetCode || req.body?.codigo || '',
    });
    logPasswordReset('validate_completed', req, { status: 'success' });

    return res.status(200).json({
      ok: true,
      data,
    });
  } catch (error) {
    logPasswordReset('validate_error', req, { status: 'error', error: error?.message || String(error || '') });
    return next(error);
  }
};

const confirmPasswordResetFlow = async (req, res, next) => {
  try {
    logPasswordReset('confirm_received', req, { status: 'received' });
    const data = await authService.saveNewPassword({
      email: req.body?.email || req.body?.login || req.body?.adminEmail || '',
      code: req.body?.code || req.body?.resetCode || req.body?.codigo || '',
      newPassword: req.body?.newPassword || req.body?.senhaNova || req.body?.senha || '',
      confirmPassword: req.body?.confirmPassword || req.body?.confirmarSenha || req.body?.passwordConfirmation || '',
    });
    logPasswordReset('confirm_completed', req, { status: 'success' });

    return res.status(200).json({
      ok: true,
      data,
    });
  } catch (error) {
    logPasswordReset('confirm_error', req, { status: 'error', error: error?.message || String(error || '') });
    return next(error);
  }
};

module.exports = {
  login,
  signup,
  me,
  logout,
  changePassword,
  confirmEmailVerificationFlow,
  resendEmailVerificationFlow,
  requestPasswordResetFlow,
  validatePasswordResetFlow,
  confirmPasswordResetFlow,
  impersonateClinicAdmin,
};
