const express = require('express');
const { authenticate } = require('../middlewares/authenticate');
const { authenticateOptional } = require('../middlewares/authenticateOptional');
const {
  listClinics,
  createClinicBootstrap,
  getMyOperationalSettings,
  updateMyOperationalSettings,
  getMyClinicProfile,
  updateMyClinicProfile,
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

router.get('/', authenticateOptional, listClinics);
router.use(authenticate);
router.post('/bootstrap', createClinicBootstrap);
router.get('/me/operational-settings', getMyOperationalSettings);
router.patch('/me/operational-settings', updateMyOperationalSettings);
router.get('/me/profile', getMyClinicProfile);
router.patch('/me/profile', updateMyClinicProfile);
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
