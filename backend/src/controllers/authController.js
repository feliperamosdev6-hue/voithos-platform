const { AppError } = require('../errors/AppError');
const { authService } = require('../services/authService');
const { clinicService } = require('../services/clinicService');
const { requireSuperAdmin } = require('../utils/accessControl');

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
    const result = await clinicService.publicSignup(req.body || {});
    return res.status(201).json({
      ok: true,
      data: result,
    });
  } catch (error) {
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

module.exports = {
  login,
  signup,
  me,
  logout,
  changePassword,
  impersonateClinicAdmin,
};
