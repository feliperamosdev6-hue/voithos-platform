const { subscriptionService } = require('../services/subscriptionService');

const checkSubscription = async (req, _res, next) => {
  try {
    const overview = await subscriptionService.ensureAccess({
      clinicId: req.auth?.clinicId || '',
      role: req.auth?.role || '',
    });

    req.subscription = overview.subscription;
    req.subscriptionAccess = {
      effectiveStatus: overview.effectiveStatus,
      warning: overview.warning,
      bypassed: overview.bypassed === true,
    };

    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  checkSubscription,
};
