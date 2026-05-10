const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadModuleWithMocks } = require('./helpers/load-module-with-mocks.cjs');

const buildPlanContextMocks = ({ planMessageRepository, whatsappNgClient, notificationEvents }) => ({
  [path.resolve(__dirname, '../../backend/src/repositories/campaignRepository.js')]: {
    campaignRepository: {
      createAudienceSnapshotWithMembers: async () => {
        throw new Error('campaign audience should not be created before dentist approval');
      },
      createBatchWithDispatches: async () => {
        throw new Error('campaign dispatch should not be created before dentist approval');
      },
      findDispatchByIdAndClinic: async () => null,
    },
  },
  [path.resolve(__dirname, '../../backend/src/repositories/clinicRepository.js')]: {
    clinicRepository: {
      findById: async () => ({ id: 'clinic-auth', nomeFantasia: 'Clinica Teste' }),
    },
  },
  [path.resolve(__dirname, '../../backend/src/repositories/financialRepository.js')]: {
    financialRepository: {
      findPatientPlanByIdAndClinic: async () => ({
        id: 'plan-1',
        clinicId: 'clinic-auth',
        patientId: 'patient-1',
        name: 'Plano Teste',
      }),
      findPlanFinancialAccountByPlanId: async () => ({
        id: 'account-1',
        clinicId: 'clinic-auth',
        patientId: 'patient-1',
        totalAmount: 100,
        paymentMethod: 'PIX',
        metadata: {
          planId: 'plan-1',
        },
        installments: [{
          id: 'installment-1',
          sequence: 1,
          dueDate: new Date(Date.now() - 86400000),
          amount: 100,
          status: 'PENDING',
        }],
        transactions: [],
      }),
    },
  },
  [path.resolve(__dirname, '../../backend/src/repositories/patientRepository.js')]: {
    patientRepository: {
      findById: async () => ({
        id: 'patient-1',
        clinicId: 'clinic-auth',
        nome: 'Paciente',
        telefone: '11999999999',
        allowsMessages: true,
      }),
    },
  },
  [path.resolve(__dirname, '../../backend/src/repositories/planMessageRepository.js')]: {
    planMessageRepository,
  },
  [path.resolve(__dirname, '../../backend/src/services/messagingDispatchService.js')]: {
    messagingDispatchService: {
      updateDispatchStatus: async () => {
        throw new Error('dispatch status should not update before dentist approval');
      },
    },
  },
  [path.resolve(__dirname, '../../backend/src/services/notificationEventService.js')]: {
    notificationEventService: {
      create: async (payload) => {
        notificationEvents.push(payload);
        return { id: `notification-${notificationEvents.length}`, ...payload };
      },
    },
  },
  [path.resolve(__dirname, '../../backend/src/services/planFinancialAccountSyncService.js')]: {
    ensurePlanFinancialAccount: async () => null,
    ensurePlanFinancialAccounts: async () => [],
  },
  [path.resolve(__dirname, '../../backend/src/adapters/whatsappNgClient.js')]: {
    whatsappNgClient,
  },
});

const buildPlanContextSendMocks = ({ planMessageRepository, whatsappNgClient, notificationEvents }) => ({
  ...buildPlanContextMocks({ planMessageRepository, whatsappNgClient, notificationEvents }),
  [path.resolve(__dirname, '../../backend/src/repositories/campaignRepository.js')]: {
    campaignRepository: {
      createAudienceSnapshotWithMembers: async ({ snapshot, members }) => ({
        snapshot,
        members,
      }),
      createBatchWithDispatches: async ({ batch, dispatches }) => ({
        batch,
        dispatches,
      }),
      findDispatchByIdAndClinic: async () => null,
    },
  },
  [path.resolve(__dirname, '../../backend/src/services/messagingDispatchService.js')]: {
    messagingDispatchService: {
      updateDispatchStatus: async ({ dispatchId, status, provider, providerMessageId, metadata }) => ({
        id: dispatchId,
        status,
        provider,
        providerMessageId,
        metadata,
      }),
    },
  },
});

test('planMessageService.send bloqueia cobranca vencida ate aprovacao do dentista', async (t) => {
  const notificationEvents = [];
  let createdEvent = null;
  let updatedEvent = null;
  let whatsappCalls = 0;

  const planMessageRepository = {
    findByIdempotencyKey: async () => null,
    listByPlan: async () => [],
    create: async (input) => {
      createdEvent = {
        ...input,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      return createdEvent;
    },
    update: async ({ data }) => {
      updatedEvent = {
        ...createdEvent,
        ...data,
        updatedAt: new Date(),
      };
      return updatedEvent;
    },
  };

  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/services/planMessageService.js'),
    buildPlanContextMocks({
      planMessageRepository,
      notificationEvents,
      whatsappNgClient: {
        sendMessage: async () => {
          whatsappCalls += 1;
          return { providerMessageId: 'provider-1', status: 'sent' };
        },
      },
    })
  );
  t.after(restore);

  const result = await serviceModule.planMessageService.send({
    clinicId: 'clinic-auth',
    planId: 'plan-1',
    installmentId: 'installment-1',
    eventType: 'PLAN_INSTALLMENT_OVERDUE',
    actorName: 'scheduler',
  });

  assert.equal(whatsappCalls, 0);
  assert.equal(result.blocked, true);
  assert.equal(result.awaitingApproval, true);
  assert.equal(result.approvalRequired, true);
  assert.equal(updatedEvent.status, 'BLOCKED');
  assert.equal(updatedEvent.payload.approvalState.status, 'AWAITING_DENTIST_APPROVAL');
  assert.equal(updatedEvent.payload.dispatchState.blockedReasonCode, 'DENTIST_APPROVAL_REQUIRED');
  assert.equal(notificationEvents.some((item) => item.type === 'PLAN_MESSAGE_DENTIST_APPROVAL_REQUIRED'), true);
});

test('planMessageService.send envia cobranca vencida somente com aprovacao explicita', async (t) => {
  const notificationEvents = [];
  let whatsappCalls = 0;
  const existingEvent = {
    id: 'plan-message-1',
    clinicId: 'clinic-auth',
    patientId: 'patient-1',
    planId: 'plan-1',
    financialAccountId: 'account-1',
    installmentId: 'installment-1',
    installmentSequence: 1,
    eventType: 'PLAN_INSTALLMENT_OVERDUE',
    status: 'BLOCKED',
    templateKey: 'plan_installment_overdue',
    templateVersion: 1,
    dueDate: new Date(Date.now() - 86400000),
    amount: 100,
    idempotencyKey: 'clinic-auth:account-1:1:PLAN_INSTALLMENT_OVERDUE',
    attemptCount: 0,
    manualResendCount: 0,
    payload: {
      approvalState: {
        status: 'AWAITING_DENTIST_APPROVAL',
      },
      dispatchState: {
        blockedReasonCode: 'DENTIST_APPROVAL_REQUIRED',
      },
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  let currentEvent = existingEvent;
  const updates = [];

  const planMessageRepository = {
    findByIdempotencyKey: async () => currentEvent,
    listByPlan: async () => [currentEvent],
    create: async () => {
      throw new Error('existing approval event should be reused');
    },
    update: async ({ data }) => {
      currentEvent = {
        ...currentEvent,
        ...data,
        payload: data.payload || currentEvent.payload,
        updatedAt: new Date(),
      };
      updates.push(data);
      return currentEvent;
    },
  };

  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/services/planMessageService.js'),
    buildPlanContextSendMocks({
      planMessageRepository,
      notificationEvents,
      whatsappNgClient: {
        sendMessage: async () => {
          whatsappCalls += 1;
          return { providerMessageId: 'provider-1', status: 'sent' };
        },
      },
    })
  );
  t.after(restore);

  const result = await serviceModule.planMessageService.send({
    clinicId: 'clinic-auth',
    planId: 'plan-1',
    installmentId: 'installment-1',
    eventType: 'PLAN_INSTALLMENT_OVERDUE',
    actorName: 'dentist-1',
    approvedByDentist: true,
  });

  assert.equal(whatsappCalls, 1);
  assert.equal(result.success, true);
  assert.equal(currentEvent.status, 'SENT');
  assert.equal(currentEvent.payload.approvalState.status, 'APPROVED');
  assert.equal(currentEvent.payload.dispatchState.transport, 'WHATSAPP_NG');
  assert.equal(updates.some((item) => item.status === 'CREATED' && item.payload?.approvalState?.approvedBy === 'dentist-1'), true);
});
