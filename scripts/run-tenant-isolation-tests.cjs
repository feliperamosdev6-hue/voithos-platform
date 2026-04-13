const assert = require('node:assert/strict');
const path = require('path');
const { loadModuleWithMocks } = require('../tests/backend/helpers/load-module-with-mocks.cjs');

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

const tests = [];

const register = (name, fn) => {
  tests.push({ name, fn });
};

register('financialController.listAccounts usa clinicId autenticado', async () => {
  const calls = [];
  const { module: controller, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../backend/src/controllers/financialController.js'),
    {
      [path.resolve(__dirname, '../backend/src/services/financialService.js')]: {
        financialService: {
          listFinancialAccounts: async (input) => {
            calls.push(input);
            return [{ id: 'acc-1' }];
          },
        },
      },
      [path.resolve(__dirname, '../backend/src/utils/authContext.js')]: {
        getAuthenticatedClinicId: (req) => String(req?.auth?.clinicId || '').trim(),
      },
    }
  );

  try {
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
    assert.deepEqual(calls, [{ clinicId: 'clinic-auth', patientId: 'patient-1' }]);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.payload, { ok: true, data: [{ id: 'acc-1' }] });
  } finally {
    restore();
  }
});

register('financialController.getDashboard ignora clinicId da query', async () => {
  const calls = [];
  const { module: controller, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../backend/src/controllers/financialController.js'),
    {
      [path.resolve(__dirname, '../backend/src/services/financialService.js')]: {
        financialService: {
          getFinancialDashboard: async (input) => {
            calls.push(input);
            return { totalAccounts: 2 };
          },
        },
      },
      [path.resolve(__dirname, '../backend/src/utils/authContext.js')]: {
        getAuthenticatedClinicId: (req) => String(req?.auth?.clinicId || '').trim(),
      },
    }
  );

  try {
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
    assert.deepEqual(calls, [{ clinicId: 'clinic-auth' }]);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.payload, { ok: true, data: { totalAccounts: 2 } });
  } finally {
    restore();
  }
});

register('financialController.getMonthlySummary usa tenant autenticado', async () => {
  const calls = [];
  const { module: controller, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../backend/src/controllers/financialController.js'),
    {
      [path.resolve(__dirname, '../backend/src/services/financialService.js')]: {
        financialService: {
          getMonthlySummary: async (input) => {
            calls.push(input);
            return { totalRevenue: 1000 };
          },
        },
      },
      [path.resolve(__dirname, '../backend/src/utils/authContext.js')]: {
        getAuthenticatedClinicId: (req) => String(req?.auth?.clinicId || '').trim(),
      },
    }
  );

  try {
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
    assert.deepEqual(calls, [{ clinicId: 'clinic-auth', month: 4, year: 2026 }]);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.payload, { ok: true, data: { totalRevenue: 1000 } });
  } finally {
    restore();
  }
});

register('clinicalController.upsertPatientProcedure ignora clinicId do body', async () => {
  const calls = [];
  const { module: controller, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../backend/src/controllers/clinicalController.js'),
    {
      [path.resolve(__dirname, '../backend/src/services/patientClinicalService.js')]: {
        patientClinicalService: {
          upsertProcedure: async (input) => {
            calls.push(input);
            return { service: { id: 'proc-1' }, financeId: 'acc-1' };
          },
        },
      },
      [path.resolve(__dirname, '../backend/src/utils/authContext.js')]: {
        getAuthenticatedClinicId: (req) => String(req?.auth?.clinicId || '').trim(),
      },
    }
  );

  try {
    const req = {
      auth: { clinicId: 'clinic-auth' },
      params: { patientId: 'patient-1' },
      body: {
        clinicId: 'clinic-evil',
        procedure: { id: 'proc-1', tipo: 'Limpeza' },
      },
    };
    const res = createResponseDouble();
    let forwardedError = null;
    await controller.upsertPatientProcedure(req, res, (error) => {
      forwardedError = error;
    });
    assert.equal(forwardedError, null);
    assert.deepEqual(calls, [{
      clinicId: 'clinic-auth',
      patientId: 'patient-1',
      procedure: { id: 'proc-1', tipo: 'Limpeza' },
    }]);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.payload, {
      ok: true,
      data: { service: { id: 'proc-1' }, financeId: 'acc-1' },
    });
  } finally {
    restore();
  }
});

register('patientClinicalService.getClinicalRecord usa lookup scoped por clinicId', async () => {
  const calls = [];
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../backend/src/services/patientClinicalService.js'),
    {
      [path.resolve(__dirname, '../backend/src/repositories/patientRepository.js')]: {
        patientRepository: {
          findByIdAndClinic: async (patientId, clinicId) => {
            calls.push({ patientId, clinicId });
            return { id: patientId, clinicId };
          },
        },
      },
      [path.resolve(__dirname, '../backend/src/repositories/patientClinicalRepository.js')]: {
        patientClinicalRepository: {
          ensureClinicalRecord: async ({ clinicId, patientId }) => ({
            id: 'record-1',
            clinicId,
            patientId,
          }),
        },
      },
      [path.resolve(__dirname, '../backend/src/repositories/financialRepository.js')]: { financialRepository: {} },
      [path.resolve(__dirname, '../backend/src/services/patientDocumentStorageService.js')]: { patientDocumentStorageService: {} },
      [path.resolve(__dirname, '../backend/src/services/financialService.js')]: {
        financialService: {},
        mapAccountToLegacy: (row) => row,
      },
    }
  );

  try {
    const result = await serviceModule.patientClinicalService.getClinicalRecord({
      clinicId: 'clinic-auth',
      patientId: 'patient-1',
    });
    assert.deepEqual(calls, [{ patientId: 'patient-1', clinicId: 'clinic-auth' }]);
    assert.deepEqual(result, {
      id: 'record-1',
      clinicId: 'clinic-auth',
      patientId: 'patient-1',
    });
  } finally {
    restore();
  }
});

register('patientClinicalService.getClinicalRecord retorna 404 quando o paciente esta fora do tenant', async () => {
  let ensureCalled = false;
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../backend/src/services/patientClinicalService.js'),
    {
      [path.resolve(__dirname, '../backend/src/repositories/patientRepository.js')]: {
        patientRepository: {
          findByIdAndClinic: async () => null,
        },
      },
      [path.resolve(__dirname, '../backend/src/repositories/patientClinicalRepository.js')]: {
        patientClinicalRepository: {
          ensureClinicalRecord: async () => {
            ensureCalled = true;
            return null;
          },
        },
      },
      [path.resolve(__dirname, '../backend/src/repositories/financialRepository.js')]: { financialRepository: {} },
      [path.resolve(__dirname, '../backend/src/services/patientDocumentStorageService.js')]: { patientDocumentStorageService: {} },
      [path.resolve(__dirname, '../backend/src/services/financialService.js')]: {
        financialService: {},
        mapAccountToLegacy: (row) => row,
      },
    }
  );

  try {
    await assert.rejects(
      () => serviceModule.patientClinicalService.getClinicalRecord({
        clinicId: 'clinic-auth',
        patientId: 'patient-1',
      }),
      (error) => {
        assert.equal(error?.code, 'PATIENT_NOT_FOUND');
        return true;
      }
    );
    assert.equal(ensureCalled, false);
  } finally {
    restore();
  }
});

const main = async () => {
  let passed = 0;
  for (const entry of tests) {
    try {
      await entry.fn();
      passed += 1;
      console.log(`ok - ${entry.name}`);
    } catch (error) {
      console.error(`not ok - ${entry.name}`);
      console.error(error);
      process.exitCode = 1;
    }
  }
  if (process.exitCode && process.exitCode !== 0) {
    console.error(`tenant isolation tests failed (${passed}/${tests.length} passed)`);
    return;
  }
  console.log(`tenant isolation tests passed (${passed}/${tests.length})`);
};

main().catch((error) => {
  console.error('tenant isolation test runner failed');
  console.error(error);
  process.exit(1);
});
