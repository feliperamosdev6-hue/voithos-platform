document.addEventListener('DOMContentLoaded', () => {
  const appApi = window.appApi || {};
  const authApi = appApi.auth || {};
  const platformGrid = document.getElementById('platform-grid');
  const cards = Array.from(document.querySelectorAll('.import-card'));
  const pickButtons = Array.from(document.querySelectorAll('[data-action="pick"]'));

  const setCardState = (key, fileName) => {
    const status = document.getElementById(`status-${key}`);
    if (!status) return;
    status.textContent = fileName ? `Arquivo: ${fileName}` : 'Aguardando envio';
  };

  const toggleImportCards = (enabled) => {
    cards.forEach((card) => card.classList.toggle('disabled', !enabled));
  };

  const ensureAccess = async () => {
    try {
      const user = await authApi.currentUser();
      const perms = user?.permissions || {};
      const allowed = user?.tipo === 'admin' || perms.admin === true || perms['data.import'] === true;
      if (!user || !allowed) {
        window.location.href = 'index.html';
        return false;
      }
      return true;
    } catch (_) {
      window.location.href = 'index.html';
      return false;
    }
  };

  toggleImportCards(false);
  pickButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      const input = document.getElementById(target);
      input?.click();
    });
  });

  cards.forEach((card) => {
    const key = card.dataset.key;
    const input = card.querySelector('input[type="file"]');
    if (!input) return;
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      setCardState(key, file ? file.name : '');
    });
  });

  platformGrid?.addEventListener('change', () => {
    const selected = platformGrid.querySelector('input[name="platform"]:checked');
    toggleImportCards(!!selected);
  });

  (async () => {
    const ok = await ensureAccess();
    if (!ok) return;
  })();
});
