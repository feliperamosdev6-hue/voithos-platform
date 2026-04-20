const express = require('express');
const multer = require('multer');
const { authenticate } = require('../middlewares/authenticate');
const { authenticateOptional } = require('../middlewares/authenticateOptional');
const {
  listClinics,
  createClinicBootstrap,
  getMyOperationalSettings,
  updateMyOperationalSettings,
  getMyClinicProfile,
  updateMyClinicProfile,
  exportMyClinicData,
  previewMyClinicImport,
  applyMyClinicImport,
  previewMyPatientImport,
  applyMyPatientImport,
  previewMyAppointmentImport,
  applyMyAppointmentImport,
  previewMyClinicalImport,
  applyMyClinicalImport,
  previewMyCashflowImport,
  applyMyCashflowImport,
  previewMyProceduresImport,
  applyMyProceduresImport,
  getMyWhatsAppEngineHealth,
  getMyWhatsAppConnection,
  refreshMyWhatsAppConnection,
  connectMyWhatsApp,
  listMyCampaigns,
  replaceMyCampaigns,
  createMyCampaign,
  updateMyCampaign,
  deleteMyCampaign,
} = require('../controllers/clinicController');

const router = express.Router();
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 30 * 1024 * 1024,
  },
});

router.get('/', authenticateOptional, listClinics);
router.use(authenticate);
router.post('/bootstrap', createClinicBootstrap);
router.get('/me/operational-settings', getMyOperationalSettings);
router.patch('/me/operational-settings', updateMyOperationalSettings);
router.get('/me/profile', getMyClinicProfile);
router.patch('/me/profile', updateMyClinicProfile);
router.get('/me/data-export', exportMyClinicData);
router.post('/me/data-import/preview', previewMyClinicImport);
router.post('/me/data-import/apply', applyMyClinicImport);
router.post('/me/data-import/patients/preview', importUpload.single('file'), previewMyPatientImport);
router.post('/me/data-import/patients/apply', importUpload.single('file'), applyMyPatientImport);
router.post('/me/data-import/agenda/preview', importUpload.single('file'), previewMyAppointmentImport);
router.post('/me/data-import/agenda/apply', importUpload.single('file'), applyMyAppointmentImport);
router.post('/me/data-import/clinical/preview', importUpload.single('file'), previewMyClinicalImport);
router.post('/me/data-import/clinical/apply', importUpload.single('file'), applyMyClinicalImport);
router.post('/me/data-import/cashflow/preview', importUpload.single('file'), previewMyCashflowImport);
router.post('/me/data-import/cashflow/apply', importUpload.single('file'), applyMyCashflowImport);
router.post('/me/data-import/procedures/preview', importUpload.single('file'), previewMyProceduresImport);
router.post('/me/data-import/procedures/apply', importUpload.single('file'), applyMyProceduresImport);
router.get('/me/whatsapp/health', getMyWhatsAppEngineHealth);
router.get('/me/whatsapp/connection', getMyWhatsAppConnection);
router.post('/me/whatsapp/connection/refresh', refreshMyWhatsAppConnection);
router.post('/me/whatsapp/connect', connectMyWhatsApp);
router.get('/me/campaigns', listMyCampaigns);
router.put('/me/campaigns', replaceMyCampaigns);
router.post('/me/campaigns', createMyCampaign);
router.patch('/me/campaigns/:id', updateMyCampaign);
router.delete('/me/campaigns/:id', deleteMyCampaign);

module.exports = router;
