const { patientService } = require('./patientService');
const { appointmentService } = require('./appointmentService');
const { campaignService } = require('./campaignService');
const { financialService } = require('./financialService');
const { planMessageService } = require('./planMessageService');
const { clinicService } = require('./clinicService');

const MAX_BIRTHDAY_ITEMS = 8;
const MAX_PLAN_ITEMS = 8;
const MAX_CAMPAIGN_LOGS = 10;

const cleanText = (value) => String(value || '').trim();
const roundMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const toDateOnly = (value) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateOnly = (value) => {
  const raw = cleanText(value);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + Number(days || 0));
  return next;
};

const diffDays = (left, right) => {
  const leftDate = parseDateOnly(left);
  const rightDate = parseDateOnly(right);
  if (!leftDate || !rightDate) return Number.POSITIVE_INFINITY;
  return Math.round((leftDate.getTime() - rightDate.getTime()) / 86400000);
};

const isBirthdayOnDate = (birthDate, dateIso) => {
  const birth = parseDateOnly(birthDate);
  const reference = parseDateOnly(dateIso);
  if (!birth || !reference) return false;
  return birth.getMonth() === reference.getMonth() && birth.getDate() === reference.getDate();
};

const normalizePhone = (value) => cleanText(value).replace(/\D/g, '');

const buildPatientName = (patient = {}) => (
  cleanText(patient?.nome)
  || cleanText(patient?.fullName)
  || cleanText(patient?.patientName)
  || 'Paciente'
);

const buildBirthdayItems = ({ patients = [], appointments = [], dateIso }) => {
  const year = Number(String(dateIso || '').slice(0, 4) || 0);
  const appointmentNameSet = new Set(
    (Array.isArray(appointments) ? appointments : [])
      .map((item) => cleanText(item?.paciente || item?.pacienteNome || item?.patientName).toLowerCase())
      .filter(Boolean),
  );
  const appointmentPatientSet = new Set(
    (Array.isArray(appointments) ? appointments : [])
      .map((item) => cleanText(item?.patientId || item?.pacienteId || item?.prontuario))
      .filter(Boolean),
  );

  return (Array.isArray(patients) ? patients : [])
    .filter((patient) => isBirthdayOnDate(patient?.dataNascimento || patient?.birthDate, dateIso))
    .map((patient) => {
      const patientId = cleanText(patient?.id || patient?.prontuario || patient?._id);
      const patientName = buildPatientName(patient);
      const lastBirthdayMessageAt = cleanText(patient?.lastBirthdayMessageAt);
      const birthdaySentYear = Number(patient?.birthdayMessageYear || 0) === year;
      return {
        patientId,
        patientName,
        phone: cleanText(patient?.telefone || patient?.celular || patient?.whatsapp),
        allowsMessages: patient?.allowsMessages !== false,
        birthDate: cleanText(patient?.dataNascimento || patient?.birthDate),
        hasAppointment: appointmentPatientSet.has(patientId) || appointmentNameSet.has(patientName.toLowerCase()),
        birthdaySentYear,
        birthdaySentToday: birthdaySentYear && lastBirthdayMessageAt.startsWith(dateIso),
      };
    })
    .sort((left, right) => cleanText(left.patientName).localeCompare(cleanText(right.patientName), 'pt-BR'));
};

const derivePlanAttentionItems = (plans = [], dateIso, dueSoonDays) => (
  (Array.isArray(plans) ? plans : []).flatMap((plan) => {
    const schedule = Array.isArray(plan?.payment?.schedule) ? plan.payment.schedule : [];
    return schedule.map((parcel) => {
      const status = cleanText(parcel?.status).toUpperCase();
      const dueDate = cleanText(parcel?.dueDate);
      const remainingAmount = roundMoney(parcel?.remainingAmount ?? parcel?.value ?? 0);
      if (!dueDate || remainingAmount <= 0 || ['PAID', 'CANCELLED'].includes(status)) return null;

      let eventType = '';
      if (status === 'OVERDUE' || diffDays(dueDate, dateIso) < 0) {
        eventType = 'PLAN_INSTALLMENT_OVERDUE';
      } else if (diffDays(dueDate, dateIso) === 0) {
        eventType = 'PLAN_INSTALLMENT_DUE_TODAY';
      } else if (diffDays(dueDate, dateIso) <= Math.max(1, Number(dueSoonDays) || 3)) {
        eventType = 'PLAN_INSTALLMENT_DUE_SOON';
      }
      if (!eventType) return null;

      return {
        planId: cleanText(plan?.planId || plan?.id),
        planTitle: cleanText(plan?.title || plan?.name) || 'Plano',
        patientId: cleanText(plan?.patientId || plan?.prontuario),
        patientName: cleanText(plan?.patientName) || 'Paciente',
        installmentId: cleanText(parcel?.parcelId || parcel?.id),
        installmentSequence: Number(parcel?.number || parcel?.sequence || 1) || 1,
        installmentsCount: Math.max(1, Number(plan?.installmentsCount || schedule.length || 1) || 1),
        dueDate,
        amount: roundMoney(parcel?.value ?? 0),
        remainingAmount,
        eventType,
        rawStatus: status,
      };
    }).filter(Boolean);
  })
).sort((left, right) => {
  const priority = {
    PLAN_INSTALLMENT_OVERDUE: 0,
    PLAN_INSTALLMENT_DUE_TODAY: 1,
    PLAN_INSTALLMENT_DUE_SOON: 2,
  };
  const leftPriority = priority[left.eventType] ?? 99;
  const rightPriority = priority[right.eventType] ?? 99;
  if (leftPriority !== rightPriority) return leftPriority - rightPriority;
  return cleanText(left.dueDate).localeCompare(cleanText(right.dueDate));
});

const loadPlanHistoryPreview = async ({ clinicId, items = [] }) => {
  const uniquePlanIds = [...new Set(items.map((item) => cleanText(item.planId)).filter(Boolean))];
  const historyByPlan = new Map();
  await Promise.all(uniquePlanIds.map(async (planId) => {
    try {
      const payload = await planMessageService.listHistory({ clinicId, planId });
      historyByPlan.set(planId, Array.isArray(payload?.items) ? payload.items : []);
    } catch (_) {
      historyByPlan.set(planId, []);
    }
  }));

  return items.map((item) => {
    const history = historyByPlan.get(cleanText(item.planId)) || [];
    const latest = history
      .filter((entry) => cleanText(entry?.installmentId) === cleanText(item.installmentId))
      .sort((left, right) => new Date(right?.lastAttemptAt || right?.createdAt || 0).getTime() - new Date(left?.lastAttemptAt || left?.createdAt || 0).getTime())[0] || null;
    return {
      ...item,
      latestHistory: latest ? {
        id: cleanText(latest.id),
        status: cleanText(latest.status),
        eventType: cleanText(latest.eventType),
        attemptCount: Number(latest.attemptCount || 0),
        sentAt: latest.sentAt || null,
        lastAttemptAt: latest.lastAttemptAt || null,
        lastError: cleanText(latest.lastError),
      } : null,
    };
  });
};

const relationshipService = {
  getOverview: async ({ clinicId, date, dueSoonDays = 3 } = {}) => {
    const normalizedClinicId = cleanText(clinicId);
    const dateIso = toDateOnly(date || new Date());
    const dueSoon = Math.max(1, Number(dueSoonDays) || 3);
    const thirtyDaysAgo = toDateOnly(addDays(parseDateOnly(dateIso) || new Date(), -30));
    const thirtyDaysAhead = toDateOnly(addDays(parseDateOnly(dateIso) || new Date(), 30));

    const [operationalSettings, patients, appointmentsRange, appointmentsDay, campaignsDashboard, campaignLogs, plansDashboard, plans] = await Promise.all([
      clinicService.getOperationalSettings({ clinicId: normalizedClinicId }).catch(() => ({})),
      patientService.listByClinic(normalizedClinicId).catch(() => []),
      appointmentService.listAppointments({ clinicId: normalizedClinicId, from: thirtyDaysAgo, to: thirtyDaysAhead }).catch(() => []),
      appointmentService.listAppointments({ clinicId: normalizedClinicId, from: dateIso, to: dateIso }).catch(() => []),
      campaignService.getDashboard({ clinicId: normalizedClinicId }).catch(() => ({})),
      campaignService.listDispatchLogs({ clinicId: normalizedClinicId, dateFrom: dateIso, dateTo: dateIso, page: 1, limit: MAX_CAMPAIGN_LOGS }).catch(() => ({ items: [] })),
      financialService.getFinancialDashboard({ clinicId: normalizedClinicId }).catch(() => ({})),
      financialService.listPatientPlans({ clinicId: normalizedClinicId }).catch(() => []),
    ]);

    const birthdayItems = buildBirthdayItems({
      patients,
      appointments: appointmentsDay,
      dateIso,
    });
    const planAttention = derivePlanAttentionItems(plans, dateIso, dueSoon);
    const planAttentionPreview = await loadPlanHistoryPreview({
      clinicId: normalizedClinicId,
      items: planAttention.slice(0, MAX_PLAN_ITEMS),
    });

    const appointments = Array.isArray(appointmentsRange) ? appointmentsRange : [];
    const faltas = appointments.filter((item) => cleanText(item?.status).toLowerCase() === 'nao_compareceu');
    const desmarcados = appointments.filter((item) => item?.desmarcado === true);
    const openAgenda = appointments.filter((item) => !item?.desmarcado && ['em_aberto', 'confirmado'].includes(cleanText(item?.status).toLowerCase()));

    return {
      source: 'central',
      clinicId: normalizedClinicId,
      date: dateIso,
      dueSoonDays: dueSoon,
      birthdays: {
        enabled: operationalSettings?.birthdayMessaging?.enabled !== false,
        total: birthdayItems.length,
        pending: birthdayItems.filter((item) => item.birthdaySentYear !== true).length,
        sentYear: birthdayItems.filter((item) => item.birthdaySentYear === true).length,
        withAppointment: birthdayItems.filter((item) => item.hasAppointment === true).length,
        items: birthdayItems.slice(0, MAX_BIRTHDAY_ITEMS),
      },
      campaigns: {
        dashboard: campaignsDashboard || {},
        logs: Array.isArray(campaignLogs?.items) ? campaignLogs.items : [],
      },
      plans: {
        dashboard: plansDashboard || {},
        attention: planAttentionPreview,
        counts: {
          totalAttention: planAttention.length,
          overdue: planAttention.filter((item) => item.eventType === 'PLAN_INSTALLMENT_OVERDUE').length,
          dueToday: planAttention.filter((item) => item.eventType === 'PLAN_INSTALLMENT_DUE_TODAY').length,
          dueSoon: planAttention.filter((item) => item.eventType === 'PLAN_INSTALLMENT_DUE_SOON').length,
        },
      },
      agendaRecovery: {
        openCount: openAgenda.length,
        faltasCount: faltas.length,
        desmarcadosCount: desmarcados.length,
      },
    };
  },
};

module.exports = { relationshipService };
