const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadModuleWithMocks } = require('./helpers/load-module-with-mocks.cjs');

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

test('campaignController.resolveAudience sempre usa clinicId autenticado', async (t) => {
  const calls = [];
  const { module: controller, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/controllers/campaignController.js'),
    {
      [path.resolve(__dirname, '../../backend/src/services/campaignService.js')]: {
        campaignService: {
          resolveAudiencePreview: async (input) => {
            calls.push(input);
            return { total: 0, members: [] };
          },
        },
      },
    }
  );
  t.after(restore);

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
});
