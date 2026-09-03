import TransportVehicle from '../models/TransportVehicle.js';
import { badRequest, notFoundError } from '../utils/http.js';

function vehiclePayload(body) {
  const name = String(body.name || '').trim();
  const number = String(body.number || '').trim().toUpperCase();
  const tankCapacity = Number(body.tankCapacity);
  const order = Number(body.order || 0);
  if (!name) throw badRequest('Vehicle name is required.');
  if (!number) throw badRequest('Vehicle number is required.');
  if (![tankCapacity, order].every(Number.isFinite) || tankCapacity < 0) throw badRequest('Vehicle numbers are invalid.');
  return { name, number, tankCapacity, order };
}

export async function getVehicles(req, res) {
  const filter = {};
  if (!(req.user.role === 'admin' && req.query.includeInactive === 'true')) filter.active = true;
  const vehicles = await TransportVehicle.find(filter).sort({ order: 1, name: 1 }).lean();
  res.json({ vehicles });
}

export async function createVehicle(req, res) {
  const vehicle = await TransportVehicle.create(vehiclePayload(req.body));
  res.status(201).json({ vehicle });
}

export async function updateVehicle(req, res) {
  const existing = await TransportVehicle.findById(req.params.vehicleId);
  if (!existing) throw notFoundError('Vehicle not found.');
  const vehicle = await TransportVehicle.findByIdAndUpdate(
    existing._id,
    { ...vehiclePayload({ ...existing.toObject(), ...req.body }), active: req.body.active ?? existing.active },
    { new: true, runValidators: true },
  );
  res.json({ vehicle });
}

export async function removeVehicle(req, res) {
  const vehicle = await TransportVehicle.findByIdAndUpdate(req.params.vehicleId, { active: false }, { new: true });
  if (!vehicle) throw notFoundError('Vehicle not found.');
  res.json({ message: 'Vehicle removed. Historical transport reports are unchanged.', vehicle });
}

export async function restoreVehicle(req, res) {
  const vehicle = await TransportVehicle.findByIdAndUpdate(req.params.vehicleId, { active: true }, { new: true });
  if (!vehicle) throw notFoundError('Vehicle not found.');
  res.json({ message: 'Vehicle restored.', vehicle });
}
