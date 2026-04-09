const express = require('express');
const { authenticate } = require('../middlewares/authenticate');
const {
  listClinics,
  getMyOperationalSettings,
  updateMyOperationalSettings,
  getMyClinicProfile,
  updateMyClinicProfile,
  listMyCampaigns,
  replaceMyCampaigns,
  createMyCampaign,
  updateMyCampaign,
  deleteMyCampaign,
} = require('../controllers/clinicController');

const router = express.Router();

router.get('/', listClinics);
router.use(authenticate);
router.get('/me/operational-settings', getMyOperationalSettings);
router.patch('/me/operational-settings', updateMyOperationalSettings);
router.get('/me/profile', getMyClinicProfile);
router.patch('/me/profile', updateMyClinicProfile);
router.get('/me/campaigns', listMyCampaigns);
router.put('/me/campaigns', replaceMyCampaigns);
router.post('/me/campaigns', createMyCampaign);
router.patch('/me/campaigns/:id', updateMyCampaign);
router.delete('/me/campaigns/:id', deleteMyCampaign);

module.exports = router;
