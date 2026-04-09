const cleanText = (value) => String(value || '').trim();
const normalizePhone = (value) => String(value || '').replace(/\D/g, '');

const toDate = (value) => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toIso = (value) => {
  const parsed = toDate(value);
  return parsed ? parsed.toISOString() : '';
};

const toDateOnly = (value) => {
  const parsed = toDate(value);
  return parsed ? parsed.toISOString().slice(0, 10) : '';
};

const isCleaningProcedure = (procedure = {}) => {
  const text = `${cleanText(procedure?.name)} ${cleanText(procedure?.procedureCode)}`.toLowerCase();
  return text.includes('limpeza') || text.includes('profilaxia');
};

const isAppointmentAttended = (appointment = {}) => {
  const status = cleanText(appointment?.status).toUpperCase();
  const attendanceStatus = cleanText(appointment?.attendanceStatus).toUpperCase();
  return attendanceStatus === 'ATTENDED' || status === 'CONCLUIDO';
};

const isAppointmentMissed = (appointment = {}) => {
  const status = cleanText(appointment?.status).toUpperCase();
  const attendanceStatus = cleanText(appointment?.attendanceStatus).toUpperCase();
  return attendanceStatus === 'NO_SHOW' || status === 'NAO_COMPARECEU';
};

const isAppointmentCancelled = (appointment = {}) => {
  const status = cleanText(appointment?.status).toUpperCase();
  return status === 'CANCELADO' || status === 'REMARCAR';
};

const isAppointmentOpenFuture = (appointment = {}, now = new Date()) => {
  const status = cleanText(appointment?.status).toUpperCase();
  const stamp = toDate(appointment?.dataHora || appointment?.createdAt);
  if (!stamp || stamp.getTime() < now.getTime()) return false;
  return ['AGENDADO', 'CONFIRMADO'].includes(status);
};

const isPlanActive = (plan = {}) => cleanText(plan?.status).toUpperCase() !== 'CANCELED';

const hasOverdueInstallment = (account = {}, { planOnly = false, todayIso = '' } = {}) => {
  const isPlan = cleanText(account?.source).toLowerCase() === 'plano'
    || cleanText(account?.category).toLowerCase() === 'planos';
  if (planOnly && !isPlan) return false;
  return (Array.isArray(account?.installments) ? account.installments : []).some((installment) => {
    const status = cleanText(installment?.status).toUpperCase();
    const dueDate = toDateOnly(installment?.dueDate);
    return status === 'PENDING' && !!dueDate && dueDate < todayIso;
  });
};

const buildBadge = (code, label, tone = 'neutral') => ({ code, label, tone });

const pushBadge = (badges = [], badge = null) => {
  if (!badge || !badge.code) return;
  if (badges.some((item) => item.code === badge.code)) return;
  badges.push(badge);
};

const buildSuggestionForSegment = ({ segmentKey, signal }) => {
  if (segmentKey === 'inactive_180') {
    return {
      code: 'INACTIVE_180',
      label: '180 dias sem retorno',
      explanation: signal.lastMeaningfulAppointmentAt
        ? `Ultimo atendimento em ${toDateOnly(signal.lastMeaningfulAppointmentAt)}.`
        : 'Sem atendimento registrado e sem agenda futura.',
    };
  }
  if (segmentKey === 'inactive_90') {
    return {
      code: 'INACTIVE_90',
      label: '90 dias sem retorno',
      explanation: signal.lastMeaningfulAppointmentAt
        ? `Ultimo atendimento em ${toDateOnly(signal.lastMeaningfulAppointmentAt)}.`
        : 'Sem atendimento recente e sem agenda futura.',
    };
  }
  if (segmentKey === 'never_cleaning') {
    return {
      code: 'WITHOUT_CLEANING',
      label: 'Sem limpeza registrada',
      explanation: 'Nao ha limpeza ou profilaxia registrada no historico clinico.',
    };
  }
  if (segmentKey === 'birthday_month') {
    return {
      code: 'BIRTHDAY_MONTH',
      label: 'Aniversariante do mes',
      explanation: 'Paciente aniversariante no mes atual.',
    };
  }
  if (segmentKey === 'appointment_window') {
    return {
      code: 'APPOINTMENT_WINDOW',
      label: 'Janela de agenda',
      explanation: 'Paciente com consulta dentro da janela selecionada.',
    };
  }
  if (segmentKey === 'missed_followup') {
    if (signal.lastMissedAppointmentAt) {
      return {
        code: 'MISSED_FOLLOWUP',
        label: 'Faltou e nao reagendou',
        explanation: 'Paciente faltou e nao possui novo agendamento apos a falta.',
      };
    }
    return {
      code: 'CANCELED_NO_REBOOK',
      label: 'Desmarcou e nao reagendou',
      explanation: 'Paciente cancelou/desmarcou e nao possui novo agendamento.',
    };
  }
  if (segmentKey === 'with_plan') {
    return {
      code: 'WITH_PLAN',
      label: 'Plano ativo',
      explanation: 'Paciente possui plano ativo na clinica.',
    };
  }
  if (segmentKey === 'financial_pending' || segmentKey === 'plan_overdue') {
    return {
      code: 'FINANCIAL_PENDING',
      label: 'Financeiro pendente',
      explanation: 'Paciente possui pendencia financeira elegivel para contato.',
    };
  }
  return {
    code: 'ACTIVE_RELATIONSHIP',
    label: 'Paciente elegivel para contato',
    explanation: 'Paciente dentro da audiencia sugerida.',
  };
};

const buildSignalFromPatient = ({
  patient,
  appointments = [],
  procedures = [],
  accounts = [],
  plans = [],
  now = new Date(),
  filters = {},
}) => {
  const sortedAppointmentsDesc = [...appointments].sort((a, b) => {
    const aTime = toDate(a?.dataHora || a?.createdAt)?.getTime() || 0;
    const bTime = toDate(b?.dataHora || b?.createdAt)?.getTime() || 0;
    return bTime - aTime;
  });
  const sortedAppointmentsAsc = [...sortedAppointmentsDesc].reverse();
  const sortedProceduresDesc = [...procedures].sort((a, b) => {
    const aTime = toDate(a?.performedAt || a?.createdAt)?.getTime() || 0;
    const bTime = toDate(b?.performedAt || b?.createdAt)?.getTime() || 0;
    return bTime - aTime;
  });

  const latestAppointment = sortedAppointmentsDesc[0] || null;
  const lastAttendedAppointment = sortedAppointmentsDesc.find((item) => isAppointmentAttended(item)) || null;
  const lastMissedAppointment = sortedAppointmentsDesc.find((item) => isAppointmentMissed(item)) || null;
  const lastCancelledAppointment = sortedAppointmentsDesc.find((item) => isAppointmentCancelled(item)) || null;
  const nextAppointment = sortedAppointmentsAsc.find((item) => isAppointmentOpenFuture(item, now)) || null;
  const latestFollowupIssueAt = toDate(lastMissedAppointment?.dataHora || lastCancelledAppointment?.dataHora);

  const hasFollowupAfterIssue = latestFollowupIssueAt
    ? sortedAppointmentsAsc.some((item) => {
        const stamp = toDate(item?.dataHora || item?.createdAt);
        if (!stamp || stamp.getTime() <= latestFollowupIssueAt.getTime()) return false;
        return !isAppointmentMissed(item) && !isAppointmentCancelled(item);
      })
    : false;

  const lastCleaningProcedure = sortedProceduresDesc.find((item) => isCleaningProcedure(item)) || null;
  const createdAt = toDate(patient?.createdAt);
  const lastMeaningfulAppointmentAt = toDate(lastAttendedAppointment?.dataHora || lastAttendedAppointment?.createdAt);
  const latestAppointmentAt = toDate(latestAppointment?.dataHora || latestAppointment?.createdAt);
  const lastRelationshipAt = lastMeaningfulAppointmentAt || latestAppointmentAt || createdAt;
  const ninetyDaysAgo = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));
  const oneEightyDaysAgo = new Date(now.getTime() - (180 * 24 * 60 * 60 * 1000));
  const todayIso = toDateOnly(now);
  const activePlans = plans.filter((item) => isPlanActive(item));
  const financialPending = accounts.some((item) => hasOverdueInstallment(item, { todayIso }));
  const planOverdue = accounts.some((item) => hasOverdueInstallment(item, { todayIso, planOnly: true }));
  const birthDateOnly = toDateOnly(patient?.dataNascimento);
  const birthMonth = Number(String(birthDateOnly).split('-')[1] || 0);
  const currentMonth = Math.max(1, Math.min(12, Number(filters?.month) || (now.getMonth() + 1)));

  const windowFrom = toDate(filters?.dateFrom || filters?.from);
  const windowTo = toDate(filters?.dateTo || filters?.to);
  const dentistId = cleanText(filters?.dentistId);
  const dentistName = cleanText(filters?.dentistName).toLowerCase();
  const appointmentWindow = sortedAppointmentsDesc.some((item) => {
    const stamp = toDate(item?.dataHora || item?.createdAt);
    if (!stamp) return false;
    if (windowFrom && stamp.getTime() < windowFrom.getTime()) return false;
    if (windowTo && stamp.getTime() > windowTo.getTime()) return false;
    if (dentistId && cleanText(item?.profissionalId) !== dentistId) return false;
    if (dentistName && cleanText(item?.profissionalNome).toLowerCase() !== dentistName) return false;
    return true;
  });

  const inactive90 = !nextAppointment && !!lastRelationshipAt && lastRelationshipAt.getTime() < ninetyDaysAgo.getTime();
  const inactive180 = !nextAppointment && !!lastRelationshipAt && lastRelationshipAt.getTime() < oneEightyDaysAgo.getTime();
  const birthdayMonth = birthMonth === currentMonth;
  const missedFollowup = !!latestFollowupIssueAt && !hasFollowupAfterIssue;

  return {
    latestAppointmentAt: toIso(latestAppointment?.dataHora || latestAppointment?.createdAt),
    lastMeaningfulAppointmentAt: toIso(lastMeaningfulAppointmentAt),
    lastMissedAppointmentAt: toIso(lastMissedAppointment?.dataHora || lastMissedAppointment?.createdAt),
    lastCancelledAppointmentAt: toIso(lastCancelledAppointment?.dataHora || lastCancelledAppointment?.createdAt),
    nextAppointmentAt: toIso(nextAppointment?.dataHora || nextAppointment?.createdAt),
    lastCleaningAt: toIso(lastCleaningProcedure?.performedAt || lastCleaningProcedure?.createdAt),
    responsibleDentistName: cleanText(
      lastAttendedAppointment?.profissionalNome
      || latestAppointment?.profissionalNome
      || lastCleaningProcedure?.dentistName,
    ),
    withPlan: activePlans.length > 0,
    financialPending,
    planOverdue,
    birthdayMonth,
    appointmentWindow,
    inactive90,
    inactive180,
    inactive: inactive90 || inactive180,
    missed: !!lastMissedAppointment,
    cancelled: !!lastCancelledAppointment,
    missedFollowup,
    withoutCleaning: !lastCleaningProcedure,
    withoutReturn: !nextAppointment,
  };
};

const matchesSegment = ({ segmentKey, signal }) => {
  if (segmentKey === 'all_active' || segmentKey === 'patients_active' || segmentKey === 'messaging_consent') return true;
  if (segmentKey === 'inactive_90') return signal.inactive90;
  if (segmentKey === 'inactive_180') return signal.inactive180;
  if (segmentKey === 'never_cleaning') return signal.withoutCleaning;
  if (segmentKey === 'birthday_month') return signal.birthdayMonth;
  if (segmentKey === 'appointment_window' || segmentKey === 'by_dentist') return signal.appointmentWindow;
  if (segmentKey === 'missed_followup') return signal.missedFollowup;
  if (segmentKey === 'with_plan') return signal.withPlan;
  if (segmentKey === 'financial_pending') return signal.financialPending;
  if (segmentKey === 'plan_overdue') return signal.planOverdue;
  return false;
};

const buildMemberBadges = ({ segmentKey, signal }) => {
  const badges = [];
  if (signal.inactive180) pushBadge(badges, buildBadge('INACTIVE_180', '180 dias sem retorno', 'warning'));
  else if (signal.inactive90) pushBadge(badges, buildBadge('INACTIVE_90', '90 dias sem retorno', 'warning'));
  if (signal.missedFollowup && signal.lastMissedAppointmentAt) pushBadge(badges, buildBadge('MISSED_FOLLOWUP', 'Faltou e nao reagendou', 'danger'));
  if (signal.missedFollowup && signal.lastCancelledAppointmentAt && !signal.lastMissedAppointmentAt) pushBadge(badges, buildBadge('CANCELED_NO_REBOOK', 'Desmarcou e nao reagendou', 'danger'));
  if (signal.withoutCleaning) pushBadge(badges, buildBadge('WITHOUT_CLEANING', 'Sem limpeza', 'info'));
  if (signal.withPlan) pushBadge(badges, buildBadge('WITH_PLAN', 'Com plano', 'neutral'));
  if (signal.financialPending && (segmentKey === 'financial_pending' || segmentKey === 'plan_overdue')) {
    pushBadge(badges, buildBadge('FINANCIAL_PENDING', 'Financeiro pendente', 'danger'));
  }
  if (signal.birthdayMonth) pushBadge(badges, buildBadge('BIRTHDAY_MONTH', 'Aniversario no mes', 'success'));
  if (signal.nextAppointmentAt) pushBadge(badges, buildBadge('NEXT_APPOINTMENT', 'Ja possui agenda futura', 'neutral'));
  return badges;
};

const summarizeReasons = (members = []) => {
  const counts = new Map();
  members.forEach((item) => {
    const key = cleanText(item?.reasonCode || item?.suggestionReasonCode || 'UNKNOWN') || 'UNKNOWN';
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return Array.from(counts.entries()).map(([reasonCode, total]) => ({ reasonCode, total }));
};

const buildQuickFilterCounts = (members = []) => ({
  all: members.length,
  selected: members.filter((item) => item.included).length,
  inactive: members.filter((item) => item.flags?.inactive).length,
  missed: members.filter((item) => item.flags?.missedFollowup).length,
  withoutCleaning: members.filter((item) => item.flags?.withoutCleaning).length,
  blocked: members.filter((item) => item.status === 'BLOCKED').length,
});

const resolveAudiencePreviewData = ({
  patients = [],
  appointments = [],
  procedures = [],
  accounts = [],
  plans = [],
  segmentKey = 'all_active',
  filters = {},
  actorName = '',
  campaignId = '',
  templateId = '',
  templateTitle = '',
  now = new Date(),
}) => {
  const normalizedSegmentKey = cleanText(segmentKey).toLowerCase() || 'all_active';
  const patientMap = new Map((Array.isArray(patients) ? patients : []).map((item) => [cleanText(item.id), item]));
  const appointmentMap = new Map();
  const procedureMap = new Map();
  const accountMap = new Map();
  const planMap = new Map();

  (Array.isArray(appointments) ? appointments : []).forEach((item) => {
    const patientId = cleanText(item?.patientId);
    if (!patientId || !patientMap.has(patientId)) return;
    const list = appointmentMap.get(patientId) || [];
    list.push(item);
    appointmentMap.set(patientId, list);
  });

  (Array.isArray(procedures) ? procedures : []).forEach((item) => {
    const patientId = cleanText(item?.patientId);
    if (!patientId || !patientMap.has(patientId)) return;
    const list = procedureMap.get(patientId) || [];
    list.push(item);
    procedureMap.set(patientId, list);
  });

  (Array.isArray(accounts) ? accounts : []).forEach((item) => {
    const patientId = cleanText(item?.patientId);
    if (!patientId || !patientMap.has(patientId)) return;
    const list = accountMap.get(patientId) || [];
    list.push(item);
    accountMap.set(patientId, list);
  });

  (Array.isArray(plans) ? plans : []).forEach((item) => {
    const patientId = cleanText(item?.patientId);
    if (!patientId || !patientMap.has(patientId)) return;
    const list = planMap.get(patientId) || [];
    list.push(item);
    planMap.set(patientId, list);
  });

  const members = [];

  patientMap.forEach((patient, patientId) => {
    const signal = buildSignalFromPatient({
      patient,
      appointments: appointmentMap.get(patientId) || [],
      procedures: procedureMap.get(patientId) || [],
      accounts: accountMap.get(patientId) || [],
      plans: planMap.get(patientId) || [],
      now,
      filters,
    });
    if (!matchesSegment({ segmentKey: normalizedSegmentKey, signal })) return;

    const phone = normalizePhone(patient?.telefone);
    const allowsMessages = patient?.allowsMessages !== false;
    let included = true;
    let reasonCode = '';
    let reasonLabel = '';

    if (!allowsMessages) {
      included = false;
      reasonCode = 'NO_CONSENT';
      reasonLabel = 'Paciente sem consentimento para mensagens.';
    } else if (phone.length < 10) {
      included = false;
      reasonCode = 'NO_PHONE';
      reasonLabel = 'Paciente sem telefone valido para envio.';
    }

    const suggestion = buildSuggestionForSegment({ segmentKey: normalizedSegmentKey, signal });

    members.push({
      patientId,
      patientName: cleanText(patient?.nome),
      phone,
      phoneEligible: phone.length >= 10,
      allowsMessages,
      included,
      status: included ? 'INCLUDED' : 'BLOCKED',
      reasonCode,
      reasonLabel,
      suggestionReasonCode: suggestion.code,
      suggestionReasonLabel: suggestion.label,
      suggestionExplanation: suggestion.explanation,
      lastAppointmentAt: signal.latestAppointmentAt,
      lastAttendanceAt: signal.lastMeaningfulAppointmentAt,
      nextAppointmentAt: signal.nextAppointmentAt,
      lastCleaningAt: signal.lastCleaningAt,
      responsibleDentistName: signal.responsibleDentistName,
      flags: {
        inactive: signal.inactive,
        inactive90: signal.inactive90,
        inactive180: signal.inactive180,
        missed: signal.missed,
        missedFollowup: signal.missedFollowup,
        withoutCleaning: signal.withoutCleaning,
        withoutReturn: signal.withoutReturn,
        cancelled: signal.cancelled,
        withPlan: signal.withPlan,
        financialPending: signal.financialPending,
        birthdayMonth: signal.birthdayMonth,
        appointmentWindow: signal.appointmentWindow,
      },
      badges: buildMemberBadges({ segmentKey: normalizedSegmentKey, signal }),
      metadata: {
        segmentKey: normalizedSegmentKey,
        resolvedAt: now.toISOString(),
        actorName: cleanText(actorName),
        campaignId: cleanText(campaignId),
        templateId: cleanText(templateId),
        templateTitle: cleanText(templateTitle),
      },
    });
  });

  members.sort((a, b) => {
    if (a.included !== b.included) return a.included ? -1 : 1;
    const aTime = toDate(a.lastAttendanceAt || a.lastAppointmentAt)?.getTime() || 0;
    const bTime = toDate(b.lastAttendanceAt || b.lastAppointmentAt)?.getTime() || 0;
    return aTime - bTime;
  });

  const includedCount = members.filter((item) => item.included).length;
  const blockedCount = members.length - includedCount;

  return {
    segmentKey: normalizedSegmentKey,
    unavailable: false,
    total: members.length,
    includedCount,
    blockedCount,
    patientIds: members.filter((item) => item.included).map((item) => item.patientId),
    members,
    summary: {
      blockedReasons: summarizeReasons(members.filter((item) => item.status === 'BLOCKED')),
      suggestionReasons: summarizeReasons(members),
      quickFilters: buildQuickFilterCounts(members),
    },
  };
};

module.exports = {
  resolveAudiencePreviewData,
};
