import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import MedicineReceipt from '../src/medicine/models/MedicineReceipt.js';
import MedicineMaster from '../src/medicine/models/MedicineMaster.js';
import MedicineBatch from '../src/medicine/models/MedicineBatch.js';
import { fastInward } from '../src/medicine/controllers/dailyAction.controller.js';

const id = new mongoose.Types.ObjectId();
function receipt(fields = {}) {
  return new MedicineReceipt({ receiptNumber: 'RCP-2026-0001', medicine: id, farm: id, batchNumber: '001', expiryDate: '2099-11-12', receivedQuantity: 500, unit: 'Bottle', receivedBy: id, ...fields });
}

test('direct purchase accepts no supplier and still accepts a selected supplier', async () => {
  for (const supplier of [undefined, null, id]) {
    const document = receipt({ supplier });
    await document.validate();
    assert.equal(document.supplier?.toString() || null, supplier?.toString() || null);
  }
});

test('receipt validation happens before batch stock is changed', async (t) => {
  t.mock.method(console, 'error', () => {});
  t.mock.method(MedicineMaster, 'findById', async () => ({ _id: id, name: 'Savlon', unit: 'Bottle' }));
  t.mock.method(MedicineReceipt, 'findOne', () => ({ sort: () => ({ lean: async () => null }) }));
  const batchLookup = t.mock.method(MedicineBatch, 'findOne', () => assert.fail('Stock must remain untouched'));
  const res = { status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
  await fastInward({ user: { _id: id }, body: { medicineId: id, farmId: id, supplierId: 'invalid-id', batchNumber: '001', expiryDate: '2099-11-12', quantity: 500 } }, res);
  assert.equal(res.data.success, false);
  assert.equal(batchLookup.mock.callCount(), 0);
});

test('inward receiver defaults to account name and manual edits preserve recorder identity', async (t) => {
  t.mock.method(console, 'error', () => {});
  t.mock.method(MedicineMaster, 'findById', async () => ({ _id: id, name: 'Savlon', unit: 'Bottle' }));
  t.mock.method(MedicineReceipt, 'findOne', () => ({ sort: () => ({ lean: async () => null }) }));
  const captured = [];
  t.mock.method(MedicineReceipt.prototype, 'validate', async function () {
    captured.push({ receiver: this.receiverName, recorder: this.recordedByName, user: this.receivedBy.toString() });
    throw new Error('Stop before stock mutation');
  });
  for (const receiverName of [undefined, '  Ramesh  ']) {
    const res = { status() { return this; }, json() { return this; } };
    await fastInward({ user: { _id: id, name: 'Ishant' }, body: {
      medicineId: id, farmId: id, batchNumber: '001', expiryDate: '2099-11-12', quantity: 500, receiverName,
    } }, res);
  }
  assert.deepEqual(captured, [
    { receiver: 'Ishant', recorder: 'Ishant', user: id.toString() },
    { receiver: 'Ramesh', recorder: 'Ishant', user: id.toString() },
  ]);
});
