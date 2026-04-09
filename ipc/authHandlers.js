const registerAuthHandlers = ({
  ipcMain,
  requireAccess,
  loginUser,
  sanitizeUser,
  changePassword,
  listUsersPublic,
  resetPassword,
  listUsers,
  createUser,
  deleteUser,
  updateUser,
  listClinics,
  superAdminImpersonateClinic,
  createClinicWithAdmin,
  buildAccessContext,
  createSession,
  clearSession,
  readSessionCache,
  restoreSession,
  currentUserRef,
  setCurrentUser,
  generateFinanceId,
  centralBackendAdapter,
}) => {
  const isCentralEnabled = () => centralBackendAdapter?.isEnabled?.() === true;
  const shouldFallbackToLocal = (error) => {
    const code = String(error?.code || '').trim().toUpperCase();
    const status = Number(error?.status || 0);
    return code === 'CENTRAL_BACKEND_UNAVAILABLE'
      || code === 'CENTRAL_BACKEND_TIMEOUT'
      || error?.name === 'AbortError'
      || status >= 500;
  };

  const mapCentralRoleToTipo = (role) => {
    const normalizedRole = String(role || '').trim().toUpperCase();
    if (normalizedRole === 'ADMIN') return 'administrativo';
    if (normalizedRole === 'DENTISTA') return 'dentista';
    if (normalizedRole === 'SUPER_ADMIN') return 'super_admin';
    return 'recepcionista';
  };

  const buildDesktopPermissions = (user = {}) => {
    const normalizedRole = String(user.role || '').trim().toUpperCase();
    const isAdmin = user.isClinicAdmin === true || normalizedRole === 'SUPER_ADMIN';
    if (isAdmin) {
      return {
        admin: true,
        'clinic.manage': true,
        'procedures.manage': true,
        'users.manage': true,
        'data.import': true,
        'agenda.settings': true,
        'agenda.availability': true,
        'notifications.manage': true,
        'agenda.view': true,
        'agenda.edit': true,
        'finance.view': true,
        'finance.edit': true,
      };
    }

    if (normalizedRole === 'DENTISTA') {
      return {
        admin: false,
        'agenda.view': true,
        'agenda.edit': true,
        'finance.view': true,
      };
    }

    return {
      admin: false,
      'agenda.view': true,
      'agenda.edit': true,
    };
  };

  const mapCentralUserToDesktop = (user = {}) => ({
    id: user.id,
    userId: user.id,
    clinicId: user.clinicId || '',
    nome: user.nome || '',
    login: user.email || '',
    email: user.email || '',
    tipo: mapCentralRoleToTipo(user.role),
    role: String(user.role || '').trim().toUpperCase(),
    isActive: user.ativo !== false,
    isClinicAdmin: user.isClinicAdmin === true || ['ADMIN', 'SUPER_ADMIN'].includes(String(user.role || '').trim().toUpperCase()),
    permissionsEnabled: true,
    permissions: buildDesktopPermissions(user),
    isImpersonatedSession: false,
  });

  const logCentralAuth = (event, extra = {}) => {
    console.info(`[AUTH] ${event}`, JSON.stringify(extra));
  };

  const logAuthFallback = (event, error, extra = {}) => {
    console.warn(`[AUTH] ${event}`, JSON.stringify({
      module: 'auth',
      operation: event,
      session_fallback_to_local: true,
      fallback_triggered: true,
      fallback_reason: error?.message || String(error || ''),
      reason: error?.message || String(error || ''),
      ...extra,
    }));
  };

  const getCurrentClinicContext = () => {
    const user = currentUserRef?.() || null;
    const context = typeof buildAccessContext === 'function' ? buildAccessContext(user) : null;
    if (!context || context.tenantScope !== 'clinic') return {};
    return { clinicId: context.clinicId || 'defaultClinic' };
  };

  const requireSuperAdmin = () => {
    const user = currentUserRef?.() || null;
    if (!user || user.tipo !== 'super_admin') {
      throw new Error('Acesso restrito ao Super Admin Voithos.');
    }
  };

  const restoreCentralSessionIfNeeded = async ({ allowFallbackSnapshot = true } = {}) => {
    const session = await readSessionCache();
    const source = String(session?.source || '').trim();
    const token = String(session?.remoteToken || session?.token || '').trim();
    if (!session || source !== 'central' || !token) return null;

    try {
      const centralUser = await centralBackendAdapter.authMe(token);
      const mappedUser = sanitizeUser(mapCentralUserToDesktop(centralUser));
      setCurrentUser(mappedUser);
      await createSession(mappedUser, undefined, {
        source: 'central',
        remoteToken: token,
        userSnapshot: mappedUser,
        isImpersonatedSession: false,
      });
      logCentralAuth('session_loaded_from=central', {
        userId: mappedUser?.id || '',
        clinicId: mappedUser?.clinicId || '',
      });
      return mappedUser;
    } catch (error) {
      if (error?.status === 401) {
        await clearSession();
        setCurrentUser(null);
        throw error;
      }

      if (allowFallbackSnapshot && session?.userSnapshot && shouldFallbackToLocal(error)) {
        const cachedUser = sanitizeUser(session.userSnapshot);
        setCurrentUser(cachedUser);
        logAuthFallback('session_restore_fallback', error, {
          userId: cachedUser?.id || '',
          clinicId: cachedUser?.clinicId || '',
        });
        return cachedUser;
      }

      throw error;
    }
  };

  ipcMain.handle('auth-login', async (_event, payload = {}) => {
    if (isCentralEnabled()) {
      try {
        const result = await centralBackendAdapter.authLogin(payload || {});
        const mappedUser = sanitizeUser(mapCentralUserToDesktop(result?.user || {}));
        setCurrentUser(mappedUser);
        await createSession(mappedUser, undefined, {
          source: 'central',
          remoteToken: result?.token || '',
          userSnapshot: mappedUser,
          isImpersonatedSession: false,
        });
        logCentralAuth('auth_loaded_from=central', {
          userId: mappedUser?.id || '',
          clinicId: mappedUser?.clinicId || '',
        });
        return { success: true, user: sanitizeUser(currentUserRef()) };
      } catch (error) {
        if (!shouldFallbackToLocal(error)) throw error;
        logAuthFallback('auth-login-fallback', error, {
          identifier: payload?.email || payload?.login || '',
        });
      }
    }

    const user = await loginUser({ email: payload.email, login: payload.login, senha: payload.senha });
    setCurrentUser(user);
    await createSession(user, undefined, { source: 'local', isImpersonatedSession: false });
    return { success: true, user: sanitizeUser(currentUserRef()) };
  });

  ipcMain.handle('auth-signup', async (_event, payload = {}) => {
    if (!isCentralEnabled()) {
      throw new Error('Cadastro publico indisponivel sem backend central.');
    }

    const result = await centralBackendAdapter.authSignup(payload || {});
    const mappedUser = sanitizeUser(mapCentralUserToDesktop(result?.user || {}));
    setCurrentUser(mappedUser);
    await createSession(mappedUser, undefined, {
      source: 'central',
      remoteToken: result?.token || '',
      userSnapshot: mappedUser,
      isImpersonatedSession: false,
    });
    logCentralAuth('auth_signup_from=central', {
      userId: mappedUser?.id || '',
      clinicId: mappedUser?.clinicId || '',
    });
    return {
      success: true,
      user: sanitizeUser(currentUserRef()),
      clinic: result?.clinic || null,
    };
  });

  ipcMain.handle('auth-logout', async () => {
    const session = await readSessionCache().catch(() => null);
    if (isCentralEnabled() && String(session?.source || '').trim() === 'central') {
      try {
        await centralBackendAdapter.authLogout(session?.remoteToken || session?.token || '');
      } catch (error) {
        logAuthFallback('auth-logout-fallback', error, {
          userId: currentUserRef?.()?.id || '',
          clinicId: currentUserRef?.()?.clinicId || '',
        });
      }
    }

    setCurrentUser(null);
    await clearSession();
    return { success: true };
  });

  ipcMain.handle('auth-current-user', async () => {
    let user = currentUserRef?.() || null;
    if (!user) {
      user = isCentralEnabled()
        ? await restoreCentralSessionIfNeeded().catch(async () => restoreSession())
        : await restoreSession();
      if (user) setCurrentUser(user);
    }
    return sanitizeUser(user);
  });

  ipcMain.handle('auth-current-context', async () => {
    let user = currentUserRef?.() || null;
    if (!user) {
      user = isCentralEnabled()
        ? await restoreCentralSessionIfNeeded().catch(async () => restoreSession())
        : await restoreSession();
      if (user) setCurrentUser(user);
    }

    const context = typeof buildAccessContext === 'function' ? buildAccessContext(user) : {
      accessProfile: user?.tipo === 'super_admin' ? 'SUPERADMIN' : 'ANONYMOUS',
      tenantScope: user?.tipo === 'super_admin' ? 'global' : 'clinic',
      clinicId: user?.clinicId || '',
    };

    if (isCentralEnabled() && user) {
      logCentralAuth('clinic_context_resolved_from=central', {
        userId: user?.id || '',
        clinicId: user?.clinicId || '',
      });
    }

    return {
      ...context,
      user: sanitizeUser(user),
    };
  });

  ipcMain.handle('auth-change-password', async (_event, { senhaAtual, novaSenha }) => {
    const session = await readSessionCache().catch(() => null);
    if (isCentralEnabled() && String(session?.source || '').trim() === 'central') {
      try {
        await centralBackendAdapter.authChangePassword(session?.remoteToken || session?.token || '', {
          senhaAtual,
          novaSenha,
        });
        logCentralAuth('auth_change_password_from=central', {
          userId: currentUserRef?.()?.id || '',
          clinicId: currentUserRef?.()?.clinicId || '',
        });
        return { success: true };
      } catch (error) {
        if (!shouldFallbackToLocal(error)) throw error;
        logAuthFallback('auth-change-password-fallback', error, getCurrentClinicContext());
      }
    }

    const updated = await changePassword({ currentUser: currentUserRef(), senhaAtual, novaSenha });
    setCurrentUser(updated);
    await createSession(updated, undefined, { source: 'local', isImpersonatedSession: false });
    return { success: true };
  });

  ipcMain.handle('auth-list-users-public', async () => {
    const session = await readSessionCache().catch(() => null);
    if (isCentralEnabled() && String(session?.source || '').trim() === 'central') {
      try {
        const users = await centralBackendAdapter.listUsersWithToken(session?.remoteToken || session?.token || '');
        return users.map((user) => sanitizeUser(mapCentralUserToDesktop(user)));
      } catch (error) {
        if (!shouldFallbackToLocal(error)) throw error;
        logAuthFallback('auth-list-users-public-fallback', error, getCurrentClinicContext());
      }
    }

    return listUsersPublic(getCurrentClinicContext());
  });

  ipcMain.handle('users-reset-password', async (_event, { id, novaSenha }) => {
    requireAccess({ roles: ['admin'], perms: ['users.manage'] });
    const session = await readSessionCache().catch(() => null);
    if (isCentralEnabled() && String(session?.source || '').trim() === 'central') {
      try {
        return await centralBackendAdapter.resetUserPasswordWithToken(session?.remoteToken || session?.token || '', { id, novaSenha });
      } catch (error) {
        if (!shouldFallbackToLocal(error)) throw error;
        logAuthFallback('users-reset-password-fallback', error, { id, ...getCurrentClinicContext() });
      }
    }

    return resetPassword({ id, novaSenha, ...getCurrentClinicContext() });
  });

  ipcMain.handle('users-list', async () => {
    requireAccess({ roles: ['admin'], perms: ['users.manage'] });
    const session = await readSessionCache().catch(() => null);
    if (isCentralEnabled() && String(session?.source || '').trim() === 'central') {
      try {
        const users = await centralBackendAdapter.listUsersWithToken(session?.remoteToken || session?.token || '');
        return users.map((user) => sanitizeUser(mapCentralUserToDesktop(user)));
      } catch (error) {
        if (!shouldFallbackToLocal(error)) throw error;
        logAuthFallback('users-list-fallback', error, getCurrentClinicContext());
      }
    }

    return listUsers(getCurrentClinicContext());
  });

  ipcMain.handle('users-create', async (_event, userData) => {
    requireAccess({ roles: ['admin'], perms: ['users.manage'] });
    const clinicContext = getCurrentClinicContext();
    const payload = {
      ...(userData || {}),
      clinicId: String(userData?.clinicId || clinicContext?.clinicId || '').trim(),
    };
    const session = await readSessionCache().catch(() => null);
    if (isCentralEnabled() && String(session?.source || '').trim() === 'central') {
      try {
        const created = await centralBackendAdapter.createUserWithToken(session?.remoteToken || session?.token || '', payload);
        return sanitizeUser(mapCentralUserToDesktop(created || {}));
      } catch (error) {
        if (!shouldFallbackToLocal(error)) throw error;
        logAuthFallback('users-create-fallback', error, clinicContext);
      }
    }

    return createUser(payload, generateFinanceId, clinicContext);
  });

  ipcMain.handle('users-delete', async (_event, id) => {
    requireAccess({ roles: ['admin'], perms: ['users.manage'] });
    const session = await readSessionCache().catch(() => null);
    if (isCentralEnabled() && String(session?.source || '').trim() === 'central') {
      try {
        return await centralBackendAdapter.deleteUserWithToken(session?.remoteToken || session?.token || '', id);
      } catch (error) {
        if (!shouldFallbackToLocal(error)) throw error;
        logAuthFallback('users-delete-fallback', error, { id, ...getCurrentClinicContext() });
      }
    }

    return deleteUser(id, getCurrentClinicContext());
  });

  ipcMain.handle('users-update', async (_event, payload) => {
    requireAccess({ roles: ['admin'], perms: ['users.manage'] });
    const clinicContext = getCurrentClinicContext();
    const normalizedPayload = {
      ...(payload || {}),
      clinicId: String(payload?.clinicId || clinicContext?.clinicId || '').trim(),
    };
    const session = await readSessionCache().catch(() => null);
    if (isCentralEnabled() && String(session?.source || '').trim() === 'central') {
      try {
        const updated = await centralBackendAdapter.updateUserWithToken(session?.remoteToken || session?.token || '', normalizedPayload);
        return sanitizeUser(mapCentralUserToDesktop(updated || {}));
      } catch (error) {
        if (!shouldFallbackToLocal(error)) throw error;
        logAuthFallback('users-update-fallback', error, clinicContext);
      }
    }

    return updateUser(normalizedPayload, clinicContext);
  });

  ipcMain.handle('super-admin-clinics-list', async () => {
    requireSuperAdmin();
    if (isCentralEnabled()) {
      try {
        return await centralBackendAdapter.listClinicsPublic();
      } catch (error) {
        if (!shouldFallbackToLocal(error)) throw error;
        logAuthFallback('super-admin-clinics-list-fallback', error);
      }
    }

    return listClinics();
  });

  ipcMain.handle('super-admin-clinics-create', async (_event, payload) => {
    requireSuperAdmin();
    if (isCentralEnabled()) {
      try {
        return await centralBackendAdapter.createClinicBootstrap(payload || {});
      } catch (error) {
        if (!shouldFallbackToLocal(error)) throw error;
        logAuthFallback('super-admin-clinics-create-fallback', error);
      }
    }

    return createClinicWithAdmin(payload || {}, generateFinanceId);
  });

  ipcMain.handle('super-admin-impersonate-clinic', async (_event, clinicId) => {
    requireSuperAdmin();
    if (isCentralEnabled()) {
      try {
        const result = await centralBackendAdapter.impersonateClinicAdmin(clinicId);
        const mappedUser = sanitizeUser({
          ...mapCentralUserToDesktop(result?.user || {}),
          isImpersonatedSession: true,
        });
        setCurrentUser(mappedUser);
        await createSession(mappedUser, undefined, {
          source: 'central',
          remoteToken: result?.token || '',
          userSnapshot: mappedUser,
          isImpersonatedSession: true,
        });
        logCentralAuth('super_admin_impersonation_from=central', {
          userId: mappedUser?.id || '',
          clinicId: mappedUser?.clinicId || '',
        });
        return { success: true, user: sanitizeUser(mappedUser) };
      } catch (error) {
        if (!shouldFallbackToLocal(error)) throw error;
        logAuthFallback('super-admin-impersonate-fallback', error, { clinicId: String(clinicId || '').trim() });
      }
    }

    const admin = await superAdminImpersonateClinic(clinicId);
    setCurrentUser(admin);
    await createSession(admin, undefined, { source: 'local', isImpersonatedSession: true });
    return { success: true, user: sanitizeUser(admin) };
  });
};

module.exports = { registerAuthHandlers };
