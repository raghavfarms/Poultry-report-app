import MedicineLocation from '../models/MedicineLocation.js';
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
  if (rawFarm === 'null' || rawFarm === 'undefined' || rawFarm === '') rawFarm = null;
  if (!rawFarm && !req.user?.firms?.length && !req.user?.firm) return null;
  const scope = await resolveUserFarmScope(req, rawFarm);
  if (scope?.farm) {
    return scope.farm.$in ? scope.farm.$in[0] : scope.farm;
  }
  return null;
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
    const farmId = await extractFarmId(req);
    const query = farmId ? { farm: farmId, removed: false } : { farm: null, removed: false };
    const records = await MedicineLocation.find(query).sort({ createdAt: 1, name: 1 }).lean();
    const result = records.map((r) => r.name);
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
    const matchFilter = farmId ? { nameKey, farm: farmId } : { nameKey, farm: null };

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
  
    
  
   