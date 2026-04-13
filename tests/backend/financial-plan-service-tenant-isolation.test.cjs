const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadModuleWithMocks } = require('./helpers/load-module-with-mocks.cjs');

test('financialService.listPatientPlans valida patientId dentro do tenant antes de consultar planos', async (t) => {
  let listPlansCalled = false;
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/services/financialService.js'),
    {
      [path.resolve(__dirname, '../../backend/src/repositories/financialRepository.js')]: {
        financialRepository: {
          findPatientByIdAndClinic: async () => null,
          listPatientPlansByPatient: async () => {
            listPlansCalled = true;
            return [];
          },
        },
      },
      [path.resolve(__dirname, '../../backend/src/services/planMessageService.js')]: { planMessageService: {} },
      [path.resolve(__dirname, '../../backend/src/services/planFinancialAccountSyncService.js')]: {
        ensurePlanFinancialAccount: async () => null,
        ensurePlanFinancialAccounts: async () => [],
      },
    }
  );
  t.after(restore);

  await assert.rejects(
    () => serviceModule.financialService.listPatientPlans({
      clinicId: 'clinic-auth',
      patientId: 'patient-1',
    }),
    (error) => {
      assert.equal(error?.code, 'PATIENT_NOT_FOUND');
      return true;
    }
  );
  assert.equal(listPlansCalled, false);
});

test('financialService.createPatientPlan usa clinicId explicito e ignora payload.clinicId', async (t) => {
  const patientLookupCalls = [];
  const stopError = new Error('stop_after_create_call');
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/services/financialService.js'),
    {
      [path.resolve(__dirname, '../../backend/src/repositories/financialRepository.js')]: {
        financialRepository: {
          findPatientByIdAndClinic: async (input) => {
            patientLookupCalls.push(input);
            return { id: input.patientId, nome: 'Paciente', clinicId: input.clinicId };
          },
          createPatientPlan: async () => {
            throw stopError;
          },
        },
      },
      [path.resolve(__dirname, '../../backend/src/services/planMessageService.js')]: { planMessageService: {} },
      [path.resolve(__dirname, '../../backend/src/services/planFinancialAccountSyncService.js')]: {
        ensurePlanFinancialAccount: async () => null,
        ensurePlanFinancialAccounts: async () => [],
      },
    }
  );
  t.after(restore);

  await assert.rejects(
    () => serviceModule.financialService.createPatientPlan({
      clinicId: 'clinic-auth',
      payload: {
        clinicId: 'clinic-evil',
        patientId: 'patient-1',
        totalValue: 500,
      },
    }),
    (error) => error === stopError
  );

  assert.deepEqual(patientLookupCalls, [{
    clinicId: 'clinic-auth',
    patientId: 'patient-1',
  }]);
});
