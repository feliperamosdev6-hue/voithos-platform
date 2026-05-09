// preload.js
const { contextBridge, ipcRenderer } = require('electron');

const maskEmail = (email) => {
  const [localPart = '', domain = ''] = String(email || '').trim().toLowerCase().split('@');
  if (!localPart || !domain) return '';
  const localMask = localPart.length <= 2
    ? `${localPart[0] || '*'}*`
    : `${localPart.slice(0, 2)}***`;
  return `${localMask}@${domain}`;
};

const invokePasswordReset = (channel, payload = {}, endpoint = '') => {
  console.info('[password-reset][preload]', {
    stage: 'invoke',
    channel,
    endpoint,
    email: maskEmail(payload?.email || payload?.login || payload?.adminEmail || ''),
    status: 'started',
    fallback: false,
  });
  return ipcRenderer.invoke(channel, payload)
    .then((result) => {
      console.info('[password-reset][preload]', {
        stage: 'invoke_completed',
        channel,
        endpoint,
        email: maskEmail(payload?.email || payload?.login || payload?.adminEmail || ''),
        status: result?.success ? 'success' : 'completed',
        fallback: false,
      });
      return result;
    })
    .catch((error) => {
      console.error('[password-reset][preload]', {
        stage: 'invoke_error',
        channel,
        endpoint,
        email: maskEmail(payload?.email || payload?.login || payload?.adminEmail || ''),
        status: 'error',
        fallback: false,
        error: error?.message || String(error || ''),
      });
      throw error;
    });
};

contextBridge.exposeInMainWorld('auth', {
  login: (credentials) => ipcRenderer.invoke('auth-login', credentials),
  signup: (payload) => ipcRenderer.invoke('auth-signup', payload),
  logout: () => ipcRenderer.invoke('auth-logout'),
  currentUser: () => ipcRenderer.invoke('auth-current-user'),
  currentContext: () => ipcRenderer.invoke('auth-current-context'),
  listUsers: () => ipcRenderer.invoke('auth-list-users-public'),
  changePassword: (payload) => ipcRenderer.invoke('auth-change-password', payload),
  confirmEmailVerification: (payload) => ipcRenderer.invoke('auth-email-verification-confirm', payload),
  resendEmailVerification: (payload) => ipcRenderer.invoke('auth-email-verification-resend', payload),
  requestPasswordReset: (payload) => invokePasswordReset('auth-password-reset-request', payload, '/auth/password-reset/request'),
  validatePasswordResetCode: (payload) => invokePasswordReset('auth-password-reset-validate', payload, '/auth/password-reset/validate'),
  saveNewPassword: (payload) => invokePasswordReset('auth-password-reset-confirm', payload, '/auth/password-reset/confirm'),
  listClinics: () => ipcRenderer.invoke('super-admin-clinics-list'),
  createClinic: (payload) => ipcRenderer.invoke('super-admin-clinics-create', payload),
  impersonateClinic: (clinicId) => ipcRenderer.invoke('super-admin-impersonate-clinic', clinicId),
});

contextBridge.exposeInMainWorld('users', {
  list: () => ipcRenderer.invoke('users-list'),
  create: (data) => ipcRenderer.invoke('users-create', data),
  delete: (id) => ipcRenderer.invoke('users-delete', id),
  update: (data) => ipcRenderer.invoke('users-update', data),
  resetPassword: (payload) => ipcRenderer.invoke('users-reset-password', payload),
});

contextBridge.exposeInMainWorld('api', {
  // Pacientes (legado)
  savePatient: (patientData) => ipcRenderer.invoke('save-patient', patientData),
  listPatients: () => ipcRenderer.invoke('list-patients'),
  searchPatients: (query) => ipcRenderer.invoke('search-patients', query),
  readPatient: (prontuario) => ipcRenderer.invoke('read-patient', prontuario),
  updatePatientData: (patientData) => ipcRenderer.invoke('save-patient', patientData),
  deletePatient: (prontuario) => ipcRenderer.invoke('delete-patient', prontuario),

  patients: {
    find: (query) => ipcRenderer.invoke('find-patient', query),
    search: (query) => ipcRenderer.invoke('search-patients', query),
    list: () => ipcRenderer.invoke('list-patients'),
    read: (prontuario) => ipcRenderer.invoke('read-patient', prontuario),
    updateDentist: (payload) => ipcRenderer.invoke('patient-update-dentist', payload),
    uploadSelfie: (payload) => ipcRenderer.invoke('patient-upload-selfie', payload),
  },

  // Procedimentos
  loadProcedures: () => ipcRenderer.invoke('load-procedures'),

  // Servicos (legado + agrupado)
  listServices: () => ipcRenderer.invoke('list-services'),
  listAllServices: () => ipcRenderer.invoke('list-all-services'),
  listServicesForPatient: (prontuario) => ipcRenderer.invoke('list-services-for-patient', prontuario),
  saveServiceRecord: (payload) => ipcRenderer.invoke('save-service-record', payload),
  addServiceToPatient: (payload) => ipcRenderer.invoke('add-service-to-patient', payload),
  editService: ({ prontuario, serviceId, updatedData }) => ipcRenderer.invoke('update-service', { prontuario, service: { id: serviceId, ...updatedData } }),
  updateService: (payload) => ipcRenderer.invoke('update-service', payload),
  deleteService: (payload) => ipcRenderer.invoke('delete-service', payload),

  services: {
    saveRecord: (payload) => ipcRenderer.invoke('save-service-record', payload),
    addToPatient: (payload) => ipcRenderer.invoke('add-service-to-patient', payload),
    addWithAppointment: (payload) => ipcRenderer.invoke('service-add-with-appointment', payload),
    listForPatient: (prontuario) => ipcRenderer.invoke('list-services-for-patient', prontuario),
    findByCode: (serviceIdOrCode) => ipcRenderer.invoke('find-service-by-code', serviceIdOrCode),
    update: (payload) => ipcRenderer.invoke('update-service', payload),
    markDone: (payload) => ipcRenderer.invoke('service-mark-done', payload),
    delete: (payload) => ipcRenderer.invoke('delete-service-record', payload),
    listAll: () => ipcRenderer.invoke('list-all-services'),
  },

  campanhas: {
    list: () => ipcRenderer.invoke('campanhas-list'),
    create: (payload) => ipcRenderer.invoke('campanhas-create', payload),
    update: (payload) => ipcRenderer.invoke('campanhas-update', payload),
    remove: (id) => ipcRenderer.invoke('campanhas-delete', id),
    dashboard: () => ipcRenderer.invoke('campanhas-dashboard'),
    templates: () => ipcRenderer.invoke('campanhas-templates'),
    createSendBatch: (payload) => ipcRenderer.invoke('campanhas-send-batch-create', payload),
    logDelivery: (payload) => ipcRenderer.invoke('campanhas-log-delivery', payload),
    logsList: (payload) => ipcRenderer.invoke('campanhas-logs-list', payload),
    resolveAudience: (payload) => ipcRenderer.invoke('campanhas-resolve-audience', payload),
    result: (payload) => ipcRenderer.invoke('campanhas-result', payload),
  },

  campanhasGlobal: {
    list: () => ipcRenderer.invoke('campanhas-global-list'),
    save: (payload) => ipcRenderer.invoke('campanhas-global-save', payload),
  },

  clinic: {
    get: () => ipcRenderer.invoke('clinic-get'),
    save: (payload) => ipcRenderer.invoke('clinic-save', payload),
    testWhatsApp: (payload) => ipcRenderer.invoke('clinic-whatsapp-test', payload),
    queueWhatsApp: (payload) => ipcRenderer.invoke('clinic-whatsapp-enqueue', payload),
    listMessagingLogs: (payload) => ipcRenderer.invoke('clinic-messaging-logs-list', payload),
    listWhatsAppPending: (payload) => ipcRenderer.invoke('clinic-whatsapp-pending-list', payload),
    getWhatsAppEngineHealth: () => ipcRenderer.invoke('clinic-whatsapp-engine-health'),
    getWhatsAppConnection: () => ipcRenderer.invoke('clinic-whatsapp-connection-get'),
    refreshWhatsAppConnection: () => ipcRenderer.invoke('clinic-whatsapp-connection-refresh'),
    connectWhatsApp: () => ipcRenderer.invoke('clinic-whatsapp-connection-connect'),
    disconnectWhatsApp: () => ipcRenderer.invoke('clinic-whatsapp-connection-disconnect'),
    deleteWhatsAppInstance: () => ipcRenderer.invoke('clinic-whatsapp-connection-delete'),
  },

  whatsapp: {
    sendText: (payload) => ipcRenderer.invoke('whatsapp-send-text', payload),
    sendAppointmentConfirmation: (payload) => ipcRenderer.invoke('whatsapp-send-appointment-confirmation', payload),
    sendAppointmentReminder: (payload) => ipcRenderer.invoke('whatsapp-send-appointment-reminder', payload),
    sendCampaign: () => Promise.reject(new Error('Disparo de campanha pelo WhatsApp foi desativado.')),
    logsList: (payload) => ipcRenderer.invoke('whatsapp-logs-list', payload),
  },

  clinicProfile: {
    get: (clinicId) => ipcRenderer.invoke('clinic-profile-get', clinicId),
    update: (payload) => ipcRenderer.invoke('clinic-profile-update', payload),
    getLogoDataUrl: (clinicId) => ipcRenderer.invoke('clinic-profile-logo-data-url', clinicId),
  },

  agendaSettings: {
    get: () => ipcRenderer.invoke('agenda-settings-get'),
    save: (payload) => ipcRenderer.invoke('agenda-settings-save', payload),
  },

  agendaAvailability: {
    get: () => ipcRenderer.invoke('agenda-availability-get'),
    save: (payload) => ipcRenderer.invoke('agenda-availability-save', payload),
  },

  notifications: {
    get: () => ipcRenderer.invoke('notifications-get'),
    save: (payload) => ipcRenderer.invoke('notifications-save', payload),
    listEvents: (payload) => ipcRenderer.invoke('notifications-events-list', payload),
  },

  procedures: {
    list: () => ipcRenderer.invoke('procedures-list'),
    upsert: (payload) => ipcRenderer.invoke('procedures-upsert', payload),
    remove: (payload) => ipcRenderer.invoke('procedures-delete', payload),
  },

  anamneseModels: {
    list: () => ipcRenderer.invoke('anamnese-models-list'),
    getActive: () => ipcRenderer.invoke('anamnese-models-get-active'),
    create: (payload) => ipcRenderer.invoke('anamnese-models-create', payload),
    update: (payload) => ipcRenderer.invoke('anamnese-models-update', payload),
    setActive: (payload) => ipcRenderer.invoke('anamnese-models-set-active', payload),
    remove: (payload) => ipcRenderer.invoke('anamnese-models-delete', payload),
  },

  documentModels: {
    list: (payload) => ipcRenderer.invoke('document-models-list', payload),
    create: (payload) => ipcRenderer.invoke('document-models-create', payload),
    update: (payload) => ipcRenderer.invoke('document-models-update', payload),
    remove: (payload) => ipcRenderer.invoke('document-models-delete', payload),
    setActive: (payload) => ipcRenderer.invoke('document-models-set-active', payload),
    renderPreview: (payload) => ipcRenderer.invoke('document-models-render-preview', payload),
  },

  openPatientFileWindow: (prontuario) => ipcRenderer.invoke('open-patient-file-window', prontuario),
  openExternalUrl: (url) => ipcRenderer.invoke('system-open-external-url', url),

  // Gestao de arquivos
  readPatientFiles: () => ipcRenderer.invoke('read-patient-files'),
  readServiceFiles: () => ipcRenderer.invoke('read-service-files'),
  readReceiptFiles: () => ipcRenderer.invoke('read-receipt-files'),
  openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),

  files: {
    readPatients: () => ipcRenderer.invoke('read-patient-files'),
    readServices: () => ipcRenderer.invoke('read-service-files'),
    readReceipts: () => ipcRenderer.invoke('read-receipt-files'),
    openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),
  },


  documents: {
    list: (payload) => ipcRenderer.invoke('read-patient-documents', payload),
    upload: (payload) => ipcRenderer.invoke('upload-patient-document', payload),
    archive: (payload) => ipcRenderer.invoke('archive-patient-document', payload),
    open: (payload) => ipcRenderer.invoke('open-document-file', payload),
    generateDossie: (payload) => ipcRenderer.invoke('generate-patient-dossie', payload),
    generateTestPdf: (payload) => ipcRenderer.invoke('generate-test-pdf', payload),
    saveAnamnese: (payload) => ipcRenderer.invoke('save-patient-anamnese', payload),
    saveEvolucao: (payload) => ipcRenderer.invoke('save-patient-evolucao', payload),
    updateEvolucao: (payload) => ipcRenderer.invoke('update-patient-evolucao', payload),
    saveCustom: (payload) => ipcRenderer.invoke('save-patient-custom-document', payload),
    openLatestAnamnese: (payload) => ipcRenderer.invoke('open-latest-anamnese', payload),
    saveAtestado: (payload) => ipcRenderer.invoke('save-patient-atestado', payload),
    saveReceita: (payload) => ipcRenderer.invoke('save-patient-receita', payload),
    saveContrato: (payload) => ipcRenderer.invoke('save-patient-contrato', payload),
    openLatestReceita: (payload) => ipcRenderer.invoke('open-latest-receita', payload),
  },

  faturamento: {
    listDia: () => ipcRenderer.invoke('faturamento-list-dia'),
    listSemana: () => ipcRenderer.invoke('faturamento-list-semana'),
    listMes: () => ipcRenderer.invoke('faturamento-list-mes'),
    add: (lanc) => ipcRenderer.invoke('faturamento-add', lanc),
    update: (lanc) => ipcRenderer.invoke('faturamento-update', lanc),
    remove: (id) => ipcRenderer.invoke('faturamento-delete', id),
    dashboard: () => ipcRenderer.invoke('faturamento-get-dashboard'),
  },
  finance: {
    getDashboard: () => ipcRenderer.invoke('finance-get-dashboard'),
    getReminders: () => ipcRenderer.invoke('finance-get-reminders'),
    list: () => ipcRenderer.invoke('finance-list'),
    listByPatient: (payload) => ipcRenderer.invoke('finance-list-by-patient', payload),
    add: (lanc) => ipcRenderer.invoke('finance-add', lanc),
    update: (lanc) => ipcRenderer.invoke('finance-update', lanc),
    confirmPayment: (payload) => ipcRenderer.invoke('finance-confirm-payment', payload),
    applyPatientPayment: (payload) => ipcRenderer.invoke('finance-apply-patient-payment', payload),
    createOrUpdateProcedureRevenue: (payload) => ipcRenderer.invoke('finance-procedure-revenue-upsert', payload),
    remove: (id) => ipcRenderer.invoke('finance-delete', id),
    generateReportPdf: (payload) => ipcRenderer.invoke('finance-generate-report-pdf', payload),
    closeMonth: (payload) => ipcRenderer.invoke('finance-close-month', payload),
    reconcileClinic: (payload) => ipcRenderer.invoke('finance-reconcile-clinic', payload),
  },

  laboratorio: {
    list: () => ipcRenderer.invoke('laboratorio-list'),
    add: (registro) => ipcRenderer.invoke('laboratorio-add', registro),
    update: (registro) => ipcRenderer.invoke('laboratorio-update', registro),
    remove: (id) => ipcRenderer.invoke('laboratorio-delete', id),
    getDashboard: () => ipcRenderer.invoke('laboratorio-get-dashboard'),
  },

  plans: {
    list: (payload) => ipcRenderer.invoke('plans-list', payload),
    getById: (payload) => ipcRenderer.invoke('plans-get-by-id', payload),
    create: (payload) => ipcRenderer.invoke('plans-create', payload),
    update: (payload) => ipcRenderer.invoke('plans-update', payload),
    remove: (payload) => ipcRenderer.invoke('plans-delete', payload),
    dashboard: () => ipcRenderer.invoke('plans-dashboard'),
    messageHistory: (payload) => ipcRenderer.invoke('plans-message-history', payload),
    messageSuggestions: (payload) => ipcRenderer.invoke('plans-message-suggestions', payload),
    sendMessage: (payload) => ipcRenderer.invoke('plans-message-send', payload),
    resendMessage: (payload) => ipcRenderer.invoke('plans-message-resend', payload),
  },

  // Agenda
  agenda: {
    openDayView: (date) => ipcRenderer.invoke('agenda-open-day-view', date),
    getDay: (date) => ipcRenderer.invoke('agenda-get-day', { date }),
    getRange: (payload) => ipcRenderer.invoke('agenda-get-range', payload),
    add: (appt) => ipcRenderer.invoke('agenda-add', appt),
    update: (id, appt) => ipcRenderer.invoke('agenda-update', { id, appt }),
    remove: (payload) => ipcRenderer.invoke('agenda-delete', typeof payload === 'object' ? payload : { id: payload }),
    syncConsultas: (patientKey) => ipcRenderer.invoke('agenda-sync-consultas', patientKey),
  },

  birthdays: {
    listToday: (payload) => ipcRenderer.invoke('birthdays-list-today', payload),
    listHistory: (payload) => ipcRenderer.invoke('birthdays-history', payload),
    sendBirthdayMessage: (patientIdOrPayload) => {
      if (patientIdOrPayload && typeof patientIdOrPayload === 'object') {
        return ipcRenderer.invoke('birthdays-send-message', patientIdOrPayload);
      }
      return ipcRenderer.invoke('birthdays-send-message', { patientId: patientIdOrPayload });
    },
    runDailyJob: (payload) => ipcRenderer.invoke('birthdays-run-daily-job', payload),
  },

  relationship: {
    getOverview: (payload) => ipcRenderer.invoke('relationship-overview', payload),
  },

  // Recebedor generico para eventos (ex.: agenda-day-data)
  receive: (channel, callback) => ipcRenderer.on(channel, (_event, data) => callback(data)),
});






contextBridge.exposeInMainWorld('patients', {
  updateDentist: (payload) => ipcRenderer.invoke('patient-update-dentist', payload),
});







