import { dateRange } from '../utils/date.js';

const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

export function totalRefill(entry) {
  return entry.assetEntries.reduce((sum, item) => sum + Number(item.refillLiters || 0), 0);
}

export function latestFullStatuses(entries, beforeDate) {
  const statuses = {};
  for (const entry of [...entries].sort((a, b) => a.date.localeCompare(b.date))) {
    if (entry.date >= beforeDate) break;
    for (const item of entry.assetEntries || []) statuses[String(item.asset)] = Boolean(item.isFull);
  }
  return statuses;
}

export function calculateReport({ firm, entries, from, to, includeMissing = true }) {
  const ordered = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const cycle = new Map();
  const service = new Map();
  const calculated = new Map();
  let balance = Number(firm.dieselOpeningBalance || 0);

  for (const raw of ordered) {
    const entry = raw.toObject ? raw.toObject() : raw;
    const opening = balance;
    const dieselConsumption = totalRefill(entry);
    const closing = opening + Number(entry.dieselInLiters || 0) - dieselConsumption;
    const assets = [];
    let closingCycleMinutes = 0;
    let closingCycleLiters = 0;

    for (const item of [...entry.assetEntries].sort((a, b) => a.order - b.order)) {
      const assetId = String(item.asset);
      const refillLiters = Number(item.refillLiters || 0);
      const cycleState = cycle.get(assetId) || { minutes: 0, liters: 0 };
      cycleState.minutes += Number(item.runningMinutes || 0);
      cycleState.liters += refillLiters;

      let averageLitersPerHour = null;
      let cycleMinutes = null;
      let cycleLiters = null;
      const closesCycle = Boolean(item.isFull) && refillLiters > 0 && cycleState.minutes > 0;
      if (closesCycle) {
        cycleMinutes = cycleState.minutes;
        cycleLiters = cycleState.liters;
        averageLitersPerHour = round2(cycleLiters / (cycleMinutes / 60));
        closingCycleMinutes += cycleMinutes;
        closingCycleLiters += cycleLiters;
        cycleState.minutes = 0;
        cycleState.liters = 0;
      }
      cycle.set(assetId, cycleState);

      const serviceState = service.get(assetId) || { minutes: 0, lastServiceDate: null };
      serviceState.minutes += Number(item.runningMinutes || 0);
      if (item.serviceDone) {
        serviceState.minutes = 0;
        serviceState.lastServiceDate = entry.date;
      }
      service.set(assetId, serviceState);
      const interval = Number(item.serviceIntervalMinutes || 225 * 60);

      assets.push({
        ...item,
        asset: assetId,
        averageLitersPerHour,
        cycleMinutes,
        cycleLiters,
        service: {
          runningMinutes: serviceState.minutes,
          remainingMinutes: Math.max(0, interval - serviceState.minutes),
          due: serviceState.minutes >= interval,
          lastServiceDate: serviceState.lastServiceDate,
        },
      });
    }

    balance = closing;
    calculated.set(entry.date, {
      ...entry,
      openingLiters: round2(opening),
      dieselConsumptionLiters: round2(dieselConsumption),
      closingLiters: round2(closing),
      electricityConsumptionMinutes: 1440 - Number(entry.lightConsumptionMinutes || 0),
      totalAverageLitersPerHour:
        closingCycleMinutes > 0 ? round2(closingCycleLiters / (closingCycleMinutes / 60)) : null,
      assetEntries: assets,
    });
  }

  const requestedDates = includeMissing ? dateRange(from, to) : [...calculated.keys()];
  let rollingBalance = Number(firm.dieselOpeningBalance || 0);
  const priorEntries = ordered.filter((entry) => entry.date < from);
  for (const entry of priorEntries) {
    rollingBalance += Number(entry.dieselInLiters || 0) - totalRefill(entry);
  }

  const rows = requestedDates
    .filter((date) => date >= from && date <= to)
    .map((date) => {
      const row = calculated.get(date);
      if (row) {
        rollingBalance = row.closingLiters;
        return row;
      }
      return {
        date,
        missing: true,
        openingLiters: round2(rollingBalance),
        closingLiters: round2(rollingBalance),
        dieselInLiters: 0,
        dieselConsumptionLiters: 0,
        lightConsumptionMinutes: null,
        electricityConsumptionMinutes: null,
        totalAverageLitersPerHour: null,
        assetEntries: [],
      };
    });

  const completed = rows.filter((row) => !row.missing);
  const summary = {
    openingLiters: rows[0]?.openingLiters ?? Number(firm.dieselOpeningBalance || 0),
    receivedLiters: round2(completed.reduce((sum, row) => sum + Number(row.dieselInLiters || 0), 0)),
    consumedLiters: round2(completed.reduce((sum, row) => sum + row.dieselConsumptionLiters, 0)),
    closingLiters: rows.at(-1)?.closingLiters ?? Number(firm.dieselOpeningBalance || 0),
    runningMinutes: completed.reduce(
      (sum, row) => sum + row.assetEntries.reduce((inner, item) => inner + item.runningMinutes, 0),
      0,
    ),
  };
  summary.averageLitersPerHour = summary.runningMinutes
    ? round2(summary.consumedLiters / (summary.runningMinutes / 60))
    : null;

  return { rows, summary };
}

export function calculateServiceBeforeDate({ entries, assets, date }) {
  const state = new Map(assets.map((asset) => [String(asset._id), { runningMinutes: 0, lastServiceDate: null }]));
  for (const raw of [...entries].sort((a, b) => a.date.localeCompare(b.date))) {
    if (raw.date >= date) break;
    for (const item of raw.assetEntries) {
      const key = String(item.asset);
      const current = state.get(key) || { runningMinutes: 0, lastServiceDate: null };
      current.runningMinutes += Number(item.runningMinutes || 0);
      if (item.serviceDone) {
        current.runningMinutes = 0;
        current.lastServiceDate = raw.date;
      }
      state.set(key, current);
    }
  }
  return assets.map((asset) => {
    const current = state.get(String(asset._id)) || { runningMinutes: 0, lastServiceDate: null };
    return {
      asset: String(asset._id),
      runningMinutes: current.runningMinutes,
      remainingMinutes: Math.max(0, asset.serviceIntervalMinutes - current.runningMinutes),
      due: current.runningMinutes >= asset.serviceIntervalMinutes,
      lastServiceDate: current.lastServiceDate,
      serviceIntervalMinutes: asset.serviceIntervalMinutes,
    };
  });
}
