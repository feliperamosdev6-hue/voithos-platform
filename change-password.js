document.addEventListener('DOMContentLoaded', () => {
  const appApi = window.appApi || {};
  const authApi = appApi.auth || {};
  const form = document.getElementById('change-password-form');
  const senhaAtualInput = document.getElementById('senha-atual');
  const novaSenhaInput = document.getElementById('nova-senha');
  const confirmarSenhaInput = document.getElementById('confirmar-senha');
  const errorMessage = document.getElementById('error-message');
  const btnLogout = document.getElementById('btn-logout');

  const setError = (message) => {
    if (errorMessage) errorMessage.textContent = message || '';
  };

  const ensureValidUser = async () => {
    const user = await authApi.currentUser();
    if (!user) {
      window.location.href = 'login.html';
      return null;
    }
    if (user.tipo === 'super_admin') {
      window.location.href = 'super-admin.html';
      return null;
    }
    if (!user.mustChangePassword || user.isImpersonatedSession) {
      window.location.href = 'index.html';
      return null;
    }
    return user;
  };

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    setError('');

    const senhaAtual = String(senhaAtualInput?.value || '').trim();
    const novaSenha = String(novaSenhaInput?.value || '').trim();
    const confirmarSenha = String(confirmarSenhaInput?.value || '').trim();

    if (!senhaAtual || !novaSenha || !confirmarSenha) {
      setError('Preencha todos os campos.');
      return;
    }
    if (novaSenha.length < 6) {
      setError('A nova senha precisa ter ao menos 6 caracteres.');
      return;
    }
    if (novaSenha !== confirmarSenha) {
      setError('A confirmacao de senha nao confere.');
      return;
    }

    try {
      await authApi.changePassword({ senhaAtual, novaSenha });
      window.location.href = 'index.html';
    } catch (err) {
      setError(err?.message || 'Falha ao atualizar senha.');
    }
  });

  btnLogout?.addEventListener('click', async () => {
    try {
      await authApi.logout();
    } finally {
      window.location.href = 'login.html';
    }
  });

  ensureValidUser().catch(() => {
    window.location.href = 'login.html';
  });
});

