const { appEnv } = require('../config/appEnv');
const { AppError } = require('../errors/AppError');

const isInternalServiceRequest = (req) => {
  const expected = String(appEnv.backendInternalApiToken || '').trim();
  const received = String(req?.header?.('x-service-token') || '').trim();
  return Boolean(expected && received && received === expected);
};

const requireSuperAdmin = (req) => {
  const role = String(req?.auth?.role || '').trim().toUpperCase();
  if (role !== 'SUPER_ADMIN') {
    throw new AppError(403, 'FORBIDDEN', 'Super admin access is required.');
  }
};

module.exports = {
  isInternalServiceRequest,
  requireSuperAdmin,
};
