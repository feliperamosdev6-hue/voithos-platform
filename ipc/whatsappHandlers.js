const DEFAULT_CLINIC_ID = 'defaultClinic';

const normalizeClinicId = (value) => String(value || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID;

const registerWhatsappHandlers = ({
  ipcMain,
  requireAccess,
  buildAccessContext,
  currentUserRef,
  sendWhatsappText,
  sendAppointmentConfirmationMessage,
  sendAppointmentReminderMessage,
  sendWeeklyCampaignMessage,
  listWhatsappLogs,
}) => {
  const whatsappRoles = ['admin', 'administrativo', 'super_admin', 'recepcionista', 'recepcao', 'dentista'];

  const resolveClinicId = () => {
    const user = typeof currentUserRef === 'function' ? currentUserRef() : null;
    const context = typeof buildAccessContext === 'function'
      ? buildAccessContext(user)
      : {
          tenantScope: user?.tipo === 'super_admin' ? 'global' : 'clinic',
          clinicId: user?.clinicId || DEFAULT_CLINIC_ID,
        };
    if (context.tenantScope !== 'clinic' || !context.clinicId) {
      throw new Error('Selecione uma clinica valida antes de usar o modulo de WhatsApp.');
    }
    return normalizeClinicId(context.clinicId || DEFAULT_CLINIC_ID);
  };
  ipcMain.handle('whatsapp-send-text', async (_event, payload = {}) => {
    requireAccess({ roles: whatsappRoles, perms: ['agenda.edit'] });
    const clinicId = resolveClinicId();
    return sendWhatsappText({
      clinicId,
      phone: payload.phone,
      message: payload.message,
    });
  });

  ipcMain.handle('whatsapp-send-appointment-confirmation', async (_event, payload = {}) => {
    requireAccess({ roles: whatsappRoles, perms: ['agenda.edit'] });
    const clinicId = resolveClinicId();
    return sendAppointmentConfirmationMessage({
      clinicId,
      patient: payload.patient || {},
      appointment: payload.appointment || {},
    });
  });

  ipcMain.handle('whatsapp-send-appointment-reminder', async (_event, payload = {}) => {
    requireAccess({ roles: whatsappRoles, perms: ['agenda.edit'] });
    const clinicId = resolveClinicId();
    return sendAppointmentReminderMessage({
      clinicId,
      patient: payload.patient || {},
      appointment: payload.appointment || {},
    });
  });

  ipcMain.handle('whatsapp-logs-list', async (_event, payload = {}) => {
    requireAccess({ roles: whatsappRoles, perms: ['agenda.view'] });
    const clinicId = resolveClinicId();
    return listWhatsappLogs({
      clinicId,
      filters: payload?.filters || payload || {},
    });
  });
};

module.exports = { registerWhatsappHandlers };
