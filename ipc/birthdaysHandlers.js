const registerBirthdaysHandlers = ({
  ipcMain,
  requireAccess,
  listTodayBirthdays,
  listBirthdayHistory,
  sendBirthdayMessage,
  runBirthdaysDailyJob,
}) => {
  ipcMain.handle('birthdays-list-today', async (_event, payload = {}) => {
    requireAccess({ roles: ['admin', 'administrativo', 'super_admin', 'recepcionista', 'recepcao', 'dentista'], perms: ['agenda.view'] });
    return listTodayBirthdays(payload || {});
  });

  ipcMain.handle('birthdays-send-message', async (_event, payload = {}) => {
    requireAccess({ roles: ['admin', 'administrativo', 'super_admin', 'recepcionista', 'recepcao', 'dentista'], perms: ['agenda.edit'] });
    return sendBirthdayMessage(payload || {});
  });

  ipcMain.handle('birthdays-history', async (_event, payload = {}) => {
    requireAccess({ roles: ['admin', 'administrativo', 'super_admin', 'recepcionista', 'recepcao', 'dentista'], perms: ['agenda.view'] });
    return listBirthdayHistory(payload || {});
  });

  ipcMain.handle('birthdays-run-daily-job', async (_event, payload = {}) => {
    requireAccess({ roles: ['admin', 'administrativo', 'super_admin', 'recepcionista', 'recepcao', 'dentista'], perms: ['agenda.settings'] });
    return runBirthdaysDailyJob(payload || {});
  });
};

module.exports = { registerBirthdaysHandlers };
