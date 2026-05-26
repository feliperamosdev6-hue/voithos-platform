document.addEventListener('DOMContentLoaded', () => {
  const authApi = window.appApi?.auth || window.auth || {};
  const subscriptionApi = window.appApi?.subscription || window.subscription || {};
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
  const HEADER_CACHE_PREFIX = 'voithos.header.context.v1';
  const HEADER_CACHE_LAST_KEY = `${HEADER_CACHE_PREFIX}:last`;
  const HEADER_CACHE_TTL_MS = 10 * 60 * 1000;
  let headerContextPromise = null;
  const MOBILE_NAV_STYLE_ID = 'voithos-mobile-bottom-nav-styles';
  const MOBILE_NAV_ID = 'voithos-mobile-bottom-nav';
  const SUBSCRIPTION_BANNER_STYLE_ID = 'voithos-subscription-access-styles';
  const SUBSCRIPTION_BANNER_ID = 'voithos-subscription-access-banner';
  const READ_ONLY_WRITE_SELECTOR = [
    '[data-subscription-write]',
    '[data-requires-write]',
    'button[id*="save" i]',
    'button[id*="salvar" i]',
    'button[id*="delete" i]',
    'button[id*="excluir" i]',
    'button[id*="add" i]',
    'button[id*="novo" i]',
    'button[id*="create" i]',
    'button[id*="criar" i]',
    'button[id*="send" i]',
    'button[id*="enviar" i]',
    'button[id*="upload" i]',
    'input[type="file"]',
  ].join(',');
  let subscriptionReadOnlyActive = false;
  let writeControlObserver = null;

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

  const ensureSubscriptionBannerStyles = () => {
    if (document.getElementById(SUBSCRIPTION_BANNER_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = SUBSCRIPTION_BANNER_STYLE_ID;
    style.textContent = `
      .subscription-access-banner {
        position: sticky;
        top: 0;
        z-index: 1390;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        padding: 10px 16px;
        background: #fff7ed;
        border-bottom: 1px solid rgba(194, 65, 12, 0.18);
        color: #7c2d12;
        font-size: 0.9rem;
        font-weight: 700;
        line-height: 1.35;
      }

      .subscription-access-banner__text {
        min-width: 0;
      }

      .subscription-access-banner__cta {
        flex: 0 0 auto;
        border: 0;
        border-radius: 8px;
        padding: 8px 12px;
        background: #0f766e;
        color: #ffffff;
        font: inherit;
        font-size: 0.84rem;
        font-weight: 800;
        text-decoration: none;
        white-space: nowrap;
      }

      .subscription-read-only-control-disabled {
        opacity: 0.56 !important;
        cursor: not-allowed !important;
      }

      @media (max-width: 640px) {
        .subscription-access-banner {
          align-items: stretch;
          flex-direction: column;
          gap: 8px;
          padding: 10px 12px;
        }

        .subscription-access-banner__cta {
          text-align: center;
        }
      }
    `;
    document.head.appendChild(style);
  };

  const isSuperAdminContext = (user = currentUser) => {
    const role = String(user?.role || user?.tipo || user?.perfil || '').trim().toLowerCase();
    return role === 'super_admin' || role === 'super-admin' || role === 'superadmin';
  };

  const renderSubscriptionBanner = (message) => {
    ensureSubscriptionBannerStyles();
    let banner = document.getElementById(SUBSCRIPTION_BANNER_ID);
    if (!banner) {
      banner = document.createElement('div');
      banner.id = SUBSCRIPTION_BANNER_ID;
      banner.className = 'subscription-access-banner';
      banner.setAttribute('role', 'status');
      banner.innerHTML = `
        <span class="subscription-access-banner__text"></span>
        <a class="subscription-access-banner__cta" href="login.html?resume=1" data-subscription-payment-cta="true">Ativar assinatura</a>
      `;
      document.body.prepend(banner);
    }
    const text = banner.querySelector('.subscription-access-banner__text');
    if (text) text.textContent = message || 'Seu período de teste expirou. Ative sua assinatura para continuar editando dados.';
  };

  const clearSubscriptionBanner = () => {
    const banner = document.getElementById(SUBSCRIPTION_BANNER_ID);
    if (banner) banner.remove();
  };

  const applyWriteControlsReadOnly = () => {
    document.body.classList.toggle('subscription-read-only', subscriptionReadOnlyActive);
    document.body.dataset.subscriptionAccessMode = subscriptionReadOnlyActive ? 'READ_ONLY' : 'FULL';
    document.querySelectorAll(READ_ONLY_WRITE_SELECTOR).forEach((control) => {
      if (control?.matches?.('[data-subscription-payment-cta="true"]')) return;
      control.classList.toggle('subscription-read-only-control-disabled', subscriptionReadOnlyActive);
      control.setAttribute('aria-disabled', subscriptionReadOnlyActive ? 'true' : 'false');
      if ('disabled' in control) {
        if (subscriptionReadOnlyActive) {
          if (control.disabled !== true) control.dataset.subscriptionDisabledByReadOnly = 'true';
          control.disabled = true;
        } else if (control.dataset.subscriptionDisabledByReadOnly === 'true') {
          control.disabled = false;
          delete control.dataset.subscriptionDisabledByReadOnly;
        }
      }
    });
  };

  const ensureWriteControlObserver = () => {
    if (writeControlObserver || typeof MutationObserver === 'undefined') return;
    writeControlObserver = new MutationObserver(() => {
      if (subscriptionReadOnlyActive) applyWriteControlsReadOnly();
    });
    writeControlObserver.observe(document.body, { childList: true, subtree: true });
  };

  const applySubscriptionAccessOverview = (overview = {}) => {
    if (isSuperAdminContext()) return;
    const accessMode = String(overview?.accessMode || '').trim().toUpperCase();
    const effectiveStatus = String(overview?.effectiveStatus || '').trim().toUpperCase();
    const readOnly = overview?.readOnly === true || accessMode === 'READ_ONLY' || effectiveStatus === 'TRIAL_EXPIRED';
    subscriptionReadOnlyActive = readOnly;
    ensureWriteControlObserver();
    applyWriteControlsReadOnly();
    if (readOnly) {
      renderSubscriptionBanner(overview?.warning || 'Seu período de teste expirou. Ative sua assinatura para continuar editando dados.');
    } else {
      clearSubscriptionBanner();
    }
  };

  const loadSubscriptionAccess = async () => {
    if (isSuperAdminContext()) return;
    if (typeof subscriptionApi.getMySubscription !== 'function') return;
    const overview = await subscriptionApi.getMySubscription();
    if (overview && typeof overview === 'object') {
      applySubscriptionAccessOverview(overview);
    }
  };

  window.addEventListener('voithos:subscription-read-only', (event) => {
    subscriptionReadOnlyActive = true;
    renderSubscriptionBanner(event?.detail?.message || 'Seu período de teste expirou. Ative sua assinatura para continuar editando dados.');
    ensureWriteControlObserver();
    applyWriteControlsReadOnly();
  });

  document.addEventListener('click', (event) => {
    if (!subscriptionReadOnlyActive) return;
    const blockedTarget = event.target?.closest?.('[data-subscription-write], [data-requires-write], .subscription-read-only-control-disabled');
    if (!blockedTarget) return;
    event.preventDefault();
    event.stopPropagation();
    renderSubscriptionBanner('Seu período de teste expirou. Ative sua assinatura para continuar editando dados.');
  }, true);
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

  const nowMs = () => (window.performance?.now ? window.performance.now() : Date.now());

  const perfLog = (stage, details = {}) => {
    console.info('[perf][header-context]', {
      stage,
      durationMs: Number.isFinite(details.durationMs) ? Math.round(details.durationMs) : 0,
      source: String(details.source || '').trim(),
      cacheKey: details.cacheKey ? String(details.cacheKey) : '',
    });
  };

  const safeParseJson = (value) => {
    try {
      return value ? JSON.parse(value) : null;
    } catch (_error) {
      return null;
    }
  };

  const getHeaderCacheKeys = () => {
    const keys = [];
    let hasScopedIdentity = false;
    try {
      const rawUser = safeParseJson(localStorage.getItem('voithos.web.session.user'));
      const rawClinic = safeParseJson(localStorage.getItem('voithos.web.session.clinic'));
      const userId = String(rawUser?.id || rawUser?.userId || '').trim();
      const clinicId = String(rawClinic?.clinicId || rawClinic?.id || rawUser?.clinicId || '').trim();
      if (userId || clinicId) {
        hasScopedIdentity = true;
        keys.push({ storage: localStorage, key: `${HEADER_CACHE_PREFIX}:${userId || 'anon'}:${clinicId || 'global'}`, label: 'scoped' });
      }
    } catch (_error) {
      // Storage indisponivel nao deve bloquear o header.
    }
    if (!hasScopedIdentity) {
      try {
        keys.push({ storage: sessionStorage, key: HEADER_CACHE_LAST_KEY, label: 'session_last' });
      } catch (_error) {
        // sessionStorage indisponivel nao deve bloquear o header.
      }
    }
    return keys;
  };

  const readHeaderCache = () => {
    const started = nowMs();
    try {
      for (const entry of getHeaderCacheKeys()) {
        const record = safeParseJson(entry.storage.getItem(entry.key));
        if (!record || !record.userName || !record.savedAt) continue;
        if (Date.now() - Number(record.savedAt || 0) > HEADER_CACHE_TTL_MS) continue;
        perfLog('cache_hit', { durationMs: nowMs() - started, source: entry.storage === sessionStorage ? 'sessionStorage' : 'localStorage', cacheKey: entry.label });
        return record;
      }
    } catch (_error) {
      // Ignora falha de storage.
    }
    perfLog('cache_miss', { durationMs: nowMs() - started, source: 'localStorage' });
    return null;
  };

  const writeHeaderCache = (context) => {
    if (!context?.userName) return;
    try {
      const payload = JSON.stringify({ ...context, savedAt: Date.now() });
      if (context.userId || context.clinicId) {
        localStorage.setItem(`${HEADER_CACHE_PREFIX}:${context.userId || 'anon'}:${context.clinicId || 'global'}`, payload);
      }
      sessionStorage.setItem(HEADER_CACHE_LAST_KEY, payload);
    } catch (_error) {
      // Cache indisponivel nao deve bloquear revalidacao.
    }
  };

  const clearHeaderCache = () => {
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key && key.startsWith(HEADER_CACHE_PREFIX)) keys.push(key);
      }
      keys.forEach((key) => localStorage.removeItem(key));
      sessionStorage.removeItem(HEADER_CACHE_LAST_KEY);
    } catch (_error) {
      // Ignora storage indisponivel.
    }
  };

  const normalizeHeaderContext = ({ user = null, authContext = null } = {}) => {
    if (!user || typeof user !== 'object') return null;
    const clinic = authContext?.clinic || user?.clinic || {};
    return {
      userId: String(user?.id || user?.userId || '').trim(),
      clinicId: String(authContext?.clinicId || user?.clinicId || clinic?.clinicId || clinic?.id || '').trim(),
      userName: getDisplayName(user),
      role: String(user?.tipo || user?.perfil || user?.role || '').trim(),
      clinicName: String(clinic?.nomeFantasia || clinic?.nomeClinica || clinic?.razaoSocial || user?.clinicName || user?.nomeClinica || '').trim(),
      isClinicAdmin: user?.isClinicAdmin === true,
      permissions: user?.permissions && typeof user.permissions === 'object' ? { ...user.permissions } : {},
      mustChangePassword: user?.mustChangePassword === true,
      isImpersonatedSession: user?.isImpersonatedSession === true || authContext?.isImpersonatedSession === true,
      savedAt: Date.now(),
    };
  };

  const userFromHeaderContext = (context = {}) => ({
    id: context.userId || '',
    userId: context.userId || '',
    clinicId: context.clinicId || '',
    nome: context.userName || '',
    tipo: context.role || '',
    perfil: context.role || '',
    role: context.role || '',
    isClinicAdmin: context.isClinicAdmin === true,
    permissions: context.permissions || {},
    mustChangePassword: context.mustChangePassword === true,
    isImpersonatedSession: context.isImpersonatedSession === true,
  });

  const renderHeaderContext = (context, { source = '' } = {}) => {
    const started = nowMs();
    if (!context?.userName) return;
    currentUser = userFromHeaderContext(context);
    if (userNameEl) userNameEl.textContent = context.userName;
    if (userRoleEl) {
      const roleLabel = formatRole(context.role || '');
      const clinicSuffix = context.clinicName ? ` · ${context.clinicName}` : '';
      const supportSuffix = context.isImpersonatedSession ? ' • suporte' : '';
      userRoleEl.textContent = `${roleLabel}${clinicSuffix}${supportSuffix}`;
    }
    perfLog('render_done', { durationMs: nowMs() - started, source });
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

  const resolveHeaderContextSafely = async () => {
    if (headerContextPromise) return headerContextPromise;
    const started = nowMs();
    const source = authApi.currentContext ? 'context' : 'currentUser';
    perfLog('fetch_start', { source });
    headerContextPromise = (async () => {
      if (authApi.currentContext) {
        const authContext = await authApi.currentContext();
        return { user: authContext?.user || null, authContext, error: null };
      }
      const result = await resolveCurrentUserSafely();
      return { user: result.user, authContext: null, error: result.error };
    })()
      .then((result) => {
        perfLog('fetch_done', { durationMs: nowMs() - started, source });
        return result;
      })
      .catch((error) => {
        perfLog('fetch_done', { durationMs: nowMs() - started, source: 'error' });
        return { user: null, authContext: null, error };
      })
      .finally(() => {
        headerContextPromise = null;
      });
    return headerContextPromise;
  };

  const setupUser = async () => {
    if (!authApi.currentUser) return;
    try {
      const cachedHeader = readHeaderCache();
      if (cachedHeader) renderHeaderContext(cachedHeader, { source: 'cache' });

      const { user, authContext, error } = await resolveHeaderContextSafely();
      if (error) {
        console.warn('[HEADER] falha ao resolver sessao do usuario', error);
        return;
      }
      currentUser = user;
      if (!user) {
        clearHeaderCache();
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

      const freshHeader = normalizeHeaderContext({ user, authContext });
      if (freshHeader) {
        writeHeaderCache(freshHeader);
        renderHeaderContext(freshHeader, { source: 'backend' });
      }
      loadSubscriptionAccess().catch((error) => {
        console.warn('[HEADER] falha ao resolver acesso da assinatura', error);
      });

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
            clearHeaderCache();
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
