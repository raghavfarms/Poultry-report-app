import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import app from '../src/app.js';
import Firm from '../src/models/Firm.js';
import User from '../src/models/User.js';
import Worker from '../src/attendance/models/Worker.js';
import Designation from '../src/attendance/models/Designation.js';
import WorkLocation from '../src/attendance/models/WorkLocation.js';
import WorkerCounter from '../src/attendance/models/WorkerCounter.js';
import WorkerDeployment from '../src/attendance/models/WorkerDeployment.js';

test('attendance masters API: authorization, validation, isolation, pagination and concurrent IDs', {
  skip: process.env.ATTENDANCE_INTEGRATION_TEST !== '1', timeout: 120000,
}, async (t) => {
  // Never use the URI's database or MONGODB_DB_NAME. All fixtures live in a unique disposable database.
  const localEnv = dotenv.parse(await readFile(new URL('../.env', import.meta.url)));
  const uri = process.env.ATTENDANCE_TEST_MONGODB_URI || localEnv.MONGODB_URI;
  assert.ok(uri, 'Configure a MongoDB test connection.');
  const dbName = `att1_${randomUUID().replaceAll('-', '')}`;
  let server;
  let connected = false;
  const oldSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = randomUUID();
  t.after(async () => {
    if (server) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    if (connected) {
      assert.equal(mongoose.connection.name, dbName);
      assert.match(dbName, /^att1_[a-f0-9]{32}$/);
      await mongoose.connection.db.dropDatabase();
    }
    await mongoose.disconnect();
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  });
  try {
    await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000 });
    connected = true;
  } catch (error) {
    assert.fail(`Could not connect to the isolated test database (${error.name}, ${error.code || 'no error code'}). No application database was selected.`);
  }
  await Promise.all([Firm.init(), User.init(), Worker.init(), Designation.init(), WorkLocation.init(), WorkerCounter.init(), WorkerDeployment.init()]);
  const [raghav, sanjana] = await Firm.create([{ name: 'Raghav', code: 'RAGHAV' }, { name: 'Sanjana', code: 'SANJANA' }]);
  const [admin, bothAdmin, labour, noFirmAdmin] = await User.create([
    { name: 'Raghav Admin', email: 'raghav@test.invalid', passwordHash: 'test', role: 'admin', firms: [raghav._id] },
    { name: 'Both Admin', email: 'both@test.invalid', passwordHash: 'test', role: 'admin', firms: [raghav._id, sanjana._id] },
    { name: 'Operator', email: 'operator@test.invalid', passwordHash: 'test', role: 'labour', firms: [raghav._id] },
    { name: 'No Firm', email: 'none@test.invalid', passwordHash: 'test', role: 'admin', firms: [] },
  ]);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/attendance`;
  async function request(path, { user = admin, method = 'GET', body, expected = 200 } = {}) {
    // Each worker fixture represents a previously registered account.
    if (path === '/workers' && method === 'POST' && body && !Object.hasOwn(body, 'userId')) {
      const account = await User.create({ name: body.fullName || 'Test Worker', email: randomUUID() + '@test.invalid', passwordHash: 'test', firms: [body.firmId] });
      body = { ...body, userId: String(account._id) };
    }
    const headers = { 'Content-Type': 'application/json' };
    if (user) headers.Authorization = `Bearer ${jwt.sign({ sub: String(user._id) }, process.env.JWT_SECRET)}`;
    const response = await fetch(`${url}${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json();
    const expectedStatuses = Array.isArray(expected) ? expected : [expected];
    assert.ok(expectedStatuses.includes(response.status), `${method} ${path}: expected ${expectedStatuses}, got ${response.status}: ${result.message || 'unexpected status'}`);
    return result;
  }

  await t.test('JWT and admin permission required; firm list is scoped', async () => {
    await request('/workers', { user: null, expected: 401 });
    await request('/workers', { user: labour, expected: 403 });
    assert.equal((await request('/firms')).firms.length, 1);
    assert.equal((await request('/firms', { user: bothAdmin })).firms.length, 2);
    assert.equal((await request('/firms', { user: noFirmAdmin })).firms.length, 0);
    await request(`/workers?firmId=${sanjana._id}`, { expected: 403 });
  });

  const { item: designation } = await request('/designations', { method: 'POST', expected: 201, body: { firmId: String(raghav._id), name: 'Farm Worker' } });
  const { item: otherDesignation } = await request('/designations', { user: bothAdmin, method: 'POST', expected: 201, body: { firmId: String(sanjana._id), name: 'Farm Worker' } });
  const { item: initialLocation } = await request('/work-locations', { method: 'POST', expected: 201, body: { firmId: String(raghav._id), name: 'Farm General Work', type: 'MISCELLANEOUS' } });
  const { item: otherLocation } = await request('/work-locations', { user: bothAdmin, method: 'POST', expected: 201, body: { firmId: String(sanjana._id), name: 'Farm General Work', type: 'MISCELLANEOUS' } });
  const workerBody = { firmId: String(raghav._id), fullName: 'Raj Kumar', dateOfJoining: '2026-09-01', designation: designation._id, mobileNumber: '9876543210', initialDeployment: { workLocation: initialLocation._id } };
  await t.test('registered accounts are required, scoped, searchable and linked once', async () => {
    await request('/workers', { method: 'POST', expected: 400, body: { ...workerBody, userId: null } });
    await request('/workers', { method: 'POST', expected: 400, body: { ...workerBody, userId: String(new mongoose.Types.ObjectId()) } });
    const before = await Worker.countDocuments();
    await request('/worker/me', { user: labour, expected: 404 });
    assert.equal(await Worker.countDocuments(), before);
    const matches = await request('/registered-users?firmId=' + raghav._id + '&search=operator@test.invalid');
    assert.equal(matches.items.length, 1);
    assert.equal(matches.items[0]._id, String(labour._id));
    assert.equal(matches.items[0].passwordHash, undefined);
    await request('/registered-users?firmId=' + sanjana._id, { expected: 403 });
    await request('/workers', { user: bothAdmin, method: 'POST', expected: 400, body: { ...workerBody, firmId: String(sanjana._id), userId: String(labour._id) } });
  });
  let worker;
  await t.test('creates worker with private details excluded and checks cross-firm references', async () => {
    ({ worker } = await request('/workers', { method: 'POST', expected: 201, body: {
      ...workerBody, isSupervisor: true, aadhaarNumber: '234567890123', bankDetails: { accountNumber: '001234567890', ifsc: 'ABCD0123456' },
    } }));
    assert.equal(worker.workerCode, 'RGF-0001');
    assert.ok(worker.userId);
    await request('/workers', { method: 'POST', expected: 400, body: { ...workerBody, userId: worker.userId } });
    const linkedAccount = await User.findById(worker.userId);
    assert.equal((await request('/worker/me', { user: linkedAccount })).worker.id, worker._id);
    const eligible = await request('/registered-users?firmId=' + raghav._id + '&search=' + linkedAccount.email);
    assert.equal(eligible.items.length, 0);
    assert.equal(worker.faceStatus, 'NOT_REGISTERED');
    assert.equal(worker.aadhaarNumber, undefined);
    assert.equal(worker.bankDetails, undefined);
    assert.equal((await request(`/workers/${worker._id}`)).worker.bankDetails, undefined);
    assert.equal((await request(`/workers/${worker._id}/private-details`)).bankDetails.accountNumber, '001234567890');
    await request('/workers', { method: 'POST', expected: 400, body: { ...workerBody, designation: otherDesignation._id } });
    await request('/workers', { method: 'POST', expected: 403, body: { ...workerBody, firmId: String(sanjana._id), designation: otherDesignation._id } });
    await request('/workers', { method: 'POST', expected: 400, body: { ...workerBody, dateOfJoining: '2026-02-30' } });
  });

  let otherWorker;
  await t.test('another firm worker cannot be read, patched or have private details accessed', async () => {
    ({ worker: otherWorker } = await request('/workers', { user: bothAdmin, method: 'POST', expected: 201, body: {
      ...workerBody, firmId: String(sanjana._id), designation: otherDesignation._id,
      initialDeployment: { workLocation: otherLocation._id },
    } }));
    assert.equal(otherWorker.workerCode, 'SJF-0001');
    await request(`/workers/${otherWorker._id}`, { expected: 404 });
    await request(`/workers/${otherWorker._id}/private-details`, { expected: 404 });
    await request(`/workers/${otherWorker._id}`, { method: 'PATCH', body: { active: false }, expected: 404 });
    await request(`/designations/${otherDesignation._id}`, { expected: 404 });
    await request(`/designations/${otherDesignation._id}`, { method: 'PATCH', body: { active: false }, expected: 404 });
  });

  await t.test('location supervisor must be active, eligible and from the same firm', async () => {
    const { item: location } = await request('/work-locations', { method: 'POST', expected: 201, body: {
      firmId: String(raghav._id), name: 'Shed 1', type: 'SHED', supervisor: worker._id,
    } });
    await request(`/work-locations/${location._id}`, { method: 'PATCH', expected: 400, body: { supervisor: otherWorker._id } });
    await request(`/workers/${worker._id}`, { method: 'PATCH', expected: 400, body: { active: false } });
    await request(`/work-locations/${location._id}`, { method: 'PATCH', body: { supervisor: null } });
    await request(`/workers/${worker._id}`, { method: 'PATCH', body: { active: false, leavingDate: '2026-09-08' } });
    await request(`/work-locations/${location._id}`, { method: 'PATCH', expected: 400, body: { supervisor: worker._id } });
    await request(`/workers/${worker._id}`, { method: 'PATCH', expected: 400, body: { active: true } });
    await request(`/workers/${worker._id}`, { method: 'PATCH', body: { active: true, leavingDate: null } });
    await request(`/work-locations/${location._id}`, { method: 'DELETE', expected: 404 });
    assert.ok(await WorkLocation.exists({ _id: location._id }));
  });

  await t.test('master duplicates include inactive records; deactivation preserves references', async () => {
    await request(`/designations/${designation._id}`, { method: 'PATCH', body: { active: false } });
    await request('/designations', { method: 'POST', expected: 409, body: { firmId: String(raghav._id), name: ' farm   WORKER ' } });
    await request('/workers', { method: 'POST', expected: 400, body: workerBody });
    assert.equal((await request(`/workers/${worker._id}`)).worker.designation._id, designation._id);
    await request(`/designations/${designation._id}`, { method: 'PATCH', body: { active: true } });
  });

  await t.test('concurrent creation produces unique IDs and paginated firm-scoped search', async () => {
    const results = await Promise.all(Array.from({ length: 30 }, (_, index) => request('/workers', {
      method: 'POST', expected: 201, body: { ...workerBody, fullName: `Worker ${String(index).padStart(2, '0')}` },
    })));
    const codes = results.map((result) => result.worker.workerCode);
    assert.equal(new Set(codes).size, 30);
    assert.ok(codes.every((code) => code !== worker.workerCode));
    const first = await request('/workers');
    assert.equal(first.items.length, 25);
    assert.equal(first.pagination.total, 31);
    assert.ok(first.items.every((item) => item.firm._id === String(raghav._id) && !item.bankDetails && !item.aadhaarNumber));
    const second = await request('/workers?page=2');
    assert.equal(second.items.length, 6);
    assert.equal(new Set([...first.items, ...second.items].map((item) => item._id)).size, 31);
    assert.equal((await request('/workers?search=RGF-0001')).pagination.total, 1);
    assert.equal((await request('/workers?search=9876543210')).pagination.total, 31);
    assert.equal((await request('/workers?search=.*')).pagination.total, 0);
    assert.equal((await request('/workers', { user: noFirmAdmin })).pagination.total, 0);
  });

  await t.test('shed capacities sum by authorized firm and distinguish missing capacity', async () => {
    const createShed = async (name, extra = {}) => (await request('/work-locations', {
      user: bothAdmin, method: 'POST', expected: 201,
      body: { firmId: String(raghav._id), name, type: 'SHED', ...extra },
    })).item;
    const shed = await createShed('Capacity shed', { birdCapacity: { male: 500, female: 5000 } });
    assert.equal(shed.birdCapacity.total, 5500);
    assert.equal((await request(`/work-locations/${shed._id}`)).item.birdCapacity.total, 5500);
    const listed = await request('/work-locations?type=SHED');
    assert.equal(listed.items.find((item) => item._id === shed._id).birdCapacity.total, 5500);
    await createShed('Inactive shed', { active: false, birdCapacity: { male: 100, female: 100 } });
    await createShed('Other firm shed', { firmId: String(sanjana._id), birdCapacity: { male: 10, female: 90 } });
    await createShed('Maintenance', { type: 'MISCELLANEOUS' });
    const summary = (await request('/capacity')).firms;
    assert.equal(summary.length, 1);
    assert.deepEqual(summary[0].birdCapacity, { male: 500, female: 5000, total: 5500 });
    assert.equal(summary[0].shedCount, 2);
    assert.equal(summary[0].unconfiguredSheds, 1);
    assert.equal(summary[0].capacityComplete, false);
    await request(`/capacity?firmId=${sanjana._id}`, { expected: 403 });
    await request('/capacity', { user: labour, expected: 403 });
    assert.equal((await request('/capacity', { user: noFirmAdmin })).firms.length, 0);
    const other = (await request(`/capacity?firmId=${sanjana._id}`, { user: bothAdmin })).firms[0];
    assert.equal(other.birdCapacity.total, 100);
    assert.equal(other.capacityComplete, true);
    await request(`/work-locations/${shed._id}`, { method: 'PATCH', expected: 400, body: { type: 'MISCELLANEOUS' } });
    await request('/work-locations', { method: 'POST', expected: 400, body: { firmId: String(raghav._id), name: 'Invalid', type: 'MISCELLANEOUS', birdCapacity: { male: 1, female: 1 } } });
    await request(`/work-locations/${shed._id}`, { method: 'PATCH', body: { birdCapacity: { male: 200, female: 800 } } });
    assert.equal((await request('/capacity')).firms[0].birdCapacity.total, 1000);
    await request(`/work-locations/${shed._id}`, { method: 'PATCH', body: { birdCapacity: null, type: 'MISCELLANEOUS' } });
    assert.equal((await request('/capacity')).firms[0].birdCapacity.total, 0);
    // Existing locations with no stored field remain unknown, not zero-capacity sheds.
    const old = await WorkLocation.findOne({ name: 'Shed 1' });
    await WorkLocation.collection.updateOne({ _id: old._id }, { $unset: { birdCapacity: '' } });
    assert.equal((await request(`/work-locations/${old._id}`)).item.birdCapacity, null);
    assert.equal((await request('/capacity')).firms[0].unconfiguredSheds, 1);
  });

  await t.test('invalid inputs, deletion, and ownership/ID mutation are rejected', async () => {
    await request('/workers/not-an-id', { expected: 400 });
    await request('/workers?limit=1000', { expected: 400 });
    await request(`/workers/${worker._id}`, { method: 'PATCH', expected: 400, body: { workerCode: 'SJF-9999' } });
    await request(`/workers/${worker._id}`, { method: 'PATCH', expected: 400, body: { firmId: String(sanjana._id) } });
    await request(`/workers/${worker._id}`, { method: 'DELETE', expected: 404 });
    assert.ok(await Worker.exists({ _id: worker._id, workerCode: 'RGF-0001' }));
    await request(`/workers/${worker._id}`, { method: 'PATCH', body: { aadhaarNumber: null, bankDetails: null } });
    assert.deepEqual(await request(`/workers/${worker._id}/private-details`), { aadhaarNumber: null, bankDetails: null });
  });

  await t.test('worker creation includes an initial deployment with time-aware lookup and firm-scoped history', async () => {
    const initial = (await request(`/workers/${worker._id}/deployment?at=2026-09-01`)).deployment;
    assert.equal(initial.workLocation, initialLocation._id);
    assert.equal(initial.firm, String(raghav._id));
    assert.equal(initial.allocationType, 'INITIAL');
    assert.equal(initial.effectiveFrom, '2026-08-31T18:30:00.000Z');
    assert.equal(initial.createdBy, String(admin._id));
    assert.equal((await request(`/workers/${worker._id}/deployment?at=2026-08-31T18:29:59Z`)).deployment, null);
    assert.equal((await request(`/workers/${worker._id}/deployment`)).deployment._id, initial._id);
    assert.equal((await request(`/workers/${worker._id}/deployments`)).pagination.total, 1);
    assert.equal((await request('/deployments')).pagination.total, 31);
    assert.equal((await request(`/deployments?workLocation=${initialLocation._id}&at=2026-09-01`)).pagination.total, 31);
    assert.equal((await request('/deployments?at=2026-08-01')).pagination.total, 0);
    await request(`/workers/${otherWorker._id}/deployment`, { expected: 404 });
    await request(`/workers/${otherWorker._id}/deployments`, { expected: 404 });
    await request(`/deployments?firmId=${sanjana._id}`, { expected: 403 });
    await request('/deployments', { user: labour, expected: 403 });
    await request(`/workers/${worker._id}/initial-deployment`, { user: labour, method: 'POST', body: workerBody.initialDeployment, expected: 403 });
    assert.equal((await request('/deployments', { user: noFirmAdmin })).pagination.total, 0);
    await request(`/workers/${worker._id}/deployment?at=2026-02-30`, { expected: 400 });
    await request(`/workers/${worker._id}/deployment?at=2026-09-01T08:00:00`, { expected: 400 });
    await request('/deployments?limit=1000', { expected: 400 });
    await request(`/workers/${worker._id}`, { method: 'PATCH', expected: 400, body: { dateOfJoining: '2026-08-01' } });
    await request(`/workers/${worker._id}`, { method: 'PATCH', expected: 400, body: { designation: otherDesignation._id } });
    await request(`/workers/${worker._id}/initial-deployment`, { method: 'POST', expected: 409, body: workerBody.initialDeployment });
    await request(`/deployments/${initial._id}`, { method: 'DELETE', expected: 404 });
    await request(`/deployments/${initial._id}`, { method: 'PATCH', expected: 404, body: { effectiveTo: '2026-09-05' } });
  });

  await t.test('invalid assignments roll back the worker insert and leave counters reserved', async () => {
    const workersBefore = await Worker.countDocuments();
    const deploymentsBefore = await WorkerDeployment.countDocuments();
    const counterBefore = (await WorkerCounter.findById('RGF')).sequence;
    const inactiveLocation = await WorkLocation.findOne({ name: 'Inactive shed' });
    for (const initialDeployment of [
      undefined,
      { workLocation: otherLocation._id },
      { workLocation: String(new mongoose.Types.ObjectId()) },
      { workLocation: String(inactiveLocation._id) },
      { workLocation: initialLocation._id, supervisor: otherWorker._id },
      { workLocation: initialLocation._id, effectiveFrom: '2026-08-01' },
    ]) {
      await request('/workers', { method: 'POST', expected: 400, body: { ...workerBody, fullName: 'Must Roll Back', initialDeployment } });
    }
    assert.equal(await Worker.countDocuments(), workersBefore);
    assert.equal(await WorkerDeployment.countDocuments(), deploymentsBefore);
    assert.ok((await WorkerCounter.findById('RGF')).sequence > counterBefore);
    // A later valid worker receives a fresh ID and has exactly one matching deployment.
    const result = await request('/workers', { method: 'POST', expected: 201, body: { ...workerBody, fullName: 'After Rollback' } });
    assert.equal(await WorkerDeployment.countDocuments({ worker: result.worker._id }), 1);
    assert.equal(result.deployment.worker, result.worker._id);
  });

  await t.test('legacy initial assignment is transactional and concurrent submissions create only one row', async () => {
    const legacy = await Worker.create({ firm: raghav._id, workerCode: 'RGF-LEGACY', fullName: 'Legacy Worker', dateOfJoining: '2026-09-01', designation: designation._id, isSupervisor: true, createdBy: admin._id });
    const path = `/workers/${legacy._id}/initial-deployment`;
    await request(path, { method: 'POST', expected: 400, body: { workLocation: initialLocation._id, supervisor: String(legacy._id) } });
    assert.equal((await Worker.findById(legacy._id)).__v, legacy.__v);
    await Worker.updateOne({ _id: legacy._id }, { $set: { active: false } });
    await request(path, { method: 'POST', expected: 400, body: workerBody.initialDeployment });
    await Worker.updateOne({ _id: legacy._id }, { $set: { active: true } });
    const results = await Promise.all(Array.from({ length: 2 }, () => request(path, { method: 'POST', expected: [201, 409], body: workerBody.initialDeployment })));
    assert.equal(results.filter((result) => result.deployment).length, 1);
    assert.equal(results.filter((result) => result.message).length, 1);
    assert.equal(await WorkerDeployment.countDocuments({ worker: legacy._id }), 1);
    assert.equal((await Worker.findById(legacy._id)).__v, legacy.__v + 1);
    const record = await WorkerDeployment.findOne({ worker: legacy._id });
    record.effectiveTo = new Date('2026-09-05T00:00:00+05:30');
    await record.save();
    await request(path, { method: 'POST', expected: 409, body: workerBody.initialDeployment });
    await request(`/workers/${otherWorker._id}/initial-deployment`, { method: 'POST', expected: 404, body: workerBody.initialDeployment });
  });

  await t.test('supervisor references are validated, inherited explicitly and protected from deactivation', async () => {
    await request(`/work-locations/${initialLocation._id}`, { method: 'PATCH', body: { supervisor: worker._id } });
    const assigned = await request('/workers', { method: 'POST', expected: 201, body: { ...workerBody, fullName: 'Supervised Worker' } });
    assert.equal(assigned.deployment.supervisor, worker._id);
    assert.equal(assigned.deployment.supervisorNameSnapshot, worker.fullName);
    assert.equal((await request(`/deployments?supervisor=${worker._id}`)).pagination.total, 1);
    const explicitNone = await request('/workers', { method: 'POST', expected: 201, body: { ...workerBody, fullName: 'No Supervisor', initialDeployment: { ...workerBody.initialDeployment, supervisor: null } } });
    assert.equal(explicitNone.deployment.supervisor, null);
    await request('/workers', { method: 'POST', expected: 400, body: { ...workerBody, initialDeployment: { ...workerBody.initialDeployment, supervisor: explicitNone.worker._id } } });
    await request(`/work-locations/${initialLocation._id}`, { method: 'PATCH', body: { supervisor: null } });
    await request(`/workers/${worker._id}`, { method: 'PATCH', expected: 400, body: { active: false } });
    await request(`/workers/${worker._id}`, { method: 'PATCH', expected: 400, body: { isSupervisor: false } });
  });

  await t.test('historical intervals use exact boundaries, preserve snapshots and reject overlap', async () => {
    const result = await request('/workers', { method: 'POST', expected: 201, body: { ...workerBody, fullName: 'History Worker' } });
    const first = await WorkerDeployment.findById(result.deployment._id);
    const boundary = new Date('2026-09-08T00:00:00+05:30');
    first.effectiveTo = boundary;
    await first.save();
    const snapshot = first.toObject();
    // Simulate future transfer-stage records to verify this stage's lookup contract.
    const second = await WorkerDeployment.create({ ...snapshot, _id: undefined, __v: undefined, allocationType: 'FARM_TRANSFER',
      firm: sanjana._id, firmNameSnapshot: 'Sanjana', workLocation: otherLocation._id,
      designation: otherDesignation._id, effectiveFrom: boundary, effectiveTo: null,
    });
    await Worker.updateOne({ _id: result.worker._id }, { $set: { firm: sanjana._id, designation: otherDesignation._id } });
    const before = (await request(`/workers/${result.worker._id}/deployment?at=2026-09-07T18:29:59.999Z`, { user: bothAdmin })).deployment;
    const after = (await request(`/workers/${result.worker._id}/deployment?at=2026-09-08`, { user: bothAdmin })).deployment;
    assert.equal(before._id, String(first._id));
    assert.equal(before.active, false);
    assert.equal(after._id, String(second._id));
    assert.equal(after.active, true);
    assert.equal((await request(`/workers/${result.worker._id}/deployment?at=2026-09-08`)).deployment, null);
    const ownHistory = await request(`/workers/${result.worker._id}/deployments`);
    assert.equal(ownHistory.pagination.total, 1);
    assert.ok(ownHistory.items.every((item) => item.firm === String(raghav._id)));
    assert.equal((await request(`/workers/${result.worker._id}/deployments`, { user: bothAdmin })).pagination.total, 2);
    await request(`/work-locations/${initialLocation._id}`, { method: 'PATCH', body: { name: 'Renamed Work Location' } });
    assert.equal((await request(`/workers/${result.worker._id}/deployments`)).items[0].workLocationNameSnapshot, 'Farm General Work');
    await assert.rejects(WorkerDeployment.create({ ...snapshot, _id: undefined, effectiveTo: null, allocationType: 'PERMANENT', effectiveFrom: new Date('2026-10-01') }), { code: 11000 });
    await assert.rejects(WorkerDeployment.create({ ...snapshot, _id: undefined }), { code: 11000 });
    const overlap = await WorkerDeployment.create({ ...snapshot, _id: undefined, allocationType: 'PERMANENT', effectiveFrom: new Date('2026-09-02'), effectiveTo: new Date('2026-09-03') });
    await request(`/workers/${result.worker._id}/deployment?at=2026-09-02T12:00:00Z`, { expected: 409 });
    await WorkerDeployment.deleteOne({ _id: overlap._id });
  });

  await t.test('history paginates deterministically and future initial assignments are not current', async () => {
    const future = await request('/workers', { method: 'POST', expected: 201, body: { ...workerBody, fullName: 'Future Worker', dateOfJoining: '2099-01-01' } });
    assert.equal((await request(`/workers/${future.worker._id}/deployment`)).deployment, null);
    assert.equal((await request(`/workers/${future.worker._id}/deployment?at=2099-01-01`)).deployment._id, future.deployment._id);
    const historyWorker = await Worker.create({ firm: raghav._id, workerCode: 'RGF-HISTORY', fullName: 'Long History', dateOfJoining: '2026-08-01', designation: designation._id, createdBy: admin._id });
    const template = (await WorkerDeployment.findOne({ worker: worker._id })).toObject();
    const start = new Date('2026-08-01T00:00:00+05:30').getTime();
    await WorkerDeployment.insertMany(Array.from({ length: 27 }, (_, i) => ({
      ...template, _id: undefined, worker: historyWorker._id, workerCodeSnapshot: historyWorker.workerCode,
      workerNameSnapshot: historyWorker.fullName, allocationType: i === 0 ? 'INITIAL' : 'PERMANENT',
      effectiveFrom: new Date(start + i * 86400000), effectiveTo: i === 26 ? null : new Date(start + (i + 1) * 86400000),
    })));
    const firstPage = await request(`/workers/${historyWorker._id}/deployments`);
    const secondPage = await request(`/workers/${historyWorker._id}/deployments?page=2`);
    assert.equal(firstPage.pagination.total, 27);
    assert.equal(firstPage.items.length, 25);
    assert.equal(secondPage.items.length, 2);
    assert.equal(new Set([...firstPage.items, ...secondPage.items].map((item) => item._id)).size, 27);
    assert.ok(firstPage.items[0].effectiveFrom > secondPage.items[0].effectiveFrom);
  });
});
