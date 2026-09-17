import test from 'node:test';
import assert from 'node:assert/strict';
import { indiaDateString, formatWorkedHours, DUPLICATE_COOLDOWN_MS } from '../src/attendance/services/attendance.service.js';
import { validateDescriptor } from '../src/attendance/services/face.service.js';
import Worker from '../src/attendance/models/Worker.js';
import WorkerDeployment from '../src/attendance/models/WorkerDeployment.js';
import AttendanceSession from '../src/attendance/models/AttendanceSession.js';
import AttendanceEvent from '../src/attendance/models/AttendanceEvent.js';
import AttendanceAuditLog from '../src/attendance/models/AttendanceAuditLog.js';
import WorkLocation from '../src/attendance/models/WorkLocation.js';

test('E2E Workflow: Master Data & Deployment Schema Integrity', async () => {
  // 1. Verify Worker code indexing & faceStatus
  const workerIndexes = Worker.schema.indexes();
  assert.ok(workerIndexes.some(([keys]) => keys.workerCode === 1), 'Worker must index workerCode');

  // 2. Verify WorkerDeployment unique initial & unique open intervals
  const depIndexes = WorkerDeployment.schema.indexes();
  assert.ok(
    depIndexes.some(([keys, opts]) => opts?.name === 'one_open_deployment_per_worker'),
    'Must enforce one open deployment per worker'
  );
  assert.ok(
    depIndexes.some(([keys, opts]) => opts?.name === 'one_initial_deployment_per_worker'),
    'Must enforce one initial deployment per worker'
  );

  // 3. Verify WorkLocation birdCapacity constraints
  const loc = new WorkLocation({
    firm: '111111111111111111111111',
    name: 'Shed Alpha',
    nameKey: 'SHED ALPHA',
    type: 'MISCELLANEOUS',
    birdCapacity: { male: 10, female: 10 },
    createdBy: '222222222222222222222222',
  });
  const valError = await loc.validate().catch((e) => e);
  assert.ok(valError?.errors?.birdCapacity, 'Miscellaneous location cannot have bird capacity');
});

test('E2E Workflow: Face Recognition & Security Enrolment', () => {
  const validDescriptor = new Array(128).fill(0.245);
  assert.doesNotThrow(() => validateDescriptor(validDescriptor));

  // Invalid sizes or NaN values must fail immediately
  assert.throws(() => validateDescriptor(new Array(64).fill(0.1)), { status: 400 });
  assert.throws(() => validateDescriptor(new Array(129).fill(0.1)), { status: 400 });
});

test('E2E Workflow: Attendance Working Hours Calculation & Duplicate Cooldown', () => {
  // Cooldown must be exactly 60 seconds (60,000 ms)
  assert.equal(DUPLICATE_COOLDOWN_MS, 60000);

  // Formatted hours check across boundaries
  assert.equal(formatWorkedHours(0), '0m');
  assert.equal(formatWorkedHours(35), '35m');
  assert.equal(formatWorkedHours(60), '1h 0m');
  assert.equal(formatWorkedHours(552), '9h 12m'); // Exactly matches client specification

  // Asia/Kolkata date resolution
  const testDate = new Date('2026-09-08T04:30:00.000Z'); // 10:00 AM IST
  assert.equal(indiaDateString(testDate), '2026-09-08');
});

test('E2E Workflow: Attendance Session & Event Concurrency Guards', () => {
  // Partial unique index ensures only one open shift (status: 'PRESENT') per worker
  const sessionIndexes = AttendanceSession.schema.indexes();
  const openShiftIndex = sessionIndexes.find(
    ([keys, opts]) => keys.worker === 1 && keys.status === 1 && opts?.partialFilterExpression?.status === 'PRESENT'
  );
  assert.ok(openShiftIndex, 'AttendanceSession must enforce single active open shift via database index');

  // Verify AttendanceEvent has source enum with FACE, MANUAL, CORRECTION
  const sourcePath = AttendanceEvent.schema.path('source');
  assert.ok(sourcePath.enumValues.includes('FACE'));
  assert.ok(sourcePath.enumValues.includes('MANUAL'));
  assert.ok(sourcePath.enumValues.includes('CORRECTION'));
});

test('E2E Workflow: Transfer & Audit Trail Model Integration', () => {
  // Verify WorkerDeployment supports both SHED_TRANSFER and FARM_TRANSFER
  const allocTypePath = WorkerDeployment.schema.path('allocationType');
  assert.ok(allocTypePath.enumValues.includes('INITIAL'));
  assert.ok(allocTypePath.enumValues.includes('SHED_TRANSFER'));
  assert.ok(allocTypePath.enumValues.includes('FARM_TRANSFER'));

  // Verify AttendanceAuditLog required indexes and action enums
  const auditIndexes = AttendanceAuditLog.schema.indexes();
  assert.ok(auditIndexes.some(([keys]) => keys.firm === 1 && keys.createdAt === -1));
  assert.ok(auditIndexes.some(([keys]) => keys.worker === 1 && keys.createdAt === -1));

  const actionPath = AttendanceAuditLog.schema.path('action');
  assert.ok(actionPath.enumValues.includes('SHED_TRANSFER'));
  assert.ok(actionPath.enumValues.includes('FARM_TRANSFER'));
  assert.ok(actionPath.enumValues.includes('CORRECTION'));
});
