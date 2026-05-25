const { subscriptionService } = require('../services/subscriptionService');

const normalizeText = (value) => String(value || '').trim();

const handleAsaasWebhook = async (req, res) => {
  const eventType = String(req.body?.event || req.body?.type || '').trim();
  const paymentId = String(req.body?.payment?.id || req.body?.id || '').trim();
  const requestToken = normalizeText(req.get('asaas-access-token'));
  const expectedToken = normalizeText(process.env.ASAAS_WEBHOOK_TOKEN || '');

  if (!expectedToken && String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production') {
    console.error('[asaas][webhook] auth token is not configured');
    return res.status(503).json({ ok: false, error: { code: 'WEBHOOK_AUTH_NOT_CONFIGURED', message: 'Webhook authentication is not configured.' } });
  }

  if (expectedToken && requestToken !== expectedToken) {
    console.warn('[asaas][webhook] invalid auth token', {
      eventType,
      paymentId,
    });
    return res.status(401).json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid webhook token.' } });
  }

  console.info('[asaas][webhook] event received', {
    eventType,
    paymentId,
  });

  try {
    const result = await subscriptionService.handleAsaasWebhookEvent({
      eventType,
      payment: req.body?.payment || req.body?.checkout || {},
    });

    if (result?.handled === true) {
      console.info('[asaas][webhook] payment handled', {
        eventType,
        paymentId,
      });
    }
  } catch (error) {
    const statusCode = Number(error?.statusCode || 500);
    const responseStatus = statusCode >= 400 && statusCode < 500 ? statusCode : 500;
    const errorCode = String(error?.code || 'WEBHOOK_PROCESSING_FAILED');
    console.error('[asaas][webhook] processing failed', {
      eventType,
      paymentId,
      errorCode,
      error: error?.message || String(error || ''),
    });
    return res.status(responseStatus).json({
      ok: false,
      error: {
        code: errorCode,
        message: 'Webhook processing failed.',
      },
    });
  }

  return res.status(200).json({ ok: true });
};

module.exports = {
  handleAsaasWebhook,
};
