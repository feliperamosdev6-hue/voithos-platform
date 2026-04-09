const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { AppError } = require('../errors/AppError');
const { clinicRepository } = require('../repositories/clinicRepository');
const { sessionRepository } = require('../repositories/sessionRepository');
const { userRepository } = require('../repositories/userRepository');

const SESSION_TTL_DAYS = 7;
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

const sanitizeUser = (user) => {
  if (!user) return null;
  return {
    id: user.id,
    nome: user.nome,
    email: user.email,
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
    impersonateClinicAdmin,
  },
};
