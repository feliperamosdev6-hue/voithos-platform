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

test('ensurePlanFinancialAccount normaliza metodo CREDIT para enum CARD sem perder detalhe', async (t) => {
  let createdAccount = null;
  const { module: syncModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/services/planFinancialAccountSyncService.js'),
    {
      [path.resolve(__dirname, '../../backend/src/repositories/financialRepository.js')]: {
        financialRepository: {
          findPlanFinancialAccountByPlanId: async () => null,
          createFinancialAccount: async (data) => {
            createdAccount = data;
            return { id: 'account-1', ...data };
          },
          replaceInstallments: async () => [],
          findFinancialAccountByIdAndClinic: async () => ({ id: 'account-1', ...createdAccount, installments: [], transactions: [] }),
        },
      },
    }
  );
  t.after(restore);

  await syncModule.ensurePlanFinancialAccount({
    clinicId: 'clinic-auth',
    planRow: {
      id: 'plan-1',
      clinicId: 'clinic-auth',
      patientId: 'patient-1',
      patient: { id: 'patient-1', nome: 'Paciente' },
      name: 'Plano teste',
      totalValue: 500,
      installments: 2,
      entryAmount: 100,
      metadata: {
        entryPaymentMethod: 'CREDIT',
        schedule: [
          { sequence: 1, dueDate: '2026-05-10', amount: 200, status: 'PENDING' },
          { sequence: 2, dueDate: '2026-06-10', amount: 200, status: 'PENDING' },
        ],
      },
    },
  });

  assert.equal(createdAccount.paymentMethod, 'CARD');
  assert.equal(createdAccount.metadata.entryPaymentMethod, 'CREDIT');
  assert.equal(createdAccount.clinicId, 'clinic-auth');
  assert.equal(createdAccount.patientId, 'patient-1');
});

test('financialService.getFinancialReminders ignora procedimento sem vencimento financeiro explicito', async (t) => {
  const yesterday = new Date(Date.now() - 86400000);
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/services/financialService.js'),
    {
      [path.resolve(__dirname, '../../backend/src/repositories/financialRepository.js')]: {
        financialRepository: {
          listFinancialAccountsByClinic: async () => [{
            id: 'acc-procedure',
            clinicId: 'clinic-auth',
            patientId: 'patient-1',
            patientProcedureId: 'procedure-row-1',
            description: 'Procedimento: limpeza',
            totalAmount: 300,
            status: 'OPEN',
            category: 'procedimentos',
            source: 'procedimento',
            dueDate: yesterday,
            paymentMethod: 'PIX',
            externalReference: 'procedure-1',
            metadata: {
              origin: 'procedimento',
              category: 'procedimentos',
              type: 'receita',
              procedureId: 'procedure-1',
              explicitDueDate: false,
              dueDateSource: 'clinical_fallback',
            },
            createdAt: yesterday,
            updatedAt: yesterday,
            installments: [{
              id: 'inst-procedure',
              accountId: 'acc-procedure',
              sequence: 1,
              dueDate: yesterday,
              amount: 300,
              status: 'PENDING',
              paidAt: null,
            }],
            transactions: [],
          }],
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

  const reminders = await serviceModule.financialService.getFinancialReminders({ clinicId: 'clinic-auth' });
  assert.equal(reminders.overdue.count, 0);
});

test('financialService.getFinancialReminders mantem recebivel vencido com vencimento financeiro', async (t) => {
  const yesterday = new Date(Date.now() - 86400000);
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/services/financialService.js'),
    {
      [path.resolve(__dirname, '../../backend/src/repositories/financialRepository.js')]: {
        financialRepository: {
          listFinancialAccountsByClinic: async () => [{
            id: 'acc-financial',
            clinicId: 'clinic-auth',
            patientId: 'patient-1',
            patientProcedureId: null,
            description: 'Recebivel avulso',
            totalAmount: 200,
            status: 'OPEN',
            category: 'mensalidades',
            source: 'financeiro',
            dueDate: yesterday,
            paymentMethod: 'PIX',
            externalReference: '',
            metadata: {
              type: 'receita',
              patientName: 'Paciente',
              explicitDueDate: true,
              dueDateSource: 'financial',
            },
            createdAt: yesterday,
            updatedAt: yesterday,
            installments: [{
              id: 'inst-financial',
              accountId: 'acc-financial',
              sequence: 1,
              dueDate: yesterday,
              amount: 200,
              status: 'PENDING',
              paidAt: null,
            }],
            transactions: [],
          }],
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

  const reminders = await serviceModule.financialService.getFinancialReminders({ clinicId: 'clinic-auth' });
  assert.equal(reminders.overdue.count, 1);
  assert.equal(reminders.overdue.items[0].accountId, 'acc-financial');
});
