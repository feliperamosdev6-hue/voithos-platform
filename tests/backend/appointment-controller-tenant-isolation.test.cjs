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

test('appointmentController.createAppointment nunca aceita clinicId do body', async (t) => {
  const calls = [];
  const appointmentServiceMock = {
    appointmentService: {
      createAppointment: async (input) => {
        calls.push(input);
        return { id: 'appt-1' };
      },
    },
  };
  const authContextMock = {
    getAuthenticatedClinicId: (req) => String(req?.auth?.clinicId || '').trim(),
  };

  const { module: controller, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/controllers/appointmentController.js'),
    {
      [path.resolve(__dirname, '../../backend/src/services/appointmentService.js')]: appointmentServiceMock,
      [path.resolve(__dirname, '../../backend/src/services/outboundMessageService.js')]: { outboundMessageService: {} },
      [path.resolve(__dirname, '../../backend/src/utils/authContext.js')]: authContextMock,
    }
  );
  t.after(restore);

  const req = {
    auth: { clinicId: 'clinic-auth' },
    body: {
      clinicId: 'clinic-evil',
      patientId: 'patient-1',
      dataHora: '2026-04-13T10:00:00.000Z',
    },
  };
  const res = createResponseDouble();
  let forwardedError = null;

  await controller.createAppointment(req, res, (error) => {
    forwardedError = error;
  });

  assert.equal(forwardedError, null);
  assert.deepEqual(calls, [{
    clinicId: 'clinic-auth',
    input: {
      clinicId: 'clinic-evil',
      patientId: 'patient-1',
      dataHora: '2026-04-13T10:00:00.000Z',
    },
  }]);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.payload, { ok: true, data: { id: 'appt-1' } });
});
