import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/db.js';
import Firm from '../models/Firm.js';
import User from '../models/User.js';

try {
  await connectDatabase();
  console.log('Connected to database.');

  const officeFirm = await Firm.findOne({ code: 'OFFICE' });
  if (officeFirm) {
    await User.updateMany({}, { $pull: { firms: officeFirm._id } });
    await Firm.deleteOne({ _id: officeFirm._id });
    console.log('✅ Head Office firm removed completely from database.');
  } else {
    console.log('ℹ️ Head Office firm does not exist in database.');
  }
} catch (error) {
  console.error('❌ Error removing office firm:', error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}

