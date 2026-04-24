const { authService } = require('../services/authService');
const { getAuthenticatedClinicId } = require('../utils/authContext');
const { stockService } = require('../services/stockService');

const resolveStockActor = async (req) => {
  const userId = String(req?.auth?.userId || '').trim();
  const token = String(req?.auth?.token || '').trim();
  if (!token) {
    return { userId, userName: '' };
  }

  try {
    const user = await authService.getCurrentUser(token);
    return {
      userId: userId || String(user?.id || '').trim(),
      userName: String(user?.nome || user?.fullName || '').trim(),
    };
  } catch (_error) {
    return { userId, userName: '' };
  }
};

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

const listStockMovements = async (req, res, next) => {
  try {
    const data = await stockService.listMovementsForClinic({
      clinicId: getAuthenticatedClinicId(req),
      itemId: req.params.itemId,
      limit: req.query?.limit,
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
      actor: await resolveStockActor(req),
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
      actor: await resolveStockActor(req),
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const createStockMovement = async (req, res, next) => {
  try {
    const data = await stockService.applyMovementForClinic({
      clinicId: getAuthenticatedClinicId(req),
      itemId: req.params.itemId,
      payload: req.body || {},
      actor: await resolveStockActor(req),
    });
    return res.status(201).json({ ok: true, data });
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
      actor: await resolveStockActor(req),
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
  listStockMovements,
  createStockItem,
  updateStockItem,
  createStockMovement,
  adjustStockQuantity,
  deactivateStockItem,
};
