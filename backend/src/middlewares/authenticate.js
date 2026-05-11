const { AppError } = require('../errors/AppError');
const { authService } = require('../services/authService');

const extractBearerToken = (authorizationHeader) => {
  const raw = String(authorizationHeader || '').trim();
  if (!raw) return '';
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match ? String(match[1] || '').trim() : '';
};

const attachAuthContext = (req, token, user) => {
  req.auth = {
    token,
    userId: user.id,
    email: user.email,
    clinicId: user.clinicId,
    role: user.role,
    isClinicAdmin: user.isClinicAdmin === true,
  };
};

const authenticate = async (req, _res, next) => {
  try {
    const token = extractBearerToken(req.header('authorization'));
    if (!token) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication token is required.');
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

module.exports = {
  authenticate,
  attachAuthContext,
  extractBearerToken,
};
