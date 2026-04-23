const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { AppError } = require('../errors/AppError');
const { prisma } = require('../db/prisma');
const { clinicRepository } = require('../repositories/clinicRepository');
const { pendingSignupRepository } = require('../repositories/pendingSignupRepository');
const { sessionRepository } = require('../repositories/sessionRepository');
const { userRepository } = require('../repositories/userRepository');
const { emailService } = require('./emailService');

const SESSION_TTL_DAYS = 7;
const PASSWORD_RESET_CODE_TTL_MINUTES = 10;
const SIGNUP_RESEND_WAIT_MINUTES = 5;
const SUPER_ADMIN_EMAIL = String(process.env.VOITHOS_SUPERADMIN_EMAIL || 'superadmin@voithos.local').trim().toLowerCase();
const SUPER_ADMIN_PASSWORD = String(process.env.VOITHOS_SUPERADMIN_PASSWORD || 'voithos@2026').trim();
const SUPER_ADMIN_CLINIC_EMAIL = String(process.env.VOITHOS_SUPERADMIN_CLINIC_EMAIL || 'superadmin-clinic@voithos.local').trim().toLowerCase();
const SUPER_ADMIN_CLINIC_NAME = String(process.env.VOITHOS_SUPERADMIN_CLINIC_NAME || 'Voithos Platform').trim();

const isMissingTableError = (error) => error && error.code === 'P2021';

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + Number(days || 0));
  return next;
};

const addMinutes = (date, minutes) => {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + Number(minutes || 0));
  return next;
};

const getSignupResendAvailableAt = () => addMinutes(new Date(), SIGNUP_RESEND_WAIT_MINUTES);

const generateSixDigitCode = () => crypto.randomInt(0, 1000000).toString().padStart(6, '0');

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const normalizeCode = (value) => String(value || '').trim().replace(/\D/g, '').slice(0, 6);

const maskEmail = (email) => {
  const normalized = normalizeEmail(email);
  const [localPart = '', domain = ''] = normalized.split('@');
  if (!localPart || !domain) return 'seu e-mail';
  const localMask = localPart.length <= 2
    ? `${localPart[0] || '*'}*`
    : `${localPart.slice(0, 2)}***`;
  return `${localMask}@${domain}`;
};

const logPasswordReset = (stage, details = {}) => {
  console.info('[password-reset][auth-service]', {
    stage,
    endpoint: details.endpoint || '',
    email: details.email ? maskEmail(details.email) : '',
    status: details.status || '',
    userFound: details.userFound,
    active: details.active,
    updateCount: details.updateCount,
    resendEmailId: details.resendEmailId || '',
    fallback: false,
    error: details.error || '',
    resendError: details.resendError || null,
  });
};

const logAuthDiagnostic = (stage, details = {}) => {
  console.info('[auth][auth-service]', {
    stage,
    endpoint: details.endpoint || '',
    email: details.email ? maskEmail(details.email) : '',
    status: details.status || '',
    error: details.error || '',
  });
};

const sanitizeUser = (user) => {
  if (!user) return null;
  const emailVerificationPending = user.emailVerified !== true && Boolean(user.emailVerificationCode);
  return {
    id: user.id,
    nome: user.nome,
    email: user.email,
    emailVerified: user.emailVerified === true,
    emailVerificationPending,
    role: String(user.role || '').trim().toUpperCase(),
    clinicId: user.clinicId,
    isClinicAdmin: user.isClinicAdmin === true || ['ADMIN', 'SUPER_ADMIN'].includes(String(user.role || '').trim().toUpperCase()),
  };
};

const hashPassword = async (password) => {
  const raw = String(password || '');
  if (!raw.trim()) {
    throw new AppError(400, 'VALIDATION_ERROR', 'password is required.');
  }
  return bcrypt.hash(raw, 10);
};

const verifyPassword = async (password, hash) => {
  const rawPassword = String(password || '');
  const rawHash = String(hash || '');
  if (!rawPassword || !rawHash) return false;
  return bcrypt.compare(rawPassword, rawHash);
};

const requestPasswordReset = async ({ email }) => {
  const normalizedEmail = normalizeEmail(email);
  let deliveryConfirmed = false;
  logPasswordReset('request_started', {
    endpoint: '/auth/password-reset/request',
    email: normalizedEmail,
    status: 'started',
  });
  if (!normalizedEmail) {
    logPasswordReset('request_validation_failed', {
      endpoint: '/auth/password-reset/request',
      status: 'missing_email',
    });
    throw new AppError(400, 'VALIDATION_ERROR', 'email is required.');
  }

  const resetCode = generateSixDigitCode();
  const expiresAt = addMinutes(new Date(), PASSWORD_RESET_CODE_TTL_MINUTES);
  logPasswordReset('code_generated', {
    endpoint: '/auth/password-reset/request',
    email: normalizedEmail,
    status: 'generated',
  });

  logPasswordReset('user_lookup_started', {
    endpoint: '/auth/password-reset/request',
    email: normalizedEmail,
    status: 'started',
  });
  const user = await userRepository.findByEmail(normalizedEmail);
  logPasswordReset('user_lookup_completed', {
    endpoint: '/auth/password-reset/request',
    email: normalizedEmail,
    status: user ? 'found' : 'not_found',
    userFound: Boolean(user),
    active: user?.ativo !== false,
  });
  const updateResult = user && user.ativo !== false
    ? await userRepository.updateByEmail({
      email: normalizedEmail,
      data: {
        passwordResetCode: resetCode,
        passwordResetExpiresAt: expiresAt,
      },
    })
    : { count: 0 };

  if (!user || user.ativo === false) {
    logPasswordReset('non_active_account', {
      endpoint: '/auth/password-reset/request',
      email: normalizedEmail,
      status: user ? 'inactive' : 'not_found',
      userFound: Boolean(user),
      active: user?.ativo !== false,
    });
  }

  if (updateResult?.count > 0) {
    logPasswordReset('code_persisted', {
      endpoint: '/auth/password-reset/request',
      email: normalizedEmail,
      status: 'persisted',
      updateCount: updateResult.count,
    });
    try {
      logPasswordReset('email_send_started', {
        endpoint: '/auth/password-reset/request',
        email: normalizedEmail,
        status: 'started',
      });
      const emailResult = await emailService.sendPasswordResetEmail(normalizedEmail, resetCode);
      deliveryConfirmed = emailResult?.success === true;
      if (deliveryConfirmed) {
        logPasswordReset('email_send_accepted', {
          endpoint: '/auth/password-reset/request',
          email: normalizedEmail,
          status: 'accepted',
          resendEmailId: emailResult?.resendEmailId || emailResult?.data?.id || '',
        });
      } else {
        logPasswordReset('email_send_failed', {
          endpoint: '/auth/password-reset/request',
          email: normalizedEmail,
          status: 'failed',
          error: emailResult?.error || 'Email send failed.',
          resendError: emailResult?.resendError || null,
        });
      }
    } catch (emailError) {
      logPasswordReset('email_send_failed', {
        endpoint: '/auth/password-reset/request',
        email: normalizedEmail,
        status: 'failed',
        error: emailError?.message || emailError,
        resendError: emailError?.resendError || null,
      });
      deliveryConfirmed = false;
    }
  }

  logPasswordReset('request_completed', {
    endpoint: '/auth/password-reset/request',
    email: normalizedEmail,
    status: 'completed',
    updateCount: updateResult?.count || 0,
  });

  return {
    requested: true,
    deliveryConfirmed,
  };
};

const extractPendingSignupData = (pendingSignup) => {
  const rawData = pendingSignup?.signupData && typeof pendingSignup.signupData === 'object'
    ? pendingSignup.signupData
    : {};
  return {
    documentType: String(rawData.documentType || '').trim().toUpperCase(),
    documentNumber: String(rawData.documentNumber || '').trim().replace(/\D/g, ''),
    nomeFantasia: String(rawData.nomeFantasia || '').trim(),
    adminNome: String(rawData.adminNome || '').trim(),
    adminEmail: normalizeEmail(rawData.adminEmail || pendingSignup?.email || ''),
    clinicEmail: normalizeEmail(rawData.clinicEmail || rawData.adminEmail || pendingSignup?.email || ''),
    clinicPhone: String(rawData.clinicPhone || '').trim(),
  };
};

const finalizePendingSignup = async (pendingSignup) => {
  const signupData = extractPendingSignupData(pendingSignup);
  const passwordHash = String(pendingSignup?.passwordHash || '').trim();
  if (!signupData.nomeFantasia || !signupData.adminNome || !signupData.adminEmail || !signupData.documentNumber) {
    throw new AppError(400, 'PENDING_SIGNUP_INVALID', 'Pending signup data is invalid.');
  }
  if (!passwordHash) {
    throw new AppError(400, 'PENDING_SIGNUP_INVALID', 'Pending signup password hash is missing.');
  }

  const duplicateClinic = await clinicRepository.findByDocument(signupData.documentNumber);
  if (duplicateClinic) {
    throw new AppError(409, 'CLINIC_DOCUMENT_EXISTS', 'CPF/CNPJ already exists.');
  }

  const duplicateUser = await userRepository.findByEmail(signupData.adminEmail);
  if (duplicateUser) {
    throw new AppError(409, 'USER_EMAIL_EXISTS', 'Admin email already exists.');
  }

  const created = await prisma.$transaction(async (tx) => {
    const clinic = await tx.clinic.create({
      data: {
        nomeFantasia: signupData.nomeFantasia,
        razaoSocial: signupData.nomeFantasia,
        cnpjCpf: signupData.documentNumber,
        email: signupData.clinicEmail || signupData.adminEmail || null,
        telefoneComercial: signupData.clinicPhone || null,
        endereco: null,
      },
    });

    const user = await tx.user.create({
      data: {
        clinicId: clinic.id,
        nome: signupData.adminNome,
        email: signupData.adminEmail,
        passwordHash,
        role: 'ADMIN',
        isClinicAdmin: true,
        ativo: true,
        emailVerified: true,
        emailVerificationCode: null,
        emailVerificationExpiresAt: null,
      },
    });

    await tx.$executeRaw`
      DELETE FROM "PendingSignup"
      WHERE "email" = ${signupData.adminEmail}
    `;

    const token = crypto.randomUUID();
    const expiresAt = addDays(new Date(), SESSION_TTL_DAYS);
    const session = await tx.session.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });

    return {
      token: session.token,
      clinic,
      user,
    };
  });

  return {
    verified: true,
    token: created.token,
    clinic: {
      ...created.clinic,
      clinicId: created.clinic.id,
    },
    user: sanitizeUser(created.user),
  };
};

const confirmEmailVerification = async ({ email, code }) => {
  const normalizedEmail = normalizeEmail(email);
  const normalizedCode = normalizeCode(code);
  logAuthDiagnostic('email_verification_started', {
    endpoint: '/auth/email-verification/confirm',
    email: normalizedEmail,
    status: 'started',
  });

  if (!normalizedEmail) {
    logAuthDiagnostic('email_verification_validation_failed', {
      endpoint: '/auth/email-verification/confirm',
      email: normalizedEmail,
      status: 'missing_email',
    });
    throw new AppError(400, 'VALIDATION_ERROR', 'email is required.');
  }

  if (!/^\d{6}$/.test(normalizedCode)) {
    logAuthDiagnostic('email_verification_validation_failed', {
      endpoint: '/auth/email-verification/confirm',
      email: normalizedEmail,
      status: 'invalid_code_format',
    });
    throw new AppError(400, 'VALIDATION_ERROR', 'verification code must contain 6 digits.');
  }

  const pendingSignup = await pendingSignupRepository.findByEmail(normalizedEmail);
  logAuthDiagnostic('email_verification_pending_signup_lookup', {
    endpoint: '/auth/email-verification/confirm',
    email: normalizedEmail,
    status: pendingSignup ? 'found' : 'not_found',
  });
  const pendingExpiresAt = pendingSignup?.verificationExpiresAt ? new Date(pendingSignup.verificationExpiresAt).getTime() : 0;
  if (pendingSignup) {
    if (String(pendingSignup.verificationCode || '') !== normalizedCode || !pendingExpiresAt || pendingExpiresAt <= Date.now()) {
      logAuthDiagnostic('email_verification_pending_signup_invalid', {
        endpoint: '/auth/email-verification/confirm',
        email: normalizedEmail,
        status: 'invalid_or_expired',
      });
      throw new AppError(400, 'INVALID_VERIFICATION_CODE', 'Invalid or expired verification code.');
    }
    const result = await finalizePendingSignup(pendingSignup);
    logAuthDiagnostic('email_verification_pending_signup_finalized', {
      endpoint: '/auth/email-verification/confirm',
      email: normalizedEmail,
      status: 'success',
    });
    return result;
  }

  logAuthDiagnostic('email_verification_fallback_user_lookup', {
    endpoint: '/auth/email-verification/confirm',
    email: normalizedEmail,
    status: 'started',
  });
  const updateResult = await userRepository.confirmEmailVerificationByEmailAndCode({
    email: normalizedEmail,
    code: normalizedCode,
  });

  if (!updateResult || updateResult.count === 0) {
    logAuthDiagnostic('email_verification_fallback_invalid', {
      endpoint: '/auth/email-verification/confirm',
      email: normalizedEmail,
      status: 'invalid_or_expired',
    });
    throw new AppError(400, 'INVALID_VERIFICATION_CODE', 'Invalid or expired verification code.');
  }

  logAuthDiagnostic('email_verification_fallback_completed', {
    endpoint: '/auth/email-verification/confirm',
    email: normalizedEmail,
    status: 'success',
  });
  return {
    verified: true,
  };
};

const validatePasswordResetCode = async ({ email, code }) => {
  const normalizedEmail = normalizeEmail(email);
  const normalizedCode = normalizeCode(code);

  if (!normalizedEmail) {
    throw new AppError(400, 'VALIDATION_ERROR', 'email is required.');
  }

  if (!/^\d{6}$/.test(normalizedCode)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'reset code must contain 6 digits.');
  }

  const user = await userRepository.findByEmail(normalizedEmail);
  const now = Date.now();
  const expiresAt = user?.passwordResetExpiresAt ? new Date(user.passwordResetExpiresAt).getTime() : 0;

  if (
    !user
    || user.ativo === false
    || String(user.passwordResetCode || '') !== normalizedCode
    || !expiresAt
    || expiresAt <= now
  ) {
    throw new AppError(400, 'INVALID_RESET_CODE', 'Invalid or expired reset code.');
  }

  return {
    valid: true,
  };
};

const saveNewPassword = async ({
  email,
  code,
  newPassword,
  confirmPassword,
}) => {
  const normalizedEmail = normalizeEmail(email);
  const normalizedCode = normalizeCode(code);
  const rawNewPassword = String(newPassword || '').trim();
  const rawConfirmPassword = String(confirmPassword || '').trim();

  if (!normalizedEmail) {
    throw new AppError(400, 'VALIDATION_ERROR', 'email is required.');
  }

  if (!/^\d{6}$/.test(normalizedCode)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'reset code must contain 6 digits.');
  }

  if (!rawNewPassword || !rawConfirmPassword) {
    throw new AppError(400, 'VALIDATION_ERROR', 'newPassword and confirmPassword are required.');
  }

  if (rawNewPassword !== rawConfirmPassword) {
    throw new AppError(400, 'PASSWORD_CONFIRMATION_MISMATCH', 'Password confirmation does not match.');
  }

  const passwordHash = await hashPassword(rawNewPassword);
  const updateResult = await userRepository.updatePasswordResetByEmailAndCode({
    email: normalizedEmail,
    code: normalizedCode,
    passwordHash,
  });

  if (!updateResult || updateResult.count === 0) {
    throw new AppError(400, 'INVALID_RESET_CODE', 'Invalid or expired reset code.');
  }

  return {
    reset: true,
  };
};

const ensureSuperAdminUser = async () => {
  if (!SUPER_ADMIN_EMAIL || !SUPER_ADMIN_PASSWORD) return null;

  const existing = await userRepository.findByEmail(SUPER_ADMIN_EMAIL);
  if (existing) return existing;

  let clinic = await clinicRepository.findByEmail(SUPER_ADMIN_CLINIC_EMAIL);
  if (!clinic) {
    clinic = await clinicRepository.create({
      nomeFantasia: SUPER_ADMIN_CLINIC_NAME,
      razaoSocial: SUPER_ADMIN_CLINIC_NAME,
      email: SUPER_ADMIN_CLINIC_EMAIL,
      telefoneComercial: '',
      endereco: '',
      cnpjCpf: '',
    });
  }

  const passwordHash = await hashPassword(SUPER_ADMIN_PASSWORD);
  return userRepository.create({
    clinicId: clinic.id,
    nome: 'Super Admin Voithos',
    email: SUPER_ADMIN_EMAIL,
    passwordHash,
    role: 'SUPER_ADMIN',
    isClinicAdmin: true,
    ativo: true,
  });
};

const createSession = async (userId) => {
  const token = crypto.randomUUID();
  const expiresAt = addDays(new Date(), SESSION_TTL_DAYS);

  try {
    const session = await sessionRepository.create({
      userId,
      token,
      expiresAt,
    });
    return session;
  } catch (error) {
    if (isMissingTableError(error)) {
      throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
    }
    throw error;
  }
};

const getSessionByToken = async (token) => {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) return null;

  try {
    await sessionRepository.deleteExpired(new Date());
    const session = await sessionRepository.findByToken(normalizedToken);
    if (!session) return null;
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      await sessionRepository.deleteByToken(normalizedToken);
      return null;
    }
    return session;
  } catch (error) {
    if (isMissingTableError(error)) {
      throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
    }
    throw error;
  }
};

const getCurrentUser = async (token) => {
  const session = await getSessionByToken(token);
  if (!session) return null;

  try {
    const user = await userRepository.findById(session.userId);
    if (!user || user.ativo === false) return null;
    return sanitizeUser(user);
  } catch (error) {
    if (isMissingTableError(error)) {
      throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
    }
    throw error;
  }
};

const login = async ({ email, password }) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const rawPassword = String(password || '');

  if (!normalizedEmail) {
    throw new AppError(400, 'VALIDATION_ERROR', 'email is required.');
  }

  if (!rawPassword) {
    throw new AppError(400, 'VALIDATION_ERROR', 'password is required.');
  }

  let user;
  try {
    if (normalizedEmail === SUPER_ADMIN_EMAIL) {
      await ensureSuperAdminUser();
    }
    user = await userRepository.findByEmail(normalizedEmail);
  } catch (error) {
    if (isMissingTableError(error)) {
      throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
    }
    throw error;
  }

  if (!user) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid credentials.');
  }

  if (user.ativo === false) {
    throw new AppError(403, 'USER_INACTIVE', 'User is inactive.');
  }

  const passwordOk = await verifyPassword(rawPassword, user.passwordHash);
  if (!passwordOk) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid credentials.');
  }

  const session = await createSession(user.id);
  return {
    token: session.token,
    user: sanitizeUser(user),
  };
};

const logout = async (token) => {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication token is required.');
  }

  try {
    await sessionRepository.deleteByToken(normalizedToken);
    return { loggedOut: true };
  } catch (error) {
    if (isMissingTableError(error)) {
      throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
    }
    throw error;
  }
};

const changePassword = async ({ token, currentPassword, newPassword }) => {
  const normalizedToken = String(token || '').trim();
  const rawCurrentPassword = String(currentPassword || '').trim();
  const rawNewPassword = String(newPassword || '').trim();

  if (!normalizedToken) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication token is required.');
  }

  if (!rawCurrentPassword || !rawNewPassword) {
    throw new AppError(400, 'VALIDATION_ERROR', 'currentPassword and newPassword are required.');
  }

  const session = await getSessionByToken(normalizedToken);
  if (!session) {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired session.');
  }

  const user = await userRepository.findById(session.userId);
  if (!user || user.ativo === false) {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired session.');
  }

  const passwordOk = await verifyPassword(rawCurrentPassword, user.passwordHash);
  if (!passwordOk) {
    throw new AppError(400, 'INVALID_CURRENT_PASSWORD', 'Current password is invalid.');
  }

  const passwordHash = await hashPassword(rawNewPassword);
  await userRepository.updateByIdAndClinic({
    id: user.id,
    clinicId: user.clinicId,
    data: { passwordHash },
  });

  return { changed: true };
};

const impersonateClinicAdmin = async (clinicId) => {
  const normalizedClinicId = String(clinicId || '').trim();
  if (!normalizedClinicId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
  }

  const admin = await userRepository.findAdminByClinic(normalizedClinicId);
  if (!admin) {
    throw new AppError(404, 'CLINIC_ADMIN_NOT_FOUND', 'No admin user found for this clinic.');
  }

  const session = await createSession(admin.id);
  return {
    token: session.token,
    user: sanitizeUser(admin),
  };
};

module.exports = {
  SESSION_TTL_DAYS,
  authService: {
    hashPassword,
    verifyPassword,
    login,
    createSession,
    getSessionByToken,
    getCurrentUser,
    logout,
    changePassword,
    requestPasswordReset,
    confirmEmailVerification,
    validatePasswordResetCode,
    saveNewPassword,
    impersonateClinicAdmin,
  },
};
