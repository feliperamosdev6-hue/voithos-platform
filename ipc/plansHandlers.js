const registerPlansHandlers = ({
  ipcMain,
  requireRole,
  listPlans,
  createPlan,
  updatePlan,
  deletePlan,
  getPlanById,
  getPlansDashboard,
  currentUserRef,
  centralBackendAdapter,
}) => {
  const DEFAULT_CLINIC_ID = 'defaultClinic';
  const getCurrentUser = () => currentUserRef?.() || null;
  const getCurrentClinicId = () => String(currentUserRef?.()?.clinicId || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID;
  const getCurrentRole = () => String(getCurrentUser()?.tipo || getCurrentUser()?.role || '').trim().toLowerCase();
  const isCentralEnabled = () => centralBackendAdapter?.isEnabled?.() === true;
  const canAccessPlans = () => {
    const currentUser = getCurrentUser();
    if (!currentUser) return false;
    const role = getCurrentRole();
    if (Boolean(currentUser?.isClinicAdmin || currentUser?.clinicAdmin)) return true;
    if (Boolean(currentUser?.permissions?.admin || currentUser?.permissions?.['finance.view'] || currentUser?.permissions?.['plans.view'])) return true;
    return ['admin', 'administrativo', 'super_admin', 'recepcionista', 'recepcao', 'dentista'].includes(role);
  };
  const requirePlansAccess = () => {
    if (!canAccessPlans()) {
      throw new Error('Acesso negado.');
    }
  };
  const shouldFallbackToLocal = (error) => {
    const code = String(error?.code || '').trim().toUpperCase();
    const status = Number(error?.status || 0);
    return code === 'CENTRAL_BACKEND_UNAVAILABLE'
      || code === 'CENTRAL_BACKEND_TIMEOUT'
      || error?.name === 'AbortError'
      || status >= 500;
  };
  const logFallback = (action, error) => {
    console.warn('[PLANOS]', JSON.stringify({
      action,
      module: 'planos',
      operation: action,
      clinicId: getCurrentClinicId(),
      financial_fallback_to_local: true,
      fallback_triggered: true,
      fallback_reason: error?.message || String(error || ''),
      reason: error?.message || String(error || ''),
    }));
  };

  ipcMain.handle('plans-list', async (_event, payload) => {
    requirePlansAccess();
    if (isCentralEnabled()) {
      try {
        const patientId = String(payload?.patientId || payload?.prontuario || '').trim();
        const list = await centralBackendAdapter.listPatientPlans({
          clinicId: getCurrentClinicId(),
          ...(patientId ? { patientId } : {}),
        });
        console.info('[PLANOS]', JSON.stringify({
          clinicId: getCurrentClinicId(),
          financial_loaded_from: 'central',
          count: Array.isArray(list) ? list.length : 0,
        }));
        return list;
      } catch (error) {
        if (!shouldFallbackToLocal(error)) throw error;
        logFallback('plans-list', error);
      }
    }
    return listPlans({ filters: payload || {} });
  });

  ipcMain.handle('plans-create', async (_event, payload) => {
    requirePlansAccess();
    if (isCentralEnabled()) {
      const created = await centralBackendAdapter.createPatientPlan({
        clinicId: getCurrentClinicId(),
        patient: { id: payload?.patientId || payload?.prontuario || '' },
        plan: payload || {},
      });
      console.info('[PLANOS]', JSON.stringify({
        action: 'plan_created',
        clinicId: getCurrentClinicId(),
        patientId: created?.patientId || '',
        planId: created?.id || '',
      }));
      return created;
    }
    return createPlan({ payload: payload || {} });
  });

  ipcMain.handle('plans-update', async (_event, payload) => {
    requirePlansAccess();
    const planId = payload?.planId;
    const patch = payload?.patch || payload || {};
    if (isCentralEnabled()) {
      return centralBackendAdapter.updatePatientPlan({
        clinicId: getCurrentClinicId(),
        planId,
        plan: patch,
      });
    }
    return updatePlan({ planId, patch });
  });

  ipcMain.handle('plans-delete', async (_event, payload) => {
    requirePlansAccess();
    const planId = typeof payload === 'string' ? payload : payload?.planId;
    if (isCentralEnabled()) {
      return centralBackendAdapter.deletePatientPlan({
        clinicId: getCurrentClinicId(),
        planId,
      });
    }
    return deletePlan({ planId });
  });

  ipcMain.handle('plans-get-by-id', async (_event, payload) => {
    requirePlansAccess();
    const planId = typeof payload === 'string' ? payload : payload?.planId;
    if (isCentralEnabled()) {
      return centralBackendAdapter.getPatientPlanById({
        clinicId: getCurrentClinicId(),
        planId,
      });
    }
    return getPlanById({ planId });
  });

  ipcMain.handle('plans-dashboard', async () => {
    requirePlansAccess();
    if (isCentralEnabled()) {
      const accounts = await centralBackendAdapter.getFinancialDashboard({
        clinicId: getCurrentClinicId(),
      });
      return {
        totalPlans: 0,
        totalOpenInstallments: accounts?.overdueInstallments || 0,
        totalPaidAmount: accounts?.totalPaidAmount || 0,
        totalOpenAmount: accounts?.totalOpenAmount || 0,
      };
    }
    return getPlansDashboard({});
  });

  ipcMain.handle('plans-message-history', async (_event, payload = {}) => {
    requirePlansAccess();
    if (!isCentralEnabled() || typeof centralBackendAdapter?.listPlanMessageHistory !== 'function') {
      throw new Error('Historico de mensageria de planos disponivel apenas no backend central.');
    }
    return centralBackendAdapter.listPlanMessageHistory({
      clinicId: getCurrentClinicId(),
      planId: payload?.planId,
    });
  });

  ipcMain.handle('plans-message-suggestions', async (_event, payload = {}) => {
    requirePlansAccess();
    if (!isCentralEnabled() || typeof centralBackendAdapter?.listPlanMessageSuggestions !== 'function') {
      throw new Error('Sugestoes de mensageria de planos disponiveis apenas no backend central.');
    }
    return centralBackendAdapter.listPlanMessageSuggestions({
      clinicId: getCurrentClinicId(),
      planId: payload?.planId,
      dueSoonDays: payload?.dueSoonDays,
    });
  });

  ipcMain.handle('plans-message-send', async (_event, payload = {}) => {
    requirePlansAccess();
    if (!isCentralEnabled() || typeof centralBackendAdapter?.sendPlanMessage !== 'function') {
      throw new Error('Envio de mensageria de planos disponivel apenas no backend central.');
    }
    return centralBackendAdapter.sendPlanMessage({
      clinicId: getCurrentClinicId(),
      planId: payload?.planId,
      installmentId: payload?.installmentId,
      eventType: payload?.eventType,
      manualResend: payload?.manualResend === true,
    });
  });

  ipcMain.handle('plans-message-resend', async (_event, payload = {}) => {
    requirePlansAccess();
    if (!isCentralEnabled() || typeof centralBackendAdapter?.resendPlanMessage !== 'function') {
      throw new Error('Reenvio de mensageria de planos disponivel apenas no backend central.');
    }
    return centralBackendAdapter.resendPlanMessage({
      clinicId: getCurrentClinicId(),
      planMessageId: payload?.planMessageId,
    });
  });
};

module.exports = { registerPlansHandlers };
