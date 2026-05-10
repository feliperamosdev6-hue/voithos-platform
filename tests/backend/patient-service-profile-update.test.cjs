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
