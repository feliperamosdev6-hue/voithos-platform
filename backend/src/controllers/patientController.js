const { patientService } = require('../services/patientService');
const { getAuthenticatedClinicId } = require('../utils/authContext');

const listPatients = async (req, res, next) => {
  try {
    const patients = await patientService.listByClinic(getAuthenticatedClinicId(req));
    return res.json({
      ok: true,
      data: patients,
    });
  } catch (error) {
    return next(error);
  }
};

const getPatientById = async (req, res, next) => {
  try {
    const patient = await patientService.findByIdForClinic(req.params.id, getAuthenticatedClinicId(req));

    return res.json({
      ok: true,
      data: patient,
    });
  } catch (error) {
    return next(error);
  }
};

const createPatient = async (req, res, next) => {
  try {
    const created = await patientService.createForClinic(getAuthenticatedClinicId(req), req.body || {});
    return res.status(201).json({
      ok: true,
      data: created,
    });
  } catch (error) {
    return next(error);
  }
};

const updatePatient = async (req, res, next) => {
  try {
    const updated = await patientService.updateForClinic({
      id: req.params.id,
      clinicId: getAuthenticatedClinicId(req),
      input: req.body || {},
    });
    return res.status(200).json({
      ok: true,
      data: updated,
    });
  } catch (error) {
    return next(error);
  }
};

const uploadPatientProfilePhoto = async (req, res, next) => {
  try {
    const data = await patientService.updateProfilePhotoForClinic({
      id: req.params.id,
      clinicId: getAuthenticatedClinicId(req),
      buffer: Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || []),
      fileName: decodeURIComponent(String(req.header('x-file-name') || '').trim() || ''),
      contentType: String(req.header('content-type') || 'application/octet-stream').trim(),
    });
    return res.status(200).json({
      ok: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

const downloadPatientProfilePhoto = async (req, res, next) => {
  try {
    const photo = await patientService.getProfilePhotoForClinic({
      id: req.params.id,
      clinicId: getAuthenticatedClinicId(req),
    });
    res.setHeader('Content-Type', photo.contentType || 'application/octet-stream');
    res.setHeader('Content-Length', String(photo.size || photo.buffer?.length || 0));
    res.setHeader('x-file-name', encodeURIComponent(String(photo.fileName || '').trim()));
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.status(200).send(photo.buffer);
  } catch (error) {
    return next(error);
  }
};

const deletePatient = async (req, res, next) => {
  try {
    const result = await patientService.deleteForClinic({
      id: req.params.id,
      clinicId: getAuthenticatedClinicId(req),
    });
    return res.status(200).json({
      ok: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listPatients,
  getPatientById,
  createPatient,
  updatePatient,
  uploadPatientProfilePhoto,
  downloadPatientProfilePhoto,
  deletePatient,
};
