import test from 'node:test';
import assert from 'node:assert/strict';
import { getDailyAttendanceReport, getMonthlyAttendanceSummary } from '../src/attendance/services/report.service.js';

test('getDailyAttendanceReport rejects invalid date format', async () => {
  const user = { _id: '111111111111111111111111', role: 'developer' };
  await assert.rejects(
    () => getDailyAttendanceReport(user, { firmId: '222222222222222222222222', date: '08-09-2026' }),
    { status: 400, message: 'Date must be formatted as YYYY-MM-DD.' }
  );
});

test('getDailyAttendanceReport enforces firm scope', async () => {
  const adminUser = {
    _id: '111111111111111111111111',
    role: 'admin',
    firms: ['333333333333333333333333'],
  };
  await assert.rejects(
    () => getDailyAttendanceReport(adminUser, { firmId: '444444444444444444444444' }),
    { status: 403, message: 'You do not have access to this firm.' }
  );
});

test('getMonthlyAttendanceSummary rejects invalid month format', async () => {
  const user = { _id: '111111111111111111111111', role: 'developer' };
  await assert.rejects(
    () => getMonthlyAttendanceSummary(user, { firmId: '222222222222222222222222', month: '2026/09' }),
    { status: 400, message: 'Month must be formatted as YYYY-MM.' }
  );
  await assert.rejects(
    () => getMonthlyAttendanceSummary(user, { firmId: '222222222222222222222222', month: '2026-9' }),
    { status: 400, message: 'Month must be formatted as YYYY-MM.' }
  );
});

test('getMonthlyAttendanceSummary enforces firm scope', async () => {
  const adminUser = {
    _id: '111111111111111111111111',
    role: 'admin',
    firms: ['333333333333333333333333'],
  };
  await assert.rejects(
    () => getMonthlyAttendanceSummary(adminUser, { firmId: '444444444444444444444444' }),
    { status: 403, message: 'You do not have access to this firm.' }
  );
});

test('attendanceStaffOnly permits supervisor, security, and farm_incharge but rejects labour', async () => {
  const { attendanceStaffOnly } = await import('../src/middleware/auth.js');
  let called = false;
  const next = () => { called = true; };

  // Allowed roles
  for (const role of ['office', 'supervisor', 'security', 'farm_incharge', 'admin', 'developer']) {
    called = false;
    attendanceStaffOnly({ user: { role } }, {}, next);
    assert.equal(called, true, `Role ${role} should be permitted`);
  }

  // Disallowed roles
  let resStatus = 0;
  let resBody = null;
  const res = {
    status(s) { resStatus = s; return this; },
    json(b) { resBody = b; return this; },
  };

  for (const role of ['user', 'labour']) {
    called = false;
    resStatus = 0;
    attendanceStaffOnly({ user: { role } }, res, next);
    assert.equal(called, false, `Role ${role} should be rejected`);
    assert.equal(resStatus, 403);
  }
});

test('supervisorOrAdminOnly allows supervisor and admin but blocks security and farm_incharge from transfers', async () => {
  const { supervisorOrAdminOnly } = await import('../src/middleware/auth.js');
  let called = false;
  const next = () => { called = true; };

  for (const role of ['supervisor', 'office', 'admin', 'developer']) {
    called = false;
    supervisorOrAdminOnly({ user: { role } }, {}, next);
    assert.equal(called, true, `Role ${role} should be permitted to transfer`);
  }

  for (const role of ['security', 'farm_incharge', 'user', 'labour']) {
    let resStatus = 0;
    const res = {
      status(s) { resStatus = s; return this; },
      json() { return this; },
    };
    called = false;
    supervisorOrAdminOnly({ user: { role } }, res, next);
    assert.equal(called, false, `Role ${role} should be blocked from transferring`);
    assert.equal(resStatus, 403);
  }
});

test('daily report sort orders records shed-wise with natural ordering and secondary worker name', () => {
  const mockRows = [
    { workLocationName: 'Shed 2', workerName: 'vishal' },
    { workLocationName: 'Shed 1', workerName: 'Rajeev' },
    { workLocationName: 'Shed 10', workerName: 'Anil' },
    { workLocationName: 'Shed 1', workerName: 'Ishant' },
  ];

  mockRows.sort((a, b) => {
    const shedA = a.workLocationName || 'Unassigned';
    const shedB = b.workLocationName || 'Unassigned';
    const locComp = shedA.localeCompare(shedB, undefined, { numeric: true, sensitivity: 'base' });
    if (locComp !== 0) return locComp;
    return (a.workerName || '').localeCompare(b.workerName || '', undefined, { sensitivity: 'base' });
  });

  assert.equal(mockRows[0].workLocationName, 'Shed 1');
  assert.equal(mockRows[0].workerName, 'Ishant'); // 'Ishant' before 'Rajeev'
  assert.equal(mockRows[1].workLocationName, 'Shed 1');
  assert.equal(mockRows[1].workerName, 'Rajeev');
  assert.equal(mockRows[2].workLocationName, 'Shed 2');
  assert.equal(mockRows[2].workerName, 'vishal');
  assert.equal(mockRows[3].workLocationName, 'Shed 10'); // natural numeric sort: Shed 2 before Shed 10
});

test('monthly summary sort orders records name-wise alphabetically A to Z', () => {
  const mockRecords = [
    { workerName: 'vishal', workerCode: 'RGF-0008' },
    { workerName: 'Rajeev', workerCode: 'RGF-0009' },
    { workerName: 'pradeep', workerCode: 'RGF-0010' },
    { workerName: 'Ishant', workerCode: 'RGF-0011' },
  ];

  mockRecords.sort((a, b) => {
    const nameA = a.workerName || '';
    const nameB = b.workerName || '';
    const nameComp = nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
    if (nameComp !== 0) return nameComp;
    return (a.workerCode || '').localeCompare(b.workerCode || '', undefined, { numeric: true, sensitivity: 'base' });
  });

  assert.deepEqual(mockRecords.map(r => r.workerName), ['Ishant', 'pradeep', 'Rajeev', 'vishal']);
});

test('monthly attendance displays dash before joining date and A/P/HD/OD after joining date when dateOfJoining is unset', () => {
  const targetMonth = '2026-09';
  const todayDate = '2026-09-17';
  const daysInMonth = 30;

  const worker = {
    _id: 'w1',
    fullName: 'Office Employee',
    dateOfJoining: null, // User did not set joining date
    createdAt: new Date('2026-09-15T10:00:00+05:30'),
  };
  const deployment = {
    effectiveFrom: new Date('2026-09-15T00:00:00+05:30'),
  };

  const sessionsForWorker = new Map([
    ['2026-09-16', [{ status: 'DUTY_COMPLETED', workedMinutes: 480 }]], // P
    ['2026-09-17', [{ status: 'PRESENT', workedMinutes: 60 }]],          // OD
  ]);

  const indiaDateString = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
  const effectiveJoining = worker.dateOfJoining
    || (deployment?.effectiveFrom ? indiaDateString(deployment.effectiveFrom) : null)
    || (worker.createdAt ? indiaDateString(worker.createdAt) : null);

  assert.equal(effectiveJoining, '2026-09-15');

  const days = {};
  let absentDays = 0;
  let presentDays = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = String(day).padStart(2, '0');
    const fullDateStr = `${targetMonth}-${dayStr}`;

    if (sessionsForWorker.has(fullDateStr)) {
      const daySessions = sessionsForWorker.get(fullDateStr);
      let dayMinutes = 0;
      let isOpen = false;
      for (const sess of daySessions) {
        if (sess.status === 'PRESENT') isOpen = true;
        dayMinutes += (sess.workedMinutes || 0);
      }
      if (isOpen && fullDateStr === todayDate) {
        days[dayStr] = 'OD';
        presentDays += 1;
      } else if (isOpen || dayMinutes >= 475) {
        days[dayStr] = 'P';
        presentDays += 1;
      } else if (dayMinutes >= 240) {
        days[dayStr] = 'HD';
        presentDays += 0.5;
        absentDays += 0.5;
      } else {
        days[dayStr] = 'A';
        absentDays += 1;
      }
    } else if (effectiveJoining && fullDateStr < effectiveJoining) {
      days[dayStr] = '—'; // Not joined yet
    } else if (fullDateStr > todayDate) {
      days[dayStr] = '—'; // Future date
    } else {
      days[dayStr] = 'A'; // Absent after joining
      absentDays += 1;
    }
  }

  // Days 1-14 must be dash
  for (let d = 1; d <= 14; d++) {
    assert.equal(days[String(d).padStart(2, '0')], '—', `Day ${d} must be dash before joining`);
  }
  // Day 15 (joining date, no session): Absent
  assert.equal(days['15'], 'A', 'Day 15 must be Absent');
  // Day 16: P
  assert.equal(days['16'], 'P', 'Day 16 must be Present');
  // Day 17 (today): OD
  assert.equal(days['17'], 'OD', 'Day 17 must be On Duty');
  // Days 18-30 (future): dash
  for (let d = 18; d <= 30; d++) {
    assert.equal(days[String(d).padStart(2, '0')], '—', `Day ${d} must be dash for future`);
  }

  // Total Absent must only be 1 (for day 15), NOT 15
  assert.equal(absentDays, 1);
  assert.equal(presentDays, 2);
});




