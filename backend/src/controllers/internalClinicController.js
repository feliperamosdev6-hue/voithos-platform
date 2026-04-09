const { clinicService } = require('../services/clinicService');

const getInternalOperationalSettings = async (req, res, next) => {
  try {
    const data = await clinicService.getOperationalSettings({
      clinicId: String(req.query?.clinicId || '').trim(),
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const updateInternalOperationalSettings = async (req, res, next) => {
  try {
    const clinicId = String(req.body?.clinicId || req.query?.clinicId || '').trim();
    const patch = req.body?.patch && typeof req.body.patch === 'object'
      ? req.body.patch
      : { ...(req.body || {}) };
    delete patch.clinicId;
    const data = await clinicService.updateOperationalSettings({
      clinicId,
      patch,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getInternalOperationalSettings,
  updateInternalOperationalSettings,
};
