import test from 'node:test';
import assert from 'node:assert/strict';
import { getLiveDashboardData } from '../src/attendance/services/dashboard.service.js';
import AttendanceSession from '../src/attendance/models/AttendanceSession.js';
import WorkLocation from '../src/attendance/models/WorkLocation.js';

test('getLiveDashboardData rejects invalid date format', async () => {
  const user = { _id: '111111111111111111111111', role: 'developer' };
  await assert.rejects(
    () => getLiveDashboardData(user, { firmId: '222222222222222222222222', date: '2026/09/08' }),
    { status: 400, message: 'Date must be formatted as YYYY-MM-DD.' }
  );
  await assert.rejects(
    () => getLiveDashboardData(user, { firmId: '222222222222222222222222', date: 'invalid-date' }),
    { status: 400, message: 'Date must be formatted as YYYY-MM-DD.' }
  );
});

test('getLiveDashboardData rejects unauthorized firm access for admin', async () => {
  const adminUser = {
    _id: '111111111111111111111111',
    role: 'admin',
    firms: ['333333333333333333333333'],
  };
  await assert.rejects(
    () => getLiveDashboardData(adminUser, { firmId: '444444444444444444444444' }),
    { status: 403, message: 'You do not have access to this firm.' }
  );
});

test('WorkLocation schema correctly supports birdCapacity for sheds', () => {
  const shed = new WorkLocation({
    firm: '111111111111111111111111',
    name: 'Shed 01',
    nameKey: 'SHED 01',
    type: 'SHED',
    birdCapacity: { male: 500, female: 5000 },
    createdBy: '222222222222222222222222',
  });
  const err = shed.validateSync();
  assert.equal(err, undefined);
});

test('AttendanceSession schema indexes support rapid dashboard lookups by firm and date', () => {
  const indexes = AttendanceSession.schema.indexes();
  const hasFirmDateStatus = indexes.some(([keys]) => keys.firm === 1 && keys.date === 1 && keys.status === 1);
  assert.ok(hasFirmDateStatus, 'AttendanceSession must index firm + date + status');
});

