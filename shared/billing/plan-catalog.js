(function initPlanCatalog(root, factory) {
  const catalog = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = catalog;
  }
  if (root) {
    root.VoithosPlanCatalog = catalog;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildPlanCatalog() {
  const TRIAL_DAYS = 7;

  const freezePlan = (plan) => Object.freeze({
    ...plan,
    amountCents: Math.round(Number(plan.amount || 0) * 100),
    trialDays: TRIAL_DAYS,
  });

  const PLAN_CATALOG = Object.freeze({
    LEGACY: freezePlan({
      planType: 'LEGACY',
      slug: 'legacy',
      label: 'Legado',
      amount: 0,
      durationDays: null,
      billingCycle: 'LEGACY',
      intervalLabel: '',
      public: false,
      description: 'Plano legado interno.',
    }),
    MONTHLY: freezePlan({
      planType: 'MONTHLY',
      slug: 'monthly',
      label: 'Mensal',
      amount: 47.7,
      durationDays: 30,
      billingCycle: 'MONTHLY',
      intervalLabel: '/mes',
      public: true,
      description: '7 dias gratis. Depois, R$ 47,70/mes.',
    }),
    QUARTERLY: freezePlan({
      planType: 'QUARTERLY',
      slug: 'quarterly',
      label: 'Trimestral',
      amount: 269.9,
      durationDays: 90,
      billingCycle: 'QUARTERLY',
      intervalLabel: '/trimestre',
      public: true,
      description: 'Ciclo trimestral para continuidade operacional.',
    }),
    SEMIANNUAL: freezePlan({
      planType: 'SEMIANNUAL',
      slug: 'semiannual',
      label: 'Semestral',
      amount: 499.9,
      durationDays: 180,
      billingCycle: 'SEMIANNUAL',
      intervalLabel: '/semestre',
      public: true,
      description: 'Plano semestral para clinicas em crescimento.',
    }),
    ANNUAL: freezePlan({
      planType: 'ANNUAL',
      slug: 'annual',
      label: 'Anual',
      amount: 548.7,
      durationDays: 365,
      billingCycle: 'ANNUAL',
      intervalLabel: '/ano',
      public: true,
      description: '7 dias gratis e economia em relacao ao mensal.',
    }),
  });

  const PLAN_ALIASES = Object.freeze({
    mensal: 'MONTHLY',
    monthly: 'MONTHLY',
    mes: 'MONTHLY',
    month: 'MONTHLY',
    trimestral: 'QUARTERLY',
    quarterly: 'QUARTERLY',
    trimestre: 'QUARTERLY',
    semestral: 'SEMIANNUAL',
    semiannual: 'SEMIANNUAL',
    semestre: 'SEMIANNUAL',
    anual: 'ANNUAL',
    annual: 'ANNUAL',
    ano: 'ANNUAL',
    yearly: 'ANNUAL',
  });

  const formatMoneyBR = (value) => {
    const amount = Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
    return `R$ ${amount.toFixed(2).replace('.', ',')}`;
  };

  const clonePlan = (plan) => ({
    planType: plan.planType,
    slug: plan.slug,
    label: plan.label,
    amount: plan.amount,
    amountCents: plan.amountCents,
    durationDays: plan.durationDays,
    billingCycle: plan.billingCycle,
    intervalLabel: plan.intervalLabel,
    public: plan.public === true,
    trialDays: plan.trialDays,
    price: formatMoneyBR(plan.amount),
    description: plan.description,
  });

  const normalizePlanType = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const upper = raw.toUpperCase();
    if (PLAN_CATALOG[upper]) return upper;
    const lower = raw.toLowerCase().replace(/[\s_-]+/g, '');
    return PLAN_ALIASES[lower] || '';
  };

  const getPlanDefinition = (value) => {
    const planType = normalizePlanType(value);
    const plan = PLAN_CATALOG[planType];
    return plan ? clonePlan(plan) : null;
  };

  const getPublicPlanCatalog = () => Object.values(PLAN_CATALOG)
    .filter((plan) => plan.public === true)
    .map(clonePlan);

  const getValidPublicPlanTypes = () => getPublicPlanCatalog().map((plan) => plan.planType);

  return Object.freeze({
    TRIAL_DAYS,
    PLAN_CATALOG,
    PLAN_ALIASES,
    formatMoneyBR,
    normalizePlanType,
    getPlanDefinition,
    getPublicPlanCatalog,
    getValidPublicPlanTypes,
  });
});
