import test from 'node:test';
import assert from 'node:assert/strict';
import User from '../src/models/User.js';
import Worker from '../src/attendance/models/Worker.js';
import WorkerFaceProfile from '../src/attendance/models/WorkerFaceProfile.js';
import { enrolWorkerFace } from '../src/attendance/services/face.service.js';
const id = '111111111111111111111111';
const admin = { role: 'admin', firms: [id] };
test('face enrolment accepts an unlinked worker without requiring a user account', async (t) => {
  const worker = { _id: id, firm: id, active: true, save: async () => {} };
  t.mock.method(Worker, 'findById', async () => worker);
  t.mock.method(WorkerFaceProfile, 'findOneAndUpdate', async () => ({ _id: id }));
  await enrolWorkerFace(admin, id, { descriptor: Array(128).fill(0.1) });
  assert.equal(worker.faceStatus, 'REGISTERED');
});

test('face enrolment refuses a worker whose linked account is inactive or missing', async (t) => {
  t.mock.method(Worker, 'findById', async () => ({ _id: id, firm: id, userId: id, active: true }));
  t.mock.method(User, 'exists', () => ({ session: async () => null }));
  const save = t.mock.method(WorkerFaceProfile, 'findOneAndUpdate', () => { throw new Error('Must not store face'); });
  await assert.rejects(enrolWorkerFace(admin, id, { descriptor: Array(128).fill(0.1) }), /inactive or unavailable/);
  assert.equal(save.mock.callCount(), 0);
});

test('face enrolment accepts a worker explicitly linked to a registered account', async (t) => {
  const worker = { _id: id, firm: id, userId: id, active: true, save: async () => {} };
  t.mock.method(Worker, 'findById', async () => worker);
  t.mock.method(User, 'exists', () => ({ session: async () => ({ _id: id }) }));
  t.mock.method(WorkerFaceProfile, 'findOneAndUpdate', async () => ({ _id: id }));
  await enrolWorkerFace(admin, id, { descriptor: Array(128).fill(0.1) });
  assert.equal(worker.faceStatus, 'REGISTERED');
});
