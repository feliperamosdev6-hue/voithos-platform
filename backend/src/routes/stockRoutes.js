const express = require('express');
const { authenticate } = require('../middlewares/authenticate');
const { checkSubscription } = require('../middlewares/checkSubscription');
const {
  listStockItems,
  listStockMovements,
  createStockItem,
  updateStockItem,
  createStockMovement,
  adjustStockQuantity,
  deactivateStockItem,
} = require('../controllers/stockController');

const router = express.Router();

router.use(authenticate, checkSubscription);

router.get('/items', listStockItems);
router.post('/items', createStockItem);
router.patch('/items/:itemId', updateStockItem);
router.get('/items/:itemId/movements', listStockMovements);
router.post('/items/:itemId/movements', createStockMovement);
router.patch('/items/:itemId/quantity', adjustStockQuantity);
router.delete('/items/:itemId', deactivateStockItem);

module.exports = router;
