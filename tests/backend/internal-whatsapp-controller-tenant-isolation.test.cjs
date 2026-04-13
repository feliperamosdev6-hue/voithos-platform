const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadModuleWithMocks } = require('./helpers/load-module-with-mocks.cjs');

const createResponseDouble = () => ({
  statusCode: 200,
  payload: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.payload = payload;
    return this;
  },
});

test('internalWhatsappController.receiveInboundWhatsapp encaminha apenas campos allowlisted', async (t) => {
  let receivedPayload = null;
  const { module: controller, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/controllers/internalWhatsappController.js'),
    {
      [path.resolve(__dirname, '../../backend/src/services/inboundMessageService.js')]: {
        inboundMessageService: {
          receiveWhatsappInbound: async (input) => {
            receivedPayload = input;
            return { id: 'inbound-1' };
          },
        },
      },
      [path.resolve(__dirname, '../../backend/src/services/outboundMessageService.js')]: { outboundMessageService: {} },
    }
  );
  t.after(restore);

  const req = {
    body: {
      clinicId: 'clinic-auth',
      fromPhone: '11999999999',
      body: '1',
      providerMessageId: 'provider-1',
      rawPayload: { keep: 'ok' },
      injected: 'should-not-pass',
    },
  };
  const res = createResponseDouble();
  let forwardedError = null;

  await controller.receiveInboundWhatsapp(req, res, (error) => {
    forwardedError = error;
  });

  assert.equal(forwardedError, null);
  assert.deepEqual(receivedPayload, {
    clinicId: 'clinic-auth',
    fromPhone: '11999999999',
    body: '1',
    providerMessageId: 'provider-1',
    rawPayload: { keep: 'ok' },
  });
  assert.equal(res.statusCode, 201);
});
