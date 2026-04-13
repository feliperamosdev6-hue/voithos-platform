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

test('clinicalController.upsertPatientProcedure nunca aceita clinicId do body', async (t) => {
  const calls = [];
  const patientClinicalServiceMock = {
    patientClinicalService: {
      upsertProcedure: async (input) => {
        calls.push(input);
        return { service: { id: 'proc-1' }, financeId: 'acc-1' };
      },
    },
  };
  const authContextMock = {
    getAuthenticatedClinicId: (req) => String(req?.auth?.clinicId || '').trim(),
  };

  const { module: controller, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/controllers/clinicalController.js'),
    {
      [path.resolve(__dirname, '../../backend/src/services/patientClinicalService.js')]: patientClinicalServiceMock,
      [path.resolve(__dirname, '../../backend/src/utils/authContext.js')]: authContextMock,
    }
  );
  t.after(restore);

  const req = {
    auth: { clinicId: 'clinic-auth' },
    params: { patientId: 'patient-1' },
    body: {
      clinicId: 'clinic-evil',
      procedure: {
        id: 'proc-1',
        tipo: 'Limpeza',
      },
    },
  };
  const res = createResponseDouble();
  let forwardedError = null;

  await controller.upsertPatientProcedure(req, res, (error) => {
    forwardedError = error;
  });

  assert.equal(forwardedError, null);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    clinicId: 'clinic-auth',
    patientId: 'patient-1',
    procedure: {
      id: 'proc-1',
      tipo: 'Limpeza',
    },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload, {
    ok: true,
    data: { service: { id: 'proc-1' }, financeId: 'acc-1' },
  });
});
