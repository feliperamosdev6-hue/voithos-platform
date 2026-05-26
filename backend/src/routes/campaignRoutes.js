const express = require('express');
const { authenticate } = require('../middlewares/authenticate');
const { checkSubscription, requireSubscriptionAccess } = require('../middlewares/checkSubscription');
const {
  listTemplates,
  listCampaigns,
  getCampaignById,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  replaceCampaigns,
  resolveAudience,
  createBatch,
  updateDispatch,
  listDispatchLogs,
  getDashboard,
  getCampaignResult,
} = require('../controllers/campaignController');

const router = express.Router();
const requireWriteAccess = requireSubscriptionAccess('WRITE');

router.use(authenticate, checkSubscription);
router.get('/templates', listTemplates);
router.get('/', listCampaigns);
router.put('/', replaceCampaigns);
router.post('/', createCampaign);
router.get('/dashboard', getDashboard);
router.post('/resolve-audience', resolveAudience);
router.get('/logs', listDispatchLogs);
router.get('/:id', getCampaignById);
router.patch('/:id', updateCampaign);
router.delete('/:id', deleteCampaign);
router.post('/:id/batches', requireWriteAccess, createBatch);
router.get('/:id/result', getCampaignResult);
router.patch('/dispatches/:dispatchId', requireWriteAccess, updateDispatch);

module.exports = router;
