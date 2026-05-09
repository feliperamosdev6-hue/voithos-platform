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

test('pagamento do prontuario abate saldo pendente mais antigo sem inflar total previsto', async (t) => {
  const account = {
    id: 'account-open',
    clinicId: 'clinic-auth',
    patientId: 'patient-1',
    description: 'Tratamento previsto',
    totalAmount: 1000,
    status: 'OPEN',
    source: 'procedimento',
    category: 'procedimentos',
    dueDate: new Date('2026-05-10T00:00:00.000Z'),
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    metadata: { type: 'receita' },
    installments: [{
      id: 'installment-open',
      sequence: 1,
      dueDate: new Date('2026-05-10T00:00:00.000Z'),
      amount: 1000,
      status: 'PENDING',
      paidAt: null,
    }],
    transactions: [],
  };

  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/services/financialService.js'),
    {
      [path.resolve(__dirname, '../../backend/src/repositories/financialRepository.js')]: {
        financialRepository: {
          findPatientByIdAndClinic: async ({ clinicId, patientId }) => (
            clinicId === 'clinic-auth' && patientId === 'patient-1'
              ? { id: 'patient-1', clinicId: 'clinic-auth', nome: 'Paciente Teste' }
              : null
          ),
          listFinancialAccountsByPatient: async ({ clinicId, patientId }) => (
            clinicId === 'clinic-auth' && patientId === 'patient-1' ? [account] : []
          ),
          findFinancialAccountByIdAndClinic: async ({ clinicId, accountId }) => (
            clinicId === 'clinic-auth' && accountId === account.id ? account : null
          ),
          createTransaction: async (data) => {
            account.transactions.push({
              id: `transaction-${account.transactions.length + 1}`,
              createdAt: new Date('2026-05-09T12:00:00.000Z'),
              ...data,
            });
            return account.transactions[account.transactions.length - 1];
          },
          updateInstallment: async ({ installmentId, data }) => {
            const installment = account.installments.find((item) => item.id === installmentId);
            Object.assign(installment, data);
            return installment;
          },
          updateFinancialAccount: async ({ data }) => {
            Object.assign(account, data);
            return account;
          },
        },
      },
      [path.resolve(__dirname, '../../backend/src/services/planMessageService.js')]: {
        planMessageService: { handlePaymentConfirmedForInstallment: async () => null },
      },
      [path.resolve(__dirname, '../../backend/src/services/planFinancialAccountSyncService.js')]: {
        ensurePlanFinancialAccount: async () => null,
        ensurePlanFinancialAccounts: async () => [],
      },
    }
  );
  t.after(restore);

  const result = await serviceModule.financialService.applyPatientPayment({
    clinicId: 'clinic-auth',
    patientId: 'patient-1',
    amount: 300,
    method: 'PIX',
    paidAt: '2026-05-09T12:00:00.000Z',
    metadata: {
      origin: 'prontuario_payment',
      idempotencyKey: 'patient-payment-test-1',
    },
  });

  assert.equal(result.appliedAmount, 300);
  assert.equal(result.excessAmount, 0);
  assert.equal(result.summary.totalPaid, 300);
  assert.equal(result.summary.totalOpen, 700);
  assert.equal(result.summary.accounts[0].totalAmount, 1000);
  assert.equal(result.summary.accounts[0].remainingAmount, 700);
});

test('pagamento do prontuario maior que saldo quita pendencia e registra excedente sem saldo negativo', async (t) => {
  const accounts = [{
    id: 'account-open',
    clinicId: 'clinic-auth',
    patientId: 'patient-1',
    description: 'Parcela prevista',
    totalAmount: 100,
    status: 'OPEN',
    source: 'procedimento',
    category: 'procedimentos',
    dueDate: new Date('2026-05-10T00:00:00.000Z'),
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    metadata: { type: 'receita' },
    installments: [{
      id: 'installment-open',
      sequence: 1,
      dueDate: new Date('2026-05-10T00:00:00.000Z'),
      amount: 100,
      status: 'PENDING',
      paidAt: null,
    }],
    transactions: [],
  }];

  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/services/financialService.js'),
    {
      [path.resolve(__dirname, '../../backend/src/repositories/financialRepository.js')]: {
        financialRepository: {
          findPatientByIdAndClinic: async ({ clinicId, patientId }) => (
            clinicId === 'clinic-auth' && patientId === 'patient-1'
              ? { id: 'patient-1', clinicId: 'clinic-auth', nome: 'Paciente Teste' }
              : null
          ),
          listFinancialAccountsByPatient: async ({ clinicId, patientId }) => (
            clinicId === 'clinic-auth' && patientId === 'patient-1' ? accounts : []
          ),
          findFinancialAccountByIdAndClinic: async ({ clinicId, accountId }) => (
            clinicId === 'clinic-auth'
              ? accounts.find((item) => item.id === accountId) || null
              : null
          ),
          createFinancialAccount: async (data) => {
            const created = {
              id: 'account-excess',
              createdAt: new Date('2026-05-09T12:00:00.000Z'),
              updatedAt: new Date('2026-05-09T12:00:00.000Z'),
              installments: [],
              transactions: [],
              ...data,
            };
            accounts.push(created);
            return created;
          },
          replaceInstallments: async ({ accountId, installments }) => {
            const account = accounts.find((item) => item.id === accountId);
            account.installments = installments.map((item, index) => ({
              id: `${accountId}-installment-${index + 1}`,
              ...item,
            }));
            return account.installments;
          },
          createTransaction: async (data) => {
            const account = accounts.find((item) => item.id === data.accountId);
            account.transactions.push({
              id: `transaction-${data.accountId}-${account.transactions.length + 1}`,
              createdAt: new Date('2026-05-09T12:00:00.000Z'),
              ...data,
            });
            return account.transactions[account.transactions.length - 1];
          },
          updateInstallment: async ({ installmentId, data }) => {
            const installment = accounts.flatMap((item) => item.installments).find((item) => item.id === installmentId);
            Object.assign(installment, data);
            return installment;
          },
          updateFinancialAccount: async ({ id, data }) => {
            const account = accounts.find((item) => item.id === id);
            Object.assign(account, data);
            return account;
          },
        },
      },
      [path.resolve(__dirname, '../../backend/src/services/planMessageService.js')]: {
        planMessageService: { handlePaymentConfirmedForInstallment: async () => null },
      },
      [path.resolve(__dirname, '../../backend/src/services/planFinancialAccountSyncService.js')]: {
        ensurePlanFinancialAccount: async () => null,
        ensurePlanFinancialAccounts: async () => [],
      },
    }
  );
  t.after(restore);

  const result = await serviceModule.financialService.applyPatientPayment({
    clinicId: 'clinic-auth',
    patientId: 'patient-1',
    amount: 150,
    method: 'PIX',
    paidAt: '2026-05-09T12:00:00.000Z',
    description: 'Pagamento maior que saldo',
    metadata: {
      origin: 'prontuario_payment',
      idempotencyKey: 'patient-payment-test-overpay',
    },
  });

  assert.equal(result.appliedAmount, 100);
  assert.equal(result.excessAmount, 50);
  assert.equal(result.summary.totalOpen, 0);
  assert.equal(result.summary.totalPaid, 150);
  assert.ok(result.excessAccount?.metadata?.receivedOnly);
});

test('resumo financeiro do paciente ignora contas canceladas nos totais recebidos e pendentes', async (t) => {
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/services/financialService.js'),
    {
      [path.resolve(__dirname, '../../backend/src/repositories/financialRepository.js')]: {
        financialRepository: {
          listFinancialAccountsByPatient: async ({ clinicId, patientId }) => (
            clinicId === 'clinic-auth' && patientId === 'patient-1'
              ? [
                  {
                    id: 'account-open',
                    clinicId: 'clinic-auth',
                    patientId: 'patient-1',
                    description: 'Procedimento pendente',
                    totalAmount: 200,
                    status: 'OPEN',
                    source: 'procedimento',
                    category: 'procedimentos',
                    dueDate: new Date('2026-05-10T00:00:00.000Z'),
                    createdAt: new Date('2026-05-01T00:00:00.000Z'),
                    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
                    metadata: { type: 'receita' },
                    installments: [{
                      id: 'installment-open',
                      sequence: 1,
                      dueDate: new Date('2026-05-10T00:00:00.000Z'),
                      amount: 200,
                      status: 'PENDING',
                      paidAt: null,
                    }],
                    transactions: [],
                  },
                  {
                    id: 'account-canceled',
                    clinicId: 'clinic-auth',
                    patientId: 'patient-1',
                    description: 'Procedimento excluido',
                    totalAmount: 150,
                    status: 'CANCELED',
                    source: 'procedimento',
                    category: 'procedimentos',
                    dueDate: new Date('2026-05-08T00:00:00.000Z'),
                    createdAt: new Date('2026-05-01T00:00:00.000Z'),
                    updatedAt: new Date('2026-05-08T00:00:00.000Z'),
                    metadata: { type: 'receita' },
                    installments: [{
                      id: 'installment-canceled',
                      sequence: 1,
                      dueDate: new Date('2026-05-08T00:00:00.000Z'),
                      amount: 150,
                      status: 'PAID',
                      paidAt: new Date('2026-05-08T10:00:00.000Z'),
                    }],
                    transactions: [{
                      id: 'transaction-canceled',
                      accountId: 'account-canceled',
                      installmentId: 'installment-canceled',
                      type: 'PAYMENT',
                      amount: 150,
                      method: 'PIX',
                      createdAt: new Date('2026-05-08T10:00:00.000Z'),
                    }],
                  },
                ]
              : []
          ),
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

  const summary = await serviceModule.financialService.getPatientFinancialSummary({
    clinicId: 'clinic-auth',
    patientId: 'patient-1',
  });

  assert.equal(summary.totalOpen, 200);
  assert.equal(summary.totalPaid, 0);
  assert.equal(summary.totalAccounts, 2);
});
