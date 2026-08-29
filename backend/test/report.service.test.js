import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReport } from '../src/services/report.service.js';

const firm = { _id: 'firm-1', name: 'Raghav', dieselOpeningBalance: 290 };
const asset = {
  asset: 'asset-1', label: '82 KVA', category: 'genset', order: 1,
  tankCapacity: 200, serviceIntervalMinutes: 225 * 60, serviceDone: false,
};

test('opening always follows recalculated previous closing', () => {
  const entries = [
    { date: '2026-08-20', dieselInLiters: 0, lightConsumptionMinutes: 60, assetEntries: [{ ...asset, runningMinutes: 60, refillLiters: 112, isFull: true }] },
    { date: '2026-08-21', dieselInLiters: 0, lightConsumptionMinutes: 60, assetEntries: [{ ...asset, runningMinutes: 60, refillLiters: 106, isFull: true }] },
  ];
  const report = calculateReport({ firm, entries, from: '2026-08-20', to: '2026-08-21' });
  assert.equal(report.rows[0].closingLiters, 178);
  assert.equal(report.rows[1].openingLiters, 178);
  assert.equal(report.rows[1].closingLiters, 72);
});

test('full-to-full average accumulates hours until a refill closes the cycle', () => {
  const entries = [
    { date: '2026-08-20', dieselInLiters: 0, lightConsumptionMinutes: 30, assetEntries: [{ ...asset, runningMinutes: 30, refillLiters: 0, isFull: true }] },
    { date: '2026-08-21', dieselInLiters: 0, lightConsumptionMinutes: 30, assetEntries: [{ ...asset, runningMinutes: 30, refillLiters: 0, isFull: true }] },
    { date: '2026-08-22', dieselInLiters: 0, lightConsumptionMinutes: 600, assetEntries: [{ ...asset, runningMinutes: 600, refillLiters: 100, isFull: true }] },
  ];
  const report = calculateReport({ firm, entries, from: '2026-08-20', to: '2026-08-22' });
  assert.equal(report.rows[0].assetEntries[0].averageLitersPerHour, null);
  assert.equal(report.rows[2].assetEntries[0].cycleMinutes, 660);
  assert.equal(report.rows[2].assetEntries[0].averageLitersPerHour, 9.09);
  assert.equal(report.rows[0].electricityConsumptionMinutes, 1410);
});

test('service counter resets on service day', () => {
  const entries = [
    { date: '2026-08-20', dieselInLiters: 0, lightConsumptionMinutes: 0, assetEntries: [{ ...asset, runningMinutes: 600, refillLiters: 0, isFull: false }] },
    { date: '2026-08-21', dieselInLiters: 0, lightConsumptionMinutes: 0, assetEntries: [{ ...asset, runningMinutes: 60, refillLiters: 0, isFull: false, serviceDone: true }] },
  ];
  const report = calculateReport({ firm, entries, from: '2026-08-20', to: '2026-08-21' });
  assert.equal(report.rows[0].assetEntries[0].service.runningMinutes, 600);
  assert.equal(report.rows[1].assetEntries[0].service.runningMinutes, 0);
  assert.equal(report.rows[1].assetEntries[0].service.lastServiceDate, '2026-08-21');
});
