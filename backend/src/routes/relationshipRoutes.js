const express = require('express');
const { authenticate } = require('../middlewares/authenticate');
const { getRelationshipOverview } = require('../controllers/relationshipController');

const router = express.Router();

router.use(authenticate);
router.get('/overview', getRelationshipOverview);

module.exports = router;
