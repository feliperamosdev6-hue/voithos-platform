const { AppError } = require('../errors/AppError');
const { paymentRepository } = require('../repositories/paymentRepository');

const cleanText = (value) => String(value || '').trim();
const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

const paymentService = {
  createPayment: async ({ clinicId, patientId, sourceType, sourceId, amount, method, description, dueDate, metadata }) => {
    if (!clinicId) throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');
    if (!amount || roundMoney(amount) <= 0) throw new AppError(400, 'VALIDATION_ERROR', 'amount must be greater than 0.');
    if (!description) throw new AppError(400, 'VALIDATION_ERROR', 'description is required.');

    const normalizedMethod = String(method || 'PIX').toUpperCase();
    const validMethods = ['PIX', 'CARD', 'LINK', 'MANUAL'];
    if (!validMethods.includes(normalizedMethod)) {
      throw new AppError(400, 'VALIDATION_ERROR', `Invalid method. Must be one of: ${validMethods.join(', ')}`);
    }

    const normalizedSourceType = sourceType ? String(sourceType).toUpperCase() : 'MANUAL';
    const validSourceTypes = ['APPOINTMENT', 'PLAN', 'MANUAL', 'OTHER'];
    if (!validSourceTypes.includes(normalizedSourceType)) {
      throw new AppError(400, 'VALIDATION_ERROR', `Invalid sourceType. Must be one of: ${validSourceTypes.join(', ')}`);
    }

    return paymentRepository.createPayment({
      clinicId,
      patientId: patientId || null,
      sourceType: normalizedSourceType,
      sourceId: sourceId ? cleanText(sourceId) : null,
      amount: roundMoney(amount),
      method: normalizedMethod,
      description: cleanText(description),
      dueDate: dueDate ? new Date(dueDate) : null,
      metadata: metadata || null,
    });
  },

  getPaymentById: async ({ clinicId, paymentId }) => {
    if (!clinicId || !paymentId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'clinicId and paymentId are required.');
    }

    const payment = await paymentRepository.getPaymentById({ clinicId, paymentId });
    if (!payment) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Payment not found.');

    return payment;
  },

  listPayments: async ({ clinicId, patientId, status, skip = 0, take = 50 }) => {
    if (!clinicId) throw new AppError(400, 'VALIDATION_ERROR', 'clinicId is required.');

    const validStatuses = ['PENDING', 'PAID', 'FAILED', 'CANCELED'];
    if (status && !validStatuses.includes(String(status).toUpperCase())) {
      throw new AppError(400, 'VALIDATION_ERROR', `Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    return paymentRepository.listPaymentsByClinic({
      clinicId,
      patientId: patientId || null,
      status: status ? String(status).toUpperCase() : null,
      skip: Math.max(0, Number(skip) || 0),
      take: Math.min(200, Math.max(1, Number(take) || 50)),
    });
  },

  markAsPaid: async ({ clinicId, paymentId, paidAt }) => {
    const payment = await paymentService.getPaymentById({ clinicId, paymentId });
    if (payment.status === 'PAID') {
      throw new AppError(400, 'VALIDATION_ERROR', 'Payment is already marked as paid.');
    }
    if (payment.status === 'CANCELED') {
      throw new AppError(400, 'VALIDATION_ERROR', 'Cannot mark a canceled payment as paid.');
    }

    const updated = await paymentRepository.updatePaymentStatus({
      clinicId,
      paymentId,
      status: 'PAID',
      paidAt: paidAt ? new Date(paidAt) : new Date(),
    });

    await paymentRepository.createTransaction({
      paymentId,
      status: 'PAID',
      gatewayResponse: null,
    });

    return updated;
  },

  markAsFailed: async ({ clinicId, paymentId, gatewayResponse }) => {
    const payment = await paymentService.getPaymentById({ clinicId, paymentId });
    if (['PAID', 'CANCELED'].includes(payment.status)) {
      throw new AppError(400, 'VALIDATION_ERROR', `Cannot mark a ${payment.status} payment as failed.`);
    }

    const updated = await paymentRepository.updatePaymentStatus({
      clinicId,
      paymentId,
      status: 'FAILED',
      paidAt: null,
    });

    await paymentRepository.createTransaction({
      paymentId,
      status: 'FAILED',
      gatewayResponse: gatewayResponse || null,
    });

    return updated;
  },

  cancel: async ({ clinicId, paymentId }) => {
    const payment = await paymentService.getPaymentById({ clinicId, paymentId });
    if (payment.status === 'PAID') {
      throw new AppError(400, 'VALIDATION_ERROR', 'Cannot cancel a payment that is already paid.');
    }

    const updated = await paymentRepository.updatePaymentStatus({
      clinicId,
      paymentId,
      status: 'CANCELED',
      paidAt: null,
    });

    await paymentRepository.createTransaction({
      paymentId,
      status: 'CANCELED',
      gatewayResponse: null,
    });

    return updated;
  },
};

module.exports = { paymentService };
