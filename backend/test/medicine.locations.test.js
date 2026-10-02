import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocation, getLocations, removeLocation } from '../src/medicine/controllers/location.controller.js';
import MedicineLocation from '../src/medicine/models/MedicineLocation.js';
import { adminOnly } from '../src/middleware/auth.js';

function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test('only administrators can save shared locations', () => {
  for (const role of ['worker', 'supervisor', 'office', 'farm_incharge']) {
    const res = response();
    adminOnly({ user: { role } }, res, () => assert.fail('Unexpected access'));
    assert.equal(res.statusCode, 403);
  }
  for (const role of ['admin', 'developer']) {
    let allowed = false;
    adminOnly({ user: { role } }, response(), () => { allowed = true; });
    assert.equal(allowed, true);
  }
});

test('rejects blank, invalid, reserved and existing default names', async (t) => {
  t.mock.method(MedicineLocation, 'findOneAndUpdate', async () => null);
  for (const name of ['', '   ', {}, 'a'.repeat(121), 'Other', 'Other...']) {
    const res = response();
    await createLocation({ body: { name } }, res, assert.fail);
    assert.equal(res.statusCode, 400);
  }
  const res = response();
  await createLocation({ body: { name: ' SHED   1 ' } }, res, assert.fail);
  assert.equal(res.statusCode, 409);
});

test('saves normalized location names and handles duplicates', async (t) => {
  t.mock.method(MedicineLocation, 'findOneAndUpdate', async () => null);
  const create = t.mock.method(MedicineLocation, 'create', async (data) => data);
  const res = response();
  await createLocation({ body: { name: '  North   House  ' } }, res, assert.fail);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.location, 'North House');
  assert.deepEqual(create.mock.calls[0].arguments[0], { name: 'North House', nameKey: 'north house' });
  create.mock.mockImplementation(async () => { throw { code: 11000 }; });
  const duplicate = response();
  await createLocation({ body: { name: 'north house' } }, duplicate, assert.fail);
  assert.equal(duplicate.statusCode, 409);
  t.mock.restoreAll();
});

test('removed defaults and saved locations stay hidden on reload', async (t) => {
  t.mock.method(MedicineLocation, 'find', () => ({ sort: () => ({ lean: async () => [
    { name: 'Shed 1', nameKey: 'shed 1', removed: true },
    { name: 'North House', nameKey: 'north house', removed: true },
  ] }) }));
  const res = response();
  await getLocations({}, res, assert.fail);
  assert.equal(res.body.locations.includes('Shed 1'), false);
  assert.equal(res.body.locations.includes('North House'), false);
  assert.ok(res.body.locations.includes('Shed 2'));
});

test('removing default and saved locations persists their removal', async (t) => {
  const update = t.mock.method(MedicineLocation, 'findOneAndUpdate', async () => ({ removed: true }));
  for (const name of ['Shed 1', 'North House']) {
    const res = response();
    await removeLocation({ body: { name } }, res, assert.fail);
    assert.equal(res.statusCode, 200);
    const args = update.mock.calls.at(-1).arguments;
    assert.deepEqual(args[0], { nameKey: name.toLowerCase() });
    assert.equal(args[1].$set.removed, true);
    assert.equal(args[2].upsert, name === 'Shed 1');
  }
});

test('Other cannot be removed and unknown locations return not found', async (t) => {
  for (const name of ['Other', 'Other...', '', {}]) {
    const res = response();
    await removeLocation({ body: { name } }, res, assert.fail);
    assert.equal(res.statusCode, 400);
  }
  t.mock.method(MedicineLocation, 'findOneAndUpdate', async () => null);
  const res = response();
  await removeLocation({ body: { name: 'Missing' } }, res, assert.fail);
  assert.equal(res.statusCode, 404);
});

test('administrators can add a removed default location again', async (t) => {
  t.mock.method(MedicineLocation, 'findOneAndUpdate', async () => ({ name: 'Shed 1' }));
  const res = response();
  await createLocation({ body: { name: 'Shed 1' } }, res, assert.fail);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.location, 'Shed 1');
});

test('returns saved locations together with existing sheds', async (t) => {
  t.mock.method(MedicineLocation, 'find', () => ({ sort: () => ({ lean: async () => [{ name: 'North House', nameKey: 'north house' }] }) }));
  const res = response();
  await getLocations({}, res, assert.fail);
  assert.ok(res.body.locations.includes('Shed 1'));
  assert.ok(res.body.locations.includes('North House'));
  assert.equal(res.body.locations.length, 8);
  t.mock.restoreAll();
});
