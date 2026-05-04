const { AppError } = require('../errors/AppError');
const { prisma } = require('../db/prisma');
const { appointmentRepository } = require('../repositories/appointmentRepository');
const { inboundMessageRepository } = require('../repositories/inboundMessageRepository');
const { outboundMessageRepository } = require('../repositories/outboundMessageRepository');
const { patientRepository } = require('../repositories/patientRepository');

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

const ACTIVE_REPLY_CONTEXT_TYPES = ['APPOINTMENT_CONFIRMATION', 'APPOINTMENT_REMINDER'];
const ACTIVE_REPLY_CONTEXT_STATUSES = ['PENDING', 'QUEUED', 'SENT'];

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

const isConfirmationResolved = (appointment = {}) => {
  const normalizedStatus = String(appointment?.status || '').trim().toUpperCase();
  return appointment?.confirmado === true
    || ['CONFIRMADO', 'REMARCAR', 'CANCELADO', 'CONCLUIDO', 'NAO_COMPARECEU'].includes(normalizedStatus);
};

const unwrapRawPayloadMessage = (rawPayload) => {
  let current = rawPayload?.message;

  for (let depth = 0; depth < 8 && current && typeof current === 'object'; depth += 1) {
    const next = current?.ephemeralMessage?.message
      || current?.viewOnceMessage?.message
      || current?.viewOnceMessageV2?.message
      || current?.viewOnceMessageV2Extension?.message
      || current?.documentWithCaptionMessage?.message
      || current?.editedMessage?.message
      || current?.deviceSentMessage?.message;

    if (!next || next === current) break;
    current = next;
  }

  return current;
};

const extractReferencedOutboundProviderMessageId = (rawPayload) => {
  const message = unwrapRawPayloadMessage(rawPayload);
  const candidates = [
    message?.extendedTextMessage?.contextInfo?.stanzaId,
    message?.buttonsResponseMessage?.contextInfo?.stanzaId,
    message?.templateButtonReplyMessage?.contextInfo?.stanzaId,
    message?.listResponseMessage?.contextInfo?.stanzaId,
    message?.interactiveResponseMessage?.contextInfo?.stanzaId,
  ];

  for (const candidate of candidates) {
    const normalized = String(candidate || '').trim();
    if (normalized) return normalized;
  }

  return '';
};

const maskPhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.length <= 4 ? digits : `***${digits.slice(-4)}`;
};

const logInboundState = (event, payload = {}) => {
  console.info('[WHATSAPP_INBOUND]', JSON.stringify({
    event,
    ...payload,
  }));
};

const buildReplyContextWhere = ({ clinicId, phone, appointmentId }) => ({
  clinicId: String(clinicId || '').trim(),
  phone: String(phone || '').trim(),
  appointmentId: String(appointmentId || '').trim(),
  channel: 'WHATSAPP',
  type: {
    in: ACTIVE_REPLY_CONTEXT_TYPES,
  },
  status: {
    in: ACTIVE_REPLY_CONTEXT_STATUSES,
  },
});

const TENANT_SENSITIVE_KEYS = new Set([
  'clinicId',
  'patientId',
  'appointmentId',
  'outboundMessageId',
  'dispatchId',
  'batchId',
  'campaignId',
]);

const sanitizeTenantPayload = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeTenantPayload(item));
  }
  if (!value || typeof value !== 'object') return value;
  if (value instanceof Date) return value;

  return Object.entries(value).reduce((acc, [key, nestedValue]) => {
    if (TENANT_SENSITIVE_KEYS.has(String(key || '').trim())) return acc;
    acc[key] = sanitizeTenantPayload(nestedValue);
    return acc;
  }, {});
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
        logInboundState('duplicate_provider_message_ignored', {
          clinicId: normalizedClinicId,
          phone: maskPhone(normalizedPhone),
          providerMessageId: String(providerMessageId || '').trim(),
          inboundMessageId: existing.id,
        });
        return existing;
      }
    }

    const intent = parseIntent(normalizedBody);
    const referencedOutboundProviderMessageId = extractReferencedOutboundProviderMessageId(rawPayload);
    const outbound = referencedOutboundProviderMessageId
      ? await outboundMessageRepository.findActiveReplyContextByClinicAndProviderMessageId({
        clinicId: normalizedClinicId,
        providerMessageId: referencedOutboundProviderMessageId,
      })
      : null;
    const activeReplyContext = outbound || await outboundMessageRepository.findLatestReplyEnabledByClinicAndPhone({
      clinicId: normalizedClinicId,
      phone: normalizedPhone,
    });

    if (!activeReplyContext?.appointmentId) {
      logInboundState('ignored_without_active_context', {
        clinicId: normalizedClinicId,
        phone: maskPhone(normalizedPhone),
        providerMessageId: providerMessageId ? String(providerMessageId || '').trim() : null,
        intent,
      });
      return {
        clinicId: normalizedClinicId,
        fromPhone: normalizedPhone,
        providerMessageId: providerMessageId ? String(providerMessageId || '').trim() : null,
        status: INBOUND_STATUS.IGNORED,
        intent,
        processingNotes: 'No active outbound reply context was found for this phone.',
        persisted: false,
        replyText: null,
      };
    }

    logInboundState('active_context_found', {
      clinicId: normalizedClinicId,
      phone: maskPhone(normalizedPhone),
      outboundMessageId: activeReplyContext.id,
      appointmentId: activeReplyContext.appointmentId,
      lookup: outbound ? 'provider_message_reference' : 'latest_phone_context',
      intent,
    });

    const inbound = await inboundMessageRepository.create({
      clinicId: normalizedClinicId,
      channel: 'WHATSAPP',
      fromPhone: normalizedPhone,
      body: String(body || '').trim(),
      normalizedBody,
      status: INBOUND_STATUS.RECEIVED,
      intent: INBOUND_INTENT.UNKNOWN,
      providerMessageId,
      rawPayload: sanitizeTenantPayload(rawPayload),
    });

    try {
      const appointment = await appointmentRepository.findByIdAndClinic(activeReplyContext.appointmentId, normalizedClinicId);
      if (!appointment) {
        const closeResult = await outboundMessageRepository.closeActiveReplyContexts({
          clinicId: normalizedClinicId,
          phone: normalizedPhone,
          appointmentId: activeReplyContext.appointmentId,
          lastError: 'WhatsApp reply context closed because the appointment no longer exists.',
        });
        await inboundMessageRepository.updateProcessing({
          id: inbound.id,
          clinicId: normalizedClinicId,
          outboundMessageId: activeReplyContext.id,
          patientId: activeReplyContext.patientId,
          appointmentId: activeReplyContext.appointmentId,
          status: INBOUND_STATUS.IGNORED,
          intent,
          processingNotes: 'Matching outbound exists, but appointment is no longer available for this clinic. Reply context closed.',
        });
        logInboundState('active_context_closed_missing_appointment', {
          clinicId: normalizedClinicId,
          phone: maskPhone(normalizedPhone),
          appointmentId: activeReplyContext.appointmentId,
          outboundMessageId: activeReplyContext.id,
          closedContexts: Number(closeResult?.count || 0),
        });
        const stored = await inboundMessageRepository.findByIdAndClinic({
          id: inbound.id,
          clinicId: normalizedClinicId,
        });
        return {
          ...stored,
          replyText: null,
        };
      }

      if (isConfirmationResolved(appointment)) {
        const closeResult = await outboundMessageRepository.closeActiveReplyContexts({
          clinicId: normalizedClinicId,
          phone: normalizedPhone,
          appointmentId: appointment.id,
          lastError: 'WhatsApp reply context closed because the appointment was already resolved.',
        });
        await inboundMessageRepository.updateProcessing({
          id: inbound.id,
          clinicId: normalizedClinicId,
          outboundMessageId: activeReplyContext.id,
          patientId: activeReplyContext.patientId,
          appointmentId: appointment.id,
          status: INBOUND_STATUS.IGNORED,
          intent,
          processingNotes: 'Appointment was already resolved. Reply context closed and inbound ignored.',
        });
        logInboundState('active_context_closed_already_resolved', {
          clinicId: normalizedClinicId,
          phone: maskPhone(normalizedPhone),
          appointmentId: appointment.id,
          outboundMessageId: activeReplyContext.id,
          closedContexts: Number(closeResult?.count || 0),
        });
        const stored = await inboundMessageRepository.findByIdAndClinic({
          id: inbound.id,
          clinicId: normalizedClinicId,
        });
        return {
          ...stored,
          replyText: null,
        };
      }

      if (intent === INBOUND_INTENT.UNKNOWN) {
        await inboundMessageRepository.updateProcessing({
          id: inbound.id,
          clinicId: normalizedClinicId,
          outboundMessageId: activeReplyContext.id,
          patientId: activeReplyContext.patientId,
          appointmentId: activeReplyContext.appointmentId,
          status: INBOUND_STATUS.IGNORED,
          intent,
          processingNotes: 'Inbound message did not match a supported confirmation intent.',
        });
        logInboundState('ignored_unsupported_intent', {
          clinicId: normalizedClinicId,
          phone: maskPhone(normalizedPhone),
          appointmentId: activeReplyContext.appointmentId,
          outboundMessageId: activeReplyContext.id,
        });
        return inboundMessageRepository.findByIdAndClinic({
          id: inbound.id,
          clinicId: normalizedClinicId,
        });
      }

      const nextStatus = intent === INBOUND_INTENT.APPOINTMENT_CONFIRMATION ? 'CONFIRMADO' : 'REMARCAR';
      const confirmado = intent === INBOUND_INTENT.APPOINTMENT_CONFIRMATION;

      const patient = activeReplyContext.patientId
        ? await patientRepository.findByIdAndClinic(activeReplyContext.patientId, normalizedClinicId).catch(() => null)
        : null;
      const patientName = String(patient?.nome || '').trim();

      const transactionResult = await prisma.$transaction(async (tx) => {
        const claimResult = await tx.outboundMessage.updateMany({
          where: buildReplyContextWhere({
            clinicId: normalizedClinicId,
            phone: normalizedPhone,
            appointmentId: appointment.id,
          }),
          data: {
            status: 'FAILED',
            lastError: `WhatsApp reply context closed after ${intent}.`,
          },
        });

        if (!claimResult.count) {
          return {
            processed: false,
            closedContexts: 0,
          };
        }

        const updateResult = await tx.appointment.updateMany({
          where: {
            id: appointment.id,
            clinicId: normalizedClinicId,
          },
          data: {
            status: nextStatus,
            confirmado,
          },
        });

        if (!updateResult.count) {
          throw new AppError(404, 'APPOINTMENT_NOT_FOUND', 'Appointment not found.');
        }

        await tx.inboundMessage.updateMany({
          where: {
            id: inbound.id,
            clinicId: normalizedClinicId,
          },
          data: {
            outboundMessageId: activeReplyContext.id,
            patientId: patient?.id || activeReplyContext.patientId || null,
            appointmentId: appointment.id,
            status: INBOUND_STATUS.PROCESSED,
            intent,
            processingNotes: `Appointment updated to ${nextStatus} from inbound WhatsApp reply.`,
          },
        });

        await tx.notificationEvent.create({
          data: {
            clinicId: normalizedClinicId,
            appointmentId: appointment.id,
            patientId: patient?.id || activeReplyContext.patientId || null,
            phone: normalizedPhone,
            type: intent === INBOUND_INTENT.APPOINTMENT_CONFIRMATION
              ? 'APPOINTMENT_CONFIRMED'
              : 'APPOINTMENT_RESCHEDULE_REQUESTED',
            payload: {
              inboundMessageId: inbound.id,
              outboundMessageId: activeReplyContext.id,
              intent,
              nextStatus,
              patientName,
            },
          },
        });

        return {
          processed: true,
          closedContexts: Number(claimResult.count || 0),
        };
      });

      if (!transactionResult.processed) {
        await inboundMessageRepository.updateProcessing({
          id: inbound.id,
          clinicId: normalizedClinicId,
          outboundMessageId: activeReplyContext.id,
          patientId: patient?.id || activeReplyContext.patientId,
          appointmentId: appointment.id,
          status: INBOUND_STATUS.IGNORED,
          intent,
          processingNotes: 'Reply context was already closed by a previous inbound event.',
        });
        logInboundState('ignored_already_closed_context', {
          clinicId: normalizedClinicId,
          phone: maskPhone(normalizedPhone),
          appointmentId: appointment.id,
          outboundMessageId: activeReplyContext.id,
        });
        const stored = await inboundMessageRepository.findByIdAndClinic({
          id: inbound.id,
          clinicId: normalizedClinicId,
        });
        return {
          ...stored,
          replyText: null,
        };
      }

      logInboundState('reply_processed_and_context_closed', {
        clinicId: normalizedClinicId,
        phone: maskPhone(normalizedPhone),
        appointmentId: appointment.id,
        outboundMessageId: activeReplyContext.id,
        intent,
        nextStatus,
        closedContexts: transactionResult.closedContexts,
      });

      const stored = await inboundMessageRepository.findByIdAndClinic({
        id: inbound.id,
        clinicId: normalizedClinicId,
      });
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
