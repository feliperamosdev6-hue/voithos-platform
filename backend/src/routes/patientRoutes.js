const express = require('express');
const { authenticate } = require('../middlewares/authenticate');
const { validate } = require('../middlewares/validate');
const {
  createPatient,
  deletePatient,
  getPatientById,
  listPatients,
  updatePatient,
} = require('../controllers/patientController');

const router = express.Router();

const validateCreatePatient = validate((req) => {
  const issues = [];
  if (!String(req.body?.nome || '').trim()) {
    issues.push({ field: 'nome', message: 'nome is required.' });
  }
  return issues;
});

router.use(authenticate);

router.get('/', listPatients);
router.get('/:id', getPatientById);
router.post('/', validateCreatePatient, createPatient);
router.patch('/:id', validateCreatePatient, updatePatient);
router.delete('/:id', deletePatient);

module.exports = router;
