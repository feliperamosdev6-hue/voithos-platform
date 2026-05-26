const express = require('express');
const { authenticate } = require('../middlewares/authenticate');
const { checkSubscription, requireSubscriptionAccess } = require('../middlewares/checkSubscription');
const {
  getPatientClinicalRecord,
  listPatientProcedures,
  upsertPatientProcedure,
  deletePatientProcedure,
  listPatientDocuments,
  upsertPatientDocument,
  uploadPatientDocumentFile,
  downloadPatientDocumentFile,
  createPatientAnamnesis,
  listPatientAnamneses,
  createPatientClinicalNote,
  updatePatientClinicalNote,
} = require('../controllers/clinicalController');

const router = express.Router();
const requireWriteAccess = requireSubscriptionAccess('WRITE');

router.use(authenticate, checkSubscription);
router.get('/patients/:patientId/clinical-record', getPatientClinicalRecord);
router.get('/patients/:patientId/procedures', listPatientProcedures);
router.post('/patients/:patientId/procedures', requireWriteAccess, upsertPatientProcedure);
router.delete('/patients/:patientId/procedures/:externalId', requireWriteAccess, deletePatientProcedure);
router.get('/patients/:patientId/documents', listPatientDocuments);
router.post('/patients/:patientId/documents', requireWriteAccess, upsertPatientDocument);
router.put(
  '/patients/:patientId/documents/:externalDocumentId/file',
  requireWriteAccess,
  express.raw({ type: '*/*', limit: '30mb' }),
  uploadPatientDocumentFile
);
router.get('/patients/:patientId/documents/:externalDocumentId/file', downloadPatientDocumentFile);
router.get('/patients/:patientId/anamneses', listPatientAnamneses);
router.post('/patients/:patientId/anamneses', requireWriteAccess, createPatientAnamnesis);
router.post('/patients/:patientId/clinical-notes', requireWriteAccess, createPatientClinicalNote);
router.patch('/patients/:patientId/clinical-notes/:sourceDocumentId', requireWriteAccess, updatePatientClinicalNote);

module.exports = router;
