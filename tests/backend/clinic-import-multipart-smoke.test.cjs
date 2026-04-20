const assert = require('node:assert/strict');
const path = require('path');
const { loadModuleWithMocks } = require('./helpers/load-module-with-mocks.cjs');

const main = async () => {
  const csvBuffer = Buffer.from(
    'Nome,CPF,E-mail\nAna Maria,123.456.789-00,ana@voithos.com\n',
    'utf8'
  );

  let previewWhere = null;
  let createWhere = null;
  let transactionCalls = 0;

  const { module: clinicServiceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/services/clinicService.js'),
    {
      [path.resolve(__dirname, '../../backend/src/db/prisma.js')]: {
        prisma: {
          patient: {
            findMany: async (input) => {
              previewWhere = input;
              return [];
            },
          },
          $transaction: async (callback) => {
            transactionCalls += 1;
            return callback({
              patient: {
                findMany: async () => [],
                create: async ({ data }) => {
                  createWhere = data;
                  return {
                    id: 'patient-1',
                    ...data,
                  };
                },
              },
            });
          },
        },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/clinicRepository.js')]: {
        clinicRepository: {
          findProfileById: async (clinicId) => ({
            id: clinicId,
            nomeFantasia: 'Clinica Teste',
          }),
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
        patientClinicalService: {},
      },
      [path.resolve(__dirname, '../../backend/src/services/financialService.js')]: {
        financialService: {},
      },
      [path.resolve(__dirname, '../../backend/src/services/authService.js')]: {
        authService: {},
        SESSION_TTL_DAYS: 7,
      },
    }
  );

  try {
    const preview = await clinicServiceModule.clinicService.previewPatientImportData({
      clinicId: 'clinic-auth',
      payload: {
        clinicId: 'clinic-evil',
        source: 'capim',
        file: {
          originalname: 'pacientes.csv',
          buffer: csvBuffer,
        },
      },
    });

    assert.equal(preview.stage, 'patients');
    assert.equal(preview.totalRows, 1);
    assert.equal(preview.normalizedRows, 1);
    assert.equal(preview.validRows, 1);
    assert.equal(preview.duplicateRows, 0);
    assert.deepEqual(preview.headers, ['Nome', 'CPF', 'E-mail']);
    assert.deepEqual(previewWhere, {
      where: { clinicId: 'clinic-auth' },
      select: { cpf: true, email: true, nome: true, dataNascimento: true },
    });

    const result = await clinicServiceModule.clinicService.applyPatientImportData({
      clinicId: 'clinic-auth',
      payload: {
        clinicId: 'clinic-evil',
        source: 'capim',
        file: {
          originalname: 'pacientes.csv',
          buffer: csvBuffer,
        },
      },
    });

    assert.equal(transactionCalls, 1);
    assert.equal(result.imported, 1);
    assert.equal(result.skipped, 0);
    assert.equal(result.createdPatients.length, 1);
    assert.equal(result.createdPatients[0].nome, 'Ana Maria');
    assert.equal(result.createdPatients[0].cpf, '12345678900');
    assert.equal(createWhere.clinicId, 'clinic-auth');
    assert.equal(createWhere.nome, 'Ana Maria');
    assert.equal(createWhere.cpf, '12345678900');
    assert.ok(!Object.prototype.hasOwnProperty.call(createWhere, 'clinicIdEvil'));

    console.log('ok - multipart patient import preview/apply preserva tenant e processa req.file');
  } finally {
    restore();
  }
};

main().catch((error) => {
  console.error('not ok - multipart patient import smoke test');
  console.error(error);
  process.exit(1);
});
