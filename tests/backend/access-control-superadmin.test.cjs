const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const accessControlPath = path.resolve(__dirname, '../../backend/src/utils/accessControl.js');

test('requireSuperAdmin aceita role SUPER_ADMIN', () => {
  const { requireSuperAdmin } = require(accessControlPath);
  assert.doesNotThrow(() => requireSuperAdmin({
    auth: {
      role: 'SUPER_ADMIN',
    },
  }));
});

test('requireSuperAdmin aceita role legado super_admin', () => {
  const { requireSuperAdmin } = require(accessControlPath);
  assert.doesNotThrow(() => requireSuperAdmin({
    auth: {
      role: 'super_admin',
    },
  }));
});

test('requireSuperAdmin aceita email configurado do superadmin autenticado', () => {
  const { requireSuperAdmin } = require(accessControlPath);
  assert.doesNotThrow(() => requireSuperAdmin({
    auth: {
      role: 'ADMIN',
      email: process.env.VOITHOS_SUPERADMIN_EMAIL || 'superadmin@voithos.local',
    },
  }));
});

test('requireSuperAdmin bloqueia usuario comum', () => {
  const { requireSuperAdmin } = require(accessControlPath);
  assert.throws(
    () => requireSuperAdmin({
      auth: {
        role: 'ADMIN',
        email: 'admin@clinica.com',
      },
    }),
    (error) => {
      assert.equal(error.statusCode, 403);
      assert.equal(error.code, 'FORBIDDEN');
      return true;
    }
  );
});
