import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateTransportRows } from '../src/services/transportReport.service.js';

test('transport mileage appears only when a full-to-full cycle closes', () => {
  const base = { vehicle: 'v1', fill2Liters: 0 };
  const rows = calculateTransportRows([
    { ...base, openingReading: 1000, closingReading: 1154, fill1Liters: 0, isFull: false },
    { ...base, openingReading: 1154, closingReading: 1297, fill1Liters: 95, isFull: true },
    { ...base, openingReading: 1297, closingReading: 1531, fill1Liters: 0, isFull: false },
    { ...base, openingReading: 1531, closingReading: 1706, fill1Liters: 81.8, isFull: true },
  ]);

  assert.equal(rows[0].averageKmPerLiter, null);
  assert.equal(rows[1].fullCycleDistanceKm, 297);
  assert.equal(Number(rows[1].averageKmPerLiter.toFixed(2)), 3.13);
  assert.equal(rows[2].averageKmPerLiter, null);
  assert.equal(rows[3].fullCycleDistanceKm, 409);
  assert.equal(Number(rows[3].averageKmPerLiter.toFixed(2)), 5);
});

test('partial transport entry waits for its closing reading', () => {
  const [row] = calculateTransportRows([{ vehicle: 'v1', openingReading: 1000, closingReading: null, fill1Liters: 20, fill2Liters: 0, isFull: true }]);
  assert.equal(row.complete, false);
  assert.equal(row.kmRun, null);
  assert.equal(row.averageKmPerLiter, null);
});
