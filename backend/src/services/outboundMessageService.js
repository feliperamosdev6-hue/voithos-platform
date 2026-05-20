const { AppError } = require('../errors/AppError');
const { appEnv } = require('../config/appEnv');
const { whatsappNgClient } = require('../adapters/whatsappNgClient');
const { appointmentRepository } = require('../repositories/appointmentRepository');
const { clinicRepository } = require('../repositories/clinicRepository');
const { outboundMessageRepository } = require('../repositories/outboundMessageRepository');
const { patientRepository } = require('../repositories/patientRepository');
const { appointmentActionTokenService } = require('./appointmentActionTokenService');

const OUTBOUND_STATUS = {
  PENDING: 'PENDING',
  QUEUED: 'QUEUED',
  SENT: 'SENT',
  FAILED: 'FAILED',
};

const DISCONNECTED_RETRY_DELAY_CAP_MS = 15 * 1000;

const getAppointmentConfirmationDedupWindowMs = () => {
  const minutes = Math.max(1, Number(appEnv?.appointmentConfirmationDedupMinutes) || 10);
  return minutes * 60 * 1000;
};

const isFreshAppointmentConfirmationContext = (message = {}) => {
  const createdAt = new Date(message?.createdAt || '');
  if (Number.isNaN(createdAt.getTime())) return false;
  return (Date.now() - createdAt.getTime()) < getAppointmentConfirmationDedupWindowMs();
};

const normalizePhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55')) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
};

const maskPhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.length <= 4 ? digits : `***${digits.slice(-4)}`;
};

const formatDateTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date);
};

const buildAppointmentConfirmationBody = ({ clinic, patient, appointment }) => {
  const clinicName = String(clinic?.nomeFantasia || clinic?.razaoSocial || 'Voithos').trim();
  const patientName = String(patient?.nome || 'Paciente').trim();
  const when = formatDateTime(appointment?.dataHora);
  return [
    `Ola, ${patientName}!`,
    '',
    'Seu agendamento foi registrado com sucesso. ✅',
    '',
    `Clinica: ${clinicName}`,
    `Data e horario: ${when}`,
  ].join('\n');
};

const buildAppointmentReminderBody = ({ clinic, patient, appointment }) => {
  const clinicName = String(clinic?.nomeFantasia || clinic?.razaoSocial || 'Voithos').trim();
  const patientName = String(patient?.nome || 'Paciente').trim();
  const when = formatDateTime(appointment?.dataHora);
  return [
    `Ola, ${patientName}!`,
    '',
    'Este e um lembrete da sua consulta. 📅',
    '',
    `Clinica: ${clinicName}`,
    `Data e horario: ${when}`,
  ].join('\n');
};

const appendReplyFallback = (baseText) => [
  String(baseText || '').trim(),
  '',
  'Responda 1 para confirmar ou 2 para remarcar.',
].join('\n');

const isConfirmationResolved = (appointment = {}) => {
  const normalizedStatus = String(appointment?.status || '').trim().toUpperCase();
  return appointment?.confirmado === true
    || ['CONFIRMADO', 'REMARCAR', 'CANCELADO', 'CONCLUIDO', 'NAO_COMPARECEU'].includes(normalizedStatus);
};

const formatOutboundResponse = (payload = {}) => ({
  ...payload,
  confirmationPending: payload?.confirmationPending === true,
  lastConfirmationSentAt: payload?.lastConfirmationSentAt || null,
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));

const parseDisconnectedRetryDelayMs = (error) => {
  const message = String(error?.message || '').trim();
  const match = message.match(/(\d+)\s*segundos?/i);
  const seconds = Number(match?.[1] || 0);
  if (seconds > 0) return Math.min(DISCONNECTED_RETRY_DELAY_CAP_MS, seconds * 1000);
  return 10 * 1000;
};

const isTransientDisconnectedNgError = (error) => {
  const statusCode = Number(error?.statusCode || error?.status || 0);
  const code = String(error?.code || '').trim().toUpperCase();
  const message = String(error?.message || '').trim();
  if (code === 'WHATSAPP_NG_NOT_READY' || code === 'WHATSAPP_NG_TIMEOUT' || code === 'WHATSAPP_NG_UNAVAILABLE') {
    return true;
  }
  return statusCode === 409 && /desconectad|cooling|esfriando/i.test(message);
};

const sendWhatsappAppointmentMessage = async ({ clinicId, phone, body, auditBody, appointmentId, outboundMessageId, patientId, type }) => {
  try {
    return await whatsappNgClient.sendAppointmentConfirmation({
      clinicId,
      phone,
      body,
      auditBody,
      appointmentId,
    });
  } catch (error) {
    if (!isTransientDisconnectedNgError(error)) throw error;

    const retryDelayMs = parseDisconnectedRetryDelayMs(error);
    console.warn('[OUTBOUND] transient whatsapp disconnect detected before retry', JSON.stringify({
      outboundMessageId,
      clinicId,
      patientId,
      appointmentId,
      type,
      retryDelayMs,
      error: error?.message || 'Transient WhatsApp NG disconnect.',
      code: error?.code || null,
      statusCode: Number(error?.statusCode || error?.status || 0) || null,
    }));

    await sleep(retryDelayMs);

    return whatsappNgClient.sendAppointmentConfirmation({
      clinicId,
      phone,
      body,
      auditBody,
      appointmentId,
    });
  }
};

const createOutboundRecord = async ({ clinicId, patientId, appointmentId, phone, body, type }) => outboundMessageRepository.create({
  clinicId,
  patientId,
  appointmentId,
  channel: 'WHATSAPP',
  type,
  phone,
  body,
  status: OUTBOUND_STATUS.PENDING,
  provider: 'WHATSAPP_NG',
});

const dispatchOutboundRecord = async ({ outbound, clinicId, patientId, appointmentId, phone, body, auditBody, type }) => {
  console.info('[OUTBOUND] message queued', JSON.stringify({
    outboundMessageId: outbound.id,
    clinicId,
    patientId,
    appointmentId,
    phone: maskPhone(phone),
    type,
  }));

  try {
    await outboundMessageRepository.updateStatus({
      id: outbound.id,
      clinicId,
      status: OUTBOUND_STATUS.QUEUED,
    });

    const provider = await sendWhatsappAppointmentMessage({
      clinicId,
      phone,
      body,
      auditBody: auditBody || outbound.body || body,
      appointmentId,
      outboundMessageId: outbound.id,
      patientId,
      type,
    });

    const providerStatus = String(provider?.status || '').trim().toUpperCase();
    const acceptedAsQueued = providerStatus === 'QUEUED' || (!provider?.providerMessageId && !!provider?.jobId);
    await outboundMessageRepository.updateStatus({
      id: outbound.id,
      clinicId,
      status: acceptedAsQueued ? OUTBOUND_STATUS.QUEUED : OUTBOUND_STATUS.SENT,
      providerMessageId: provider?.providerMessageId || provider?.jobId || '',
      lastError: null,
    });

    console.info('[OUTBOUND] message sent', JSON.stringify({
      outboundMessageId: outbound.id,
      clinicId,
      patientId,
      appointmentId,
      providerMessageId: provider?.providerMessageId || provider?.jobId || null,
      providerStatus: providerStatus || null,
      type,
    }));

    return outboundMessageRepository.findByIdAndClinic({
      id: outbound.id,
      clinicId,
    });
  } catch (error) {
    await outboundMessageRepository.updateStatus({
      id: outbound.id,
      clinicId,
      status: OUTBOUND_STATUS.FAILED,
      lastError: error?.message || 'Unknown outbound failure.',
    });

    console.error('[OUTBOUND] message failed', JSON.stringify({
      outboundMessageId: outbound.id,
      clinicId,
      patientId,
      appointmentId,
      error: error?.message || 'Unknown outbound failure.',
      type,
    }));
    throw error;
  }
};

const outboundMessageService = {
  listByClinic: async ({ clinicId, limit }) => {
    const normalizedClinicId = String(clinicId || '').trim();
    if (!normalizedClinicId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authenticated clinic context is required.');
    }
    return outboundMessageRepository.listByClinic({ clinicId: normalizedClinicId, limit });
  },

  getByIdForClinic: async ({ id, clinicId }) => {
    const normalizedClinicId = String(clinicId || '').trim();
    if (!normalizedClinicId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authenticated clinic context is required.');
    }
    const message = await outboundMessageRepository.findByIdAndClinic({
      id: String(id || '').trim(),
      clinicId: normalizedClinicId,
    });
    if (!message) {
      throw new AppError(404, 'OUTBOUND_MESSAGE_NOT_FOUND', 'Outbound message not found.');
    }
    return message;
  },

  sendAppointmentConfirmation: async ({ clinicId, appointmentId }) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const normalizedAppointmentId = String(appointmentId || '').trim();

    if (!normalizedClinicId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authenticated clinic context is required.');
    }
    if (!normalizedAppointmentId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'appointmentId is required.');
    }

    const appointment = await appointmentRepository.findByIdAndClinic(normalizedAppointmentId, normalizedClinicId);
    if (!appointment) {
      throw new AppError(404, 'APPOINTMENT_NOT_FOUND', 'Appointment not found.');
    }
    const patient = await patientRepository.findByIdAndClinic(String(appointment.patientId || '').trim(), normalizedClinicId);
    if (!patient) {
      throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient not found.');
    }
    const clinic = await clinicRepository.findById(normalizedClinicId);
    const phone = normalizePhone(patient?.telefone);
    if (!phone) {
      throw new AppError(400, 'PATIENT_PHONE_MISSING', 'Patient phone is required.');
    }

    if (isConfirmationResolved(appointment)) {
      return formatOutboundResponse({
        id: '',
        clinicId: normalizedClinicId,
        patientId: patient.id,
        appointmentId: appointment.id,
        type: 'APPOINTMENT_CONFIRMATION',
        status: appointment.status,
        deduped: true,
        alreadyResolved: true,
        confirmationPending: false,
        nextAction: 'none',
      });
    }

    const existingConfirmation = await outboundMessageRepository.findLatestActiveConfirmationByAppointment({
      clinicId: normalizedClinicId,
      appointmentId: appointment.id,
    });
    if (existingConfirmation) {
      if (isFreshAppointmentConfirmationContext(existingConfirmation)) {
        return formatOutboundResponse({
          ...existingConfirmation,
          deduped: true,
          alreadyPending: true,
          confirmationPending: true,
          lastConfirmationSentAt: existingConfirmation.createdAt,
          nextAction: 'await_patient_reply',
        });
      }

      const staleCloseResult = await outboundMessageRepository.closeActiveConfirmationContextsByAppointment({
        clinicId: normalizedClinicId,
        appointmentId: appointment.id,
        lastError: 'Stale appointment confirmation context closed before resend.',
      });

      console.info('[OUTBOUND] stale appointment confirmation context closed before resend', JSON.stringify({
        clinicId: normalizedClinicId,
        patientId: patient.id,
        appointmentId: appointment.id,
        closedContexts: Number(staleCloseResult?.count || 0),
        staleOutboundMessageId: existingConfirmation.id,
      }));
    }

    const baseText = buildAppointmentConfirmationBody({ clinic, patient, appointment });
    const deliveryBody = appEnv.appointmentActionLinksEnabled
      ? baseText
      : appendReplyFallback(baseText);
    const outbound = await createOutboundRecord({
      clinicId: normalizedClinicId,
      patientId: patient.id,
      appointmentId: appointment.id,
      phone,
      body: deliveryBody,
      type: 'APPOINTMENT_CONFIRMATION',
    });

    if (appEnv.appointmentActionLinksEnabled) {
      const smartLinks = await appointmentActionTokenService.createLinksForOutbound({
        clinicId: normalizedClinicId,
        patientId: patient.id,
        appointmentId: appointment.id,
        outboundMessageId: outbound.id,
        baseText,
        appointmentDate: appointment.dataHora,
      });

      await outboundMessageRepository.updateBody({
        id: outbound.id,
        clinicId: normalizedClinicId,
        body: smartLinks.auditBody,
      });

      const dispatched = await dispatchOutboundRecord({
        outbound,
        clinicId: normalizedClinicId,
        patientId: patient.id,
        appointmentId: appointment.id,
        phone,
        body: smartLinks.sendBody,
        auditBody: smartLinks.auditBody,
        type: 'APPOINTMENT_CONFIRMATION',
      });
      return formatOutboundResponse({
        ...(dispatched || outbound),
        deduped: false,
        alreadyPending: false,
        confirmationPending: true,
        lastConfirmationSentAt: (dispatched || outbound)?.createdAt || outbound.createdAt,
        nextAction: 'await_patient_reply',
      });
    }

    const dispatched = await dispatchOutboundRecord({
      outbound,
      clinicId: normalizedClinicId,
      patientId: patient.id,
      appointmentId: appointment.id,
      phone,
      body: deliveryBody,
      auditBody: deliveryBody,
      type: 'APPOINTMENT_CONFIRMATION',
    });
    return formatOutboundResponse({
      ...(dispatched || outbound),
      deduped: false,
      alreadyPending: false,
      confirmationPending: true,
      lastConfirmationSentAt: (dispatched || outbound)?.createdAt || outbound.createdAt,
      nextAction: 'await_patient_reply',
    });
  },

  sendAppointmentReminder: async ({ clinicId, appointmentId }) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const normalizedAppointmentId = String(appointmentId || '').trim();
    if (!normalizedClinicId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authenticated clinic context is required.');
    }
    if (!normalizedAppointmentId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'appointmentId is required.');
    }

    const appointment = await appointmentRepository.findByIdAndClinic(normalizedAppointmentId, normalizedClinicId);
    if (!appointment) {
      throw new AppError(404, 'APPOINTMENT_NOT_FOUND', 'Appointment not found.');
    }
    const patient = await patientRepository.findByIdAndClinic(String(appointment.patientId || '').trim(), normalizedClinicId);
    if (!patient) {
      throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient not found.');
    }
    const clinic = await clinicRepository.findById(normalizedClinicId);
    const phone = normalizePhone(patient?.telefone);
    if (!phone) {
      throw new AppError(400, 'PATIENT_PHONE_MISSING', 'Patient phone is required.');
    }

    const baseText = buildAppointmentReminderBody({ clinic, patient, appointment });
    const deliveryBody = appEnv.appointmentActionLinksEnabled
      ? baseText
      : appendReplyFallback(baseText);
    const outbound = await createOutboundRecord({
      clinicId: normalizedClinicId,
      patientId: patient.id,
      appointmentId: appointment.id,
      phone,
      body: deliveryBody,
      type: 'APPOINTMENT_REMINDER',
    });

    const smartLinks = appEnv.appointmentActionLinksEnabled
      ? await appointmentActionTokenService.createLinksForOutbound({
        clinicId: normalizedClinicId,
        patientId: patient.id,
        appointmentId: appointment.id,
        outboundMessageId: outbound.id,
        baseText,
        appointmentDate: appointment.dataHora,
      })
      : null;

    if (smartLinks?.auditBody) {
      await outboundMessageRepository.updateBody({
        id: outbound.id,
        clinicId: normalizedClinicId,
        body: smartLinks.auditBody,
      });
    }

    const sent = await dispatchOutboundRecord({
      outbound,
      clinicId: normalizedClinicId,
      patientId: patient.id,
      appointmentId: appointment.id,
      phone,
      body: smartLinks?.sendBody || deliveryBody,
      auditBody: smartLinks?.auditBody || deliveryBody,
      type: 'APPOINTMENT_REMINDER',
    });

    return sent;
  },

  resetClinicWhatsappReplyContexts: async ({ clinicId, reason }) => {
    const normalizedClinicId = String(clinicId || '').trim();
    if (!normalizedClinicId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authenticated clinic context is required.');
    }

    const result = await outboundMessageRepository.failActiveWhatsappReplyContextsByClinic({
      clinicId: normalizedClinicId,
      lastError: String(reason || '').trim() || 'WhatsApp clinic context reset by operator.',
    });

    return {
      clinicId: normalizedClinicId,
      resetCount: Number(result?.count || 0),
      reason: String(reason || '').trim() || 'WhatsApp clinic context reset by operator.',
    };
  },
};

module.exports = { OUTBOUND_STATUS, outboundMessageService };
