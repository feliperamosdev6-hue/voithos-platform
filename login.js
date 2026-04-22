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
    recovery: document.getElementById('screen-recovery'),
    code: document.getElementById('screen-code'),
    password: document.getElementById('screen-password'),
    success: document.getElementById('screen-success'),
  };
  const recoveryEmailInput = document.getElementById('recovery-email');
  const sendCodeButton = document.getElementById('send-code-button');
  const backToLoginFromRecovery = document.getElementById('back-to-login-from-recovery');
  const maskedEmailBadge = document.getElementById('masked-email-badge');
  const verificationCodeInput = document.getElementById('verification-code');
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
  const resetFlowState = {
    email: '',
    maskedEmail: '',
    code: '',
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
    stopResendTimer();
    showScreen('login');
    updateSubtitle('Acesse sua conta para continuar');
  };

  const goToRecovery = () => {
    stopResendTimer();
    showScreen('recovery');
    updateSubtitle('Recuperação de senha');
    if (recoveryEmailInput) {
      recoveryEmailInput.value = String(emailInput?.value || '');
      recoveryEmailInput.focus();
    }
  };

  const goToCode = () => {
    showScreen('code');
    updateSubtitle('Validação do código');
    startResendTimer();
    if (verificationCodeInput) {
      verificationCodeInput.focus();
    }
  };

  const goToPassword = () => {
    stopResendTimer();
    showScreen('password');
    updateSubtitle('Nova senha');
    if (newPasswordInput) newPasswordInput.focus();
  };

  const goToSuccess = () => {
    stopResendTimer();
    showScreen('success');
    updateSubtitle('Senha redefinida');
  };

  const normalizeDigits = (value, maxLength) => String(value || '').replace(/\D/g, '').slice(0, maxLength);

  const redirectAfterLogin = (user) => {
    if (user?.tipo === 'super_admin') {
      window.location.href = 'super-admin.html';
      return;
    }
    if (user?.mustChangePassword && !user?.isImpersonatedSession) {
      window.location.href = 'change-password.html';
      return;
    }
    window.location.href = 'index.html';
  };

  const checkActiveSession = async () => {
    if (!authApi?.currentUser) return;
    try {
      const user = await authApi.currentUser();
      if (user) {
        if (user.tipo === 'super_admin') return;
        redirectAfterLogin(user);
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

  backToLoginFromRecovery?.addEventListener('click', goToLogin);
  backToLoginFromCode?.addEventListener('click', goToLogin);
  backToLoginFromPassword?.addEventListener('click', goToLogin);
  backToLoginFromSuccess?.addEventListener('click', goToLogin);

  resendCodePlaceholder?.addEventListener('click', () => {
    window.alert('Reenvio ainda indisponível nesta etapa.');
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
      setFlowMessage(recoveryMessage, `Enviamos um código para ${resetFlowState.maskedEmail}.`);
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

  verificationCodeInput?.addEventListener('input', () => {
    verificationCodeInput.value = normalizeDigits(verificationCodeInput.value, 6);
  });

  validateCodeButton?.addEventListener('click', async () => {
    const code = normalizeDigits(verificationCodeInput?.value || '', 6);
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
        code: resetFlowState.code || normalizeDigits(verificationCodeInput?.value || '', 6),
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
        redirectAfterLogin(result.user);
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

      if (result?.success && result?.user) {
        redirectAfterLogin(result.user);
        return;
      }

      setSignupMessage('Nao foi possivel criar a conta.');
    } catch (err) {
      console.error('Erro no cadastro publico', err);
      setSignupMessage(err?.message || 'Nao foi possivel criar a conta.');
    }
  });

  showScreen('login');
  checkActiveSession();
});
