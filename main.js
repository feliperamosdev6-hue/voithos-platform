// Importa os modulos principais do Electron.
const { app, BrowserWindow, ipcMain, shell } = require('electron');
// Modulos nativos do Node.js.
const path = require('path');
const { fs, fsPromises, fsConstants, pathExists, ensureDir, readJsonFile, writeJsonFile } = require('./services/utils/fileStore');
const { getDataHoraAtual, parseDateOnly, isSameDay, isSameMonth, getWeekRange } = require('./services/utils/dateUtils');
const { createAuthService } = require('./services/authService');
const { createPatientsService } = require('./services/patientsService');
const { createAgendaService } = require('./services/agendaService');
const { createServicesService } = require('./services/servicesService');
const { createCampanhasService } = require('./services/campanhasService');
const { createLaboratorioService } = require('./services/laboratorioService');
const { createFaturamentoService } = require('./services/faturamentoService');
const { createFinanceService } = require('./services/financeService');
const { createClinicProfileService } = require('./services/clinicProfileService');
const { createDocumentsService } = require('./services/documentsService');
const { createPdfService } = require('./services/pdfService');
const { createWhatsAppService } = require('./services/whatsappService');
const { createWhatsAppPendingQueueService } = require('./services/whatsappPendingQueueService');
const { createClinicSettingsService } = require('./services/clinicSettingsService');
const { createWhatsappLogsService } = require('./services/whatsappLogsService');
const { createBirthdaysService } = require('./services/birthdaysService');
const { createAppointmentMessagingService } = require('./services/appointmentMessagingService');
const { createPlansService } = require('./services/plansService');
const { createWhatsAppEngineService } = require('./services/whatsappEngineService');
const { createCentralBackendAdapter } = require('./shared/adapters/central-backend-adapter');
const { registerIpcHandlers } = require('./ipc');

// --- CAMINHOS DAS PASTAS DE DADOS ---
const userDataPath = app.getPath('userData');
const patientsPath = path.join(userDataPath, 'PACIENTES');
const servicesPath = path.join(userDataPath, 'SERVICOS');
const campaignsPath = path.join(userDataPath, 'CAMPANHAS');
const campaignsGlobalPath = path.join(campaignsPath, 'global');
const campaignsFile = path.join(campaignsPath, 'campanhas.json');
const campaignsGlobalFile = path.join(campaignsGlobalPath, 'campanhas-global.json');
const receiptsPath = path.join(userDataPath, 'RECIBOS');
const documentsPath = path.join(userDataPath, 'DOCUMENTOS');
const agendaPath = path.join(userDataPath, 'AGENDA');
const financePath = path.join(userDataPath, 'FINANCEIRO');
const financeFile = path.join(financePath, 'financeiro.json');
const financeClosingsFile = path.join(financePath, 'fechamentos.json');
const financeReportsPath = path.join(financePath, 'relatorios');
const labFile = path.join(financePath, 'laboratorio.json');
const faturamentoFile = path.join(financePath, 'faturamento.json');
const usersPath = path.join(userDataPath, 'USERS');
const usersFile = path.join(usersPath, 'usuarios.json');
const tenantsPath = path.join(userDataPath, 'TENANTS');
const clinicsFile = path.join(tenantsPath, 'clinics.json');
const sessionFile = path.join(usersPath, 'session.json');
const clinicPath = path.join(userDataPath, 'CLINICA');
const clinicFile = path.join(clinicPath, 'clinica.json');
const whatsappLogsFile = path.join(clinicPath, 'whatsapp_logs.json');
const whatsappPendingQueueFile = path.join(clinicPath, 'whatsapp_pending_queue.json');
const agendaSettingsFile = path.join(clinicPath, 'agenda.json');
const availabilityFile = path.join(clinicPath, 'agenda-availability.json');
const notificationsFile = path.join(clinicPath, 'notifications.json');
const plansPath = path.join(userDataPath, 'PLANOS');
const plansFile = path.join(plansPath, 'planos.json');

const authService = createAuthService({
  usersPath,
  usersFile,
  clinicsPath: tenantsPath,
  clinicsFile,
  sessionFile,
});
const {
  DEFAULT_CLINIC_ID,
  ensureTenantBootstrap,
  ensureUsersFile,
  readUsers,
  writeUsers,
  sanitizeUser,
  loginUser,
  createSession,
  clearSession,
  readSessionCache,
  restoreSession,
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
} = authService;

// --- CACHES ---
const serviceCache = new Map();
let serviceIndexLoaded = false;
let currentUser = null;
const centralBackendAdapter = createCentralBackendAdapter();

const generateFinanceId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const generateLaboratorioId = () => generateFinanceId();

const patientsService = createPatientsService({
  patientsPath,
  readJsonFile,
  writeJsonFile,
  pathExists,
  fsPromises,
  getCurrentUser: () => currentUser,
  readUsers,
});
const {
  loadAllPatients,
  listPatients,
  searchPatients,
  deletePatient,
  savePatient,
  updateDentist,
  readPatient,
  findPatient,
} = patientsService;

const loadAllServices = async () => {
  serviceCache.clear();
  const list = [];
  const patients = await loadAllPatients();

  for (const patient of patients) {
    const services = patient.servicos || [];

    services.forEach((svc) => {
      const id = svc.id || `${patient.prontuario}-${Date.now()}`;
      const normalized = { id, ...svc, patientProntuario: patient.prontuario };

      serviceCache.set(id, normalized);
      list.push(normalized);
    });
  }

  serviceIndexLoaded = true;
  return list;
};

const agendaService = createAgendaService({
  agendaPath,
  patientsPath,
  readJsonFile,
  writeJsonFile,
  pathExists,
  ensureDir,
  fsPromises,
  getCurrentUser: () => currentUser,
  readUsers,
  getDataHoraAtual,
});
const {
  generateAppointmentId,
  readAgendaYear,
  writeAgendaYear,
  getRange: agendaGetRange,
  getDay: agendaGetDay,
  addAppointment: agendaAdd,
  updateAppointment: agendaUpdate,
  deleteAppointment: agendaDelete,
  syncConsultasForPatient: agendaSyncConsultas,
} = agendaService;
const clinicSettingsService = createClinicSettingsService({
  clinicPath,
  clinicFile,
  ensureDir,
  pathExists,
  readJsonFile,
  writeJsonFile,
});
const {
  getClinicSettings,
} = clinicSettingsService;
const whatsappLogsService = createWhatsappLogsService({
  whatsappLogsFile,
  pathExists,
  readJsonFile,
  writeJsonFile,
});
const {
  logWhatsappSent,
  logWhatsappFailed,
  listWhatsappLogs,
} = whatsappLogsService;
const whatsappPendingQueueService = createWhatsAppPendingQueueService({
  queueFile: whatsappPendingQueueFile,
  pathExists,
  readJsonFile,
  writeJsonFile,
});
const whatsAppEngineService = createWhatsAppEngineService();
const whatsAppService = createWhatsAppService({
  getClinicSettings,
  logWhatsappSent,
  logWhatsappFailed,
  whatsappEngineService: whatsAppEngineService,
  whatsappPendingQueueService,
  centralBackendAdapter,
});
const listScopedUsersForServices = async ({ clinicId } = {}) => {
  const normalizedClinicId = String(clinicId || currentUser?.clinicId || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID;
  const session = await readSessionCache().catch(() => null);
  if (centralBackendAdapter?.isEnabled?.() === true && String(session?.source || '').trim() === 'central') {
    try {
      const users = await centralBackendAdapter.listUsersWithToken(session?.remoteToken || session?.token || '');
      return (Array.isArray(users) ? users : []).filter((user) => String(user?.clinicId || '').trim() === normalizedClinicId);
    } catch (error) {
      const code = String(error?.code || '').trim().toUpperCase();
      const status = Number(error?.status || 0);
      const shouldFallback = code === 'CENTRAL_BACKEND_UNAVAILABLE'
        || code === 'CENTRAL_BACKEND_TIMEOUT'
        || error?.name === 'AbortError'
        || status >= 500;
      if (!shouldFallback) throw error;
    }
  }
  return listUsersPublic({ clinicId: normalizedClinicId });
};
const servicesService = createServicesService({
  patientsPath,
  servicesPath,
  clinicPath,
  readJsonFile,
  writeJsonFile,
  pathExists,
  fsPromises,
  getCurrentUser: () => currentUser,
  readUsers,
  listScopedUsers: listScopedUsersForServices,
  loadAllPatients,
  loadAllServices,
  createAgendaFromService,
  centralBackendAdapter,
  readSessionCache,
});
const {
  addServiceRecord,
  findServiceByCode,
  listServicesSummary,
  addServiceToPatient,
  listAllServices,
  updateService,
  deleteServiceRecord,
  addServiceWithAppointment,
  deleteService,
  listServicesForPatient,
  loadProcedures,
} = servicesService;

const plansService = createPlansService({
  plansPath,
  plansFile,
  financePath,
  financeFile,
  ensureDir,
  pathExists,
  readJsonFile,
  writeJsonFile,
  getCurrentUser: () => currentUser,
  generateFinanceId,
});
const {
  listPlans,
  getPlanById,
  createPlan,
  updatePlan,
  deletePlan,
  getPlansDashboard,
} = plansService;

const campanhasService = createCampanhasService({
  campaignsPath,
  campaignsFile,
  campaignsGlobalPath,
  campaignsGlobalFile,
  patientsPath,
  agendaPath,
  plansFile,
  financeFile,
  fsPromises,
  ensureDir,
  pathExists,
  readJsonFile,
  writeJsonFile,
  getCurrentUser: () => currentUser,
  readSessionCache,
  centralBackendAdapter,
});
const {
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
} = campanhasService;

const laboratorioService = createLaboratorioService({
  financePath,
  labFile,
  ensureDir,
  pathExists,
  readJsonFile,
  writeJsonFile,
});
const { readLaboratorio, writeLaboratorio } = laboratorioService;
const faturamentoService = createFaturamentoService({
  financePath,
  faturamentoFile,
  ensureDir,
  pathExists,
  readJsonFile,
  writeJsonFile,
  parseDateOnly,
  isSameDay,
  isSameMonth,
  getWeekRange,
  generateFinanceId,
});
const {
  readFaturamento,
  writeFaturamento,
  normalizeMetodoPagamento,
  buildFaturamentoParcelas,
  buildFaturamentoRecord,
  filterFaturamentoByPeriod,
  computeFaturamentoDashboard,
} = faturamentoService;
const financeService = createFinanceService({
  financePath,
  financeFile,
  financeClosingsFile,
  ensureDir,
  pathExists,
  readJsonFile,
  writeJsonFile,
  parseDateOnly,
  generateFinanceId,
  loadAllPatients,
  getCurrentUser: () => currentUser,
});
const {
  readFinance,
  writeFinance,
  readFinanceClosings,
  writeFinanceClosings,
  buildFinanceMonthlyReport,
  createOrUpdateProcedureRevenue,
  confirmPayment,
  listByPatient: listFinanceByPatient,
} = financeService;
const clinicProfileService = createClinicProfileService({
  clinicPath,
  clinicFile,
  ensureDir,
  pathExists,
  readJsonFile,
  writeJsonFile,
  fsPromises,
  readSessionCache,
  centralBackendAdapter,
});
const {
  getClinicProfile,
  updateClinicProfile,
  getClinicLogoDataUrl,
} = clinicProfileService;
const documentsService = createDocumentsService({
  patientsPath,
  documentsPath,
  receiptsPath,
  servicesPath,
  pathExists,
  ensureDir,
  readJsonFile,
  writeJsonFile,
  fsPromises,
  getCurrentUser: () => currentUser,
});
const {
  allowedDocumentExtensions,
  maxDocumentSizeBytes,
  generateDocumentId,
  sanitizeDocumentValue,
  normalizeDocumentDate,
  ensurePatientAccess,
  ensurePatientDocumentsDir,
  readPatientDocumentsIndex,
  writePatientDocumentsIndex,
  getPatientDocumentCount,
  readDirectoryFiles,
  readPatientFilesDetailed,
} = documentsService;
const pdfService = createPdfService({
  BrowserWindow,
  fsPromises,
  ensureDir,
  financeReportsPath,
  readJsonFile,
  pathExists,
  clinicFile,
  usersPath,
  readUsers,
  readFinance,
  buildFinanceMonthlyReport,
  getFinancialReport: async (month, year) => {
    if (centralBackendAdapter?.isEnabled?.() !== true) return null;
    return centralBackendAdapter.getFinancialReport({
      clinicId: String(currentUser?.clinicId || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID,
      month,
      year,
    });
  },
  userDataPath,
  getClinicProfile,
  getClinicLogoDataUrl,
  getCurrentUser: () => currentUser,
});
const {
  generateAnamnesePdf,
  generateAtestadoPdf,
  generateReceitaPdf,
  generateContratoPdf,
  generateOrcamentoPdf,
  generateFinanceReportPdf,
  generateDossiePdf,
  generateTestPdf,
} = pdfService;
const birthdaysService = createBirthdaysService({
  patientsPath,
  clinicPath,
  clinicFile,
  ensureDir,
  pathExists,
  readJsonFile,
  writeJsonFile,
  fsPromises,
  getCurrentUser: () => currentUser,
  agendaGetDay,
  sendWhatsAppMessage: whatsAppService.sendMessage,
  centralBackendAdapter,
});
const {
  listToday: listTodayBirthdays,
  listHistory: listBirthdayHistory,
  sendBirthdayMessage,
  runDailyJob: runBirthdaysDailyJob,
  startDailyScheduler: startBirthdaysDailyScheduler,
  stopDailyScheduler: stopBirthdaysDailyScheduler,
} = birthdaysService;
const appointmentMessagingService = createAppointmentMessagingService({
  agendaPath,
  patientsPath,
  clinicPath,
  ensureDir,
  pathExists,
  readJsonFile,
  writeJsonFile,
  fsPromises,
  sendWhatsAppMessage: whatsAppService.sendMessage,
  centralBackendAdapter,
});
const {
  sendConfirmationOnCreate,
  runDayBeforeReminderJob,
  startReminderScheduler,
  stopReminderScheduler,
} = appointmentMessagingService;

const resolvePatientForWhatsapp = async (appointment = {}, fallbackPatient = {}) => {
  const keys = [
    appointment?.prontuario,
    appointment?.pacienteId,
    appointment?.patientId,
    fallbackPatient?.prontuario,
    fallbackPatient?.id,
    fallbackPatient?._id,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  for (const key of keys) {
    const file = path.join(patientsPath, `${key}.json`);
    if (!(await pathExists(file))) continue;
    const patient = await readJsonFile(file).catch(() => null);
    if (patient && typeof patient === 'object') return patient;
  }

  return fallbackPatient || {};
};

const sendAppointmentConfirmationMessage = async ({ appointment = {}, patient = {} } = {}) => {
  const clinicId = String(appointment?.clinicId || currentUser?.clinicId || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID;
  const resolvedPatient = await resolvePatientForWhatsapp(appointment, patient);
  return whatsAppService.sendAppointmentConfirmation({
    clinicId,
    patient: resolvedPatient,
    appointment,
  });
};

const sendAppointmentReminderMessage = async ({ appointment = {}, patient = {} } = {}) => {
  const clinicId = String(appointment?.clinicId || currentUser?.clinicId || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID;
  const resolvedPatient = await resolvePatientForWhatsapp(appointment, patient);
  return whatsAppService.sendAppointmentReminder({
    clinicId,
    patient: resolvedPatient,
    appointment,
  });
};

const sendWeeklyCampaignWhatsappMessage = async ({ patient = {}, campaign = {} } = {}) => {
  const clinicId = String(currentUser?.clinicId || campaign?.clinicId || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID;
  return whatsAppService.sendWeeklyCampaignMessage({
    clinicId,
    patient,
    campaign,
  });
};

const isQueueableWhatsAppError = (error) => {
  const code = String(error?.code || '').trim().toUpperCase();
  return [
    'ENGINE_UNAVAILABLE',
    'ENGINE_TIMEOUT',
    'ENGINE_RECONNECTING',
    'ENGINE_STARTING',
  ].includes(code);
};

let whatsappPendingDrainTimer = null;
let whatsappPendingDrainRunning = false;

const drainWhatsAppPendingQueue = async () => {
  if (whatsappPendingDrainRunning) return;
  whatsappPendingDrainRunning = true;
  try {
    const jobs = await whatsappPendingQueueService.listDuePending({ limit: 12 });
    for (const job of jobs) {
      try {
        const result = await whatsAppEngineService.sendClinicText({
          clinicId: job.clinicId,
          phone: job.phone,
          message: job.message,
          appointmentId: job.appointmentId || undefined,
        });
        await whatsappPendingQueueService.markSent(job.jobId, {
          provider: result?.provider || 'whatsapp_engine',
          instanceId: result?.instanceId || '',
          clinicSenderPhone: result?.clinicSenderPhone || '',
        });
        await logWhatsappSent({
          clinicId: job.clinicId,
          provider: result?.provider || 'whatsapp_engine',
          instanceId: result?.instanceId || '',
          clinicSenderPhone: result?.clinicSenderPhone || '',
          patientId: job.patientId,
          appointmentId: job.appointmentId,
          campaignId: job.campaignId,
          phone: job.phone,
          message: job.message,
          type: job.type,
          createdAt: new Date().toISOString(),
        }).catch(() => null);
      } catch (error) {
        const message = error?.message || String(error);
        if (isQueueableWhatsAppError(error)) {
          await whatsappPendingQueueService.reschedulePending(job.jobId, message);
        } else {
          await whatsappPendingQueueService.markFailed(job.jobId, message);
          await logWhatsappFailed({
            clinicId: job.clinicId,
            provider: 'whatsapp_engine',
            patientId: job.patientId,
            appointmentId: job.appointmentId,
            campaignId: job.campaignId,
            phone: job.phone,
            message: job.message,
            type: job.type,
            errorMessage: message,
            createdAt: new Date().toISOString(),
          }).catch(() => null);
        }
      }
    }
  } finally {
    whatsappPendingDrainRunning = false;
  }
};

const startWhatsAppPendingQueueDrain = () => {
  if (whatsappPendingDrainTimer) clearInterval(whatsappPendingDrainTimer);
  whatsappPendingDrainTimer = setInterval(() => {
    void drainWhatsAppPendingQueue();
  }, 30000);
  void drainWhatsAppPendingQueue();
};

const stopWhatsAppPendingQueueDrain = () => {
  if (!whatsappPendingDrainTimer) return;
  clearInterval(whatsappPendingDrainTimer);
  whatsappPendingDrainTimer = null;
};

// --- CONTROLE DE ACESSO ---
const requireRole = (allowedRoles = []) => {
  if (
    currentUser?.tipo === 'admin'
    || currentUser?.tipo === 'administrativo'
    || currentUser?.tipo === 'super_admin'
    || currentUser?.permissions?.admin === true
  ) return;
  if (!currentUser) {
    throw new Error('Acesso negado.');
  }
  if (!allowedRoles.includes(currentUser.tipo)) {
    throw new Error('Acesso negado.');
  }
};

const hasPermission = (perm) => {
  if (!perm) return false;
  const perms = currentUser?.permissions || {};
  return perms[perm] === true;
};

const requireAccess = ({ roles = [], perms = [] } = {}) => {
  if (currentUser?.tipo === 'admin' || currentUser?.tipo === 'super_admin' || currentUser?.permissions?.admin) return;
  if (!currentUser) throw new Error('Acesso negado.');

  if (currentUser?.permissionsEnabled && perms.length) {
    const ok = perms.every((perm) => hasPermission(perm));
    if (!ok) throw new Error('Acesso negado.');
    return;
  }

  if (!roles.length || roles.includes(currentUser.tipo)) return;
  throw new Error('Acesso negado.');
};

registerIpcHandlers({
  ipcMain,
  shell,
  BrowserWindow,
  pathExists,
  fsPromises,
  fsConstants,
  ensureDir,
  readJsonFile,
  writeJsonFile,
  ensurePatientAccess,
  sanitizeDocumentValue,
  normalizeDocumentDate,
  ensurePatientDocumentsDir,
  readPatientDocumentsIndex,
  writePatientDocumentsIndex,
  getPatientDocumentCount,
  readDirectoryFiles,
  readPatientFilesDetailed,
  allowedDocumentExtensions,
  maxDocumentSizeBytes,
  generateDocumentId,
  generateAnamnesePdf,
  generateAtestadoPdf,
  generateReceitaPdf,
  generateContratoPdf,
  generateOrcamentoPdf,
  generateDossiePdf,
  generateTestPdf,
  requireRole,
  requireAccess,
  patientsPath,
  receiptsPath,
  servicesPath,
  userDataPath,
  readFinance,
  writeFinance,
  readFinanceClosings,
  writeFinanceClosings,
  buildFinanceMonthlyReport,
  createOrUpdateProcedureRevenue,
  confirmPayment,
  listFinanceByPatient,
  generateFinanceId,
  parseDateOnly,
  isSameDay,
  isSameMonth,
  getWeekRange,
  generateFinanceReportPdf,
  readFaturamento,
  writeFaturamento,
  buildFaturamentoRecord,
  filterFaturamentoByPeriod,
  computeFaturamentoDashboard,
  readLaboratorio,
  writeLaboratorio,
  generateLaboratorioId,
  agendaGetRange,
  agendaGetDay,
  agendaAdd,
  agendaUpdate,
  agendaDelete,
  loginUser,
  sanitizeUser,
  createSession,
  clearSession,
  readSessionCache,
  restoreSession,
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
  centralBackendAdapter,
  currentUserRef: () => currentUser,
  setCurrentUser: (user) => { currentUser = user; },
  listPatients,
  searchPatients,
  deletePatient,
  savePatient,
  updateDentist,
  readPatient,
  findPatient,
  addServiceRecord,
  findServiceByCode,
  listServicesSummary,
  addServiceToPatient,
  listAllServices,
  updateService,
  deleteServiceRecord,
  addServiceWithAppointment,
  deleteService,
  listServicesForPatient,
  loadProcedures,
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
  listPlans,
  getPlanById,
  createPlan,
  updatePlan,
  deletePlan,
  getPlansDashboard,
  clinicPath,
  clinicFile,
  getClinicProfile,
  updateClinicProfile,
  getClinicLogoDataUrl,
  agendaSettingsFile,
  availabilityFile,
  notificationsFile,
  listTodayBirthdays,
  listBirthdayHistory,
  sendBirthdayMessage,
  sendWhatsAppMessage: whatsAppService.sendMessage,
  runBirthdaysDailyJob,
  sendAppointmentConfirmation: sendAppointmentConfirmationMessage,
  sendWhatsappText: whatsAppService.sendText,
  sendAppointmentConfirmationMessage,
  sendAppointmentReminderMessage,
  sendWeeklyCampaignMessage: sendWeeklyCampaignWhatsappMessage,
  listWhatsappLogs,
  whatsappEngineService: whatsAppEngineService,
  whatsappPendingQueueService,
});

const migrateLegacyClinicIds = async () => {
  await ensureDir(patientsPath);
  const patientFiles = await fsPromises.readdir(patientsPath).catch(() => []);
  for (const file of patientFiles) {
    if (!file.endsWith('.json')) continue;
    const fullPath = path.join(patientsPath, file);
    try {
      const patient = await readJsonFile(fullPath);
      if (!patient || typeof patient !== 'object') continue;
      if (patient.clinicId) continue;
      patient.clinicId = DEFAULT_CLINIC_ID;
      await writeJsonFile(fullPath, patient);
    } catch (err) {
      console.warn('[MIGRATION] Falha ao migrar clinicId do paciente:', file, err?.message || err);
    }
  }

  await ensureDir(agendaPath);
  const agendaFiles = await fsPromises.readdir(agendaPath).catch(() => []);
  for (const file of agendaFiles) {
    if (!file.endsWith('.json')) continue;
    const fullPath = path.join(agendaPath, file);
    try {
      const payload = await readJsonFile(fullPath);
      const list = Array.isArray(payload?.agendamentos) ? payload.agendamentos : [];
      let changed = false;
      const updated = list.map((appt) => {
        if (appt?.clinicId) return appt;
        changed = true;
        return { ...appt, clinicId: DEFAULT_CLINIC_ID };
      });
      if (changed) {
        await writeJsonFile(fullPath, { agendamentos: updated });
      }
    } catch (err) {
      console.warn('[MIGRATION] Falha ao migrar clinicId da agenda:', file, err?.message || err);
    }
  }
};

const reconcileOrphanProcedureFinanceEntries = async () => {
  const patientFiles = await fsPromises.readdir(patientsPath).catch(() => []);
  const proceduresByClinicAndProntuario = new Map();
  const proceduresByClinic = new Map();
  const patientFileByClinicAndProntuario = new Map();
  const patientEntries = [];

  for (const file of patientFiles) {
    if (!file.endsWith('.json')) continue;
    const fullPath = path.join(patientsPath, file);
    try {
      const patient = await readJsonFile(fullPath);
      if (!patient || typeof patient !== 'object') continue;

      const clinicId = String(patient.clinicId || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID;
      const prontuario = String(patient.prontuario || '').trim();
      if (!prontuario) continue;

      const services = Array.isArray(patient.servicos) ? patient.servicos : [];
      const clinicAnySet = proceduresByClinic.get(clinicId) || new Set();
      const clinicProntMap = proceduresByClinicAndProntuario.get(clinicId) || new Map();
      const prontSet = clinicProntMap.get(prontuario) || new Set();

      services.forEach((service) => {
        const serviceId = String(service?.id || '').trim();
        if (!serviceId) return;
        clinicAnySet.add(serviceId);
        prontSet.add(serviceId);
        patientEntries.push({
          filePath: fullPath,
          patient,
          clinicId,
          prontuario,
          service,
        });
      });

      clinicProntMap.set(prontuario, prontSet);
      proceduresByClinicAndProntuario.set(clinicId, clinicProntMap);
      proceduresByClinic.set(clinicId, clinicAnySet);
      patientFileByClinicAndProntuario.set(`${clinicId}::${prontuario}`, { filePath: fullPath, patient });
    } catch (err) {
      console.warn('[MIGRATION] Falha ao ler paciente para reconciliacao financeira:', file, err?.message || err);
    }
  }

  if (!(await pathExists(financeFile))) return;
  const payload = await readJsonFile(financeFile);
  const list = Array.isArray(payload?.lancamentos) ? payload.lancamentos : [];

  const isProcedureEntry = (entry) => {
    const origem = String(entry?.origem || '').trim().toLowerCase();
    const categoria = String(entry?.categoria || '').trim().toLowerCase();
    const procedureId = String(entry?.procedureId || entry?.servicoId || '').trim();
    return origem === 'procedimento' || categoria === 'procedimentos' || !!procedureId;
  };

  const filtered = list.filter((entry) => {
    if (!isProcedureEntry(entry)) return true;

    const clinicId = String(entry?.clinicId || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID;
    const procedureId = String(entry?.procedureId || entry?.servicoId || '').trim();
    if (!procedureId) return false;

    const prontuario = String(entry?.prontuario || '').trim();
    const clinicProntMap = proceduresByClinicAndProntuario.get(clinicId) || new Map();
    if (prontuario) {
      const prontSet = clinicProntMap.get(prontuario);
      return Boolean(prontSet && prontSet.has(procedureId));
    }

    const clinicAnySet = proceduresByClinic.get(clinicId);
    return Boolean(clinicAnySet && clinicAnySet.has(procedureId));
  });

  const entryByClinicAndService = new Map();
  filtered.forEach((entry) => {
    const clinicId = String(entry?.clinicId || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID;
    const procedureId = String(entry?.procedureId || entry?.servicoId || '').trim();
    if (!procedureId) return;
    entryByClinicAndService.set(`${clinicId}::${procedureId}`, entry);
  });

  let inserted = 0;
  const patientsToPersist = new Map();

  patientEntries.forEach(({ filePath, patient, clinicId, prontuario, service }) => {
    const serviceId = String(service?.id || '').trim();
    if (!serviceId) return;
    if (service?.gerarFinanceiro === false) return;

    const statusRaw = String(service?.status || service?.estado || service?.situacao || '').trim().toLowerCase();
    if (statusRaw === 'pre-existente' || statusRaw === 'preexistente') return;

    const valor = Number(service?.valorCobrado ?? service?.valor ?? service?.value ?? 0);
    if (!Number.isFinite(valor) || valor <= 0) return;

    const key = `${clinicId}::${serviceId}`;
    let entry = entryByClinicAndService.get(key);
    if (!entry) {
      const nowIso = new Date().toISOString();
      const nomeProcedimento = String(service?.tipo || service?.nome || service?.procedimento || 'Procedimento').trim() || 'Procedimento';
      entry = {
        id: generateFinanceId(),
        clinicId,
        tipo: 'receita',
        categoria: 'procedimentos',
        descricao: `Procedimento: ${nomeProcedimento}`,
        valor,
        status: 'pendente',
        metodoPagamento: 'pix',
        paymentMethod: 'PIX',
        paymentStatus: 'PENDING',
        paidAt: null,
        dueDate: null,
        vencimento: null,
        installments: null,
        patientId: String(patient?.id || patient?._id || '').trim(),
        prontuario,
        paciente: String(patient?.fullName || patient?.nome || '').trim(),
        procedureId: serviceId,
        servicoId: serviceId,
        procedimento: nomeProcedimento,
        origem: 'procedimento',
        data: nowIso.slice(0, 10),
        createdAt: nowIso,
        createdBy: '',
        updatedAt: nowIso,
        updatedBy: '',
      };
      filtered.push(entry);
      entryByClinicAndService.set(key, entry);
      inserted += 1;
    }

    const financeId = String(entry?.id || '').trim();
    const currentFinanceId = String(service?.financeiroId || service?.financeiroLancamentoId || service?.financeiro?.financeEntryId || '').trim();
    if (financeId && currentFinanceId !== financeId) {
      const nextFinance = {
        ...(service?.financeiro || {}),
        financeEntryId: financeId,
        paymentStatus: String(entry?.paymentStatus || '').trim() || 'PENDING',
        paymentMethod: String(entry?.paymentMethod || '').trim() || 'PIX',
        paidAt: entry?.paidAt || null,
        dueDate: entry?.dueDate || null,
        installments: entry?.installments ?? null,
      };
      service.financeiroId = financeId;
      service.financeiro = nextFinance;
      patientsToPersist.set(filePath, patient);
    }
  });

  for (const [filePath, patient] of patientsToPersist.entries()) {
    await writeJsonFile(filePath, patient);
  }

  if (filtered.length !== list.length || inserted > 0) {
    await writeJsonFile(financeFile, { lancamentos: filtered });
    console.log(`[MIGRATION] Reconciliacao financeira removeu ${list.length - filtered.length + inserted} ajuste(s): removidos ${list.length - filtered.length + inserted - inserted}, inseridos ${inserted}.`);
  }

  if (centralBackendAdapter?.isEnabled?.() !== true) return;

  const normalizeCentralPaymentStatus = (value) => {
    const raw = String(value || '').trim().toUpperCase();
    if (raw === 'PAID' || raw === 'PAGO') return 'PAID';
    if (raw === 'CANCELLED' || raw === 'CANCELADO') return 'CANCELLED';
    return 'PENDING';
  };
  const normalizeCentralPaymentMethod = (value) => {
    const raw = String(value || '').trim().toUpperCase();
    if (['PIX', 'CREDIT', 'DEBIT', 'CASH', 'BOLETO', 'TRANSFER', 'OTHER'].includes(raw)) return raw;
    if (raw === 'CARTAO_CREDITO' || raw === 'CREDITO') return 'CREDIT';
    if (raw === 'CARTAO_DEBITO' || raw === 'DEBITO') return 'DEBIT';
    if (raw === 'DINHEIRO') return 'CASH';
    if (raw === 'TRANSFERENCIA') return 'TRANSFER';
    if (raw === 'OUTRO') return 'OTHER';
    return 'PIX';
  };
  const nowDateOnly = () => new Date().toISOString().slice(0, 10);
  const clinicIds = Array.from(proceduresByClinic.keys());

  for (const clinicId of clinicIds) {
    try {
      const centralPatients = await centralBackendAdapter.getPatients({ clinicId }).catch(() => []);
      const fallbackPatients = Array.from(
        new Map(
          patientEntries
            .filter((entry) => entry.clinicId === clinicId)
            .map((entry) => [
              entry.prontuario,
              {
                id: entry.patient?.id || entry.patient?.prontuario || entry.prontuario,
                prontuario: entry.prontuario,
                nome: entry.patient?.fullName || entry.patient?.nome || '',
              },
            ])
        ).values()
      );
      const patientRefs = (Array.isArray(centralPatients) && centralPatients.length ? centralPatients : fallbackPatients)
        .map((patient) => ({
          id: String(patient?.id || patient?.prontuario || '').trim(),
          prontuario: String(patient?.prontuario || patient?.id || '').trim(),
          nome: String(patient?.nome || patient?.fullName || '').trim(),
          clinicId,
        }))
        .filter((patient) => patient.id && patient.prontuario);

      const centralProceduresById = new Map();
      for (const patient of patientRefs) {
        const procedures = await centralBackendAdapter.listPatientProcedures({
          clinicId,
          patient: { id: patient.id, prontuario: patient.prontuario, clinicId },
        }).catch(() => []);
        (Array.isArray(procedures) ? procedures : []).forEach((procedure) => {
          const procedureId = String(procedure?.id || '').trim();
          if (!procedureId) return;
          centralProceduresById.set(procedureId, { procedure, patient });
        });
      }

      const centralAccounts = await centralBackendAdapter.listFinancialAccounts({ clinicId }).catch(() => []);
      const centralFinanceByProcedure = new Map();
      let centralRemoved = 0;
      let centralInserted = 0;
      let centralLinked = 0;

      for (const account of (Array.isArray(centralAccounts) ? centralAccounts : [])) {
        const procedureId = String(account?.procedureId || account?.servicoId || account?.externalReference || '').trim();
        if (!procedureId) continue;
        if (!centralProceduresById.has(procedureId)) {
          await centralBackendAdapter.deleteFinancialAccount({
            clinicId,
            accountId: String(account?.id || '').trim(),
          }).catch(() => null);
          centralRemoved += 1;
          continue;
        }
        const rows = centralFinanceByProcedure.get(procedureId) || [];
        rows.push(account);
        centralFinanceByProcedure.set(procedureId, rows);
      }

      for (const [procedureId, context] of centralProceduresById.entries()) {
        const { procedure, patient } = context;
        const rows = centralFinanceByProcedure.get(procedureId) || [];
        const procedureFinanceId = String(procedure?.financeiroId || procedure?.financeiro?.financeEntryId || '').trim();
        let canonical = null;

        if (rows.length > 1) {
          canonical = rows.find((row) => String(row?.id || '').trim() === procedureFinanceId) || rows[0];
          for (const row of rows) {
            if (String(row?.id || '').trim() === String(canonical?.id || '').trim()) continue;
            await centralBackendAdapter.deleteFinancialAccount({
              clinicId,
              accountId: String(row?.id || '').trim(),
            }).catch(() => null);
            centralRemoved += 1;
          }
        } else if (rows.length === 1) {
          canonical = rows[0];
        }

        const amount = Number(procedure?.valorCobrado ?? procedure?.valor ?? procedure?.value ?? 0);
        if (!canonical && Number.isFinite(amount) && amount > 0 && procedure?.gerarFinanceiro !== false) {
          canonical = await centralBackendAdapter.createFinancialAccount({
            clinicId,
            patient: { id: patient.id, prontuario: patient.prontuario, clinicId },
            account: {
              patientId: patient.id,
              description: `Procedimento: ${procedure?.tipo || procedure?.nome || procedure?.procedimento || 'Procedimento'}`,
              totalAmount: amount,
              category: 'procedimentos',
              source: 'procedimento',
              type: 'receita',
              paymentMethod: normalizeCentralPaymentMethod(procedure?.financeiro?.paymentMethod || procedure?.paymentMethod || procedure?.metodoPagamento || 'PIX'),
              dueDate: procedure?.financeiro?.dueDate || procedure?.vencimento || procedure?.dataRealizacao || procedure?.registeredAt || null,
              installments: procedure?.financeiro?.installments ?? null,
              procedureId,
              patientName: patient.nome || '',
              procedureName: procedure?.tipo || procedure?.nome || procedure?.procedimento || 'Procedimento',
              prontuario: patient.prontuario,
              externalReference: procedureId,
            },
          }).catch(() => null);
          if (canonical) {
            centralInserted += 1;
          }
        }

        if (!canonical) continue;

        const canonicalPaymentStatus = normalizeCentralPaymentStatus(canonical?.paymentStatus || canonical?.status || procedure?.paymentStatus || procedure?.financeiro?.paymentStatus || 'PENDING');
        const canonicalPaymentMethod = normalizeCentralPaymentMethod(canonical?.paymentMethod || canonical?.metodoPagamento || procedure?.paymentMethod || procedure?.financeiro?.paymentMethod || 'PIX');

        await centralBackendAdapter.upsertPatientProcedure({
          clinicId,
          patient: { id: patient.id, prontuario: patient.prontuario, clinicId },
          procedure: {
            ...procedure,
            id: procedureId,
            patientProntuario: patient.prontuario,
            financeiroId: String(canonical?.id || '').trim(),
            paymentStatus: canonicalPaymentStatus,
            paymentMethod: canonicalPaymentMethod,
            paidAt: canonicalPaymentStatus === 'PAID' ? (canonical?.paidAt || procedure?.paidAt || null) : null,
            vencimento: canonical?.dueDate || canonical?.vencimento || procedure?.vencimento || null,
            financeiro: {
              ...(procedure?.financeiro || {}),
              financeEntryId: String(canonical?.id || '').trim(),
              paymentStatus: canonicalPaymentStatus,
              paymentMethod: canonicalPaymentMethod,
              paidAt: canonicalPaymentStatus === 'PAID' ? (canonical?.paidAt || procedure?.paidAt || null) : null,
              dueDate: canonical?.dueDate || canonical?.vencimento || procedure?.vencimento || null,
              installments: canonical?.installments ?? procedure?.financeiro?.installments ?? null,
            },
          },
        }).catch(() => null);
        centralLinked += 1;

        const localPatientRef = patientFileByClinicAndProntuario.get(`${clinicId}::${patient.prontuario}`);
        if (localPatientRef?.patient && Array.isArray(localPatientRef.patient.servicos)) {
          const localService = localPatientRef.patient.servicos.find((item) => String(item?.id || '').trim() === procedureId);
          if (localService) {
            localService.financeiroId = String(canonical?.id || '').trim();
            localService.paymentStatus = canonicalPaymentStatus;
            localService.paymentMethod = canonicalPaymentMethod;
            localService.paidAt = canonicalPaymentStatus === 'PAID' ? (canonical?.paidAt || localService?.paidAt || null) : null;
            localService.vencimento = canonical?.dueDate || canonical?.vencimento || localService?.vencimento || null;
            localService.financeiro = {
              ...(localService.financeiro || {}),
              financeEntryId: String(canonical?.id || '').trim(),
              paymentStatus: canonicalPaymentStatus,
              paymentMethod: canonicalPaymentMethod,
              paidAt: canonicalPaymentStatus === 'PAID' ? (canonical?.paidAt || localService?.paidAt || null) : null,
              dueDate: canonical?.dueDate || canonical?.vencimento || localService?.vencimento || null,
              installments: canonical?.installments ?? localService?.financeiro?.installments ?? null,
            };
            await writeJsonFile(localPatientRef.filePath, localPatientRef.patient);
          }
        }
      }

      if (centralRemoved > 0 || centralInserted > 0 || centralLinked > 0) {
        console.log(`[MIGRATION] Reconciliacao central da clinica ${clinicId}: removidos ${centralRemoved}, inseridos ${centralInserted}, religados ${centralLinked}.`);
      }
    } catch (err) {
      console.warn('[MIGRATION] Falha na reconciliacao financeira central da clinica:', clinicId, err?.message || err);
    }
  }
};

app.on('ready', async () => {
  await Promise.all([
    ensureDir(patientsPath),
    ensureDir(servicesPath),
    ensureDir(campaignsPath),
    ensureDir(campaignsGlobalPath),
    ensureDir(receiptsPath),
    ensureDir(documentsPath),
    ensureDir(agendaPath),
    ensureDir(financePath),
    ensureDir(clinicPath),
    ensureDir(tenantsPath),
    ensureTenantBootstrap(),
    ensureUsersFile(),
  ]);

  await migrateLegacyClinicIds();
  await reconcileOrphanProcedureFinanceEntries();

  try {
    currentUser = await restoreSession();
  } catch (err) {
    currentUser = null;
    console.warn('[AUTH] Falha ao restaurar sessao.', err?.message || err);
  }

  startBirthdaysDailyScheduler({ intervalMinutes: 60 });
  try {
    await runBirthdaysDailyJob({ trigger: 'startup', force: false });
  } catch (err) {
    console.warn('[BIRTHDAYS] Falha ao executar job de aniversario na inicializacao:', err?.message || err);
  }
  // Lembrete D-1 manual nesta etapa de rollout da Z-API.
});

// --- HELPERS ---

// --- HELPERS DE SINCRONIZACAO SERVICO x AGENDA ---

// Constr?i um objeto de agendamento a partir de um servi?o de paciente
function buildAppointmentFromService(patient, service) {
  if (!service.data || !service.horaInicio || !service.horaFim) {
    throw new Error('Servi?o n?o possui data/hora para agendar.');
  }

  const tempo = getDataHoraAtual();

  return {
    id: generateAppointmentId(service),
    data: service.data,             // "YYYY-MM-DD"
    horaInicio: service.horaInicio, // "HH:MM"
    horaFim: service.horaFim,       // "HH:MM"
    paciente: patient.fullName || patient.nome || 'Paciente',
    tipo: service.tipo || service.procedimento || 'Procedimento',
    status: service.status || 'em_aberto',
    prontuario: patient.prontuario,
    serviceId: service.id,
    dataCriacao: tempo.data,
    horaCriacao: tempo.hora,
  };
}

// Cria um agendamento anual a partir de um servi?o (sem mexer nos handlers existentes)
async function createAgendaFromService(patient, service) {
  const appt = buildAppointmentFromService(patient, service);
  const year = String(new Date(`${appt.data}T00:00:00`).getFullYear());
  const list = await readAgendaYear(year);
  list.push(appt);
  await writeAgendaYear(year, list);
  return appt;
}

// --- JANELA PRINCIPAL ---
const createWindow = () => {
  const win = new BrowserWindow({
    title: 'Voithos',
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile('login.html');
  if (!app.isPackaged) {
    win.webContents.openDevTools({ mode: 'detach' });
  }
};

// --- CICLO DE VIDA ---
app.whenReady().then(() => {
  startWhatsAppPendingQueueDrain();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopBirthdaysDailyScheduler();
  stopReminderScheduler();
  stopWhatsAppPendingQueueDrain();
  if (process.platform !== 'darwin') app.quit();
});






