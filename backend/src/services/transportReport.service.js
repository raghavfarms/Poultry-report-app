export function calculateTransportRows(entries) {
  const lastFullReading = new Map();
  const firstCycleReading = new Map();
  const pendingFuel = new Map();

  return entries.map((entry) => {
    const vehicleId = String(entry.vehicle);
    if (!firstCycleReading.has(vehicleId)) firstCycleReading.set(vehicleId, Number(entry.openingReading));
    const fill1Liters = Number(entry.fill1Liters || 0);
    const fill2Liters = Number(entry.fill2Liters || 0);
    const fuelFilled = fill1Liters + fill2Liters;
    const totalDiesel = fuelFilled;
    const consumedLiters = fuelFilled;
    const complete = entry.closingReading != null;
    const kmRun = complete ? Number(entry.closingReading) - Number(entry.openingReading) : null;
    const accumulatedFuel = Number(pendingFuel.get(vehicleId) || 0) + fuelFilled;
    let fullCycleDistanceKm = null;
    let cycleFuelLiters = null;
    let averageKmPerLiter = null;

    if (complete && entry.isFull) {
      const startReading = lastFullReading.get(vehicleId) ?? firstCycleReading.get(vehicleId);
      fullCycleDistanceKm = Number(entry.closingReading) - startReading;
      cycleFuelLiters = accumulatedFuel;
      averageKmPerLiter = cycleFuelLiters > 0 ? fullCycleDistanceKm / cycleFuelLiters : null;
      lastFullReading.set(vehicleId, Number(entry.closingReading));
      pendingFuel.set(vehicleId, 0);
    } else if (complete) {
      pendingFuel.set(vehicleId, accumulatedFuel);
    }
    return { ...entry, complete, totalDiesel, consumedLiters, kmRun, fullCycleDistanceKm, cycleFuelLiters, averageKmPerLiter };
  });
}
