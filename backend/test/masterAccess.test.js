import test from 'node:test';
import assert from 'node:assert/strict';
import { masterOnly, requireFirmAccess } from '../src/middleware/auth.js';
import User from '../src/models/User.js';
import Role from '../src/models/Role.js';
import Asset from '../src/models/Asset.js';
import { updateAsset, deleteAsset, restoreAsset } from '../src/controllers/assets.controller.js';

function invoke(middleware, user, params = {}) {
  const result = { allowed: false };
  const res = { status(code) { result.status = code; return this; }, json() {} };
  middleware({ user, params }, res, () => { result.allowed = true; });
  return result;
}

test('master permissions default to denied and persist independently', () => {
  for (const Model of [User, Role]) {
    const legacy = new Model();
    assert.equal(legacy.permissions.asset_master, false);
    assert.equal(legacy.permissions.transport_master, false);
    const assigned = new Model({ permissions: { asset_master: true, transport_master: false } });
    assert.equal(assigned.toObject().permissions.asset_master, true);
    assert.equal(assigned.toObject().permissions.transport_master, false);
  }
});

test('master access requires the specific permission or administrator role', () => {
  for (const permission of ['asset_master', 'transport_master']) {
    for (const role of ['admin', 'developer']) {
      assert.equal(invoke(masterOnly(permission), { role }).allowed, true);
    }
    assert.equal(invoke(masterOnly(permission), { role: 'custom', permissions: { [permission]: true } }).allowed, true);
    assert.equal(invoke(masterOnly(permission), { role: 'custom', permissions: {} }).status, 403);
    assert.equal(invoke(masterOnly(permission), { role: 'custom', permissions: { attendance_admin_master: true } }).status, 403);
    assert.equal(invoke(masterOnly(permission), { role: 'custom', permissions: { [permission]: false } }).status, 403);
  }
});

test('asset master access does not bypass assigned farms', () => {
  const user = { role: 'custom', permissions: { asset_master: true }, firms: ['farm-a'] };
  assert.equal(invoke(requireFirmAccess, user, { firmId: 'farm-a' }).allowed, true);
  assert.equal(invoke(requireFirmAccess, user, { firmId: 'farm-b' }).status, 403);
});

test('asset update, delete and restore reject assets from other farms before writing', async (t) => {
  t.mock.method(Asset, 'findById', async () => ({ firm: 'farm-b' }));
  t.mock.method(Asset, 'findByIdAndUpdate', () => assert.fail('Unauthorized write'));
  for (const handler of [updateAsset, deleteAsset, restoreAsset]) {
    await assert.rejects(handler({
      user: { role: 'custom', permissions: { asset_master: true }, firms: ['farm-a'] },
      params: { assetId: 'asset-b' },
    }, {}), { status: 403 });
  }
});
