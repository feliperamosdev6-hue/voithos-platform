const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadModuleWithMocks } = require('./helpers/load-module-with-mocks.cjs');

const createResponseDouble = () => {
  const response = {
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
  };
  return response;
};

test('financialController.listAccounts sempre usa clinicId autenticado', async (t) => {
  const calls = [];
  const financialServiceMock = {
    financialService: {
      listFinancialAccounts: async (input) => {
        calls.push(input);
        return [{ id: 'acc-1' }];
      },
    },
  };
  const authContextMock = {
    getAuthenticatedClinicId: (req) => String(req?.auth?.clinicId || '').trim(),
  };

  const { module: controller, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/controllers/financialController.js'),
    {
      [path.resolve(__dirname, '../../backend/src/services/financialService.js')]: financialServiceMock,
      [path.resolve(__dirname, '../../backend/src/utils/authContext.js')]: authContextMock,
    }
  );
  t.after(restore);

  const req = {
    auth: { clinicId: 'clinic-auth' },
    query: { clinicId: 'clinic-evil', patientId: 'patient-1' },
  };
  const res = createResponseDouble();
  let forwardedError = null;

  await controller.listAccounts(req, res, (error) => {
    forwardedError = error;
  });

  assert.equal(forwardedError, null);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    clinicId: 'clinic-auth',
    patientId: 'patient-1',
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload, { ok: true, data: [{ id: 'acc-1' }] });
});

test('financialController.getDashboard ignora clinicId injetado na query', async (t) => {
  const calls = [];
  const financialServiceMock = {
    financialService: {
      getFinancialDashboard: async (input) => {
        calls.push(input);
        return { totalAccounts: 2 };
      },
    },
  };
  const authContextMock = {
    getAuthenticatedClinicId: (req) => String(req?.auth?.clinicId || '').trim(),
  };

  const { module: controller, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/controllers/financialController.js'),
    {
      [path.resolve(__dirname, '../../backend/src/services/financialService.js')]: financialServiceMock,
      [path.resolve(__dirname, '../../backend/src/utils/authContext.js')]: authContextMock,
    }
  );
  t.after(restore);

  const req = {
    auth: { clinicId: 'clinic-auth' },
    query: { clinicId: 'clinic-evil' },
  };
  const res = createResponseDouble();
  let forwardedError = null;

  await controller.getDashboard(req, res, (error) => {
    forwardedError = error;
  });

  assert.equal(forwardedError, null);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { clinicId: 'clinic-auth' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload, { ok: true, data: { totalAccounts: 2 } });
});

test('financialController.getMonthlySummary usa tenant autenticado mesmo com clinicId malicioso', async (t) => {
  const calls = [];
  const financialServiceMock = {
    financialService: {
      getMonthlySummary: async (input) => {
        calls.push(input);
        return { totalRevenue: 1000 };
      },
    },
  };
  const authContextMock = {
    getAuthenticatedClinicId: (req) => String(req?.auth?.clinicId || '').trim(),
  };

  const { module: controller, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/controllers/financialController.js'),
    {
      [path.resolve(__dirname, '../../backend/src/services/financialService.js')]: financialServiceMock,
      [path.resolve(__dirname, '../../backend/src/utils/authContext.js')]: authContextMock,
    }
  );
  t.after(restore);

  const req = {
    auth: { clinicId: 'clinic-auth' },
    query: { clinicId: 'clinic-evil', month: '4', year: '2026' },
  };
  const res = createResponseDouble();
  let forwardedError = null;

  await controller.getMonthlySummary(req, res, (error) => {
    forwardedError = error;
  });

  assert.equal(forwardedError, null);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    clinicId: 'clinic-auth',
    month: 4,
    year: 2026,
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload, { ok: true, data: { totalRevenue: 1000 } });
});
