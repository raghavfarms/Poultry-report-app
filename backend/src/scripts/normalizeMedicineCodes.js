import 'dotenv/config';
import mongoose from 'mongoose';
import MedicineMaster from '../medicine/models/MedicineMaster.js';
import { nextMedicineCode } from '../medicine/services/medicineCode.js';

const deadline = setTimeout(() => {
  console.error('Medicine code repair timed out.');
  process.exit(1);
}, 30000);

try {
  await mongoose.connect(process.env.MONGODB_URI, {
    ...(process.env.MONGODB_DB_NAME ? { dbName: process.env.MONGODB_DB_NAME.trim() } : {}),
    serverSelectionTimeoutMS: 10000,
  });
  if (mongoose.connection.name !== 'poultry_development') {
    throw new Error('This repair is restricted to poultry_development. No records changed.');
  }
  const filter = { $or: [{ code: /^MED-X[A-F0-9]{24}$/ }, { code: null }, { code: '' }] };
  const medicines = await MedicineMaster.find(filter).sort({ createdAt: 1, _id: 1 });
  let updated = 0;
  for (const medicine of medicines) {
    const code = await nextMedicineCode(MedicineMaster);
    const result = await MedicineMaster.updateOne({ _id: medicine._id, code: medicine.code ?? null }, { $set: { code } });
    updated += result.modifiedCount;
  }
  console.log(`Updated ${updated} medicine codes to the MED-001 sequence.`);
} catch (error) {
  console.error(`Medicine code repair failed (${error.name}).`);
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
  await mongoose.disconnect();
}
