const { userService } = require('../services/userService');
const { getAuthenticatedClinicId } = require('../utils/authContext');
const { AppError } = require('../errors/AppError');

const requireAdmin = (req) => {
  const role = String(req?.auth?.role || '').trim().toUpperCase();
  const isClinicAdmin = req?.auth?.isClinicAdmin === true;
  if (!isClinicAdmin && role !== 'SUPER_ADMIN') {
    throw new AppError(403, 'FORBIDDEN', 'Admin access is required.');
  }
};

const listUsers = async (req, res, next) => {
  try {
    const users = await userService.listByClinic(getAuthenticatedClinicId(req));
    return res.json({
      ok: true,
      data: users,
    });
  } catch (error) {
    return next(error);
  }
};

const createUser = async (req, res, next) => {
  try {
    requireAdmin(req);
    const user = await userService.createForClinic(getAuthenticatedClinicId(req), req.body || {});
    return res.status(201).json({ ok: true, data: user });
  } catch (error) {
    return next(error);
  }
};

const updateUser = async (req, res, next) => {
  try {
    requireAdmin(req);
    const user = await userService.updateForClinic(getAuthenticatedClinicId(req), req.params.id, req.body || {});
    return res.status(200).json({ ok: true, data: user });
  } catch (error) {
    return next(error);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    requireAdmin(req);
    const result = await userService.resetPasswordForClinic(
      getAuthenticatedClinicId(req),
      req.params.id,
      req.body?.password || req.body?.novaSenha || ''
    );
    return res.status(200).json({ ok: true, data: result });
  } catch (error) {
    return next(error);
  }
};

const deleteUser = async (req, res, next) => {
  try {
    requireAdmin(req);
    const result = await userService.deleteForClinic(getAuthenticatedClinicId(req), req.params.id);
    return res.status(200).json({ ok: true, data: result });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listUsers,
  createUser,
  updateUser,
  resetPassword,
  deleteUser,
};
