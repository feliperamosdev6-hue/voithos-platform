const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadModuleWithMocks } = require('./helpers/load-module-with-mocks.cjs');

test('inboundMessageService.receiveWhatsappInbound saneia rawPayload tenant-sensivel na ingestao', async (t) => {
  let createdPayload = null;
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/services/inboundMessageService.js'),
    {
      [path.resolve(__dirname, '../../backend/src/repositories/inboundMessageRepository.js')]: {
        inboundMessageRepository: {
          findByClinicAndProviderMessageId: async () => null,
          create: async (input) => {
            createdPayload = input;
            return { id: 'inbound-1', clinicId: input.clinicId };
          },
          updateProcessing: async () => ({ count: 1 }),
          findByIdAndClinic: async () => ({ id: 'inbound-1', clinicId: 'clinic-auth', status: 'IGNORED' }),
        },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/outboundMessageRepository.js')]: {
        outboundMessageRepository: {
          findLatestReplyEnabledByClinicAndPhone: async () => null,
        },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/appointmentRepository.js')]: { appointmentRepository: {} },
      [path.resolve(__dirname, '../../backend/src/repositories/patientRepository.js')]: { patientRepository: {} },
      [path.resolve(__dirname, '../../backend/src/services/notificationEventService.js')]: {
        notificationEventService: {
          create: async () => null,
        },
      },
    }
  );
  t.after(restore);

  await serviceModule.inboundMessageService.receiveWhatsappInbound({
    clinicId: 'clinic-auth',
    fromPhone: '11999999999',
    body: 'oi',
    rawPayload: {
      clinicId: 'clinic-evil',
      dispatchId: 'dispatch-evil',
      nested: {
        patientId: 'patient-evil',
        keep: 'ok',
      },
    },
  });

  assert.deepEqual(createdPayload.rawPayload, {
    nested: {
      keep: 'ok',
    },
  });
});

test('inboundMessageService.receiveWhatsappInbound usa lookups scoped por clinicId para paciente e mensagem persistida', async (t) => {
  const patientCalls = [];
  const storedCalls = [];
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/services/inboundMessageService.js'),
    {
      [path.resolve(__dirname, '../../backend/src/repositories/inboundMessageRepository.js')]: {
        inboundMessageRepository: {
          findByClinicAndProviderMessageId: async () => null,
          create: async (input) => ({ id: 'inbound-1', clinicId: input.clinicId }),
          updateProcessing: async () => ({ count: 1 }),
          findById: async () => {
            throw new Error('global inbound lookup should not run');
          },
          findByIdAndClinic: async ({ id, clinicId }) => {
            storedCalls.push({ id, clinicId });
            return { id, clinicId, status: 'PROCESSED' };
          },
        },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/outboundMessageRepository.js')]: {
        outboundMessageRepository: {
          findLatestReplyEnabledByClinicAndPhone: async () => ({
            id: 'out-1',
            patientId: 'patient-1',
            appointmentId: 'appt-1',
          }),
        },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/appointmentRepository.js')]: {
        appointmentRepository: {
          findByIdAndClinic: async () => ({
            id: 'appt-1',
            clinicId: 'clinic-auth',
            status: 'AGENDADO',
            confirmado: false,
          }),
          updateStatus: async () => ({ count: 1 }),
        },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/patientRepository.js')]: {
        patientRepository: {
          findById: async () => {
            throw new Error('global patient lookup should not run');
          },
          findByIdAndClinic: async (patientId, clinicId) => {
            patientCalls.push({ patientId, clinicId });
            return { id: patientId, clinicId, telefone: '5511999999999' };
          },
        },
      },
      [path.resolve(__dirname, '../../backend/src/services/notificationEventService.js')]: {
        notificationEventService: {
          create: async () => null,
        },
      },
    }
  );
  t.after(restore);

  const result = await serviceModule.inboundMessageService.receiveWhatsappInbound({
    clinicId: 'clinic-auth',
    fromPhone: '11999999999',
    body: '1',
    providerMessageId: 'provider-1',
    rawPayload: {},
  });

  assert.deepEqual(patientCalls, [{ patientId: 'patient-1', clinicId: 'clinic-auth' }]);
  assert.deepEqual(storedCalls, [{ id: 'inbound-1', clinicId: 'clinic-auth' }]);
  assert.equal(result?.id, 'inbound-1');
});
