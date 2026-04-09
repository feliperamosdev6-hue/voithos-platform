const express = require('express');
const { serviceAuthenticate } = require('../middlewares/serviceAuthenticate');
const {
  listOrders,
  createOrder,
  getOrder,
  updateOrder,
  updateOrderStatus,
  cancelOrder,
  deleteOrder,
  addOrderItem,
  updateOrderItem,
  deleteOrderItem,
  getDashboardSummary,
} = require('../controllers/internalLaboratoryController');

const router = express.Router();

router.use(serviceAuthenticate);

router.get('/orders', listOrders);
router.post('/orders', createOrder);
router.get('/orders/:orderId', getOrder);
router.patch('/orders/:orderId', updateOrder);
router.patch('/orders/:orderId/status', updateOrderStatus);
router.post('/orders/:orderId/cancel', cancelOrder);
router.delete('/orders/:orderId', deleteOrder);
router.post('/orders/:orderId/items', addOrderItem);
router.patch('/orders/:orderId/items/:itemId', updateOrderItem);
router.delete('/orders/:orderId/items/:itemId', deleteOrderItem);
router.get('/dashboard', getDashboardSummary);

module.exports = router;
