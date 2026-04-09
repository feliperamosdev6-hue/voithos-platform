const { AppError } = require('../errors/AppError');
const { appointmentRepository } = require('../repositories/appointmentRepository');
const { inboundMessageRepository } = require('../repositories/inboundMessageRepository');
const { outboundMessageRepository } = require('../repositories/outboundMessageRepository');
const { patientRepository } = require('../repositories/patientRepository');
const { notificationEventService } = require('./notificationEventService');

const INBOUND_STATUS = {
  RECEIVED: 'RECEIVED',
  PROCESSED: 'PROCESSED',
  IGNORED: 'IGNORED',
  FAILED: 'FAILED',
};

const INBOUND_INTENT = {
  UNKNOWN: 'UNKNOWN',
  APPOINTMENT_CONFIRMATION: 'APPOINTMENT_CONFIRMATION',
  APPOINTMENT_RESCHEDULE: 'APPOINTMENT_RESCHEDULE',
};

const normalizePhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55')) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
};

const normalizeBody = (value) => String(value || '').trim().toUpperCase();

const buildReplyText = ({ intent, status, appointment }) => {
  if (intent === INBOUND_INTENT.APPOINTMENT_CONFIRMATION && status === INBOUND_STATUS.PROCESSED) {
    const dateLabel = appointment?.dataHora ? new Date(appointment.dataHora).toLocaleString('pt-BR') : null;
    return [
      'Consulta confirmada com sucesso.',
      dateLabel ? `Data: ${dateLabel}` : null,
    ].filter(Boolean).join('\n');
  }

  if (intent === INBOUND_INTENT.APPOINTMENT_RESCHEDULE && status === INBOUND_STATUS.PROCESSED) {
    return 'Solicitacao de remarcacao recebida com sucesso. Nossa equipe entrara em contato.';
  }

  if (intent !== INBOUND_INTENT.UNKNOWN && status === INBOUND_STATUS.IGNORED) {
    return 'Nao encontrei uma consulta elegivel para esta resposta. Se precisar, fale com a clinica.';
  }

  return null;
};

const parseIntent = (normalizedBody) => {
  if (
    normalizedBody === '1'
    || normalizedBody === 'CONFIRMAR'
    || normalizedBody === 'CONFIRMADO'
    || /^1(\b|[^0-9])/.test(normalizedBody)
    || normalizedBody.includes('CONFIRM')
  ) {
    return INBOUND_INTENT.APPOINTMENT_CONFIRMATION;
  }
  if (
    normalizedBody === '2'
    || normalizedBody === 'REMARCAR'
    || /^2(\b|[^0-9])/.test(normalizedBody)
    || normalizedBody.includes('REMAR')
  ) {
    return INBOUND_INTENT.APPOINTMENT_RESCHEDULE;
  }
  return INBOUND_INTENT.UNKNOWN;
};

const inboundMessageService = {
  listRecent: async ({ clinicId, status, intent, limit }) => inboundMessageRepository.listRecent({
    clinicId,
    status,
    intent,
    limit,
  }),

  receiveWhatsappInbound: async ({ clinicId, fromPhone, body, providerMessageId, rawPayload }) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const normalizedPhone = normalizePhone(fromPhone);
    const normalizedBody = normalizeBody(body);

    if (!normalizedClinicId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
    }
    if (!normalizedPhone) {
      throw new AppError(400, 'VALIDATION_ERROR', 'fromPhone is required.');
    }
    if (!normalizedBody) {
      throw new AppError(400, 'VALIDATION_ERROR', 'body is required.');
    }
    if (providerMessageId) {
      const existing = await inboundMessageRepository.findByClinicAndProviderMessageId({
        clinicId: normalizedClinicId,
        providerMessageId: String(providerMessageId || '').trim(),
      });
      if (existing) {
        return existing;
      }
    }

    const inbound = await inboundMessageRepository.create({
      clinicId: normalizedClinicId,
      channel: 'WHATSAPP',
      fromPhone: normalizedPhone,
      body: String(body || '').trim(),
      normalizedBody,
      status: INBOUND_STATUS.RECEIVED,
      intent: INBOUND_INTENT.UNKNOWN,
      providerMessageId,
      rawPayload,
    });

    try {
      const intent = parseIntent(normalizedBody);
      const outbound = await outboundMessageRepository.findLatestReplyEnabledByClinicAndPhone({
        clinicId: normalizedClinicId,
        phone: normalizedPhone,
      });

      if (!outbound?.appointmentId) {
        await inboundMessageRepository.updateProcessing({
          id: inbound.id,
          clinicId: normalizedClinicId,
          status: INBOUND_STATUS.IGNORED,
          intent,
          processingNotes: 'No matching outbound confirmation was found for this phone.',
        });
        const stored = await inboundMessageRepository.findById(inbound.id);
        return {
          ...stored,
          replyText: buildReplyText({ intent, status: INBOUND_STATUS.IGNORED }),
        };
      }

      const appointment = await appointmentRepository.findByIdAndClinic(outbound.appointmentId, normalizedClinicId);
      if (!appointment) {
        await inboundMessageRepository.updateProcessing({
          id: inbound.id,
          clinicId: normalizedClinicId,
          outboundMessageId: outbound.id,
          patientId: outbound.patientId,
          appointmentId: outbound.appointmentId,
          status: INBOUND_STATUS.IGNORED,
          intent,
          processingNotes: 'Matching outbound exists, but appointment is no longer available for this clinic.',
        });
        const stored = await inboundMessageRepository.findById(inbound.id);
        return {
          ...stored,
          replyText: buildReplyText({ intent, status: INBOUND_STATUS.IGNORED }),
        };
      }

      if (intent === INBOUND_INTENT.UNKNOWN) {
        await inboundMessageRepository.updateProcessing({
          id: inbound.id,
          clinicId: normalizedClinicId,
          outboundMessageId: outbound.id,
          patientId: outbound.patientId,
          appointmentId: outbound.appointmentId,
          status: INBOUND_STATUS.IGNORED,
          intent,
          processingNotes: 'Inbound message did not match a supported confirmation intent.',
        });
        return inboundMessageRepository.findById(inbound.id);
      }

      const nextStatus = intent === INBOUND_INTENT.APPOINTMENT_CONFIRMATION ? 'CONFIRMADO' : 'REMARCAR';
      const confirmado = intent === INBOUND_INTENT.APPOINTMENT_CONFIRMATION;

      const patient = outbound.patientId
        ? await patientRepository.findById(outbound.patientId).catch(() => null)
        : null;

      const updateResult = await appointmentRepository.updateStatus({
        id: appointment.id,
        clinicId: normalizedClinicId,
        status: nextStatus,
        confirmado,
      });

      if (!updateResult.count) {
        throw new AppError(404, 'APPOINTMENT_NOT_FOUND', 'Appointment not found.');
      }

      await inboundMessageRepository.updateProcessing({
        id: inbound.id,
        clinicId: normalizedClinicId,
        outboundMessageId: outbound.id,
        patientId: patient?.id || outbound.patientId,
        appointmentId: appointment.id,
        status: INBOUND_STATUS.PROCESSED,
        intent,
        processingNotes: `Appointment updated to ${nextStatus} from inbound WhatsApp reply.`,
      });

      await notificationEventService.create({
        clinicId: normalizedClinicId,
        appointmentId: appointment.id,
        patientId: patient?.id || outbound.patientId,
        phone: normalizedPhone,
        type: intent === INBOUND_INTENT.APPOINTMENT_CONFIRMATION
          ? 'APPOINTMENT_CONFIRMED'
          : 'APPOINTMENT_RESCHEDULE_REQUESTED',
        payload: {
          inboundMessageId: inbound.id,
          outboundMessageId: outbound.id,
          intent,
          nextStatus,
        },
      });

      const stored = await inboundMessageRepository.findById(inbound.id);
      return {
        ...stored,
        replyText: buildReplyText({
          intent,
          status: INBOUND_STATUS.PROCESSED,
          appointment,
        }),
      };
    } catch (error) {
      await inboundMessageRepository.updateProcessing({
        id: inbound.id,
        clinicId: normalizedClinicId,
        status: INBOUND_STATUS.FAILED,
        processingNotes: error?.message || 'Inbound processing failed.',
      }).catch(() => null);
      throw error;
    }
  },
};

module.exports = { INBOUND_STATUS, INBOUND_INTENT, inboundMessageService };
