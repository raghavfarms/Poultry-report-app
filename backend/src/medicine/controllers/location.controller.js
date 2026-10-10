import mongoose from 'mongoose';
import MedicineLocation from '../models/MedicineLocation.js';
import MedicineIssue from '../models/MedicineIssue.js';
import { resolveUserFarmScope } from './report.controller.js';

export const DEFAULT_LOCATIONS = [];

const RESERVED_NAMES = new Set(['other', 'other...']);

function cleanName(raw) {
  if (typeof raw !== 'string') return null;
  const normalized = raw.trim().replace(/\s+/g, ' ');
  if (!normalized || normalized.length > 120) return null;
  return normalized;
}

async function extractFarmId(req) {
  let rawFarm = req.body?.farm || req.query?.farm;
  if (rawFarm === 'null' || rawFarm === 'undefined' || rawFarm === 'ALL' || rawFarm === 'all' || rawFarm === '') rawFarm = null;
  if (!rawFarm && !req.user?.firms?.length && !req.user?.firm) return null;
  if (mongoose.connection?.readyState === 1) {
    const scope = await resolveUserFarmScope(req, rawFarm);
    if (scope?.farm) {
      return scope.farm.$in ? scope.farm.$in[0] : scope.farm;
    }
  }
  return rawFarm || null;
}

export async function createLocation(req, res, next) {
  try {
    if (req.user?.role && !['admin', 'developer'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Admin access required to add locations' });
    }
    const rawName = req.body?.name;
    const name = cleanName(rawName);
    if (!name || RESERVED_NAMES.has(name.toLowerCase())) {
      return res.status(400).json({ success: false, error: 'Invalid location name' });
    }

    const farmId = await extractFarmId(req);
    const nameKey = name.toLowerCase();
    const matchFilter = farmId ? { nameKey, farm: farmId } : { nameKey, farm: null };

    // Check if it already exists for this farm
    const existing = await MedicineLocation.findOne(matchFilter);
    if (existing) {
      if (!existing.removed) {
        return res.status(409).json({ success: false, error: 'Location already exists for this farm' });
      }
      // If it was previously removed, un-remove / reactivate it
      existing.removed = false;
      existing.name = name;
      await existing.save();
      return res.status(201).json({ success: true, location: existing.name });
    }

    try {
      const createData = { name, nameKey, removed: false };
      if (farmId) createData.farm = farmId;
      const created = await MedicineLocation.create(createData);
      return res.status(201).json({ success: true, location: created.name });
    } catch (err) {
      if (err?.code === 11000) {
        return res.status(409).json({ success: false, error: 'Location already exists for this farm' });
      }
      throw err;
    }
  } catch (err) {
    if (typeof next === 'function') next(err);
    else res.status(500).json({ success: false, error: err.message });
  }
}

export async function getLocations(req, res, next) {
  try {
    let rawFarm = req.query?.farm || req.body?.farm;
    if (rawFarm === 'null' || rawFarm === 'undefined' || rawFarm === 'ALL' || rawFarm === 'all' || rawFarm === '') {
      rawFarm = null;
    }

    let query = { removed: false };
    if (rawFarm) {
      const farmId = await extractFarmId(req);
      query.farm = farmId;
    } else if (req.user && mongoose.connection?.readyState === 1) {
      // When "All Farms" / no specific farm is selected, query across all accessible farms
      const farmScope = await resolveUserFarmScope(req, null);
      if (farmScope?.farm) {
        query.farm = farmScope.farm;
      }
      // If admin with unrestricted access, no query.farm restriction -> matches all farms (Raghav, Sanjana, null, etc.)
    }

    const findResult = MedicineLocation.find(query);
    const records = typeof findResult.sort === 'function'
      ? await findResult.sort({ createdAt: 1, name: 1 }).lean()
      : (typeof findResult.lean === 'function' ? await findResult.lean() : await findResult);

    // Also include any distinct sheds from MedicineIssue within the same farm scope
    let issueSheds = [];
    if (mongoose.connection?.readyState === 1 && MedicineIssue && typeof MedicineIssue.distinct === 'function') {
      try {
        const issueFarmScope = await resolveUserFarmScope(req, rawFarm);
        issueSheds = await MedicineIssue.distinct('shed', {
          ...issueFarmScope,
          shed: { $exists: true, $ne: '' },
        });
      } catch (_) {
        // Gracefully ignore in mocked tests or disconnected DB
      }
    }

    // Deduplicate case-insensitively, keeping only unique locations (common locations do not repeat)
    const seen = new Set();
    const result = [];

    const addLocation = (loc) => {
      if (!loc || typeof loc !== 'string') return;
      const trimmed = loc.trim().replace(/\s+/g, ' ');
      if (!trimmed || RESERVED_NAMES.has(trimmed.toLowerCase())) return;
      const key = trimmed.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(trimmed);
      }
    };

    if (Array.isArray(records)) {
      for (const r of records) {
        if (r?.name) addLocation(r.name);
      }
    }
    if (Array.isArray(issueSheds)) {
      for (const s of issueSheds) {
        addLocation(s);
      }
    }

    // Natural sort: Shed 1, Shed 2, Shed 10, Brooder...
    result.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    return res.status(200).json({ success: true, locations: result });
  } catch (err) {
    if (typeof next === 'function') next(err);
    else res.status(500).json({ success: false, error: err.message });
  }
}

export async function removeLocation(req, res, next) {
  try {
    if (req.user?.role && !['admin', 'developer'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Admin access required to remove locations' });
    }
    const rawName = req.body?.name;
    const name = cleanName(rawName);
    if (!name || RESERVED_NAMES.has(name.toLowerCase())) {
      return res.status(400).json({ success: false, error: 'Invalid location name' });
    }

    const farmId = await extractFarmId(req);
    const nameKey = name.toLowerCase();
    const matchFilter = farmId ? { nameKey, farm: farmId } : { nameKey };

    const doc = await MedicineLocation.findOneAndUpdate(
      matchFilter,
      { $set: { removed: true } },
      { new: true }
    );

    if (!doc) {
      return res.status(404).json({ success: false, error: 'Location not found' });
    }

    return res.status(200).json({ success: true, message: 'Location removed successfully' });
  } catch (err) {
    if (typeof next === 'function') next(err);
    else res.status(500).json({ success: false, error: err.message });
  }
}
  
    
  
   