document.addEventListener('DOMContentLoaded', () => {
  const appApi = window.appApi || {};
  const authApi = appApi.auth || {};
  const proceduresApi = appApi.procedures || {};
  const tbody = document.getElementById('procedures-tbody');
  const searchInput = document.getElementById('procedure-search');
  const btnAdd = document.getElementById('btn-add-procedure');
  const modal = document.getElementById('procedure-modal');
  const modalTitle = document.getElementById('procedure-modal-title');
  const modalClose = document.getElementById('procedure-close');
  const modalCancel = document.getElementById('procedure-cancel');
  const form = document.getElementById('procedure-form');
  const errorEl = document.getElementById('procedure-error');
  const codigoInput = document.getElementById('procedure-codigo');
  const nomeInput = document.getElementById('procedure-nome');
  const precoInput = document.getElementById('procedure-preco');

  let cache = [];
  let editingCodigo = '';

  const ensureAccess = async () => {
    try {
      const user = await authApi.currentUser();
      const perms = user?.permissions || {};
      const tipo = String(user?.tipo || '').trim().toLowerCase();
      const allowed = ['admin', 'administrativo', 'super_admin'].includes(tipo)
        || perms.admin === true
        || perms['procedures.manage'] === true;
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

  const formatCurrency = (value) => {
    const v = Number(value) || 0;
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const openModal = (proc = null) => {
    modal?.classList.add('open');
    form?.reset();
    if (errorEl) errorEl.textContent = '';
    editingCodigo = proc?.codigo || '';
    if (proc) {
      if (codigoInput) codigoInput.value = proc.codigo || '';
      if (nomeInput) nomeInput.value = proc.nome || '';
      if (precoInput) precoInput.value = Number(proc.preco || 0).toFixed(2);
      if (codigoInput) codigoInput.disabled = true;
      if (modalTitle) modalTitle.textContent = 'Editar procedimento';
    } else {
      if (codigoInput) codigoInput.disabled = false;
      if (modalTitle) modalTitle.textContent = 'Novo procedimento';
    }
    codigoInput?.focus();
  };

  const closeModal = () => {
    modal?.classList.remove('open');
    editingCodigo = '';
  };

  const render = (list) => {
    if (!tbody) return;
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="3" class="empty">Nenhum procedimento encontrado.</td></tr>';
      return;
    }

    tbody.innerHTML = list.map((p) => `
      <tr>
        <td>${p.nome || ''}</td>
        <td>${formatCurrency(p.preco)}</td>
        <td>
          <div class="table-actions">
            <button class="action-btn" data-action="edit" data-code="${p.codigo}">Editar</button>
            <button class="action-btn danger" data-action="delete" data-code="${p.codigo}">Excluir</button>
          </div>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('[data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        const code = ev.currentTarget.getAttribute('data-code');
        const proc = cache.find((p) => p.codigo === code);
        if (proc) openModal(proc);
      });
    });

    tbody.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', async (ev) => {
        const code = ev.currentTarget.getAttribute('data-code');
        if (!code) return;
        const ok = confirm('Remover procedimento?');
        if (!ok) return;
        try {
          await proceduresApi.remove({ codigo: code });
          await loadProcedures();
        } catch (err) {
          console.error('Erro ao remover procedimento', err);
          alert(err?.message || 'Erro ao remover procedimento.');
        }
      });
    });
  };

  const loadProcedures = async () => {
    if (tbody) tbody.innerHTML = '<tr><td colspan="3" class="empty">Carregando...</td></tr>';
    try {
      const list = await proceduresApi.list();
      cache = Array.isArray(list) ? list : [];
      applyFilter();
    } catch (err) {
      console.error('Erro ao carregar procedimentos', err);
      if (tbody) tbody.innerHTML = '<tr><td colspan="3" class="empty">Falha ao carregar procedimentos.</td></tr>';
    }
  };

  const applyFilter = () => {
    const q = String(searchInput?.value || '').trim().toLowerCase();
    if (!q) return render(cache);
    const filtered = cache.filter((p) =>
      String(p.nome || '').toLowerCase().includes(q) || String(p.codigo || '').toLowerCase().includes(q)
    );
    render(filtered);
  };

  btnAdd?.addEventListener('click', () => openModal());
  modalClose?.addEventListener('click', closeModal);
  modalCancel?.addEventListener('click', closeModal);
  searchInput?.addEventListener('input', applyFilter);

  form?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (errorEl) errorEl.textContent = '';
    let codigo = (codigoInput?.value || '').trim();
    const nome = (nomeInput?.value || '').trim();
    const preco = Number(precoInput?.value || 0);
    if (!nome) {
      if (errorEl) errorEl.textContent = 'Preencha o nome.';
      return;
    }
    if (!codigo) {
      codigo = `PROC-${Date.now()}`;
    }
    try {
      await proceduresApi.upsert({
        codigo,
        nome,
        preco: Number.isFinite(preco) ? preco : 0,
      });
      closeModal();
      await loadProcedures();
    } catch (err) {
      console.error('Erro ao salvar procedimento', err);
      if (errorEl) errorEl.textContent = err?.message || 'Erro ao salvar procedimento.';
    }
  });

  (async () => {
    const ok = await ensureAccess();
    if (!ok) return;
    loadProcedures();
  })();
});
