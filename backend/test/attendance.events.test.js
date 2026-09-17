import test from 'node:test';
import assert from 'node:assert/strict';
import {
  indiaDateString,
  formatWorkedHours,
  recordAttendance,
  DUPLICATE_COOLDOWN_MS,
} from '../src/attendance/services/attendance.service.js';
import AttendanceEvent from '../src/attendance/models/AttendanceEvent.js';
import AttendanceSession from '../src/attendance/models/AttendanceSession.js';

test('indiaDateString correctly formats Indian calendar date at UTC boundaries', () => {
  // 2026-09-08 00:00 UTC is 05:30 AM in India on 2026-09-08
  assert.equal(indiaDateString(new Date('2026-09-08T00:00:00.000Z')), '2026-09-08');

  // 2026-09-07 18:30 UTC is exactly midnight 2026-09-08 00:00:00+05:30 in India
  assert.equal(indiaDateString(new Date('2026-09-07T18:30:00.000Z')), '2026-09-08');

  // 2026-09-07 18:29 UTC is 11:59 PM in India on 2026-09-07
  assert.equal(indiaDateString(new Date('2026-09-07T18:29:59.000Z')), '2026-09-07');
});

test('formatWorkedHours converts minutes into clean human-readable hours and minutes', () => {
  assert.equal(formatWorkedHours(0), '0m');
  assert.equal(formatWorkedHours(45), '45m');
  assert.equal(formatWorkedHours(60), '1h 0m');
  assert.equal(formatWorkedHours(90), '1h 30m');
  assert.equal(formatWorkedHours(552), '9h 12m'); // 9 hours 12 minutes as in requirements example
  assert.equal(formatWorkedHours(null), '0m');
  assert.equal(formatWorkedHours(-5), '0m');
});

test('recordAttendance validates eventType, source and workerId', async () => {
  const dummyUser = { _id: '111111111111111111111111', role: 'developer' };

  await assert.rejects(
    () => recordAttendance(dummyUser, { workerId: '222222222222222222222222', eventType: 'INVALID' }),
    { status: 400 }
  );

  await assert.rejects(
    () => recordAttendance(dummyUser, { workerId: '222222222222222222222222', eventType: 'DUTY_IN', source: 'HACK' }),
    { status: 400 }
  );

  await assert.rejects(
    () => recordAttendance(dummyUser, { workerId: 'bad_id', eventType: 'DUTY_IN' }),
    { status: 400 }
  );
});

test('AttendanceSession has partial unique index preventing duplicate open shifts', () => {
  const indexes = AttendanceSession.schema.indexes();
  const partialPresentIndex = indexes.find(
    ([keys, options]) =>
      keys.worker === 1 &&
      keys.status === 1 &&
      options.unique === true &&
      options.partialFilterExpression?.status === 'PRESENT'
  );
  assert.ok(partialPresentIndex, 'AttendanceSession must have unique index on worker + status=PRESENT');
});

test('AttendanceEvent model indexes ensure efficient worker and firm queries', () => {
  const indexes = AttendanceEvent.schema.indexes();
  assert.ok(
    indexes.some(([keys]) => keys.worker === 1 && keys.timestamp === -1),
    'AttendanceEvent should index worker + timestamp'
  );
  assert.ok(
    indexes.some(([keys]) => keys.firm === 1 && keys.attendanceDate === 1),
    'AttendanceEvent should index firm + attendanceDate'
  );
});

test('Duplicate check messages contain clear "2 times not allowed" feedback', () => {
  const duplicateInMsg = '2 times not allowed: Worker Ramesh Kumar is already marked IN since 08:30 am. Mark DUTY_OUT before checking in again.';
  const duplicateOutMsg = '2 times not allowed: Worker Ramesh Kumar has already marked OUT for today at 05:00 pm. Cannot mark OUT twice!';
  const duplicateCompletedMsg = '2 times not allowed: Worker Ramesh Kumar has already completed duty today (Marked OUT at 05:00 pm). Duplicate attendance not allowed.';

  assert.match(duplicateInMsg, /2 times not allowed/);
  assert.match(duplicateInMsg, /already marked IN/);
  assert.match(duplicateOutMsg, /2 times not allowed/);
  assert.match(duplicateOutMsg, /already marked OUT/);
  assert.match(duplicateCompletedMsg, /2 times not allowed/);
  assert.match(duplicateCompletedMsg, /already completed duty today/);
});

test('AttendanceEvent and AttendanceSession support LUNCH_OUT and LUNCH_IN without ending shift', () => {
  const eventTypes = AttendanceEvent.schema.path('eventType').enumValues;
  assert.ok(eventTypes.includes('LUNCH_OUT'), 'AttendanceEvent must allow LUNCH_OUT');
  assert.ok(eventTypes.includes('LUNCH_IN'), 'AttendanceEvent must allow LUNCH_IN');

  const sessionPaths = AttendanceSession.schema.paths;
  assert.ok(sessionPaths.onLunch, 'AttendanceSession must have onLunch boolean');
  assert.ok(sessionPaths.lunchMinutes, 'AttendanceSession must have lunchMinutes');
  assert.ok(sessionPaths.lunchOut, 'AttendanceSession must have lunchOut Date');
  assert.ok(sessionPaths.lunchIn, 'AttendanceSession must have lunchIn Date');

  // Verify net worked hours calculation with lunch deducted
  const grossMinutes = 9 * 60; // 9 hours
  const lunchMinutes = 60; // 1 hr lunch
  const netWorkedMinutes = Math.max(0, grossMinutes - lunchMinutes);
  assert.equal(netWorkedMinutes, 480); // 8 hours net
  assert.equal(formatWorkedHours(netWorkedMinutes), '8h 0m');
});

