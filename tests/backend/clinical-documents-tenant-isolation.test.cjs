const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadModuleWithMocks } = require('./helpers/load-module-with-mocks.cjs');

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

test('clinicalController.upsertPatientDocument ignora clinicId injetado no documento', async (t) => {
  const calls = [];
  const { module: controller, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/controllers/clinicalController.js'),
    {
      [path.resolve(__dirname, '../../backend/src/services/patientClinicalService.js')]: {
        patientClinicalService: {
          upsertDocumentMetadata: async (input) => {
            calls.push(input);
            return { id: 'doc-1' };
          },
        },
      },
      [path.resolve(__dirname, '../../backend/src/utils/authContext.js')]: {
        getAuthenticatedClinicId: (req) => String(req?.auth?.clinicId || '').trim(),
      },
    }
  );
  t.after(restore);

  const req = {
    auth: { clinicId: 'clinic-auth' },
    params: { patientId: 'patient-1' },
    body: {
      document: {
        id: 'doc-1',
        clinicId: 'clinic-evil',
        patientId: 'patient-evil',
        title: 'Receita',
      },
    },
  };
  const res = createResponseDouble();
  let forwardedError = null;

  await controller.upsertPatientDocument(req, res, (error) => {
    forwardedError = error;
  });

  assert.equal(forwardedError, null);
  assert.deepEqual(calls, [{
    clinicId: 'clinic-auth',
    patientId: 'patient-1',
    document: {
      id: 'doc-1',
      clinicId: 'clinic-evil',
      patientId: 'patient-evil',
      title: 'Receita',
    },
  }]);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload, { ok: true, data: { id: 'doc-1' } });
});

test('patientClinicalService.upsertDocumentMetadata remove tenant fields injetados do metadata', async (t) => {
  let createdPayload = null;
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/services/patientClinicalService.js'),
    {
      [path.resolve(__dirname, '../../backend/src/repositories/patientRepository.js')]: {
        patientRepository: {
          findByIdAndClinic: async () => ({ id: 'patient-1', clinicId: 'clinic-auth' }),
        },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/patientClinicalRepository.js')]: {
        patientClinicalRepository: {
          ensureClinicalRecord: async () => ({ id: 'record-1', clinicId: 'clinic-auth', patientId: 'patient-1' }),
          findDocumentByExternalId: async () => null,
          createDocument: async (data) => {
            createdPayload = data;
            return {
              id: 'row-1',
              ...data,
              createdAt: new Date('2026-04-13T00:00:00.000Z'),
            };
          },
        },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/financialRepository.js')]: { financialRepository: {} },
      [path.resolve(__dirname, '../../backend/src/services/patientDocumentStorageService.js')]: { patientDocumentStorageService: {} },
      [path.resolve(__dirname, '../../backend/src/services/financialService.js')]: {
        financialService: {},
        mapAccountToLegacy: (row) => row,
      },
    }
  );
  t.after(restore);

  await serviceModule.patientClinicalService.upsertDocumentMetadata({
    clinicId: 'clinic-auth',
    patientId: 'patient-1',
    document: {
      id: 'doc-1',
      clinicId: 'clinic-evil',
      patientId: 'patient-evil',
      clinicalRecordId: 'record-evil',
      title: 'Receita',
      metadata: {
        clinicId: 'nested-clinic-evil',
        patientId: 'nested-patient-evil',
        clinicalRecordId: 'nested-record-evil',
        keep: 'ok',
      },
    },
  });

  assert.equal(createdPayload.clinicId, 'clinic-auth');
  assert.equal(createdPayload.patientId, 'patient-1');
  assert.equal(createdPayload.clinicalRecordId, 'record-1');
  assert.deepEqual(createdPayload.metadata, {
    id: 'doc-1',
    title: 'Receita',
    metadata: {
      keep: 'ok',
    },
  });
});
