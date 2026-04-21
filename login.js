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
  const resetFlowState = {
    email: '',
    maskedEmail: '',
    code: '284619',
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

  const syncRecoveryMock = (email) => {
    resetFlowState.email = email;
    resetFlowState.maskedEmail = maskEmail(email);
    if (maskedEmailBadge) {
      maskedEmailBadge.textContent = `Código enviado para ${resetFlowState.maskedEmail}`;
    }
  };

  const goToLogin = () => {
    showScreen('login');
    updateSubtitle('Acesse sua conta para continuar');
  };

  const goToRecovery = () => {
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
    if (verificationCodeInput) {
      verificationCodeInput.value = '';
      verificationCodeInput.focus();
    }
  };

  const goToPassword = () => {
    showScreen('password');
    updateSubtitle('Nova senha');
    if (newPasswordInput) newPasswordInput.focus();
  };

  const goToSuccess = () => {
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
        if (user.tipo === 'super_admin') {
          return;
        }
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
    window.alert('Reenvio visual apenas nesta etapa.');
  });

  sendCodeButton?.addEventListener('click', () => {
    const email = String(recoveryEmailInput?.value || '').trim().toLowerCase();
    if (!email) {
      if (recoveryMessage) recoveryMessage.textContent = 'Informe o e-mail para continuar.';
      return;
    }
    syncRecoveryMock(email);
    if (recoveryMessage) {
      recoveryMessage.textContent = `Código enviado para ${resetFlowState.maskedEmail}.`;
    }
    goToCode();
  });

  verificationCodeInput?.addEventListener('input', () => {
    verificationCodeInput.value = normalizeDigits(verificationCodeInput.value, 6);
  });

  validateCodeButton?.addEventListener('click', () => {
    const code = normalizeDigits(verificationCodeInput?.value || '', 6);
    if (code.length !== 6) {
      if (codeMessage) codeMessage.textContent = 'Digite o código de 6 dígitos.';
      return;
    }
    if (code !== resetFlowState.code) {
      if (codeMessage) codeMessage.textContent = 'Código inválido na visualização.';
      return;
    }
    if (codeMessage) codeMessage.textContent = 'Código validado com sucesso.';
    goToPassword();
  });

  savePasswordButton?.addEventListener('click', () => {
    const newPassword = String(newPasswordInput?.value || '').trim();
    const confirmPassword = String(confirmNewPasswordInput?.value || '').trim();
    if (!newPassword || !confirmPassword) {
      if (passwordMessage) passwordMessage.textContent = 'Preencha a nova senha e a confirmação.';
      return;
    }
    if (newPassword !== confirmPassword) {
      if (passwordMessage) passwordMessage.textContent = 'A confirmação não confere.';
      return;
    }
    if (passwordMessage) passwordMessage.textContent = 'Senha alterada na visualização.';
    goToSuccess();
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
