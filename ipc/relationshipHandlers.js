const registerRelationshipHandlers = ({
  ipcMain,
  requireAccess,
  currentUserRef,
  centralBackendAdapter,
}) => {
  const DEFAULT_CLINIC_ID = 'defaultClinic';
  const getCurrentClinicId = () => String(currentUserRef?.()?.clinicId || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID;

  ipcMain.handle('relationship-overview', async (_event, payload = {}) => {
    requireAccess({ roles: ['admin', 'administrativo', 'super_admin', 'recepcionista', 'recepcao', 'dentista'], perms: ['agenda.view'] });
    if (!centralBackendAdapter?.isEnabled?.() || typeof centralBackendAdapter?.getRelationshipOverview !== 'function') {
      throw new Error('Visao central de relacionamento indisponivel.');
    }
    return centralBackendAdapter.getRelationshipOverview({
      clinicId: getCurrentClinicId(),
      date: payload?.date,
      dueSoonDays: payload?.dueSoonDays,
    });
  });
};

module.exports = { registerRelationshipHandlers };
