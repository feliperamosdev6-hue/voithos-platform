document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const errorMessage = document.getElementById('error-message');
  const signupMessage = document.getElementById('signup-message');
  const emailInput = document.getElementById('login-email');
  const forgotPasswordLink = document.getElementById('forgot-password-link');
  const signupForm = document.getElementById('signup-form');
  const showSignupLink = document.getElementById('show-signup-link');
  const hideSignupLink = document.getElementById('hide-signup-link');
  const authApi = window.appApi?.auth || window.auth;

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
          // Evita prender o usuario na area de super admin por sessao antiga.
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
    window.alert('Fluxo de recuperacao de senha em desenvolvimento. Contate o administrador da clinica.');
  });

  showSignupLink?.addEventListener('click', (event) => {
    event.preventDefault();
    setError('');
    setSignupMessage('');
    toggleSignupForm(true);
  });

  hideSignupLink?.addEventListener('click', (event) => {
    event.preventDefault();
    setSignupMessage('');
    toggleSignupForm(false);
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

  checkActiveSession();
});
