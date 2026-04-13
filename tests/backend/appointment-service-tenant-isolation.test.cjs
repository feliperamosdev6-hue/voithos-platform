const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadModuleWithMocks } = require('./helpers/load-module-with-mocks.cjs');

test('appointmentService.getAppointmentById usa lookup scoped por clinicId', async (t) => {
  const calls = [];
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/services/appointmentService.js'),
    {
      [path.resolve(__dirname, '../../backend/src/repositories/appointmentRepository.js')]: {
        appointmentRepository: {
          findById: async () => {
            throw new Error('global lookup should not run');
          },
          findByIdAndClinic: async (id, clinicId) => {
            calls.push({ id, clinicId });
            return { id, clinicId, status: 'AGENDADO', confirmado: false };
          },
        },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/outboundMessageRepository.js')]: {
        outboundMessageRepository: {
          listActiveConfirmationsByAppointmentIds: async () => [],
        },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/patientRepository.js')]: {
        patientRepository: {},
      },
    }
  );
  t.after(restore);

  const result = await serviceModule.appointmentService.getAppointmentById({
    clinicId: 'clinic-auth',
    id: 'appt-1',
  });

  assert.deepEqual(calls, [{ id: 'appt-1', clinicId: 'clinic-auth' }]);
  assert.equal(result?.id, 'appt-1');
  assert.equal(result?.clinicId, 'clinic-auth');
});

test('appointmentService.listAppointments falha antes de listar agenda para paciente fora do tenant', async (t) => {
  let listByClinicCalled = false;
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/services/appointmentService.js'),
    {
      [path.resolve(__dirname, '../../backend/src/repositories/appointmentRepository.js')]: {
        appointmentRepository: {
          listByClinic: async () => {
            listByClinicCalled = true;
            return [];
          },
        },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/outboundMessageRepository.js')]: {
        outboundMessageRepository: {
          listActiveConfirmationsByAppointmentIds: async () => [],
        },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/patientRepository.js')]: {
        patientRepository: {
          findByIdAndClinic: async () => null,
        },
      },
    }
  );
  t.after(restore);

  await assert.rejects(
    () => serviceModule.appointmentService.listAppointments({
      clinicId: 'clinic-auth',
      patientId: 'patient-1',
    }),
    (error) => {
      assert.equal(error?.code, 'PATIENT_NOT_FOUND');
      return true;
    }
  );
  assert.equal(listByClinicCalled, false);
});
