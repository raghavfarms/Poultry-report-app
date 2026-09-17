import test from 'node:test';
import assert from 'node:assert/strict';
import { transferWorker } from '../src/attendance/services/deployment.service.js';
import { correctAttendanceSession } from '../src/attendance/services/attendance.service.js';
import AttendanceAuditLog from '../src/attendance/models/AttendanceAuditLog.js';

test('transferWorker rejects missing or empty reason', async () => {
  const user = { _id: '111111111111111111111111', role: 'developer' };
  await assert.rejects(
    () => transferWorker(user, '222222222222222222222222', {
      toWorkLocation: '333333333333333333333333',
      effectiveFrom: '2026-09-10',
      reason: '',
    }),
    { status: 400, message: 'Reason must contain 1–1000 characters.' }
  );
});

test('transferWorker rejects invalid destination location ID', async () => {
  const user = { _id: '111111111111111111111111', role: 'developer' };
  await assert.rejects(
    () => transferWorker(user, '222222222222222222222222', {
      toWorkLocation: 'invalid-id',
      effectiveFrom: '2026-09-10',
      reason: 'Relocating to Shed 2',
    }),
    { status: 400, message: 'Destination work location is invalid.' }
  );
});

test('correctAttendanceSession rejects missing or empty reason', async () => {
  const user = { _id: '111111111111111111111111', role: 'developer' };
  await assert.rejects(
    () => correctAttendanceSession(user, {
      workerId: '222222222222222222222222',
      date: '2026-09-08',
      dutyIn: '08:00',
      dutyOut: '17:00',
      reason: '   ',
    }),
    { status: 400, message: 'Reason must contain 1–1000 characters.' }
  );
});

test('correctAttendanceSession rejects dutyOut before dutyIn', async () => {
  const user = { _id: '111111111111111111111111', role: 'developer' };
  await assert.rejects(
    () => correctAttendanceSession(user, {
      workerId: '222222222222222222222222',
      date: '2026-09-08',
      dutyIn: '17:00',
      dutyOut: '08:00',
      reason: 'Forgot to punch out on time',
    }),
    { status: 400, message: 'Duty OUT must be after Duty IN.' }
  );
});

test('AttendanceAuditLog schema includes required indexes and action enums', () => {
  const actionPath = AttendanceAuditLog.schema.path('action');
  assert.deepEqual(actionPath.enumValues, ['SHED_TRANSFER', 'FARM_TRANSFER', 'CORRECTION', 'MANUAL_PUNCH']);

  const indexes = AttendanceAuditLog.schema.indexes();
  const hasFirmIndex = indexes.some(([keys]) => keys.firm === 1 && keys.createdAt === -1);
  const hasWorkerIndex = indexes.some(([keys]) => keys.worker === 1 && keys.createdAt === -1);

  assert.ok(hasFirmIndex, 'AttendanceAuditLog must index firm + createdAt');
  assert.ok(hasWorkerIndex, 'AttendanceAuditLog must index worker + createdAt');
});

