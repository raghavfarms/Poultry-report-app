import test from 'node:test';
import assert from 'node:assert/strict';
import { firmScope } from '../src/attendance/authorization.js';
import { masterPayload, workerPayload, pagination, searchFilter, validateWorkerDates } from '../src/attendance/validation.js';
import { publicWorker, workerCodePrefix, locationWithCapacity } from '../src/attendance/services/masters.service.js';
import Worker from '../src/attendance/models/Worker.js';

const firm = '111111111111111111111111';
const otherFirm = '222222222222222222222222';
const base = { firmId: firm, fullName: 'Raj Kumar', dateOfJoining: '2026-09-01', designation: otherFirm };

test('shed capacity requires both nonnegative integer counts and derives the total', () => {
  const data = masterPayload('work-locations', { birdCapacity: { male: 500, female: 5000 } });
  assert.deepEqual(locationWithCapacity(data).birdCapacity, { male: 500, female: 5000, total: 5500 });
  assert.equal(locationWithCapacity({}).birdCapacity, null);
  assert.equal(masterPayload('work-locations', { birdCapacity: null }).birdCapacity, null);
  for (const birdCapacity of [{ male: -1, female: 5 }, { male: 1.5, female: 5 }, { male: '5', female: 5 }, { male: 5 }, { male: 1, female: 2, total: 99 }, { male: 1, female: 1000000001 }]) {
    assert.throws(() => masterPayload('work-locations', { birdCapacity }), { status: 400 });
  }
});

test('attendance admin is restricted to assigned firms, including unfiltered lists', () => {
  const admin = { role: 'admin', firms: [firm] };
  assert.equal(String(firmScope(admin, firm).firm), firm);
  assert.deepEqual(firmScope(admin).firm.$in.map(String), [firm]);
  assert.throws(() => firmScope(admin, otherFirm), { status: 403 });
  assert.deepEqual(firmScope({ role: 'admin', firms: [] }).firm.$in, []);
  assert.deepEqual(firmScope({ role: 'developer' }), {});
  assert.throws(() => firmScope(admin, { $ne: null }), { status: 400 });
});

test('master names normalize duplicates and firm ownership cannot be patched', () => {
  const data = masterPayload('designations', { firmId: firm, name: '  Farm   Worker  ' }, true);
  assert.equal(data.name, 'Farm Worker');
  assert.equal(data.nameKey, 'farm worker');
  assert.throws(() => masterPayload('designations', { firmId: otherFirm }), { status: 400 });
  assert.throws(() => masterPayload('designations', { active: 'false' }), { status: 400 });
  assert.throws(() => masterPayload('work-locations', { firmId: firm, name: 'Shed', type: 'INVALID' }, true), { status: 400 });
  assert.throws(() => masterPayload('work-locations', { order: -1 }), { status: 400 });
});

test('worker validates calendar dates and rejects system-controlled field changes', () => {
  assert.equal(workerPayload(base, true).fullName, 'Raj Kumar');
  assert.throws(() => workerPayload({ ...base, dateOfJoining: '2026-02-30' }, true), { status: 400 });
  for (const key of ['firmId', 'workerCode', 'createdBy', 'faceStatus', '$set']) {
    assert.throws(() => workerPayload({ [key]: 'changed' }), { status: 400 });
  }
  assert.throws(() => validateWorkerDates({ active: false, dateOfJoining: '2026-09-02', leavingDate: '2026-09-01' }), { status: 400 });
  assert.throws(() => validateWorkerDates({ active: true, dateOfJoining: '2026-09-01', leavingDate: '2026-09-02' }), { status: 400 });
});

test('photographs reject embedded images and unsafe URL schemes', () => {
  for (const photographUrl of ['data:image/png;base64,abc', 'javascript:alert(1)', 'http://example.com/photo.jpg', 'https://user:password@example.com/photo']) {
    assert.throws(() => workerPayload({ photographUrl }), { status: 400 });
  }
  assert.equal(workerPayload({ photographUrl: 'https://example.com/photo.jpg' }).photographUrl, 'https://example.com/photo.jpg');
});

test('personal details are validated and excluded from normal worker responses', () => {
  assert.throws(() => workerPayload({ aadhaarNumber: '123' }), { status: 400 });
  assert.throws(() => workerPayload({ bankDetails: { accountNumber: 'abc', ifsc: 'bad' } }), { status: 400 });
  const data = workerPayload({ bankDetails: { accountNumber: '001234567890', ifsc: 'abcd0123456' } });
  assert.equal(data.bankDetails.accountNumber, '001234567890');
  assert.equal(data.bankDetails.ifsc, 'ABCD0123456');
  assert.deepEqual(publicWorker({ fullName: 'Raj', aadhaarNumber: '234567890123', bankDetails: data.bankDetails }), { fullName: 'Raj' });
  assert.equal(Worker.schema.path('aadhaarNumber').options.select, false);
  assert.equal(Worker.schema.path('bankDetails').options.select, false);
});

test('pagination bounds and literal search prevent unbounded requests and regex injection', () => {
  assert.deepEqual(pagination({}), { page: 1, limit: 25, skip: 0 });
  assert.deepEqual(pagination({ page: '3', limit: '50' }), { page: 3, limit: 50, skip: 100 });
  for (const query of [{ page: '0' }, { limit: '10000' }, { page: '1.5' }, { page: ['1'] }]) {
    assert.throws(() => pagination(query), { status: 400 });
  }
  const pattern = searchFilter({ search: 'Raj.*(1)' }, ['fullName']).$or[0].fullName.$regex;
  assert.ok(new RegExp(pattern).test('Raj.*(1)'));
  assert.equal(new RegExp(pattern).test('Raj Kumar 1'), false);
  assert.throws(() => searchFilter({ search: { $ne: '' } }, ['fullName']), { status: 400 });
});

test('worker codes have firm-specific prefixes and a unique database index', () => {
  assert.equal(workerCodePrefix('RAGHAV'), 'RGF');
  assert.equal(workerCodePrefix('SANJANA'), 'SJF');
  assert.equal(workerCodePrefix('OFFICE'), 'OFC');
  assert.throws(() => workerCodePrefix('OTHER'), { status: 400 });
  assert.ok(Worker.schema.indexes().some(([keys, options]) => keys.workerCode === 1 && options.unique));
});

test('photoMime validates file types, magic bytes and size bounds', async () => {
  const { photoMime } = await import('../src/attendance/services/photo.service.js');
  assert.throws(() => photoMime(Buffer.from('short')), { status: 400 });
  assert.throws(() => photoMime(Buffer.alloc(2 * 1024 * 1024 + 1)), { status: 400 });
  const pngHeader = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(4), Buffer.from('IHDR'), Buffer.alloc(12)]);
  assert.equal(photoMime(pngHeader), 'image/png');
  const jpegHeader = Buffer.concat([Buffer.from([255, 216, 255]), Buffer.alloc(20), Buffer.from([255, 217])]);
  assert.equal(photoMime(jpegHeader), 'image/jpeg');
  const webpHeader = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(16)]);
  assert.equal(photoMime(webpHeader), 'image/webp');
  assert.throws(() => photoMime(Buffer.alloc(50)), { status: 400 });
});

test('deleteWorker validates worker existence and objectId', async () => {
  const { deleteWorker } = await import('../src/attendance/services/masters.service.js');
  await assert.rejects(() => deleteWorker({ role: 'admin', firms: [firm] }, 'invalid-id'), { status: 400 });
});


