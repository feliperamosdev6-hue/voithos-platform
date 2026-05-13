const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadModuleWithMocks } = require('./helpers/load-module-with-mocks.cjs');

test('patientService.updateForClinic salva cadastro e dentista responsavel no tenant autenticado', async (t) => {
  const updateCalls = [];
  const summaryCalls = [];
  const patientRows = new Map([
    ['patient-1', {
      id: 'patient-1',
      clinicId: 'clinic-auth',
      nome: 'Maria',
      clinicalRecord: { summary: { patientProfile: { notes: 'antes' } } },
    }],
  ]);

  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/services/patientService.js'),
    {
      [path.resolve(__dirname, '../../backend/src/repositories/patientRepository.js')]: {
        patientRepository: {
          findById: async (id) => patientRows.get(id) || null,
          update: async (input) => {
            updateCalls.push(input);
            const current = patientRows.get(input.id);
            patientRows.set(input.id, { ...current, ...input.data });
            return { count: 1 };
          },
        },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/patientClinicalRepository.js')]: {
        patientClinicalRepository: {
          upsertClinicalRecordSummary: async (input) => {
            summaryCalls.push(input);
            const current = patientRows.get(input.patientId);
            patientRows.set(input.patientId, {
              ...current,
              clinicalRecord: { summary: input.summary },
            });
            return { id: 'record-1', ...input };
          },
        },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/userRepository.js')]: {
        userRepository: {
          findById: async (id) => ({
            id,
            clinicId: 'clinic-auth',
            nome: 'Dra Ana',
            role: 'DENTISTA',
            ativo: true,
          }),
        },
      },
    }
  );
  t.after(restore);

  const result = await serviceModule.patientService.updateForClinic({
    id: 'patient-1',
    clinicId: 'clinic-auth',
    input: {
      nome: 'Maria Silva',
      cpf: '123',
      telefone: '11999999999',
      endereco: 'Rua A, 10',
      notes: 'observacao nova',
      dentistaId: 'dent-1',
    },
  });

  assert.equal(updateCalls.length, 1);
  assert.equal(updateCalls[0].clinicId, 'clinic-auth');
  assert.deepEqual(updateCalls[0].data, {
    nome: 'Maria Silva',
    cpf: '123',
    rg: undefined,
    dataNascimento: undefined,
    telefone: '11999999999',
    email: undefined,
    endereco: 'Rua A, 10',
    allowsMessages: undefined,
    lastBirthdayMessageAt: undefined,
    birthdayMessageYear: undefined,
  });
  assert.equal(summaryCalls.length, 1);
  assert.equal(summaryCalls[0].clinicId, 'clinic-auth');
  assert.deepEqual(summaryCalls[0].summary.patientProfile, {
    notes: 'observacao nova',
    dentistaId: 'dent-1',
    dentistaNome: 'Dra Ana',
    observacoes: 'observacao nova',
  });
  assert.equal(result.dentistaId, 'dent-1');
  assert.equal(result.dentistaNome, 'Dra Ana');
  assert.equal(result.notes, 'observacao nova');
  assert.equal(result.clinicalRecord, undefined);
});

test('patientService cria, atualiza e relê dados cadastrais por aliases no tenant autenticado', async (t) => {
  const patientRows = new Map();
  let nextPatientId = 1;

  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/services/patientService.js'),
    {
      [path.resolve(__dirname, '../../backend/src/repositories/patientRepository.js')]: {
        patientRepository: {
          create: async (input) => {
            const row = {
              id: `patient-${nextPatientId++}`,
              ...input,
            };
            patientRows.set(row.id, row);
            return row;
          },
          findById: async (id) => patientRows.get(id) || null,
          update: async ({ id, clinicId, data }) => {
            const current = patientRows.get(id);
            if (!current || current.clinicId !== clinicId) return { count: 0 };
            patientRows.set(id, { ...current, ...data });
            return { count: 1 };
          },
        },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/patientClinicalRepository.js')]: {
        patientClinicalRepository: {
          upsertClinicalRecordSummary: async () => null,
        },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/userRepository.js')]: {
        userRepository: {},
      },
    }
  );
  t.after(restore);

  const created = await serviceModule.patientService.createForClinic('clinic-auth', {
    fullName: 'Maria',
    cpf: '111',
    phone: '11911111111',
    address: 'Rua Antiga, 1',
    email: 'maria@teste.local',
    dataNascimento: '1990-01-01',
  });

  const updated = await serviceModule.patientService.updateForClinic({
    id: created.id,
    clinicId: 'clinic-auth',
    input: {
      nome: 'Maria',
      fullName: 'Maria Silva',
      cpf: '222',
      telefone: '11911111111',
      phone: '11999999999',
      endereco: 'Rua Antiga, 1',
      address: 'Rua Nova, 20',
      email: 'maria.silva@teste.local',
      dataNascimento: '1990-02-02',
    },
  });
  const reread = await serviceModule.patientService.findByIdForClinic(created.id, 'clinic-auth');

  assert.equal(updated.nome, 'Maria Silva');
  assert.equal(updated.cpf, '222');
  assert.equal(updated.telefone, '11999999999');
  assert.equal(updated.endereco, 'Rua Nova, 20');
  assert.equal(updated.email, 'maria.silva@teste.local');
  assert.equal(reread.nome, 'Maria Silva');
  assert.equal(reread.cpf, '222');
  assert.equal(reread.telefone, '11999999999');
  assert.equal(reread.endereco, 'Rua Nova, 20');
  assert.equal(reread.clinicId, 'clinic-auth');
});

test('patientService.updateForClinic impede update de paciente de outra clinica', async (t) => {
  let updateCalled = false;
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/services/patientService.js'),
    {
      [path.resolve(__dirname, '../../backend/src/repositories/patientRepository.js')]: {
        patientRepository: {
          findById: async () => ({ id: 'patient-evil', clinicId: 'clinic-evil', nome: 'Paciente Fora' }),
          update: async () => {
            updateCalled = true;
            return { count: 1 };
          },
        },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/patientClinicalRepository.js')]: {
        patientClinicalRepository: {
          upsertClinicalRecordSummary: async () => null,
        },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/userRepository.js')]: {
        userRepository: {},
      },
    }
  );
  t.after(restore);

  await assert.rejects(
    () => serviceModule.patientService.updateForClinic({
      id: 'patient-evil',
      clinicId: 'clinic-auth',
      input: {
        fullName: 'Paciente Alterado',
        cpf: '999',
        phone: '11999999999',
        address: 'Rua Bloqueada',
      },
    }),
    (error) => {
      assert.equal(error?.code, 'PATIENT_NOT_FOUND');
      return true;
    }
  );
  assert.equal(updateCalled, false);
});

test('patientService.updateForClinic bloqueia dentista de outra clinica antes de persistir', async (t) => {
  let updateCalled = false;
  let summaryCalled = false;
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/services/patientService.js'),
    {
      [path.resolve(__dirname, '../../backend/src/repositories/patientRepository.js')]: {
        patientRepository: {
          findById: async () => ({ id: 'patient-1', clinicId: 'clinic-auth', nome: 'Maria' }),
          update: async () => {
            updateCalled = true;
            return { count: 1 };
          },
        },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/patientClinicalRepository.js')]: {
        patientClinicalRepository: {
          upsertClinicalRecordSummary: async () => {
            summaryCalled = true;
            return null;
          },
        },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/userRepository.js')]: {
        userRepository: {
          findById: async () => ({
            id: 'dent-evil',
            clinicId: 'clinic-evil',
            nome: 'Dr Fora',
            role: 'DENTISTA',
            ativo: true,
          }),
        },
      },
    }
  );
  t.after(restore);

  await assert.rejects(
    () => serviceModule.patientService.updateForClinic({
      id: 'patient-1',
      clinicId: 'clinic-auth',
      input: {
        nome: 'Maria',
        dentistaId: 'dent-evil',
      },
    }),
    (error) => {
      assert.equal(error?.code, 'INVALID_DENTIST_FOR_CLINIC');
      return true;
    }
  );
  assert.equal(updateCalled, false);
  assert.equal(summaryCalled, false);
});
