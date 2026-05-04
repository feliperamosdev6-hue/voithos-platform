const handleAsaasWebhook = async (req, res) => {
  const eventType = String(req.body?.event || req.body?.type || '').trim();
  const paymentId = String(req.body?.payment?.id || req.body?.id || '').trim();

  console.info('[asaas][webhook] event received', {
    eventType,
    paymentId,
  });

  return res.status(200).json({ ok: true });
};

module.exports = {
  handleAsaasWebhook,
};
