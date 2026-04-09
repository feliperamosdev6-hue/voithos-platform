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
  deletePatient,
};
