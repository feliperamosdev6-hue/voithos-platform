const { clinicService } = require('../services/clinicService');
const { authService } = require('../services/authService');

const createClinicWithAdmin = async (req, res, next) => {
  try {
    const data = await clinicService.createWithAdmin(req.body || {});
    return res.status(201).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const impersonateClinicAdmin = async (req, res, next) => {
  try {
    const data = await authService.impersonateClinicAdmin(req.body?.clinicId || req.query?.clinicId || '');
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createClinicWithAdmin,
  impersonateClinicAdmin,
};
