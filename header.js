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
  const MOBILE_NAV_STYLE_ID = 'voithos-mobile-bottom-nav-styles';
  const MOBILE_NAV_ID = 'voithos-mobile-bottom-nav';

  const ensureMobileBottomNavStyles = () => {
    if (document.getElementById(MOBILE_NAV_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = MOBILE_NAV_STYLE_ID;
    style.textContent = `
      .mobile-bottom-nav {
        display: none;
      }

      @media (max-width: 768px) {
        body.has-mobile-bottom-nav {
          padding-bottom: calc(92px + env(safe-area-inset-bottom, 0px));
        }

        .mobile-bottom-nav {
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 1400;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 0;
          padding: 10px 10px calc(10px + env(safe-area-inset-bottom, 0px));
          background: rgba(247, 255, 252, 0.92);
          backdrop-filter: blur(14px);
          border-top: 1px solid rgba(15, 118, 110, 0.14);
          box-shadow: 0 -10px 24px rgba(15, 23, 42, 0.08);
        }

        .mobile-bottom-nav__link {
          display: grid;
          justify-items: center;
          gap: 4px;
          min-width: 0;
          padding: 8px 4px 6px;
          border-radius: 16px;
          color: #475569;
          text-decoration: none;
          font: inherit;
          font-size: 0.72rem;
          font-weight: 700;
          line-height: 1;
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          transition: transform 0.16s ease, background 0.16s ease, color 0.16s ease, box-shadow 0.16s ease;
        }

        .mobile-bottom-nav__link:active,
        .mobile-bottom-nav__link.is-pressed {
          transform: translateY(1px);
          background: rgba(255, 255, 255, 0.96);
          box-shadow: inset 0 0 0 1px rgba(15, 118, 110, 0.12);
        }

        .mobile-bottom-nav__link.is-active {
          color: #0f766e;
        }

        .mobile-bottom-nav__icon {
          width: 22px;
          height: 22px;
          display: inline-grid;
          place-items: center;
          color: currentColor;
        }

        .mobile-bottom-nav__icon svg {
          width: 22px;
          height: 22px;
          display: block;
        }

        .mobile-bottom-nav__label {
          display: block;
          max-width: 100%;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      }

      @media (min-width: 769px) {
        .mobile-bottom-nav {
          display: none !important;
        }
      }
    `;
    document.head.appendChild(style);
  };

  const ensureMobileBottomNav = () => {
    if (document.getElementById(MOBILE_NAV_ID)) return;
    const page = String(window.location.pathname || '').split('/').pop().toLowerCase();
    const nav = document.createElement('nav');
    nav.id = MOBILE_NAV_ID;
    nav.className = 'mobile-bottom-nav';
    nav.setAttribute('aria-label', 'Navegação principal');
    nav.innerHTML = `
      <a class="mobile-bottom-nav__link" data-mobile-nav="agenda" href="agendamentos.html">
        <span class="mobile-bottom-nav__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M7 3v3M17 3v3M4 8h16"/>
            <rect x="4" y="6" width="16" height="14" rx="3"/>
            <path d="M7 12h4M7 16h4"/>
          </svg>
        </span>
        <span class="mobile-bottom-nav__label">Agenda</span>
      </a>
      <a class="mobile-bottom-nav__link" data-mobile-nav="pacientes" href="prontuario.html">
        <span class="mobile-bottom-nav__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 19a4 4 0 0 0-8 0"/>
            <circle cx="12" cy="9" r="3.2"/>
            <path d="M4 19.5c1.4-3.2 4.2-5 8-5s6.6 1.8 8 5"/>
          </svg>
        </span>
        <span class="mobile-bottom-nav__label">Pacientes</span>
      </a>
      <a class="mobile-bottom-nav__link" data-mobile-nav="oportunidades" href="campanhas.html">
        <span class="mobile-bottom-nav__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 11.5 19 5v14L3 12.5z"/>
            <path d="M19 9.5 22 8.5v7l-3-1"/>
            <path d="M8 13l1.2 5.2a1.2 1.2 0 0 0 2.3-.1L13 13"/>
          </svg>
        </span>
        <span class="mobile-bottom-nav__label">Oportunidades</span>
      </a>
      <a class="mobile-bottom-nav__link" data-mobile-nav="gestao" href="gestao.html">
        <span class="mobile-bottom-nav__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 19h16"/>
            <path d="M6 16V9"/>
            <path d="M12 16V6"/>
            <path d="M18 16v-4"/>
          </svg>
        </span>
        <span class="mobile-bottom-nav__label">Gestão</span>
      </a>
    `;

    const activeMap = [
      { key: 'agenda', match: ['agendamentos.html', 'agenda-dia.html', 'agenda-mes.html', 'agenda-config.html'] },
      { key: 'pacientes', match: ['prontuario.html', 'arquivos.html', 'lista-pacientes.html', 'cadastro-paciente.html', 'editar-paciente.html', 'odontograma.html', 'odontograma-fdi.html'] },
      { key: 'oportunidades', match: ['campanhas.html', 'relacionamento.html', 'comunicacao.html'] },
      { key: 'gestao', match: ['gestao.html'] },
    ];

    const activeItem = activeMap.find((item) => item.match.some((part) => page.endsWith(part)));
    if (activeItem) {
      const link = nav.querySelector(`[data-mobile-nav="${activeItem.key}"]`);
      if (link) link.classList.add('is-active');
    }

    nav.addEventListener('pointerdown', (event) => {
      const link = event.target.closest('.mobile-bottom-nav__link');
      if (link) link.classList.add('is-pressed');
    });
    nav.addEventListener('pointerup', () => {
      nav.querySelectorAll('.mobile-bottom-nav__link.is-pressed').forEach((link) => link.classList.remove('is-pressed'));
    });
    nav.addEventListener('pointercancel', () => {
      nav.querySelectorAll('.mobile-bottom-nav__link.is-pressed').forEach((link) => link.classList.remove('is-pressed'));
    });
    nav.addEventListener('mouseleave', () => {
      nav.querySelectorAll('.mobile-bottom-nav__link.is-pressed').forEach((link) => link.classList.remove('is-pressed'));
    });

    document.body.appendChild(nav);
    document.body.classList.add('has-mobile-bottom-nav');
  };
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
  ensureMobileBottomNavStyles();
  ensureMobileBottomNav();

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

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const resolveCurrentUserSafely = async ({ attempts = 3, delayMs = 180 } = {}) => {
    let lastError = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const user = await authApi.currentUser();
        return { user, error: null };
      } catch (error) {
        lastError = error;
        if (attempt < attempts - 1) {
          await sleep(delayMs * (attempt + 1));
        }
      }
    }
    return { user: null, error: lastError };
  };

  const setupUser = async () => {
    if (!authApi.currentUser) return;
    try {
      const { user, error } = await resolveCurrentUserSafely();
      if (error) {
        console.warn('[HEADER] falha ao resolver sessao do usuario', error);
        return;
      }
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
    } catch (err) {
      console.warn('[HEADER] setupUser falhou', err);
    }
  };

  setupUser();
});
