const crypto = require('crypto');
const { prisma } = require('../db/prisma');
const { clinicRepository } = require('../repositories/clinicRepository');
const { pendingSignupRepository } = require('../repositories/pendingSignupRepository');
const { patientRepository } = require('../repositories/patientRepository');
const { patientClinicalRepository } = require('../repositories/patientClinicalRepository');
const { userRepository } = require('../repositories/userRepository');
const { appointmentService } = require('./appointmentService');
const { patientClinicalService } = require('./patientClinicalService');
const { financialService } = require('./financialService');
const { authService } = require('./authService');
const { emailService } = require('./emailService');
const { AppError } = require('../errors/AppError');
const XLSX = require('xlsx');
const JSZip = require('jszip');
const { createExtractorFromData } = require('node-unrar-js');

const isMissingTableError = (error) => error && error.code === 'P2021';
const normalizeDocument = (value) => String(value || '').replace(/\D/g, '');
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizeKey = (value) => normalizeImportKey(value);
const isValidDocumentType = (value) => value === 'CPF' || value === 'CNPJ';
const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
const DEFAULT_BIRTHDAY_TEMPLATE = 'Ola, {nome}! A equipe da {clinicaNome} deseja um feliz aniversario! Conte com a gente para cuidar do seu sorriso.';
const RECEITUARIO_IMAGE_DATA_MAX_LENGTH = 500000;
const normalizeTime = (value, fallback) => {
  const raw = String(value || '').trim();
  return /^\d{2}:\d{2}$/.test(raw) ? raw : fallback;
};
const normalizeWorkDays = (days) => {
  const list = Array.isArray(days) ? days : [];
  return Array.from(
    new Set(
      list
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item >= 0 && item <= 6)
    )
  );
};
const normalizeColor = (value) => {
  const raw = String(value || '').trim();
  const match = raw.match(/^#([0-9a-fA-F]{6})$/);
  return match ? `#${match[1].toUpperCase()}` : '';
};

const generateEmailVerificationCode = () => crypto.randomInt(0, 1000000).toString().padStart(6, '0');

const getEmailVerificationExpiresAt = () => {
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 10);
  return expiresAt;
};

const SIGNUP_EMAIL_VERIFICATION_RESEND_WAIT_MINUTES = 2;
const SIGNUP_EMAIL_VERIFICATION_RESEND_LIMIT = 3;
const SIGNUP_EMAIL_VERIFICATION_BLOCK_MINUTES = 15;

const getEmailVerificationResendAvailableAt = (sendCount = 1) => {
  const resendAt = new Date();
  resendAt.setMinutes(
    resendAt.getMinutes() + (Number(sendCount) >= SIGNUP_EMAIL_VERIFICATION_RESEND_LIMIT
      ? SIGNUP_EMAIL_VERIFICATION_BLOCK_MINUTES
      : SIGNUP_EMAIL_VERIFICATION_RESEND_WAIT_MINUTES)
  );
  return resendAt;
};
const sanitizeMarker = (value = {}) => {
  if (!isPlainObject(value)) return null;
  const id = String(value.id || value.markerId || '').trim();
  const label = String(value.label || value.nome || '').trim();
  const color = normalizeColor(value.color || value.cor);
  if (!label || !color) return null;
  return {
    id: id || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    label,
    color,
  };
};

const normalizeReceituarioFavoriteItem = (value = {}) => {
  if (!isPlainObject(value)) return null;
  const nome = String(value.nome || value.medicamento || '').trim().slice(0, 200);
  const posologia = String(value.posologia || '').trim().slice(0, 500);
  const quantidade = String(value.quantidade || '').trim().slice(0, 120);
  if (!nome && !posologia && !quantidade) return null;
  return { nome, posologia, quantidade };
};

const normalizeReceituario = (value = {}, clinicProfile = {}) => {
  const raw = isPlainObject(value) ? value : {};
  const profile = isPlainObject(clinicProfile) ? clinicProfile : {};
  return {
    cabecalho: String(raw.cabecalho || '').trim().slice(0, 4000),
    rodape: String(raw.rodape || '').trim().slice(0, 4000),
    assinaturaNome: String(raw.assinaturaNome || profile.responsavelTecnico || '').trim().slice(0, 160),
    assinaturaRegistro: String(raw.assinaturaRegistro || profile.cro || '').trim().slice(0, 160),
    assinaturaImagemData: String(raw.assinaturaImagemData || '').trim().slice(0, RECEITUARIO_IMAGE_DATA_MAX_LENGTH),
    textoPadrao: String(raw.textoPadrao || '').trim().slice(0, 4000),
    observacoesPadrao: String(raw.observacoesPadrao || '').trim().slice(0, 3000),
    itensFavoritos: (Array.isArray(raw.itensFavoritos) ? raw.itensFavoritos : [])
      .map((item) => normalizeReceituarioFavoriteItem(item))
      .filter(Boolean),
  };
};

const DEFAULT_PAYMENT_SETTINGS = {
  enabledMethods: {
    pix: true,
    card: true,
    link: true,
    manual: true,
  },
  defaultMethod: 'PIX',
  defaultGateway: 'NONE',
  allowInstallments: true,
  installmentsLimit: 12,
  showPaymentLink: true,
  requirePaymentNote: false,
  updatedAt: '',
};

const VALID_ONBOARDING_PLAN_TYPES = ['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'];
const VALID_ONBOARDING_OPERATION_TYPES = ['AUTONOMOUS_DENTIST', 'CLINIC', 'OTHER'];

const PATIENT_IMPORT_ALIASES = {
  capim: {
    name: ['nome', 'nomepaciente', 'paciente', 'patientname', 'fullname'],
    document: ['cpf', 'documento', 'documentopaciente', 'cnpjcpf', 'cpfcnpj', 'rg'],
    birthDate: ['nascimento', 'datanascimento', 'nasc', 'birthdate', 'datadenascimento'],
    phone: ['telefone', 'celular', 'phone', 'fone', 'contato', 'whatsapp'],
    email: ['email', 'e-mail', 'mail'],
    address: ['endereco', 'endereço', 'logradouro'],
  },
  clinicorp: {
    name: ['nome', 'paciente', 'nomecompleto', 'fullname'],
    document: ['cpf', 'cpfcnpj', 'documento', 'documentoidentificacao', 'rg'],
    birthDate: ['nascimento', 'datanascimento', 'data_nascimento', 'birthdate'],
    phone: ['telefone', 'celular', 'fone', 'contato', 'whatsapp'],
    email: ['email', 'e-mail', 'mail'],
    address: ['endereco', 'endereço', 'logradouro'],
  },
  odontolis: {
    name: ['nome', 'paciente', 'nomepaciente', 'nomedopaciente'],
    document: ['cpf', 'documento', 'numero_documento', 'rg'],
    birthDate: ['nascimento', 'datanascimento', 'data_nasc'],
    phone: ['telefone', 'celular', 'fone'],
    email: ['email', 'e-mail'],
    address: ['endereco', 'endereço'],
  },
  dentaloffice: {
    name: ['nome', 'patient', 'fullname', 'nomepaciente'],
    document: ['cpf', 'document', 'id_document', 'rg'],
    birthDate: ['birthdate', 'nascimento', 'dob'],
    phone: ['phone', 'telefone', 'mobile', 'celular'],
    email: ['email', 'e-mail'],
    address: ['address', 'endereco', 'endereço'],
  },
  outro: {
    name: ['nome', 'paciente', 'name', 'fullname'],
    document: ['cpf', 'documento', 'document', 'id', 'rg'],
    birthDate: ['nascimento', 'birthdate', 'data_nascimento', 'dob'],
    phone: ['telefone', 'phone', 'celular', 'contato'],
    email: ['email', 'mail'],
    address: ['endereco', 'endereço', 'address'],
  },
};

const getDefaultOperationalSettings = () => ({
  agendaSettings: {
    timezone: 'America/Sao_Paulo',
    markers: [],
    updatedAt: '',
  },
  agendaAvailability: {
    workDays: [1, 2, 3, 4, 5],
    startTime: '08:00',
    endTime: '18:00',
    slotMinutes: 30,
    breakStart: '12:00',
    breakEnd: '13:00',
    allowOverbooking: false,
    updatedAt: '',
  },
  notificationPreferences: {
    channels: {
      email: true,
      whatsapp: false,
      sms: false,
      inapp: true,
    },
    reminderHours: 24,
    daySummary: false,
    summaryTime: '18:00',
    updatedAt: '',
  },
  birthdayMessaging: {
    enabled: false,
    draftMode: true,
    sendTime: '09:00',
    dailyLimit: 200,
    throttleMs: 1000,
    template: DEFAULT_BIRTHDAY_TEMPLATE,
    lastRunDate: '',
    updatedAt: '',
  },
  paymentSettings: DEFAULT_PAYMENT_SETTINGS,
  onboarding: {
    selectedPlan: '',
    operationType: '',
    startedAt: '',
    updatedAt: '',
    completedAt: '',
  },
  clinicProfile: {
    whatsapp: '',
    cro: '',
    responsavelTecnico: '',
    logoDataUrlCache: '',
    logoVersion: '',
    endereco: {
      rua: '',
      numero: '',
      complemento: '',
      bairro: '',
      cidade: '',
      uf: '',
      cep: '',
    },
  },
  campaigns: [],
  anamneseModels: [],
  documentModels: [],
  proceduresCatalog: [],
  receituario: normalizeReceituario({}),
});

const normalizeAgendaSettings = (value = {}) => {
  const raw = isPlainObject(value) ? value : {};
  const defaults = getDefaultOperationalSettings().agendaSettings;
  return {
    ...defaults,
    timezone: String(raw.timezone || defaults.timezone).trim() || defaults.timezone,
    markers: (Array.isArray(raw.markers) ? raw.markers : [])
      .map((item) => sanitizeMarker(item))
      .filter(Boolean),
    updatedAt: String(raw.updatedAt || '').trim(),
  };
};

const getDefaultClinicProfile = (clinicId = '') => ({
  clinicId: String(clinicId || '').trim(),
  nomeFantasia: '',
  razaoSocial: '',
  cnpj: '',
  endereco: {
    rua: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    uf: '',
    cep: '',
  },
  telefone: '',
  whatsapp: '',
  email: '',
  cro: '',
  responsavelTecnico: '',
  logoPath: '',
  logoVersion: '',
  logoDataUrlCache: '',
  isIncomplete: true,
});

const normalizeClinicProfileExtras = (value = {}) => {
  const raw = isPlainObject(value) ? value : {};
  const address = isPlainObject(raw.endereco) ? raw.endereco : {};
  return {
    whatsapp: String(raw.whatsapp || '').trim(),
    cro: String(raw.cro || '').trim(),
    responsavelTecnico: String(raw.responsavelTecnico || '').trim(),
    logoDataUrlCache: String(raw.logoDataUrlCache || raw.logoData || '').trim().slice(0, RECEITUARIO_IMAGE_DATA_MAX_LENGTH),
    logoVersion: String(raw.logoVersion || '').trim().slice(0, 80),
    endereco: {
      rua: String(address.rua || '').trim(),
      numero: String(address.numero || '').trim(),
      complemento: String(address.complemento || '').trim(),
      bairro: String(address.bairro || '').trim(),
      cidade: String(address.cidade || '').trim(),
      uf: String(address.uf || address.estado || '').trim(),
      cep: String(address.cep || '').trim(),
    },
  };
};

const normalizeClinicProfile = (clinic = {}) => {
  const base = getDefaultClinicProfile(clinic?.id || clinic?.clinicId || '');
  const operationalSettings = normalizeOperationalSettings(clinic?.operationalSettings || {});
  const extras = normalizeClinicProfileExtras(operationalSettings?.clinicProfile || {});
  const nomeFantasia = String(clinic?.nomeFantasia || '').trim();
  const razaoSocial = String(clinic?.razaoSocial || '').trim();
  const cnpj = String(clinic?.cnpjCpf || '').trim();
  const email = String(clinic?.email || '').trim();
  const telefone = String(clinic?.telefoneComercial || '').trim();
  const enderecoTexto = String(clinic?.endereco || '').trim();
  const structuredAddress = {
    ...extras.endereco,
    rua: extras.endereco.rua || enderecoTexto,
  };
  const profile = {
    ...base,
    clinicId: String(clinic?.id || clinic?.clinicId || '').trim(),
    nomeFantasia,
    razaoSocial,
    nomeClinica: nomeFantasia || razaoSocial,
    cnpj,
    cnpjCpf: cnpj,
    cnpjOuCpf: cnpj,
    email,
    emailClinica: email,
    telefone,
    telefoneComercial: telefone,
    whatsapp: extras.whatsapp,
    cro: extras.cro,
    responsavelTecnico: extras.responsavelTecnico,
    logoVersion: extras.logoVersion,
    logoDataUrlCache: extras.logoDataUrlCache,
    logoData: extras.logoDataUrlCache,
    endereco: structuredAddress,
    rua: structuredAddress.rua,
    numero: structuredAddress.numero,
    complemento: structuredAddress.complemento,
    bairro: structuredAddress.bairro,
    cidade: structuredAddress.cidade,
    estado: structuredAddress.uf,
    uf: structuredAddress.uf,
    cep: structuredAddress.cep,
    isIncomplete: !(Boolean(nomeFantasia || razaoSocial) && Boolean(cnpj)),
  };
  return profile;
};

const generateCampaignId = () =>
  `camp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeCampaignRecord = (campaign = {}, clinicId = '', overrides = {}) => {
  const raw = isPlainObject(campaign) ? { ...campaign } : {};
  if (!raw.nome && raw.titulo) raw.nome = raw.titulo;
  const normalizedClinicId = String(overrides.clinicId || raw.clinicId || clinicId || '').trim();
  const origem = String(overrides.origem || raw.origem || 'clinica').trim() || 'clinica';
  const rawStatus = String(raw.status || overrides.status || '').trim().toLowerCase();
  const status = ['rascunho', 'ativa', 'agendada', 'pausada', 'concluida', 'inativa'].includes(rawStatus)
    ? rawStatus
    : 'ativa';
  return {
    ...raw,
    ...overrides,
    clinicId: normalizedClinicId,
    id: String(raw.id || overrides.id || '').trim(),
    nome: String(raw.nome || 'Campanha').trim() || 'Campanha',
    periodo: String(raw.periodo || '').trim(),
    cor: normalizeColor(raw.cor) || '#2A9D8F',
    descricao: String(raw.descricao || '').trim(),
    status,
    origem,
    somenteLeitura: origem === 'voithos',
    publico: String(raw.publico || 'pacientes_clinica').trim() || 'pacientes_clinica',
    publicoLabel: String(raw.publicoLabel || 'Pacientes da clinica').trim() || 'Pacientes da clinica',
    criadoPor: String(raw.criadoPor || '').trim(),
    dataCriacao: String(raw.dataCriacao || '').trim(),
    dataAtualizacao: String(raw.dataAtualizacao || '').trim(),
    inicio: String(raw.inicio || '').trim(),
    fim: String(raw.fim || '').trim(),
    canal: String(raw.canal || '').trim(),
    segmentKey: String(raw.segmentKey || '').trim(),
  };
};

const normalizeClinicCampaigns = (value = [], clinicId = '') => {
  const normalizedClinicId = String(clinicId || '').trim();
  const list = Array.isArray(value) ? value : [];
  return list
    .map((item) => normalizeCampaignRecord(item, normalizedClinicId, { origem: 'clinica' }))
    .filter((item) => item.id)
    .filter((item) => !normalizedClinicId || item.clinicId === normalizedClinicId);
};

const buildClinicAddressLine = (address = {}) => {
  const safe = isPlainObject(address) ? address : {};
  const line1 = [safe.rua, safe.numero].filter(Boolean).join(', ');
  const line2 = [safe.complemento, safe.bairro, safe.cidade, safe.uf].filter(Boolean).join(' - ');
  const line3 = String(safe.cep || '').trim();
  return [line1, line2, line3].filter(Boolean).join(' | ');
};

const normalizeAgendaAvailability = (value = {}) => {
  const raw = isPlainObject(value) ? value : {};
  const defaults = getDefaultOperationalSettings().agendaAvailability;
  const hasWorkDays = Object.prototype.hasOwnProperty.call(raw, 'workDays');
  return {
    ...defaults,
    workDays: hasWorkDays ? normalizeWorkDays(raw.workDays) : defaults.workDays,
    startTime: normalizeTime(raw.startTime, defaults.startTime),
    endTime: normalizeTime(raw.endTime, defaults.endTime),
    slotMinutes: Math.max(5, Number(raw.slotMinutes) || defaults.slotMinutes),
    breakStart: normalizeTime(raw.breakStart, defaults.breakStart),
    breakEnd: normalizeTime(raw.breakEnd, defaults.breakEnd),
    allowOverbooking: !!raw.allowOverbooking,
    updatedAt: String(raw.updatedAt || '').trim(),
  };
};

const normalizeNotificationPreferences = (value = {}) => {
  const raw = isPlainObject(value) ? value : {};
  const defaults = getDefaultOperationalSettings().notificationPreferences;
  const channels = isPlainObject(raw.channels) ? raw.channels : {};
  const defaultChannels = defaults.channels;
  return {
    ...defaults,
    channels: {
      email: Object.prototype.hasOwnProperty.call(channels, 'email') ? !!channels.email : defaultChannels.email,
      whatsapp: Object.prototype.hasOwnProperty.call(channels, 'whatsapp') ? !!channels.whatsapp : defaultChannels.whatsapp,
      sms: Object.prototype.hasOwnProperty.call(channels, 'sms') ? !!channels.sms : defaultChannels.sms,
      inapp: Object.prototype.hasOwnProperty.call(channels, 'inapp') ? channels.inapp !== false : defaultChannels.inapp,
    },
    reminderHours: Math.max(1, Number(raw.reminderHours) || defaults.reminderHours),
    daySummary: !!raw.daySummary,
    summaryTime: normalizeTime(raw.summaryTime, defaults.summaryTime),
    updatedAt: String(raw.updatedAt || '').trim(),
  };
};

const normalizeBirthdayMessaging = (value = {}) => {
  const raw = isPlainObject(value) ? value : {};
  const defaults = getDefaultOperationalSettings().birthdayMessaging;
  return {
    ...defaults,
    enabled: Object.prototype.hasOwnProperty.call(raw, 'enabled') ? raw.enabled !== false : defaults.enabled,
    draftMode: Object.prototype.hasOwnProperty.call(raw, 'draftMode') ? raw.draftMode !== false : defaults.draftMode,
    sendTime: normalizeTime(raw.sendTime, defaults.sendTime),
    dailyLimit: Math.max(1, Math.min(1000, Number(raw.dailyLimit) || defaults.dailyLimit)),
    throttleMs: Math.max(0, Math.min(60000, Number(raw.throttleMs) || defaults.throttleMs)),
    template: String(raw.template || defaults.template).trim().slice(0, 2000) || defaults.template,
    lastRunDate: String(raw.lastRunDate || '').trim().slice(0, 20),
    updatedAt: String(raw.updatedAt || '').trim(),
  };
};

const normalizePaymentSettings = (value = {}) => {
  const raw = isPlainObject(value) ? value : {};
  const defaults = getDefaultOperationalSettings().paymentSettings;
  const enabledMethods = isPlainObject(raw.enabledMethods) ? raw.enabledMethods : {};
  const validMethods = ['PIX', 'CARD', 'LINK', 'MANUAL'];
  const validGateways = ['NONE', 'ASAAS', 'STRIPE', 'MANUAL'];
  const defaultMethod = String(raw.defaultMethod || defaults.defaultMethod).trim().toUpperCase();
  const defaultGateway = String(raw.defaultGateway || defaults.defaultGateway).trim().toUpperCase();

  return {
    ...defaults,
    enabledMethods: {
      pix: Object.prototype.hasOwnProperty.call(enabledMethods, 'pix') ? !!enabledMethods.pix : defaults.enabledMethods.pix,
      card: Object.prototype.hasOwnProperty.call(enabledMethods, 'card') ? !!enabledMethods.card : defaults.enabledMethods.card,
      link: Object.prototype.hasOwnProperty.call(enabledMethods, 'link') ? !!enabledMethods.link : defaults.enabledMethods.link,
      manual: Object.prototype.hasOwnProperty.call(enabledMethods, 'manual') ? !!enabledMethods.manual : defaults.enabledMethods.manual,
    },
    defaultMethod: validMethods.includes(defaultMethod) ? defaultMethod : defaults.defaultMethod,
    defaultGateway: validGateways.includes(defaultGateway) ? defaultGateway : defaults.defaultGateway,
    allowInstallments: Object.prototype.hasOwnProperty.call(raw, 'allowInstallments') ? raw.allowInstallments !== false : defaults.allowInstallments,
    installmentsLimit: Math.max(1, Math.min(24, Number(raw.installmentsLimit) || defaults.installmentsLimit)),
    showPaymentLink: Object.prototype.hasOwnProperty.call(raw, 'showPaymentLink') ? raw.showPaymentLink !== false : defaults.showPaymentLink,
    requirePaymentNote: Object.prototype.hasOwnProperty.call(raw, 'requirePaymentNote') ? raw.requirePaymentNote === true : defaults.requirePaymentNote,
    updatedAt: String(raw.updatedAt || '').trim(),
  };
};

const normalizeOnboardingPlan = (value) => {
  const raw = String(value || '').trim().toUpperCase();
  const aliases = {
    MENSAL: 'MONTHLY',
    MONTHLY: 'MONTHLY',
    TRIMESTRAL: 'QUARTERLY',
    QUARTERLY: 'QUARTERLY',
    SEMESTRAL: 'SEMIANNUAL',
    SEMIANNUAL: 'SEMIANNUAL',
    ANUAL: 'ANNUAL',
    ANNUAL: 'ANNUAL',
  };
  return aliases[raw] || '';
};

const normalizeOnboardingOperationType = (value) => {
  const raw = String(value || '').trim().toUpperCase();
  if (raw === 'DENTIST' || raw === 'AUTONOMOUS' || raw === 'AUTONOMOUS_DENTIST') return 'AUTONOMOUS_DENTIST';
  if (raw === 'CLINIC') return 'CLINIC';
  if (raw === 'OTHER' || raw === 'OUTRO') return 'OTHER';
  return '';
};

const normalizeOnboardingState = (value = {}) => {
  const raw = isPlainObject(value) ? value : {};
  const defaults = getDefaultOperationalSettings().onboarding;
  return {
    ...defaults,
    selectedPlan: normalizeOnboardingPlan(raw.selectedPlan || raw.planType),
    operationType: normalizeOnboardingOperationType(raw.operationType || raw.businessType),
    startedAt: String(raw.startedAt || '').trim().slice(0, 40),
    updatedAt: String(raw.updatedAt || '').trim().slice(0, 40),
    completedAt: String(raw.completedAt || '').trim().slice(0, 40),
  };
};

const normalizeIsoDate = (value) => {
  if (!value) return '';
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
};

const getStartOfDay = (referenceDate = new Date()) => {
  const date = new Date(referenceDate);
  date.setHours(0, 0, 0, 0);
  return date;
};

const getStartOfDaysAgo = (daysAgo = 0, referenceDate = new Date()) => {
  const date = getStartOfDay(referenceDate);
  date.setDate(date.getDate() - Math.max(0, Number(daysAgo) || 0));
  return date;
};

const isDateOnOrAfter = (value, boundary) => {
  const parsed = value instanceof Date ? value : new Date(value);
  const boundaryDate = boundary instanceof Date ? boundary : new Date(boundary);
  if (Number.isNaN(parsed.getTime()) || Number.isNaN(boundaryDate.getTime())) return false;
  return parsed.getTime() >= boundaryDate.getTime();
};

const deriveAdminEntry = (users = []) => {
  const list = Array.isArray(users) ? users : [];
  const admin = list.find((user) => user?.isClinicAdmin === true) || list[0] || null;
  return {
    adminEmail: normalizeEmail(admin?.email || ''),
    adminName: String(admin?.nome || '').trim(),
  };
};

const deriveSubscriptionEffectiveStatusForDashboard = (subscription) => {
  if (!subscription) return 'NO_SUBSCRIPTION';
  const currentStatus = String(subscription.status || '').trim().toUpperCase();
  if (currentStatus === 'CANCELED') return 'CANCELED';
  if (currentStatus === 'PENDING_PAYMENT') {
    const lastPaymentStatus = String(subscription.lastPayment?.status || '').trim().toUpperCase();
    if (!subscription.endDate || !subscription.graceUntil || lastPaymentStatus === 'PENDING') {
      return 'PENDING_PAYMENT';
    }
  }

  const nowTime = Date.now();
  const endTime = subscription.endDate ? new Date(subscription.endDate).getTime() : 0;
  const graceTime = subscription.graceUntil ? new Date(subscription.graceUntil).getTime() : 0;

  if (currentStatus === 'ACTIVE' && !endTime && !graceTime) return 'ACTIVE';
  if (!endTime || !graceTime) return currentStatus || 'PENDING_PAYMENT';
  if (nowTime <= endTime) return 'ACTIVE';
  if (nowTime <= graceTime) return 'GRACE_PERIOD';
  return 'BLOCKED';
};

const deriveOnboardingStage = ({ onboardingState, subscription }) => {
  const selectedPlan = normalizeOnboardingPlan(onboardingState?.selectedPlan);
  const operationType = normalizeOnboardingOperationType(onboardingState?.operationType);
  const effectiveSubscriptionStatus = deriveSubscriptionEffectiveStatusForDashboard(subscription);

  if (!selectedPlan) {
    return {
      stage: 'NO_ONBOARDING',
      label: 'Sem onboarding comercial',
      selectedPlan: '',
      operationType,
      effectiveSubscriptionStatus,
    };
  }

  if (!operationType) {
    return {
      stage: 'PROFILE_PENDING',
      label: 'Aguardando perfil operacional',
      selectedPlan,
      operationType: '',
      effectiveSubscriptionStatus,
    };
  }

  if (!subscription || ['NO_SUBSCRIPTION', 'PENDING_PAYMENT'].includes(effectiveSubscriptionStatus)) {
    return {
      stage: 'PAYMENT_PENDING',
      label: 'Aguardando pagamento',
      selectedPlan,
      operationType,
      effectiveSubscriptionStatus,
    };
  }

  if (effectiveSubscriptionStatus === 'GRACE_PERIOD') {
    return {
      stage: 'GRACE_PERIOD',
      label: 'Assinatura em tolerancia',
      selectedPlan,
      operationType,
      effectiveSubscriptionStatus,
    };
  }

  if (effectiveSubscriptionStatus === 'BLOCKED') {
    return {
      stage: 'BLOCKED',
      label: 'Assinatura bloqueada',
      selectedPlan,
      operationType,
      effectiveSubscriptionStatus,
    };
  }

  if (effectiveSubscriptionStatus === 'CANCELED') {
    return {
      stage: 'CANCELED',
      label: 'Assinatura cancelada',
      selectedPlan,
      operationType,
      effectiveSubscriptionStatus,
    };
  }

  return {
    stage: 'ACTIVE',
    label: 'Onboarding concluido',
    selectedPlan,
    operationType,
    effectiveSubscriptionStatus,
  };
};

const normalizeOperationalSettings = (value = {}) => {
  const raw = isPlainObject(value) ? value : {};
  const clinicProfile = normalizeClinicProfileExtras(raw.clinicProfile);
  return {
    agendaSettings: normalizeAgendaSettings(raw.agendaSettings),
    agendaAvailability: normalizeAgendaAvailability(raw.agendaAvailability),
    notificationPreferences: normalizeNotificationPreferences(
      raw.notificationPreferences || raw.notifications
    ),
    birthdayMessaging: normalizeBirthdayMessaging(raw.birthdayMessaging),
    paymentSettings: normalizePaymentSettings(raw.paymentSettings),
    onboarding: normalizeOnboardingState(raw.onboarding),
    clinicProfile,
    campaigns: normalizeClinicCampaigns(raw.campaigns),
    anamneseModels: Array.isArray(raw.anamneseModels) ? raw.anamneseModels : [],
    documentModels: Array.isArray(raw.documentModels) ? raw.documentModels : [],
    proceduresCatalog: Array.isArray(raw.proceduresCatalog) ? raw.proceduresCatalog : [],
    receituario: normalizeReceituario(raw.receituario, clinicProfile),
  };
};

const mergeOperationalSettings = (current = {}, patch = {}) => {
  const safeCurrent = normalizeOperationalSettings(current);
  const safePatch = isPlainObject(patch) ? patch : {};
  const nextClinicProfile = Object.prototype.hasOwnProperty.call(safePatch, 'clinicProfile')
    ? normalizeClinicProfileExtras({
        ...(isPlainObject(safeCurrent.clinicProfile) ? safeCurrent.clinicProfile : {}),
        ...(isPlainObject(safePatch.clinicProfile) ? safePatch.clinicProfile : {}),
        endereco: {
          ...(isPlainObject(safeCurrent.clinicProfile?.endereco) ? safeCurrent.clinicProfile.endereco : {}),
          ...(isPlainObject(safePatch.clinicProfile?.endereco) ? safePatch.clinicProfile.endereco : {}),
        },
      })
    : normalizeClinicProfileExtras(safeCurrent.clinicProfile);
  return normalizeOperationalSettings({
    agendaSettings: Object.prototype.hasOwnProperty.call(safePatch, 'agendaSettings')
      ? { ...safeCurrent.agendaSettings, ...(isPlainObject(safePatch.agendaSettings) ? safePatch.agendaSettings : {}) }
      : safeCurrent.agendaSettings,
    agendaAvailability: Object.prototype.hasOwnProperty.call(safePatch, 'agendaAvailability')
      ? { ...safeCurrent.agendaAvailability, ...(isPlainObject(safePatch.agendaAvailability) ? safePatch.agendaAvailability : {}) }
      : safeCurrent.agendaAvailability,
    notificationPreferences: Object.prototype.hasOwnProperty.call(safePatch, 'notificationPreferences')
      ? {
          ...safeCurrent.notificationPreferences,
          ...(isPlainObject(safePatch.notificationPreferences) ? safePatch.notificationPreferences : {}),
          channels: {
            ...safeCurrent.notificationPreferences.channels,
            ...(isPlainObject(safePatch.notificationPreferences?.channels) ? safePatch.notificationPreferences.channels : {}),
          },
        }
      : safeCurrent.notificationPreferences,
    birthdayMessaging: Object.prototype.hasOwnProperty.call(safePatch, 'birthdayMessaging')
      ? normalizeBirthdayMessaging({
          ...safeCurrent.birthdayMessaging,
          ...(isPlainObject(safePatch.birthdayMessaging) ? safePatch.birthdayMessaging : {}),
        })
      : safeCurrent.birthdayMessaging,
    paymentSettings: Object.prototype.hasOwnProperty.call(safePatch, 'paymentSettings')
      ? normalizePaymentSettings({
          ...safeCurrent.paymentSettings,
          ...(isPlainObject(safePatch.paymentSettings) ? safePatch.paymentSettings : {}),
          enabledMethods: {
            ...safeCurrent.paymentSettings.enabledMethods,
            ...(isPlainObject(safePatch.paymentSettings?.enabledMethods) ? safePatch.paymentSettings.enabledMethods : {}),
          },
        })
      : safeCurrent.paymentSettings,
    onboarding: Object.prototype.hasOwnProperty.call(safePatch, 'onboarding')
      ? normalizeOnboardingState({
          ...safeCurrent.onboarding,
          ...(isPlainObject(safePatch.onboarding) ? safePatch.onboarding : {}),
        })
      : safeCurrent.onboarding,
    clinicProfile: nextClinicProfile,
    campaigns: Object.prototype.hasOwnProperty.call(safePatch, 'campaigns')
      ? normalizeClinicCampaigns(safePatch.campaigns)
      : normalizeClinicCampaigns(safeCurrent.campaigns),
    anamneseModels: Object.prototype.hasOwnProperty.call(safePatch, 'anamneseModels')
      ? (Array.isArray(safePatch.anamneseModels) ? safePatch.anamneseModels : safeCurrent.anamneseModels)
      : (Array.isArray(safeCurrent.anamneseModels) ? safeCurrent.anamneseModels : []),
    documentModels: Object.prototype.hasOwnProperty.call(safePatch, 'documentModels')
      ? (Array.isArray(safePatch.documentModels) ? safePatch.documentModels : safeCurrent.documentModels)
      : (Array.isArray(safeCurrent.documentModels) ? safeCurrent.documentModels : []),
    proceduresCatalog: Object.prototype.hasOwnProperty.call(safePatch, 'proceduresCatalog')
      ? (Array.isArray(safePatch.proceduresCatalog) ? safePatch.proceduresCatalog : safeCurrent.proceduresCatalog)
      : (Array.isArray(safeCurrent.proceduresCatalog) ? safeCurrent.proceduresCatalog : []),
    receituario: Object.prototype.hasOwnProperty.call(safePatch, 'receituario')
      ? normalizeReceituario({
          ...(isPlainObject(safeCurrent.receituario) ? safeCurrent.receituario : {}),
          ...(isPlainObject(safePatch.receituario) ? safePatch.receituario : {}),
        }, nextClinicProfile)
      : normalizeReceituario(safeCurrent.receituario, nextClinicProfile),
  });
};

const pickNonEmptyString = (value, maxLength = 4000) => {
  const raw = String(value || '').trim();
  return raw ? raw.slice(0, maxLength) : undefined;
};

const normalizeImportAddress = (value = {}) => {
  const raw = isPlainObject(value) ? value : {};
  const endereco = {
    rua: pickNonEmptyString(raw.rua || raw.logradouro || raw.endereco, 200),
    numero: pickNonEmptyString(raw.numero || raw.number, 40),
    complemento: pickNonEmptyString(raw.complemento || raw.complement, 160),
    bairro: pickNonEmptyString(raw.bairro || raw.district, 160),
    cidade: pickNonEmptyString(raw.cidade || raw.city, 160),
    uf: pickNonEmptyString(raw.uf || raw.estado || raw.state, 2),
    cep: pickNonEmptyString(raw.cep || raw.zipCode, 20),
  };
  return Object.fromEntries(Object.entries(endereco).filter(([, item]) => item !== undefined));
};

const extractClinicImportPayload = (payload = {}) => {
  const source = isPlainObject(payload?.clinic)
    ? payload.clinic
    : (isPlainObject(payload?.clinica) ? payload.clinica : payload);
  const sourceAddress = isPlainObject(source?.endereco)
    ? source.endereco
    : {
        rua: source?.rua || source?.logradouro || source?.endereco,
        numero: source?.numero,
        complemento: source?.complemento,
        bairro: source?.bairro,
        cidade: source?.cidade,
        uf: source?.uf || source?.estado,
        cep: source?.cep,
      };
  const profile = {
    nomeFantasia: pickNonEmptyString(source?.nomeFantasia || source?.nomeClinica || source?.name, 160),
    razaoSocial: pickNonEmptyString(source?.razaoSocial || source?.legalName, 160),
    cnpjCpf: pickNonEmptyString(source?.cnpjCpf || source?.cnpjOuCpf || source?.cnpj || source?.cpfCnpj, 32),
    telefone: pickNonEmptyString(source?.telefone || source?.telefoneComercial || source?.phone, 40),
    email: pickNonEmptyString(source?.email || source?.emailClinica, 160),
    cro: pickNonEmptyString(source?.cro, 80),
    responsavelTecnico: pickNonEmptyString(source?.responsavelTecnico || source?.responsibleName, 160),
    whatsapp: pickNonEmptyString(source?.whatsapp, 40),
    logoDataUrlCache: pickNonEmptyString(source?.logoDataUrlCache || source?.logoData, RECEITUARIO_IMAGE_DATA_MAX_LENGTH),
    logoVersion: pickNonEmptyString(source?.logoVersion, 80),
    endereco: normalizeImportAddress(sourceAddress),
  };
  Object.keys(profile).forEach((key) => {
    if (profile[key] === undefined || (isPlainObject(profile[key]) && !Object.keys(profile[key]).length)) {
      delete profile[key];
    }
  });

  const sourceSettings = isPlainObject(payload?.operationalSettings)
    ? payload.operationalSettings
    : (isPlainObject(payload?.settings) ? payload.settings : {});
  const settings = {};
  [
    'agendaSettings',
    'agendaAvailability',
    'notificationPreferences',
    'birthdayMessaging',
    'clinicProfile',
    'anamneseModels',
    'documentModels',
    'proceduresCatalog',
    'receituario',
  ].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(sourceSettings, key)) {
      settings[key] = sourceSettings[key];
    }
  });

  return { profile, settings };
};

const buildClinicImportPreview = (payload = {}) => {
  if (!isPlainObject(payload)) {
    throw new AppError(400, 'INVALID_IMPORT_FILE', 'Arquivo de importacao deve ser JSON valido.');
  }
  const { profile, settings } = extractClinicImportPayload(payload);
  const profileFields = Object.keys(profile).filter((key) => key !== 'endereco');
  const addressFields = Object.keys(profile.endereco || {});
  const settingsSections = Object.keys(settings);
  if (!profileFields.length && !addressFields.length && !settingsSections.length) {
    throw new AppError(400, 'INVALID_IMPORT_FILE', 'Arquivo sem dados reconhecidos para importar.');
  }
  return {
    valid: true,
    format: String(payload?.format || payload?.source || 'json').trim().slice(0, 80) || 'json',
    profileFields,
    addressFields,
    settingsSections,
    summary: {
      profileFields: profileFields.length,
      addressFields: addressFields.length,
      settingsSections: settingsSections.length,
    },
  };
};

const normalizeImportKey = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const MAX_IMPORT_FILE_BYTES = 25 * 1024 * 1024;
const SUPPORTED_IMPORT_FILE_EXTENSIONS = new Set(['csv', 'json', 'xlsx', 'xls', 'zip', 'rar', 'txt']);

const getImportFileExtension = (fileName = '') => {
  const parts = String(fileName || '').split('.');
  return String(parts.length > 1 ? parts.pop() : '').trim().toLowerCase();
};

const normalizeImportFileBase64 = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const commaIndex = raw.indexOf(',');
  return commaIndex >= 0 ? raw.slice(commaIndex + 1) : raw;
};

const bufferFromImportFileData = (value = '') => {
  const base64 = normalizeImportFileBase64(value);
  if (!base64) return Buffer.alloc(0);
  return Buffer.from(base64, 'base64');
};

const detectImportSeparator = (text = '') => {
  const sample = String(text || '');
  const candidates = [';', '\t', ',', '|'];
  let winner = ',';
  let bestScore = -1;
  candidates.forEach((candidate) => {
    const score = (sample.match(new RegExp(`\\${candidate}`, 'g')) || []).length;
    if (score > bestScore) {
      bestScore = score;
      winner = candidate;
    }
  });
  return winner;
};

const splitImportCsvLine = (line, separator) => {
  const out = [];
  let current = '';
  let quoted = false;
  const raw = String(line || '');
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    const next = raw[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === separator && !quoted) {
      out.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  out.push(current.trim());
  return out;
};

const parseDelimitedImportText = (text = '') => {
  const clean = String(text || '').replace(/^\uFEFF/, '').trim();
  if (!clean) return { rows: [], headers: [] };
  const separator = detectImportSeparator(clean);
  const lines = clean.split(/\r?\n/).filter(Boolean);
  const headers = splitImportCsvLine(lines.shift() || '', separator).map((value) => String(value || '').trim());
  const rows = lines.map((line) => {
    const cells = splitImportCsvLine(line, separator);
    const record = {};
    headers.forEach((header, index) => {
      record[header || `col_${index}`] = cells[index] || '';
    });
    return record;
  });
  return { rows, headers };
};

const parseJsonImportText = (text = '') => {
  const parsed = JSON.parse(String(text || ''));
  if (Array.isArray(parsed)) {
    return { rows: parsed, headers: parsed[0] ? Object.keys(parsed[0]) : [] };
  }
  if (parsed && typeof parsed === 'object') {
    const source = parsed.rows || parsed.items || parsed.records || parsed.data || parsed.patients || parsed.appointments || parsed.clinicalRecords || parsed.procedures || parsed.cashflow || [];
    if (Array.isArray(source)) {
      return { rows: source, headers: source[0] ? Object.keys(source[0]) : [] };
    }
    return { rows: [parsed], headers: Object.keys(parsed) };
  }
  return { rows: [], headers: [] };
};

const parseWorkbookImportBuffer = (buffer) => {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames && workbook.SheetNames[0];
  if (!sheetName) return { rows: [], headers: [] };
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) return { rows: [], headers: [] };
  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });
  return {
    rows,
    headers: rows[0] ? Object.keys(rows[0]) : [],
  };
};

const parseImportFileBuffer = async (buffer, fileName = '') => {
  const extension = getImportFileExtension(fileName);
  if (!SUPPORTED_IMPORT_FILE_EXTENSIONS.has(extension)) {
    return { rows: [], headers: [], fileType: extension };
  }

  if (buffer.byteLength > MAX_IMPORT_FILE_BYTES) {
    throw new AppError(400, 'INVALID_IMPORT_FILE', 'Arquivo excede o tamanho maximo permitido.');
  }

  if (extension === 'csv' || extension === 'txt') {
    return {
      ...parseDelimitedImportText(buffer.toString('utf8')),
      fileType: extension,
    };
  }

  if (extension === 'json') {
    return {
      ...parseJsonImportText(buffer.toString('utf8')),
      fileType: extension,
    };
  }

  if (extension === 'xlsx' || extension === 'xls') {
    return {
      ...parseWorkbookImportBuffer(buffer),
      fileType: extension,
    };
  }

  if (extension === 'zip') {
    const archive = await JSZip.loadAsync(buffer);
    const rows = [];
    let headers = [];
    const entries = [];
    archive.forEach((relativePath, file) => {
      if (!file || file.dir) return;
      entries.push({ relativePath, file });
    });

    for (const entry of entries) {
      const innerExt = getImportFileExtension(entry.relativePath);
      if (!SUPPORTED_IMPORT_FILE_EXTENSIONS.has(innerExt) || innerExt === 'zip' || innerExt === 'rar') {
        continue;
      }
      const innerBuffer = await entry.file.async('nodebuffer');
      const parsed = await parseImportFileBuffer(innerBuffer, entry.relativePath);
      if (Array.isArray(parsed.rows) && parsed.rows.length) rows.push(...parsed.rows);
      if (!headers.length && Array.isArray(parsed.headers)) headers = parsed.headers;
    }

    return { rows, headers, fileType: extension };
  }

  if (extension === 'rar') {
    const archive = await createExtractorFromData({
      data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    });
    const extracted = archive.extract({
      files: (fileHeader) => !fileHeader?.flags?.directory,
    });
    const rows = [];
    let headers = [];
    for (const entry of extracted.files) {
      if (!entry || !entry.fileHeader || entry.fileHeader.flags.directory || !entry.extraction) continue;
      const innerExt = getImportFileExtension(entry.fileHeader.name);
      if (!SUPPORTED_IMPORT_FILE_EXTENSIONS.has(innerExt) || innerExt === 'zip' || innerExt === 'rar') {
        continue;
      }
      const innerBuffer = Buffer.from(entry.extraction);
      const parsed = await parseImportFileBuffer(innerBuffer, entry.fileHeader.name);
      if (Array.isArray(parsed.rows) && parsed.rows.length) rows.push(...parsed.rows);
      if (!headers.length && Array.isArray(parsed.headers)) headers = parsed.headers;
    }
    return { rows, headers, fileType: extension };
  }

  return { rows: [], headers: [], fileType: extension };
};

const resolveUploadedImportRows = async (payload = {}) => {
  const source = String(payload?.source || payload?.origem || 'outro').trim().toLowerCase();
  const fileObject = isPlainObject(payload?.file) ? payload.file : null;
  const fileData = String(payload?.fileData || payload?.fileContent || payload?.content || '').trim();
  const fileName = String(payload?.fileName || payload?.name || fileObject?.originalname || '').trim();
  if (!fileData && !(fileObject && fileObject.buffer) && !fileName) {
    return { source, rows: [], headers: [], fileType: '' };
  }
  const buffer = fileObject && fileObject.buffer
    ? Buffer.isBuffer(fileObject.buffer) ? fileObject.buffer : Buffer.from(fileObject.buffer)
    : bufferFromImportFileData(fileData);
  return {
    source,
    ...(await parseImportFileBuffer(buffer, fileName)),
  };
};

const hasUploadedImportFile = (payload = {}) => {
  const fileObject = isPlainObject(payload?.file) ? payload.file : null;
  const fileData = String(payload?.fileData || payload?.fileContent || payload?.content || '').trim();
  const fileName = String(payload?.fileName || payload?.name || fileObject?.originalname || '').trim();
  return Boolean(fileObject?.buffer || fileData || fileName);
};

const resolvePatientImportAliases = (source) => PATIENT_IMPORT_ALIASES[source] || PATIENT_IMPORT_ALIASES.outro;

const firstNonEmptyImportValue = (record, aliases) => {
  if (!isPlainObject(record)) return '';
  const target = new Set((Array.isArray(aliases) ? aliases : []).map(normalizeImportKey));
  for (const [key, value] of Object.entries(record)) {
    if (target.has(normalizeImportKey(key))) {
      const normalized = String(value || '').trim();
      if (normalized) return normalized;
    }
  }
  return '';
};

const normalizePatientImportDate = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const dmyMatch = raw.match(/^(\d{2})[\/.-](\d{2})[\/.-](\d{4})$/);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]);
    const year = Number(dmyMatch[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizePatientImportRow = (row = {}, source = 'outro') => {
  const aliases = resolvePatientImportAliases(source);
  const nome = firstNonEmptyImportValue(row, aliases.name);
  const cpf = normalizeDocument(firstNonEmptyImportValue(row, aliases.document));
  const rg = firstNonEmptyImportValue(row, ['rg']);
  const dataNascimento = normalizePatientImportDate(firstNonEmptyImportValue(row, aliases.birthDate));
  const telefone = firstNonEmptyImportValue(row, aliases.phone);
  const email = normalizeEmail(firstNonEmptyImportValue(row, aliases.email));
  const endereco = firstNonEmptyImportValue(row, aliases.address);

  return {
    nome,
    cpf,
    rg,
    dataNascimento,
    telefone,
    email,
    endereco,
  };
};

const extractPatientImportRows = async (payload = {}) => {
  const source = String(payload?.source || payload?.origem || 'outro').trim().toLowerCase();
  if (hasUploadedImportFile(payload)) {
    const uploaded = await resolveUploadedImportRows(payload);
    return {
      source,
      rows: Array.isArray(uploaded.rows) ? uploaded.rows.filter(isPlainObject) : [],
      headers: Array.isArray(uploaded.headers) ? uploaded.headers : [],
      fileType: uploaded.fileType || '',
    };
  }
  const rawRows =
    (Array.isArray(payload?.patients) && payload.patients) ||
    (Array.isArray(payload?.rows) && payload.rows) ||
    (Array.isArray(payload?.items) && payload.items) ||
    (Array.isArray(payload?.data) && payload.data) ||
    [];

  return {
    source,
    rows: rawRows.filter(isPlainObject),
  };
};

const buildPatientImportPreview = async ({ clinicId, payload = {} } = {}) => {
  const normalizedClinicId = String(clinicId || '').trim();
  if (!normalizedClinicId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
  }

  const clinic = await clinicRepository.findProfileById(normalizedClinicId);
  if (!clinic) {
    throw new AppError(404, 'CLINIC_NOT_FOUND', 'Clinic not found.');
  }

  const { source, rows, headers = [] } = await extractPatientImportRows(payload);
  if (!rows.length) {
    throw new AppError(400, 'INVALID_IMPORT_FILE', 'Arquivo sem pacientes reconheciveis.');
  }

  const normalizedRows = rows.map((row) => normalizePatientImportRow(row, source)).filter((row) => row.nome || row.cpf || row.email);
  if (!normalizedRows.length) {
    throw new AppError(400, 'INVALID_IMPORT_FILE', 'Arquivo sem pacientes validos para importar.');
  }

  const existingPatients = await prisma.patient.findMany({
    where: { clinicId: normalizedClinicId },
    select: { cpf: true, email: true, nome: true, dataNascimento: true },
  });
  const existingCpf = new Set(existingPatients.map((patient) => normalizeDocument(patient.cpf)).filter(Boolean));
  const existingEmail = new Set(existingPatients.map((patient) => normalizeEmail(patient.email)).filter(Boolean));

  let duplicates = 0;
  let valid = 0;
  normalizedRows.forEach((row) => {
    const hasCpfDuplicate = row.cpf && existingCpf.has(row.cpf);
    const hasEmailDuplicate = row.email && existingEmail.has(row.email);
    if (hasCpfDuplicate || hasEmailDuplicate) {
      duplicates += 1;
      return;
    }
    valid += 1;
  });

  return {
    valid: true,
    source,
    totalRows: rows.length,
    normalizedRows: normalizedRows.length,
    headers,
    validRows: valid,
    duplicateRows: duplicates,
    stage: 'patients',
    summary: {
      totalRows: rows.length,
      normalizedRows: normalizedRows.length,
      headers,
      validRows: valid,
      duplicateRows: duplicates,
    },
  };
};

const applyPatientImport = async ({ clinicId, payload = {} } = {}) => {
  const normalizedClinicId = String(clinicId || '').trim();
  if (!normalizedClinicId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
  }

  const preview = await buildPatientImportPreview({ clinicId: normalizedClinicId, payload });
  const { source, rows } = await extractPatientImportRows(payload);
  const normalizedRows = rows.map((row) => normalizePatientImportRow(row, source)).filter((row) => row.nome || row.cpf || row.email);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existingPatients = await tx.patient.findMany({
        where: { clinicId: normalizedClinicId },
        select: { id: true, cpf: true, email: true, nome: true, dataNascimento: true },
      });

      const existingCpf = new Map(
        existingPatients
          .filter((patient) => normalizeDocument(patient.cpf))
          .map((patient) => [normalizeDocument(patient.cpf), patient])
      );
      const existingEmail = new Map(
        existingPatients
          .filter((patient) => normalizeEmail(patient.email))
          .map((patient) => [normalizeEmail(patient.email), patient])
      );

      const created = [];
      const skipped = [];

      for (const row of normalizedRows) {
        const cpfKey = row.cpf || '';
        const emailKey = row.email || '';
        const duplicate = (cpfKey && existingCpf.get(cpfKey)) || (emailKey && existingEmail.get(emailKey));
        if (duplicate) {
          skipped.push({
            nome: row.nome,
            cpf: row.cpf,
            reason: 'duplicate',
          });
          continue;
        }

        const createdPatient = await tx.patient.create({
          data: {
            clinicId: normalizedClinicId,
            nome: String(row.nome || '').trim().slice(0, 160),
            cpf: row.cpf || null,
            rg: row.rg || null,
            dataNascimento: row.dataNascimento || null,
            telefone: row.telefone || null,
            email: row.email || null,
            endereco: row.endereco || null,
            allowsMessages: true,
          },
        });

        if (createdPatient.cpf) {
          existingCpf.set(createdPatient.cpf.replace(/\D/g, ''), createdPatient);
        }
        if (createdPatient.email) {
          existingEmail.set(String(createdPatient.email).trim().toLowerCase(), createdPatient);
        }
        created.push(createdPatient);
      }

      return {
        created: created.length,
        skipped: skipped.length,
        createdPatients: created.map((patient) => ({
          id: patient.id,
          nome: patient.nome,
          cpf: patient.cpf,
        })),
        skippedPatients: skipped,
      };
    });

    return {
      ...preview,
      imported: result.created,
      skipped: result.skipped,
      createdPatients: result.createdPatients,
      skippedPatients: result.skippedPatients,
    };
  } catch (error) {
    if (isMissingTableError(error)) {
      throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
    }
    throw error;
  }
};

const CLINICAL_IMPORT_ALIASES = {
  capim: {
    patientName: ['paciente', 'nomepaciente', 'nome', 'patientname', 'fullname'],
    patientDocument: ['cpf', 'documento', 'documentopaciente', 'cnpjcpf', 'cpfcnpj', 'rg'],
    procedureName: ['procedimento', 'nomeprocedimento', 'procedure', 'service', 'servico', 'tipo'],
    procedureCode: ['codigo', 'code', 'código'],
    status: ['status', 'situacao', 'estado'],
    dentistName: ['dentista', 'profissional', 'dentistanome'],
    tooth: ['dente', 'tooth'],
    faces: ['faces', 'face'],
    observations: ['observacoes', 'observação', 'observacao', 'obs'],
    performedAt: ['datarealizacao', 'realizadoem', 'data', 'date', 'performedat'],
    registeredAt: ['datacadastro', 'createdat', 'registradoem', 'registro', 'registeredat'],
    amount: ['valor', 'price', 'preco', 'cobrado', 'amount'],
  },
  clinicorp: {
    patientName: ['paciente', 'nome', 'nomecompleto'],
    patientDocument: ['cpf', 'documento', 'cpfcnpj', 'rg'],
    procedureName: ['procedimento', 'nome', 'servico', 'service'],
    procedureCode: ['codigo', 'code'],
    status: ['status', 'situacao'],
    dentistName: ['dentista', 'profissional'],
    tooth: ['dente', 'tooth'],
    faces: ['faces'],
    observations: ['observacoes', 'obs'],
    performedAt: ['datarealizacao', 'data', 'performedat'],
    registeredAt: ['datacadastro', 'registeredat'],
    amount: ['valor', 'price', 'preco'],
  },
  odontolis: {
    patientName: ['paciente', 'nome', 'nomepaciente'],
    patientDocument: ['cpf', 'documento', 'rg'],
    procedureName: ['procedimento', 'nomeprocedimento', 'procedure'],
    procedureCode: ['codigo', 'code'],
    status: ['status', 'situacao'],
    dentistName: ['dentista', 'profissional'],
    tooth: ['dente', 'tooth'],
    faces: ['faces'],
    observations: ['observacoes', 'obs'],
    performedAt: ['data', 'realizadoem', 'performedat'],
    registeredAt: ['registradoem', 'registeredat'],
    amount: ['valor', 'amount'],
  },
  dentaloffice: {
    patientName: ['patient', 'paciente', 'name', 'fullname'],
    patientDocument: ['cpf', 'document', 'id_document'],
    procedureName: ['procedure', 'service', 'procedimento'],
    procedureCode: ['code', 'codigo'],
    status: ['status'],
    dentistName: ['dentist', 'doctor', 'professional'],
    tooth: ['tooth', 'dente'],
    faces: ['faces'],
    observations: ['notes', 'observations', 'obs'],
    performedAt: ['performedat', 'date', 'data'],
    registeredAt: ['registeredat', 'createdat'],
    amount: ['amount', 'price', 'valor'],
  },
  outro: {
    patientName: ['paciente', 'nome', 'name', 'fullname'],
    patientDocument: ['cpf', 'documento', 'document', 'id', 'rg'],
    procedureName: ['procedimento', 'procedure', 'service', 'nome'],
    procedureCode: ['codigo', 'code'],
    status: ['status', 'situacao', 'estado'],
    dentistName: ['dentista', 'profissional', 'doctor'],
    tooth: ['dente', 'tooth'],
    faces: ['faces', 'face'],
    observations: ['observacoes', 'notes', 'obs'],
    performedAt: ['datarealizacao', 'date', 'performedat'],
    registeredAt: ['registradoem', 'registeredat', 'createdat'],
    amount: ['valor', 'amount', 'price'],
  },
};

const resolveClinicalAliases = (source) => CLINICAL_IMPORT_ALIASES[source] || CLINICAL_IMPORT_ALIASES.outro;

const normalizeClinicalImportDate = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (iso) {
    const parsed = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), Number(iso[4] || 0), Number(iso[5] || 0), Number(iso[6] || 0)));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const dmy = raw.match(/^(\d{2})[\/.-](\d{2})[\/.-](\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (dmy) {
    const parsed = new Date(Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]), Number(dmy[4] || 0), Number(dmy[5] || 0), Number(dmy[6] || 0)));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeFaces = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  const raw = String(value || '').trim();
  if (!raw) return [];
  return raw.split(/[,;|]/).map((item) => item.trim()).filter(Boolean);
};

const normalizeClinicalImportRow = (row = {}, source = 'outro') => {
  const aliases = resolveClinicalAliases(source);
  const patientName = firstNonEmptyImportValue(row, aliases.patientName);
  const patientDocument = normalizeDocument(firstNonEmptyImportValue(row, aliases.patientDocument));
  const procedureName = firstNonEmptyImportValue(row, aliases.procedureName);
  const procedureCode = firstNonEmptyImportValue(row, aliases.procedureCode);
  const status = String(firstNonEmptyImportValue(row, aliases.status) || 'a-realizar').trim();
  const dentistName = firstNonEmptyImportValue(row, aliases.dentistName);
  const tooth = firstNonEmptyImportValue(row, aliases.tooth);
  const faces = normalizeFaces(firstNonEmptyImportValue(row, aliases.faces));
  const observations = firstNonEmptyImportValue(row, aliases.observations);
  const performedAt = normalizeClinicalImportDate(firstNonEmptyImportValue(row, aliases.performedAt));
  const registeredAt = normalizeClinicalImportDate(firstNonEmptyImportValue(row, aliases.registeredAt));
  const amount = Number(String(firstNonEmptyImportValue(row, aliases.amount) || '').replace(',', '.'));

  return {
    patientName,
    patientDocument,
    procedureName,
    procedureCode,
    status,
    dentistName,
    tooth,
    faces,
    observations,
    performedAt,
    registeredAt,
    amount: Number.isFinite(amount) ? amount : 0,
  };
};

const extractClinicalImportRows = async (payload = {}) => {
  const source = String(payload?.source || payload?.origem || 'outro').trim().toLowerCase();
  if (hasUploadedImportFile(payload)) {
    const uploaded = await resolveUploadedImportRows(payload);
    return {
      source,
      rows: Array.isArray(uploaded.rows) ? uploaded.rows.filter(isPlainObject) : [],
      headers: Array.isArray(uploaded.headers) ? uploaded.headers : [],
      fileType: uploaded.fileType || '',
    };
  }
  const rawRows =
    (Array.isArray(payload?.clinicalRecords) && payload.clinicalRecords) ||
    (Array.isArray(payload?.procedures) && payload.procedures) ||
    (Array.isArray(payload?.rows) && payload.rows) ||
    (Array.isArray(payload?.items) && payload.items) ||
    (Array.isArray(payload?.data) && payload.data) ||
    [];

  return {
    source,
    rows: rawRows.filter(isPlainObject),
  };
};

const buildClinicalImportPreview = async ({ clinicId, payload = {} } = {}) => {
  const normalizedClinicId = String(clinicId || '').trim();
  if (!normalizedClinicId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
  }
  const clinic = await clinicRepository.findProfileById(normalizedClinicId);
  if (!clinic) {
    throw new AppError(404, 'CLINIC_NOT_FOUND', 'Clinic not found.');
  }

  const { source, rows, headers = [] } = await extractClinicalImportRows(payload);
  if (!rows.length) {
    throw new AppError(400, 'INVALID_IMPORT_FILE', 'Arquivo sem fichas clinicas reconheciveis.');
  }

  const normalizedRows = rows.map((row) => normalizeClinicalImportRow(row, source)).filter((row) => row.patientName || row.patientDocument || row.procedureName);
  if (!normalizedRows.length) {
    throw new AppError(400, 'INVALID_IMPORT_FILE', 'Arquivo sem fichas clinicas validas.');
  }

  const patients = await prisma.patient.findMany({
    where: { clinicId: normalizedClinicId },
    select: { id: true, nome: true, cpf: true },
  });
  const patientsByCpf = new Map();
  const patientsByName = new Map();
  patients.forEach((patient) => {
    const cpf = normalizeDocument(patient.cpf);
    const name = normalizeKey(patient.nome);
    if (cpf) patientsByCpf.set(cpf, patient);
    if (name) patientsByName.set(name, patient);
  });

  let matchedRows = 0;
  let missingPatients = 0;
  let withoutProcedure = 0;
  normalizedRows.forEach((row) => {
    const matchedPatient = (row.patientDocument && patientsByCpf.get(row.patientDocument))
      || (row.patientName && patientsByName.get(normalizeKey(row.patientName)));
    if (matchedPatient) matchedRows += 1;
    else missingPatients += 1;
    if (!row.procedureName && !row.procedureCode) withoutProcedure += 1;
  });

  return {
    valid: true,
    source,
    totalRows: rows.length,
    normalizedRows: normalizedRows.length,
    headers,
    matchedRows,
    missingPatients,
    withoutProcedure,
    stage: 'clinical',
    summary: {
      totalRows: rows.length,
      normalizedRows: normalizedRows.length,
      headers,
      matchedRows,
      missingPatients,
      withoutProcedure,
    },
  };
};

const applyClinicalImport = async ({ clinicId, payload = {} } = {}) => {
  const normalizedClinicId = String(clinicId || '').trim();
  if (!normalizedClinicId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
  }

  const preview = await buildClinicalImportPreview({ clinicId: normalizedClinicId, payload });
  const { source, rows } = await extractClinicalImportRows(payload);
  const normalizedRows = rows.map((row) => normalizeClinicalImportRow(row, source)).filter((row) => row.patientName || row.patientDocument || row.procedureName);

  try {
    const patients = await prisma.patient.findMany({
      where: { clinicId: normalizedClinicId },
      select: { id: true, nome: true, cpf: true },
    });
    const patientsByCpf = new Map();
    const patientsByName = new Map();
    patients.forEach((patient) => {
      const cpf = normalizeDocument(patient.cpf);
      const name = normalizeKey(patient.nome);
      if (cpf) patientsByCpf.set(cpf, patient);
      if (name) patientsByName.set(name, patient);
    });

    const created = [];
    const skipped = [];

    for (let index = 0; index < normalizedRows.length; index += 1) {
      const row = normalizedRows[index];
      const matchedPatient = (row.patientDocument && patientsByCpf.get(row.patientDocument))
        || (row.patientName && patientsByName.get(normalizeKey(row.patientName)));
      if (!matchedPatient || (!row.procedureName && !row.procedureCode)) {
        skipped.push({
          patientName: row.patientName,
          reason: !matchedPatient ? 'patient_not_found' : 'missing_procedure',
        });
        continue;
      }

      const externalIdSource = [
        matchedPatient.id,
        row.procedureCode || row.procedureName || 'procedure',
        row.performedAt ? row.performedAt.toISOString() : '',
        index,
      ].join('|');
      const externalId = `import_${crypto.createHash('sha1').update(externalIdSource).digest('hex').slice(0, 16)}`;
      const procedurePayload = {
        id: externalId,
        externalId,
        nome: row.procedureName || row.procedureCode || 'Procedimento',
        tipo: row.procedureName || row.procedureCode || 'Procedimento',
        codigo: row.procedureCode || '',
        status: row.status || 'a-realizar',
        dentistaNome: row.dentistName || '',
        dente: row.tooth || '',
        dentes: row.tooth ? [row.tooth] : [],
        faces: row.faces || [],
        observacoes: row.observations || '',
        dataRealizacao: row.performedAt || null,
        registeredAt: row.registeredAt || row.performedAt || new Date(),
        valor: row.amount || 0,
        valorCobrado: row.amount || 0,
        gerarFinanceiro: true,
      };

      const result = await patientClinicalService.upsertProcedure({
        clinicId: normalizedClinicId,
        patientId: matchedPatient.id,
        procedure: procedurePayload,
      });

      created.push({
        patientId: matchedPatient.id,
        externalId,
        procedureName: procedurePayload.nome,
        financeWarning: result?.financeWarning || '',
      });
    }

    return {
      ...preview,
      imported: created.length,
      skipped: skipped.length,
      createdProcedures: created,
      skippedProcedures: skipped,
    };
  } catch (error) {
    if (isMissingTableError(error)) {
      throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
    }
    throw error;
  }
};

const CASHFLOW_ALIASES = {
  capim: {
    description: ['descricao', 'descrição', 'historico', 'historia', 'lancamento', 'lançamento', 'descricao_lancamento'],
    patientName: ['paciente', 'nomepaciente', 'nome', 'patientname', 'fullname'],
    patientDocument: ['cpf', 'documento', 'documentopaciente', 'cnpjcpf', 'cpfcnpj', 'rg'],
    amount: ['valor', 'amount', 'quantia', 'preco', 'price', 'total'],
    type: ['tipo', 'category', 'categoria', 'natureza'],
    paymentMethod: ['metodopagamento', 'paymentmethod', 'metodo', 'forma', 'forma_pagamento'],
    dueDate: ['data', 'vencimento', 'duedate', 'date'],
    status: ['status', 'situacao'],
    category: ['categoria', 'category'],
    source: ['origem', 'source'],
  },
  clinicorp: {
    description: ['descricao', 'lancamento', 'historia'],
    patientName: ['paciente', 'nome', 'nomecompleto'],
    patientDocument: ['cpf', 'documento', 'cpfcnpj'],
    amount: ['valor', 'amount', 'total'],
    type: ['tipo', 'natureza', 'categoria'],
    paymentMethod: ['metodo', 'forma', 'paymentmethod'],
    dueDate: ['data', 'vencimento', 'duedate'],
    status: ['status', 'situacao'],
    category: ['categoria', 'category'],
    source: ['origem', 'source'],
  },
  odontolis: {
    description: ['descricao', 'lancamento', 'historico'],
    patientName: ['paciente', 'nome', 'nomepaciente'],
    patientDocument: ['cpf', 'documento', 'rg'],
    amount: ['valor', 'amount', 'price'],
    type: ['tipo', 'categoria'],
    paymentMethod: ['metodo', 'forma'],
    dueDate: ['data', 'vencimento'],
    status: ['status', 'situacao'],
    category: ['categoria', 'category'],
    source: ['origem', 'source'],
  },
  dentaloffice: {
    description: ['description', 'descricao', 'entry', 'lancamento'],
    patientName: ['patient', 'paciente', 'name', 'fullname'],
    patientDocument: ['cpf', 'document', 'id_document'],
    amount: ['amount', 'valor', 'price'],
    type: ['type', 'tipo', 'natureza'],
    paymentMethod: ['paymentmethod', 'metodo', 'forma'],
    dueDate: ['duedate', 'data', 'vencimento'],
    status: ['status'],
    category: ['category', 'categoria'],
    source: ['source', 'origem'],
  },
  outro: {
    description: ['descricao', 'description', 'lancamento', 'entry', 'movimentacao'],
    patientName: ['paciente', 'nome', 'name', 'fullname'],
    patientDocument: ['cpf', 'documento', 'document', 'id', 'rg'],
    amount: ['valor', 'amount', 'price', 'total'],
    type: ['tipo', 'type', 'natureza'],
    paymentMethod: ['metodo', 'method', 'forma', 'paymentmethod'],
    dueDate: ['data', 'date', 'duedate', 'vencimento'],
    status: ['status', 'situacao'],
    category: ['categoria', 'category'],
    source: ['origem', 'source'],
  },
};

const resolveCashflowAliases = (source) => CASHFLOW_ALIASES[source] || CASHFLOW_ALIASES.outro;

const normalizeCashflowAmount = (value) => {
  const raw = String(value || '').trim().replace(/\s+/g, '').replace(',', '.');
  const amount = Number(raw);
  return Number.isFinite(amount) ? Math.abs(amount) : 0;
};

const normalizeCashflowType = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (['despesa', 'expense', 'out', 'saida', 'saída', 'debito', 'débito'].includes(raw)) return 'despesa';
  return 'receita';
};

const normalizeCashflowStatus = (value) => {
  const raw = String(value || '').trim().toUpperCase();
  if (raw === 'PAGO' || raw === 'PAID') return 'PAID';
  if (raw === 'CANCELADO' || raw === 'CANCELED' || raw === 'CANCELLED') return 'CANCELED';
  return 'OPEN';
};

const normalizeCashflowPaymentMethod = (value) => {
  const raw = String(value || '').trim().toUpperCase();
  if (raw === 'DINHEIRO') return 'CASH';
  if (raw === 'CARTAO' || raw === 'CREDIT' || raw === 'DEBIT' || raw === 'CARD' || raw === 'CARTAO_CREDITO' || raw === 'CARTAO_DEBITO') return 'CARD';
  if (raw === 'TRANSFERENCIA' || raw === 'TRANSFER') return 'TRANSFER';
  if (raw === 'BOLETO') return 'BOLETO';
  if (raw === 'PIX') return 'PIX';
  return raw || 'OTHER';
};

const normalizeCashflowImportRow = (row = {}, source = 'outro') => {
  const aliases = resolveCashflowAliases(source);
  return {
    description: firstNonEmptyImportValue(row, aliases.description),
    patientName: firstNonEmptyImportValue(row, aliases.patientName),
    patientDocument: normalizeDocument(firstNonEmptyImportValue(row, aliases.patientDocument)),
    amount: normalizeCashflowAmount(firstNonEmptyImportValue(row, aliases.amount)),
    type: normalizeCashflowType(firstNonEmptyImportValue(row, aliases.type)),
    paymentMethod: normalizeCashflowPaymentMethod(firstNonEmptyImportValue(row, aliases.paymentMethod)),
    dueDate: normalizeClinicalImportDate(firstNonEmptyImportValue(row, aliases.dueDate)),
    status: normalizeCashflowStatus(firstNonEmptyImportValue(row, aliases.status)),
    category: firstNonEmptyImportValue(row, aliases.category),
    source: firstNonEmptyImportValue(row, aliases.source),
  };
};

const extractCashflowImportRows = async (payload = {}) => {
  const source = String(payload?.source || payload?.origem || 'outro').trim().toLowerCase();
  if (hasUploadedImportFile(payload)) {
    const uploaded = await resolveUploadedImportRows(payload);
    return {
      source,
      rows: Array.isArray(uploaded.rows) ? uploaded.rows.filter(isPlainObject) : [],
      headers: Array.isArray(uploaded.headers) ? uploaded.headers : [],
      fileType: uploaded.fileType || '',
    };
  }
  const rawRows =
    (Array.isArray(payload?.cashflow) && payload.cashflow) ||
    (Array.isArray(payload?.entries) && payload.entries) ||
    (Array.isArray(payload?.rows) && payload.rows) ||
    (Array.isArray(payload?.items) && payload.items) ||
    (Array.isArray(payload?.data) && payload.data) ||
    [];

  return {
    source,
    rows: rawRows.filter(isPlainObject),
  };
};

const buildCashflowImportPreview = async ({ clinicId, payload = {} } = {}) => {
  const normalizedClinicId = String(clinicId || '').trim();
  if (!normalizedClinicId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
  }
  const clinic = await clinicRepository.findProfileById(normalizedClinicId);
  if (!clinic) {
    throw new AppError(404, 'CLINIC_NOT_FOUND', 'Clinic not found.');
  }

  const { source, rows, headers = [] } = await extractCashflowImportRows(payload);
  if (!rows.length) {
    throw new AppError(400, 'INVALID_IMPORT_FILE', 'Arquivo sem lancamentos financeiros reconheciveis.');
  }

  const normalizedRows = rows.map((row) => normalizeCashflowImportRow(row, source)).filter((row) => row.description || row.amount > 0);
  if (!normalizedRows.length) {
    throw new AppError(400, 'INVALID_IMPORT_FILE', 'Arquivo sem lancamentos financeiros validos.');
  }

  let revenueRows = 0;
  let expenseRows = 0;
  let invalidRows = 0;
  normalizedRows.forEach((row) => {
    if (!row.description || row.amount <= 0) {
      invalidRows += 1;
      return;
    }
    if (row.type === 'despesa') expenseRows += 1;
    else revenueRows += 1;
  });

  return {
    valid: true,
    source,
    totalRows: rows.length,
    normalizedRows: normalizedRows.length,
    headers,
    revenueRows,
    expenseRows,
    invalidRows,
    stage: 'cashflow',
    summary: {
      totalRows: rows.length,
      normalizedRows: normalizedRows.length,
      headers,
      revenueRows,
      expenseRows,
      invalidRows,
    },
  };
};

const applyCashflowImport = async ({ clinicId, payload = {} } = {}) => {
  const normalizedClinicId = String(clinicId || '').trim();
  if (!normalizedClinicId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
  }

  const preview = await buildCashflowImportPreview({ clinicId: normalizedClinicId, payload });
  const { source, rows } = await extractCashflowImportRows(payload);
  const normalizedRows = rows.map((row) => normalizeCashflowImportRow(row, source)).filter((row) => row.description || row.amount > 0);

  try {
    const patients = await prisma.patient.findMany({
      where: { clinicId: normalizedClinicId },
      select: { id: true, nome: true, cpf: true },
    });
    const patientsByCpf = new Map();
    const patientsByName = new Map();
    patients.forEach((patient) => {
      const cpf = normalizeDocument(patient.cpf);
      const name = normalizeKey(patient.nome);
      if (cpf) patientsByCpf.set(cpf, patient);
      if (name) patientsByName.set(name, patient);
    });

    const created = [];
    const skipped = [];

    for (const row of normalizedRows) {
      if (!row.description || row.amount <= 0) {
        skipped.push({ description: row.description, reason: 'invalid_row' });
        continue;
      }

      const matchedPatient = (row.patientDocument && patientsByCpf.get(row.patientDocument))
        || (row.patientName && patientsByName.get(normalizeKey(row.patientName)));

      const payloadForAccount = {
        description: row.description,
        totalAmount: row.amount,
        source: row.source || source || 'importacao',
        category: row.category || (row.type === 'despesa' ? 'despesas' : 'receitas'),
        dueDate: row.dueDate || undefined,
        paymentMethod: row.paymentMethod || undefined,
        metadata: {
          type: row.type,
          patientName: row.patientName || '',
          patientDocument: row.patientDocument || '',
          importSource: source,
          status: row.status,
        },
      };

      if (matchedPatient) {
        payloadForAccount.patientId = matchedPatient.id;
        payloadForAccount.prontuario = matchedPatient.id;
        payloadForAccount.metadata.patientName = matchedPatient.nome || payloadForAccount.metadata.patientName;
      }

      if (row.status === 'PAID') {
        payloadForAccount.metadata.paymentStatus = 'PAID';
      }

      const account = await financialService.createFinancialAccount({
        clinicId: normalizedClinicId,
        payload: payloadForAccount,
      });

      created.push({
        id: account.id,
        description: account.descricao || account.description || payloadForAccount.description,
        totalAmount: account.totalAmount ?? account.valor ?? row.amount,
      });
    }

    return {
      ...preview,
      imported: created.length,
      skipped: skipped.length,
      createdAccounts: created,
      skippedAccounts: skipped,
    };
  } catch (error) {
    if (isMissingTableError(error)) {
      throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
    }
    throw error;
  }
};


const PROCEDURE_CATALOG_ALIASES = {
  capim: {
    code: ['codigo', 'code', 'id', 'servicoid'],
    name: ['nome', 'procedimento', 'procedure', 'service', 'descricao', 'tipo'],
    price: ['preco', 'valor', 'price', 'amount', 'custo'],
    active: ['ativo', 'status', 'situacao'],
  },
  clinicorp: {
    code: ['codigo', 'code', 'id'],
    name: ['nome', 'procedimento', 'service', 'descricao', 'tipo'],
    price: ['preco', 'valor', 'price', 'amount'],
    active: ['ativo', 'status', 'situacao'],
  },
  odontolis: {
    code: ['codigo', 'code', 'id'],
    name: ['nome', 'procedimento', 'service', 'descricao'],
    price: ['preco', 'valor', 'price'],
    active: ['ativo', 'status'],
  },
  dentaloffice: {
    code: ['codigo', 'code', 'id'],
    name: ['name', 'nome', 'procedure', 'procedimento', 'service', 'descricao'],
    price: ['price', 'valor', 'amount'],
    active: ['active', 'ativo', 'status'],
  },
  outro: {
    code: ['codigo', 'code', 'id'],
    name: ['nome', 'name', 'procedimento', 'procedure', 'service', 'descricao', 'tipo'],
    price: ['preco', 'valor', 'price', 'amount'],
    active: ['ativo', 'status', 'situacao'],
  },
};

const resolveProcedureCatalogAliases = (source) => PROCEDURE_CATALOG_ALIASES[source] || PROCEDURE_CATALOG_ALIASES.outro;

const normalizeProcedureCatalogPrice = (value) => {
  const raw = String(value || '').trim().replace(/\s+/g, '').replace(',', '.');
  const price = Number(raw);
  return Number.isFinite(price) ? Math.max(0, price) : 0;
};

const normalizeProcedureCatalogActive = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return true;
  return !['false', '0', 'nao', 'não', 'inativo', 'desativado', 'inactive', 'disabled'].includes(raw);
};

const normalizeProcedureCatalogImportRow = (row = {}, source = 'outro') => {
  const aliases = resolveProcedureCatalogAliases(source);
  const code = String(firstNonEmptyImportValue(row, aliases.code) || '').trim();
  const name = String(firstNonEmptyImportValue(row, aliases.name) || '').trim();
  const price = normalizeProcedureCatalogPrice(firstNonEmptyImportValue(row, aliases.price));
  const active = normalizeProcedureCatalogActive(firstNonEmptyImportValue(row, aliases.active));
  const normalizedCode = code || (name ? `IMP-${crypto.createHash('sha1').update(name.toLowerCase()).digest('hex').slice(0, 10).toUpperCase()}` : '');

  return {
    codigo: normalizedCode,
    nome: name,
    preco: price,
    ativo: active,
  };
};

const extractProcedureCatalogImportRows = async (payload = {}) => {
  const source = String(payload?.source || payload?.origem || 'outro').trim().toLowerCase();
  if (hasUploadedImportFile(payload)) {
    const uploaded = await resolveUploadedImportRows(payload);
    return {
      source,
      rows: Array.isArray(uploaded.rows) ? uploaded.rows.filter(isPlainObject) : [],
      headers: Array.isArray(uploaded.headers) ? uploaded.headers : [],
      fileType: uploaded.fileType || '',
    };
  }
  const rawRows =
    (Array.isArray(payload?.procedures) && payload.procedures) ||
    (Array.isArray(payload?.proceduresCatalog) && payload.proceduresCatalog) ||
    (Array.isArray(payload?.catalog) && payload.catalog) ||
    (Array.isArray(payload?.items) && payload.items) ||
    (Array.isArray(payload?.rows) && payload.rows) ||
    (Array.isArray(payload?.data) && payload.data) ||
    [];

  return {
    source,
    rows: rawRows.filter(isPlainObject),
  };
};

const buildProcedureCatalogKey = (item = {}) => {
  const code = normalizeImportKey(item.codigo || item.code || '');
  const name = normalizeImportKey(item.nome || item.name || '');
  return code || name;
};

const buildProceduresImportPreview = async ({ clinicId, payload = {} } = {}) => {
  const normalizedClinicId = String(clinicId || '').trim();
  if (!normalizedClinicId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
  }

  const clinic = await clinicRepository.findProfileById(normalizedClinicId);
  if (!clinic) {
    throw new AppError(404, 'CLINIC_NOT_FOUND', 'Clinic not found.');
  }

  const { source, rows, headers = [] } = await extractProcedureCatalogImportRows(payload);
  if (!rows.length) {
    throw new AppError(400, 'INVALID_IMPORT_FILE', 'Arquivo sem procedimentos reconheciveis.');
  }

  const normalizedRows = rows
    .map((row) => normalizeProcedureCatalogImportRow(row, source))
    .filter((row) => row.nome || row.codigo);
  if (!normalizedRows.length) {
    throw new AppError(400, 'INVALID_IMPORT_FILE', 'Arquivo sem procedimentos validos.');
  }

  const currentCatalog = Array.isArray(clinic?.operationalSettings?.proceduresCatalog)
    ? clinic.operationalSettings.proceduresCatalog
    : [];
  const currentKeys = new Set();
  currentCatalog.forEach((item) => {
    const key = buildProcedureCatalogKey(item);
    if (key) currentKeys.add(key);
  });

  const seenKeys = new Set();
  let duplicatesInFile = 0;
  let newItems = 0;
  let updatedItems = 0;
  let invalidRows = 0;

  normalizedRows.forEach((row) => {
    const key = buildProcedureCatalogKey(row);
    if (!row.nome || !key) {
      invalidRows += 1;
      return;
    }
    if (seenKeys.has(key)) {
      duplicatesInFile += 1;
      return;
    }
    seenKeys.add(key);
    if (currentKeys.has(key)) updatedItems += 1;
    else newItems += 1;
  });

  return {
    valid: true,
    source,
    totalRows: rows.length,
    normalizedRows: normalizedRows.length,
    headers,
    currentItems: currentCatalog.length,
    newItems,
    updatedItems,
    duplicatesInFile,
    invalidRows,
    stage: 'procedures',
    summary: {
      totalRows: rows.length,
      normalizedRows: normalizedRows.length,
      headers,
      currentItems: currentCatalog.length,
      newItems,
      updatedItems,
      duplicatesInFile,
      invalidRows,
    },
  };
};

const applyProceduresImport = async ({ clinicId, payload = {} } = {}) => {
  const normalizedClinicId = String(clinicId || '').trim();
  if (!normalizedClinicId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
  }

  const preview = await buildProceduresImportPreview({ clinicId: normalizedClinicId, payload });
  const { source, rows } = await extractProcedureCatalogImportRows(payload);
  const normalizedRows = rows
    .map((row) => normalizeProcedureCatalogImportRow(row, source))
    .filter((row) => row.nome || row.codigo);

  try {
    const clinic = await clinicRepository.findProfileById(normalizedClinicId);
    if (!clinic) {
      throw new AppError(404, 'CLINIC_NOT_FOUND', 'Clinic not found.');
    }

    const currentCatalog = Array.isArray(clinic?.operationalSettings?.proceduresCatalog)
      ? clinic.operationalSettings.proceduresCatalog
      : [];
    const merged = new Map();

    currentCatalog.forEach((item) => {
      const safeItem = {
        codigo: String(item?.codigo || item?.code || '').trim(),
        nome: String(item?.nome || item?.name || '').trim(),
        preco: normalizeProcedureCatalogPrice(item?.preco ?? item?.price ?? item?.valor ?? 0),
        ativo: item?.ativo !== false,
        updatedAt: String(item?.updatedAt || '').trim() || new Date().toISOString(),
      };
      const key = buildProcedureCatalogKey(safeItem);
      if (key) merged.set(key, safeItem);
    });

    const created = [];
    const updated = [];
    const skipped = [];
    const nowIso = new Date().toISOString();

    normalizedRows.forEach((row) => {
      const key = buildProcedureCatalogKey(row);
      if (!row.nome || !key) {
        skipped.push({
          codigo: row.codigo,
          nome: row.nome,
          reason: 'invalid_row',
        });
        return;
      }

      const record = {
        codigo: row.codigo,
        nome: row.nome,
        preco: row.preco,
        ativo: row.ativo,
        updatedAt: nowIso,
      };

      if (merged.has(key)) {
        const previous = merged.get(key) || {};
        merged.set(key, {
          ...previous,
          ...record,
          codigo: previous.codigo || record.codigo,
          nome: record.nome || previous.nome,
          preco: record.preco,
          ativo: record.ativo,
          updatedAt: nowIso,
        });
        updated.push({
          codigo: record.codigo,
          nome: record.nome,
        });
        return;
      }

      merged.set(key, record);
      created.push({
        codigo: record.codigo,
        nome: record.nome,
      });
    });

    const mergedCatalog = Array.from(merged.values()).sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || '')));
    await clinicRepository.updateOperationalSettings(normalizedClinicId, {
      ...normalizeOperationalSettings(clinic.operationalSettings || {}),
      proceduresCatalog: mergedCatalog,
    });

    return {
      ...preview,
      imported: created.length + updated.length,
      skipped: skipped.length,
      createdProcedures: created,
      updatedProcedures: updated,
      skippedProcedures: skipped,
      catalogSize: mergedCatalog.length,
    };
  } catch (error) {
    if (isMissingTableError(error)) {
      throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
    }
    throw error;
  }
};

const validateDocument = (documentType, documentNumber) => {
  const normalizedType = String(documentType || '').trim().toUpperCase();
  const normalizedNumber = normalizeDocument(documentNumber);

  if (!isValidDocumentType(normalizedType)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'documentType must be CPF or CNPJ.');
  }

  if (!normalizedNumber) {
    throw new AppError(400, 'VALIDATION_ERROR', 'documentNumber is required.');
  }

  if (normalizedType === 'CPF' && normalizedNumber.length !== 11) {
    throw new AppError(400, 'VALIDATION_ERROR', 'CPF must contain 11 digits.');
  }

  if (normalizedType === 'CNPJ' && normalizedNumber.length !== 14) {
    throw new AppError(400, 'VALIDATION_ERROR', 'CNPJ must contain 14 digits.');
  }

  return {
    documentType: normalizedType,
    documentNumber: normalizedNumber,
  };
};

const inferDocumentType = (documentNumber) => {
  const normalizedNumber = normalizeDocument(documentNumber);
  if (normalizedNumber.length === 11) return 'CPF';
  if (normalizedNumber.length === 14) return 'CNPJ';
  return '';
};

const isRepeatedDigits = (value) => /^(\d)\1+$/.test(String(value || ''));

const isValidCpfNumber = (value) => {
  const cpf = normalizeDocument(value);
  if (!cpf || cpf.length !== 11 || isRepeatedDigits(cpf)) return false;
  let sum = 0;
  for (let index = 0; index < 9; index += 1) {
    sum += Number(cpf[index]) * (10 - index);
  }
  let check = (sum * 10) % 11;
  if (check === 10) check = 0;
  if (check !== Number(cpf[9])) return false;
  sum = 0;
  for (let index = 0; index < 10; index += 1) {
    sum += Number(cpf[index]) * (11 - index);
  }
  check = (sum * 10) % 11;
  if (check === 10) check = 0;
  return check === Number(cpf[10]);
};

const isValidCnpjNumber = (value) => {
  const cnpj = normalizeDocument(value);
  if (!cnpj || cnpj.length !== 14 || isRepeatedDigits(cnpj)) return false;
  const calculateCheckDigit = (base) => {
    const weights = base.length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = base.split('').reduce((accumulator, item, index) => accumulator + (Number(item) * weights[index]), 0);
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };
  const base = cnpj.slice(0, 12);
  const digitOne = calculateCheckDigit(base);
  const digitTwo = calculateCheckDigit(base + digitOne);
  return cnpj === `${base}${digitOne}${digitTwo}`;
};

const validateOptionalClinicDocument = (value) => {
  const normalizedNumber = normalizeDocument(value);
  if (!normalizedNumber) return null;
  if (normalizedNumber.length === 11) {
    if (!isValidCpfNumber(normalizedNumber)) {
      throw new AppError(400, 'INVALID_CLINIC_DOCUMENT', 'CPF invalido. Confira os 11 digitos.');
    }
    return normalizedNumber;
  }
  if (normalizedNumber.length === 14) {
    if (!isValidCnpjNumber(normalizedNumber)) {
      throw new AppError(400, 'INVALID_CLINIC_DOCUMENT', 'CNPJ invalido. Confira os 14 digitos.');
    }
    return normalizedNumber;
  }
  if (normalizedNumber.length < 11) {
    throw new AppError(400, 'INCOMPLETE_CLINIC_DOCUMENT', 'CPF/CNPJ incompleto. Confira se o documento possui 11 ou 14 digitos.');
  }
  if (normalizedNumber.length < 14) {
    throw new AppError(400, 'INCOMPLETE_CLINIC_DOCUMENT', 'CNPJ incompleto. Confira os 14 digitos.');
  }
  throw new AppError(400, 'INVALID_CLINIC_DOCUMENT', 'CPF/CNPJ deve conter 11 ou 14 digitos.');
};

const APPOINTMENT_IMPORT_ALIASES = {
  capim: {
    patientName: ['paciente', 'nomepaciente', 'nome', 'patientname', 'fullname'],
    patientDocument: ['cpf', 'documento', 'documentopaciente', 'cnpjcpf', 'cpfcnpj'],
    professionalName: ['profissional', 'dentista', 'profissionalnome', 'doctor', 'doctorname'],
    startDateTime: ['datahora', 'inicio', 'inicioagendamento', 'data_agenda', 'datetime', 'start', 'scheduledat'],
    endDateTime: ['horafim', 'fim', 'termino', 'end', 'endtime'],
    status: ['status', 'situacao'],
    type: ['tipo', 'categoria', 'atendimento'],
    notes: ['observacoes', 'observação', 'observacao', 'obs', 'notes'],
  },
  clinicorp: {
    patientName: ['paciente', 'nome', 'nomecompleto', 'fullname'],
    patientDocument: ['cpf', 'documento', 'cpfcnpj', 'rg'],
    professionalName: ['profissional', 'responsavel', 'dentista'],
    startDateTime: ['datahora', 'agendamento', 'data_agenda', 'inicio'],
    endDateTime: ['horafim', 'fim', 'termino'],
    status: ['status', 'situacao'],
    type: ['tipo', 'categoria'],
    notes: ['observacoes', 'obs', 'notes'],
  },
  odontolis: {
    patientName: ['paciente', 'nome', 'nomepaciente'],
    patientDocument: ['cpf', 'documento', 'rg'],
    professionalName: ['profissional', 'dentista'],
    startDateTime: ['datahora', 'agendamento', 'inicio'],
    endDateTime: ['horafim', 'fim'],
    status: ['status', 'situacao'],
    type: ['tipo', 'categoria'],
    notes: ['observacoes', 'obs'],
  },
  dentaloffice: {
    patientName: ['patient', 'paciente', 'name', 'fullname'],
    patientDocument: ['cpf', 'document', 'id_document'],
    professionalName: ['professional', 'dentist', 'doctor'],
    startDateTime: ['start', 'startdatetime', 'datahora', 'scheduledat'],
    endDateTime: ['end', 'enddatetime', 'horafim'],
    status: ['status', 'state'],
    type: ['type', 'tipo'],
    notes: ['notes', 'observations', 'observacoes'],
  },
  outro: {
    patientName: ['paciente', 'nome', 'name', 'fullname'],
    patientDocument: ['cpf', 'documento', 'document', 'id', 'rg'],
    professionalName: ['profissional', 'dentista', 'doctor'],
    startDateTime: ['datahora', 'inicio', 'start', 'scheduledat'],
    endDateTime: ['horafim', 'end', 'termino'],
    status: ['status', 'situacao'],
    type: ['tipo', 'type'],
    notes: ['observacoes', 'notes', 'obs'],
  },
};

const resolveAppointmentAliases = (source) => APPOINTMENT_IMPORT_ALIASES[source] || APPOINTMENT_IMPORT_ALIASES.outro;

const normalizeImportDateTime = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (iso) {
    const parsed = new Date(
      Date.UTC(
        Number(iso[1]),
        Number(iso[2]) - 1,
        Number(iso[3]),
        Number(iso[4] || 0),
        Number(iso[5] || 0),
        Number(iso[6] || 0),
      )
    );
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const dmy = raw.match(/^(\d{2})[\/.-](\d{2})[\/.-](\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (dmy) {
    const parsed = new Date(
      Date.UTC(
        Number(dmy[3]),
        Number(dmy[2]) - 1,
        Number(dmy[1]),
        Number(dmy[4] || 0),
        Number(dmy[5] || 0),
        Number(dmy[6] || 0),
      )
    );
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeAppointmentImportRow = (row = {}, source = 'outro') => {
  const aliases = resolveAppointmentAliases(source);
  return {
    patientName: firstNonEmptyImportValue(row, aliases.patientName),
    patientDocument: normalizeDocument(firstNonEmptyImportValue(row, aliases.patientDocument)),
    professionalName: firstNonEmptyImportValue(row, aliases.professionalName),
    startDateTime: normalizeImportDateTime(firstNonEmptyImportValue(row, aliases.startDateTime)),
    endDateTime: normalizeImportDateTime(firstNonEmptyImportValue(row, aliases.endDateTime)),
    status: String(firstNonEmptyImportValue(row, aliases.status) || 'AGENDADO').trim().toUpperCase(),
    type: firstNonEmptyImportValue(row, aliases.type),
    notes: firstNonEmptyImportValue(row, aliases.notes),
  };
};

const extractAppointmentImportRows = async (payload = {}) => {
  const source = String(payload?.source || payload?.origem || 'outro').trim().toLowerCase();
  if (hasUploadedImportFile(payload)) {
    const uploaded = await resolveUploadedImportRows(payload);
    return {
      source,
      rows: Array.isArray(uploaded.rows) ? uploaded.rows.filter(isPlainObject) : [],
      headers: Array.isArray(uploaded.headers) ? uploaded.headers : [],
      fileType: uploaded.fileType || '',
    };
  }
  const rawRows =
    (Array.isArray(payload?.appointments) && payload.appointments) ||
    (Array.isArray(payload?.rows) && payload.rows) ||
    (Array.isArray(payload?.items) && payload.items) ||
    (Array.isArray(payload?.data) && payload.data) ||
    [];

  return {
    source,
    rows: rawRows.filter(isPlainObject),
  };
};

const buildAppointmentImportPreview = async ({ clinicId, payload = {} } = {}) => {
  const normalizedClinicId = String(clinicId || '').trim();
  if (!normalizedClinicId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
  }

  const clinic = await clinicRepository.findProfileById(normalizedClinicId);
  if (!clinic) {
    throw new AppError(404, 'CLINIC_NOT_FOUND', 'Clinic not found.');
  }

  const { source, rows, headers = [] } = await extractAppointmentImportRows(payload);
  if (!rows.length) {
    throw new AppError(400, 'INVALID_IMPORT_FILE', 'Arquivo sem agendamentos reconheciveis.');
  }

  const normalizedRows = rows
    .map((row) => normalizeAppointmentImportRow(row, source))
    .filter((row) => row.patientName || row.patientDocument || row.startDateTime);
  if (!normalizedRows.length) {
    throw new AppError(400, 'INVALID_IMPORT_FILE', 'Arquivo sem agenda valida para importar.');
  }

  const patients = await prisma.patient.findMany({
    where: { clinicId: normalizedClinicId },
    select: { id: true, nome: true, cpf: true },
  });
  const patientsByCpf = new Map();
  const patientsByName = new Map();
  patients.forEach((patient) => {
    const cpf = normalizeDocument(patient.cpf);
    const name = normalizeKey(patient.nome);
    if (cpf) patientsByCpf.set(cpf, patient);
    if (name) patientsByName.set(name, patient);
  });

  let matched = 0;
  let missingPatients = 0;
  let invalidDates = 0;
  normalizedRows.forEach((row) => {
    const matchedPatient = (row.patientDocument && patientsByCpf.get(row.patientDocument))
      || (row.patientName && patientsByName.get(normalizeKey(row.patientName)));
    if (!matchedPatient) {
      missingPatients += 1;
    } else {
      matched += 1;
    }
    if (!row.startDateTime) {
      invalidDates += 1;
    }
  });

  return {
    valid: true,
    source,
    totalRows: rows.length,
    normalizedRows: normalizedRows.length,
    headers,
    matchedRows: matched,
    missingPatients,
    invalidDates,
    stage: 'agenda',
    summary: {
      totalRows: rows.length,
      normalizedRows: normalizedRows.length,
      headers,
      matchedRows: matched,
      missingPatients,
      invalidDates,
    },
  };
};

const applyAppointmentImport = async ({ clinicId, payload = {} } = {}) => {
  const normalizedClinicId = String(clinicId || '').trim();
  if (!normalizedClinicId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
  }

  const preview = await buildAppointmentImportPreview({ clinicId: normalizedClinicId, payload });
  const { source, rows } = await extractAppointmentImportRows(payload);
  const normalizedRows = rows
    .map((row) => normalizeAppointmentImportRow(row, source))
    .filter((row) => row.patientName || row.patientDocument || row.startDateTime);

  try {
    const patients = await prisma.patient.findMany({
      where: { clinicId: normalizedClinicId },
      select: { id: true, nome: true, cpf: true },
    });
    const patientsByCpf = new Map();
    const patientsByName = new Map();
    patients.forEach((patient) => {
      const cpf = normalizeDocument(patient.cpf);
      const name = normalizeKey(patient.nome);
      if (cpf) patientsByCpf.set(cpf, patient);
      if (name) patientsByName.set(name, patient);
    });

    const result = await prisma.$transaction(async (tx) => {
      const created = [];
      const skipped = [];

      for (const row of normalizedRows) {
        const matchedPatient = (row.patientDocument && patientsByCpf.get(row.patientDocument))
          || (row.patientName && patientsByName.get(normalizeKey(row.patientName)));
        if (!matchedPatient || !row.startDateTime) {
          skipped.push({
            patientName: row.patientName,
            reason: !matchedPatient ? 'patient_not_found' : 'invalid_date',
          });
          continue;
        }

        const appointment = await tx.appointment.create({
          data: {
            clinicId: normalizedClinicId,
            patientId: matchedPatient.id,
            profissionalNome: row.professionalName || null,
            dataHora: row.startDateTime,
            horaFim: row.endDateTime || null,
            status: 'AGENDADO',
            confirmado: false,
            tipo: row.type || null,
            observacoes: row.notes || null,
          },
        });

        created.push({
          id: appointment.id,
          patientId: appointment.patientId,
          dataHora: appointment.dataHora,
        });
      }

      return {
        created: created.length,
        skipped: skipped.length,
        createdAppointments: created,
        skippedAppointments: skipped,
      };
    });

    return {
      ...preview,
      imported: result.created,
      skipped: result.skipped,
      createdAppointments: result.createdAppointments,
      skippedAppointments: result.skippedAppointments,
    };
  } catch (error) {
    if (isMissingTableError(error)) {
      throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
    }
    throw error;
  }
};

const clinicService = {
  list: async () => {
    try {
      return await clinicRepository.list();
    } catch (error) {
      if (isMissingTableError(error)) {
        return [];
      }
      throw error;
    }
  },

  getSuperAdminOnboardingDashboard: async () => {
    try {
      const now = new Date();
      const startOfToday = getStartOfDay(now);
      const startOfSevenDays = getStartOfDaysAgo(6, now);

      const [activePendingSignups, clinicRows] = await Promise.all([
        prisma.pendingSignup.findMany({
          where: {
            verificationExpiresAt: {
              gte: now,
            },
          },
          select: {
            id: true,
            email: true,
            signupData: true,
            verificationExpiresAt: true,
            resendAvailableAt: true,
            sendCount: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: {
            updatedAt: 'desc',
          },
        }),
        prisma.clinic.findMany({
          select: {
            id: true,
            nomeFantasia: true,
            razaoSocial: true,
            cnpjCpf: true,
            email: true,
            createdAt: true,
            updatedAt: true,
            operationalSettings: true,
            users: {
              select: {
                email: true,
                nome: true,
                isClinicAdmin: true,
              },
              orderBy: {
                createdAt: 'asc',
              },
            },
            subscription: {
              select: {
                planType: true,
                status: true,
                startDate: true,
                endDate: true,
                graceUntil: true,
                createdAt: true,
                updatedAt: true,
                lastPayment: {
                  select: {
                    status: true,
                    provider: true,
                    paymentLink: true,
                    createdAt: true,
                    paidAt: true,
                  },
                },
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        }),
      ]);

      const summary = {
        totalClinics: clinicRows.length,
        clinicsCreatedToday: 0,
        clinicsCreatedLast7Days: 0,
        activePendingSignups: activePendingSignups.length,
        pendingSignupsCreatedToday: 0,
        pendingSignupsCreatedLast7Days: 0,
        clinicsAwaitingProfile: 0,
        clinicsAwaitingPayment: 0,
        activeSubscriptions: 0,
        gracePeriodSubscriptions: 0,
        blockedSubscriptions: 0,
        canceledSubscriptions: 0,
      };

      const planBreakdown = {
        MONTHLY: 0,
        QUARTERLY: 0,
        SEMIANNUAL: 0,
        ANNUAL: 0,
      };

      const stageBreakdown = {
        EMAIL_VERIFICATION_PENDING: 0,
        PROFILE_PENDING: 0,
        PAYMENT_PENDING: 0,
        ACTIVE: 0,
        GRACE_PERIOD: 0,
        BLOCKED: 0,
        CANCELED: 0,
      };

      const clinicSnapshots = clinicRows.map((clinic) => {
        const operationalSettings = normalizeOperationalSettings(clinic.operationalSettings || {});
        const onboardingState = operationalSettings.onboarding || getDefaultOperationalSettings().onboarding;
        const stageInfo = deriveOnboardingStage({
          onboardingState,
          subscription: clinic.subscription || null,
        });
        const adminEntry = deriveAdminEntry(clinic.users);

        if (isDateOnOrAfter(clinic.createdAt, startOfToday)) summary.clinicsCreatedToday += 1;
        if (isDateOnOrAfter(clinic.createdAt, startOfSevenDays)) summary.clinicsCreatedLast7Days += 1;
        if (stageInfo.selectedPlan && Object.prototype.hasOwnProperty.call(planBreakdown, stageInfo.selectedPlan)) {
          planBreakdown[stageInfo.selectedPlan] += 1;
        }

        if (stageInfo.stage === 'PROFILE_PENDING') summary.clinicsAwaitingProfile += 1;
        if (stageInfo.stage === 'PAYMENT_PENDING') summary.clinicsAwaitingPayment += 1;
        if (stageInfo.stage === 'ACTIVE') summary.activeSubscriptions += 1;
        if (stageInfo.stage === 'GRACE_PERIOD') summary.gracePeriodSubscriptions += 1;
        if (stageInfo.stage === 'BLOCKED') summary.blockedSubscriptions += 1;
        if (stageInfo.stage === 'CANCELED') summary.canceledSubscriptions += 1;
        if (Object.prototype.hasOwnProperty.call(stageBreakdown, stageInfo.stage)) {
          stageBreakdown[stageInfo.stage] += 1;
        }

        return {
          clinicId: clinic.id,
          nomeFantasia: String(clinic.nomeFantasia || '').trim(),
          razaoSocial: String(clinic.razaoSocial || '').trim(),
          cnpjOuCpf: String(clinic.cnpjCpf || '').trim(),
          clinicEmail: normalizeEmail(clinic.email || ''),
          adminEmail: adminEntry.adminEmail,
          adminName: adminEntry.adminName,
          selectedPlan: stageInfo.selectedPlan,
          operationType: stageInfo.operationType,
          stage: stageInfo.stage,
          stageLabel: stageInfo.label,
          effectiveSubscriptionStatus: stageInfo.effectiveSubscriptionStatus,
          createdAt: normalizeIsoDate(clinic.createdAt),
          updatedAt: normalizeIsoDate(clinic.updatedAt),
          onboardingStartedAt: String(onboardingState.startedAt || '').trim(),
          onboardingUpdatedAt: String(onboardingState.updatedAt || '').trim(),
          onboardingCompletedAt: String(onboardingState.completedAt || '').trim(),
        };
      });

      const pendingSnapshots = activePendingSignups.map((pendingSignup) => {
        const signupData = isPlainObject(pendingSignup.signupData) ? pendingSignup.signupData : {};
        const selectedPlan = normalizeOnboardingPlan(signupData.selectedPlan || signupData.planType || signupData.plan);
        if (isDateOnOrAfter(pendingSignup.createdAt, startOfToday)) summary.pendingSignupsCreatedToday += 1;
        if (isDateOnOrAfter(pendingSignup.createdAt, startOfSevenDays)) summary.pendingSignupsCreatedLast7Days += 1;
        if (selectedPlan && Object.prototype.hasOwnProperty.call(planBreakdown, selectedPlan)) {
          planBreakdown[selectedPlan] += 1;
        }
        stageBreakdown.EMAIL_VERIFICATION_PENDING += 1;

        return {
          id: pendingSignup.id,
          email: normalizeEmail(pendingSignup.email || ''),
          nomeClinica: String(signupData.nomeFantasia || '').trim(),
          responsavelNome: String(signupData.adminNome || '').trim(),
          selectedPlan,
          sendCount: Math.max(0, Number(pendingSignup.sendCount || 0)),
          verificationExpiresAt: normalizeIsoDate(pendingSignup.verificationExpiresAt),
          resendAvailableAt: normalizeIsoDate(pendingSignup.resendAvailableAt),
          createdAt: normalizeIsoDate(pendingSignup.createdAt),
          updatedAt: normalizeIsoDate(pendingSignup.updatedAt),
          stage: 'EMAIL_VERIFICATION_PENDING',
          stageLabel: 'Aguardando confirmacao de e-mail',
        };
      });

      const recentEntries = [
        ...pendingSnapshots.map((item) => ({
          entryType: 'pending_signup',
          sortDate: item.updatedAt || item.createdAt,
          ...item,
        })),
        ...clinicSnapshots.map((item) => ({
          entryType: 'clinic_onboarding',
          sortDate: item.onboardingUpdatedAt || item.updatedAt || item.createdAt,
          ...item,
        })),
      ]
        .sort((left, right) => String(right.sortDate || '').localeCompare(String(left.sortDate || '')))
        .slice(0, 30);

      return {
        summary,
        stageBreakdown,
        planBreakdown,
        recentEntries,
        clinicSnapshots,
      };
    } catch (error) {
      if (isMissingTableError(error)) {
        return {
          summary: {
            totalClinics: 0,
            clinicsCreatedToday: 0,
            clinicsCreatedLast7Days: 0,
            activePendingSignups: 0,
            pendingSignupsCreatedToday: 0,
            pendingSignupsCreatedLast7Days: 0,
            clinicsAwaitingProfile: 0,
            clinicsAwaitingPayment: 0,
            activeSubscriptions: 0,
            gracePeriodSubscriptions: 0,
            blockedSubscriptions: 0,
            canceledSubscriptions: 0,
          },
          stageBreakdown: {},
          planBreakdown: {},
          recentEntries: [],
          clinicSnapshots: [],
        };
      }
      throw error;
    }
  },

  getOperationalSettings: async ({ clinicId } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    if (!normalizedClinicId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
    }

    try {
      const stored = await clinicRepository.getOperationalSettings(normalizedClinicId);
      return normalizeOperationalSettings(stored || {});
    } catch (error) {
      if (isMissingTableError(error)) {
        return getDefaultOperationalSettings();
      }
      throw error;
    }
  },

  getOnboardingState: async ({ clinicId } = {}) => {
    const operationalSettings = await clinicService.getOperationalSettings({ clinicId });
    return normalizeOnboardingState(operationalSettings?.onboarding || {});
  },

  updateOperationalSettings: async ({ clinicId, patch = {} } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    if (!normalizedClinicId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
    }

    try {
      const current = await clinicRepository.getOperationalSettings(normalizedClinicId);
      const next = mergeOperationalSettings(current || {}, patch || {});
      const stored = await clinicRepository.updateOperationalSettings(normalizedClinicId, next);
      return normalizeOperationalSettings(stored || next);
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
      }
      throw error;
    }
  },

  updateOnboardingState: async ({ clinicId, patch = {} } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    if (!normalizedClinicId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
    }

    const safePatch = isPlainObject(patch) ? patch : {};
    const selectedPlanPatch = normalizeOnboardingPlan(safePatch.selectedPlan || safePatch.planType);
    const operationTypePatch = normalizeOnboardingOperationType(safePatch.operationType || safePatch.businessType);
    if (Object.prototype.hasOwnProperty.call(safePatch, 'selectedPlan') || Object.prototype.hasOwnProperty.call(safePatch, 'planType')) {
      if (safePatch.selectedPlan && !VALID_ONBOARDING_PLAN_TYPES.includes(selectedPlanPatch)) {
        throw new AppError(400, 'VALIDATION_ERROR', `selectedPlan must be one of: ${VALID_ONBOARDING_PLAN_TYPES.join(', ')}.`);
      }
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'operationType') || Object.prototype.hasOwnProperty.call(safePatch, 'businessType')) {
      if (safePatch.operationType && !VALID_ONBOARDING_OPERATION_TYPES.includes(operationTypePatch)) {
        throw new AppError(400, 'VALIDATION_ERROR', `operationType must be one of: ${VALID_ONBOARDING_OPERATION_TYPES.join(', ')}.`);
      }
    }
    const nowIso = new Date().toISOString();
    const currentOperationalSettings = await clinicService.getOperationalSettings({ clinicId: normalizedClinicId });
    const currentOnboarding = normalizeOnboardingState(currentOperationalSettings?.onboarding || {});
    const nextOnboarding = normalizeOnboardingState({
      ...currentOnboarding,
      ...(isPlainObject(safePatch) ? safePatch : {}),
      startedAt: currentOnboarding.startedAt || nowIso,
      updatedAt: nowIso,
      completedAt: safePatch?.completedAt === null
        ? ''
        : (String(safePatch?.completedAt || currentOnboarding.completedAt || '').trim()),
    });

    try {
      const stored = await clinicRepository.updateOperationalSettings(
        normalizedClinicId,
        mergeOperationalSettings(currentOperationalSettings || {}, {
          onboarding: nextOnboarding,
        })
      );
      return normalizeOnboardingState(stored?.onboarding || nextOnboarding);
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
      }
      throw error;
    }
  },

  getProfile: async ({ clinicId } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    if (!normalizedClinicId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
    }

    try {
      const clinic = await clinicRepository.findProfileById(normalizedClinicId);
      if (!clinic) {
        throw new AppError(404, 'CLINIC_NOT_FOUND', 'Clinic not found.');
      }
      return normalizeClinicProfile(clinic);
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
      }
      throw error;
    }
  },

  updateProfile: async ({ clinicId, patch = {} } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    if (!normalizedClinicId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
    }
    const safePatch = isPlainObject(patch) ? patch : {};

    try {
      const currentClinic = await clinicRepository.findProfileById(normalizedClinicId);
      if (!currentClinic) {
        throw new AppError(404, 'CLINIC_NOT_FOUND', 'Clinic not found.');
      }
      const currentProfile = normalizeClinicProfile(currentClinic);
      const mergedProfile = {
        ...currentProfile,
        ...safePatch,
        clinicId: normalizedClinicId,
        endereco: {
          ...currentProfile.endereco,
          ...(isPlainObject(safePatch.endereco) ? safePatch.endereco : {}),
        },
      };
      const nomeFantasia = String(mergedProfile.nomeFantasia || '').trim();
      if (!nomeFantasia) {
        throw new AppError(400, 'VALIDATION_ERROR', 'nomeFantasia is required.');
      }
      const clinicDocument = validateOptionalClinicDocument(
        mergedProfile.cnpj || mergedProfile.cnpjCpf || mergedProfile.cnpjOuCpf || ''
      );

      const mergedOperationalSettings = mergeOperationalSettings(currentClinic.operationalSettings || {}, {
        clinicProfile: {
          whatsapp: String(mergedProfile.whatsapp || '').trim(),
          cro: String(mergedProfile.cro || '').trim(),
          responsavelTecnico: String(mergedProfile.responsavelTecnico || '').trim(),
          logoDataUrlCache: String(mergedProfile.logoDataUrlCache || '').trim(),
          logoVersion: String(mergedProfile.logoVersion || '').trim(),
          endereco: {
            rua: String(mergedProfile?.endereco?.rua || '').trim(),
            numero: String(mergedProfile?.endereco?.numero || '').trim(),
            complemento: String(mergedProfile?.endereco?.complemento || '').trim(),
            bairro: String(mergedProfile?.endereco?.bairro || '').trim(),
            cidade: String(mergedProfile?.endereco?.cidade || '').trim(),
            uf: String(mergedProfile?.endereco?.uf || mergedProfile?.endereco?.estado || '').trim(),
            cep: String(mergedProfile?.endereco?.cep || '').trim(),
          },
        },
      });

      const updated = await clinicRepository.updateProfile(normalizedClinicId, {
        nomeFantasia,
        razaoSocial: String(mergedProfile.razaoSocial || '').trim() || nomeFantasia,
        cnpjCpf: clinicDocument,
        email: String(mergedProfile.email || '').trim(),
        telefoneComercial: String(mergedProfile.telefone || '').trim(),
        endereco: buildClinicAddressLine(mergedProfile.endereco),
        operationalSettings: mergedOperationalSettings,
      });
      return normalizeClinicProfile(updated);
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
      }
      throw error;
    }
  },

  exportData: async ({ clinicId } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    if (!normalizedClinicId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
    }
    try {
      const profile = await clinicService.getProfile({ clinicId: normalizedClinicId });
      const operationalSettings = await clinicService.getOperationalSettings({ clinicId: normalizedClinicId });
      return {
        format: 'voithos-clinic-export',
        version: 1,
        exportedAt: new Date().toISOString(),
        clinic: {
          nomeFantasia: profile.nomeFantasia || '',
          razaoSocial: profile.razaoSocial || '',
          cnpjCpf: profile.cnpjCpf || '',
          telefone: profile.telefone || '',
          email: profile.email || '',
          cro: profile.cro || '',
          responsavelTecnico: profile.responsavelTecnico || '',
          whatsapp: profile.whatsapp || '',
          logoDataUrlCache: profile.logoDataUrlCache || '',
          logoVersion: profile.logoVersion || '',
          endereco: profile.endereco || {},
        },
        operationalSettings,
      };
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
      }
      throw error;
    }
  },

  previewImportData: async ({ clinicId, payload = {} } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    if (!normalizedClinicId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
    }
    try {
      const clinic = await clinicRepository.findProfileById(normalizedClinicId);
      if (!clinic) {
        throw new AppError(404, 'CLINIC_NOT_FOUND', 'Clinic not found.');
      }
      return buildClinicImportPreview(payload);
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
      }
      throw error;
    }
  },

  applyImportData: async ({ clinicId, payload = {} } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    if (!normalizedClinicId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
    }
    const preview = buildClinicImportPreview(payload);
    const { profile, settings } = extractClinicImportPayload(payload);
    try {
      const currentClinic = await clinicRepository.findProfileById(normalizedClinicId);
      if (!currentClinic) {
        throw new AppError(404, 'CLINIC_NOT_FOUND', 'Clinic not found.');
      }

      const hasProfilePatch = Object.keys(profile).length > 0;
      const hasSettingsPatch = Object.keys(settings).length > 0;
      const currentProfile = normalizeClinicProfile(currentClinic);
      const currentOperationalSettings = normalizeOperationalSettings(currentClinic.operationalSettings || {});
      const nextProfile = hasProfilePatch
        ? {
            ...currentProfile,
            ...profile,
            clinicId: normalizedClinicId,
            endereco: {
              ...currentProfile.endereco,
              ...(isPlainObject(profile.endereco) ? profile.endereco : {}),
            },
          }
        : currentProfile;

      if (hasProfilePatch) {
        const nomeFantasia = String(nextProfile.nomeFantasia || '').trim();
        if (!nomeFantasia) {
          throw new AppError(400, 'VALIDATION_ERROR', 'nomeFantasia is required.');
        }
        validateOptionalClinicDocument(
          nextProfile.cnpjCpf || nextProfile.cnpj || nextProfile.cnpjOuCpf || ''
        );
      }

      const mergedOperationalSettings = hasSettingsPatch || hasProfilePatch
        ? mergeOperationalSettings(currentOperationalSettings, {
            ...(hasSettingsPatch ? settings : {}),
            clinicProfile: {
              whatsapp: String(nextProfile.whatsapp || '').trim(),
              cro: String(nextProfile.cro || '').trim(),
              responsavelTecnico: String(nextProfile.responsavelTecnico || '').trim(),
              logoDataUrlCache: String(nextProfile.logoDataUrlCache || '').trim(),
              logoVersion: String(nextProfile.logoVersion || '').trim(),
              endereco: {
                ...(isPlainObject(nextProfile.endereco) ? {
                  rua: String(nextProfile.endereco.rua || '').trim(),
                  numero: String(nextProfile.endereco.numero || '').trim(),
                  complemento: String(nextProfile.endereco.complemento || '').trim(),
                  bairro: String(nextProfile.endereco.bairro || '').trim(),
                  cidade: String(nextProfile.endereco.cidade || '').trim(),
                  uf: String(nextProfile.endereco.uf || nextProfile.endereco.estado || '').trim(),
                  cep: String(nextProfile.endereco.cep || '').trim(),
                } : {}),
              },
            },
          })
        : currentOperationalSettings;

      const updatedClinic = await prisma.$transaction(async (tx) => {
        const updateData = {};
        if (hasProfilePatch) {
          updateData.nomeFantasia = String(nextProfile.nomeFantasia || '').trim();
          updateData.razaoSocial = String(nextProfile.razaoSocial || '').trim() || String(nextProfile.nomeFantasia || '').trim();
          updateData.cnpjCpf = validateOptionalClinicDocument(
            nextProfile.cnpjCpf || nextProfile.cnpj || nextProfile.cnpjOuCpf || ''
          );
          updateData.email = String(nextProfile.email || '').trim();
          updateData.telefoneComercial = String(nextProfile.telefone || '').trim();
          updateData.endereco = buildClinicAddressLine(nextProfile.endereco);
        }
        updateData.operationalSettings = mergedOperationalSettings;

        return tx.clinic.update({
          where: { id: normalizedClinicId },
          data: updateData,
          select: {
            id: true,
            nomeFantasia: true,
            razaoSocial: true,
            cnpjCpf: true,
            email: true,
            telefoneComercial: true,
            endereco: true,
            operationalSettings: true,
          },
        });
      });

      return {
        applied: true,
        preview,
        profile: normalizeClinicProfile(updatedClinic),
        operationalSettings: normalizeOperationalSettings(updatedClinic.operationalSettings || {}),
      };
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
      }
      throw error;
    }
  },

  listCampaigns: async ({ clinicId } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    if (!normalizedClinicId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
    }
    try {
      const clinic = await clinicRepository.findProfileById(normalizedClinicId);
      if (!clinic) {
        throw new AppError(404, 'CLINIC_NOT_FOUND', 'Clinic not found.');
      }
      return normalizeClinicCampaigns(clinic?.operationalSettings?.campaigns, normalizedClinicId);
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
      }
      throw error;
    }
  },

  replaceCampaigns: async ({ clinicId, campaigns = [] } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    if (!normalizedClinicId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
    }
    try {
      const clinic = await clinicRepository.findProfileById(normalizedClinicId);
      if (!clinic) {
        throw new AppError(404, 'CLINIC_NOT_FOUND', 'Clinic not found.');
      }
      const normalizedCampaigns = normalizeClinicCampaigns(campaigns, normalizedClinicId).map((item) => ({
        ...item,
        clinicId: normalizedClinicId,
      }));
      const mergedOperationalSettings = mergeOperationalSettings(clinic.operationalSettings || {}, {
        campaigns: normalizedCampaigns,
      });
      await clinicRepository.updateOperationalSettings(normalizedClinicId, mergedOperationalSettings);
      return normalizedCampaigns;
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
      }
      throw error;
    }
  },

  createCampaign: async ({ clinicId, payload = {}, actorName = '' } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    if (!normalizedClinicId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
    }
    try {
      const clinic = await clinicRepository.findProfileById(normalizedClinicId);
      if (!clinic) {
        throw new AppError(404, 'CLINIC_NOT_FOUND', 'Clinic not found.');
      }
      const existing = normalizeClinicCampaigns(clinic?.operationalSettings?.campaigns, normalizedClinicId);
      const now = new Date().toISOString();
      const created = normalizeCampaignRecord(payload, normalizedClinicId, {
        id: String(payload?.id || generateCampaignId()).trim(),
        origem: 'clinica',
        clinicId: normalizedClinicId,
        criadoPor: String(payload?.criadoPor || actorName || '').trim(),
        dataCriacao: String(payload?.dataCriacao || now).trim(),
        dataAtualizacao: now,
      });
      const next = [created, ...existing.filter((item) => item.id !== created.id)];
      const mergedOperationalSettings = mergeOperationalSettings(clinic.operationalSettings || {}, {
        campaigns: next,
      });
      await clinicRepository.updateOperationalSettings(normalizedClinicId, mergedOperationalSettings);
      return created;
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
      }
      throw error;
    }
  },

  updateCampaign: async ({ clinicId, id, changes = {}, actorName = '' } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const normalizedId = String(id || '').trim();
    if (!normalizedClinicId || !normalizedId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId and id are required.');
    }
    try {
      const clinic = await clinicRepository.findProfileById(normalizedClinicId);
      if (!clinic) {
        throw new AppError(404, 'CLINIC_NOT_FOUND', 'Clinic not found.');
      }
      const existing = normalizeClinicCampaigns(clinic?.operationalSettings?.campaigns, normalizedClinicId);
      const index = existing.findIndex((item) => item.id === normalizedId);
      if (index === -1) {
        throw new AppError(404, 'CAMPAIGN_NOT_FOUND', 'Campaign not found.');
      }
      const current = existing[index];
      const updated = normalizeCampaignRecord({
        ...current,
        ...(isPlainObject(changes) ? changes : {}),
        id: normalizedId,
        clinicId: normalizedClinicId,
        origem: 'clinica',
        criadoPor: current.criadoPor || String(actorName || '').trim(),
        dataCriacao: current.dataCriacao || '',
        dataAtualizacao: new Date().toISOString(),
      }, normalizedClinicId);
      const next = [...existing];
      next[index] = updated;
      const mergedOperationalSettings = mergeOperationalSettings(clinic.operationalSettings || {}, {
        campaigns: next,
      });
      await clinicRepository.updateOperationalSettings(normalizedClinicId, mergedOperationalSettings);
      return updated;
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
      }
      throw error;
    }
  },

  deleteCampaign: async ({ clinicId, id } = {}) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const normalizedId = String(id || '').trim();
    if (!normalizedClinicId || !normalizedId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId and id are required.');
    }
    try {
      const clinic = await clinicRepository.findProfileById(normalizedClinicId);
      if (!clinic) {
        throw new AppError(404, 'CLINIC_NOT_FOUND', 'Clinic not found.');
      }
      const existing = normalizeClinicCampaigns(clinic?.operationalSettings?.campaigns, normalizedClinicId);
      const next = existing.filter((item) => item.id !== normalizedId);
      if (next.length === existing.length) {
        throw new AppError(404, 'CAMPAIGN_NOT_FOUND', 'Campaign not found.');
      }
      const mergedOperationalSettings = mergeOperationalSettings(clinic.operationalSettings || {}, {
        campaigns: next,
      });
      await clinicRepository.updateOperationalSettings(normalizedClinicId, mergedOperationalSettings);
      return { success: true };
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
      }
      throw error;
    }
  },

  createWithAdmin: async ({ clinic = {}, admin = {} } = {}) => {
    const nomeFantasia = String(clinic?.nomeFantasia || '').trim();
    const razaoSocial = String(clinic?.razaoSocial || '').trim() || nomeFantasia;
    const clinicEmail = normalizeEmail(clinic?.emailClinica || clinic?.email || '');
    const clinicPhone = String(clinic?.telefone || clinic?.telefoneComercial || '').trim();
    const clinicWhatsapp = String(clinic?.whatsapp || '').trim();
    const clinicAddress = String(clinic?.endereco || '').trim();
    const adminNome = String(admin?.nome || '').trim();
    const adminEmail = normalizeEmail(admin?.email || '');
    const document = validateDocument(
      inferDocumentType(clinic?.cnpjOuCpf || clinic?.cnpjCpf || ''),
      clinic?.cnpjOuCpf || clinic?.cnpjCpf || ''
    );

    if (!nomeFantasia || !adminNome || !adminEmail || !document.documentNumber) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinic.nomeFantasia, clinic.cnpjOuCpf, admin.nome and admin.email are required.');
    }

    try {
      return await prisma.$transaction(async (tx) => {
        const duplicatedClinicByDocument = await tx.clinic.findFirst({
          where: { cnpjCpf: document.documentNumber },
        });
        if (duplicatedClinicByDocument) {
          throw new AppError(409, 'CLINIC_DOCUMENT_EXISTS', 'CPF/CNPJ already exists.');
        }

        if (clinicEmail) {
          const duplicatedClinicByEmail = await tx.clinic.findFirst({
            where: { email: clinicEmail },
          });
          if (duplicatedClinicByEmail) {
            throw new AppError(409, 'CLINIC_EMAIL_EXISTS', 'Clinic email already exists.');
          }
        }

        const duplicatedUser = await tx.user.findUnique({
          where: { email: adminEmail },
        });
        if (duplicatedUser) {
          throw new AppError(409, 'USER_EMAIL_EXISTS', 'Admin email already exists.');
        }

        const createdClinic = await tx.clinic.create({
          data: {
            nomeFantasia,
            razaoSocial,
            cnpjCpf: document.documentNumber,
            email: clinicEmail || null,
            telefoneComercial: clinicPhone || null,
            endereco: clinicAddress || null,
            operationalSettings: mergeOperationalSettings(getDefaultOperationalSettings(), {
              clinicProfile: {
                whatsapp: clinicWhatsapp,
              },
            }),
          },
        });

        const tempPassword = crypto.randomBytes(6).toString('hex');
        const passwordHash = await authService.hashPassword(tempPassword);
        await tx.user.create({
          data: {
            clinicId: createdClinic.id,
            nome: adminNome,
            email: adminEmail,
            passwordHash,
            role: 'ADMIN',
            isClinicAdmin: true,
            ativo: true,
          },
        });

        return {
          clinic: {
            ...createdClinic,
            clinicId: createdClinic.id,
          },
          credentials: {
            email: adminEmail,
            senhaTemporaria: tempPassword,
          },
        };
      });
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
      }
      throw error;
    }
  },

  previewPatientImportData: async ({ clinicId, payload = {} } = {}) => {
    try {
      return await buildPatientImportPreview({ clinicId, payload });
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
      }
      throw error;
    }
  },

  applyPatientImportData: async ({ clinicId, payload = {} } = {}) => {
    return applyPatientImport({ clinicId, payload });
  },

  previewAppointmentImportData: async ({ clinicId, payload = {} } = {}) => {
    try {
      return await buildAppointmentImportPreview({ clinicId, payload });
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
      }
      throw error;
    }
  },

  applyAppointmentImportData: async ({ clinicId, payload = {} } = {}) => {
    return applyAppointmentImport({ clinicId, payload });
  },

  previewClinicalImportData: async ({ clinicId, payload = {} } = {}) => {
    try {
      return await buildClinicalImportPreview({ clinicId, payload });
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
      }
      throw error;
    }
  },

  applyClinicalImportData: async ({ clinicId, payload = {} } = {}) => {
    return applyClinicalImport({ clinicId, payload });
  },

  previewCashflowImportData: async ({ clinicId, payload = {} } = {}) => {
    try {
      return await buildCashflowImportPreview({ clinicId, payload });
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
      }
      throw error;
    }
  },

  applyCashflowImportData: async ({ clinicId, payload = {} } = {}) => {
    return applyCashflowImport({ clinicId, payload });
  },

  previewProceduresImportData: async ({ clinicId, payload = {} } = {}) => {
    try {
      return await buildProceduresImportPreview({ clinicId, payload });
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
      }
      throw error;
    }
  },

  applyProceduresImportData: async ({ clinicId, payload = {} } = {}) => {
    return applyProceduresImport({ clinicId, payload });
  },

  publicSignup: async (payload = {}) => {
    const nomeFantasia = String(payload?.nomeConta || payload?.nomeClinica || payload?.nomeFantasia || '').trim();
    const adminNome = String(payload?.responsavelNome || payload?.adminNome || payload?.nomeResponsavel || '').trim();
    const adminEmail = normalizeEmail(payload?.adminEmail || payload?.email || '');
    const password = String(payload?.password || payload?.senha || '').trim();
    const passwordConfirmation = String(payload?.passwordConfirmation || payload?.confirmarSenha || '').trim();
    const clinicEmail = normalizeEmail(payload?.clinicEmail || adminEmail || '');
    const clinicPhone = String(payload?.telefone || payload?.phone || payload?.telefoneComercial || '').trim();
    const clinicAddress = {
      cep: String(payload?.cep || payload?.postalCode || '').trim(),
      rua: String(payload?.rua || payload?.logradouro || payload?.address || '').trim(),
      numero: String(payload?.numero || payload?.addressNumber || '').trim(),
      complemento: String(payload?.complemento || payload?.addressComplement || '').trim(),
      bairro: String(payload?.bairro || payload?.province || '').trim(),
      cidade: String(payload?.cidade || payload?.city || '').trim(),
      uf: String(payload?.uf || payload?.estado || payload?.state || '').trim().toUpperCase().slice(0, 2),
    };
    const selectedPlan = normalizeOnboardingPlan(payload?.selectedPlan || payload?.planType || payload?.plan || '');
    const document = validateDocument(payload?.documentType, payload?.documentNumber);

    if (!nomeFantasia || !adminNome || !adminEmail || !password || !passwordConfirmation) {
      throw new AppError(400, 'VALIDATION_ERROR', 'documentType, documentNumber, nomeClinica, responsavelNome, adminEmail, password and passwordConfirmation are required.');
    }

    if (password.length < 6) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Password must contain at least 6 characters.');
    }

    if (password !== passwordConfirmation) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Password confirmation does not match.');
    }

    if (payload?.selectedPlan != null || payload?.planType != null || payload?.plan != null) {
      if (!VALID_ONBOARDING_PLAN_TYPES.includes(selectedPlan)) {
        throw new AppError(400, 'VALIDATION_ERROR', `selectedPlan must be one of: ${VALID_ONBOARDING_PLAN_TYPES.join(', ')}.`);
      }
    }

    try {
      console.info('[signup][clinic-service]', {
        stage: 'signup_started',
        email: adminEmail,
        clinic: nomeFantasia,
      });
      let emailVerificationCode = generateEmailVerificationCode();
      let emailVerificationExpiresAt = getEmailVerificationExpiresAt();
      let resendAvailableAt = getEmailVerificationResendAvailableAt(1);
      let sendCount = 1;
      let shouldSendVerificationEmail = true;
      let reusedActiveVerification = false;
      const duplicatedClinic = await clinicRepository.findByDocument(document.documentNumber);
      console.info('[signup][clinic-service]', {
        stage: 'clinic_lookup_completed',
        email: adminEmail,
        clinic: nomeFantasia,
        status: duplicatedClinic ? 'duplicate_found' : 'available',
      });
      if (duplicatedClinic) {
        throw new AppError(409, 'CLINIC_DOCUMENT_EXISTS', 'CPF/CNPJ already exists.');
      }

      const duplicatedUser = await userRepository.findByEmail(adminEmail);
      console.info('[signup][clinic-service]', {
        stage: 'user_lookup_completed',
        email: adminEmail,
        clinic: nomeFantasia,
        status: duplicatedUser ? 'duplicate_found' : 'available',
      });
      if (duplicatedUser) {
        throw new AppError(409, 'USER_EMAIL_EXISTS', 'Admin email already exists.');
      }

      const existingPendingSignup = await pendingSignupRepository.findByEmail(adminEmail);
      if (existingPendingSignup) {
        const pendingExpiresAt = existingPendingSignup.verificationExpiresAt
          ? new Date(existingPendingSignup.verificationExpiresAt).getTime()
          : 0;
        const existingResendAt = existingPendingSignup.resendAvailableAt
          ? new Date(existingPendingSignup.resendAvailableAt).getTime()
          : 0;
        const hasActiveVerification = pendingExpiresAt > Date.now();
        const isResendLocked = existingResendAt > Date.now();

        if (hasActiveVerification && isResendLocked) {
          reusedActiveVerification = true;
          shouldSendVerificationEmail = false;
          emailVerificationCode = String(existingPendingSignup.verificationCode || emailVerificationCode).trim();
          emailVerificationExpiresAt = existingPendingSignup.verificationExpiresAt
            ? new Date(existingPendingSignup.verificationExpiresAt)
            : emailVerificationExpiresAt;
          resendAvailableAt = existingPendingSignup.resendAvailableAt
            ? new Date(existingPendingSignup.resendAvailableAt)
            : resendAvailableAt;
          sendCount = Math.max(1, Number(existingPendingSignup.sendCount || 1));
        } else {
          sendCount = hasActiveVerification
            ? Math.max(1, Number(existingPendingSignup.sendCount || 0) + 1)
            : 1;
          resendAvailableAt = getEmailVerificationResendAvailableAt(sendCount);
        }
      }

      const passwordHash = await authService.hashPassword(password);
      const pendingSignup = await pendingSignupRepository.upsertByEmail({
        email: adminEmail,
        passwordHash,
        signupData: {
          documentType: document.documentType,
          documentNumber: document.documentNumber,
          nomeFantasia,
          adminNome,
          adminEmail,
          clinicEmail,
          clinicPhone,
          clinicAddress,
          selectedPlan,
        },
        verificationCode: emailVerificationCode,
        verificationExpiresAt: emailVerificationExpiresAt,
        resendAvailableAt,
        sendCount,
      });
      console.info('[signup][clinic-service]', {
        stage: 'pending_signup_saved',
        email: adminEmail,
        clinic: nomeFantasia,
        sendCount: Number(pendingSignup?.sendCount || 0),
      });

      if (shouldSendVerificationEmail) {
        try {
          console.info('[signup][clinic-service]', {
            stage: 'verification_email_send_started',
            email: adminEmail,
            clinic: nomeFantasia,
            sendCount,
          });
          const emailResult = await emailService.sendVerificationEmail(adminEmail, emailVerificationCode);
          console.info('[email] Signup verification email accepted', {
            stage: 'verification_email_send_completed',
            email: adminEmail,
            resendEmailId: emailResult?.data?.id || '',
          });
        } catch (emailError) {
          console.error('[email] Failed to send signup verification email', {
            stage: 'verification_email_send_failed',
            email: adminEmail,
            error: emailError?.message || emailError,
            resendError: emailError?.resendError || null,
          });
          throw new AppError(502, 'SIGNUP_VERIFICATION_EMAIL_FAILED', 'Nao foi possivel enviar o codigo de confirmacao agora.');
        }
      }

      return {
        pendingVerification: true,
        emailVerificationSent: shouldSendVerificationEmail,
        reusedActiveVerification,
        resendAvailableAt: pendingSignup?.resendAvailableAt || null,
        verificationExpiresAt: pendingSignup?.verificationExpiresAt || null,
        sendCount: Number(pendingSignup?.sendCount || 0),
        user: {
          email: adminEmail,
          emailVerified: false,
          emailVerificationPending: true,
          role: 'ADMIN',
          isClinicAdmin: true,
        },
      };
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
      }
      throw error;
    }
  },
};

module.exports = { clinicService, getDefaultOperationalSettings };
