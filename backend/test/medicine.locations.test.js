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

test('rejects blank, invalid, reserved names', async (t) => {
  for (const name of ['', '   ', {}, 'a'.repeat(121), 'Other', 'Other...']) {
    const res = response();
    await createLocation({ body: { name } }, res, assert.fail);
    assert.equal(res.statusCode, 400);
  }
});

test('saves normalized location names and handles duplicates', async (t) => {
  t.mock.method(MedicineLocation, 'findOne', async () => null);
  const create = t.mock.method(MedicineLocation, 'create', async (data) => data);
  const res = response();
  await createLocation({ body: { name: '  North   House  ' } }, res, assert.fail);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.location, 'North House');
  assert.deepEqual(create.mock.calls[0].arguments[0], { name: 'North House', nameKey: 'north house', removed: false });

  // Test duplicate check
  t.mock.method(MedicineLocation, 'findOne', async () => ({ removed: false, name: 'North House' }));
  const duplicate = response();
  await createLocation({ body: { name: 'north house' } }, duplicate, assert.fail);
  assert.equal(duplicate.statusCode, 409);
  t.mock.restoreAll();
});

test('removed locations stay hidden on reload', async (t) => {
  t.mock.method(MedicineLocation, 'find', () => ({ sort: () => ({ lean: async () => [
    { name: 'Shed 2', nameKey: 'shed 2' },
  ] }) }));
  const res = response();
  await getLocations({}, res, assert.fail);
  assert.equal(res.body.locations.includes('Shed 1'), false);
  assert.ok(res.body.locations.includes('Shed 2'));
  t.mock.restoreAll();
});

test('removing locations marks them removed', async (t) => {
  const update = t.mock.method(MedicineLocation, 'findOneAndUpdate', async () => ({ removed: true }));
  const res = response();
  await removeLocation({ body: { name: 'Shed 1' } }, res, assert.fail);
  assert.equal(res.statusCode, 200);
  const args = update.mock.calls.at(-1).arguments;
  assert.deepEqual(args[0], { nameKey: 'shed 1' });
  assert.equal(args[1].$set.removed, true);
  t.mock.restoreAll();
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
  t.mock.restoreAll();
});

test('administrators can re-add a removed location', async (t) => {
  const mockDoc = { name: 'Shed 1', removed: true, save: async () => {} };
  t.mock.method(MedicineLocation, 'findOne', async () => mockDoc);
  const res = response();
  await createLocation({ body: { name: 'Shed 1' } }, res, assert.fail);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.location, 'Shed 1');
  assert.equal(mockDoc.removed, false);
  t.mock.restoreAll();
});

test('returns saved locations for the farm with no automatic defaults', async (t) => {
  t.mock.method(MedicineLocation, 'find', () => ({ sort: () => ({ lean: async () => [{ name: 'North House', nameKey: 'north house' }] }) }));
  const res = response();
  await getLocations({}, res, assert.fail);
  assert.equal(res.body.locations.length, 1);
  assert.ok(res.body.locations.includes('North House'));
  t.mock.restoreAll();
});

test('locations are completely independent between different farms', async (t) => {
  const raghavId = '507f1f77bcf86cd799439011';
  const sanjanaId = '507f1f77bcf86cd799439012';

  // 1. Create on Raghav passes raghav farm ID
  t.mock.method(MedicineLocation, 'findOne', async () => null);
  const createMock = t.mock.method(MedicineLocation, 'create', async (data) => data);
  const resRaghav = response();
  await createLocation({ body: { name: 'Raghav Special Shed', farm: raghavId } }, resRaghav, assert.fail);
  assert.equal(resRaghav.statusCode, 201);
  assert.equal(createMock.mock.calls[0].arguments[0].name, 'Raghav Special Shed');
  assert.equal(createMock.mock.calls[0].arguments[0].farm.toString(), raghavId);

  // 2. Querying Sanjana queries with sanjana farm ID and does not see Raghav's sheds
  t.mock.method(MedicineLocation, 'find', (query) => {
    assert.equal(query.farm.toString(), sanjanaId);
    return { sort: () => ({ lean: async () => [{ name: 'Sanjana Shed 1' }] }) };
  });
  const resSanjana = response();
  await getLocations({ query: { farm: sanjanaId } }, resSanjana, assert.fail);
  assert.equal(resSanjana.statusCode, 200);
  assert.ok(!resSanjana.body.locations.includes('Raghav Special Shed'));
  assert.ok(resSanjana.body.locations.includes('Sanjana Shed 1'));

  // 3. Removing a location on Sanjana only targets Sanjana's farm filter
  const updateMock = t.mock.method(MedicineLocation, 'findOneAndUpdate', async () => ({ removed: true }));
  const resRemove = response();
  await removeLocation({ body: { name: 'Sanjana Shed 1', farm: sanjanaId } }, resRemove, assert.fail);
  assert.equal(resRemove.statusCode, 200);
  const updateArgs = updateMock.mock.calls.at(-1).arguments;
  assert.equal(updateArgs[0].nameKey, 'sanjana shed 1');
  assert.equal(updateArgs[0].farm.toString(), sanjanaId);
  assert.equal(updateArgs[1].$set.removed, true);

  t.mock.restoreAll();
});

test('when all farms are selected, returns unique locations from all farms without repeating common locations', async (t) => {
  const raghavId = '507f1f77bcf86cd799439011';
  const sanjanaId = '507f1f77bcf86cd799439012';

  // Suppose Raghav has Shed 1, Shed 2, Brooder
  // Sanjana has Shed 1, Shed 3, Layer Shed (Shed 1 is common)
  t.mock.method(MedicineLocation, 'find', (query) => {
    // query should not restrict to a single farm when all farms are selected
    assert.equal(query.farm, undefined);
    assert.equal(query.removed, false);
    return {
      sort: () => ({
        lean: async () => [
          { name: 'Shed 1', farm: raghavId },
          { name: 'Shed 2', farm: raghavId },
          { name: 'Brooder', farm: raghavId },
          { name: 'Shed 1', farm: sanjanaId },
          { name: 'Shed 3', farm: sanjanaId },
          { name: 'Layer Shed', farm: sanjanaId },
        ],
      }),
    };
  });

  const res = response();
  // Call with no farm query (meaning "All Farms")
  await getLocations({ query: {} }, res, assert.fail);
  assert.equal(res.statusCode, 200);

  // Common location 'Shed 1' should appear exactly once!
  const occurrences = res.body.locations.filter((loc) => loc.toLowerCase() === 'shed 1').length;
  assert.equal(occurrences, 1, 'Common location Shed 1 must not repeat');

  // All unique locations across Raghav & Sanjana must be present
  assert.ok(res.body.locations.includes('Shed 1'));
  assert.ok(res.body.locations.includes('Shed 2'));
  assert.ok(res.body.locations.includes('Shed 3'));
  assert.ok(res.body.locations.includes('Brooder'));
  assert.ok(res.body.locations.includes('Layer Shed'));
  assert.equal(res.body.locations.length, 5);

  t.mock.restoreAll();
});


