const { appointmentRepository } = require('../repositories/appointmentRepository');
const { clinicRepository } = require('../repositories/clinicRepository');
const { outboundMessageRepository } = require('../repositories/outboundMessageRepository');
const { outboundMessageService } = require('./outboundMessageService');

const DEFAULT_TIMEZONE = 'America/Sao_Paulo';
const REMINDER_ELIGIBLE_STATUSES = new Set(['AGENDADO', 'CONFIRMADO']);

const formatDateKeyInTimeZone = (value, timeZone = DEFAULT_TIMEZONE) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
};

const getTomorrowDateKey = (timeZone = DEFAULT_TIMEZONE, now = new Date()) => {
  const probe = new Date(now.getTime() + (24 * 60 * 60 * 1000));
  return formatDateKeyInTimeZone(probe, timeZone);
};

const getCurrentDateKey = (timeZone = DEFAULT_TIMEZONE, now = new Date()) => formatDateKeyInTimeZone(now, timeZone);

const parseShortOffsetToMinutes = (value) => {
  const match = String(value || '').match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/i);
  if (!match) return 0;
  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * ((hours * 60) + minutes);
};

const getTimeZoneOffsetMinutes = (date, timeZone = DEFAULT_TIMEZONE) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const offsetPart = parts.find((part) => part.type === 'timeZoneName')?.value || 'GMT+0';
  return parseShortOffsetToMinutes(offsetPart);
};

const getLocalDayWindowUtc = (dateKey, timeZone = DEFAULT_TIMEZONE) => {
  const [year, month, day] = String(dateKey || '').split('-').map((value) => Number(value));
  const probe = new Date(Date.UTC(year, (month || 1) - 1, day || 1, 12, 0, 0, 0));
  const offsetMinutes = getTimeZoneOffsetMinutes(probe, timeZone);
  const start = new Date(Date.UTC(year, (month || 1) - 1, day || 1, 0, 0, 0, 0) - (offsetMinutes * 60 * 1000));
  const end = new Date(start.getTime() + (24 * 60 * 60 * 1000) - 1);
  return { start, end };
};

const isEligibleReminderAppointment = (appointment, targetDateKey, timeZone = DEFAULT_TIMEZONE) => {
  const status = String(appointment?.status || '').trim().toUpperCase();
  if (!REMINDER_ELIGIBLE_STATUSES.has(status)) return false;
  const dateKey = formatDateKeyInTimeZone(appointment?.dataHora, timeZone);
  return dateKey === targetDateKey;
};

const appointmentReminderService = {
  runDayBeforeReminderJob: async ({ clinicId, targetDate, timeZone = DEFAULT_TIMEZONE, now = new Date() } = {}) => {
    const targetDateKey = String(targetDate || getTomorrowDateKey(timeZone)).trim();
    const { start, end } = getLocalDayWindowUtc(targetDateKey, timeZone);
    const appointments = await appointmentRepository.listByClinic({
      clinicId,
      from: start,
      to: end,
    });

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    const reminderDateKey = getCurrentDateKey(timeZone, now);
    const { start: dedupeStart, end: dedupeEnd } = getLocalDayWindowUtc(reminderDateKey, timeZone);

    for (const appointment of appointments) {
      if (!isEligibleReminderAppointment(appointment, targetDateKey, timeZone)) {
        skipped += 1;
        continue;
      }

      const existing = await outboundMessageRepository.listReminderMessagesForAppointmentDay({
        clinicId,
        appointmentId: appointment.id,
        start: dedupeStart,
        end: dedupeEnd,
      });

      if (existing.length) {
        skipped += 1;
        continue;
      }

      try {
        await outboundMessageService.sendAppointmentReminder({
          clinicId,
          appointmentId: appointment.id,
        });
        sent += 1;
      } catch (_error) {
        failed += 1;
      }
    }

    return {
      clinicId,
      targetDate: targetDateKey,
      timeZone,
      total: appointments.length,
      sent,
      skipped,
      failed,
    };
  },

  runAcrossClinics: async ({ clinicId, targetDate, timeZone = DEFAULT_TIMEZONE } = {}) => {
    if (clinicId) {
      return [await appointmentReminderService.runDayBeforeReminderJob({ clinicId, targetDate, timeZone })];
    }

    const clinics = await clinicRepository.list();
    const results = [];
    for (const clinic of clinics) {
      results.push(await appointmentReminderService.runDayBeforeReminderJob({
        clinicId: clinic.id,
        targetDate,
        timeZone,
      }));
    }
    return results;
  },
};

module.exports = { DEFAULT_TIMEZONE, appointmentReminderService };
