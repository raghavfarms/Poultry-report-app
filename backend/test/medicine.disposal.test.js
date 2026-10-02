import test from 'node:test';
import assert from 'node:assert/strict';
import MedicineBatch from '../src/medicine/models/MedicineBatch.js';
import { disposeBatch } from '../src/medicine/controllers/disposal.controller.js';
import { getBatchTraceability } from '../src/medicine/controllers/report.controller.js';
import MedicineIssue from '../src/medicine/models/MedicineIssue.js';
import MedicineTransaction from '../src/medicine/models/MedicineTransaction.js';
import MedicineReceipt from '../src/medicine/models/MedicineReceipt.js';

const id = '507f1f77bcf86cd799439011';
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } });

test('disposal atomically removes remaining stock and preserves who disposed it', async (t) => {
  t.mock.method(MedicineBatch, 'findById', async () => ({ _id: id, quantityAvailable: 100 }));
  const update = t.mock.method(MedicineBatch, 'findOneAndUpdate', async () => ({ _id: id }));
  const res = response();
  await disposeBatch({ params: { id }, user: { _id: id, name: 'Admin' } }, res, assert.fail);
  assert.equal(res.code, 200);
  const [filter, changes] = update.mock.calls[0].arguments;
  assert.equal(filter.quantityAvailable, 100);
  assert.equal(changes.$set.quantityAvailable, 0);
  assert.equal(changes.$inc.disposedQuantity, 100);
  assert.equal(changes.$push.disposals.performedByName, 'Admin');
  assert.equal(changes.$push.disposals.quantity, 100);
});

test('empty batch cannot be disposed again', async (t) => {
  t.mock.method(MedicineBatch, 'findById', async () => ({ _id: id, quantityAvailable: 0 }));
  const res = response();
  await disposeBatch({ params: { id }, user: { _id: id } }, res, assert.fail);
  assert.equal(res.code, 409);
});  //  console.log()

test('a concurrent stock change prevents disposal of an outdated quantity', async (t) => {
  t.mock.method(MedicineBatch, 'findById', async () => ({ _id: id, quantityAvailable: 5 }));
  t.mock.method(MedicineBatch, 'findOneAndUpdate', async () => null);
  const res = response();
  await disposeBatch({ params: { id }, user: { _id: id } }, res, assert.fail);
  assert.equal(res.code, 409);
});   
     
test('trace reconciliation never restores disposed stock', async (t) => {
  const query = (value) => ({ populate() { return this; }, sort() { return this; }, lean: async () => value });
  t.mock.method(MedicineReceipt, 'find', () => query([]));
  t.mock.method(MedicineBatch, 'findOne', () => query({ _id: id, initialQuantity: 108, disposedQuantity: 100, quantityAvailable: 0 }));
  t.mock.method(MedicineIssue, 'find', () => query([{ issuedQuantity: 8 }]));
  t.mock.method(MedicineTransaction, 'find', () => query([]));
  const update = t.mock.method(MedicineBatch, 'updateOne', () => assert.fail('Disposed stock must not return'));
  const res = response();
  await getBatchTraceability({ params: { batchNumber: '232' } }, res);
  assert.equal(res.data.batch.quantityAvailable, 0);
  assert.equal(update.mock.callCount(), 0);
});



