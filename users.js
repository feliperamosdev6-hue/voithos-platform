// Gerenciamento de Usuarios - somente admin

document.addEventListener('DOMContentLoaded', () => {
  const appApi = window.appApi || {};
  const authApi = appApi.auth || {};
  const usersApi = appApi.users || {};
  const tbody = document.getElementById('users-tbody');
  const btnNew = document.getElementById('btn-new-user');
  const createForm = document.getElementById('user-create-form');
  const createError = document.getElementById('create-error');
  const createTitle = document.getElementById('create-title');
  const createCancel = document.getElementById('btn-cancel-edit');
  const clinicContextName = document.getElementById('clinic-context-name');
  const clinicContextId = document.getElementById('clinic-context-id');
  const nomeInput = document.getElementById('create-nome');
  const telefoneInput = document.getElementById('create-telefone');
  const emailInput = document.getElementById('create-email');
  const senhaInput = document.getElementById('create-senha');
  const tipoSelect = document.getElementById('create-tipo');
  const dentistColorGroup = document.getElementById('create-dentist-color-group');
  const colorInput = document.getElementById('create-corDentista');
  const colorTextInput = document.getElementById('create-corDentistaTexto');
  const rxAssinaturaNomeInput = document.getElementById('create-rx-assinatura-nome');
  const rxAssinaturaRegistroInput = document.getElementById('create-rx-assinatura-registro');
  const croInput = document.getElementById('create-cro');
  const rxAssinaturaFileInput = document.getElementById('create-rx-assinatura-file');
  const rxAssinaturaPreview = document.getElementById('create-rx-assinatura-preview');
  const rxAssinaturaImage = document.getElementById('create-rx-assinatura-image');
  const rxAssinaturaRemoveBtn = document.getElementById('create-rx-assinatura-remove');
  const dentistSignatureGroup = document.getElementById('create-dentist-signature-group');
  const permAdmin = document.getElementById('perm-admin');
  const permClinic = document.getElementById('perm-clinic-manage');
  const permProcedures = document.getElementById('perm-procedures-manage');
  const permUsers = document.getElementById('perm-users-manage');
  const permImportData = document.getElementById('perm-import-data');
  const permAgendaSettings = document.getElementById('perm-agenda-settings');
  const permAgendaAvailability = document.getElementById('perm-agenda-availability');
  const permNotifications = document.getElementById('perm-notifications');
  const permAgendaView = document.getElementById('perm-agenda-view');
  const permAgendaEdit = document.getElementById('perm-agenda-edit');
  const permFinanceView = document.getElementById('perm-finance-view');
  const permFinanceEdit = document.getElementById('perm-finance-edit');
  const navItems = Array.from(document.querySelectorAll('.nav-item[data-section]'));
  const sections = Array.from(document.querySelectorAll('.settings-section[data-section]'));

  const rpModal = document.getElementById('reset-password-modal');
  const rpClose = document.getElementById('rp-close');
  const rpCancel = document.getElementById('rp-cancel');
  const rpForm = document.getElementById('rp-form');
  const rpNova = document.getElementById('rp-nova-senha');
  const rpConfirma = document.getElementById('rp-confirma');
  const rpError = document.getElementById('rp-error');
  let resetTargetId = null;
  let editingUserId = null;
  let rxAssinaturaData = '';
  let rxAssinaturaFile = '';
  let rxAssinaturaRemove = false;

  const ADMIN_ID = 'admin001';
  const CRO_PREFIX = 'CRO-';

  const renderClinicContext = ({ nome, clinicId }) => {
    if (clinicContextName) clinicContextName.textContent = String(nome || 'Clinica atual').trim() || 'Clinica atual';
    if (clinicContextId) clinicContextId.textContent = clinicId ? `ID ${clinicId}` : 'ID indisponivel';
  };

  const normalizeColor = (value) => {
    const raw = String(value || '').trim();
    const match = raw.match(/^#([0-9a-fA-F]{6})$/);
    return match ? `#${match[1].toUpperCase()}` : '';
  };

  const formatCroValue = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return CRO_PREFIX;
    if (raw.toUpperCase().startsWith(CRO_PREFIX)) return `${CRO_PREFIX}${raw.slice(CRO_PREFIX.length)}`;
    return `${CRO_PREFIX}${raw}`;
  };

  const cleanCroValue = (value) => {
    const raw = String(value || '').trim();
    if (!raw || raw.toUpperCase() === CRO_PREFIX) return '';
    return formatCroValue(raw);
  };

  const setDentistColorVisible = (isDentist) => {
    if (dentistColorGroup) dentistColorGroup.classList.toggle('hidden', !isDentist);
    if (dentistSignatureGroup) dentistSignatureGroup.classList.toggle('hidden', !isDentist);
  };

  const syncColorInputs = (value) => {
    const normalized = normalizeColor(value);
    if (colorInput && normalized) colorInput.value = normalized;
    if (colorTextInput) colorTextInput.value = normalized || value || '';
  };

  const showRxAssinatura = (src) => {
    if (!rxAssinaturaImage) return;
    rxAssinaturaImage.src = src || '';
    rxAssinaturaImage.style.display = src ? 'block' : 'none';
    if (rxAssinaturaPreview) rxAssinaturaPreview.classList.toggle('is-empty', !src);
  };

  const readRxAssinaturaFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      rxAssinaturaData = String(reader.result || '');
      rxAssinaturaRemove = false;
      showRxAssinatura(rxAssinaturaData);
    };
    reader.readAsDataURL(file);
  };

  const setSection = (section) => {
    sections.forEach((el) => el.classList.toggle('active', el.dataset.section === section));
    navItems.forEach((el) => el.classList.toggle('active', el.dataset.section === section));
  };

  const resetPermissions = () => {
    if (permAdmin) permAdmin.checked = false;
    if (permClinic) permClinic.checked = false;
    if (permProcedures) permProcedures.checked = false;
    if (permUsers) permUsers.checked = false;
    if (permImportData) permImportData.checked = false;
    if (permAgendaSettings) permAgendaSettings.checked = false;
    if (permAgendaAvailability) permAgendaAvailability.checked = false;
    if (permNotifications) permNotifications.checked = false;
    if (permAgendaView) permAgendaView.checked = false;
    if (permAgendaEdit) permAgendaEdit.checked = false;
    if (permFinanceView) permFinanceView.checked = false;
    if (permFinanceEdit) permFinanceEdit.checked = false;
  };

  const togglePermissionInputs = (disabled) => {
    [permClinic, permProcedures, permUsers, permImportData, permAgendaSettings, permAgendaAvailability, permNotifications, permAgendaView, permAgendaEdit, permFinanceView, permFinanceEdit]
      .filter(Boolean)
      .forEach((el) => {
        el.disabled = disabled;
      });
  };

  const applyAdminToggle = () => {
    const isAdmin = !!permAdmin?.checked;
    if (isAdmin) {
      if (permClinic) permClinic.checked = true;
      if (permProcedures) permProcedures.checked = true;
      if (permUsers) permUsers.checked = true;
      if (permImportData) permImportData.checked = true;
      if (permAgendaSettings) permAgendaSettings.checked = true;
      if (permAgendaAvailability) permAgendaAvailability.checked = true;
      if (permNotifications) permNotifications.checked = true;
      if (permAgendaView) permAgendaView.checked = true;
      if (permAgendaEdit) permAgendaEdit.checked = true;
      if (permFinanceView) permFinanceView.checked = true;
      if (permFinanceEdit) permFinanceEdit.checked = true;
    }
    setDentistColorVisible(tipoSelect?.value === 'dentista');
    togglePermissionInputs(isAdmin);
  };

  const setFormMode = (editing) => {
    if (createTitle) createTitle.textContent = editing ? 'Editar usuario' : 'Criar novo usuario';
    if (createCancel) createCancel.hidden = !editing;
    if (senhaInput) senhaInput.required = !editing;
  };

  const fillForm = (user) => {
    editingUserId = user?.id || null;
    if (nomeInput) nomeInput.value = user?.nome || '';
    if (telefoneInput) telefoneInput.value = user?.telefone || '';
    if (emailInput) emailInput.value = user?.email || user?.login || '';
    if (tipoSelect) tipoSelect.value = user?.tipo || '';
    setDentistColorVisible(user?.tipo === 'dentista');
    syncColorInputs(user?.corDentista || '#1FA87A');
    if (senhaInput) senhaInput.value = '';
    if (rxAssinaturaNomeInput) rxAssinaturaNomeInput.value = user?.receituario?.assinaturaNome || '';
    if (rxAssinaturaRegistroInput) rxAssinaturaRegistroInput.value = formatCroValue(user?.receituario?.assinaturaRegistro || user?.cro || '');
    if (croInput) croInput.value = formatCroValue(user?.cro || user?.receituario?.assinaturaRegistro || '');
    rxAssinaturaData = '';
    rxAssinaturaFile = user?.receituario?.assinaturaImagemFile || '';
    rxAssinaturaRemove = false;
    showRxAssinatura(user?.receituario?.assinaturaImagemData || '');

    resetPermissions();
    const perms = user?.permissions || {};
    const managed = user?.permissionsEnabled === true;
    if (managed) {
      if (permAdmin) permAdmin.checked = perms.admin === true;
      if (permClinic) permClinic.checked = perms['clinic.manage'] === true;
      if (permProcedures) permProcedures.checked = perms['procedures.manage'] === true;
      if (permUsers) permUsers.checked = perms['users.manage'] === true;
      if (permImportData) permImportData.checked = perms['data.import'] === true;
      if (permAgendaSettings) permAgendaSettings.checked = perms['agenda.settings'] === true;
      if (permAgendaAvailability) permAgendaAvailability.checked = perms['agenda.availability'] === true;
      if (permNotifications) permNotifications.checked = perms['notifications.manage'] === true;
      if (permAgendaView) permAgendaView.checked = perms['agenda.view'] === true;
      if (permAgendaEdit) permAgendaEdit.checked = perms['agenda.edit'] === true;
      if (permFinanceView) permFinanceView.checked = perms['finance.view'] === true;
      if (permFinanceEdit) permFinanceEdit.checked = perms['finance.edit'] === true;
    } else {
      const role = user?.tipo || '';
      const isAdministrativeRole = role === 'admin' || role === 'administrativo';
      if (permAdmin) permAdmin.checked = isAdministrativeRole;
      if (permClinic) permClinic.checked = isAdministrativeRole;
      if (permProcedures) permProcedures.checked = isAdministrativeRole;
      if (permUsers) permUsers.checked = isAdministrativeRole;
      if (permImportData) permImportData.checked = isAdministrativeRole;
      if (permAgendaSettings) permAgendaSettings.checked = isAdministrativeRole;
      if (permAgendaAvailability) permAgendaAvailability.checked = isAdministrativeRole;
      if (permNotifications) permNotifications.checked = isAdministrativeRole;
      if (permAgendaView) permAgendaView.checked = [ 'admin', 'administrativo', 'recepcionista', 'dentista' ].includes(role);
      if (permAgendaEdit) permAgendaEdit.checked = [ 'admin', 'administrativo', 'recepcionista', 'dentista' ].includes(role);
      if (permFinanceView) permFinanceView.checked = [ 'admin', 'administrativo', 'dentista' ].includes(role);
      if (permFinanceEdit) permFinanceEdit.checked = isAdministrativeRole;
    }
    applyAdminToggle();
    setFormMode(!!editingUserId);
  };

  const resetForm = () => {
    editingUserId = null;
    if (createForm) createForm.reset();
    if (telefoneInput) telefoneInput.value = '';
    if (emailInput) emailInput.value = '';
    setDentistColorVisible(false);
    syncColorInputs('#1FA87A');
    if (rxAssinaturaNomeInput) rxAssinaturaNomeInput.value = '';
    if (rxAssinaturaRegistroInput) rxAssinaturaRegistroInput.value = CRO_PREFIX;
    if (croInput) croInput.value = CRO_PREFIX;
    rxAssinaturaData = '';
    rxAssinaturaFile = '';
    rxAssinaturaRemove = false;
    showRxAssinatura('');
    resetPermissions();
    if (tipoSelect) tipoSelect.disabled = false;
    togglePermissionInputs(false);
    if (createError) createError.textContent = '';
    setFormMode(false);
  };

  const openResetModal = (id) => {
    resetTargetId = id;
    rpError.textContent = '';
    rpForm.reset();
    rpModal.classList.add('open');
    rpNova?.focus();
  };

  const closeResetModal = () => {
    resetTargetId = null;
    rpModal.classList.remove('open');
  };

  const renderUsers = (users = []) => {
    if (!tbody) return;
    if (!users.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty">Nenhum usuario encontrado.</td></tr>';
      return;
    }

    tbody.innerHTML = users.map((u) => {
      const badgeClass = u.tipo === 'admin'
        || u.tipo === 'administrativo'
        ? 'badge badge-admin'
        : (u.tipo === 'dentista' ? 'badge badge-dent' : 'badge badge-recep');
      const adminTag = (u.isClinicAdmin === true || u?.permissions?.admin === true)
        ? '<span class="badge badge-admin" style="margin-left:8px;">Admin</span>'
        : '';
      const canDelete = u.id !== ADMIN_ID;
      const colorDot = u.tipo === 'dentista'
        ? `<span class="user-color-dot" style="background:${u.corDentista || '#1FA87A'}"></span>`
        : '';
      return `
        <tr>
          <td>${colorDot}${u.nome || ''}</td>
          <td>${u.login || ''}</td>
          <td><span class="${badgeClass}">${u.tipo || ''}</span>${adminTag}</td>
          <td>
            <div class="row-actions">
              <button class="btn-row-actions" type="button" data-action="row-menu" data-id="${u.id}" aria-label="Acoes">&#8942;</button>
              <div class="row-actions-menu" data-menu-id="${u.id}">
                <button type="button" data-action="edit" data-id="${u.id}">Editar</button>
                <button type="button" data-action="reset" data-id="${u.id}">Redefinir senha</button>
                <button type="button" class="danger" data-action="delete" data-id="${u.id}" ${canDelete ? '' : 'disabled'}>Excluir</button>
              </div>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    const closeRowMenus = () => {
      tbody.querySelectorAll('.row-actions-menu.open').forEach((menu) => {
        menu.classList.remove('open');
      });
    };

    const toggleRowMenu = (id) => {
      if (!id) return;
      const menu = tbody.querySelector(`.row-actions-menu[data-menu-id="${id}"]`);
      if (!menu) return;
      const isOpen = menu.classList.contains('open');
      closeRowMenus();
      if (!isOpen) menu.classList.add('open');
    };

    tbody.querySelectorAll('[data-action="row-menu"]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const id = ev.currentTarget.getAttribute('data-id');
        toggleRowMenu(id);
      });
    });

    tbody.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', async (ev) => {
        const id = ev.currentTarget.getAttribute('data-id');
        if (!id) return;
        if (id === ADMIN_ID) {
          alert('Nao e permitido remover o admin padrao.');
          return;
        }
        const confirmDelete = confirm('Confirma excluir este usuario?');
        if (!confirmDelete) return;
        try {
          await usersApi.delete(id);
          await loadUsers();
        } catch (err) {
          console.error('Erro ao excluir usuario', err);
          alert(err.message || 'Erro ao excluir usuario.');
        }
      });
    });

    tbody.querySelectorAll('[data-action="reset"]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        const id = ev.currentTarget.getAttribute('data-id');
        if (!id) return;
        openResetModal(id);
      });
    });

    tbody.querySelectorAll('[data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        const id = ev.currentTarget.getAttribute('data-id');
        if (!id) return;
        const user = users.find((item) => item.id === id);
        if (!user) return;
        setSection('create');
        fillForm(user);
        if (nomeInput) nomeInput.focus();
      });
    });

    document.addEventListener('click', (event) => {
      if (!event.target.closest('.row-actions')) {
        closeRowMenus();
      }
    });
  };

  const loadUsers = async () => {
    if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="empty">Carregando...</td></tr>';
    try {
      const list = await usersApi.list();
      renderUsers(list || []);
    } catch (err) {
      console.error('Erro ao listar usuarios', err);
      if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="empty">Falha ao carregar usuarios.</td></tr>';
    }
  };

  const validateAdmin = async () => {
    try {
      const [user, context, clinicProfile] = await Promise.all([
        authApi.currentUser?.(),
        authApi.currentContext?.().catch(() => null),
        appApi.clinic?.get?.().catch(() => null),
      ]);
      renderClinicContext({
        nome: clinicProfile?.nomeClinica || clinicProfile?.clinicName || user?.clinicName || 'Clinica atual',
        clinicId: String(context?.clinicId || user?.clinicId || '').trim(),
      });
      const perms = user?.permissions || {};
      const canManage = user?.tipo === 'admin' || user?.tipo === 'administrativo' || perms.admin === true || perms['users.manage'] === true;
      if (!user || !canManage) {
        window.location.href = 'index.html';
        return false;
      }
      return true;
    } catch (err) {
      window.location.href = 'index.html';
      return false;
    }
  };

  if (btnNew) {
    btnNew.addEventListener('click', () => {
      resetForm();
      setSection('create');
    });
  }
  if (createCancel) {
    createCancel.addEventListener('click', () => {
      resetForm();
      setSection('manage');
    });
  }
  if (rpClose) rpClose.addEventListener('click', closeResetModal);
  if (rpCancel) rpCancel.addEventListener('click', closeResetModal);

  navItems.forEach((item) => {
    item.addEventListener('click', (ev) => {
      ev.preventDefault();
      const section = item.dataset.section;
      if (section) setSection(section);
      if (section === 'create' && !editingUserId) resetForm();
    });
  });

  if (createForm) {
    createForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (createError) createError.textContent = '';
      const croValue = cleanCroValue(croInput?.value || rxAssinaturaRegistroInput?.value || '');
      const payload = {
        nome: nomeInput.value.trim(),
        login: emailInput.value.trim(),
        email: emailInput.value.trim(),
        telefone: telefoneInput.value.trim(),
        senha: senhaInput.value,
        tipo: tipoSelect.value,
        role: tipoSelect.value === 'dentista'
          ? 'DENTISTA'
          : (tipoSelect.value === 'administrativo' ? 'ADMIN' : 'RECEPCAO'),
        isClinicAdmin: !!permAdmin?.checked,
        corDentista: normalizeColor(colorTextInput?.value || colorInput?.value || ''),
        permissionsEnabled: true,
        permissions: {
          admin: !!permAdmin?.checked,
          'clinic.manage': !!permClinic?.checked,
          'procedures.manage': !!permProcedures?.checked,
          'users.manage': !!permUsers?.checked,
          'data.import': !!permImportData?.checked,
          'agenda.settings': !!permAgendaSettings?.checked,
          'agenda.availability': !!permAgendaAvailability?.checked,
          'notifications.manage': !!permNotifications?.checked,
          'agenda.view': !!permAgendaView?.checked,
          'agenda.edit': !!permAgendaEdit?.checked,
          'finance.view': !!permFinanceView?.checked,
          'finance.edit': !!permFinanceEdit?.checked,
        },
        receituario: {
          assinaturaNome: rxAssinaturaNomeInput?.value?.trim() || '',
          assinaturaRegistro: croValue,
          assinaturaImagemData: rxAssinaturaData,
          assinaturaImagemFile: rxAssinaturaFile,
          assinaturaImagemRemove: rxAssinaturaRemove,
        },
        cro: croValue,
      };

      if (!payload.nome || !payload.login || !payload.tipo) {
        if (createError) createError.textContent = 'Preencha todos os campos obrigatorios.';
        return;
      }

      if (!['administrativo', 'recepcionista', 'dentista'].includes(payload.tipo)) {
        if (createError) createError.textContent = 'Tipo de usuario invalido.';
        return;
      }

      if (payload.tipo !== 'dentista') {
        payload.receituario = {
          assinaturaNome: '',
          assinaturaRegistro: '',
          assinaturaImagemData: '',
          assinaturaImagemFile: '',
          assinaturaImagemRemove: true,
        };
        payload.cro = '';
      }

      try {
        if (editingUserId) {
          const updatePayload = { id: editingUserId, ...payload };
          if (!updatePayload.senha) delete updatePayload.senha;
          await usersApi.update(updatePayload);
        } else {
          if (!payload.senha) {
            if (createError) createError.textContent = 'Informe a senha.';
            return;
          }
          await usersApi.create(payload);
        }
        resetForm();
        setSection('manage');
        await loadUsers();
      } catch (err) {
        console.error('Erro ao criar usuario', err);
        if (createError) createError.textContent = err.message || 'Erro ao criar usuario.';
      }
    });
  }

  if (rpForm) {
    rpForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      rpError.textContent = '';
      const novaSenha = rpNova?.value || '';
      const confirma = rpConfirma?.value || '';
      if (!novaSenha || !confirma) {
        rpError.textContent = 'Preencha todos os campos.';
        return;
      }
      if (novaSenha !== confirma) {
        rpError.textContent = 'Nova senha e confirmacao diferem.';
        return;
      }
      if (!resetTargetId) {
        rpError.textContent = 'Usuario invalido.';
        return;
      }
      try {
        await usersApi.resetPassword({ id: resetTargetId, novaSenha });
        alert('Senha redefinida.');
        closeResetModal();
      } catch (err) {
        console.error('Erro ao redefinir senha', err);
        rpError.textContent = err.message || 'Erro ao redefinir senha.';
      }
    });
  }

  if (tipoSelect) {
    tipoSelect.addEventListener('change', () => {
      setDentistColorVisible(tipoSelect.value === 'dentista');
    });
  }

  if (colorInput) {
    colorInput.addEventListener('input', (e) => {
      syncColorInputs(e.target.value);
    });
  }

  if (colorTextInput) {
    colorTextInput.addEventListener('input', (e) => {
      syncColorInputs(e.target.value);
    });
  }

  if (permAdmin) {
    permAdmin.addEventListener('change', applyAdminToggle);
  }

  if (rxAssinaturaFileInput) {
    rxAssinaturaFileInput.addEventListener('change', (event) => {
      const file = event.target.files && event.target.files[0];
      readRxAssinaturaFile(file);
    });
  }

  if (rxAssinaturaRemoveBtn) {
    rxAssinaturaRemoveBtn.addEventListener('click', () => {
      rxAssinaturaData = '';
      rxAssinaturaFile = '';
      rxAssinaturaRemove = true;
      showRxAssinatura('');
    });
  }

  const syncCroField = (source, target) => {
    if (!source || !target) return;
    source.addEventListener('focus', () => {
      source.value = formatCroValue(source.value);
    });
    source.addEventListener('blur', () => {
      source.value = formatCroValue(source.value);
      target.value = formatCroValue(source.value);
    });
  };
  syncCroField(rxAssinaturaRegistroInput, croInput);
  syncCroField(croInput, rxAssinaturaRegistroInput);
  if (rxAssinaturaRegistroInput) rxAssinaturaRegistroInput.value = formatCroValue(rxAssinaturaRegistroInput.value);
  if (croInput) croInput.value = formatCroValue(croInput.value);

  (async () => {
    const isAdmin = await validateAdmin();
    if (!isAdmin) return;
    setSection('manage');
    await loadUsers();
  })();
});

