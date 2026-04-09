const { patientService } = require('../services/patientService');

const listInternalPatients = async (req, res, next) => {
  try {
    const data = await patientService.listByClinic(String(req.query?.clinicId || '').trim());
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const getInternalPatientById = async (req, res, next) => {
  try {
    const data = await patientService.findByIdForClinic(
      req.params.id,
      String(req.query?.clinicId || req.body?.clinicId || '').trim(),
    );
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const createInternalPatient = async (req, res, next) => {
  try {
    const clinicId = String(req.body?.clinicId || '').trim();
    const input = { ...(req.body || {}) };
    delete input.clinicId;
    const data = await patientService.createForClinic(clinicId, input);
    return res.status(201).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const updateInternalPatient = async (req, res, next) => {
  try {
    const clinicId = String(req.body?.clinicId || '').trim();
    const input = { ...(req.body || {}) };
    delete input.clinicId;
    const data = await patientService.updateForClinic({
      id: req.params.id,
      clinicId,
      input,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const deleteInternalPatient = async (req, res, next) => {
  try {
    const data = await patientService.deleteForClinic({
      id: req.params.id,
      clinicId: String(req.query?.clinicId || req.body?.clinicId || '').trim(),
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listInternalPatients,
  getInternalPatientById,
  createInternalPatient,
  updateInternalPatient,
  deleteInternalPatient,
};
