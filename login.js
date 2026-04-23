document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const errorMessage = document.getElementById('error-message');
  const signupMessage = document.getElementById('signup-message');
  const emailInput = document.getElementById('login-email');
  const forgotPasswordLink = document.getElementById('forgot-password-link');
  const signupForm = document.getElementById('signup-form');
  const showSignupLink = document.getElementById('show-signup-link');
  const hideSignupLink = document.getElementById('hide-signup-link');
  const screenSubtitle = document.getElementById('screen-subtitle');
  const screens = {
    login: document.getElementById('screen-login'),
    verification: document.getElementById('screen-verification'),
    recovery: document.getElementById('screen-recovery'),
    code: document.getElementById('screen-code'),
    password: document.getElementById('screen-password'),
    success: document.getElementById('screen-success'),
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
  const authApi = window.appApi?.auth || window.auth;
  const RESEND_WAIT_SECONDS = 5 * 60;
  const VERIFICATION_WAIT_SECONDS = 5 * 60;
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
    resendTimerId: null,
  };

  const setError = (message) => {
    if (errorMessage) errorMessage.textContent = message || '';
  };

  const setSignupMessage = (message) => {
    if (signupMessage) signupMessage.textContent = message || '';
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

  const startVerificationTimer = () => {
    stopAllTimers();
    let remainingSeconds = VERIFICATION_WAIT_SECONDS;

    const updateLabel = () => {
      if (!resendVerificationPlaceholder) return;
      resendVerificationPlaceholder.disabled = true;
      resendVerificationPlaceholder.textContent = `Reenviar código em ${formatResendWait(remainingSeconds)}`;
    };

    updateLabel();
    verificationFlowState.resendTimerId = window.setInterval(() => {
      remainingSeconds -= 1;
      if (remainingSeconds <= 0) {
        if (verificationFlowState.resendTimerId) {
          window.clearInterval(verificationFlowState.resendTimerId);
          verificationFlowState.resendTimerId = null;
        }
        if (resendVerificationPlaceholder) {
          resendVerificationPlaceholder.disabled = true;
          resendVerificationPlaceholder.textContent = 'Reenvio disponível em breve';
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
    stopAllTimers();
    showScreen('login');
    updateSubtitle('Acesse sua conta para continuar');
  };

  const goToVerification = (email, message) => {
    stopAllTimers();
    setVerificationTarget(email || verificationFlowState.email || '');
    showScreen('verification');
    updateSubtitle('Confirme seu e-mail');
    startVerificationTimer();
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

  const routeAuthenticatedUser = (user, fallbackEmail = '', verificationMessageText = '') => {
    if (user?.tipo === 'super_admin') {
      window.location.href = 'super-admin.html';
      return true;
    }
    if (user?.mustChangePassword && !user?.isImpersonatedSession) {
      window.location.href = 'change-password.html';
      return true;
    }
    if (user?.emailVerificationPending === true || user?.emailVerified !== true) {
      goToVerification(
        user?.email || fallbackEmail,
        verificationMessageText || 'Seu e-mail precisa ser confirmado para continuar.'
      );
      return true;
    }
    window.location.href = 'index.html';
    return true;
  };

  const normalizeDigits = (value, maxLength) => String(value || '').replace(/\D/g, '').slice(0, maxLength);

  const checkActiveSession = async () => {
    if (!authApi?.currentUser) return;
    try {
      const user = await authApi.currentUser();
      if (user) {
        if (user.tipo === 'super_admin') return;
        routeAuthenticatedUser(user, user?.email || '');
      }
    } catch (err) {
      console.warn('Nao foi possivel validar sessao existente.', err);
    }
  };

  forgotPasswordLink?.addEventListener('click', (event) => {
    event.preventDefault();
    goToRecovery();
  });

  showSignupLink?.addEventListener('click', (event) => {
    event.preventDefault();
    setError('');
    setSignupMessage('');
    toggleSignupForm(true);
    updateSubtitle('Criar conta');
    Object.values(screens).forEach((screen) => screen?.classList.add('hidden'));
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

  resendVerificationPlaceholder?.addEventListener('click', () => {
    window.alert('Reenvio ainda indisponível nesta etapa.');
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
      setFlowMessage(verificationMessage, 'E-mail confirmado com sucesso. Entrando no sistema...');
      stopAllTimers();
      window.setTimeout(() => {
        routeAuthenticatedUser(result?.user || { email, emailVerified: true }, email);
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
        routeAuthenticatedUser(result.user, email);
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
      });
      logAuthUiDiagnostic('signup_result', {
        endpoint: '/auth/signup',
        email: adminEmail,
        status: result?.success ? 'success' : 'failed',
        pendingVerification: result?.pendingVerification === true,
      });

      if (result?.success && result?.user) {
        routeAuthenticatedUser(
          result.user,
          adminEmail,
          `Enviamos um código para ${maskEmail(result.user?.email || adminEmail)}. Confirme para acessar o Index.`
        );
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

  showScreen('login');
  checkActiveSession();
});
