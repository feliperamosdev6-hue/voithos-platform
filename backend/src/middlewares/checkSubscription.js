const { appEnv } = require('../config/appEnv');
const { subscriptionService } = require('../services/subscriptionService');

const checkSubscription = async (req, _res, next) => {
  try {
    if (appEnv.subscriptionEnforcementEnabled !== true) {
      req.subscription = null;
      req.subscriptionAccess = {
        effectiveStatus: 'ENFORCEMENT_DISABLED',
        warning: 'Cobranca desativada por feature flag.',
        bypassed: true,
        enforcementEnabled: false,
        legacyAccess: false,
        technicalNotice: 'subscription_enforcement_disabled',
      };
      return next();
    }

    const overview = await subscriptionService.ensureAccess({
      clinicId: req.auth?.clinicId || '',
      role: req.auth?.role || '',
    });

    req.subscription = overview.subscription;
    req.subscriptionAccess = {
      effectiveStatus: overview.effectiveStatus,
      warning: overview.warning,
      bypassed: overview.bypassed === true,
      enforcementEnabled: overview.enforcementEnabled === true,
      legacyAccess: overview.legacyAccess === true,
      technicalNotice: overview.technicalNotice || '',
    };

    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  checkSubscription,
};
