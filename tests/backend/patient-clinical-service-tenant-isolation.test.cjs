const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadModuleWithMocks } = require('./helpers/load-module-with-mocks.cjs');

test('patientClinicalService.getClinicalRecord falha sem ler paciente fora do tenant', async (t) => {
  const patientRepositoryMock = {
    patientRepository: {
      findByIdAndClinic: async () => null,
    },
  };
  let ensureCalled = false;
  const patientClinicalRepositoryMock = {
    patientClinicalRepository: {
      ensureClinicalRecord: async () => {
        ensureCalled = true;
        return null;
      },
    },
  };

  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/services/patientClinicalService.js'),
    {
      [path.resolve(__dirname, '../../backend/src/repositories/patientRepository.js')]: patientRepositoryMock,
      [path.resolve(__dirname, '../../backend/src/repositories/patientClinicalRepository.js')]: patientClinicalRepositoryMock,
      [path.resolve(__dirname, '../../backend/src/repositories/financialRepository.js')]: { financialRepository: {} },
      [path.resolve(__dirname, '../../backend/src/services/patientDocumentStorageService.js')]: { patientDocumentStorageService: {} },
      [path.resolve(__dirname, '../../backend/src/services/financialService.js')]: {
        financialService: {},
        mapAccountToLegacy: (row) => row,
      },
    }
  );
  t.after(restore);

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
});

test('patientClinicalService.getClinicalRecord usa lookup scoped por clinicId', async (t) => {
  const calls = [];
  const patientRepositoryMock = {
    patientRepository: {
      findByIdAndClinic: async (patientId, clinicId) => {
        calls.push({ patientId, clinicId });
        return {
          id: patientId,
          clinicId,
        };
      },
    },
  };
  const patientClinicalRepositoryMock = {
    patientClinicalRepository: {
      ensureClinicalRecord: async ({ clinicId, patientId }) => ({
        id: 'record-1',
        clinicId,
        patientId,
      }),
    },
  };

  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/services/patientClinicalService.js'),
    {
      [path.resolve(__dirname, '../../backend/src/repositories/patientRepository.js')]: patientRepositoryMock,
      [path.resolve(__dirname, '../../backend/src/repositories/patientClinicalRepository.js')]: patientClinicalRepositoryMock,
      [path.resolve(__dirname, '../../backend/src/repositories/financialRepository.js')]: { financialRepository: {} },
      [path.resolve(__dirname, '../../backend/src/services/patientDocumentStorageService.js')]: { patientDocumentStorageService: {} },
      [path.resolve(__dirname, '../../backend/src/services/financialService.js')]: {
        financialService: {},
        mapAccountToLegacy: (row) => row,
      },
    }
  );
  t.after(restore);

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
});

test('patientClinicalService.updateClinicalNoteBySourceDocument aceita id externo do documento', async (t) => {
  const sourceLookups = [];
  const updateCalls = [];
  const patientRepositoryMock = {
    patientRepository: {
      findByIdAndClinic: async (patientId, clinicId) => ({ id: patientId, clinicId }),
    },
  };
  const patientClinicalRepositoryMock = {
    patientClinicalRepository: {
      ensureClinicalRecord: async () => ({ id: 'record-1', clinicId: 'clinic-auth', patientId: 'patient-1' }),
      findDocumentByExternalId: async ({ externalDocumentId }) => (
        externalDocumentId === 'doc-external'
          ? {
              id: 'doc-row-1',
              clinicId: 'clinic-auth',
              patientId: 'patient-1',
              externalDocumentId: 'doc-external',
              title: 'Evolucao inicial',
              type: 'EVOLUCAO',
              category: 'clinicos',
              metadata: { id: 'doc-external' },
            }
          : null
      ),
      updateDocument: async () => ({ count: 1 }),
      findClinicalNoteBySourceDocumentId: async ({ sourceDocumentId }) => {
        sourceLookups.push(sourceDocumentId);
        if (sourceDocumentId === 'doc-row-1') {
          return {
            id: 'note-1',
            clinicId: 'clinic-auth',
            patientId: 'patient-1',
            sourceDocumentId: 'doc-row-1',
            title: 'Evolucao inicial',
            content: { texto: 'antes' },
          };
        }
        return null;
      },
      findClinicalNoteById: async ({ id }) => (
        id === 'note-1'
          ? {
              id: 'note-1',
              clinicId: 'clinic-auth',
              patientId: 'patient-1',
              sourceDocumentId: 'doc-row-1',
              title: 'Evolucao editada',
              content: { texto: 'depois' },
            }
          : null
      ),
      updateClinicalNote: async (input) => {
        updateCalls.push(input);
        return { count: 1 };
      },
    },
  };

  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/services/patientClinicalService.js'),
    {
      [path.resolve(__dirname, '../../backend/src/repositories/patientRepository.js')]: patientRepositoryMock,
      [path.resolve(__dirname, '../../backend/src/repositories/patientClinicalRepository.js')]: patientClinicalRepositoryMock,
      [path.resolve(__dirname, '../../backend/src/repositories/financialRepository.js')]: { financialRepository: {} },
      [path.resolve(__dirname, '../../backend/src/services/patientDocumentStorageService.js')]: { patientDocumentStorageService: {} },
      [path.resolve(__dirname, '../../backend/src/services/financialService.js')]: {
        financialService: {},
        mapAccountToLegacy: (row) => row,
      },
    }
  );
  t.after(restore);

  const result = await serviceModule.patientClinicalService.updateClinicalNoteBySourceDocument({
    clinicId: 'clinic-auth',
    patientId: 'patient-1',
    sourceDocumentId: 'doc-external',
    content: { texto: 'depois' },
    sourceDocument: {
      id: 'doc-external',
      title: 'Evolucao editada',
      type: 'EVOLUCAO',
      category: 'clinicos',
    },
  });

  assert.deepEqual(sourceLookups, ['doc-external', 'doc-row-1']);
  assert.equal(updateCalls.length, 1);
  assert.equal(updateCalls[0].id, 'note-1');
  assert.equal(updateCalls[0].clinicId, 'clinic-auth');
  assert.equal(updateCalls[0].patientId, 'patient-1');
  assert.equal(updateCalls[0].data.sourceDocumentId, 'doc-row-1');
  assert.deepEqual(updateCalls[0].data.content, { texto: 'depois' });
  assert.equal(result.record.id, 'note-1');
  assert.equal(result.sourceDocument.id, 'doc-external');
});
