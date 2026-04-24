const { prisma } = require('../db/prisma');
const { AppError } = require('../errors/AppError');
const { stockRepository } = require('../repositories/stockRepository');

const cleanText = (value) => String(value || '').trim();
const toIntegerQuantity = (value, fieldName) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be a non-negative number.`);
  }
  return Math.trunc(number);
};

const normalizeStockItem = (item = {}) => ({
  id: item.id,
  clinicId: item.clinicId,
  name: item.name,
  category: item.category,
  unit: item.unit,
  currentQuantity: Number(item.currentQuantity || 0),
  minimumQuantity: Number(item.minimumQuantity || 0),
  notes: item.notes || '',
  active: item.active !== false,
  estoqueAtual: Number(item.currentQuantity || 0),
  estoqueMinimo: Number(item.minimumQuantity || 0),
  quantidadeAtual: Number(item.currentQuantity || 0),
  quantidade: Number(item.currentQuantity || 0),
  createdAt: item.createdAt?.toISOString?.() || null,
  updatedAt: item.updatedAt?.toISOString?.() || null,
});

const normalizeMovementType = (value) => {
  const type = cleanText(value).toLowerCase();
  if (['entrada', 'in', 'income', 'add'].includes(type)) return 'entrada';
  if (['baixa', 'saida', 'out', 'remove'].includes(type)) return 'baixa';
  if (['ajuste', 'adjust', 'update', 'atualizacao'].includes(type)) return 'ajuste';
  return '';
};

const normalizeMovement = (movement = {}) => ({
  id: movement.id,
  clinicId: movement.clinicId,
  stockItemId: movement.stockItemId,
  type: normalizeMovementType(movement.type) || cleanText(movement.type).toLowerCase(),
  quantity: Math.abs(Number(movement.quantityDelta || 0)),
  quantityDelta: Number(movement.quantityDelta || 0),
  quantityBefore: movement.quantityBefore === null || movement.quantityBefore === undefined
    ? null
    : Number(movement.quantityBefore),
  quantityAfter: movement.quantityAfter === null || movement.quantityAfter === undefined
    ? null
    : Number(movement.quantityAfter),
  reason: movement.notes || '',
  notes: movement.notes || '',
  performedByUserId: movement.performedByUserId || '',
  performedByUserName: movement.performedByUserName || '',
  createdAt: movement.createdAt?.toISOString?.() || null,
});

const validateBasePayload = (payload = {}, { requireQuantity = true } = {}) => {
  const name = cleanText(payload?.name || payload?.nome);
  const category = cleanText(payload?.category || payload?.categoria);
  const unit = cleanText(payload?.unit || payload?.unidade);
  const notes = cleanText(payload?.notes || payload?.observacoes || '');
  const active = payload?.active === undefined ? true : payload.active !== false;
  const hasCurrentQuantity = payload?.currentQuantity !== undefined || payload?.quantidadeAtual !== undefined || payload?.estoqueAtual !== undefined;
  const hasMinimumQuantity = payload?.minimumQuantity !== undefined || payload?.estoqueMinimo !== undefined;

  if (!name) throw new AppError(400, 'VALIDATION_ERROR', 'name is required.');
  if (!category) throw new AppError(400, 'VALIDATION_ERROR', 'category is required.');
  if (!unit) throw new AppError(400, 'VALIDATION_ERROR', 'unit is required.');
  if (requireQuantity && !hasCurrentQuantity) {
    throw new AppError(400, 'VALIDATION_ERROR', 'currentQuantity is required.');
  }
  if (requireQuantity && !hasMinimumQuantity) {
    throw new AppError(400, 'VALIDATION_ERROR', 'minimumQuantity is required.');
  }

  const currentQuantity = hasCurrentQuantity
    ? toIntegerQuantity(payload.currentQuantity ?? payload.quantidadeAtual ?? payload.estoqueAtual, 'currentQuantity')
    : undefined;
  const minimumQuantity = hasMinimumQuantity
    ? toIntegerQuantity(payload.minimumQuantity ?? payload.estoqueMinimo, 'minimumQuantity')
    : undefined;

  return {
    name,
    category,
    unit,
    notes: notes || null,
    active,
    currentQuantity,
    minimumQuantity,
  };
};

const resolveMovementReason = (payload = {}, fallback = '') => {
  const reason = cleanText(payload?.reason || payload?.motivo || payload?.notes || payload?.observacoes || fallback);
  if (!reason) {
    throw new AppError(400, 'VALIDATION_ERROR', 'reason is required.');
  }
  return reason;
};

const stockService = {
  listByClinic: async ({ clinicId, includeInactive = false } = {}) => {
    const normalizedClinicId = cleanText(clinicId);
    if (!normalizedClinicId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
    }

    const items = await stockRepository.listByClinic({
      clinicId: normalizedClinicId,
      includeInactive: includeInactive === true,
    });
    return (Array.isArray(items) ? items : []).map(normalizeStockItem);
  },

  listMovementsForClinic: async ({ clinicId, itemId, limit = 20 } = {}) => {
    const normalizedClinicId = cleanText(clinicId);
    const normalizedItemId = cleanText(itemId);
    if (!normalizedClinicId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
    }
    if (!normalizedItemId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'itemId is required.');
    }

    const item = await stockRepository.findByIdAndClinic({
      clinicId: normalizedClinicId,
      itemId: normalizedItemId,
    });
    if (!item) {
      throw new AppError(404, 'STOCK_ITEM_NOT_FOUND', 'Stock item not found for this clinic.');
    }

    const movements = await stockRepository.listMovementsByClinicAndItem({
      clinicId: normalizedClinicId,
      itemId: normalizedItemId,
      limit,
    });

    return (Array.isArray(movements) ? movements : []).map(normalizeMovement);
  },

  createForClinic: async ({ clinicId, payload = {}, actor = {} } = {}) => {
    const normalizedClinicId = cleanText(clinicId);
    if (!normalizedClinicId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authenticated clinic context is required.');
    }

    const base = validateBasePayload(payload, { requireQuantity: true });

    const result = await prisma.$transaction(async (tx) => {
      const created = await stockRepository.create({
        clinicId: normalizedClinicId,
        name: base.name,
        category: base.category,
        unit: base.unit,
        currentQuantity: base.currentQuantity,
        minimumQuantity: base.minimumQuantity,
        notes: base.notes,
        active: base.active,
      }, tx);

      let movement = null;
      if (Number(created.currentQuantity || 0) > 0) {
        movement = await stockRepository.createMovement({
          clinicId: normalizedClinicId,
          stockItemId: created.id,
          type: 'entrada',
          quantityDelta: Number(created.currentQuantity || 0),
          quantityBefore: 0,
          quantityAfter: Number(created.currentQuantity || 0),
          notes: 'Estoque inicial.',
          performedByUserId: cleanText(actor?.userId || '') || null,
          performedByUserName: cleanText(actor?.userName || '') || null,
        }, tx);
      }

      return { created, movement };
    });

    return {
      ...normalizeStockItem(result.created),
      movement: result.movement ? normalizeMovement(result.movement) : null,
    };
  },

  updateForClinic: async ({ clinicId, itemId, payload = {}, actor = {} } = {}) => {
    const normalizedClinicId = cleanText(clinicId);
    const normalizedItemId = cleanText(itemId);
    if (!normalizedClinicId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authenticated clinic context is required.');
    }
    if (!normalizedItemId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'itemId is required.');
    }

    const current = await stockRepository.findByIdAndClinic({
      clinicId: normalizedClinicId,
      itemId: normalizedItemId,
    });
    if (!current) {
      throw new AppError(404, 'STOCK_ITEM_NOT_FOUND', 'Stock item not found for this clinic.');
    }

    const base = validateBasePayload(payload, { requireQuantity: false });
    const nextQuantity = payload?.currentQuantity !== undefined || payload?.quantidadeAtual !== undefined || payload?.estoqueAtual !== undefined
      ? toIntegerQuantity(payload.currentQuantity ?? payload.quantidadeAtual ?? payload.estoqueAtual, 'currentQuantity')
      : Number(current.currentQuantity || 0);
    const nextMinimum = payload?.minimumQuantity !== undefined || payload?.estoqueMinimo !== undefined
      ? toIntegerQuantity(payload.minimumQuantity ?? payload.estoqueMinimo, 'minimumQuantity')
      : Number(current.minimumQuantity || 0);
    const active = payload?.active === undefined ? current.active !== false : payload.active !== false;
    const quantityChanged = Number(current.currentQuantity || 0) !== Number(nextQuantity || 0);

    const result = await prisma.$transaction(async (tx) => {
      const updated = await stockRepository.update({
        itemId: current.id,
        data: {
          name: base.name,
          category: base.category,
          unit: base.unit,
          currentQuantity: nextQuantity,
          minimumQuantity: nextMinimum,
          notes: base.notes,
          active,
        },
      }, tx);

      let movement = null;
      if (quantityChanged) {
        movement = await stockRepository.createMovement({
          clinicId: normalizedClinicId,
          stockItemId: current.id,
          type: 'ajuste',
          quantityDelta: Number(nextQuantity || 0) - Number(current.currentQuantity || 0),
          quantityBefore: Number(current.currentQuantity || 0),
          quantityAfter: Number(nextQuantity || 0),
          notes: 'Atualização do cadastro.',
          performedByUserId: cleanText(actor?.userId || '') || null,
          performedByUserName: cleanText(actor?.userName || '') || null,
        }, tx);
      }

      return { updated, movement };
    });

    return {
      ...normalizeStockItem(result.updated),
      movement: result.movement ? normalizeMovement(result.movement) : null,
    };
  },

  applyMovementForClinic: async ({ clinicId, itemId, payload = {}, actor = {} } = {}) => {
    const normalizedClinicId = cleanText(clinicId);
    const normalizedItemId = cleanText(itemId);
    if (!normalizedClinicId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authenticated clinic context is required.');
    }
    if (!normalizedItemId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'itemId is required.');
    }

    const movementType = normalizeMovementType(payload?.type || payload?.movementType || payload?.movimento);
    if (!movementType) {
      throw new AppError(400, 'VALIDATION_ERROR', 'type must be entrada, baixa or ajuste.');
    }

    const movementQuantity = toIntegerQuantity(payload?.quantity ?? payload?.quantidade, 'quantity');
    if (movementQuantity <= 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'quantity must be greater than zero.');
    }

    const reason = resolveMovementReason(payload, movementType === 'ajuste' ? 'Ajuste de estoque.' : '');
    const current = await stockRepository.findByIdAndClinic({
      clinicId: normalizedClinicId,
      itemId: normalizedItemId,
    });
    if (!current) {
      throw new AppError(404, 'STOCK_ITEM_NOT_FOUND', 'Stock item not found for this clinic.');
    }

    const result = await prisma.$transaction(async (tx) => {
      const currentQuantity = Number(current.currentQuantity || 0);
      let nextQuantity = currentQuantity;
      let delta = 0;

      if (movementType === 'entrada') {
        delta = movementQuantity;
        nextQuantity = currentQuantity + movementQuantity;
      } else if (movementType === 'baixa') {
        delta = -movementQuantity;
        nextQuantity = currentQuantity - movementQuantity;
      } else {
        nextQuantity = movementQuantity;
        delta = nextQuantity - currentQuantity;
      }

      if (nextQuantity < 0) {
        throw new AppError(400, 'STOCK_NEGATIVE_NOT_ALLOWED', 'Final stock quantity cannot be negative.');
      }

      const updated = await stockRepository.update({
        itemId: current.id,
        data: {
          currentQuantity: nextQuantity,
        },
      }, tx);

      const movement = await stockRepository.createMovement({
        clinicId: normalizedClinicId,
        stockItemId: current.id,
        type: movementType,
        quantityDelta: delta,
        quantityBefore: currentQuantity,
        quantityAfter: nextQuantity,
        notes: reason,
        performedByUserId: cleanText(actor?.userId || '') || null,
        performedByUserName: cleanText(actor?.userName || '') || null,
      }, tx);

      return { updated, movement };
    });

    return {
      item: normalizeStockItem(result.updated),
      movement: normalizeMovement(result.movement),
    };
  },

  adjustQuantityForClinic: async ({ clinicId, itemId, quantity, notes = '', actor = {} } = {}) => stockService.applyMovementForClinic({
    clinicId,
    itemId,
    payload: {
      type: 'ajuste',
      quantity,
      reason: notes,
    },
    actor,
  }),

  deactivateForClinic: async ({ clinicId, itemId } = {}) => {
    const normalizedClinicId = cleanText(clinicId);
    const normalizedItemId = cleanText(itemId);
    if (!normalizedClinicId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authenticated clinic context is required.');
    }
    if (!normalizedItemId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'itemId is required.');
    }

    const current = await stockRepository.findByIdAndClinic({
      clinicId: normalizedClinicId,
      itemId: normalizedItemId,
    });
    if (!current) {
      throw new AppError(404, 'STOCK_ITEM_NOT_FOUND', 'Stock item not found for this clinic.');
    }

    const updated = await stockRepository.update({
      itemId: current.id,
      data: {
        active: false,
      },
    });

    return normalizeStockItem(updated);
  },
};

module.exports = { stockService, normalizeStockItem, normalizeMovement };
