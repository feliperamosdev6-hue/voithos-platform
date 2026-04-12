const { AppError } = require('../errors/AppError');
const { authService } = require('../services/authService');
const { attachAuthContext, extractBearerToken } = require('./authenticate');

const authenticateOptional = async (req, _res, next) => {
  try {
    const token = extractBearerToken(req.header('authorization'));
    if (!token) {
      return next();
    }

    const user = await authService.getCurrentUser(token);
    if (!user) {
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired session.');
    }

    attachAuthContext(req, token, user);
    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = { authenticateOptional };
