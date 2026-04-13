const { outboundMessageService } = require('../services/outboundMessageService');
const { appointmentService } = require('../services/appointmentService');
const { appointmentRepository } = require('../repositories/appointmentRepository');
const { patientRepository } = require('../repositories/patientRepository');
const { AppError } = require('../errors/AppError');

const normalizeText = (value) => String(value || '').trim().toLowerCase();
const normalizeDigits = (value) => String(value || '').replace(/\D/g, '');

const buildDayWindow = (dateValue, timeValue) => {
  const date = String(dateValue || '').trim();
  const time = String(timeValue || '').trim();
  if (!date) return null;
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(`${date}T23:59:59.999Z`);
  const timeIso = time ? new Date(`${date}T${time}:00.000Z`) : null;
  return {
    start,
    end,
    timeIso: timeIso && !Number.isNaN(timeIso.getTime()) ? timeIso : null,
  };
};

const resolveInternalAppointment = async ({ clinicId, appointment = {}, patient = {} }) => {
  const candidateIds = [
    appointment?.id,
    appointment?.appointmentId,
    appointment?.remoteId,
    appointment?.centralAppointmentId,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  for (const candidateId of candidateIds) {
    const direct = await appointmentRepository.findByIdAndClinic(candidateId, clinicId);
    if (direct) return direct;
  }

  const dateWindow = buildDayWindow(appointment?.data, appointment?.horaInicio);
  if (!dateWindow) {
    throw new AppError(404, 'APPOINTMENT_NOT_FOUND', 'Consulta não encontrada no backend central para esta clínica.');
  }

  const appointments = await appointmentRepository.listByClinic({
    clinicId,
    from: dateWindow.start,
    to: dateWindow.end,
  });

  const expectedProfessionalId = String(appointment?.dentistaId || appointment?.profissionalId || '').trim();
  const expectedPatientId = String(appointment?.patientId || appointment?.pacienteId || appointment?.prontuario || '').trim();
  const expectedPatientName = normalizeText(patient?.nome || patient?.fullName || appointment?.pacienteNome || appointment?.paciente);
  const expectedPhone = normalizeDigits(patient?.telefone || patient?.phone || patient?.celular || patient?.whatsapp || appointment?.telefone);

  for (const candidate of appointments) {
    if (dateWindow.timeIso && new Date(candidate.dataHora).getTime() !== dateWindow.timeIso.getTime()) continue;
    if (expectedProfessionalId && String(candidate.profissionalId || '').trim() !== expectedProfessionalId) continue;
    if (expectedPatientId && String(candidate.patientId || '').trim() === expectedPatientId) return candidate;

    const candidatePatient = await patientRepository.findByIdAndClinic(candidate.patientId, clinicId).catch(() => null);
    const candidateName = normalizeText(candidatePatient?.nome);
    const candidatePhone = normalizeDigits(candidatePatient?.telefone);
    if (expectedPhone && candidatePhone && expectedPhone === candidatePhone) return candidate;
    if (expectedPatientName && candidateName && expectedPatientName === candidateName) return candidate;
  }

  throw new AppError(404, 'APPOINTMENT_NOT_FOUND', 'Consulta não encontrada no backend central para esta clínica.');
};

const sendInternalAppointmentConfirmation = async (req, res, next) => {
  try {
    const clinicId = String(req.body?.clinicId || '').trim();
    const appointmentId = String(req.params.id || '').trim();
    const data = await outboundMessageService.sendAppointmentConfirmation({
      clinicId,
      appointmentId,
    });
    const statusCode = data?.deduped === true || data?.alreadyResolved === true ? 200 : 201;
    return res.status(statusCode).json({
      ok: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

const listInternalAppointments = async (req, res, next) => {
  try {
    const data = await appointmentService.listAppointments({
      clinicId: String(req.query?.clinicId || '').trim(),
      from: req.query?.from,
      to: req.query?.to,
      patientId: req.query?.patientId,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const getInternalAppointmentById = async (req, res, next) => {
  try {
    const data = await appointmentService.getAppointmentById({
      clinicId: String(req.query?.clinicId || req.body?.clinicId || '').trim(),
      id: req.params.id,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const createInternalAppointment = async (req, res, next) => {
  try {
    const clinicId = String(req.body?.clinicId || '').trim();
    const input = { ...(req.body || {}) };
    delete input.clinicId;
    const data = await appointmentService.createAppointment({ clinicId, input });
    return res.status(201).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const updateInternalAppointment = async (req, res, next) => {
  try {
    const clinicId = String(req.body?.clinicId || '').trim();
    const input = { ...(req.body || {}) };
    delete input.clinicId;
    const data = await appointmentService.updateAppointment({
      clinicId,
      id: req.params.id,
      input,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const updateInternalAppointmentStatus = async (req, res, next) => {
  try {
    const data = await appointmentService.updateAppointmentStatus({
      clinicId: String(req.body?.clinicId || '').trim(),
      id: req.params.id,
      status: req.body?.status,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const updateInternalAppointmentAttendance = async (req, res, next) => {
  try {
    const data = await appointmentService.updateAppointmentAttendance({
      clinicId: String(req.body?.clinicId || '').trim(),
      id: req.params.id,
      attendanceStatus: req.body?.attendanceStatus,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const deleteInternalAppointment = async (req, res, next) => {
  try {
    const data = await appointmentService.deleteAppointment({
      clinicId: String(req.query?.clinicId || req.body?.clinicId || '').trim(),
      id: req.params.id,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const sendInternalAppointmentReminder = async (req, res, next) => {
  try {
    const clinicId = String(req.body?.clinicId || '').trim();
    const appointmentId = String(req.params.id || '').trim();
    const data = await outboundMessageService.sendAppointmentReminder({
      clinicId,
      appointmentId,
    });
    return res.status(201).json({
      ok: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
};

const resolveInternalAppointmentId = async (req, res, next) => {
  try {
    const clinicId = String(req.body?.clinicId || '').trim();
    const appointment = req.body?.appointment || {};
    const patient = req.body?.patient || {};
    const resolved = await resolveInternalAppointment({ clinicId, appointment, patient });
    return res.status(200).json({
      ok: true,
      data: {
        id: resolved.id,
        clinicId: resolved.clinicId,
        patientId: resolved.patientId,
      },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listInternalAppointments,
  getInternalAppointmentById,
  createInternalAppointment,
  updateInternalAppointment,
  updateInternalAppointmentStatus,
  updateInternalAppointmentAttendance,
  deleteInternalAppointment,
  resolveInternalAppointmentId,
  sendInternalAppointmentConfirmation,
  sendInternalAppointmentReminder,
};
