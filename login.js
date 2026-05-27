document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const errorMessage = document.getElementById('error-message');
  const signupMessage = document.getElementById('signup-message');
  const emailInput = document.getElementById('login-email');
  const forgotPasswordLink = document.getElementById('forgot-password-link');
  const signupForm = document.getElementById('signup-form');
  const hideSignupLink = document.getElementById('hide-signup-link');
  const signupEntryHint = document.getElementById('signup-entry-hint');
  const screenSubtitle = document.getElementById('screen-subtitle');
  const screens = {
    login: document.getElementById('screen-login'),
    verification: document.getElementById('screen-verification'),
    recovery: document.getElementById('screen-recovery'),
    code: document.getElementById('screen-code'),
    password: document.getElementById('screen-password'),
    success: document.getElementById('screen-success'),
    onboardingProfile: document.getElementById('screen-onboarding-profile'),
    onboardingPayment: document.getElementById('screen-onboarding-payment'),
  };
  const emailVerificationCodeInput = document.getElementById('verification-code-input');
  const confirmVerificationButton = document.getElementById('confirm-verification-button');
  const resendVerificationPlaceholder = document.getElementById('resend-verification-placeholder');
  const backToLoginFromVerification = document.getElementById('back-to-login-from-verification');
  const verificationEmailBadge = document.getElementById('verification-email-badge');
  const verificationMessage = document.getElementById('verification-message');
  const recoveryEmailInput = document.getElementById('recovery-email');
  const sendCodeButton = document.getElementById('send-code-button');
  const backToLoginFromRecovery = document.getElementById('back-to-login-from-recovery');
  const maskedEmailBadge = document.getElementById('masked-email-badge');
  const resetCodeInput = document.getElementById('verification-code');
  const validateCodeButton = document.getElementById('validate-code-button');
  const resendCodePlaceholder = document.getElementById('resend-code-placeholder');
  const backToLoginFromCode = document.getElementById('back-to-login-from-code');
  const newPasswordInput = document.getElementById('new-password');
  const confirmNewPasswordInput = document.getElementById('confirm-new-password');
  const savePasswordButton = document.getElementById('save-password-button');
  const backToLoginFromPassword = document.getElementById('back-to-login-from-password');
  const backToLoginFromSuccess = document.getElementById('back-to-login-from-success');
  const recoveryMessage = document.getElementById('recovery-message');
  const codeMessage = document.getElementById('code-message');
  const passwordMessage = document.getElementById('password-message');
  const signupPlanBanner = document.getElementById('signup-plan-banner');
  const signupPlanName = document.getElementById('signup-plan-name');
  const signupPlanCopy = document.getElementById('signup-plan-copy');
  const signupClinicEmailInput = document.getElementById('signup-clinic-email');
  const profileSelectionMessage = document.getElementById('profile-selection-message');
  const profileSelectionButtons = Array.from(document.querySelectorAll('[data-operation-type]'));
  const backToVerificationFromProfile = document.getElementById('back-to-verification-from-profile');
  const paymentPlanName = document.getElementById('payment-plan-name');
  const paymentPlanDescription = document.getElementById('payment-plan-description');
  const paymentPlanPrice = document.getElementById('payment-plan-price');
  const paymentStatusTitle = document.getElementById('payment-status-title');
  const paymentStatusCopy = document.getElementById('payment-status-copy');
  const paymentMessage = document.getElementById('payment-message');
  const paymentChoiceGrid = document.getElementById('payment-choice-grid');
  const paymentChoiceButtons = Array.from(document.querySelectorAll('[data-payment-method]'));
  const paymentInstallmentCard = document.getElementById('payment-installment-card');
  const paymentInstallmentPanel = document.getElementById('payment-installment-panel');
  const paymentInstallmentCount = document.getElementById('payment-installment-count');
  const paymentInstallmentCopy = document.getElementById('payment-installment-copy');
  const paymentReadyCard = document.getElementById('payment-ready-card');
  const paymentReadyCopy = document.getElementById('payment-ready-copy');
  const paymentLinkButton = document.getElementById('payment-link-button');
  const preparePaymentButton = document.getElementById('prepare-payment-button');
  const backToProfileFromPayment = document.getElementById('back-to-profile-from-payment');
  const authApi = window.appApi?.auth || window.auth;
  const clinicApi = window.appApi?.clinic || window.clinic || {};
  const subscriptionApi = window.appApi?.subscription || window.subscription || {};
  const PAYMENT_RETURN_STORAGE_KEY = 'voithos.checkout.return';
  const SIGNUP_DRAFT_STORAGE_KEY = 'voithos.signup.draft';
  const RESEND_WAIT_SECONDS = 5 * 60;
  const VERIFICATION_WAIT_SECONDS = 2 * 60;
  const planCatalogApi = window.VoithosPlanCatalog || {};
  const formatPlanMoney = (value) => (
    planCatalogApi.formatMoneyBR
      ? planCatalogApi.formatMoneyBR(value)
      : `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`
  );
  const mapCatalogPlan = (plan = {}) => ({
    planType: String(plan.planType || '').trim().toUpperCase(),
    slug: String(plan.slug || '').trim(),
    label: String(plan.label || '').trim(),
    price: String(plan.price || '').trim() || formatPlanMoney(plan.amount),
    amount: Number(plan.amount || 0),
    amountCents: Number(plan.amountCents || 0),
    billingCycle: String(plan.billingCycle || plan.planType || '').trim().toUpperCase(),
    intervalLabel: String(plan.intervalLabel || '').trim(),
    trialDays: Number(plan.trialDays || 7),
    description: String(plan.description || '').trim() || 'Finalize a assinatura para liberar o acesso completo ao sistema.',
  });
  const buildPlanDefinitions = (catalog = []) => (Array.isArray(catalog) ? catalog : [])
    .map(mapCatalogPlan)
    .filter((plan) => plan.planType)
    .reduce((acc, plan) => {
      acc[plan.planType] = plan;
      return acc;
    }, {});
  let PLAN_DEFINITIONS = buildPlanDefinitions(planCatalogApi.getPublicPlanCatalog?.() || []);
  let planCatalogLoadPromise = null;
  const OPERATION_TYPE_LABELS = {
    AUTONOMOUS_DENTIST: 'Dentista autonomo',
    CLINIC: 'Clinica',
    OTHER: 'Outros',
  };
  const PAYMENT_METHOD_DEFINITIONS = {
    PIX: {
      label: 'PIX',
      shortLabel: 'PIX',
      actionLabel: 'Gerar checkout PIX',
      readyLabel: 'Checkout PIX pronto. Abra o Asaas e conclua com a chave ou QR Code.',
    },
    CREDIT_CARD: {
      label: 'Cartao de credito',
      shortLabel: 'Cartao',
      actionLabel: 'Gerar checkout do cartao',
      readyLabel: 'Checkout do cartao pronto. Informe os dados no Asaas para concluir a assinatura.',
    },
    INSTALLMENT: {
      label: 'Parcelamento anual',
      shortLabel: 'Parcelado',
      actionLabel: 'Gerar checkout parcelado',
      readyLabel: 'Checkout parcelado pronto. Escolha e confirme as parcelas no Asaas.',
    },
  };
  const getUiBaseUrl = () => {
    try {
      return String(window.__APP_API_BASE__ || localStorage.getItem('apiBase') || '').trim();
    } catch (_error) {
      return String(window.__APP_API_BASE__ || '').trim();
    }
  };
  const resetFlowState = {
    email: '',
    maskedEmail: '',
    code: '',
    resendTimerId: null,
  };
  const verificationFlowState = {
    email: '',
    maskedEmail: '',
    resendAvailableAt: '',
    sendCount: 0,
    resendTimerId: null,
  };
  const onboardingFlowState = {
    selectedPlanType: '',
    operationType: '',
    subscriptionOverview: null,
    onboardingState: null,
    paymentLink: '',
    checkoutPaymentMethod: 'PIX',
    installmentCount: 6,
    paymentReturnStatus: '',
    pendingSignupToken: '',
    pendingSignupEmail: '',
    pendingCheckoutMode: false,
    promotionCode: '',
    promotionOffer: null,
  };
  const initialFlowState = {
    requestedMode: 'login',
    allowAutoSessionResume: false,
    returnPaymentStatus: '',
  };

  const setError = (message) => {
    if (errorMessage) errorMessage.textContent = message || '';
  };

  const setSignupMessage = (message) => {
    if (signupMessage) signupMessage.textContent = message || '';
  };

  const SIGNUP_DRAFT_FIELDS = [
    'documentType',
    'documentNumber',
    'nomeClinica',
    'responsavelNome',
    'adminEmail',
    'telefone',
    'cep',
    'rua',
    'numero',
    'complemento',
    'bairro',
    'cidade',
    'uf',
  ];

  const collectSignupDraft = () => {
    const draft = {};
    SIGNUP_DRAFT_FIELDS.forEach((fieldName) => {
      draft[fieldName] = String(signupForm?.[fieldName]?.value || '').trim();
    });
    draft.selectedPlanType = String(onboardingFlowState.selectedPlanType || '').trim().toUpperCase();
    draft.promotionCode = String(onboardingFlowState.promotionCode || onboardingFlowState.promotionOffer?.code || '').trim();
    draft.savedAt = new Date().toISOString();
    return draft;
  };

  const saveSignupDraft = () => {
    if (!signupForm) return;
    try {
      localStorage.setItem(SIGNUP_DRAFT_STORAGE_KEY, JSON.stringify(collectSignupDraft()));
    } catch (_error) {
      // best-effort only
    }
  };

  const readSignupDraft = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(SIGNUP_DRAFT_STORAGE_KEY) || 'null');
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_error) {
      return null;
    }
  };

  const clearSignupDraft = () => {
    try {
      localStorage.removeItem(SIGNUP_DRAFT_STORAGE_KEY);
    } catch (_error) {
      // best-effort only
    }
  };

  const restoreSignupDraft = ({ email = '', planType = '', promotionCode = null } = {}) => {
    if (!signupForm) return;
    const draft = readSignupDraft() || {};
    SIGNUP_DRAFT_FIELDS.forEach((fieldName) => {
      if (!signupForm?.[fieldName]) return;
      const nextValue = fieldName === 'adminEmail' && email
        ? email
        : String(draft[fieldName] || '').trim();
      if (nextValue) signupForm[fieldName].value = nextValue;
    });
    if (email && signupForm?.adminEmail) signupForm.adminEmail.value = email;

    const restoredPlan = normalizePlanType(planType || draft.selectedPlanType || onboardingFlowState.selectedPlanType);
    if (restoredPlan) onboardingFlowState.selectedPlanType = restoredPlan;

    const restoredPromotion = String(promotionCode !== null ? promotionCode : (draft.promotionCode || onboardingFlowState.promotionCode || '')).trim();
    if (restoredPromotion) onboardingFlowState.promotionCode = restoredPromotion;
  };

  const getFriendlySignupError = (error) => {
    const status = Number(error?.status || 0);
    const code = String(error?.code || '').trim().toUpperCase();
    const message = String(error?.message || '').trim();

    if (code === 'USER_EMAIL_EXISTS' || /email.*exists|e-mail.*existe|already exists/i.test(message)) {
      return 'Este e-mail ja possui conta ativa. Use outro e-mail ou faca login.';
    }
    if (code === 'CLINIC_DOCUMENT_EXISTS' || /cpf|cnpj|document/i.test(message)) {
      return 'Este CPF/CNPJ ja esta cadastrado. Confira o documento informado.';
    }
    if (code === 'PROMOTION_OFFER_INVALID') {
      return 'Este link promocional expirou ou nao esta mais disponivel. Voce pode continuar o cadastro sem promocao.';
    }
    if (code === 'PROMOTION_TARGET_MISMATCH' || code === 'PROMOTION_PLAN_MISMATCH') {
      return 'Este link promocional nao esta disponivel para este e-mail ou plano.';
    }
    if (code === 'VALIDATION_ERROR' || status === 400) {
      if (/name|nome/i.test(message)) return 'Confira o nome informado.';
      if (/password|senha/i.test(message)) return 'Confira a senha e a confirmacao.';
      return 'Confira os dados informados e tente novamente.';
    }
    return message || 'Nao foi possivel criar a conta. Revise os dados e tente novamente.';
  };

  const getFriendlyCheckoutError = (error) => {
    const status = Number(error?.status || 0);
    const code = String(error?.code || '').trim().toUpperCase();
    const message = String(error?.message || '').trim();

    if (code === 'PENDING_CHECKOUT_EXPIRED' || status === 410) {
      return 'Seu cadastro pendente expirou. Revise os dados e envie novamente para gerar um novo checkout.';
    }
    if (code === 'CHECKOUT_ADDRESS_REQUIRED') {
      return 'Revise o endereco da clinica antes de gerar o checkout.';
    }
    if (code === 'PROMOTION_OFFER_INVALID') {
      return 'Este link promocional expirou ou nao esta mais disponivel.';
    }
    if (code === 'ASAAS_CHECKOUT_FAILED') {
      return 'Nao foi possivel criar o checkout. Revise os dados e tente novamente.';
    }
    if (code === 'VALIDATION_ERROR' || status === 400) {
      return message || 'Revise os dados antes de gerar o checkout.';
    }
    return message || 'Nao foi possivel preparar o pagamento agora.';
  };

  const hideAllScreens = () => {
    Object.values(screens).forEach((screen) => screen?.classList.add('hidden'));
  };

  const resetVerificationFlowState = () => {
    verificationFlowState.email = '';
    verificationFlowState.maskedEmail = '';
    verificationFlowState.resendAvailableAt = '';
    verificationFlowState.sendCount = 0;
    if (verificationEmailBadge) verificationEmailBadge.textContent = '';
    if (emailVerificationCodeInput) emailVerificationCodeInput.value = '';
    setFlowMessage(verificationMessage, '');
  };

  const resetPasswordRecoveryState = () => {
    resetFlowState.email = '';
    resetFlowState.maskedEmail = '';
    resetFlowState.code = '';
    if (recoveryEmailInput) recoveryEmailInput.value = '';
    if (resetCodeInput) resetCodeInput.value = '';
    if (newPasswordInput) newPasswordInput.value = '';
    if (confirmNewPasswordInput) confirmNewPasswordInput.value = '';
    if (maskedEmailBadge) maskedEmailBadge.textContent = '';
    setFlowMessage(recoveryMessage, '');
    setFlowMessage(codeMessage, '');
    setFlowMessage(passwordMessage, '');
  };

  const resetOnboardingFlowState = ({ preservePlan = false } = {}) => {
    const selectedPlanType = preservePlan ? onboardingFlowState.selectedPlanType : '';
    onboardingFlowState.selectedPlanType = selectedPlanType;
    onboardingFlowState.operationType = '';
    onboardingFlowState.subscriptionOverview = null;
    onboardingFlowState.onboardingState = null;
    onboardingFlowState.paymentLink = '';
    onboardingFlowState.checkoutPaymentMethod = 'PIX';
    onboardingFlowState.installmentCount = 6;
    onboardingFlowState.paymentReturnStatus = '';
    onboardingFlowState.pendingSignupToken = '';
    onboardingFlowState.pendingSignupEmail = '';
    onboardingFlowState.pendingCheckoutMode = false;
    if (!preservePlan) {
      onboardingFlowState.promotionCode = '';
      onboardingFlowState.promotionOffer = null;
    }
    setProfileSelectionMessage('');
    setPaymentMessage('');
  };

  const resetSignupFormState = ({ prefillEmail = '', preservePlan = false } = {}) => {
    if (signupForm instanceof HTMLFormElement) signupForm.reset();
    if (signupForm?.adminEmail) signupForm.adminEmail.value = prefillEmail;
    if (signupForm?.clinicEmail) signupForm.clinicEmail.value = prefillEmail;
    if (emailInput) emailInput.value = prefillEmail;
    setError('');
    setSignupMessage('');
    setSignupPlanBanner(preservePlan ? onboardingFlowState.selectedPlanType : '');
  };

  const resetPublicEntryFlow = ({ prefillEmail = '', preservePlan = false } = {}) => {
    stopAllTimers();
    resetVerificationFlowState();
    resetPasswordRecoveryState();
    resetOnboardingFlowState({ preservePlan });
    resetSignupFormState({ prefillEmail, preservePlan });
  };

  const toggleSignupForm = (visible) => {
    if (!signupForm) return;
    signupForm.classList.toggle('hidden', !visible);
  };

  const updateSubtitle = (message) => {
    if (screenSubtitle) screenSubtitle.textContent = message;
  };

  const showScreen = (name) => {
    Object.entries(screens).forEach(([key, element]) => {
      if (!element) return;
      element.classList.toggle('hidden', key !== name);
    });
    toggleSignupForm(false);
    setError('');
    setSignupMessage('');
    if (verificationMessage) verificationMessage.textContent = '';
  };

  const normalizePlanType = (value) => {
    const normalized = planCatalogApi.normalizePlanType?.(value) || String(value || '').trim().toUpperCase();
    return PLAN_DEFINITIONS[normalized] ? normalized : '';
  };

  const mergePlanCatalog = (catalog = []) => {
    PLAN_DEFINITIONS = {
      ...PLAN_DEFINITIONS,
      ...buildPlanDefinitions(catalog),
    };
    return PLAN_DEFINITIONS;
  };

  const loadPlanCatalog = async () => {
    if (planCatalogLoadPromise) return planCatalogLoadPromise;
    planCatalogLoadPromise = (async () => {
      if (!authApi?.getPlanCatalog) return PLAN_DEFINITIONS;
      try {
        const catalog = await authApi.getPlanCatalog();
        mergePlanCatalog(catalog);
      } catch (error) {
        console.warn('[pricing][catalog] usando catalogo local', error?.message || String(error || ''));
      }
      return PLAN_DEFINITIONS;
    })();
    return planCatalogLoadPromise;
  };

  const normalizeOperationType = (value) => {
    const normalized = String(value || '').trim().toUpperCase();
    if (normalized === 'AUTONOMOUS_DENTIST' || normalized === 'AUTONOMOUS' || normalized === 'DENTIST') return 'AUTONOMOUS_DENTIST';
    if (normalized === 'CLINIC') return 'CLINIC';
    if (normalized === 'OTHER' || normalized === 'OUTRO') return 'OTHER';
    return '';
  };

  const buildPlanView = (planType, catalog = []) => {
    const normalizedPlanType = normalizePlanType(planType);
    const fallback = PLAN_DEFINITIONS[normalizedPlanType] || null;
    const remoteMatch = (Array.isArray(catalog) ? catalog : []).find((item) => String(item?.planType || '').trim().toUpperCase() === normalizedPlanType);
    const offer = onboardingFlowState.promotionOffer && normalizePlanType(onboardingFlowState.promotionOffer.planType) === normalizedPlanType
      ? onboardingFlowState.promotionOffer
      : null;
    const promotionalPrice = offer?.promotionalPriceCents
      ? `R$ ${(Number(offer.promotionalPriceCents) / 100).toFixed(2).replace('.', ',')}`
      : '';
    return {
      planType: normalizedPlanType,
      label: fallback?.label || String(remoteMatch?.planType || '').trim() || 'Plano',
      price: promotionalPrice || (remoteMatch?.amount ? formatPlanMoney(remoteMatch.amount) : (fallback?.price || '--')),
      description: offer?.title ? `Oferta promocional: ${offer.title}` : (fallback?.description || 'Finalize a assinatura para liberar o acesso completo ao sistema.'),
      trialDays: Number(fallback?.trialDays || remoteMatch?.trialDays || 7),
      intervalLabel: String(fallback?.intervalLabel || remoteMatch?.intervalLabel || '').trim(),
    };
  };

  const setSignupPlanBanner = (planType) => {
    const planView = buildPlanView(planType, onboardingFlowState.subscriptionOverview?.plans || []);
    onboardingFlowState.selectedPlanType = planView.planType;
    if (!signupPlanBanner) return;
    if (!planView.planType) {
      signupPlanBanner.classList.add('hidden');
      if (signupEntryHint) signupEntryHint.textContent = 'Escolha um plano na landing para iniciar um novo cadastro.';
      return;
    }
    signupPlanBanner.classList.remove('hidden');
    if (signupPlanName) signupPlanName.textContent = `${planView.label} | ${planView.price}`;
    if (signupPlanCopy) signupPlanCopy.textContent = `${planView.trialDays} dias gratis. Depois, ${planView.price}${planView.intervalLabel || ''}.`;
    if (signupEntryHint) signupEntryHint.textContent = `${planView.label} selecionado na landing.`;
  };

  const setPaymentMessage = (message) => {
    if (paymentMessage) paymentMessage.textContent = message || '';
  };

  const setProfileSelectionMessage = (message) => {
    if (profileSelectionMessage) profileSelectionMessage.textContent = message || '';
  };

  const getIsAnnualPlan = () => normalizePlanType(
    onboardingFlowState.selectedPlanType
    || onboardingFlowState.onboardingState?.selectedPlan
    || onboardingFlowState.subscriptionOverview?.subscription?.planType
  ) === 'ANNUAL';

  const getSelectedPaymentMethodDefinition = () => PAYMENT_METHOD_DEFINITIONS[onboardingFlowState.checkoutPaymentMethod] || PAYMENT_METHOD_DEFINITIONS.PIX;
  const isOperationalAccessStatus = (status) => ['ACTIVE', 'GRACE_PERIOD', 'TRIALING', 'LEGACY_ACCESS', 'ENFORCEMENT_DISABLED']
    .includes(String(status || '').trim().toUpperCase());

  const isLegacyPaymentLink = (value) => {
    const normalized = String(value || '').trim();
    if (!normalized) return false;
    try {
      const parsed = new URL(normalized, window.location.origin);
      return String(parsed.pathname || '').startsWith('/subscription/payments/');
    } catch (_error) {
      return normalized.startsWith('/subscription/payments/');
    }
  };

  const resolveCheckoutPaymentLink = (...values) => {
    const link = values
      .map((value) => String(value || '').trim())
      .find((value) => value && !isLegacyPaymentLink(value));
    return link || '';
  };

  const persistPaymentReturnContext = (paymentLink = '') => {
    try {
      const context = {
        mode: onboardingFlowState.pendingCheckoutMode ? 'pending_signup' : 'subscription',
        pendingSignupEmail: String(onboardingFlowState.pendingSignupEmail || '').trim().toLowerCase(),
        pendingSignupToken: String(onboardingFlowState.pendingSignupToken || '').trim(),
        selectedPlanType: String(onboardingFlowState.selectedPlanType || '').trim().toUpperCase(),
        paymentMethod: String(onboardingFlowState.checkoutPaymentMethod || '').trim().toUpperCase(),
        installmentCount: Number(onboardingFlowState.installmentCount || 0) || null,
        paymentLink: String(paymentLink || onboardingFlowState.paymentLink || '').trim(),
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(PAYMENT_RETURN_STORAGE_KEY, JSON.stringify(context));
    } catch (_error) {
      // best-effort only
    }
  };

  const clearPaymentReturnContext = () => {
    try {
      localStorage.removeItem(PAYMENT_RETURN_STORAGE_KEY);
    } catch (_error) {
      // best-effort only
    }
  };

  const openCheckoutLink = async (paymentLink) => {
    const normalizedLink = String(paymentLink || '').trim();
    if (!normalizedLink) return false;
    persistPaymentReturnContext(normalizedLink);

    const isDesktopMode = String(window.appApi?.mode || '').trim().toLowerCase() === 'desktop';
    if (isDesktopMode && typeof window.appApi?.openExternalUrl === 'function') {
      await window.appApi.openExternalUrl(normalizedLink);
      return true;
    }

    window.location.assign(normalizedLink);
    return true;
  };

  const applyPaymentMethodAvailability = () => {
    const isAnnualPlan = getIsAnnualPlan();
    if (onboardingFlowState.checkoutPaymentMethod === 'INSTALLMENT' && !isAnnualPlan) {
      onboardingFlowState.checkoutPaymentMethod = 'PIX';
    }

    paymentChoiceButtons.forEach((button) => {
      const method = String(button?.getAttribute('data-payment-method') || '').trim().toUpperCase();
      const isInstallmentMethod = method === 'INSTALLMENT';
      const isDisabled = isInstallmentMethod && !isAnnualPlan;
      button.classList.toggle('is-disabled', isDisabled);
      button.classList.toggle('is-selected', onboardingFlowState.checkoutPaymentMethod === method && !isDisabled);
      button.setAttribute('aria-pressed', onboardingFlowState.checkoutPaymentMethod === method && !isDisabled ? 'true' : 'false');
      button.disabled = isDisabled;
    });

    if (paymentInstallmentPanel) {
      paymentInstallmentPanel.classList.toggle('hidden', !(isAnnualPlan && onboardingFlowState.checkoutPaymentMethod === 'INSTALLMENT'));
    }
    if (paymentInstallmentCopy) {
      paymentInstallmentCopy.textContent = isAnnualPlan
        ? 'O total anual sera parcelado no checkout seguro do Asaas.'
        : 'O parcelamento fica disponivel somente no plano anual.';
    }
    if (paymentInstallmentCard && !isAnnualPlan) {
      paymentInstallmentCard.title = 'Parcelamento disponivel apenas no plano anual.';
    }
  };

  const renderPaymentReturnMessage = () => {
    if (!initialFlowState.returnPaymentStatus) return false;
    if (initialFlowState.returnPaymentStatus === 'success') {
      setPaymentMessage('Voce retornou do checkout. Clique em atualizar status para conferir a confirmacao do pagamento.');
      return true;
    }
    if (initialFlowState.returnPaymentStatus === 'cancelled') {
      clearLocalPaymentLink();
      setPaymentMessage('Pagamento cancelado no checkout. Ajuste a forma de pagamento ou gere um novo checkout.');
      return true;
    }
    if (initialFlowState.returnPaymentStatus === 'expired') {
      clearLocalPaymentLink();
      setPaymentMessage('O checkout expirou. Gere um novo checkout para continuar.');
      return true;
    }
    return false;
  };

  const clearLocalPaymentLink = () => {
    onboardingFlowState.paymentLink = '';
    if (onboardingFlowState.subscriptionOverview && typeof onboardingFlowState.subscriptionOverview === 'object') {
      const currentOverview = onboardingFlowState.subscriptionOverview;
      const currentSubscription = currentOverview.subscription && typeof currentOverview.subscription === 'object'
        ? currentOverview.subscription
        : null;
      const currentLastPayment = currentSubscription?.lastPayment && typeof currentSubscription.lastPayment === 'object'
        ? currentSubscription.lastPayment
        : null;
      onboardingFlowState.subscriptionOverview = {
        ...currentOverview,
        paymentLink: '',
        subscription: currentSubscription ? {
          ...currentSubscription,
          lastPayment: currentLastPayment ? {
            ...currentLastPayment,
            paymentLink: '',
          } : currentLastPayment,
        } : currentSubscription,
      };
    }
  };

  const renderPaymentSummary = () => {
    const overview = onboardingFlowState.subscriptionOverview || null;
    const planView = buildPlanView(
      onboardingFlowState.selectedPlanType || onboardingFlowState.onboardingState?.selectedPlan || overview?.subscription?.planType,
      overview?.plans || []
    );
    const effectiveStatus = String(overview?.effectiveStatus || '').trim().toUpperCase();
    const paymentLink = resolveCheckoutPaymentLink(
      overview?.paymentLink,
      overview?.subscription?.lastPayment?.paymentLink,
      onboardingFlowState.paymentLink
    );
    const subscriptionAmount = overview?.subscription?.customPriceEnabled === true && Number(overview?.subscription?.billingAmount || 0) > 0
      ? Number(overview.subscription.billingAmount)
      : Number(overview?.subscription?.amount || 0);
    const displayPrice = subscriptionAmount > 0 ? formatPlanMoney(subscriptionAmount) : planView.price;

    if (paymentPlanName) paymentPlanName.textContent = planView.label || 'Plano nao definido';
    if (paymentPlanDescription) paymentPlanDescription.textContent = planView.description;
    if (paymentPlanPrice) paymentPlanPrice.textContent = displayPrice || '--';

    applyPaymentMethodAvailability();

    if (!overview?.subscription) {
      if (paymentStatusTitle) paymentStatusTitle.textContent = 'Assinatura ainda nao iniciada';
      if (paymentStatusCopy) paymentStatusCopy.textContent = 'Escolha a forma de cobranca e gere um checkout seguro para concluir a ativacao.';
      if (paymentReadyCard) paymentReadyCard.classList.add('hidden');
      if (paymentLinkButton) paymentLinkButton.classList.add('hidden');
      if (preparePaymentButton) preparePaymentButton.textContent = getSelectedPaymentMethodDefinition().actionLabel;
      return;
    }

    if (isOperationalAccessStatus(effectiveStatus)) {
      const trialing = effectiveStatus === 'TRIALING';
      if (paymentStatusTitle) paymentStatusTitle.textContent = trialing ? 'Teste gratis ativo' : 'Assinatura ativa';
      if (paymentStatusCopy) {
        paymentStatusCopy.textContent = trialing
          ? 'Sua clinica ja pode usar a Voithos durante o periodo de teste.'
          : 'Pagamento confirmado. O acesso completo ao webapp ja pode ser liberado.';
      }
      if (paymentReadyCard) paymentReadyCard.classList.add('hidden');
      if (paymentLinkButton) paymentLinkButton.classList.add('hidden');
      if (preparePaymentButton) preparePaymentButton.textContent = 'Entrar no sistema';
      return;
    }

    const trialExpired = effectiveStatus === 'TRIAL_EXPIRED' || overview?.readOnly === true;
    if (paymentStatusTitle) paymentStatusTitle.textContent = trialExpired ? 'Teste gratis expirado' : 'Pagamento pendente';
    if (paymentStatusCopy) {
      paymentStatusCopy.textContent = trialExpired
        ? 'Seu periodo de teste terminou. Gere ou abra o checkout seguro do Asaas para ativar sua assinatura.'
        : paymentLink
          ? 'Sua assinatura esta pendente. Abra o checkout do Asaas para concluir o pagamento e depois atualize o status.'
          : 'Sua assinatura esta pendente. Gere um checkout seguro para concluir o pagamento.';
    }
    if (paymentReadyCard) {
      paymentReadyCard.classList.toggle('hidden', !paymentLink);
    }
    if (paymentReadyCopy) {
      const selectedMethod = getSelectedPaymentMethodDefinition();
      paymentReadyCopy.textContent = paymentLink
        ? `${selectedMethod.readyLabel} Se voce ja voltou do pagamento, atualize o status para validar a liberacao.`
        : `Depois de gerar o checkout, voce seguira para o pagamento seguro do Asaas com os dados da clinica pre-preenchidos para ${selectedMethod.shortLabel.toLowerCase()}.`;
    }
    if (paymentLinkButton) {
      paymentLinkButton.classList.toggle('hidden', !paymentLink);
      paymentLinkButton.disabled = !paymentLink;
      paymentLinkButton.textContent = paymentLink ? 'Continuar para o checkout seguro' : 'Aguardando checkout';
    }
    if (preparePaymentButton) preparePaymentButton.textContent = paymentLink ? 'Atualizar status do pagamento' : getSelectedPaymentMethodDefinition().actionLabel;
  };

  const shouldKeepUserInOnboarding = () => {
    const selectedPlanType = onboardingFlowState.selectedPlanType || onboardingFlowState.onboardingState?.selectedPlan || '';
    const operationType = onboardingFlowState.operationType || onboardingFlowState.onboardingState?.operationType || '';
    const effectiveStatus = String(onboardingFlowState.subscriptionOverview?.effectiveStatus || '').trim().toUpperCase();

    if (!selectedPlanType) return false;
    if (!operationType) return true;
    return !isOperationalAccessStatus(effectiveStatus);
  };

  const syncOnboardingState = async () => {
    if (onboardingFlowState.pendingCheckoutMode) {
      onboardingFlowState.onboardingState = {
        selectedPlan: onboardingFlowState.selectedPlanType,
        operationType: onboardingFlowState.operationType,
      };
      onboardingFlowState.subscriptionOverview = {
        effectiveStatus: 'PENDING_PAYMENT',
        accessAllowed: false,
        paymentLink: onboardingFlowState.paymentLink,
        plans: [],
        subscription: null,
      };
      renderPaymentSummary();
      return {
        onboardingState: onboardingFlowState.onboardingState,
        subscriptionOverview: onboardingFlowState.subscriptionOverview,
      };
    }

    const [onboardingState, subscriptionOverview] = await Promise.all([
      clinicApi?.getOnboardingState ? clinicApi.getOnboardingState().catch(() => null) : Promise.resolve(null),
      subscriptionApi?.getMySubscription ? subscriptionApi.getMySubscription().catch(() => null) : Promise.resolve(null),
    ]);

    onboardingFlowState.onboardingState = onboardingState && typeof onboardingState === 'object' ? onboardingState : null;
    onboardingFlowState.subscriptionOverview = subscriptionOverview && typeof subscriptionOverview === 'object' ? subscriptionOverview : null;
    onboardingFlowState.paymentLink = resolveCheckoutPaymentLink(
      onboardingFlowState.subscriptionOverview?.paymentLink,
      onboardingFlowState.subscriptionOverview?.subscription?.lastPayment?.paymentLink
    );
    onboardingFlowState.selectedPlanType = normalizePlanType(
      onboardingFlowState.onboardingState?.selectedPlan
      || onboardingFlowState.selectedPlanType
      || onboardingFlowState.subscriptionOverview?.subscription?.planType
    );
    onboardingFlowState.operationType = normalizeOperationType(
      onboardingFlowState.onboardingState?.operationType || onboardingFlowState.operationType
    );
    setSignupPlanBanner(onboardingFlowState.selectedPlanType);
    renderPaymentSummary();
    return {
      onboardingState: onboardingFlowState.onboardingState,
      subscriptionOverview: onboardingFlowState.subscriptionOverview,
    };
  };

  const goToSignup = (options = {}) => {
    const prefillEmail = String(options.email || '').trim().toLowerCase();
    const sourceLabel = String(options.sourceLabel || '').trim();
    const selectedPlanType = normalizePlanType(options.planType || onboardingFlowState.selectedPlanType);

    resetPublicEntryFlow({ prefillEmail, preservePlan: Boolean(selectedPlanType) });
    setError('');
    setSignupMessage('');
    toggleSignupForm(true);
    updateSubtitle('Criar conta');
    hideAllScreens();
    onboardingFlowState.selectedPlanType = selectedPlanType;
    restoreSignupDraft({
      email: prefillEmail,
      planType: selectedPlanType,
      promotionCode: onboardingFlowState.promotionCode,
    });
    setSignupPlanBanner(onboardingFlowState.selectedPlanType);

    if (prefillEmail) {
      if (signupForm?.adminEmail) signupForm.adminEmail.value = prefillEmail;
      if (emailInput) emailInput.value = prefillEmail;
    }

    if (sourceLabel) {
      setSignupMessage(`${sourceLabel} selecionado. Conclua o cadastro para continuar.`);
    }

    const firstSignupField = signupForm?.querySelector('input, select');
    if (firstSignupField instanceof HTMLElement) {
      firstSignupField.focus();
    }
  };

  const normalizeRequestedMode = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (['signup', 'cadastro', 'register', 'trial'].includes(normalized)) return 'signup';
    if (['recovery', 'reset', 'forgot', 'password-reset', 'recuperar-senha'].includes(normalized)) return 'recovery';
    return 'login';
  };

  const readInitialFlowRequest = () => {
    const params = new URLSearchParams(window.location.search || '');
    const hashValue = String(window.location.hash || '').replace(/^#/, '').trim().toLowerCase();
    const rawMode = params.get('mode') || params.get('screen') || hashValue;
    const email = String(params.get('email') || '').trim().toLowerCase();
    const plan = String(params.get('plan') || '').trim();
    const promo = String(params.get('promo') || params.get('offer') || params.get('promotion') || '').trim();
    const resume = String(params.get('resume') || params.get('resumeSession') || '').trim().toLowerCase();
    const payment = String(params.get('payment') || '').trim().toLowerCase();
    return {
      mode: normalizeRequestedMode(rawMode),
      email,
      plan: normalizePlanType(plan),
      promo,
      resume: ['1', 'true', 'yes', 'on'].includes(resume),
      payment,
    };
  };

  const clearInitialFlowUrl = () => {
    try {
      const url = new URL(window.location.href);
      ['mode', 'screen', 'plan', 'email', 'promo', 'offer', 'promotion', 'payment', 'resume', 'resumeSession'].forEach((key) => url.searchParams.delete(key));
      url.hash = '';
      const normalizedPath = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState({}, document.title, normalizedPath);
    } catch (_error) {
      // URL cleanup is best-effort only.
    }
  };

  const applyInitialFlowRequest = async () => {
    const request = readInitialFlowRequest();
    initialFlowState.requestedMode = request.mode;
    initialFlowState.allowAutoSessionResume = request.resume === true;
    initialFlowState.returnPaymentStatus = request.payment;

    if (request.mode === 'signup' && authApi?.clearSession) {
      await authApi.clearSession({ remote: false }).catch(() => null);
    }

    if (request.mode === 'signup' || request.mode === 'recovery' || request.plan || request.email || request.promo) {
      clearInitialFlowUrl();
    }

    if (request.email) {
      if (emailInput) emailInput.value = request.email;
      if (recoveryEmailInput) recoveryEmailInput.value = request.email;
    }

    if (request.mode === 'signup') {
      onboardingFlowState.selectedPlanType = request.plan || '';
      let initialSignupMessage = '';
      if (request.promo && authApi?.validatePromotionOffer) {
        try {
          const offer = await authApi.validatePromotionOffer(request.promo, request.email);
          onboardingFlowState.promotionCode = String(offer?.code || request.promo || '').trim();
          onboardingFlowState.promotionOffer = offer || null;
          onboardingFlowState.selectedPlanType = normalizePlanType(offer?.planType || onboardingFlowState.selectedPlanType);
        } catch (error) {
          onboardingFlowState.promotionCode = '';
          onboardingFlowState.promotionOffer = null;
          initialSignupMessage = getFriendlySignupError(error);
        }
      } else {
        onboardingFlowState.promotionCode = String(request.promo || '').trim();
      }
      const planView = buildPlanView(onboardingFlowState.selectedPlanType);
      const sourceLabel = onboardingFlowState.promotionOffer?.code
        ? `Oferta ${onboardingFlowState.promotionOffer.code}`
        : (planView.planType ? `Plano ${planView.label}` : '');
      goToSignup({ email: request.email, sourceLabel, planType: onboardingFlowState.selectedPlanType });
      if (initialSignupMessage) setSignupMessage(initialSignupMessage);
      return;
    }

    if (request.mode === 'recovery') {
      goToRecovery();
      return;
    }

    goToLogin();
  };

  const maskEmail = (email) => {
    const [localPart = '', domain = ''] = String(email || '').split('@');
    if (!localPart || !domain) return 'seu e-mail';
    const localMask = localPart.length <= 2
      ? `${localPart[0] || '*'}*`
      : `${localPart.slice(0, 2)}***`;
    return `${localMask}@${domain}`;
  };

  const logPasswordResetDiagnostic = (stage, details = {}) => {
    console.info('[password-reset][ui]', {
      stage,
      endpoint: details.endpoint || '',
      email: details.email ? maskEmail(details.email) : '',
      status: details.status || '',
      fallback: details.fallback === true,
      error: details.error || '',
      baseUrl: getUiBaseUrl(),
    });
  };

  const isWebBuild = window.__VOITHOS_DEPLOY_TARGET__ === 'render';
  const logAuthUiDiagnostic = (stage, details = {}) => {
    if (!isWebBuild) return;
    console.info('[auth][ui]', {
      stage,
      endpoint: details.endpoint || '',
      email: details.email ? maskEmail(details.email) : '',
      status: details.status || '',
      baseUrl: getUiBaseUrl(),
      error: details.error || '',
      pendingVerification: details.pendingVerification === true,
    });
  };

  const setRecoveryTarget = (email) => {
    resetFlowState.email = email;
    resetFlowState.maskedEmail = maskEmail(email);
    if (maskedEmailBadge) {
      maskedEmailBadge.textContent = `Código enviado para ${resetFlowState.maskedEmail}`;
    }
  };

  const setFlowMessage = (element, message) => {
    if (element) element.textContent = message || '';
  };

  const stopAllTimers = () => {
    stopResendTimer();
    if (verificationFlowState.resendTimerId) {
      window.clearInterval(verificationFlowState.resendTimerId);
      verificationFlowState.resendTimerId = null;
    }
  };

  const setVerificationTarget = (email) => {
    verificationFlowState.email = String(email || '').trim().toLowerCase();
    verificationFlowState.maskedEmail = maskEmail(verificationFlowState.email);
    if (verificationEmailBadge) {
      verificationEmailBadge.textContent = `Código enviado`;
    }
  };

  const startVerificationTimer = (resendAvailableAt = '') => {
    stopAllTimers();
    const fallbackTargetAt = Date.now() + (VERIFICATION_WAIT_SECONDS * 1000);
    const parsedTargetAt = resendAvailableAt ? new Date(resendAvailableAt).getTime() : 0;
    const targetAt = Number.isFinite(parsedTargetAt) && parsedTargetAt > 0 ? parsedTargetAt : fallbackTargetAt;

    const updateLabel = () => {
      if (!resendVerificationPlaceholder) return;
      const remainingMs = Math.max(0, targetAt - Date.now());
      const remainingSeconds = Math.ceil(remainingMs / 1000);
      if (remainingSeconds <= 0) {
        resendVerificationPlaceholder.disabled = false;
        resendVerificationPlaceholder.textContent = 'Reenviar código';
        return;
      }
      resendVerificationPlaceholder.disabled = true;
      resendVerificationPlaceholder.textContent = `Reenviar código em ${formatResendWait(remainingSeconds)}`;
    };

    updateLabel();
    verificationFlowState.resendTimerId = window.setInterval(() => {
      const remainingSeconds = Math.ceil(Math.max(0, targetAt - Date.now()) / 1000);
      if (remainingSeconds <= 0) {
        if (verificationFlowState.resendTimerId) {
          window.clearInterval(verificationFlowState.resendTimerId);
          verificationFlowState.resendTimerId = null;
        }
        if (resendVerificationPlaceholder) {
          resendVerificationPlaceholder.disabled = false;
          resendVerificationPlaceholder.textContent = 'Reenviar código';
        }
        return;
      }
      updateLabel();
    }, 1000);
  };

  const formatResendWait = (seconds) => {
    const safeSeconds = Math.max(0, Number(seconds) || 0);
    const minutes = Math.floor(safeSeconds / 60);
    const remainingSeconds = String(safeSeconds % 60).padStart(2, '0');
    return `${minutes}:${remainingSeconds}`;
  };

  const stopResendTimer = () => {
    if (resetFlowState.resendTimerId) {
      window.clearInterval(resetFlowState.resendTimerId);
      resetFlowState.resendTimerId = null;
    }
  };

  const startResendTimer = () => {
    stopResendTimer();
    let remainingSeconds = RESEND_WAIT_SECONDS;

    const updateLabel = () => {
      if (!resendCodePlaceholder) return;
      resendCodePlaceholder.disabled = true;
      resendCodePlaceholder.textContent = `Reenviar código em ${formatResendWait(remainingSeconds)}`;
    };

    updateLabel();
    resetFlowState.resendTimerId = window.setInterval(() => {
      remainingSeconds -= 1;
      if (remainingSeconds <= 0) {
        stopResendTimer();
        if (resendCodePlaceholder) {
          resendCodePlaceholder.disabled = true;
          resendCodePlaceholder.textContent = 'Reenvio disponível em breve';
        }
        return;
      }
      updateLabel();
    }, 1000);
  };

  const getFriendlyResetError = (error) => {
    const raw = String(error?.message || error || '').toLowerCase();
    if (raw.includes('invalid') || raw.includes('expir') || raw.includes('codigo') || raw.includes('código')) {
      return 'Código inválido ou expirado.';
    }
    if (raw.includes('match') || raw.includes('confirma')) {
      return 'A confirmação de senha não confere.';
    }
    return 'Não foi possível concluir a operação. Tente novamente.';
  };

  const goToLogin = () => {
    resetPublicEntryFlow({ prefillEmail: '' });
    initialFlowState.allowAutoSessionResume = false;
    showScreen('login');
    updateSubtitle('Acesse sua conta para continuar');
  };

  const goToVerification = (email, message, verificationMeta = {}, legacyVerificationMeta = null) => {
    const resolvedVerificationMeta = verificationMeta && typeof verificationMeta === 'object' && !Array.isArray(verificationMeta)
      ? verificationMeta
      : (legacyVerificationMeta && typeof legacyVerificationMeta === 'object' && !Array.isArray(legacyVerificationMeta)
        ? legacyVerificationMeta
        : {});
    stopAllTimers();
    setVerificationTarget(email || verificationFlowState.email || '');
    verificationFlowState.resendAvailableAt = String(resolvedVerificationMeta?.resendAvailableAt || '');
    verificationFlowState.sendCount = Number(resolvedVerificationMeta?.sendCount || 0);
    showScreen('verification');
    updateSubtitle('Confirme seu e-mail');
    startVerificationTimer(verificationFlowState.resendAvailableAt);
    setFlowMessage(
      verificationMessage,
      message || (verificationFlowState.maskedEmail ? `Digite o código enviado para ${verificationFlowState.maskedEmail}.` : 'Digite o código enviado para seu e-mail.')
    );
    if (emailVerificationCodeInput) {
      emailVerificationCodeInput.value = '';
      emailVerificationCodeInput.focus();
    }
  };

  const goToRecovery = () => {
    stopAllTimers();
    showScreen('recovery');
    updateSubtitle('Recuperação de senha');
    if (recoveryEmailInput) {
      recoveryEmailInput.value = String(emailInput?.value || '');
      recoveryEmailInput.focus();
    }
  };

  const goToCode = () => {
    stopAllTimers();
    showScreen('code');
    updateSubtitle('Validação do código');
    startResendTimer();
    if (resetCodeInput) {
      resetCodeInput.focus();
    }
  };

  const goToPassword = () => {
    stopAllTimers();
    showScreen('password');
    updateSubtitle('Nova senha');
    if (newPasswordInput) newPasswordInput.focus();
  };

  const goToSuccess = () => {
    stopAllTimers();
    showScreen('success');
    updateSubtitle('Senha redefinida');
  };

  const goToOnboardingProfile = () => {
    stopAllTimers();
    showScreen('onboardingProfile');
    updateSubtitle('Defina seu perfil operacional');
    setProfileSelectionMessage('');
  };

  const goToOnboardingPayment = () => {
    stopAllTimers();
    showScreen('onboardingPayment');
    updateSubtitle('Prepare a ativacao da assinatura');
    setPaymentMessage('');
    renderPaymentSummary();
    renderPaymentReturnMessage();
  };

  const routePrivilegedAuthenticatedUser = (user) => {
    if (user?.tipo === 'super_admin') {
      window.location.href = 'super-admin.html';
      return true;
    }
    if (user?.mustChangePassword && !user?.isImpersonatedSession) {
      window.location.href = 'change-password.html';
      return true;
    }
    return false;
  };

  const routeAuthenticatedUser = () => {
    clearPaymentReturnContext();
    window.location.href = 'index.html';
    return true;
  };

  const resumeAuthenticatedExperience = async (user, options = {}) => {
    if (routePrivilegedAuthenticatedUser(user)) {
      return true;
    }

    if (!clinicApi?.getOnboardingState || !subscriptionApi?.getMySubscription) {
      window.location.href = 'index.html';
      return true;
    }

    try {
      await syncOnboardingState();
      const selectedPlanType = onboardingFlowState.selectedPlanType || onboardingFlowState.onboardingState?.selectedPlan || '';
      const operationType = onboardingFlowState.operationType || onboardingFlowState.onboardingState?.operationType || '';
      const effectiveStatus = String(onboardingFlowState.subscriptionOverview?.effectiveStatus || '').trim().toUpperCase();

      if (!selectedPlanType) {
        window.location.href = 'index.html';
        return true;
      }

      if (!operationType) {
        goToOnboardingProfile();
        return true;
      }

      if (isOperationalAccessStatus(effectiveStatus)) {
        if (!onboardingFlowState.onboardingState?.completedAt && clinicApi?.updateOnboardingState) {
          try {
            await clinicApi.updateOnboardingState({
              selectedPlan: selectedPlanType,
              operationType,
              completedAt: new Date().toISOString(),
            });
          } catch (_error) {}
        }
        window.location.href = 'index.html';
        return true;
      }

      if (options?.forcePayment === true || shouldKeepUserInOnboarding()) {
        goToOnboardingPayment();
        return true;
      }

      window.location.href = 'index.html';
      return true;
    } catch (error) {
      console.warn('Nao foi possivel resolver o onboarding autenticado.', error);
      window.location.href = 'index.html';
      return true;
    }
  };

  const normalizeDigits = (value, maxLength) => String(value || '').replace(/\D/g, '').slice(0, maxLength);

  const checkActiveSession = async () => {
    if (!authApi?.currentUser) return;
    if (!initialFlowState.allowAutoSessionResume) return;
    try {
      const user = await authApi.currentUser();
      if (user) {
        await resumeAuthenticatedExperience(user);
      }
    } catch (err) {
      console.warn('Nao foi possivel validar sessao existente.', err);
    }
  };

  forgotPasswordLink?.addEventListener('click', (event) => {
    event.preventDefault();
    goToRecovery();
  });

  hideSignupLink?.addEventListener('click', (event) => {
    event.preventDefault();
    setSignupMessage('');
    toggleSignupForm(false);
    goToLogin();
  });

  signupForm?.addEventListener('input', saveSignupDraft);
  signupForm?.addEventListener('change', saveSignupDraft);

  backToLoginFromVerification?.addEventListener('click', goToLogin);
  backToLoginFromRecovery?.addEventListener('click', goToLogin);
  backToLoginFromCode?.addEventListener('click', goToLogin);
  backToLoginFromPassword?.addEventListener('click', goToLogin);
  backToLoginFromSuccess?.addEventListener('click', goToLogin);
  backToVerificationFromProfile?.addEventListener('click', () => {
    if (!verificationFlowState.email) {
      goToLogin();
      return;
    }
    goToVerification(verificationFlowState.email, '', {
      resendAvailableAt: verificationFlowState.resendAvailableAt,
      sendCount: verificationFlowState.sendCount,
    });
  });
  backToProfileFromPayment?.addEventListener('click', goToOnboardingProfile);
  paymentChoiceButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const method = String(button.getAttribute('data-payment-method') || '').trim().toUpperCase();
      if (!method || button.disabled) return;
      onboardingFlowState.checkoutPaymentMethod = method;
      clearLocalPaymentLink();
      applyPaymentMethodAvailability();
      renderPaymentSummary();
      setPaymentMessage('');
    });
  });
  paymentInstallmentCount?.addEventListener('change', () => {
    onboardingFlowState.installmentCount = Number(paymentInstallmentCount.value || 6) || 6;
    clearLocalPaymentLink();
    renderPaymentSummary();
  });
  paymentLinkButton?.addEventListener('click', () => {
    const paymentLink = resolveCheckoutPaymentLink(
      onboardingFlowState.subscriptionOverview?.paymentLink,
      onboardingFlowState.subscriptionOverview?.subscription?.lastPayment?.paymentLink,
      onboardingFlowState.paymentLink
    );
    if (!paymentLink) {
      setPaymentMessage('Ainda nao ha checkout valido disponivel. Gere um novo checkout para continuar.');
      return;
    }
    openCheckoutLink(paymentLink).catch((error) => {
      console.error('Falha ao abrir checkout Asaas', error);
      setPaymentMessage('Nao foi possivel abrir o checkout agora. Tente novamente.');
    });
  });

  resendVerificationPlaceholder?.addEventListener('click', async () => {
    const email = verificationFlowState.email || String(emailInput?.value || '').trim().toLowerCase();
    logAuthUiDiagnostic('signup_resend_click', {
      endpoint: '/auth/email-verification/resend',
      email,
      status: 'started',
    });
    if (!email) {
      setFlowMessage(verificationMessage, 'Informe o e-mail do cadastro para reenviar o código.');
      return;
    }
    if (!authApi?.resendEmailVerification) {
      setFlowMessage(verificationMessage, 'Reenvio de e-mail indisponível neste ambiente.');
      return;
    }

    try {
      const result = await authApi.resendEmailVerification({ email });
      const resendAccepted = result?.success === true || result?.deliveryConfirmed === true || result?.resent === true;
      logAuthUiDiagnostic('signup_resend_result', {
        endpoint: '/auth/email-verification/resend',
        email,
        status: result?.blocked === true ? 'blocked' : (resendAccepted ? 'success' : 'failed'),
      });
      if (result?.resendAvailableAt) {
        verificationFlowState.resendAvailableAt = String(result.resendAvailableAt || '');
        startVerificationTimer(verificationFlowState.resendAvailableAt);
      }
      if (result?.blocked === true) {
        setFlowMessage(verificationMessage, result?.message || 'Reenvio temporariamente indisponível.');
        return;
      }
      if (!resendAccepted) {
        setFlowMessage(verificationMessage, result?.message || 'Não foi possível reenviar o código agora.');
        return;
      }
      setFlowMessage(verificationMessage, result?.message || `Novo código enviado para ${verificationFlowState.maskedEmail}.`);
    } catch (error) {
      console.error('Erro ao reenviar código de confirmação', error);
      logAuthUiDiagnostic('signup_resend_error', {
        endpoint: '/auth/email-verification/resend',
        email,
        status: 'error',
        error: error?.message || String(error || ''),
      });
      setFlowMessage(verificationMessage, error?.message || 'Não foi possível reenviar o código agora.');
    }
  });

  resendCodePlaceholder?.addEventListener('click', () => {
    window.alert('Reenvio ainda indisponível nesta etapa.');
  });

  emailVerificationCodeInput?.addEventListener('input', () => {
    emailVerificationCodeInput.value = normalizeDigits(emailVerificationCodeInput.value, 6);
  });

  confirmVerificationButton?.addEventListener('click', async () => {
    const code = normalizeDigits(emailVerificationCodeInput?.value || '', 6);
    const email = verificationFlowState.email || String(emailInput?.value || '').trim().toLowerCase();
    logAuthUiDiagnostic('signup_verification_click', {
      endpoint: '/auth/email-verification/confirm',
      email,
      status: 'started',
    });
    if (code.length !== 6) {
      setFlowMessage(verificationMessage, 'Digite o código de 6 dígitos.');
      return;
    }
    if (!authApi?.confirmEmailVerification) {
      setFlowMessage(verificationMessage, 'Confirmação de e-mail indisponível neste ambiente.');
      return;
    }

    try {
      const result = await authApi.confirmEmailVerification({
        email,
        code,
      });
      logAuthUiDiagnostic('signup_verification_result', {
        endpoint: '/auth/email-verification/confirm',
        email,
        status: result?.success ? 'success' : 'failed',
        pendingVerification: result?.user?.emailVerified !== true,
      });
      if (!result?.success) {
        throw new Error('verification_failed');
      }
      setFlowMessage(verificationMessage, 'E-mail confirmado com sucesso. Preparando seu onboarding...');
      if (result?.pendingCheckout) {
        onboardingFlowState.pendingCheckoutMode = true;
        onboardingFlowState.pendingSignupToken = String(result.pendingSignupToken || '').trim();
        onboardingFlowState.pendingSignupEmail = email;
        onboardingFlowState.selectedPlanType = normalizePlanType(result.selectedPlan || onboardingFlowState.selectedPlanType);
        onboardingFlowState.operationType = normalizeOperationType(result.operationType || onboardingFlowState.operationType);
        onboardingFlowState.paymentLink = resolveCheckoutPaymentLink(result.paymentLink);
        stopAllTimers();
        window.setTimeout(() => {
          if (onboardingFlowState.operationType) {
            goToOnboardingPayment();
          } else {
            goToOnboardingProfile();
          }
        }, 700);
        return;
      }
      stopAllTimers();
      window.setTimeout(() => {
        resumeAuthenticatedExperience(result?.user || { email, emailVerified: true }, { forcePayment: true });
      }, 700);
    } catch (error) {
      console.error('Erro ao confirmar e-mail', error);
      setFlowMessage(verificationMessage, 'Código inválido ou expirado.');
    }
  });

  sendCodeButton?.addEventListener('click', async () => {
    const email = String(recoveryEmailInput?.value || '').trim().toLowerCase();
    logPasswordResetDiagnostic('request_click', {
      endpoint: '/auth/password-reset/request',
      email,
      status: 'started',
    });
    if (!email) {
      logPasswordResetDiagnostic('request_validation_failed', {
        endpoint: '/auth/password-reset/request',
        status: 'missing_email',
      });
      setFlowMessage(recoveryMessage, 'Informe o e-mail para continuar.');
      return;
    }
    if (!authApi?.requestPasswordReset) {
      logPasswordResetDiagnostic('request_unavailable', {
        endpoint: '/auth/password-reset/request',
        email,
        status: 'auth_api_missing',
      });
      setFlowMessage(recoveryMessage, 'Recuperação de senha indisponível neste ambiente.');
      return;
    }

    try {
      const result = await authApi.requestPasswordReset({ email });
      logPasswordResetDiagnostic('request_result', {
        endpoint: '/auth/password-reset/request',
        email,
        status: result?.success ? 'success' : 'failed',
      });
      if (!result?.success) {
        throw new Error('request_failed');
      }
      setRecoveryTarget(email);
      setFlowMessage(recoveryMessage, `Se o e-mail estiver cadastrado, você receberá um código para ${resetFlowState.maskedEmail}.`);
      goToCode();
    } catch (error) {
      console.error('Erro ao solicitar redefinição de senha', error);
      logPasswordResetDiagnostic('request_error', {
        endpoint: '/auth/password-reset/request',
        email,
        status: 'error',
        error: error?.message || String(error || ''),
      });
      setFlowMessage(recoveryMessage, 'Não foi possível enviar o código agora.');
    }
  });

  validateCodeButton?.addEventListener('click', async () => {
    const code = normalizeDigits(resetCodeInput?.value || '', 6);
    if (code.length !== 6) {
      setFlowMessage(codeMessage, 'Digite o código de 6 dígitos.');
      return;
    }
    if (!authApi?.validatePasswordResetCode) {
      setFlowMessage(codeMessage, 'Validação de código indisponível neste ambiente.');
      return;
    }

    try {
      const result = await authApi.validatePasswordResetCode({
        email: resetFlowState.email || String(recoveryEmailInput?.value || '').trim().toLowerCase(),
        code,
      });
      if (!result?.success) {
        throw new Error('invalid_code');
      }
      resetFlowState.code = code;
      setFlowMessage(codeMessage, 'Código validado com sucesso.');
      goToPassword();
    } catch (error) {
      console.error('Erro ao validar código', error);
      setFlowMessage(codeMessage, 'Código inválido ou expirado.');
    }
  });

  savePasswordButton?.addEventListener('click', async () => {
    const newPassword = String(newPasswordInput?.value || '').trim();
    const confirmPassword = String(confirmNewPasswordInput?.value || '').trim();
    if (!newPassword || !confirmPassword) {
      setFlowMessage(passwordMessage, 'Preencha a nova senha e a confirmação.');
      return;
    }
    if (!authApi?.saveNewPassword) {
      setFlowMessage(passwordMessage, 'Salvamento de nova senha indisponível neste ambiente.');
      return;
    }

    try {
      const result = await authApi.saveNewPassword({
        email: resetFlowState.email || String(recoveryEmailInput?.value || '').trim().toLowerCase(),
        code: resetFlowState.code || normalizeDigits(resetCodeInput?.value || '', 6),
        newPassword,
        confirmPassword,
      });
      if (!result?.success) {
        throw new Error('reset_failed');
      }
      setFlowMessage(passwordMessage, '');
      goToSuccess();
    } catch (error) {
      console.error('Erro ao salvar nova senha', error);
      setFlowMessage(passwordMessage, getFriendlyResetError(error));
    }
  });

  loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    setError('');

    const email = String(emailInput?.value || '').trim().toLowerCase();
    const senha = String(loginForm?.senha?.value || '').trim();

    if (!email || !senha) {
      setError('Informe e-mail e senha.');
      return;
    }

    if (!authApi?.login) {
      setError('Login indisponivel neste ambiente.');
      return;
    }

    try {
      const result = await authApi.login({ email, senha });
      if (result?.success && result?.user) {
        await resumeAuthenticatedExperience(result.user);
        return;
      }
      setError('Falha no login. Verifique suas credenciais.');
    } catch (err) {
      console.error('Erro no login', err);
      setError(err?.message || 'Falha no login. Verifique suas credenciais.');
    }
  });

  signupForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    setError('');
    setSignupMessage('');

    const documentType = String(signupForm?.documentType?.value || '').trim().toUpperCase();
    const documentNumber = String(signupForm?.documentNumber?.value || '').trim();
    const nomeClinica = String(signupForm?.nomeClinica?.value || '').trim();
    const responsavelNome = String(signupForm?.responsavelNome?.value || '').trim();
    const adminEmail = String(signupForm?.adminEmail?.value || '').trim().toLowerCase();
    const clinicEmail = adminEmail;
    const telefone = String(signupForm?.telefone?.value || '').trim();
    const cep = String(signupForm?.cep?.value || '').trim();
    const rua = String(signupForm?.rua?.value || '').trim();
    const numero = String(signupForm?.numero?.value || '').trim();
    const complemento = String(signupForm?.complemento?.value || '').trim();
    const bairro = String(signupForm?.bairro?.value || '').trim();
    const cidade = String(signupForm?.cidade?.value || '').trim();
    const uf = String(signupForm?.uf?.value || '').trim().toUpperCase();
    const password = String(signupForm?.password?.value || '').trim();
    const passwordConfirmation = String(signupForm?.passwordConfirmation?.value || '').trim();

    if (!documentType || !documentNumber || !nomeClinica || !responsavelNome || !adminEmail || !telefone || !cep || !rua || !numero || !bairro || !cidade || !uf || !password || !passwordConfirmation) {
      setSignupMessage('Preencha os dados de acesso e o endereco da clinica para continuar.');
      return;
    }

    if (password !== passwordConfirmation) {
      setSignupMessage('A confirmacao de senha nao confere.');
      return;
    }

    if (uf.length !== 2) {
      setSignupMessage('Informe a UF com 2 letras.');
      return;
    }

    if (!authApi?.signup) {
      setSignupMessage('Cadastro publico indisponivel neste ambiente.');
      return;
    }

    logAuthUiDiagnostic('signup_submit', {
      endpoint: '/auth/signup',
      email: adminEmail,
      status: 'started',
    });
    try {
      saveSignupDraft();
      const result = await authApi.signup({
        documentType,
        documentNumber,
        nomeClinica,
        responsavelNome,
        adminEmail,
        clinicEmail,
        telefone,
        cep,
        rua,
        numero,
        complemento,
        bairro,
        cidade,
        uf,
        password,
        passwordConfirmation,
        selectedPlan: onboardingFlowState.selectedPlanType,
        promotionCode: onboardingFlowState.promotionCode || onboardingFlowState.promotionOffer?.code || '',
      });
      logAuthUiDiagnostic('signup_result', {
        endpoint: '/auth/signup',
        email: adminEmail,
        status: result?.success ? 'success' : 'failed',
        pendingVerification: result?.pendingVerification === true,
      });

      if (result?.success && result?.pendingVerification === true) {
        clearSignupDraft();
        const verificationPrompt = result?.reusedActiveVerification === true
          ? `Ja existe um codigo valido para ${maskEmail(result?.user?.email || adminEmail)}. Use o codigo anterior ou aguarde para reenviar.`
          : `Enviamos um codigo para ${maskEmail(result?.user?.email || adminEmail)}. Confirme para acessar o sistema.`;
        goToVerification(
          result?.user?.email || adminEmail,
          verificationPrompt,
          {
            resendAvailableAt: result?.resendAvailableAt || '',
            sendCount: result?.sendCount || 0,
          }
        );
        return;
      }

      if (result?.success && result?.user) {
        clearSignupDraft();
        await resumeAuthenticatedExperience(result.user, { forcePayment: true });
        return;
      }

      setSignupMessage('Nao foi possivel criar a conta.');
    } catch (err) {
      console.error('Erro no cadastro publico', err);
      logAuthUiDiagnostic('signup_error', {
        endpoint: '/auth/signup',
        email: adminEmail,
        status: 'error',
        error: err?.message || String(err || ''),
      });
      if (String(err?.code || '').trim().toUpperCase() === 'PROMOTION_OFFER_INVALID') {
        onboardingFlowState.promotionCode = '';
        onboardingFlowState.promotionOffer = null;
        saveSignupDraft();
      }
      setSignupMessage(getFriendlySignupError(err));
    }
  });

  profileSelectionButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      const operationType = normalizeOperationType(button.getAttribute('data-operation-type'));
      if (!operationType) {
        setProfileSelectionMessage('Selecione um perfil valido para continuar.');
        return;
      }
      if (!onboardingFlowState.pendingCheckoutMode && !clinicApi?.updateOnboardingState) {
        setProfileSelectionMessage('Nao foi possivel salvar seu perfil agora.');
        return;
      }
      if (onboardingFlowState.pendingCheckoutMode && !authApi?.updatePendingSignupOnboarding) {
        setProfileSelectionMessage('Nao foi possivel salvar seu perfil agora.');
        return;
      }

      try {
        setProfileSelectionMessage('Salvando perfil...');
        const result = onboardingFlowState.pendingCheckoutMode
          ? await authApi.updatePendingSignupOnboarding({
              email: onboardingFlowState.pendingSignupEmail,
              pendingSignupToken: onboardingFlowState.pendingSignupToken,
              selectedPlan: onboardingFlowState.selectedPlanType,
              operationType,
            })
          : await clinicApi.updateOnboardingState({
              selectedPlan: onboardingFlowState.selectedPlanType,
              operationType,
            });
        onboardingFlowState.onboardingState = result || onboardingFlowState.onboardingState;
        onboardingFlowState.operationType = normalizeOperationType(result?.operationType || operationType);
        onboardingFlowState.paymentLink = resolveCheckoutPaymentLink(result?.paymentLink, onboardingFlowState.paymentLink);
        setProfileSelectionMessage('');
        await syncOnboardingState();
        goToOnboardingPayment();
      } catch (error) {
        console.error('Erro ao salvar perfil operacional', error);
        setProfileSelectionMessage(error?.message || 'Nao foi possivel salvar seu perfil agora.');
      }
    });
  });

  preparePaymentButton?.addEventListener('click', async () => {
    const effectiveStatus = String(onboardingFlowState.subscriptionOverview?.effectiveStatus || '').trim().toUpperCase();
    if (isOperationalAccessStatus(effectiveStatus)) {
      routeAuthenticatedUser();
      return;
    }

    if (!onboardingFlowState.selectedPlanType) {
      setPaymentMessage('Selecione um plano valido para continuar.');
      return;
    }

    if (onboardingFlowState.pendingCheckoutMode && (!authApi?.createPendingSignupCheckout || !authApi?.refreshPendingSignupPaymentStatus)) {
      setPaymentMessage('Pagamento indisponivel neste ambiente.');
      return;
    }

    if (!onboardingFlowState.pendingCheckoutMode && (!subscriptionApi?.create || !subscriptionApi?.getMySubscription || !subscriptionApi?.createCheckout || !subscriptionApi?.refreshPaymentStatus)) {
      setPaymentMessage('Pagamento indisponivel neste ambiente.');
      return;
    }

    try {
      const paymentLink = resolveCheckoutPaymentLink(
        onboardingFlowState.subscriptionOverview?.paymentLink,
        onboardingFlowState.subscriptionOverview?.subscription?.lastPayment?.paymentLink,
        onboardingFlowState.paymentLink
      );
      const selectedMethod = onboardingFlowState.checkoutPaymentMethod;

      if (paymentLink) {
        setPaymentMessage('Atualizando status do pagamento...');
        const refreshed = onboardingFlowState.pendingCheckoutMode
          ? await authApi.refreshPendingSignupPaymentStatus({
              email: onboardingFlowState.pendingSignupEmail,
              pendingSignupToken: onboardingFlowState.pendingSignupToken,
            })
          : await subscriptionApi.refreshPaymentStatus();
        if (refreshed?.token && refreshed?.user) {
          clearPaymentReturnContext();
          setPaymentMessage('Pagamento confirmado. Seu acesso ja pode ser liberado.');
          window.setTimeout(routeAuthenticatedUser, 600);
          return;
        }
        onboardingFlowState.subscriptionOverview = refreshed && typeof refreshed === 'object' ? refreshed : onboardingFlowState.subscriptionOverview;
        onboardingFlowState.paymentLink = String(
          refreshed?.paymentLink
          || refreshed?.subscription?.lastPayment?.paymentLink
          || onboardingFlowState.paymentLink
          || ''
        ).trim();
        renderPaymentSummary();
        if (isOperationalAccessStatus(refreshed?.effectiveStatus)) {
          clearPaymentReturnContext();
          setPaymentMessage('Pagamento confirmado. Seu acesso ja pode ser liberado.');
        } else {
          setPaymentMessage('Ainda nao encontramos confirmacao final do pagamento. Se voce acabou de pagar, aguarde alguns instantes e atualize novamente.');
        }
        return;
      }

      setPaymentMessage('Preparando assinatura e checkout seguro...');
      if (!onboardingFlowState.pendingCheckoutMode && !onboardingFlowState.subscriptionOverview?.subscription) {
        await subscriptionApi.create({
          planType: onboardingFlowState.selectedPlanType,
          provider: 'MANUAL',
          gatewayMode: 'CHECKOUT',
        });
      }

      const checkout = onboardingFlowState.pendingCheckoutMode
        ? await authApi.createPendingSignupCheckout({
            email: onboardingFlowState.pendingSignupEmail,
            pendingSignupToken: onboardingFlowState.pendingSignupToken,
            planType: onboardingFlowState.selectedPlanType,
            paymentMethod: selectedMethod,
            installmentCount: selectedMethod === 'INSTALLMENT' ? onboardingFlowState.installmentCount : undefined,
          })
        : await subscriptionApi.createCheckout({
            planType: onboardingFlowState.selectedPlanType,
            paymentMethod: selectedMethod,
            installmentCount: selectedMethod === 'INSTALLMENT' ? onboardingFlowState.installmentCount : undefined,
          });
      onboardingFlowState.paymentLink = resolveCheckoutPaymentLink(
        checkout?.paymentLink,
        checkout?.invoiceUrl,
        checkout?.url,
        checkout?.checkoutUrl
      );
      await syncOnboardingState();
      renderPaymentSummary();
      if (onboardingFlowState.paymentLink) {
        setPaymentMessage('Checkout seguro gerado. Continue para o Asaas e finalize o pagamento no metodo escolhido.');
        window.setTimeout(() => {
          openCheckoutLink(onboardingFlowState.paymentLink).catch((error) => {
            console.error('Falha ao abrir checkout Asaas', error);
          });
        }, 250);
      } else {
        setPaymentMessage('Assinatura preparada, mas o checkout nao foi retornado. Gere novamente para continuar.');
      }
    } catch (error) {
      console.error('Erro ao preparar assinatura', error);
      const friendlyMessage = getFriendlyCheckoutError(error);
      if (String(error?.code || '').trim().toUpperCase() === 'PENDING_CHECKOUT_EXPIRED' || Number(error?.status || 0) === 410) {
        goToSignup({
          email: onboardingFlowState.pendingSignupEmail,
          planType: onboardingFlowState.selectedPlanType,
          sourceLabel: onboardingFlowState.promotionCode ? `Oferta ${onboardingFlowState.promotionCode}` : '',
        });
        setSignupMessage(friendlyMessage);
        return;
      }
      setPaymentMessage(friendlyMessage);
    }
  });

  const initializeAuthScreen = async () => {
    const clinicEmailGroup = signupClinicEmailInput?.closest('.input-group');
    if (clinicEmailGroup) clinicEmailGroup.classList.add('hidden');
    await loadPlanCatalog();
    await applyInitialFlowRequest();
    await checkActiveSession();
  };

  initializeAuthScreen().catch((error) => {
    console.error('Erro ao inicializar fluxo de autenticacao.', error);
    if (initialFlowState.requestedMode === 'signup') {
      goToSignup({ planType: onboardingFlowState.selectedPlanType });
      setSignupMessage('Nao foi possivel iniciar automaticamente. Revise os dados e continue o cadastro.');
      return;
    }
    goToLogin();
  });
});
