document.addEventListener('DOMContentLoaded', () => {
  const authApi = window.appApi?.auth || window.auth || {};
  const userMenuToggle = document.getElementById('user-menu-toggle');
  const userMenuDropdown = document.getElementById('user-menu-dropdown');
  const userNameEl = document.getElementById('user-name');
  const userRoleEl = document.getElementById('user-role');
  const manageItem = userMenuDropdown ? userMenuDropdown.querySelector('[data-action="manage"]') : null;
  let clinicItem = userMenuDropdown ? userMenuDropdown.querySelector('[data-action="clinic"]') : null;
  const changePassItem = userMenuDropdown ? userMenuDropdown.querySelector('[data-action="change-password"]') : null;
  const logoutItem = userMenuDropdown ? userMenuDropdown.querySelector('[data-action="logout"]') : null;
  const attnToggle = document.getElementById('attn-toggle');
  const attnDropdown = document.getElementById('attn-dropdown');
  const gestaoToggle = document.getElementById('gestao-toggle');
  const gestaoDropdown = document.getElementById('gestao-dropdown');
  let currentUser = null;
  const ensureAttnPaymentsItem = () => {
    if (!attnDropdown) return;
    const existing = attnDropdown.querySelector('a.attn-item[href="pagamentos.html"]');
    if (existing) {
      attnDropdown.appendChild(existing);
      return;
    }

    const paymentsItem = document.createElement('a');
    paymentsItem.className = 'attn-item';
    paymentsItem.href = 'pagamentos.html';
    paymentsItem.setAttribute('role', 'menuitem');
    paymentsItem.innerHTML = '<span class="attn-icon" aria-hidden="true"></span> Pagamentos';
    attnDropdown.appendChild(paymentsItem);
  };

  const ensurePageBackButton = () => {
    const pageHeader = document.querySelector('.page-header');
    if (!pageHeader) return;
    if (pageHeader.querySelector('.page-back-btn')) return;

    const backTarget = String(pageHeader.getAttribute('data-back-target') || '').trim() || 'index.html';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'page-back-btn';
    btn.setAttribute('aria-label', 'Voltar');
    btn.innerHTML = '<span class="page-back-arrow" aria-hidden="true">&larr;</span>';
    btn.addEventListener('click', () => {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.href = backTarget;
      }
    });
    pageHeader.appendChild(btn);
  };
  ensurePageBackButton();
  ensureAttnPaymentsItem();

  const setDropdownState = (dropdown, toggle, isOpen) => {
    if (!dropdown) return;
    dropdown.classList.toggle('open', isOpen);
    if (toggle) toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  };

  const closeDropdowns = () => {
    setDropdownState(userMenuDropdown, userMenuToggle, false);
    setDropdownState(attnDropdown, attnToggle, false);
    setDropdownState(gestaoDropdown, gestaoToggle, false);
  };

  const toggleExclusive = (dropdown, toggle) => {
    if (!dropdown) return;
    const isOpen = dropdown.classList.contains('open');
    closeDropdowns();
    if (!isOpen) setDropdownState(dropdown, toggle, true);
  };
  document.addEventListener('click', (ev) => {
    const target = ev.target;
    if (userMenuDropdown && userMenuToggle) {
      if (userMenuDropdown.contains(target) || userMenuToggle.contains(target)) return;
    }
    if (attnDropdown && attnToggle) {
      if (attnDropdown.contains(target) || attnToggle.contains(target)) return;
    }
    if (gestaoDropdown && gestaoToggle) {
      if (gestaoDropdown.contains(target) || gestaoToggle.contains(target)) return;
    }
    closeDropdowns();
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') closeDropdowns();
  });

  if (userMenuToggle) {
    userMenuToggle.addEventListener('click', (ev) => {
      ev.stopPropagation();
      toggleExclusive(userMenuDropdown, userMenuToggle);
    });
  }

  if (attnToggle) {
    attnToggle.addEventListener('click', (ev) => {
      ev.stopPropagation();
      toggleExclusive(attnDropdown, attnToggle);
    });
  }

  if (gestaoToggle) {
    gestaoToggle.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (!canManageClinic(currentUser)) return;
      toggleExclusive(gestaoDropdown, gestaoToggle);
    });
  }
  const formatRole = (role) => {
    if (!role) return '';
    return role.charAt(0).toUpperCase() + role.slice(1);
  };

  const canManageClinic = (user) => {
    const perfil = String(user?.tipo || user?.perfil || user?.role || '').toLowerCase().trim();
    return (
      user?.isClinicAdmin === true
      || user?.permissions?.admin === true
      || perfil === 'admin'
      || perfil === 'administrativo'
      || perfil === 'super_admin'
      || perfil === 'super-admin'
    );
  };

  const getDisplayName = (user = {}) => {
    const rawName = String(user?.nome || '').trim();
    if (rawName) {
      const normalizedName = rawName
        .replace(/\s[-–—]\s[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, '')
        .replace(/([._-])[a-z0-9]{8,}$/i, '')
        .trim();
      return normalizedName || rawName;
    }

    const rawLogin = String(user?.email || user?.login || '').trim();
    if (!rawLogin) return 'Usuario';
    const localPart = rawLogin.split('@')[0] || '';
    return localPart.replace(/[._-]+/g, ' ').trim() || 'Usuario';
  };

  const handleChangePassword = async () => {
    const senhaAtual = window.prompt('Senha atual:');
    if (!senhaAtual) return;
    const novaSenha = window.prompt('Nova senha:');
    if (!novaSenha) return;
    const confirma = window.prompt('Confirmar nova senha:');
    if (!confirma) return;
    if (novaSenha !== confirma) {
      window.alert('Nova senha e confirmacao diferem.');
      return;
    }
    try {
      if (!authApi.changePassword) throw new Error('Alteracao de senha indisponivel neste ambiente.');
      await authApi.changePassword({ senhaAtual, novaSenha });
      window.alert('Senha alterada com sucesso.');
    } catch (err) {
      window.alert(err?.message || 'Erro ao alterar senha.');
    }
  };

  const setupUser = async () => {
    if (!authApi.currentUser) return;
    try {
      const user = await authApi.currentUser();
      currentUser = user;
      const authContext = authApi.currentContext ? await authApi.currentContext().catch(() => null) : null;
      if (!user) {
        window.location.href = 'login.html';
        return;
      }
      if (user.tipo === 'super_admin') {
        const currentPage = String(window.location.pathname || '').toLowerCase();
        const allowedPages = ['super-admin.html', 'zapi-config.html'];
        const isAllowedPage = allowedPages.some((page) => currentPage.endsWith(`/${page}`) || currentPage.endsWith(page));
        if (!isAllowedPage) {
          window.location.href = 'super-admin.html';
          return;
        }
      }
      if (user.mustChangePassword && !user.isImpersonatedSession) {
        window.location.href = 'change-password.html';
        return;
      }

      if (userNameEl) userNameEl.textContent = getDisplayName(user);
      if (userRoleEl) {
        const roleLabel = formatRole(user.tipo || '');
        const supportSuffix = authContext?.isImpersonatedSession ? ' • suporte' : '';
        userRoleEl.textContent = `${roleLabel}${supportSuffix}`;
      }

      if (userMenuDropdown && !clinicItem) {
        clinicItem = document.createElement('button');
        clinicItem.className = 'user-menu-item';
        clinicItem.type = 'button';
        clinicItem.dataset.action = 'clinic';
        clinicItem.textContent = 'Minha clinica';
        if (manageItem) {
          userMenuDropdown.insertBefore(clinicItem, manageItem);
        } else {
          userMenuDropdown.prepend(clinicItem);
        }
      }

      if (manageItem) {
        manageItem.remove();
      }

      if (clinicItem) {
        clinicItem.style.display = canManageClinic(user) ? 'block' : 'none';
        clinicItem.addEventListener('click', () => {
          closeDropdowns();
          window.location.href = 'clinica.html';
        });
      }

      if (gestaoToggle) {
        const allowed = canManageClinic(user);
        gestaoToggle.disabled = !allowed;
        gestaoToggle.setAttribute('aria-disabled', allowed ? 'false' : 'true');
        gestaoToggle.title = allowed ? '' : 'Acesso restrito';
      }

      if (changePassItem) {
        changePassItem.remove();
      }

      if (logoutItem) {
        logoutItem.addEventListener('click', async () => {
          closeDropdowns();
            try {
            await authApi.logout?.();
          } finally {
            window.location.href = 'login.html';
          }
        });
      }
    } catch (_err) {
      window.location.href = 'login.html';
    }
  };

  setupUser();
});
