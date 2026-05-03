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
  const profileSelectionMessage = document.getElementById('profile-selection-message');
  const profileSelectionButtons = Array.from(document.querySelectorAll('[data-operation-type]'));
  const backToVerificationFromProfile = document.getElementById('back-to-verification-from-profile');
  const paymentPlanName = document.getElementById('payment-plan-name');
  const paymentPlanDescription = document.getElementById('payment-plan-description');
  const paymentPlanPrice = document.getElementById('payment-plan-price');
  const paymentStatusTitle = document.getElementById('payment-status-title');
  const paymentStatusCopy = document.getElementById('payment-status-copy');
  const paymentMessage = document.getElementById('payment-message');
  const preparePaymentButton = document.getElementById('prepare-payment-button');
  const backToProfileFromPayment = document.getElementById('back-to-profile-from-payment');
  const authApi = window.appApi?.auth || window.auth;
  const clinicApi = window.appApi?.clinic || window.clinic || {};
  const subscriptionApi = window.appApi?.subscription || window.subscription || {};
  const RESEND_WAIT_SECONDS = 5 * 60;
  const VERIFICATION_WAIT_SECONDS = 2 * 60;
  const PLAN_DEFINITIONS = {
    MONTHLY: { slug: 'mensal', label: 'Mensal', price: 'R$ 94,90', description: 'Cobranca mensal para comecar com flexibilidade.' },
    QUARTERLY: { slug: 'trimestral', label: 'Trimestral', price: 'R$ 269,90', description: 'Ciclo ideal para validar a operacao sem perder continuidade.' },
    SEMIANNUAL: { slug: 'semestral', label: 'Semestral', price: 'R$ 499,90', description: 'Plano mais escolhido por clinicas em crescimento.' },
    ANNUAL: { slug: 'anual', label: 'Anual', price: 'R$ 899,90', description: 'Maior economia para uso continuo da plataforma.' },
  };
  const PLAN_ALIASES = {
    mensal: 'MONTHLY',
    monthly: 'MONTHLY',
    trimestral: 'QUARTERLY',
    quarterly: 'QUARTERLY',
    semestral: 'SEMIANNUAL',
    semiannual: 'SEMIANNUAL',
    anual: 'ANNUAL',
    annual: 'ANNUAL',
  };
  const OPERATION_TYPE_LABELS = {
    AUTONOMOUS_DENTIST: 'Dentista autonomo',
    CLINIC: 'Clinica',
    OTHER: 'Outros',
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
  };
  const initialFlowState = {
    requestedMode: 'login',
    skipAutoSessionResume: false,
  };

  const setError = (message) => {
    if (errorMessage) errorMessage.textContent = message || '';
  };

  const setSignupMessage = (message) => {
    if (signupMessage) signupMessage.textContent = message || '';
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
    setProfileSelectionMessage('');
    setPaymentMessage('');
  };

  const resetSignupFormState = ({ prefillEmail = '', preservePlan = false } = {}) => {
    if (signupForm instanceof HTMLFormElement) signupForm.reset();
    if (signupForm?.adminEmail) signupForm.adminEmail.value = prefillEmail;
    if (signupForm?.clinicEmail) signupForm.clinicEmail.value = '';
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
    const normalized = String(value || '').trim().toLowerCase();
    return PLAN_ALIASES[normalized] || PLAN_ALIASES[normalized.replace(/[\s_-]+/g, '')] || (PLAN_DEFINITIONS[String(value || '').trim().toUpperCase()] ? String(value || '').trim().toUpperCase() : '');
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
    return {
      planType: normalizedPlanType,
      label: fallback?.label || String(remoteMatch?.planType || '').trim() || 'Plano',
      price: remoteMatch?.amount ? `R$ ${Number(remoteMatch.amount).toFixed(2).replace('.', ',')}` : (fallback?.price || '--'),
      description: fallback?.description || 'Finalize a assinatura para liberar o acesso completo ao sistema.',
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
    if (signupPlanCopy) signupPlanCopy.textContent = 'Seu cadastro seguira para confirmacao de e-mail, definicao do perfil operacional e ativacao da assinatura.';
    if (signupEntryHint) signupEntryHint.textContent = `${planView.label} selecionado na landing.`;
  };

  const setPaymentMessage = (message) => {
    if (paymentMessage) paymentMessage.textContent = message || '';
  };

  const setProfileSelectionMessage = (message) => {
    if (profileSelectionMessage) profileSelectionMessage.textContent = message || '';
  };

  const renderPaymentSummary = () => {
    const overview = onboardingFlowState.subscriptionOverview || null;
    const planView = buildPlanView(
      onboardingFlowState.selectedPlanType || onboardingFlowState.onboardingState?.selectedPlan || overview?.subscription?.planType,
      overview?.plans || []
    );
    const effectiveStatus = String(overview?.effectiveStatus || '').trim().toUpperCase();
    const paymentLink = String(overview?.subscription?.lastPayment?.paymentLink || '').trim();

    if (paymentPlanName) paymentPlanName.textContent = planView.label || 'Plano nao definido';
    if (paymentPlanDescription) paymentPlanDescription.textContent = planView.description;
    if (paymentPlanPrice) paymentPlanPrice.textContent = planView.price || '--';

    if (!overview?.subscription) {
      if (paymentStatusTitle) paymentStatusTitle.textContent = 'Assinatura ainda nao iniciada';
      if (paymentStatusCopy) paymentStatusCopy.textContent = 'Prepare a assinatura agora para seguir para a cobranca da conta.';
      if (preparePaymentButton) preparePaymentButton.textContent = 'Preparar assinatura';
      return;
    }

    if (effectiveStatus === 'ACTIVE' || effectiveStatus === 'GRACE_PERIOD') {
      if (paymentStatusTitle) paymentStatusTitle.textContent = 'Assinatura ativa';
      if (paymentStatusCopy) paymentStatusCopy.textContent = 'Pagamento confirmado. O acesso completo ao webapp ja pode ser liberado.';
      if (preparePaymentButton) preparePaymentButton.textContent = 'Entrar no sistema';
      return;
    }

    if (paymentStatusTitle) paymentStatusTitle.textContent = 'Pagamento pendente';
    if (paymentStatusCopy) {
      paymentStatusCopy.textContent = paymentLink
        ? `Assinatura preparada. Link tecnico atual: ${paymentLink}. A tela de cobranca sera conectada na proxima etapa.`
        : 'Assinatura preparada. A cobranca desta conta ainda sera conectada ao gateway na proxima etapa.';
    }
    if (preparePaymentButton) preparePaymentButton.textContent = 'Atualizar status do pagamento';
  };

  const shouldKeepUserInOnboarding = () => {
    const selectedPlanType = onboardingFlowState.selectedPlanType || onboardingFlowState.onboardingState?.selectedPlan || '';
    const operationType = onboardingFlowState.operationType || onboardingFlowState.onboardingState?.operationType || '';
    const effectiveStatus = String(onboardingFlowState.subscriptionOverview?.effectiveStatus || '').trim().toUpperCase();

    if (!selectedPlanType) return false;
    if (!operationType) return true;
    return !['ACTIVE', 'GRACE_PERIOD'].includes(effectiveStatus);
  };

  const syncOnboardingState = async () => {
    const [onboardingState, subscriptionOverview] = await Promise.all([
      clinicApi?.getOnboardingState ? clinicApi.getOnboardingState().catch(() => null) : Promise.resolve(null),
      subscriptionApi?.getMySubscription ? subscriptionApi.getMySubscription().catch(() => null) : Promise.resolve(null),
    ]);

    onboardingFlowState.onboardingState = onboardingState && typeof onboardingState === 'object' ? onboardingState : null;
    onboardingFlowState.subscriptionOverview = subscriptionOverview && typeof subscriptionOverview === 'object' ? subscriptionOverview : null;
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
    return {
      mode: normalizeRequestedMode(rawMode),
      email,
      plan: normalizePlanType(plan),
    };
  };

  const clearInitialFlowUrl = () => {
    try {
      const url = new URL(window.location.href);
      ['mode', 'screen', 'plan', 'email'].forEach((key) => url.searchParams.delete(key));
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
    initialFlowState.skipAutoSessionResume = request.mode === 'signup';

    if (request.mode === 'signup' && authApi?.clearSession) {
      await authApi.clearSession({ remote: false }).catch(() => null);
    }

    if (request.mode === 'signup' || request.mode === 'recovery' || request.plan || request.email) {
      clearInitialFlowUrl();
    }

    if (request.email) {
      if (emailInput) emailInput.value = request.email;
      if (recoveryEmailInput) recoveryEmailInput.value = request.email;
    }

    if (request.mode === 'signup') {
      onboardingFlowState.selectedPlanType = request.plan || '';
      const planView = buildPlanView(onboardingFlowState.selectedPlanType);
      const sourceLabel = planView.planType ? `Plano ${planView.label}` : '';
      goToSignup({ email: request.email, sourceLabel, planType: onboardingFlowState.selectedPlanType });
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
      verificationEmailBadge.textContent = `Código enviado para ${verificationFlowState.maskedEmail}`;
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
    initialFlowState.skipAutoSessionResume = false;
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

      if (['ACTIVE', 'GRACE_PERIOD'].includes(effectiveStatus)) {
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
    if (initialFlowState.skipAutoSessionResume) return;
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
    const clinicEmail = String(signupForm?.clinicEmail?.value || '').trim().toLowerCase();
    const telefone = String(signupForm?.telefone?.value || '').trim();
    const password = String(signupForm?.password?.value || '').trim();
    const passwordConfirmation = String(signupForm?.passwordConfirmation?.value || '').trim();

    if (!documentType || !documentNumber || !nomeClinica || !responsavelNome || !adminEmail || !password || !passwordConfirmation) {
      setSignupMessage('Preencha todos os campos do cadastro.');
      return;
    }

    if (password !== passwordConfirmation) {
      setSignupMessage('A confirmacao de senha nao confere.');
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
      const result = await authApi.signup({
        documentType,
        documentNumber,
        nomeClinica,
        responsavelNome,
        adminEmail,
        clinicEmail,
        telefone,
        password,
        passwordConfirmation,
        selectedPlan: onboardingFlowState.selectedPlanType,
      });
      logAuthUiDiagnostic('signup_result', {
        endpoint: '/auth/signup',
        email: adminEmail,
        status: result?.success ? 'success' : 'failed',
        pendingVerification: result?.pendingVerification === true,
      });

      if (result?.success && result?.pendingVerification === true) {
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
      setSignupMessage(err?.message || 'Nao foi possivel criar a conta.');
    }
  });

  profileSelectionButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      const operationType = normalizeOperationType(button.getAttribute('data-operation-type'));
      if (!operationType) {
        setProfileSelectionMessage('Selecione um perfil valido para continuar.');
        return;
      }
      if (!clinicApi?.updateOnboardingState) {
        setProfileSelectionMessage('Nao foi possivel salvar seu perfil agora.');
        return;
      }

      try {
        setProfileSelectionMessage('Salvando perfil...');
        const result = await clinicApi.updateOnboardingState({
          selectedPlan: onboardingFlowState.selectedPlanType,
          operationType,
        });
        onboardingFlowState.onboardingState = result || onboardingFlowState.onboardingState;
        onboardingFlowState.operationType = normalizeOperationType(result?.operationType || operationType);
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
    if (['ACTIVE', 'GRACE_PERIOD'].includes(effectiveStatus)) {
      routeAuthenticatedUser();
      return;
    }

    if (!onboardingFlowState.selectedPlanType) {
      setPaymentMessage('Selecione um plano valido para continuar.');
      return;
    }

    if (!subscriptionApi?.create || !subscriptionApi?.getMySubscription) {
      setPaymentMessage('Pagamento indisponivel neste ambiente.');
      return;
    }

    try {
      setPaymentMessage('Preparando assinatura...');
      if (!onboardingFlowState.subscriptionOverview?.subscription) {
        await subscriptionApi.create({
          planType: onboardingFlowState.selectedPlanType,
          provider: 'MANUAL',
        });
      }
      await syncOnboardingState();
      renderPaymentSummary();
      setPaymentMessage('Assinatura preparada. A cobranca sera conectada ao gateway na proxima etapa.');
    } catch (error) {
      console.error('Erro ao preparar assinatura', error);
      setPaymentMessage(error?.message || 'Nao foi possivel preparar a assinatura agora.');
    }
  });

  const initializeAuthScreen = async () => {
    await applyInitialFlowRequest();
    await checkActiveSession();
  };

  initializeAuthScreen().catch((error) => {
    console.error('Erro ao inicializar fluxo de autenticacao.', error);
    goToLogin();
  });
});
