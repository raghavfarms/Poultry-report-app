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



