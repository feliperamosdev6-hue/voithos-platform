const assert = require('node:assert/strict');
const path = require('path');
const { loadModuleWithMocks } = require('../tests/backend/helpers/load-module-with-mocks.cjs');

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

const tests = [];

const register = (name, fn) => {
  tests.push({ name, fn });
};

register('subscriptionController.confirmSubscriptionPayment desativa confirmacao client-driven', async () => {
  let confirmCalled = false;
  const { module: controller, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../backend/src/controllers/subscriptionController.js'),
    {
      [path.resolve(__dirname, '../backend/src/services/subscriptionService.js')]: {
        subscriptionService: {
          confirmPayment: async () => {
            confirmCalled = true;
            throw new Error('client confirmation should not activate billing');
          },
        },
      },
      [path.resolve(__dirname, '../backend/src/utils/authContext.js')]: {
        getAuthenticatedClinicId: () => 'clinic-auth',
      },
    }
  );

  try {
    const req = {
      auth: { clinicId: 'clinic-auth' },
      body: {
        paymentId: 'payment-1',
        provider: 'ASAAS_CHECKOUT',
        externalPaymentId: 'checkout-1',
      },
    };
    const res = createResponseDouble();
    let forwardedError = null;

    await controller.confirmSubscriptionPayment(req, res, (error) => {
      forwardedError = error;
    });

    assert.equal(confirmCalled, false);
    assert.equal(forwardedError, null);
    assert.equal(res.statusCode, 410);
    assert.equal(res.payload?.ok, false);
    assert.equal(res.payload?.error?.code, 'CLIENT_PAYMENT_CONFIRMATION_DISABLED');
  } finally {
    restore();
  }
});

register('subscriptionService.refreshPaymentStatus consulta apenas estado persistido', async () => {
  let gatewayCalled = false;
  let activationCalled = false;
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../backend/src/services/subscriptionService.js'),
    {
      [path.resolve(__dirname, '../backend/src/config/appEnv.js')]: {
        appEnv: {
          subscriptionEnforcementEnabled: true,
          subscriptionCommercialActivationAt: '',
        },
      },
      [path.resolve(__dirname, '../backend/src/repositories/clinicRepository.js')]: {
        clinicRepository: {
          findById: async () => ({ id: 'clinic-auth', createdAt: new Date('2026-01-01T00:00:00.000Z') }),
        },
      },
      [path.resolve(__dirname, '../backend/src/repositories/subscriptionRepository.js')]: {
        subscriptionRepository: {
          findByClinicId: async () => ({
            id: 'sub-1',
            clinicId: 'clinic-auth',
            planType: 'MONTHLY',
            amount: 94.9,
            status: 'PENDING_PAYMENT',
            startDate: null,
            endDate: null,
            graceUntil: null,
            lastPayment: {
              id: 'payment-1',
              status: 'PENDING',
              provider: 'ASAAS_CHECKOUT',
              externalPaymentId: 'checkout-1',
              paymentLink: 'https://checkout.example',
            },
            payments: [],
          }),
          confirmPaymentAndActivateSubscription: async () => {
            activationCalled = true;
            throw new Error('refresh should not activate billing');
          },
        },
      },
      [path.resolve(__dirname, '../backend/src/services/authService.js')]: { authService: {} },
      [path.resolve(__dirname, '../backend/src/services/payment/asaasService.js')]: {
        asaasService: {
          isConfigured: () => true,
          listPaymentsByCheckoutSession: async () => {
            gatewayCalled = true;
            throw new Error('refresh should not query Asaas');
          },
        },
      },
    }
  );

  try {
    const result = await serviceModule.subscriptionService.refreshPaymentStatus({
      clinicId: 'clinic-auth',
      role: 'DENTIST',
    });

    assert.equal(gatewayCalled, false);
    assert.equal(activationCalled, false);
    assert.equal(result?.effectiveStatus, 'PENDING_PAYMENT');
    assert.equal(result?.subscription?.lastPayment?.status, 'PENDING');
  } finally {
    restore();
  }
});

register('subscriptionService.confirmPayment bloqueia origem diferente de webhook', async () => {
  let lookupCalled = false;
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../backend/src/services/subscriptionService.js'),
    {
      [path.resolve(__dirname, '../backend/src/config/appEnv.js')]: {
        appEnv: {
          subscriptionEnforcementEnabled: true,
          subscriptionCommercialActivationAt: '',
        },
      },
      [path.resolve(__dirname, '../backend/src/repositories/clinicRepository.js')]: { clinicRepository: {} },
      [path.resolve(__dirname, '../backend/src/repositories/subscriptionRepository.js')]: {
        subscriptionRepository: {
          findPaymentForConfirmation: async () => {
            lookupCalled = true;
            return null;
          },
        },
      },
      [path.resolve(__dirname, '../backend/src/services/authService.js')]: { authService: {} },
      [path.resolve(__dirname, '../backend/src/services/payment/asaasService.js')]: { asaasService: {} },
    }
  );

  try {
    await assert.rejects(
      () => serviceModule.subscriptionService.confirmPayment({
        clinicId: 'clinic-auth',
        paymentId: 'payment-1',
      }),
      (error) => {
        assert.equal(error?.statusCode, 403);
        assert.equal(error?.code, 'WEBHOOK_ONLY_PAYMENT_CONFIRMATION');
        return true;
      }
    );
    assert.equal(lookupCalled, false);
  } finally {
    restore();
  }
});

register('authService.refreshPendingSignupPaymentStatus nao finaliza cadastro nem consulta gateway', async () => {
  let gatewayCalled = false;
  let createClinicCalled = false;
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../backend/src/services/authService.js'),
    {
      [path.resolve(__dirname, '../backend/src/db/prisma.js')]: {
        prisma: {
          clinic: {
            create: async () => {
              createClinicCalled = true;
              throw new Error('refresh should not create clinic');
            },
          },
        },
      },
      [path.resolve(__dirname, '../backend/src/repositories/clinicRepository.js')]: { clinicRepository: {} },
      [path.resolve(__dirname, '../backend/src/repositories/pendingSignupRepository.js')]: {
        pendingSignupRepository: {
          findByEmail: async () => ({
            id: 'pending-1',
            email: 'clinic@example.com',
            signupData: {
              checkoutToken: 'token-1',
              emailVerifiedAt: '2026-05-25T10:00:00.000Z',
              paymentCheckout: {
                externalPaymentId: 'checkout-1',
                paymentLink: 'https://checkout.example',
                expiresAt: '2099-01-01T00:00:00.000Z',
              },
            },
          }),
          deleteByEmail: async () => {
            throw new Error('pending signup should not be deleted');
          },
        },
      },
      [path.resolve(__dirname, '../backend/src/repositories/sessionRepository.js')]: { sessionRepository: {} },
      [path.resolve(__dirname, '../backend/src/repositories/userRepository.js')]: { userRepository: {} },
      [path.resolve(__dirname, '../backend/src/services/emailService.js')]: { emailService: {} },
      [path.resolve(__dirname, '../backend/src/services/payment/asaasService.js')]: {
        asaasService: {
          isConfigured: () => true,
          listPaymentsByCheckoutSession: async () => {
            gatewayCalled = true;
            throw new Error('refresh should not query Asaas');
          },
        },
      },
      [path.resolve(__dirname, '../backend/src/services/promotionOfferService.js')]: { promotionOfferService: {} },
    }
  );

  try {
    const result = await serviceModule.authService.refreshPendingSignupPaymentStatus({
      email: 'clinic@example.com',
      pendingSignupToken: 'token-1',
    });

    assert.equal(gatewayCalled, false);
    assert.equal(createClinicCalled, false);
    assert.equal(result?.pendingCheckout, true);
    assert.equal(result?.effectiveStatus, 'PENDING_PAYMENT');
    assert.equal(result?.paymentLink, 'https://checkout.example');
  } finally {
    restore();
  }
});

register('asaasWebhookController retorna erro em falha real para permitir retry', async () => {
  const { module: controller, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../backend/src/controllers/asaasWebhookController.js'),
    {
      [path.resolve(__dirname, '../backend/src/services/subscriptionService.js')]: {
        subscriptionService: {
          handleAsaasWebhookEvent: async () => {
            throw new Error('database unavailable');
          },
        },
      },
    }
  );

  const previousToken = process.env.ASAAS_WEBHOOK_TOKEN;
  process.env.ASAAS_WEBHOOK_TOKEN = 'webhook-token';

  try {
    const req = {
      body: {
        event: 'PAYMENT_CONFIRMED',
        payment: { id: 'pay-ext-1' },
      },
      get: (name) => (String(name).toLowerCase() === 'asaas-access-token' ? 'webhook-token' : ''),
    };
    const res = createResponseDouble();

    await controller.handleAsaasWebhook(req, res);

    assert.equal(res.statusCode, 500);
    assert.equal(res.payload?.ok, false);
    assert.equal(res.payload?.error?.code, 'WEBHOOK_PROCESSING_FAILED');
  } finally {
    if (previousToken === undefined) {
      delete process.env.ASAAS_WEBHOOK_TOKEN;
    } else {
      process.env.ASAAS_WEBHOOK_TOKEN = previousToken;
    }
    restore();
  }
});

register('subscriptionService.handleAsaasWebhookEvent trata webhook duplicado como idempotente', async () => {
  let activationCalled = false;
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../backend/src/services/subscriptionService.js'),
    {
      [path.resolve(__dirname, '../backend/src/config/appEnv.js')]: {
        appEnv: {
          subscriptionEnforcementEnabled: true,
          subscriptionCommercialActivationAt: '',
        },
      },
      [path.resolve(__dirname, '../backend/src/repositories/clinicRepository.js')]: { clinicRepository: {} },
      [path.resolve(__dirname, '../backend/src/repositories/subscriptionRepository.js')]: {
        subscriptionRepository: {
          findPaymentByProviderAndExternalPaymentId: async () => ({
            id: 'payment-1',
            clinicId: 'clinic-auth',
            status: 'PAID',
            externalPaymentId: 'pay-ext-1',
            subscription: {
              id: 'sub-1',
              clinicId: 'clinic-auth',
              status: 'ACTIVE',
            },
          }),
          confirmPaymentAndActivateSubscription: async () => {
            activationCalled = true;
            throw new Error('duplicate webhook should not activate twice');
          },
        },
      },
      [path.resolve(__dirname, '../backend/src/services/authService.js')]: {
        authService: {
          finalizePendingSignupPaymentByExternalPaymentId: async () => {
            throw new Error('existing subscription payment should not finalize signup');
          },
        },
      },
      [path.resolve(__dirname, '../backend/src/services/payment/asaasService.js')]: { asaasService: {} },
    }
  );

  try {
    const result = await serviceModule.subscriptionService.handleAsaasWebhookEvent({
      eventType: 'PAYMENT_CONFIRMED',
      payment: {
        id: 'pay-ext-1',
        status: 'CONFIRMED',
        paymentDate: '2026-05-25',
      },
    });

    assert.equal(activationCalled, false);
    assert.deepEqual(result, { handled: true, alreadyActive: true });
  } finally {
    restore();
  }
});

register('financialController.listAccounts usa clinicId autenticado', async () => {
  const calls = [];
  const { module: controller, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../backend/src/controllers/financialController.js'),
    {
      [path.resolve(__dirname, '../backend/src/services/financialService.js')]: {
        financialService: {
          listFinancialAccounts: async (input) => {
            calls.push(input);
            return [{ id: 'acc-1' }];
          },
        },
      },
      [path.resolve(__dirname, '../backend/src/utils/authContext.js')]: {
        getAuthenticatedClinicId: (req) => String(req?.auth?.clinicId || '').trim(),
      },
    }
  );

  try {
    const req = {
      auth: { clinicId: 'clinic-auth' },
      query: { clinicId: 'clinic-evil', patientId: 'patient-1' },
    };
    const res = createResponseDouble();
    let forwardedError = null;
    await controller.listAccounts(req, res, (error) => {
      forwardedError = error;
    });
    assert.equal(forwardedError, null);
    assert.deepEqual(calls, [{ clinicId: 'clinic-auth', patientId: 'patient-1' }]);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.payload, { ok: true, data: [{ id: 'acc-1' }] });
  } finally {
    restore();
  }
});

register('financialController.getDashboard ignora clinicId da query', async () => {
  const calls = [];
  const { module: controller, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../backend/src/controllers/financialController.js'),
    {
      [path.resolve(__dirname, '../backend/src/services/financialService.js')]: {
        financialService: {
          getFinancialDashboard: async (input) => {
            calls.push(input);
            return { totalAccounts: 2 };
          },
        },
      },
      [path.resolve(__dirname, '../backend/src/utils/authContext.js')]: {
        getAuthenticatedClinicId: (req) => String(req?.auth?.clinicId || '').trim(),
      },
    }
  );

  try {
    const req = {
      auth: { clinicId: 'clinic-auth' },
      query: { clinicId: 'clinic-evil' },
    };
    const res = createResponseDouble();
    let forwardedError = null;
    await controller.getDashboard(req, res, (error) => {
      forwardedError = error;
    });
    assert.equal(forwardedError, null);
    assert.deepEqual(calls, [{ clinicId: 'clinic-auth' }]);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.payload, { ok: true, data: { totalAccounts: 2 } });
  } finally {
    restore();
  }
});

register('financialController.getMonthlySummary usa tenant autenticado', async () => {
  const calls = [];
  const { module: controller, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../backend/src/controllers/financialController.js'),
    {
      [path.resolve(__dirname, '../backend/src/services/financialService.js')]: {
        financialService: {
          getMonthlySummary: async (input) => {
            calls.push(input);
            return { totalRevenue: 1000 };
          },
        },
      },
      [path.resolve(__dirname, '../backend/src/utils/authContext.js')]: {
        getAuthenticatedClinicId: (req) => String(req?.auth?.clinicId || '').trim(),
      },
    }
  );

  try {
    const req = {
      auth: { clinicId: 'clinic-auth' },
      query: { clinicId: 'clinic-evil', month: '4', year: '2026' },
    };
    const res = createResponseDouble();
    let forwardedError = null;
    await controller.getMonthlySummary(req, res, (error) => {
      forwardedError = error;
    });
    assert.equal(forwardedError, null);
    assert.deepEqual(calls, [{ clinicId: 'clinic-auth', month: 4, year: 2026 }]);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.payload, { ok: true, data: { totalRevenue: 1000 } });
  } finally {
    restore();
  }
});

register('campaignController.resolveAudience usa clinicId autenticado', async () => {
  const calls = [];
  const { module: controller, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../backend/src/controllers/campaignController.js'),
    {
      [path.resolve(__dirname, '../backend/src/services/campaignService.js')]: {
        campaignService: {
          resolveAudiencePreview: async (input) => {
            calls.push(input);
            return { total: 0, members: [] };
          },
        },
      },
    }
  );

  try {
    const req = {
      auth: { clinicId: 'clinic-auth', userId: 'user-1' },
      body: {
        clinicId: 'clinic-evil',
        segmentKey: 'inactive_90',
        filters: { clinicId: 'clinic-evil', dentistId: 'dent-1' },
        campaignId: 'camp-1',
        templateId: 'tpl-1',
      },
    };
    const res = createResponseDouble();
    let forwardedError = null;
    await controller.resolveAudience(req, res, (error) => {
      forwardedError = error;
    });
    assert.equal(forwardedError, null);
    assert.deepEqual(calls, [{
      clinicId: 'clinic-auth',
      segmentKey: 'inactive_90',
      filters: { clinicId: 'clinic-evil', dentistId: 'dent-1' },
      campaignId: 'camp-1',
      actorName: 'user-1',
      templateId: 'tpl-1',
    }]);
    assert.equal(res.statusCode, 200);
  } finally {
    restore();
  }
});

register('clinicalController.upsertPatientProcedure ignora clinicId do body', async () => {
  const calls = [];
  const { module: controller, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../backend/src/controllers/clinicalController.js'),
    {
      [path.resolve(__dirname, '../backend/src/services/patientClinicalService.js')]: {
        patientClinicalService: {
          upsertProcedure: async (input) => {
            calls.push(input);
            return { service: { id: 'proc-1' }, financeId: 'acc-1' };
          },
        },
      },
      [path.resolve(__dirname, '../backend/src/utils/authContext.js')]: {
        getAuthenticatedClinicId: (req) => String(req?.auth?.clinicId || '').trim(),
      },
    }
  );

  try {
    const req = {
      auth: { clinicId: 'clinic-auth' },
      params: { patientId: 'patient-1' },
      body: {
        clinicId: 'clinic-evil',
        procedure: { id: 'proc-1', tipo: 'Limpeza' },
      },
    };
    const res = createResponseDouble();
    let forwardedError = null;
    await controller.upsertPatientProcedure(req, res, (error) => {
      forwardedError = error;
    });
    assert.equal(forwardedError, null);
    assert.deepEqual(calls, [{
      clinicId: 'clinic-auth',
      patientId: 'patient-1',
      procedure: { id: 'proc-1', tipo: 'Limpeza' },
    }]);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.payload, {
      ok: true,
      data: { service: { id: 'proc-1' }, financeId: 'acc-1' },
    });
  } finally {
    restore();
  }
});

register('appointmentController.createAppointment usa clinicId autenticado', async () => {
  const calls = [];
  const { module: controller, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../backend/src/controllers/appointmentController.js'),
    {
      [path.resolve(__dirname, '../backend/src/services/appointmentService.js')]: {
        appointmentService: {
          createAppointment: async (input) => {
            calls.push(input);
            return { id: 'appt-1' };
          },
        },
      },
      [path.resolve(__dirname, '../backend/src/services/outboundMessageService.js')]: { outboundMessageService: {} },
      [path.resolve(__dirname, '../backend/src/utils/authContext.js')]: {
        getAuthenticatedClinicId: (req) => String(req?.auth?.clinicId || '').trim(),
      },
    }
  );

  try {
    const req = {
      auth: { clinicId: 'clinic-auth' },
      body: {
        clinicId: 'clinic-evil',
        patientId: 'patient-1',
        dataHora: '2026-04-13T10:00:00.000Z',
      },
    };
    const res = createResponseDouble();
    let forwardedError = null;
    await controller.createAppointment(req, res, (error) => {
      forwardedError = error;
    });
    assert.equal(forwardedError, null);
    assert.deepEqual(calls, [{
      clinicId: 'clinic-auth',
      input: {
        clinicId: 'clinic-evil',
        patientId: 'patient-1',
        dataHora: '2026-04-13T10:00:00.000Z',
      },
    }]);
    assert.equal(res.statusCode, 201);
    assert.deepEqual(res.payload, { ok: true, data: { id: 'appt-1' } });
  } finally {
    restore();
  }
});

register('relationshipController.getRelationshipOverview usa clinicId autenticado', async () => {
  const calls = [];
  const { module: controller, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../backend/src/controllers/relationshipController.js'),
    {
      [path.resolve(__dirname, '../backend/src/services/relationshipService.js')]: {
        relationshipService: {
          getOverview: async (input) => {
            calls.push(input);
            return { clinicId: input.clinicId };
          },
        },
      },
    }
  );

  try {
    const req = {
      auth: { clinicId: 'clinic-auth' },
      query: { clinicId: 'clinic-evil', date: '2026-04-13', dueSoonDays: '5' },
    };
    const res = createResponseDouble();
    let forwardedError = null;
    await controller.getRelationshipOverview(req, res, (error) => {
      forwardedError = error;
    });
    assert.equal(forwardedError, null);
    assert.deepEqual(calls, [{
      clinicId: 'clinic-auth',
      date: '2026-04-13',
      dueSoonDays: '5',
    }]);
    assert.equal(res.statusCode, 200);
  } finally {
    restore();
  }
});

register('appointmentService.getAppointmentById usa lookup scoped por clinicId', async () => {
  const calls = [];
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../backend/src/services/appointmentService.js'),
    {
      [path.resolve(__dirname, '../backend/src/repositories/appointmentRepository.js')]: {
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
      [path.resolve(__dirname, '../backend/src/repositories/outboundMessageRepository.js')]: {
        outboundMessageRepository: {
          listActiveConfirmationsByAppointmentIds: async () => [],
        },
      },
      [path.resolve(__dirname, '../backend/src/repositories/patientRepository.js')]: {
        patientRepository: {},
      },
    }
  );

  try {
    const result = await serviceModule.appointmentService.getAppointmentById({
      clinicId: 'clinic-auth',
      id: 'appt-1',
    });
    assert.deepEqual(calls, [{ id: 'appt-1', clinicId: 'clinic-auth' }]);
    assert.equal(result?.id, 'appt-1');
    assert.equal(result?.clinicId, 'clinic-auth');
  } finally {
    restore();
  }
});

register('appointmentService.listAppointments falha antes de listar agenda para paciente fora do tenant', async () => {
  let listByClinicCalled = false;
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../backend/src/services/appointmentService.js'),
    {
      [path.resolve(__dirname, '../backend/src/repositories/appointmentRepository.js')]: {
        appointmentRepository: {
          listByClinic: async () => {
            listByClinicCalled = true;
            return [];
          },
        },
      },
      [path.resolve(__dirname, '../backend/src/repositories/outboundMessageRepository.js')]: {
        outboundMessageRepository: {
          listActiveConfirmationsByAppointmentIds: async () => [],
        },
      },
      [path.resolve(__dirname, '../backend/src/repositories/patientRepository.js')]: {
        patientRepository: {
          findByIdAndClinic: async () => null,
        },
      },
    }
  );

  try {
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
  } finally {
    restore();
  }
});

register('clinicalController.upsertPatientDocument ignora clinicId injetado no documento', async () => {
  const calls = [];
  const { module: controller, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../backend/src/controllers/clinicalController.js'),
    {
      [path.resolve(__dirname, '../backend/src/services/patientClinicalService.js')]: {
        patientClinicalService: {
          upsertDocumentMetadata: async (input) => {
            calls.push(input);
            return { id: 'doc-1' };
          },
        },
      },
      [path.resolve(__dirname, '../backend/src/utils/authContext.js')]: {
        getAuthenticatedClinicId: (req) => String(req?.auth?.clinicId || '').trim(),
      },
    }
  );

  try {
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
  } finally {
    restore();
  }
});

register('patientClinicalService.getClinicalRecord usa lookup scoped por clinicId', async () => {
  const calls = [];
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../backend/src/services/patientClinicalService.js'),
    {
      [path.resolve(__dirname, '../backend/src/repositories/patientRepository.js')]: {
        patientRepository: {
          findByIdAndClinic: async (patientId, clinicId) => {
            calls.push({ patientId, clinicId });
            return { id: patientId, clinicId };
          },
        },
      },
      [path.resolve(__dirname, '../backend/src/repositories/patientClinicalRepository.js')]: {
        patientClinicalRepository: {
          ensureClinicalRecord: async ({ clinicId, patientId }) => ({
            id: 'record-1',
            clinicId,
            patientId,
          }),
        },
      },
      [path.resolve(__dirname, '../backend/src/repositories/financialRepository.js')]: { financialRepository: {} },
      [path.resolve(__dirname, '../backend/src/services/patientDocumentStorageService.js')]: { patientDocumentStorageService: {} },
      [path.resolve(__dirname, '../backend/src/services/financialService.js')]: {
        financialService: {},
        mapAccountToLegacy: (row) => row,
      },
    }
  );

  try {
    const result = await serviceModule.patientClinicalService.getClinicalRecord({
      clinicId: 'clinic-auth',
      patientId: 'patient-1',
    });
    assert.deepEqual(calls, [{ patientId: 'patient-1', clinicId: 'clinic-auth' }]);
    assert.deepEqual(result, {
      id: 'record-1',
      clinicId: 'clinic-auth',
      patientId: 'patient-1',
    });
  } finally {
    restore();
  }
});

register('patientClinicalService.getClinicalRecord retorna 404 quando o paciente esta fora do tenant', async () => {
  let ensureCalled = false;
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../backend/src/services/patientClinicalService.js'),
    {
      [path.resolve(__dirname, '../backend/src/repositories/patientRepository.js')]: {
        patientRepository: {
          findByIdAndClinic: async () => null,
        },
      },
      [path.resolve(__dirname, '../backend/src/repositories/patientClinicalRepository.js')]: {
        patientClinicalRepository: {
          ensureClinicalRecord: async () => {
            ensureCalled = true;
            return null;
          },
        },
      },
      [path.resolve(__dirname, '../backend/src/repositories/financialRepository.js')]: { financialRepository: {} },
      [path.resolve(__dirname, '../backend/src/services/patientDocumentStorageService.js')]: { patientDocumentStorageService: {} },
      [path.resolve(__dirname, '../backend/src/services/financialService.js')]: {
        financialService: {},
        mapAccountToLegacy: (row) => row,
      },
    }
  );

  try {
    await assert.rejects(
      () => serviceModule.patientClinicalService.getClinicalRecord({
        clinicId: 'clinic-auth',
        patientId: 'patient-1',
      }),
      (error) => {
        assert.equal(error?.code, 'PATIENT_NOT_FOUND');
        return true;
      }
    );
    assert.equal(ensureCalled, false);
  } finally {
    restore();
  }
});

register('patientClinicalService.upsertDocumentMetadata remove tenant fields injetados do metadata', async () => {
  let createdPayload = null;
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../backend/src/services/patientClinicalService.js'),
    {
      [path.resolve(__dirname, '../backend/src/repositories/patientRepository.js')]: {
        patientRepository: {
          findByIdAndClinic: async () => ({ id: 'patient-1', clinicId: 'clinic-auth' }),
        },
      },
      [path.resolve(__dirname, '../backend/src/repositories/patientClinicalRepository.js')]: {
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
      [path.resolve(__dirname, '../backend/src/repositories/financialRepository.js')]: { financialRepository: {} },
      [path.resolve(__dirname, '../backend/src/services/patientDocumentStorageService.js')]: { patientDocumentStorageService: {} },
      [path.resolve(__dirname, '../backend/src/services/financialService.js')]: {
        financialService: {},
        mapAccountToLegacy: (row) => row,
      },
    }
  );

  try {
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
  } finally {
    restore();
  }
});

register('financialService.listPatientPlans valida patientId dentro do tenant antes de consultar planos', async () => {
  let listPlansCalled = false;
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../backend/src/services/financialService.js'),
    {
      [path.resolve(__dirname, '../backend/src/repositories/financialRepository.js')]: {
        financialRepository: {
          findPatientByIdAndClinic: async () => null,
          listPatientPlansByPatient: async () => {
            listPlansCalled = true;
            return [];
          },
        },
      },
      [path.resolve(__dirname, '../backend/src/services/planMessageService.js')]: { planMessageService: {} },
      [path.resolve(__dirname, '../backend/src/services/planFinancialAccountSyncService.js')]: {
        ensurePlanFinancialAccount: async () => null,
        ensurePlanFinancialAccounts: async () => [],
      },
    }
  );

  try {
    await assert.rejects(
      () => serviceModule.financialService.listPatientPlans({
        clinicId: 'clinic-auth',
        patientId: 'patient-1',
      }),
      (error) => {
        assert.equal(error?.code, 'PATIENT_NOT_FOUND');
        return true;
      }
    );
    assert.equal(listPlansCalled, false);
  } finally {
    restore();
  }
});

register('financialService.createPatientPlan usa clinicId explicito e ignora payload.clinicId', async () => {
  const patientLookupCalls = [];
  const stopError = new Error('stop_after_create_call');
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../backend/src/services/financialService.js'),
    {
      [path.resolve(__dirname, '../backend/src/repositories/financialRepository.js')]: {
        financialRepository: {
          findPatientByIdAndClinic: async (input) => {
            patientLookupCalls.push(input);
            return { id: input.patientId, nome: 'Paciente', clinicId: input.clinicId };
          },
          createPatientPlan: async () => {
            throw stopError;
          },
        },
      },
      [path.resolve(__dirname, '../backend/src/services/planMessageService.js')]: { planMessageService: {} },
      [path.resolve(__dirname, '../backend/src/services/planFinancialAccountSyncService.js')]: {
        ensurePlanFinancialAccount: async () => null,
        ensurePlanFinancialAccounts: async () => [],
      },
    }
  );

  try {
    await assert.rejects(
      () => serviceModule.financialService.createPatientPlan({
        clinicId: 'clinic-auth',
        payload: {
          clinicId: 'clinic-evil',
          patientId: 'patient-1',
          totalValue: 500,
        },
      }),
      (error) => error === stopError
    );
    assert.deepEqual(patientLookupCalls, [{
      clinicId: 'clinic-auth',
      patientId: 'patient-1',
    }]);
  } finally {
    restore();
  }
});

register('campaignService.createCampaign ignora clinicId do payload e saneia audienceFilters/metadata', async () => {
  let createdPayload = null;
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../backend/src/services/campaignService.js'),
    {
      [path.resolve(__dirname, '../backend/src/repositories/campaignRepository.js')]: {
        campaignRepository: {
          countByClinic: async () => 1,
          createCampaign: async (data) => {
            createdPayload = data;
            return data;
          },
        },
      },
      [path.resolve(__dirname, '../backend/src/repositories/clinicRepository.js')]: { clinicRepository: {} },
      [path.resolve(__dirname, '../backend/src/repositories/patientRepository.js')]: { patientRepository: {} },
      [path.resolve(__dirname, '../backend/src/repositories/appointmentRepository.js')]: { appointmentRepository: {} },
      [path.resolve(__dirname, '../backend/src/repositories/financialRepository.js')]: { financialRepository: {} },
      [path.resolve(__dirname, '../backend/src/repositories/patientClinicalRepository.js')]: { patientClinicalRepository: {} },
      [path.resolve(__dirname, '../backend/src/services/messagingDispatchService.js')]: { messagingDispatchService: {} },
      [path.resolve(__dirname, '../backend/src/services/campaignAudienceResolver.js')]: { resolveAudiencePreviewData: () => ({}) },
      [path.resolve(__dirname, '../shared/campaign-template-catalog.js')]: {
        listCampaignTemplatesCatalog: () => ({ annualTemplates: [] }),
        getCampaignTemplateById: () => null,
      },
    }
  );

  try {
    const result = await serviceModule.campaignService.createCampaign({
      clinicId: 'clinic-auth',
      payload: {
        clinicId: 'clinic-evil',
        nome: 'Campanha Teste',
        segmentKey: 'by_dentist',
        audienceFilters: {
          clinicId: 'clinic-evil',
          dentistId: 'dent-1',
          nested: {
            patientId: 'patient-evil',
            keep: 'ok',
          },
        },
        metadata: {
          clinicId: 'clinic-evil',
          selection: {
            patientIds: ['patient-evil'],
            keep: true,
          },
        },
      },
      actorName: 'user-1',
    });
    assert.equal(createdPayload.clinicId, 'clinic-auth');
    assert.deepEqual(createdPayload.audienceFilters, {
      dentistId: 'dent-1',
      nested: {
        keep: 'ok',
      },
    });
    assert.deepEqual(createdPayload.metadata, {
      selection: {
        keep: true,
      },
    });
    assert.equal(result.clinicId, 'clinic-auth');
  } finally {
    restore();
  }
});

register('campaignService.resolveAudiencePreview bloqueia campaignId fora do tenant antes de consultar datasets', async () => {
  let patientsLookupCalled = false;
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../backend/src/services/campaignService.js'),
    {
      [path.resolve(__dirname, '../backend/src/repositories/campaignRepository.js')]: {
        campaignRepository: {
          findCampaignByIdAndClinic: async () => null,
        },
      },
      [path.resolve(__dirname, '../backend/src/repositories/clinicRepository.js')]: { clinicRepository: {} },
      [path.resolve(__dirname, '../backend/src/repositories/patientRepository.js')]: {
        patientRepository: {
          listAudienceBaseByClinic: async () => {
            patientsLookupCalled = true;
            return [];
          },
        },
      },
      [path.resolve(__dirname, '../backend/src/repositories/appointmentRepository.js')]: { appointmentRepository: {} },
      [path.resolve(__dirname, '../backend/src/repositories/financialRepository.js')]: { financialRepository: {} },
      [path.resolve(__dirname, '../backend/src/repositories/patientClinicalRepository.js')]: { patientClinicalRepository: {} },
      [path.resolve(__dirname, '../backend/src/services/messagingDispatchService.js')]: { messagingDispatchService: {} },
      [path.resolve(__dirname, '../backend/src/services/campaignAudienceResolver.js')]: { resolveAudiencePreviewData: () => ({}) },
      [path.resolve(__dirname, '../shared/campaign-template-catalog.js')]: {
        listCampaignTemplatesCatalog: () => ({ annualTemplates: [] }),
        getCampaignTemplateById: () => null,
      },
    }
  );

  try {
    await assert.rejects(
      () => serviceModule.campaignService.resolveAudiencePreview({
        clinicId: 'clinic-auth',
        campaignId: 'camp-foreign',
        segmentKey: 'inactive_90',
        filters: { clinicId: 'clinic-evil' },
      }),
      (error) => {
        assert.equal(error?.code, 'CAMPAIGN_NOT_FOUND');
        return true;
      }
    );
    assert.equal(patientsLookupCalled, false);
  } finally {
    restore();
  }
});

register('relationshipService.getOverview falha antes do fanout sem clinicId autenticado', async () => {
  let downstreamCalled = false;
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../backend/src/services/relationshipService.js'),
    {
      [path.resolve(__dirname, '../backend/src/services/patientService.js')]: {
        patientService: {
          listByClinic: async () => {
            downstreamCalled = true;
            return [];
          },
        },
      },
      [path.resolve(__dirname, '../backend/src/services/appointmentService.js')]: {
        appointmentService: {
          listAppointments: async () => {
            downstreamCalled = true;
            return [];
          },
        },
      },
      [path.resolve(__dirname, '../backend/src/services/campaignService.js')]: {
        campaignService: {
          getDashboard: async () => {
            downstreamCalled = true;
            return {};
          },
          listDispatchLogs: async () => {
            downstreamCalled = true;
            return { items: [] };
          },
        },
      },
      [path.resolve(__dirname, '../backend/src/services/financialService.js')]: {
        financialService: {
          getFinancialDashboard: async () => {
            downstreamCalled = true;
            return {};
          },
          listPatientPlans: async () => {
            downstreamCalled = true;
            return [];
          },
        },
      },
      [path.resolve(__dirname, '../backend/src/services/planMessageService.js')]: { planMessageService: {} },
      [path.resolve(__dirname, '../backend/src/services/clinicService.js')]: {
        clinicService: {
          getOperationalSettings: async () => {
            downstreamCalled = true;
            return {};
          },
        },
      },
    }
  );

  try {
    await assert.rejects(
      () => serviceModule.relationshipService.getOverview({
        clinicId: '',
        date: '2026-04-13',
      }),
      (error) => {
        assert.equal(error?.code, 'UNAUTHORIZED');
        return true;
      }
    );
    assert.equal(downstreamCalled, false);
  } finally {
    restore();
  }
});

register('laboratoryService.createOrder ignora clinicId do payload e saneia metadata tenant-sensivel', async () => {
  let createdPayload = null;
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../backend/src/services/laboratoryService.js'),
    {
      [path.resolve(__dirname, '../backend/src/repositories/laboratoryRepository.js')]: {
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

  try {
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
  } finally {
    restore();
  }
});

register('laboratoryService.updateOrder bloqueia reatribuicao de patientId antes de atualizar o dominio', async () => {
  let updateCalled = false;
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../backend/src/services/laboratoryService.js'),
    {
      [path.resolve(__dirname, '../backend/src/repositories/laboratoryRepository.js')]: {
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

  try {
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
  } finally {
    restore();
  }
});

register('inboundMessageService.receiveWhatsappInbound saneia rawPayload tenant-sensivel na ingestao', async () => {
  let createdPayload = null;
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../backend/src/services/inboundMessageService.js'),
    {
      [path.resolve(__dirname, '../backend/src/repositories/inboundMessageRepository.js')]: {
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
      [path.resolve(__dirname, '../backend/src/repositories/outboundMessageRepository.js')]: {
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
      [path.resolve(__dirname, '../backend/src/repositories/appointmentRepository.js')]: {
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
      [path.resolve(__dirname, '../backend/src/repositories/patientRepository.js')]: {
        patientRepository: {
          findByIdAndClinic: async () => ({
            id: 'patient-1',
            clinicId: 'clinic-auth',
            nome: 'Paciente Teste',
            telefone: '5511999999999',
          }),
        },
      },
      [path.resolve(__dirname, '../backend/src/db/prisma.js')]: {
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

  try {
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
  } finally {
    restore();
  }
});

register('inboundMessageService.receiveWhatsappInbound usa lookups scoped por clinicId para paciente e mensagem persistida', async () => {
  const patientCalls = [];
  const storedCalls = [];
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../backend/src/services/inboundMessageService.js'),
    {
      [path.resolve(__dirname, '../backend/src/repositories/inboundMessageRepository.js')]: {
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
      [path.resolve(__dirname, '../backend/src/repositories/outboundMessageRepository.js')]: {
        outboundMessageRepository: {
          findLatestReplyEnabledByClinicAndPhone: async () => ({
            id: 'out-1',
            patientId: 'patient-1',
            appointmentId: 'appt-1',
          }),
        },
      },
      [path.resolve(__dirname, '../backend/src/repositories/appointmentRepository.js')]: {
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
      [path.resolve(__dirname, '../backend/src/repositories/patientRepository.js')]: {
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
      [path.resolve(__dirname, '../backend/src/services/notificationEventService.js')]: {
        notificationEventService: {
          create: async () => null,
        },
      },
    }
  );

  try {
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
  } finally {
    restore();
  }
});

register('messagingDispatchService.updateDispatchStatus saneia metadata tenant-sensivel', async () => {
  let updatedPayload = null;
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../backend/src/services/messagingDispatchService.js'),
    {
      [path.resolve(__dirname, '../backend/src/repositories/campaignRepository.js')]: {
        campaignRepository: {
          findDispatchByIdAndClinic: async () => ({
            id: 'dispatch-1',
            clinicId: 'clinic-auth',
            campaignId: 'campaign-1',
            batchId: 'batch-1',
            status: 'PENDING',
            provider: null,
            providerMessageId: null,
            lastError: null,
            metadata: {
              keepExisting: 'value',
            },
            attemptCount: 0,
            sentAt: null,
            failedAt: null,
            blockedAt: null,
          }),
          updateDispatch: async ({ data }) => {
            updatedPayload = data;
            return {
              id: 'dispatch-1',
              clinicId: 'clinic-auth',
              campaignId: 'campaign-1',
              batchId: 'batch-1',
              ...data,
            };
          },
          listDispatchesByBatch: async () => [{ status: 'SENT' }],
          updateBatch: async ({ data }) => ({ id: 'batch-1', ...data }),
        },
      },
    }
  );

  try {
    await serviceModule.messagingDispatchService.updateDispatchStatus({
      clinicId: 'clinic-auth',
      dispatchId: 'dispatch-1',
      status: 'SENT',
      metadata: {
        clinicId: 'clinic-evil',
        keepTop: 'yes',
        nested: {
          batchId: 'batch-evil',
          keep: 'ok',
        },
      },
    });

    assert.deepEqual(updatedPayload.metadata, {
      keepExisting: 'value',
      keepTop: 'yes',
      nested: {
        keep: 'ok',
      },
    });
  } finally {
    restore();
  }
});

register('outboundMessageService.getByIdForClinic usa lookup scoped por clinicId', async () => {
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../backend/src/services/outboundMessageService.js'),
    {
      [path.resolve(__dirname, '../backend/src/repositories/outboundMessageRepository.js')]: {
        outboundMessageRepository: {
          findById: async () => {
            throw new Error('global outbound lookup should not run');
          },
          findByIdAndClinic: async ({ id, clinicId }) => ({ id, clinicId }),
        },
      },
      [path.resolve(__dirname, '../backend/src/repositories/appointmentRepository.js')]: { appointmentRepository: {} },
      [path.resolve(__dirname, '../backend/src/repositories/clinicRepository.js')]: { clinicRepository: {} },
      [path.resolve(__dirname, '../backend/src/repositories/patientRepository.js')]: { patientRepository: {} },
      [path.resolve(__dirname, '../backend/src/services/appointmentActionTokenService.js')]: { appointmentActionTokenService: {} },
      [path.resolve(__dirname, '../backend/src/services/notificationEventService.js')]: { notificationEventService: {} },
      [path.resolve(__dirname, '../backend/src/adapters/whatsappNgClient.js')]: { whatsappNgClient: {} },
      [path.resolve(__dirname, '../backend/src/config/appEnv.js')]: { appEnv: { appointmentActionLinksEnabled: false } },
    }
  );

  try {
    const result = await serviceModule.outboundMessageService.getByIdForClinic({
      id: 'out-1',
      clinicId: 'clinic-auth',
    });

    assert.deepEqual(result, {
      id: 'out-1',
      clinicId: 'clinic-auth',
    });
  } finally {
    restore();
  }
});

register('outboundMessageService.sendAppointmentConfirmation usa lookups scoped por clinicId', async () => {
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../backend/src/services/outboundMessageService.js'),
    {
      [path.resolve(__dirname, '../backend/src/repositories/appointmentRepository.js')]: {
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
      [path.resolve(__dirname, '../backend/src/repositories/patientRepository.js')]: {
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
      [path.resolve(__dirname, '../backend/src/repositories/outboundMessageRepository.js')]: {
        outboundMessageRepository: {
          findLatestActiveConfirmationByAppointment: async () => ({
            id: 'out-existing',
            clinicId: 'clinic-auth',
            patientId: 'patient-1',
            appointmentId: 'appt-1',
            createdAt: new Date(),
            status: 'SENT',
          }),
        },
      },
      [path.resolve(__dirname, '../backend/src/repositories/clinicRepository.js')]: {
        clinicRepository: {
          findById: async () => ({
            id: 'clinic-auth',
            nomeFantasia: 'Clinica Teste',
          }),
        },
      },
      [path.resolve(__dirname, '../backend/src/services/appointmentActionTokenService.js')]: { appointmentActionTokenService: {} },
      [path.resolve(__dirname, '../backend/src/services/notificationEventService.js')]: { notificationEventService: {} },
      [path.resolve(__dirname, '../backend/src/adapters/whatsappNgClient.js')]: { whatsappNgClient: {} },
      [path.resolve(__dirname, '../backend/src/config/appEnv.js')]: { appEnv: { appointmentActionLinksEnabled: false } },
    }
  );

  try {
    const result = await serviceModule.outboundMessageService.sendAppointmentConfirmation({
      clinicId: 'clinic-auth',
      appointmentId: 'appt-1',
    });

    assert.equal(result?.deduped, true);
    assert.equal(result?.appointmentId, 'appt-1');
  } finally {
    restore();
  }
});

register('internalWhatsappController.receiveInboundWhatsapp encaminha apenas campos allowlisted', async () => {
  let receivedPayload = null;
  const { module: controller, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../backend/src/controllers/internalWhatsappController.js'),
    {
      [path.resolve(__dirname, '../backend/src/services/inboundMessageService.js')]: {
        inboundMessageService: {
          receiveWhatsappInbound: async (input) => {
            receivedPayload = input;
            return { id: 'inbound-1' };
          },
        },
      },
      [path.resolve(__dirname, '../backend/src/services/outboundMessageService.js')]: { outboundMessageService: {} },
    }
  );

  try {
    const req = {
      body: {
        clinicId: 'clinic-auth',
        fromPhone: '11999999999',
        body: '1',
        providerMessageId: 'provider-1',
        rawPayload: { keep: 'ok' },
        injected: 'should-not-pass',
      },
    };
    const res = createResponseDouble();
    let forwardedError = null;

    await controller.receiveInboundWhatsapp(req, res, (error) => {
      forwardedError = error;
    });

    assert.equal(forwardedError, null);
    assert.deepEqual(receivedPayload, {
      clinicId: 'clinic-auth',
      fromPhone: '11999999999',
      body: '1',
      providerMessageId: 'provider-1',
      rawPayload: { keep: 'ok' },
    });
    assert.equal(res.statusCode, 201);
  } finally {
    restore();
  }
});

register('internalAppointmentController.resolveInternalAppointmentId usa lookup de paciente scoped por clinicId', async () => {
  const { module: controller, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../backend/src/controllers/internalAppointmentController.js'),
    {
      [path.resolve(__dirname, '../backend/src/repositories/appointmentRepository.js')]: {
        appointmentRepository: {
          findByIdAndClinic: async () => null,
          listByClinic: async () => [{
            id: 'appt-1',
            clinicId: 'clinic-auth',
            patientId: 'patient-1',
            profissionalId: '',
            dataHora: '2026-04-13T10:00:00.000Z',
          }],
        },
      },
      [path.resolve(__dirname, '../backend/src/repositories/patientRepository.js')]: {
        patientRepository: {
          findById: async () => {
            throw new Error('global patient lookup should not run');
          },
          findByIdAndClinic: async () => ({
            id: 'patient-1',
            clinicId: 'clinic-auth',
            nome: 'Maria',
            telefone: '5511999999999',
          }),
        },
      },
      [path.resolve(__dirname, '../backend/src/services/outboundMessageService.js')]: { outboundMessageService: {} },
      [path.resolve(__dirname, '../backend/src/services/appointmentService.js')]: { appointmentService: {} },
    }
  );

  try {
    const req = {
      body: {
        clinicId: 'clinic-auth',
        appointment: {
          data: '2026-04-13',
          horaInicio: '10:00',
          pacienteNome: 'Maria',
        },
        patient: {
          nome: 'Maria',
          telefone: '11999999999',
        },
      },
    };
    const res = createResponseDouble();
    let forwardedError = null;

    await controller.resolveInternalAppointmentId(req, res, (error) => {
      forwardedError = error;
    });

    assert.equal(forwardedError, null);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.payload, {
      ok: true,
      data: {
        id: 'appt-1',
        clinicId: 'clinic-auth',
        patientId: 'patient-1',
      },
    });
  } finally {
    restore();
  }
});

const main = async () => {
  let passed = 0;
  for (const entry of tests) {
    try {
      await entry.fn();
      passed += 1;
      console.log(`ok - ${entry.name}`);
    } catch (error) {
      console.error(`not ok - ${entry.name}`);
      console.error(error);
      process.exitCode = 1;
    }
  }
  if (process.exitCode && process.exitCode !== 0) {
    console.error(`tenant isolation tests failed (${passed}/${tests.length} passed)`);
    return;
  }
  console.log(`tenant isolation tests passed (${passed}/${tests.length})`);
};

main().catch((error) => {
  console.error('tenant isolation test runner failed');
  console.error(error);
  process.exit(1);
});
