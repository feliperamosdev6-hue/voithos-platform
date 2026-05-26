const express = require('express');
const { authenticate } = require('../middlewares/authenticate');
const { checkSubscription, requireSubscriptionAccess } = require('../middlewares/checkSubscription');
const { validate } = require('../middlewares/validate');
const {
  createPatient,
  deletePatient,
  downloadPatientProfilePhoto,
  getPatientById,
  listPatients,
  updatePatient,
  uploadPatientProfilePhoto,
} = require('../controllers/patientController');

const router = express.Router();
const requireWriteAccess = requireSubscriptionAccess('WRITE');

const validateCreatePatient = validate((req) => {
  const issues = [];
  if (!String(req.body?.nome || req.body?.fullName || req.body?.name || '').trim()) {
    issues.push({ field: 'nome', message: 'nome is required.' });
  }
  return issues;
});

router.use(authenticate, checkSubscription);

router.get('/', listPatients);
router.put(
  '/:id/profile-photo',
  requireWriteAccess,
  express.raw({ type: '*/*', limit: '2mb' }),
  uploadPatientProfilePhoto
);
router.get('/:id/profile-photo', downloadPatientProfilePhoto);
router.get('/:id', getPatientById);
router.post('/', requireWriteAccess, validateCreatePatient, createPatient);
router.patch('/:id', requireWriteAccess, validateCreatePatient, updatePatient);
router.delete('/:id', requireWriteAccess, deletePatient);

module.exports = router;
