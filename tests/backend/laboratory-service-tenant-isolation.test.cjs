const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadModuleWithMocks } = require('./helpers/load-module-with-mocks.cjs');

test('laboratoryService.createOrder ignora clinicId do payload e saneia metadata tenant-sensivel', async (t) => {
  let createdPayload = null;
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/services/laboratoryService.js'),
    {
      [path.resolve(__dirname, '../../backend/src/repositories/laboratoryRepository.js')]: {
        laboratoryRepository: {
          findPatientByIdAndClinic: async () => ({ id: 'patient-1', clinicId: 'clinic-auth', nome: 'Paciente Teste' }),
          findProcedureByIdAndClinic: async () => ({ id: 'proc-1', clinicId: 'clinic-auth', externalId: 'PROC-EX' }),
          findProcedureByExternalId: async () => null,
          createOrder: async (input) => {
            createdPayload = input;
            return {
              id: 'order-1',
              ...input,
              patient: { nome: 'Paciente Teste' },
              items: [],
              events: [],
            };
          },
          findOrderByIdAndClinic: async ({ clinicId, orderId }) => ({
            id: orderId,
            clinicId,
            patientId: 'patient-1',
            appointmentId: null,
            procedureId: 'proc-1',
            labName: 'Laboratorio',
            externalReference: null,
            description: 'Pedido laboratorial',
            status: 'REQUESTED',
            requestedAt: new Date('2026-04-13T10:00:00.000Z'),
            expectedAt: null,
            completedAt: null,
            notes: null,
            totalCost: null,
            metadata: createdPayload.metadata,
            patient: { nome: 'Paciente Teste' },
            items: [],
            events: [],
          }),
          createEvent: async () => null,
        },
      },
    }
  );
  t.after(restore);

  await serviceModule.laboratoryService.createOrder({
    clinicId: 'clinic-auth',
    payload: {
      clinicId: 'clinic-evil',
      patientId: 'patient-1',
      procedureId: 'proc-legacy',
      metadata: {
        clinicId: 'clinic-evil',
        nested: {
          patientId: 'patient-evil',
          keep: 'ok',
        },
        keepTop: 'yes',
      },
    },
  });

  assert.equal(createdPayload.clinicId, 'clinic-auth');
  assert.deepEqual(createdPayload.metadata, {
    keepTop: 'yes',
    nested: {
      keep: 'ok',
    },
    patientName: 'Paciente Teste',
    piece: '',
    procedureExternalId: 'proc-legacy',
    financeExpenseId: '',
    prontuario: 'patient-1',
  });
});

test('laboratoryService.updateOrder bloqueia reatribuicao de patientId antes de atualizar o dominio', async (t) => {
  let updateCalled = false;
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/services/laboratoryService.js'),
    {
      [path.resolve(__dirname, '../../backend/src/repositories/laboratoryRepository.js')]: {
        laboratoryRepository: {
          findOrderByIdAndClinic: async () => ({
            id: 'order-1',
            clinicId: 'clinic-auth',
            patientId: 'patient-1',
            procedureId: null,
            appointmentId: null,
            metadata: {},
          }),
          updateOrder: async () => {
            updateCalled = true;
            return null;
          },
        },
      },
    }
  );
  t.after(restore);

  await assert.rejects(
    () => serviceModule.laboratoryService.updateOrder({
      clinicId: 'clinic-auth',
      orderId: 'order-1',
      payload: {
        patientId: 'patient-evil',
      },
    }),
    (error) => {
      assert.equal(error?.code, 'VALIDATION_ERROR');
      return true;
    }
  );
  assert.equal(updateCalled, false);
});
