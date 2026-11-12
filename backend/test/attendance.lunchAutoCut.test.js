import test from 'node:test';
import assert from 'node:assert/strict';
import { formatWorkedHours, resolveAutoCutFullShift } from '../src/attendance/services/attendance.service.js';

test('auto-cut calculations for workers who left at lunch without returning', () => {
  // Duty In: 8:00 AM, Lunch Out: 1:00 PM (Worker left farm at lunch)
  const dutyIn = new Date('2026-10-21T08:00:00+05:30');
  const lunchOut = new Date('2026-10-21T13:00:00+05:30');

  // Duty physically ended at lunch departure time
  const dutyOut = lunchOut;
  const workedMinutes = Math.max(0, Math.round((lunchOut.getTime() - dutyIn.getTime()) / (60 * 1000)));

  assert.equal(workedMinutes, 300, 'Worker should get exactly 300 minutes (5 hours) logged');
  assert.equal(formatWorkedHours(workedMinutes), '5h 0m');

  // Classification verification according to attendance business rules:
  // >= 475 mins: COMPLETED (Full day, 1.0)
  // >= 235 mins and < 475 mins: HALF_DAY (0.5)
  // < 235 mins: ABSENT (0.0)
  const classifyAttendance = (mins) => {
    if (mins >= 475) return 'COMPLETED';
    if (mins >= 235) return 'HALF_DAY';
    return 'ABSENT';
  };

  assert.equal(classifyAttendance(workedMinutes), 'HALF_DAY', '5 hours worked before lunch must be classified as HALF_DAY');
});

test('auto-cut for early departure at lunch (< 4 hours) awards ABSENT', () => {
  // Duty In: 8:00 AM, Lunch Out: 11:30 AM (Worker left farm at 11:30 AM)
  const dutyIn = new Date('2026-10-21T08:00:00+05:30');
  const lunchOut = new Date('2026-10-21T11:30:00+05:30');

  const workedMinutes = Math.max(0, Math.round((lunchOut.getTime() - dutyIn.getTime()) / (60 * 1000)));
  assert.equal(workedMinutes, 210, '3.5 hours = 210 minutes');

  const classifyAttendance = (mins) => {
    if (mins >= 475) return 'COMPLETED';
    if (mins >= 235) return 'HALF_DAY';
    return 'ABSENT';
  };

  assert.equal(classifyAttendance(workedMinutes), 'ABSENT', 'Less than 4 hours worked must be classified as ABSENT');
});

test('retroactive auto-correction identifies past flawed sessions and recalculates correctly', () => {
  const pastSession = {
    _id: 'sess123',
    dutyIn: new Date('2026-10-15T08:00:00+05:30'),
    lunchOut: new Date('2026-10-15T13:00:00+05:30'),
    lunchIn: null,
    // Flawed legacy auto-cut previously set dutyOut to 4:00 PM and workedMinutes to 480 (8 hrs full day)
    dutyOut: new Date('2026-10-15T16:00:00+05:30'),
    workedMinutes: 480,
    status: 'DUTY_COMPLETED',
    remarks: '[Auto-Cut: 15hr threshold]',
  };

  // Correction calculation:
  const trueWorkedMinutes = Math.max(0, Math.round((pastSession.lunchOut.getTime() - pastSession.dutyIn.getTime()) / (60 * 1000)));
  const timeDifference = pastSession.dutyOut ? Math.abs(pastSession.dutyOut.getTime() - pastSession.lunchOut.getTime()) : Infinity;

  const needsCorrection = timeDifference > 60 * 1000 || pastSession.workedMinutes > trueWorkedMinutes + 15;
  assert.ok(needsCorrection, 'Past flawed session must be flagged for auto-correction');

  const correctedDutyOut = pastSession.lunchOut;
  const correctedWorkedMinutes = trueWorkedMinutes;
  const correctedRemarks = `${pastSession.remarks}; [Auto-Corrected: Left at lunch - Did not return]`;

  assert.equal(correctedDutyOut.getTime(), pastSession.lunchOut.getTime());
  assert.equal(correctedWorkedMinutes, 300);
  assert.ok(correctedRemarks.includes('[Auto-Corrected: Left at lunch - Did not return]'));
});

test('auto-cut for workers who returned from lunch credits full 8h net work (9h gross shift)', () => {
  // Scenario: Worker Rana punches IN at 8:13 AM, goes for lunch 1:00 PM - 1:59 PM (59 mins),
  // but forgets to punch OUT in the evening.
  const dutyIn = new Date('2026-11-06T08:13:00+05:30');
  const lunchMinutes = 59;

  const { dutyOut, netMinutes, maxGrossMinutes } = resolveAutoCutFullShift(dutyIn, lunchMinutes);

  assert.equal(maxGrossMinutes, 539, 'Max gross time must be 480 + 59 = 539 minutes');
  assert.equal(dutyOut.getTime(), new Date('2026-11-06T17:12:00+05:30').getTime(), 'Duty Out must be 05:12 PM IST');
  assert.equal(netMinutes, 480, 'Net worked minutes must be full 480 minutes (8 hours)');
  assert.equal(formatWorkedHours(netMinutes), '8h 0m');

  const classifyAttendance = (mins) => {
    if (mins >= 475) return 'COMPLETED';
    if (mins >= 235) return 'HALF_DAY';
    return 'ABSENT';
  };

  assert.equal(classifyAttendance(netMinutes), 'COMPLETED', 'Worker who returned from lunch must be credited Full Day (COMPLETED)');
});


