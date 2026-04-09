const { Router } = require('express');
const { consumeAppointmentActionLink } = require('../controllers/publicAppointmentActionController');

const router = Router();

router.get('/:token', consumeAppointmentActionLink);

module.exports = router;
