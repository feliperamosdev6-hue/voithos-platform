const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadModuleWithMocks } = require('./helpers/load-module-with-mocks.cjs');

test('outboundMessageService.getByIdForClinic usa lookup scoped por clinicId', async (t) => {
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/services/outboundMessageService.js'),
    {
      [path.resolve(__dirname, '../../backend/src/repositories/outboundMessageRepository.js')]: {
        outboundMessageRepository: {
          findById: async () => {
            throw new Error('global outbound lookup should not run');
          },
          findByIdAndClinic: async ({ id, clinicId }) => ({ id, clinicId }),
        },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/appointmentRepository.js')]: { appointmentRepository: {} },
      [path.resolve(__dirname, '../../backend/src/repositories/clinicRepository.js')]: { clinicRepository: {} },
      [path.resolve(__dirname, '../../backend/src/repositories/patientRepository.js')]: { patientRepository: {} },
      [path.resolve(__dirname, '../../backend/src/services/appointmentActionTokenService.js')]: { appointmentActionTokenService: {} },
      [path.resolve(__dirname, '../../backend/src/services/notificationEventService.js')]: { notificationEventService: {} },
      [path.resolve(__dirname, '../../backend/src/adapters/whatsappNgClient.js')]: { whatsappNgClient: {} },
      [path.resolve(__dirname, '../../backend/src/config/appEnv.js')]: { appEnv: { appointmentActionLinksEnabled: false } },
    }
  );
  t.after(restore);

  const result = await serviceModule.outboundMessageService.getByIdForClinic({
    id: 'out-1',
    clinicId: 'clinic-auth',
  });

  assert.deepEqual(result, {
    id: 'out-1',
    clinicId: 'clinic-auth',
  });
});

test('outboundMessageService.sendAppointmentConfirmation usa lookups scoped por clinicId', async (t) => {
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/services/outboundMessageService.js'),
    {
      [path.resolve(__dirname, '../../backend/src/repositories/appointmentRepository.js')]: {
        appointmentRepository: {
          findById: async () => {
            throw new Error('global appointment lookup should not run');
          },
          findByIdAndClinic: async () => ({
            id: 'appt-1',
            clinicId: 'clinic-auth',
            patientId: 'patient-1',
            dataHora: '2026-04-13T10:00:00.000Z',
            status: 'AGENDADO',
            confirmado: false,
          }),
        },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/patientRepository.js')]: {
        patientRepository: {
          findById: async () => {
            throw new Error('global patient lookup should not run');
          },
          findByIdAndClinic: async () => ({
            id: 'patient-1',
            clinicId: 'clinic-auth',
            nome: 'Paciente',
            telefone: '11999999999',
          }),
        },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/outboundMessageRepository.js')]: {
        outboundMessageRepository: {
          findLatestActiveConfirmationByAppointment: async () => ({
            id: 'out-existing',
            clinicId: 'clinic-auth',
            patientId: 'patient-1',
            appointmentId: 'appt-1',
            createdAt: new Date('2026-04-13T09:00:00.000Z'),
            status: 'SENT',
          }),
        },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/clinicRepository.js')]: {
        clinicRepository: {
          findById: async () => ({
            id: 'clinic-auth',
            nomeFantasia: 'Clinica Teste',
          }),
        },
      },
      [path.resolve(__dirname, '../../backend/src/services/appointmentActionTokenService.js')]: { appointmentActionTokenService: {} },
      [path.resolve(__dirname, '../../backend/src/services/notificationEventService.js')]: { notificationEventService: {} },
      [path.resolve(__dirname, '../../backend/src/adapters/whatsappNgClient.js')]: { whatsappNgClient: {} },
      [path.resolve(__dirname, '../../backend/src/config/appEnv.js')]: { appEnv: { appointmentActionLinksEnabled: false } },
    }
  );
  t.after(restore);

  const result = await serviceModule.outboundMessageService.sendAppointmentConfirmation({
    clinicId: 'clinic-auth',
    appointmentId: 'appt-1',
  });

  assert.equal(result?.deduped, true);
  assert.equal(result?.appointmentId, 'appt-1');
});
