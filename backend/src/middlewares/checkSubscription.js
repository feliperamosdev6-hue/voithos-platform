const { appEnv } = require('../config/appEnv');
const { AppError } = require('../errors/AppError');
const {
  ACCESS_MODES,
  SUBSCRIPTION_READ_ONLY_CODE,
  SUBSCRIPTION_READ_ONLY_MESSAGE,
  subscriptionService,
} = require('../services/subscriptionService');

const normalizeMode = (mode) => String(mode || '').trim().toUpperCase() === 'WRITE' ? 'WRITE' : 'READ';

const attachSubscriptionAccess = (req, overview) => {
  req.subscription = overview?.subscription || null;
  req.subscriptionAccess = {
    effectiveStatus: overview?.effectiveStatus || '',
    accessMode: overview?.accessMode || ACCESS_MODES.DENIED,
    readOnly: overview?.readOnly === true,
    warning: overview?.warning || '',
    bypassed: overview?.bypassed === true,
    enforcementEnabled: overview?.enforcementEnabled === true,
    legacyAccess: overview?.legacyAccess === true,
    technicalNotice: overview?.technicalNotice || '',
  };
};

const checkSubscription = async (req, _res, next) => {
  try {
    if (appEnv.subscriptionEnforcementEnabled !== true) {
      req.subscription = null;
      req.subscriptionAccess = {
        effectiveStatus: 'ENFORCEMENT_DISABLED',
        accessMode: ACCESS_MODES.FULL,
        readOnly: false,
        warning: 'Cobranca desativada por feature flag.',
        bypassed: true,
        enforcementEnabled: false,
        legacyAccess: false,
        technicalNotice: 'subscription_enforcement_disabled',
      };
      return next();
    }

    const overview = await subscriptionService.getAccessOverview({
      clinicId: req.auth?.clinicId || '',
      role: req.auth?.role || '',
    });

    attachSubscriptionAccess(req, overview);
    if (overview.accessMode === ACCESS_MODES.DENIED) {
      await subscriptionService.ensureAccess({
        clinicId: req.auth?.clinicId || '',
        role: req.auth?.role || '',
      });
    }

    return next();
  } catch (error) {
    return next(error);
  }
};

const requireSubscriptionAccess = (mode = 'READ') => async (req, _res, next) => {
  try {
    const requestedMode = normalizeMode(mode);
    if (appEnv.subscriptionEnforcementEnabled !== true) {
      return next();
    }

    const overview = req.subscriptionAccess
      ? {
          subscription: req.subscription || null,
          ...req.subscriptionAccess,
        }
      : await subscriptionService.getAccessOverview({
          clinicId: req.auth?.clinicId || '',
          role: req.auth?.role || '',
        });

    if (!req.subscriptionAccess) {
      attachSubscriptionAccess(req, overview);
    }

    if (overview.accessMode === ACCESS_MODES.READ_ONLY && requestedMode === 'WRITE') {
      throw new AppError(403, SUBSCRIPTION_READ_ONLY_CODE, SUBSCRIPTION_READ_ONLY_MESSAGE);
    }

    if (overview.accessMode === ACCESS_MODES.DENIED) {
      await subscriptionService.ensureAccess({
        clinicId: req.auth?.clinicId || '',
        role: req.auth?.role || '',
      });
    }

    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  checkSubscription,
  requireSubscriptionAccess,
};
