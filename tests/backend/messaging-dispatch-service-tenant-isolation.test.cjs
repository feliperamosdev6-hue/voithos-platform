const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadModuleWithMocks } = require('./helpers/load-module-with-mocks.cjs');

test('messagingDispatchService.updateDispatchStatus saneia metadata tenant-sensivel', async (t) => {
  let updatedPayload = null;
  const { module: serviceModule, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/services/messagingDispatchService.js'),
    {
      [path.resolve(__dirname, '../../backend/src/repositories/campaignRepository.js')]: {
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
          listDispatchesByBatch: async () => [
            { status: 'SENT' },
          ],
          updateBatch: async ({ data }) => ({ id: 'batch-1', ...data }),
        },
      },
    }
  );
  t.after(restore);

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
});
