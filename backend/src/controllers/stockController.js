const { getAuthenticatedClinicId } = require('../utils/authContext');
const { stockService } = require('../services/stockService');

const listStockItems = async (req, res, next) => {
  try {
    const data = await stockService.listByClinic({
      clinicId: getAuthenticatedClinicId(req),
      includeInactive: String(req.query?.includeInactive || '').trim().toLowerCase() === 'true',
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const createStockItem = async (req, res, next) => {
  try {
    const data = await stockService.createForClinic({
      clinicId: getAuthenticatedClinicId(req),
      payload: req.body || {},
    });
    return res.status(201).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const updateStockItem = async (req, res, next) => {
  try {
    const data = await stockService.updateForClinic({
      clinicId: getAuthenticatedClinicId(req),
      itemId: req.params.itemId,
      payload: req.body || {},
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const adjustStockQuantity = async (req, res, next) => {
  try {
    const data = await stockService.adjustQuantityForClinic({
      clinicId: getAuthenticatedClinicId(req),
      itemId: req.params.itemId,
      quantity: req.body?.currentQuantity ?? req.body?.quantidadeAtual ?? req.body?.estoqueAtual,
      notes: req.body?.notes || req.body?.observacoes || '',
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const deactivateStockItem = async (req, res, next) => {
  try {
    const data = await stockService.deactivateForClinic({
      clinicId: getAuthenticatedClinicId(req),
      itemId: req.params.itemId,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listStockItems,
  createStockItem,
  updateStockItem,
  adjustStockQuantity,
  deactivateStockItem,
};
