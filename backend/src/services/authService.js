const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { AppError } = require('../errors/AppError');
const { clinicRepository } = require('../repositories/clinicRepository');
const { sessionRepository } = require('../repositories/sessionRepository');
const { userRepository } = require('../repositories/userRepository');
const { emailService } = require('./emailService');

const SESSION_TTL_DAYS = 7;
const PASSWORD_RESET_CODE_TTL_MINUTES = 10;
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

const sanitizeUser = (user) => {
  if (!user) return null;
  return {
    id: user.id,
    nome: user.nome,
    email: user.email,
    emailVerified: user.emailVerified === true,
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
  if (!normalizedEmail) {
    throw new AppError(400, 'VALIDATION_ERROR', 'email is required.');
  }

  const resetCode = generateSixDigitCode();
  const expiresAt = addMinutes(new Date(), PASSWORD_RESET_CODE_TTL_MINUTES);
  const user = await userRepository.findByEmail(normalizedEmail);
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
    console.info('[auth] password reset requested for non-active account', {
      email: maskEmail(normalizedEmail),
      accountFound: Boolean(user),
      active: user?.ativo !== false,
    });
  }

  if (updateResult?.count > 0) {
    try {
      const emailResult = await emailService.sendPasswordResetEmail(normalizedEmail, resetCode);
      console.info('[email] Password reset email accepted', {
        email: maskEmail(normalizedEmail),
        resendEmailId: emailResult?.data?.id || '',
      });
    } catch (emailError) {
      console.error('[email] Failed to send password reset email', {
        email: maskEmail(normalizedEmail),
        error: emailError?.message || emailError,
        resendError: emailError?.resendError || null,
      });
    }
  }

  return {
    requested: true,
  };
};

const confirmEmailVerification = async ({ email, code }) => {
  const normalizedEmail = normalizeEmail(email);
  const normalizedCode = normalizeCode(code);

  if (!normalizedEmail) {
    throw new AppError(400, 'VALIDATION_ERROR', 'email is required.');
  }

  if (!/^\d{6}$/.test(normalizedCode)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'verification code must contain 6 digits.');
  }

  const updateResult = await userRepository.confirmEmailVerificationByEmailAndCode({
    email: normalizedEmail,
    code: normalizedCode,
  });

  if (!updateResult || updateResult.count === 0) {
    throw new AppError(400, 'INVALID_VERIFICATION_CODE', 'Invalid or expired verification code.');
  }

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
