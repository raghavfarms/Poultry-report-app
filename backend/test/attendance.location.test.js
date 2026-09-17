import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAttendanceLocation, attendanceLocationReport } from '../src/attendance/services/location.service.js';
import { captureLocation } from '../../frontend/src/attendance/services/captureLocation.js';

const now = new Date('2026-09-09T08:00:00.000Z');
const valid = { status: 'CAPTURED', latitude: 18.52, longitude: 73.85, accuracyMetres: 12, capturedAt: now.toISOString() };

test('location denial/unavailability stays nonblocking and produces distinct admin notices', () => {
  for (const status of ['PERMISSION_DENIED', 'UNAVAILABLE', 'TIMEOUT', 'UNSUPPORTED']) {
    const location = normalizeAttendanceLocation({ status, latitude: 12, message: 'Untrusted message' }, now);
    assert.deepEqual(location, { status });
    const report = attendanceLocationReport(location);
    assert.equal(report.needsAttention, true);
    assert.match(report.message, /^Attendance marked/);
    assert.ok(!report.message.includes('Untrusted'));
  }
  assert.deepEqual(normalizeAttendanceLocation(undefined, now), { status: 'NOT_PROVIDED' });
  assert.equal(attendanceLocationReport({ status: 'PERMISSION_DENIED' }).message, 'Attendance marked without location — permission not granted.');
});

test('coordinates are validated without throwing and stale positions are not stored', () => {
  assert.equal(normalizeAttendanceLocation(valid, now).capturedAt.toISOString(), now.toISOString());
  assert.equal(attendanceLocationReport(normalizeAttendanceLocation(valid, now)).needsAttention, false);
  for (const input of [null, {}, [], 'bad', { ...valid, latitude: 91 }, { ...valid, longitude: -181 },
    { ...valid, accuracyMetres: -1 }, { ...valid, latitude: '18' }, { ...valid, longitude: Infinity },
    { ...valid, capturedAt: '2026-09-09T07:00:00.000Z' }, { ...valid, capturedAt: '2026-09-09T09:00:00.000Z' }]) {
    assert.notEqual(normalizeAttendanceLocation(input, now).status, 'CAPTURED');
  }
});

test('browser capture requests a fresh reading and maps permission errors without rejecting', async () => {
  let options;
  const captured = await captureLocation({ geolocation: { getCurrentPosition(success, failure, config) {
    options = config;
    success({ coords: { latitude: 18, longitude: 73, accuracy: 5 }, timestamp: now.getTime() });
  } } });
  assert.equal(captured.status, 'CAPTURED');
  assert.equal(options.maximumAge, 0);
  for (const [code, status] of [[1, 'PERMISSION_DENIED'], [2, 'UNAVAILABLE'], [3, 'TIMEOUT']]) {
    assert.deepEqual(await captureLocation({ geolocation: { getCurrentPosition(success, failure) { failure({ code }); } } }), { status });
  }
  assert.deepEqual(await captureLocation({ geolocation: null }), { status: 'UNSUPPORTED' });
  assert.deepEqual(await captureLocation({ geolocation: { getCurrentPosition() { throw new Error('Unavailable'); } } }), { status: 'UNAVAILABLE' });
});

test('unanswered permission prompt times out and a late result does not replace its status', async () => {
  let lateSuccess;
  const result = await captureLocation({ timeoutMs: 5, geolocation: { getCurrentPosition(success) { lateSuccess = success; } } });
  assert.deepEqual(result, { status: 'TIMEOUT' });
  lateSuccess({ coords: { latitude: 18, longitude: 73, accuracy: 5 }, timestamp: now.getTime() });
  assert.deepEqual(result, { status: 'TIMEOUT' });
});
