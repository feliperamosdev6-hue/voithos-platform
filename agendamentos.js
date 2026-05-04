  const agendaDrawer = document.getElementById('agenda-drawer');
  const agendaDrawerBackdrop = document.getElementById('agenda-drawer-backdrop');
  const drawerClose = document.getElementById('drawer-close');
  const drawerTitle = document.getElementById('drawer-title');
  const drawerType = document.getElementById('drawer-type');
  const drawerPaciente = document.getElementById('drawer-paciente');
  const drawerDentista = document.getElementById('drawer-dentista');
  const drawerMarcadorText = document.getElementById('drawer-marcador-text');
  const drawerMarcadorDot = document.getElementById('drawer-marcador-dot');
  const drawerHorario = document.getElementById('drawer-horario');
  const drawerTelefone = document.getElementById('drawer-telefone');
  const drawerFalarPaciente = document.getElementById('drawer-falar-paciente');
  const drawerSendConfirmacao = document.getElementById('drawer-send-confirmacao');
  const drawerStatus = document.getElementById('drawer-status');
  const drawerPresenca = document.getElementById('drawer-presenca');
  const drawerEdit = document.getElementById('drawer-edit');
  const drawerProntuario = document.getElementById('drawer-prontuario');
  const drawerExcluir = document.getElementById('drawer-excluir');
// Agenda Layout C - apenas renderizacao/DOM
  const dentistFilter = document.getElementById('dentist-filter');
  const dentistToggle = document.getElementById('dentist-toggle');
  const dentistDropdown = document.getElementById('dentist-dropdown');
  const dentistSelectedLabel = document.getElementById('dentist-selected-label');
  const dentistChip = document.getElementById('dentist-chip');
  const dentistChipDot = document.getElementById('dentist-chip-dot');
  const dentistChipLabel = document.getElementById('dentist-chip-label');
  const birthdayHeaderBadge = document.getElementById('birthday-header-badge');
  const birthdayHeaderBadgeText = document.getElementById('birthday-header-badge-text');
  const birthdayHeaderBadgeMeta = document.getElementById('birthday-header-badge-meta');
  const birthdayStrip = document.getElementById('birthday-strip');
  const birthdayStripSummary = document.getElementById('birthday-strip-summary');
  const birthdayStripList = document.getElementById('birthday-strip-list');
  const birthdayStripClose = document.getElementById('birthday-strip-close');
  const marcadorPreview = document.getElementById('agendamento-marcador-preview-text');
  const marcadorPreviewDot = document.getElementById('agendamento-marcador-preview-dot');
console.log('[AGENDA] agendamentos.js carregado');
const AGENDA_PREFILL_PATIENT_KEY = 'agendaPrefillPatient';
const AGENDA_PREFILL_DRAFT_KEY = 'agendaPrefillDraft';
const AGENDA_NOTIFICATION_TARGET_KEY = 'agendaNotificationTarget';
const AGENDA_AUTO_REFRESH_MS = 30000;

const getClinicStorageKey = (baseKey) => {
  const clinicId = String(currentUser?.clinicId || '').trim();
  return clinicId ? `${baseKey}:${clinicId}` : `${baseKey}:global`;
};

function normalizeDateLocal(value) {
  if (!value) return '';
  const format = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  if (value instanceof Date) return format(value);
  const raw = String(value).trim();
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return format(new Date(Number(y), Number(m) - 1, Number(d)));
  }
  const brMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    const [, d, m, y] = brMatch;
    return format(new Date(Number(y), Number(m) - 1, Number(d)));
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return format(parsed);
}

function filtrarAgendamentosPorPerfil(agendamentos, usuario) {
  if (!usuario) return [];
  const perfil = String(usuario.tipo || usuario.perfil || '').toLowerCase().trim();
  const usuarioId = usuario.id || usuario.dentistaId || usuario.userId || '';
  if (['admin', 'administrativo', 'super_admin', 'recepcao', 'recepcionista'].includes(perfil)) {
    return agendamentos || [];
  }
  if (perfil === 'dentista') {
    return (agendamentos || []).filter(
      (ag) => String(ag.dentistaId || '') === String(usuarioId)
    );
  }
  return [];
}


const state = {
  today: new Date(),
  selectedDate: normalizeDateLocal(new Date()),
  monthOffset: 0,
  viewMode: 'mes',
  rangeAgendamentos: [],
  usuarioLogado: null,
  selectedDentistId: 'todos',
  selectedDentistName: 'Todos os dentistas',
  dentistSearch: '',
  dayAgendamentos: [],
  birthdaysToday: [],
  birthdayPanelDismissedDate: '',
};

const statusText = {
  em_aberto: 'Em aberto',
  confirmado: 'Confirmado',
  cancelado: 'Cancelado',
  remarcar: 'Remarcar',
};

const attendanceText = {
  compareceu: 'Compareceu',
  nao_compareceu: 'Não compareceu',
};

const getMarkerColor = (agendamento) => agendamento?.marcadorCor || agendamento?.marcador?.cor || '';
const getMarkerName = (agendamento) => agendamento?.marcadorNome || agendamento?.marcador?.nome || '';
const getDotColor = (agendamento) =>
  getMarkerColor(agendamento) || getDentistColor(agendamento?.dentistaId) || '#1fa87a';
const statusAllowed = ['em_aberto', 'confirmado', 'cancelado', 'remarcar'];

const getAgendaStatusKey = (agendamento = {}) => {
  const rawStatus = String(agendamento?.status || 'em_aberto').trim().toLowerCase();
  if (rawStatus === 'realizado' || rawStatus === 'nao_compareceu') {
    return agendamento?.confirmado === true ? 'confirmado' : 'em_aberto';
  }
  return statusAllowed.includes(rawStatus) ? rawStatus : 'em_aberto';
};

const getAttendanceStatusKey = (agendamento = {}) => {
  const rawAttendance = String(agendamento?.attendanceStatus || '').trim().toLowerCase();
  if (rawAttendance === 'compareceu' || rawAttendance === 'nao_compareceu') return rawAttendance;
  const rawStatus = String(agendamento?.status || '').trim().toLowerCase();
  if (rawStatus === 'realizado') return 'compareceu';
  if (rawStatus === 'nao_compareceu') return 'nao_compareceu';
  return '';
};

const getConfirmationPendingState = (agendamento = {}) => agendamento?.confirmationPending === true;

const syncDrawerConfirmationButton = (agendamento = {}, phone = '', attendanceKey = '', statusKey = 'em_aberto') => {
  if (!drawerSendConfirmacao) return;
  if (!drawerSendConfirmacao.dataset.defaultLabel) {
    drawerSendConfirmacao.dataset.defaultLabel = drawerSendConfirmacao.textContent || 'Enviar confirmação';
  }
  const confirmationPending = getConfirmationPendingState(agendamento);
  const hasValidPhone = toDigits(phone).length >= 10;
  const canSend = hasValidPhone
    && typeof whatsappApi.sendAppointmentConfirmation === 'function'
    && !attendanceKey
    && statusKey !== 'cancelado'
    && !confirmationPending;

  drawerSendConfirmacao.textContent = confirmationPending
    ? 'Aguardando resposta 1/2'
    : drawerSendConfirmacao.dataset.defaultLabel;
  drawerSendConfirmacao.disabled = !canSend;
  drawerSendConfirmacao.title = confirmationPending
    ? 'Confirmação já enviada. Aguarde a resposta 1 ou 2 do paciente.'
    : (canSend
      ? ''
      : (attendanceKey
        ? 'Consulta ja possui presença clinica registrada.'
        : 'Paciente sem telefone valido ou integracao indisponivel.'));
};

const buildAttendanceBadge = (agendamento = {}, className = 'attendance-badge') => {
  const attendanceKey = getAttendanceStatusKey(agendamento);
  if (!attendanceKey) return '';
  return `<span class="${className} attendance-${attendanceKey}">${attendanceText[attendanceKey] || attendanceKey}</span>`;
};

let pacientesCache = [];
let currentEditAgendamento = null;
let currentStatusAgendamentoId = null;
let agendaMarkersCache = [];
let agendaAvailabilityCache = null;
let currentUser = null;
let dentistasCache = [];
let currentDrawerAppt = null;
let agendaAutoRefreshTimer = null;
const appApi = window.appApi || {};
const authApi = appApi.auth || window.auth || {};
const patientsApi = appApi.patients || window.api?.patients || {};
const agendaApi = appApi.agenda || window.api?.agenda || {};
const agendaSettingsApi = appApi.agendaSettings || window.api?.agendaSettings || {};
const agendaAvailabilityApi = appApi.agendaAvailability || window.api?.agendaAvailability || {};
const openExternalUrlApi = appApi.openExternalUrl || window.api?.openExternalUrl;
const clinicApi = appApi.clinic || window.api?.clinic || {};
const whatsappApi = appApi.whatsapp || window.api?.whatsapp || {};
const birthdaysApi = appApi.birthdays || window.api?.birthdays || {};
const canSendBirthdayMessage = typeof birthdaysApi?.sendBirthdayMessage === 'function';

const toDigits = (value) => String(value || '').replace(/\D/g, '');

const openWhatsAppChat = async (phone) => {
  const digits = toDigits(phone);
  if (digits.length < 10) return false;
  try {
    if (!openExternalUrlApi) return false;
    await openExternalUrlApi(`https://wa.me/${digits}`);
    return true;
  } catch (err) {
    console.warn('[AGENDA] falha ao abrir link externo do WhatsApp:', err);
    return false;
  }
};

const findPatientForAppointment = (appt) => {
  const key = String(appt?.pacienteId || appt?.prontuario || appt?.patientId || '').trim();
  const name = String(appt?.pacienteNome || appt?.paciente || '').trim().toLowerCase();
  return (pacientesCache || []).find((p) => {
    const pid = String(p?.id || p?.prontuario || p?._id || '').trim();
    const pname = String(p?.nome || p?.fullName || '').trim().toLowerCase();
    return (key && pid && key === pid) || (name && pname && name === pname);
  }) || null;
};

const buildAppointmentConfirmationMessage = (appointment, patient) => {
  const nome = String(patient?.nome || patient?.fullName || appointment?.pacienteNome || appointment?.paciente || 'Paciente').trim();
  const clinicName = String(appointment?.clinicName || 'Voithos').trim();
  const dateRaw = String(appointment?.data || '').trim();
  let dataBr = dateRaw || '-';
  const match = dateRaw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) dataBr = `${match[3]}/${match[2]}/${match[1]}`;
  const hora = String(appointment?.horaInicio || '--:--').trim();
  return `Olá, ${nome}! 👋\n\nSua consulta na clínica ${clinicName} foi agendada com sucesso.\n\n📅 Data: ${dataBr}\n⏰ Horário: ${hora}\n\nResponda:\n1 para CONFIRMAR\n2 para REMARCAR`;
};

const formatWhatsAppErrorMessage = (err) => {
  const raw = String(err?.message || err || '').trim();
  if (!raw) return 'Falha ao enviar confirmacao por WhatsApp.';
  if (raw.includes('APPOINTMENT_NOT_FOUND') || raw.includes('Appointment not found')) {
    return 'Falha ao enviar confirmacao: consulta nao encontrada no backend central para esta clinica. O item exibido na agenda pode estar apenas no legado ou sem vinculo central.';
  }
  if (raw.includes('PATIENT_PHONE_MISSING')) {
    return 'Falha ao enviar confirmacao: paciente sem telefone valido no backend central.';
  }
  if (raw.includes('No WhatsApp instance for this clinic') || raw.includes('ENGINE_INSTANCE_MISSING')) {
    return 'Falha ao enviar confirmacao: esta clinica nao possui uma instancia WhatsApp conectada no engine. Abra "Minha clinica", conecte o WhatsApp e atualize o status.';
  }
  if (raw.includes('Instance disconnected')) {
    return 'Falha ao enviar confirmacao: instância WhatsApp nao conectada.';
  }
  if (raw.includes('Invalid internal service token')) {
    return 'Falha ao enviar confirmacao: token interno do backend central invalido.';
  }
  if (raw.includes('SERVICE_AUTH_NOT_CONFIGURED')) {
    return 'Falha ao enviar confirmacao: autenticacao interna do backend central nao configurada.';
  }
  if (raw.includes('WHATSAPP_NG_TIMEOUT')) {
    return 'Falha ao enviar confirmacao: WhatsApp NG demorou demais para responder.';
  }
  if (raw.includes("No handler registered for 'whatsapp-send-appointment-confirmation'")) {
    return 'Integracao de WhatsApp desatualizada nesta sessao. Feche e abra o app novamente.';
  }
  if (raw.includes("No handler registered")) {
    return 'Integracao de WhatsApp indisponivel no backend atual. Reinicie o aplicativo.';
  }
  if (raw.startsWith('Error invoking remote method')) {
    const idx = raw.indexOf('Error:');
    if (idx >= 0) return raw.slice(idx + 6).trim() || 'Erro ao enviar confirmacao por WhatsApp.';
    return 'Erro ao enviar confirmacao por WhatsApp.';
  }
  return raw;
};

const sendAppointmentConfirmationFallback = async ({ phone, patient, appointment }) => {
  if (typeof clinicApi.queueWhatsApp !== 'function') return { success: false, error: 'Canal de envio indisponivel.' };
  try {
    await clinicApi.queueWhatsApp({
      phone,
      message: buildAppointmentConfirmationMessage(appointment, patient),
      type: 'appointment_confirmation',
      meta: {
        appointmentId: String(appointment?.id || '').trim(),
        patientId: String(patient?.prontuario || patient?.id || patient?._id || '').trim(),
      },
      throttleMs: 800,
      maxAttempts: 2,
      retryDelayMs: 1200,
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: formatWhatsAppErrorMessage(err) };
  }
};

const normalizeTimeInput = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const match = raw.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!match) return '';
  const h = Number(match[1]);
  const m = Number(match[2] ?? 0);
  if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return '';
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const timeToMinutes = (value) => {
  const normalized = normalizeTimeInput(value);
  if (!normalized) return null;
  const [h, m] = normalized.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
};

const minutesToTime = (value) => {
  const total = Number(value);
  if (!Number.isFinite(total) || total < 0) return '';
  const safeTotal = Math.min(total, (23 * 60) + 59);
  const h = Math.floor(safeTotal / 60);
  const m = safeTotal % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const addMinutesToTime = (value, minutes = 30) => {
  const base = timeToMinutes(value);
  if (base === null) return '';
  return minutesToTime(base + (Number(minutes) || 0));
};

const loadAgendaAvailability = async () => {
  try {
    agendaAvailabilityCache = await agendaAvailabilityApi.get?.();
  } catch (err) {
    console.warn('[AGENDA] nao foi possivel carregar disponibilidade', err);
    agendaAvailabilityCache = null;
  }
};

const isWithinAvailability = (payload) => {
  if (!agendaAvailabilityCache) return { ok: true };
  const {
    workDays = [],
    startTime = '08:00',
    endTime = '18:00',
    breakStart = '12:00',
    breakEnd = '13:00',
    allowOverbooking = false,
  } = agendaAvailabilityCache;

  if (allowOverbooking) return { ok: true };
  const date = payload?.data ? new Date(`${payload.data}T00:00:00`) : null;
  if (!date || Number.isNaN(date.getTime())) return { ok: true };
  const day = date.getDay();
  if (Array.isArray(workDays) && workDays.length && !workDays.includes(day)) {
    return { ok: false, reason: 'Dia fora da disponibilidade.' };
  }

  const startMin = timeToMinutes(payload?.horaInicio || '');
  const endMin = timeToMinutes(payload?.horaFim || '');
  const availStart = timeToMinutes(startTime);
  const availEnd = timeToMinutes(endTime);
  const breakStartMin = timeToMinutes(breakStart);
  const breakEndMin = timeToMinutes(breakEnd);

  if (startMin === null || endMin === null) return { ok: true };
  if (availStart !== null && startMin < availStart) {
    return { ok: false, reason: 'Horario antes do inicio do expediente.' };
  }
  if (availEnd !== null && endMin > availEnd) {
    return { ok: false, reason: 'Horario ultrapassa o fim do expediente.' };
  }
  if (breakStartMin !== null && breakEndMin !== null) {
    const overlapsBreak = !(endMin <= breakStartMin || startMin >= breakEndMin);
    if (overlapsBreak) {
      return { ok: false, reason: 'Horario conflita com o intervalo.' };
    }
  }
  return { ok: true };
};

const isOverlapping = (startA, endA, startB, endB) => {
  const aStart = timeToMinutes(startA);
  const aEnd = timeToMinutes(endA);
  const bStart = timeToMinutes(startB);
  const bEnd = timeToMinutes(endB);
  if (aStart === null || aEnd === null || bStart === null || bEnd === null) return false;
  return aStart < bEnd && bStart < aEnd;
};

const openPatientProntuario = async (agendamento) => {
  const prontuario = agendamento?.pacienteId || agendamento?.prontuario || '';
  let patient = null;

  try {
    if (prontuario) {
      patient = await patientsApi.read?.(prontuario);
    }
  } catch (err) {
    console.warn('[AGENDA] paciente nao encontrado por prontuario', err);
  }

  if (!patient) {
    const nome = agendamento?.paciente || agendamento?.pacienteNome || '';
    if (nome && patientsApi.find) {
      try {
        patient = await patientsApi.find({ prontuario, fullName: nome, nome });
      } catch (err) {
        console.warn('[AGENDA] paciente nao encontrado por nome', err);
      }
    }
  }

  if (!patient) {
    showToast('Paciente nao encontrado.', 'error');
    return;
  }

  localStorage.setItem(getClinicStorageKey('prontuarioPatient'), JSON.stringify(patient));
  window.location.href = 'prontuario.html';
};


const showToast = (arg, type = 'info') => {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  let mensagem = '';
  let tipo = type || 'info';
  if (typeof arg === 'object' && arg !== null) {
    mensagem = arg.mensagem || '';
    tipo = arg.tipo || tipo;
  } else {
    mensagem = arg || '';
  }

  const tipoClass = ['critico', 'atencao', 'info', 'sucesso'].includes(tipo)
    ? tipo
    : (tipo === 'success' ? 'sucesso' : (tipo === 'error' ? 'critico' : 'info'));

  const toast = document.createElement('div');
  toast.className = `toast ${tipoClass}`;
  toast.innerHTML = mensagem;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 5000);
};

const scrollBirthdayStripIntoView = () => {
  if (!birthdayStrip) return;
  birthdayStrip.classList.remove('hidden');
  birthdayStrip.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const getBirthdaySummary = () => {
  const items = Array.isArray(state.birthdaysToday) ? state.birthdaysToday : [];
  return {
    total: items.length,
    pending: items.filter((item) => item?.birthdaySentYear !== true).length,
    sent: items.filter((item) => item?.birthdaySentYear === true).length,
    withAppointment: items.filter((item) => item?.hasAppointment === true).length,
  };
};

const renderBirthdayBadgeAndPanel = () => {
  const items = Array.isArray(state.birthdaysToday) ? state.birthdaysToday : [];
  const summary = getBirthdaySummary();

  if (!items.length) {
    birthdayHeaderBadge?.classList.add('hidden');
    birthdayStrip?.classList.add('hidden');
    if (birthdayStripList) birthdayStripList.innerHTML = '';
    if (birthdayStripSummary) birthdayStripSummary.textContent = '';
    return;
  }

  if (birthdayHeaderBadgeText) {
    birthdayHeaderBadgeText.textContent = summary.total === 1
      ? '1 aniversariante no dia'
      : `${summary.total} aniversariantes no dia`;
  }
  if (birthdayHeaderBadgeMeta) {
    const parts = [];
    parts.push(summary.pending === 1 ? '1 pendente' : `${summary.pending} pendentes`);
    if (summary.withAppointment > 0) {
      parts.push(summary.withAppointment === 1 ? '1 com consulta' : `${summary.withAppointment} com consulta`);
    }
    birthdayHeaderBadgeMeta.textContent = parts.join(' • ');
  }
  birthdayHeaderBadge?.classList.remove('hidden');

  const shouldHidePanel = state.birthdayPanelDismissedDate === state.selectedDate;
  if (shouldHidePanel) {
    birthdayStrip?.classList.add('hidden');
  } else {
    birthdayStrip?.classList.remove('hidden');
  }

  if (birthdayStripSummary) {
    birthdayStripSummary.textContent = `${summary.pending} pendentes • ${summary.sent} enviados • ${summary.withAppointment} com consulta`;
  }

  const sorted = [...items].sort((a, b) => {
    const scoreA = (a?.birthdaySentYear ? 1 : 0) + (a?.hasAppointment ? 2 : 0);
    const scoreB = (b?.birthdaySentYear ? 1 : 0) + (b?.hasAppointment ? 2 : 0);
    if (scoreA !== scoreB) return scoreA - scoreB;
    return String(a?.nome || '').localeCompare(String(b?.nome || ''), 'pt-BR');
  });

  if (birthdayStripList) {
    birthdayStripList.innerHTML = sorted.map((item) => {
      const patientId = String(item?.patientId || item?.prontuario || '').trim();
      const sent = item?.birthdaySentYear === true;
      const statusLabel = item?.birthdaySentToday
        ? 'Enviado hoje'
        : (sent ? 'Enviado este ano' : 'Pendente');
      return `
        <article class="birthday-strip-item" data-birthday-id="${patientId}">
          <div class="birthday-strip-meta">
            <div class="birthday-strip-name">${item?.nome || 'Paciente'}</div>
            <div class="birthday-strip-subline">${item?.telefone || 'Sem telefone cadastrado'}</div>
            <div class="birthday-strip-tags">
              <span class="birthday-strip-tag ${sent ? 'sent' : 'pending'}">${statusLabel}</span>
              <span class="birthday-strip-tag ${item?.hasAppointment ? 'with-appointment' : 'no-appointment'}">${item?.hasAppointment ? 'Com consulta hoje' : 'Sem consulta hoje'}</span>
            </div>
          </div>
          <div class="birthday-strip-actions">
            <button class="btn ghost birthday-strip-send" type="button" data-action="birthday-send" data-patient-id="${patientId}" ${(sent || !canSendBirthdayMessage) ? 'disabled' : ''} title="${!canSendBirthdayMessage ? 'Envio de aniversario ainda indisponivel no webapp.' : ''}">
              ${sent ? 'Ja enviado' : (canSendBirthdayMessage ? 'Enviar parabens' : 'Disponivel no desktop')}
            </button>
          </div>
        </article>
      `;
    }).join('');
  }
};

const loadBirthdaysForSelectedDate = async () => {
  if (typeof birthdaysApi?.listToday !== 'function') {
    state.birthdaysToday = [];
    renderBirthdayBadgeAndPanel();
    return;
  }
  try {
    const data = await birthdaysApi.listToday({ date: state.selectedDate });
    state.birthdaysToday = Array.isArray(data?.items) ? data.items : [];
  } catch (err) {
    console.warn('[AGENDA] nao foi possivel carregar aniversariantes do dia', err);
    state.birthdaysToday = [];
  }
  renderBirthdayBadgeAndPanel();
};

document.body.addEventListener('click', async (event) => {
  const birthdaySendButton = event.target.closest('[data-action="birthday-send"]');
  if (!birthdaySendButton) return;
  const patientId = String(birthdaySendButton.getAttribute('data-patient-id') || '').trim();
  if (!patientId || typeof birthdaysApi?.sendBirthdayMessage !== 'function') return;
  try {
    await birthdaysApi.sendBirthdayMessage({
      patientId,
      date: state.selectedDate,
      trigger: 'manual',
      force: false,
    });
    showToast('Mensagem de aniversario enviada com sucesso.', 'success');
    await loadBirthdaysForSelectedDate();
  } catch (err) {
    console.warn('[AGENDA] falha ao enviar mensagem de aniversario', err);
    showToast(err?.message || 'Nao foi possivel enviar a mensagem de aniversario.', 'error');
  }
});

const consumeAgendaPatientContext = () => {
  try {
    const raw = sessionStorage.getItem(getClinicStorageKey(AGENDA_PREFILL_PATIENT_KEY))
      || sessionStorage.getItem(AGENDA_PREFILL_PATIENT_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(getClinicStorageKey(AGENDA_PREFILL_PATIENT_KEY));
    sessionStorage.removeItem(AGENDA_PREFILL_PATIENT_KEY);
    const patient = JSON.parse(raw);
    const activeClinicId = String(currentUser?.clinicId || '').trim();
    const patientClinicId = String(patient?.clinicId || patient?.clinicaId || '').trim();
    if (activeClinicId && patientClinicId && patientClinicId !== activeClinicId) {
      console.warn('[AGENDA] stale_agenda_prefill_detected=true', {
        clinicId: activeClinicId,
        patientId: patient?.id || patient?.prontuario || '',
        patientClinicId,
      });
      return null;
    }
    return patient;
  } catch (err) {
    sessionStorage.removeItem(getClinicStorageKey(AGENDA_PREFILL_PATIENT_KEY));
    sessionStorage.removeItem(AGENDA_PREFILL_PATIENT_KEY);
    console.warn('[AGENDA] invalid_agenda_prefill_context', err?.message || err);
    return null;
  }
};

const resolveAgendaContextPatient = () => {
  const contextPatient = consumeAgendaPatientContext();
  if (!contextPatient) return null;
  const candidateIds = [
    contextPatient?.id,
    contextPatient?.prontuario,
    contextPatient?._id,
  ].map((value) => String(value || '').trim()).filter(Boolean);
  const candidateName = String(contextPatient?.nome || contextPatient?.fullName || '').trim().toLowerCase();
  return pacientesCache.find((patient) => {
    const patientIds = [
      patient?.id,
      patient?.prontuario,
      patient?._id,
    ].map((value) => String(value || '').trim()).filter(Boolean);
    const patientName = String(patient?.nome || patient?.fullName || '').trim().toLowerCase();
    return patientIds.some((id) => candidateIds.includes(id)) || (candidateName && patientName === candidateName);
  }) || null;
};

const consumeAgendaDraftContext = () => {
  try {
    const raw = sessionStorage.getItem(getClinicStorageKey(AGENDA_PREFILL_DRAFT_KEY))
      || sessionStorage.getItem(AGENDA_PREFILL_DRAFT_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(getClinicStorageKey(AGENDA_PREFILL_DRAFT_KEY));
    sessionStorage.removeItem(AGENDA_PREFILL_DRAFT_KEY);
    const draft = JSON.parse(raw);
    const activeClinicId = String(currentUser?.clinicId || '').trim();
    const draftClinicId = String(draft?.clinicId || '').trim();
    if (activeClinicId && draftClinicId && draftClinicId !== activeClinicId) {
      console.warn('[AGENDA] stale_agenda_draft_detected=true', {
        clinicId: activeClinicId,
        draftClinicId,
        dentistaId: draft?.dentistaId || '',
      });
      return null;
    }
    return draft;
  } catch (err) {
    sessionStorage.removeItem(getClinicStorageKey(AGENDA_PREFILL_DRAFT_KEY));
    sessionStorage.removeItem(AGENDA_PREFILL_DRAFT_KEY);
    console.warn('[AGENDA] invalid_agenda_draft_context', err?.message || err);
    return null;
  }
};

const consumeAgendaNotificationTarget = () => {
  try {
    const raw = sessionStorage.getItem(getClinicStorageKey(AGENDA_NOTIFICATION_TARGET_KEY))
      || sessionStorage.getItem(AGENDA_NOTIFICATION_TARGET_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(getClinicStorageKey(AGENDA_NOTIFICATION_TARGET_KEY));
    sessionStorage.removeItem(AGENDA_NOTIFICATION_TARGET_KEY);
    const target = JSON.parse(raw);
    const activeClinicId = String(currentUser?.clinicId || '').trim();
    const targetClinicId = String(target?.clinicId || '').trim();
    if (activeClinicId && targetClinicId && targetClinicId !== activeClinicId) {
      console.warn('[AGENDA] stale_agenda_notification_target_detected=true', {
        clinicId: activeClinicId,
        targetClinicId,
        appointmentId: target?.appointmentId || '',
      });
      return null;
    }
    return target;
  } catch (err) {
    sessionStorage.removeItem(getClinicStorageKey(AGENDA_NOTIFICATION_TARGET_KEY));
    sessionStorage.removeItem(AGENDA_NOTIFICATION_TARGET_KEY);
    console.warn('[AGENDA] invalid_agenda_notification_target_context', err?.message || err);
    return null;
  }
};

const applyPatientPrefillToModal = (patient, refs) => {
  if (!patient || !refs) return;
  const patientValue = patient.id || patient.prontuario || patient._id || '';
  const patientName = patient.nome || patient.fullName || 'Paciente';
  if (refs.pacienteSelect && patientValue) refs.pacienteSelect.value = patientValue;
  if (refs.patientToggle) refs.patientToggle.textContent = patientName;
  if (refs.filtroPaciente) refs.filtroPaciente.value = patientName;
  renderPacientesOptions(patientName);
};

const findAgendaAppointmentById = (appointmentId) => {
  const normalizedId = String(appointmentId || '').trim();
  if (!normalizedId) return null;
  const pools = [
    Array.isArray(state.dayAgendamentos) ? state.dayAgendamentos : [],
    Array.isArray(state.rangeAgendamentos) ? state.rangeAgendamentos : [],
  ];
  for (const pool of pools) {
    const found = pool.find((appt) => String(appt?.id || appt?.agendamentoId || '').trim() === normalizedId);
    if (found) return found;
  }
  return null;
};

const openAgendaTargetFromNotification = async () => {
  const target = consumeAgendaNotificationTarget();
  if (!target) return false;

  const appointmentId = String(target?.appointmentId || '').trim();
  const patientContext = target?.patient || null;
  const draftContext = target?.draftContext || null;
  const targetDate = String(target?.date || target?.data || '').trim();

  if (targetDate && targetDate !== state.selectedDate) {
    state.selectedDate = normalizeDateLocal(targetDate);
    await refreshData();
  }

  if (appointmentId) {
    let appointment = findAgendaAppointmentById(appointmentId);
    if (appointment) {
      openAgendaDrawer(appointment);
      return true;
    }
  }

  if (patientContext || draftContext) {
    await abrirModalNovoAgendamento(null, {
      defaultDate: state.selectedDate,
      patientContext,
      draftContext,
    });
    return true;
  }

  return false;
};

const openNewAppointmentForTimeSlot = async ({ date, time }) => {
  const normalizedDate = normalizeDateLocal(date || state.selectedDate || new Date());
  const normalizedTime = normalizeTimeInput(time);
  const defaultStart = normalizedTime || '08:00';
  const defaultEnd = addMinutesToTime(defaultStart, 30) || '08:30';
  const patientContext = resolveAgendaContextPatient();
  await abrirModalNovoAgendamento(null, {
    defaultDate: normalizedDate,
    defaultHoraInicio: defaultStart,
    defaultHoraFim: defaultEnd,
    patientContext,
  });
};

const getDentistName = (dentistId) => {
  const dent = (dentistasCache || []).find((d) => String(d.id || '') === String(dentistId || ''));
  return dent?.nome || 'Dentista';
};

const getDentistColor = (dentistId) => {
  const dent = (dentistasCache || []).find((d) => String(d.id || '') === String(dentistId || ''));
  return dent?.corDentista || '#1fa87a';
};

const buildDentistPatientsMap = () => {
  const map = {};
  (dentistasCache || []).forEach((d) => {
    map[String(d.id || '')] = [];
  });

  const dayList = Array.isArray(state.dayAgendamentos) ? state.dayAgendamentos : [];
  dayList.forEach((appt) => {
    const dentId = String(appt.dentistaId || '');
    if (!dentId) return;
    if (!map[dentId]) map[dentId] = [];
    const name = appt.pacienteNome || appt.paciente || '';
    if (!name) return;
    const exists = map[dentId].some((p) => String(p.nome || p.fullName || '') === String(name));
    if (!exists) map[dentId].push({ nome: name, fullName: name });
  });

  Object.values(map).forEach((list) => {
    list.sort((a, b) => String(a.fullName || a.nome || '').localeCompare(String(b.fullName || b.nome || '')));
  });
  return map;
};

const updateDentistFilterLabel = () => {
  if (!dentistSelectedLabel) return;
  dentistSelectedLabel.textContent = state.selectedDentistName || 'Todos os dentistas';
  if (dentistChip && dentistChipLabel && dentistChipDot) {
    if (state.selectedDentistId && state.selectedDentistId !== 'todos') {
      dentistChip.classList.remove('hidden');
      dentistChipLabel.textContent = state.selectedDentistName || 'Dentista';
      dentistChipDot.style.background = getDentistColor(state.selectedDentistId);
    } else {
      dentistChip.classList.add('hidden');
    }
  }
};

const filterAgendamentosByDentist = (list) => {
  if (!state.selectedDentistId || state.selectedDentistId === 'todos') return list;
  return (list || []).filter((a) => String(a.dentistaId || '') === String(state.selectedDentistId));
};

const closeDentistDropdown = () => {
  if (!dentistDropdown || !dentistToggle) return;
  dentistDropdown.classList.add('hidden');
  dentistToggle.setAttribute('aria-expanded', 'false');
};

const openDentistDropdown = () => {
  if (!dentistDropdown || !dentistToggle) return;
  dentistDropdown.classList.remove('hidden');
  dentistToggle.setAttribute('aria-expanded', 'true');
  const searchInput = dentistDropdown.querySelector('.dentist-search');
  if (searchInput) searchInput.focus();
};

const renderDentistDropdown = () => {
  if (!dentistDropdown) return;
  dentistDropdown.innerHTML = '';
  const map = buildDentistPatientsMap();
  const dayList = Array.isArray(state.dayAgendamentos) ? state.dayAgendamentos : [];
  const allPatients = [];
  dayList.forEach((appt) => {
    const name = appt.pacienteNome || appt.paciente || '';
    if (!name) return;
    if (!allPatients.includes(name)) allPatients.push(name);
  });
  allPatients.sort((a, b) => String(a).localeCompare(String(b)));

  const search = String(state.dentistSearch || '').trim().toLowerCase();
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'dentist-search';
  searchInput.placeholder = 'Buscar dentista ou paciente';
  searchInput.value = state.dentistSearch || '';
  searchInput.addEventListener('input', (e) => {
    state.dentistSearch = e.target.value || '';
    renderDentistDropdown();
  });
  dentistDropdown.appendChild(searchInput);

  const section = document.createElement('div');
  section.className = 'dentist-section-title';
  section.textContent = 'Dentistas';
  dentistDropdown.appendChild(section);

  const buildItem = (id, name, patients = []) => {
    const item = document.createElement('div');
    item.className = 'dentist-item';
    if (String(id) === String(state.selectedDentistId)) item.classList.add('active');
    item.setAttribute('role', 'menuitem');
    item.tabIndex = 0;
    item.dataset.id = id;

    const header = document.createElement('div');
    header.className = 'dentist-row';
    const label = document.createElement('span');
    label.className = 'dentist-name';
    const dot = document.createElement('span');
    dot.className = 'dentist-color-dot';
    dot.style.background = getDentistColor(id);
    label.textContent = name;
    label.prepend(dot);
    const count = document.createElement('span');
    count.className = 'dentist-count';
    count.textContent = `${patients.length} pacientes`;
    header.append(label, count);

    const list = document.createElement('ul');
    list.className = 'dentist-patients';
    const filteredPatients = search
      ? patients.filter((p) => String(p.fullName || p.nome || '').toLowerCase().includes(search))
      : patients;
    if (!filteredPatients.length) {
      const empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = 'Sem pacientes';
      list.appendChild(empty);
    } else {
      filteredPatients.forEach((p) => {
        const li = document.createElement('li');
        li.textContent = p.fullName || p.nome || 'Paciente';
        list.appendChild(li);
      });
    }

    item.append(header, list);
    item.addEventListener('click', () => {
      state.selectedDentistId = id;
      state.selectedDentistName = name;
      updateDentistFilterLabel();
      closeDentistDropdown();
      refreshData();
    });
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        item.click();
      }
    });
    return item;
  };

  const allList = allPatients.map((p) => ({ nome: p, fullName: p }));
  if (!search || 'todos os dentistas'.includes(search) || allList.some((p) => String(p.nome).toLowerCase().includes(search))) {
    dentistDropdown.appendChild(buildItem('todos', 'Todos os dentistas', allList));
  }
  (dentistasCache || []).forEach((d) => {
    const id = d.id || '';
    const name = d.nome || 'Dentista';
    const patients = map[String(id)] || [];
    const matchDentist = !search || name.toLowerCase().includes(search);
    const matchPatient = patients.some((p) => String(p.fullName || p.nome || '').toLowerCase().includes(search));
    if (matchDentist || matchPatient) {
      dentistDropdown.appendChild(buildItem(id, name, patients));
    }
  });
};

const refreshDentistFilter = () => {
  if (currentUser?.tipo === 'dentista') {
    state.selectedDentistId = currentUser.id || 'todos';
    state.selectedDentistName = currentUser.nome || 'Dentista';
    if (dentistFilter) dentistFilter.hidden = true;
  } else {
    if (dentistFilter) dentistFilter.hidden = false;
    if (state.selectedDentistId !== 'todos') {
      const exists = (dentistasCache || []).some((d) => String(d.id || '') === String(state.selectedDentistId));
      if (!exists) {
        state.selectedDentistId = 'todos';
        state.selectedDentistName = 'Todos os dentistas';
      }
    }
  }
  updateDentistFilterLabel();
  renderDentistDropdown();
};
const openAgendaDrawer = (appt) => {
  if (!agendaDrawer || !agendaDrawerBackdrop || !appt) return;
  currentDrawerAppt = appt;
  const statusKey = getAgendaStatusKey(appt);
  const attendanceKey = getAttendanceStatusKey(appt);
  const markerName = getMarkerName(appt);
  const markerColor = getMarkerColor(appt);
  const nome = appt.pacienteNome || appt.paciente || 'Paciente';
  const dentista = appt.dentistaNome || 'Dentista';
  const horario = `${appt.horaInicio || '--:--'}${appt.horaFim ? ' - ' + appt.horaFim : ''}`;
  const tipo = appt.tipo || 'Consulta';
  const patient = findPatientForAppointment(appt);
  const phone = patient?.telefone || patient?.phone || patient?.celular || patient?.whatsapp || '';

  if (drawerTitle) drawerTitle.textContent = nome;
  if (drawerType) drawerType.textContent = tipo;
  if (drawerPaciente) drawerPaciente.textContent = nome;
  if (drawerDentista) drawerDentista.textContent = dentista;
  if (drawerMarcadorText) drawerMarcadorText.textContent = markerName || 'Sem marcador';
  if (drawerMarcadorDot) {
    drawerMarcadorDot.hidden = !markerName;
    drawerMarcadorDot.style.background = markerColor || '#94a3b8';
  }
  if (drawerHorario) drawerHorario.textContent = horario;
  if (drawerTelefone) drawerTelefone.textContent = phone || '-';
  if (drawerStatus) drawerStatus.value = statusKey;
  if (drawerPresenca) drawerPresenca.textContent = attendanceText[attendanceKey] || 'Pendente';
  if (drawerExcluir) drawerExcluir.hidden = !canDeleteAgendamento();
  if (drawerFalarPaciente) {
    drawerFalarPaciente.disabled = toDigits(phone).length < 10;
    drawerFalarPaciente.title = drawerFalarPaciente.disabled ? 'Paciente sem telefone valido.' : '';
  }
  syncDrawerConfirmationButton(appt, phone, attendanceKey, statusKey);

  agendaDrawer.hidden = false;
  agendaDrawerBackdrop.hidden = false;
};

const closeAgendaDrawer = () => {
  if (agendaDrawer) agendaDrawer.hidden = true;
  if (agendaDrawerBackdrop) agendaDrawerBackdrop.hidden = true;
  currentDrawerAppt = null;
};

if (drawerClose) {
  drawerClose.addEventListener('click', closeAgendaDrawer);
}
if (agendaDrawerBackdrop) {
  agendaDrawerBackdrop.addEventListener('click', closeAgendaDrawer);
}
if (drawerEdit) {
  drawerEdit.addEventListener('click', () => {
    if (!currentDrawerAppt) return;
    const apptToEdit = { ...currentDrawerAppt };
    closeAgendaDrawer();
    abrirModalNovoAgendamento(apptToEdit);
  });
}
if (drawerProntuario) {
  drawerProntuario.addEventListener('click', () => {
    if (!currentDrawerAppt) return;
    openPatientProntuario(currentDrawerAppt);
  });
}
if (drawerFalarPaciente) {
  drawerFalarPaciente.addEventListener('click', async () => {
    if (!currentDrawerAppt) return;
    const patient = findPatientForAppointment(currentDrawerAppt);
    const phone = patient?.telefone || patient?.phone || patient?.celular || patient?.whatsapp || '';
    const ok = await openWhatsAppChat(phone);
    if (!ok) showToast('Nao foi possivel abrir o WhatsApp para este paciente.', 'error');
  });
}
if (drawerSendConfirmacao) {
  drawerSendConfirmacao.addEventListener('click', async () => {
    if (!currentDrawerAppt) return;
    const patient = findPatientForAppointment(currentDrawerAppt) || {};
    const phone = patient?.telefone || patient?.phone || patient?.celular || patient?.whatsapp || '';
    if (toDigits(phone).length < 10) {
      showToast('Paciente sem telefone valido para envio.', 'error');
      return;
    }
    if (typeof whatsappApi.sendAppointmentConfirmation !== 'function' && typeof clinicApi.queueWhatsApp !== 'function') {
      showToast('Integracao de WhatsApp indisponivel neste ambiente.', 'error');
      return;
    }
    const btnLabel = drawerSendConfirmacao.textContent;
    try {
      drawerSendConfirmacao.disabled = true;
      drawerSendConfirmacao.textContent = 'Enviando...';
      const normalizedPatient = {
        ...(patient || {}),
        telefone: phone,
        nome: patient?.nome || patient?.fullName || currentDrawerAppt?.pacienteNome || currentDrawerAppt?.paciente || '',
      };
      let result = null;
      if (typeof whatsappApi.sendAppointmentConfirmation === 'function') {
        try {
          result = await whatsappApi.sendAppointmentConfirmation({
            patient: normalizedPatient,
            appointment: currentDrawerAppt,
          });
        } catch (err) {
          const msg = String(err?.message || '');
          if (msg.includes("No handler registered for 'whatsapp-send-appointment-confirmation'")) {
            result = await sendAppointmentConfirmationFallback({
              phone,
              patient: normalizedPatient,
              appointment: currentDrawerAppt,
            });
          } else {
            throw err;
          }
        }
      } else {
        result = await sendAppointmentConfirmationFallback({
          phone,
          patient: normalizedPatient,
          appointment: currentDrawerAppt,
        });
      }
      if (result?.alreadyResolved) {
        currentDrawerAppt.confirmationPending = false;
        showToast('A confirmacao desta consulta ja foi resolvida na agenda.', 'info');
      } else if (result?.alreadyPending || result?.deduped) {
        currentDrawerAppt.confirmationPending = true;
        currentDrawerAppt.lastConfirmationSentAt = result?.lastConfirmationSentAt || new Date().toISOString();
        showToast('Confirmacao ja enviada. Agora aguarde a resposta 1 ou 2 do paciente.', 'info');
      } else if (result?.success) {
        currentDrawerAppt.confirmationPending = result?.confirmationPending === true;
        currentDrawerAppt.lastConfirmationSentAt = result?.lastConfirmationSentAt || new Date().toISOString();
        showToast(
          currentDrawerAppt.confirmationPending
            ? 'Confirmacao enviada. Agora aguarde a resposta 1 ou 2 do paciente.'
            : 'Confirmacao enviada por WhatsApp.',
          'success'
        );
      }
    } catch (err) {
      console.warn('[AGENDA] erro ao enviar confirmacao manual', err);
    } finally {
      const patientAfter = findPatientForAppointment(currentDrawerAppt) || {};
      const phoneAfter = patientAfter?.telefone || patientAfter?.phone || patientAfter?.celular || patientAfter?.whatsapp || '';
      const attendanceAfter = getAttendanceStatusKey(currentDrawerAppt);
      const statusAfter = getAgendaStatusKey(currentDrawerAppt);
      if (drawerSendConfirmacao?.dataset?.defaultLabel) {
        drawerSendConfirmacao.textContent = btnLabel;
      }
      syncDrawerConfirmationButton(currentDrawerAppt, phoneAfter, attendanceAfter, statusAfter);
    }
  });
}
if (drawerExcluir) {
  drawerExcluir.addEventListener('click', async () => {
    if (!currentDrawerAppt) return;
    const ok = confirm('Excluir este agendamento?');
    if (!ok) return;
    try {
      await agendaApi.remove?.(currentDrawerAppt);
      closeAgendaDrawer();
      await refreshData();
    } catch (err) {
      console.warn('[AGENDA] erro ao excluir', err);
      showToast(getDeleteErrorMessage(err), 'error');
    }
  });
}

if (dentistToggle && dentistDropdown) {
  dentistToggle.addEventListener('click', (e) => {
    e.preventDefault();
    const isOpen = !dentistDropdown.classList.contains('hidden');
    if (isOpen) closeDentistDropdown();
    else openDentistDropdown();
  });
  document.addEventListener('click', (e) => {
    if (!dentistFilter) return;
    if (!dentistFilter.contains(e.target)) {
      closeDentistDropdown();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDentistDropdown();
  });
}
if (drawerStatus) {
  drawerStatus.addEventListener('change', async () => {
    if (!currentDrawerAppt) return;
    const novoStatus = drawerStatus.value || 'em_aberto';
    try {
      await agendaApi.update?.(currentDrawerAppt.id, { status: novoStatus });
      currentDrawerAppt.status = novoStatus;
      await refreshData();
    } catch (err) {
      console.warn('[AGENDA] erro ao alterar status', err);
      showToast('Nao foi possivel alterar status.', 'error');
    }
  });
}

const getMonthStartEnd = () => {
  const base = new Date(state.today);
  base.setMonth(base.getMonth() + state.monthOffset);
  const start = new Date(base.getFullYear(), base.getMonth(), 1);
  const end = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  return { start, end };
};

const toDateLocal = (dateStr) => {
  if (!dateStr) return new Date();
  const parsed = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return new Date();
  return parsed;
};

const getWeekStartEnd = (dateRef) => {
  const base = new Date(dateRef);
  const day = base.getDay();
  const diff = (day + 6) % 7;
  const start = new Date(base);
  start.setDate(base.getDate() - diff);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(0, 0, 0, 0);
  return { start, end };
};

const shiftSelectedDate = (days) => {
  const base = toDateLocal(state.selectedDate);
  base.setDate(base.getDate() + days);
  state.selectedDate = normalizeDateLocal(base);
};

const syncMonthOffsetToSelectedDate = () => {
  const selected = toDateLocal(state.selectedDate);
  const today = new Date();
  const diff = (selected.getFullYear() - today.getFullYear()) * 12 + (selected.getMonth() - today.getMonth());
  state.monthOffset = diff;
};

const getUserRole = () => currentUser?.tipo || '';
const canDeleteAgendamento = () => ['admin', 'administrativo', 'super_admin', 'recepcionista', 'recepcao'].includes(getUserRole());
const getDeleteErrorMessage = (err) => {
  const message = String(err?.message || '').trim();
  if (/Acesso negado/i.test(message)) return 'Seu perfil nao tem permissao para excluir este agendamento.';
  if (/Agendamento nao encontrado/i.test(message)) return 'Este agendamento nao foi encontrado na agenda local. Pode ser um registro antigo ou ja removido.';
  if (/outra clinica/i.test(message)) return 'Este agendamento pertence a outra clinica e nao pode ser excluido aqui.';
  return 'Nao foi possivel excluir.';
};


const renderDayList = async (dateStr) => {
  const list = document.getElementById('agenda-list');
  const normalizedDate = normalizeDateLocal(dateStr);
  state.selectedDate = normalizedDate;
  const dayLabel = document.getElementById('selected-date-label');
  const subtitle = document.getElementById('selected-day-label');
  if (dayLabel) dayLabel.textContent = new Date(`${normalizedDate}T00:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  if (subtitle) {
    const dentistaLabel = state.selectedDentistId === 'todos' ? '' : ` · ${state.selectedDentistName}`;
    subtitle.textContent = `Agendamentos do dia${dentistaLabel}`;
  }
  if (!list) return;
  list.innerHTML = '<div class="no-data">Carregando...</div>';
  try {
    await loadBirthdaysForSelectedDate();
    console.log('[AGENDA] dia selecionado', dateStr);
    const usuario = state.usuarioLogado;
    const agendamentosDiaBrutos = await agendaApi.getDay?.(normalizedDate);
    const agsBase = filtrarAgendamentosPorPerfil(agendamentosDiaBrutos, usuario);
    const ags = filterAgendamentosByDentist(agsBase);
    const isToday = normalizedDate === normalizeDateLocal(new Date());
    const nowMinutes = isToday ? (() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); })() : null;
    let atrasoDetectado = false;
    let noShowDetectado = false;

    state.dayAgendamentos = agsBase || [];
    refreshDentistFilter();

    if (!ags || !ags.length) {
      list.innerHTML = '<div class="no-data">Nenhum agendamento para este dia.</div>';
      renderDayTimeline(normalizedDate, []);
      if (isToday) {
        showToast({ mensagem: '&#8505;&#65039; Nenhum agendamento para hoje', tipo: 'info' });
      }
      return;
    }
    list.innerHTML = '';
    ags.forEach((a) => {
      const key = getAgendaStatusKey(a);
      const attendanceKey = getAttendanceStatusKey(a);
      if (attendanceKey === 'nao_compareceu') noShowDetectado = true;
      if (isToday) {
        const fimMin = timeToMinutes(a.horaFim) ?? timeToMinutes(a.horaInicio);
        if (fimMin !== null && nowMinutes !== null && fimMin < nowMinutes && key === 'em_aberto') {
          atrasoDetectado = true;
        }
      }
      const nome = a.pacienteNome || a.paciente || 'Paciente';
      const markerName = getMarkerName(a);
      const markerColor = getMarkerColor(a);
      const card = document.createElement('div');
      card.className = 'appointment-card';
      card.style.setProperty('--dentist-color', getDentistColor(a.dentistaId));
      card.innerHTML = `
        <div class="card-top">
          <span class="time-badge">${a.horaInicio || '--:--'} - ${a.horaFim || '--:--'}</span>
          <div class="card-badges">
            ${markerName ? `<span class="marker-badge" style="--marker-color:${markerColor || '#94a3b8'}">${markerName}</span>` : ''}
            <span class="status-badge status-${key}">${statusText[key] || key}</span>
            ${buildAttendanceBadge(a)}
          </div>
        </div>
        <div class="patient-name">${nome}</div>
        <p class="proc-name">${a.tipo || 'Procedimento'}</p>
      `;

      const actions = document.createElement('div');
      actions.className = 'card-actions';

      const btnEdit = document.createElement('button');
      btnEdit.className = 'btn ghost';
      btnEdit.textContent = 'Editar';
      btnEdit.addEventListener('click', () => {
        console.log('Editar agendamento:', a.id);
        abrirModalNovoAgendamento(a);
      });

      const btnStatus = document.createElement('button');
      btnStatus.className = 'btn ghost';
      btnStatus.textContent = 'Alterar status';
      btnStatus.addEventListener('click', () => {
        openStatusModal(a);
      });

      const btnServices = document.createElement('button');
      btnServices.className = 'btn ghost';
      btnServices.textContent = 'Ver prontuario';
      btnServices.addEventListener('click', () => {
        openPatientProntuario(a);
      });

      actions.append(btnEdit, btnStatus, btnServices);
      if (canDeleteAgendamento()) {
        const btnDelete = document.createElement('button');
        btnDelete.className = 'btn ghost';
        btnDelete.textContent = 'Excluir';
        btnDelete.addEventListener('click', async () => {
          const ok = confirm('Excluir este agendamento?');
          if (!ok) return;
          try {
            await agendaApi.remove?.(a);
            await refreshData();
          } catch (err) {
            console.warn('[AGENDA] erro ao excluir', err);
            showToast(getDeleteErrorMessage(err), 'error');
          }
        });
        actions.appendChild(btnDelete);
      }
      card.appendChild(actions);
      list.appendChild(card);
    });
    renderDayTimeline(normalizedDate, ags);
    if (atrasoDetectado) {
      showToast({ mensagem: '&#128339; Existe agendamento em atraso', tipo: 'critico' });
    }
    if (noShowDetectado) {
      showToast({ mensagem: '&#128683; Paciente marcado como nao compareceu', tipo: 'critico' });
    }
  } catch (err) {
    console.warn('[AGENDA] erro ao carregar dia', err);
    state.dayAgendamentos = [];
    refreshDentistFilter();
    list.innerHTML = '<div class="no-data">Nao foi possivel carregar os agendamentos.</div>';
  }
};

const buildAgendaMap = (agendamentos) => {
  const map = {};
  if (!agendamentos || !agendamentos.length) return map;

  agendamentos.forEach((ag) => {
    if (!ag.data) return;
    const dia = normalizeDateLocal(ag.data);
    if (!map[dia]) map[dia] = [];
    map[dia].push(ag);
  });

  return map;
};

const renderCalendarMes = (ano, mes) => {
  const grid = document.getElementById('calendar') || document.getElementById('calendar-grid');
  if (!grid) return;
  grid.innerHTML = '';
  const firstDay = new Date(ano, mes, 1);
  const daysInMonth = new Date(ano, mes + 1, 0).getDate();
  const startWeekday = firstDay.getDay();
  const todayStr = normalizeDateLocal(new Date());

  const agendaMap = buildAgendaMap(state.rangeAgendamentos);

  for (let i = 0; i < startWeekday; i += 1) {
    const empty = document.createElement('div');
    empty.className = 'day-cell empty';
    grid.appendChild(empty);
  }

  for (let d = 1; d <= daysInMonth; d += 1) {
    const dateObj = new Date(ano, mes, d);
    const dateStr = normalizeDateLocal(dateObj);
    const cell = document.createElement('div');
    cell.className = 'day-cell';
    if (dateStr === todayStr) cell.classList.add('today');
    if (dateStr === state.selectedDate) cell.classList.add('selected');
    cell.innerHTML = `
      <div class="day-number-row">
        <div class="day-number">${d}</div>
        <div class="agendamento-dots"></div>
      </div>
      <div class="day-label">${dateObj.toLocaleDateString('pt-BR', { weekday: 'short' })}</div>
      <div class="count"></div>
    `;
    const dateKey = dateStr;
    const agendamentosDoDia = agendaMap[dateKey] || [];
    const infoEl = cell.querySelector('.count');
    const dotsEl = cell.querySelector('.agendamento-dots');

    if (dotsEl) {
      dotsEl.innerHTML = '';
      const maxDots = 5;
      const dotsToShow = Math.min(agendamentosDoDia.length, maxDots);
      for (let i = 0; i < dotsToShow; i += 1) {
        const dot = document.createElement('span');
        dot.className = 'dot';
        dot.style.background = getDotColor(agendamentosDoDia[i]);
        dotsEl.appendChild(dot);
      }
      if (agendamentosDoDia.length > maxDots) {
        const more = document.createElement('span');
        more.className = 'dot more';
        more.textContent = '+';
        dotsEl.appendChild(more);
      }
    }

    if (agendamentosDoDia.length > 0) {
      cell.classList.add('tem-agendamento');
      if (infoEl) infoEl.textContent = `${agendamentosDoDia.length} agendamento(s)`;
    } else {
      cell.classList.remove('tem-agendamento');
      if (infoEl) infoEl.textContent = 'Sem agendamentos';
    }
    cell.addEventListener('click', () => {
      state.selectedDate = dateStr;
      renderCalendarMes(ano, mes);
      renderDayList(dateStr);
    });

    grid.appendChild(cell);
  }
  console.log('[AGENDA] calendario renderizado', ano, mes + 1);
};
const renderCalendarSemana = (dateRef) => {
  const grid = document.getElementById('calendar') || document.getElementById('calendar-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const agendaMap = buildAgendaMap(filterAgendamentosByDentist(state.rangeAgendamentos));
  const range = getWeekStartEnd(dateRef);
  const todayStr = normalizeDateLocal(new Date());

  for (let i = 0; i < 7; i += 1) {
    const dateObj = new Date(range.start);
    dateObj.setDate(range.start.getDate() + i);
    const dateStr = normalizeDateLocal(dateObj);
    const cell = document.createElement('div');
    cell.className = 'day-cell';
    if (dateStr === todayStr) cell.classList.add('today');
    if (dateStr === state.selectedDate) cell.classList.add('selected');
    cell.innerHTML = `
      <div class="day-number-row">
        <div class="day-number">${dateObj.getDate()}</div>
        <div class="agendamento-dots"></div>
      </div>
      <div class="day-label">${dateObj.toLocaleDateString('pt-BR', { weekday: 'short' })}</div>
      <div class="count"></div>
    `;

    const agendamentosDoDia = agendaMap[dateStr] || [];
    const infoEl = cell.querySelector('.count');
    const dotsEl = cell.querySelector('.agendamento-dots');

    if (dotsEl) {
      dotsEl.innerHTML = '';
      const maxDots = 5;
      const dotsToShow = Math.min(agendamentosDoDia.length, maxDots);
      for (let d = 0; d < dotsToShow; d += 1) {
        const dot = document.createElement('span');
        dot.className = 'dot';
        dot.style.background = getDotColor(agendamentosDoDia[d]);
        dotsEl.appendChild(dot);
      }
      if (agendamentosDoDia.length > maxDots) {
        const more = document.createElement('span');
        more.className = 'dot more';
        more.textContent = '+';
        dotsEl.appendChild(more);
      }
    }

    if (agendamentosDoDia.length > 0) {
      cell.classList.add('tem-agendamento');
      if (infoEl) infoEl.textContent = `${agendamentosDoDia.length} agendamento(s)`;
    } else {
      cell.classList.remove('tem-agendamento');
      if (infoEl) infoEl.textContent = 'Sem agendamentos';
    }

    cell.addEventListener('click', () => {
      state.selectedDate = dateStr;
      renderCalendarSemana(dateObj);
      renderDayList(dateStr);
    });

    grid.appendChild(cell);
  }
  console.log('[AGENDA] calendario semanal renderizado');
};

const renderDayTimeline = (dateStr, agendamentos = []) => {
  const agendaDay = document.getElementById('agenda-day');
  const dayTimes = document.getElementById('day-times');
  const dayGrid = document.getElementById('day-grid');
  if (!agendaDay || !dayTimes || !dayGrid) return;

  agendaDay.hidden = false;
  dayTimes.innerHTML = '';
  dayGrid.innerHTML = '';

  const baseHour = 7;
  const endHour = 20;
  const slotMinutes = 30;
  const baseMinutes = baseHour * 60;
  const slots = (endHour - baseHour) * (60 / slotMinutes);

  dayGrid.style.setProperty('--slot-height', '36px');
  dayGrid.style.gridTemplateRows = `repeat(${slots}, var(--slot-height, 36px))`;

  for (let h = baseHour; h < endHour; h += 1) {
    const timeEl = document.createElement('div');
    const slotTime = `${String(h).padStart(2, '0')}:00`;
    timeEl.className = 'day-time is-clickable';
    timeEl.textContent = slotTime;
    timeEl.tabIndex = 0;
    timeEl.setAttribute('role', 'button');
    timeEl.setAttribute('aria-label', `Novo agendamento às ${slotTime}`);
    timeEl.addEventListener('click', () => {
      openNewAppointmentForTimeSlot({ date: dateStr, time: slotTime });
    });
    timeEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openNewAppointmentForTimeSlot({ date: dateStr, time: slotTime });
      }
    });
    dayTimes.appendChild(timeEl);
  }

  for (let slotIndex = 0; slotIndex < slots; slotIndex += 1) {
    const slotStartMinutes = baseMinutes + (slotIndex * slotMinutes);
    const slotTime = minutesToTime(slotStartMinutes);
    const slotEl = document.createElement('button');
    slotEl.type = 'button';
    slotEl.className = 'day-slot';
    slotEl.style.gridColumn = '1 / -1';
    slotEl.style.gridRow = `${slotIndex + 1} / span 1`;
    slotEl.setAttribute('aria-label', `Novo agendamento às ${slotTime}`);
    slotEl.addEventListener('click', () => {
      openNewAppointmentForTimeSlot({ date: dateStr, time: slotTime });
    });
    dayGrid.appendChild(slotEl);
  }

  const list = Array.isArray(agendamentos) ? agendamentos : [];
  const placements = new Map();
  let maxColumns = 1;
  const sorted = list
    .map((appt) => {
      const startMinutes = timeToMinutes(appt.horaInicio);
      const endMinutesRaw = timeToMinutes(appt.horaFim);
      const endMinutes = endMinutesRaw !== null ? endMinutesRaw : (startMinutes !== null ? startMinutes + slotMinutes : null);
      return { appt, startMinutes, endMinutes };
    })
    .filter((item) => item.startMinutes !== null && item.endMinutes !== null)
    .sort((a, b) => (a.startMinutes - b.startMinutes) || (a.endMinutes - b.endMinutes));

  const columnEndTimes = [];
  sorted.forEach((item) => {
    const { appt, startMinutes, endMinutes } = item;
    let placed = false;
    for (let i = 0; i < columnEndTimes.length; i += 1) {
      if (startMinutes >= columnEndTimes[i]) {
        columnEndTimes[i] = endMinutes;
        placements.set(appt, i);
        placed = true;
        break;
      }
    }
    if (!placed) {
      placements.set(appt, columnEndTimes.length);
      columnEndTimes.push(endMinutes);
    }
    maxColumns = Math.max(maxColumns, columnEndTimes.length);
  });

  dayGrid.style.gridTemplateColumns = `repeat(${maxColumns}, minmax(0, 1fr))`;

  list.forEach((appt) => {
    const startMinutes = timeToMinutes(appt.horaInicio);
    const endMinutesRaw = timeToMinutes(appt.horaFim);
    if (startMinutes === null) return;
    const endMinutes = endMinutesRaw !== null ? endMinutesRaw : startMinutes + slotMinutes;
    const clampedStart = Math.max(startMinutes, baseMinutes);
    const clampedEnd = Math.max(clampedStart + slotMinutes, Math.min(endMinutes, endHour * 60));
    const rowStart = Math.floor((clampedStart - baseMinutes) / slotMinutes) + 1;
    const rowSpan = Math.max(1, Math.ceil((clampedEnd - clampedStart) / slotMinutes));

    const statusKey = getAgendaStatusKey(appt);
    const nome = appt.pacienteNome || appt.paciente || 'Paciente';
    const horario = `${appt.horaInicio || '--:--'}${appt.horaFim ? ' - ' + appt.horaFim : ''}`;
    const markerName = getMarkerName(appt);
    const markerColor = getMarkerColor(appt);

    const card = document.createElement('div');
    card.className = `day-appointment status-${statusKey}`;
    card.style.setProperty('--dentist-color', getDentistColor(appt.dentistaId));
    const colIndex = placements.has(appt) ? placements.get(appt) : 0;
    card.style.gridColumn = `${colIndex + 1} / span 1`;
    card.style.gridRow = `${rowStart} / span ${rowSpan}`;
    card.innerHTML = `
      <div class="appt-name">${nome}</div>
      <div class="appt-time">${horario}</div>
      ${markerName ? `<div class="appt-marker"><span class="marker-dot" style="background:${markerColor || '#94a3b8'}"></span>${markerName}</div>` : ''}
      <div class="appt-status">${statusText[statusKey] || statusKey}</div>
      ${buildAttendanceBadge(appt, 'appt-attendance')}
    `;
    card.addEventListener('click', (event) => {
      event.stopPropagation();
      openAgendaDrawer(appt);
    });
    dayGrid.appendChild(card);
  });
};
const renderWeekAgenda = (dateRef) => {
  const agendaWeek = document.getElementById('agenda-week');
  const agendaList = document.getElementById('agenda-list');
  const weekHeader = document.getElementById('week-header');
  const weekTimes = document.getElementById('week-times');
  const weekGrid = document.getElementById('week-grid');
  if (!agendaWeek || !weekHeader || !weekTimes || !weekGrid) return;

  if (agendaList) agendaList.style.display = 'none';
  agendaWeek.hidden = false;

  const range = getWeekStartEnd(dateRef);
  const todayStr = normalizeDateLocal(new Date());
  const baseHour = 7;
  const endHour = 20;
  const slotMinutes = 30;
  const baseMinutes = baseHour * 60;
  const slots = (endHour - baseHour) * (60 / slotMinutes);

  const dayLabel = document.getElementById('selected-day-label');
  const dateLabel = document.getElementById('selected-date-label');
  if (dayLabel) dayLabel.textContent = 'Semana';
  if (dateLabel) {
    const startLabel = range.start.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    const endLabel = range.end.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
    dateLabel.textContent = `${startLabel} - ${endLabel}`;
  }

  weekHeader.innerHTML = '';
  weekTimes.innerHTML = '';
  weekGrid.innerHTML = '';
  weekGrid.style.setProperty('--slot-height', '36px');
  weekGrid.style.gridTemplateColumns = 'repeat(7, 1fr)';
  weekGrid.style.gridTemplateRows = `repeat(${slots}, var(--slot-height, 36px))`;

  for (let i = 0; i < 7; i += 1) {
    const dateObj = new Date(range.start);
    dateObj.setDate(range.start.getDate() + i);
    const dateStr = normalizeDateLocal(dateObj);
    const weekDay = dateObj.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
    const day = dateObj.getDate();
    const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
    const headerCell = document.createElement('div');
    headerCell.className = `week-day${dateStr === todayStr ? ' today' : ''}${dateStr === state.selectedDate ? ' selected' : ''}${isWeekend ? ' weekend' : ''}`;
    headerCell.dataset.date = dateStr;
    headerCell.innerHTML = `${weekDay}<strong>${day}</strong>`;
    headerCell.addEventListener('click', () => {
      state.selectedDate = dateStr;
      renderWeekAgenda(dateObj);
      renderDayList(dateStr);
    });
    weekHeader.appendChild(headerCell);
  }

  for (let h = baseHour; h < endHour; h += 1) {
    const timeEl = document.createElement('div');
    timeEl.className = 'week-time';
    timeEl.textContent = `${String(h).padStart(2, '0')}:00`;
    weekTimes.appendChild(timeEl);
  }

  const agendamentos = filterAgendamentosByDentist(state.rangeAgendamentos || []);
  agendamentos.forEach((appt) => {
    const dateStr = normalizeDateLocal(appt.data);
    if (!dateStr) return;
    const dateObj = new Date(`${dateStr}T00:00:00`);
    if (dateObj < range.start || dateObj > range.end) return;
    const dayIndex = Math.floor((dateObj - range.start) / 86400000);
    if (dayIndex < 0 || dayIndex > 6) return;

    const startMinutes = timeToMinutes(appt.horaInicio);
    const endMinutesRaw = timeToMinutes(appt.horaFim);
    if (startMinutes === null) return;
    const endMinutes = endMinutesRaw !== null ? endMinutesRaw : startMinutes + 30;
    const clampedStart = Math.max(startMinutes, baseMinutes);
    const clampedEnd = Math.max(clampedStart + slotMinutes, Math.min(endMinutes, endHour * 60));
    const rowStart = Math.floor((clampedStart - baseMinutes) / slotMinutes) + 1;
    const rowSpan = Math.max(1, Math.ceil((clampedEnd - clampedStart) / slotMinutes));

    const statusKey = getAgendaStatusKey(appt);
    const nome = appt.pacienteNome || appt.paciente || 'Paciente';
    const horario = `${appt.horaInicio || '--:--'}${appt.horaFim ? ' - ' + appt.horaFim : ''}`;
    const markerName = getMarkerName(appt);
    const markerColor = getMarkerColor(appt);

    const card = document.createElement('div');
    card.className = `week-appointment status-${statusKey}`;
    card.style.setProperty('--dentist-color', getDentistColor(appt.dentistaId));
    card.style.gridColumn = String(dayIndex + 1);
    card.style.gridRow = `${rowStart} / span ${rowSpan}`;
    card.innerHTML = `
      <div class="appt-name">${nome}</div>
      <div class="appt-time">${horario}</div>
      ${markerName ? `<div class="appt-marker"><span class="marker-dot" style="background:${markerColor || '#94a3b8'}"></span>${markerName}</div>` : ''}
      <div class="appt-status">${statusText[statusKey] || statusKey}</div>
      ${buildAttendanceBadge(appt, 'appt-attendance')}
    `;
    card.addEventListener('click', (event) => {
      event.stopPropagation();
      openAgendaDrawer(appt);
    });
    weekGrid.appendChild(card);
  });
};
const setMonthLabel = (dateRef) => {
  const label = document.getElementById('month-label');
  if (label) label.textContent = dateRef.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
};
const setWeekLabel = (dateRef) => {
  const label = document.getElementById('month-label');
  if (!label) return;
  const range = getWeekStartEnd(dateRef);
  const startLabel = range.start.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  const endLabel = range.end.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  label.textContent = `${startLabel} - ${endLabel}`;
};

const setSubtitle = () => {
  const subtitle = document.getElementById('view-subtitle');
  if (!subtitle) return;
  subtitle.textContent = state.viewMode === 'semana' ? 'Visao rapida da semana' : 'Visao rapida do mes';
};

const updateViewButtons = () => {
  const buttons = Array.from(document.querySelectorAll('[data-view]'));
  buttons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === state.viewMode);
  });
};

const getViewRange = () => {
  if (state.viewMode === 'semana') {
    return getWeekStartEnd(toDateLocal(state.selectedDate));
  }
  return getMonthStartEnd();
};

const loadRangeData = async () => {
  const { start, end } = getViewRange();
  const startStr = normalizeDateLocal(start);
  const endStr = normalizeDateLocal(end);
  try {
    const usuario = state.usuarioLogado;
    const agendamentosBrutos = await agendaApi.getRange?.({ start: startStr, end: endStr });
    console.log('[AGENDA] dados recebidos', agendamentosBrutos);
    state.rangeAgendamentos = filtrarAgendamentosPorPerfil(agendamentosBrutos, usuario);
    if (!state.rangeAgendamentos.length) {
      const list = document.getElementById('agenda-list');
      if (list) list.innerHTML = '<div class="no-data">Nenhum agendamento encontrado para este periodo.</div>';
    }
  } catch (err) {
    console.warn('[AGENDA] erro ao carregar range', err);
    state.rangeAgendamentos = [];
  }
};

const render = async () => {
  const ref = state.viewMode === 'semana'
    ? toDateLocal(state.selectedDate)
    : getMonthStartEnd().start;
  setSubtitle();
  const agendaList = document.getElementById('agenda-list');
  const agendaWeek = document.getElementById('agenda-week');
  const agendaDay = document.getElementById('agenda-day');
  const calendarGrid = document.getElementById('calendar-grid');

  if (state.viewMode === 'semana') {
    setWeekLabel(ref);
    if (calendarGrid) calendarGrid.style.display = 'none';
    if (agendaWeek) agendaWeek.hidden = false;
    if (agendaDay) agendaDay.hidden = false;
    if (agendaList) agendaList.style.display = 'none';
    renderWeekAgenda(ref);
    await renderDayList(state.selectedDate);
    return;
  }

  if (calendarGrid) calendarGrid.style.display = '';
  if (agendaWeek) agendaWeek.hidden = true;
  if (agendaDay) agendaDay.hidden = false;
  if (agendaList) agendaList.style.display = 'none';
  setMonthLabel(ref);
  renderCalendarMes(ref.getFullYear(), ref.getMonth());
  await renderDayList(state.selectedDate);
};

const wireControls = () => {
  document.getElementById('btn-back-index')?.addEventListener('click', () => { window.location.href = 'index.html'; });
  document.getElementById('btn-today')?.addEventListener('click', () => {
    state.selectedDate = normalizeDateLocal(new Date());
    state.monthOffset = 0;
    initAgenda();
  });
  document.getElementById('nav-prev')?.addEventListener('click', () => {
    if (state.viewMode === 'semana') {
      shiftSelectedDate(-7);
    } else {
      state.monthOffset -= 1;
    }
    initAgenda();
  });
  document.getElementById('nav-next')?.addEventListener('click', () => {
    if (state.viewMode === 'semana') {
      shiftSelectedDate(7);
    } else {
      state.monthOffset += 1;
    }
    initAgenda();
  });
  const viewButtons = Array.from(document.querySelectorAll('[data-view]'));
  viewButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view || 'mes';
      if (view === state.viewMode) return;
      state.viewMode = view;
      if (state.viewMode === 'mes') {
        syncMonthOffsetToSelectedDate();
      }
      updateViewButtons();
      initAgenda();
    });
  });
  birthdayHeaderBadge?.addEventListener('click', () => {
    state.birthdayPanelDismissedDate = '';
    renderBirthdayBadgeAndPanel();
    scrollBirthdayStripIntoView();
  });
  birthdayStripClose?.addEventListener('click', () => {
    state.birthdayPanelDismissedDate = state.selectedDate;
    renderBirthdayBadgeAndPanel();
  });
  updateViewButtons();
};

const getModalRefs = () => ({
  modal: document.getElementById('modalNovoAgendamento'),
  pacienteSelect: document.getElementById('selectPaciente'),
  filtroPaciente: document.getElementById('filtroPaciente'),
  patientToggle: document.getElementById('patient-toggle'),
  patientMenu: document.getElementById('patient-menu'),
  patientList: document.getElementById('patient-list'),
  dentistaRow: document.getElementById('dentistaRow'),
  dentistaSelect: document.getElementById('selectDentista'),
  data: document.getElementById('agendamento-data'),
  horaInicio: document.getElementById('horaInicio'),
  horaFim: document.getElementById('horaFim'),
  tipo: document.getElementById('agendamento-tipo'),
  status: document.getElementById('agendamento-status'),
  marcadorSelect: document.getElementById('agendamento-marcador'),
  btnSalvar: document.getElementById('btnSalvarAgendamento'),
  btnCancelar: document.getElementById('btnCancelarAgendamento'),
  btnNovo: document.getElementById('btnNovoAgendamento'),
  tituloModal: document.getElementById('titulo-modal-agendamento'),
  statusModalBg: document.getElementById('modalStatusBg'),
  statusSelect: document.getElementById('statusNovo'),
  btnConfirmarStatus: document.getElementById('btnConfirmarStatus'),
  btnCancelarStatus: document.getElementById('btnCancelarStatus'),
});



const gerarHorarios = (intervaloMin = 15) => {
  const horarios = [];
  for (let h = 0; h < 24; h += 1) {
    for (let m = 0; m < 60; m += intervaloMin) {
      const hora = String(h).padStart(2, '0');
      const min = String(m).padStart(2, '0');
      horarios.push(`${hora}:${min}`);
    }
  }
  return horarios;
};
const loadCurrentUser = async () => {
  try {
    currentUser = await authApi.currentUser?.();
    state.usuarioLogado = currentUser;
    refreshDentistFilter();
  } catch (err) {
    console.warn('[AGENDA] nao foi possivel carregar usuario atual', err);
    currentUser = null;
    state.usuarioLogado = null;
    refreshDentistFilter();
  }
};

const carregarDentistas = async () => {
  if (currentUser?.tipo === 'dentista') return;
  try {
    const users = await authApi.listUsers?.();
    const currentClinicId = String(currentUser?.clinicId || '').trim();
    dentistasCache = (users || []).filter((u) => {
      if (String(u?.tipo || '').toLowerCase() !== 'dentista') return false;
      const dentistClinicId = String(u?.clinicId || '').trim();
      return !currentClinicId || dentistClinicId === currentClinicId;
    });
    const { dentistaSelect } = getModalRefs();
    if (dentistaSelect) {
      dentistaSelect.innerHTML = '<option value="">Selecione...</option>';
      dentistasCache.forEach((d) => {
        const opt = document.createElement('option');
        opt.value = d.id || '';
        opt.textContent = d.nome || 'Dentista';
        dentistaSelect.appendChild(opt);
      });
    }
    refreshDentistFilter();
  } catch (err) {
    console.warn('[AGENDA] nao foi possivel carregar dentistas', err);
    refreshDentistFilter();
  }
};

const renderPacientesOptions = (filtro = '') => {
  const { pacienteSelect, patientList } = getModalRefs();
  if (!patientList) return;

  const query = (filtro || '').toLowerCase();
  const queryDigits = (filtro || '').replace(/\D/g, '');

  const filtered = pacientesCache.filter((p) => {
    const nome = (p.nome || p.fullName || '').toLowerCase();
    const cpf = (p.cpf || '').replace(/\D/g, '');
    const pront = String(p.prontuario || p.id || p._id || '');
    if (!query && !queryDigits) return true;
    const matchNome = nome.includes(query);
    const matchCpf = queryDigits && cpf.includes(queryDigits);
    const matchPront = query && pront.toLowerCase().includes(query);
    const matchProntDigits = queryDigits && pront.replace(/\D/g, '').includes(queryDigits);
    return matchNome || matchCpf || matchPront || matchProntDigits;
  });

  patientList.innerHTML = '';
  if (!filtered.length) {
    patientList.innerHTML = '<div class="patient-item">Nenhum paciente encontrado.</div>';
    return;
  }

  filtered.forEach((p) => {
    const value = p.id || p.prontuario || p._id || '';
    if (!value) return;
    const nome = p.nome || p.fullName || 'Paciente';
    const cpf = p.cpf ? `CPF ${p.cpf}` : '';
    const pront = p.prontuario ? `Prontuario ${p.prontuario}` : '';
    const meta = [cpf, pront].filter(Boolean).join(' · ');
    const item = document.createElement('div');
    item.className = 'patient-item';
    if (String(pacienteSelect?.value || '') === String(value)) item.classList.add('active');
    item.dataset.value = value;
    item.dataset.nome = nome;
    item.innerHTML = `
      <div class="patient-item-name">${nome}</div>
      ${meta ? `<div class="patient-item-meta">${meta}</div>` : ''}
    `;
    item.addEventListener('click', () => {
      if (pacienteSelect) pacienteSelect.value = value;
      const { patientToggle, patientMenu, filtroPaciente } = getModalRefs();
      if (patientToggle) patientToggle.textContent = nome;
      if (filtroPaciente) filtroPaciente.value = nome;
      if (patientMenu) patientMenu.classList.add('hidden');
    });
    patientList.appendChild(item);
  });
};

const preencherPacientesSelect = async () => {
  const { filtroPaciente } = getModalRefs();
  try {
    pacientesCache = (await patientsApi.list?.()) || [];
  } catch (err) {
    console.warn('Pacientes nao carregados (permissao ou erro)', err);
    showToast('Nao foi possivel carregar pacientes agora.', 'info');
    pacientesCache = [];
  }
  renderPacientesOptions(filtroPaciente?.value || '');
  refreshDentistFilter();
};

const carregarMarcadoresAgenda = async () => {
  try {
    const data = await agendaSettingsApi.get?.();
    agendaMarkersCache = Array.isArray(data?.markers) ? data.markers : [];
  } catch (err) {
    console.warn('[AGENDA] nao foi possivel carregar marcadores', err);
    agendaMarkersCache = [];
  }
};

const renderMarcadoresSelect = (selectedId = '') => {
  const { marcadorSelect } = getModalRefs();
  if (!marcadorSelect) return;
  marcadorSelect.innerHTML = '<option value="">Selecione um marcador</option>';
  agendaMarkersCache.forEach((marker) => {
    const opt = document.createElement('option');
    opt.value = marker.id || '';
    opt.textContent = marker.nome || 'Marcador';
    if (String(selectedId) && String(selectedId) === String(marker.id)) {
      opt.selected = true;
    }
    marcadorSelect.appendChild(opt);
  });
  marcadorSelect.value = selectedId || '';
  updateMarcadorPreview(marcadorSelect);
};

const updateMarcadorPreview = (selectOrValue = '') => {
  const selectedValue = typeof selectOrValue === 'string'
    ? selectOrValue
    : String(selectOrValue?.value || '');
  const selectedText = typeof selectOrValue === 'string'
    ? ''
    : String(selectOrValue?.selectedOptions?.[0]?.textContent || '').trim();
  const marker = agendaMarkersCache.find((item) => String(item.id) === String(selectedValue));
  const previewText = selectedValue
    ? (selectedText || marker?.nome || 'Marcador selecionado')
    : 'Nenhum marcador selecionado';
  if (marcadorPreview) {
    marcadorPreview.textContent = previewText;
  }
  if (marcadorPreviewDot) {
    marcadorPreviewDot.hidden = !selectedValue;
    marcadorPreviewDot.style.background = marker?.cor || '#94a3b8';
  }
};

const clearModalFields = () => {
  const { pacienteSelect, filtroPaciente, dentistaSelect, data, horaInicio, horaFim, tipo, status, patientToggle, marcadorSelect } = getModalRefs();
  if (filtroPaciente) filtroPaciente.value = '';
  if (pacienteSelect) pacienteSelect.value = '';
  if (patientToggle) patientToggle.textContent = 'Selecione ou crie um(a) novo(a) paciente';
  if (dentistaSelect) dentistaSelect.value = '';
  if (data) data.value = state.selectedDate || '';
  if (horaInicio) horaInicio.value = '';
  if (horaFim) horaFim.value = '';
  if (tipo) tipo.value = '';
  if (status) status.value = 'em_aberto';
  if (marcadorSelect) marcadorSelect.value = '';
  updateMarcadorPreview('');
};

const resetEditState = () => {
  currentEditAgendamento = null;
};

const abrirModalNovoAgendamento = async (agendamento, options = {}) => {
  const refs = getModalRefs();
  console.log('Botao novo agendamento clicado', agendamento?.id || 'novo');
  clearModalFields();
  currentEditAgendamento = agendamento?.id || null;
  await preencherPacientesSelect();
  await carregarMarcadoresAgenda();
  await loadAgendaAvailability();
  if (currentUser?.tipo === 'dentista') {
    refs.dentistaRow?.classList.add('hidden');
  } else {
    refs.dentistaRow?.classList.remove('hidden');
    await carregarDentistas();
  }
  const marcadorId = agendamento?.marcadorId || agendamento?.marcador?.id || '';
  renderMarcadoresSelect(marcadorId);
  if (agendamento) {
    const { data, horaInicio, horaFim, tipo, status, pacienteSelect, filtroPaciente, tituloModal, dentistaSelect, patientToggle, marcadorSelect } = refs;
    if (data) data.value = agendamento.data || state.selectedDate || '';
    if (horaInicio) horaInicio.value = agendamento.horaInicio || '';
    if (horaFim) horaFim.value = agendamento.horaFim || '';
    if (tipo) tipo.value = agendamento.tipo || '';
    if (status) status.value = getAgendaStatusKey(agendamento);
    const nomePaciente = agendamento.paciente || agendamento.pacienteNome || '';
    const pacienteId = agendamento.pacienteId || agendamento.prontuario || '';
    const found = pacientesCache.find((p) =>
      String(p.id || p.prontuario || p._id || '') === String(pacienteId)
      || (nomePaciente && String(p.nome || p.fullName || '').toLowerCase() === nomePaciente.toLowerCase())
    );
    if (pacienteSelect && found) {
      pacienteSelect.value = found.id || found.prontuario || found._id || '';
      if (patientToggle) patientToggle.textContent = found.nome || found.fullName || 'Paciente';
    } else if (patientToggle && nomePaciente) {
      patientToggle.textContent = nomePaciente;
    }
    if (filtroPaciente && nomePaciente) filtroPaciente.value = nomePaciente;
    if (dentistaSelect && agendamento.dentistaId) {
      dentistaSelect.value = agendamento.dentistaId;
      if (!dentistaSelect.value && agendamento.dentistaNome) {
        const opt = document.createElement('option');
        opt.value = agendamento.dentistaId;
        opt.textContent = agendamento.dentistaNome;
        opt.selected = true;
        dentistaSelect.appendChild(opt);
      }
    }
    if (marcadorSelect && marcadorId) marcadorSelect.value = marcadorId;
    updateMarcadorPreview(marcadorSelect);
    if (tituloModal) tituloModal.textContent = 'Editar agendamento';
  } else if (refs.tituloModal) {
    refs.tituloModal.textContent = 'Novo agendamento';
    if (refs.data) refs.data.value = normalizeDateLocal(options?.defaultDate || state.selectedDate || new Date());
    if (refs.horaInicio) refs.horaInicio.value = normalizeTimeInput(options?.defaultHoraInicio) || '08:00';
    if (refs.horaFim) refs.horaFim.value = normalizeTimeInput(options?.defaultHoraFim) || addMinutesToTime(refs.horaInicio?.value || '08:00', 30) || '08:30';
    if (options?.draftContext) {
      const draftTipo = String(options.draftContext?.tipo || '').trim();
      if (refs.tipo && draftTipo) refs.tipo.value = draftTipo;
      if (refs.status && options.draftContext?.status) refs.status.value = String(options.draftContext.status || 'em_aberto');
      if (refs.dentistaSelect && currentUser?.tipo !== 'dentista' && options.draftContext?.dentistaId) {
        refs.dentistaSelect.value = String(options.draftContext.dentistaId || '');
      }
    }
    if (options?.patientContext) {
      applyPatientPrefillToModal(options.patientContext, refs);
    }
    updateMarcadorPreview('');
  }
  if (refs.modal) {
    refs.modal.classList.remove('hidden');
    console.log('Modal aberto');
  }
};

const fecharModalNovoAgendamento = () => {
  const { modal } = getModalRefs();
  if (modal) modal.classList.add('hidden');
  resetEditState();
};

const openStatusModal = (agendamento) => {
  const { statusModalBg, statusSelect } = getModalRefs();
  currentStatusAgendamentoId = agendamento?.id || null;
  if (statusSelect) statusSelect.value = getAgendaStatusKey(agendamento);
  if (statusModalBg) statusModalBg.classList.remove('hidden');
  console.log('Alterar status:', agendamento?.id, statusSelect?.value);
};

const closeStatusModal = () => {
  const { statusModalBg } = getModalRefs();
  currentStatusAgendamentoId = null;
  if (statusModalBg) statusModalBg.classList.add('hidden');
};

const wireStatusModal = () => {
  const { btnConfirmarStatus, btnCancelarStatus, statusSelect } = getModalRefs();
  btnCancelarStatus?.addEventListener('click', (e) => {
    e.preventDefault();
    closeStatusModal();
  });
  btnConfirmarStatus?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!currentStatusAgendamentoId) {
      closeStatusModal();
      return;
    }
    const novoStatus = statusSelect?.value || 'em_aberto';
    try {
      console.log('Alterar status:', currentStatusAgendamentoId, novoStatus);
      await agendaApi.update?.(currentStatusAgendamentoId, { status: novoStatus });
      closeStatusModal();
      await refreshData();
    } catch (err) {
      console.warn('[AGENDA] erro ao alterar status', err);
      showToast('Nao foi possivel alterar status.', 'error');
    }
  });
};

const wireModalNovoAgendamento = () => {
  const { btnNovo, btnCancelar, btnSalvar, pacienteSelect, filtroPaciente, dentistaSelect, data, horaInicio, horaFim, tipo, status, marcadorSelect, patientToggle, patientMenu } = getModalRefs();
  btnNovo?.addEventListener('click', async (e) => {
    e.preventDefault();
    await abrirModalNovoAgendamento();
  });
  btnCancelar?.addEventListener('click', (e) => {
    e.preventDefault();
    fecharModalNovoAgendamento();
  });
  marcadorSelect?.addEventListener('change', () => {
    updateMarcadorPreview(marcadorSelect);
  });
    btnSalvar?.addEventListener('click', async (e) => {
    e.preventDefault();
    const pacienteSelecionado = pacientesCache.find((p) => (p.id || p.prontuario || p._id || '') === (pacienteSelect?.value || ''));
    const paciente = pacienteSelecionado?.nome || pacienteSelecionado?.fullName || filtroPaciente?.value || '';
    const pacienteIdPayload = pacienteSelecionado?.id || pacienteSelecionado?.prontuario || pacienteSelecionado?._id || pacienteSelect?.value || '';
    const pacienteDentistaId = pacienteSelecionado?.dentistaId || pacienteSelecionado?.dentista_id || '';
    const usuarioPerfil = currentUser?.tipo || '';
    const dentistaIdPayload = currentUser?.tipo === 'dentista'
      ? (currentUser?.id || '')
      : (dentistaSelect?.value || '');
    const selectedDentist = currentUser?.tipo === 'dentista'
      ? { id: currentUser?.id || '', nome: currentUser?.nome || '' }
      : (dentistasCache || []).find((d) => String(d.id || '') === String(dentistaIdPayload || ''));
    const dentistaNomePayload = currentUser?.tipo === 'dentista'
      ? (currentUser?.nome || '')
      : (selectedDentist?.nome || '');

    if (
      pacienteDentistaId &&
      dentistaIdPayload &&
      pacienteDentistaId !== dentistaIdPayload &&
      (usuarioPerfil === 'admin' || usuarioPerfil === 'recepcionista')
    ) {
      const confirmar = window.confirm('Este paciente ja esta vinculado a outro dentista.\n\nDeseja continuar e agendar com o dentista selecionado?');
      if (!confirmar) return;
    }
    const id = currentEditAgendamento || crypto.randomUUID();
    const horaInicioNorm = normalizeTimeInput(horaInicio?.value);
    const horaFimNorm = normalizeTimeInput(horaFim?.value);
    if (horaInicio && horaInicioNorm) horaInicio.value = horaInicioNorm;
    if (horaFim && horaFimNorm) horaFim.value = horaFimNorm;
    const marcadorId = marcadorSelect?.value || '';
    const marcador = agendaMarkersCache.find((item) => String(item.id) === String(marcadorId));
    const payload = {
      id,
      data: data?.value || '',
      horaInicio: horaInicioNorm || '',
      horaFim: horaFimNorm || '',
      dentistaId: dentistaIdPayload,
      dentistaNome: dentistaNomePayload,
      pacienteId: pacienteIdPayload,
      prontuario: pacienteSelecionado?.prontuario || pacienteIdPayload || '',
      paciente,
      pacienteNome: paciente,
      tipo: tipo?.value || 'procedimento',
      status: status?.value || 'em_aberto',
      observacoes: '',
      marcadorId: marcador ? marcador.id : '',
      marcadorNome: marcador ? marcador.nome : '',
      marcadorCor: marcador ? marcador.cor : '',
      perfil: usuarioPerfil,
    };
    const missing = [];
    if (!payload.paciente) missing.push('paciente');
    if (!payload.data) missing.push('data');
    if (!payload.horaInicio) missing.push('hora inicio');
    if (!payload.horaFim) missing.push('hora fim');
    if (missing.length) {
      showToast(`Preencha: ${missing.join(', ')}`, 'error');
      return;
    }
    if (!payload.dentistaId) {
      showToast('Selecione o dentista responsavel.', 'error');
      return;
    }
    if (!selectedDentist && currentUser?.tipo !== 'dentista') {
      if (dentistaSelect) dentistaSelect.value = '';
      showToast('Dentista invalido para a clinica atual.', 'error');
      return;
    }
    if (!payload.pacienteId) {
      showToast('Selecione um paciente.', 'error');
      return;
    }
    const inicioMin = timeToMinutes(payload.horaInicio);
    const fimMin = timeToMinutes(payload.horaFim);
    if (inicioMin === null || fimMin === null || fimMin <= inicioMin) {
      showToast('Hora fim deve ser maior que hora inicio.', 'error');
      return;
    }
    const availabilityCheck = isWithinAvailability(payload);
    if (!availabilityCheck.ok) {
      showToast(availabilityCheck.reason || 'Fora da disponibilidade.', 'error');
      return;
    }
    try {
      console.log('[AGENDA] verificando conflitos', payload);
      const existentes = await agendaApi.getDay?.(payload.data);
      const conflito = (existentes || []).some((ag) => {
        if (String(ag.id || '') === String(id)) return false;
        if (String(ag.status || '') === 'cancelado') return false;
        if (payload.dentistaId && ag.dentistaId && String(ag.dentistaId) !== String(payload.dentistaId)) return false;
        return isOverlapping(payload.horaInicio, payload.horaFim, ag.horaInicio || '', ag.horaFim || '');
      });
      if (conflito) {
        showToast('Ja existe agendamento neste horario.', 'error');
        return;
      }
      console.log('[AGENDA] salvando agendamento', payload);
      console.log('Payload enviado para agenda-add:', payload);
      if (currentEditAgendamento) {
        console.log('Editar agendamento:', currentEditAgendamento);
        await agendaApi.update?.(currentEditAgendamento, payload);
      } else {
        const created = await agendaApi.add?.(payload);
        if (created?.__whatsapp?.attempted && created?.__whatsapp?.success === false) {
          showToast('Consulta criada, mas houve falha no envio do WhatsApp.', 'warning');
        }
      }
      showToast('Agendamento salvo com sucesso', 'success');
      if (payload.data) state.selectedDate = normalizeDateLocal(payload.data);
      await refreshData();
      fecharModalNovoAgendamento();
    } catch (err) {
      console.warn('[AGENDA] erro ao salvar agendamento', err);
      showToast(err?.message || 'Nao foi possivel salvar o agendamento.', 'error');
    }
  });
  filtroPaciente?.addEventListener('input', (e) => {
    renderPacientesOptions(e.target.value);
  });

  patientToggle?.addEventListener('click', () => {
    if (!patientMenu) return;
    const isOpen = !patientMenu.classList.contains('hidden');
    if (isOpen) {
      patientMenu.classList.add('hidden');
    } else {
      patientMenu.classList.remove('hidden');
      renderPacientesOptions(filtroPaciente?.value || '');
      filtroPaciente?.focus();
    }
  });

  document.addEventListener('click', (ev) => {
    if (!patientMenu || !patientToggle) return;
    if (patientMenu.contains(ev.target) || patientToggle.contains(ev.target)) return;
    patientMenu.classList.add('hidden');
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && patientMenu) {
      patientMenu.classList.add('hidden');
    }
  });
};

const refreshData = async () => {
  await loadRangeData();
  await render();
};

const startAgendaAutoRefresh = () => {
  if (agendaAutoRefreshTimer) clearInterval(agendaAutoRefreshTimer);
  agendaAutoRefreshTimer = setInterval(() => {
    if (document.hidden) return;
    if (currentEditAgendamento || currentStatusAgendamentoId) return;
    void refreshData().catch((err) => {
      console.warn('[AGENDA] auto refresh falhou', err);
    });
  }, AGENDA_AUTO_REFRESH_MS);
};

const initAgenda = async () => {
  console.log('[AGENDA] initAgenda executada');
  await refreshData();
  startAgendaAutoRefresh();
}

const maybeOpenFromQuery = async () => {
  const params = new URLSearchParams(window.location.search || '');
  const novo = (params.get('novo') || '').toLowerCase();
  if (novo === '1' || novo === 'true' || novo === 'agendamento') {
    const patientContext = resolveAgendaContextPatient();
    const draftContext = consumeAgendaDraftContext();
    await abrirModalNovoAgendamento(null, {
      defaultDate: state.selectedDate,
      patientContext,
      draftContext,
    });
    params.delete('novo');
    const next = params.toString();
    const url = next ? `${window.location.pathname}?${next}` : window.location.pathname;
    window.history.replaceState({}, '', url);
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  await loadCurrentUser();
  await carregarDentistas();
  wireControls();
  wireModalNovoAgendamento();
  wireStatusModal();
  await preencherPacientesSelect();
  await initAgenda();
  await maybeOpenFromQuery();
  await openAgendaTargetFromNotification();
});

window.addEventListener('beforeunload', () => {
  if (agendaAutoRefreshTimer) clearInterval(agendaAutoRefreshTimer);
});


































