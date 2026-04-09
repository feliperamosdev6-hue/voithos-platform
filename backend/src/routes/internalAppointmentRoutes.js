const express = require('express');
const {
  listInternalAppointments,
  getInternalAppointmentById,
  createInternalAppointment,
  updateInternalAppointment,
  updateInternalAppointmentAttendance,
  updateInternalAppointmentStatus,
  deleteInternalAppointment,
  resolveInternalAppointmentId,
  sendInternalAppointmentConfirmation,
  sendInternalAppointmentReminder,
} = require('../controllers/internalAppointmentController');
const { serviceAuthenticate } = require('../middlewares/serviceAuthenticate');

const router = express.Router();

router.use(serviceAuthenticate);
router.get('/', listInternalAppointments);
router.get('/:id', getInternalAppointmentById);
router.post('/', createInternalAppointment);
router.post('/resolve', resolveInternalAppointmentId);
router.patch('/:id', updateInternalAppointment);
router.patch('/:id/status', updateInternalAppointmentStatus);
router.patch('/:id/attendance', updateInternalAppointmentAttendance);
router.delete('/:id', deleteInternalAppointment);
router.post('/:id/send-confirmation', sendInternalAppointmentConfirmation);
router.post('/:id/send-reminder', sendInternalAppointmentReminder);

module.exports = router;
