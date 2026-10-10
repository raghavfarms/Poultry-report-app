import test from 'node:test';
import assert from 'node:assert/strict';
import { validateInwardExpiry } from '../src/medicine/services/inwardExpiry.js';
import { fastInward } from '../src/medicine/controllers/dailyAction.controller.js';
import MedicineMaster from '../src/medicine/models/MedicineMaster.js';

test('rejects today and earlier, accepts tomorrow using Indian business date', () => {
  const now = new Date('2026-10-01T19:00:00Z'); // October 2 in India
  for (const date of ['2026-10-01', '2026-10-02', '2026-09-30']) {
    assert.throws(() => validateInwardExpiry(date, now), { status: 400 });
  }
  assert.doesNotThrow(() => validateInwardExpiry('2026-10-03', now));
});

test('rejects malformed dates and impossible calendar dates', () => {
  for (const date of ['', null, {}, 'invalid', '2027-02-30', '2027-13-01']) {
    assert.throws(() => validateInwardExpiry(date), { status: 400 });
  }
});

test('invalid expiry is rejected before any medicine lookup or creation', async (t) => {
  t.mock.method(console, 'error', () => {});
  const lookup = t.mock.method(MedicineMaster, 'findById', () => assert.fail('Must validate before database access'));
  const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await fastInward({ body: { medicineId: 'medicine', batchNumber: 'B1', expiryDate: '2000-01-01', quantity: 10 } }, res);
  assert.equal(res.code, 400);
  assert.equal(lookup.mock.callCount(), 0);
});
