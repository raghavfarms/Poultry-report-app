import TransportEntry from '../models/TransportEntry.js';
import TransportVehicle from '../models/TransportVehicle.js';
import { assertDate, todayUtc } from '../utils/date.js';
import { badRequest, notFoundError } from '../utils/http.js';
import { calculateTransportRows } from '../services/transportReport.service.js';

const tripKey = (entry) => `${entry.openingDate}T${entry.openingTime}`;
const number = (value, label) => {
  const result = Number(value || 0);
  if (!Number.isFinite(result) || result < 0) throw badRequest(`${label} is invalid.`);
  return result;
};

export async function getTransportReport(req, res) {
  const [entries, vehicles] = await Promise.all([
    TransportEntry.find(req.query.vehicleId ? { vehicle: req.query.vehicleId } : {}).sort({ openingDate: 1, openingTime: 1, createdAt: 1 }).lean(),
    TransportVehicle.find({}).sort({ order: 1, name: 1 }).lean(),
  ]);
  res.json({ vehicles, rows: calculateTransportRows(entries, vehicles).reverse() });
}

export async function getTransportOpening(req, res) {
  assertDate(req.query.date);
  const time = String(req.query.time || '00:00');
  const entries = await TransportEntry.find({ vehicle: req.query.vehicleId }).sort({ openingDate: 1, openingTime: 1, createdAt: 1 }).lean();
  const currentId = String(req.query.entryId || '');
  const earlier = entries.filter((entry) => String(entry._id) !== currentId && tripKey(entry) < `${req.query.date}T${time}`);
  let lastFullReading = null;
  let firstCycleReading = null;
  let pendingFuelLiters = 0;
  for (const entry of earlier) {
    if (entry.closingReading == null) continue;
    if (firstCycleReading == null && entry.openingFull !== false) firstCycleReading = Number(entry.openingReading);
    pendingFuelLiters += Number(entry.fill1Liters || 0) + Number(entry.fill2Liters || 0);
    if (entry.isFull) {
      lastFullReading = Number(entry.closingReading);
      pendingFuelLiters = 0;
    }
  }
  const vehicle = await TransportVehicle.findById(req.query.vehicleId).lean();
  if (!vehicle) throw notFoundError('Vehicle not found.');
  res.json({ lastFullReading, firstCycleReading, pendingFuelLiters });
}

export async function getTransportEntry(req, res) {
  const entry = await TransportEntry.findById(req.params.entryId).lean();
  if (!entry) throw notFoundError('Transport entry not found.');
  res.json({ entry });
}

export async function saveTransportEntry(req, res) {
  const existing = req.params.entryId ? await TransportEntry.findById(req.params.entryId) : null;
  if (req.params.entryId && !existing) throw notFoundError('Transport entry not found.');
  const vehicle = await TransportVehicle.findById(req.body.vehicleId || existing?.vehicle);
  if (!vehicle) throw badRequest('Invalid vehicle.');
  if (!existing && await TransportEntry.exists({ vehicle: vehicle._id, closingReading: null })) {
    return res.status(409).json({ message: 'Complete the vehicle’s open journey before adding another one.' });
  }
  const openingDate = String(req.body.openingDate || '');
  const openingTime = String(req.body.openingTime || '');
  assertDate(openingDate, 'openingDate');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(openingTime)) throw badRequest('Opening time is required.');
  if (!['admin', 'developer'].includes(req.user.role) && openingDate > todayUtc()) return res.status(403).json({ message: 'Users cannot enter a future journey.' });
  if (!['admin', 'developer'].includes(req.user.role) && existing?.closingReading != null) return res.status(403).json({ message: 'Only an administrator can edit a completed journey.' });
  const openingReading = number(req.body.openingReading, 'Opening reading');
  const closingReading = req.body.closingReading === '' || req.body.closingReading == null ? null : number(req.body.closingReading, 'Closing reading');
  if (closingReading != null && closingReading < openingReading) throw badRequest('Closing reading cannot be below opening reading.');
  const closingDate = closingReading == null ? '' : String(req.body.closingDate || existing?.closingDate || todayUtc());
  if (closingDate) {
    assertDate(closingDate, 'closingDate');
    if (closingDate < openingDate) throw badRequest('Closing date cannot be before opening date.');
  }
  const fill1Liters = number(req.body.fill1Liters, 'Fill 1');
  const fill2Liters = number(req.body.fill2Liters, 'Fill 2');
  const openingFull = existing?.openingFull ?? (req.body.openingFull !== false);
  const fill1Reading = req.body.fill1Reading === '' || req.body.fill1Reading == null ? null : number(req.body.fill1Reading, 'Fill 1 reading');
  const fill2Reading = req.body.fill2Reading === '' || req.body.fill2Reading == null ? null : number(req.body.fill2Reading, 'Fill 2 reading');
  const effectiveOpening = existing && !['admin', 'developer'].includes(req.user.role) ? existing.openingReading : openingReading;
  if (closingReading != null && closingReading < effectiveOpening) throw badRequest('Closing reading cannot be below opening reading.');
  for (const reading of [fill1Reading, fill2Reading]) {
    if (reading != null && (reading < effectiveOpening || (closingReading != null && reading > closingReading))) throw badRequest('Fuel readings must be within the journey readings.');
  }
  if (fill1Reading != null && fill2Reading != null && fill2Reading < fill1Reading) throw badRequest('Fill 2 reading cannot be before Fill 1 reading.');
  const isFull = Boolean(req.body.isFull);
  const finalFillReading = fill2Liters > 0 ? fill2Reading : fill1Reading;
  if (isFull && closingReading != null && finalFillReading != null && finalFillReading !== closingReading) throw badRequest('The final full-tank fill reading must match the closing reading.');
  if (isFull && fill1Liters + fill2Liters <= 0) throw badRequest('Refill litres are required when the tank is marked full.');
  const payload = {
    vehicle: vehicle._id, vehicleName: vehicle.name, vehicleNumber: vehicle.number,
    tankCapacity: vehicle.tankCapacity, from: String(req.body.from || '').trim(), destination: String(req.body.destination || '').trim(),
    openingDate, openingTime, openingReading, closingDate, closingReading,
    openingFull, fill1Liters, fill2Liters, fill1Reading, fill2Reading, isFull, note: String(req.body.note || '').trim(), updatedBy: req.user._id,
  };
  if (existing && !['admin', 'developer'].includes(req.user.role)) {
    Object.assign(payload, {
      vehicle: existing.vehicle,
      vehicleName: existing.vehicleName,
      vehicleNumber: existing.vehicleNumber,
      tankCapacity: existing.tankCapacity,
      from: existing.from,
      destination: existing.destination,
      openingDate: existing.openingDate,
      openingTime: existing.openingTime,
      openingReading: existing.openingReading,
      note: existing.note,
    });
  }
  const entry = existing
    ? await TransportEntry.findByIdAndUpdate(existing._id, payload, { new: true, runValidators: true })
    : await TransportEntry.create({ ...payload, createdBy: req.user._id });
  res.status(existing ? 200 : 201).json({ message: existing ? 'Transport entry updated.' : 'Transport entry saved.', entry });
}
