import test from 'node:test';
import assert from 'node:assert/strict';
import { fastOutward, getTodayActivity } from '../src/medicine/controllers/dailyAction.controller.js';
import MedicineMaster from '../src/medicine/models/MedicineMaster.js';
import MedicineBatch from '../src/medicine/models/MedicineBatch.js';
import MedicineIssue from '../src/medicine/models/MedicineIssue.js';
import MedicineReceipt from '../src/medicine/models/MedicineReceipt.js';
import MedicineTransaction from '../src/medicine/models/MedicineTransaction.js';
import Firm from '../src/models/Firm.js';
import { createIssue } from '../src/medicine/controllers/issue.controller.js';

const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

test('receiver is required before any stock lookup or change', async (t) => {
  t.mock.method(console, 'error', () => {});
  const lookup = t.mock.method(MedicineMaster, 'findById', () => assert.fail('Must validate first'));
  for (const issuedTo of [undefined, '', '   ', {}, 'x'.repeat(121)]) {
    const res = response();
    await fastOutward({ body: { issuedTo }, user: { _id: 'issuer' } }, res);
    assert.equal(res.statusCode, 400);
  }
  assert.equal(lookup.mock.callCount(), 0);
});

test('receiver and authenticated issuer are recorded for every FEFO deduction', async (t) => {
  t.mock.method(MedicineMaster, 'findById', async () => ({ _id: 'med', name: 'Medicine', unit: 'Bottle' }));
  const batches = [1, 2].map((n) => ({ _id: `batch${n}`, batchNumber: `B${n}`, farm: { _id: 'farm' }, initialQuantity: 2, quantityAvailable: 2, save: async () => {} }));
  t.mock.method(MedicineBatch, 'find', (filter) => {
    assert.equal(filter.status, 'AVAILABLE');
    assert.equal(filter.expiryDate.$gte, new Date().toISOString().slice(0, 10));
    return { populate: () => ({ sort: async () => batches }) };
  });
  t.mock.method(MedicineIssue, 'find', () => ({ select: () => ({ lean: async () => [] }) }));
  t.mock.method(MedicineIssue, 'findOne', () => ({ sort: () => ({ lean: async () => null }) }));
  const issues = t.mock.method(MedicineIssue, 'create', async (data) => ({ ...data, _id: 'issue' }));
  const transactions = t.mock.method(MedicineTransaction, 'create', async (data) => data);
  const res = response();
  await fastOutward({ user: { _id: 'issuer', name: 'Storekeeper' }, body: {
    medicineId: 'med', shedName: 'Shed 1', farmId: 'farm', quantity: 3, issuedTo: '  Ramesh  ', issuedBy: 'forged',
  } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(issues.mock.callCount(), 2);
  for (const call of issues.mock.calls) {
    assert.equal(call.arguments[0].issuedTo, 'Ramesh');
    assert.equal(call.arguments[0].issuedBy, 'issuer');
    assert.equal(call.arguments[0].issuedByName, 'Storekeeper');
  }
  assert.match(transactions.mock.calls[0].arguments[0].remarks, /Ramesh/);
  assert.deepEqual(batches.map((batch) => batch.quantityAvailable), [0, 1]);
});

test('activity includes receiver, issuer and saved location', async (t) => {
  const query = (rows) => ({ populate() { return this; }, sort() { return this; }, lean: async () => rows });
  t.mock.method(MedicineReceipt, 'find', () => query([]));
  t.mock.method(MedicineIssue, 'find', () => query([{ _id: 'issue', issuedTo: 'Ramesh', issuedByName: 'Storekeeper', shed: 'North Shed', createdAt: new Date() }]));
  const res = response();
  await getTodayActivity({}, res);
  assert.equal(res.body.events[0].receiver, 'Ramesh');
  assert.equal(res.body.events[0].operator, 'Storekeeper');
  assert.equal(res.body.events[0].target, 'North Shed');
});

test('expired 100 bottles cannot satisfy an issue when only 8 bottles are usable', async (t) => {
  t.mock.method(console, 'error', () => {});
  t.mock.method(MedicineMaster, 'findById', async () => ({ _id: 'med', name: 'paracetamol', unit: 'Bottle' }));
  const batches = [
    { _id: 'expired', expiryDate: '2000-01-01', status: 'AVAILABLE', initialQuantity: 100, quantityAvailable: 100 },
    { _id: 'valid', expiryDate: '2099-01-01', status: 'AVAILABLE', initialQuantity: 8, quantityAvailable: 8 },
    { _id: 'blocked', expiryDate: '2099-01-01', status: 'EXPIRED', initialQuantity: 50, quantityAvailable: 50 },
  ];
  t.mock.method(MedicineBatch, 'find', (filter) => ({ populate: () => ({ sort: async () => batches.filter((batch) => batch.status === filter.status && batch.expiryDate >= filter.expiryDate.$gte) }) }));
  t.mock.method(MedicineIssue, 'find', () => ({ select: () => ({ lean: async () => [] }) }));
  const create = t.mock.method(MedicineIssue, 'create', () => assert.fail('No issue should be saved'));
  const res = response();
  await fastOutward({ user: { _id: 'issuer' }, body: { medicineId: 'med', farmId: 'farm', shedName: 'Shed 1', quantity: 9, issuedTo: 'Ramesh' } }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /Available: 8 Bottle/);
  assert.equal(create.mock.callCount(), 0);
  assert.equal(batches[0].quantityAvailable, 100);
});

test('direct issue endpoint rejects an expired batch before decrementing stock', async (t) => {
  t.mock.method(console, 'error', () => {});
  t.mock.method(MedicineMaster, 'findById', async () => ({ _id: 'med', active: true }));
  t.mock.method(Firm, 'findById', async () => ({ _id: 'farm', active: true }));
  t.mock.method(MedicineBatch, 'findById', async () => ({ _id: 'batch', medicine: 'med', farm: 'farm', batchNumber: '232', status: 'AVAILABLE', expiryDate: '2000-01-01' }));
  const decrement = t.mock.method(MedicineBatch, 'findOneAndUpdate', () => assert.fail('Must not deduct expired stock'));
  const res = response();
  await createIssue({ user: { _id: 'issuer' }, body: { medicineId: 'med', batchId: 'batch', farmId: 'farm', shed: 'Shed 1', issuedQuantity: 1, issuedTo: 'Ramesh' } }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /Cannot issue expired medicine/);
  assert.equal(decrement.mock.callCount(), 0);
});
