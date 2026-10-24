import test from 'node:test';
import assert from 'node:assert/strict';
import { attendanceEditOnly } from '../src/middleware/auth.js';
import { canEditAttendance } from '../../frontend/src/utils/moduleAccess.js';
import { correctionActor } from '../src/attendance/services/supervisor.service.js';
import router from '../src/attendance/routes.js';
import User from '../src/models/User.js';
import Role from '../src/models/Role.js';

function backendAllows(user) {
  let allowed = false;
  attendanceEditOnly({ user }, { status(code) { assert.equal(code, 403); return this; }, json() {} }, () => { allowed = true; });
  return allowed;
}

for (const [name, allows] of [['frontend', canEditAttendance], ['backend', backendAllows]]) {
  test(`${name}: report viewers cannot edit until explicitly allowed`, () => {
    for (const role of ['office', 'security', 'farm_incharge', 'supervisor', 'custom']) {
      const user = { role, allowedModules: ['attendance'], permissions: { attendance_report: true } };
      assert.equal(allows(user), false);
      user.permissions.attendance_edit = true;
      assert.equal(allows(user), true);
      user.permissions.attendance_edit = false;
      assert.equal(allows(user), false);
      user.permissions.attendance_edit = true;
      user.permissions.attendance_report = false;
      assert.equal(allows(user), true);
      user.allowedModules = [];
      assert.equal(allows(user), false);
    }
    for (const role of ['admin', 'developer']) assert.equal(allows({ role }), true);
  });
}

test('edit permission defaults to disabled for users and roles', () => {
  for (const Model of [User, Role]) {
    assert.equal(new Model().permissions.attendance_edit, false);
    assert.equal(new Model({ permissions: { attendance_edit: true } }).permissions.attendance_edit, true);
  }
});

test('all correction and auto-cut routes require edit permission', () => {
  for (const path of ['/sessions/correct', '/supervisor/sessions/correct', '/sessions/auto-cut']) {
    const route = router.stack.find(layer => layer.route?.path === path && layer.route.methods.post)?.route;
    assert.ok(route?.stack.some(layer => layer.handle === attendanceEditOnly), path);
  }
});

test('custom editors are accepted within assigned farms and roles alone do not grant editing', async () => {
  const firm = '111111111111111111111111';
  const user = { role: 'custom', firms: [firm], permissions: { attendance_edit: true } };
  assert.equal(await correctionActor(user, {}, { firm }), user);
  await assert.rejects(correctionActor(user, {}, { firm: '222222222222222222222222' }), { status: 403 });
  for (const role of ['office', 'security', 'farm_incharge', 'supervisor']) {
    await assert.rejects(correctionActor({ role, firms: [firm] }, {}, { firm }), { status: 403 });
  }
});
