const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadModuleWithMocks } = require('./helpers/load-module-with-mocks.cjs');

test('recebimento avulso do prontuario nao infla total previsto do financeiro', async (t) => {
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/services/financialService.js'),
    {
      [path.resolve(__dirname, '../../backend/src/repositories/financialRepository.js')]: {
        financialRepository: {
          listFinancialAccountsByClinic: async () => [
            {
              id: 'account-planned',
              clinicId: 'clinic-auth',
              patientId: 'patient-1',
              description: 'Tratamento previsto',
              totalAmount: 100,
              status: 'OPEN',
              source: 'procedimento',
              category: 'procedimentos',
              dueDate: new Date('2026-05-10T00:00:00.000Z'),
              createdAt: new Date('2026-05-01T00:00:00.000Z'),
              updatedAt: new Date('2026-05-01T00:00:00.000Z'),
              metadata: { type: 'receita' },
              installments: [{
                id: 'installment-planned',
                sequence: 1,
                dueDate: new Date('2026-05-10T00:00:00.000Z'),
                amount: 100,
                status: 'PENDING',
                paidAt: null,
              }],
              transactions: [],
            },
            {
              id: 'account-received-only',
              clinicId: 'clinic-auth',
              patientId: 'patient-1',
              description: 'Recebimento avulso',
              totalAmount: 50,
              status: 'PAID',
              source: 'prontuario',
              category: 'outros',
              dueDate: new Date('2026-05-08T00:00:00.000Z'),
              createdAt: new Date('2026-05-08T00:00:00.000Z'),
              updatedAt: new Date('2026-05-08T00:00:00.000Z'),
              metadata: { type: 'receita', receivedOnly: true, origin: 'prontuario_payment' },
              installments: [{
                id: 'installment-received-only',
                sequence: 1,
                dueDate: new Date('2026-05-08T00:00:00.000Z'),
                amount: 50,
                status: 'PAID',
                paidAt: new Date('2026-05-08T10:00:00.000Z'),
              }],
              transactions: [{
                id: 'transaction-received-only',
                accountId: 'account-received-only',
                installmentId: 'installment-received-only',
                type: 'PAYMENT',
                amount: 50,
                method: 'PIX',
                createdAt: new Date('2026-05-08T10:00:00.000Z'),
                metadata: { receivedOnly: true, origin: 'prontuario_payment' },
              }],
            },
          ],
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

  const summary = await serviceModule.financialService.getMonthlySummary({
    clinicId: 'clinic-auth',
    month: 5,
    year: 2026,
  });

  assert.equal(summary.totalRevenue, 100);
  assert.equal(summary.totalReceived, 50);
  assert.equal(summary.totalPending, 100);
  assert.equal(summary.totalOverdue, 0);
});
