const { subscriptionService } = require('../services/subscriptionService');
const { getAuthenticatedClinicId } = require('../utils/authContext');

const getMySubscription = async (req, res, next) => {
  try {
    const data = await subscriptionService.getMySubscription({
      clinicId: getAuthenticatedClinicId(req),
      role: req.auth?.role || '',
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const createSubscription = async (req, res, next) => {
  try {
    const data = await subscriptionService.createSubscription({
      clinicId: getAuthenticatedClinicId(req),
      planType: req.body?.planType,
      provider: req.body?.provider,
      externalPaymentId: req.body?.externalPaymentId,
      paymentLink: req.body?.paymentLink,
    });
    return res.status(201).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const confirmSubscriptionPayment = async (req, res, next) => {
  try {
    const data = await subscriptionService.confirmPayment({
      clinicId: getAuthenticatedClinicId(req),
      paymentId: req.body?.paymentId,
      provider: req.body?.provider,
      externalPaymentId: req.body?.externalPaymentId,
      paidAt: req.body?.paidAt,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const renewSubscription = async (req, res, next) => {
  try {
    const data = await subscriptionService.renewSubscription({
      clinicId: getAuthenticatedClinicId(req),
      planType: req.body?.planType,
      provider: req.body?.provider,
      externalPaymentId: req.body?.externalPaymentId,
      paymentLink: req.body?.paymentLink,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getMySubscription,
  createSubscription,
  confirmSubscriptionPayment,
  renewSubscription,
};
