const { AppError } = require('../errors/AppError');
const { userRepository } = require('../repositories/userRepository');

const isMissingTableError = (error) => error && error.code === 'P2021';
const normalizeOperationalRole = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'DENTISTA') return 'DENTISTA';
  if (normalized === 'RECEPCAO' || normalized === 'RECEPCIONISTA') return 'RECEPCAO';
  if (normalized === 'ADMIN' || normalized === 'ADMINISTRATIVO') return 'ADMIN';
  return 'RECEPCAO';
};

const userService = {
  sanitize: (user) => {
    if (!user) return null;
    const normalizedRole = String(user.role || '').trim().toUpperCase();
    return {
      id: user.id,
      nome: user.nome,
      email: user.email,
      role: normalizedRole,
      clinicId: user.clinicId,
      isClinicAdmin: user.isClinicAdmin === true || normalizedRole === 'ADMIN' || normalizedRole === 'SUPER_ADMIN',
      ativo: user.ativo !== false,
    };
  },

  listByClinic: async (clinicId) => {
    const normalizedClinicId = String(clinicId || '').trim();
    if (!normalizedClinicId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
    }

    try {
      const users = await userRepository.listByClinic(normalizedClinicId);
      return users.map(userService.sanitize);
    } catch (error) {
      if (isMissingTableError(error)) {
        return [];
      }
      throw error;
    }
  },

  createForClinic: async (clinicId, payload = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    if (!normalizedClinicId) throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
    const nome = String(payload?.nome || '').trim();
    const email = String(payload?.email || payload?.login || '').trim().toLowerCase();
    const role = normalizeOperationalRole(payload?.role || payload?.tipo || '');
    const password = String(payload?.password || payload?.senha || '').trim();
    const isClinicAdmin = payload?.isClinicAdmin === true || payload?.permissions?.admin === true;

    if (!nome || !email || !password) {
      throw new AppError(400, 'VALIDATION_ERROR', 'nome, email and password are required.');
    }

    const existing = await userRepository.findByEmail(email);
    if (existing && existing.id) {
      throw new AppError(409, 'USER_EMAIL_EXISTS', 'User email already exists.');
    }

    const { authService } = require('./authService');
    const passwordHash = await authService.hashPassword(password);
    const created = await userRepository.create({
      clinicId: normalizedClinicId,
      nome,
      email,
      passwordHash,
      role,
      isClinicAdmin,
      ativo: payload?.ativo !== false,
    });
    return userService.sanitize(created);
  },

  updateForClinic: async (clinicId, id, payload = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const normalizedId = String(id || '').trim();
    if (!normalizedClinicId || !normalizedId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId and id are required.');
    }

    const existing = await userRepository.findById(normalizedId);
    if (!existing || String(existing.clinicId || '').trim() !== normalizedClinicId) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User not found for this clinic.');
    }

    const nextEmail = String(payload?.email || payload?.login || existing.email || '').trim().toLowerCase();
    if (nextEmail && nextEmail !== String(existing.email || '').trim().toLowerCase()) {
      const duplicated = await userRepository.findByEmail(nextEmail);
      if (duplicated && duplicated.id !== existing.id) {
        throw new AppError(409, 'USER_EMAIL_EXISTS', 'User email already exists.');
      }
    }

    const data = {
      nome: String(payload?.nome || existing.nome || '').trim(),
      email: nextEmail || existing.email,
      role: normalizeOperationalRole(payload?.role || payload?.tipo || existing.role || 'RECEPCAO'),
      isClinicAdmin: payload?.isClinicAdmin === true
        || payload?.permissions?.admin === true
        || (payload?.isClinicAdmin === undefined && payload?.permissions?.admin === undefined && existing.isClinicAdmin === true),
      ativo: typeof payload?.ativo === 'boolean' ? payload.ativo : existing.ativo !== false,
    };

    await userRepository.updateByIdAndClinic({
      id: normalizedId,
      clinicId: normalizedClinicId,
      data,
    });

    return userService.sanitize(await userRepository.findById(normalizedId));
  },

  resetPasswordForClinic: async (clinicId, id, password) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const normalizedId = String(id || '').trim();
    const rawPassword = String(password || '').trim();
    if (!normalizedClinicId || !normalizedId || !rawPassword) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId, id and password are required.');
    }

    const existing = await userRepository.findById(normalizedId);
    if (!existing || String(existing.clinicId || '').trim() !== normalizedClinicId) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User not found for this clinic.');
    }

    const { authService } = require('./authService');
    const passwordHash = await authService.hashPassword(rawPassword);
    await userRepository.updateByIdAndClinic({
      id: normalizedId,
      clinicId: normalizedClinicId,
      data: { passwordHash },
    });
    return { success: true };
  },

  deleteForClinic: async (clinicId, id) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const normalizedId = String(id || '').trim();
    if (!normalizedClinicId || !normalizedId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId and id are required.');
    }

    const result = await userRepository.deleteByIdAndClinic({
      id: normalizedId,
      clinicId: normalizedClinicId,
    });
    return { success: result.count > 0 };
  },
};

module.exports = { userService };
