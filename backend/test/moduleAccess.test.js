import test from 'node:test';
import assert from 'node:assert/strict';
import { requireModuleAccess } from '../src/middleware/auth.js';
import { canAccessModule } from '../../frontend/src/utils/moduleAccess.js';

function backendAllows(user, module) {
  let allowed = false;
  const res = {
    status(code) { assert.equal(code, 403); return this; },
    json() {},
  };
  requireModuleAccess(module)({ user }, res, () => { allowed = true; });
  return allowed;
}

for (const [name, allows] of [['frontend', canAccessModule], ['backend', backendAllows]]) {
  test(`${name}: attendance-only users cannot access diesel or transport`, () => {
    for (const role of ['office', 'supervisor', 'farm_incharge', 'security', 'custom']) {
      const user = { role, allowedModules: ['attendance'] };
      assert.equal(allows(user, 'attendance'), true);
      assert.equal(allows(user, 'diesel'), false);
      assert.equal(allows(user, 'transport'), false);
    }
  });

  test(`${name}: module selection and revocation control report access`, () => {
    const user = { role: 'custom', allowedModules: ['diesel', 'transport'] };
    assert.equal(allows(user, 'diesel'), true);
    assert.equal(allows(user, 'transport'), true);
    assert.equal(allows(user, 'attendance'), false);
    user.allowedModules = [];
    assert.equal(allows(user, 'diesel'), false);
    assert.equal(allows(user, 'transport'), false);
    assert.equal(allows({ role: 'office' }, 'diesel'), false);
    assert.equal(allows(null, 'diesel'), false);
  });

  test(`${name}: administrators retain full module access`, () => {
    for (const role of ['admin', 'developer']) {
      for (const module of ['diesel', 'transport', 'attendance']) {
        assert.equal(allows({ role, allowedModules: [] }, module), true);
      }
    }
  });
}
