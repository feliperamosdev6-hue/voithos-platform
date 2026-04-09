const express = require('express');
const { serviceAuthenticate } = require('../middlewares/serviceAuthenticate');
const { getInternalRelationshipOverview } = require('../controllers/internalRelationshipController');

const router = express.Router();

router.use(serviceAuthenticate);
router.get('/overview', getInternalRelationshipOverview);

module.exports = router;
