const assert = require('node:assert/strict');
const path = require('path');
const JSZip = require('jszip');
const XLSX = require('xlsx');
const { loadModuleWithMocks } = require('./helpers/load-module-with-mocks.cjs');

const loadClinicService = (mockMap) => loadModuleWithMocks(
  path.resolve(__dirname, '../../backend/src/services/clinicService.js'),
  mockMap
);

const makeCommonMocks = (patientRows = []) => ({
  [path.resolve(__dirname, '../../backend/src/db/prisma.js')]: {
    prisma: {
      patient: {
        findMany: async (input) => {
          if (input?.where?.clinicId) {
            return patientRows;
          }
          return [];
        },
      },
      $transaction: async (callback) => callback({
        patient: {
          findMany: async () => [],
          create: async ({ data }) => ({ id: 'patient-1', ...data }),
        },
      }),
    },
  },
  [path.resolve(__dirname, '../../backend/src/repositories/clinicRepository.js')]: {
    clinicRepository: {
      findProfileById: async () => ({ id: 'clinic-auth', nomeFantasia: 'Clinica Teste' }),
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
  await run('xlsx multipart preview/apply importa pacientes sem misturar tenant', async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet([
      { Nome: 'Ana Maria', CPF: '123.456.789-00', E_mail: 'ana@voithos.com' },
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Pacientes');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const { module: clinicServiceModule, restore } = loadClinicService(makeCommonMocks());
    try {
      const preview = await clinicServiceModule.clinicService.previewPatientImportData({
        clinicId: 'clinic-auth',
        payload: {
          clinicId: 'clinic-evil',
          source: 'capim',
          file: { originalname: 'pacientes.xlsx', buffer },
        },
      });

      assert.equal(preview.stage, 'patients');
      assert.equal(preview.totalRows, 1);
      assert.equal(preview.validRows, 1);
      assert.deepEqual(preview.headers, ['Nome', 'CPF', 'E_mail']);

      const applied = await clinicServiceModule.clinicService.applyPatientImportData({
        clinicId: 'clinic-auth',
        payload: {
          clinicId: 'clinic-evil',
          source: 'capim',
          file: { originalname: 'pacientes.xlsx', buffer },
        },
      });

      assert.equal(applied.imported, 1);
      assert.equal(applied.createdPatients[0].nome, 'Ana Maria');
      assert.equal(applied.createdPatients[0].cpf, '12345678900');
    } finally {
      restore();
    }
  });

  await run('xls multipart preview/apply importa pacientes sem misturar tenant', async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Nome', 'CPF', 'Email'],
      ['Bruno Silva', '987.654.321-00', 'bruno@voithos.com'],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Pacientes');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xls' });

    const { module: clinicServiceModule, restore } = loadClinicService(makeCommonMocks());
    try {
      const preview = await clinicServiceModule.clinicService.previewPatientImportData({
        clinicId: 'clinic-auth',
        payload: {
          clinicId: 'clinic-evil',
          source: 'clinicorp',
          file: { originalname: 'pacientes.xls', buffer },
        },
      });

      assert.equal(preview.stage, 'patients');
      assert.equal(preview.totalRows, 1);
      assert.equal(preview.validRows, 1);

      const applied = await clinicServiceModule.clinicService.applyPatientImportData({
        clinicId: 'clinic-auth',
        payload: {
          clinicId: 'clinic-evil',
          source: 'clinicorp',
          file: { originalname: 'pacientes.xls', buffer },
        },
      });

      assert.equal(applied.imported, 1);
      assert.equal(applied.createdPatients[0].nome, 'Bruno Silva');
      assert.equal(applied.createdPatients[0].cpf, '98765432100');
    } finally {
      restore();
    }
  });

  await run('zip multipart preview/apply importa pacientes de arquivo interno', async () => {
    const zip = new JSZip();
    zip.file('pacientes.csv', 'Nome,CPF,E-mail\nCarla Souza,111.222.333-44,carla@voithos.com\n');
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    const { module: clinicServiceModule, restore } = loadClinicService(makeCommonMocks());
    try {
      const preview = await clinicServiceModule.clinicService.previewPatientImportData({
        clinicId: 'clinic-auth',
        payload: {
          clinicId: 'clinic-evil',
          source: 'outro',
          file: { originalname: 'pacientes.zip', buffer },
        },
      });

      assert.equal(preview.stage, 'patients');
      assert.equal(preview.totalRows, 1);
      assert.equal(preview.validRows, 1);

      const applied = await clinicServiceModule.clinicService.applyPatientImportData({
        clinicId: 'clinic-auth',
        payload: {
          clinicId: 'clinic-evil',
          source: 'outro',
          file: { originalname: 'pacientes.zip', buffer },
        },
      });

      assert.equal(applied.imported, 1);
      assert.equal(applied.createdPatients[0].nome, 'Carla Souza');
      assert.equal(applied.createdPatients[0].cpf, '11122233344');
    } finally {
      restore();
    }
  });

  if (process.exitCode && process.exitCode !== 0) {
    console.error('binary format smoke tests failed');
    return;
  }
  console.log('binary format smoke tests passed (3/3)');
};

main().catch((error) => {
  console.error('binary format smoke test runner failed');
  console.error(error);
  process.exit(1);
});
