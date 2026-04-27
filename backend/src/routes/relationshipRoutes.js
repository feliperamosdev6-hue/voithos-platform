const express = require('express');
const { authenticate } = require('../middlewares/authenticate');
const { checkSubscription } = require('../middlewares/checkSubscription');
const { getRelationshipOverview } = require('../controllers/relationshipController');

const router = express.Router();

router.use(authenticate, checkSubscription);
router.get('/overview', getRelationshipOverview);

module.exports = router;
