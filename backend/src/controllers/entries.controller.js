import mongoose from 'mongoose';
import Asset from '../models/Asset.js';
import DieselEntry from '../models/DieselEntry.js';
import Firm from '../models/Firm.js';
import { calculateReport, calculateServiceBeforeDate, latestFullStatuses } from '../services/report.service.js';
import { addDays, assertDate, todayUtc } from '../utils/date.js';
import { badRequest, notFoundError } from '../utils/http.js';

async function loadFirm(id) {
  if (!mongoose.isValidObjectId(id)) throw badRequest('Invalid firm.');
  const firm = await Firm.findOne({ _id: id, active: true }).lean();
  if (!firm) throw notFoundError('Firm not found.');
  return firm;
}

async function earliestMissingDate(firmId) {
  const entries = await DieselEntry.find({ firm: firmId }).select('date').sort({ date: 1 }).lean();
  const today = todayUtc();
  if (!entries.length) return today;
  const existing = new Set(entries.map((entry) => entry.date));
  for (let date = entries[0].date; date <= today; date = addDays(date, 1)) {
    if (!existing.has(date)) return date;
  }
  return today;
}

export async function getDefaultDate(req, res) {
  await loadFirm(req.query.firmId);
  res.json({ date: await earliestMissingDate(req.query.firmId) });
}

export async function getOpening(req, res) {
  assertDate(req.query.date);
  const firm = await loadFirm(req.query.firmId);
  const entries = await DieselEntry.find({ firm: firm._id, date: { $lte: req.query.date } }).sort({ date: 1 }).lean();
  const report = calculateReport({ firm, entries, from: req.query.date, to: req.query.date, includeMissing: true });
  const current = entries.find((entry) => entry.date === req.query.date) || null;
  res.json({ openingLiters: report.rows[0].openingLiters, entry: current, previousFullStatuses: latestFullStatuses(entries, req.query.date) });
}

export async function getServiceStatus(req, res) {
  assertDate(req.query.date);
  await loadFirm(req.query.firmId);
  const [assets, entries] = await Promise.all([
    Asset.find({ firm: req.query.firmId, active: true }).sort({ order: 1 }).lean(),
    DieselEntry.find({ firm: req.query.firmId, date: { $lt: req.query.date } }).sort({ date: 1 }).lean(),
  ]);
  res.json({ statuses: calculateServiceBeforeDate({ entries, assets, date: req.query.date }) });
}

export async function getReport(req, res) {
  const firm = await loadFirm(req.query.firmId);
  const to = req.query.to || todayUtc();
  const from = req.query.from || addDays(to, -6);
  assertDate(from, 'from');
  assertDate(to, 'to');
  if (from > to) throw badRequest('From date must be before To date.');
  const entries = await DieselEntry.find({ firm: firm._id, date: { $lte: to } }).sort({ date: 1 }).lean();
  const assets = await Asset.find({ firm: firm._id, active: true }).sort({ order: 1, label: 1 }).lean();
  const report = calculateReport({ firm, entries, from, to, includeMissing: true });
  report.rows.reverse();
  res.json({ firm, assets, from, to, ...report });
}

export async function getOverview(req, res) {
  const days = Math.min(31, Math.max(1, Number(req.query.days || 7)));
  const to = req.query.to || todayUtc();
  const from = addDays(to, -(days - 1));
  assertDate(to, 'to');
  const firmFilter = ['admin', 'developer'].includes(req.user.role) ? { active: true } : { _id: { $in: req.user.firms }, active: true };
  const firms = await Firm.find(firmFilter).sort({ name: 1 }).lean();
  const reports = [];
  for (const firm of firms) {
    const [entries, assets] = await Promise.all([
      DieselEntry.find({ firm: firm._id, date: { $lte: to } }).sort({ date: 1 }).lean(),
      Asset.find({ firm: firm._id, active: true }).sort({ order: 1, label: 1 }).lean(),
    ]);
    const report = calculateReport({ firm, entries, from, to, includeMissing: true });
    report.rows.reverse();
    reports.push({ firm, assets, from, to, ...report });
  }
  res.json({ from, to, reports });
}

export async function resetService(req, res) {
  const firm = await loadFirm(req.params.firmId);
  if (!mongoose.isValidObjectId(req.params.assetId)) throw badRequest('Invalid asset.');
  const date = todayUtc();
  const entry = await DieselEntry.findOne({ firm: firm._id, date });
  if (!entry) return res.status(409).json({ message: `Save the daily entry for ${date} before marking service done.` });
  const item = entry.assetEntries.find((value) => String(value.asset) === req.params.assetId);
  if (!item) return res.status(409).json({ message: 'This asset is not included in today’s entry.' });
  item.serviceDone = true;
  entry.updatedBy = req.user._id;
  await entry.save();
  res.json({ message: 'Service counter reset.', date });
}

export async function saveEntry(req, res) {
  assertDate(req.params.date);
  const firm = await loadFirm(req.params.firmId);
  const existing = await DieselEntry.findOne({ firm: firm._id, date: req.params.date }).lean();
  if (!['admin', 'developer'].includes(req.user.role) && req.params.date > todayUtc()) {
    return res.status(403).json({ message: 'Labour cannot enter a future date.' });
  }
  if (!['admin', 'developer'].includes(req.user.role)) {
    if (existing && req.params.date !== todayUtc()) {
      return res.status(403).json({ message: 'Users can edit only today’s saved entry.' });
    }
    if (!existing) {
      const nextDate = await earliestMissingDate(firm._id);
      if (req.params.date > nextDate) return res.status(409).json({ message: `Please complete ${nextDate} first.` });
    }
  }

  const dieselInLiters = Number(req.body.dieselInLiters || 0);
  const lightConsumptionMinutes = Number(req.body.lightConsumptionMinutes || 0);
  if (!Number.isFinite(dieselInLiters) || dieselInLiters < 0) throw badRequest('Diesel IN is invalid.');
  if (!Number.isInteger(lightConsumptionMinutes) || lightConsumptionMinutes < 0 || lightConsumptionMinutes > 1440) {
    throw badRequest('Light consumption must be between 00:00 and 24:00.');
  }

  const oldRows = new Map((existing?.assetEntries || []).map((item) => [String(item.asset), item]));
  const requested = Array.isArray(req.body.assetEntries) ? req.body.assetEntries : [];
  const ids = requested.map((item) => String(item.asset));
  if (new Set(ids).size !== ids.length) throw badRequest('An asset appears more than once.');
  const currentAssets = await Asset.find({ _id: { $in: ids }, firm: firm._id }).lean();
  const currentById = new Map(currentAssets.map((asset) => [String(asset._id), asset]));
  if (currentAssets.length !== ids.length) throw badRequest('One or more assets are invalid for this firm.');

  const assetEntries = requested.map((input) => {
    const asset = currentById.get(String(input.asset));
    const runningMinutes = Number(input.runningMinutes || 0);
    const refillLiters = Number(input.refillLiters || 0);
    if (!Number.isInteger(runningMinutes) || runningMinutes < 0 || runningMinutes > 1440) {
      throw badRequest(`${asset.label}: running time must be between 00:00 and 24:00.`);
    }
    if (!Number.isFinite(refillLiters) || refillLiters < 0) throw badRequest(`${asset.label}: refill is invalid.`);
    return {
      asset: asset._id,
      label: asset.label,
      category: asset.category,
      tankCapacity: asset.tankCapacity,
      serviceIntervalMinutes: asset.serviceIntervalMinutes,
      order: asset.order,
      runningMinutes,
      refillLiters,
      isFull: input.isFull !== false,
      serviceDone: Boolean(input.serviceDone),
    };
  });

  for (const [assetId, oldRow] of oldRows) {
    if (!ids.includes(assetId)) assetEntries.push(oldRow);
  }
  assetEntries.sort((a, b) => a.order - b.order);

  const entry = await DieselEntry.findOneAndUpdate(
    { firm: firm._id, date: req.params.date },
    {
      $set: {
        dieselInLiters,
        lightConsumptionMinutes,
        assetEntries,
        note: String(req.body.note || '').trim(),
        updatedBy: req.user._id,
      },
      $setOnInsert: { createdBy: req.user._id },
    },
    { upsert: true, new: true, runValidators: true },
  );
  res.json({ message: existing ? 'Entry updated.' : 'Entry saved.', entry });
}
