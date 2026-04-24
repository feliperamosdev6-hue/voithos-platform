(function () {
  const unavailable = async (name) => {
    throw new Error('Metodo indisponivel no desktop adapter: ' + name);
  };

  const maskEmail = (email) => {
    const [localPart = '', domain = ''] = String(email || '').trim().toLowerCase().split('@');
    if (!localPart || !domain) return '';
    const localMask = localPart.length <= 2
      ? `${localPart[0] || '*'}*`
      : `${localPart.slice(0, 2)}***`;
    return `${localMask}@${domain}`;
  };

  const logPasswordReset = (stage, payload = {}, extra = {}) => {
    console.info('[password-reset][desktop-adapter]', {
      stage,
      endpoint: extra.endpoint || '',
      email: maskEmail(payload?.email || payload?.login || payload?.adminEmail || ''),
      status: extra.status || '',
      fallback: extra.fallback === true,
      error: extra.error || '',
    });
  };

  const auth = {
    login: async (payload) => {
      if (!window.auth?.login) return unavailable('auth.login');
      return window.auth.login(payload);
    },
    signup: async (payload) => {
      if (!window.auth?.signup) return unavailable('auth.signup');
      return window.auth.signup(payload);
    },
    logout: async () => {
      if (!window.auth?.logout) return unavailable('auth.logout');
      return window.auth.logout();
    },
    currentUser: async () => {
      if (!window.auth?.currentUser) return null;
      return window.auth.currentUser();
    },
    currentContext: async () => {
      if (!window.auth?.currentContext) return null;
      return window.auth.currentContext();
    },
    listUsers: async () => {
      if (!window.auth?.listUsers) return [];
      return window.auth.listUsers();
    },
    changePassword: async (payload) => {
      if (!window.auth?.changePassword) return unavailable('auth.changePassword');
      return window.auth.changePassword(payload);
    },
    requestPasswordReset: async (payload) => {
      logPasswordReset('request_route', payload, { endpoint: '/auth/password-reset/request', status: 'started' });
      if (window.auth?.requestPasswordReset) {
        const result = await window.auth.requestPasswordReset(payload);
        logPasswordReset('request_route', payload, { endpoint: '/auth/password-reset/request', status: 'window_auth' });
        return result;
      }
      if (window.__webAdapter?.auth?.requestPasswordReset) {
        logPasswordReset('request_route', payload, { endpoint: '/auth/password-reset/request', status: 'web_adapter', fallback: true });
        return window.__webAdapter.auth.requestPasswordReset(payload);
      }
      return unavailable('auth.requestPasswordReset');
    },
    confirmEmailVerification: async (payload) => {
      if (window.auth?.confirmEmailVerification) return window.auth.confirmEmailVerification(payload);
      if (window.__webAdapter?.auth?.confirmEmailVerification) return window.__webAdapter.auth.confirmEmailVerification(payload);
      return unavailable('auth.confirmEmailVerification');
    },
    resendEmailVerification: async (payload) => {
      if (window.auth?.resendEmailVerification) return window.auth.resendEmailVerification(payload);
      if (window.__webAdapter?.auth?.resendEmailVerification) return window.__webAdapter.auth.resendEmailVerification(payload);
      return unavailable('auth.resendEmailVerification');
    },
    validatePasswordResetCode: async (payload) => {
      logPasswordReset('validate_route', payload, { endpoint: '/auth/password-reset/validate', status: 'started' });
      if (window.auth?.validatePasswordResetCode) {
        const result = await window.auth.validatePasswordResetCode(payload);
        logPasswordReset('validate_route', payload, { endpoint: '/auth/password-reset/validate', status: 'window_auth' });
        return result;
      }
      if (window.__webAdapter?.auth?.validatePasswordResetCode) {
        logPasswordReset('validate_route', payload, { endpoint: '/auth/password-reset/validate', status: 'web_adapter', fallback: true });
        return window.__webAdapter.auth.validatePasswordResetCode(payload);
      }
      return unavailable('auth.validatePasswordResetCode');
    },
    saveNewPassword: async (payload) => {
      logPasswordReset('confirm_route', payload, { endpoint: '/auth/password-reset/confirm', status: 'started' });
      if (window.auth?.saveNewPassword) {
        const result = await window.auth.saveNewPassword(payload);
        logPasswordReset('confirm_route', payload, { endpoint: '/auth/password-reset/confirm', status: 'window_auth' });
        return result;
      }
      if (window.__webAdapter?.auth?.saveNewPassword) {
        logPasswordReset('confirm_route', payload, { endpoint: '/auth/password-reset/confirm', status: 'web_adapter', fallback: true });
        return window.__webAdapter.auth.saveNewPassword(payload);
      }
      return unavailable('auth.saveNewPassword');
    },
    impersonateClinic: async (clinicId) => {
      if (!window.auth?.impersonateClinic) return unavailable('auth.impersonateClinic');
      return window.auth.impersonateClinic(clinicId);
    },
    listClinics: async () => {
      if (!window.auth?.listClinics) return unavailable('auth.listClinics');
      return window.auth.listClinics();
    },
    createClinic: async (payload) => {
      if (!window.auth?.createClinic) return unavailable('auth.createClinic');
      return window.auth.createClinic(payload);
    },
  };

  const patients = {
    list: async () => {
      if (window.api?.patients?.list) return window.api.patients.list();
      if (window.api?.listPatients) return window.api.listPatients();
      return [];
    },
    read: async (prontuario) => {
      if (window.api?.patients?.read) return window.api.patients.read(prontuario);
      if (window.api?.readPatient) return window.api.readPatient(prontuario);
      return null;
    },
    search: async (query) => {
      if (window.api?.patients?.search) return window.api.patients.search(query);
      if (window.api?.searchPatients) return window.api.searchPatients(query);
      return [];
    },
    find: async (query) => {
      if (window.api?.patients?.find) return window.api.patients.find(query);
      return unavailable('patients.find');
    },
    save: async (payload) => {
      if (window.api?.savePatient) return window.api.savePatient(payload);
      return unavailable('patients.save');
    },
    remove: async (prontuario) => {
      if (window.api?.deletePatient) return window.api.deletePatient(prontuario);
      return unavailable('patients.remove');
    },
    uploadSelfie: async (payload) => {
      if (window.api?.patients?.uploadSelfie) return window.api.patients.uploadSelfie(payload);
      return unavailable('patients.uploadSelfie');
    },
    updateDentist: async (payload) => {
      if (window.patients?.updateDentist) return window.patients.updateDentist(payload);
      return unavailable('patients.updateDentist');
    },
  };

  const users = {
    list: async () => {
      if (window.users?.list) return window.users.list();
      return unavailable('users.list');
    },
    create: async (payload) => {
      if (window.users?.create) return window.users.create(payload);
      return unavailable('users.create');
    },
    update: async (payload) => {
      if (window.users?.update) return window.users.update(payload);
      return unavailable('users.update');
    },
    delete: async (id) => {
      if (window.users?.delete) return window.users.delete(id);
      return unavailable('users.delete');
    },
    resetPassword: async (payload) => {
      if (window.users?.resetPassword) return window.users.resetPassword(payload);
      return unavailable('users.resetPassword');
    },
  };

  const services = {
    addToPatient: async (payload) => {
      if (window.api?.services?.addToPatient) return window.api.services.addToPatient(payload);
      return unavailable('services.addToPatient');
    },
    listForPatient: async (prontuario) => {
      if (window.api?.services?.listForPatient) return window.api.services.listForPatient(prontuario);
      return unavailable('services.listForPatient');
    },
    update: async (payload) => {
      if (window.api?.services?.update) return window.api.services.update(payload);
      return unavailable('services.update');
    },
    delete: async (payload) => {
      if (window.api?.services?.delete) return window.api.services.delete(payload);
      return unavailable('services.delete');
    },
    markDone: async (payload) => {
      if (window.api?.services?.markDone) return window.api.services.markDone(payload);
      return unavailable('services.markDone');
    },
    listAll: async () => {
      if (window.api?.services?.listAll) return window.api.services.listAll();
      return unavailable('services.listAll');
    },
  };

  const documents = {
    list: async (payload) => {
      if (window.api?.documents?.list) return window.api.documents.list(payload);
      return unavailable('documents.list');
    },
    upload: async (payload) => {
      if (window.api?.documents?.upload) return window.api.documents.upload(payload);
      return unavailable('documents.upload');
    },
    open: async (payload) => {
      if (window.api?.documents?.open) return window.api.documents.open(payload);
      return unavailable('documents.open');
    },
    archive: async (payload) => {
      if (window.api?.documents?.archive) return window.api.documents.archive(payload);
      return unavailable('documents.archive');
    },
    saveCustom: async (payload) => {
      if (window.api?.documents?.saveCustom) return window.api.documents.saveCustom(payload);
      return unavailable('documents.saveCustom');
    },
    saveEvolucao: async (payload) => {
      if (window.api?.documents?.saveEvolucao) return window.api.documents.saveEvolucao(payload);
      return unavailable('documents.saveEvolucao');
    },
    updateEvolucao: async (payload) => {
      if (window.api?.documents?.updateEvolucao) return window.api.documents.updateEvolucao(payload);
      return unavailable('documents.updateEvolucao');
    },
    generateDossie: async (payload) => {
      if (window.api?.documents?.generateDossie) return window.api.documents.generateDossie(payload);
      return unavailable('documents.generateDossie');
    },
    saveAnamnese: async (payload) => {
      if (window.api?.documents?.saveAnamnese) return window.api.documents.saveAnamnese(payload);
      return unavailable('documents.saveAnamnese');
    },
    saveReceita: async (payload) => {
      if (window.api?.documents?.saveReceita) return window.api.documents.saveReceita(payload);
      return unavailable('documents.saveReceita');
    },
    openLatestAnamnese: async (payload) => {
      if (window.api?.documents?.openLatestAnamnese) return window.api.documents.openLatestAnamnese(payload);
      return unavailable('documents.openLatestAnamnese');
    },
    openLatestReceita: async (payload) => {
      if (window.api?.documents?.openLatestReceita) return window.api.documents.openLatestReceita(payload);
      return unavailable('documents.openLatestReceita');
    },
    saveAtestado: async (payload) => {
      if (window.api?.documents?.saveAtestado) return window.api.documents.saveAtestado(payload);
      return unavailable('documents.saveAtestado');
    },
    saveContrato: async (payload) => {
      if (window.api?.documents?.saveContrato) return window.api.documents.saveContrato(payload);
      return unavailable('documents.saveContrato');
    },
  };

  const finance = {
    getDashboard: async () => {
      if (window.api?.finance?.getDashboard) return window.api.finance.getDashboard();
      return unavailable('finance.getDashboard');
    },
    getReminders: async () => {
      if (window.api?.finance?.getReminders) return window.api.finance.getReminders();
      return unavailable('finance.getReminders');
    },
    list: async () => {
      if (window.api?.finance?.list) return window.api.finance.list();
      return unavailable('finance.list');
    },
    listByPatient: async (payload) => {
      if (window.api?.finance?.listByPatient) return window.api.finance.listByPatient(payload);
      return unavailable('finance.listByPatient');
    },
    add: async (payload) => {
      if (window.api?.finance?.add) return window.api.finance.add(payload);
      return unavailable('finance.add');
    },
    update: async (payload) => {
      if (window.api?.finance?.update) return window.api.finance.update(payload);
      return unavailable('finance.update');
    },
    confirmPayment: async (payload) => {
      if (window.api?.finance?.confirmPayment) return window.api.finance.confirmPayment(payload);
      return unavailable('finance.confirmPayment');
    },
    createOrUpdateProcedureRevenue: async (payload) => {
      if (window.api?.finance?.createOrUpdateProcedureRevenue) return window.api.finance.createOrUpdateProcedureRevenue(payload);
      return unavailable('finance.createOrUpdateProcedureRevenue');
    },
    remove: async (id) => {
      if (window.api?.finance?.remove) return window.api.finance.remove(id);
      return unavailable('finance.remove');
    },
  };

  const laboratorio = {
    getDashboard: async () => {
      if (window.api?.laboratorio?.getDashboard) return window.api.laboratorio.getDashboard();
      return unavailable('laboratorio.getDashboard');
    },
    list: async () => {
      if (window.api?.laboratorio?.list) return window.api.laboratorio.list();
      return unavailable('laboratorio.list');
    },
    add: async (payload) => {
      if (window.api?.laboratorio?.add) return window.api.laboratorio.add(payload);
      return unavailable('laboratorio.add');
    },
    update: async (payload) => {
      if (window.api?.laboratorio?.update) return window.api.laboratorio.update(payload);
      return unavailable('laboratorio.update');
    },
    remove: async (id) => {
      if (window.api?.laboratorio?.remove) return window.api.laboratorio.remove(id);
      return unavailable('laboratorio.remove');
    },
  };

  const stock = {
    list: async (payload) => {
      if (window.api?.stock?.list) return window.api.stock.list(payload);
      if (window.__webAdapter?.stock?.list) return window.__webAdapter.stock.list(payload);
      return unavailable('stock.list');
    },
    create: async (payload) => {
      if (window.api?.stock?.create) return window.api.stock.create(payload);
      if (window.__webAdapter?.stock?.create) return window.__webAdapter.stock.create(payload);
      return unavailable('stock.create');
    },
    update: async (payload) => {
      if (window.api?.stock?.update) return window.api.stock.update(payload);
      if (window.__webAdapter?.stock?.update) return window.__webAdapter.stock.update(payload);
      return unavailable('stock.update');
    },
    adjustQuantity: async (payload) => {
      if (window.api?.stock?.adjustQuantity) return window.api.stock.adjustQuantity(payload);
      if (window.__webAdapter?.stock?.adjustQuantity) return window.__webAdapter.stock.adjustQuantity(payload);
      return unavailable('stock.adjustQuantity');
    },
    deactivate: async (payload) => {
      if (window.api?.stock?.deactivate) return window.api.stock.deactivate(payload);
      if (window.__webAdapter?.stock?.deactivate) return window.__webAdapter.stock.deactivate(payload);
      return unavailable('stock.deactivate');
    },
    delete: async (payload) => {
      if (window.api?.stock?.delete) return window.api.stock.delete(payload);
      if (window.__webAdapter?.stock?.delete) return window.__webAdapter.stock.delete(payload);
      return unavailable('stock.delete');
    },
  };

  const plans = {
    list: async (payload) => {
      if (window.api?.plans?.list) return window.api.plans.list(payload);
      return unavailable('plans.list');
    },
    getById: async (payload) => {
      if (window.api?.plans?.getById) return window.api.plans.getById(payload);
      return unavailable('plans.getById');
    },
    create: async (payload) => {
      if (window.api?.plans?.create) return window.api.plans.create(payload);
      return unavailable('plans.create');
    },
    update: async (payload) => {
      if (window.api?.plans?.update) return window.api.plans.update(payload);
      return unavailable('plans.update');
    },
    remove: async (payload) => {
      if (window.api?.plans?.remove) return window.api.plans.remove(payload);
      return unavailable('plans.remove');
    },
    dashboard: async () => {
      if (window.api?.plans?.dashboard) return window.api.plans.dashboard();
      return unavailable('plans.dashboard');
    },
    messageHistory: async (payload) => {
      if (window.api?.plans?.messageHistory) return window.api.plans.messageHistory(payload);
      return unavailable('plans.messageHistory');
    },
    messageSuggestions: async (payload) => {
      if (window.api?.plans?.messageSuggestions) return window.api.plans.messageSuggestions(payload);
      return unavailable('plans.messageSuggestions');
    },
    sendMessage: async (payload) => {
      if (window.api?.plans?.sendMessage) return window.api.plans.sendMessage(payload);
      return unavailable('plans.sendMessage');
    },
    resendMessage: async (payload) => {
      if (window.api?.plans?.resendMessage) return window.api.plans.resendMessage(payload);
      return unavailable('plans.resendMessage');
    },
  };

  const campanhas = {
    list: async () => {
      if (window.api?.campanhas?.list) return window.api.campanhas.list();
      return unavailable('campanhas.list');
    },
    create: async (payload) => {
      if (window.api?.campanhas?.create) return window.api.campanhas.create(payload);
      return unavailable('campanhas.create');
    },
    update: async (payload) => {
      if (window.api?.campanhas?.update) return window.api.campanhas.update(payload);
      return unavailable('campanhas.update');
    },
    remove: async (id) => {
      if (window.api?.campanhas?.remove) return window.api.campanhas.remove(id);
      return unavailable('campanhas.remove');
    },
    dashboard: async () => {
      if (window.api?.campanhas?.dashboard) return window.api.campanhas.dashboard();
      return unavailable('campanhas.dashboard');
    },
    templates: async () => {
      if (window.api?.campanhas?.templates) return window.api.campanhas.templates();
      return unavailable('campanhas.templates');
    },
    createSendBatch: async (payload) => {
      if (window.api?.campanhas?.createSendBatch) return window.api.campanhas.createSendBatch(payload);
      return unavailable('campanhas.createSendBatch');
    },
    logDelivery: async (payload) => {
      if (window.api?.campanhas?.logDelivery) return window.api.campanhas.logDelivery(payload);
      return unavailable('campanhas.logDelivery');
    },
    logsList: async (payload) => {
      if (window.api?.campanhas?.logsList) return window.api.campanhas.logsList(payload);
      return unavailable('campanhas.logsList');
    },
    resolveAudience: async (payload) => {
      if (window.api?.campanhas?.resolveAudience) return window.api.campanhas.resolveAudience(payload);
      return unavailable('campanhas.resolveAudience');
    },
    result: async (payload) => {
      if (window.api?.campanhas?.result) return window.api.campanhas.result(payload);
      return unavailable('campanhas.result');
    },
  };

  const campanhasGlobal = {
    list: async () => {
      if (window.api?.campanhasGlobal?.list) return window.api.campanhasGlobal.list();
      return unavailable('campanhasGlobal.list');
    },
    save: async (payload) => {
      if (window.api?.campanhasGlobal?.save) return window.api.campanhasGlobal.save(payload);
      return unavailable('campanhasGlobal.save');
    },
  };

  const clinic = {
    get: async () => {
      if (window.api?.clinic?.get) return window.api.clinic.get();
      return unavailable('clinic.get');
    },
    save: async (payload) => {
      if (window.api?.clinic?.save) return window.api.clinic.save(payload);
      return unavailable('clinic.save');
    },
    testWhatsApp: async (payload) => {
      if (window.api?.clinic?.testWhatsApp) return window.api.clinic.testWhatsApp(payload);
      return unavailable('clinic.testWhatsApp');
    },
    listMessagingLogs: async (payload) => {
      if (window.api?.clinic?.listMessagingLogs) return window.api.clinic.listMessagingLogs(payload);
      return unavailable('clinic.listMessagingLogs');
    },
    queueWhatsApp: async (payload) => {
      if (window.api?.clinic?.queueWhatsApp) return window.api.clinic.queueWhatsApp(payload);
      return unavailable('clinic.queueWhatsApp');
    },
    getWhatsAppEngineHealth: async () => {
      if (window.api?.clinic?.getWhatsAppEngineHealth) return window.api.clinic.getWhatsAppEngineHealth();
      return unavailable('clinic.getWhatsAppEngineHealth');
    },
    getWhatsAppConnection: async () => {
      if (window.api?.clinic?.getWhatsAppConnection) return window.api.clinic.getWhatsAppConnection();
      return unavailable('clinic.getWhatsAppConnection');
    },
    refreshWhatsAppConnection: async () => {
      if (window.api?.clinic?.refreshWhatsAppConnection) return window.api.clinic.refreshWhatsAppConnection();
      return unavailable('clinic.refreshWhatsAppConnection');
    },
    connectWhatsApp: async () => {
      if (window.api?.clinic?.connectWhatsApp) return window.api.clinic.connectWhatsApp();
      return unavailable('clinic.connectWhatsApp');
    },
    disconnectWhatsApp: async () => {
      if (window.api?.clinic?.disconnectWhatsApp) return window.api.clinic.disconnectWhatsApp();
      return unavailable('clinic.disconnectWhatsApp');
    },
    deleteWhatsAppInstance: async () => {
      if (window.api?.clinic?.deleteWhatsAppInstance) return window.api.clinic.deleteWhatsAppInstance();
      return unavailable('clinic.deleteWhatsAppInstance');
    },
  };

  const whatsapp = {
    sendText: async (payload) => {
      if (window.api?.whatsapp?.sendText) return window.api.whatsapp.sendText(payload);
      return unavailable('whatsapp.sendText');
    },
    sendAppointmentConfirmation: async (payload) => {
      if (window.api?.whatsapp?.sendAppointmentConfirmation) return window.api.whatsapp.sendAppointmentConfirmation(payload);
      return unavailable('whatsapp.sendAppointmentConfirmation');
    },
    sendAppointmentReminder: async (payload) => {
      if (window.api?.whatsapp?.sendAppointmentReminder) return window.api.whatsapp.sendAppointmentReminder(payload);
      return unavailable('whatsapp.sendAppointmentReminder');
    },
    sendCampaign: async (payload) => {
      if (window.api?.whatsapp?.sendCampaign) return window.api.whatsapp.sendCampaign(payload);
      return unavailable('whatsapp.sendCampaign');
    },
    logsList: async (payload) => {
      if (window.api?.whatsapp?.logsList) return window.api.whatsapp.logsList(payload);
      return unavailable('whatsapp.logsList');
    },
  };

  const anamneseModels = {
    getActive: async () => {
      if (window.api?.anamneseModels?.getActive) return window.api.anamneseModels.getActive();
      return unavailable('anamneseModels.getActive');
    },
    list: async () => {
      if (window.api?.anamneseModels?.list) return window.api.anamneseModels.list();
      return unavailable('anamneseModels.list');
    },
    create: async (payload) => {
      if (window.api?.anamneseModels?.create) return window.api.anamneseModels.create(payload);
      return unavailable('anamneseModels.create');
    },
    update: async (payload) => {
      if (window.api?.anamneseModels?.update) return window.api.anamneseModels.update(payload);
      return unavailable('anamneseModels.update');
    },
    remove: async (payload) => {
      if (window.api?.anamneseModels?.remove) return window.api.anamneseModels.remove(payload);
      return unavailable('anamneseModels.remove');
    },
    setActive: async (payload) => {
      if (window.api?.anamneseModels?.setActive) return window.api.anamneseModels.setActive(payload);
      return unavailable('anamneseModels.setActive');
    },
  };

  const files = {
    readPatients: async () => {
      if (window.api?.files?.readPatients) return window.api.files.readPatients();
      if (window.api?.readPatientFiles) return window.api.readPatientFiles();
      return unavailable('files.readPatients');
    },
    readReceipts: async () => {
      if (window.api?.files?.readReceipts) return window.api.files.readReceipts();
      if (window.api?.readReceiptFiles) return window.api.readReceiptFiles();
      return unavailable('files.readReceipts');
    },
  };

  const agenda = {
    getDay: async (date) => {
      if (window.api?.agenda?.getDay) return window.api.agenda.getDay(date);
      return unavailable('agenda.getDay');
    },
    getRange: async (payload) => {
      if (window.api?.agenda?.getRange) return window.api.agenda.getRange(payload);
      return unavailable('agenda.getRange');
    },
    add: async (payload) => {
      if (window.api?.agenda?.add) return window.api.agenda.add(payload);
      return unavailable('agenda.add');
    },
    update: async (id, payload) => {
      if (window.api?.agenda?.update) return window.api.agenda.update(id, payload);
      return unavailable('agenda.update');
    },
    remove: async (payload) => {
      if (window.api?.agenda?.remove) return window.api.agenda.remove(payload);
      return unavailable('agenda.remove');
    },
    syncConsultas: async (patientKey) => {
      if (window.api?.agenda?.syncConsultas) return window.api.agenda.syncConsultas(patientKey);
      return unavailable('agenda.syncConsultas');
    },
  };

  const birthdays = {
    listToday: async (payload) => {
      if (window.api?.birthdays?.listToday) return window.api.birthdays.listToday(payload);
      return unavailable('birthdays.listToday');
    },
    listHistory: async (payload) => {
      if (window.api?.birthdays?.listHistory) return window.api.birthdays.listHistory(payload);
      return unavailable('birthdays.listHistory');
    },
    sendBirthdayMessage: async (payload) => {
      if (window.api?.birthdays?.sendBirthdayMessage) return window.api.birthdays.sendBirthdayMessage(payload);
      return unavailable('birthdays.sendBirthdayMessage');
    },
  };

  const relationship = {
    getOverview: async (payload) => {
      if (window.api?.relationship?.getOverview) return window.api.relationship.getOverview(payload);
      return unavailable('relationship.getOverview');
    },
  };

  const agendaSettings = {
    get: async () => {
      if (window.api?.agendaSettings?.get) return window.api.agendaSettings.get();
      return unavailable('agendaSettings.get');
    },
    save: async (payload) => {
      if (window.api?.agendaSettings?.save) return window.api.agendaSettings.save(payload);
      return unavailable('agendaSettings.save');
    },
  };

  const agendaAvailability = {
    get: async () => {
      if (window.api?.agendaAvailability?.get) return window.api.agendaAvailability.get();
      return unavailable('agendaAvailability.get');
    },
    save: async (payload) => {
      if (window.api?.agendaAvailability?.save) return window.api.agendaAvailability.save(payload);
      return unavailable('agendaAvailability.save');
    },
  };

  const notifications = {
    get: async () => {
      if (window.api?.notifications?.get) return window.api.notifications.get();
      return unavailable('notifications.get');
    },
    save: async (payload) => {
      if (window.api?.notifications?.save) return window.api.notifications.save(payload);
      return unavailable('notifications.save');
    },
    listEvents: async (payload) => {
      if (window.api?.notifications?.listEvents) return window.api.notifications.listEvents(payload);
      return unavailable('notifications.listEvents');
    },
  };

  const procedures = {
    list: async () => {
      if (window.api?.procedures?.list) return window.api.procedures.list();
      return unavailable('procedures.list');
    },
    upsert: async (payload) => {
      if (window.api?.procedures?.upsert) return window.api.procedures.upsert(payload);
      return unavailable('procedures.upsert');
    },
    remove: async (payload) => {
      if (window.api?.procedures?.remove) return window.api.procedures.remove(payload);
      return unavailable('procedures.remove');
    },
  };

  const documentModels = {
    list: async (payload) => {
      if (window.api?.documentModels?.list) return window.api.documentModels.list(payload);
      return unavailable('documentModels.list');
    },
    renderPreview: async (payload) => {
      if (window.api?.documentModels?.renderPreview) return window.api.documentModels.renderPreview(payload);
      return unavailable('documentModels.renderPreview');
    },
    create: async (payload) => {
      if (window.api?.documentModels?.create) return window.api.documentModels.create(payload);
      return unavailable('documentModels.create');
    },
    update: async (payload) => {
      if (window.api?.documentModels?.update) return window.api.documentModels.update(payload);
      return unavailable('documentModels.update');
    },
    remove: async (payload) => {
      if (window.api?.documentModels?.remove) return window.api.documentModels.remove(payload);
      return unavailable('documentModels.remove');
    },
    setActive: async (payload) => {
      if (window.api?.documentModels?.setActive) return window.api.documentModels.setActive(payload);
      return unavailable('documentModels.setActive');
    },
  };

  const loadProcedures = async () => {
    if (window.api?.loadProcedures) return window.api.loadProcedures();
    return unavailable('loadProcedures');
  };

  const openExternalUrl = async (url) => {
    if (window.api?.openExternalUrl) return window.api.openExternalUrl(url);
    return unavailable('openExternalUrl');
  };

  const events = {
    receive: (channel, listener) => {
      if (!window.api?.receive) return unavailable('events.receive');
      return window.api.receive(channel, listener);
    },
  };

  // Só criar o desktop adapter se realmente estiver em Electron
  // (window.auth, window.users, etc vêm do contexto do Electron)
  const isElectronRenderer = typeof window.auth !== 'undefined' 
    || typeof window.users !== 'undefined'
    || typeof window.api !== 'undefined';

  if (isElectronRenderer) {
    window.__desktopAdapter = {
      mode: 'desktop',
      auth,
      users,
      patients,
      services,
      documents,
      finance,
      laboratorio,
      stock,
      plans,
      campanhas,
      campanhasGlobal,
      clinic,
      whatsapp,
      anamneseModels,
      files,
      agenda,
      birthdays,
      relationship,
      agendaSettings,
      agendaAvailability,
      notifications,
      procedures,
      documentModels,
      loadProcedures,
      openExternalUrl,
      events,
    };
  }
})();
