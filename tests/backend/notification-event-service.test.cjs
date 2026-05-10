const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadModuleWithMocks } = require('./helpers/load-module-with-mocks.cjs');

test('notificationEventService.listByClinic suprime eventos ruidosos por padrao', async (t) => {
  let captured = null;
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/services/notificationEventService.js'),
    {
      [path.resolve(__dirname, '../../backend/src/repositories/notificationEventRepository.js')]: {
        notificationEventRepository: {
          listByClinic: async (input) => {
            captured = input;
            return [];
          },
          create: async () => null,
          markManyAsRead: async () => ({ count: 0 }),
        },
      },
    }
  );
  t.after(restore);

  await serviceModule.notificationEventService.listByClinic({
    clinicId: 'clinic-auth',
    limit: 12,
  });

  assert.deepEqual(captured.excludeTypes, [
    'APPOINTMENT_ACTION_LINK_USED',
    'APPOINTMENT_REMINDER_SENT',
    'PLAN_MESSAGE_EVENT_CREATED',
    'PLAN_MESSAGE_DISPATCH_STARTED',
    'PLAN_MESSAGE_DISPATCH_COMPLETED',
    'PLAN_MESSAGE_RESEND_REQUESTED',
  ]);
});

test('notificationEventService.listByClinic respeita filtro explicito de tipo sem suprimir eventos', async (t) => {
  let captured = null;
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/services/notificationEventService.js'),
    {
      [path.resolve(__dirname, '../../backend/src/repositories/notificationEventRepository.js')]: {
        notificationEventRepository: {
          listByClinic: async (input) => {
            captured = input;
            return [];
          },
          create: async () => null,
          markManyAsRead: async () => ({ count: 0 }),
        },
      },
    }
  );
  t.after(restore);

  await serviceModule.notificationEventService.listByClinic({
    clinicId: 'clinic-auth',
    types: ['APPOINTMENT_ACTION_LINK_USED'],
    limit: 12,
  });

  assert.deepEqual(captured.types, ['APPOINTMENT_ACTION_LINK_USED']);
  assert.deepEqual(captured.excludeTypes, []);
});
