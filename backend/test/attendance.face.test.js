import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDescriptor } from '../src/attendance/services/face.service.js';
import { recordAttendance } from '../src/attendance/services/attendance.service.js';
import WorkerFaceProfile from '../src/attendance/models/WorkerFaceProfile.js';
import Worker from '../src/attendance/models/Worker.js';

test('validateDescriptor accepts valid 128-element Float32/number arrays', () => {
  const valid = new Array(128).fill(0.12345);
  assert.doesNotThrow(() => validateDescriptor(valid));
});

test('validateDescriptor rejects descriptors with incorrect lengths or non-finite values', () => {
  assert.throws(() => validateDescriptor(null), { status: 400 });
  assert.throws(() => validateDescriptor('not-an-array'), { status: 400 });
  assert.throws(() => validateDescriptor(new Array(64).fill(0.1)), { status: 400 });
  assert.throws(() => validateDescriptor(new Array(129).fill(0.1)), { status: 400 });
  
  const withNaN = new Array(128).fill(0.5);
  withNaN[10] = NaN;
  assert.throws(() => validateDescriptor(withNaN), { status: 400 });

  const withInfinity = new Array(128).fill(0.5);
  withInfinity[20] = Infinity;
  assert.throws(() => validateDescriptor(withInfinity), { status: 400 });

  const withString = new Array(128).fill(0.5);
  withString[30] = '0.5';
  assert.throws(() => validateDescriptor(withString), { status: 400 });
});

test('WorkerFaceProfile schema contains required indexes and validators', () => {
  const indexes = WorkerFaceProfile.schema.indexes();
  assert.ok(
    indexes.some(([keys]) => keys.firm === 1 && keys.active === 1),
    'WorkerFaceProfile must index firm + active for fast scanner sync'
  );

  const workerPath = WorkerFaceProfile.schema.path('worker');
  assert.ok(workerPath.options.unique, 'WorkerFaceProfile must enforce unique worker');
});

test('Worker model contains faceStatus enum and default NOT_REGISTERED', () => {
  const faceStatusPath = Worker.schema.path('faceStatus');
  assert.equal(faceStatusPath.options.default, 'NOT_REGISTERED');
  assert.deepEqual(faceStatusPath.enumValues, ['NOT_REGISTERED', 'REGISTERED', 'RE_REGISTRATION_REQUIRED']);
});

test('recordAttendance accepts AUTO eventType without rejecting at payload validation', async () => {
  const dummyUser = { _id: '111111111111111111111111', role: 'developer' };

  // Should proceed past eventType validation and fail at DB query (no DB in unit test) or workerId
  await assert.rejects(
    () => recordAttendance(dummyUser, { workerId: '222222222222222222222222', eventType: 'AUTO', source: 'FACE' }),
    (err) => {
      // Must not be the 400 error for invalid eventType
      assert.notEqual(err.message, 'Event type must be DUTY_IN, DUTY_OUT, or AUTO.');
      return true;
    }
  );
});

