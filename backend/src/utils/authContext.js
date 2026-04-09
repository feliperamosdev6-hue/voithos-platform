const { AppError } = require('../errors/AppError');

const getAuthenticatedClinicId = (req) => {
  const clinicId = String(req?.auth?.clinicId || '').trim();
  if (!clinicId) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authenticated clinic context is required.');
  }
  return clinicId;
};

module.exports = { getAuthenticatedClinicId };
