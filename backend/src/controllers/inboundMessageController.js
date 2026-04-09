const { inboundMessageService } = require('../services/inboundMessageService');
const { getAuthenticatedClinicId } = require('../utils/authContext');

const listInboundMessages = async (req, res, next) => {
  try {
    const data = await inboundMessageService.listRecent({
      clinicId: getAuthenticatedClinicId(req),
      status: req.query.status,
      intent: req.query.intent,
      limit: req.query.limit,
    });
    return res.status(200).json({
      ok: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { listInboundMessages };
