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

test('relationshipController.getRelationshipOverview sempre usa clinicId autenticado', async (t) => {
  const calls = [];
  const { module: controller, restore } = loadModuleWithMocks(
    path.resolve(__dirname, '../../backend/src/controllers/relationshipController.js'),
    {
      [path.resolve(__dirname, '../../backend/src/services/relationshipService.js')]: {
        relationshipService: {
          getOverview: async (input) => {
            calls.push(input);
            return { clinicId: input.clinicId };
          },
        },
      },
    }
  );
  t.after(restore);

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
});
