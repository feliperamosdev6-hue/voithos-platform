const { promotionOfferService } = require('../services/promotionOfferService');
const { requireSuperAdmin } = require('../utils/accessControl');

const listPromotionOffers = async (req, res, next) => {
  try {
    requireSuperAdmin(req);
    const data = await promotionOfferService.listOffers();
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const createPromotionOffer = async (req, res, next) => {
  try {
    requireSuperAdmin(req);
    const data = await promotionOfferService.createOffer({
      payload: req.body || {},
      actorId: req?.auth?.userId || '',
    });
    return res.status(201).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const updatePromotionOffer = async (req, res, next) => {
  try {
    requireSuperAdmin(req);
    const data = await promotionOfferService.updateOffer({
      id: req.params?.id || '',
      payload: req.body || {},
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const deactivatePromotionOffer = async (req, res, next) => {
  try {
    requireSuperAdmin(req);
    const data = await promotionOfferService.setOfferActive({
      id: req.params?.id || '',
      active: false,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const validatePromotionOffer = async (req, res, next) => {
  try {
    const data = await promotionOfferService.validateOfferByCode({
      code: req.params?.code || req.query?.code || '',
      targetEmail: req.query?.email || '',
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listPromotionOffers,
  createPromotionOffer,
  updatePromotionOffer,
  deactivatePromotionOffer,
  validatePromotionOffer,
};
