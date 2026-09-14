import test from 'node:test';
import assert from 'node:assert/strict';
import Firm from '../src/models/Firm.js';
import { requireRegisteredWorker } from '../src/attendance/services/registeredUser.service.js';
import User from '../src/models/User.js';
import Worker from '../src/attendance/models/Worker.js';
import { createWorker } from '../src/attendance/services/masters.service.js';
import { resolveWorkerForUser } from '../src/attendance/services/workerAuth.service.js';
const id = '111111111111111111111111';
test('attendance requires a valid full name when user ID is omitted', async (t) => {
  t.mock.method(Firm, 'findOne', () => ({ lean: async () => ({ _id: id }) }));
  await assert.rejects(createWorker({ role: 'developer' }, { firmId: id }), /Full name is required/);
});
test('attendance rejects missing accounts and duplicate linked workers', async (t) => {
  t.mock.method(Firm, 'findOne', () => ({ lean: async () => ({ _id: id }) }));
  const find = t.mock.method(User, 'findOne', () => ({ lean: async () => null }));
  await assert.rejects(createWorker({ role: 'developer' }, { firmId: id, userId: id }), /already registered/);
  find.mock.mockImplementation(() => ({ lean: async () => ({ name: 'Ramesh', firms: [id] }) }));
  t.mock.method(Worker, 'exists', async () => ({ _id: id }));
  await assert.rejects(createWorker({ role: 'developer' }, { firmId: id, userId: id }), /already has/);
});
test('opening attendance uses only explicit account links without provisioning', async (t) => {
  const query = { populate() { return this; }, lean: async () => null };
  t.mock.method(Worker, 'findOne', filter => { assert.deepEqual(filter, { userId: id }); return query; });
  const create = t.mock.method(Worker, 'create', () => { throw new Error('Must not create'); });
  assert.equal(await resolveWorkerForUser({ _id: id, name: 'Ramesh', firms: [id] }), null);
  assert.equal(create.mock.callCount(), 0);
});

test('inactive-account workers cannot use attendance, while unlinked workers are permitted', async (t) => {
  await requireRegisteredWorker({}); // unlinked worker allowed
  const exists = t.mock.method(User, 'exists', filter => {
    assert.deepEqual(filter, { _id: id, active: true, 'firms.0': { $exists: true } });
    return { session: async () => null };
  });
  await assert.rejects(requireRegisteredWorker({ userId: id }), /inactive or unavailable/);
  exists.mock.mockImplementation(() => ({ session: async () => ({ _id: id }) }));
  await requireRegisteredWorker({ userId: id });
});
