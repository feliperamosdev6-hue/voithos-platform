const express = require('express');
const { authenticate } = require('../middlewares/authenticate');
const { checkSubscription } = require('../middlewares/checkSubscription');
const { validate } = require('../middlewares/validate');
const {
  createAppointment,
  deleteAppointment,
  getAppointmentById,
  listAppointments,
  sendAppointmentConfirmation,
  sendAppointmentReminder,
  updateAppointment,
  updateAppointmentAttendance,
  updateAppointmentStatus,
} = require('../controllers/appointmentController');

const router = express.Router();

const validateCreateAppointment = validate((req) => {
  const issues = [];
  if (!String(req.body?.patientId || '').trim()) {
    issues.push({ field: 'patientId', message: 'patientId is required.' });
  }
  const dateValue = String(req.body?.dataHora || '').trim();
  if (!dateValue) {
    issues.push({ field: 'dataHora', message: 'dataHora is required.' });
  } else if (Number.isNaN(new Date(dateValue).getTime())) {
    issues.push({ field: 'dataHora', message: 'dataHora is invalid.' });
  }
  const endDateValue = String(req.body?.horaFim || '').trim();
  if (endDateValue && Number.isNaN(new Date(endDateValue).getTime())) {
    issues.push({ field: 'horaFim', message: 'horaFim is invalid.' });
  }
  return issues;
});

const validateUpdateStatus = validate((req) => {
  const issues = [];
  const status = String(req.body?.status || '').trim().toUpperCase();
  if (!status) {
    issues.push({ field: 'status', message: 'status is required.' });
  } else if (!['AGENDADO', 'CONFIRMADO', 'CONCLUIDO', 'NAO_COMPARECEU', 'CANCELADO', 'REMARCAR'].includes(status)) {
    issues.push({ field: 'status', message: 'status is invalid.' });
  }
  return issues;
});

const validateUpdateAppointment = validate((req) => {
  const issues = [];
  const dateValue = String(req.body?.dataHora || '').trim();
  if (!dateValue) {
    issues.push({ field: 'dataHora', message: 'dataHora is required.' });
  } else if (Number.isNaN(new Date(dateValue).getTime())) {
    issues.push({ field: 'dataHora', message: 'dataHora is invalid.' });
  }

  const endDateValue = String(req.body?.horaFim || '').trim();
  if (endDateValue && Number.isNaN(new Date(endDateValue).getTime())) {
    issues.push({ field: 'horaFim', message: 'horaFim is invalid.' });
  }

  const status = String(req.body?.status || '').trim().toUpperCase();
  if (!status) {
    issues.push({ field: 'status', message: 'status is required.' });
  } else if (!['AGENDADO', 'CONFIRMADO', 'CONCLUIDO', 'NAO_COMPARECEU', 'CANCELADO', 'REMARCAR'].includes(status)) {
    issues.push({ field: 'status', message: 'status is invalid.' });
  }

  return issues;
});

const validateUpdateAttendance = validate((req) => {
  const issues = [];
  const attendanceStatus = String(req.body?.attendanceStatus || '').trim().toUpperCase();
  if (attendanceStatus && !['ATTENDED', 'NO_SHOW'].includes(attendanceStatus)) {
    issues.push({ field: 'attendanceStatus', message: 'attendanceStatus is invalid.' });
  }
  return issues;
});

router.use(authenticate, checkSubscription);

router.get('/', listAppointments);
router.get('/:id', getAppointmentById);
router.post('/', validateCreateAppointment, createAppointment);
router.post('/:id/send-confirmation', sendAppointmentConfirmation);
router.post('/:id/send-reminder', sendAppointmentReminder);
router.patch('/:id', validateUpdateAppointment, updateAppointment);
router.patch('/:id/status', validateUpdateStatus, updateAppointmentStatus);
router.patch('/:id/attendance', validateUpdateAttendance, updateAppointmentAttendance);
router.delete('/:id', deleteAppointment);

module.exports = router;
