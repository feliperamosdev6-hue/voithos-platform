(function () {
  let DEFAULT_BASE = '';
  try {
    DEFAULT_BASE = localStorage.getItem('apiBase') || '';
  } catch (_error) {
    // localStorage indisponível (navegação privada, origem insegura, etc)
    DEFAULT_BASE = '';
  }
  const WEB_SESSION_TOKEN_KEY = 'voithos.web.session.token';
  const WEB_SESSION_USER_KEY = 'voithos.web.session.user';
  const WEB_SESSION_CLINIC_KEY = 'voithos.web.session.clinic';
  let staticProcedureCatalogCache = null;
  let staticProcedureCatalogLoading = null;

  const cleanText = (value) => String(value || '').trim();
  const getBaseUrl = () => {
    const runtimeBase = cleanText(window.__APP_API_BASE__ || '');
    if (runtimeBase) return runtimeBase.replace(/\/+$/, '');
    if (window.__VOITHOS_DEPLOY_TARGET__ === 'render') return '';
    return cleanText(DEFAULT_BASE || '').replace(/\/+$/, '');
  };
  const getBaseDiagnostics = () => ({
    resolvedBaseUrl: getBaseUrl(),
    runtimeBaseUrl: cleanText(window.__APP_API_BASE__ || ''),
    storageBaseUrl: cleanText(DEFAULT_BASE || ''),
  });

  const logWebAuthDiagnostic = (stage, details = {}) => {
    console.info('[web-auth][adapter]', {
      stage,
      ...getBaseDiagnostics(),
      endpoint: cleanText(details.endpoint || ''),
      method: cleanText(details.method || ''),
      status: cleanText(details.status || ''),
      fallback: details.fallback === true,
      email: maskEmailForDiagnostics(details.email || ''),
      error: cleanText(details.error || ''),
      responseStatus: details.responseStatus || '',
    });
  };

  const maskEmailForDiagnostics = (email) => {
    const [localPart = '', domain = ''] = cleanText(email).toLowerCase().split('@');
    if (!localPart || !domain) return '';
    const localMask = localPart.length <= 2
      ? `${localPart[0] || '*'}*`
      : `${localPart.slice(0, 2)}***`;
    return `${localMask}@${domain}`;
  };

  const logPasswordResetDiagnostic = (stage, payload = {}, extra = {}) => {
    console.info('[password-reset][web-adapter]', {
      stage,
      endpoint: extra.endpoint || '',
      baseUrl: getBaseUrl(),
      email: maskEmailForDiagnostics(payload?.email || payload?.login || payload?.adminEmail || ''),
      status: extra.status || '',
      fallback: extra.fallback === true,
      error: extra.error || '',
    });
  };

  const notImplemented = async (name) => {
    throw new Error(name + ' ainda nao implementado no backend web.');
  };

  const LEGACY_TO_CENTRAL_STATUS = {
    em_aberto: 'AGENDADO',
    confirmado: 'CONFIRMADO',
    realizado: 'CONCLUIDO',
    nao_compareceu: 'NAO_COMPARECEU',
    cancelado: 'CANCELADO',
    remarcar: 'REMARCAR',
  };

  const LEGACY_TO_CENTRAL_ATTENDANCE = {
    compareceu: 'ATTENDED',
    nao_compareceu: 'NO_SHOW',
    pendente: '',
  };

  const CENTRAL_TO_LEGACY_STATUS = {
    AGENDADO: 'em_aberto',
    CONFIRMADO: 'confirmado',
    CONCLUIDO: 'realizado',
    NAO_COMPARECEU: 'nao_compareceu',
    CANCELADO: 'cancelado',
    REMARCAR: 'remarcar',
  };

  const CENTRAL_TO_LEGACY_ATTENDANCE = {
    ATTENDED: 'compareceu',
    NO_SHOW: 'nao_compareceu',
  };

  const normalizeDigits = (value) => String(value || '').replace(/\D/g, '');
  const normalizeDateOnly = (value) => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
  };

  const normalizeTimeOnly = (value) => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(11, 16);
  };

  const normalizeRangeBoundary = (value, endOfDay = false) => {
    const raw = cleanText(value);
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return `${raw}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`;
    }
    return raw;
  };

  const combineDateTime = (dateValue, timeValue) => {
    const date = cleanText(dateValue);
    const time = cleanText(timeValue);
    if (!date || !time) return null;
    const iso = new Date(`${date}T${time}:00.000Z`);
    if (Number.isNaN(iso.getTime())) return null;
    return iso.toISOString();
  };

  const mapCentralPatientToLegacy = (patient = {}) => ({
    ...patient,
    id: patient.id,
    prontuario: patient.id,
    nome: patient.nome || '',
    fullName: patient.nome || '',
    phone: patient.telefone || '',
    address: patient.endereco || '',
    notes: patient.notes || patient.observacoes || '',
    dentistaId: patient.dentistaId || '',
    dentistaNome: patient.dentistaNome || '',
    birthDate: patient.dataNascimento ? normalizeDateOnly(patient.dataNascimento) : '',
    dataNascimento: patient.dataNascimento ? normalizeDateOnly(patient.dataNascimento) : '',
    allowsMessages: patient.allowsMessages !== false,
    lastBirthdayMessageAt: patient.lastBirthdayMessageAt || '',
    birthdayMessageYear: Number.isFinite(Number(patient.birthdayMessageYear))
      ? Math.trunc(Number(patient.birthdayMessageYear))
      : 0,
  });

  const normalizeLegacyPatientPayload = (payload = {}) => ({
    nome: payload.nome || payload.fullName || '',
    cpf: payload.cpf || '',
    rg: payload.rg || '',
    dataNascimento: payload.dataNascimento || payload.birthDate || null,
    telefone: payload.telefone || payload.phone || payload.celular || payload.whatsapp || '',
    email: payload.email || '',
    endereco: payload.endereco || payload.address || '',
    notes: payload.notes || payload.observacoes || '',
    observacoes: payload.observacoes || payload.notes || '',
    dentistaId: payload.dentistaId || '',
    dentistaNome: payload.dentistaNome || '',
    allowsMessages: payload.allowsMessages !== undefined ? payload.allowsMessages !== false : true,
    lastBirthdayMessageAt: payload.lastBirthdayMessageAt || null,
    birthdayMessageYear: Number.isFinite(Number(payload.birthdayMessageYear))
      ? Math.trunc(Number(payload.birthdayMessageYear))
      : null,
  });

  const buildPatientMap = (patients = []) => {
    const map = new Map();
    (patients || []).forEach((patient) => {
      [patient?.id, patient?.prontuario, patient?.cpf]
        .map((value) => cleanText(value))
        .filter(Boolean)
        .forEach((key) => map.set(key, patient));
    });
    return map;
  };

  const mapCentralAppointmentToLegacy = (appointment = {}, patientMap = new Map()) => {
    const patient = patientMap.get(cleanText(appointment.patientId)) || appointment.patient || {};
    const centralStatus = cleanText(appointment.status).toUpperCase();
    const derivedAttendanceStatus = CENTRAL_TO_LEGACY_ATTENDANCE[cleanText(appointment.attendanceStatus).toUpperCase()]
      || (centralStatus === 'CONCLUIDO' ? 'compareceu' : '')
      || (centralStatus === 'NAO_COMPARECEU' ? 'nao_compareceu' : '');
    const legacyStatus = ['CONCLUIDO', 'NAO_COMPARECEU'].includes(centralStatus)
      ? (appointment.confirmado === true ? 'confirmado' : 'em_aberto')
      : (CENTRAL_TO_LEGACY_STATUS[centralStatus] || 'em_aberto');

    return {
      id: appointment.id,
      clinicId: appointment.clinicId,
      pacienteId: appointment.patientId,
      patientId: appointment.patientId,
      prontuario: appointment.patientId,
      pacienteNome: patient?.nome || '',
      paciente: patient?.nome || '',
      telefone: patient?.telefone || '',
      dentistaId: appointment.profissionalId || '',
      dentistaNome: appointment.profissionalNome || '',
      data: normalizeDateOnly(appointment.dataHora),
      horaInicio: normalizeTimeOnly(appointment.dataHora),
      horaFim: appointment.horaFim ? normalizeTimeOnly(appointment.horaFim) : normalizeTimeOnly(appointment.dataHora),
      tipo: appointment.tipo || 'procedimento',
      status: legacyStatus,
      attendanceStatus: derivedAttendanceStatus,
      observacoes: appointment.observacoes || '',
      marcadorId: appointment.marcadorId || '',
      marcadorNome: appointment.marcadorNome || '',
      marcadorCor: appointment.marcadorCor || '',
      confirmado: appointment.confirmado === true,
      confirmationPending: appointment.confirmationPending === true,
      lastConfirmationSentAt: appointment.lastConfirmationSentAt || '',
      lastConfirmationOutboundId: appointment.lastConfirmationOutboundId || '',
    };
  };

  const matchesPatientQuery = (patient = {}, query = '') => {
    const normalizedQuery = cleanText(query).toLowerCase();
    if (!normalizedQuery) return true;
    const haystack = [
      patient?.nome,
      patient?.fullName,
      patient?.cpf,
      patient?.telefone,
      patient?.email,
      patient?.prontuario,
    ]
      .map((value) => cleanText(value).toLowerCase())
      .join(' ');
    return haystack.includes(normalizedQuery);
  };

  const normalizeAgendaSettingsForUi = (settings = {}) => ({
    ...(settings && typeof settings === 'object' ? settings : {}),
    markers: (Array.isArray(settings?.markers) ? settings.markers : []).map((marker) => ({
      ...marker,
      id: cleanText(marker?.id),
      nome: cleanText(marker?.nome || marker?.label),
      label: cleanText(marker?.label || marker?.nome),
      cor: cleanText(marker?.cor || marker?.color),
      color: cleanText(marker?.color || marker?.cor),
    })),
  });

  const normalizeAgendaSettingsPatch = (payload = {}) => ({
    ...(payload && typeof payload === 'object' ? payload : {}),
    markers: Array.isArray(payload?.markers)
      ? payload.markers.map((marker) => ({
        id: cleanText(marker?.id),
        label: cleanText(marker?.label || marker?.nome),
        color: cleanText(marker?.color || marker?.cor),
      })).filter((marker) => marker.label && marker.color)
      : undefined,
  });

  const mapBirthdayItemsFromOverview = (overview = {}, date = '') => {
    const dateIso = cleanText(date || overview?.date || normalizeDateOnly(new Date()));
    const birthdays = overview?.birthdays || {};
    const items = Array.isArray(birthdays?.items) ? birthdays.items : [];
    return {
      clinicId: cleanText(overview?.clinicId),
      date: dateIso,
      items: items.map((item) => ({
        prontuario: cleanText(item?.patientId || item?.prontuario),
        patientId: cleanText(item?.patientId || item?.prontuario),
        nome: cleanText(item?.patientName || item?.nome),
        telefone: cleanText(item?.phone || item?.telefone),
        dataNascimento: cleanText(item?.birthDate || item?.dataNascimento),
        allowsMessages: item?.allowsMessages !== false,
        hasAppointment: item?.hasAppointment === true,
        birthdaySentYear: item?.birthdaySentYear === true,
        birthdaySentToday: item?.birthdaySentToday === true,
      })),
    };
  };

  const normalizeDocumentType = (value) => cleanText(value).toUpperCase();
  const createLocalId = (prefix = 'id') => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}_${crypto.randomUUID()}`;
    }
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  };
  const resolveDocumentActor = (payload = {}) => {
    const storedUser = getStoredUser?.() || {};
    return {
      id: cleanText(payload?.createdBy?.id || payload?.profissionalId || payload?.dentistaId || storedUser?.id || storedUser?.userId),
      nome: cleanText(
        payload?.createdBy?.nome
        || payload?.profissionalNome
        || payload?.dentistaNome
        || storedUser?.nome
        || storedUser?.fullName
        || storedUser?.login
      ),
    };
  };
  const escapeHtml = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const formatDatePtBr = (value) => {
    const normalized = cleanText(value);
    if (!normalized) return '-';
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return normalized;
    return date.toLocaleDateString('pt-BR');
  };
  const formatFieldValue = (value) => {
    if (Array.isArray(value)) {
      const items = value
        .map((item) => cleanText(item))
        .filter(Boolean);
      return items.length ? items.join(', ') : '-';
    }
    if (value === true || value === 'on') return 'Sim';
    if (value === false) return 'Nao';
    const text = String(value ?? '').trim();
    return text || '-';
  };
  const toDisplayDate = (value) => {
    const normalized = cleanText(value);
    if (!normalized) return new Date();
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      return new Date(`${normalized}T12:00:00`);
    }
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  };
  const formatLongDatePtBr = (value) => new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(toDisplayDate(value));
  const formatDocumentNumberPtBr = (value) => {
    const digits = normalizeDigits(value).slice(0, 14);
    if (!digits) return '';
    if (digits.length <= 11) {
      return digits
        .replace(/^(\d{3})(\d)/, '$1.$2')
        .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d{1,2})$/, '$1.$2.$3-$4');
    }
    return digits
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4')
      .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d{1,2})$/, '$1.$2.$3/$4-$5');
  };
  const formatPhonePtBr = (value) => {
    const digits = normalizeDigits(value).slice(0, 11);
    if (!digits) return '';
    if (digits.length <= 10) {
      return digits
        .replace(/^(\d{2})(\d)/, '($1) $2')
        .replace(/^(\d{2})\s(\d{4})(\d)/, '($1) $2-$3');
    }
    return digits
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/^(\d{2})\s(\d{5})(\d)/, '($1) $2-$3');
  };
  const normalizeReceituarioFavorites = (items = []) => (Array.isArray(items) ? items : [])
    .map((item) => ({
      nome: cleanText(item?.nome || item?.medicamento),
      posologia: cleanText(item?.posologia),
      quantidade: cleanText(item?.quantidade),
    }))
    .filter((item) => item.nome || item.posologia || item.quantidade);
  const normalizeClinicReceituario = (value = {}, clinic = {}) => {
    const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const clinicProfile = clinic?.operationalSettings?.clinicProfile || {};
    return {
      cabecalho: String(raw.cabecalho || '').trim(),
      rodape: String(raw.rodape || '').trim(),
      assinaturaNome: cleanText(raw.assinaturaNome || clinic?.responsavelTecnico || clinicProfile?.responsavelTecnico),
      assinaturaRegistro: cleanText(raw.assinaturaRegistro || clinic?.cro || clinicProfile?.cro),
      assinaturaImagemData: cleanText(raw.assinaturaImagemData),
      textoPadrao: String(raw.textoPadrao || '').trim(),
      observacoesPadrao: String(raw.observacoesPadrao || '').trim(),
      itensFavoritos: normalizeReceituarioFavorites(raw.itensFavoritos),
    };
  };
  const normalizeClinicSessionData = (clinic = {}) => {
    const raw = clinic && typeof clinic === 'object' ? clinic : {};
    const operationalSettings = raw?.operationalSettings && typeof raw.operationalSettings === 'object'
      ? { ...raw.operationalSettings }
      : {};
    const clinicProfile = operationalSettings?.clinicProfile && typeof operationalSettings.clinicProfile === 'object'
      ? operationalSettings.clinicProfile
      : {};
    const profileAddress = clinicProfile?.endereco && typeof clinicProfile.endereco === 'object'
      ? clinicProfile.endereco
      : {};
    const rawAddress = raw?.endereco && typeof raw.endereco === 'object'
      ? raw.endereco
      : {};
    const normalizedAddress = {
      rua: cleanText(rawAddress.rua || profileAddress.rua || raw?.endereco),
      numero: cleanText(rawAddress.numero || profileAddress.numero),
      complemento: cleanText(rawAddress.complemento || profileAddress.complemento),
      bairro: cleanText(rawAddress.bairro || profileAddress.bairro),
      cidade: cleanText(rawAddress.cidade || profileAddress.cidade || raw?.cidade),
      uf: cleanText(rawAddress.uf || profileAddress.uf || raw?.uf),
      cep: cleanText(rawAddress.cep || profileAddress.cep),
    };
    const normalizedProfile = {
      ...clinicProfile,
      whatsapp: cleanText(raw?.whatsapp || clinicProfile?.whatsapp),
      cro: cleanText(raw?.cro || clinicProfile?.cro),
      responsavelTecnico: cleanText(raw?.responsavelTecnico || clinicProfile?.responsavelTecnico),
      logoDataUrlCache: cleanText(raw?.logoData || raw?.logoDataUrlCache || clinicProfile?.logoDataUrlCache),
      logoVersion: cleanText(raw?.logoVersion || clinicProfile?.logoVersion),
      endereco: normalizedAddress,
    };
    const birthdayMessaging = operationalSettings?.birthdayMessaging && typeof operationalSettings.birthdayMessaging === 'object'
      ? operationalSettings.birthdayMessaging
      : {};
    const whatsAppMessaging = raw?.messaging?.whatsapp && typeof raw.messaging.whatsapp === 'object'
      ? raw.messaging.whatsapp
      : {};
    const normalized = {
      ...raw,
      id: cleanText(raw?.id || raw?.clinicId),
      clinicId: cleanText(raw?.clinicId || raw?.id),
      nomeFantasia: cleanText(raw?.nomeFantasia || raw?.nomeClinica),
      razaoSocial: cleanText(raw?.razaoSocial || raw?.nomeFantasia || raw?.nomeClinica),
      nomeClinica: cleanText(raw?.nomeClinica || raw?.nomeFantasia || raw?.razaoSocial),
      cnpj: cleanText(raw?.cnpj || raw?.cnpjCpf || raw?.cnpjOuCpf),
      cnpjOuCpf: cleanText(raw?.cnpjOuCpf || raw?.cnpjCpf || raw?.cnpj),
      cnpjCpf: cleanText(raw?.cnpjCpf || raw?.cnpjOuCpf || raw?.cnpj),
      emailClinica: cleanText(raw?.emailClinica || raw?.email),
      email: cleanText(raw?.email || raw?.emailClinica),
      telefone: cleanText(raw?.telefone || raw?.telefoneComercial),
      telefoneComercial: cleanText(raw?.telefoneComercial || raw?.telefone),
      whatsapp: normalizedProfile.whatsapp,
      cro: normalizedProfile.cro,
      responsavelTecnico: normalizedProfile.responsavelTecnico,
      endereco: normalizedAddress,
      rua: normalizedAddress.rua,
      numero: normalizedAddress.numero,
      complemento: normalizedAddress.complemento,
      bairro: normalizedAddress.bairro,
      estado: normalizedAddress.uf,
      cep: normalizedAddress.cep,
      cidade: normalizedAddress.cidade,
      uf: normalizedAddress.uf,
      logoData: normalizedProfile.logoDataUrlCache,
      logoDataUrlCache: normalizedProfile.logoDataUrlCache,
      logoVersion: normalizedProfile.logoVersion,
      logoFile: cleanText(raw?.logoFile),
      status: cleanText(raw?.status || 'active').toLowerCase() || 'active',
    };
    normalized.receituario = normalizeClinicReceituario(raw?.receituario || operationalSettings?.receituario, normalized);
    normalized.messaging = {
      birthday: birthdayMessaging,
      whatsapp: whatsAppMessaging,
    };
    normalized.operationalSettings = {
      ...operationalSettings,
      clinicProfile: normalizedProfile,
      receituario: normalized.receituario,
    };
    return normalized;
  };
  const simpleHashString = (value) => {
    const input = String(value || '');
    let hash = 0;
    for (let i = 0; i < input.length; i += 1) {
      hash = ((hash << 5) - hash) + input.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16);
  };
  const normalizeModelList = (items = [], prefix = 'model') => (Array.isArray(items) ? items : [])
    .map((item, index) => ({
      id: cleanText(item?.id || item?._id || `${prefix}_${index + 1}`),
      nome: cleanText(item?.nome || item?.title || item?.name || `${prefix} ${index + 1}`),
      titulo: cleanText(item?.titulo || item?.title || item?.nome || item?.name || ''),
      categoria: cleanText(item?.categoria || item?.category || ''),
      conteudo: item?.conteudo ?? item?.content ?? '',
      data: item?.data ?? item?.fields ?? item?.payload ?? {},
      ativo: item?.ativo === true || item?.isActive === true,
      createdAt: item?.createdAt || '',
      updatedAt: item?.updatedAt || '',
    }));
  const ANAMNESE_ALLOWED_TYPES = new Set(['text', 'textarea', 'select', 'number', 'date', 'yesno', 'checkbox', 'multicheck']);
  const normalizeAnamneseQuestionType = (value) => {
    const raw = cleanText(value || 'text').toLowerCase();
    if (ANAMNESE_ALLOWED_TYPES.has(raw)) return raw;
    if (['bool', 'boolean', 'radio', 'simnao', 'sim_nao', 'yes_no'].includes(raw)) return 'yesno';
    if (['dropdown', 'combo', 'combobox', 'lista'].includes(raw)) return 'select';
    if (['multiple', 'multiple-choice', 'multiple_choice', 'multi_select', 'multiselect'].includes(raw)) return 'multicheck';
    if (['longtext', 'paragraph'].includes(raw)) return 'textarea';
    if (['numeric', 'decimal', 'currency'].includes(raw)) return 'number';
    return 'text';
  };
  const buildDefaultAnamneseModel = () => ({
    id: 'default',
    name: 'Padrao',
    active: true,
    sections: [
      {
        id: 's-geral',
        title: 'Informacoes gerais',
        questions: [
          { id: 'q-data', key: 'anamneseDate', label: 'Data', type: 'date', required: false, options: [] },
          { id: 'q-responsavel', key: 'responsavel', label: 'Responsavel', type: 'text', required: false, options: [] },
          { id: 'q-queixa', key: 'queixa', label: 'Queixa principal', type: 'textarea', required: false, options: [] },
        ],
      },
      {
        id: 's-hist-med',
        title: 'Historico medico',
        questions: [
          { id: 'q-hist-saude', key: 'historicoMedico', label: 'Historico de saude', type: 'textarea', required: false, options: [] },
          { id: 'q-alergias', key: 'alergias', label: 'Alergias', type: 'text', required: false, options: [] },
          { id: 'q-meds', key: 'medicamentos', label: 'Medicamentos em uso', type: 'text', required: false, options: [] },
        ],
      },
      {
        id: 's-condicoes',
        title: 'Condicoes sistemicas',
        questions: [
          {
            id: 'q-condicoes',
            key: 'condicoes[]',
            label: 'Condicoes sistemicas',
            type: 'multicheck',
            required: false,
            options: ['diabetes', 'hipertensao', 'cardiopatias', 'epilepsia', 'asma', 'coagulacao', 'hepatite_hiv'],
          },
        ],
      },
      {
        id: 's-medicacoes',
        title: 'Medicamentos especificos',
        questions: [
          { id: 'q-anticoag', key: 'anticoagulantes', label: 'Usa anticoagulantes', type: 'yesno', required: false, options: [] },
          { id: 'q-antidepr', key: 'antidepressivos', label: 'Usa antidepressivos', type: 'yesno', required: false, options: [] },
          { id: 'q-cort', key: 'corticoides', label: 'Usa corticoides', type: 'yesno', required: false, options: [] },
          { id: 'q-insulina', key: 'insulina', label: 'Usa insulina', type: 'yesno', required: false, options: [] },
        ],
      },
      {
        id: 's-reacoes',
        title: 'Reacoes anteriores',
        questions: [
          { id: 'q-anest', key: 'reacaoAnestesia', label: 'Reacao a anestesia odontologica', type: 'yesno', required: false, options: [] },
          { id: 'q-sang', key: 'sangramentoExcessivo', label: 'Sangramento excessivo', type: 'yesno', required: false, options: [] },
          { id: 'q-desmaio', key: 'desmaioOdonto', label: 'Desmaio em atendimento odontologico', type: 'yesno', required: false, options: [] },
          { id: 'q-gestante', key: 'gestante', label: 'Gestante', type: 'yesno', required: false, options: [] },
          { id: 'q-pressao', key: 'pressao', label: 'Pressao arterial', type: 'text', required: false, options: [] },
        ],
      },
      {
        id: 's-odonto',
        title: 'Historico odontologico',
        questions: [
          { id: 'q-hist-odonto', key: 'historicoOdonto', label: 'Historico odontologico', type: 'textarea', required: false, options: [] },
          { id: 'q-escov', key: 'escovacao', label: 'Frequencia de escovacao', type: 'select', required: false, options: ['1', '2', '3', '4'] },
          { id: 'q-ult-visita', key: 'ultimaVisita', label: 'Ultima visita ao dentista', type: 'date', required: false, options: [] },
          { id: 'q-motivo-visita', key: 'motivoUltimaVisita', label: 'Motivo da ultima visita', type: 'text', required: false, options: [] },
          { id: 'q-sensib', key: 'sensibilidade', label: 'Sensibilidade dentaria', type: 'yesno', required: false, options: [] },
          { id: 'q-dor-mast', key: 'dorMastigar', label: 'Dor ao mastigar', type: 'yesno', required: false, options: [] },
          { id: 'q-brux', key: 'bruxismo', label: 'Ranger os dentes (bruxismo)', type: 'yesno', required: false, options: [] },
          { id: 'q-fio', key: 'fioDental', label: 'Uso de fio dental', type: 'yesno', required: false, options: [] },
          { id: 'q-habitos', key: 'habitos', label: 'Habitos e observacoes', type: 'textarea', required: false, options: [] },
        ],
      },
      {
        id: 's-consent',
        title: 'Declaracoes e consentimento',
        questions: [
          {
            id: 'q-declaracao',
            key: 'declaracaoVerdade',
            label: 'Declaro que as informacoes prestadas sao verdadeiras e informarei qualquer alteracao no meu estado de saude.',
            type: 'checkbox',
            required: true,
            options: [],
          },
          { id: 'q-data-hora', key: 'dataHoraPreenchimento', label: 'Data e hora do preenchimento', type: 'text', required: false, options: [] },
          { id: 'q-origem', key: 'origemPreenchimento', label: 'Origem do preenchimento', type: 'select', required: false, options: ['paciente', 'recepcao', 'dentista'] },
          { id: 'q-assinatura', key: 'assinaturaDigital', label: 'Assinatura digital do paciente (futuro)', type: 'text', required: false, options: [] },
        ],
      },
      {
        id: 's-plano',
        title: 'Plano e observacoes',
        questions: [
          { id: 'q-plano', key: 'planoTratamento', label: 'Plano de tratamento', type: 'textarea', required: false, options: [] },
          { id: 'q-observacoes', key: 'observacoes', label: 'Observacoes gerais', type: 'textarea', required: false, options: [] },
        ],
      },
    ],
  });
  const extractAnamneseSections = (item = {}) => {
    const nested = item?.data || item?.fields || item?.payload || {};
    const directSections = item?.sections || item?.secoes;
    const nestedSections = nested?.sections || nested?.secoes;
    if (Array.isArray(directSections)) return directSections;
    if (Array.isArray(nestedSections)) return nestedSections;
    const looseQuestions = item?.questions || item?.perguntas || nested?.questions || nested?.perguntas;
    if (Array.isArray(looseQuestions) && looseQuestions.length) {
      return [{ title: item?.sectionTitle || nested?.sectionTitle || 'Perguntas gerais', questions: looseQuestions }];
    }
    return [];
  };
  const normalizeAnamneseQuestion = (question = {}, sectionIndex = 0, questionIndex = 0) => {
    const label = cleanText(question?.label || question?.pergunta || question?.title);
    if (!label) return null;
    const type = normalizeAnamneseQuestionType(question?.type || question?.tipo);
    const rawOptions = question?.options || question?.opcoes || question?.choices || [];
    const options = Array.isArray(rawOptions)
      ? rawOptions.map((item) => cleanText(item?.value || item?.label || item)).filter(Boolean)
      : [];
    return {
      id: cleanText(question?.id || `q-${sectionIndex}-${questionIndex}`),
      key: cleanText(question?.key || question?.campo || question?.id || `campo_${sectionIndex + 1}_${questionIndex + 1}`),
      label,
      type,
      required: question?.required === true || question?.obrigatoria === true,
      options: type === 'select' || type === 'multicheck' ? options : [],
    };
  };
  const normalizeAnamneseSection = (section = {}, sectionIndex = 0) => {
    const questionsSource = Array.isArray(section?.questions)
      ? section.questions
      : (Array.isArray(section?.perguntas) ? section.perguntas : []);
    const questions = questionsSource
      .map((question, questionIndex) => normalizeAnamneseQuestion(question, sectionIndex, questionIndex))
      .filter(Boolean);
    if (!questions.length) return null;
    return {
      id: cleanText(section?.id || `s-${sectionIndex}`),
      title: cleanText(section?.title || section?.nome || section?.label || `Secao ${sectionIndex + 1}`),
      questions,
    };
  };
  const serializeAnamneseModel = (model = {}) => {
    const normalized = normalizeAnamneseModel(model);
    return {
      id: normalized.id,
      name: normalized.name,
      active: normalized.active === true,
      sections: normalized.sections,
      createdAt: normalized.createdAt || '',
      updatedAt: normalized.updatedAt || '',
    };
  };
  function normalizeAnamneseModel(item = {}, index = 0) {
    const fallback = buildDefaultAnamneseModel();
    const sections = extractAnamneseSections(item)
      .map((section, sectionIndex) => normalizeAnamneseSection(section, sectionIndex))
      .filter(Boolean);
    const effectiveSections = sections.length ? sections : fallback.sections;
    const active = item?.active === true || item?.ativo === true || item?.isActive === true;
    const name = cleanText(item?.name || item?.nome || item?.title || item?.titulo || `Modelo ${index + 1}`) || `Modelo ${index + 1}`;
    return {
      id: cleanText(item?.id || item?._id || `${index === 0 ? 'default' : `anamnese_${index + 1}`}`) || `${index === 0 ? 'default' : `anamnese_${index + 1}`}`,
      name,
      nome: name,
      active,
      ativo: active,
      sections: effectiveSections,
      createdAt: item?.createdAt || '',
      updatedAt: item?.updatedAt || '',
    };
  }
  const normalizeAnamneseModelList = (items = []) => {
    const list = (Array.isArray(items) ? items : []).map((item, index) => normalizeAnamneseModel(item, index));
    if (!list.length) return [normalizeAnamneseModel(buildDefaultAnamneseModel(), 0)];
    if (!list.some((item) => item.active)) {
      list[0].active = true;
      list[0].ativo = true;
    }
    return list;
  };
  const normalizeProcedureItem = (item = {}) => ({
    id: cleanText(item?.id || item?.codigo || createLocalId('proc')),
    codigo: cleanText(item?.codigo || item?.id || ''),
    nome: cleanText(item?.nome || item?.name || item?.label || 'Procedimento'),
    preco: Number(item?.preco ?? item?.price ?? 0) || 0,
    categoria: cleanText(item?.categoria || item?.category || ''),
    ativo: item?.ativo !== false,
  });
  const extractProcedureCatalogItems = (payload = null) => {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.servicos)) return payload.servicos;
    if (Array.isArray(payload?.procedimentos)) return payload.procedimentos;
    return [];
  };
  const getProcedureCatalogKey = (item = {}) => cleanText(item?.codigo || item?.id || item?.nome).toLowerCase();
  const sanitizeProcedureOverrides = (items = []) => (
    (Array.isArray(items) ? items : [])
      .map((item) => normalizeProcedureItem(item))
      .filter((item) => cleanText(item.codigo || item.id))
  );
  const isSameProcedureDefinition = (left = {}, right = {}) => (
    cleanText(left?.codigo || left?.id).toLowerCase() === cleanText(right?.codigo || right?.id).toLowerCase()
    && cleanText(left?.nome) === cleanText(right?.nome)
    && Number(left?.preco ?? 0) === Number(right?.preco ?? 0)
    && cleanText(left?.categoria) === cleanText(right?.categoria)
    && left?.ativo !== false
    && right?.ativo !== false
  );
  const mergeProcedureCatalog = (base = [], custom = []) => {
    const overrideMap = new Map();
    sanitizeProcedureOverrides(custom).forEach((item) => {
      overrideMap.set(getProcedureCatalogKey(item), item);
    });

    const merged = [];
    (Array.isArray(base) ? base : [])
      .map((item) => normalizeProcedureItem(item))
      .filter((item) => item.nome)
      .forEach((item) => {
        const key = getProcedureCatalogKey(item);
        const override = overrideMap.get(key);
        if (override?.ativo === false) {
          overrideMap.delete(key);
          return;
        }
        merged.push({
          ...item,
          ...override,
          id: cleanText(override?.id || item.id || item.codigo || createLocalId('proc')),
          codigo: cleanText(override?.codigo || item.codigo || override?.id),
          nome: cleanText(override?.nome || item.nome || 'Procedimento'),
          preco: Number(override?.preco ?? item.preco ?? 0) || 0,
          categoria: cleanText(override?.categoria || item.categoria),
          ativo: true,
          origem: 'base',
        });
        overrideMap.delete(key);
      });

    overrideMap.forEach((item) => {
      if (item?.ativo === false || !item?.nome) return;
      merged.push({
        ...item,
        origem: 'custom',
      });
    });

    return merged.sort((left, right) => String(left?.nome || '').localeCompare(String(right?.nome || ''), 'pt-BR', { sensitivity: 'base' }));
  };
  const buildPrintablePreviewShell = ({ title = 'Documento', subtitle = '', body = '' } = {}) => [
    '<style>',
    '  :root { color-scheme: light; }',
    '  body { margin: 0; background: #e8eef4; color: #0f172a; font-family: "Segoe UI", Arial, sans-serif; }',
    '  .vx-doc-shell { min-height: 100vh; padding: 24px; }',
    '  .vx-doc-toolbar { max-width: 960px; margin: 0 auto 16px; display: flex; gap: 12px; align-items: center; justify-content: space-between; padding: 14px 18px; border-radius: 18px; background: rgba(15, 23, 42, 0.88); color: #f8fafc; box-shadow: 0 18px 48px rgba(15, 23, 42, 0.2); }',
    '  .vx-doc-toolbar-main { min-width: 0; }',
    '  .vx-doc-toolbar-title { margin: 0; font-size: 17px; font-weight: 700; }',
    '  .vx-doc-toolbar-subtitle { margin: 4px 0 0; font-size: 13px; color: rgba(248, 250, 252, 0.8); }',
    '  .vx-doc-toolbar-actions { display: flex; gap: 10px; flex-wrap: wrap; }',
    '  .vx-doc-btn { border: 0; border-radius: 999px; padding: 10px 16px; font-size: 13px; font-weight: 600; cursor: pointer; background: #34d399; color: #052e2b; }',
    '  .vx-doc-btn.vx-doc-btn-secondary { background: rgba(255,255,255,0.16); color: #f8fafc; }',
    '  .vx-doc-paper { width: min(210mm, 100%); min-height: 297mm; margin: 0 auto; background: #fff; box-shadow: 0 24px 60px rgba(15, 23, 42, 0.14); border-radius: 18px; padding: 16mm 14mm; }',
    '  .vx-medical-doc { color: #0f172a; }',
    '  .vx-brand-header { display: grid; grid-template-columns: minmax(80px, 118px) 1fr; gap: 18px; align-items: center; padding-bottom: 14px; margin-bottom: 24px; border-bottom: 1px solid #dbe2ea; }',
    '  .vx-brand-logo-box { min-height: 58px; display: flex; align-items: center; justify-content: flex-start; }',
    '  .vx-brand-logo { max-width: 118px; max-height: 58px; object-fit: contain; display: block; }',
    '  .vx-brand-meta { min-width: 0; }',
    '  .vx-brand-name { margin: 0; font-size: 17px; font-weight: 700; color: #0f172a; }',
    '  .vx-brand-line { margin: 3px 0 0; font-size: 12px; line-height: 1.45; color: #475569; }',
    '  .vx-medical-doc h1 { margin: 0; text-align: center; font-size: 24px; letter-spacing: 0.3px; text-transform: uppercase; }',
    '  .vx-medical-doc .doc-head { margin: 10px 0 46px; }',
    '  .vx-medical-doc .doc-date { margin-top: 0; font-size: 15px; color: #1e293b; }',
    '  .vx-medical-doc .doc-text { margin-top: 20px; font-size: 15px; line-height: 1.75; }',
    '  .vx-medical-doc .doc-text p { margin: 0 0 16px; }',
    '  .vx-medical-doc .bloco { margin-bottom: 14px; page-break-inside: avoid; }',
    '  .vx-medical-doc .label { font-size: 13px; color: #334155; margin-bottom: 4px; font-weight: 700; }',
    '  .vx-medical-doc .value { white-space: pre-wrap; font-size: 14px; }',
    '  .vx-medical-doc table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px; }',
    '  .vx-medical-doc th, .vx-medical-doc td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }',
    '  .vx-medical-doc th { background: #f8fafc; font-weight: 700; }',
    '  .vx-medical-doc .doc-cid { margin-top: 10px; font-weight: 700; }',
    '  .vx-medical-doc .signature { margin-top: 72px; text-align: center; page-break-inside: avoid; }',
    '  .vx-medical-doc .signature-image { margin: 0 auto 8px; max-height: 76px; max-width: 320px; object-fit: contain; display: block; }',
    '  .vx-medical-doc .signature-line { margin: 0 auto 14px; border-top: 1px solid #334155; width: 300px; max-width: 90%; }',
    '  .vx-medical-doc .signature-name { font-size: 16px; font-weight: 500; color: #0f172a; }',
    '  .vx-medical-doc .signature-reg { margin-top: 4px; font-size: 14px; color: #334155; }',
    '  .vx-medical-doc--atestado .signature { margin-top: 92px; }',
    '  @page { size: A4; margin: 12mm; }',
    '  @media print {',
    '    body { background: #fff; }',
    '    .vx-doc-shell { padding: 0; }',
    '    .vx-doc-toolbar { display: none !important; }',
    '    .vx-doc-paper { width: auto; min-height: auto; margin: 0; box-shadow: none; border-radius: 0; padding: 0; }',
    '  }',
    '</style>',
    '<div class="vx-doc-shell">',
    '  <div class="vx-doc-toolbar">',
    '    <div class="vx-doc-toolbar-main">',
    `      <p class="vx-doc-toolbar-title">${escapeHtml(title)}</p>`,
    `      <p class="vx-doc-toolbar-subtitle">${escapeHtml(subtitle || 'Use "Imprimir" para salvar em PDF pelo navegador.')}</p>`,
    '    </div>',
    '    <div class="vx-doc-toolbar-actions">',
    '      <button type="button" class="vx-doc-btn" onclick="window.print()">Imprimir / Salvar PDF</button>',
    '      <button type="button" class="vx-doc-btn vx-doc-btn-secondary" onclick="window.close()">Fechar</button>',
    '    </div>',
    '  </div>',
    `  <main class="vx-doc-paper">${body}</main>`,
    '</div>',
  ].join('');
  const buildClinicDocumentHeaderMarkup = (clinic = {}) => {
    const normalizedClinic = normalizeClinicSessionData(clinic);
    const logoDataUrl = cleanText(normalizedClinic?.logoData || normalizedClinic?.logoDataUrlCache || normalizedClinic?.logoDataUrl);
    const nome = cleanText(normalizedClinic?.razaoSocial || normalizedClinic?.nomeFantasia || normalizedClinic?.nomeClinica) || 'Clinica';
    const cnpj = formatDocumentNumberPtBr(normalizedClinic?.cnpjCpf || normalizedClinic?.cnpjOuCpf || normalizedClinic?.cnpj);
    const telefone = formatPhonePtBr(normalizedClinic?.telefone || normalizedClinic?.telefoneComercial);
    const email = cleanText(normalizedClinic?.email || normalizedClinic?.emailClinica);
    const responsavelTecnico = cleanText(normalizedClinic?.responsavelTecnico);
    const cro = cleanText(normalizedClinic?.cro);
    const professionalName = cleanText(clinic?.professionalName);
    const professionalCro = cleanText(clinic?.professionalCro) || cro;
    const endereco = normalizedClinic?.endereco && typeof normalizedClinic.endereco === 'object'
      ? normalizedClinic.endereco
      : {};
    const contactLine = [
      cnpj ? `CNPJ/CPF: ${cnpj}` : '',
      telefone,
      email,
    ].filter(Boolean).join(' | ');
    const addressLine = [
      [endereco?.rua, endereco?.numero].filter(Boolean).join(', '),
      endereco?.complemento,
      endereco?.bairro,
      [endereco?.cidade, endereco?.uf].filter(Boolean).join(' - '),
      endereco?.cep,
    ].filter(Boolean).join(' | ');
    const technicalLine = [
      responsavelTecnico ? `Responsavel tecnico: ${responsavelTecnico}` : '',
      cro ? `CRO: ${cro}` : '',
    ].filter(Boolean).join(' | ');
    const professionalLine = [
      professionalName ? `Dentista emissor: ${professionalName}` : '',
      professionalCro ? `CRO emissor: ${professionalCro}` : '',
    ].filter(Boolean).join(' | ');
    return `
      <header class="vx-brand-header">
        <div class="vx-brand-logo-box">
          ${logoDataUrl ? `<img class="vx-brand-logo" src="${escapeHtml(logoDataUrl)}" alt="Logo da clinica">` : ''}
        </div>
        <div class="vx-brand-meta">
          <p class="vx-brand-name">${escapeHtml(nome)}</p>
          ${contactLine ? `<p class="vx-brand-line">${escapeHtml(contactLine)}</p>` : ''}
          ${addressLine ? `<p class="vx-brand-line">${escapeHtml(addressLine)}</p>` : ''}
          ${technicalLine ? `<p class="vx-brand-line">${escapeHtml(technicalLine)}</p>` : ''}
          ${professionalLine ? `<p class="vx-brand-line">${escapeHtml(professionalLine)}</p>` : ''}
        </div>
      </header>
    `;
  };
  const buildReceitaPreviewMarkup = (document = {}, context = {}) => {
    const data = document?.data && typeof document.data === 'object' ? document.data : {};
    const clinic = normalizeClinicSessionData(context?.clinic || getStoredClinic?.() || {});
    const patient = context?.patient && typeof context.patient === 'object' ? context.patient : {};
    const receituario = normalizeClinicReceituario(data?.receituario || clinic?.receituario, clinic);
    const itens = Array.isArray(data.itens) ? data.itens : [];
    const localidadeCidade = cleanText(clinic?.cidade || clinic?.endereco?.cidade);
    const localidadeUf = cleanText(clinic?.uf || clinic?.endereco?.uf);
    const localidade = [localidadeCidade, localidadeUf].filter(Boolean).join(' - ') || 'Cidade';
    const issueDate = cleanText(data.data || document?.documentDate || document?.createdAt);
    const assinaturaNome = cleanText(data.profissionalNome || receituario.assinaturaNome) || 'Assinatura do profissional';
    const assinaturaRegistro = cleanText(receituario.assinaturaRegistro);
    const pacienteNome = cleanText(data.pacienteNome || patient?.nome || patient?.fullName) || '-';
    const prontuario = cleanText(data.prontuario || document?.prontuario || document?.patientId || patient?.prontuario || patient?.id) || '-';
    const profissionalNome = cleanText(data.profissionalNome || document?.createdBy?.nome) || '-';
    const itensHtml = itens.length
      ? itens.map((item) => `
        <tr>
          <td>${escapeHtml(formatFieldValue(item?.nome))}</td>
          <td>${escapeHtml(formatFieldValue(item?.posologia))}</td>
          <td>${escapeHtml(formatFieldValue(item?.quantidade))}</td>
        </tr>
      `).join('')
      : '<tr><td colspan="3">Sem itens estruturados.</td></tr>';
    return buildPrintablePreviewShell({
      title: document?.title || document?.titulo || 'Receita',
      body: `
        <article class="vx-medical-doc vx-medical-doc--receita">
          ${buildClinicDocumentHeaderMarkup({
            ...clinic,
            professionalName: data.profissionalNome || document?.createdBy?.nome,
            professionalCro: receituario.assinaturaRegistro,
          })}
          ${receituario.cabecalho ? `<div class="bloco"><div class="value">${escapeHtml(formatFieldValue(receituario.cabecalho))}</div></div>` : ''}
          <div class="doc-head">
            <h1>Receita</h1>
          </div>
          <div class="doc-date">${escapeHtml(`${localidade}, ${formatLongDatePtBr(issueDate)}`)}</div>
          <div class="doc-text">
            <p>Paciente: <strong>${escapeHtml(pacienteNome)}</strong></p>
            <p>Prontuario: ${escapeHtml(prontuario)}</p>
            <p>Profissional: ${escapeHtml(profissionalNome)}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Medicamento</th>
                <th>Posologia</th>
                <th>Quantidade</th>
              </tr>
            </thead>
            <tbody>
              ${itensHtml}
            </tbody>
          </table>
          <div class="bloco">
            <div class="label">Texto livre</div>
            <div class="value">${escapeHtml(formatFieldValue(data.texto || '-'))}</div>
          </div>
          <div class="bloco">
            <div class="label">Observacoes</div>
            <div class="value">${escapeHtml(formatFieldValue(data.observacoes || '-'))}</div>
          </div>
          <div class="signature">
            ${receituario.assinaturaImagemData ? `<img class="signature-image" src="${escapeHtml(receituario.assinaturaImagemData)}" alt="Assinatura digital">` : ''}
            <div class="signature-line"></div>
            <div class="signature-name">${escapeHtml(assinaturaNome)}</div>
            ${assinaturaRegistro ? `<div class="signature-reg">${escapeHtml(assinaturaRegistro)}</div>` : ''}
          </div>
          ${receituario.rodape ? `<div class="bloco"><div class="value">${escapeHtml(formatFieldValue(receituario.rodape))}</div></div>` : ''}
        </article>
      `,
    });
  };
  const buildAtestadoPreviewMarkup = (document = {}, context = {}) => {
    const data = document?.data && typeof document.data === 'object' ? document.data : {};
    const clinic = normalizeClinicSessionData(context?.clinic || getStoredClinic?.() || {});
    const patient = context?.patient && typeof context.patient === 'object' ? context.patient : {};
    const receituario = normalizeClinicReceituario(data?.receituario || clinic?.receituario, clinic);
    const localidadeCidade = cleanText(clinic?.cidade || clinic?.endereco?.cidade);
    const localidadeUf = cleanText(clinic?.uf || clinic?.endereco?.uf);
    const localidade = [localidadeCidade, localidadeUf].filter(Boolean).join(' - ') || 'Cidade';
    const issueDate = cleanText(data.data || document?.documentDate || document?.createdAt);
    const patientName = cleanText(data.pacienteNome || patient?.nome || patient?.fullName) || '-';
    const patientCpf = cleanText(data.pacienteCpf || patient?.cpf);
    const conteudo = cleanText(data.tipo) === 'horas'
      ? `Em decorrencia, devera permanecer afastado(a) de suas atividades no periodo de ${formatFieldValue(data.horaInicio || '--:--')} ate ${formatFieldValue(data.horaFim || '--:--')}, nesta data.`
      : `Em decorrencia, devera permanecer afastado(a) de suas atividades por um periodo de ${formatFieldValue(data.dias || 1)} dia(s), a partir desta data.`;
    const assinaturaNome = cleanText(data.profissionalNome || receituario.assinaturaNome) || 'Assinatura do profissional';
    const assinaturaRegistro = cleanText(receituario.assinaturaRegistro);
    return buildPrintablePreviewShell({
      title: document?.title || document?.titulo || 'Atestado',
      body: `
        <article class="vx-medical-doc vx-medical-doc--atestado">
          ${buildClinicDocumentHeaderMarkup({
            ...clinic,
            professionalName: data.profissionalNome || document?.createdBy?.nome,
            professionalCro: receituario.assinaturaRegistro,
          })}
          <div class="doc-head">
            <h1>Atestado</h1>
          </div>
          <div class="doc-date">${escapeHtml(`${localidade}, ${formatLongDatePtBr(issueDate)}`)}</div>
          <div class="doc-text">
            <p>Atesto, para os devidos fins, que o(a) Sr.(a) <strong>${escapeHtml(patientName)}</strong>${patientCpf ? ` CPF ${escapeHtml(patientCpf)}` : ''}, foi submetido(a) a procedimentos nesta data.</p>
            <p>${escapeHtml(conteudo)}</p>
            ${cleanText(data.cid) ? `<p class="doc-cid">CID: ${escapeHtml(data.cid)}</p>` : ''}
          </div>
          <div class="signature">
            ${receituario.assinaturaImagemData ? `<img class="signature-image" src="${escapeHtml(receituario.assinaturaImagemData)}" alt="Assinatura digital">` : ''}
            <div class="signature-line"></div>
            <div class="signature-name">${escapeHtml(assinaturaNome)}</div>
            ${assinaturaRegistro ? `<div class="signature-reg">${escapeHtml(assinaturaRegistro)}</div>` : ''}
          </div>
        </article>
      `,
    });
  };
  const buildDocumentPreviewMarkup = (document = {}, context = {}) => {
    const data = document?.data && typeof document.data === 'object' ? document.data : {};
    const documentType = normalizeDocumentType(document?.type || document?.tipo);
    if (documentType === 'RECEITA') {
      return buildReceitaPreviewMarkup(document, context);
    }
    if (documentType === 'ATESTADO') {
      return buildAtestadoPreviewMarkup(document, context);
    }
    if (cleanText(data.previewHtml)) return String(data.previewHtml);
    const content = cleanText(
      data.conteudo
      || data.texto
      || data.content
      || data.observacoes
      || document?.conteudo
      || ''
    );
    const sections = [];
    Object.entries(data || {}).forEach(([key, value]) => {
      if (['previewHtml', 'conteudo', 'content', 'texto'].includes(key)) return;
      if (value === null || value === undefined || value === '') return;
      if (Array.isArray(value)) {
        const serialized = value.map((item) => {
          if (item && typeof item === 'object') return JSON.stringify(item);
          return String(item);
        }).join('\n');
        sections.push(`<section><h3>${escapeHtml(key)}</h3><pre>${escapeHtml(serialized)}</pre></section>`);
        return;
      }
      if (value && typeof value === 'object') {
        sections.push(`<section><h3>${escapeHtml(key)}</h3><pre>${escapeHtml(JSON.stringify(value, null, 2))}</pre></section>`);
        return;
      }
      sections.push(`<section><h3>${escapeHtml(key)}</h3><p>${escapeHtml(value)}</p></section>`);
    });
    return [
      '<main style="font-family:Segoe UI,Arial,sans-serif;padding:24px;max-width:960px;margin:0 auto;color:#10243e;">',
      `<h1 style="margin:0 0 8px;">${escapeHtml(document?.title || document?.titulo || document?.nome || 'Documento')}</h1>`,
      `<p style="margin:0 0 20px;color:#4b5b74;">${escapeHtml(document?.type || document?.tipo || 'DOCUMENTO')} | ${escapeHtml(formatDatePtBr(document?.documentDate || document?.createdAt || ''))}</p>`,
      content ? `<article style="white-space:pre-wrap;line-height:1.6;margin-bottom:20px;">${escapeHtml(content)}</article>` : '',
      sections.join(''),
      '</main>',
    ].join('');
  };
  const openBlobInBrowser = async (blob, mimeType = 'application/octet-stream') => {
    const normalizedBlob = blob instanceof Blob ? blob : new Blob([blob], { type: mimeType });
    const url = URL.createObjectURL(normalizedBlob);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return { success: true, url };
  };
  const openHtmlPreview = async (document = {}, context = {}) => {
    const html = [
      '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">',
      `<title>${escapeHtml(document?.title || document?.titulo || 'Documento')}</title>`,
      '</head><body style="margin:0;background:#f6f8fb;">',
      buildDocumentPreviewMarkup(document, context),
      '</body></html>',
    ].join('');
    return openBlobInBrowser(new Blob([html], { type: 'text/html;charset=utf-8' }), 'text/html;charset=utf-8');
  };

  const getStoredToken = () => {
    try {
      return cleanText(localStorage.getItem(WEB_SESSION_TOKEN_KEY));
    } catch (_error) {
      return '';
    }
  };
  const getStoredUser = () => {
    try {
      const raw = localStorage.getItem(WEB_SESSION_USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_error) {
      return null;
    }
  };
  const getStoredClinic = () => {
    try {
      const raw = localStorage.getItem(WEB_SESSION_CLINIC_KEY);
      return raw ? normalizeClinicSessionData(JSON.parse(raw)) : null;
    } catch (_error) {
      return null;
    }
  };

  const persistWebSession = ({ token = '', user = null, clinic = null } = {}) => {
    try {
      const normalizedToken = cleanText(token);
      if (normalizedToken) localStorage.setItem(WEB_SESSION_TOKEN_KEY, normalizedToken);
      else localStorage.removeItem(WEB_SESSION_TOKEN_KEY);

      if (user && typeof user === 'object') localStorage.setItem(WEB_SESSION_USER_KEY, JSON.stringify(user));
      else localStorage.removeItem(WEB_SESSION_USER_KEY);

      if (clinic && typeof clinic === 'object') {
        localStorage.setItem(WEB_SESSION_CLINIC_KEY, JSON.stringify(normalizeClinicSessionData(clinic)));
      }
      else localStorage.removeItem(WEB_SESSION_CLINIC_KEY);
    } catch (_error) {
      // localStorage indisponível - sessão não persistida mas não quebra execução
    }
  };

  const clearWebSession = () => {
    try {
      localStorage.removeItem(WEB_SESSION_TOKEN_KEY);
      localStorage.removeItem(WEB_SESSION_USER_KEY);
      localStorage.removeItem(WEB_SESSION_CLINIC_KEY);
    } catch (_error) {
      // localStorage indisponível - não quebra execução
    }
  };

  const getCurrentClinicId = () => cleanText(getStoredClinic()?.clinicId || getStoredClinic()?.id || getStoredUser()?.clinicId || '');
  const getStockStorageKey = (clinicId = '') => {
    const normalized = cleanText(clinicId || getCurrentClinicId());
    return normalized ? `voithos_estoque_produtos_v1:${normalized}` : 'voithos_estoque_produtos_v1';
  };
  const getStockMigrationKey = (clinicId = '') => {
    const normalized = cleanText(clinicId || getCurrentClinicId());
    return normalized ? `voithos_estoque_stock_migrated_v1:${normalized}` : 'voithos_estoque_stock_migrated_v1';
  };
  const getStockMovementStorageKey = (clinicId = '') => {
    const normalized = cleanText(clinicId || getCurrentClinicId());
    return normalized ? `voithos_estoque_movimentos_v1:${normalized}` : 'voithos_estoque_movimentos_v1';
  };
  const normalizeStockNumber = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) return 0;
    return Math.trunc(number);
  };
  const normalizeStockItem = (item = {}, clinicId = '') => {
    const currentQuantity = normalizeStockNumber(item?.currentQuantity ?? item?.quantidadeAtual ?? item?.estoqueAtual ?? item?.quantidade ?? 0);
    const minimumQuantity = normalizeStockNumber(item?.minimumQuantity ?? item?.estoqueMinimo ?? 0);
    const normalizedClinicId = cleanText(item?.clinicId || clinicId || getCurrentClinicId());
    const createdAt = cleanText(item?.createdAt || new Date().toISOString());
    const updatedAt = cleanText(item?.updatedAt || createdAt);
    return {
      ...item,
      id: cleanText(item?.id || createLocalId('stock')),
      clinicId: normalizedClinicId,
      name: cleanText(item?.name || item?.nome),
      category: cleanText(item?.category || item?.categoria),
      unit: cleanText(item?.unit || item?.unidade),
      currentQuantity,
      minimumQuantity,
      notes: cleanText(item?.notes || item?.observacoes || ''),
      active: item?.active !== false,
      createdAt,
      updatedAt,
      estoqueAtual: currentQuantity,
      estoqueMinimo: minimumQuantity,
      quantidadeAtual: currentQuantity,
      quantidade: currentQuantity,
    };
  };
  const normalizeStockMovement = (movement = {}, clinicId = '', stockItemId = '') => {
    const quantityDelta = Number(movement?.quantityDelta || 0);
    const quantityBefore = movement?.quantityBefore === undefined || movement?.quantityBefore === null
      ? null
      : normalizeStockNumber(movement.quantityBefore);
    const quantityAfter = movement?.quantityAfter === undefined || movement?.quantityAfter === null
      ? null
      : normalizeStockNumber(movement.quantityAfter);
    const normalizedClinicId = cleanText(movement?.clinicId || clinicId || getCurrentClinicId());
    const normalizedItemId = cleanText(movement?.stockItemId || stockItemId || '');
    const normalizedType = cleanText(movement?.type || '').toLowerCase();
    const normalizedReason = cleanText(movement?.reason || movement?.notes || '');
    const performedByUserId = cleanText(movement?.performedByUserId || movement?.performedBy || '');
    const performedByUserName = cleanText(movement?.performedByUserName || movement?.performedByName || '');
    const createdAt = cleanText(movement?.createdAt || new Date().toISOString());
    return {
      ...movement,
      id: cleanText(movement?.id || createLocalId('stock-mov')),
      clinicId: normalizedClinicId,
      stockItemId: normalizedItemId,
      type: normalizedType,
      quantity: Math.abs(quantityDelta),
      quantityDelta,
      quantityBefore,
      quantityAfter,
      reason: normalizedReason,
      notes: normalizedReason,
      performedByUserId,
      performedByUserName,
      createdAt,
    };
  };
  const setStockSyncSource = (source = 'local') => {
    try {
      window.__stockSyncSource = source === 'backend' ? 'backend' : 'local';
    } catch (_error) {
      // Ignora quando window não permite escrita.
    }
    return source === 'backend' ? 'backend' : 'local';
  };
  const readLocalStockItems = (clinicId = '') => {
    const key = getStockStorageKey(clinicId);
    const legacyKey = 'voithos_estoque_produtos_v1';
    try {
      const raw = localStorage.getItem(key) || localStorage.getItem(legacyKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map((item) => normalizeStockItem(item, clinicId)) : [];
    } catch (_error) {
      return [];
    }
  };
  const readLocalStockMovements = (clinicId = '') => {
    const key = getStockMovementStorageKey(clinicId);
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map((movement) => normalizeStockMovement(movement, clinicId)) : [];
    } catch (_error) {
      return [];
    }
  };
  const writeLocalStockItems = (clinicId = '', items = []) => {
    const normalizedClinicId = cleanText(clinicId);
    const key = getStockStorageKey(normalizedClinicId);
    const normalized = (Array.isArray(items) ? items : [])
      .map((item) => normalizeStockItem(item, normalizedClinicId))
      .filter((item) => item.active !== false);
    try {
      localStorage.setItem(key, JSON.stringify(normalized));
    } catch (_error) {
      // localStorage indisponível - fallback mantido em memória apenas
    }
    return normalized;
  };
  const writeLocalStockMovements = (clinicId = '', items = []) => {
    const normalizedClinicId = cleanText(clinicId);
    const key = getStockMovementStorageKey(normalizedClinicId);
    const normalized = (Array.isArray(items) ? items : [])
      .map((item) => normalizeStockMovement(item, normalizedClinicId))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    try {
      localStorage.setItem(key, JSON.stringify(normalized));
    } catch (_error) {
      // localStorage indisponível - fallback mantido em memória apenas
    }
    return normalized;
  };
  const appendLocalStockMovement = (clinicId = '', movement = {}) => {
    const normalizedClinicId = cleanText(clinicId);
    const current = readLocalStockMovements(normalizedClinicId);
    const next = [normalizeStockMovement(movement, normalizedClinicId, movement?.stockItemId), ...current]
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return writeLocalStockMovements(normalizedClinicId, next);
  };
  const applyLocalStockMovement = (clinicId = '', payload = {}) => {
    const normalizedClinicId = cleanText(clinicId);
    const itemId = cleanText(payload?.itemId || payload?.stockItemId || payload?.id);
    const type = normalizeStockMovement(payload?.movement || payload, normalizedClinicId, itemId).type || cleanText(payload?.type || '').toLowerCase();
    const quantity = normalizeStockNumber(payload?.quantity ?? payload?.currentQuantity ?? payload?.quantidade);
    const reason = cleanText(payload?.reason || payload?.notes || payload?.observacoes || (type === 'ajuste' ? 'Ajuste de estoque.' : ''));
    const actor = {
      userId: cleanText(getStoredUser()?.id || getStoredUser()?.userId || ''),
      userName: cleanText(getStoredUser()?.nome || getStoredUser()?.fullName || ''),
    };
    const items = readLocalStockItems(normalizedClinicId);
    const index = items.findIndex((item) => item.id === itemId);
    if (index < 0) throw new Error('STOCK_ITEM_NOT_FOUND');
    const currentItem = items[index];
    const currentQuantity = normalizeStockNumber(currentItem.currentQuantity ?? currentItem.estoqueAtual ?? currentItem.quantidadeAtual ?? 0);
    let nextQuantity = currentQuantity;
    let delta = 0;
    if (type === 'entrada') {
      delta = quantity;
      nextQuantity = currentQuantity + quantity;
    } else if (type === 'baixa') {
      delta = -quantity;
      nextQuantity = currentQuantity - quantity;
    } else {
      nextQuantity = quantity;
      delta = nextQuantity - currentQuantity;
    }
    if (nextQuantity < 0) throw new Error('STOCK_NEGATIVE_NOT_ALLOWED');
    const updated = normalizeStockItem({ ...currentItem, currentQuantity: nextQuantity, updatedAt: new Date().toISOString() }, normalizedClinicId);
    items[index] = updated;
    writeLocalStockItems(normalizedClinicId, items);
    const movement = normalizeStockMovement({
      id: createLocalId('stock-mov'),
      clinicId: normalizedClinicId,
      stockItemId: itemId,
      type,
      quantityDelta: delta,
      quantityBefore: currentQuantity,
      quantityAfter: nextQuantity,
      notes: reason,
      performedByUserId: actor.userId || '',
      performedByUserName: actor.userName || '',
      createdAt: new Date().toISOString(),
    }, normalizedClinicId, itemId);
    appendLocalStockMovement(normalizedClinicId, movement);
    setStockSyncSource('local');
    return { item: updated, movement };
  };
  const shouldFallbackStock = (error) => {
    const status = Number(error?.status || 0);
    const message = String(error?.message || '').toLowerCase();
    return message.includes('failed to fetch')
      || message.includes('networkerror')
      || message.includes('base da api nao configurada')
      || message.includes('base da api não configurada')
      || status >= 500;
  };
  const migrateLocalStockIfNeeded = async (clinicId = '') => {
    const normalizedClinicId = cleanText(clinicId || getCurrentClinicId());
    if (!normalizedClinicId) return null;
    const migrationKey = getStockMigrationKey(normalizedClinicId);
    try {
      if (localStorage.getItem(migrationKey) === 'done') return null;
    } catch (_error) {
      return null;
    }

    const localItems = readLocalStockItems(normalizedClinicId).filter((item) => item.active !== false);
    if (!localItems.length) return null;

    let remoteItems = [];
    try {
      remoteItems = await request('GET', `/stock/items?clinicId=${encodeURIComponent(normalizedClinicId)}`, null, { auth: true });
    } catch (_error) {
      return null;
    }

    if (Array.isArray(remoteItems) && remoteItems.length) {
      try {
        localStorage.setItem(migrationKey, 'done');
      } catch (_error) {
      }
      writeLocalStockItems(normalizedClinicId, remoteItems);
      return remoteItems;
    }

    const createdItems = [];
    for (const item of localItems) {
      try {
        const created = await request('POST', '/stock/items', {
          clinicId: normalizedClinicId,
          name: item.name,
          category: item.category,
          unit: item.unit,
          currentQuantity: item.currentQuantity,
          minimumQuantity: item.minimumQuantity,
          notes: item.notes || '',
          active: item.active !== false,
        }, { auth: true });
        const normalizedCreated = normalizeStockItem(created?.item || created, normalizedClinicId);
        createdItems.push(normalizedCreated);
        if (created?.movement) appendLocalStockMovement(normalizedClinicId, created.movement);
      } catch (error) {
        if (!shouldFallbackStock(error)) throw error;
      }
    }

    if (createdItems.length) {
      try {
        localStorage.setItem(migrationKey, 'done');
      } catch (_error) {
      }
      writeLocalStockItems(normalizedClinicId, createdItems);
      return createdItems;
    }

    return null;
  };

  const mapCentralRoleToTipo = (role) => {
    const normalizedRole = cleanText(role).toUpperCase();
    if (normalizedRole === 'ADMIN') return 'administrativo';
    if (normalizedRole === 'SUPER_ADMIN') return 'super_admin';
    if (normalizedRole === 'DENTISTA') return 'dentista';
    return 'recepcionista';
  };

  const buildPermissions = (user = {}) => {
    const normalizedRole = cleanText(user.role).toUpperCase();
    const isAdmin = user.isClinicAdmin === true || normalizedRole === 'SUPER_ADMIN';
    if (isAdmin) {
      return {
        admin: true,
        'clinic.manage': true,
        'procedures.manage': true,
        'users.manage': true,
        'data.import': true,
        'agenda.settings': true,
        'agenda.availability': true,
        'notifications.manage': true,
        'agenda.view': true,
        'agenda.edit': true,
        'finance.view': true,
        'finance.edit': true,
      };
    }

    if (normalizedRole === 'DENTISTA') {
      return {
        admin: false,
        'agenda.view': true,
        'agenda.edit': true,
        'finance.view': true,
      };
    }

    return {
      admin: false,
      'agenda.view': true,
      'agenda.edit': true,
    };
  };

  const mapCentralUserToDesktop = (user = {}, clinic = null) => ({
    id: user.id,
    userId: user.id,
    clinicId: user.clinicId || '',
    nome: user.nome || '',
    login: user.email || '',
    email: user.email || '',
    emailVerified: user.emailVerified === true,
    emailVerificationPending: user.emailVerificationPending === true,
    tipo: mapCentralRoleToTipo(user.role),
    role: cleanText(user.role).toUpperCase(),
    isActive: user.ativo !== false,
    isClinicAdmin: user.isClinicAdmin === true || ['ADMIN', 'SUPER_ADMIN'].includes(cleanText(user.role).toUpperCase()),
    permissionsEnabled: true,
    permissions: buildPermissions(user),
    isImpersonatedSession: false,
    clinicName: cleanText(clinic?.nomeFantasia || clinic?.razaoSocial || ''),
    nomeClinica: cleanText(clinic?.nomeFantasia || clinic?.razaoSocial || ''),
    clinic,
  });

  const mapClinicSummary = (clinic = {}) => normalizeClinicSessionData({
    ...clinic,
    id: cleanText(clinic?.id || clinic?.clinicId),
    clinicId: cleanText(clinic?.clinicId || clinic?.id),
    nomeFantasia: cleanText(clinic?.nomeFantasia),
    razaoSocial: cleanText(clinic?.razaoSocial),
    cnpjOuCpf: cleanText(clinic?.cnpjOuCpf || clinic?.cnpjCpf),
    cnpjCpf: cleanText(clinic?.cnpjCpf || clinic?.cnpjOuCpf),
    emailClinica: cleanText(clinic?.emailClinica || clinic?.email),
    email: cleanText(clinic?.email || clinic?.emailClinica),
    telefone: cleanText(clinic?.telefone || clinic?.telefoneComercial),
    telefoneComercial: cleanText(clinic?.telefoneComercial || clinic?.telefone),
    accessBlocked: clinic?.accessBlocked === true,
    accessBlockedAt: cleanText(clinic?.accessBlockedAt),
    accessBlockedReason: cleanText(clinic?.accessBlockedReason),
    accessBlockedByUserId: cleanText(clinic?.accessBlockedByUserId),
    accessUnblockedAt: cleanText(clinic?.accessUnblockedAt),
    accessUnblockedByUserId: cleanText(clinic?.accessUnblockedByUserId),
    status: cleanText(clinic?.status || 'active').toLowerCase() || 'active',
  });

  const buildAuthContext = (user = null, clinic = null) => ({
    accessProfile: user?.tipo === 'super_admin' ? 'SUPERADMIN' : user ? 'AUTHENTICATED' : 'ANONYMOUS',
    tenantScope: user?.tipo === 'super_admin' ? 'global' : user ? 'clinic' : 'anonymous',
    clinicId: cleanText(user?.clinicId || clinic?.id || ''),
    user,
    clinic,
  });

  const buildRequestHeaders = (options = {}) => {
    const headers = { ...(options.headers || {}) };
    if (!options.omitContentType) {
      headers['Content-Type'] = cleanText(options.contentType) || 'application/json';
    }
    if (options.auth !== false) {
      const token = cleanText(options.token || getStoredToken());
      if (token) headers.authorization = `Bearer ${token}`;
    }
    return headers;
  };

  const performFetch = async (method, path, body, options = {}) => {
    const base = getBaseUrl();
    if (!base) {
      throw new Error('Base da API nao configurada. Defina localStorage.apiBase ou window.__APP_API_BASE__.');
    }
    return fetch(base + path, {
      method,
      headers: buildRequestHeaders(options),
      body,
    });
  };

  const parseResponsePayload = async (response) => {
    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch (_e) {
      payload = text || null;
    }
    return payload;
  };

  const request = async (method, path, body, options = {}) => {
    logWebAuthDiagnostic('request_started', {
      endpoint: path,
      method,
      status: 'started',
      fallback: false,
    });
    try {
      const response = await performFetch(method, path, body ? JSON.stringify(body) : undefined, {
        ...options,
        contentType: 'application/json',
      });
      logWebAuthDiagnostic('request_response', {
        endpoint: path,
        method,
        status: response.ok ? 'ok' : 'error',
        responseStatus: response.status,
        fallback: false,
      });
      const payload = await parseResponsePayload(response);

      if (!response.ok) {
        const message = payload?.error?.message || payload?.error || payload?.message || ('HTTP ' + response.status);
        const error = new Error(message);
        error.status = response.status;
        error.code = payload?.error?.code || payload?.code || 'HTTP_ERROR';
        logWebAuthDiagnostic('request_failed', {
          endpoint: path,
          method,
          status: 'http_error',
          responseStatus: response.status,
          error: message,
          fallback: false,
        });
        throw error;
      }

      return payload && Object.prototype.hasOwnProperty.call(payload, 'data') ? payload.data : payload;
    } catch (error) {
      logWebAuthDiagnostic('request_error', {
        endpoint: path,
        method,
        status: 'exception',
        error: error?.message || String(error || ''),
        fallback: false,
      });
      throw error;
    }
  };

  const requestRawBody = async (method, path, body, options = {}) => {
    const response = await performFetch(method, path, body, options);
    const payload = await parseResponsePayload(response);
    if (!response.ok) {
      const message = payload?.error?.message || payload?.error || payload?.message || ('HTTP ' + response.status);
      throw new Error(message);
    }
    return payload && Object.prototype.hasOwnProperty.call(payload, 'data') ? payload.data : payload;
  };

  const requestBinary = async (method, path, body, options = {}) => {
    const response = await performFetch(method, path, body, options);
    if (!response.ok) {
      const payload = await parseResponsePayload(response);
      const message = payload?.error?.message || payload?.error || payload?.message || ('HTTP ' + response.status);
      throw new Error(message);
    }
    const buffer = await response.arrayBuffer();
    return {
      buffer,
      headers: response.headers,
      contentType: cleanText(response.headers.get('content-type') || 'application/octet-stream'),
      fileName: decodeURIComponent(cleanText(response.headers.get('x-file-name') || '') || ''),
    };
  };

  const getOperationalSettings = async () => request('GET', '/clinics/me/operational-settings', null, { auth: true });
  const patchOperationalSettings = async (patch = {}) => {
    const settings = await request('PATCH', '/clinics/me/operational-settings', patch || {}, { auth: true });
    const currentClinic = getStoredClinic();
    if (currentClinic && typeof currentClinic === 'object') {
      const clinic = normalizeClinicSessionData({
        ...currentClinic,
        operationalSettings: settings,
      });
      persistWebSession({
        token: getStoredToken(),
        user: getStoredUser(),
        clinic,
      });
    }
    return settings;
  };
  const buildLegacyClinicSavePayload = (payload = {}, currentClinic = {}) => {
    const raw = payload && typeof payload === 'object' ? payload : {};
    const current = normalizeClinicSessionData(currentClinic || {});
    const currentProfile = current?.operationalSettings?.clinicProfile || {};
    const nextAddress = {
      rua: cleanText(raw?.rua ?? raw?.endereco?.rua ?? current?.rua ?? current?.endereco?.rua),
      numero: cleanText(raw?.numero ?? raw?.endereco?.numero ?? current?.numero ?? current?.endereco?.numero),
      complemento: cleanText(raw?.complemento ?? raw?.endereco?.complemento ?? current?.complemento ?? current?.endereco?.complemento),
      bairro: cleanText(raw?.bairro ?? raw?.endereco?.bairro ?? current?.bairro ?? current?.endereco?.bairro),
      cidade: cleanText(raw?.cidade ?? raw?.endereco?.cidade ?? current?.cidade ?? current?.endereco?.cidade),
      uf: cleanText(raw?.estado ?? raw?.uf ?? raw?.endereco?.uf ?? current?.estado ?? current?.uf ?? current?.endereco?.uf),
      cep: cleanText(raw?.cep ?? raw?.endereco?.cep ?? current?.cep ?? current?.endereco?.cep),
    };
    const nextLogoData = raw?.logoRemove === true
      ? ''
      : cleanText(raw?.logoData || current?.logoData || currentProfile?.logoDataUrlCache);
    const nextLogoVersion = raw?.logoRemove === true
      ? ''
      : (cleanText(raw?.logoData) ? new Date().toISOString() : cleanText(current?.logoVersion || currentProfile?.logoVersion));
    const profilePatch = {
      nomeFantasia: cleanText(raw?.nomeFantasia || raw?.nomeClinica || current?.nomeFantasia || current?.nomeClinica),
      razaoSocial: cleanText(raw?.razaoSocial || current?.razaoSocial),
      cnpj: cleanText(raw?.cnpj || raw?.cnpjCpf || raw?.cnpjOuCpf || current?.cnpj || current?.cnpjCpf || current?.cnpjOuCpf),
      email: cleanText(raw?.email || raw?.emailClinica || current?.email || current?.emailClinica),
      telefone: cleanText(raw?.telefone || raw?.telefoneComercial || current?.telefone || current?.telefoneComercial),
      whatsapp: cleanText(raw?.whatsapp || current?.whatsapp || currentProfile?.whatsapp),
      cro: cleanText(raw?.cro || current?.cro || currentProfile?.cro),
      responsavelTecnico: cleanText(raw?.responsavelTecnico || current?.responsavelTecnico || currentProfile?.responsavelTecnico),
      logoDataUrlCache: nextLogoData,
      logoVersion: nextLogoVersion,
      endereco: nextAddress,
    };
    const settingsPatch = {};
    if (raw?.messaging?.birthday && typeof raw.messaging.birthday === 'object') {
      settingsPatch.birthdayMessaging = raw.messaging.birthday;
    }
    if (raw?.receituario && typeof raw.receituario === 'object') {
      settingsPatch.receituario = raw.receituario;
    }
    settingsPatch.clinicProfile = {
      whatsapp: profilePatch.whatsapp,
      cro: profilePatch.cro,
      responsavelTecnico: profilePatch.responsavelTecnico,
      logoDataUrlCache: profilePatch.logoDataUrlCache,
      logoVersion: profilePatch.logoVersion,
      endereco: nextAddress,
    };
    return { profilePatch, settingsPatch };
  };
  const fetchStaticProcedureCatalog = async () => {
    if (Array.isArray(staticProcedureCatalogCache)) {
      return staticProcedureCatalogCache;
    }
    if (staticProcedureCatalogLoading) {
      return staticProcedureCatalogLoading;
    }
    const candidates = ['Procedimentos.json', './Procedimentos.json', '/Procedimentos.json'];
    staticProcedureCatalogLoading = (async () => {
      for (const candidate of candidates) {
        try {
          const response = await fetch(candidate, { method: 'GET' });
          if (!response.ok) continue;
          const payload = await response.json();
          const items = extractProcedureCatalogItems(payload);
          if (items.length) {
            staticProcedureCatalogCache = items.map((item) => normalizeProcedureItem(item));
            return staticProcedureCatalogCache;
          }
        } catch (_error) {
        }
      }
      staticProcedureCatalogCache = [];
      return staticProcedureCatalogCache;
    })();
    try {
      return await staticProcedureCatalogLoading;
    } finally {
      staticProcedureCatalogLoading = null;
    }
  };
  const resolvePatientId = (payload = {}) => cleanText(payload?.patientId || payload?.prontuario || payload?.id);
  const buildDocumentRecord = ({
    id = '',
    title = '',
    type = 'DOCUMENTO',
    category = 'CLINICOS',
    documentDate = '',
    folder = '',
    prontuario = '',
    patientId = '',
    createdBy = null,
    data = {},
    archived = false,
  } = {}) => ({
    id: cleanText(id || createLocalId('doc')),
    title: cleanText(title),
    type: normalizeDocumentType(type || 'DOCUMENTO'),
    category: cleanText(category || 'CLINICOS'),
    folder: cleanText(folder),
    documentDate: cleanText(documentDate || normalizeDateOnly(new Date())),
    archived: archived === true,
    prontuario: cleanText(prontuario || patientId),
    patientId: cleanText(patientId || prontuario),
    createdBy: createdBy && typeof createdBy === 'object' ? {
      id: cleanText(createdBy.id),
      nome: cleanText(createdBy.nome),
    } : resolveDocumentActor(data),
    updatedAt: new Date().toISOString(),
    data: data && typeof data === 'object' ? data : { conteudo: String(data || '') },
  });
  const sortDocumentsByDateDesc = (items = []) => (Array.isArray(items) ? items : [])
    .slice()
    .sort((a, b) => String(b?.documentDate || b?.createdAt || '').localeCompare(String(a?.documentDate || a?.createdAt || '')));
  const findDocumentRecord = async ({ prontuario, patientId, documentId, includeArchived = true } = {}) => {
    const resolvedPatientId = resolvePatientId({ prontuario, patientId });
    const normalizedDocumentId = cleanText(documentId);
    if (!resolvedPatientId || !normalizedDocumentId) return null;
    const docs = await request(
      'GET',
      `/clinical/patients/${encodeURIComponent(resolvedPatientId)}/documents?includeArchived=${includeArchived ? 'true' : 'false'}`,
      null,
      { auth: true }
    );
    return (Array.isArray(docs) ? docs : []).find((item) => cleanText(item?.id) === normalizedDocumentId) || null;
  };
  const saveGenericDocument = async (payload = {}, { type, category = 'CLINICOS', titleFallback = 'Documento' } = {}) => {
    const patientId = resolvePatientId(payload);
    if (!patientId) throw new Error('patientId/prontuario is required.');
    const title = cleanText(payload?.title || payload?.titulo || titleFallback);
    const actor = resolveDocumentActor(payload);
    const record = buildDocumentRecord({
      id: payload?.documentId || payload?.id || createLocalId('doc'),
      title,
      type,
      category,
      folder: payload?.folder || '',
      prontuario: patientId,
      patientId,
      createdBy: actor,
      documentDate: payload?.documentDate || payload?.data || normalizeDateOnly(new Date()),
      archived: payload?.archived === true,
      data: {
        ...payload,
        prontuario: patientId,
        patientId,
        previewHtml: buildDocumentPreviewMarkup({
          title,
          type,
          documentDate: payload?.documentDate || payload?.data || normalizeDateOnly(new Date()),
          data: payload,
        }),
      },
    });
    return request(
      'POST',
      `/clinical/patients/${encodeURIComponent(patientId)}/documents`,
      { document: record },
      { auth: true }
    );
  };

  const clinicApi = {
    get: async () => {
      const [profile, operationalSettings] = await Promise.all([
        request('GET', '/clinics/me/profile', null, { auth: true }),
        request('GET', '/clinics/me/operational-settings', null, { auth: true }),
      ]);

      const clinic = {
        ...(profile && typeof profile === 'object' ? profile : {}),
        operationalSettings: operationalSettings && typeof operationalSettings === 'object' ? operationalSettings : {},
      };
      const normalizedClinic = normalizeClinicSessionData(clinic);

      const storedUser = getStoredUser();
      persistWebSession({
        token: getStoredToken(),
        user: storedUser ? {
          ...storedUser,
          clinicName: cleanText(normalizedClinic?.nomeFantasia || normalizedClinic?.razaoSocial || storedUser?.clinicName || ''),
          nomeClinica: cleanText(normalizedClinic?.nomeFantasia || normalizedClinic?.razaoSocial || storedUser?.nomeClinica || ''),
          clinic: normalizedClinic,
        } : null,
        clinic: normalizedClinic,
      });

      return normalizedClinic;
    },
    getOnboardingState: async () => request('GET', '/clinics/me/onboarding', null, { auth: true }),
    updateOnboardingState: async (payload = {}) => request('PATCH', '/clinics/me/onboarding', payload || {}, { auth: true }),
    save: async (payload = {}) => {
      const currentClinic = getStoredClinic() || {};
      const legacyPayload = buildLegacyClinicSavePayload(payload, currentClinic);
      const explicitProfilePatch = payload?.profile && typeof payload.profile === 'object' ? payload.profile : {};
      const explicitSettingsPatch = payload?.operationalSettings && typeof payload.operationalSettings === 'object'
        ? payload.operationalSettings
        : {};
      const profilePatch = {
        ...legacyPayload.profilePatch,
        ...explicitProfilePatch,
        endereco: {
          ...(legacyPayload.profilePatch?.endereco || {}),
          ...(explicitProfilePatch?.endereco && typeof explicitProfilePatch.endereco === 'object' ? explicitProfilePatch.endereco : {}),
        },
      };
      const settingsPatch = {
        ...legacyPayload.settingsPatch,
        ...explicitSettingsPatch,
        clinicProfile: {
          ...(legacyPayload.settingsPatch?.clinicProfile || {}),
          ...(explicitSettingsPatch?.clinicProfile && typeof explicitSettingsPatch.clinicProfile === 'object' ? explicitSettingsPatch.clinicProfile : {}),
          endereco: {
            ...(legacyPayload.settingsPatch?.clinicProfile?.endereco || {}),
            ...(explicitSettingsPatch?.clinicProfile?.endereco && typeof explicitSettingsPatch.clinicProfile.endereco === 'object' ? explicitSettingsPatch.clinicProfile.endereco : {}),
          },
        },
        birthdayMessaging: explicitSettingsPatch?.birthdayMessaging && typeof explicitSettingsPatch.birthdayMessaging === 'object'
          ? explicitSettingsPatch.birthdayMessaging
          : legacyPayload.settingsPatch?.birthdayMessaging,
        receituario: explicitSettingsPatch?.receituario && typeof explicitSettingsPatch.receituario === 'object'
          ? explicitSettingsPatch.receituario
          : legacyPayload.settingsPatch?.receituario,
      };

      const [profile, operationalSettings] = await Promise.all([
        request('PATCH', '/clinics/me/profile', profilePatch || {}, { auth: true }),
        Object.keys(settingsPatch).length
          ? request('PATCH', '/clinics/me/operational-settings', settingsPatch, { auth: true })
          : Promise.resolve(getStoredClinic()?.operationalSettings || {}),
      ]);

      const clinic = {
        ...(profile && typeof profile === 'object' ? profile : {}),
        operationalSettings: operationalSettings && typeof operationalSettings === 'object' ? operationalSettings : {},
      };
      const normalizedClinic = normalizeClinicSessionData(clinic);

      const storedUser = getStoredUser();
      persistWebSession({
        token: getStoredToken(),
        user: storedUser ? {
          ...storedUser,
          clinicName: cleanText(normalizedClinic?.nomeFantasia || normalizedClinic?.razaoSocial || storedUser?.clinicName || ''),
          nomeClinica: cleanText(normalizedClinic?.nomeFantasia || normalizedClinic?.razaoSocial || storedUser?.nomeClinica || ''),
          clinic: normalizedClinic,
        } : null,
        clinic: normalizedClinic,
      });

      return normalizedClinic;
    },
    testWhatsApp: async () => notImplemented('clinic.testWhatsApp'),
    listMessagingLogs: async () => notImplemented('clinic.listMessagingLogs'),
    queueWhatsApp: async () => notImplemented('clinic.queueWhatsApp'),
    exportData: async () => request('GET', '/clinics/me/data-export', null, { auth: true }),
    previewImport: async (payload = {}) => request('POST', '/clinics/me/data-import/preview', payload || {}, { auth: true }),
    applyImport: async (payload = {}) => request('POST', '/clinics/me/data-import/apply', payload || {}, { auth: true }),
    getWhatsAppEngineHealth: async () => request('GET', '/clinics/me/whatsapp/health', null, { auth: true }),
    getWhatsAppConnection: async () => request('GET', '/clinics/me/whatsapp/connection', null, { auth: true }),
    refreshWhatsAppConnection: async () => request('POST', '/clinics/me/whatsapp/connection/refresh', {}, { auth: true }),
    connectWhatsApp: async () => request('POST', '/clinics/me/whatsapp/connect', {}, { auth: true }),
    disconnectWhatsApp: async () => request('POST', '/clinics/me/whatsapp/disconnect', {}, { auth: true }),
    deleteWhatsAppInstance: async () => request('DELETE', '/clinics/me/whatsapp/instance', null, { auth: true }),
  };

  const subscription = {
    getMySubscription: async () => request('GET', '/subscription/me', null, { auth: true }),
    create: async (payload = {}) => request('POST', '/subscription/create', payload || {}, { auth: true }),
    createCheckout: async (payload = {}) => request('POST', '/subscription/checkout', payload || {}, { auth: true }),
    confirmPayment: async (payload = {}) => request('POST', '/subscription/confirm-payment', payload || {}, { auth: true }),
    refreshPaymentStatus: async () => request('POST', '/subscription/refresh-payment-status', {}, { auth: true }),
    renew: async (payload = {}) => request('POST', '/subscription/renew', payload || {}, { auth: true }),
  };

  const auth = {
    login: async ({ email, login, senha }) => {
      const result = await request('POST', '/auth/login', {
        email: cleanText(login || email).toLowerCase(),
        password: cleanText(senha),
      }, { auth: false });

      const mappedUser = mapCentralUserToDesktop(result?.user || {});
      persistWebSession({ token: result?.token || '', user: mappedUser, clinic: null });
      return { success: true, user: mappedUser, token: result?.token || '' };
    },
    signup: async (payload) => {
      const result = await request('POST', '/auth/signup', payload || {}, { auth: false });
      const clinic = result?.clinic ? normalizeClinicSessionData(result.clinic) : null;
      const mappedUser = mapCentralUserToDesktop(result?.user || {}, clinic);
      const token = cleanText(result?.token || '');
      const pendingVerification = result?.pendingVerification === true
        || mappedUser?.emailVerificationPending === true
        || mappedUser?.emailVerified !== true;

      if (token && mappedUser && !pendingVerification) {
        persistWebSession({ token, user: mappedUser, clinic });
      } else {
        clearWebSession();
      }
      return {
        success: true,
        user: mappedUser,
        clinic,
        token,
        pendingVerification,
        emailVerificationSent: result?.emailVerificationSent === true,
        reusedActiveVerification: result?.reusedActiveVerification === true,
        verificationExpiresAt: result?.verificationExpiresAt || null,
        resendAvailableAt: result?.resendAvailableAt || null,
        sendCount: Number(result?.sendCount || 0),
      };
    },
    confirmEmailVerification: async ({ email, code }) => {
      const payload = {
        email: cleanText(email).toLowerCase(),
        code: cleanText(code),
      };
      logPasswordResetDiagnostic('email_verification_call', payload, {
        endpoint: '/auth/email-verification/confirm',
        status: 'started',
      });
      try {
        const result = await request('POST', '/auth/email-verification/confirm', payload, { auth: false });
        logPasswordResetDiagnostic('email_verification_completed', payload, {
          endpoint: '/auth/email-verification/confirm',
          status: result?.verified === true || result?.ok === true ? 'success' : 'failed',
        });
        if (result?.verified === true || result?.ok === true) {
          const storedUser = getStoredUser();
          const storedClinic = getStoredClinic();
          const token = cleanText(result?.token || getStoredToken());
          const responseUser = mapCentralUserToDesktop(result?.user || storedUser || {}, storedClinic);
          if (token && responseUser) {
            persistWebSession({
              token,
              user: {
                ...responseUser,
                emailVerified: true,
                emailVerificationPending: false,
              },
              clinic: result?.clinic ? normalizeClinicSessionData(result.clinic) : storedClinic,
            });
          }
        }
        return {
          success: result?.verified === true || result?.ok === true,
          token: result?.token || '',
          user: result?.user ? mapCentralUserToDesktop(result.user, result?.clinic ? normalizeClinicSessionData(result.clinic) : getStoredClinic()) : null,
          clinic: result?.clinic ? normalizeClinicSessionData(result.clinic) : null,
          pendingCheckout: result?.pendingCheckout === true,
          pendingSignupToken: cleanText(result?.pendingSignupToken || ''),
          selectedPlan: cleanText(result?.selectedPlan || ''),
          operationType: cleanText(result?.operationType || ''),
          paymentLink: cleanText(result?.paymentLink || ''),
          paymentExpiresAt: result?.paymentExpiresAt || null,
        };
      } catch (error) {
        logPasswordResetDiagnostic('email_verification_error', payload, {
          endpoint: '/auth/email-verification/confirm',
          status: 'error',
          error: error?.message || String(error || ''),
        });
        throw error;
      }
    },
    updatePendingSignupOnboarding: async (payload = {}) => request('POST', '/auth/pending-signup/onboarding', payload || {}, { auth: false }),
    createPendingSignupCheckout: async (payload = {}) => request('POST', '/auth/pending-signup/checkout', payload || {}, { auth: false }),
    validatePromotionOffer: async (code, email = '') => {
      const query = cleanText(email) ? `?email=${encodeURIComponent(cleanText(email))}` : '';
      return request('GET', `/auth/promotion-offers/${encodeURIComponent(cleanText(code))}${query}`, null, { auth: false });
    },
    refreshPendingSignupPaymentStatus: async (payload = {}) => {
      const result = await request('POST', '/auth/pending-signup/refresh-payment-status', payload || {}, { auth: false });
      if (result?.token && result?.user) {
        const clinic = result?.clinic ? normalizeClinicSessionData(result.clinic) : null;
        const mappedUser = mapCentralUserToDesktop(result.user, clinic);
        persistWebSession({ token: result.token, user: mappedUser, clinic });
        return {
          ...result,
          user: mappedUser,
          clinic,
        };
      }
      return result;
    },
    resendEmailVerification: async ({ email }) => {
      const payload = {
        email: cleanText(email).toLowerCase(),
      };
      logPasswordResetDiagnostic('email_verification_resend_call', payload, {
        endpoint: '/auth/email-verification/resend',
        status: 'started',
      });
      try {
        const result = await request('POST', '/auth/email-verification/resend', payload, { auth: false });
        const deliveryConfirmed = result?.deliveryConfirmed === true || result?.resent === true || result?.ok === true;
        logPasswordResetDiagnostic('email_verification_resend_completed', payload, {
          endpoint: '/auth/email-verification/resend',
          status: result?.blocked === true ? 'blocked' : (deliveryConfirmed ? 'success' : 'failed'),
        });
        return {
          success: deliveryConfirmed,
          resent: result?.resent === true,
          blocked: result?.blocked === true,
          reason: result?.reason || '',
          message: result?.message || '',
          resendAvailableAt: result?.resendAvailableAt || null,
          verificationExpiresAt: result?.verificationExpiresAt || null,
          sendCount: Number(result?.sendCount || 0),
          deliveryConfirmed,
          pendingVerification: result?.pendingVerification === true || deliveryConfirmed,
        };
      } catch (error) {
        logPasswordResetDiagnostic('email_verification_resend_error', payload, {
          endpoint: '/auth/email-verification/resend',
          status: 'error',
          error: error?.message || String(error || ''),
        });
        throw error;
      }
    },
    requestPasswordReset: async ({ email }) => {
      const payload = { email: cleanText(email).toLowerCase() };
      logPasswordResetDiagnostic('request_call', payload, {
        endpoint: '/auth/password-reset/request',
        status: 'started',
      });
      try {
        const result = await request('POST', '/auth/password-reset/request', payload, { auth: false });
        const deliveryConfirmed = result?.deliveryConfirmed === true
          || (result?.deliveryConfirmed == null && (result?.requested === true || result?.ok === true));
        logPasswordResetDiagnostic('request_completed', payload, {
          endpoint: '/auth/password-reset/request',
          status: deliveryConfirmed ? 'success' : 'failed',
        });
        return {
          success: deliveryConfirmed,
          requested: result?.requested === true || result?.ok === true,
          deliveryConfirmed,
        };
      } catch (error) {
        logPasswordResetDiagnostic('request_error', payload, {
          endpoint: '/auth/password-reset/request',
          status: 'error',
          error: error?.message || String(error || ''),
        });
        throw error;
      }
    },
    validatePasswordResetCode: async ({ email, code }) => {
      const payload = {
        email: cleanText(email).toLowerCase(),
        code: cleanText(code),
      };
      logPasswordResetDiagnostic('validate_call', payload, {
        endpoint: '/auth/password-reset/validate',
        status: 'started',
      });
      try {
        const result = await request('POST', '/auth/password-reset/validate', payload, { auth: false });
        logPasswordResetDiagnostic('validate_completed', payload, {
          endpoint: '/auth/password-reset/validate',
          status: result?.valid === true || result?.ok === true ? 'success' : 'failed',
        });
        return { success: result?.valid === true || result?.ok === true };
      } catch (error) {
        logPasswordResetDiagnostic('validate_error', payload, {
          endpoint: '/auth/password-reset/validate',
          status: 'error',
          error: error?.message || String(error || ''),
        });
        throw error;
      }
    },
    saveNewPassword: async ({ email, code, newPassword, confirmPassword }) => {
      const payload = {
        email: cleanText(email).toLowerCase(),
        code: cleanText(code),
        newPassword: cleanText(newPassword),
        confirmPassword: cleanText(confirmPassword),
      };
      logPasswordResetDiagnostic('confirm_call', payload, {
        endpoint: '/auth/password-reset/confirm',
        status: 'started',
      });
      try {
        const result = await request('POST', '/auth/password-reset/confirm', payload, { auth: false });
        logPasswordResetDiagnostic('confirm_completed', payload, {
          endpoint: '/auth/password-reset/confirm',
          status: result?.reset === true || result?.ok === true ? 'success' : 'failed',
        });
        return { success: result?.reset === true || result?.ok === true };
      } catch (error) {
        logPasswordResetDiagnostic('confirm_error', payload, {
          endpoint: '/auth/password-reset/confirm',
          status: 'error',
          error: error?.message || String(error || ''),
        });
        throw error;
      }
    },
    logout: async () => {
      try {
        if (getStoredToken()) {
          await request('POST', '/auth/logout', {}, { auth: true });
        }
      } catch (_error) {
        // local session still needs to be cleared
      }
      clearWebSession();
      return { success: true };
    },
    clearSession: async ({ remote = false } = {}) => {
      if (remote === true) {
        try {
          if (getStoredToken()) {
            await request('POST', '/auth/logout', {}, { auth: true });
          }
        } catch (_error) {
          // local session still needs to be cleared
        }
      }
      clearWebSession();
      return { success: true };
    },
    currentUser: async () => {
      const token = getStoredToken();
      if (!token) return null;

      try {
        const user = await request('GET', '/auth/me', null, { auth: true, token });
        const clinic = getStoredClinic();
        const storedUser = getStoredUser();
        const mappedUser = {
          ...mapCentralUserToDesktop(user || {}, clinic),
          isImpersonatedSession: storedUser?.isImpersonatedSession === true && cleanText(storedUser?.id) === cleanText(user?.id),
        };
        persistWebSession({ token, user: mappedUser, clinic });
        return mappedUser;
      } catch (error) {
        if (error?.code === 'CLINIC_ACCESS_BLOCKED' || error?.status === 403) {
          clearWebSession();
          throw error;
        }
        if (/unauthorized|expired|invalid/i.test(cleanText(error?.message))) {
          clearWebSession();
          return null;
        }
        const storedUser = getStoredUser();
        if (storedUser?.emailVerificationPending === true || storedUser?.emailVerified !== true) {
          clearWebSession();
          return null;
        }
        return storedUser;
      }
    },
    currentContext: async () => {
      const user = await auth.currentUser();
      if (!user) return buildAuthContext(null, null);
      try {
        const clinic = await clinicApi.get();
        const normalizedUser = {
          ...mapCentralUserToDesktop(user, clinic),
          isImpersonatedSession: user?.isImpersonatedSession === true,
        };
        persistWebSession({ token: getStoredToken(), user: normalizedUser, clinic });
        return buildAuthContext(normalizedUser, clinic);
      } catch (_error) {
        return buildAuthContext(user, getStoredClinic());
      }
    },
    listUsers: async () => {
      const data = await request('GET', '/users', null, { auth: true });
      const clinic = getStoredClinic();
      return (Array.isArray(data) ? data : []).map((user) => mapCentralUserToDesktop(user, clinic));
    },
    changePassword: async ({ senhaAtual, novaSenha }) => {
      const result = await request('POST', '/auth/change-password', {
        senhaAtual,
        novaSenha,
      }, { auth: true });
      return { success: result?.changed === true || result?.success === true };
    },
    impersonateClinic: async (clinicId) => {
      const result = await request('POST', '/auth/impersonate-clinic-admin', {
        clinicId: cleanText(clinicId),
      }, { auth: true });
      const token = cleanText(result?.token);
      if (!token) {
        throw new Error('Token de sessao da clinica nao retornado pelo backend.');
      }
      const clinic = await request('GET', '/clinics/me/profile', null, { auth: true, token })
        .then((data) => normalizeClinicSessionData(data || {}))
        .catch(() => null);
      const mappedUser = {
        ...mapCentralUserToDesktop(result?.user || {}, clinic),
        isImpersonatedSession: true,
      };
      persistWebSession({ token, user: mappedUser, clinic });
      return { success: true, user: mappedUser, clinic, token };
    },
    listClinics: async () => {
      const data = await request('GET', '/clinics', null, { auth: true });
      return (Array.isArray(data) ? data : []).map(mapClinicSummary);
    },
    getOnboardingDashboard: async () => request('GET', '/clinics/super-admin/onboarding-dashboard', null, { auth: true }),
    listPromotionOffers: async () => request('GET', '/clinics/super-admin/promotion-offers', null, { auth: true }),
    createPromotionOffer: async (payload = {}) => request('POST', '/clinics/super-admin/promotion-offers', payload || {}, { auth: true }),
    updatePromotionOffer: async (id, payload = {}) => request('PATCH', `/clinics/super-admin/promotion-offers/${encodeURIComponent(cleanText(id))}`, payload || {}, { auth: true }),
    deactivatePromotionOffer: async (id) => request('DELETE', `/clinics/super-admin/promotion-offers/${encodeURIComponent(cleanText(id))}`, null, { auth: true }),
    blockClinicAccess: async (clinicId, reason = '') => request(
      'POST',
      `/clinics/super-admin/clinics/${encodeURIComponent(cleanText(clinicId))}/block`,
      { reason: cleanText(reason) },
      { auth: true }
    ),
    unblockClinicAccess: async (clinicId) => request(
      'POST',
      `/clinics/super-admin/clinics/${encodeURIComponent(cleanText(clinicId))}/unblock`,
      {},
      { auth: true }
    ),
    deletePendingClinicRegistration: async (id) => request(
      'DELETE',
      `/clinics/super-admin/pending/${encodeURIComponent(cleanText(id))}`,
      null,
      { auth: true }
    ),
    createClinic: async (payload = {}) => {
      const result = await request('POST', '/clinics/bootstrap', payload || {}, { auth: true });
      return {
        ...result,
        clinic: mapClinicSummary(result?.clinic || {}),
      };
    },
  };

  const patients = {
    list: async () => {
      const data = await request('GET', '/patients', null, { auth: true });
      return (Array.isArray(data) ? data : []).map(mapCentralPatientToLegacy);
    },
    read: async (id) => {
      const data = await request('GET', '/patients/' + encodeURIComponent(cleanText(id)), null, { auth: true });
      return mapCentralPatientToLegacy(data || {});
    },
    search: async (query) => {
      const list = await patients.list();
      return list.filter((patient) => matchesPatientQuery(patient, query));
    },
    find: async (query = {}) => {
      const list = await patients.list();
      const explicitId = cleanText(query?.prontuario || query?.patientId || query?.id);
      if (explicitId) {
        const foundById = list.find((patient) => cleanText(patient?.prontuario || patient?.id) === explicitId);
        if (foundById) return foundById;
      }
      const terms = [
        cleanText(query?.nome),
        cleanText(query?.fullName),
        cleanText(query?.cpf),
        cleanText(query?.telefone),
      ].filter(Boolean);
      return list.find((patient) => terms.some((term) => matchesPatientQuery(patient, term))) || null;
    },
    save: async (payload = {}) => {
      const normalizedId = cleanText(payload?.id);
      const body = normalizeLegacyPatientPayload(payload);
      const data = normalizedId
        ? await request('PATCH', '/patients/' + encodeURIComponent(normalizedId), body, { auth: true })
        : await request('POST', '/patients', body, { auth: true });
      return mapCentralPatientToLegacy(data || {});
    },
    remove: async (id) => request('DELETE', '/patients/' + encodeURIComponent(cleanText(id?.id || id)), null, { auth: true }),
    uploadSelfie: async () => {
      throw new Error('uploadSelfie ainda nao implementado no backend web.');
    },
    updateDentist: async ({ prontuario, novoDentistaId } = {}) => {
      const patient = await patients.read(prontuario);
      if (!patient) throw new Error('Paciente nao encontrado.');
      const users = await auth.listUsers();
      const clinicId = cleanText(getStoredUser()?.clinicId || getStoredClinic()?.id || patient?.clinicId);
      const dentist = (Array.isArray(users) ? users : []).find((user) => (
        cleanText(user?.id) === cleanText(novoDentistaId)
        && cleanText(user?.tipo).toLowerCase() === 'dentista'
        && (!clinicId || cleanText(user?.clinicId) === clinicId)
      ));
      if (!dentist) throw new Error('Dentista invalido para esta clinica.');
      return patients.save({
        ...patient,
        dentistaId: dentist.id,
        dentistaNome: dentist.nome || dentist.fullName || dentist.login || 'Dentista',
      });
    },
  };

  const users = {
    list: async () => auth.listUsers(),
    create: async (payload = {}) => {
      const data = await request('POST', '/users', payload || {}, { auth: true });
      return mapCentralUserToDesktop(data || {}, getStoredClinic());
    },
    update: async (payload = {}) => {
      const id = cleanText(payload?.id || payload?.userId);
      const data = await request('PATCH', `/users/${encodeURIComponent(id)}`, payload || {}, { auth: true });
      return mapCentralUserToDesktop(data || {}, getStoredClinic());
    },
    delete: async (id) => request('DELETE', `/users/${encodeURIComponent(cleanText(id?.id || id))}`, null, { auth: true }),
    resetPassword: async ({ id, password, novaSenha }) => request('POST', `/users/${encodeURIComponent(cleanText(id))}/reset-password`, {
      password: cleanText(password || novaSenha),
      novaSenha: cleanText(novaSenha || password),
    }, { auth: true }),
  };

  const normalizeLegacyProcedurePayload = (service = {}) => {
    const teeth = Array.isArray(service?.dentes)
      ? service.dentes.map((item) => cleanText(item)).filter(Boolean)
      : (cleanText(service?.dente) ? [cleanText(service.dente)] : []);
    const faces = Array.isArray(service?.faces)
      ? service.faces.map((item) => cleanText(item)).filter(Boolean)
      : [];
    const amount = Number(service?.valorCobrado ?? service?.valor ?? service?.price ?? 0) || 0;
    const finance = service?.financeiro && typeof service.financeiro === 'object'
      ? service.financeiro
      : {};
    return {
      ...service,
      id: cleanText(service?.id || service?.externalId || createLocalId('proc')),
      externalId: cleanText(service?.externalId || service?.id || ''),
      codigo: cleanText(service?.codigo || service?.code || ''),
      nome: cleanText(service?.nome || service?.tipo || service?.procedimento || 'Procedimento'),
      tipo: cleanText(service?.tipo || service?.nome || service?.procedimento || 'Procedimento'),
      dentes: teeth,
      dente: cleanText(service?.dente || teeth[0] || ''),
      faces,
      valor: amount,
      valorCobrado: Number(service?.valorCobrado ?? amount) || amount,
      gerarFinanceiro: service?.gerarFinanceiro !== false,
      status: cleanText(service?.status || service?.estado || service?.situacao || 'a-realizar'),
      financeiro: {
        ...finance,
        paymentStatus: cleanText(finance?.paymentStatus || service?.paymentStatus || ''),
        paymentMethod: cleanText(finance?.paymentMethod || finance?.paymentMethodDetail || service?.paymentMethod || service?.metodoPagamento || ''),
        paymentMethodDetail: cleanText(finance?.paymentMethodDetail || finance?.paymentMethod || service?.paymentMethod || service?.metodoPagamento || ''),
      },
    };
  };

  const normalizeProcedureMutationResponse = (data = {}) => {
    const service = data?.service || data?.procedure || data || null;
    const financeId = cleanText(
      data?.financeId
      || service?.financeiroId
      || service?.financeiro?.financeEntryId
      || service?.financeiro?.accountId
    );
    return {
      service,
      financeId,
      financeWarning: cleanText(data?.financeWarning || service?.financeiro?.warning || ''),
      financeAction: cleanText(data?.financeAction || ''),
      success: data?.success !== false,
      transferRequired: data?.transferRequired === true,
      conflict: data?.conflict || null,
    };
  };

  const services = {
    addToPatient: async ({ prontuario, service = {} } = {}) => {
      const patientId = resolvePatientId({ prontuario, patientId: service?.patientId });
      const procedure = normalizeLegacyProcedurePayload(service || {});
      const data = await request(
        'POST',
        `/clinical/patients/${encodeURIComponent(patientId)}/procedures`,
        { procedure },
        { auth: true }
      );
      return normalizeProcedureMutationResponse(data || {});
    },
    listForPatient: async (prontuario) => {
      const patientId = resolvePatientId({ prontuario });
      const data = await request('GET', `/clinical/patients/${encodeURIComponent(patientId)}/procedures`, null, { auth: true });
      return {
        prontuario: patientId,
        servicos: Array.isArray(data) ? data : [],
      };
    },
    update: async ({ prontuario, service = {} } = {}) => {
      const patientId = resolvePatientId({ prontuario, patientId: service?.patientId });
      const procedure = normalizeLegacyProcedurePayload(service || {});
      const data = await request(
        'POST',
        `/clinical/patients/${encodeURIComponent(patientId)}/procedures`,
        { procedure },
        { auth: true }
      );
      return normalizeProcedureMutationResponse(data || {});
    },
    delete: async ({ prontuario, id } = {}) => {
      const patientId = resolvePatientId({ prontuario });
      return request(
        'DELETE',
        `/clinical/patients/${encodeURIComponent(patientId)}/procedures/${encodeURIComponent(cleanText(id))}`,
        null,
        { auth: true }
      );
    },
    markDone: async ({ prontuario, serviceId, dateISO, service = {} } = {}) => services.update({
      prontuario,
      service: {
        ...(service || {}),
        id: cleanText(serviceId),
        status: 'realizado',
        dataRealizacao: cleanText(dateISO || new Date().toISOString()),
      },
    }),
    listAll: async () => notImplemented('services.listAll'),
  };

  const documents = {
    list: async ({ prontuario, patientId, includeArchived = false } = {}) => {
      const resolvedPatientId = resolvePatientId({ prontuario, patientId });
      return request(
        'GET',
        `/clinical/patients/${encodeURIComponent(resolvedPatientId)}/documents?includeArchived=${includeArchived ? 'true' : 'false'}`,
        null,
        { auth: true }
      );
    },
    upload: async (payload = {}) => {
      const patientId = resolvePatientId(payload);
      const file = payload?.file || null;
      const isBrowserFile = (typeof File !== 'undefined' && file instanceof File)
        || (typeof Blob !== 'undefined' && file instanceof Blob);
      if (!patientId) throw new Error('patientId/prontuario is required.');
      if (!isBrowserFile) {
        throw new Error('Arquivo invalido para upload no webapp.');
      }
      const fileName = cleanText(payload?.fileName || file?.name || payload?.title || 'arquivo');
      const actor = resolveDocumentActor(payload);
      const metadata = await request(
        'POST',
        `/clinical/patients/${encodeURIComponent(patientId)}/documents`,
        {
          document: buildDocumentRecord({
            id: payload?.documentId || payload?.id || createLocalId('doc'),
            title: cleanText(payload?.title || fileName),
            type: payload?.type || 'ARQUIVO',
            category: payload?.category || 'ARQUIVO_PACIENTE',
            folder: payload?.folder || '',
            prontuario: patientId,
            patientId,
            createdBy: actor,
            documentDate: payload?.documentDate || normalizeDateOnly(new Date()),
            data: {
              ...payload,
              prontuario: patientId,
              patientId,
              fileName,
              mimeType: cleanText(file?.type || payload?.mimeType || ''),
            },
          }),
        },
        { auth: true }
      );
      const arrayBuffer = await file.arrayBuffer();
      await requestRawBody(
        'PUT',
        `/clinical/patients/${encodeURIComponent(patientId)}/documents/${encodeURIComponent(cleanText(metadata?.id))}/file?role=primary`,
        arrayBuffer,
        {
          auth: true,
          contentType: cleanText(file?.type || payload?.mimeType || 'application/octet-stream'),
          headers: {
            'x-file-name': encodeURIComponent(fileName),
          },
        }
      );
      return metadata;
    },
    open: async ({ prontuario, patientId, documentId } = {}) => {
      const resolvedPatientId = resolvePatientId({ prontuario, patientId });
      const record = await findDocumentRecord({ prontuario: resolvedPatientId, documentId, includeArchived: true });
      if (!record) throw new Error('Documento nao encontrado.');
      try {
        const binary = await requestBinary(
          'GET',
          `/clinical/patients/${encodeURIComponent(resolvedPatientId)}/documents/${encodeURIComponent(cleanText(documentId))}/file?role=primary`,
          null,
          { auth: true, omitContentType: true }
        );
        return openBlobInBrowser(new Blob([binary.buffer], { type: binary.contentType || 'application/octet-stream' }), binary.contentType);
      } catch (_error) {
        const patient = resolvedPatientId
          ? await patients.read(resolvedPatientId).catch(() => null)
          : null;
        return openHtmlPreview(record, { patient, clinic: getStoredClinic() });
      }
    },
    archive: async ({ prontuario, patientId, documentId, archived = true } = {}) => {
      const resolvedPatientId = resolvePatientId({ prontuario, patientId });
      const existing = await findDocumentRecord({ prontuario: resolvedPatientId, documentId, includeArchived: true });
      const nextRecord = buildDocumentRecord({
        ...(existing || {}),
        id: cleanText(documentId),
        archived,
        data: existing?.data || {},
      });
      return request(
        'POST',
        `/clinical/patients/${encodeURIComponent(resolvedPatientId)}/documents`,
        { document: nextRecord },
        { auth: true }
      );
    },
    saveCustom: async (payload = {}) => saveGenericDocument(payload, {
      type: 'CUSTOMIZAVEL',
      category: payload?.category || 'CLINICOS',
      titleFallback: 'Documento customizavel',
    }),
    saveEvolucao: async (payload = {}) => {
      const patientId = resolvePatientId(payload);
      const title = cleanText(payload?.title || `Anotacao ${formatDatePtBr(payload?.data || new Date())}`);
      const actor = resolveDocumentActor(payload);
      const data = await request(
        'POST',
        `/clinical/patients/${encodeURIComponent(patientId)}/clinical-notes`,
        {
          noteType: 'EVOLUCAO',
          content: payload || {},
          document: buildDocumentRecord({
            id: payload?.documentId || payload?.id || createLocalId('doc'),
            title,
            type: 'EVOLUCAO',
            category: payload?.category || 'CLINICOS',
            prontuario: patientId,
            patientId,
            createdBy: actor,
            documentDate: payload?.data || normalizeDateOnly(new Date()),
            data: {
              ...payload,
              prontuario: patientId,
              patientId,
              previewHtml: buildDocumentPreviewMarkup({
                title,
                type: 'EVOLUCAO',
                documentDate: payload?.data || normalizeDateOnly(new Date()),
                data: payload,
              }),
            },
          }),
        },
        { auth: true }
      );
      return data?.sourceDocument || data?.document || data;
    },
    updateEvolucao: async (payload = {}) => {
      const patientId = resolvePatientId(payload);
      const documentId = cleanText(payload?.documentId || payload?.id);
      const title = cleanText(payload?.title || `Anotacao ${formatDatePtBr(payload?.data || new Date())}`);
      const actor = resolveDocumentActor(payload);
      const data = await request(
        'PATCH',
        `/clinical/patients/${encodeURIComponent(patientId)}/clinical-notes/${encodeURIComponent(documentId)}`,
        {
          content: payload || {},
          document: buildDocumentRecord({
            id: documentId,
            title,
            type: 'EVOLUCAO',
            category: payload?.category || 'CLINICOS',
            prontuario: patientId,
            patientId,
            createdBy: actor,
            documentDate: payload?.data || normalizeDateOnly(new Date()),
            data: {
              ...payload,
              prontuario: patientId,
              patientId,
              previewHtml: buildDocumentPreviewMarkup({
                title,
                type: 'EVOLUCAO',
                documentDate: payload?.data || normalizeDateOnly(new Date()),
                data: payload,
              }),
            },
          }),
        },
        { auth: true }
      );
      return data?.sourceDocument || data?.document || data;
    },
    generateDossie: async ({ prontuario, patientId, docs = [], systemVersion = 'voithos-web' } = {}) => {
      const resolvedPatientId = resolvePatientId({ prontuario, patientId });
      const sourceDocs = Array.isArray(docs) && docs.length
        ? docs
        : await documents.list({ prontuario: resolvedPatientId, includeArchived: false });
      const previewHtml = [
        '<main style="font-family:Segoe UI,Arial,sans-serif;padding:24px;max-width:960px;margin:0 auto;color:#10243e;">',
        '<h1>Dossie completo</h1>',
        `<p>Gerado em ${escapeHtml(new Date().toLocaleString('pt-BR'))}</p>`,
        '<ol>',
        sortDocumentsByDateDesc(sourceDocs).map((doc) => (
          `<li><strong>${escapeHtml(doc?.title || doc?.titulo || doc?.nome || 'Documento')}</strong> - ${escapeHtml(doc?.type || doc?.tipo || 'DOCUMENTO')} - ${escapeHtml(formatDatePtBr(doc?.documentDate || doc?.createdAt || ''))}</li>`
        )).join(''),
        '</ol>',
        '</main>',
      ].join('');
      const record = await saveGenericDocument({
        prontuario: resolvedPatientId,
        title: 'Dossie completo',
        category: 'CLINICOS',
        documentDate: normalizeDateOnly(new Date()),
        systemVersion,
        docs: sortDocumentsByDateDesc(sourceDocs).map((doc) => ({
          id: doc?.id || '',
          title: doc?.title || doc?.titulo || '',
          type: doc?.type || doc?.tipo || '',
          documentDate: doc?.documentDate || doc?.createdAt || '',
        })),
        previewHtml,
      }, {
        type: 'DOSSIE',
        category: 'CLINICOS',
        titleFallback: 'Dossie completo',
      });
      return {
        record,
        hash: simpleHashString(JSON.stringify(record || {})),
      };
    },
    saveAnamnese: async (payload = {}) => {
      const patientId = resolvePatientId(payload);
      const title = cleanText(payload?.title || 'Anamnese');
      const actor = resolveDocumentActor(payload);
      const data = await request(
        'POST',
        `/clinical/patients/${encodeURIComponent(patientId)}/anamneses`,
        {
          data: payload?.data || payload,
          document: buildDocumentRecord({
            id: payload?.documentId || payload?.id || createLocalId('doc'),
            title,
            type: 'ANAMNESE',
            category: 'CLINICOS',
            prontuario: patientId,
            patientId,
            createdBy: actor,
            documentDate: payload?.documentDate || normalizeDateOnly(new Date()),
            data: {
              ...(payload?.data || payload),
              prontuario: patientId,
              patientId,
              previewHtml: buildDocumentPreviewMarkup({
                title,
                type: 'ANAMNESE',
                documentDate: payload?.documentDate || normalizeDateOnly(new Date()),
                data: payload?.data || payload,
              }),
            },
          }),
        },
        { auth: true }
      );
      return data?.sourceDocument || data?.document || data;
    },
    saveReceita: async (payload = {}) => saveGenericDocument({
      ...payload,
      documentDate: payload?.data || payload?.documentDate || normalizeDateOnly(new Date()),
    }, {
      type: 'RECEITA',
      category: 'CLINICOS',
      titleFallback: 'Receita',
    }),
    openLatestAnamnese: async ({ prontuario, patientId } = {}) => {
      const docs = await documents.list({ prontuario, patientId, includeArchived: false });
      const latest = sortDocumentsByDateDesc(docs).find((doc) => normalizeDocumentType(doc?.type || doc?.tipo) === 'ANAMNESE');
      if (!latest?.id) throw new Error('Nenhuma anamnese encontrada.');
      return documents.open({ prontuario, patientId, documentId: latest.id });
    },
    openLatestReceita: async ({ prontuario, patientId } = {}) => {
      const docs = await documents.list({ prontuario, patientId, includeArchived: false });
      const latest = sortDocumentsByDateDesc(docs).find((doc) => normalizeDocumentType(doc?.type || doc?.tipo) === 'RECEITA');
      if (!latest?.id) throw new Error('Nenhuma receita encontrada.');
      return documents.open({ prontuario, patientId, documentId: latest.id });
    },
    saveAtestado: async (payload = {}) => saveGenericDocument({
      ...payload,
      documentDate: payload?.data || payload?.documentDate || normalizeDateOnly(new Date()),
    }, {
      type: 'ATESTADO',
      category: 'CLINICOS',
      titleFallback: 'Atestado',
    }),
    saveContrato: async (payload = {}) => saveGenericDocument({
      ...payload,
      documentDate: payload?.data || payload?.documentDate || normalizeDateOnly(new Date()),
    }, {
      type: 'CONTRATO',
      category: payload?.category || 'CLINICOS',
      titleFallback: 'Contrato',
    }),
  };

  const finance = {
    getDashboard: async () => {
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();
      const [dashboard, monthlySummary] = await Promise.all([
        request('GET', '/financial/dashboard', null, { auth: true }).catch(() => null),
        request('GET', `/financial/summary?month=${encodeURIComponent(String(month))}&year=${encodeURIComponent(String(year))}`, null, { auth: true }).catch(() => null),
      ]);
      return {
        ...(dashboard || {}),
        monthlySummary: monthlySummary || null,
      };
    },
    getReminders: async () => request('GET', '/financial/reminders', null, { auth: true }),
    list: async ({ patientId } = {}) => {
      const query = patientId ? `?patientId=${encodeURIComponent(cleanText(patientId))}` : '';
      return request('GET', `/financial/accounts${query}`, null, { auth: true });
    },
    listByPatient: async ({ patientId, prontuario } = {}) => {
      const resolvedPatientId = resolvePatientId({ patientId, prontuario });
      const data = await request('GET', `/financial/patients/${encodeURIComponent(resolvedPatientId)}/summary`, null, { auth: true });
      return Array.isArray(data?.accounts) ? data.accounts : [];
    },
    add: async (payload = {}) => request(
      'POST',
      '/financial/accounts',
      {
        ...payload,
        paymentMethod: payload?.paymentMethod || payload?.method || payload?.metodoPagamento,
        paymentMethodDetail: payload?.paymentMethodDetail || payload?.paymentMethod || payload?.method || payload?.metodoPagamento,
      },
      { auth: true }
    ),
    update: async (payload = {}) => request(
      'PATCH',
      `/financial/accounts/${encodeURIComponent(cleanText(payload?.id || payload?.financeEntryId))}`,
      {
        ...payload,
        paymentMethodDetail: payload?.paymentMethodDetail || payload?.paymentMethod || payload?.method || payload?.metodoPagamento,
      },
      { auth: true }
    ),
    confirmPayment: async (payload = {}) => request(
      'POST',
      `/financial/accounts/${encodeURIComponent(cleanText(payload?.financeEntryId || payload?.id))}/payments`,
      {
        installmentId: cleanText(payload?.installmentId || ''),
        amount: payload?.amount,
        paymentMethod: payload?.paymentMethod || payload?.method || payload?.metodoPagamento,
        paymentMethodDetail: payload?.paymentMethodDetail || payload?.paymentMethod || payload?.method || payload?.metodoPagamento,
        paidAt: payload?.paidAt || new Date().toISOString(),
        metadata: payload?.metadata || {},
      },
      { auth: true }
    ),
    applyPatientPayment: async (payload = {}) => request(
      'POST',
      `/financial/patients/${encodeURIComponent(resolvePatientId(payload))}/payments`,
      {
        amount: payload?.amount ?? payload?.valor,
        paymentMethod: payload?.paymentMethod || payload?.method || payload?.metodoPagamento,
        paymentMethodDetail: payload?.paymentMethodDetail || payload?.paymentMethod || payload?.method || payload?.metodoPagamento,
        paidAt: payload?.paidAt || new Date().toISOString(),
        description: payload?.description || payload?.descricao || '',
        metadata: payload?.metadata || {},
      },
      { auth: true }
    ),
    createOrUpdateProcedureRevenue: async (payload = {}) => {
      const normalizedId = cleanText(payload?.financeEntryId || payload?.id);
      if (normalizedId) {
        return finance.update({
          id: normalizedId,
          ...payload,
        });
      }
      return finance.add(payload);
    },
    remove: async (id) => request('DELETE', `/financial/accounts/${encodeURIComponent(cleanText(id?.id || id))}`, null, { auth: true }),
  };

  const resolveLaboratoryPatientId = (payload = {}) => cleanText(
    payload?.patientId
    || payload?.prontuario
    || payload?.patient?.id
    || payload?.patient?.prontuario
    || payload?.id
  );

  const resolveLaboratoryClinicId = (payload = {}) => cleanText(
    payload?.clinicId
    || getStoredClinic()?.clinicId
    || getStoredClinic()?.id
  );

  const laboratorio = {
    getDashboard: async () => {
      const clinicId = resolveLaboratoryClinicId();
      return request('GET', '/clinics/me/laboratory/dashboard', null, { auth: true });
    },
    list: async (payload = {}) => {
      const clinicId = resolveLaboratoryClinicId(payload);
      const patientId = resolveLaboratoryPatientId(payload);
      const query = new URLSearchParams();
      if (patientId) query.set('patientId', patientId);
      return request('GET', `/clinics/me/laboratory/orders${query.toString() ? `?${query.toString()}` : ''}`, null, { auth: true });
    },
    add: async (payload = {}) => {
      const clinicId = resolveLaboratoryClinicId(payload);
      const patientId = resolveLaboratoryPatientId(payload);
      if (!clinicId) throw new Error('clinicId is required.');
      if (!patientId) throw new Error('patientId/prontuario is required.');
      return request('POST', '/clinics/me/laboratory/orders', {
        patientId,
        appointmentId: cleanText(payload?.appointmentId || ''),
        labName: cleanText(payload?.labName || payload?.laboratorio || ''),
        description: cleanText(payload?.description || payload?.descricao || payload?.peca || ''),
        status: cleanText(payload?.status || 'REQUESTED'),
        requestedAt: payload?.requestedAt || payload?.entrada || new Date().toISOString(),
        expectedAt: payload?.expectedAt || payload?.saida || null,
        notes: payload?.notes || payload?.observacoes || '',
        totalCost: payload?.totalCost ?? payload?.valor ?? 0,
        paciente: payload?.paciente || '',
        peca: payload?.peca || '',
        prontuario: payload?.prontuario || patientId,
        procedureId: payload?.procedureId || payload?.servicoId || '',
        financeExpenseId: payload?.financeExpenseId || payload?.despesaLaboratorioId || '',
        items: Array.isArray(payload?.items) ? payload.items : [],
      }, { auth: true });
    },
    update: async (payload = {}) => {
      const clinicId = resolveLaboratoryClinicId(payload);
      const orderId = cleanText(payload?.id || payload?.orderId);
      if (!clinicId) throw new Error('clinicId is required.');
      if (!orderId) throw new Error('orderId is required.');
      return request('PATCH', `/clinics/me/laboratory/orders/${encodeURIComponent(orderId)}`, {
        ...payload,
      }, { auth: true });
    },
    remove: async (id) => {
      const orderId = cleanText(id?.id || id);
      const clinicId = resolveLaboratoryClinicId();
      if (!orderId) throw new Error('orderId is required.');
      return request('DELETE', `/clinics/me/laboratory/orders/${encodeURIComponent(orderId)}`, null, { auth: true });
    },
  };

  const resolveStockClinicId = (payload = {}) => cleanText(
    payload?.clinicId
    || getCurrentClinicId()
  );

  const stock = {
    list: async (payload = {}) => {
      const clinicId = resolveStockClinicId(payload);
      if (!clinicId) throw new Error('clinicId is required.');
      try {
        const remote = await request('GET', `/stock/items?clinicId=${encodeURIComponent(clinicId)}${payload?.includeInactive === true ? '&includeInactive=true' : ''}`, null, { auth: true });
        if (Array.isArray(remote) && remote.length) {
          writeLocalStockItems(clinicId, remote);
          setStockSyncSource('backend');
          return remote.map((item) => normalizeStockItem(item, clinicId));
        }
        const migrated = await migrateLocalStockIfNeeded(clinicId);
        if (Array.isArray(migrated) && migrated.length) {
          setStockSyncSource('backend');
          return migrated.map((item) => normalizeStockItem(item, clinicId));
        }
        const localItems = readLocalStockItems(clinicId);
        writeLocalStockItems(clinicId, localItems);
        setStockSyncSource('backend');
        return localItems;
      } catch (error) {
        if (!shouldFallbackStock(error)) throw error;
        const localItems = readLocalStockItems(clinicId);
        setStockSyncSource('local');
        return localItems;
      }
    },
    create: async (payload = {}) => {
      const clinicId = resolveStockClinicId(payload);
      if (!clinicId) throw new Error('clinicId is required.');
      const body = {
        clinicId,
        name: cleanText(payload?.name || payload?.nome),
        category: cleanText(payload?.category || payload?.categoria),
        unit: cleanText(payload?.unit || payload?.unidade),
        currentQuantity: payload?.currentQuantity ?? payload?.quantidadeAtual ?? payload?.estoqueAtual,
        minimumQuantity: payload?.minimumQuantity ?? payload?.estoqueMinimo,
        notes: cleanText(payload?.notes || payload?.observacoes || ''),
        active: payload?.active !== false,
      };
      try {
        const created = await request('POST', '/stock/items', body, { auth: true });
        const normalized = normalizeStockItem(created?.item || created, clinicId);
        const localItems = readLocalStockItems(clinicId).filter((item) => item.id !== normalized.id);
        localItems.unshift(normalized);
        writeLocalStockItems(clinicId, localItems);
        if (created?.movement) appendLocalStockMovement(clinicId, created.movement);
        setStockSyncSource('backend');
        return normalized;
      } catch (error) {
        if (!shouldFallbackStock(error)) throw error;
        const itemId = createLocalId('stock');
        const createdItem = normalizeStockItem({
          ...body,
          id: itemId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }, clinicId);
        const localItems = readLocalStockItems(clinicId).filter((item) => item.id !== createdItem.id);
        localItems.unshift(createdItem);
        writeLocalStockItems(clinicId, localItems);
        if (Number(createdItem.currentQuantity || 0) > 0) {
          appendLocalStockMovement(clinicId, normalizeStockMovement({
            id: createLocalId('stock-mov'),
            clinicId,
            stockItemId: itemId,
            type: 'entrada',
            quantityDelta: Number(createdItem.currentQuantity || 0),
            quantityBefore: 0,
            quantityAfter: Number(createdItem.currentQuantity || 0),
            notes: 'Estoque inicial.',
            performedByUserId: cleanText(getStoredUser()?.id || getStoredUser()?.userId || ''),
            performedByUserName: cleanText(getStoredUser()?.nome || getStoredUser()?.fullName || ''),
            createdAt: new Date().toISOString(),
          }, clinicId, itemId));
        }
        setStockSyncSource('local');
        return createdItem;
      }
    },
    update: async (payload = {}) => {
      const clinicId = resolveStockClinicId(payload);
      const itemId = cleanText(payload?.itemId || payload?.id);
      if (!clinicId) throw new Error('clinicId is required.');
      if (!itemId) throw new Error('itemId is required.');
      const body = {
        clinicId,
        name: cleanText(payload?.name || payload?.nome),
        category: cleanText(payload?.category || payload?.categoria),
        unit: cleanText(payload?.unit || payload?.unidade),
        currentQuantity: payload?.currentQuantity ?? payload?.quantidadeAtual ?? payload?.estoqueAtual,
        minimumQuantity: payload?.minimumQuantity ?? payload?.estoqueMinimo,
        notes: cleanText(payload?.notes || payload?.observacoes || ''),
        active: payload?.active !== undefined ? payload.active !== false : true,
      };
      try {
        const updated = await request('PATCH', `/stock/items/${encodeURIComponent(itemId)}`, body, { auth: true });
        const normalized = normalizeStockItem(updated?.item || updated, clinicId);
        const localItems = readLocalStockItems(clinicId).map((item) => (item.id === normalized.id ? normalized : item));
        writeLocalStockItems(clinicId, localItems);
        if (updated?.movement) appendLocalStockMovement(clinicId, updated.movement);
        setStockSyncSource('backend');
        return normalized;
      } catch (error) {
        if (!shouldFallbackStock(error)) throw error;
        const existingItems = readLocalStockItems(clinicId);
        const localItems = existingItems.map((item) => (
          item.id === itemId
            ? normalizeStockItem({ ...item, ...body, updatedAt: new Date().toISOString() }, clinicId)
            : item
        ));
        const currentItem = existingItems.find((item) => item.id === itemId) || null;
        const nextItem = localItems.find((item) => item.id === itemId) || null;
        writeLocalStockItems(clinicId, localItems);
        if (nextItem && currentItem && Number(nextItem.currentQuantity || 0) !== Number(currentItem.currentQuantity || 0)) {
          appendLocalStockMovement(clinicId, normalizeStockMovement({
            id: createLocalId('stock-mov'),
            clinicId,
            stockItemId: itemId,
            type: 'ajuste',
            quantityDelta: Number(nextItem.currentQuantity || 0) - Number(currentItem.currentQuantity || 0),
            quantityBefore: Number(currentItem.currentQuantity || 0),
            quantityAfter: Number(nextItem.currentQuantity || 0),
            notes: 'Atualização do cadastro.',
            performedByUserId: cleanText(getStoredUser()?.id || getStoredUser()?.userId || ''),
            performedByUserName: cleanText(getStoredUser()?.nome || getStoredUser()?.fullName || ''),
            createdAt: new Date().toISOString(),
          }, clinicId, itemId));
        }
        setStockSyncSource('local');
        return nextItem;
      }
    },
    listMovements: async (payload = {}) => {
      const clinicId = resolveStockClinicId(payload);
      const itemId = cleanText(payload?.itemId || payload?.id);
      if (!clinicId) throw new Error('clinicId is required.');
      if (!itemId) throw new Error('itemId is required.');
      try {
        const query = new URLSearchParams();
        query.set('clinicId', clinicId);
        if (payload?.limit !== undefined && payload?.limit !== null && payload?.limit !== '') {
          query.set('limit', cleanText(payload.limit));
        }
        const remote = await request('GET', `/stock/items/${encodeURIComponent(itemId)}/movements?${query.toString()}`, null, { auth: true });
        const movements = (Array.isArray(remote) ? remote : []).map((movement) => normalizeStockMovement(movement, clinicId, itemId));
        if (movements.length) {
          writeLocalStockMovements(clinicId, movements);
          setStockSyncSource('backend');
          return movements;
        }
        const localMovements = readLocalStockMovements(clinicId)
          .filter((movement) => movement.stockItemId === itemId)
          .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        setStockSyncSource('backend');
        return localMovements;
      } catch (error) {
        if (!shouldFallbackStock(error)) throw error;
        const localMovements = readLocalStockMovements(clinicId)
          .filter((movement) => movement.stockItemId === itemId)
          .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        setStockSyncSource('local');
        return localMovements;
      }
    },
    createMovement: async (payload = {}) => {
      const clinicId = resolveStockClinicId(payload);
      const itemId = cleanText(payload?.itemId || payload?.id);
      if (!clinicId) throw new Error('clinicId is required.');
      if (!itemId) throw new Error('itemId is required.');
      const body = {
        clinicId,
        type: cleanText(payload?.type || payload?.movementType || '').toLowerCase(),
        quantity: payload?.quantity ?? payload?.currentQuantity ?? payload?.quantidade,
        reason: cleanText(payload?.reason || payload?.notes || payload?.observacoes || ''),
      };
      try {
        const result = await request('POST', `/stock/items/${encodeURIComponent(itemId)}/movements`, body, { auth: true });
        const normalizedItem = normalizeStockItem(result?.item || result, clinicId);
        const normalizedMovement = result?.movement ? normalizeStockMovement(result.movement, clinicId, itemId) : null;
        const localItems = readLocalStockItems(clinicId).map((item) => (item.id === normalizedItem.id ? normalizedItem : item));
        writeLocalStockItems(clinicId, localItems);
        if (normalizedMovement) appendLocalStockMovement(clinicId, normalizedMovement);
        setStockSyncSource('backend');
        return { item: normalizedItem, movement: normalizedMovement };
      } catch (error) {
        if (!shouldFallbackStock(error)) throw error;
        const fallback = applyLocalStockMovement(clinicId, {
          itemId,
          type: body.type,
          quantity: body.quantity,
          reason: body.reason,
        });
        return fallback;
      }
    },
    adjustQuantity: async (payload = {}) => stock.createMovement({
      ...payload,
      type: 'ajuste',
      quantity: payload?.currentQuantity ?? payload?.quantidadeAtual ?? payload?.estoqueAtual,
      reason: payload?.notes || payload?.observacoes || 'Ajuste de estoque.',
    }),
    deactivate: async (payload = {}) => {
      const clinicId = resolveStockClinicId(payload);
      const itemId = cleanText(payload?.itemId || payload?.id);
      if (!clinicId) throw new Error('clinicId is required.');
      if (!itemId) throw new Error('itemId is required.');
      try {
        const updated = await request('DELETE', `/stock/items/${encodeURIComponent(itemId)}`, { clinicId }, { auth: true });
        const normalized = normalizeStockItem(updated?.item || updated, clinicId);
        const localItems = readLocalStockItems(clinicId).filter((item) => item.id !== normalized.id);
        writeLocalStockItems(clinicId, localItems);
        setStockSyncSource('backend');
        return normalized;
      } catch (error) {
        if (!shouldFallbackStock(error)) throw error;
        const localItems = readLocalStockItems(clinicId).filter((item) => item.id !== itemId);
        writeLocalStockItems(clinicId, localItems);
        setStockSyncSource('local');
        return { success: true };
      }
    },
    delete: async (payload = {}) => stock.deactivate(payload),
  };

  const plans = {
    list: async ({ patientId } = {}) => {
      const query = patientId ? `?patientId=${encodeURIComponent(cleanText(patientId))}` : '';
      return request('GET', `/financial/plans${query}`, null, { auth: true });
    },
    getById: async ({ planId } = {}) => request(
      'GET',
      `/financial/plans/${encodeURIComponent(cleanText(planId))}`,
      null,
      { auth: true }
    ),
    create: async (payload = {}) => request('POST', '/financial/plans', payload || {}, { auth: true }),
    update: async ({ planId, patch, ...payload } = {}) => request(
      'PATCH',
      `/financial/plans/${encodeURIComponent(cleanText(planId || payload?.planId || payload?.id))}`,
      patch || payload || {},
      { auth: true }
    ),
    remove: async ({ planId, id } = {}) => request(
      'DELETE',
      `/financial/plans/${encodeURIComponent(cleanText(planId || id))}`,
      null,
      { auth: true }
    ),
    dashboard: async () => request('GET', '/financial/plans/dashboard', null, { auth: true }),
    messageHistory: async ({ planId } = {}) => request(
      'GET',
      `/financial/plans/${encodeURIComponent(cleanText(planId))}/messages`,
      null,
      { auth: true }
    ),
    messageSuggestions: async ({ planId, dueSoonDays } = {}) => {
      const params = new URLSearchParams();
      if (dueSoonDays !== undefined && dueSoonDays !== null && dueSoonDays !== '') {
        params.set('dueSoonDays', cleanText(dueSoonDays));
      }
      const query = params.toString();
      return request(
        'GET',
        `/financial/plans/${encodeURIComponent(cleanText(planId))}/messages/suggestions${query ? `?${query}` : ''}`,
        null,
        { auth: true }
      );
    },
    sendMessage: async ({ planId, installmentId, eventType, manualResend = false, approvedByDentist = false } = {}) => request(
      'POST',
      `/financial/plans/${encodeURIComponent(cleanText(planId))}/messages/send`,
      {
        installmentId: cleanText(installmentId),
        eventType: cleanText(eventType),
        manualResend: manualResend === true,
        approvedByDentist: approvedByDentist === true,
      },
      { auth: true }
    ),
    resendMessage: async ({ planMessageId, messageId } = {}) => request(
      'POST',
      `/financial/plan-messages/${encodeURIComponent(cleanText(planMessageId || messageId))}/resend`,
      {},
      { auth: true }
    ),
  };

  const campanhas = {
    list: async () => request('GET', '/campaigns', null, { auth: true }),
    create: async (payload) => request('POST', '/campaigns', payload || {}, { auth: true }),
    update: async (payload = {}) => request('PATCH', `/campaigns/${encodeURIComponent(cleanText(payload?.id))}`, payload || {}, { auth: true }),
    remove: async (id) => request('DELETE', `/campaigns/${encodeURIComponent(cleanText(id))}`, null, { auth: true }),
    dashboard: async () => request('GET', '/campaigns/dashboard', null, { auth: true }),
    templates: async () => request('GET', '/campaigns/templates', null, { auth: true }),
    createSendBatch: async () => notImplemented('campanhas.createSendBatch.disabled'),
    logDelivery: async (payload = {}) => request(
      'PATCH',
      `/campaigns/dispatches/${encodeURIComponent(cleanText(payload?.dispatchId))}`,
      {
        status: payload?.status,
        provider: payload?.provider || '',
        providerMessageId: payload?.providerMessageId || '',
        errorMessage: payload?.errorMessage || '',
        metadata: payload?.metadata || null,
      },
      { auth: true },
    ),
    logsList: async (payload = {}) => {
      const params = new URLSearchParams();
      if (payload?.campaignId) params.set('campaignId', cleanText(payload.campaignId));
      if (payload?.status) params.set('status', cleanText(payload.status));
      if (payload?.dateFrom) params.set('dateFrom', cleanText(payload.dateFrom));
      if (payload?.dateTo) params.set('dateTo', cleanText(payload.dateTo));
      if (payload?.page) params.set('page', String(payload.page));
      if (payload?.limit) params.set('limit', String(payload.limit));
      const query = params.toString();
      return request('GET', `/campaigns/logs${query ? `?${query}` : ''}`, null, { auth: true });
    },
    resolveAudience: async (payload = {}) => request('POST', '/campaigns/resolve-audience', payload || {}, { auth: true }),
    result: async (payload = {}) => {
      const campaignId = cleanText(payload?.campaignId);
      const params = new URLSearchParams();
      if (payload?.windowDays) params.set('windowDays', String(payload.windowDays));
      const query = params.toString();
      return request('GET', `/campaigns/${encodeURIComponent(campaignId)}/result${query ? `?${query}` : ''}`, null, { auth: true });
    },
  };

  const campanhasGlobal = {
    list: async () => notImplemented('campanhasGlobal.list'),
    save: async () => notImplemented('campanhasGlobal.save'),
  };

  const whatsapp = {
    sendText: async () => notImplemented('whatsapp.sendText'),
    sendAppointmentConfirmation: async (input = {}) => {
      const appointmentId = cleanText(input?.id || input?.appointment?.id);
      if (!appointmentId) throw new Error('appointmentId is required.');
      return request('POST', `/appointments/${encodeURIComponent(appointmentId)}/send-confirmation`, {}, { auth: true });
    },
    sendAppointmentReminder: async (input = {}) => {
      const appointmentId = cleanText(input?.id || input?.appointment?.id);
      if (!appointmentId) throw new Error('appointmentId is required.');
      return request('POST', `/appointments/${encodeURIComponent(appointmentId)}/send-reminder`, {}, { auth: true });
    },
    sendCampaign: async () => notImplemented('whatsapp.sendCampaign'),
    logsList: async () => notImplemented('whatsapp.logsList'),
  };

  const anamneseModels = {
    getActive: async () => {
      const settings = await getOperationalSettings();
      const models = normalizeAnamneseModelList(settings?.anamneseModels);
      return models.find((item) => item.active) || models[0] || null;
    },
    list: async () => {
      const settings = await getOperationalSettings();
      return normalizeAnamneseModelList(settings?.anamneseModels);
    },
    create: async (payload = {}) => {
      const settings = await getOperationalSettings();
      const models = normalizeAnamneseModelList(settings?.anamneseModels);
      const nextModel = normalizeAnamneseModel({
        ...payload,
        id: cleanText(payload?.id || createLocalId('anamnese')),
        active: models.length === 0 || payload?.active === true || payload?.ativo === true,
      }, models.length);
      const nextModels = (nextModel.active
        ? models.map((item) => ({ ...item, active: false, ativo: false }))
        : models.slice()
      ).concat(nextModel).map((item) => serializeAnamneseModel(item));
      const updated = await patchOperationalSettings({ anamneseModels: nextModels });
      return normalizeAnamneseModelList(updated?.anamneseModels);
    },
    update: async (payload = {}) => {
      const settings = await getOperationalSettings();
      const targetId = cleanText(payload?.id);
      const models = normalizeAnamneseModelList(settings?.anamneseModels).map((item, index) => (
        cleanText(item.id) === targetId
          ? normalizeAnamneseModel({
              ...item,
              ...payload,
              active: payload?.active === undefined && payload?.ativo === undefined
                ? item.active
                : (payload?.active === true || payload?.ativo === true),
            }, index)
          : item
      ));
      const nextModels = models.map((item) => serializeAnamneseModel(item));
      const updated = await patchOperationalSettings({ anamneseModels: nextModels });
      return normalizeAnamneseModelList(updated?.anamneseModels);
    },
    remove: async (id) => {
      const settings = await getOperationalSettings();
      const models = normalizeAnamneseModelList(settings?.anamneseModels)
        .filter((item) => cleanText(item.id) !== cleanText(id?.id || id));
      const nextModels = models.map((item, index) => serializeAnamneseModel({
        ...item,
        active: item.active || (index === 0 && !models.some((entry) => entry.active)),
        ativo: item.ativo || (index === 0 && !models.some((entry) => entry.ativo)),
      }));
      const updated = await patchOperationalSettings({ anamneseModels: nextModels });
      return normalizeAnamneseModelList(updated?.anamneseModels);
    },
    setActive: async (id) => {
      const settings = await getOperationalSettings();
      const models = normalizeAnamneseModelList(settings?.anamneseModels).map((item) => {
        const isActive = cleanText(item.id) === cleanText(id?.id || id);
        return serializeAnamneseModel({
          ...item,
          active: isActive,
          ativo: isActive,
        });
      });
      const updated = await patchOperationalSettings({ anamneseModels: models });
      return normalizeAnamneseModelList(updated?.anamneseModels);
    },
  };

  const files = {
    readPatients: async () => notImplemented('files.readPatients'),
    readReceipts: async () => notImplemented('files.readReceipts'),
  };

  const agenda = {
    getDay: async (input = {}) => {
      const date = typeof input === 'string' ? cleanText(input) : cleanText(input?.date);
      let from = normalizeRangeBoundary(date, false);
      let to = normalizeRangeBoundary(date, true);
      if (date && !from && !to) {
        from = combineDateTime(date, '00:00');
        to = combineDateTime(date, '23:59');
      }
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const query = params.toString();
      const [appointmentsData, patientsData] = await Promise.all([
        request('GET', `/appointments${query ? `?${query}` : ''}`, null, { auth: true }),
        request('GET', '/patients', null, { auth: true }),
      ]);
      const patientMap = buildPatientMap((Array.isArray(patientsData) ? patientsData : []).map(mapCentralPatientToLegacy));
      return (Array.isArray(appointmentsData) ? appointmentsData : []).map((appointment) => mapCentralAppointmentToLegacy(appointment, patientMap));
    },
    getRange: async ({ start, end, date, patientId } = {}) => {
      let from = normalizeRangeBoundary(start, false);
      let to = normalizeRangeBoundary(end, true);
      if (date && !from && !to) {
        from = combineDateTime(date, '00:00');
        to = combineDateTime(date, '23:59');
      }
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (patientId) params.set('patientId', cleanText(patientId));
      const query = params.toString();
      const [appointmentsData, patientsData] = await Promise.all([
        request('GET', `/appointments${query ? `?${query}` : ''}`, null, { auth: true }),
        patientId
          ? request('GET', `/patients/${encodeURIComponent(cleanText(patientId))}`, null, { auth: true })
              .then((patient) => [patient])
              .catch(() => [])
          : request('GET', '/patients', null, { auth: true }),
      ]);
      const patientMap = buildPatientMap((Array.isArray(patientsData) ? patientsData : []).map(mapCentralPatientToLegacy));
      return (Array.isArray(appointmentsData) ? appointmentsData : []).map((appointment) => mapCentralAppointmentToLegacy(appointment, patientMap));
    },
    add: async (payload = {}) => {
      const patientId = cleanText(payload?.patientId || payload?.pacienteId || payload?.prontuario);
      const body = {
        patientId,
        profissionalId: payload?.dentistaId || '',
        profissionalNome: payload?.dentistaNome || '',
        dataHora: combineDateTime(payload?.data, payload?.horaInicio),
        horaFim: combineDateTime(payload?.data, payload?.horaFim),
        tipo: payload?.tipo || '',
        observacoes: payload?.observacoes || '',
        marcadorId: payload?.marcadorId || '',
        marcadorNome: payload?.marcadorNome || '',
        marcadorCor: payload?.marcadorCor || '',
        attendanceStatus: LEGACY_TO_CENTRAL_ATTENDANCE[cleanText(payload?.attendanceStatus).toLowerCase()] || null,
      };
      const [appointment, patient] = await Promise.all([
        request('POST', '/appointments', body, { auth: true }),
        patientId ? patients.read(patientId).catch(() => null) : Promise.resolve(null),
      ]);
      const patientMap = buildPatientMap(patient ? [patient] : []);
      return mapCentralAppointmentToLegacy(appointment || {}, patientMap);
    },
    update: async (id, payload = {}) => {
      const normalizedId = cleanText(id || payload?.id);
      if (!normalizedId) throw new Error('appointmentId is required.');

      const hasOnlyStatus = Object.keys(payload || {}).length === 1 && Object.prototype.hasOwnProperty.call(payload || {}, 'status');
      const hasOnlyAttendance = Object.keys(payload || {}).length === 1 && Object.prototype.hasOwnProperty.call(payload || {}, 'attendanceStatus');

      if (hasOnlyStatus) {
        const appointment = await request('PATCH', `/appointments/${encodeURIComponent(normalizedId)}/status`, {
          status: LEGACY_TO_CENTRAL_STATUS[cleanText(payload?.status).toLowerCase()] || 'AGENDADO',
        }, { auth: true });
        const patient = appointment?.patientId ? await patients.read(appointment.patientId).catch(() => null) : null;
        return mapCentralAppointmentToLegacy(appointment || {}, buildPatientMap(patient ? [patient] : []));
      }

      if (hasOnlyAttendance) {
        const appointment = await request('PATCH', `/appointments/${encodeURIComponent(normalizedId)}/attendance`, {
          attendanceStatus: LEGACY_TO_CENTRAL_ATTENDANCE[cleanText(payload?.attendanceStatus).toLowerCase()] || null,
        }, { auth: true });
        const patient = appointment?.patientId ? await patients.read(appointment.patientId).catch(() => null) : null;
        return mapCentralAppointmentToLegacy(appointment || {}, buildPatientMap(patient ? [patient] : []));
      }

      const patientId = cleanText(payload?.patientId || payload?.pacienteId || payload?.prontuario);
      const appointment = await request('PATCH', `/appointments/${encodeURIComponent(normalizedId)}`, {
        patientId,
        profissionalId: payload?.dentistaId || '',
        profissionalNome: payload?.dentistaNome || '',
        dataHora: combineDateTime(payload?.data, payload?.horaInicio),
        horaFim: combineDateTime(payload?.data, payload?.horaFim),
        tipo: payload?.tipo || '',
        observacoes: payload?.observacoes || '',
        marcadorId: payload?.marcadorId || '',
        marcadorNome: payload?.marcadorNome || '',
        marcadorCor: payload?.marcadorCor || '',
        status: LEGACY_TO_CENTRAL_STATUS[cleanText(payload?.status || 'em_aberto').toLowerCase()] || 'AGENDADO',
        attendanceStatus: LEGACY_TO_CENTRAL_ATTENDANCE[cleanText(payload?.attendanceStatus).toLowerCase()] || null,
      }, { auth: true });
      const patient = appointment?.patientId ? await patients.read(appointment.patientId).catch(() => null) : null;
      return mapCentralAppointmentToLegacy(appointment || {}, buildPatientMap(patient ? [patient] : []));
    },
    remove: async (input) => {
      const appointmentId = cleanText(typeof input === 'object' ? input?.id : input);
      if (!appointmentId) throw new Error('appointmentId is required.');
      return request('DELETE', `/appointments/${encodeURIComponent(appointmentId)}`, null, { auth: true });
    },
    syncConsultas: async () => notImplemented('agenda.syncConsultas'),
  };

  const birthdays = {
    listToday: async ({ date } = {}) => {
      const overview = await request(
        'GET',
        `/relationships/overview?${new URLSearchParams({ date: cleanText(date || normalizeDateOnly(new Date())) }).toString()}`,
        null,
        { auth: true },
      );
      return mapBirthdayItemsFromOverview(overview || {}, date);
    },
    listHistory: async ({ patientId, dateFrom, dateTo, limit } = {}) => {
      const params = new URLSearchParams();
      params.set('types', 'BIRTHDAY_MESSAGE_SENT,BIRTHDAY_MESSAGE_FAILED,BIRTHDAY_MESSAGE_JOB_COMPLETED');
      if (patientId) params.set('patientId', cleanText(patientId));
      if (dateFrom) params.set('dateFrom', cleanText(dateFrom));
      if (dateTo) params.set('dateTo', cleanText(dateTo));
      if (limit) params.set('limit', String(limit));
      const items = await request('GET', `/notifications?${params.toString()}`, null, { auth: true });
      return {
        patientId: cleanText(patientId),
        items: Array.isArray(items) ? items : [],
      };
    },
    sendBirthdayMessage: null,
  };

  const relationship = {
    getOverview: async ({ date, dueSoonDays } = {}) => {
      const params = new URLSearchParams();
      if (date) params.set('date', cleanText(date));
      if (dueSoonDays !== undefined && dueSoonDays !== null && cleanText(dueSoonDays) !== '') {
        params.set('dueSoonDays', String(dueSoonDays));
      }
      return request('GET', `/relationships/overview${params.toString() ? `?${params.toString()}` : ''}`, null, { auth: true });
    },
  };

  const agendaSettings = {
    get: async () => {
      const settings = await request('GET', '/clinics/me/operational-settings', null, { auth: true });
      return normalizeAgendaSettingsForUi(settings?.agendaSettings || {});
    },
    save: async (payload = {}) => {
      const settings = await request('PATCH', '/clinics/me/operational-settings', {
        agendaSettings: normalizeAgendaSettingsPatch(payload || {}),
      }, { auth: true });
      return normalizeAgendaSettingsForUi(settings?.agendaSettings || {});
    },
  };

  const agendaAvailability = {
    get: async () => {
      const settings = await request('GET', '/clinics/me/operational-settings', null, { auth: true });
      return settings?.agendaAvailability || null;
    },
    save: async (payload = {}) => {
      const settings = await request('PATCH', '/clinics/me/operational-settings', {
        agendaAvailability: payload || {},
      }, { auth: true });
      return settings?.agendaAvailability || null;
    },
  };

  const notifications = {
    get: async () => {
      const settings = await request('GET', '/clinics/me/operational-settings', null, { auth: true });
      return settings?.notificationPreferences || null;
    },
    save: async (payload = {}) => {
      const settings = await request('PATCH', '/clinics/me/operational-settings', {
        notificationPreferences: payload || {},
      }, { auth: true });
      return settings?.notificationPreferences || null;
    },
    listEvents: async (payload = {}) => {
      const params = new URLSearchParams();
      if (payload?.type) params.set('type', cleanText(payload.type));
      if (payload?.types) {
        const types = Array.isArray(payload.types) ? payload.types : String(payload.types).split(',');
        const normalized = types.map((item) => cleanText(item)).filter(Boolean);
        if (normalized.length) params.set('types', normalized.join(','));
      }
      if (payload?.patientId) params.set('patientId', cleanText(payload.patientId));
      if (payload?.dateFrom) params.set('dateFrom', cleanText(payload.dateFrom));
      if (payload?.dateTo) params.set('dateTo', cleanText(payload.dateTo));
      if (payload?.limit) params.set('limit', String(payload.limit));
      return request('GET', `/notifications${params.toString() ? `?${params.toString()}` : ''}`, null, { auth: true });
    },
  };

  const procedures = {
    list: async () => {
      const [settings, fallback] = await Promise.all([
        getOperationalSettings(),
        fetchStaticProcedureCatalog(),
      ]);
      const overrides = sanitizeProcedureOverrides(settings?.proceduresCatalog);
      return mergeProcedureCatalog(fallback, overrides);
    },
    upsert: async (payload = {}) => {
      const normalized = normalizeProcedureItem(payload);
      const [settings, fallback] = await Promise.all([
        getOperationalSettings(),
        fetchStaticProcedureCatalog(),
      ]);
      const key = getProcedureCatalogKey(normalized);
      const overrides = sanitizeProcedureOverrides(settings?.proceduresCatalog);
      const baseMatch = (Array.isArray(fallback) ? fallback : [])
        .map((item) => normalizeProcedureItem(item))
        .find((item) => getProcedureCatalogKey(item) === key);
      const next = overrides.filter((item) => getProcedureCatalogKey(item) !== key);

      if (!baseMatch || !isSameProcedureDefinition(normalized, baseMatch)) {
        next.push({
          ...normalized,
          ativo: true,
          updatedAt: new Date().toISOString(),
        });
      }

      const updated = await patchOperationalSettings({ proceduresCatalog: next });
      return mergeProcedureCatalog(fallback, updated?.proceduresCatalog || next);
    },
    remove: async (payload = {}) => {
      const normalizedId = cleanText(payload?.id || payload?.codigo || payload);
      const [settings, fallback] = await Promise.all([
        getOperationalSettings(),
        fetchStaticProcedureCatalog(),
      ]);
      const key = normalizedId.toLowerCase();
      const overrides = sanitizeProcedureOverrides(settings?.proceduresCatalog);
      const next = overrides.filter((item) => getProcedureCatalogKey(item) !== key);
      const existsInBase = (Array.isArray(fallback) ? fallback : [])
        .map((item) => normalizeProcedureItem(item))
        .some((item) => getProcedureCatalogKey(item) === key);

      if (existsInBase) {
        next.push({
          codigo: normalizedId,
          ativo: false,
          updatedAt: new Date().toISOString(),
        });
      }

      const updated = await patchOperationalSettings({ proceduresCatalog: next });
      return mergeProcedureCatalog(fallback, updated?.proceduresCatalog || next);
    },
  };

  const documentModels = {
    list: async () => notImplemented('documentModels.list'),
    renderPreview: async () => notImplemented('documentModels.renderPreview'),
    create: async () => notImplemented('documentModels.create'),
    update: async () => notImplemented('documentModels.update'),
    remove: async () => notImplemented('documentModels.remove'),
    setActive: async () => notImplemented('documentModels.setActive'),
  };

  const loadProcedures = async () => procedures.list();

  const openExternalUrl = async (url) => {
    const target = cleanText(url);
    if (!target) throw new Error('URL invalida.');
    window.open(target, '_blank', 'noopener,noreferrer');
    return { success: true };
  };

  const events = {
    receive: () => null,
  };

  window.__webAdapter = {
    mode: 'web',
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
    clinic: clinicApi,
    subscription,
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
})();
