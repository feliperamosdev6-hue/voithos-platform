const { appEnv } = require('../config/appEnv');
const { AppError } = require('../errors/AppError');

const serviceAuthenticate = (req, _res, next) => {
  try {
    const expected = String(appEnv.backendInternalApiToken || '').trim();
    if (!expected) {
      throw new AppError(503, 'SERVICE_AUTH_NOT_CONFIGURED', 'Internal service authentication is not configured.');
    }

    const received = String(req.header('x-service-token') || '').trim();
    if (!received || received !== expected) {
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid internal service token.');
    }

    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = { serviceAuthenticate };
