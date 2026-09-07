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

test('emergency fuel and final top-up both count, without adding tank capacity', () => {
  const [row] = calculateTransportRows([{ vehicle: 'v1', tankCapacity: 100, openingReading: 1000, closingReading: 1750, fill1Liters: 10, fill2Liters: 65, isFull: true }]);
  assert.equal(row.consumedLiters, 75);
  assert.equal(row.averageKmPerLiter, 10);
});

test('partial fills carry across days and consumption is counted once per cycle', () => {
  const rows = calculateTransportRows([
    { vehicle: 'v1', openingReading: 1000, closingReading: 1400, fill1Liters: 10, isFull: false },
    { vehicle: 'v2', openingReading: 0, closingReading: 100, fill1Liters: 10, isFull: true },
    { vehicle: 'v1', openingReading: 1400, closingReading: 1750, fill1Liters: 65, isFull: true },
    { vehicle: 'v1', openingReading: 1750, closingReading: 1850, fill1Liters: 5, isFull: false },
  ]);
  assert.equal(rows[0].consumedLiters, null);
  assert.equal(rows[2].cycleFuelLiters, 75);
  assert.equal(rows[2].averageKmPerLiter, 10);
  assert.equal(rows[3].averageKmPerLiter, null);
});

test('unknown opening tank establishes a baseline at the first full closing', () => {
  const rows = calculateTransportRows([
    { vehicle: 'v1', openingFull: false, openingReading: 1000, closingReading: 1200, fill1Liters: 40, isFull: true },
    { vehicle: 'v1', openingFull: false, openingReading: 1200, closingReading: 1500, fill1Liters: 30, isFull: true },
  ]);
  assert.equal(rows[0].averageKmPerLiter, null);
  assert.equal(rows[1].averageKmPerLiter, 10);
});

test('spreadsheet GKR cycle includes preceding days and both fills', () => {
  const rows = calculateTransportRows([
    { vehicle: 'pickup', openingReading: 93714, closingReading: 93786 },
    { vehicle: 'pickup', openingReading: 93786, closingReading: 93914 },
    { vehicle: 'pickup', openingReading: 93914, closingReading: 94664, fill1Liters: 23.21, fill2Liters: 33, isFull: true },
  ]);
  assert.equal(rows[2].fullCycleDistanceKm, 950);
  assert.equal(Number(rows[2].averageKmPerLiter.toFixed(2)), 16.90);
});
