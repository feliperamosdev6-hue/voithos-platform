const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadModuleWithMocks } = require('./helpers/load-module-with-mocks.cjs');

test('inboundMessageService.receiveWhatsappInbound saneia rawPayload tenant-sensivel quando ha contexto ativo', async (t) => {
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
          findByIdAndClinic: async ({ id, clinicId }) => ({ id, clinicId, status: 'PROCESSED' }),
        },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/outboundMessageRepository.js')]: {
        outboundMessageRepository: {
          findActiveReplyContextByClinicAndProviderMessageId: async () => null,
          findLatestReplyEnabledByClinicAndPhone: async () => ({
            id: 'out-1',
            patientId: 'patient-1',
            appointmentId: 'appt-1',
          }),
          closeActiveReplyContexts: async () => ({ count: 1 }),
        },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/appointmentRepository.js')]: {
        appointmentRepository: {
          findByIdAndClinic: async () => ({
            id: 'appt-1',
            clinicId: 'clinic-auth',
            status: 'AGENDADO',
            confirmado: false,
            dataHora: '2026-05-04T13:00:00.000Z',
          }),
        },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/patientRepository.js')]: {
        patientRepository: {
          findByIdAndClinic: async () => ({
            id: 'patient-1',
            clinicId: 'clinic-auth',
            nome: 'Paciente Teste',
            telefone: '5511999999999',
          }),
        },
      },
      [path.resolve(__dirname, '../../backend/src/db/prisma.js')]: {
        prisma: {
          $transaction: async (callback) => callback({
            outboundMessage: {
              updateMany: async () => ({ count: 1 }),
            },
            appointment: {
              updateMany: async () => ({ count: 1 }),
            },
            inboundMessage: {
              updateMany: async () => ({ count: 1 }),
            },
            notificationEvent: {
              create: async () => null,
            },
          }),
        },
      },
    }
  );
  t.after(restore);

  await serviceModule.inboundMessageService.receiveWhatsappInbound({
    clinicId: 'clinic-auth',
    fromPhone: '11999999999',
    body: '1',
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

test('inboundMessageService.receiveWhatsappInbound usa lookups scoped por clinicId e prefere mensagem outbound referenciada', async (t) => {
  const patientCalls = [];
  const storedCalls = [];
  const referencedContextCalls = [];
  let phoneFallbackCalls = 0;
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
          findActiveReplyContextByClinicAndProviderMessageId: async ({ clinicId, providerMessageId }) => {
            referencedContextCalls.push({ clinicId, providerMessageId });
            return {
              id: 'out-1',
              patientId: 'patient-1',
              appointmentId: 'appt-1',
            };
          },
          findLatestReplyEnabledByClinicAndPhone: async () => {
            phoneFallbackCalls += 1;
            return null;
          },
          closeActiveReplyContexts: async () => ({ count: 1 }),
        },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/appointmentRepository.js')]: {
        appointmentRepository: {
          findByIdAndClinic: async () => ({
            id: 'appt-1',
            clinicId: 'clinic-auth',
            status: 'AGENDADO',
            confirmado: false,
            dataHora: '2026-05-04T13:00:00.000Z',
          }),
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
      [path.resolve(__dirname, '../../backend/src/db/prisma.js')]: {
        prisma: {
          $transaction: async (callback) => callback({
            outboundMessage: {
              updateMany: async () => ({ count: 1 }),
            },
            appointment: {
              updateMany: async () => ({ count: 1 }),
            },
            inboundMessage: {
              updateMany: async () => ({ count: 1 }),
            },
            notificationEvent: {
              create: async () => null,
            },
          }),
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
    rawPayload: {
      message: {
        extendedTextMessage: {
          contextInfo: {
            stanzaId: 'outbound-provider-1',
          },
        },
      },
    },
  });

  assert.deepEqual(referencedContextCalls, [{ clinicId: 'clinic-auth', providerMessageId: 'outbound-provider-1' }]);
  assert.equal(phoneFallbackCalls, 0);
  assert.deepEqual(patientCalls, [{ patientId: 'patient-1', clinicId: 'clinic-auth' }]);
  assert.deepEqual(storedCalls, [{ id: 'inbound-1', clinicId: 'clinic-auth' }]);
  assert.equal(result?.id, 'inbound-1');
});

test('inboundMessageService.receiveWhatsappInbound retorna cedo sem persistir quando nao ha contexto ativo', async (t) => {
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/services/inboundMessageService.js'),
    {
      [path.resolve(__dirname, '../../backend/src/repositories/inboundMessageRepository.js')]: {
        inboundMessageRepository: {
          findByClinicAndProviderMessageId: async () => null,
          create: async () => {
            throw new Error('inbound persistence should not run without active context');
          },
        },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/outboundMessageRepository.js')]: {
        outboundMessageRepository: {
          findActiveReplyContextByClinicAndProviderMessageId: async () => null,
          findLatestReplyEnabledByClinicAndPhone: async () => null,
        },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/appointmentRepository.js')]: { appointmentRepository: {} },
      [path.resolve(__dirname, '../../backend/src/repositories/patientRepository.js')]: { patientRepository: {} },
      [path.resolve(__dirname, '../../backend/src/db/prisma.js')]: { prisma: {} },
    }
  );
  t.after(restore);

  const result = await serviceModule.inboundMessageService.receiveWhatsappInbound({
    clinicId: 'clinic-auth',
    fromPhone: '11999999999',
    body: 'oi',
    providerMessageId: 'provider-2',
    rawPayload: {},
  });

  assert.equal(result?.status, 'IGNORED');
  assert.equal(result?.persisted, false);
  assert.equal(result?.replyText, null);
});

test('inboundMessageService.receiveWhatsappInbound ignora resposta valida quando o contexto ja foi fechado por outro evento', async (t) => {
  let ignoredProcessing = null;
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/services/inboundMessageService.js'),
    {
      [path.resolve(__dirname, '../../backend/src/repositories/inboundMessageRepository.js')]: {
        inboundMessageRepository: {
          findByClinicAndProviderMessageId: async () => null,
          create: async (input) => ({ id: 'inbound-1', clinicId: input.clinicId }),
          updateProcessing: async (input) => {
            ignoredProcessing = input;
            return { count: 1 };
          },
          findByIdAndClinic: async ({ id, clinicId }) => ({ id, clinicId, status: 'IGNORED' }),
        },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/outboundMessageRepository.js')]: {
        outboundMessageRepository: {
          findActiveReplyContextByClinicAndProviderMessageId: async () => null,
          findLatestReplyEnabledByClinicAndPhone: async () => ({
            id: 'out-1',
            patientId: 'patient-1',
            appointmentId: 'appt-1',
          }),
          closeActiveReplyContexts: async () => ({ count: 1 }),
        },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/appointmentRepository.js')]: {
        appointmentRepository: {
          findByIdAndClinic: async () => ({
            id: 'appt-1',
            clinicId: 'clinic-auth',
            status: 'AGENDADO',
            confirmado: false,
            dataHora: '2026-05-04T13:00:00.000Z',
          }),
        },
      },
      [path.resolve(__dirname, '../../backend/src/repositories/patientRepository.js')]: {
        patientRepository: {
          findByIdAndClinic: async () => ({
            id: 'patient-1',
            clinicId: 'clinic-auth',
            telefone: '5511999999999',
          }),
        },
      },
      [path.resolve(__dirname, '../../backend/src/db/prisma.js')]: {
        prisma: {
          $transaction: async (callback) => callback({
            outboundMessage: {
              updateMany: async () => ({ count: 0 }),
            },
            appointment: {
              updateMany: async () => ({ count: 1 }),
            },
            inboundMessage: {
              updateMany: async () => ({ count: 1 }),
            },
            notificationEvent: {
              create: async () => null,
            },
          }),
        },
      },
    }
  );
  t.after(restore);

  const result = await serviceModule.inboundMessageService.receiveWhatsappInbound({
    clinicId: 'clinic-auth',
    fromPhone: '11999999999',
    body: '1',
    providerMessageId: 'provider-3',
    rawPayload: {},
  });

  assert.equal(result?.status, 'IGNORED');
  assert.equal(result?.replyText, null);
  assert.equal(ignoredProcessing?.processingNotes, 'Reply context was already closed by a previous inbound event.');
});
