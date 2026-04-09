const { inboundMessageService } = require('../services/inboundMessageService');
const { outboundMessageService } = require('../services/outboundMessageService');

const receiveInboundWhatsapp = async (req, res, next) => {
  try {
    const data = await inboundMessageService.receiveWhatsappInbound(req.body || {});
    return res.status(201).json({
      ok: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

const listInternalInboundWhatsapp = async (req, res, next) => {
  try {
    const data = await inboundMessageService.listRecent({
      clinicId: req.query.clinicId,
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

const resetInternalClinicWhatsappContext = async (req, res, next) => {
  try {
    const data = await outboundMessageService.resetClinicWhatsappReplyContexts({
      clinicId: String(req.body?.clinicId || '').trim(),
      reason: req.body?.reason,
    });
    return res.status(200).json({
      ok: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { receiveInboundWhatsapp, listInternalInboundWhatsapp, resetInternalClinicWhatsappContext };
