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
    });
    return res.status(201).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const createSubscriptionCheckout = async (req, res, next) => {
  try {
    const data = await subscriptionService.createCheckoutSession({
      clinicId: getAuthenticatedClinicId(req),
      planType: req.body?.planType,
      paymentMethod: req.body?.paymentMethod,
      installmentCount: req.body?.installmentCount,
    });
    return res.status(201).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const confirmSubscriptionPayment = async (req, res, next) => {
  try {
    const data = await subscriptionService.getWebhookOnlyPaymentStatus({
      clinicId: getAuthenticatedClinicId(req),
      role: req.auth?.role || '',
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const refreshSubscriptionPaymentStatus = async (req, res, next) => {
  try {
    const data = await subscriptionService.refreshPaymentStatus({
      clinicId: getAuthenticatedClinicId(req),
      role: req.auth?.role || '',
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
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getMySubscription,
  createSubscription,
  createSubscriptionCheckout,
  confirmSubscriptionPayment,
  refreshSubscriptionPaymentStatus,
  renewSubscription,
};
