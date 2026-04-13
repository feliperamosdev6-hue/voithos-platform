const { AppError } = require('../errors/AppError');
const { laboratoryRepository } = require('../repositories/laboratoryRepository');

const cleanText = (value) => String(value || '').trim();
const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

const toDate = (value, fallback = null) => {
  if (!value) return fallback;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed;
};

const toDateOnly = (value) => {
  const parsed = toDate(value, null);
  if (!parsed) return '';
  return parsed.toISOString().slice(0, 10);
};

const normalizeStatus = (value) => {
  const raw = cleanText(value).toUpperCase();
  if (raw === 'REQUESTED' || raw === 'SOLICITADO' || raw === 'PENDENTE') return 'REQUESTED';
  if (raw === 'IN_PROGRESS' || raw === 'EM_ANDAMENTO' || raw === 'EM ANDAMENTO') return 'IN_PROGRESS';
  if (raw === 'SENT' || raw === 'ENVIADO') return 'SENT';
  if (raw === 'RECEIVED' || raw === 'RECEBIDO') return 'RECEIVED';
  if (raw === 'DELIVERED' || raw === 'ENTREGUE') return 'DELIVERED';
  if (raw === 'CANCELED' || raw === 'CANCELADO' || raw === 'CANCELLED') return 'CANCELED';
  return 'REQUESTED';
};

const mapStatusToLegacy = (value) => {
  if (value === 'DELIVERED') return 'entregue';
  if (value === 'RECEIVED') return 'recebido';
  if (value === 'SENT') return 'enviado';
  if (value === 'IN_PROGRESS') return 'em_andamento';
  if (value === 'CANCELED') return 'cancelado';
  return 'pendente';
};

const ensurePatient = async ({ clinicId, patientId }) => {
  const patient = await laboratoryRepository.findPatientByIdAndClinic({ clinicId, patientId });
  if (!patient) throw new AppError(404, 'PATIENT_NOT_FOUND', 'Patient not found for this clinic.');
  return patient;
};

const resolveProcedure = async ({ clinicId, patientId, procedureId }) => {
  const normalized = cleanText(procedureId);
  if (!normalized) return null;
  const byId = await laboratoryRepository.findProcedureByIdAndClinic({ clinicId, procedureId: normalized });
  if (byId) return byId;
  if (!patientId) return null;
  return laboratoryRepository.findProcedureByExternalId({
    clinicId,
    patientId,
    externalId: normalized,
  });
};

const mapItem = (item = {}) => ({
  id: item.id,
  orderId: item.orderId,
  clinicId: item.clinicId,
  name: item.name,
  quantity: Number(item.quantity || 0),
  unitCost: item.unitCost === null || item.unitCost === undefined ? null : Number(item.unitCost),
  notes: item.notes || '',
  createdAt: item.createdAt?.toISOString?.() || null,
  updatedAt: item.updatedAt?.toISOString?.() || null,
});

const mapOrder = (row = {}) => {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return {
    id: row.id,
    clinicId: row.clinicId,
    patientId: row.patientId,
    appointmentId: row.appointmentId || '',
    procedureId: row.procedureId || '',
    labName: row.labName,
    laboratorio: row.labName,
    externalReference: row.externalReference || '',
    description: row.description,
    descricao: row.description,
    status: mapStatusToLegacy(row.status),
    centralStatus: row.status,
    requestedAt: row.requestedAt?.toISOString?.() || null,
    entrada: toDateOnly(row.requestedAt),
    expectedAt: row.expectedAt?.toISOString?.() || null,
    saida: toDateOnly(row.completedAt || row.expectedAt),
    completedAt: row.completedAt?.toISOString?.() || null,
    notes: row.notes || '',
    observacoes: row.notes || '',
    totalCost: row.totalCost === null || row.totalCost === undefined ? null : Number(row.totalCost),
    valor: row.totalCost === null || row.totalCost === undefined ? 0 : Number(row.totalCost),
    paciente: metadata.patientName || row.patient?.nome || '',
    peca: metadata.piece || '',
    procedureExternalId: metadata.procedureExternalId || '',
    financeExpenseId: metadata.financeExpenseId || '',
    items: Array.isArray(row.items) ? row.items.map(mapItem) : [],
    events: Array.isArray(row.events) ? row.events.map((event) => ({
      id: event.id,
      type: event.type,
      description: event.description,
      createdAt: event.createdAt?.toISOString?.() || null,
    })) : [],
    metadata,
    createdAt: row.createdAt?.toISOString?.() || null,
    updatedAt: row.updatedAt?.toISOString?.() || null,
  };
};

const TENANT_SENSITIVE_KEYS = new Set([
  'clinicId',
  'patientId',
  'orderId',
  'itemId',
  'appointmentId',
  'procedureId',
]);

const sanitizeTenantMetadata = (value = {}) => {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeTenantMetadata(item));
  }
  if (!value || typeof value !== 'object') return value;
  if (value instanceof Date) return value;

  return Object.entries(value).reduce((acc, [key, nestedValue]) => {
    if (TENANT_SENSITIVE_KEYS.has(cleanText(key))) return acc;
    acc[key] = sanitizeTenantMetadata(nestedValue);
    return acc;
  }, {});
};

const createOrderEvent = async ({ orderId, clinicId, type, description }) => {
  if (!cleanText(orderId) || !cleanText(clinicId)) return;
  await laboratoryRepository.createEvent({
    orderId,
    clinicId,
    type: cleanText(type || 'ORDER_EVENT') || 'ORDER_EVENT',
    description: cleanText(description || '') || 'Atualizacao do pedido laboratorial',
  });
};

const laboratoryService = {
  createOrder: async ({ clinicId, payload = {} }) => {
    const normalizedClinicId = cleanText(clinicId);
    const patientId = cleanText(payload.patientId);
    if (!normalizedClinicId || !patientId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId and patientId are required.');
    }

    const patient = await ensurePatient({ clinicId: normalizedClinicId, patientId });
    const procedure = await resolveProcedure({
      clinicId: normalizedClinicId,
      patientId,
      procedureId: payload.procedureId,
    });

    let appointmentId = cleanText(payload.appointmentId);
    if (appointmentId) {
      const appointment = await laboratoryRepository.findAppointmentByIdAndClinic({
        clinicId: normalizedClinicId,
        appointmentId,
      });
      if (!appointment) throw new AppError(404, 'APPOINTMENT_NOT_FOUND', 'Appointment not found for this clinic.');
      appointmentId = appointment.id;
    }

    const externalReference = cleanText(payload.externalReference || payload.externalId || '');
    if (externalReference) {
      const existing = await laboratoryRepository.findOrderByExternalReference({
        clinicId: normalizedClinicId,
        externalReference,
      });
      if (existing) {
        return laboratoryService.updateOrder({
          clinicId: normalizedClinicId,
          orderId: existing.id,
          payload,
        });
      }
    }

    const created = await laboratoryRepository.createOrder({
      clinicId: normalizedClinicId,
      patientId,
      appointmentId: appointmentId || null,
      procedureId: procedure?.id || cleanText(payload.procedureId) || null,
      labName: cleanText(payload.labName || payload.laboratorio || 'Laboratorio'),
      externalReference: externalReference || null,
      description: cleanText(payload.description || payload.descricao || payload.peca || 'Pedido laboratorial'),
      status: normalizeStatus(payload.status),
      requestedAt: toDate(payload.requestedAt || payload.entrada, new Date()),
      expectedAt: toDate(payload.expectedAt || payload.previsao || payload.saida, null),
      completedAt: toDate(payload.completedAt, null),
      notes: cleanText(payload.notes || payload.observacoes || '') || null,
      totalCost: payload.totalCost !== undefined || payload.valor !== undefined ? roundMoney(payload.totalCost ?? payload.valor ?? 0) : null,
      metadata: {
        ...sanitizeTenantMetadata(payload.metadata),
        patientName: payload.paciente || patient.nome || '',
        piece: payload.peca || '',
        procedureExternalId: cleanText(payload.procedureId || procedure?.externalId || ''),
        financeExpenseId: cleanText(payload.financeExpenseId || payload.despesaLaboratorioId || ''),
        prontuario: cleanText(payload.prontuario || patientId),
      },
    });

    await createOrderEvent({
      orderId: created.id,
      clinicId: normalizedClinicId,
      type: 'ORDER_CREATED',
      description: 'Pedido laboratorial criado.',
    });

    if (Array.isArray(payload.items) && payload.items.length) {
      for (const item of payload.items) {
        await laboratoryRepository.createItem({
          orderId: created.id,
          clinicId: normalizedClinicId,
          name: cleanText(item?.name || item?.nome || created.description),
          quantity: Math.max(1, Number(item?.quantity || item?.quantidade || 1) || 1),
          unitCost: item?.unitCost !== undefined || item?.valorUnitario !== undefined
            ? roundMoney(item.unitCost ?? item.valorUnitario ?? 0)
            : null,
          notes: cleanText(item?.notes || item?.observacoes || '') || null,
        });
      }
    }

    const refreshed = await laboratoryRepository.findOrderByIdAndClinic({
      clinicId: normalizedClinicId,
      orderId: created.id,
    });
    return mapOrder(refreshed);
  },

  listOrdersByClinic: async ({ clinicId }) => {
    const normalizedClinicId = cleanText(clinicId);
    if (!normalizedClinicId) throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
    const rows = await laboratoryRepository.listOrdersByClinic({ clinicId: normalizedClinicId });
    return rows.map(mapOrder);
  },

  listOrdersByPatient: async ({ clinicId, patientId }) => {
    const normalizedClinicId = cleanText(clinicId);
    const normalizedPatientId = cleanText(patientId);
    if (!normalizedClinicId || !normalizedPatientId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId and patientId are required.');
    }
    await ensurePatient({ clinicId: normalizedClinicId, patientId: normalizedPatientId });
    const rows = await laboratoryRepository.listOrdersByPatient({
      clinicId: normalizedClinicId,
      patientId: normalizedPatientId,
    });
    return rows.map(mapOrder);
  },

  getOrderById: async ({ clinicId, orderId }) => {
    const row = await laboratoryRepository.findOrderByIdAndClinic({
      clinicId: cleanText(clinicId),
      orderId: cleanText(orderId),
    });
    if (!row) throw new AppError(404, 'LABORATORY_ORDER_NOT_FOUND', 'Laboratory order not found.');
    return mapOrder(row);
  },

  updateOrder: async ({ clinicId, orderId, payload = {} }) => {
    const normalizedClinicId = cleanText(clinicId);
    const existing = await laboratoryRepository.findOrderByIdAndClinic({
      clinicId: normalizedClinicId,
      orderId: cleanText(orderId),
    });
    if (!existing) throw new AppError(404, 'LABORATORY_ORDER_NOT_FOUND', 'Laboratory order not found.');
    const requestedPatientId = cleanText(payload.patientId);
    if (requestedPatientId && requestedPatientId !== cleanText(existing.patientId)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'patientId cannot be reassigned.');
    }

    let procedureId = existing.procedureId;
    if (payload.procedureId !== undefined) {
      const procedure = await resolveProcedure({
        clinicId: normalizedClinicId,
        patientId: existing.patientId,
        procedureId: payload.procedureId,
      });
      procedureId = procedure?.id || cleanText(payload.procedureId) || null;
    }

    let appointmentId = existing.appointmentId;
    if (payload.appointmentId !== undefined) {
      const normalizedAppointmentId = cleanText(payload.appointmentId);
      if (!normalizedAppointmentId) {
        appointmentId = null;
      } else {
        const appointment = await laboratoryRepository.findAppointmentByIdAndClinic({
          clinicId: normalizedClinicId,
          appointmentId: normalizedAppointmentId,
        });
        if (!appointment) throw new AppError(404, 'APPOINTMENT_NOT_FOUND', 'Appointment not found for this clinic.');
        appointmentId = appointment.id;
      }
    }

    const updated = await laboratoryRepository.updateOrder({
      orderId: existing.id,
      data: {
        labName: payload.labName !== undefined || payload.laboratorio !== undefined
          ? cleanText(payload.labName || payload.laboratorio || existing.labName)
          : existing.labName,
        externalReference: payload.externalReference !== undefined || payload.externalId !== undefined
          ? cleanText(payload.externalReference || payload.externalId || '') || null
          : existing.externalReference,
        description: payload.description !== undefined || payload.descricao !== undefined || payload.peca !== undefined
          ? cleanText(payload.description || payload.descricao || payload.peca || existing.description)
          : existing.description,
        status: payload.status ? normalizeStatus(payload.status) : existing.status,
        expectedAt: payload.expectedAt !== undefined || payload.previsao !== undefined || payload.saida !== undefined
          ? toDate(payload.expectedAt || payload.previsao || payload.saida, null)
          : existing.expectedAt,
        completedAt: payload.completedAt !== undefined ? toDate(payload.completedAt, null) : existing.completedAt,
        notes: payload.notes !== undefined || payload.observacoes !== undefined
          ? cleanText(payload.notes || payload.observacoes || '') || null
          : existing.notes,
        totalCost: payload.totalCost !== undefined || payload.valor !== undefined
          ? roundMoney(payload.totalCost ?? payload.valor ?? 0)
          : existing.totalCost,
        appointmentId,
        procedureId,
        metadata: {
          ...((existing.metadata && typeof existing.metadata === 'object') ? existing.metadata : {}),
          ...sanitizeTenantMetadata(payload.metadata),
          patientName: payload.paciente !== undefined ? cleanText(payload.paciente || '') : (existing.metadata?.patientName || ''),
          piece: payload.peca !== undefined ? cleanText(payload.peca || '') : (existing.metadata?.piece || ''),
          procedureExternalId: payload.procedureId !== undefined ? cleanText(payload.procedureId || '') : (existing.metadata?.procedureExternalId || ''),
          financeExpenseId: payload.financeExpenseId !== undefined || payload.despesaLaboratorioId !== undefined
            ? cleanText(payload.financeExpenseId || payload.despesaLaboratorioId || '')
            : (existing.metadata?.financeExpenseId || ''),
          prontuario: payload.prontuario !== undefined ? cleanText(payload.prontuario || '') : (existing.metadata?.prontuario || ''),
        },
      },
    });

    await createOrderEvent({
      orderId: existing.id,
      clinicId: normalizedClinicId,
      type: 'ORDER_UPDATED',
      description: 'Pedido laboratorial atualizado.',
    });

    return mapOrder(updated);
  },

  updateOrderStatus: async ({ clinicId, orderId, status, notes = '' }) => {
    const normalizedStatus = normalizeStatus(status);
    const completedAt = normalizedStatus === 'DELIVERED' || normalizedStatus === 'RECEIVED'
      ? new Date()
      : null;
    const updated = await laboratoryService.updateOrder({
      clinicId,
      orderId,
      payload: {
        status: normalizedStatus,
        completedAt,
        notes,
      },
    });
    await createOrderEvent({
      orderId: cleanText(orderId),
      clinicId: cleanText(clinicId),
      type: 'STATUS_CHANGED',
      description: `Status alterado para ${normalizedStatus}.`,
    });
    return updated;
  },

  cancelOrder: async ({ clinicId, orderId, notes = '' }) => laboratoryService.updateOrderStatus({
    clinicId,
    orderId,
    status: 'CANCELED',
    notes,
  }),

  deleteOrder: async ({ clinicId, orderId }) => {
    const existing = await laboratoryRepository.findOrderByIdAndClinic({
      clinicId: cleanText(clinicId),
      orderId: cleanText(orderId),
    });
    if (!existing) return { success: true };
    await laboratoryRepository.deleteOrder({
      clinicId: cleanText(clinicId),
      orderId: cleanText(orderId),
    });
    return { success: true };
  },

  addOrderItem: async ({ clinicId, orderId, item = {} }) => {
    const order = await laboratoryRepository.findOrderByIdAndClinic({
      clinicId: cleanText(clinicId),
      orderId: cleanText(orderId),
    });
    if (!order) throw new AppError(404, 'LABORATORY_ORDER_NOT_FOUND', 'Laboratory order not found.');
    const created = await laboratoryRepository.createItem({
      orderId: order.id,
      clinicId: cleanText(clinicId),
      name: cleanText(item?.name || item?.nome || 'Item laboratorial'),
      quantity: Math.max(1, Number(item?.quantity || item?.quantidade || 1) || 1),
      unitCost: item?.unitCost !== undefined || item?.valorUnitario !== undefined
        ? roundMoney(item.unitCost ?? item.valorUnitario ?? 0)
        : null,
      notes: cleanText(item?.notes || item?.observacoes || '') || null,
    });
    await createOrderEvent({
      orderId: order.id,
      clinicId: cleanText(clinicId),
      type: 'ITEM_ADDED',
      description: `Item ${created.name} adicionado ao pedido.`,
    });
    return mapItem(created);
  },

  updateOrderItem: async ({ clinicId, itemId, item = {} }) => {
    const existing = await laboratoryRepository.findItemByIdAndClinic({
      clinicId: cleanText(clinicId),
      itemId: cleanText(itemId),
    });
    if (!existing) throw new AppError(404, 'LABORATORY_ORDER_ITEM_NOT_FOUND', 'Laboratory order item not found.');
    const updated = await laboratoryRepository.updateItem({
      itemId: existing.id,
      data: {
        name: item?.name !== undefined || item?.nome !== undefined
          ? cleanText(item.name || item.nome || existing.name)
          : existing.name,
        quantity: item?.quantity !== undefined || item?.quantidade !== undefined
          ? Math.max(1, Number(item.quantity || item.quantidade || 1) || 1)
          : existing.quantity,
        unitCost: item?.unitCost !== undefined || item?.valorUnitario !== undefined
          ? roundMoney(item.unitCost ?? item.valorUnitario ?? 0)
          : existing.unitCost,
        notes: item?.notes !== undefined || item?.observacoes !== undefined
          ? cleanText(item.notes || item.observacoes || '') || null
          : existing.notes,
      },
    });
    return mapItem(updated);
  },

  deleteOrderItem: async ({ clinicId, itemId }) => {
    const existing = await laboratoryRepository.findItemByIdAndClinic({
      clinicId: cleanText(clinicId),
      itemId: cleanText(itemId),
    });
    if (!existing) return { success: true };
    await laboratoryRepository.deleteItem({
      clinicId: cleanText(clinicId),
      itemId: cleanText(itemId),
    });
    return { success: true };
  },

  getLaboratoryDashboardSummary: async ({ clinicId }) => {
    const orders = await laboratoryService.listOrdersByClinic({ clinicId: cleanText(clinicId) });
    const totalMonth = orders.reduce((acc, item) => {
      const requestedAt = toDate(item.requestedAt || item.entrada, null);
      const now = new Date();
      if (!requestedAt) return acc;
      if (requestedAt.getUTCFullYear() === now.getUTCFullYear() && requestedAt.getUTCMonth() === now.getUTCMonth()) {
        return acc + roundMoney(item.valor || item.totalCost || 0);
      }
      return acc;
    }, 0);
    const pendentes = orders.filter((item) => item.centralStatus !== 'DELIVERED' && item.centralStatus !== 'CANCELED').length;
    const entregues = orders.filter((item) => item.centralStatus === 'DELIVERED').length;
    return {
      totalMes: roundMoney(totalMonth),
      pendentes,
      entregues,
      totalPedidos: orders.length,
    };
  },
};

module.exports = { laboratoryService, mapOrder, mapItem };
