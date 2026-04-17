const { paymentService } = require('../services/paymentService');

const getAuthenticatedClinicId = (req) => req.auth?.clinicId || req.user?.clinicId || req.headers['x-clinic-id'] || '';

const createPayment = async (req, res, next) => {
  try {
    const clinicId = getAuthenticatedClinicId(req);
    const data = await paymentService.createPayment({
      clinicId,
      patientId: req.body?.patientId || null,
      sourceType: req.body?.sourceType || 'MANUAL',
      sourceId: req.body?.sourceId || null,
      amount: req.body?.amount,
      method: req.body?.method || 'PIX',
      description: req.body?.description,
      dueDate: req.body?.dueDate,
      metadata: req.body?.metadata || null,
    });
    return res.status(201).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const listPayments = async (req, res, next) => {
  try {
    const clinicId = getAuthenticatedClinicId(req);
    const data = await paymentService.listPayments({
      clinicId,
      patientId: req.query?.patientId || null,
      status: req.query?.status || null,
      skip: Number(req.query?.skip) || 0,
      take: Number(req.query?.take) || 50,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const getPayment = async (req, res, next) => {
  try {
    const clinicId = getAuthenticatedClinicId(req);
    const data = await paymentService.getPaymentById({
      clinicId,
      paymentId: req.params?.id,
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
};

const updatePaymentStatus = async (req, res, next) => {
  try {
    const clinicId = getAuthenticatedClinicId(req);
    const paymentId = req.params?.id;
    const status = String(req.body?.status || '').toUpperCase();

    if (status === 'PAID') {
      const data = await paymentService.markAsPaid({
        clinicId,
        paymentId,
        paidAt: req.body?.paidAt,
      });
      return res.status(200).json({ ok: true, data });
    }

    if (status === 'FAILED') {
      const data = await paymentService.markAsFailed({
        clinicId,
        paymentId,
        gatewayResponse: req.body?.gatewayResponse,
      });
      return res.status(200).json({ ok: true, data });
    }

    if (status === 'CANCELED') {
      const data = await paymentService.cancel({
        clinicId,
        paymentId,
      });
      return res.status(200).json({ ok: true, data });
    }

    throw new Error('Invalid status. Must be PAID, FAILED, or CANCELED.');
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createPayment,
  listPayments,
  getPayment,
  updatePaymentStatus,
};
