const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadModuleWithMocks } = require('./helpers/load-module-with-mocks.cjs');

test('relationshipService.getOverview falha antes do fanout sem clinicId autenticado', async (t) => {
  let downstreamCalled = false;
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/services/relationshipService.js'),
    {
      [path.resolve(__dirname, '../../backend/src/services/patientService.js')]: {
        patientService: {
          listByClinic: async () => {
            downstreamCalled = true;
            return [];
          },
        },
      },
      [path.resolve(__dirname, '../../backend/src/services/appointmentService.js')]: {
        appointmentService: {
          listAppointments: async () => {
            downstreamCalled = true;
            return [];
          },
        },
      },
      [path.resolve(__dirname, '../../backend/src/services/campaignService.js')]: {
        campaignService: {
          getDashboard: async () => {
            downstreamCalled = true;
            return {};
          },
          listDispatchLogs: async () => {
            downstreamCalled = true;
            return { items: [] };
          },
        },
      },
      [path.resolve(__dirname, '../../backend/src/services/financialService.js')]: {
        financialService: {
          getFinancialDashboard: async () => {
            downstreamCalled = true;
            return {};
          },
          listPatientPlans: async () => {
            downstreamCalled = true;
            return [];
          },
        },
      },
      [path.resolve(__dirname, '../../backend/src/services/planMessageService.js')]: { planMessageService: {} },
      [path.resolve(__dirname, '../../backend/src/services/clinicService.js')]: {
        clinicService: {
          getOperationalSettings: async () => {
            downstreamCalled = true;
            return {};
          },
        },
      },
    }
  );
  t.after(restore);

  await assert.rejects(
    () => serviceModule.relationshipService.getOverview({
      clinicId: '',
      date: '2026-04-13',
    }),
    (error) => {
      assert.equal(error?.code, 'UNAUTHORIZED');
      return true;
    }
  );
  assert.equal(downstreamCalled, false);
});
