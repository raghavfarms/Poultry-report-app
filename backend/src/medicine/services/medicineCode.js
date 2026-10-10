import MedicineCodeCounter from '../models/MedicineCodeCounter.js';

export async function nextMedicineCode(Medicine) {
  const existing = await Medicine.find({ code: /^MED-\d+$/ }).select('code').lean();
  const highest = existing.reduce((max, item) => Math.max(max, Number(item.code.slice(4))), 0);
  // One atomic increment, seeded above existing codes, prevents concurrent
  // stock-in and master-page requests from receiving the same number.
  const allocate = () => MedicineCodeCounter.findOneAndUpdate(
    { _id: 'medicine' },
    [{ $set: { sequence: { $add: [{ $max: [{ $ifNull: ['$sequence', 0] }, highest] }, 1] } } }],
    { upsert: true, new: true },
  );
  let counter;
  try { counter = await allocate(); } catch (error) {
    if (error.code !== 11000) throw error;
    counter = await allocate();
  }
  return `MED-${String(counter.sequence).padStart(3, '0')}`;
}
