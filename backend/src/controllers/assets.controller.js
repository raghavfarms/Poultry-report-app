import { canAccessFirm } from '../middleware/auth.js';
import Asset from '../models/Asset.js';
import Firm from '../models/Firm.js';
import { badRequest, notFoundError, forbiddenError } from '../utils/http.js';

function payload(body) {
  const label = String(body.label || '').trim();
  const category = body.category || 'genset';
  const tankCapacity = Number(body.tankCapacity || 0);
  const serviceHours = Number(body.serviceHours ?? 225);
  const order = Number(body.order || 0);
  if (!label) throw badRequest('Asset name is required.');
  if (!['genset', 'tractor', 'vehicle'].includes(category)) throw badRequest('Invalid asset category.');
  if (![tankCapacity, serviceHours, order].every(Number.isFinite) || tankCapacity < 0 || serviceHours <= 0) {
    throw badRequest('Asset numbers are invalid.');
  }
  return { label, category, tankCapacity, serviceIntervalMinutes: Math.round(serviceHours * 60), order };
}

export async function getFirmAssets(req, res) {
  const filter = { firm: req.params.firmId };
  if (!((['admin', 'developer'].includes(req.user.role) || req.user.permissions?.asset_master) && req.query.includeInactive === 'true')) filter.active = true;
  const assets = await Asset.find(filter).sort({ order: 1, label: 1 }).lean();
  res.json({ assets });
}


export async function createAsset(req, res) {
  if (!(await Firm.exists({ _id: req.params.firmId, active: true }))) throw notFoundError('Firm not found.');
  const asset = await Asset.create({ firm: req.params.firmId, ...payload(req.body) });
  res.status(201).json({ asset });
}

export async function updateAsset(req, res) {
  const existing = await Asset.findById(req.params.assetId);
  if (!existing) throw notFoundError('Asset not found.');
  if (!canAccessFirm(req.user, existing.firm)) throw forbiddenError('You do not have access to this firm.');
  const asset = await Asset.findByIdAndUpdate(
    req.params.assetId,
    { ...payload({ ...existing.toObject(), serviceHours: existing.serviceIntervalMinutes / 60, ...req.body }), active: req.body.active ?? existing.active },
    { new: true, runValidators: true },
  );
  res.json({ asset });
}

export async function deleteAsset(req, res) {
  const existing = await Asset.findById(req.params.assetId);
  if (!existing) throw notFoundError('Asset not found.');
  if (!canAccessFirm(req.user, existing.firm)) throw forbiddenError('You do not have access to this firm.');
  const asset = await Asset.findByIdAndUpdate(req.params.assetId, { active: false }, { new: true });
  if (!asset) throw notFoundError('Asset not found.');
  res.json({ message: 'Asset removed. Historical reports are unchanged.', asset });
}

export async function restoreAsset(req,res){
  const existing = await Asset.findById(req.params.assetId);
  if (!existing) throw notFoundError('Asset not found.');
  if (!canAccessFirm(req.user, existing.firm)) throw forbiddenError('You do not have access to this firm.');
  const asset = await Asset.findByIdAndUpdate(req.params.assetId, {active : true }, {new :true });
  if(!asset) throw notFoundError('Asset not found.');
  res.json({message : 'Asset restored.', asset});
}
