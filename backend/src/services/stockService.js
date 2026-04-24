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

const writeMovementIfNeeded = async ({ tx, clinicId, stockItemId, type, delta, beforeValue, afterValue, notes }) => {
  if (!tx || !clinicId || !stockItemId) return;
  await tx.stockMovement.create({
    data: {
      clinicId,
      stockItemId,
      type,
      quantityDelta: delta,
      quantityBefore: beforeValue,
      quantityAfter: afterValue,
      notes: notes || null,
    },
  });
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

  createForClinic: async ({ clinicId, payload = {} } = {}) => {
    const normalizedClinicId = cleanText(clinicId);
    if (!normalizedClinicId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authenticated clinic context is required.');
    }

    const base = validateBasePayload(payload, { requireQuantity: true });

    const created = await stockRepository.create({
      clinicId: normalizedClinicId,
      name: base.name,
      category: base.category,
      unit: base.unit,
      currentQuantity: base.currentQuantity,
      minimumQuantity: base.minimumQuantity,
      notes: base.notes,
      active: base.active,
    });

    await stockRepository.createMovement({
      clinicId: normalizedClinicId,
      stockItemId: created.id,
      type: 'CREATED',
      quantityDelta: Number(created.currentQuantity || 0),
      quantityBefore: 0,
      quantityAfter: Number(created.currentQuantity || 0),
      notes: base.notes || null,
    });

    return normalizeStockItem(created);
  },

  updateForClinic: async ({ clinicId, itemId, payload = {} } = {}) => {
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
    });

    if (Number(current.currentQuantity || 0) !== Number(nextQuantity || 0)) {
      await stockRepository.createMovement({
        clinicId: normalizedClinicId,
        stockItemId: current.id,
        type: 'UPDATED',
        quantityDelta: Number(nextQuantity || 0) - Number(current.currentQuantity || 0),
        quantityBefore: Number(current.currentQuantity || 0),
        quantityAfter: Number(nextQuantity || 0),
        notes: base.notes || current.notes || null,
      });
    }

    return normalizeStockItem(updated);
  },

  adjustQuantityForClinic: async ({ clinicId, itemId, quantity, notes = '' } = {}) => {
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

    const nextQuantity = toIntegerQuantity(quantity, 'currentQuantity');
    const updated = await stockRepository.update({
      itemId: current.id,
      data: {
        currentQuantity: nextQuantity,
      },
    });

    await stockRepository.createMovement({
      clinicId: normalizedClinicId,
      stockItemId: current.id,
      type: 'ADJUSTED',
      quantityDelta: nextQuantity - Number(current.currentQuantity || 0),
      quantityBefore: Number(current.currentQuantity || 0),
      quantityAfter: nextQuantity,
      notes: cleanText(notes) || current.notes || null,
    });

    return normalizeStockItem(updated);
  },

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

    await stockRepository.createMovement({
      clinicId: normalizedClinicId,
      stockItemId: current.id,
      type: 'DEACTIVATED',
      quantityDelta: 0,
      quantityBefore: Number(current.currentQuantity || 0),
      quantityAfter: Number(current.currentQuantity || 0),
      notes: 'Item desativado.',
    });

    return normalizeStockItem(updated);
  },
};

module.exports = { stockService, normalizeStockItem };
