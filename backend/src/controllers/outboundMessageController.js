const { outboundMessageService } = require('../services/outboundMessageService');
const { getAuthenticatedClinicId } = require('../utils/authContext');

const listOutboundMessages = async (req, res, next) => {
  try {
    const data = await outboundMessageService.listByClinic({
      clinicId: getAuthenticatedClinicId(req),
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

const getOutboundMessageById = async (req, res, next) => {
  try {
    const data = await outboundMessageService.getByIdForClinic({
      id: req.params.id,
      clinicId: getAuthenticatedClinicId(req),
    });
    return res.status(200).json({
      ok: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listOutboundMessages,
  getOutboundMessageById,
};
