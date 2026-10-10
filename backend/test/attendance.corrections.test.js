import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Worker from '../src/attendance/models/Worker.js';
import User from '../src/models/User.js';
import Firm from '../src/models/Firm.js';
import WorkerDeployment from '../src/attendance/models/WorkerDeployment.js';
import AttendanceSession from '../src/attendance/models/AttendanceSession.js';
import AttendanceEvent from '../src/attendance/models/AttendanceEvent.js';
import AttendanceAuditLog from '../src/attendance/models/AttendanceAuditLog.js';
import { correctionActor } from '../src/attendance/services/supervisor.service.js';
import { correctAttendanceSession } from '../src/attendance/services/attendance.service.js';
import { getMonthlyAttendanceSummary } from '../src/attendance/services/report.service.js';
import { listAuditLogs } from '../src/attendance/services/audit.service.js';

const firm = '111111111111111111111111';
const workerId = '222222222222222222222222';
const userId = '333333333333333333333333';
const supervisorId = '444444444444444444444444';
const sessionId = '555555555555555555555555';
const worker = { _id: workerId, firm, fullName: 'Worker', workerCode: 'W1', dateOfJoining: '2020-01-01' };
const deployment = { firm, worker: workerId, supervisor: supervisorId, firmNameSnapshot: 'Farm',
  workLocation: supervisorId, workLocationNameSnapshot: 'Shed 1',
  designation: sessionId, designationNameSnapshot: 'Worker' };
const staff = role => ({ _id: userId, name: 'Editor', role, firms: [firm] });
function query(value) {
  return { select() { return this; }, populate() { return this; }, sort() { return this; },
    limit() { return this; }, skip() { return this; }, session() { return this; },
    lean: async () => value, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } };
}

test('security and incharge can correct within assigned firms, but not another firm', async () => {
  for (const role of ['security', 'farm_incharge']) {
    const user = staff(role);
    assert.equal(await correctionActor(user, worker, deployment), user);
    await assert.rejects(correctionActor(user, worker, { ...deployment, firm: supervisorId }), { status: 403 });
  }
  await assert.rejects(correctionActor(staff('labour'), worker, deployment), { status: 403 });
});

test('supervisor correction remains limited to assigned workers and excludes self', async t => {
  t.mock.method(Worker, 'findOne', () => query({ _id: supervisorId, userId, firm, fullName: 'Supervisor' }));
  t.mock.method(User, 'exists', () => query({ _id: userId }));
  assert.equal((await correctionActor(staff('supervisor'), worker, deployment)).role, 'supervisor');
  await assert.rejects(correctionActor(staff('supervisor'), worker, { ...deployment, supervisor: userId }), { status: 403 });
  await assert.rejects(correctionActor(staff('supervisor'), { _id: supervisorId }, deployment), { status: 403 });
});

test('repeated corrections record each editor, reason and before/after values in the transaction', async t => {
  let transactions = 0;
  let ended = 0;
  const dbSession = { withTransaction: async fn => { transactions++; await fn(); }, endSession: async () => { ended++; } };
  t.mock.method(mongoose, 'startSession', async () => dbSession);
  t.mock.method(Worker, 'findById', () => query(worker));
  t.mock.method(WorkerDeployment, 'find', () => query([deployment]));
  let savedSession = null;
  const logs = [];
  const save = async options => assert.equal(options.session, dbSession);
  t.mock.method(AttendanceSession, 'find', () => query(savedSession ? [savedSession] : []));
  t.mock.method(AttendanceSession, 'create', async (docs, options) => {
    assert.equal(options.session, dbSession);
    await new AttendanceSession(docs[0]).validate();
    savedSession = { ...docs[0], _id: sessionId, save };
    return [savedSession];
  });
  t.mock.method(AttendanceEvent, 'create', async (docs, options) => {
    assert.equal(options.session, dbSession);
    await new AttendanceEvent(docs[0]).validate();
    assert.equal(String(docs[0].recordedBy), userId);
    return [{ ...docs[0], _id: userId }];
  });
  t.mock.method(AttendanceAuditLog, 'create', async (docs, options) => {
    assert.equal(options.session, dbSession);
    await new AttendanceAuditLog(docs[0]).validate();
    logs.push(docs[0]);
    return docs;
  });
  const payload = { workerId, date: '2020-01-01', dutyIn: '08:00', dutyOut: '17:00', reason: 'Missed scan' };
  await correctAttendanceSession(staff('security'), payload);
  await correctAttendanceSession(staff('farm_incharge'), { ...payload, dutyOut: '18:00', reason: 'Verified later exit' });
  assert.equal(logs.length, 2);
  assert.equal(logs[0].previousValue, null);
  assert.equal(logs[0].performedByRole, 'security');
  assert.equal(logs[1].performedByRole, 'farm_incharge');
  assert.equal(logs[1].performedBy, userId);
  assert.equal(logs[1].previousValue.workedMinutes, 540);
  assert.equal(logs[1].newValue.workedMinutes, 600);
  assert.equal(logs[1].newValue.date, payload.date);
  assert.equal(logs[1].reason, 'Verified later exit');
  assert.equal(transactions, 2);
  assert.equal(ended, 2);
  t.mock.method(AttendanceAuditLog, 'create', async () => { throw new Error('Audit unavailable'); });
  await assert.rejects(correctAttendanceSession(staff('security'), payload), /Audit unavailable/);
  assert.equal(ended, 3, 'Transaction session closes even when audit insertion fails');
});

test('monthly counts use attendance month and firm, with zero for workers never edited', async t => {
  t.mock.method(Firm, 'findById', () => query({ _id: firm, name: 'Farm' }));
  t.mock.method(Worker, 'find', () => query([worker, { ...worker, _id: supervisorId }]));
  t.mock.method(WorkerDeployment, 'find', () => query([]));
  t.mock.method(AttendanceSession, 'find', () => query([]));
  t.mock.method(AttendanceAuditLog, 'aggregate', async pipeline => {
    assert.equal(String(pipeline[0].$match.firm), firm);
    assert.equal(pipeline[0].$match.action, 'CORRECTION');
    assert.deepEqual(pipeline[0].$match['newValue.date'], { $gte: '2020-01-01', $lte: '2020-01-31' });
    return [{ _id: workerId, count: 3 }];
  });
  const result = await getMonthlyAttendanceSummary(staff('security'), { firmId: firm, month: '2020-01' });
  assert.deepEqual(result.records.map(record => record.editCount), [3, 0]);
});

test('history is filtered by attendance date and worker, with firm scope and pagination', async t => {
  const filters = [];
  t.mock.method(AttendanceAuditLog, 'find', filter => { filters.push(filter); return query([]); });
  t.mock.method(AttendanceAuditLog, 'countDocuments', async filter => { filters.push(filter); return 28; });
  const result = await listAuditLogs(staff('security'), { workerId, attendanceDate: '2020-01-01', action: 'CORRECTION', entityType: 'ATTENDANCE_SESSION', limit: '25' });
  assert.equal(result.pagination.total, 28);
  assert.equal(result.pagination.pages, 2);
  for (const filter of filters) {
    assert.equal(filter['newValue.date'], '2020-01-01');
    assert.equal(String(filter.worker), workerId);
    assert.equal(String(filter.firm.$in[0]), firm);
  }
  await assert.rejects(listAuditLogs(staff('security'), { attendanceDate: '2020-02-30' }), { status: 400 });
});
