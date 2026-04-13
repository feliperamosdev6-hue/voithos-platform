const { AppError } = require('../errors/AppError');
const { appointmentRepository } = require('../repositories/appointmentRepository');
const { outboundMessageRepository } = require('../repositories/outboundMessageRepository');
const { patientRepository } = require('../repositories/patientRepository');
const {
  assertRecordBelongsToClinic,
  sanitizeTenantInput,
} = require('../utils/tenantScope');

const isMissingTableError = (error) => error && error.code === 'P2021';
const VALID_STATUSES = new Set(['AGENDADO', 'CONFIRMADO', 'CONCLUIDO', 'NAO_COMPARECEU', 'CANCELADO', 'REMARCAR']);
const VALID_ATTENDANCE_STATUSES = new Set(['ATTENDED', 'NO_SHOW']);

const normalizeStatus = (value) => String(value || '').trim().toUpperCase();
const normalizeAttendanceStatus = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized || null;
};

const isConfirmationResolved = (appointment = {}) => {
  const normalizedStatus = normalizeStatus(appointment?.status);
  return appointment?.confirmado === true
    || ['CONFIRMADO', 'REMARCAR', 'CANCELADO', 'CONCLUIDO', 'NAO_COMPARECEU'].includes(normalizedStatus);
};

const attachConfirmationState = async (clinicId, appointments = []) => {
  const normalizedClinicId = String(clinicId || '').trim();
  const list = Array.isArray(appointments) ? appointments : [];
  const appointmentIds = list
    .map((item) => String(item?.id || '').trim())
    .filter(Boolean);

  if (!normalizedClinicId || !appointmentIds.length) return list;

  let activeConfirmations = [];
  try {
    activeConfirmations = await outboundMessageRepository.listActiveConfirmationsByAppointmentIds({
      clinicId: normalizedClinicId,
      appointmentIds,
    });
  } catch (error) {
    if (isMissingTableError(error)) return list;
    throw error;
  }

  const latestByAppointmentId = new Map();
  for (const message of activeConfirmations) {
    const appointmentId = String(message?.appointmentId || '').trim();
    if (!appointmentId || latestByAppointmentId.has(appointmentId)) continue;
    latestByAppointmentId.set(appointmentId, message);
  }

  return list.map((appointment) => {
    const appointmentId = String(appointment?.id || '').trim();
    const latestConfirmation = latestByAppointmentId.get(appointmentId);
    const confirmationPending = !isConfirmationResolved(appointment) && !!latestConfirmation;
    return {
      ...appointment,
      confirmationPending,
      lastConfirmationSentAt: confirmationPending ? latestConfirmation?.createdAt || null : null,
      lastConfirmationOutboundId: confirmationPending ? latestConfirmation?.id || '' : '',
    };
  });
};

const ensurePatientBelongsToClinic = async (clinicId, patientId) => {
  const patient = await patientRepository.findByIdAndClinic(patientId, clinicId);
  return assertRecordBelongsToClinic(patient, clinicId, 'PATIENT_NOT_FOUND');
};

const ensureAppointmentBelongsToClinic = async (clinicId, appointmentId) => {
  const appointment = await appointmentRepository.findByIdAndClinic(appointmentId, clinicId);
  return assertRecordBelongsToClinic(appointment, clinicId, 'APPOINTMENT_NOT_FOUND');
};

const appointmentService = {
  listAppointments: async ({ clinicId, from, to, patientId }) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const normalizedPatientId = String(patientId || '').trim();
    if (!normalizedClinicId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authenticated clinic context is required.');
    }

    try {
      if (normalizedPatientId) {
        await ensurePatientBelongsToClinic(normalizedClinicId, normalizedPatientId);
      }
      const appointments = await appointmentRepository.listByClinic({
        clinicId: normalizedClinicId,
        from,
        to,
        patientId: normalizedPatientId || undefined,
      });
      return attachConfirmationState(normalizedClinicId, appointments);
    } catch (error) {
      if (isMissingTableError(error)) return [];
      throw error;
    }
  },

  getAppointmentById: async ({ clinicId, id }) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const normalizedId = String(id || '').trim();
    if (!normalizedClinicId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authenticated clinic context is required.');
    }
    if (!normalizedId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'id is required.');
    }

    try {
      const scopedAppointment = await ensureAppointmentBelongsToClinic(normalizedClinicId, normalizedId);
      const [enriched] = await attachConfirmationState(normalizedClinicId, scopedAppointment ? [scopedAppointment] : []);
      return enriched || null;
    } catch (error) {
      if (isMissingTableError(error)) return null;
      throw error;
    }
  },

  createAppointment: async ({ clinicId, input }) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const sanitizedInput = sanitizeTenantInput(input);
    const patientId = String(sanitizedInput?.patientId || '').trim();
    const dataHora = sanitizedInput?.dataHora;
    if (!normalizedClinicId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authenticated clinic context is required.');
    }
    if (!patientId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'patientId is required.');
    }
    if (!dataHora) {
      throw new AppError(400, 'VALIDATION_ERROR', 'dataHora is required.');
    }

    try {
      await ensurePatientBelongsToClinic(normalizedClinicId, patientId);
      return await appointmentRepository.create({
        clinicId: normalizedClinicId,
        patientId,
        profissionalId: sanitizedInput?.profissionalId,
        profissionalNome: sanitizedInput?.profissionalNome,
        dataHora,
        horaFim: sanitizedInput?.horaFim,
        status: 'AGENDADO',
        confirmado: false,
        attendanceStatus: normalizeAttendanceStatus(sanitizedInput?.attendanceStatus),
        tipo: sanitizedInput?.tipo,
        observacoes: sanitizedInput?.observacoes,
      });
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
      }
      throw error;
    }
  },

  updateAppointmentStatus: async ({ clinicId, id, status }) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const normalizedId = String(id || '').trim();
    const normalizedStatus = normalizeStatus(status);
    if (!normalizedClinicId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authenticated clinic context is required.');
    }
    if (!normalizedId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'id is required.');
    }
    if (!VALID_STATUSES.has(normalizedStatus)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'status is invalid.');
    }

    try {
      await ensureAppointmentBelongsToClinic(normalizedClinicId, normalizedId);

      const result = await appointmentRepository.updateStatus({
        id: normalizedId,
        clinicId: normalizedClinicId,
        status: normalizedStatus,
        confirmado: normalizedStatus === 'CONFIRMADO',
      });

      if (!result.count) {
        throw new AppError(404, 'APPOINTMENT_NOT_FOUND', 'Appointment not found.');
      }

      return appointmentRepository.findByIdAndClinic(normalizedId, normalizedClinicId);
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
      }
      throw error;
    }
  },

  updateAppointmentAttendance: async ({ clinicId, id, attendanceStatus }) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const normalizedId = String(id || '').trim();
    const normalizedAttendanceStatus = normalizeAttendanceStatus(attendanceStatus);
    if (!normalizedClinicId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authenticated clinic context is required.');
    }
    if (!normalizedId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'id is required.');
    }
    if (normalizedAttendanceStatus && !VALID_ATTENDANCE_STATUSES.has(normalizedAttendanceStatus)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'attendanceStatus is invalid.');
    }

    try {
      await ensureAppointmentBelongsToClinic(normalizedClinicId, normalizedId);

      const result = await appointmentRepository.updateAttendanceStatus({
        id: normalizedId,
        clinicId: normalizedClinicId,
        attendanceStatus: normalizedAttendanceStatus,
      });

      if (!result.count) {
        throw new AppError(404, 'APPOINTMENT_NOT_FOUND', 'Appointment not found.');
      }

      return appointmentRepository.findByIdAndClinic(normalizedId, normalizedClinicId);
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
      }
      throw error;
    }
  },

  updateAppointment: async ({ clinicId, id, input }) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const normalizedId = String(id || '').trim();
    const sanitizedInput = sanitizeTenantInput(input);
    const normalizedStatus = normalizeStatus(sanitizedInput?.status || 'AGENDADO');
    const normalizedAttendanceStatus = normalizeAttendanceStatus(sanitizedInput?.attendanceStatus);
    const normalizedPatientId = String(sanitizedInput?.patientId || '').trim();

    if (!normalizedClinicId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authenticated clinic context is required.');
    }
    if (!normalizedId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'id is required.');
    }
    if (!VALID_STATUSES.has(normalizedStatus)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'status is invalid.');
    }
    if (normalizedAttendanceStatus && !VALID_ATTENDANCE_STATUSES.has(normalizedAttendanceStatus)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'attendanceStatus is invalid.');
    }
    if (!sanitizedInput?.dataHora) {
      throw new AppError(400, 'VALIDATION_ERROR', 'dataHora is required.');
    }

    try {
      const current = await ensureAppointmentBelongsToClinic(normalizedClinicId, normalizedId);

      const patientId = normalizedPatientId || current?.patientId;
      await ensurePatientBelongsToClinic(normalizedClinicId, patientId);

      const result = await appointmentRepository.update({
        id: normalizedId,
        clinicId: normalizedClinicId,
        data: {
          profissionalId: sanitizedInput?.profissionalId,
          profissionalNome: sanitizedInput?.profissionalNome,
          dataHora: sanitizedInput?.dataHora,
          horaFim: sanitizedInput?.horaFim,
          tipo: sanitizedInput?.tipo,
          observacoes: sanitizedInput?.observacoes,
          status: normalizedStatus,
          confirmado: normalizedStatus === 'CONFIRMADO',
          attendanceStatus: normalizedAttendanceStatus,
        },
      });

      if (!result.count) {
        throw new AppError(404, 'APPOINTMENT_NOT_FOUND', 'Appointment not found.');
      }

      return appointmentRepository.findByIdAndClinic(normalizedId, normalizedClinicId);
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
      }
      throw error;
    }
  },

  deleteAppointment: async ({ clinicId, id }) => {
    const normalizedClinicId = String(clinicId || '').trim();
    const normalizedId = String(id || '').trim();

    if (!normalizedClinicId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authenticated clinic context is required.');
    }
    if (!normalizedId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'id is required.');
    }

    try {
      await ensureAppointmentBelongsToClinic(normalizedClinicId, normalizedId);

      const result = await appointmentRepository.delete({
        id: normalizedId,
        clinicId: normalizedClinicId,
      });

      if (!result.count) {
        throw new AppError(404, 'APPOINTMENT_NOT_FOUND', 'Appointment not found.');
      }

      return { success: true };
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new AppError(503, 'RELATIONAL_SCHEMA_NOT_READY', 'Relational schema is not initialized yet.');
      }
      throw error;
    }
  },
};

module.exports = { VALID_STATUSES, VALID_ATTENDANCE_STATUSES, appointmentService };
