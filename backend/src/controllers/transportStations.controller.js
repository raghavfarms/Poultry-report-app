import TransportStation from '../models/TransportStation.js';
import TransportVehicle from '../models/TransportVehicle.js';
import { badRequest } from '../utils/http.js';

export async function getStations(req, res) {
  const [stations, vehicles] = await Promise.all([
    TransportStation.find({ active: true }).sort({ order: 1, name: 1 }).lean(),
    TransportVehicle.find({ active: true }).lean(),
  ]);
  const fromDocs = stations.map((s) => s.name);
  const fromVehicles = vehicles.flatMap((v) => v.stations || []);
  const combined = [...new Set([...fromDocs, ...fromVehicles].map((s) => String(s || '').trim().toUpperCase()).filter(Boolean))];
  res.json({ stations: combined });
}

export async function createStation(req, res) {
  const raw = req.body.name || req.body.station || '';
  const names = (typeof raw === 'string' ? raw.split(',') : [raw])
    .map((s) => String(s || '').trim().toUpperCase())
    .filter(Boolean);
  if (!names.length) throw badRequest('Location name is required.');

  for (const name of names) {
    await TransportStation.findOneAndUpdate(
      { name },
      { name, active: true },
      { upsert: true, new: true }
    );
  }

  const [stations, vehicles] = await Promise.all([
    TransportStation.find({ active: true }).sort({ order: 1, name: 1 }).lean(),
    TransportVehicle.find({ active: true }).lean(),
  ]);
  const fromDocs = stations.map((s) => s.name);
  const fromVehicles = vehicles.flatMap((v) => v.stations || []);
  const combined = [...new Set([...fromDocs, ...fromVehicles].map((s) => String(s || '').trim().toUpperCase()).filter(Boolean))];
  res.status(201).json({ message: 'Location added.', stations: combined });
}

export async function saveStations(req, res) {
  let list = [];
  if (Array.isArray(req.body.stations)) {
    list = req.body.stations;
  } else if (typeof req.body.stations === 'string') {
    list = req.body.stations.split(',');
  }
  const cleanNames = [...new Set(list.map((s) => String(s || '').trim().toUpperCase()).filter(Boolean))];

  await TransportStation.deleteMany({});
  for (let i = 0; i < cleanNames.length; i++) {
    await TransportStation.create({ name: cleanNames[i], order: i, active: true });
  }
  await TransportVehicle.updateMany(
    {},
    { $pull: { stations: { $nin: cleanNames } } }
  );

  const [stations, vehicles] = await Promise.all([
    TransportStation.find({ active: true }).sort({ order: 1, name: 1 }).lean(),
    TransportVehicle.find({ active: true }).lean(),
  ]);
  const fromDocs = stations.map((s) => s.name);
  const fromVehicles = vehicles.flatMap((v) => v.stations || []);
  const combined = [...new Set([...fromDocs, ...fromVehicles].map((s) => String(s || '').trim().toUpperCase()).filter(Boolean))];
  res.json({ message: 'Locations updated.', stations: combined });
}

export async function deleteStation(req, res) {
  const name = decodeURIComponent(req.params.name).trim().toUpperCase();
  await Promise.all([
    TransportStation.deleteMany({ name }),
    TransportVehicle.updateMany({}, { $pull: { stations: name } }),
  ]);
  const [stations, vehicles] = await Promise.all([
    TransportStation.find({ active: true }).sort({ order: 1, name: 1 }).lean(),
    TransportVehicle.find({ active: true }).lean(),
  ]);
  const fromDocs = stations.map((s) => s.name);
  const fromVehicles = vehicles.flatMap((v) => v.stations || []);
  const combined = [...new Set([...fromDocs, ...fromVehicles].map((s) => String(s || '').trim().toUpperCase()).filter(Boolean))];
  res.json({ message: 'Location removed.', stations: combined });
}


