const crypto = require('crypto');
const { prisma } = require('../db/prisma');
const { clinicRepository } = require('../repositories/clinicRepository');
const { userRepository } = require('../repositories/userRepository');
const { authService, SESSION_TTL_DAYS } = require('./authService');
const { AppError } = require('../errors/AppError');

const isMissingTableError = (error) => error && error.code === 'P2021';
const normalizeDocument = (value) => String(value || '').replace(/\D/g, '');
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
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
  clinicProfile: {
    whatsapp: '',
    cro: '',
    responsavelTecnico: '',
    endereco: {
      rua: '',
      numero: '',
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
    endereco: {
      rua: String(address.rua || '').trim(),
      numero: String(address.numero || '').trim(),
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
    cnpj,
    email,
    telefone,
    whatsapp: extras.whatsapp,
    cro: extras.cro,
    responsavelTecnico: extras.responsavelTecnico,
    endereco: structuredAddress,
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
  const line2 = [safe.bairro, safe.cidade, safe.uf].filter(Boolean).join(' - ');
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
    clinicProfile: nextClinicProfile,
    campaigns: Object.prototype.hasOwnProperty.call(safePatch, 'campaigns')
      ? normalizeClinicCampaigns(safePatch.campaigns)
      : normalizeClinicCampaigns(safeCurrent.campaigns),
    anamneseModels: Object.prototype.hasOwnProperty.call(safePatch, 'anamneseModels')
      ? (Array.isArray(safePatch.anamneseModels) ? safePatch.anamneseModels : [])
      : (Array.isArray(safeCurrent.anamneseModels) ? safeCurrent.anamneseModels : []),
    documentModels: Object.prototype.hasOwnProperty.call(safePatch, 'documentModels')
      ? (Array.isArray(safePatch.documentModels) ? safePatch.documentModels : [])
      : (Array.isArray(safeCurrent.documentModels) ? safeCurrent.documentModels : []),
    proceduresCatalog: Object.prototype.hasOwnProperty.call(safePatch, 'proceduresCatalog')
      ? (Array.isArray(safePatch.proceduresCatalog) ? safePatch.proceduresCatalog : [])
      : (Array.isArray(safeCurrent.proceduresCatalog) ? safeCurrent.proceduresCatalog : []),
    receituario: Object.prototype.hasOwnProperty.call(safePatch, 'receituario')
      ? normalizeReceituario({
          ...(isPlainObject(safeCurrent.receituario) ? safeCurrent.receituario : {}),
          ...(isPlainObject(safePatch.receituario) ? safePatch.receituario : {}),
        }, nextClinicProfile)
      : normalizeReceituario(safeCurrent.receituario, nextClinicProfile),
  });
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

      const mergedOperationalSettings = mergeOperationalSettings(currentClinic.operationalSettings || {}, {
        clinicProfile: {
          whatsapp: String(mergedProfile.whatsapp || '').trim(),
          cro: String(mergedProfile.cro || '').trim(),
          responsavelTecnico: String(mergedProfile.responsavelTecnico || '').trim(),
          endereco: {
            rua: String(mergedProfile?.endereco?.rua || '').trim(),
            numero: String(mergedProfile?.endereco?.numero || '').trim(),
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
        cnpjCpf: String(mergedProfile.cnpj || mergedProfile.cnpjCpf || '').trim(),
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

  publicSignup: async (payload = {}) => {
    const nomeFantasia = String(payload?.nomeConta || payload?.nomeClinica || payload?.nomeFantasia || '').trim();
    const adminNome = String(payload?.responsavelNome || payload?.adminNome || payload?.nomeResponsavel || '').trim();
    const adminEmail = normalizeEmail(payload?.adminEmail || payload?.email || '');
    const password = String(payload?.password || payload?.senha || '').trim();
    const passwordConfirmation = String(payload?.passwordConfirmation || payload?.confirmarSenha || '').trim();
    const clinicEmail = normalizeEmail(payload?.clinicEmail || adminEmail || '');
    const clinicPhone = String(payload?.telefone || payload?.phone || payload?.telefoneComercial || '').trim();
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

    try {
      const result = await prisma.$transaction(async (tx) => {
        const duplicatedClinic = await tx.clinic.findFirst({
          where: { cnpjCpf: document.documentNumber },
        });
        if (duplicatedClinic) {
          throw new AppError(409, 'CLINIC_DOCUMENT_EXISTS', 'CPF/CNPJ already exists.');
        }

        const duplicatedUser = await tx.user.findUnique({
          where: { email: adminEmail },
        });
        if (duplicatedUser) {
          throw new AppError(409, 'USER_EMAIL_EXISTS', 'Admin email already exists.');
        }

        const passwordHash = await authService.hashPassword(password);
        const createdClinic = await tx.clinic.create({
          data: {
            nomeFantasia,
            razaoSocial: nomeFantasia,
            cnpjCpf: document.documentNumber,
            email: clinicEmail || null,
            telefoneComercial: clinicPhone || null,
            endereco: null,
          },
        });

        const createdUser = await tx.user.create({
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

        const token = crypto.randomUUID();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + SESSION_TTL_DAYS);

        const session = await tx.session.create({
          data: {
            userId: createdUser.id,
            token,
            expiresAt,
          },
        });

        return {
          token: session.token,
          clinic: {
            ...createdClinic,
            clinicId: createdClinic.id,
          },
          user: {
            id: createdUser.id,
            nome: createdUser.nome,
            email: createdUser.email,
            role: createdUser.role,
            clinicId: createdUser.clinicId,
            isClinicAdmin: createdUser.isClinicAdmin === true,
          },
        };
      });

      return result;
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
      }
      throw error;
    }
  },
};

module.exports = { clinicService, getDefaultOperationalSettings };
