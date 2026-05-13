const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
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

test('patientDocumentStorageService bloqueia anexo acima de 5MB', async (t) => {
  const storageRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'voithos-doc-storage-'));
  const { module: storageModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/services/patientDocumentStorageService.js'),
    {
      [path.resolve(__dirname, '../../backend/src/config/appEnv.js')]: {
        appEnv: { clinicalDocumentsStorageRoot: storageRoot },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/patientRepository.js')]: {
        patientRepository: {
          findById: async () => ({ id: 'patient-1', clinicId: 'clinic-auth' }),
          findByIdAndClinic: async () => ({ id: 'patient-1', clinicId: 'clinic-auth' }),
        },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/patientClinicalRepository.js')]: {
        patientClinicalRepository: {
          findDocumentByExternalId: async () => ({
            id: 'row-1',
            clinicId: 'clinic-auth',
            patientId: 'patient-1',
            externalDocumentId: 'doc-1',
            type: 'ARQUIVO',
            category: 'ARQUIVO_PACIENTE',
            metadata: {},
          }),
          updateDocument: async () => ({ count: 1 }),
        },
      },
    }
  );
  t.after(async () => {
    restore();
    await fs.promises.rm(storageRoot, { recursive: true, force: true });
  });

  await assert.rejects(
    () => storageModule.patientDocumentStorageService.storeDocumentAsset({
      clinicId: 'clinic-auth',
      patientId: 'patient-1',
      externalDocumentId: 'doc-1',
      role: 'primary',
      buffer: Buffer.alloc((5 * 1024 * 1024) + 1),
      fileName: 'exame.pdf',
      contentType: 'application/pdf',
    }),
    (error) => {
      assert.equal(error?.code, 'FILE_TOO_LARGE');
      assert.equal(error?.statusCode, 413);
      return true;
    }
  );
});

test('patientDocumentStorageService rejeita tipo invalido para anexo do paciente', async (t) => {
  const storageRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'voithos-doc-storage-'));
  const { module: storageModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/services/patientDocumentStorageService.js'),
    {
      [path.resolve(__dirname, '../../backend/src/config/appEnv.js')]: {
        appEnv: { clinicalDocumentsStorageRoot: storageRoot },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/patientRepository.js')]: {
        patientRepository: {
          findById: async () => ({ id: 'patient-1', clinicId: 'clinic-auth' }),
          findByIdAndClinic: async () => ({ id: 'patient-1', clinicId: 'clinic-auth' }),
        },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/patientClinicalRepository.js')]: {
        patientClinicalRepository: {
          findDocumentByExternalId: async () => ({
            id: 'row-1',
            clinicId: 'clinic-auth',
            patientId: 'patient-1',
            externalDocumentId: 'doc-1',
            type: 'ARQUIVO',
            category: 'ARQUIVO_PACIENTE',
            metadata: {},
          }),
          updateDocument: async () => ({ count: 1 }),
        },
      },
    }
  );
  t.after(async () => {
    restore();
    await fs.promises.rm(storageRoot, { recursive: true, force: true });
  });

  await assert.rejects(
    () => storageModule.patientDocumentStorageService.storeDocumentAsset({
      clinicId: 'clinic-auth',
      patientId: 'patient-1',
      externalDocumentId: 'doc-1',
      role: 'primary',
      buffer: Buffer.from('<script>alert(1)</script>'),
      fileName: 'exame.html',
      contentType: 'text/html',
    }),
    (error) => {
      assert.equal(error?.code, 'UNSUPPORTED_FILE_TYPE');
      return true;
    }
  );
});

test('patientDocumentStorageService salva PDF valido como metadados e arquivo externo', async (t) => {
  const storageRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'voithos-doc-storage-'));
  let updatedDocument = null;
  const { module: storageModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/services/patientDocumentStorageService.js'),
    {
      [path.resolve(__dirname, '../../backend/src/config/appEnv.js')]: {
        appEnv: { clinicalDocumentsStorageRoot: storageRoot },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/patientRepository.js')]: {
        patientRepository: {
          findById: async () => ({ id: 'patient-1', clinicId: 'clinic-auth' }),
          findByIdAndClinic: async () => ({ id: 'patient-1', clinicId: 'clinic-auth' }),
        },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/patientClinicalRepository.js')]: {
        patientClinicalRepository: {
          findDocumentByExternalId: async () => ({
            id: 'row-1',
            clinicId: 'clinic-auth',
            patientId: 'patient-1',
            externalDocumentId: 'doc-1',
            type: 'ARQUIVO',
            category: 'ARQUIVO_PACIENTE',
            metadata: {},
          }),
          updateDocument: async (input) => {
            updatedDocument = input;
            return { count: 1 };
          },
        },
      },
    }
  );
  t.after(async () => {
    restore();
    await fs.promises.rm(storageRoot, { recursive: true, force: true });
  });

  const pdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
  const result = await storageModule.patientDocumentStorageService.storeDocumentAsset({
    clinicId: 'clinic-auth',
    patientId: 'patient-1',
    externalDocumentId: 'doc-1',
    role: 'primary',
    buffer: pdfBuffer,
    fileName: 'exame.pdf',
    contentType: 'application/pdf',
  });

  assert.equal(result.contentType, 'application/pdf');
  assert.equal(updatedDocument.clinicId, 'clinic-auth');
  assert.equal(updatedDocument.patientId, 'patient-1');
  assert.equal(updatedDocument.data.size, pdfBuffer.length);
  assert.equal(updatedDocument.data.metadata.assets.primary.contentType, 'application/pdf');
  assert.equal(updatedDocument.data.metadata.assets.primary.size, pdfBuffer.length);
  assert.equal(updatedDocument.data.metadata.assets.primary.storageBackend, 'server_fs');
  const storedPath = path.join(storageRoot, result.storageKey);
  assert.equal(await fs.promises.readFile(storedPath, 'utf8'), pdfBuffer.toString('utf8'));
});

test('patientDocumentStorageService bloqueia leitura de anexo de paciente de outra clinica', async (t) => {
  const { module: storageModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/services/patientDocumentStorageService.js'),
    {
      [path.resolve(__dirname, '../../backend/src/config/appEnv.js')]: {
        appEnv: { clinicalDocumentsStorageRoot: path.join(os.tmpdir(), 'voithos-doc-storage-blocked') },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/patientRepository.js')]: {
        patientRepository: {
          findById: async () => ({ id: 'patient-1', clinicId: 'clinic-evil' }),
        },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/patientClinicalRepository.js')]: {
        patientClinicalRepository: {
          findDocumentByExternalId: async () => {
            throw new Error('document lookup should not run for another clinic');
          },
        },
      },
    }
  );
  t.after(restore);

  await assert.rejects(
    () => storageModule.patientDocumentStorageService.getDocumentAsset({
      clinicId: 'clinic-auth',
      patientId: 'patient-1',
      externalDocumentId: 'doc-1',
      role: 'primary',
    }),
    (error) => {
      assert.equal(error?.code, 'PATIENT_NOT_FOUND');
      assert.equal(error?.statusCode, 404);
      return true;
    }
  );
});

test('patientDocumentStorageService rejeita storageKey fora da pasta do paciente', async (t) => {
  const { module: storageModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/services/patientDocumentStorageService.js'),
    {
      [path.resolve(__dirname, '../../backend/src/config/appEnv.js')]: {
        appEnv: { clinicalDocumentsStorageRoot: path.join(os.tmpdir(), 'voithos-doc-storage-invalid-key') },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/patientRepository.js')]: {
        patientRepository: {
          findById: async () => ({ id: 'patient-1', clinicId: 'clinic-auth' }),
        },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/patientClinicalRepository.js')]: {
        patientClinicalRepository: {
          findDocumentByExternalId: async () => ({
            id: 'row-1',
            clinicId: 'clinic-auth',
            patientId: 'patient-1',
            externalDocumentId: 'doc-1',
            type: 'ARQUIVO',
            category: 'ARQUIVO_PACIENTE',
            metadata: {
              assets: {
                primary: {
                  storageKey: 'clinic-evil/patient-evil/doc-1--primary.pdf',
                  fileName: 'doc-1.pdf',
                  contentType: 'application/pdf',
                },
              },
            },
          }),
        },
      },
    }
  );
  t.after(restore);

  await assert.rejects(
    () => storageModule.patientDocumentStorageService.getDocumentAsset({
      clinicId: 'clinic-auth',
      patientId: 'patient-1',
      externalDocumentId: 'doc-1',
      role: 'primary',
    }),
    (error) => {
      assert.equal(error?.code, 'INVALID_STORAGE_KEY');
      return true;
    }
  );
});

test('patientDocumentStorageService rejeita foto com storageKey fora da pasta do paciente', async (t) => {
  const { module: storageModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/services/patientDocumentStorageService.js'),
    {
      [path.resolve(__dirname, '../../backend/src/config/appEnv.js')]: {
        appEnv: { clinicalDocumentsStorageRoot: path.join(os.tmpdir(), 'voithos-photo-storage-invalid-key') },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/patientRepository.js')]: {
        patientRepository: {
          findByIdAndClinic: async () => ({ id: 'patient-1', clinicId: 'clinic-auth' }),
        },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/patientClinicalRepository.js')]: {
        patientClinicalRepository: {},
      },
    }
  );
  t.after(restore);

  await assert.rejects(
    () => storageModule.patientDocumentStorageService.getPatientProfilePhoto({
      clinicId: 'clinic-auth',
      patientId: 'patient-1',
      storageKey: 'clinic-evil/patient-evil/profile-photo.webp',
      fileName: 'profile-photo.webp',
      contentType: 'image/webp',
    }),
    (error) => {
      assert.equal(error?.code, 'INVALID_STORAGE_KEY');
      return true;
    }
  );
});

test('patientDocumentStorageService usa fallback gravavel quando o root configurado e negado', async (t) => {
  const realFs = fs;
  const storageRoot = path.join(process.cwd(), 'storage', 'patient-documents');
  const blockedRoot = path.resolve('/var/data');
  const mockFs = {
    ...realFs,
    promises: {
      ...realFs.promises,
      mkdir: async (dir, options) => {
        const normalizedDir = String(dir || '').replace(/\\/g, '/');
        const normalizedBlocked = String(blockedRoot || '').replace(/\\/g, '/');
        if (normalizedDir.startsWith(normalizedBlocked)) {
          const error = new Error(`EACCES: permission denied, mkdir '${dir}'`);
          error.code = 'EACCES';
          error.errno = -13;
          error.syscall = 'mkdir';
          error.path = dir;
          throw error;
        }
        return realFs.promises.mkdir(dir, options);
      },
    },
  };
  const { module: storageModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/services/patientDocumentStorageService.js'),
    {
      fs: mockFs,
      [path.resolve(__dirname, '../../backend/src/config/appEnv.js')]: {
        appEnv: { clinicalDocumentsStorageRoot: '/var/data' },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/patientRepository.js')]: {
        patientRepository: {
          findById: async () => ({ id: 'patient-1', clinicId: 'clinic-auth' }),
          findByIdAndClinic: async () => ({ id: 'patient-1', clinicId: 'clinic-auth' }),
        },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/patientClinicalRepository.js')]: {
        patientClinicalRepository: {
          findDocumentByExternalId: async () => ({
            id: 'row-1',
            clinicId: 'clinic-auth',
            patientId: 'patient-1',
            externalDocumentId: 'doc-1',
            type: 'ARQUIVO',
            category: 'ARQUIVO_PACIENTE',
            metadata: {},
          }),
          updateDocument: async () => ({ count: 1 }),
        },
      },
    }
  );
  t.after(async () => {
    restore();
    await realFs.promises.rm(storageRoot, { recursive: true, force: true });
  });

  const pdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
  const result = await storageModule.patientDocumentStorageService.storeDocumentAsset({
    clinicId: 'clinic-auth',
    patientId: 'patient-1',
    externalDocumentId: 'doc-1',
    role: 'primary',
    buffer: pdfBuffer,
    fileName: 'exame.pdf',
    contentType: 'application/pdf',
  });

  assert.equal(result.contentType, 'application/pdf');
  assert.ok(String(result.storageKey || '').replace(/\\/g, '/').includes('clinic-auth/patient-1/'));
  const fallbackStored = path.join(storageRoot, result.storageKey);
  assert.equal(await realFs.promises.readFile(fallbackStored, 'utf8'), pdfBuffer.toString('utf8'));
});
