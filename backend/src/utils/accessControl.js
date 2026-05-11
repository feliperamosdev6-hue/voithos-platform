const { appEnv } = require('../config/appEnv');
const { AppError } = require('../errors/AppError');

const SUPER_ADMIN_EMAIL = String(process.env.VOITHOS_SUPERADMIN_EMAIL || 'superadmin@voithos.local').trim().toLowerCase();

const isInternalServiceRequest = (req) => {
  const expected = String(appEnv.backendInternalApiToken || '').trim();
  const received = String(req?.header?.('x-service-token') || '').trim();
  return Boolean(expected && received && received === expected);
};

const requireSuperAdmin = (req) => {
  const role = String(req?.auth?.role || '').trim().toUpperCase();
  const compactRole = role.replace(/[^A-Z0-9]/g, '');
  const email = String(req?.auth?.email || '').trim().toLowerCase();
  const isConfiguredSuperAdmin = Boolean(SUPER_ADMIN_EMAIL && email && email === SUPER_ADMIN_EMAIL);

  if (role !== 'SUPER_ADMIN' && compactRole !== 'SUPERADMIN' && !isConfiguredSuperAdmin) {
    throw new AppError(403, 'FORBIDDEN', 'Acesso de superadmin necessario.');
  }
};

module.exports = {
  isInternalServiceRequest,
  requireSuperAdmin,
};
