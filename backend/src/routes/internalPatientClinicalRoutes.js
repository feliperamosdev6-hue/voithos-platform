const express = require('express');
const { serviceAuthenticate } = require('../middlewares/serviceAuthenticate');
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
} = require('../controllers/internalPatientClinicalController');

const router = express.Router();

router.use(serviceAuthenticate);
router.get('/patients/:patientId/clinical-record', getPatientClinicalRecord);
router.get('/patients/:patientId/procedures', listPatientProcedures);
router.post('/patients/:patientId/procedures', upsertPatientProcedure);
router.delete('/patients/:patientId/procedures/:externalId', deletePatientProcedure);
router.get('/patients/:patientId/documents', listPatientDocuments);
router.post('/patients/:patientId/documents', upsertPatientDocument);
router.put(
  '/patients/:patientId/documents/:externalDocumentId/file',
  express.raw({ type: '*/*', limit: '30mb' }),
  uploadPatientDocumentFile
);
router.get('/patients/:patientId/documents/:externalDocumentId/file', downloadPatientDocumentFile);
router.get('/patients/:patientId/anamneses', listPatientAnamneses);
router.post('/patients/:patientId/anamneses', createPatientAnamnesis);
router.post('/patients/:patientId/clinical-notes', createPatientClinicalNote);
router.patch('/patients/:patientId/clinical-notes/:sourceDocumentId', updatePatientClinicalNote);

module.exports = router;
