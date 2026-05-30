const { subscriptionService } = require('../services/subscriptionService');
const { requireSuperAdmin } = require('../utils/accessControl');

const getActorContext = (req) => ({
  actorId: req?.auth?.userId || '',
  actorEmail: req?.auth?.email || '',
});

const updateSuperAdminSubscriptionPrice = async (req, res, next) => {
  try {
    requireSuperAdmin(req);
    const data = await subscriptionService.updateCommercialPrice({
      clinicId: req?.params?.clinicId || '',
      billingAmount: req?.body?.billingAmount,
      amount: req?.body?.amount,
      customPriceEnabled: req?.body?.customPriceEnabled,
      reason: req?.body?.reason || req?.body?.commercialNotes || '',
      ...getActorContext(req),
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const applySuperAdminSubscriptionDiscount = async (req, res, next) => {
  try {
    requireSuperAdmin(req);
    const data = await subscriptionService.applyCommercialDiscount({
      clinicId: req?.params?.clinicId || '',
      discountAmount: req?.body?.discountAmount,
      baseAmount: req?.body?.baseAmount,
      reason: req?.body?.reason || '',
      ...getActorContext(req),
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const extendSuperAdminSubscriptionTrial = async (req, res, next) => {
  try {
    requireSuperAdmin(req);
    const data = await subscriptionService.extendTrial({
      clinicId: req?.params?.clinicId || '',
      days: req?.body?.days,
      extendDays: req?.body?.extendDays,
      trialEndsAt: req?.body?.trialEndsAt,
      reason: req?.body?.reason || '',
      ...getActorContext(req),
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const updateSuperAdminSubscriptionBillingCycle = async (req, res, next) => {
  try {
    requireSuperAdmin(req);
    const data = await subscriptionService.updateBillingCycle({
      clinicId: req?.params?.clinicId || '',
      billingCycle: req?.body?.billingCycle,
      reason: req?.body?.reason || '',
      ...getActorContext(req),
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const updateSuperAdminSubscriptionCommercialNotes = async (req, res, next) => {
  try {
    requireSuperAdmin(req);
    const data = await subscriptionService.updateCommercialNotes({
      clinicId: req?.params?.clinicId || '',
      commercialNotes: req?.body?.commercialNotes,
      notes: req?.body?.notes,
      ...getActorContext(req),
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const getSuperAdminSubscriptionTimeline = async (req, res, next) => {
  try {
    requireSuperAdmin(req);
    const data = await subscriptionService.getCommercialTimeline({
      clinicId: req?.params?.clinicId || '',
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  updateSuperAdminSubscriptionPrice,
  applySuperAdminSubscriptionDiscount,
  extendSuperAdminSubscriptionTrial,
  updateSuperAdminSubscriptionBillingCycle,
  updateSuperAdminSubscriptionCommercialNotes,
  getSuperAdminSubscriptionTimeline,
};
