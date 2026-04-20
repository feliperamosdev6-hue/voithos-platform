const assert = require('node:assert/strict');
const path = require('path');
const { loadModuleWithMocks } = require('./helpers/load-module-with-mocks.cjs');

const makeCsvBuffer = (csv) => Buffer.from(csv, 'utf8');

const loadClinicService = (mockMap) => loadModuleWithMocks(
  path.resolve(__dirname, '../../backend/src/services/clinicService.js'),
  mockMap
);

const commonMocks = (overrides = {}) => ({
  [path.resolve(__dirname, '../../backend/src/db/prisma.js')]: {
    prisma: {
      patient: {
        findMany: async () => ([{ id: 'patient-1', nome: 'Ana Maria', cpf: '12345678900' }]),
      },
      $transaction: async (callback) => callback({
        appointment: {
          create: async ({ data }) => ({ id: 'appt-1', patientId: data.patientId, dataHora: data.dataHora }),
        },
      }),
    },
  },
  [path.resolve(__dirname, '../../backend/src/repositories/clinicRepository.js')]: {
    clinicRepository: {
      findProfileById: async () => ({ id: 'clinic-auth', nomeFantasia: 'Clinica Teste', operationalSettings: { proceduresCatalog: [] } }),
      getOperationalSettings: async () => ({ proceduresCatalog: [] }),
      updateOperationalSettings: async (_clinicId, settings) => settings,
    },
  },
  [path.resolve(__dirname, '../../backend/src/repositories/patientRepository.js')]: {
    patientRepository: {},
  },
  [path.resolve(__dirname, '../../backend/src/repositories/patientClinicalRepository.js')]: {
    patientClinicalRepository: {},
  },
  [path.resolve(__dirname, '../../backend/src/repositories/userRepository.js')]: {
    userRepository: {},
  },
  [path.resolve(__dirname, '../../backend/src/services/appointmentService.js')]: {
    appointmentService: {},
  },
  [path.resolve(__dirname, '../../backend/src/services/patientClinicalService.js')]: {
    patientClinicalService: {
      upsertProcedure: async () => ({ ok: true }),
    },
  },
  [path.resolve(__dirname, '../../backend/src/services/financialService.js')]: {
    financialService: {
      createFinancialAccount: async ({ clinicId, payload }) => ({
        id: 'acc-1',
        clinicId,
        descricao: payload.description,
        totalAmount: payload.totalAmount,
      }),
    },
  },
  [path.resolve(__dirname, '../../backend/src/services/authService.js')]: {
    authService: {},
    SESSION_TTL_DAYS: 7,
  },
  ...overrides,
});

const run = async (name, fn) => {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
};

const main = async () => {
  await run('agenda multipart preview/apply preserva tenant e grava no destino certo', async () => {
    let txCalls = 0;
    let createPayload = null;
    const { module: clinicServiceModule, restore } = loadClinicService(commonMocks({
      [path.resolve(__dirname, '../../backend/src/db/prisma.js')]: {
        prisma: {
          patient: {
            findMany: async () => ([{ id: 'patient-1', nome: 'Ana Maria', cpf: '12345678900' }]),
          },
          $transaction: async (callback) => {
            txCalls += 1;
            return callback({
              appointment: {
                create: async ({ data }) => {
                  createPayload = data;
                  return { id: 'appt-1', patientId: data.patientId, dataHora: data.dataHora };
                },
              },
            });
          },
        },
      },
    }));

    try {
      const csv = makeCsvBuffer([
        'Paciente,CPF,DataHora,Profissional,Status,Tipo,Observacoes',
        'Ana Maria,123.456.789-00,2026-04-20 10:00,Dr. Teste,AGENDADO,Consulta,Primeiro agendamento',
      ].join('\n'));

      const preview = await clinicServiceModule.clinicService.previewAppointmentImportData({
        clinicId: 'clinic-auth',
        payload: {
          clinicId: 'clinic-evil',
          source: 'outro',
          file: { originalname: 'agenda.csv', buffer: csv },
        },
      });
      assert.equal(preview.stage, 'agenda');
      assert.equal(preview.matchedRows, 1);
      assert.equal(preview.missingPatients, 0);
      assert.equal(preview.invalidDates, 0);

      const applied = await clinicServiceModule.clinicService.applyAppointmentImportData({
        clinicId: 'clinic-auth',
        payload: {
          clinicId: 'clinic-evil',
          source: 'outro',
          file: { originalname: 'agenda.csv', buffer: csv },
        },
      });

      assert.equal(txCalls, 1);
      assert.equal(applied.imported, 1);
      assert.equal(applied.skipped, 0);
      assert.equal(createPayload.clinicId, 'clinic-auth');
      assert.equal(createPayload.patientId, 'patient-1');
      assert.equal(createPayload.status, 'AGENDADO');
    } finally {
      restore();
    }
  });

  await run('fichas clinicas multipart preview/apply preserva tenant e vincula paciente', async () => {
    let upsertCalls = [];
    const { module: clinicServiceModule, restore } = loadClinicService(commonMocks({
      [path.resolve(__dirname, '../../backend/src/services/patientClinicalService.js')]: {
        patientClinicalService: {
          upsertProcedure: async (input) => {
            upsertCalls.push(input);
            return { ok: true };
          },
        },
      },
    }));

    try {
      const csv = makeCsvBuffer([
        'Paciente,CPF,Procedimento,Codigo,Status,Dentista,Dente,Faces,Observacoes,DataRealizacao,DataCadastro,Valor',
        'Ana Maria,123.456.789-00,Limpeza,PROC-1,REALIZADO,Dr. Lima,16,VD,Ok,2026-04-20,2026-04-20,120.50',
      ].join('\n'));

      const preview = await clinicServiceModule.clinicService.previewClinicalImportData({
        clinicId: 'clinic-auth',
        payload: {
          clinicId: 'clinic-evil',
          source: 'outro',
          file: { originalname: 'fichas.csv', buffer: csv },
        },
      });
      assert.equal(preview.stage, 'clinical');
      assert.equal(preview.matchedRows, 1);
      assert.equal(preview.missingPatients, 0);
      assert.equal(preview.withoutProcedure, 0);

      const applied = await clinicServiceModule.clinicService.applyClinicalImportData({
        clinicId: 'clinic-auth',
        payload: {
          clinicId: 'clinic-evil',
          source: 'outro',
          file: { originalname: 'fichas.csv', buffer: csv },
        },
      });

      assert.equal(applied.imported, 1);
      assert.equal(applied.skipped, 0);
      assert.equal(upsertCalls.length, 1);
      assert.equal(upsertCalls[0].clinicId, 'clinic-auth');
      assert.equal(upsertCalls[0].patientId, 'patient-1');
      assert.equal(upsertCalls[0].procedure.nome, 'Limpeza');
    } finally {
      restore();
    }
  });

  await run('fluxo de caixa multipart preview/apply preserva tenant e lança no financeiro', async () => {
    let financialCalls = [];
    const { module: clinicServiceModule, restore } = loadClinicService(commonMocks({
      [path.resolve(__dirname, '../../backend/src/services/financialService.js')]: {
        financialService: {
          createFinancialAccount: async ({ clinicId, payload }) => {
            financialCalls.push({ clinicId, payload });
            return {
              id: 'acc-1',
              clinicId,
              descricao: payload.description,
              totalAmount: payload.totalAmount,
            };
          },
        },
      },
    }));

    try {
      const csv = makeCsvBuffer([
        'Descricao,Paciente,CPF,Valor,Tipo,MetodPagamento,Data,Vencimento,Status,Categoria,Origem',
        'Pagamento realizado,Ana Maria,123.456.789-00,220.00,receita,PIX,2026-04-20,2026-04-25,PAID,receitas,Capim',
      ].join('\n'));

      const preview = await clinicServiceModule.clinicService.previewCashflowImportData({
        clinicId: 'clinic-auth',
        payload: {
          clinicId: 'clinic-evil',
          source: 'outro',
          file: { originalname: 'fluxo.csv', buffer: csv },
        },
      });
      assert.equal(preview.stage, 'cashflow');
      assert.equal(preview.revenueRows, 1);
      assert.equal(preview.expenseRows, 0);
      assert.equal(preview.invalidRows, 0);

      const applied = await clinicServiceModule.clinicService.applyCashflowImportData({
        clinicId: 'clinic-auth',
        payload: {
          clinicId: 'clinic-evil',
          source: 'outro',
          file: { originalname: 'fluxo.csv', buffer: csv },
        },
      });

      assert.equal(applied.imported, 1);
      assert.equal(applied.skipped, 0);
      assert.equal(financialCalls.length, 1);
      assert.equal(financialCalls[0].clinicId, 'clinic-auth');
      assert.equal(financialCalls[0].payload.description, 'Pagamento realizado');
      assert.equal(financialCalls[0].payload.patientId, 'patient-1');
    } finally {
      restore();
    }
  });

  await run('procedimentos multipart preview/apply preserva tenant e mescla catalogo', async () => {
    let updateArgs = null;
    const { module: clinicServiceModule, restore } = loadClinicService(commonMocks({
      [path.resolve(__dirname, '../../backend/src/repositories/clinicRepository.js')]: {
        clinicRepository: {
          findProfileById: async () => ({
            id: 'clinic-auth',
            nomeFantasia: 'Clinica Teste',
            operationalSettings: {
              proceduresCatalog: [
                { codigo: 'PROC-0', nome: 'Consulta Inicial', preco: 50, ativo: true },
              ],
            },
          }),
          getOperationalSettings: async () => ({
            proceduresCatalog: [
              { codigo: 'PROC-0', nome: 'Consulta Inicial', preco: 50, ativo: true },
            ],
          }),
          updateOperationalSettings: async (clinicId, settings) => {
            updateArgs = { clinicId, settings };
            return settings;
          },
        },
      },
    }));

    try {
      const csv = makeCsvBuffer([
        'Codigo,Nome,Preco,Ativo',
        'PROC-1,Limpeza,120.00,true',
      ].join('\n'));

      const preview = await clinicServiceModule.clinicService.previewProceduresImportData({
        clinicId: 'clinic-auth',
        payload: {
          clinicId: 'clinic-evil',
          source: 'outro',
          file: { originalname: 'procedimentos.csv', buffer: csv },
        },
      });
      assert.equal(preview.stage, 'procedures');
      assert.equal(preview.newItems, 1);
      assert.equal(preview.updatedItems, 0);
      assert.equal(preview.currentItems, 1);

      const applied = await clinicServiceModule.clinicService.applyProceduresImportData({
        clinicId: 'clinic-auth',
        payload: {
          clinicId: 'clinic-evil',
          source: 'outro',
          file: { originalname: 'procedimentos.csv', buffer: csv },
        },
      });

      assert.equal(applied.imported, 1);
      assert.equal(applied.skipped, 0);
      assert.equal(updateArgs.clinicId, 'clinic-auth');
      assert.equal(Array.isArray(updateArgs.settings.proceduresCatalog), true);
      assert.equal(updateArgs.settings.proceduresCatalog.length, 2);
      assert.ok(updateArgs.settings.proceduresCatalog.some((item) => item.codigo === 'PROC-1' && item.nome === 'Limpeza'));
    } finally {
      restore();
    }
  });

  if (process.exitCode && process.exitCode !== 0) {
    console.error('multipart stage smoke tests failed');
    return;
  }
  console.log('multipart stage smoke tests passed (4/4)');
};

main().catch((error) => {
  console.error('multipart stage smoke test runner failed');
  console.error(error);
  process.exit(1);
});
