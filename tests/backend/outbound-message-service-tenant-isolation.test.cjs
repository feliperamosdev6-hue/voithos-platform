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
            createdAt: new Date(Date.now() - (60 * 1000)),
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
      [path.resolve(__dirname, '../../backend/src/config/appEnv.js')]: { appEnv: { appointmentActionLinksEnabled: false, appointmentConfirmationDedupMinutes: 10 } },
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

test('outboundMessageService.sendAppointmentConfirmation fecha contexto antigo e reenvia confirmacao', async (t) => {
  let closedStaleContext = null;
  let createdOutbound = null;
  let updatedStatuses = [];
  let providerCalls = 0;
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/services/outboundMessageService.js'),
    {
      [path.resolve(__dirname, '../../backend/src/repositories/appointmentRepository.js')]: {
        appointmentRepository: {
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
            id: 'out-stale',
            clinicId: 'clinic-auth',
            patientId: 'patient-1',
            appointmentId: 'appt-1',
            createdAt: new Date(Date.now() - (11 * 60 * 1000)),
            status: 'SENT',
          }),
          closeActiveConfirmationContextsByAppointment: async (input) => {
            closedStaleContext = input;
            return { count: 1 };
          },
          create: async (input) => {
            createdOutbound = {
              id: 'out-new',
              createdAt: new Date('2026-04-13T09:30:00.000Z'),
              ...input,
            };
            return createdOutbound;
          },
          updateStatus: async (input) => {
            updatedStatuses.push(input);
            return { count: 1 };
          },
          findByIdAndClinic: async () => ({
            ...createdOutbound,
            status: 'SENT',
            providerMessageId: 'provider-message-1',
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
      [path.resolve(__dirname, '../../backend/src/adapters/whatsappNgClient.js')]: {
        whatsappNgClient: {
          sendAppointmentConfirmation: async () => {
            providerCalls += 1;
            return {
              status: 'sent',
              providerMessageId: 'provider-message-1',
            };
          },
        },
      },
      [path.resolve(__dirname, '../../backend/src/config/appEnv.js')]: { appEnv: { appointmentActionLinksEnabled: false, appointmentConfirmationDedupMinutes: 10 } },
    }
  );
  t.after(restore);

  const result = await serviceModule.outboundMessageService.sendAppointmentConfirmation({
    clinicId: 'clinic-auth',
    appointmentId: 'appt-1',
  });

  assert.equal(providerCalls, 1);
  assert.deepEqual(closedStaleContext, {
    clinicId: 'clinic-auth',
    appointmentId: 'appt-1',
    lastError: 'Stale appointment confirmation context closed before resend.',
  });
  assert.equal(createdOutbound?.appointmentId, 'appt-1');
  assert.equal(updatedStatuses.length, 2);
  assert.equal(result?.deduped, false);
  assert.equal(result?.confirmationPending, true);
  assert.equal(result?.alreadyPending, false);
});
