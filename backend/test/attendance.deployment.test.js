import test from 'node:test';
import assert from 'node:assert/strict';
import { deploymentInstant, initialDeploymentPayload, effectiveAtFilter } from '../src/attendance/services/deployment.service.js';
import WorkerDeployment from '../src/attendance/models/WorkerDeployment.js';

const location = '111111111111111111111111';

test('deployment calendar dates use Indian midnight and explicit offsets resolve to the same instant', () => {
  const date = deploymentInstant('2026-09-08');
  assert.equal(date.toISOString(), '2026-09-07T18:30:00.000Z');
  assert.equal(deploymentInstant('2026-09-08T00:00:00+05:30').getTime(), date.getTime());
  assert.equal(deploymentInstant('2026-09-07T18:30:00Z').getTime(), date.getTime());
  for (const value of ['2026-02-30', '2026-09-08T00:00:00', '2026-09-08T24:00:00Z', '2026-09-08T01:60:00Z', '2026-09-08T01:00:00+15:00', '2026-09-08T01:00:00+14:30', {}, null]) {
    assert.throws(() => deploymentInstant(value), { status: 400 });
  }
});

test('initial deployment validates start, read-only fields and optional supervisor semantics', () => {
  const base = { workLocation: location };
  assert.equal(initialDeploymentPayload(base, '2026-09-01').effectiveFrom.toISOString(), '2026-08-31T18:30:00.000Z');
  assert.equal(initialDeploymentPayload(base, '2026-09-01').supervisor, undefined);
  assert.equal(initialDeploymentPayload({ ...base, supervisor: null }, '2026-09-01').supervisor, null);
  for (const body of [undefined, [], {}, { ...base, effectiveFrom: '2026-08-31' }, { ...base, firm: location }, { ...base, effectiveTo: null }, { ...base, allocationType: 'FARM_TRANSFER' }, { ...base, reason: ' ' }]) {
    assert.throws(() => initialDeploymentPayload(body, '2026-09-01'), { status: 400 });
  }
});

test('effective lookup includes the start, excludes the end and does not discard closed history', () => {
  const instant = deploymentInstant('2026-09-08');
  const filter = effectiveAtFilter(instant);
  assert.equal(filter.effectiveFrom.$lte, instant);
  assert.equal(filter.$or[0].effectiveTo, null);
  assert.equal(filter.$or[1].effectiveTo.$gt, instant);
  assert.equal(filter.active, undefined);
  assert.throws(() => effectiveAtFilter(new Date('invalid')), { status: 400 });
});

test('deployment model protects initial/open uniqueness, immutable references and invalid intervals', async () => {
  const indexes = WorkerDeployment.schema.indexes();
  assert.ok(indexes.some(([, options]) => options.unique && options.partialFilterExpression?.effectiveTo === null));
  assert.ok(indexes.some(([, options]) => options.unique && options.partialFilterExpression?.allocationType === 'INITIAL'));
  assert.equal(WorkerDeployment.schema.path('workLocation').options.immutable, true);
  assert.equal(WorkerDeployment.schema.path('effectiveFrom').options.immutable, true);
  const record = new WorkerDeployment({ worker: location, firm: location, workLocation: location, designation: location,
    workerCodeSnapshot: 'RGF-0001', workerNameSnapshot: 'Worker', firmNameSnapshot: 'Raghav',
    workLocationNameSnapshot: 'Shed 1', designationNameSnapshot: 'Worker', allocationType: 'INITIAL',
    effectiveFrom: new Date('2026-09-08'), effectiveTo: new Date('2026-09-08'), reason: 'Initial deployment', createdBy: location,
  });
  await assert.rejects(record.validate(), { name: 'ValidationError' });
});
