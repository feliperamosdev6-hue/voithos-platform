const { relationshipService } = require('../services/relationshipService');

const getInternalRelationshipOverview = async (req, res, next) => {
  try {
    const data = await relationshipService.getOverview({
      clinicId: req?.query?.clinicId || '',
      date: req?.query?.date || '',
      dueSoonDays: req?.query?.dueSoonDays || 3,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

module.exports = { getInternalRelationshipOverview };
