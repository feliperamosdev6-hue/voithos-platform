const express = require('express');
const {
  listInternalPatients,
  getInternalPatientById,
  createInternalPatient,
  updateInternalPatient,
  deleteInternalPatient,
} = require('../controllers/internalPatientController');
const { serviceAuthenticate } = require('../middlewares/serviceAuthenticate');

const router = express.Router();

router.use(serviceAuthenticate);
router.get('/', listInternalPatients);
router.get('/:id', getInternalPatientById);
router.post('/', createInternalPatient);
router.patch('/:id', updateInternalPatient);
router.delete('/:id', deleteInternalPatient);

module.exports = router;
