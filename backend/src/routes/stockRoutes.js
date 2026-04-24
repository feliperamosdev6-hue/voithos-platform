const express = require('express');
const { authenticate } = require('../middlewares/authenticate');
const {
  listStockItems,
  createStockItem,
  updateStockItem,
  adjustStockQuantity,
  deactivateStockItem,
} = require('../controllers/stockController');

const router = express.Router();

router.use(authenticate);

router.get('/items', listStockItems);
router.post('/items', createStockItem);
router.patch('/items/:itemId', updateStockItem);
router.patch('/items/:itemId/quantity', adjustStockQuantity);
router.delete('/items/:itemId', deactivateStockItem);

module.exports = router;
