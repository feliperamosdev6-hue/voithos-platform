const { AppError } = require('../errors/AppError');

const ERROR_MESSAGES = {
  PATIENT_NOT_FOUND: 'Patient not found.',
  APPOINTMENT_NOT_FOUND: 'Appointment not found.',
  CLINIC_NOT_FOUND: 'Clinic not found.',
  USER_NOT_FOUND: 'User not found.',
};

const buildScopedNotFound = (entityCode = 'RESOURCE_NOT_FOUND') => new AppError(
  404,
  entityCode,
  ERROR_MESSAGES[entityCode] || 'Resource not found.',
);

const assertRecordBelongsToClinic = (record, clinicId, notFoundCode = 'RESOURCE_NOT_FOUND') => {
  const normalizedClinicId = String(clinicId || '').trim();
  if (!record) {
    throw buildScopedNotFound(notFoundCode);
  }

  if (normalizedClinicId && String(record.clinicId || '').trim() !== normalizedClinicId) {
    throw buildScopedNotFound(notFoundCode);
  }

  return record;
};

const sanitizeTenantInput = (payload = {}) => {
  if (!payload || typeof payload !== 'object') return {};
  const { clinicId, ...rest } = payload;
  return rest;
};

module.exports = {
  assertRecordBelongsToClinic,
  sanitizeTenantInput,
  buildScopedNotFound,
};
