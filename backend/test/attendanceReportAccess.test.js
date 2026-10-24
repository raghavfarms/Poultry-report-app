import test from 'node:test';
import assert from 'node:assert/strict';
import { attendanceReportsOnly } from '../src/middleware/auth.js';
import router from '../src/attendance/routes.js';
import { canAccessMonthlyAttendance, canAccessReport } from '../../frontend/src/utils/moduleAccess.js';

function backendAllows(user) {
  let allowed = false;
  const res = { status(code) { assert.equal(code, 403); return this; }, json() {} };
  attendanceReportsOnly({ user }, res, () => { allowed = true; });
  return allowed;
}

for (const [name, allows] of [['frontend', canAccessMonthlyAttendance], ['backend', backendAllows]]) {
  test(`${name}: office and other staff cannot bypass disabled attendance reports`, () => {
    for (const role of ['office', 'supervisor', 'security', 'farm_incharge', 'custom']) {
      const user = { role, allowedModules: ['attendance'], permissions: {
        attendance_report: false, attendance_scan: true, worker_master: true,
      } };
      assert.equal(allows(user), false);
      user.permissions.attendance_report = true;
      assert.equal(allows(user), true);
      user.permissions.attendance_report = false;
      assert.equal(allows(user), false);
      delete user.permissions.attendance_report;
      assert.equal(allows(user), false);
    }
  });
  test(`${name}: attendance reports require both module and report permission`, () => {
    assert.equal(allows({ role: 'office', allowedModules: [], permissions: { attendance_report: true } }), false);
    assert.equal(allows(null), false);
    for (const role of ['admin', 'developer']) assert.equal(allows({ role }), true);
  });
}

test('only monthly reports require the monthly permission; live and daily remain available', () => {
  for (const path of ['/reports/monthly']) {
    const route = router.stack.find(layer => layer.route?.path === path && layer.route.methods.get)?.route;
    assert.ok(route?.stack.some(layer => layer.handle === attendanceReportsOnly), path);
  }
  for (const [path, method] of [['/dashboard/live', 'get'], ['/reports/daily', 'get'], ['/sessions', 'get'], ['/events', 'get'], ['/events', 'post'], ['/workers', 'get'], ['/workers', 'post'], ['/face-descriptors', 'get']]) {
    const route = router.stack.find(layer => layer.route?.path === path && layer.route.methods[method])?.route;
    assert.ok(route, path);
    assert.equal(route.stack.some(layer => layer.handle === attendanceReportsOnly), false, path);
  }
});

test('disabled monthly permission keeps the attendance page available', () => {
  const user = { role: 'office', allowedModules: ['attendance'], permissions: { attendance_report: false } };
  assert.equal(canAccessReport(user, 'attendance'), true);
  assert.equal(canAccessMonthlyAttendance(user), false);
  assert.equal(canAccessReport(user, 'diesel'), false);
});
