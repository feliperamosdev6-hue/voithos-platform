const { laboratoryService } = require('../services/laboratoryService');

const listOrders = async (req, res, next) => {
  try {
    const clinicId = String(req.query?.clinicId || '').trim();
    const patientId = String(req.query?.patientId || '').trim();
    const data = patientId
      ? await laboratoryService.listOrdersByPatient({ clinicId, patientId })
      : await laboratoryService.listOrdersByClinic({ clinicId });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const createOrder = async (req, res, next) => {
  try {
    const data = await laboratoryService.createOrder({
      clinicId: String(req.body?.clinicId || '').trim(),
      payload: req.body || {},
    });
    return res.status(201).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const getOrder = async (req, res, next) => {
  try {
    const data = await laboratoryService.getOrderById({
      clinicId: String(req.query?.clinicId || '').trim(),
      orderId: req.params.orderId,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const updateOrder = async (req, res, next) => {
  try {
    const data = await laboratoryService.updateOrder({
      clinicId: String(req.body?.clinicId || req.query?.clinicId || '').trim(),
      orderId: req.params.orderId,
      payload: req.body || {},
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const updateOrderStatus = async (req, res, next) => {
  try {
    const data = await laboratoryService.updateOrderStatus({
      clinicId: String(req.body?.clinicId || '').trim(),
      orderId: req.params.orderId,
      status: req.body?.status,
      notes: req.body?.notes || req.body?.observacoes || '',
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const cancelOrder = async (req, res, next) => {
  try {
    const data = await laboratoryService.cancelOrder({
      clinicId: String(req.body?.clinicId || req.query?.clinicId || '').trim(),
      orderId: req.params.orderId,
      notes: req.body?.notes || req.body?.observacoes || '',
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const deleteOrder = async (req, res, next) => {
  try {
    const data = await laboratoryService.deleteOrder({
      clinicId: String(req.query?.clinicId || req.body?.clinicId || '').trim(),
      orderId: req.params.orderId,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const addOrderItem = async (req, res, next) => {
  try {
    const data = await laboratoryService.addOrderItem({
      clinicId: String(req.body?.clinicId || '').trim(),
      orderId: req.params.orderId,
      item: req.body?.item || req.body || {},
    });
    return res.status(201).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const updateOrderItem = async (req, res, next) => {
  try {
    const data = await laboratoryService.updateOrderItem({
      clinicId: String(req.body?.clinicId || req.query?.clinicId || '').trim(),
      itemId: req.params.itemId,
      item: req.body?.item || req.body || {},
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const deleteOrderItem = async (req, res, next) => {
  try {
    const data = await laboratoryService.deleteOrderItem({
      clinicId: String(req.query?.clinicId || req.body?.clinicId || '').trim(),
      itemId: req.params.itemId,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const getDashboardSummary = async (req, res, next) => {
  try {
    const data = await laboratoryService.getLaboratoryDashboardSummary({
      clinicId: String(req.query?.clinicId || '').trim(),
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
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
};
