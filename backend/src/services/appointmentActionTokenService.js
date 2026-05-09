const crypto = require('node:crypto');
const { AppError } = require('../errors/AppError');
const { appEnv } = require('../config/appEnv');
const { appointmentRepository } = require('../repositories/appointmentRepository');
const { appointmentActionTokenRepository } = require('../repositories/appointmentActionTokenRepository');
const { outboundMessageRepository } = require('../repositories/outboundMessageRepository');
const { patientRepository } = require('../repositories/patientRepository');
const { notificationEventService } = require('./notificationEventService');

const ACTION_TYPE = {
  CONFIRM_APPOINTMENT: 'CONFIRM_APPOINTMENT',
  RESCHEDULE_APPOINTMENT: 'RESCHEDULE_APPOINTMENT',
};

const ACTION_STATUS = {
  ACTIVE: 'ACTIVE',
  USED: 'USED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
};

const ACTION_RESULT = {
  CONFIRMED: 'CONFIRMED',
  ALREADY_CONFIRMED: 'ALREADY_CONFIRMED',
  RESCHEDULE_REQUESTED: 'RESCHEDULE_REQUESTED',
  EXPIRED: 'EXPIRED',
  USED: 'USED',
  INVALID: 'INVALID',
  UNAVAILABLE: 'UNAVAILABLE',
};

const hashToken = (value) => crypto.createHash('sha256').update(String(value || '').trim()).digest('hex');

const generateRawToken = () => crypto.randomBytes(18).toString('base64url');

const buildPublicUrl = (token) => `${appEnv.appointmentActionBaseUrl}/r/${encodeURIComponent(token)}`;

const buildSafeBodyWithLinks = ({ baseText, confirmUrl, rescheduleUrl }) => [
  String(baseText || '').trim(),
  '',
  '✅ Confirmar consulta:',
  `${confirmUrl}`,
  '',
  '📅 Solicitar remarcacao:',
  `${rescheduleUrl}`,
  '',
  'Se preferir, responda 1 para confirmar ou 2 para remarcar.',
].join('\n');

const buildAuditBodyWithLinks = ({ baseText }) => [
  String(baseText || '').trim(),
  '',
  '✅ Confirmar consulta:',
  '[LINK_CONFIRMAR_REDACTED]',
  '',
  '📅 Solicitar remarcacao:',
  '[LINK_REMARCAR_REDACTED]',
  '',
  'Se preferir, responda 1 para confirmar ou 2 para remarcar.',
].join('\n');

const computeExpiryDate = (appointmentDate) => {
  const now = new Date();
  const ttlLimit = new Date(now.getTime() + (appEnv.appointmentActionTokenTtlHours * 60 * 60 * 1000));
  const appointmentTime = new Date(appointmentDate);
  if (Number.isNaN(appointmentTime.getTime())) return ttlLimit;
  return appointmentTime.getTime() < ttlLimit.getTime() ? appointmentTime : ttlLimit;
};

const isImmutableAppointmentStatus = ({ status, attendanceStatus }) => {
  const normalizedStatus = String(status || '').trim().toUpperCase();
  const normalizedAttendance = String(attendanceStatus || '').trim().toUpperCase();
  return ['CANCELADO', 'CONCLUIDO', 'NAO_COMPARECEU'].includes(normalizedStatus)
    || ['ATTENDED', 'NO_SHOW'].includes(normalizedAttendance);
};

const createTokenRecord = async ({
  clinicId,
  patientId,
  appointmentId,
  actionType,
  outboundMessageId,
  metadata,
  expiresAt,
}) => {
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const record = await appointmentActionTokenRepository.create({
    clinicId,
    patientId,
    appointmentId,
    actionType,
    tokenHash,
    expiresAt,
    status: ACTION_STATUS.ACTIVE,
    channel: 'WHATSAPP_LINK',
    outboundMessageId: outboundMessageId || null,
    metadata: metadata || null,
  });

  return {
    record,
    rawToken,
    publicUrl: buildPublicUrl(rawToken),
  };
};

const markTokenExpiredIfNeeded = async (tokenRecord) => {
  if (!tokenRecord) return null;
  if (tokenRecord.status !== ACTION_STATUS.ACTIVE) return tokenRecord;
  if (new Date(tokenRecord.expiresAt).getTime() >= Date.now()) return tokenRecord;
  return appointmentActionTokenRepository.updateById({
    id: tokenRecord.id,
    data: {
      status: ACTION_STATUS.EXPIRED,
    },
  });
};

const buildNotificationPayload = ({ tokenRecord, requestMeta, result }) => ({
  appointmentActionTokenId: tokenRecord.id,
  actionType: tokenRecord.actionType,
  outboundMessageId: tokenRecord.outboundMessageId || null,
  channel: tokenRecord.channel,
  result,
  requestMeta,
});

const appointmentActionTokenService = {
  createLinksForOutbound: async ({
    clinicId,
    patientId,
    appointmentId,
    outboundMessageId,
    baseText,
    appointmentDate,
  }) => {
    const expiresAt = computeExpiryDate(appointmentDate);
    const [confirmToken, rescheduleToken] = await Promise.all([
      createTokenRecord({
        clinicId,
        patientId,
        appointmentId,
        outboundMessageId,
        actionType: ACTION_TYPE.CONFIRM_APPOINTMENT,
        expiresAt,
        metadata: { source: 'OUTBOUND_MESSAGE' },
      }),
      createTokenRecord({
        clinicId,
        patientId,
        appointmentId,
        outboundMessageId,
        actionType: ACTION_TYPE.RESCHEDULE_APPOINTMENT,
        expiresAt,
        metadata: { source: 'OUTBOUND_MESSAGE' },
      }),
    ]);

    return {
      expiresAt,
      auditBody: buildAuditBodyWithLinks({ baseText }),
      sendBody: buildSafeBodyWithLinks({
        baseText,
        confirmUrl: confirmToken.publicUrl,
        rescheduleUrl: rescheduleToken.publicUrl,
      }),
      links: {
        confirm: confirmToken.publicUrl,
        reschedule: rescheduleToken.publicUrl,
      },
      tokens: {
        confirmId: confirmToken.record.id,
        rescheduleId: rescheduleToken.record.id,
      },
    };
  },

  consumePublicToken: async ({ token, requestMeta = {} }) => {
    const normalizedToken = String(token || '').trim();
    if (!normalizedToken) {
      throw new AppError(400, 'INVALID_ACTION_TOKEN', 'Link de acao invalido.');
    }

    const tokenRecord = await appointmentActionTokenRepository.findByTokenHash(hashToken(normalizedToken));
    if (!tokenRecord) {
      throw new AppError(404, 'INVALID_ACTION_TOKEN', 'Link de acao invalido ou indisponivel.');
    }

    const refreshedToken = await markTokenExpiredIfNeeded(tokenRecord);
    if (refreshedToken.status === ACTION_STATUS.EXPIRED) {
      throw new AppError(410, 'ACTION_TOKEN_EXPIRED', 'Este link expirou.');
    }
    if (refreshedToken.status === ACTION_STATUS.USED || refreshedToken.usedAt) {
      throw new AppError(409, 'ACTION_TOKEN_ALREADY_USED', 'Este link ja foi utilizado.');
    }
    if (refreshedToken.status === ACTION_STATUS.CANCELLED) {
      throw new AppError(409, 'ACTION_TOKEN_UNAVAILABLE', 'Esta acao nao esta mais disponivel.');
    }

    const appointment = await appointmentRepository.findByIdAndClinic(
      refreshedToken.appointmentId,
      refreshedToken.clinicId,
    );
    if (!appointment) {
      await appointmentActionTokenRepository.updateById({
        id: refreshedToken.id,
        data: { status: ACTION_STATUS.CANCELLED },
      });
      throw new AppError(404, 'APPOINTMENT_NOT_FOUND', 'Esta consulta nao esta mais disponivel.');
    }

    const patient = await patientRepository.findById(refreshedToken.patientId).catch(() => null);
    const patientName = String(patient?.nome || '').trim();
    const currentStatus = String(appointment.status || '').trim().toUpperCase();

    if (isImmutableAppointmentStatus({
      status: currentStatus,
      attendanceStatus: appointment?.attendanceStatus,
    })) {
      await appointmentActionTokenRepository.updateById({
        id: refreshedToken.id,
        data: { status: ACTION_STATUS.CANCELLED },
      });
      throw new AppError(409, 'APPOINTMENT_ACTION_UNAVAILABLE', 'Esta consulta nao pode mais ser alterada.');
    }

    if (refreshedToken.actionType === ACTION_TYPE.CONFIRM_APPOINTMENT) {
      let result = ACTION_RESULT.CONFIRMED;
      if (currentStatus === 'CONFIRMADO' || appointment.confirmado === true) {
        result = ACTION_RESULT.ALREADY_CONFIRMED;
      } else {
        await appointmentRepository.updateStatus({
          id: appointment.id,
          clinicId: refreshedToken.clinicId,
          status: 'CONFIRMADO',
          confirmado: true,
        });
        await notificationEventService.create({
          clinicId: refreshedToken.clinicId,
          appointmentId: appointment.id,
          patientId: refreshedToken.patientId,
          phone: patient?.telefone || null,
          type: 'APPOINTMENT_CONFIRMED',
          payload: {
            ...buildNotificationPayload({ tokenRecord: refreshedToken, requestMeta, result }),
            patientName,
          },
        });
      }

      await appointmentActionTokenRepository.updateById({
        id: refreshedToken.id,
        data: {
          status: ACTION_STATUS.USED,
          usedAt: new Date(),
          metadata: {
            ...(refreshedToken.metadata || {}),
            requestMeta,
            result,
          },
        },
      });
      await appointmentActionTokenRepository.expireActiveForAppointment({
        clinicId: refreshedToken.clinicId,
        appointmentId: appointment.id,
        actionType: ACTION_TYPE.CONFIRM_APPOINTMENT,
      });

      return {
        outcome: result,
        actionType: refreshedToken.actionType,
        appointmentId: appointment.id,
        patientId: refreshedToken.patientId,
        clinicId: refreshedToken.clinicId,
      };
    }

    await appointmentRepository.updateStatus({
      id: appointment.id,
      clinicId: refreshedToken.clinicId,
      status: 'REMARCAR',
      confirmado: false,
    });

    await appointmentActionTokenRepository.updateById({
      id: refreshedToken.id,
      data: {
        status: ACTION_STATUS.USED,
        usedAt: new Date(),
        metadata: {
          ...(refreshedToken.metadata || {}),
          requestMeta,
          result: ACTION_RESULT.RESCHEDULE_REQUESTED,
        },
      },
    });
    await appointmentActionTokenRepository.expireActiveForAppointment({
      clinicId: refreshedToken.clinicId,
      appointmentId: appointment.id,
      actionType: ACTION_TYPE.RESCHEDULE_APPOINTMENT,
    });

    await notificationEventService.create({
      clinicId: refreshedToken.clinicId,
      appointmentId: appointment.id,
      patientId: refreshedToken.patientId,
      phone: patient?.telefone || null,
      type: 'APPOINTMENT_RESCHEDULE_REQUESTED',
      payload: {
        ...buildNotificationPayload({
          tokenRecord: refreshedToken,
          requestMeta,
          result: ACTION_RESULT.RESCHEDULE_REQUESTED,
        }),
        patientName,
      },
    });
    return {
      outcome: ACTION_RESULT.RESCHEDULE_REQUESTED,
      actionType: refreshedToken.actionType,
      appointmentId: appointment.id,
      patientId: refreshedToken.patientId,
      clinicId: refreshedToken.clinicId,
    };
  },

  getLinksForOutboundMessage: async ({ outboundMessageId }) => {
    const outbound = await outboundMessageRepository.findById(String(outboundMessageId || '').trim());
    if (!outbound) {
      throw new AppError(404, 'OUTBOUND_MESSAGE_NOT_FOUND', 'OutboundMessage not found.');
    }
    const tokens = await appointmentActionTokenRepository.listByOutboundMessageId({ outboundMessageId: outbound.id });
    return tokens;
  },
};

module.exports = { ACTION_TYPE, ACTION_STATUS, ACTION_RESULT, appointmentActionTokenService };
