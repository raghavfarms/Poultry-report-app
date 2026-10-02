import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import MedicineMaster from '../src/medicine/models/MedicineMaster.js';
import MedicineCodeCounter from '../src/medicine/models/MedicineCodeCounter.js';
import { fastInward } from '../src/medicine/controllers/dailyAction.controller.js';

function mockSequence(t, highest = 7) {
  t.mock.method(MedicineMaster, 'find', () => ({ select: () => ({ lean: async () => [{ code: `MED-${highest}` }] }) }));
  let sequence = highest;
  return t.mock.method(MedicineCodeCounter, 'findOneAndUpdate', async (filter, update) => {
    assert.equal(filter._id, 'medicine');
    assert.equal(update[0].$set.sequence.$add[0].$max[1], highest);
    return { sequence: ++sequence };
  });
}

function medicine(fields = {}) {
  return new MedicineMaster({
    name: 'Savlon', category: 'General', unit: 'Bottle',
    createdBy: new mongoose.Types.ObjectId(), ...fields,
  });
}

test('quick stock-in medicines get sequential codes when omitted, null or blank', async (t) => {
  mockSequence(t);
  const medicines = [{}, { code: null }, { code: '' }, { code: '   ' }].map(medicine);
  await Promise.all(medicines.map((item) => item.validate()));
  assert.equal(new Set(medicines.map((item) => item.code)).size, medicines.length);
  for (const item of medicines) {
    assert.match(item.code, /^MED-\d{3,}$/);
    assert.ok(item.code.length <= 30);
  }
  assert.deepEqual(medicines.map((item) => item.code), ['MED-008', 'MED-009', 'MED-010', 'MED-011']);
});

test('automatic code stays stable when validated again', async (t) => {
  const allocate = mockSequence(t);
  const item = medicine();
  await item.validate();
  const original = item.code;
  await item.validate();
  assert.equal(item.code, original);
  assert.equal(allocate.mock.callCount(), 1);
});

test('existing and manually assigned medicine codes are preserved', async () => {
  for (const code of ['MED-001', 'MED-999', 'SAVLON-01']) {
    const item = medicine({ code });
    await item.validate();
    assert.equal(item.code, code);
  }
});

test('new stock-in medicine requires category and unit before creation', async (t) => {
  t.mock.method(console, 'error', () => {});
  t.mock.method(MedicineMaster, 'findOne', async () => null);
  const create = t.mock.method(MedicineMaster, 'create', () => assert.fail('Must not create medicine'));
  for (const fields of [{}, { newMedicineCategory: 'Vaccine' }, { newMedicineUnit: 'Vial' }]) {
    const res = { status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
    await fastInward({ body: { newMedicineName: 'New medicine', batchNumber: 'B1', expiryDate: '2027-01-01', quantity: 2, ...fields } }, res);
    assert.equal(res.code, 400);
    assert.match(res.data.message, /category and unit/);
  }
  assert.equal(create.mock.callCount(), 0);
});
