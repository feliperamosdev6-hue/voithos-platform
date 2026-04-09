const registerCampanhasHandlers = ({
  ipcMain,
  requireRole,
  listCampaigns,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  listGlobalCampaigns,
  saveGlobalCampaigns,
  createCampaignSendBatch,
  recordCampaignDeliveryLog,
  getCampaignsDashboard,
  listCampaignTemplates,
  listCampaignLogs,
  resolveAudience,
  getCampaignResult,
}) => {
  const manageRoles = ['admin', 'administrativo', 'super_admin', 'recepcionista', 'recepcao'];
  const operateRoles = [...manageRoles, 'dentista'];

  ipcMain.handle('campanhas-list', async () => {
    requireRole(operateRoles);
    return listCampaigns();
  });

  ipcMain.handle('campanhas-create', async (_event, payload) => {
    requireRole(operateRoles);
    return createCampaign(payload || {});
  });

  ipcMain.handle('campanhas-update', async (_event, payload) => {
    requireRole(manageRoles);
    return updateCampaign(payload || {});
  });

  ipcMain.handle('campanhas-delete', async (_event, id) => {
    requireRole(manageRoles);
    return deleteCampaign(id);
  });

  ipcMain.handle('campanhas-global-list', async () => {
    requireRole(operateRoles);
    return listGlobalCampaigns();
  });

  ipcMain.handle('campanhas-global-save', async (_event, payload) => {
    requireRole(manageRoles);
    return saveGlobalCampaigns(payload || []);
  });

  ipcMain.handle('campanhas-dashboard', async () => {
    requireRole(operateRoles);
    return getCampaignsDashboard();
  });

  ipcMain.handle('campanhas-templates', async () => {
    requireRole(operateRoles);
    return listCampaignTemplates();
  });

  ipcMain.handle('campanhas-log-delivery', async (_event, payload = {}) => {
    requireRole(operateRoles);
    return recordCampaignDeliveryLog(payload || {});
  });

  ipcMain.handle('campanhas-send-batch-create', async (_event, payload = {}) => {
    requireRole(operateRoles);
    return createCampaignSendBatch(payload || {});
  });

  ipcMain.handle('campanhas-logs-list', async (_event, payload = {}) => {
    requireRole(operateRoles);
    return listCampaignLogs(payload || {});
  });

  ipcMain.handle('campanhas-resolve-audience', async (_event, payload = {}) => {
    requireRole(operateRoles);
    return resolveAudience(payload || {});
  });

  ipcMain.handle('campanhas-result', async (_event, payload = {}) => {
    requireRole(operateRoles);
    return getCampaignResult(payload || {});
  });
};

module.exports = { registerCampanhasHandlers };
